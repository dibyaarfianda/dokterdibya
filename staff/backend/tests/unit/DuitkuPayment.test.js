'use strict';

jest.mock('axios', () => ({ post: jest.fn() }));
jest.mock('../../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));

const crypto = require('crypto');

const MERCHANT = 'DTEST1';
const API_KEY = 'synthetic-test-only-key';

function hmac(text) {
    return crypto.createHmac('sha256', API_KEY).update(text).digest('hex');
}

function loadClient(env = {}) {
    jest.resetModules();
    process.env.DUITKU_MERCHANT_CODE = MERCHANT;
    process.env.DUITKU_API_KEY = API_KEY;
    delete process.env.DUITKU_PRODUCTION;
    delete process.env.DUITKU_CALLBACK_URL;
    delete process.env.DUITKU_RETURN_URL;
    Object.assign(process.env, env);
    const axios = require('axios');
    axios.post.mockReset();
    return { client: require('../../utils/duitku-payment'), axios };
}

const BASE_ORDER = {
    orderRef: 'PRM-11111111-2222-3333-4444-555555555555',
    amount: 99000,
    methodCode: 'NQ',
    productDetails: 'Paket Kehamilan',
    email: 'pasien@example.com',
    customerName: 'Nama Pasien Yang Sangat Panjang Sekali',
    expiryMinutes: 60
};

describe('Duitku signatures', () => {
    test('inquiry signature signs merchantCode + merchantOrderId + paymentAmount with HMAC-SHA256', () => {
        const { client } = loadClient();
        expect(client.signInquiry('ORDER-1', 99000)).toBe(hmac(`${MERCHANT}ORDER-199000`));
    });

    test('callback signature signs merchantCode + amount + merchantOrderId', () => {
        const { client } = loadClient();
        expect(client.signCallback('99000', 'ORDER-1')).toBe(hmac(`${MERCHANT}99000ORDER-1`));
    });

    test('check signature signs merchantCode + merchantOrderId', () => {
        const { client } = loadClient();
        expect(client.signCheck('ORDER-1')).toBe(hmac(`${MERCHANT}ORDER-1`));
    });
});

describe('verifyCallbackSignature', () => {
    test('accepts a correctly signed callback', () => {
        const { client } = loadClient();
        const body = { merchantCode: MERCHANT, amount: '99000', merchantOrderId: 'ORDER-1', resultCode: '00' };
        body.signature = hmac(`${MERCHANT}99000ORDER-1`);
        expect(client.verifyCallbackSignature(body)).toBe(true);
    });

    test('rejects a callback whose amount was changed after signing', () => {
        const { client } = loadClient();
        const body = { merchantCode: MERCHANT, amount: '99000', merchantOrderId: 'ORDER-1', signature: hmac(`${MERCHANT}99000ORDER-1`) };
        expect(client.verifyCallbackSignature({ ...body, amount: '1000' })).toBe(false);
    });

    test('rejects a callback for another merchant code', () => {
        const { client } = loadClient();
        const body = { merchantCode: 'OTHER', amount: '99000', merchantOrderId: 'ORDER-1', signature: hmac('OTHER99000ORDER-1') };
        expect(client.verifyCallbackSignature(body)).toBe(false);
    });

    test.each([
        ['missing body', undefined],
        ['empty body', {}],
        ['missing signature', { merchantCode: MERCHANT, amount: '1', merchantOrderId: 'A' }],
        ['short signature', { merchantCode: MERCHANT, amount: '1', merchantOrderId: 'A', signature: 'abc' }],
        ['non-string signature', { merchantCode: MERCHANT, amount: '1', merchantOrderId: 'A', signature: ['x'] }]
    ])('rejects %s without throwing', (_name, body) => {
        const { client } = loadClient();
        expect(client.verifyCallbackSignature(body)).toBe(false);
    });

    test('rejects everything when credentials are not configured', () => {
        const { client } = loadClient({ DUITKU_API_KEY: '' });
        expect(client.verifyCallbackSignature({ merchantCode: MERCHANT, amount: '1', merchantOrderId: 'A', signature: hmac(`${MERCHANT}1A`) })).toBe(false);
    });
});

describe('createTransaction', () => {
    test('posts the signed inquiry to the sandbox by default and maps the response', async () => {
        const { client, axios } = loadClient();
        axios.post.mockResolvedValue({ data: { statusCode: '00', statusMessage: 'SUCCESS', reference: 'DS123', qrString: '000201...', vaNumber: '', paymentUrl: 'https://pay', amount: '99000' } });

        const result = await client.createTransaction(BASE_ORDER);

        const [url, payload] = axios.post.mock.calls[0];
        expect(url).toBe('https://sandbox.duitku.com/webapi/api/merchant/v2/inquiry');
        expect(payload).toMatchObject({
            merchantCode: MERCHANT,
            paymentAmount: 99000,
            paymentMethod: 'NQ',
            merchantOrderId: BASE_ORDER.orderRef,
            email: 'pasien@example.com',
            expiryPeriod: 60,
            callbackUrl: 'https://dokterdibya.com/api/webhooks/duitku/callback'
        });
        expect(payload.signature).toBe(hmac(`${MERCHANT}${BASE_ORDER.orderRef}99000`));
        expect(payload.customerVaName.length).toBeLessThanOrEqual(20);
        expect(result).toMatchObject({ reference: 'DS123', qrString: '000201...', paymentUrl: 'https://pay' });
        expect(result.vaNumber).toBeNull();
    });

    test('uses the production host only when DUITKU_PRODUCTION is true', async () => {
        const { client, axios } = loadClient({ DUITKU_PRODUCTION: 'true' });
        axios.post.mockResolvedValue({ data: { statusCode: '00', reference: 'R', vaNumber: '8888', amount: '99000' } });
        await client.createTransaction({ ...BASE_ORDER, methodCode: 'I1' });
        expect(axios.post.mock.calls[0][0]).toBe('https://passport.duitku.com/webapi/api/merchant/v2/inquiry');
    });

    test('throws when Duitku does not answer statusCode 00', async () => {
        const { client, axios } = loadClient();
        axios.post.mockResolvedValue({ data: { statusCode: '02', statusMessage: 'Payment channel not available' } });
        await expect(client.createTransaction(BASE_ORDER)).rejects.toThrow('Payment channel not available');
    });

    test('throws a readable error when the HTTP call fails', async () => {
        const { client, axios } = loadClient();
        axios.post.mockRejectedValue(Object.assign(new Error('Request failed'), { response: { status: 400, data: { Message: 'Wrong signature' } } }));
        await expect(client.createTransaction(BASE_ORDER)).rejects.toThrow('Wrong signature');
    });

    test.each([
        ['amount below the Rp10.000 minimum', { amount: 9999 }],
        ['non integer amount', { amount: 99000.5 }],
        ['order reference longer than 50 characters', { orderRef: 'x'.repeat(51) }],
        ['empty order reference', { orderRef: '' }],
        ['missing payment method', { methodCode: '' }]
    ])('refuses %s before calling Duitku', async (_name, override) => {
        const { client, axios } = loadClient();
        await expect(client.createTransaction({ ...BASE_ORDER, ...override })).rejects.toThrow();
        expect(axios.post).not.toHaveBeenCalled();
    });

    test('refuses to run when credentials are missing', async () => {
        const { client, axios } = loadClient({ DUITKU_MERCHANT_CODE: '' });
        expect(client.isConfigured()).toBe(false);
        await expect(client.createTransaction(BASE_ORDER)).rejects.toThrow(/Duitku tidak dikonfigurasi/);
        expect(axios.post).not.toHaveBeenCalled();
    });
});

describe('checkTransaction', () => {
    test('posts the signed status request and reports paid only for statusCode 00', async () => {
        const { client, axios } = loadClient();
        axios.post.mockResolvedValue({ data: { merchantOrderId: 'ORDER-1', reference: 'DS1', amount: '99000', fee: '0', statusCode: '00', statusMessage: 'SUCCESS' } });

        const result = await client.checkTransaction('ORDER-1');

        const [url, payload] = axios.post.mock.calls[0];
        expect(url).toBe('https://sandbox.duitku.com/webapi/api/merchant/transactionStatus');
        expect(payload).toEqual({ merchantCode: MERCHANT, merchantOrderId: 'ORDER-1', signature: hmac(`${MERCHANT}ORDER-1`) });
        expect(result).toMatchObject({ paid: true, pending: false, statusCode: '00', amount: 99000, reference: 'DS1' });
    });

    test.each([
        ['01', false, true],
        ['02', false, false]
    ])('statusCode %s maps to paid=%s pending=%s', async (statusCode, paid, pending) => {
        const { client, axios } = loadClient();
        axios.post.mockResolvedValue({ data: { merchantOrderId: 'ORDER-1', amount: '99000', statusCode, statusMessage: 'x' } });
        const result = await client.checkTransaction('ORDER-1');
        expect(result.paid).toBe(paid);
        expect(result.pending).toBe(pending);
    });

    test('propagates network failures so the caller can retry later', async () => {
        const { client, axios } = loadClient();
        axios.post.mockRejectedValue(new Error('socket hang up'));
        await expect(client.checkTransaction('ORDER-1')).rejects.toThrow('socket hang up');
    });
});

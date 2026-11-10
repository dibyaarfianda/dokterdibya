/**
 * Duitku payment gateway client (API v2, HMAC-SHA256 signatures).
 *
 * Used only for premium patient packages. Clinic billing stays on Xendit
 * (see xendit-payment.js). Written against docs.duitku.com/api/en (Apr 2026):
 *   - inquiry signature    = HMAC_SHA256(merchantCode + merchantOrderId + paymentAmount, apiKey)
 *   - callback signature   = HMAC_SHA256(merchantCode + amount + merchantOrderId, apiKey)
 *   - check signature      = HMAC_SHA256(merchantCode + merchantOrderId, apiKey)
 * Check Transaction must not be called repeatedly (Duitku blocks the caller for
 * about an hour), so callers have to throttle it.
 */

const crypto = require('crypto');
const axios = require('axios');
const logger = require('./logger');

const MIN_AMOUNT_IDR = 10000;
const MAX_ORDER_ID_LENGTH = 50;
const MAX_VA_NAME_LENGTH = 20;
const MAX_PRODUCT_DETAILS_LENGTH = 255;
const REQUEST_TIMEOUT_MS = 30000;

const DEFAULT_CALLBACK_URL = 'https://dokterdibya.com/api/webhooks/duitku/callback';
const DEFAULT_RETURN_URL = 'https://dokterdibya.com/';

// Key the patient app sends -> Duitku paymentMethod code.
const PAYMENT_METHODS = Object.freeze({
    qris: { code: 'NQ', type: 'qris', label: 'QRIS' },
    va_bni: { code: 'I1', type: 'va', label: 'VA BNI' },
    va_bri: { code: 'BR', type: 'va', label: 'VA BRI' },
    va_mandiri: { code: 'M2', type: 'va', label: 'VA Mandiri' },
    va_bca: { code: 'BC', type: 'va', label: 'VA BCA' }
});

function readConfig() {
    const isProduction = process.env.DUITKU_PRODUCTION === 'true';
    const host = isProduction ? 'https://passport.duitku.com' : 'https://sandbox.duitku.com';
    return {
        merchantCode: String(process.env.DUITKU_MERCHANT_CODE || '').trim(),
        apiKey: String(process.env.DUITKU_API_KEY || '').trim(),
        isProduction,
        inquiryUrl: `${host}/webapi/api/merchant/v2/inquiry`,
        statusUrl: `${host}/webapi/api/merchant/transactionStatus`,
        callbackUrl: process.env.DUITKU_CALLBACK_URL || DEFAULT_CALLBACK_URL,
        returnUrl: process.env.DUITKU_RETURN_URL || DEFAULT_RETURN_URL
    };
}

function isConfigured() {
    const { merchantCode, apiKey } = readConfig();
    return Boolean(merchantCode && apiKey);
}

function hmacHex(text, apiKey) {
    return crypto.createHmac('sha256', apiKey).update(text).digest('hex');
}

function signInquiry(merchantOrderId, paymentAmount) {
    const { merchantCode, apiKey } = readConfig();
    return hmacHex(`${merchantCode}${merchantOrderId}${paymentAmount}`, apiKey);
}

function signCallback(amount, merchantOrderId) {
    const { merchantCode, apiKey } = readConfig();
    return hmacHex(`${merchantCode}${amount}${merchantOrderId}`, apiKey);
}

function signCheck(merchantOrderId) {
    const { merchantCode, apiKey } = readConfig();
    return hmacHex(`${merchantCode}${merchantOrderId}`, apiKey);
}

/**
 * Verify the signature of a callback Duitku posted to us. Never throws.
 * @param {Object} body - parsed application/x-www-form-urlencoded body
 * @returns {boolean}
 */
function verifyCallbackSignature(body) {
    try {
        const { merchantCode, apiKey } = readConfig();
        if (!merchantCode || !apiKey || !body || typeof body !== 'object') return false;
        if (typeof body.signature !== 'string' || typeof body.merchantOrderId !== 'string') return false;
        if (String(body.merchantCode || '') !== merchantCode) return false;
        if (body.amount === undefined || body.amount === null || typeof body.amount === 'object') return false;

        const expected = Buffer.from(signCallback(String(body.amount), body.merchantOrderId), 'utf8');
        const received = Buffer.from(body.signature.trim().toLowerCase(), 'utf8');
        if (expected.length !== received.length) return false;
        return crypto.timingSafeEqual(expected, received);
    } catch (_error) {
        return false;
    }
}

function sanitizeVaName(name) {
    const cleaned = String(name || 'Pasien')
        .replace(/[^A-Za-z0-9 ]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, MAX_VA_NAME_LENGTH)
        .trim();
    return cleaned || 'Pasien';
}

function describeError(error) {
    const data = error && error.response && error.response.data;
    if (data && typeof data === 'object') {
        if (data.Message) return String(data.Message);
        if (data.message) return String(data.message);
        if (data.statusMessage) return String(data.statusMessage);
    }
    return (error && error.message) || 'Permintaan ke Duitku gagal';
}

function requireConfigured() {
    if (!isConfigured()) {
        throw new Error('Duitku tidak dikonfigurasi. Set DUITKU_MERCHANT_CODE dan DUITKU_API_KEY di .env');
    }
}

/**
 * Create a QRIS or virtual account transaction.
 * @param {Object} params
 * @param {string} params.orderRef - our unique merchantOrderId (max 50 chars)
 * @param {number} params.amount - integer IDR, at least 10.000
 * @param {string} params.methodCode - Duitku paymentMethod code (see PAYMENT_METHODS)
 * @param {string} params.productDetails
 * @param {string} params.email
 * @param {string} [params.customerName]
 * @param {string} [params.phone]
 * @param {number} [params.expiryMinutes]
 * @returns {Promise<{reference:string, vaNumber:?string, qrString:?string, paymentUrl:?string, amount:number, raw:Object}>}
 */
async function createTransaction({ orderRef, amount, methodCode, productDetails, email, customerName, phone, expiryMinutes }) {
    requireConfigured();

    if (!orderRef || String(orderRef).length > MAX_ORDER_ID_LENGTH) {
        throw new Error('Referensi order tidak valid (maksimal 50 karakter)');
    }
    if (!Number.isInteger(amount) || amount < MIN_AMOUNT_IDR) {
        throw new Error(`Nominal minimal Rp${MIN_AMOUNT_IDR.toLocaleString('id-ID')} dan harus bilangan bulat`);
    }
    if (!methodCode) {
        throw new Error('Metode pembayaran Duitku tidak valid');
    }

    const config = readConfig();
    const payload = {
        merchantCode: config.merchantCode,
        paymentAmount: amount,
        paymentMethod: methodCode,
        merchantOrderId: orderRef,
        productDetails: String(productDetails || 'Paket Premium').substring(0, MAX_PRODUCT_DETAILS_LENGTH),
        email,
        customerVaName: sanitizeVaName(customerName),
        callbackUrl: config.callbackUrl,
        returnUrl: config.returnUrl,
        signature: signInquiry(orderRef, amount)
    };
    if (phone) payload.phoneNumber = String(phone);
    if (expiryMinutes) payload.expiryPeriod = Math.round(expiryMinutes);

    logger.info('[Duitku] Creating transaction', { orderRef, amount, methodCode });

    let data;
    try {
        const response = await axios.post(config.inquiryUrl, payload, {
            headers: { 'Content-Type': 'application/json' },
            timeout: REQUEST_TIMEOUT_MS
        });
        data = response.data || {};
    } catch (error) {
        logger.error('[Duitku] Create transaction request failed', { orderRef, status: error.response && error.response.status, message: describeError(error) });
        throw new Error(describeError(error));
    }

    if (String(data.statusCode) !== '00') {
        logger.error('[Duitku] Create transaction rejected', { orderRef, statusCode: data.statusCode, statusMessage: data.statusMessage });
        throw new Error(data.statusMessage || data.Message || 'Duitku menolak transaksi');
    }

    return {
        reference: data.reference || null,
        vaNumber: data.vaNumber || null,
        qrString: data.qrString || null,
        paymentUrl: data.paymentUrl || null,
        amount: Number(data.amount) || amount,
        raw: data
    };
}

/**
 * Ask Duitku for the status of one transaction.
 * Do NOT call this in a loop: Duitku blocks callers that poll it.
 * @param {string} orderRef
 * @returns {Promise<{paid:boolean, pending:boolean, statusCode:string, reference:?string, amount:?number, fee:?number, raw:Object}>}
 */
async function checkTransaction(orderRef) {
    requireConfigured();
    const config = readConfig();
    const payload = {
        merchantCode: config.merchantCode,
        merchantOrderId: orderRef,
        signature: signCheck(orderRef)
    };

    let data;
    try {
        const response = await axios.post(config.statusUrl, payload, {
            headers: { 'Content-Type': 'application/json' },
            timeout: REQUEST_TIMEOUT_MS
        });
        data = response.data || {};
    } catch (error) {
        logger.error('[Duitku] Check transaction request failed', { orderRef, status: error.response && error.response.status, message: describeError(error) });
        throw new Error(describeError(error));
    }

    const statusCode = String(data.statusCode === undefined ? '' : data.statusCode);
    const amount = Number(data.amount);
    const fee = Number(data.fee);
    return {
        paid: statusCode === '00',
        pending: statusCode === '01',
        statusCode,
        reference: data.reference || null,
        amount: Number.isFinite(amount) ? amount : null,
        fee: Number.isFinite(fee) ? fee : null,
        raw: data
    };
}

module.exports = {
    MIN_AMOUNT_IDR,
    PAYMENT_METHODS,
    isConfigured,
    signInquiry,
    signCallback,
    signCheck,
    verifyCallbackSignature,
    createTransaction,
    checkTransaction
};

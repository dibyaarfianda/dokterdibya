'use strict';

const express = require('express');
const request = require('supertest');

jest.mock('../../db', () => ({ query: jest.fn() }));
jest.mock('../../middleware/auth', () => ({ verifyPatientToken: (req, res, next) => next() }));

const { createPatientCheckupPrepayRouter } = require('../../routes/patient-checkup-prepay');
const { PremiumError } = require('../../services/PremiumPaymentService');

const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
const REF = 'DPK-00000000-0000-4000-8000-000000000001';

function patientAuth(req, res, next) {
    if (req.get('x-test-patient')) {
        req.patient = { id: req.get('x-test-patient') };
        return next();
    }
    return res.status(401).json({ success: false, message: 'Missing authorization header' });
}

function buildApp({ service, db = {}, estimates, refundRequests = {} }) {
    const app = express();
    app.use(express.json());
    app.use('/api/patient/checkup-prepay', createPatientCheckupPrepayRouter({ service, db, estimates, refundRequests, verifyPatientToken: patientAuth, logger }));
    return app;
}

describe('patient checkup prepay routes', () => {
    beforeEach(() => jest.clearAllMocks());

    test.each([
        ['get', '/api/patient/checkup-prepay/status'],
        ['post', '/api/patient/checkup-prepay/checkout'],
        ['get', `/api/patient/checkup-prepay/orders/${REF}`]
    ])('%s %s requires a patient session', async (method, url) => {
        const res = await request(buildApp({ service: {} }))[method](url);
        expect(res.status).toBe(401);
    });

    test('status is read for the session patient and is never cached', async () => {
        const service = { getStatus: jest.fn().mockResolvedValue({ availability: { available: false }, estimates: [], balances: [], orders: [], payment_methods: [] }) };
        const res = await request(buildApp({ service })).get('/api/patient/checkup-prepay/status?patient_id=P9999').set('x-test-patient', 'P0001');
        expect(res.status).toBe(200);
        expect(service.getStatus).toHaveBeenCalledWith('P0001');
        expect(res.headers['cache-control']).toMatch(/no-store/);
        expect(res.headers.pragma).toBe('no-cache');
    });

    test('checkout passes only category and method; amount and patient never come from the body', async () => {
        const order = { order_ref: REF, status: 'pending', amount_idr: 115000 };
        const service = { createOrder: jest.fn().mockResolvedValue(order) };
        const db = { query: jest.fn().mockResolvedValue([[{ full_name: 'Bu Pasien', email: 'p@example.com', phone: '6281' }]]) };
        const res = await request(buildApp({ service, db }))
            .post('/api/patient/checkup-prepay/checkout')
            .set('x-test-patient', 'P0001')
            .send({ category: 'obstetri', payment_method: 'qris', amount_idr: 1, patient_id: 'P9999' });

        expect(res.status).toBe(201);
        expect(res.body.order).toEqual(order);
        expect(service.createOrder).toHaveBeenCalledWith({
            patient: { id: 'P0001', email: 'p@example.com', name: 'Bu Pasien', phone: '6281' },
            category: 'obstetri',
            paymentMethod: 'qris'
        });
    });

    test.each([
        ['missing body', undefined],
        ['missing method', { category: 'obstetri' }],
        ['non string category', { category: ['obstetri'], payment_method: 'qris' }]
    ])('checkout rejects %s with 400', async (_name, body) => {
        const service = { createOrder: jest.fn() };
        const res = await request(buildApp({ service, db: { query: jest.fn() } }))
            .post('/api/patient/checkup-prepay/checkout').set('x-test-patient', 'P0001').send(body);
        expect(res.status).toBe(400);
        expect(service.createOrder).not.toHaveBeenCalled();
    });

    test('maps business errors such as "not open yet" to their status and code', async () => {
        const service = { createOrder: jest.fn().mockRejectedValue(new PremiumError('PREPAY_NOT_AVAILABLE', 'Pembayaran di muka segera tersedia.', 403)) };
        const db = { query: jest.fn().mockResolvedValue([[{}]]) };
        const res = await request(buildApp({ service, db }))
            .post('/api/patient/checkup-prepay/checkout').set('x-test-patient', 'P0001').send({ category: 'obstetri', payment_method: 'qris' });
        expect(res.status).toBe(403);
        expect(res.body).toEqual({ success: false, code: 'PREPAY_NOT_AVAILABLE', message: 'Pembayaran di muka segera tersedia.' });
    });

    test('hides unexpected errors behind a generic message', async () => {
        const service = { getStatus: jest.fn().mockRejectedValue(new Error("Unknown column 'order_type' in 'where clause'")) };
        const res = await request(buildApp({ service })).get('/api/patient/checkup-prepay/status').set('x-test-patient', 'P0001');
        expect(res.status).toBe(500);
        expect(JSON.stringify(res.body)).not.toMatch(/order_type|column/);
    });

    test('a malformed order reference is not looked up', async () => {
        const service = { getOrderForPatient: jest.fn() };
        const res = await request(buildApp({ service })).get('/api/patient/checkup-prepay/orders/PRM-1').set('x-test-patient', 'P0001');
        expect(res.status).toBe(404);
        expect(service.getOrderForPatient).not.toHaveBeenCalled();
    });

    test('returns the patient own order for polling, and 404 for anyone else', async () => {
        const service = { getOrderForPatient: jest.fn(async (patientId) => (patientId === 'P0001' ? { order_ref: REF, status: 'paid' } : null)) };
        const app = buildApp({ service });
        const own = await request(app).get(`/api/patient/checkup-prepay/orders/${REF}`).set('x-test-patient', 'P0001');
        expect(own.status).toBe(200);
        expect(own.body.order.status).toBe('paid');
        const other = await request(app).get(`/api/patient/checkup-prepay/orders/${REF}`).set('x-test-patient', 'P0002');
        expect(other.status).toBe(404);
    });
});

describe('saldo and withdrawal requests (Tahap 3)', () => {
    const BASE = '/api/patient/checkup-prepay';
    beforeEach(() => jest.clearAllMocks());

    test.each([
        ['get', `${BASE}/saldo`],
        ['post', `${BASE}/refund-requests`],
        ['post', `${BASE}/refund-requests/7/cancel`]
    ])('%s %s requires a patient session', async (method, url) => {
        const res = await request(buildApp({ service: {}, refundRequests: {} }))[method](url);
        expect(res.status).toBe(401);
    });

    test('GET /saldo reads only the session patient and is never cached', async () => {
        const saldo = { balances: { live: 255000, sandbox: 0 }, available_idr: 55000, history: [], requests: [] };
        const refundRequests = { getSaldo: jest.fn().mockResolvedValue(saldo) };
        const res = await request(buildApp({ service: {}, refundRequests })).get(`${BASE}/saldo?patient_id=P9999`).set('x-test-patient', 'P0001');
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ success: true, ...saldo });
        expect(refundRequests.getSaldo).toHaveBeenCalledWith('P0001');
        expect(res.headers['cache-control']).toMatch(/no-store/);
    });

    test('POST /refund-requests uses the session patient and its stored name, never the body', async () => {
        const refundRequests = { createRequest: jest.fn().mockResolvedValue({ id: 5, status: 'pending' }) };
        const db = { query: jest.fn().mockResolvedValue([[{ full_name: 'Ny. Siti Aminah' }]]) };
        const res = await request(buildApp({ service: {}, db, refundRequests }))
            .post(`${BASE}/refund-requests`).set('x-test-patient', 'P0001')
            .send({ amount_idr: 200000, bank_name: 'BCA', account_number: '1234567890', account_holder: 'Siti Aminah', request_key: 'req-key-aaaaaaaaaaaa', patient_id: 'P9999', patient_name: 'X' });
        expect(res.status).toBe(201);
        expect(res.body).toEqual({ success: true, data: { id: 5, status: 'pending' } });
        expect(res.headers['cache-control']).toMatch(/no-store/);
        expect(db.query).toHaveBeenCalledWith(expect.stringContaining('FROM patients WHERE id = ?'), ['P0001']);
        expect(refundRequests.createRequest).toHaveBeenCalledWith({
            patient: { id: 'P0001', name: 'Ny. Siti Aminah' },
            amountIdr: 200000,
            bankName: 'BCA',
            accountNumber: '1234567890',
            accountHolder: 'Siti Aminah',
            requestKey: 'req-key-aaaaaaaaaaaa'
        });
    });

    test('business errors keep their status, code and message', async () => {
        const refundRequests = { createRequest: jest.fn().mockRejectedValue(new PremiumError('SANDBOX_SALDO', 'Saldo uji tidak dapat dicairkan', 400)) };
        const db = { query: jest.fn().mockResolvedValue([[{ full_name: 'Uji' }]]) };
        const res = await request(buildApp({ service: {}, db, refundRequests }))
            .post(`${BASE}/refund-requests`).set('x-test-patient', 'P0001').send({ amount_idr: 10000 });
        expect(res.status).toBe(400);
        expect(res.body).toEqual({ success: false, code: 'SANDBOX_SALDO', message: 'Saldo uji tidak dapat dicairkan' });
    });

    test('POST /refund-requests/:id/cancel cancels the session patient own request', async () => {
        const refundRequests = { cancelRequest: jest.fn().mockResolvedValue({ id: 7, status: 'cancelled' }) };
        const app = buildApp({ service: {}, refundRequests });
        const res = await request(app).post(`${BASE}/refund-requests/7/cancel`).set('x-test-patient', 'P0001').send({ patient_id: 'P9999' });
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ success: true, data: { id: 7, status: 'cancelled' } });
        expect(refundRequests.cancelRequest).toHaveBeenCalledWith({ patientId: 'P0001', id: 7 });

        const bad = await request(app).post(`${BASE}/refund-requests/7%20OR%201/cancel`).set('x-test-patient', 'P0001');
        expect(bad.status).toBe(404);
        expect(refundRequests.cancelRequest).toHaveBeenCalledTimes(1);
    });
});

describe('GET /suggestion', () => {
    const URL = '/api/patient/checkup-prepay/suggestion';
    const priced = (over) => ({
        id: 1, code: 'hamil_a', name: 'Paket A', description: '', category: 'obstetri', week_min: 20, week_max: 28,
        sort_order: 10, is_active: true, ready: true, amount_idr: 255000, raw_total: 255000, issues: [],
        items: [{ name: 'USG', quantity: 1, subtotal: 255000 }], ...over
    });
    const anamnesaRow = { hpht: '2026-06-14', hpl: null, recorded_at: new Date('2026-10-01T00:00:00Z') };
    const makeDb = () => ({ query: jest.fn().mockResolvedValueOnce([[anamnesaRow]]).mockResolvedValueOnce([[]]) });
    const makeEstimates = (packages) => ({ priceAll: jest.fn().mockResolvedValue({ priced_at: 'now', packages }) });

    test('requires a patient session', async () => {
        const res = await request(buildApp({ service: {}, estimates: makeEstimates([]) })).get(`${URL}?date=2026-11-29&category=obstetri`);
        expect(res.status).toBe(401);
    });

    test('suggests the package for the gestational age and reads only the session patient', async () => {
        const db = makeDb();
        const estimates = makeEstimates([
            priced({ id: 2, code: 'hamil_b', sort_order: 20, week_min: 20, week_max: 30 }),
            priced({ id: 1, code: 'hamil_a', sort_order: 10 }),
            priced({ id: 3, code: 'gyn', category: 'gyn_repro' }),
            priced({ id: 4, code: 'hamil_nr', ready: false, week_min: 24, week_max: 24, sort_order: 1 })
        ]);
        const res = await request(buildApp({ service: {}, db, estimates }))
            .get(`${URL}?date=2026-11-29&category=obstetri&patient_id=P9999`).set('x-test-patient', 'P0001');

        expect(res.status).toBe(200);
        expect(res.headers['cache-control']).toMatch(/no-store/);
        expect(res.body).toMatchObject({ success: true, weeks: 24, days: 0, source: 'hpht', suggested_code: 'hamil_a' });
        expect(res.body.packages.map(p => p.code)).toEqual(['hamil_a', 'hamil_b']);
        expect(res.body.packages[0]).not.toHaveProperty('id');
        for (const call of db.query.mock.calls) expect(call[1]).toContain('P0001');
        expect(JSON.stringify(db.query.mock.calls)).not.toContain('P9999');
    });

    test('a non-obstetri category has no weeks and no suggestion, and the patient records are not read', async () => {
        const db = { query: jest.fn() };
        const estimates = makeEstimates([priced({ id: 3, code: 'gyn', category: 'gyn_repro', week_min: null, week_max: null })]);
        const res = await request(buildApp({ service: {}, db, estimates }))
            .get(`${URL}?date=2026-11-29&category=gyn_repro`).set('x-test-patient', 'P0001');
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ weeks: null, days: null, source: null, suggested_code: null });
        expect(res.body.packages.map(p => p.code)).toEqual(['gyn']);
        expect(db.query).not.toHaveBeenCalled();
    });

    test('an unknown pregnancy age returns null weeks but still lists the packages', async () => {
        const db = { query: jest.fn().mockResolvedValue([[]]) };
        const estimates = makeEstimates([priced({})]);
        const res = await request(buildApp({ service: {}, db, estimates }))
            .get(`${URL}?date=2026-11-29&category=obstetri`).set('x-test-patient', 'P0001');
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ weeks: null, days: null, source: null, suggested_code: null });
        expect(res.body.packages).toHaveLength(1);
    });

    test.each([
        ['an impossible calendar date', '2026-02-30', 'obstetri'],
        ['a malformed date', '29-11-2026', 'obstetri'],
        ['a missing date', '', 'obstetri'],
        ['an unknown category', '2026-11-29', 'plastik']
    ])('rejects %s with 400', async (_name, date, category) => {
        const estimates = makeEstimates([]);
        const res = await request(buildApp({ service: {}, db: { query: jest.fn() }, estimates }))
            .get(`${URL}?date=${date}&category=${category}`).set('x-test-patient', 'P0001');
        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
        expect(estimates.priceAll).not.toHaveBeenCalled();
    });
});

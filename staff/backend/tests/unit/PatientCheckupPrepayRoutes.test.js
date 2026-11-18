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

function buildApp({ service, db = {} }) {
    const app = express();
    app.use(express.json());
    app.use('/api/patient/checkup-prepay', createPatientCheckupPrepayRouter({ service, db, verifyPatientToken: patientAuth, logger }));
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

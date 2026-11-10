'use strict';

const express = require('express');
const request = require('supertest');

jest.mock('../../db', () => ({ query: jest.fn() }));
jest.mock('../../middleware/auth', () => ({ verifyPatientToken: (req, res, next) => next() }));

const { createPatientPremiumRouter } = require('../../routes/patient-premium');
const { PremiumError } = require('../../services/PremiumPaymentService');

const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
const duitku = {
    MIN_AMOUNT_IDR: 10000,
    PAYMENT_METHODS: { qris: { code: 'NQ', type: 'qris', label: 'QRIS' }, va_bni: { code: 'I1', type: 'va', label: 'VA BNI' } }
};

function patientAuth(req, res, next) {
    if (req.get('x-test-patient')) {
        req.patient = { id: req.get('x-test-patient') };
        return next();
    }
    return res.status(401).json({ success: false, message: 'Missing authorization header' });
}

function buildApp({ service, db }) {
    const app = express();
    app.use(express.json());
    app.use('/api/patient/premium', createPatientPremiumRouter({ service, db, duitku, verifyPatientToken: patientAuth, logger }));
    return app;
}

describe('patient premium routes', () => {
    beforeEach(() => jest.clearAllMocks());

    test.each([
        ['get', '/api/patient/premium/plans'],
        ['get', '/api/patient/premium/status'],
        ['post', '/api/patient/premium/checkout'],
        ['get', '/api/patient/premium/orders/PRM-1']
    ])('%s %s requires a patient session', async (method, url) => {
        const res = await request(buildApp({ service: {}, db: {} }))[method](url);
        expect(res.status).toBe(401);
    });

    test('lists plans and payment methods without exposing gateway codes', async () => {
        const service = { listActivePlans: jest.fn().mockResolvedValue([{ code: 'kehamilan', name: 'Paket Kehamilan', price_idr: 99000, duration_days: 365, features: [] }]) };
        const res = await request(buildApp({ service, db: {} })).get('/api/patient/premium/plans').set('x-test-patient', 'P0001');
        expect(res.status).toBe(200);
        expect(res.body.plans[0].code).toBe('kehamilan');
        expect(res.body.payment_methods).toEqual([
            { key: 'qris', label: 'QRIS', type: 'qris' },
            { key: 'va_bni', label: 'VA BNI', type: 'va' }
        ]);
        expect(JSON.stringify(res.body)).not.toMatch(/NQ|I1/);
        expect(res.headers['cache-control']).toMatch(/no-store/);
    });

    test('status is read for the patient in the session, never for an id from the request', async () => {
        const service = { getPatientStatus: jest.fn().mockResolvedValue({ package: { active: false }, orders: [] }) };
        const res = await request(buildApp({ service, db: {} })).get('/api/patient/premium/status?patient_id=P9999').set('x-test-patient', 'P0001');
        expect(res.status).toBe(200);
        expect(service.getPatientStatus).toHaveBeenCalledWith('P0001');
    });

    test('checkout passes only the plan and method from the body, the patient from the session', async () => {
        const order = { order_ref: 'PRM-1', status: 'pending', amount_idr: 99000 };
        const service = { createOrder: jest.fn().mockResolvedValue(order) };
        const db = { query: jest.fn().mockResolvedValue([[{ full_name: 'Bu Pasien', email: 'p@example.com', phone: '6281' }]]) };
        const res = await request(buildApp({ service, db }))
            .post('/api/patient/premium/checkout')
            .set('x-test-patient', 'P0001')
            .send({ plan_code: 'kehamilan', payment_method: 'qris', amount_idr: 1, patient_id: 'P9999', price: 1 });

        expect(res.status).toBe(201);
        expect(res.body.order).toEqual(order);
        expect(service.createOrder).toHaveBeenCalledWith({
            patient: { id: 'P0001', email: 'p@example.com', name: 'Bu Pasien', phone: '6281' },
            planCode: 'kehamilan',
            paymentMethod: 'qris'
        });
    });

    test.each([
        ['missing body', undefined],
        ['missing method', { plan_code: 'kehamilan' }],
        ['non string plan', { plan_code: ['kehamilan'], payment_method: 'qris' }]
    ])('checkout rejects %s with 400', async (_name, body) => {
        const service = { createOrder: jest.fn() };
        const res = await request(buildApp({ service, db: { query: jest.fn() } }))
            .post('/api/patient/premium/checkout').set('x-test-patient', 'P0001').send(body);
        expect(res.status).toBe(400);
        expect(service.createOrder).not.toHaveBeenCalled();
    });

    test('maps business errors to their status and code', async () => {
        const service = { createOrder: jest.fn().mockRejectedValue(new PremiumError('PLAN_NOT_AVAILABLE', 'Paket tidak tersedia', 404)) };
        const db = { query: jest.fn().mockResolvedValue([[{}]]) };
        const res = await request(buildApp({ service, db }))
            .post('/api/patient/premium/checkout').set('x-test-patient', 'P0001').send({ plan_code: 'x', payment_method: 'qris' });
        expect(res.status).toBe(404);
        expect(res.body).toEqual({ success: false, code: 'PLAN_NOT_AVAILABLE', message: 'Paket tidak tersedia' });
    });

    test('hides unexpected errors behind a generic message', async () => {
        const service = { getPatientStatus: jest.fn().mockRejectedValue(new Error("Table 'dibyaklinik.payment_orders' doesn't exist")) };
        const res = await request(buildApp({ service, db: {} })).get('/api/patient/premium/status').set('x-test-patient', 'P0001');
        expect(res.status).toBe(500);
        expect(JSON.stringify(res.body)).not.toMatch(/payment_orders|dibyaklinik/);
    });

    test('an order of another patient looks like it does not exist', async () => {
        const service = { getOrderForPatient: jest.fn().mockResolvedValue(null) };
        const res = await request(buildApp({ service, db: {} })).get('/api/patient/premium/orders/PRM-someone-else').set('x-test-patient', 'P0001');
        expect(res.status).toBe(404);
        expect(service.getOrderForPatient).toHaveBeenCalledWith('P0001', 'PRM-someone-else');
    });

    test('returns the patient own order for polling', async () => {
        const service = { getOrderForPatient: jest.fn().mockResolvedValue({ order_ref: 'PRM-1', status: 'paid' }) };
        const res = await request(buildApp({ service, db: {} })).get('/api/patient/premium/orders/PRM-1').set('x-test-patient', 'P0001');
        expect(res.status).toBe(200);
        expect(res.body.order.status).toBe('paid');
    });
});

'use strict';

const crypto = require('crypto');
const express = require('express');
const request = require('supertest');

process.env.DUITKU_MERCHANT_CODE = 'DTEST1';
process.env.DUITKU_API_KEY = 'synthetic-test-only-key';

const duitku = require('../../utils/duitku-payment');
const { createDuitkuWebhookRouter } = require('../../routes/duitku-webhook');

const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };

function sign(amount, orderRef) {
    return crypto.createHmac('sha256', process.env.DUITKU_API_KEY).update(`DTEST1${amount}${orderRef}`).digest('hex');
}

function buildApp(service) {
    const app = express();
    app.use('/api/webhooks/duitku', createDuitkuWebhookRouter({ duitku, service, logger }));
    return app;
}

function signedBody(overrides = {}) {
    const body = { merchantCode: 'DTEST1', amount: '99000', merchantOrderId: 'PRM-abc', resultCode: '00', reference: 'DS1', ...overrides };
    body.signature = overrides.signature || sign(body.amount, body.merchantOrderId);
    return body;
}

describe('POST /api/webhooks/duitku/callback', () => {
    beforeEach(() => jest.clearAllMocks());

    test('hands a correctly signed form-urlencoded callback to the payment service and answers 200', async () => {
        const service = { handleGatewayCallback: jest.fn().mockResolvedValue({ handled: true, action: 'activated' }) };
        const res = await request(buildApp(service))
            .post('/api/webhooks/duitku/callback')
            .type('form')
            .send(signedBody());

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ success: true, action: 'activated' });
        expect(service.handleGatewayCallback).toHaveBeenCalledWith(expect.objectContaining({ merchantOrderId: 'PRM-abc', amount: '99000', resultCode: '00' }));
    });

    test('rejects a callback with a wrong signature with 400 and never reaches the service', async () => {
        const service = { handleGatewayCallback: jest.fn() };
        const res = await request(buildApp(service))
            .post('/api/webhooks/duitku/callback')
            .type('form')
            .send(signedBody({ signature: 'a'.repeat(64) }));

        expect(res.status).toBe(400);
        expect(service.handleGatewayCallback).not.toHaveBeenCalled();
    });

    test('rejects a callback whose amount was altered after signing', async () => {
        const service = { handleGatewayCallback: jest.fn() };
        const body = signedBody();
        const res = await request(buildApp(service))
            .post('/api/webhooks/duitku/callback')
            .type('form')
            .send({ ...body, amount: '1000' });
        expect(res.status).toBe(400);
        expect(service.handleGatewayCallback).not.toHaveBeenCalled();
    });

    test('rejects an empty or JSON body', async () => {
        const service = { handleGatewayCallback: jest.fn() };
        const app = buildApp(service);
        expect((await request(app).post('/api/webhooks/duitku/callback').type('form').send({})).status).toBe(400);
        expect((await request(app).post('/api/webhooks/duitku/callback').send({ merchantOrderId: 'x' })).status).toBe(400);
        expect(service.handleGatewayCallback).not.toHaveBeenCalled();
    });

    test('answers 200 when the callback is valid but cannot be acted on, so Duitku stops retrying', async () => {
        const service = { handleGatewayCallback: jest.fn().mockResolvedValue({ handled: false, action: 'unknown_order' }) };
        const res = await request(buildApp(service)).post('/api/webhooks/duitku/callback').type('form').send(signedBody());
        expect(res.status).toBe(200);
        expect(res.body.action).toBe('unknown_order');
    });

    test('answers 500 on a temporary failure so Duitku retries, without leaking the error', async () => {
        const service = { handleGatewayCallback: jest.fn().mockRejectedValue(new Error('ECONNREFUSED 10.0.0.5:3306')) };
        const res = await request(buildApp(service)).post('/api/webhooks/duitku/callback').type('form').send(signedBody());
        expect(res.status).toBe(500);
        expect(JSON.stringify(res.body)).not.toMatch(/ECONNREFUSED|10\.0\.0/);
    });

    test('only POST is accepted', async () => {
        const res = await request(buildApp({})).get('/api/webhooks/duitku/callback');
        expect(res.status).toBe(404);
    });
});

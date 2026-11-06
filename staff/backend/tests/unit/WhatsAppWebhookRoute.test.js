'use strict';

const crypto = require('crypto');
const express = require('express');
const request = require('supertest');

jest.mock('../../db', () => ({ query: jest.fn(), getConnection: jest.fn() }));

const { createWhatsAppWebhookRouter } = require('../../routes/whatsapp-webhook');

const SECRET = 'app-secret';
const TOKEN = 'verify-tok';

function sign(raw, secret = SECRET) {
    return 'sha256=' + crypto.createHmac('sha256', secret).update(raw).digest('hex');
}

function build(overrides = {}) {
    const service = overrides.service || { handlePayload: jest.fn().mockResolvedValue({}) };
    const logger = overrides.logger || { warn: jest.fn(), error: jest.fn(), info: jest.fn() };
    const app = express();
    app.use('/api/whatsapp/webhook', createWhatsAppWebhookRouter({
        service,
        logger,
        verifyToken: 'verifyToken' in overrides ? overrides.verifyToken : TOKEN,
        appSecret: 'appSecret' in overrides ? overrides.appSecret : SECRET
    }));
    return { app, service, logger };
}

describe('WhatsApp webhook route', () => {
    const url = '/api/whatsapp/webhook';

    test('GET verify returns challenge', async () => {
        const { app } = build();
        const res = await request(app).get(`${url}?hub.mode=subscribe&hub.verify_token=${TOKEN}&hub.challenge=123`);
        expect(res.status).toBe(200);
        expect(res.text).toBe('123');
    });

    test('GET with wrong token is 403', async () => {
        const { app } = build();
        const res = await request(app).get(`${url}?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=123`);
        expect(res.status).toBe(403);
    });

    test('GET with empty configured token is 403 even when query token is empty', async () => {
        const { app } = build({ verifyToken: '' });
        const res = await request(app).get(`${url}?hub.mode=subscribe&hub.verify_token=&hub.challenge=123`);
        expect(res.status).toBe(403);
    });

    test('POST with bad signature is 401 and not processed', async () => {
        const { app, service } = build();
        const raw = JSON.stringify({ entry: [] });
        const res = await request(app).post(url).set('Content-Type', 'application/json')
            .set('X-Hub-Signature-256', sign(raw, 'other')).send(raw);
        expect(res.status).toBe(401);
        expect(service.handlePayload).not.toHaveBeenCalled();
    });

    test('POST with missing signature is 401', async () => {
        const { app, service } = build();
        const res = await request(app).post(url).set('Content-Type', 'application/json').send('{}');
        expect(res.status).toBe(401);
        expect(service.handlePayload).not.toHaveBeenCalled();
    });

    test('POST with valid signature returns 200 and processes', async () => {
        const { app, service } = build();
        const payload = { entry: [{ id: '1' }] };
        const raw = JSON.stringify(payload);
        const res = await request(app).post(url).set('Content-Type', 'application/json')
            .set('X-Hub-Signature-256', sign(raw)).send(raw);
        expect(res.status).toBe(200);
        expect(service.handlePayload).toHaveBeenCalledWith(payload);
    });

    test('POST valid signature but malformed JSON returns 200', async () => {
        const { app, service, logger } = build();
        const raw = '{bad';
        const res = await request(app).post(url).set('Content-Type', 'application/json')
            .set('X-Hub-Signature-256', sign(raw)).send(raw);
        expect(res.status).toBe(200);
        expect(service.handlePayload).not.toHaveBeenCalled();
        expect(logger.warn).toHaveBeenCalledWith('[WhatsAppWebhook] invalid JSON payload');
    });

    test('POST returns 200 when processing throws', async () => {
        const service = { handlePayload: jest.fn().mockRejectedValue(new Error('boom')) };
        const { app, logger } = build({ service });
        const raw = JSON.stringify({ entry: [] });
        const res = await request(app).post(url).set('Content-Type', 'application/json')
            .set('X-Hub-Signature-256', sign(raw)).send(raw);
        expect(res.status).toBe(200);
        expect(logger.warn).toHaveBeenCalled();
    });
});

'use strict';

const express = require('express');
const defaultLogger = require('../utils/logger');
const { verifySignature, createWhatsAppWebhookService } = require('../services/WhatsAppWebhookService');

function createWhatsAppWebhookRouter({
    service,
    verifyToken = process.env.WHATSAPP_CLOUD_VERIFY_TOKEN,
    appSecret = process.env.WHATSAPP_CLOUD_APP_SECRET,
    logger = defaultLogger
} = {}) {
    const router = express.Router();
    let webhookService = service;
    const getService = () => {
        if (!webhookService) webhookService = createWhatsAppWebhookService();
        return webhookService;
    };

    router.get('/', (req, res) => {
        const mode = req.query['hub.mode'];
        const token = req.query['hub.verify_token'];
        const challenge = req.query['hub.challenge'];
        if (mode === 'subscribe' && verifyToken && typeof token === 'string' && token === verifyToken) {
            return res.status(200).type('text/plain').send(String(challenge));
        }
        return res.sendStatus(403);
    });

    router.post('/', express.raw({ type: 'application/json', limit: '1mb' }), async (req, res) => {
        const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
        if (!verifySignature(rawBody, req.get('X-Hub-Signature-256'), appSecret)) {
            return res.sendStatus(401);
        }

        let payload;
        try {
            payload = JSON.parse(rawBody.toString('utf8'));
        } catch (_) {
            logger.warn('[WhatsAppWebhook] invalid JSON payload');
            return res.sendStatus(200);
        }

        try {
            await getService().handlePayload(payload);
        } catch (_) {
            logger.warn('[WhatsAppWebhook] payload processing failed');
        }
        return res.sendStatus(200);
    });

    return router;
}

module.exports = { createWhatsAppWebhookRouter };

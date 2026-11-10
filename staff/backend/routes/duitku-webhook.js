'use strict';

/**
 * Duitku payment callback for premium packages.
 * POST /api/webhooks/duitku/callback  (application/x-www-form-urlencoded)
 *
 * Duitku retries until it gets HTTP 200 (up to 5 times):
 *  - bad signature          -> 400, nothing is touched
 *  - handled, or an order we cannot act on (unknown order, amount mismatch) -> 200 so it stops retrying
 *  - temporary failure (database down, status not confirmed yet) -> 500 so it retries
 */

const express = require('express');
const defaultLogger = require('../utils/logger');

function createDuitkuWebhookRouter({ duitku, service, logger = defaultLogger } = {}) {
    const router = express.Router();
    const gateway = () => duitku || require('../utils/duitku-payment');
    const premium = () => service || require('../services/PremiumPaymentService').getPremiumPaymentService();

    router.post('/callback', express.urlencoded({ extended: false, limit: '100kb' }), async (req, res) => {
        const body = req.body || {};

        if (!gateway().verifyCallbackSignature(body)) {
            logger.warn('[DuitkuWebhook] Rejected callback with invalid signature', {
                ip: req.ip,
                orderRef: typeof body.merchantOrderId === 'string' ? body.merchantOrderId.substring(0, 60) : null
            });
            return res.status(400).json({ success: false, message: 'Invalid signature' });
        }

        try {
            const result = await premium().handleGatewayCallback(body);
            return res.status(200).json({ success: true, action: result.action });
        } catch (error) {
            logger.error('[DuitkuWebhook] Callback processing failed, asking Duitku to retry', {
                orderRef: String(body.merchantOrderId || '').substring(0, 60),
                code: error.code || null,
                message: error.message
            });
            return res.status(500).json({ success: false, message: 'Temporary failure, please retry' });
        }
    });

    return router;
}

module.exports = { createDuitkuWebhookRouter };

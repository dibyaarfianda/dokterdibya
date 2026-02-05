/**
 * Xendit Webhook Handler
 * Receives payment notifications from Xendit
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const logger = require('../utils/logger');
const xenditPayment = require('../utils/xendit-payment');
const { handlePaymentSuccess } = require('./billing-payment');

// Import realtime-sync for broadcasting
let realtimeSync;
try {
    realtimeSync = require('../realtime-sync');
} catch (e) {
    logger.warn('[XenditWebhook] realtime-sync not available');
}

/**
 * POST /api/webhooks/xendit/payment
 * Handle payment notifications from Xendit
 *
 * Xendit sends x-callback-token header for verification
 */
router.post('/payment', async (req, res) => {
    const callbackToken = req.headers['x-callback-token'];

    logger.info('[XenditWebhook] Received webhook', {
        ip: req.ip,
        hasToken: !!callbackToken,
        body: JSON.stringify(req.body).substring(0, 500)
    });

    try {
        // Verify webhook signature
        if (!xenditPayment.verifyWebhookSignature(callbackToken)) {
            logger.warn('[XenditWebhook] Invalid callback token', { ip: req.ip });

            // Log the invalid attempt
            await db.query(`
                INSERT INTO tagihan_payment_logs (
                    event_type, event_source, response_data, ip_address, user_agent
                ) VALUES ('webhook.invalid_token', 'webhook', ?, ?, ?)
            `, [JSON.stringify(req.body), req.ip, req.headers['user-agent']]);

            return res.status(403).json({ success: false, message: 'Invalid callback token' });
        }

        // Parse webhook payload
        const webhookData = xenditPayment.parseWebhookPayload(req.body);

        logger.info('[XenditWebhook] Parsed webhook', {
            type: webhookData.type,
            event: webhookData.event,
            xenditId: webhookData.xendit_id,
            referenceId: webhookData.reference_id,
            amount: webhookData.amount,
            status: webhookData.status
        });

        // Find payment by xendit_id or reference_id
        let payment = null;

        if (webhookData.xendit_id) {
            [[payment]] = await db.query(
                'SELECT * FROM tagihan_payments WHERE xendit_id = ? LIMIT 1',
                [webhookData.xendit_id]
            );
        }

        if (!payment && webhookData.reference_id) {
            [[payment]] = await db.query(
                'SELECT * FROM tagihan_payments WHERE xendit_reference_id = ? LIMIT 1',
                [webhookData.reference_id]
            );
        }

        if (!payment) {
            logger.warn('[XenditWebhook] Payment not found', {
                xenditId: webhookData.xendit_id,
                referenceId: webhookData.reference_id
            });

            // Log unknown payment webhook
            await db.query(`
                INSERT INTO tagihan_payment_logs (
                    event_type, event_source, response_data, ip_address
                ) VALUES ('webhook.payment_not_found', 'webhook', ?, ?)
            `, [JSON.stringify(req.body), req.ip]);

            // Return 200 to prevent Xendit from retrying
            return res.status(200).json({
                success: true,
                message: 'Webhook received but payment not found'
            });
        }

        // Check if already processed (idempotency)
        if (payment.status === 'paid') {
            logger.info('[XenditWebhook] Payment already processed', {
                paymentId: payment.id,
                mrId: payment.mr_id
            });

            return res.status(200).json({
                success: true,
                message: 'Payment already processed'
            });
        }

        // Handle payment based on webhook status
        if (webhookData.status === 'paid') {
            await handlePaymentSuccess(payment, webhookData);

            logger.info('[XenditWebhook] Payment success processed', {
                paymentId: payment.id,
                mrId: payment.mr_id,
                amount: webhookData.amount
            });

            // Broadcast notification to all clients
            if (realtimeSync && realtimeSync.broadcast) {
                // Get patient name for notification
                const [[record]] = await db.query(`
                    SELECT p.full_name as patient_name
                    FROM sunday_clinic_records r
                    JOIN patients p ON p.id = r.patient_id
                    WHERE r.mr_id = ?
                `, [payment.mr_id]);

                realtimeSync.broadcast({
                    type: 'billing_paid',
                    mrId: payment.mr_id,
                    paymentMethod: payment.payment_method,
                    patientName: record?.patient_name || 'Pasien',
                    amount: parseFloat(payment.amount),
                    timestamp: new Date().toISOString()
                });
            }

        } else if (webhookData.status === 'expired') {
            await db.query(
                'UPDATE tagihan_payments SET status = ? WHERE id = ?',
                ['expired', payment.id]
            );

            await db.query(`
                INSERT INTO tagihan_payment_logs (
                    payment_id, mr_id, event_type, event_source,
                    status_before, status_after, response_data, ip_address
                ) VALUES (?, ?, 'payment.expired', 'webhook', ?, 'expired', ?, ?)
            `, [payment.id, payment.mr_id, payment.status, JSON.stringify(req.body), req.ip]);

            logger.info('[XenditWebhook] Payment expired', {
                paymentId: payment.id,
                mrId: payment.mr_id
            });

        } else if (webhookData.status === 'failed') {
            await db.query(
                'UPDATE tagihan_payments SET status = ? WHERE id = ?',
                ['failed', payment.id]
            );

            await db.query(`
                INSERT INTO tagihan_payment_logs (
                    payment_id, mr_id, event_type, event_source,
                    status_before, status_after, response_data, ip_address
                ) VALUES (?, ?, 'payment.failed', 'webhook', ?, 'failed', ?, ?)
            `, [payment.id, payment.mr_id, payment.status, JSON.stringify(req.body), req.ip]);

            logger.info('[XenditWebhook] Payment failed', {
                paymentId: payment.id,
                mrId: payment.mr_id
            });
        }

        // Always return 200 to acknowledge receipt
        return res.status(200).json({
            success: true,
            message: 'Webhook processed successfully'
        });

    } catch (error) {
        logger.error('[XenditWebhook] Processing failed', {
            error: error.message,
            stack: error.stack
        });

        // Log the error
        try {
            await db.query(`
                INSERT INTO tagihan_payment_logs (
                    event_type, event_source, response_data, ip_address
                ) VALUES ('webhook.error', 'webhook', ?, ?)
            `, [JSON.stringify({ error: error.message, body: req.body }), req.ip]);
        } catch (logError) {
            // Ignore logging error
        }

        // Return 200 to prevent infinite retries
        // Xendit will retry failed webhooks, but we want to investigate first
        return res.status(200).json({
            success: false,
            message: 'Webhook processing error'
        });
    }
});

/**
 * POST /api/webhooks/xendit/qris
 * Alternative endpoint for QRIS-specific webhooks
 */
router.post('/qris', async (req, res) => {
    // Redirect to main handler
    req.body.type = 'QR_CODE';
    return router.handle(req, res);
});

/**
 * POST /api/webhooks/xendit/va
 * Alternative endpoint for VA-specific webhooks
 */
router.post('/va', async (req, res) => {
    // Redirect to main handler
    req.body.type = 'VIRTUAL_ACCOUNT';
    return router.handle(req, res);
});

module.exports = router;

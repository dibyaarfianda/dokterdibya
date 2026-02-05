/**
 * Billing Payment Routes - Xendit Integration
 * Handles online payment creation, status checking, and webhook processing
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const logger = require('../utils/logger');
const { sendSuccess, sendError } = require('../utils/response');
const { verifyToken } = require('../middleware/auth');
const xenditPayment = require('../utils/xendit-payment');

// Import realtime-sync for broadcasting payment events
let realtimeSync;
try {
    realtimeSync = require('../realtime-sync');
} catch (e) {
    logger.warn('[BillingPayment] realtime-sync not available');
}

/**
 * Normalize MR ID to uppercase
 */
function normalizeMrId(mrId) {
    return mrId ? mrId.toUpperCase().trim() : null;
}

/**
 * POST /:mrId/create-payment
 * Create a new payment request (QRIS or VA)
 */
router.post('/:mrId/create-payment', verifyToken, async (req, res) => {
    const mrId = normalizeMrId(req.params.mrId);
    const { payment_method } = req.body;

    try {
        // Validate payment method
        const validMethods = ['qris', 'va_bca', 'va_bni', 'va_bri', 'va_mandiri'];
        if (!payment_method || !validMethods.includes(payment_method)) {
            return sendError(res, 'Metode pembayaran tidak valid', 400);
        }

        // Check Xendit configuration
        if (!xenditPayment.isConfigured()) {
            return sendError(res, 'Payment gateway belum dikonfigurasi', 503);
        }

        // Get billing info
        const [[billing]] = await db.query(`
            SELECT b.id, b.mr_id, b.patient_id, b.total, b.status,
                   p.full_name as patient_name
            FROM sunday_clinic_billings b
            JOIN patients p ON p.id = b.patient_id
            WHERE b.mr_id = ?
        `, [mrId]);

        if (!billing) {
            return sendError(res, 'Billing tidak ditemukan', 404);
        }

        if (billing.status !== 'confirmed') {
            return sendError(res, 'Billing harus dikonfirmasi terlebih dahulu', 400);
        }

        if (billing.status === 'paid') {
            return sendError(res, 'Billing sudah dibayar', 400);
        }

        // Check for existing pending payment
        const [[existingPayment]] = await db.query(`
            SELECT id, payment_method, status, expires_at
            FROM tagihan_payments
            WHERE mr_id = ? AND status = 'pending' AND expires_at > NOW()
            ORDER BY created_at DESC LIMIT 1
        `, [mrId]);

        if (existingPayment) {
            return sendError(res,
                `Sudah ada pembayaran ${existingPayment.payment_method.toUpperCase()} yang sedang diproses. ` +
                'Silakan tunggu hingga kadaluarsa atau gunakan pembayaran yang ada.',
                400
            );
        }

        // Create payment based on method
        let paymentResult;
        const amount = parseFloat(billing.total);

        if (payment_method === 'qris') {
            paymentResult = await xenditPayment.createQRISPayment({
                amount,
                mrId,
                patientName: billing.patient_name
            });
        } else {
            // Virtual Account
            const bankCode = payment_method.replace('va_', '').toUpperCase();
            paymentResult = await xenditPayment.createVAPayment({
                amount,
                mrId,
                bankCode,
                customerName: billing.patient_name
            });
        }

        // Save to database
        const [insertResult] = await db.query(`
            INSERT INTO tagihan_payments (
                billing_id, mr_id, patient_id, xendit_id, xendit_reference_id,
                payment_method, qris_string, qris_url, va_number, va_bank_code,
                amount, status, expires_at, xendit_response, created_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)
        `, [
            billing.id,
            mrId,
            billing.patient_id,
            paymentResult.xendit_id,
            paymentResult.reference_id,
            payment_method,
            paymentResult.qris_string || null,
            paymentResult.qris_url || null,
            paymentResult.va_number || null,
            paymentResult.va_bank_code || null,
            amount,
            paymentResult.expires_at,
            JSON.stringify(paymentResult.raw_response),
            req.user?.name || req.user?.id || 'System'
        ]);

        // Log the event
        await db.query(`
            INSERT INTO tagihan_payment_logs (
                payment_id, billing_id, mr_id, event_type, event_source,
                status_after, request_data, response_data, ip_address
            ) VALUES (?, ?, ?, 'payment.created', 'api', 'pending', ?, ?, ?)
        `, [
            insertResult.insertId,
            billing.id,
            mrId,
            JSON.stringify({ payment_method }),
            JSON.stringify(paymentResult),
            req.ip
        ]);

        logger.info('[BillingPayment] Payment created', {
            mrId,
            paymentId: insertResult.insertId,
            method: payment_method,
            amount
        });

        // Build response based on payment type
        const responseData = {
            payment_id: insertResult.insertId,
            xendit_id: paymentResult.xendit_id,
            payment_method,
            amount,
            expires_at: paymentResult.expires_at,
            expires_in_seconds: paymentResult.expires_in_seconds
        };

        if (payment_method === 'qris') {
            responseData.qris_url = paymentResult.qris_url;
            responseData.qris_string = paymentResult.qris_string;
        } else {
            responseData.va_number = paymentResult.va_number;
            responseData.va_bank_code = paymentResult.va_bank_code;
            responseData.va_bank_name = paymentResult.va_bank_name;
        }

        return sendSuccess(res, responseData, 'Pembayaran berhasil dibuat');

    } catch (error) {
        logger.error('[BillingPayment] Create payment failed', {
            mrId,
            error: error.message
        });
        return sendError(res, error.message || 'Gagal membuat pembayaran', 500);
    }
});

/**
 * GET /:mrId/payment-status/:paymentId
 * Check payment status
 */
router.get('/:mrId/payment-status/:paymentId', verifyToken, async (req, res) => {
    const mrId = normalizeMrId(req.params.mrId);
    const paymentId = parseInt(req.params.paymentId);

    try {
        // Get payment from DB
        const [[payment]] = await db.query(`
            SELECT * FROM tagihan_payments
            WHERE id = ? AND mr_id = ?
        `, [paymentId, mrId]);

        if (!payment) {
            return sendError(res, 'Pembayaran tidak ditemukan', 404);
        }

        // If already paid/expired/failed, return from DB
        if (['paid', 'expired', 'failed', 'cancelled'].includes(payment.status)) {
            return sendSuccess(res, {
                payment_id: payment.id,
                status: payment.status,
                amount: parseFloat(payment.amount),
                paid_at: payment.paid_at,
                expires_at: payment.expires_at
            });
        }

        // Check if expired locally
        if (new Date(payment.expires_at) < new Date()) {
            // Update status to expired
            await db.query(
                'UPDATE tagihan_payments SET status = ? WHERE id = ?',
                ['expired', paymentId]
            );

            return sendSuccess(res, {
                payment_id: payment.id,
                status: 'expired',
                amount: parseFloat(payment.amount),
                expires_at: payment.expires_at
            });
        }

        // Check with Xendit for latest status
        try {
            const type = payment.payment_method === 'qris' ? 'qris' : 'va';
            const xenditStatus = await xenditPayment.getPaymentStatus(payment.xendit_id, type);

            // If paid, update our DB
            if (xenditStatus.status === 'paid') {
                await handlePaymentSuccess(payment, xenditStatus);

                return sendSuccess(res, {
                    payment_id: payment.id,
                    status: 'paid',
                    amount: parseFloat(payment.amount),
                    paid_at: xenditStatus.paid_at || new Date().toISOString()
                });
            }
        } catch (xenditError) {
            logger.warn('[BillingPayment] Xendit status check failed, using local status', {
                paymentId,
                error: xenditError.message
            });
        }

        // Return current status from DB
        return sendSuccess(res, {
            payment_id: payment.id,
            status: payment.status,
            amount: parseFloat(payment.amount),
            expires_at: payment.expires_at,
            expires_in_seconds: Math.max(0, Math.floor((new Date(payment.expires_at) - new Date()) / 1000))
        });

    } catch (error) {
        logger.error('[BillingPayment] Check status failed', {
            mrId,
            paymentId,
            error: error.message
        });
        return sendError(res, 'Gagal mengecek status pembayaran', 500);
    }
});

/**
 * GET /:mrId/payment-details
 * Get active payment details for a billing
 */
router.get('/:mrId/payment-details', verifyToken, async (req, res) => {
    const mrId = normalizeMrId(req.params.mrId);

    try {
        // Get most recent non-expired/non-failed payment
        const [[payment]] = await db.query(`
            SELECT * FROM tagihan_payments
            WHERE mr_id = ? AND status IN ('pending', 'paid')
            ORDER BY created_at DESC LIMIT 1
        `, [mrId]);

        if (!payment) {
            return sendSuccess(res, null, 'Tidak ada pembayaran aktif');
        }

        // Check expiration for pending
        if (payment.status === 'pending' && new Date(payment.expires_at) < new Date()) {
            await db.query(
                'UPDATE tagihan_payments SET status = ? WHERE id = ?',
                ['expired', payment.id]
            );
            return sendSuccess(res, null, 'Pembayaran sudah kadaluarsa');
        }

        const responseData = {
            payment_id: payment.id,
            payment_method: payment.payment_method,
            amount: parseFloat(payment.amount),
            status: payment.status,
            created_at: payment.created_at,
            expires_at: payment.expires_at,
            paid_at: payment.paid_at
        };

        if (payment.payment_method === 'qris') {
            responseData.qris_url = payment.qris_url;
            responseData.qris_string = payment.qris_string;
        } else {
            responseData.va_number = payment.va_number;
            responseData.va_bank_code = payment.va_bank_code;
        }

        if (payment.status === 'pending') {
            responseData.expires_in_seconds = Math.max(0,
                Math.floor((new Date(payment.expires_at) - new Date()) / 1000)
            );
        }

        return sendSuccess(res, responseData);

    } catch (error) {
        logger.error('[BillingPayment] Get details failed', {
            mrId,
            error: error.message
        });
        return sendError(res, 'Gagal mengambil detail pembayaran', 500);
    }
});

/**
 * GET /:mrId/payment-methods
 * Get available payment methods
 */
router.get('/:mrId/payment-methods', verifyToken, async (req, res) => {
    try {
        const methods = xenditPayment.getSupportedMethods();
        const isConfigured = xenditPayment.isConfigured();

        return sendSuccess(res, {
            configured: isConfigured,
            methods: isConfigured ? methods : []
        });

    } catch (error) {
        return sendError(res, 'Gagal mengambil metode pembayaran', 500);
    }
});

/**
 * POST /:mrId/cancel-payment/:paymentId
 * Cancel a pending payment
 */
router.post('/:mrId/cancel-payment/:paymentId', verifyToken, async (req, res) => {
    const mrId = normalizeMrId(req.params.mrId);
    const paymentId = parseInt(req.params.paymentId);

    try {
        const [[payment]] = await db.query(`
            SELECT * FROM tagihan_payments
            WHERE id = ? AND mr_id = ? AND status = 'pending'
        `, [paymentId, mrId]);

        if (!payment) {
            return sendError(res, 'Pembayaran tidak ditemukan atau sudah diproses', 404);
        }

        // Update status to cancelled
        await db.query(
            'UPDATE tagihan_payments SET status = ? WHERE id = ?',
            ['cancelled', paymentId]
        );

        // Log the event
        await db.query(`
            INSERT INTO tagihan_payment_logs (
                payment_id, mr_id, event_type, event_source,
                status_before, status_after, ip_address
            ) VALUES (?, ?, 'payment.cancelled', 'api', 'pending', 'cancelled', ?)
        `, [paymentId, mrId, req.ip]);

        logger.info('[BillingPayment] Payment cancelled', { mrId, paymentId });

        return sendSuccess(res, { payment_id: paymentId, status: 'cancelled' }, 'Pembayaran dibatalkan');

    } catch (error) {
        logger.error('[BillingPayment] Cancel payment failed', {
            mrId,
            paymentId,
            error: error.message
        });
        return sendError(res, 'Gagal membatalkan pembayaran', 500);
    }
});

/**
 * Handle successful payment - update billing, deduct stock, etc.
 */
async function handlePaymentSuccess(payment, webhookData) {
    const mrId = payment.mr_id;

    try {
        // Update payment status
        await db.query(`
            UPDATE tagihan_payments
            SET status = 'paid',
                paid_at = ?,
                webhook_data = ?
            WHERE id = ?
        `, [
            webhookData.paid_at || new Date(),
            JSON.stringify(webhookData),
            payment.id
        ]);

        // Log the event
        await db.query(`
            INSERT INTO tagihan_payment_logs (
                payment_id, billing_id, mr_id, event_type, event_source,
                status_before, status_after, response_data
            ) VALUES (?, ?, ?, 'payment.paid', 'webhook', 'pending', 'paid', ?)
        `, [payment.id, payment.billing_id, mrId, JSON.stringify(webhookData)]);

        // Update billing status to paid
        await db.query(`
            UPDATE sunday_clinic_billings
            SET status = 'paid'
            WHERE id = ? AND status = 'confirmed'
        `, [payment.billing_id]);

        // Get billing items for stock deduction
        const [billingItems] = await db.query(`
            SELECT item_code, item_name, quantity
            FROM sunday_clinic_billing_items
            WHERE billing_id = ? AND item_type = 'obat'
        `, [payment.billing_id]);

        // Deduct stock for each medication
        if (billingItems.length > 0) {
            const InventoryService = require('../services/InventoryService');

            for (const item of billingItems) {
                try {
                    await InventoryService.deductStock(
                        item.item_code,
                        item.quantity,
                        'billing',
                        payment.billing_id,
                        'System (Xendit Payment)'
                    );
                } catch (stockError) {
                    logger.warn('[BillingPayment] Stock deduction failed', {
                        mrId,
                        itemCode: item.item_code,
                        error: stockError.message
                    });
                }
            }
        }

        // Auto-finalize medical record
        await db.query(`
            UPDATE sunday_clinic_records
            SET status = 'finalized'
            WHERE mr_id = ? AND status = 'draft'
        `, [mrId]);

        // Broadcast payment received event
        if (realtimeSync && realtimeSync.broadcast) {
            realtimeSync.broadcast({
                type: 'payment_received',
                mrId,
                paymentId: payment.id,
                paymentMethod: payment.payment_method,
                amount: payment.amount,
                timestamp: new Date().toISOString()
            });
        }

        logger.info('[BillingPayment] Payment success handled', {
            mrId,
            paymentId: payment.id,
            billingId: payment.billing_id
        });

    } catch (error) {
        logger.error('[BillingPayment] Handle payment success failed', {
            mrId,
            paymentId: payment.id,
            error: error.message
        });
        throw error;
    }
}

module.exports = router;
module.exports.handlePaymentSuccess = handlePaymentSuccess;

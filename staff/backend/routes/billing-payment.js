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

        // Check if expired locally (skip for insurance - no expiry)
        if (payment.expires_at && new Date(payment.expires_at) < new Date()) {
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

        // Check expiration for pending (skip for insurance - no expiry)
        if (payment.status === 'pending' && payment.expires_at && new Date(payment.expires_at) < new Date()) {
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

        if (payment.payment_method === 'asuransi') {
            responseData.insurance_info = payment.insurance_info ?
                (typeof payment.insurance_info === 'string' ? JSON.parse(payment.insurance_info) : payment.insurance_info)
                : null;
        } else if (payment.payment_method === 'qris') {
            responseData.qris_url = payment.qris_url;
            responseData.qris_string = payment.qris_string;
        } else {
            responseData.va_number = payment.va_number;
            responseData.va_bank_code = payment.va_bank_code;
        }

        if (payment.status === 'pending' && payment.expires_at) {
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
 * POST /:mrId/create-insurance-payment
 * Create insurance (asuransi) payment - status pending, no Xendit
 */
router.post('/:mrId/create-insurance-payment', verifyToken, async (req, res) => {
    const mrId = normalizeMrId(req.params.mrId);
    const { insurance_provider, insurance_number, notes } = req.body;

    try {
        if (!insurance_provider || !insurance_provider.trim()) {
            return sendError(res, 'Nama asuransi wajib diisi', 400);
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

        const amount = parseFloat(billing.total);
        const insuranceInfo = {
            provider: insurance_provider.trim(),
            number: (insurance_number || '').trim(),
            notes: (notes || '').trim()
        };

        // Insert payment record with status 'pending'
        const [insertResult] = await db.query(`
            INSERT INTO tagihan_payments (
                billing_id, mr_id, patient_id,
                payment_method, amount, status, insurance_info, created_by
            ) VALUES (?, ?, ?, 'asuransi', ?, 'pending', ?, ?)
        `, [
            billing.id,
            mrId,
            billing.patient_id,
            amount,
            JSON.stringify(insuranceInfo),
            req.user?.name || req.user?.id || 'System'
        ]);

        // Log the event
        await db.query(`
            INSERT INTO tagihan_payment_logs (
                payment_id, billing_id, mr_id, event_type, event_source,
                status_after, request_data, ip_address
            ) VALUES (?, ?, ?, 'payment.insurance_created', 'api', 'pending', ?, ?)
        `, [
            insertResult.insertId,
            billing.id,
            mrId,
            JSON.stringify(insuranceInfo),
            req.ip
        ]);

        logger.info('[BillingPayment] Insurance payment created', {
            mrId,
            paymentId: insertResult.insertId,
            provider: insuranceInfo.provider,
            amount
        });

        return sendSuccess(res, {
            payment_id: insertResult.insertId,
            payment_method: 'asuransi',
            amount,
            status: 'pending',
            insurance_info: insuranceInfo
        }, 'Pembayaran asuransi berhasil dibuat (menunggu klaim)');

    } catch (error) {
        logger.error('[BillingPayment] Create insurance payment failed', {
            mrId,
            error: error.message
        });
        return sendError(res, error.message || 'Gagal membuat pembayaran asuransi', 500);
    }
});

/**
 * POST /:mrId/confirm-insurance/:paymentId
 * Confirm insurance payment (mark as paid)
 */
router.post('/:mrId/confirm-insurance/:paymentId', verifyToken, async (req, res) => {
    const mrId = normalizeMrId(req.params.mrId);
    const paymentId = parseInt(req.params.paymentId);

    try {
        const [[payment]] = await db.query(`
            SELECT * FROM tagihan_payments
            WHERE id = ? AND mr_id = ? AND payment_method = 'asuransi' AND status = 'pending'
        `, [paymentId, mrId]);

        if (!payment) {
            return sendError(res, 'Pembayaran asuransi tidak ditemukan atau sudah diproses', 404);
        }

        // Use handlePaymentSuccess to update billing, deduct stock, finalize MR
        await handlePaymentSuccess(payment, {
            paid_at: new Date(),
            confirmed_by: req.user?.name || req.user?.id || 'System',
            confirmation_type: 'insurance_claim_approved'
        });

        logger.info('[BillingPayment] Insurance payment confirmed', { mrId, paymentId });

        return sendSuccess(res, {
            payment_id: paymentId,
            status: 'paid'
        }, 'Pembayaran asuransi dikonfirmasi');

    } catch (error) {
        logger.error('[BillingPayment] Confirm insurance failed', {
            mrId,
            paymentId,
            error: error.message
        });
        return sendError(res, 'Gagal mengkonfirmasi pembayaran asuransi', 500);
    }
});

/**
 * GET /:mrId/xendit-public-key
 * Get Xendit public key for frontend tokenization
 */
router.get('/:mrId/xendit-public-key', verifyToken, async (req, res) => {
    try {
        const publicKey = xenditPayment.getPublicKey();

        if (!publicKey) {
            return sendError(res, 'Xendit public key belum dikonfigurasi', 503);
        }

        return sendSuccess(res, { public_key: publicKey });

    } catch (error) {
        return sendError(res, 'Gagal mengambil public key', 500);
    }
});

/**
 * POST /:mrId/create-card-charge
 * Create credit card charge with token from Xendit.js
 */
router.post('/:mrId/create-card-charge', verifyToken, async (req, res) => {
    const mrId = normalizeMrId(req.params.mrId);
    const { token_id, authentication_id } = req.body;

    try {
        if (!token_id) {
            return sendError(res, 'Token kartu diperlukan', 400);
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

        const amount = parseFloat(billing.total);

        // Create credit card charge
        const chargeResult = await xenditPayment.createCreditCardCharge({
            tokenId: token_id,
            authId: authentication_id,
            amount,
            mrId,
            patientName: billing.patient_name
        });

        // Save to database
        const [insertResult] = await db.query(`
            INSERT INTO tagihan_payments (
                billing_id, mr_id, patient_id, xendit_id, xendit_reference_id,
                payment_method, amount, status, paid_at, xendit_response, created_by
            ) VALUES (?, ?, ?, ?, ?, 'credit_card', ?, ?, ?, ?, ?)
        `, [
            billing.id,
            mrId,
            billing.patient_id,
            chargeResult.xendit_id,
            chargeResult.reference_id,
            amount,
            chargeResult.status === 'captured' ? 'paid' : 'pending',
            chargeResult.paid_at,
            JSON.stringify(chargeResult.raw_response),
            req.user?.name || req.user?.id || 'System'
        ]);

        // Log the event
        await db.query(`
            INSERT INTO tagihan_payment_logs (
                payment_id, billing_id, mr_id, event_type, event_source,
                status_after, request_data, response_data, ip_address
            ) VALUES (?, ?, ?, 'payment.card_charged', 'api', ?, ?, ?, ?)
        `, [
            insertResult.insertId,
            billing.id,
            mrId,
            chargeResult.status,
            JSON.stringify({ token_id: token_id.substring(0, 10) + '...' }),
            JSON.stringify(chargeResult),
            req.ip
        ]);

        // If payment captured, process success
        if (chargeResult.status === 'captured') {
            const payment = {
                id: insertResult.insertId,
                billing_id: billing.id,
                mr_id: mrId,
                payment_method: 'credit_card',
                amount
            };

            await handlePaymentSuccess(payment, {
                paid_at: chargeResult.paid_at,
                card_brand: chargeResult.card_brand,
                masked_card_number: chargeResult.masked_card_number
            });
        }

        logger.info('[BillingPayment] Credit card charge created', {
            mrId,
            paymentId: insertResult.insertId,
            status: chargeResult.status
        });

        return sendSuccess(res, {
            payment_id: insertResult.insertId,
            xendit_id: chargeResult.xendit_id,
            status: chargeResult.status,
            amount,
            card_brand: chargeResult.card_brand,
            masked_card_number: chargeResult.masked_card_number
        }, chargeResult.status === 'captured' ? 'Pembayaran berhasil' : 'Pembayaran diproses');

    } catch (error) {
        logger.error('[BillingPayment] Create card charge failed', {
            mrId,
            error: error.message
        });
        return sendError(res, error.message || 'Gagal memproses pembayaran kartu', 500);
    }
});

/**
 * POST /:mrId/create-3ds-auth
 * Create 3DS authentication for credit card
 */
router.post('/:mrId/create-3ds-auth', verifyToken, async (req, res) => {
    const mrId = normalizeMrId(req.params.mrId);
    const { token_id } = req.body;

    try {
        if (!token_id) {
            return sendError(res, 'Token kartu diperlukan', 400);
        }

        // Get billing amount
        const [[billing]] = await db.query(`
            SELECT total FROM sunday_clinic_billings WHERE mr_id = ?
        `, [mrId]);

        if (!billing) {
            return sendError(res, 'Billing tidak ditemukan', 404);
        }

        const amount = parseFloat(billing.total);

        // Create 3DS authentication
        const authResult = await xenditPayment.create3DSAuthentication({
            tokenId: token_id,
            amount,
            mrId
        });

        logger.info('[BillingPayment] 3DS authentication created', {
            mrId,
            authId: authResult.authentication_id,
            status: authResult.status
        });

        return sendSuccess(res, {
            authentication_id: authResult.authentication_id,
            status: authResult.status,
            payer_authentication_url: authResult.payer_authentication_url
        });

    } catch (error) {
        logger.error('[BillingPayment] Create 3DS auth failed', {
            mrId,
            error: error.message
        });
        return sendError(res, error.message || 'Gagal memulai autentikasi 3DS', 500);
    }
});

/**
 * Handle successful payment - update billing, deduct stock, etc.
 */
async function handlePaymentSuccess(payment, webhookData) {
    const mrId = payment.mr_id;
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        // Convert paid_at to Date object (MySQL2 handles Date objects correctly)
        let paidAt = webhookData.paid_at || new Date();
        if (typeof paidAt === 'string') {
            paidAt = new Date(paidAt);
        }

        // Update payment status
        await connection.query(`
            UPDATE tagihan_payments
            SET status = 'paid',
                paid_at = ?,
                webhook_data = ?
            WHERE id = ?
        `, [
            paidAt,
            JSON.stringify(webhookData),
            payment.id
        ]);

        // Log the event
        await connection.query(`
            INSERT INTO tagihan_payment_logs (
                payment_id, billing_id, mr_id, event_type, event_source,
                status_before, status_after, response_data
            ) VALUES (?, ?, ?, 'payment.paid', 'webhook', 'pending', 'paid', ?)
        `, [payment.id, payment.billing_id, mrId, JSON.stringify(webhookData)]);

        // Get billing items for stock deduction
        const [billingItems] = await connection.query(`
            SELECT item_code, item_name, quantity,
                   CAST(JSON_EXTRACT(item_data, '$.obatId') AS UNSIGNED) as obat_id
            FROM sunday_clinic_billing_items
            WHERE billing_id = ? AND item_type = 'obat'
        `, [payment.billing_id]);

        const invalidBillingItems = billingItems.filter(item => !item.obat_id);
        if (invalidBillingItems.length > 0) {
            throw new Error(`Data obat tidak valid: ${invalidBillingItems.map(i => i.item_name).join(', ')}`);
        }

        // Deduct stock for each medication
        if (billingItems.length > 0) {
            const InventoryService = require('../services/InventoryService');

            for (const item of billingItems) {
                const requiredQty = parseInt(item.quantity, 10) || 0;
                const obatId = Number(item.obat_id);

                if (requiredQty <= 0) {
                    continue;
                }

                const [[existingDeduction]] = await connection.query(
                    `SELECT ABS(COALESCE(SUM(quantity), 0)) AS deducted_qty
                     FROM stock_movements
                     WHERE reference_type = 'sunday_clinic_billing'
                       AND reference_id = ?
                       AND movement_type = 'sale'
                       AND obat_id = ?`,
                    [payment.billing_id, obatId]
                );

                const alreadyDeducted = Number(existingDeduction?.deducted_qty || 0);
                const remainingQty = Math.max(0, requiredQty - alreadyDeducted);

                if (remainingQty <= 0) {
                    continue;
                }

                await InventoryService.deductStockFIFO(
                    obatId,
                    remainingQty,
                    'sunday_clinic_billing',
                    payment.billing_id,
                    'System (Xendit Payment)'
                );
            }
        }

        // Update billing status to paid only after stock deduction succeeds.
        await connection.query(`
            UPDATE sunday_clinic_billings
            SET status = 'paid'
            WHERE id = ? AND status = 'confirmed'
        `, [payment.billing_id]);

        // Auto-finalize medical record
        await connection.query(`
            UPDATE sunday_clinic_records
            SET status = 'finalized'
            WHERE mr_id = ? AND status = 'draft'
        `, [mrId]);

        await connection.commit();

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
        await connection.rollback();
        logger.error('[BillingPayment] Handle payment success failed', {
            mrId,
            paymentId: payment.id,
            error: error.message,
            stack: error.stack
        });
        throw error;
    } finally {
        connection.release();
    }
}

module.exports = router;
module.exports.handlePaymentSuccess = handlePaymentSuccess;

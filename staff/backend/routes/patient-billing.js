/**
 * Patient Billing Routes
 * Patient-facing endpoints for viewing billings and making online payments
 * Trial mode: Currently limited to specific patients
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const logger = require('../utils/logger');
const { sendSuccess, sendError } = require('../utils/response');
const { verifyPatientToken } = require('../middleware/auth');
const xenditPayment = require('../utils/xendit-payment');
const { handlePaymentSuccess } = require('./billing-payment');

// All routes require patient authentication
router.use(verifyPatientToken);

/**
 * GET /my-bills
 * List patient's billings (confirmed + paid only)
 */
router.get('/my-bills', async (req, res) => {
    const patientId = req.user.id;

    try {
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '0');

        const [billings] = await db.query(`
            SELECT b.id, b.mr_id, b.patient_id, b.total, b.status,
                   b.confirmed_at, b.created_at,
                   p.full_name as patient_name,
                   tp.status as payment_status
            FROM sunday_clinic_billings b
            JOIN patients p ON p.id = b.patient_id
            LEFT JOIN tagihan_payments tp ON tp.billing_id = b.id
                AND tp.status IN ('pending', 'paid')
            WHERE b.patient_id = ?
              AND b.status IN ('confirmed', 'paid')
            ORDER BY b.created_at DESC
        `, [patientId]);

        return sendSuccess(res, billings);

    } catch (error) {
        logger.error('[PatientBilling] List bills failed', {
            patientId,
            error: error.message
        });
        return sendError(res, 'Gagal mengambil daftar tagihan', 500);
    }
});

/**
 * GET /:billingId/details
 * Get billing detail with items
 */
router.get('/:billingId/details', async (req, res) => {
    const patientId = req.user.id;
    const billingId = parseInt(req.params.billingId);

    try {
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '0');

        // Get billing (verify ownership)
        const [[billing]] = await db.query(`
            SELECT b.id, b.mr_id, b.patient_id, b.subtotal, b.total, b.status,
                   b.confirmed_at, b.created_at,
                   p.full_name as patient_name
            FROM sunday_clinic_billings b
            JOIN patients p ON p.id = b.patient_id
            WHERE b.id = ? AND b.patient_id = ?
        `, [billingId, patientId]);

        if (!billing) {
            return sendError(res, 'Tagihan tidak ditemukan', 404);
        }

        // Get billing items
        const [items] = await db.query(`
            SELECT item_type, item_name, quantity, price, total
            FROM sunday_clinic_billing_items
            WHERE billing_id = ?
            ORDER BY item_type, item_name
        `, [billingId]);

        return sendSuccess(res, {
            billing,
            items
        });

    } catch (error) {
        logger.error('[PatientBilling] Get details failed', {
            patientId,
            billingId,
            error: error.message
        });
        return sendError(res, 'Gagal mengambil detail tagihan', 500);
    }
});

/**
 * POST /:billingId/create-payment
 * Create a new QRIS or VA payment
 */
router.post('/:billingId/create-payment', async (req, res) => {
    const patientId = req.user.id;
    const billingId = parseInt(req.params.billingId);
    const { payment_method } = req.body;

    try {
        // Validate payment method (QRIS + VA only, no credit card)
        const validMethods = ['qris', 'va_bca', 'va_bni', 'va_bri', 'va_mandiri'];
        if (!payment_method || !validMethods.includes(payment_method)) {
            return sendError(res, 'Metode pembayaran tidak valid', 400);
        }

        if (!xenditPayment.isConfigured()) {
            return sendError(res, 'Payment gateway belum dikonfigurasi', 503);
        }

        // Get billing (verify ownership + status)
        const [[billing]] = await db.query(`
            SELECT b.id, b.mr_id, b.patient_id, b.total, b.status,
                   p.full_name as patient_name
            FROM sunday_clinic_billings b
            JOIN patients p ON p.id = b.patient_id
            WHERE b.id = ? AND b.patient_id = ?
        `, [billingId, patientId]);

        if (!billing) {
            return sendError(res, 'Tagihan tidak ditemukan', 404);
        }

        if (billing.status !== 'confirmed') {
            return sendError(res, 'Tagihan belum dikonfirmasi atau sudah dibayar', 400);
        }

        // Check for existing pending payment
        const [[existingPayment]] = await db.query(`
            SELECT id, payment_method, status, expires_at
            FROM tagihan_payments
            WHERE billing_id = ? AND status = 'pending' AND expires_at > NOW()
            ORDER BY created_at DESC LIMIT 1
        `, [billingId]);

        if (existingPayment) {
            return sendError(res,
                'Sudah ada pembayaran yang sedang diproses. Tunggu hingga kadaluarsa atau gunakan yang ada.',
                400
            );
        }

        // Create payment
        const amount = parseFloat(billing.total);
        const mrId = billing.mr_id;
        let paymentResult;

        if (payment_method === 'qris') {
            paymentResult = await xenditPayment.createQRISPayment({
                amount,
                mrId,
                patientName: billing.patient_name
            });
        } else {
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
            patientId,
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
            'Patient: ' + (billing.patient_name || patientId)
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
            JSON.stringify({ payment_method, source: 'patient_portal' }),
            JSON.stringify(paymentResult),
            req.ip
        ]);

        logger.info('[PatientBilling] Payment created', {
            patientId,
            mrId,
            paymentId: insertResult.insertId,
            method: payment_method,
            amount
        });

        // Build response
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
        logger.error('[PatientBilling] Create payment failed', {
            patientId,
            billingId,
            error: error.message
        });
        return sendError(res, error.message || 'Gagal membuat pembayaran', 500);
    }
});

/**
 * GET /:billingId/payment-status/:paymentId
 * Check payment status
 */
router.get('/:billingId/payment-status/:paymentId', async (req, res) => {
    const patientId = req.user.id;
    const billingId = parseInt(req.params.billingId);
    const paymentId = parseInt(req.params.paymentId);

    try {
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '0');

        // Get payment (verify ownership via billing)
        const [[payment]] = await db.query(`
            SELECT tp.* FROM tagihan_payments tp
            JOIN sunday_clinic_billings b ON b.id = tp.billing_id
            WHERE tp.id = ? AND tp.billing_id = ? AND b.patient_id = ?
        `, [paymentId, billingId, patientId]);

        if (!payment) {
            return sendError(res, 'Pembayaran tidak ditemukan', 404);
        }

        // If already terminal, return from DB
        if (['paid', 'expired', 'failed', 'cancelled'].includes(payment.status)) {
            return sendSuccess(res, {
                payment_id: payment.id,
                status: payment.status,
                amount: parseFloat(payment.amount),
                paid_at: payment.paid_at,
                expires_at: payment.expires_at
            });
        }

        // Check local expiration
        if (new Date(payment.expires_at) < new Date()) {
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
            logger.warn('[PatientBilling] Xendit status check failed', {
                paymentId,
                error: xenditError.message
            });
        }

        return sendSuccess(res, {
            payment_id: payment.id,
            status: payment.status,
            amount: parseFloat(payment.amount),
            expires_at: payment.expires_at,
            expires_in_seconds: Math.max(0, Math.floor((new Date(payment.expires_at) - new Date()) / 1000))
        });

    } catch (error) {
        logger.error('[PatientBilling] Check status failed', {
            patientId,
            paymentId,
            error: error.message
        });
        return sendError(res, 'Gagal mengecek status pembayaran', 500);
    }
});

/**
 * GET /:billingId/payment-details
 * Get active payment details (QR/VA info)
 */
router.get('/:billingId/payment-details', async (req, res) => {
    const patientId = req.user.id;
    const billingId = parseInt(req.params.billingId);

    try {
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '0');

        // Get most recent active payment (verify ownership)
        const [[payment]] = await db.query(`
            SELECT tp.* FROM tagihan_payments tp
            JOIN sunday_clinic_billings b ON b.id = tp.billing_id
            WHERE tp.billing_id = ? AND b.patient_id = ?
              AND tp.status IN ('pending', 'paid')
            ORDER BY tp.created_at DESC LIMIT 1
        `, [billingId, patientId]);

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
        logger.error('[PatientBilling] Get payment details failed', {
            patientId,
            billingId,
            error: error.message
        });
        return sendError(res, 'Gagal mengambil detail pembayaran', 500);
    }
});

module.exports = router;

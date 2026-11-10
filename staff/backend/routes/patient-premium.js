'use strict';

/**
 * Patient premium packages (Duitku QRIS + virtual account).
 *
 * GET  /api/patient/premium/plans            active plans
 * GET  /api/patient/premium/status           the patient's package and latest orders
 * POST /api/patient/premium/checkout         { plan_code, payment_method } -> QRIS string or VA number
 * GET  /api/patient/premium/orders/:orderRef one of the patient's own orders (the app polls this)
 *
 * The app polls our database only. Payment is confirmed by Duitku's signed callback or by
 * reconciliation, never by anything the browser sends.
 */

const express = require('express');
const defaultLogger = require('../utils/logger');
const { verifyPatientToken: defaultVerifyPatientToken } = require('../middleware/auth');
const { PremiumError } = require('../services/PremiumPaymentService');

function noStore(req, res, next) {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    next();
}

function createPatientPremiumRouter({
    service,
    db,
    duitku,
    verifyPatientToken = defaultVerifyPatientToken,
    logger = defaultLogger
} = {}) {
    const router = express.Router();
    const premium = () => service || require('../services/PremiumPaymentService').getPremiumPaymentService();
    const database = () => db || require('../db');
    const gateway = () => duitku || require('../utils/duitku-payment');

    function fail(res, error, fallbackMessage) {
        if (error instanceof PremiumError) {
            return res.status(error.status).json({ success: false, code: error.code, message: error.message });
        }
        logger.error('[PatientPremium] Unexpected error', { message: error.message });
        return res.status(500).json({ success: false, message: fallbackMessage });
    }

    router.get('/plans', verifyPatientToken, noStore, async (req, res) => {
        try {
            const plans = await premium().listActivePlans();
            const methods = Object.entries(gateway().PAYMENT_METHODS).map(([key, method]) => ({ key, label: method.label, type: method.type }));
            res.json({ success: true, plans, payment_methods: methods, min_amount_idr: gateway().MIN_AMOUNT_IDR });
        } catch (error) {
            fail(res, error, 'Gagal memuat paket');
        }
    });

    router.get('/status', verifyPatientToken, noStore, async (req, res) => {
        try {
            const status = await premium().getPatientStatus(req.patient.id);
            res.json({ success: true, ...status });
        } catch (error) {
            fail(res, error, 'Gagal memuat status paket');
        }
    });

    router.post('/checkout', verifyPatientToken, noStore, async (req, res) => {
        try {
            const { plan_code: planCode, payment_method: paymentMethod } = req.body || {};
            if (typeof planCode !== 'string' || typeof paymentMethod !== 'string' || !planCode || !paymentMethod) {
                return res.status(400).json({ success: false, message: 'Paket dan metode pembayaran wajib diisi' });
            }

            const [rows] = await database().query('SELECT full_name, email, phone FROM patients WHERE id = ? LIMIT 1', [req.patient.id]);
            const profile = rows[0] || {};
            const order = await premium().createOrder({
                patient: { id: req.patient.id, email: profile.email || '', name: profile.full_name || '', phone: profile.phone || '' },
                planCode,
                paymentMethod
            });
            res.status(201).json({ success: true, order });
        } catch (error) {
            fail(res, error, 'Gagal membuat pembayaran');
        }
    });

    router.get('/orders/:orderRef', verifyPatientToken, noStore, async (req, res) => {
        try {
            const order = await premium().getOrderForPatient(req.patient.id, req.params.orderRef);
            if (!order) return res.status(404).json({ success: false, message: 'Pembayaran tidak ditemukan' });
            res.json({ success: true, order });
        } catch (error) {
            fail(res, error, 'Gagal memuat pembayaran');
        }
    });

    return router;
}

module.exports = { createPatientPremiumRouter };

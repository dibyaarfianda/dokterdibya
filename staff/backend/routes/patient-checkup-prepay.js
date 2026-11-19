'use strict';

/**
 * Patient prepayment of the estimated cost of one Klinik Privat visit (Duitku QRIS + VA).
 *
 * GET  /api/patient/checkup-prepay/status            availability, estimates, saldo, latest orders
 * POST /api/patient/checkup-prepay/checkout          { category, payment_method } -> QRIS string or VA number
 * GET  /api/patient/checkup-prepay/orders/:orderRef  one of the patient's own prepay orders (polled)
 *
 * The amount is priced on the server; anything the browser sends besides category and method is
 * ignored. Payment is confirmed only by Duitku's signed callback or by reconciliation.
 */

const express = require('express');
const defaultLogger = require('../utils/logger');
const { verifyPatientToken: defaultVerifyPatientToken } = require('../middleware/auth');
const { PremiumError } = require('../services/PremiumPaymentService');

const ORDER_REF_PATTERN = /^DPK-[0-9a-f-]{36}$/i;

function noStore(req, res, next) {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    next();
}

function createPatientCheckupPrepayRouter({
    service,
    db,
    verifyPatientToken = defaultVerifyPatientToken,
    logger = defaultLogger
} = {}) {
    const router = express.Router();
    const prepay = () => service || require('../services/CheckupPrepayService').getCheckupPrepayService();
    const database = () => db || require('../db');

    function fail(res, error, fallbackMessage) {
        if (error instanceof PremiumError) {
            return res.status(error.status).json({ success: false, code: error.code, message: error.message });
        }
        logger.error('[PatientCheckupPrepay] Unexpected error', { message: error.message });
        return res.status(500).json({ success: false, message: fallbackMessage });
    }

    router.get('/status', verifyPatientToken, noStore, async (req, res) => {
        try {
            const status = await prepay().getStatus(req.patient.id);
            res.json({ success: true, ...status });
        } catch (error) {
            fail(res, error, 'Gagal memuat estimasi dan saldo');
        }
    });

    router.post('/checkout', verifyPatientToken, noStore, async (req, res) => {
        try {
            const { category, payment_method: paymentMethod } = req.body || {};
            if (typeof category !== 'string' || typeof paymentMethod !== 'string' || !category || !paymentMethod) {
                return res.status(400).json({ success: false, message: 'Kategori dan metode pembayaran wajib diisi' });
            }

            const [rows] = await database().query('SELECT full_name, email, phone FROM patients WHERE id = ? LIMIT 1', [req.patient.id]);
            const profile = rows[0] || {};
            const order = await prepay().createOrder({
                patient: { id: req.patient.id, email: profile.email || '', name: profile.full_name || '', phone: profile.phone || '' },
                category,
                paymentMethod
            });
            res.status(201).json({ success: true, order });
        } catch (error) {
            fail(res, error, 'Gagal membuat pembayaran');
        }
    });

    router.get('/orders/:orderRef', verifyPatientToken, noStore, async (req, res) => {
        try {
            if (!ORDER_REF_PATTERN.test(req.params.orderRef)) {
                return res.status(404).json({ success: false, message: 'Pembayaran tidak ditemukan' });
            }
            const order = await prepay().getOrderForPatient(req.patient.id, req.params.orderRef);
            if (!order) return res.status(404).json({ success: false, message: 'Pembayaran tidak ditemukan' });
            res.json({ success: true, order });
        } catch (error) {
            fail(res, error, 'Gagal memuat pembayaran');
        }
    });

    return router;
}

module.exports = { createPatientCheckupPrepayRouter, ORDER_REF_PATTERN };

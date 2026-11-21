'use strict';

/**
 * Patient prepayment of the estimated cost of one Klinik Privat visit (Duitku QRIS + VA).
 *
 * GET  /api/patient/checkup-prepay/status            availability, estimates, saldo, latest orders
 * GET  /api/patient/checkup-prepay/suggestion        ?date=&category= packages + the one fitting the gestational age
 * POST /api/patient/checkup-prepay/checkout          { category, payment_method } -> QRIS string or VA number
 * GET  /api/patient/checkup-prepay/orders/:orderRef  one of the patient's own prepay orders (polled)
 * GET  /api/patient/checkup-prepay/saldo             live/sandbox saldo, withdrawable amount, history, requests
 * POST /api/patient/checkup-prepay/refund-requests   { amount_idr, bank_name, account_number, account_holder, request_key }
 * POST /api/patient/checkup-prepay/refund-requests/:id/cancel   only while pending
 *
 * The amount is priced on the server; anything the browser sends besides category and method is
 * ignored. Payment is confirmed only by Duitku's signed callback or by reconciliation.
 * Every route reads the session patient (req.patient.id), never a patient id from the request.
 */

const express = require('express');
const defaultLogger = require('../utils/logger');
const { verifyPatientToken: defaultVerifyPatientToken } = require('../middleware/auth');
const { PremiumError } = require('../services/PremiumPaymentService');
const { CONSULTATION_CATEGORY_CODES } = require('../constants/consultationCategories');
const { toPublicEstimate } = require('../services/CheckupEstimateService');
const { trackerEndState, hphtFromReference } = require('../services/PregnancyEnd');
const { isValidDateString, gestationalWeeksOn, choosePackage } = require('../services/GestationalAge');
const { referenceFromPregnancy, findOngoingPregnancy } = require('../services/PregnancyTrackerDates');

const ORDER_REF_PATTERN = /^DPK-[0-9a-f-]{36}$/i;
const REQUEST_ID_PATTERN = /^[1-9]\d{0,15}$/;

function noStore(req, res, next) {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    next();
}

function createPatientCheckupPrepayRouter({
    service,
    db,
    estimates,
    refundRequests,
    endState = trackerEndState,
    verifyPatientToken = defaultVerifyPatientToken,
    logger = defaultLogger
} = {}) {
    const router = express.Router();
    const prepay = () => service || require('../services/CheckupPrepayService').getCheckupPrepayService();
    const estimateService = () => estimates || require('../services/CheckupEstimateService').getCheckupEstimateService();
    const refundService = () => refundRequests || require('../services/PatientRefundRequestService').getPatientRefundRequestService();
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

    router.get('/suggestion', verifyPatientToken, noStore, async (req, res) => {
        try {
            const date = typeof req.query.date === 'string' ? req.query.date : '';
            const category = typeof req.query.category === 'string' ? req.query.category : '';
            if (!isValidDateString(date)) {
                return res.status(400).json({ success: false, message: 'Tanggal tidak valid' });
            }
            if (!CONSULTATION_CATEGORY_CODES.includes(category)) {
                return res.status(400).json({ success: false, message: 'Kategori tidak valid' });
            }

            const { packages: all } = await estimateService().priceAll();
            const packages = (all || [])
                .filter(p => p.category === category && p.ready)
                .sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0) || (Number(a.id) || 0) - (Number(b.id) || 0));

            let age = null;
            let source = null;
            let suggestedCode = null;
            if (category === 'obstetri') {
                // Dated from the ongoing pregnancy (obstetri anamnesa), not the newest USG: a wrongly
                // filled trimester tab there would suggest a 39-week package to a 19-week patient.
                const reference = referenceFromPregnancy(await findOngoingPregnancy(database(), req.patient.id));
                const ended = reference ? await endState(database(), req.patient.id, hphtFromReference(reference), logger) : null;
                age = reference && !ended ? gestationalWeeksOn(reference, date) : null;
                if (age) {
                    source = reference.kind;
                    suggestedCode = choosePackage(packages, age.weeks);
                }
            }

            res.json({
                success: true,
                weeks: age ? age.weeks : null,
                days: age ? age.days : null,
                source,
                suggested_code: suggestedCode,
                packages: packages.map(toPublicEstimate)
            });
        } catch (error) {
            fail(res, error, 'Gagal memuat saran paket');
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

    router.get('/saldo', verifyPatientToken, noStore, async (req, res) => {
        try {
            const saldo = await refundService().getSaldo(req.patient.id);
            res.json({ success: true, ...saldo });
        } catch (error) {
            fail(res, error, 'Gagal memuat saldo');
        }
    });

    router.post('/refund-requests', verifyPatientToken, noStore, async (req, res) => {
        try {
            const body = req.body || {};
            // The name for the staff toast comes from the patient record, never from the request.
            const [rows] = await database().query('SELECT full_name FROM patients WHERE id = ? LIMIT 1', [req.patient.id]);
            const profile = (rows && rows[0]) || {};
            const data = await refundService().createRequest({
                patient: { id: req.patient.id, name: profile.full_name || '' },
                amountIdr: Number(body.amount_idr),
                bankName: body.bank_name,
                accountNumber: body.account_number,
                accountHolder: body.account_holder,
                requestKey: body.request_key
            });
            res.status(201).json({ success: true, data });
        } catch (error) {
            fail(res, error, 'Gagal mengajukan pencairan');
        }
    });

    router.post('/refund-requests/:id/cancel', verifyPatientToken, noStore, async (req, res) => {
        try {
            if (!REQUEST_ID_PATTERN.test(req.params.id)) {
                return res.status(404).json({ success: false, message: 'Pengajuan pencairan tidak ditemukan' });
            }
            const data = await refundService().cancelRequest({ patientId: req.patient.id, id: Number(req.params.id) });
            res.json({ success: true, data });
        } catch (error) {
            fail(res, error, 'Gagal membatalkan pengajuan');
        }
    });

    return router;
}

module.exports = { createPatientCheckupPrepayRouter, ORDER_REF_PATTERN };

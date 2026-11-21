'use strict';

/**
 * Staff page "Pembayaran di Muka" (bayar di muka, Tahap 2).
 * Read: billing.view. Saldo refund: billing.reset (same as billing returns).
 * Package editor (tab Paket): doctor/superadmin only. requireSuperadmin here; the access registry
 * maps these routes to the protected, non-delegable checkup_prepay.manage_estimate, so it admits
 * nobody a delegation could add.
 * Withdrawal requests (Tahap 3, tab "Pencairan"): list billing.view, start/complete/reject billing.reset.
 * The full account number is listed only for billing.reset holders (and the doctor); others get
 * it masked.
 * Paths avoid "payment"/"paid": the access registry treats those words as payment actions.
 */

const express = require('express');
const { verifyToken, requirePermission, requireSuperadmin } = require('../middleware/auth');
const { ROLE_NAMES, isSuperadminRole } = require('../constants/roles');
const { accessControlService } = require('../services/AccessControlService');
const service = require('../services/StaffPrepayService');
const logger = require('../utils/logger');

const router = express.Router();
const refundRequests = () => require('../services/PatientRefundRequestService').getPatientRefundRequestService();
const REQUEST_ID = /^[1-9]\d{0,15}$/;

const ORDER_STATUSES = ['paid', 'pending', 'expired', 'cancelled', 'failed', 'all'];
const MODES = ['live', 'sandbox', 'all'];
const BALANCE_MODES = ['live', 'sandbox'];
const PATIENT_ID = /^[A-Za-z0-9_-]{1,50}$/;

function noStore(res) {
    res.set('Cache-Control', 'no-store');
}

function respondError(res, error) {
    if (error && error.statusCode) {
        return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    logger.error('Staff prepay route error', { message: error?.message });
    return res.status(500).json({ success: false, message: 'Gagal memproses data pembayaran di muka' });
}

// YYYY-MM-DD that is a real calendar date (no toISOString: local-date strings only).
function parseDateParam(value) {
    if (value === undefined || value === null || value === '') return { ok: true, value: null };
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value));
    if (!match) return { ok: false };
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    const valid = date.getFullYear() === Number(match[1]) && date.getMonth() === Number(match[2]) - 1 && date.getDate() === Number(match[3]);
    return valid ? { ok: true, value: String(value) } : { ok: false };
}

const actorOf = req => ({
    id: req.user?.new_id || req.user?.id || null,
    name: req.user?.name || req.user?.display_name || null
});

// Does the caller hold `permission`? Same decision as requirePermission (middleware/auth.js):
// dokter/superadmin always; otherwise the account's effective grants.
async function callerHolds(req, permission) {
    const user = req.user || {};
    if (user.is_superadmin || user.role === ROLE_NAMES.DOKTER || isSuperadminRole(user.role_id)) return true;
    const access = req.accountAccess || await accessControlService.getEffectiveAccess(user.id);
    return Boolean(access && access.isActive) && accessControlService.hasAnyPermission(access, [permission]);
}

router.get('/orders', verifyToken, requirePermission('billing.view'), async (req, res) => {
    noStore(res);
    const status = req.query.status || 'paid';
    const mode = req.query.mode || 'live';
    const from = parseDateParam(req.query.from);
    const to = parseDateParam(req.query.to);
    if (!ORDER_STATUSES.includes(status) || !MODES.includes(mode) || !from.ok || !to.ok) {
        return res.status(400).json({ success: false, message: 'Filter tidak valid.' });
    }
    try {
        const data = await service.listOrders({ status, mode, from: from.value, to: to.value });
        res.json({ success: true, data });
    } catch (error) {
        respondError(res, error);
    }
});

router.get('/balances', verifyToken, requirePermission('billing.view'), async (req, res) => {
    noStore(res);
    const mode = req.query.mode || 'live';
    if (!BALANCE_MODES.includes(mode)) return res.status(400).json({ success: false, message: 'Filter tidak valid.' });
    try {
        res.json({ success: true, data: await service.listBalances({ mode }) });
    } catch (error) {
        respondError(res, error);
    }
});

router.get('/patients/:patientId/ledger', verifyToken, requirePermission('billing.view'), async (req, res) => {
    noStore(res);
    if (!PATIENT_ID.test(String(req.params.patientId || ''))) {
        return res.status(400).json({ success: false, message: 'Pasien tidak valid.' });
    }
    try {
        res.json({ success: true, data: await service.getPatientLedger(req.params.patientId) });
    } catch (error) {
        respondError(res, error);
    }
});

router.post('/refunds', verifyToken, requirePermission('billing.reset'), async (req, res) => {
    noStore(res);
    const body = req.body || {};
    try {
        const data = await service.createRefund({
            patientId: body.patient_id,
            amountIdr: Number(body.amount_idr),
            method: body.method,
            reason: body.reason,
            requestKey: body.request_key,
            actor: actorOf(req)
        });
        res.json({ success: true, data, message: data.already_saved ? 'Refund ini sudah tercatat.' : 'Refund saldo berhasil dicatat.' });
    } catch (error) {
        respondError(res, error);
    }
});

router.get('/refund-requests', verifyToken, requirePermission('billing.view'), async (req, res) => {
    noStore(res);
    try {
        const canSeeAccount = await callerHolds(req, 'billing.reset');
        res.json({ success: true, data: await refundRequests().listForStaff({ canSeeAccount }) });
    } catch (error) {
        respondError(res, error);
    }
});

// "Mulai transfer": from now on the patient cannot cancel this request.
router.post('/refund-requests/:id/start', verifyToken, requirePermission('billing.reset'), async (req, res) => {
    noStore(res);
    if (!REQUEST_ID.test(String(req.params.id || ''))) {
        return res.status(404).json({ success: false, message: 'Pengajuan pencairan tidak ditemukan.' });
    }
    try {
        const data = await refundRequests().startRequest({ id: Number(req.params.id), actor: actorOf(req) });
        res.json({ success: true, data, message: 'Pengajuan ditandai sedang ditransfer. Pasien tidak dapat membatalkannya lagi.' });
    } catch (error) {
        respondError(res, error);
    }
});

router.post('/refund-requests/:id/complete', verifyToken, requirePermission('billing.reset'), async (req, res) => {
    noStore(res);
    if (!REQUEST_ID.test(String(req.params.id || ''))) {
        return res.status(404).json({ success: false, message: 'Pengajuan pencairan tidak ditemukan.' });
    }
    try {
        const data = await refundRequests().completeRequest({ id: Number(req.params.id), actor: actorOf(req) });
        res.json({ success: true, data, message: 'Pencairan tercatat sudah ditransfer.' });
    } catch (error) {
        respondError(res, error);
    }
});

router.post('/refund-requests/:id/reject', verifyToken, requirePermission('billing.reset'), async (req, res) => {
    noStore(res);
    if (!REQUEST_ID.test(String(req.params.id || ''))) {
        return res.status(404).json({ success: false, message: 'Pengajuan pencairan tidak ditemukan.' });
    }
    try {
        const data = await refundRequests().rejectRequest({ id: Number(req.params.id), note: req.body?.note, actor: actorOf(req) });
        res.json({ success: true, data, message: 'Pengajuan pencairan ditolak.' });
    } catch (error) {
        respondError(res, error);
    }
});

const PACKAGE_ID = /^[1-9]\d{0,9}$/;

router.get('/packages', verifyToken, requireSuperadmin, async (req, res) => {
    noStore(res);
    try {
        res.json({ success: true, data: await service.listPackagesForStaff() });
    } catch (error) {
        respondError(res, error);
    }
});

router.get('/packages/catalog', verifyToken, requireSuperadmin, async (req, res) => {
    noStore(res);
    try {
        res.json({ success: true, data: await service.getCatalog() });
    } catch (error) {
        respondError(res, error);
    }
});

router.post('/packages', verifyToken, requireSuperadmin, async (req, res) => {
    noStore(res);
    try {
        // A client-sent id would turn a create into an update of another package.
        const { id: _ignored, ...body } = req.body || {};
        const data = await service.savePackage(body, actorOf(req));
        res.json({ success: true, data, message: 'Paket tersimpan.' });
    } catch (error) {
        respondError(res, error);
    }
});

router.put('/packages/:id', verifyToken, requireSuperadmin, async (req, res) => {
    noStore(res);
    if (!PACKAGE_ID.test(String(req.params.id || ''))) {
        return res.status(404).json({ success: false, message: 'Paket tidak ditemukan.' });
    }
    try {
        const data = await service.savePackage({ ...(req.body || {}), id: Number(req.params.id) }, actorOf(req));
        res.json({ success: true, data, message: 'Paket tersimpan.' });
    } catch (error) {
        respondError(res, error);
    }
});

router.patch('/packages/:id/active', verifyToken, requireSuperadmin, async (req, res) => {
    noStore(res);
    if (!PACKAGE_ID.test(String(req.params.id || ''))) {
        return res.status(404).json({ success: false, message: 'Paket tidak ditemukan.' });
    }
    try {
        const data = await service.setPackageActive(Number(req.params.id), req.body?.active, actorOf(req));
        res.json({ success: true, data, message: data && data.is_active ? 'Paket diaktifkan.' : 'Paket dinonaktifkan.' });
    } catch (error) {
        respondError(res, error);
    }
});

module.exports = router;

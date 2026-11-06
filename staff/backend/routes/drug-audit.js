const express = require('express');
const { verifyToken, requireDoctorRole } = require('../middleware/auth');
const { getReconciliation } = require('../services/DrugAuditReconciliationService');
const {
    listAdjustmentRequests,
    approveAdjustmentRequest,
    rejectAdjustmentRequest,
    toRequestView,
    actorFromRequest
} = require('../services/StockAdjustmentRequestService');
const logger = require('../utils/logger');

const router = express.Router();

function respondError(res, error) {
    if (error && error.statusCode) {
        return res.status(error.statusCode).json({
            success: false,
            code: error.code || null,
            message: error.message
        });
    }
    logger.error('Drug audit route error', { message: error?.message });
    return res.status(500).json({ success: false, message: 'Gagal memproses audit obat' });
}

function parseRequestId(value) {
    return /^[1-9]\d*$/.test(String(value)) ? Number(value) : null;
}

router.get('/reconciliation', verifyToken, requireDoctorRole, async (req, res) => {
    try {
        const data = await getReconciliation({ onlyMismatch: req.query.only_mismatch === '1' });
        res.json({ success: true, data });
    } catch (error) {
        respondError(res, error);
    }
});

router.get('/adjustment-requests', verifyToken, requireDoctorRole, async (req, res) => {
    try {
        const parsedLimit = Number.parseInt(req.query.limit, 10);
        const limit = Math.min(200, Math.max(1, Number.isNaN(parsedLimit) ? 50 : parsedLimit));
        const parsedOffset = Number.parseInt(req.query.offset, 10);
        const offset = Math.max(0, Number.isNaN(parsedOffset) ? 0 : parsedOffset);
        const status = req.query.status || 'pending';
        const { rows, total } = await listAdjustmentRequests({ status, limit, offset });
        res.json({
            success: true,
            data: rows.map(toRequestView),
            pagination: { total, limit, offset }
        });
    } catch (error) {
        respondError(res, error);
    }
});

router.post('/adjustment-requests/:id/approve', verifyToken, requireDoctorRole, async (req, res) => {
    const id = parseRequestId(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: 'Pengajuan tidak valid' });
    try {
        const data = await approveAdjustmentRequest(id, actorFromRequest(req), req.body?.decision_note);
        res.json({ success: true, data });
    } catch (error) {
        respondError(res, error);
    }
});

router.post('/adjustment-requests/:id/reject', verifyToken, requireDoctorRole, async (req, res) => {
    const id = parseRequestId(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: 'Pengajuan tidak valid' });
    try {
        const data = await rejectAdjustmentRequest(id, actorFromRequest(req), req.body?.decision_note);
        res.json({ success: true, data });
    } catch (error) {
        respondError(res, error);
    }
});

module.exports = router;

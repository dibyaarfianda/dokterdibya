'use strict';

const express = require('express');
const { verifyToken, verifyPatientToken, requireSuperadmin } = require('../../middleware/auth');
const db = require('../../db');
const handlers = require('../../services/sunday-clinic/billing');
const { normalizeMrId, realtimeSync } = require('../../services/sunday-clinic/shared');
const {
    acquireSundayClinicAccountingDateGuard
} = require('../../services/SundayClinicClosingService');
const billingPaymentRoutes = require('../billing-payment');

const router = express.Router();

function broadcastSuccessfulBillingMutation(req, res, next) {
    const normalizedMrId = normalizeMrId(req.params.mrId);
    res.once('finish', () => {
        if (!normalizedMrId || res.statusCode >= 400) return;
        realtimeSync.broadcast({
            type: 'billing_updated',
            mrId: normalizedMrId,
            action: `${req.method} ${req.route?.path || req.path}`,
            userId: req.user?.id || null,
            timestamp: new Date().toISOString()
        });
    });
    next();
}

async function requireOpenAccountingDate(req, res, next) {
    try {
        const guard = await acquireSundayClinicAccountingDateGuard(db, {
            mrId: normalizeMrId(req.params.mrId),
            additionalBillingId: req.params.additionalBillingId || null
        });
        bindAccountingGuardRelease(res, guard.release);
        next();
    } catch (error) {
        next(error);
    }
}

function bindAccountingGuardRelease(res, release) {
    let released = false;
    const releaseOnce = () => {
        if (released) return;
        released = true;
        Promise.resolve(release()).catch(() => {});
    };
    res.once('finish', releaseOnce);
    res.once('close', releaseOnce);
}

async function requireOpenAccountingDateForRevision(req, res, next) {
    try {
        const [[revision]] = await db.query(
            'SELECT mr_id FROM sunday_clinic_billing_revisions WHERE id = ?',
            [req.params.id]
        );
        if (revision?.mr_id) {
            const guard = await acquireSundayClinicAccountingDateGuard(db, { mrId: revision.mr_id });
            bindAccountingGuardRelease(res, guard.release);
        }
        next();
    } catch (error) {
        next(error);
    }
}

router.get('/billing/pending', verifyToken, handlers.getBillingPending);
router.get('/billing/:mrId', verifyToken, handlers.getBillingByMrId);
router.post('/billing/:mrId', verifyToken, requireOpenAccountingDate, broadcastSuccessfulBillingMutation, handlers.postBillingByMrId);
router.post('/billing/:mrId/obat', verifyToken, requireOpenAccountingDate, broadcastSuccessfulBillingMutation, handlers.postBillingByMrIdObat);
router.post('/billing/:mrId/confirm', verifyToken, requireOpenAccountingDate, broadcastSuccessfulBillingMutation, handlers.postBillingByMrIdConfirm);
router.post('/billing/:mrId/mark-paid', verifyToken, requireOpenAccountingDate, broadcastSuccessfulBillingMutation, handlers.postBillingByMrIdMarkPaid);
router.post('/billing/:mrId/request-revision', verifyToken, requireOpenAccountingDate, broadcastSuccessfulBillingMutation, handlers.postBillingByMrIdRequestRevision);
router.get('/billing/revisions/pending', verifyToken, handlers.getBillingRevisionsPending);
router.post('/billing/revisions/:id/approve', verifyToken, requireOpenAccountingDateForRevision, handlers.postBillingRevisionsByIdApprove);
router.post('/billing/:mrId/print-etiket', verifyToken, broadcastSuccessfulBillingMutation, handlers.postBillingByMrIdPrintEtiket);
router.post('/billing/:mrId/print-invoice', verifyToken, broadcastSuccessfulBillingMutation, handlers.postBillingByMrIdPrintInvoice);
router.get('/billing/:mrId/additional', verifyToken, handlers.getBillingByMrIdAdditional);
router.post('/billing/:mrId/additional', verifyToken, requireOpenAccountingDate, broadcastSuccessfulBillingMutation, handlers.postBillingByMrIdAdditional);
router.put('/billing/:mrId/additional/:additionalBillingId', verifyToken, requireOpenAccountingDate, broadcastSuccessfulBillingMutation, handlers.putBillingByMrIdAdditionalByAdditionalBillingId);
router.post('/billing/:mrId/additional/:additionalBillingId/confirm', verifyToken, requireOpenAccountingDate, broadcastSuccessfulBillingMutation, handlers.postBillingByMrIdAdditionalByAdditionalBillingIdConfirm);
router.post('/billing/:mrId/additional/:additionalBillingId/mark-paid', verifyToken, requireOpenAccountingDate, broadcastSuccessfulBillingMutation, handlers.postBillingByMrIdAdditionalByAdditionalBillingIdMarkPaid);
router.post('/billing/:mrId/additional/:additionalBillingId/print-invoice', verifyToken, broadcastSuccessfulBillingMutation, handlers.postBillingByMrIdAdditionalByAdditionalBillingIdPrintInvoice);
router.post('/billing/:mrId/additional/:additionalBillingId/print-etiket', verifyToken, broadcastSuccessfulBillingMutation, handlers.postBillingByMrIdAdditionalByAdditionalBillingIdPrintEtiket);
router.post('/billing/:mrId/print', verifyToken, broadcastSuccessfulBillingMutation, handlers.postBillingByMrIdPrint);
router.delete('/billing/:mrId/items/:itemType', verifyToken, requireOpenAccountingDate, broadcastSuccessfulBillingMutation, handlers.deleteBillingByMrIdItemsByItemType);
router.delete('/billing/:mrId/items/code/:code', verifyToken, requireOpenAccountingDate, broadcastSuccessfulBillingMutation, handlers.deleteBillingByMrIdItemsCodeByCode);
router.delete('/billing/:mrId/items/id/:itemId', verifyToken, requireOpenAccountingDate, broadcastSuccessfulBillingMutation, handlers.deleteBillingByMrIdItemsIdByItemId);
router.get('/billing/:mrId/audit', verifyToken, handlers.getBillingByMrIdAudit);
router.post('/billing/:mrId/request-change', verifyToken, requireOpenAccountingDate, broadcastSuccessfulBillingMutation, handlers.postBillingByMrIdRequestChange);
router.post('/billing/:mrId/approve-changes', verifyToken, requireOpenAccountingDate, broadcastSuccessfulBillingMutation, handlers.postBillingByMrIdApproveChanges);
router.get('/billing/:mrId/changes', verifyToken, handlers.getBillingByMrIdChanges);

// Xendit routes retain their original /billing mount and run after core billing routes.
router.use('/billing', billingPaymentRoutes);

module.exports = router;

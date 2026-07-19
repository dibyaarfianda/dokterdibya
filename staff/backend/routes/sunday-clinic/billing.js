'use strict';

const express = require('express');
const { verifyToken, verifyPatientToken, requireSuperadmin } = require('../../middleware/auth');
const handlers = require('../../services/sunday-clinic/billing');
const { normalizeMrId, realtimeSync } = require('../../services/sunday-clinic/shared');
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

router.get('/billing/pending', verifyToken, handlers.getBillingPending);
router.get('/billing/:mrId', verifyToken, handlers.getBillingByMrId);
router.post('/billing/:mrId', verifyToken, broadcastSuccessfulBillingMutation, handlers.postBillingByMrId);
router.post('/billing/:mrId/obat', verifyToken, broadcastSuccessfulBillingMutation, handlers.postBillingByMrIdObat);
router.post('/billing/:mrId/confirm', verifyToken, broadcastSuccessfulBillingMutation, handlers.postBillingByMrIdConfirm);
router.post('/billing/:mrId/mark-paid', verifyToken, broadcastSuccessfulBillingMutation, handlers.postBillingByMrIdMarkPaid);
router.post('/billing/:mrId/request-revision', verifyToken, broadcastSuccessfulBillingMutation, handlers.postBillingByMrIdRequestRevision);
router.get('/billing/revisions/pending', verifyToken, handlers.getBillingRevisionsPending);
router.post('/billing/revisions/:id/approve', verifyToken, handlers.postBillingRevisionsByIdApprove);
router.post('/billing/:mrId/print-etiket', verifyToken, broadcastSuccessfulBillingMutation, handlers.postBillingByMrIdPrintEtiket);
router.post('/billing/:mrId/print-invoice', verifyToken, broadcastSuccessfulBillingMutation, handlers.postBillingByMrIdPrintInvoice);
router.get('/billing/:mrId/additional', verifyToken, handlers.getBillingByMrIdAdditional);
router.post('/billing/:mrId/additional', verifyToken, broadcastSuccessfulBillingMutation, handlers.postBillingByMrIdAdditional);
router.put('/billing/:mrId/additional/:additionalBillingId', verifyToken, broadcastSuccessfulBillingMutation, handlers.putBillingByMrIdAdditionalByAdditionalBillingId);
router.post('/billing/:mrId/additional/:additionalBillingId/confirm', verifyToken, broadcastSuccessfulBillingMutation, handlers.postBillingByMrIdAdditionalByAdditionalBillingIdConfirm);
router.post('/billing/:mrId/additional/:additionalBillingId/mark-paid', verifyToken, broadcastSuccessfulBillingMutation, handlers.postBillingByMrIdAdditionalByAdditionalBillingIdMarkPaid);
router.post('/billing/:mrId/additional/:additionalBillingId/print-invoice', verifyToken, broadcastSuccessfulBillingMutation, handlers.postBillingByMrIdAdditionalByAdditionalBillingIdPrintInvoice);
router.post('/billing/:mrId/additional/:additionalBillingId/print-etiket', verifyToken, broadcastSuccessfulBillingMutation, handlers.postBillingByMrIdAdditionalByAdditionalBillingIdPrintEtiket);
router.post('/billing/:mrId/print', verifyToken, broadcastSuccessfulBillingMutation, handlers.postBillingByMrIdPrint);
router.delete('/billing/:mrId/items/:itemType', verifyToken, broadcastSuccessfulBillingMutation, handlers.deleteBillingByMrIdItemsByItemType);
router.delete('/billing/:mrId/items/code/:code', verifyToken, broadcastSuccessfulBillingMutation, handlers.deleteBillingByMrIdItemsCodeByCode);
router.delete('/billing/:mrId/items/id/:itemId', verifyToken, broadcastSuccessfulBillingMutation, handlers.deleteBillingByMrIdItemsIdByItemId);
router.get('/billing/:mrId/audit', verifyToken, handlers.getBillingByMrIdAudit);
router.post('/billing/:mrId/request-change', verifyToken, broadcastSuccessfulBillingMutation, handlers.postBillingByMrIdRequestChange);
router.post('/billing/:mrId/approve-changes', verifyToken, broadcastSuccessfulBillingMutation, handlers.postBillingByMrIdApproveChanges);
router.get('/billing/:mrId/changes', verifyToken, handlers.getBillingByMrIdChanges);

// Xendit routes retain their original /billing mount and run after core billing routes.
router.use('/billing', billingPaymentRoutes);

module.exports = router;

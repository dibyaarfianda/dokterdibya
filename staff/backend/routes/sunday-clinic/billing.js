'use strict';

const express = require('express');
const { verifyToken, verifyPatientToken, requireSuperadmin } = require('../../middleware/auth');
const handlers = require('../../services/sunday-clinic/billing');
const billingPaymentRoutes = require('../billing-payment');

const router = express.Router();

router.get('/billing/pending', verifyToken, handlers.getBillingPending);
router.get('/billing/:mrId', verifyToken, handlers.getBillingByMrId);
router.post('/billing/:mrId', verifyToken, handlers.postBillingByMrId);
router.post('/billing/:mrId/obat', verifyToken, handlers.postBillingByMrIdObat);
router.post('/billing/:mrId/confirm', verifyToken, handlers.postBillingByMrIdConfirm);
router.post('/billing/:mrId/mark-paid', verifyToken, handlers.postBillingByMrIdMarkPaid);
router.post('/billing/:mrId/request-revision', verifyToken, handlers.postBillingByMrIdRequestRevision);
router.get('/billing/revisions/pending', verifyToken, handlers.getBillingRevisionsPending);
router.post('/billing/revisions/:id/approve', verifyToken, handlers.postBillingRevisionsByIdApprove);
router.post('/billing/:mrId/print-etiket', verifyToken, handlers.postBillingByMrIdPrintEtiket);
router.post('/billing/:mrId/print-invoice', verifyToken, handlers.postBillingByMrIdPrintInvoice);
router.get('/billing/:mrId/additional', verifyToken, handlers.getBillingByMrIdAdditional);
router.post('/billing/:mrId/additional', verifyToken, handlers.postBillingByMrIdAdditional);
router.put('/billing/:mrId/additional/:additionalBillingId', verifyToken, handlers.putBillingByMrIdAdditionalByAdditionalBillingId);
router.post('/billing/:mrId/additional/:additionalBillingId/confirm', verifyToken, handlers.postBillingByMrIdAdditionalByAdditionalBillingIdConfirm);
router.post('/billing/:mrId/additional/:additionalBillingId/mark-paid', verifyToken, handlers.postBillingByMrIdAdditionalByAdditionalBillingIdMarkPaid);
router.post('/billing/:mrId/additional/:additionalBillingId/print-invoice', verifyToken, handlers.postBillingByMrIdAdditionalByAdditionalBillingIdPrintInvoice);
router.post('/billing/:mrId/additional/:additionalBillingId/print-etiket', verifyToken, handlers.postBillingByMrIdAdditionalByAdditionalBillingIdPrintEtiket);
router.post('/billing/:mrId/print', verifyToken, handlers.postBillingByMrIdPrint);
router.delete('/billing/:mrId/items/:itemType', verifyToken, handlers.deleteBillingByMrIdItemsByItemType);
router.delete('/billing/:mrId/items/code/:code', verifyToken, handlers.deleteBillingByMrIdItemsCodeByCode);
router.delete('/billing/:mrId/items/id/:itemId', verifyToken, handlers.deleteBillingByMrIdItemsIdByItemId);
router.get('/billing/:mrId/audit', verifyToken, handlers.getBillingByMrIdAudit);
router.post('/billing/:mrId/request-change', verifyToken, handlers.postBillingByMrIdRequestChange);
router.post('/billing/:mrId/approve-changes', verifyToken, handlers.postBillingByMrIdApproveChanges);
router.get('/billing/:mrId/changes', verifyToken, handlers.getBillingByMrIdChanges);

// Xendit routes retain their original /billing mount and run after core billing routes.
router.use('/billing', billingPaymentRoutes);

module.exports = router;

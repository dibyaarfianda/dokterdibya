'use strict';

const express = require('express');
const { verifyToken, requireDoctorRoleOrAccountPermission } = require('../../middleware/auth');
const { asyncHandler } = require('../../middleware/errorHandler');
const { sundayClinicClosingSchemaGuard } = require('../../services/SundayClinicClosingSchemaValidator');
const handlers = require('../../services/sunday-clinic/closing');

const router = express.Router();

function noStore(req, res, next) {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    next();
}

const closingView = [noStore, verifyToken, requireDoctorRoleOrAccountPermission('billing.view'), sundayClinicClosingSchemaGuard];
const closingFinalize = [noStore, verifyToken, requireDoctorRoleOrAccountPermission('billing.finalize'), sundayClinicClosingSchemaGuard];

router.get('/closing/preview', ...closingView, asyncHandler(handlers.getClosingPreview));
router.post('/closing', ...closingFinalize, asyncHandler(handlers.postClosing));
router.get('/closings', ...closingView, asyncHandler(handlers.getClosings));
router.get('/closings/:id', ...closingView, asyncHandler(handlers.getClosingById));

module.exports = router;

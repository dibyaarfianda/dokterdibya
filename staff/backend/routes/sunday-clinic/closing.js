'use strict';

const express = require('express');
const { verifyToken, requireDoctorRole } = require('../../middleware/auth');
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

const closingOnly = [noStore, verifyToken, requireDoctorRole, sundayClinicClosingSchemaGuard];

router.get('/closing/preview', ...closingOnly, asyncHandler(handlers.getClosingPreview));
router.post('/closing', ...closingOnly, asyncHandler(handlers.postClosing));
router.get('/closings', ...closingOnly, asyncHandler(handlers.getClosings));
router.get('/closings/:id', ...closingOnly, asyncHandler(handlers.getClosingById));

module.exports = router;

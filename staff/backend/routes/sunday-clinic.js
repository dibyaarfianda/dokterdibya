'use strict';

const express = require('express');
const logger = require('../utils/logger');
const { setupSocketHandlers } = require('../services/sunday-clinic/queue');
const { validateSundayClinicSchema, sundayClinicSchemaGuard } = require('../services/SundayClinicSchemaValidator');
const { validateSundayClinicClosingSchema } = require('../services/SundayClinicClosingSchemaValidator');

const router = express.Router();

// Validate immediately at startup; the guard turns a missing migration into an explicit 503.
validateSundayClinicSchema().catch((error) => {
    logger.error('Sunday Clinic schema validation failed', {
        code: error.code,
        error: error.message
    });
});
validateSundayClinicClosingSchema().catch((error) => {
    logger.error('Sunday Clinic closing schema validation failed', {
        code: error.code,
        error: error.message
    });
});

router.use(sundayClinicSchemaGuard);
router.use(require('./sunday-clinic/closing'));
router.use(require('./sunday-clinic/queue'));
router.use(require('./sunday-clinic/records'));
router.use(require('./sunday-clinic/billing'));
router.use(require('./sunday-clinic/prescription'));
router.use(require('./sunday-clinic/resume-export'));
router.use(require('./sunday-clinic/visit-walk-in'));

module.exports = router;
module.exports.setupSocketHandlers = setupSocketHandlers;

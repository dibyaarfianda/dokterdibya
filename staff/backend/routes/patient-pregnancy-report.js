'use strict';

/**
 * A patient whose pregnancy is past its HPL tells the portal how it ended.
 *
 * GET  /api/patient/pregnancy-report/status   { ask, hpht }
 * POST /api/patient/pregnancy-report          { answer, ended_on, place, delivery, babies }
 *
 * The patient id comes only from the session (req.patient.id). Responses never name the
 * outcome of a loss.
 */

const express = require('express');
const defaultLogger = require('../utils/logger');
const { verifyPatientToken: defaultVerifyPatientToken } = require('../middleware/auth');
const { PatientReportError } = require('../services/PatientPregnancyReportRules');

function noStore(req, res, next) {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    next();
}

function createPatientPregnancyReportRouter({
    service,
    verifyPatientToken = defaultVerifyPatientToken,
    logger = defaultLogger
} = {}) {
    const router = express.Router();
    let lazyService = null;
    const reports = () => {
        if (service) return service;
        if (!lazyService) {
            const { createPatientPregnancyReportService } = require('../services/PatientPregnancyReportService');
            lazyService = createPatientPregnancyReportService({ db: require('../db') });
        }
        return lazyService;
    };

    function fail(res, error) {
        if (error instanceof PatientReportError) {
            return res.status(error.status).json({ success: false, message: error.message });
        }
        logger.error('[PatientPregnancyReport] Unexpected error', { message: error.message });
        return res.status(500).json({ success: false, message: 'Gagal memproses data' });
    }

    router.get('/status', verifyPatientToken, noStore, async (req, res) => {
        try {
            const { ask, hpht } = await reports().status(req.patient.id);
            res.json({ success: true, ask, hpht });
        } catch (error) {
            fail(res, error);
        }
    });

    router.post('/', verifyPatientToken, noStore, async (req, res) => {
        try {
            const body = { ...(req.body && typeof req.body === 'object' ? req.body : {}) };
            delete body.patient_id;
            await reports().submit(req.patient.id, body);
            res.json({ success: true, message: 'Terima kasih, data sudah tersimpan.' });
        } catch (error) {
            fail(res, error);
        }
    });

    return router;
}

module.exports = { createPatientPregnancyReportRouter };

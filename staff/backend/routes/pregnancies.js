'use strict';

/**
 * Pregnancy episodes (staff only; patients never see this data).
 *
 * GET    /api/pregnancies/needs-review                    flagged pregnancies (medical_records.view)
 * GET    /api/pregnancies/patient/:patientId              { pregnancies, totals, riwayat_persalinan } (medical_records.view)
 * POST   /api/pregnancies/patient/:patientId/resolve      { mr_id } visit-page resolve (anamnesa.edit)
 * POST   /api/pregnancies/patient/:patientId/start        { mr_id, previous_end } close previous + start new (anamnesa.edit)
 * POST   /api/pregnancies/patient/:patientId/external     add pregnancy history from outside the clinic (anamnesa.edit)
 * PUT    /api/pregnancies/:pregnancyId                    { patient_id, ...fields } edit history (anamnesa.edit)
 * DELETE /api/pregnancies/:pregnancyId?patient_id=        remove an external entry (anamnesa.edit)
 *
 * Closing a pregnancy (start with previous_end, or any end field on PUT / external) is for dokter and
 * bidan only: the routes call service.assertCanClose(req.user) before touching data.
 */

const express = require('express');
const defaultLogger = require('../utils/logger');
const { verifyStaffToken: defaultVerifyStaffToken } = require('../middleware/auth');
const { PregnancyEpisodeError } = require('../services/PregnancyEpisodeService');
const { computeObstetricTotals, computeDiagnosisCounts, toRiwayatPersalinanList } = require('../services/PregnancyEpisodeRules');

const PATIENT_ID = /^[A-Za-z0-9_-]{1,50}$/;
const NUMERIC_ID = /^[1-9]\d{0,15}$/;
const END_FIELDS = [
    'outcome', 'ended_on', 'delivery_method', 'delivery_indication',
    'complications', 'complication_notes', 'babies', 'kuretase', 'ga_weeks_at_end', 'term'
];

function noStore(req, res, next) {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    next();
}

function hasEndFields(body) {
    return !!body && typeof body === 'object' && END_FIELDS.some(key => body[key] !== undefined);
}

function createPregnanciesRouter({
    service,
    verifyStaffToken = defaultVerifyStaffToken,
    logger = defaultLogger
} = {}) {
    const router = express.Router();
    let defaultService = null;
    const episodes = () => {
        if (service) return service;
        if (!defaultService) {
            const { createPregnancyEpisodeService } = require('../services/PregnancyEpisodeService');
            defaultService = createPregnancyEpisodeService({ db: require('../db') });
        }
        return defaultService;
    };

    function fail(res, error) {
        if (error instanceof PregnancyEpisodeError) {
            return res.status(error.status).json({ success: false, message: error.message });
        }
        logger.error('[Pregnancies] Unexpected error', { message: error && error.message });
        return res.status(500).json({ success: false, message: 'Gagal memproses data kehamilan' });
    }

    const bad = (res, message) => res.status(400).json({ success: false, message });
    const patientIdOf = value => (typeof value === 'string' && PATIENT_ID.test(value) ? value : null);
    const mrIdOf = value => (typeof value === 'string' && value.trim() && value.length <= 64 ? value.trim() : null);

    // Declared before the :patientId routes; the paths differ anyway, but keep it explicit.
    router.get('/needs-review', verifyStaffToken, noStore, async (req, res) => {
        try {
            res.json({ success: true, data: await episodes().listNeedsReview() });
        } catch (error) {
            fail(res, error);
        }
    });

    router.get('/patient/:patientId', verifyStaffToken, noStore, async (req, res) => {
        try {
            const patientId = patientIdOf(req.params.patientId);
            if (!patientId) return bad(res, 'ID pasien tidak valid');
            const pregnancies = await episodes().list(patientId);
            res.json({
                success: true,
                data: {
                    pregnancies,
                    totals: Object.assign(
                        computeObstetricTotals(pregnancies, { includeOngoing: true }),
                        computeDiagnosisCounts(pregnancies)
                    ),
                    riwayat_persalinan: toRiwayatPersalinanList(pregnancies)
                }
            });
        } catch (error) {
            fail(res, error);
        }
    });

    router.post('/patient/:patientId/resolve', verifyStaffToken, noStore, async (req, res) => {
        try {
            const patientId = patientIdOf(req.params.patientId);
            const mrId = mrIdOf(req.body && req.body.mr_id);
            if (!patientId) return bad(res, 'ID pasien tidak valid');
            if (!mrId) return bad(res, 'mr_id wajib diisi');
            const data = await episodes().resolveFromVisit(patientId, mrId, req.user);
            res.json({ success: true, data });
        } catch (error) {
            fail(res, error);
        }
    });

    router.post('/patient/:patientId/start', verifyStaffToken, noStore, async (req, res) => {
        try {
            const patientId = patientIdOf(req.params.patientId);
            const mrId = mrIdOf(req.body && req.body.mr_id);
            if (!patientId) return bad(res, 'ID pasien tidak valid');
            if (!mrId) return bad(res, 'mr_id wajib diisi');
            const svc = episodes();
            svc.assertCanClose(req.user);
            const { warning, ...data } = await svc.startWithPreviousEnd(patientId, mrId, req.body.previous_end, req.user);
            const body = { success: true, data };
            if (warning) body.warning = warning;
            res.json(body);
        } catch (error) {
            fail(res, error);
        }
    });

    router.post('/patient/:patientId/external', verifyStaffToken, noStore, async (req, res) => {
        try {
            const patientId = patientIdOf(req.params.patientId);
            if (!patientId) return bad(res, 'ID pasien tidak valid');
            const svc = episodes();
            if (hasEndFields(req.body)) svc.assertCanClose(req.user);
            const { warning, ...data } = await svc.addExternal(patientId, req.body || {}, req.user);
            const body = { success: true, data };
            if (warning) body.warning = warning;
            res.status(201).json(body);
        } catch (error) {
            fail(res, error);
        }
    });

    router.put('/:pregnancyId', verifyStaffToken, noStore, async (req, res) => {
        try {
            if (!NUMERIC_ID.test(req.params.pregnancyId)) return bad(res, 'ID kehamilan tidak valid');
            const { patient_id: rawPatientId, ...fields } = req.body || {};
            const patientId = patientIdOf(rawPatientId);
            if (!patientId) return bad(res, 'ID pasien tidak valid');
            const svc = episodes();
            if (hasEndFields(fields)) svc.assertCanClose(req.user);
            const { warning, ...data } = await svc.updateHistory(patientId, Number(req.params.pregnancyId), fields, req.user);
            const body = { success: true, data };
            if (warning) body.warning = warning;
            res.json(body);
        } catch (error) {
            fail(res, error);
        }
    });

    router.delete('/:pregnancyId', verifyStaffToken, noStore, async (req, res) => {
        try {
            if (!NUMERIC_ID.test(req.params.pregnancyId)) return bad(res, 'ID kehamilan tidak valid');
            const patientId = patientIdOf(req.query.patient_id);
            if (!patientId) return bad(res, 'ID pasien tidak valid');
            const data = await episodes().removeExternal(patientId, Number(req.params.pregnancyId), req.user);
            res.json({ success: true, data });
        } catch (error) {
            fail(res, error);
        }
    });

    return router;
}

module.exports = createPregnanciesRouter();
module.exports.createPregnanciesRouter = createPregnanciesRouter;

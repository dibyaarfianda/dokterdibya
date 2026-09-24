const express = require('express');
const router = express.Router();
const db = require('../db');
const logger = require('../utils/logger');
const apiKeyAuth = require('../middleware/apiKeyAuth');
const commOperationSync = require('../services/CommOperationSyncService');
const CommScheduleIntentService = require('../services/CommScheduleIntentService');
const commScheduleIntent = new CommScheduleIntentService();

// All routes require API key authentication
router.use(apiKeyAuth);
router.use(require('./clinic-monitor').createRouter());

/**
 * GET /patients/search?q=&limit=10
 * Search patients by name or phone number
 */
router.get('/patients/search', async (req, res) => {
    try {
        const { q, limit = 10 } = req.query;

        if (!q || q.trim().length < 2) {
            return res.status(400).json({
                success: false,
                message: 'Query parameter "q" must be at least 2 characters'
            });
        }

        const searchTerm = `%${q.trim()}%`;
        const maxLimit = Math.min(parseInt(limit) || 10, 50);

        const [patients] = await db.query(
            `SELECT
                p.id,
                p.full_name,
                p.phone,
                p.birth_date
             FROM patients p
             WHERE p.full_name LIKE ? OR p.phone LIKE ?
             ORDER BY p.full_name ASC
             LIMIT ?`,
            [searchTerm, searchTerm, maxLimit]
        );

        res.json({
            success: true,
            data: patients
        });

    } catch (error) {
        logger.error('COMM integration - search patients error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to search patients'
        });
    }
});

/**
 * GET /patients/:patientId/visits
 * Get patient visit history
 */
router.get('/patients/:patientId/visits', async (req, res) => {
    try {
        const { patientId } = req.params;

        const [visits] = await db.query(
            `SELECT
                scr.id as visit_id,
                scr.mr_id,
                scr.mr_category,
                scr.visit_location,
                scr.status,
                scr.created_at as visit_date,
                scr.finalized_at,
                p.full_name as patient_name
             FROM sunday_clinic_records scr
             JOIN patients p ON scr.patient_id = p.id
             WHERE scr.patient_id = ?
             ORDER BY scr.created_at DESC`,
            [patientId]
        );

        const locationConfig = {
            'klinik_private': { name: 'Klinik Privat dr. Dibya', short: 'Klinik Privat' },
            'rsia_melinda': { name: 'RSIA Melinda', short: 'RSIA Melinda' },
            'rsud_gambiran': { name: 'RSUD Gambiran', short: 'RSUD Gambiran' },
            'rs_bhayangkara': { name: 'RS Bhayangkara', short: 'RS Bhayangkara' }
        };

        const enrichedVisits = visits.map(visit => {
            const loc = locationConfig[visit.visit_location] || locationConfig['klinik_private'];
            return {
                ...visit,
                location_name: loc.name,
                location_short: loc.short
            };
        });

        res.json({
            success: true,
            data: enrichedVisits
        });

    } catch (error) {
        logger.error('COMM integration - patient visits error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch patient visits'
        });
    }
});

/**
 * GET /resume/:mrId
 * Get resume medis JSON for a specific visit (by MR ID)
 */
router.get('/resume/:mrId', async (req, res) => {
    try {
        const { mrId } = req.params;
        const normalizedMrId = mrId.trim().toUpperCase();

        // Get resume medis
        const [resumeRecords] = await db.query(
            `SELECT record_data, created_at FROM medical_records
             WHERE mr_id = ? AND record_type = 'resume_medis'
             ORDER BY created_at DESC LIMIT 1`,
            [normalizedMrId]
        );

        // Also get complete record if resume not available
        const [completeRecords] = await db.query(
            `SELECT record_type, record_data, created_at FROM medical_records
             WHERE mr_id = ? AND record_type IN ('complete', 'anamnesa', 'diagnosis', 'planning')
             ORDER BY created_at DESC`,
            [normalizedMrId]
        );

        // Get patient info from sunday_clinic_records
        const [visitInfo] = await db.query(
            `SELECT scr.patient_id, scr.visit_location, scr.created_at as visit_date,
                    p.full_name, p.birth_date, p.phone
             FROM sunday_clinic_records scr
             JOIN patients p ON scr.patient_id = p.id
             WHERE scr.mr_id = ?
             LIMIT 1`,
            [normalizedMrId]
        );

        let resumeData = null;

        if (resumeRecords.length > 0) {
            const rd = typeof resumeRecords[0].record_data === 'string'
                ? JSON.parse(resumeRecords[0].record_data)
                : resumeRecords[0].record_data;
            resumeData = {
                type: 'resume_medis',
                resume: rd.resume || rd.resumeMedis || null,
                diagnosis: rd.diagnosis || null,
                planning: rd.planning || null,
                raw: rd,
                created_at: resumeRecords[0].created_at
            };
        }

        // Build structured data from individual records
        const structuredData = {};
        for (const rec of completeRecords) {
            const rd = typeof rec.record_data === 'string'
                ? JSON.parse(rec.record_data)
                : rec.record_data;
            structuredData[rec.record_type] = rd;
        }

        res.json({
            success: true,
            data: {
                mr_id: normalizedMrId,
                patient: visitInfo.length > 0 ? {
                    id: visitInfo[0].patient_id,
                    full_name: visitInfo[0].full_name,
                    birth_date: visitInfo[0].birth_date,
                    phone: visitInfo[0].phone,
                    visit_location: visitInfo[0].visit_location,
                    visit_date: visitInfo[0].visit_date
                } : null,
                resume: resumeData,
                records: structuredData
            }
        });

    } catch (error) {
        logger.error('COMM integration - resume error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch resume medis'
        });
    }
});
/**
 * POST /assessments
 * COMM must send a canonical visit and a versioned routine section. The older
 * external sync envelope is deliberately rejected until its producer changes.
 */
router.post('/assessments', async (req, res) => {
    const service = require('../services/MedicalRecordService');
    const { patientId, mrId, recordType, data, id, changes } = req.body || {};
    const isCreate = req.get('If-None-Match') === '*';
    const ifMatch = req.get('If-Match');
    if (!patientId || !mrId || !recordType || !['anamnesa', 'physical_exam', 'pemeriksaan_obstetri',
        'pemeriksaan_ginekologi', 'usg', 'lab', 'penunjang', 'diagnosis', 'planning', 'resume_medis'].includes(recordType)) {
        return res.status(428).json({ success: false, code: 'VERSIONED_ASSESSMENT_REQUIRED',
            message: 'Canonical visit and versioned section are required' });
    }
    if ((!isCreate && !ifMatch) || (isCreate && (id || ifMatch)) || (!isCreate && !id)) {
        return res.status(428).json({ success: false, code: 'VERSIONED_ASSESSMENT_REQUIRED',
            message: 'Create requires If-None-Match: *; update requires id and If-Match' });
    }
    try {
        const actor = { id: 'comm-integration' };
        const result = isCreate
            ? await service.create({ patientId, mrId, recordType, data, actor })
            : await service.patch({ id, patientId, mrId, recordType, changes, ifMatch, actor });
        res.set('ETag', `"${result.version}"`);
        res.set('Cache-Control', 'no-store');
        return res.status(isCreate ? 201 : 200).json({ success: true, version: result.version, data: result.data });
    } catch (error) {
        const known = error instanceof service.MedicalRecordError;
        if (!known) logger.error('COMM assessment mutation failed', { code: 'COMM_ASSESSMENT_MUTATION_FAILED' });
        return res.status(known ? error.statusCode : 500).json({ success: false,
            code: known ? error.code : 'COMM_ASSESSMENT_MUTATION_FAILED',
            message: known ? error.message : 'Assessment save failed' });
    }
});
/**
 * POST /operation-sync
 * Receive daily surgery operation snapshot from COMM.
 *
 * COMM is the collector/executor. DocBoard is the scheduling source of truth,
 * so this endpoint upserts schedules from only the fields COMM actually sends.
 */
router.post('/operation-sync', async (req, res) => {
    try {
        const result = await commOperationSync.syncBatch(req.body || {});

        res.status(202).json({
            success: true,
            message: 'Operation sync accepted',
            ...result
        });
    } catch (error) {
        logger.error('COMM integration - operation sync error:', error);

        const isClientError = /items|operation_date|patient_name|location|source_key|invalid/i.test(error.message || '');
        res.status(isClientError ? 400 : 500).json({
            success: false,
            message: isClientError ? error.message : 'Failed to sync operations'
        });
    }
});

/**
 * POST /schedule-intent
 * Receive a deliberate manual surgery schedule command from COMM.
 *
 * This is separate from the daily operation snapshot sync. COMM sends the
 * user's explicit date/time/tindakan choice, and DocBoard immediately creates
 * an active surgery schedule when required fields are valid.
 */
router.post('/schedule-intent', async (req, res) => {
    try {
        const result = await commScheduleIntent.createFromIntent(req.body || {}, 'COMM manual');

        res.status(result.action === 'existing' ? 200 : 201).json({
            success: true,
            message: result.action === 'existing'
                ? 'Schedule intent already exists'
                : 'Schedule intent created',
            ...result
        });
    } catch (error) {
        logger.error('COMM integration - schedule intent error:', error);

        const isClientError = /missing|required|invalid|facility|case_id|patient_name|hospital_mr_id|schedule_date|operation_name/i
            .test(error.message || '');

        res.status(isClientError ? 400 : 500).json({
            success: false,
            message: isClientError ? error.message : 'Failed to create schedule intent'
        });
    }
});

module.exports = router;

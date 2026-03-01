const express = require('express');
const router = express.Router();
const db = require('../db');
const logger = require('../utils/logger');
const apiKeyAuth = require('../middleware/apiKeyAuth');

// All routes require API key authentication
router.use(apiKeyAuth);

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
 * Receive assessment data from COMM and save to medical_records
 */
router.post('/assessments', async (req, res) => {
    try {
        const { patientId, mrId, doctorName, assessmentType, data } = req.body;

        // Support two formats:
        // 1. Frontend: { patientId, mrId, data: {...} }
        // 2. Sync job: { patient_name, no_rm, facility, diagnosis, ... }
        const isSyncFormat = !patientId && req.body.no_rm;
        const effectivePatientId = patientId || req.body.patient_name || 'unknown';
        const effectiveData = data || req.body;

        if (!effectivePatientId) {
            return res.status(400).json({
                success: false,
                message: 'patientId (or patient_name for sync) is required'
            });
        }

        const recordData = {
            source: 'comm',
            assessment_type: assessmentType || (isSyncFormat ? 'comm_sync' : 'clinical_assessment'),
            ...(data ? data : {}),
            // Include sync-specific fields if present
            ...(isSyncFormat ? {
                facility: req.body.facility,
                no_rm: req.body.no_rm,
                patient_name: req.body.patient_name,
                case_id: req.body.case_id,
                diagnosis: req.body.diagnosis,
                diagnosis_level: req.body.diagnosis_level,
                uk_formatted: req.body.uk_formatted,
                saved_by: req.body.saved_by,
                cppt_assessment: req.body.cppt_assessment,
                r2_key: req.body.r2_key,
                record_data: req.body.record_data,
            } : {}),
            received_at: new Date().toISOString()
        };

        // Use a COMM-specific record_type marker in record_data to avoid conflicting
        // with existing 'complete' records. If mr_id has a unique constraint with record_type,
        // we use INSERT ... ON DUPLICATE KEY UPDATE to upsert.
        const normalizedMrId = mrId ? mrId.trim().toUpperCase() : null;

        const [result] = await db.query(
            `INSERT INTO medical_records (patient_id, mr_id, doctor_name, record_type, record_data)
             VALUES (?, ?, ?, 'complete', ?)
             ON DUPLICATE KEY UPDATE
                record_data = VALUES(record_data),
                doctor_name = VALUES(doctor_name),
                updated_at = CURRENT_TIMESTAMP`,
            [effectivePatientId, normalizedMrId, doctorName || 'COMM System', JSON.stringify(recordData)]
        );

        logger.info('COMM assessment saved', {
            recordId: result.insertId,
            patientId: effectivePatientId,
            mrId,
            assessmentType
        });

        res.status(201).json({
            success: true,
            message: 'Assessment saved successfully',
            data: { id: result.insertId }
        });

    } catch (error) {
        logger.error('COMM integration - save assessment error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to save assessment'
        });
    }
});

module.exports = router;

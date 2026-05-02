// Backend API for Patients
// Save as: /var/www/dokterdibya/staff/backend/routes/patients.js

const express = require('express');
const router = express.Router();
const db = require('../db');
const cache = require('../utils/cache');
const multer = require('multer');
const sharp = require('sharp');
const r2Storage = require('../services/r2Storage');
const { verifyToken, verifyPatientToken } = require('../middleware/auth');
const { validatePatient } = require('../middleware/validation');
const { deletePatientWithRelations } = require('../services/patientDeletion');
const activityLogger = require('../services/activityLogger');
const logger = require('../utils/logger');

// Enrichment failure counters — exposed via getEnrichmentStats() for /api/metrics
const _enrichFailures = {
    resumeRecords: 0,
    resumeDocs: 0,
    usgDocs: 0,
    obstetriHpl: 0,
    birthRecords: 0,
    total: 0,
};
function getEnrichmentStats() {
    return { ..._enrichFailures };
}
function _enrichFail(key, err) {
    _enrichFailures[key]++;
    _enrichFailures.total++;
    logger.warn(`Enrichment batch failed: ${key}`, { error: err.message || err });
}

// Configure multer for birth photo upload
const birthPhotoUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed'), false);
        }
    }
});

// ==================== PATIENT ENDPOINTS ====================

function applyCacheHeaders(res, { bypassCache, cacheKey, hit }) {
    const cacheControl = bypassCache
        ? 'no-store, no-cache, must-revalidate, proxy-revalidate'
        : 'private, max-age=60';

    res.set({
        'Cache-Control': cacheControl,
        'Pragma': bypassCache ? 'no-cache' : 'private',
        'Expires': bypassCache ? '0' : new Date(Date.now() + 60000).toUTCString(),
        'X-Cache-Status': hit ? 'HIT' : (bypassCache ? 'BYPASS' : 'MISS'),
        'X-Cache-Key': cacheKey
    });
}

let birthTestimonialColumnsReady = false;

async function ensureBirthTestimonialColumns() {
    if (birthTestimonialColumnsReady) return;

    const hasColumn = async (columnName) => {
        const [rows] = await db.query(
            `SELECT 1
             FROM information_schema.columns
             WHERE table_schema = DATABASE()
               AND table_name = 'birth_congratulations'
               AND column_name = ?
             LIMIT 1`,
            [columnName]
        );
        return rows.length > 0;
    };

    if (!(await hasColumn('patient_testimonial'))) {
        await db.query(
            'ALTER TABLE birth_congratulations ADD COLUMN patient_testimonial TEXT NULL AFTER message'
        );
    }

    if (!(await hasColumn('patient_testimonial_submitted_at'))) {
        await db.query(
            'ALTER TABLE birth_congratulations ADD COLUMN patient_testimonial_submitted_at DATETIME NULL AFTER patient_testimonial'
        );
    }

    birthTestimonialColumnsReady = true;
}

// ==================== PUBLIC ENDPOINTS (no auth required) ====================

const pushService = require('../services/pushNotificationService');

// Get VAPID public key for PWA Web Push subscription (public, no auth)
router.get('/api/patients/vapid-key', (req, res) => {
    var key = pushService.getVapidPublicKey();
    if (!key) {
        return res.status(503).json({ success: false, message: 'Web Push not configured' });
    }
    res.json({ success: true, vapidPublicKey: key });
});

// ==================== PROTECTED ENDPOINTS (READ) ====================

// GET ALL PATIENTS (Protected - requires authentication and permission)
router.get('/api/patients', verifyToken, async (req, res) => {
    try {
        const { search, limit, hospital, sort, page, _, last_visit_location, cursor } = req.query;
        const clientCacheControl = (req.headers['cache-control'] || '').toLowerCase();
        const clientRequestsFresh = clientCacheControl.includes('no-cache') || clientCacheControl.includes('no-store');
        const bypassCache = typeof _ !== 'undefined' || clientRequestsFresh;

        // Decode cursor for keyset pagination (optional — falls back to offset)
        let cursorData = null;
        if (cursor) {
            try {
                cursorData = JSON.parse(Buffer.from(cursor, 'base64url').toString());
            } catch { /* invalid cursor, ignore */ }
        }

        // Generate cache key and honor bypass flag (frontend sends _=timestamp)
        const cacheKey = `patients:list:${search || 'all'}:${limit || 'all'}:${hospital || 'all'}:${sort || 'default'}:${cursor || page || '1'}:${last_visit_location || 'all'}`;

        if (!bypassCache) {
            const cached = cache.get(cacheKey, 'short');
            if (cached) {
                applyCacheHeaders(res, { bypassCache, cacheKey, hit: true });
                return res.json(cached);
            }
        }

        let query;
        const params = [];

        // Filter by last visit location from sunday_clinic_records
        if (last_visit_location) {
            if (last_visit_location === 'no_visit') {
                // Patients with no visits (Pasien Baru)
                query = `
                    SELECT p.*,
                        NULL as last_visit_loc,
                        NULL as last_visit_date,
                        NULL as mr_id
                    FROM patients p
                    WHERE NOT EXISTS (
                        SELECT 1 FROM sunday_clinic_records scr WHERE scr.patient_id = p.id
                    )
                `;
            } else {
                // Patients whose last visit was at specific location
                // Use resume_medis creation date from medical_records as visit date
                query = `
                    SELECT p.*,
                        latest.visit_location as last_visit_loc,
                        latest.mr_id as mr_id,
                        latest.mr_category as last_visit_type,
                        COALESCE(resume.resume_date, latest.last_activity_at) as last_visit_date
                    FROM patients p
                    INNER JOIN (
                        SELECT scr.patient_id, scr.visit_location, scr.mr_id, scr.mr_category, scr.last_activity_at
                        FROM sunday_clinic_records scr
                        INNER JOIN (
                            SELECT patient_id, MAX(last_activity_at) as max_activity
                            FROM sunday_clinic_records
                            GROUP BY patient_id
                        ) latest_visit ON scr.patient_id = latest_visit.patient_id
                            AND scr.last_activity_at = latest_visit.max_activity
                    ) latest ON p.id = latest.patient_id
                    LEFT JOIN (
                        SELECT mr_id, MAX(created_at) as resume_date
                        FROM medical_records
                        WHERE record_type = 'resume_medis'
                        GROUP BY mr_id
                    ) resume ON latest.mr_id = resume.mr_id
                    WHERE latest.visit_location = ?
                `;
                params.push(last_visit_location);
            }

            if (search) {
                query += ' AND (p.full_name LIKE ? OR p.id LIKE ? OR p.whatsapp LIKE ?)';
                const searchTerm = `%${search}%`;
                params.push(searchTerm, searchTerm, searchTerm);
            }

            // Apply sorting - default to last_visit DESC (most recent visit first)
            if (sort === 'name') {
                query += ' ORDER BY p.full_name ASC';
            } else {
                query += ' ORDER BY p.last_visit DESC, p.created_at DESC';
            }
        }
        // If hospital filter is provided, get patients who have appointments at that hospital
        else if (hospital) {
            query = `
                SELECT DISTINCT p.*,
                    (SELECT scr.mr_id FROM sunday_clinic_records scr
                     WHERE scr.patient_id = p.id
                     ORDER BY scr.last_activity_at DESC LIMIT 1) as mr_id,
                    (SELECT scr.visit_location FROM sunday_clinic_records scr
                     WHERE scr.patient_id = p.id
                     ORDER BY scr.last_activity_at DESC LIMIT 1) as visit_location,
                    (SELECT scr.mr_category FROM sunday_clinic_records scr
                     WHERE scr.patient_id = p.id
                     ORDER BY scr.last_activity_at DESC LIMIT 1) as last_visit_type
                FROM patients p
                INNER JOIN appointments a ON p.id = a.patient_id
                WHERE a.hospital_location = ?
            `;
            params.push(hospital);

            if (search) {
                query += ' AND (p.full_name LIKE ? OR p.id LIKE ? OR p.whatsapp LIKE ?)';
                const searchTerm = `%${search}%`;
                params.push(searchTerm, searchTerm, searchTerm);
            }

            // Apply sorting - default to last_visit DESC (most recent visit first)
            if (sort === 'name') {
                query += ' ORDER BY p.full_name ASC';
            } else {
                query += ' ORDER BY p.last_visit DESC, p.created_at DESC';
            }
        } else {
            query = `SELECT p.*,
                (SELECT MAX(sa.appointment_date) FROM sunday_appointments sa
                 WHERE sa.patient_id = p.id AND sa.status IN ('completed','confirmed')) as actual_last_visit,
                (SELECT scr.mr_id FROM sunday_clinic_records scr
                 WHERE scr.patient_id = p.id
                 ORDER BY scr.last_activity_at DESC LIMIT 1) as mr_id,
                (SELECT scr.visit_location FROM sunday_clinic_records scr
                 WHERE scr.patient_id = p.id
                 ORDER BY scr.last_activity_at DESC LIMIT 1) as visit_location,
                (SELECT scr.mr_category FROM sunday_clinic_records scr
                 WHERE scr.patient_id = p.id
                 ORDER BY scr.last_activity_at DESC LIMIT 1) as last_visit_type,
                (SELECT JSON_UNQUOTE(JSON_EXTRACT(mr.record_data, '$.record_datetime'))
                 FROM medical_records mr
                 WHERE mr.patient_id = p.id
                 AND mr.record_type = 'anamnesa'
                 AND JSON_EXTRACT(mr.record_data, '$.record_datetime') IS NOT NULL
                 ORDER BY mr.created_at DESC LIMIT 1) as anamnesa_datetime
                FROM patients p`;

            if (search) {
                query += ' WHERE (p.full_name LIKE ? OR p.id LIKE ? OR p.whatsapp LIKE ?)';
                const searchTerm = `%${search}%`;
                params.push(searchTerm, searchTerm, searchTerm);
            }

            // Apply sorting - default to last_visit DESC (most recent visit first)
            if (sort === 'name') {
                query += ' ORDER BY p.full_name ASC';
            } else {
                query += ' ORDER BY p.last_visit DESC, p.created_at DESC';
            }
        }

        // Handle pagination - only apply if limit is explicitly provided
        let total = 0;
        let pageNum = 1;
        let limitNum = null;

        if (limit) {
            pageNum = parseInt(page) || 1;
            limitNum = parseInt(limit);

            // Cursor-based keyset pagination: append WHERE clause to seek
            // past the last-seen row instead of using OFFSET (O(1) vs O(N)).
            if (cursorData && !last_visit_location && !hospital) {
                if (sort === 'name' && cursorData.fn) {
                    query += (query.includes('WHERE') ? ' AND' : ' WHERE') +
                        ' (p.full_name > ? OR (p.full_name = ? AND p.id > ?))';
                    params.push(cursorData.fn, cursorData.fn, cursorData.id);
                } else if (cursorData.lv) {
                    query += (query.includes('WHERE') ? ' AND' : ' WHERE') +
                        ' (p.last_visit < ? OR (p.last_visit = ? AND p.id < ?))';
                    params.push(cursorData.lv, cursorData.lv, cursorData.id);
                } else if (cursorData.id) {
                    query += (query.includes('WHERE') ? ' AND' : ' WHERE') +
                        ' p.id < ?';
                    params.push(cursorData.id);
                }
            }

            const offset = (pageNum - 1) * limitNum;

            // Count total for pagination
            let countQuery;
            const countParams = [];

            if (last_visit_location) {
                if (last_visit_location === 'no_visit') {
                    countQuery = `
                        SELECT COUNT(*) as total FROM patients p
                        WHERE NOT EXISTS (
                            SELECT 1 FROM sunday_clinic_records scr WHERE scr.patient_id = p.id
                        )
                    `;
                } else {
                    countQuery = `
                        SELECT COUNT(*) as total FROM patients p
                        INNER JOIN (
                            SELECT scr.patient_id, scr.visit_location
                            FROM sunday_clinic_records scr
                            INNER JOIN (
                                SELECT patient_id, MAX(last_activity_at) as max_activity
                                FROM sunday_clinic_records
                                GROUP BY patient_id
                            ) latest_visit ON scr.patient_id = latest_visit.patient_id
                                AND scr.last_activity_at = latest_visit.max_activity
                        ) latest ON p.id = latest.patient_id
                        WHERE latest.visit_location = ?
                    `;
                    countParams.push(last_visit_location);
                }
                if (search) {
                    countQuery += ' AND (p.full_name LIKE ? OR p.id LIKE ? OR p.whatsapp LIKE ?)';
                    const searchTerm = `%${search}%`;
                    countParams.push(searchTerm, searchTerm, searchTerm);
                }
            } else if (hospital) {
                countQuery = `SELECT COUNT(DISTINCT p.id) as total FROM patients p
                   INNER JOIN appointments a ON p.id = a.patient_id
                   WHERE a.hospital_location = ?`;
                countParams.push(hospital);
                if (search) {
                    countQuery += ' AND (p.full_name LIKE ? OR p.id LIKE ? OR p.whatsapp LIKE ?)';
                    const searchTerm = `%${search}%`;
                    countParams.push(searchTerm, searchTerm, searchTerm);
                }
            } else {
                countQuery = 'SELECT COUNT(*) as total FROM patients p';
                if (search) {
                    countQuery += ' WHERE (p.full_name LIKE ? OR p.id LIKE ? OR p.whatsapp LIKE ?)';
                    const searchTerm = `%${search}%`;
                    countParams.push(searchTerm, searchTerm, searchTerm);
                }
            }

            const [countResult] = await db.query(countQuery, countParams);
            total = countResult[0]?.total || 0;

            // Apply limit and offset (cursor mode skips OFFSET — seek is in WHERE)
            if (cursorData && !last_visit_location && !hospital) {
                query += ' LIMIT ?';
                params.push(limitNum);
            } else {
                query += ' LIMIT ? OFFSET ?';
                params.push(limitNum, offset);
            }
        }

        const [rows] = await db.query(query, params);

        // Batch-enrich patients (4 queries total instead of N×5)
        const mrIds = rows.map(p => p.mr_id).filter(Boolean);
        const patientIds = rows.map(p => p.id);

        // Build lookup maps from batch queries (run all in parallel)
        const resumeRecordSet = new Set();
        const resumeDocSet = new Set();
        const usgDocSet = new Set();
        const obstetriMap = {}; // patient_id -> hpht
        const birthSet = new Set();

        const batchPromises = [];

        if (mrIds.length > 0) {
            const placeholders = mrIds.map(() => '?').join(',');

            // Batch 1: resume records
            batchPromises.push(
                db.query(`SELECT DISTINCT mr_id FROM medical_records WHERE mr_id IN (${placeholders}) AND record_type = 'resume_medis'`, mrIds)
                    .then(([rows]) => rows.forEach(r => resumeRecordSet.add(r.mr_id)))
                    .catch(err => _enrichFail('resumeRecords', err))
            );

            // Batch 2: published resume docs
            batchPromises.push(
                db.query(`SELECT DISTINCT mr_id FROM patient_documents WHERE mr_id IN (${placeholders}) AND document_type = 'resume_medis' AND status = 'published'`, mrIds)
                    .then(([rows]) => rows.forEach(r => resumeDocSet.add(r.mr_id)))
                    .catch(err => _enrichFail('resumeDocs', err))
            );

            // Batch 3: published USG docs
            batchPromises.push(
                db.query(`SELECT DISTINCT mr_id FROM patient_documents WHERE mr_id IN (${placeholders}) AND document_type IN ('usg_2d', 'usg_4d', 'patient_usg') AND status = 'published'`, mrIds)
                    .then(([rows]) => rows.forEach(r => usgDocSet.add(r.mr_id)))
                    .catch(err => _enrichFail('usgDocs', err))
            );
        }

        if (patientIds.length > 0) {
            const pPlaceholders = patientIds.map(() => '?').join(',');

            // Batch 4: obstetri/HPL
            // REQUIRES: collation migration (20260307_performance_indexes_up.sql)
            // to align medical_records.mr_id → utf8mb4_unicode_ci.
            // Without the migration, this JOIN will fail on collation mismatch.
            batchPromises.push(
                db.query(`
                    SELECT t.patient_id, t.hpht FROM (
                        SELECT scr.patient_id,
                            JSON_UNQUOTE(JSON_EXTRACT(mr.record_data, '$.hpht')) as hpht,
                            ROW_NUMBER() OVER (PARTITION BY scr.patient_id ORDER BY scr.last_activity_at DESC) as rn
                        FROM sunday_clinic_records scr
                        JOIN medical_records mr
                            ON mr.mr_id = scr.mr_id
                            AND mr.record_type = 'anamnesa'
                        WHERE scr.patient_id IN (${pPlaceholders})
                            AND scr.mr_category = 'obstetri'
                            AND JSON_UNQUOTE(JSON_EXTRACT(mr.record_data, '$.hpht')) IS NOT NULL
                            AND JSON_UNQUOTE(JSON_EXTRACT(mr.record_data, '$.hpht')) != ''
                    ) t WHERE t.rn = 1
                `, patientIds)
                    .then(([rows]) => rows.forEach(r => { obstetriMap[r.patient_id] = r.hpht; }))
                    .catch(err => _enrichFail('obstetriHpl', err))
            );
        }

        await Promise.all(batchPromises);

        // Batch 5: birth records (only for obstetri patients)
        const obstetriPatientIds = Object.keys(obstetriMap);
        if (obstetriPatientIds.length > 0) {
            const bPlaceholders = obstetriPatientIds.map(() => '?').join(',');
            try {
                const [birthRows] = await db.query(
                    `SELECT DISTINCT patient_id FROM birth_congratulations WHERE patient_id IN (${bPlaceholders})`,
                    obstetriPatientIds
                );
                birthRows.forEach(r => birthSet.add(r.patient_id));
            } catch (err) { _enrichFail('birthRecords', err); }
        }

        // Map results using lookup sets
        const mappedRows = rows.map(patient => {
            let resume_status = null;
            if (patient.mr_id) {
                const hasResumeRecord = resumeRecordSet.has(patient.mr_id);
                const hasPublishedResume = resumeDocSet.has(patient.mr_id);
                const hasPublishedUsg = usgDocSet.has(patient.mr_id);

                if (hasPublishedResume && hasPublishedUsg) {
                    resume_status = 'sudah_kirim_usg_resume';
                } else if (hasPublishedResume) {
                    resume_status = 'sudah_kirim_resume';
                } else if (hasResumeRecord) {
                    resume_status = 'sudah_simpan';
                } else {
                    resume_status = 'belum_generate';
                }
            }

            let hpl = null;
            let days_pregnant = null;
            let is_obstetri = false;
            let has_delivered = false;

            const hphtStr = obstetriMap[patient.id];
            if (hphtStr) {
                is_obstetri = true;
                const hpht = new Date(hphtStr);
                if (!isNaN(hpht.getTime())) {
                    const hplDate = new Date(hpht.getTime() + 280 * 24 * 60 * 60 * 1000);
                    hpl = `${hplDate.getFullYear()}-${String(hplDate.getMonth() + 1).padStart(2, '0')}-${String(hplDate.getDate()).padStart(2, '0')}`;
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    days_pregnant = Math.floor((today.getTime() - hpht.getTime()) / (24 * 60 * 60 * 1000));
                    has_delivered = birthSet.has(patient.id);
                }
            }

            return {
                ...patient,
                whatsapp: patient.whatsapp || patient.phone || null,
                last_visit: patient.anamnesa_datetime || null,
                resume_status,
                hpl,
                days_pregnant,
                is_obstetri,
                has_delivered
            };
        });

        const response = {
            success: true,
            data: mappedRows,
            count: mappedRows.length
        };

        // Only include pagination if limit was provided
        if (limitNum) {
            response.pagination = {
                total,
                page: pageNum,
                totalPages: Math.ceil(total / limitNum),
                limit: limitNum
            };

            // Cursor-based pagination hint — allows clients to switch to
            // keyset pagination for large datasets. The cursor encodes the
            // last row's sort key so the DB can seek instead of offset-skip.
            if (mappedRows.length > 0) {
                const lastRow = mappedRows[mappedRows.length - 1];
                const cursorPayload = {
                    id: lastRow.id,
                    lv: lastRow.last_visit || lastRow.created_at || null,
                    fn: lastRow.full_name || null,
                };
                response.pagination.nextCursor = Buffer.from(JSON.stringify(cursorPayload)).toString('base64url');
            }
        }

        // Cache the result unless caller explicitly requested a fresh fetch
        if (!bypassCache) {
            cache.set(cacheKey, response, 'short');
        } else {
            cache.del(cacheKey, 'short');
        }

        applyCacheHeaders(res, { bypassCache, cacheKey, hit: false });
        res.json(response);
    } catch (error) {
        console.error('Error fetching patients:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch patients',
            error: error.message
        });
    }
});

// ADVANCED SEARCH - Search by specific fields
router.get('/api/patients/search/advanced', verifyToken, async (req, res) => {
    try {
        const {
            name,       // Nama pasien
            id,         // ID pasien
            mr_id,      // MR ID dari sunday_clinic_records
            email,      // Email dari users table
            age_min,    // Umur minimum
            age_max,    // Umur maximum
            phone,      // Nomor HP
            whatsapp,   // Nomor WhatsApp
            husband,    // Nama suami
            visit_date, // Tanggal periksa (from sunday_clinic_records.created_at)
            limit,
            page
        } = req.query;

        // Debug logging
        console.log('[ADVANCED SEARCH] Received params:', { name, id, mr_id, email, age_min, age_max, phone, whatsapp, husband, visit_date });

        // Build dynamic query with LEFT JOINs for MR and email
        let query = `
            SELECT DISTINCT
                p.*,
                scr.mr_id,
                u.email,
                (SELECT MAX(sa.appointment_date) FROM sunday_appointments sa
                 WHERE sa.patient_id = p.id AND sa.status IN ('completed','confirmed')) as actual_last_visit,
                (SELECT JSON_UNQUOTE(JSON_EXTRACT(mr.record_data, '$.record_datetime'))
                 FROM medical_records mr
                 WHERE mr.patient_id = p.id
                 AND mr.record_type = 'anamnesa'
                 AND JSON_EXTRACT(mr.record_data, '$.record_datetime') IS NOT NULL
                 ORDER BY mr.created_at DESC LIMIT 1) as anamnesa_datetime
            FROM patients p
            LEFT JOIN sunday_clinic_records scr ON p.id = scr.patient_id
            LEFT JOIN users u ON p.id = u.new_id
            WHERE 1=1
        `;
        const params = [];

        // Filter by name (full_name)
        if (name && name.trim()) {
            query += ' AND p.full_name LIKE ?';
            params.push(`%${name.trim()}%`);
        }

        // Filter by patient ID
        if (id && id.trim()) {
            query += ' AND p.id LIKE ?';
            params.push(`%${id.trim()}%`);
        }

        // Filter by MR ID
        if (mr_id && mr_id.trim()) {
            query += ' AND scr.mr_id LIKE ?';
            params.push(`%${mr_id.trim()}%`);
        }

        // Filter by email
        if (email && email.trim()) {
            query += ' AND u.email LIKE ?';
            params.push(`%${email.trim()}%`);
        }

        // Filter by age range
        if (age_min) {
            query += ' AND p.age >= ?';
            params.push(parseInt(age_min));
        }
        if (age_max) {
            query += ' AND p.age <= ?';
            params.push(parseInt(age_max));
        }

        // Filter by phone
        if (phone && phone.trim()) {
            query += ' AND p.phone LIKE ?';
            params.push(`%${phone.trim()}%`);
        }

        // Filter by WhatsApp
        if (whatsapp && whatsapp.trim()) {
            query += ' AND p.whatsapp LIKE ?';
            params.push(`%${whatsapp.trim()}%`);
        }

        // Filter by husband name
        if (husband && husband.trim()) {
            query += ' AND p.husband_name LIKE ?';
            params.push(`%${husband.trim()}%`);
        }

        // Filter by visit date (tanggal periksa)
        if (visit_date && visit_date.trim()) {
            query += ' AND DATE(scr.created_at) = ?';
            params.push(visit_date.trim());
        }

        // Order by name
        query += ' ORDER BY p.full_name ASC';

        // Handle pagination
        let total = 0;
        let pageNum = parseInt(page) || 1;
        let limitNum = parseInt(limit) || 50;
        const offset = (pageNum - 1) * limitNum;

        // Count total results
        const countQuery = query.replace(
            /SELECT DISTINCT[\s\S]*?FROM patients/,
            'SELECT COUNT(DISTINCT p.id) as total FROM patients'
        ).replace(/ORDER BY[\s\S]*$/, '');

        const [countResult] = await db.query(countQuery, params);
        total = countResult[0]?.total || 0;

        // Add pagination
        query += ' LIMIT ? OFFSET ?';
        params.push(limitNum, offset);

        const [rows] = await db.query(query, params);

        // Debug logging
        console.log('[ADVANCED SEARCH] Query returned', rows.length, 'rows');
        console.log('[ADVANCED SEARCH] Results:', rows.map(p => ({ id: p.id, name: p.full_name })));

        // Map and deduplicate results, then fetch obstetri data
        const seen = new Set();
        const uniqueRows = rows.filter(patient => {
            if (seen.has(patient.id)) return false;
            seen.add(patient.id);
            return true;
        });

        // Fetch obstetri/HPL data for each patient (same as main patient list)
        const mappedRows = await Promise.all(uniqueRows.map(async (patient) => {
            let hpl = null;
            let days_pregnant = null;
            let is_obstetri = false;
            let has_delivered = false;
            let last_visit_type = null;

            // Get last visit type (mr_category)
            try {
                const [lastVisit] = await db.query(`
                    SELECT mr_category FROM sunday_clinic_records
                    WHERE patient_id = ?
                    ORDER BY last_activity_at DESC LIMIT 1
                `, [patient.id]);
                if (lastVisit.length > 0) {
                    last_visit_type = lastVisit[0].mr_category;
                }
            } catch (err) {
                console.error('Error fetching last visit type:', err.message);
            }

            // Check if patient is obstetri and get HPL data
            try {
                const [obstetriRecord] = await db.query(`
                    SELECT scr.mr_id, scr.mr_category,
                        JSON_UNQUOTE(JSON_EXTRACT(mr.record_data, '$.hpht')) as hpht
                    FROM sunday_clinic_records scr
                    JOIN medical_records mr ON mr.mr_id = scr.mr_id
                        AND mr.record_type = 'anamnesa'
                    WHERE scr.patient_id = ?
                        AND scr.mr_category = 'obstetri'
                        AND JSON_UNQUOTE(JSON_EXTRACT(mr.record_data, '$.hpht')) IS NOT NULL
                        AND JSON_UNQUOTE(JSON_EXTRACT(mr.record_data, '$.hpht')) != ''
                    ORDER BY scr.last_activity_at DESC
                    LIMIT 1
                `, [patient.id]);

                if (obstetriRecord.length > 0 && obstetriRecord[0].hpht) {
                    is_obstetri = true;
                    const hpht = new Date(obstetriRecord[0].hpht);
                    if (!isNaN(hpht.getTime())) {
                        const hplDate = new Date(hpht.getTime() + 280 * 24 * 60 * 60 * 1000);
                        hpl = `${hplDate.getFullYear()}-${String(hplDate.getMonth() + 1).padStart(2, '0')}-${String(hplDate.getDate()).padStart(2, '0')}`;
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);
                        days_pregnant = Math.floor((today.getTime() - hpht.getTime()) / (24 * 60 * 60 * 1000));

                        // Check if patient has delivered
                        const [birthRecord] = await db.query(
                            `SELECT 1 FROM birth_congratulations WHERE patient_id = ? LIMIT 1`,
                            [patient.id]
                        );
                        has_delivered = birthRecord.length > 0;
                    }
                }
            } catch (err) {
                console.error('Error fetching HPL data for patient', patient.id, err.message);
            }

            return {
                ...patient,
                whatsapp: patient.whatsapp || patient.phone || null,
                // Only use anamnesa_datetime - actual examination date from anamnesa section
                // Do NOT fallback to booking dates as those can be in the future
                last_visit: patient.anamnesa_datetime || null,
                last_visit_type,
                hpl,
                days_pregnant,
                is_obstetri,
                has_delivered
            };
        }));

        res.json({
            success: true,
            data: mappedRows,
            count: mappedRows.length,
            total,
            page: pageNum,
            totalPages: Math.ceil(total / limitNum)
        });
    } catch (error) {
        console.error('Error in advanced search:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to search patients',
            error: error.message
        });
    }
});

// AUTO-FIX PATIENT NAMES - Title Case capitalization
router.post('/api/patients/fix-names', verifyToken, async (req, res) => {
    try {
        // Only allow admin/dokter roles
        if (!['dokter', 'admin', 'managerial'].includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: 'Only admin or dokter can perform this action'
            });
        }

        // Get all patients with potentially incorrect name capitalization
        const [patients] = await db.query('SELECT id, full_name FROM patients WHERE full_name IS NOT NULL');

        let updatedCount = 0;
        const changes = [];

        for (const patient of patients) {
            const originalName = patient.full_name;

            // Convert to proper title case
            // Handle: RAHAYU → Rahayu, perama indah hapsari → Perama Indah Hapsari
            const fixedName = originalName
                .toLowerCase()
                .split(' ')
                .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                .join(' ')
                .trim();

            // Only update if different
            if (fixedName !== originalName) {
                await db.query('UPDATE patients SET full_name = ? WHERE id = ?', [fixedName, patient.id]);
                changes.push({
                    id: patient.id,
                    before: originalName,
                    after: fixedName
                });
                updatedCount++;
            }
        }

        // Invalidate patient cache
        cache.delPattern('patients:');

        res.json({
            success: true,
            message: `${updatedCount} nama pasien berhasil diperbaiki`,
            updatedCount,
            changes: changes.slice(0, 50) // Only return first 50 changes to avoid large response
        });
    } catch (error) {
        console.error('Error fixing patient names:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fix patient names',
            error: error.message
        });
    }
});

// ==================== PREGNANCY TRACKER ====================
// IMPORTANT: These routes MUST be defined BEFORE /api/patients/:id to avoid route conflicts

// GET near-due pregnancies (37-40 weeks from HPHT, 3 weeks before due)
// Returns unique patients (by patient_id), showing most recent obstetri record
router.get('/api/patients/near-due-pregnancies', verifyToken, async (req, res) => {
    try {
        // Get the latest obstetri record per patient with valid HPHT
        const query = `
            SELECT
                p.id as patient_id,
                p.full_name,
                p.whatsapp,
                p.phone,
                latest.mr_id,
                latest.visit_location,
                latest.hpht,
                DATEDIFF(CURDATE(), latest.hpht) as days_pregnant,
                FLOOR(DATEDIFF(CURDATE(), latest.hpht) / 7) as weeks_pregnant,
                DATE_ADD(latest.hpht, INTERVAL 280 DAY) as hpl,
                latest.last_activity_at as last_visit,
                (
                    SELECT COALESCE(
                        NULLIF(JSON_UNQUOTE(JSON_EXTRACT(md.record_data, '$.diagnosis_utama')), ''),
                        NULLIF(JSON_UNQUOTE(JSON_EXTRACT(md.record_data, '$.diagnosis')), '')
                    )
                    FROM medical_records md
                    WHERE md.mr_id = latest.mr_id
                      AND md.record_type = 'diagnosis'
                    ORDER BY md.created_at DESC
                    LIMIT 1
                ) as last_diagnosis
            FROM patients p
            JOIN (
                SELECT
                    scr.patient_id,
                    scr.mr_id,
                    scr.visit_location,
                    scr.last_activity_at,
                    JSON_UNQUOTE(JSON_EXTRACT(mr.record_data, '$.hpht')) as hpht,
                    ROW_NUMBER() OVER (PARTITION BY scr.patient_id ORDER BY scr.last_activity_at DESC) as rn
                FROM sunday_clinic_records scr
                JOIN medical_records mr ON mr.mr_id = scr.mr_id
                    AND mr.record_type = 'anamnesa'
                WHERE scr.mr_category = 'obstetri'
                AND JSON_EXTRACT(mr.record_data, '$.hpht') IS NOT NULL
                AND JSON_UNQUOTE(JSON_EXTRACT(mr.record_data, '$.hpht')) != ''
                AND JSON_UNQUOTE(JSON_EXTRACT(mr.record_data, '$.hpht')) != 'null'
            ) latest ON p.id = latest.patient_id AND latest.rn = 1
            LEFT JOIN birth_congratulations bc ON bc.patient_id = p.id
            WHERE bc.id IS NULL
            AND DATEDIFF(CURDATE(), latest.hpht) >= 259
            AND DATEDIFF(CURDATE(), latest.hpht) < 280
            ORDER BY days_pregnant DESC
        `;

        const [rows] = await db.query(query);

        const nearDuePatients = rows.map(row => {
            const weeksPregnant = Math.floor(row.days_pregnant / 7);
            const daysExtra = row.days_pregnant % 7;
            const daysUntilDue = 280 - row.days_pregnant;

            return {
                patient_id: row.patient_id,
                full_name: row.full_name,
                whatsapp: row.whatsapp,
                phone: row.phone,
                contact_phone: row.whatsapp || row.phone || null,
                mr_id: row.mr_id,
                visit_location: row.visit_location,
                hpht: row.hpht,
                hpl: row.hpl,
                weeks_pregnant: weeksPregnant,
                days_pregnant: row.days_pregnant,
                gestational_age: `${weeksPregnant} minggu ${daysExtra} hari`,
                days_until_due: daysUntilDue,
                last_visit: row.last_visit,
                last_diagnosis: row.last_diagnosis || null
            };
        });

        res.json({
            success: true,
            data: nearDuePatients,
            count: nearDuePatients.length
        });
    } catch (error) {
        console.error('Error fetching near-due pregnancies:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch near-due pregnancies',
            error: error.message
        });
    }
});

// GET overdue pregnancies (>40 weeks from HPHT, not yet delivered)
// Returns unique patients (by patient_id), showing most recent obstetri record
router.get('/api/patients/overdue-pregnancies', verifyToken, async (req, res) => {
    try {
        // Get the latest obstetri record per patient with valid HPHT
        const query = `
            SELECT
                p.id as patient_id,
                p.full_name,
                p.whatsapp,
                p.phone,
                latest.mr_id,
                latest.visit_location,
                latest.hpht,
                DATEDIFF(CURDATE(), latest.hpht) as days_pregnant,
                FLOOR(DATEDIFF(CURDATE(), latest.hpht) / 7) as weeks_pregnant,
                DATE_ADD(latest.hpht, INTERVAL 280 DAY) as hpl,
                latest.last_activity_at as last_visit,
                (
                    SELECT COALESCE(
                        NULLIF(JSON_UNQUOTE(JSON_EXTRACT(md.record_data, '$.diagnosis_utama')), ''),
                        NULLIF(JSON_UNQUOTE(JSON_EXTRACT(md.record_data, '$.diagnosis')), '')
                    )
                    FROM medical_records md
                    WHERE md.mr_id = latest.mr_id
                      AND md.record_type = 'diagnosis'
                    ORDER BY md.created_at DESC
                    LIMIT 1
                ) as last_diagnosis
            FROM patients p
            JOIN (
                SELECT
                    scr.patient_id,
                    scr.mr_id,
                    scr.visit_location,
                    scr.last_activity_at,
                    JSON_UNQUOTE(JSON_EXTRACT(mr.record_data, '$.hpht')) as hpht,
                    ROW_NUMBER() OVER (PARTITION BY scr.patient_id ORDER BY scr.last_activity_at DESC) as rn
                FROM sunday_clinic_records scr
                JOIN medical_records mr ON mr.mr_id = scr.mr_id
                    AND mr.record_type = 'anamnesa'
                WHERE scr.mr_category = 'obstetri'
                AND JSON_EXTRACT(mr.record_data, '$.hpht') IS NOT NULL
                AND JSON_UNQUOTE(JSON_EXTRACT(mr.record_data, '$.hpht')) != ''
                AND JSON_UNQUOTE(JSON_EXTRACT(mr.record_data, '$.hpht')) != 'null'
            ) latest ON p.id = latest.patient_id AND latest.rn = 1
            LEFT JOIN birth_congratulations bc ON bc.patient_id = p.id
            WHERE bc.id IS NULL
            AND DATEDIFF(CURDATE(), latest.hpht) >= 280
            ORDER BY days_pregnant DESC
        `;

        const [rows] = await db.query(query);

        const overduePatients = rows.map(row => {
            const weeksPregnant = Math.floor(row.days_pregnant / 7);
            const daysExtra = row.days_pregnant % 7;
            const daysOverdue = row.days_pregnant - 280;

            return {
                patient_id: row.patient_id,
                full_name: row.full_name,
                whatsapp: row.whatsapp,
                phone: row.phone,
                contact_phone: row.whatsapp || row.phone || null,
                mr_id: row.mr_id,
                visit_location: row.visit_location,
                hpht: row.hpht,
                hpl: row.hpl,
                weeks_pregnant: weeksPregnant,
                days_pregnant: row.days_pregnant,
                gestational_age: `${weeksPregnant} minggu ${daysExtra} hari`,
                days_overdue: daysOverdue,
                last_visit: row.last_visit,
                last_diagnosis: row.last_diagnosis || null
            };
        });

        res.json({
            success: true,
            data: overduePatients,
            count: overduePatients.length
        });
    } catch (error) {
        console.error('Error fetching overdue pregnancies:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch overdue pregnancies',
            error: error.message
        });
    }
});

// ==================== PREGNANCY DATA (Android App) ====================
// IMPORTANT: This route MUST be before /api/patients/:id to avoid route matching issues

// Baby size reference (40 weeks)
const BABY_SIZES = {
    4: { emoji: "🌱", size: "Biji Poppy", length: "0.1 cm" },
    5: { emoji: "🫘", size: "Biji Wijen", length: "0.2 cm" },
    6: { emoji: "🫛", size: "Biji Lentil", length: "0.4 cm" },
    7: { emoji: "🫐", size: "Blueberry", length: "1.3 cm" },
    8: { emoji: "🍇", size: "Raspberry", length: "1.6 cm" },
    9: { emoji: "🫒", size: "Zaitun", length: "2.3 cm" },
    10: { emoji: "🌰", size: "Kurma", length: "3.1 cm" },
    11: { emoji: "🍋", size: "Jeruk Nipis", length: "4.1 cm" },
    12: { emoji: "🍑", size: "Plum", length: "5.4 cm" },
    13: { emoji: "🍋", size: "Lemon", length: "7.4 cm" },
    14: { emoji: "🍊", size: "Jeruk", length: "8.7 cm" },
    15: { emoji: "🍎", size: "Apel", length: "10.1 cm" },
    16: { emoji: "🥑", size: "Alpukat", length: "11.6 cm" },
    17: { emoji: "🥔", size: "Kentang", length: "13 cm" },
    18: { emoji: "🫑", size: "Paprika", length: "14.2 cm" },
    19: { emoji: "🥒", size: "Timun", length: "15.3 cm" },
    20: { emoji: "🍌", size: "Pisang", length: "16.4 cm" },
    21: { emoji: "🥕", size: "Wortel", length: "26.7 cm" },
    22: { emoji: "🥬", size: "Sawi", length: "27.8 cm" },
    23: { emoji: "🥭", size: "Mangga", length: "28.9 cm" },
    24: { emoji: "🌽", size: "Jagung", length: "30 cm" },
    25: { emoji: "🍆", size: "Terong", length: "34.6 cm" },
    26: { emoji: "🥦", size: "Brokoli", length: "35.6 cm" },
    27: { emoji: "🥬", size: "Kol", length: "36.6 cm" },
    28: { emoji: "🍈", size: "Melon Kecil", length: "37.6 cm" },
    29: { emoji: "🎃", size: "Labu Kecil", length: "38.6 cm" },
    30: { emoji: "🥒", size: "Mentimun Besar", length: "39.9 cm" },
    31: { emoji: "🥥", size: "Kelapa", length: "41.1 cm" },
    32: { emoji: "🍍", size: "Nanas", length: "42.4 cm" },
    33: { emoji: "🎃", size: "Labu", length: "43.7 cm" },
    34: { emoji: "🍈", size: "Melon", length: "45 cm" },
    35: { emoji: "🥬", size: "Selada Romaine", length: "46.2 cm" },
    36: { emoji: "🥬", size: "Kol Besar", length: "47.4 cm" },
    37: { emoji: "🥬", size: "Lobak Swiss", length: "48.6 cm" },
    38: { emoji: "🍈", size: "Melon Besar", length: "49.8 cm" },
    39: { emoji: "🍉", size: "Semangka Mini", length: "50.7 cm" },
    40: { emoji: "🍉", size: "Semangka", length: "51.2 cm" }
};

// Weekly tips (milestone weeks)
const PREGNANCY_TIPS = {
    4: "Embrio mulai berkembang. Istirahat cukup dan konsumsi asam folat.",
    8: "Jantung bayi sudah berdetak! Hindari rokok dan alkohol.",
    12: "Risiko keguguran menurun. Saatnya umumkan kehamilan!",
    16: "Bayi mulai bergerak. Anda mungkin merasakan tendangan pertama.",
    20: "Separuh perjalanan! Saatnya USG detail anatomi bayi.",
    24: "Bayi sudah bisa mendengar suara Anda. Ajak bicara!",
    28: "Trimester ketiga dimulai. Persiapkan perlengkapan bayi.",
    32: "Bayi sudah dalam posisi kepala di bawah. Ikuti Kelas Dr. Dibya.",
    36: "Bayi hampir siap lahir. Perhatikan tanda-tanda persalinan.",
    40: "Selamat! Bayi Anda sudah full-term. Siap menyambut si kecil!"
};

// GET pregnancy data for logged-in patient (Android App)
router.get('/api/patients/pregnancy-data', verifyPatientToken, async (req, res) => {
    // Prevent browser caching - always fetch fresh data
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');

    try {
        const patientId = req.patient.id;
        console.log('[PREGNANCY_DEBUG] Endpoint called for patient:', patientId);

        // Check if patient has given birth
        const [birthRows] = await db.query(`
            SELECT
                baby_name,
                DATE_FORMAT(birth_date, '%d %b %Y') as birth_date,
                birth_time,
                birth_weight,
                birth_length,
                photo_url,
                photo_r2_key,
                message as doctor_message
            FROM birth_congratulations
            WHERE patient_id = ? AND is_published = 1
            ORDER BY created_at DESC
            LIMIT 1
        `, [patientId]);

        if (birthRows.length > 0) {
            const birth = birthRows[0];
            console.log('[BIRTH_DEBUG] Found birth data for patient:', patientId, 'baby_name:', birth.baby_name);

            // Regenerate signed URL if R2 key exists
            let photoUrl = birth.photo_url;
            if (birth.photo_r2_key) {
                try {
                    photoUrl = await r2Storage.getSignedDownloadUrl(birth.photo_r2_key, 3600);
                } catch (r2Error) {
                    console.error('Error generating signed URL:', r2Error);
                }
            }

            return res.json({
                success: true,
                data: {
                    is_pregnant: false,
                    has_given_birth: true,
                    birth_date: birth.birth_date,
                    birth_time: birth.birth_time,
                    baby_name: birth.baby_name,
                    baby_weight: birth.birth_weight,
                    baby_length: birth.birth_length,
                    baby_photo_url: photoUrl,
                    doctor_message: birth.doctor_message
                }
            });
        }

        // Get HPHT from latest obstetri record
        const [obstetriRows] = await db.query(`
            SELECT
                JSON_UNQUOTE(JSON_EXTRACT(mr.record_data, '$.hpht')) as hpht
            FROM sunday_clinic_records scr
            JOIN medical_records mr ON mr.mr_id = scr.mr_id
                AND mr.record_type = 'anamnesa'
            WHERE scr.patient_id = ?
                AND scr.mr_category = 'obstetri'
                AND JSON_EXTRACT(mr.record_data, '$.hpht') IS NOT NULL
                AND JSON_UNQUOTE(JSON_EXTRACT(mr.record_data, '$.hpht')) != ''
                AND JSON_UNQUOTE(JSON_EXTRACT(mr.record_data, '$.hpht')) != 'null'
            ORDER BY scr.last_activity_at DESC
            LIMIT 1
        `, [patientId]);

        if (obstetriRows.length > 0 && obstetriRows[0].hpht) {
            const hpht = new Date(obstetriRows[0].hpht);

            if (!isNaN(hpht.getTime())) {
                const today = new Date();
                today.setHours(0, 0, 0, 0);

                const daysPregnant = Math.floor((today.getTime() - hpht.getTime()) / (24 * 60 * 60 * 1000));
                const weeks = Math.floor(daysPregnant / 7);
                const days = daysPregnant % 7;

                // Calculate HPL (HPHT + 280 days)
                const hplDate = new Date(hpht.getTime() + 280 * 24 * 60 * 60 * 1000);
                const hplFormatted = `${hplDate.getFullYear()}-${String(hplDate.getMonth() + 1).padStart(2, '0')}-${String(hplDate.getDate()).padStart(2, '0')}`;

                // Calculate trimester
                let trimester = 1;
                if (weeks >= 13 && weeks < 27) trimester = 2;
                else if (weeks >= 27) trimester = 3;

                // Calculate progress (0.0 - 1.0)
                const progress = Math.min(daysPregnant / 280, 1.0);

                // Only return as pregnant if <= 42 weeks
                if (weeks <= 42) {
                    // Get baby size for current week
                    const babySize = BABY_SIZES[weeks] || BABY_SIZES[Math.min(weeks, 40)] || { emoji: "👶", size: "Bayi", length: "-" };

                    // Get tip for closest milestone week
                    const milestoneWeeks = [4, 8, 12, 16, 20, 24, 28, 32, 36, 40];
                    const closestMilestone = milestoneWeeks.reduce((prev, curr) =>
                        Math.abs(curr - weeks) < Math.abs(prev - weeks) ? curr : prev
                    );
                    const tip = PREGNANCY_TIPS[closestMilestone] || "";

                    return res.json({
                        success: true,
                        data: {
                            is_pregnant: true,
                            has_given_birth: false,
                            weeks: weeks,
                            days: days,
                            trimester: trimester,
                            hpht: obstetriRows[0].hpht,
                            hpl: hplFormatted,
                            progress: progress,
                            baby_size: babySize,
                            tip: tip
                        }
                    });
                }
            }
        }

        // No pregnancy data
        res.json({
            success: true,
            data: {
                is_pregnant: false,
                has_given_birth: false
            }
        });
    } catch (error) {
        console.error('Error fetching pregnancy data:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch pregnancy data',
            error: error.message
        });
    }
});

// GET PATIENT BY ID (Protected)
router.get('/api/patients/:id', verifyToken, async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM patients WHERE id = ?', [req.params.id]);
        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Patient not found' });
        }
        res.json({ success: true, data: rows[0] });
    } catch (error) {
        console.error('Error fetching patient by ID:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch patient', error: error.message });
    }
});

// ==================== PROTECTED ENDPOINTS (WRITE) ====================

// ADD NEW PATIENT
router.post('/api/patients', verifyToken, validatePatient, async (req, res) => {
    try {
        const { id, full_name, whatsapp, birth_date } = req.body;
        
        if (!id || !full_name) {
            return res.status(400).json({ 
                success: false, 
                message: 'Missing required fields: id, full_name' 
            });
        }
        
        // Check if patient ID already exists
        const [existing] = await db.query('SELECT id FROM patients WHERE id = ?', [id]);
        if (existing.length > 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'Patient ID already exists' 
            });
        }
        
        // Calculate age from birth_date
        let age = null;
        if (birth_date) {
            const birthDate = new Date(birth_date);
            const today = new Date();
            age = today.getFullYear() - birthDate.getFullYear();
            const monthDiff = today.getMonth() - birthDate.getMonth();
            if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
                age--;
            }
        }
        
        const [result] = await db.query(
            'INSERT INTO patients (id, full_name, whatsapp, birth_date, age, patient_type) VALUES (?, ?, ?, ?, ?, ?)',
            [id, full_name, whatsapp || null, birth_date || null, age, 'walk-in']
        );
        
        // Invalidate patient list cache
        cache.delPattern('patients:list');

        // Log activity
        await activityLogger.logFromRequest(req, activityLogger.ACTIONS.ADD_PATIENT,
            `Added patient: ${full_name} (ID: ${id})`);

        res.status(201).json({
            success: true,
            message: 'Patient added successfully',
            id: id,
            age: age
        });
    } catch (error) {
        console.error('Error adding patient:', error);
        
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ 
                success: false, 
                message: 'Patient ID already exists' 
            });
        }
        
        res.status(500).json({ 
            success: false, 
            message: 'Failed to add patient', 
            error: error.message 
        });
    }
});

// GET OWN PROFILE (Patient can view their own profile)
router.get('/api/patients/profile', verifyToken, async (req, res) => {
    try {
        const userId = req.user.id; // From JWT token

        const [rows] = await db.query(
            `SELECT
                p.id,
                p.full_name as fullname,
                p.birth_date,
                p.age,
                p.phone,
                p.whatsapp,
                p.address,
                p.emergency_contact,
                p.marital_status,
                p.husband_name,
                p.husband_age,
                p.husband_job,
                p.occupation,
                p.education,
                p.insurance,
                p.nik,
                p.profile_completed,
                p.created_at,
                p.photo_url,
                u.email,
                COALESCE(p.photo_url, u.photo_url) as profile_picture
            FROM patients p
            LEFT JOIN users u ON p.id = u.new_id
            WHERE p.id = ?`,
            [userId]
        );

        if (rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Patient profile not found'
            });
        }

        res.json({
            success: true,
            user: rows[0]
        });
    } catch (error) {
        console.error('Error fetching patient profile:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch profile',
            error: error.message
        });
    }
});

// UPDATE OWN PROFILE (Patient can update their own profile)
router.put('/api/patients/profile/me', verifyToken, async (req, res) => {
    try {
        const userId = req.user.id; // From JWT token
        const {
            patient_name,
            patient_dob,
            patient_phone,
            patient_emergency_contact,
            patient_address,
            patient_marital_status,
            patient_husband_name,
            husband_age,
            husband_job,
            patient_occupation,
            patient_education,
            patient_insurance,
            nik
        } = req.body;

        // Calculate age from birth_date
        let age = null;
        if (patient_dob) {
            const birthDate = new Date(patient_dob);
            const today = new Date();
            age = today.getFullYear() - birthDate.getFullYear();
            const monthDiff = today.getMonth() - birthDate.getMonth();
            if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
                age--;
            }
        }

        // Update patient record
        const [result] = await db.query(
            `UPDATE patients SET
                full_name = ?,
                birth_date = ?,
                age = ?,
                phone = ?,
                whatsapp = ?,
                updated_at = NOW()
            WHERE id = ?`,
            [patient_name, patient_dob, age, patient_phone, patient_phone, userId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Patient profile not found' });
        }

        // Invalidate patient cache
        cache.delPattern('patients:');

        res.json({
            success: true,
            message: 'Profile updated successfully',
            data: {
                patient_id: userId
            }
        });
    } catch (error) {
        console.error('Error updating patient profile:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update profile',
            error: error.message
        });
    }
});

// UPDATE PATIENT
router.put('/api/patients/:id', verifyToken, validatePatient, async (req, res) => {
    try {
        const { full_name, whatsapp, birth_date, allergy, medical_history } = req.body;
        
        // Calculate age from birth_date
        let age = null;
        if (birth_date) {
            const birthDate = new Date(birth_date);
            const today = new Date();
            age = today.getFullYear() - birthDate.getFullYear();
            const monthDiff = today.getMonth() - birthDate.getMonth();
            if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
                age--;
            }
        }
        
        const [result] = await db.query(
            'UPDATE patients SET full_name = ?, whatsapp = ?, birth_date = ?, age = ?, allergy = ?, medical_history = ? WHERE id = ?',
            [full_name, whatsapp, birth_date, age, allergy || null, medical_history || null, req.params.id]
        );
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Patient not found' });
        }

        // Invalidate patient cache
        cache.delPattern('patients:');

        // Log activity
        await activityLogger.logFromRequest(req, activityLogger.ACTIONS.UPDATE_PATIENT,
            `Updated patient: ${full_name} (ID: ${req.params.id})`);

        res.json({ success: true, message: 'Patient updated successfully', age: age });
    } catch (error) {
        console.error('Error updating patient:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to update patient', 
            error: error.message 
        });
    }
});

// UPDATE LAST VISIT
router.patch('/api/patients/:id/visit', verifyToken, async (req, res) => {
    try {
        const [result] = await db.query(
            'UPDATE patients SET last_visit = NOW(), visit_count = visit_count + 1 WHERE id = ?',
            [req.params.id]
        );
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Patient not found' });
        }
        
        res.json({ success: true, message: 'Visit recorded successfully' });
    } catch (error) {
        console.error('Error updating visit:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to update visit', 
            error: error.message 
        });
    }
});

// UPDATE PATIENT STATUS
router.patch('/api/patients/:id/status', verifyToken, async (req, res) => {
    try {
        const { status } = req.body;
        
        if (!status || !['active', 'inactive'].includes(status)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid status. Must be "active" or "inactive"' 
            });
        }
        
        const [result] = await db.query(
            'UPDATE patients SET status = ?, updated_at = NOW() WHERE id = ?',
            [status, req.params.id]
        );
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Patient not found' });
        }

        // Invalidate cache
        cache.delPattern('patients:');

        res.json({
            success: true,
            message: `Patient status updated to ${status}`,
            data: { id: req.params.id, status }
        });
    } catch (error) {
        console.error('Error updating patient status:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to update patient status', 
            error: error.message 
        });
    }
});

// MARK PATIENT AS DELIVERED (creates birth_congratulations entry, supports multiple children)
router.post('/api/patients/:id/mark-delivered', verifyToken, async (req, res) => {
    try {
        const patientId = req.params.id;

        // Check if patient exists
        const [patientRows] = await db.query('SELECT id, full_name FROM patients WHERE id = ?', [patientId]);
        if (patientRows.length === 0) {
            return res.status(404).json({ success: false, message: 'Pasien tidak ditemukan' });
        }

        // Determine child_number (support multiple children)
        const [existingBirths] = await db.query(
            'SELECT MAX(child_number) as max_child FROM birth_congratulations WHERE patient_id = ?',
            [patientId]
        );
        const nextChildNumber = (existingBirths[0].max_child || 0) + 1;

        // Create birth_congratulations entry (minimal - patient fills the rest)
        await db.query(
            `INSERT INTO birth_congratulations (patient_id, child_number, birth_date, is_published, patient_data_submitted, patient_dismissed, created_at)
             VALUES (?, ?, CURDATE(), 0, 0, 0, NOW())`,
            [patientId, nextChildNumber]
        );

        // Invalidate cache
        cache.delPattern('patients:');

        res.json({
            success: true,
            child_number: nextChildNumber,
            message: `Pasien ${patientRows[0].full_name} berhasil ditandai sudah melahirkan (anak ke-${nextChildNumber})`
        });
    } catch (error) {
        console.error('Error marking patient as delivered:', error);
        res.status(500).json({
            success: false,
            message: 'Gagal menandai pasien melahirkan',
            error: error.message
        });
    }
});

// DELETE PATIENT - Handled by patients-auth.js to avoid route conflicts
// (All /api/patients CRUD is routed through patients-auth.js)

// GENERATE UNIQUE PATIENT ID
router.get('/api/patients/generate-id', async (req, res) => {
    try {
        // Get last patient ID
        const [rows] = await db.query('SELECT id FROM patients ORDER BY id DESC LIMIT 1');
        
        let newId;
        if (rows.length === 0) {
            newId = '10001'; // Start from 10001
        } else {
            const lastId = parseInt(rows[0].id);
            newId = (lastId + 1).toString();
        }
        
        res.json({ success: true, id: newId });
    } catch (error) {
        console.error('Error generating patient ID:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to generate patient ID', 
            error: error.message 
        });
    }
});

// ==================== MEDICATIONS (TERAPI) ====================

// GET medications/terapi for logged-in patient (Android App)
router.get('/api/patients/medications', verifyPatientToken, async (req, res) => {
    // Prevent browser caching - always fetch fresh data
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');

    try {
        const patientId = req.patient.id;

        // Get all visits with terapi data
        // Join sunday_clinic_records with medical_records (planning type has terapi)
        const [rows] = await db.query(`
            SELECT
                scr.id,
                scr.mr_id,
                DATE_FORMAT(scr.last_activity_at, '%d %b %Y') as visit_date,
                scr.last_activity_at as visit_datetime,
                JSON_UNQUOTE(JSON_EXTRACT(mr.record_data, '$.terapi')) as terapi,
                CASE
                    WHEN scr.last_activity_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1
                    ELSE 0
                END as is_current
            FROM sunday_clinic_records scr
            JOIN medical_records mr ON mr.mr_id = scr.mr_id
                AND mr.record_type = 'planning'
            WHERE scr.patient_id = ?
                AND JSON_EXTRACT(mr.record_data, '$.terapi') IS NOT NULL
                AND JSON_UNQUOTE(JSON_EXTRACT(mr.record_data, '$.terapi')) != ''
                AND JSON_UNQUOTE(JSON_EXTRACT(mr.record_data, '$.terapi')) != 'null'
            ORDER BY scr.last_activity_at DESC
        `, [patientId]);

        res.json({
            success: true,
            data: rows
        });
    } catch (error) {
        console.error('Error fetching medications:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch medications',
            error: error.message
        });
    }
});

// ==================== BIRTH CONGRATULATIONS ====================

// POST patient proactively reports childbirth (no staff pre-mark required)
router.post('/api/patient/birth-self-report', verifyPatientToken, async (req, res) => {
    try {
        const patientId = req.patient.id;
        const patientName = req.patient.full_name || req.patient.name || '';
        const { baby_name, gender, birth_date, birth_time, birth_weight, birth_length } = req.body;

        const normalizedBabyName = (baby_name || '').trim();
        const normalizedBirthWeight = (birth_weight || '').trim();

        if (!normalizedBabyName || !birth_date || !gender || !normalizedBirthWeight) {
            return res.status(400).json({
                success: false,
                message: 'Nama bayi, tanggal persalinan, jenis kelamin, dan berat badan wajib diisi'
            });
        }

        let normalizedGender = null;
        if (gender === 'Laki-laki' || gender === 'male') normalizedGender = 'male';
        if (gender === 'Perempuan' || gender === 'female') normalizedGender = 'female';

        if (!normalizedGender) {
            return res.status(400).json({ success: false, message: 'Jenis kelamin tidak valid' });
        }

        const [existingBirths] = await db.query(
            'SELECT MAX(child_number) as max_child FROM birth_congratulations WHERE patient_id = ?',
            [patientId]
        );
        const nextChildNumber = (existingBirths[0].max_child || 0) + 1;

        const hardcodedMessage = `Selamat atas kelahiran buah hati Ibu ${patientName} dan suami. Turut berbahagia melihat proses persalinan berjalan lancar dan si kecil lahir ke dunia dengan sehat. Terima kasih telah mempercayakan perjalanan kehamilan dan persalinan Ibu kepada saya dan tim. Semoga Ibu lekas pulih dan selamat menikmati momen bersama si kecil dan keluarga.`;

        const [insertResult] = await db.query(
            `INSERT INTO birth_congratulations (
                patient_id, child_number, baby_name, gender, birth_date, birth_time, birth_weight, birth_length,
                message, doctor_name, is_published, patient_data_submitted, patient_dismissed, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'dr. Dibya Arfianda, SpOG, M.Ked.Klin.', 1, 1, 0, NOW())`,
            [
                patientId,
                nextChildNumber,
                normalizedBabyName,
                normalizedGender,
                birth_date,
                birth_time || null,
                normalizedBirthWeight,
                birth_length || null,
                hardcodedMessage
            ]
        );

        res.json({
            success: true,
            message: 'Data kelahiran berhasil disimpan',
            data: {
                child_number: nextChildNumber,
                birth_id: insertResult.insertId || null
            }
        });
    } catch (error) {
        console.error('Error saving proactive patient birth data:', error);
        res.status(500).json({ success: false, message: 'Gagal menyimpan data kelahiran' });
    }
});

// GET pending birth entry (patient needs to fill data)
router.get('/api/patient/birth-pending', verifyPatientToken, async (req, res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    try {
        const patientId = req.patient.id;
        const [rows] = await db.query(
            `SELECT id, child_number, created_at FROM birth_congratulations
             WHERE patient_id = ? AND patient_data_submitted = 0
             ORDER BY child_number ASC LIMIT 1`,
            [patientId]
        );
        res.json({ success: true, pending: rows.length > 0 ? rows[0] : null });
    } catch (error) {
        console.error('Error fetching pending birth:', error);
        res.status(500).json({ success: false, message: 'Gagal memeriksa data lahiran' });
    }
});

// POST patient submits birth data (fills in data after staff marks delivered)
router.post('/api/patient/birth-data/:id', verifyPatientToken, async (req, res) => {
    try {
        const entryId = req.params.id;
        const patientId = req.patient.id;
        const patientName = req.patient.full_name || req.patient.name || '';
        const { baby_name, gender, birth_date, birth_time, birth_weight, birth_length } = req.body;

        let normalizedGender = null;
        if (gender === 'Laki-laki' || gender === 'male') normalizedGender = 'male';
        if (gender === 'Perempuan' || gender === 'female') normalizedGender = 'female';

        // Ensure this entry belongs to this patient and is still pending
        const [rows] = await db.query(
            'SELECT id FROM birth_congratulations WHERE id = ? AND patient_id = ? AND patient_data_submitted = 0',
            [entryId, patientId]
        );
        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Data tidak ditemukan atau sudah diisi' });
        }

        const hardcodedMessage = `Selamat atas kelahiran buah hati Ibu ${patientName} dan suami. Turut berbahagia melihat proses persalinan berjalan lancar dan si kecil lahir ke dunia dengan sehat. Terima kasih telah mempercayakan perjalanan kehamilan dan persalinan Ibu kepada saya dan tim. Semoga Ibu lekas pulih dan selamat menikmati momen bersama si kecil dan keluarga.`;

        await db.query(`
            UPDATE birth_congratulations SET
                baby_name = ?, gender = ?, birth_date = ?, birth_time = ?,
                birth_weight = ?, birth_length = ?,
                message = ?, doctor_name = 'dr. Dibya Arfianda, SpOG, M.Ked.Klin.',
                is_published = 1, patient_data_submitted = 1, patient_dismissed = 0
            WHERE id = ? AND patient_id = ?`,
            [baby_name || null, normalizedGender, birth_date || null, birth_time || null,
             birth_weight || null, birth_length || null,
             hardcodedMessage, entryId, patientId]
        );

        res.json({ success: true, message: 'Data kelahiran berhasil disimpan' });
    } catch (error) {
        console.error('Error saving patient birth data:', error);
        res.status(500).json({ success: false, message: 'Gagal menyimpan data kelahiran' });
    }
});

// POST patient edits additional birth details after publish (time and length)
router.post('/api/patient/birth-extra/:id', verifyPatientToken, async (req, res) => {
    try {
        const entryId = req.params.id;
        const patientId = req.patient.id;
        const { birth_time, birth_length } = req.body;

        const [rows] = await db.query(
            'SELECT id FROM birth_congratulations WHERE id = ? AND patient_id = ? LIMIT 1',
            [entryId, patientId]
        );

        if (!rows.length) {
            return res.status(404).json({ success: false, message: 'Data kelahiran tidak ditemukan' });
        }

        await db.query(
            `UPDATE birth_congratulations
             SET birth_time = COALESCE(?, birth_time),
                 birth_length = COALESCE(?, birth_length)
             WHERE id = ? AND patient_id = ?`,
            [birth_time || null, birth_length || null, entryId, patientId]
        );

        res.json({ success: true, message: 'Keterangan tambahan berhasil disimpan' });
    } catch (error) {
        console.error('Error saving patient birth extra details:', error);
        res.status(500).json({ success: false, message: 'Gagal menyimpan keterangan tambahan' });
    }
});

// POST patient submits testimonial once for birth card
router.post('/api/patient/birth-testimonial/:id', verifyPatientToken, async (req, res) => {
    try {
        await ensureBirthTestimonialColumns();

        const birthId = req.params.id;
        const patientId = req.patient.id;
        const testimonial = String(req.body?.testimonial || '').trim();

        if (!testimonial) {
            return res.status(400).json({
                success: false,
                message: 'Kesan dan pesan wajib diisi'
            });
        }

        if (testimonial.length > 2000) {
            return res.status(400).json({
                success: false,
                message: 'Kesan dan pesan maksimal 2000 karakter'
            });
        }

        const [rows] = await db.query(
            `SELECT id, patient_testimonial
             FROM birth_congratulations
             WHERE id = ? AND patient_id = ? AND is_published = 1
             LIMIT 1`,
            [birthId, patientId]
        );

        if (!rows.length) {
            return res.status(404).json({
                success: false,
                message: 'Kartu kelahiran tidak ditemukan'
            });
        }

        if (rows[0].patient_testimonial && String(rows[0].patient_testimonial).trim()) {
            return res.status(409).json({
                success: false,
                message: 'Testimoni sudah pernah dikirim'
            });
        }

        await db.query(
            `UPDATE birth_congratulations
             SET patient_testimonial = ?,
                 patient_testimonial_submitted_at = NOW()
             WHERE id = ? AND patient_id = ?`,
            [testimonial, birthId, patientId]
        );

        res.json({
            success: true,
            message: 'Terima kasih, testimoni berhasil dikirim'
        });
    } catch (error) {
        console.error('Error submitting patient birth testimonial:', error);
        res.status(500).json({
            success: false,
            message: 'Gagal mengirim testimoni'
        });
    }
});

// POST patient dismisses birth card (close)
router.post('/api/patient/birth-dismiss/:id', verifyPatientToken, async (req, res) => {
    try {
        const entryId = req.params.id;
        const patientId = req.patient.id;
        await db.query(
            'UPDATE birth_congratulations SET patient_dismissed = 1 WHERE id = ? AND patient_id = ?',
            [entryId, patientId]
        );
        res.json({ success: true });
    } catch (error) {
        console.error('Error dismissing birth card:', error);
        res.status(500).json({ success: false, message: 'Gagal menutup kartu' });
    }
});

// POST patient re-shows birth card from settings
router.post('/api/patient/birth-show/:id', verifyPatientToken, async (req, res) => {
    try {
        const entryId = req.params.id;
        const patientId = req.patient.id;
        await db.query(
            'UPDATE birth_congratulations SET patient_dismissed = 0 WHERE id = ? AND patient_id = ?',
            [entryId, patientId]
        );
        res.json({ success: true });
    } catch (error) {
        console.error('Error showing birth card:', error);
        res.status(500).json({ success: false, message: 'Gagal menampilkan kartu' });
    }
});

// GET all birth records for patient (for settings page)
router.get('/api/patient/birth-all', verifyPatientToken, async (req, res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    try {
        const patientId = req.patient.id;
        const [rows] = await db.query(`
            SELECT id, child_number, baby_name, gender, birth_date, birth_weight, birth_length,
                   is_published, patient_dismissed, patient_data_submitted
            FROM birth_congratulations WHERE patient_id = ?
            ORDER BY child_number ASC`, [patientId]);
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error('Error fetching all birth records:', error);
        res.status(500).json({ success: false, message: 'Gagal memuat data kelahiran' });
    }
});

// GET birth congratulations for logged-in patient (Patient Dashboard - legacy/staff-published)
router.get('/api/patient/birth-congratulations', verifyPatientToken, async (req, res) => {
    // Prevent browser caching - always fetch fresh data
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');

    try {
        const patientId = req.patient.id;

        const [rows] = await db.query(`
            SELECT
                id,
                baby_name,
                birth_date,
                birth_time,
                birth_weight,
                birth_length,
                gender,
                photo_url,
                photo_r2_key,
                message,
                doctor_name,
                theme_color,
                child_number,
                patient_dismissed,
                created_at
            FROM birth_congratulations
            WHERE patient_id = ? AND is_published = 1 AND patient_dismissed = 0
            ORDER BY child_number ASC
        `, [patientId]);

        if (rows.length === 0) {
            return res.json({ success: true, data: null });
        }

        const data = rows[0];

        // Regenerate signed URL if R2 key exists
        if (data.photo_r2_key) {
            try {
                data.photo_url = await r2Storage.getSignedDownloadUrl(data.photo_r2_key, 3600);
            } catch (r2Error) {
                console.error('Error generating signed URL:', r2Error);
            }
        }

        // Remove r2_key from response
        delete data.photo_r2_key;

        res.json({ success: true, data });
    } catch (error) {
        console.error('Error fetching birth congratulations:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch birth congratulations',
            error: error.message
        });
    }
});

// POST/PUT birth congratulations (Staff only)
router.post('/api/patients/:patientId/birth-congratulations', verifyToken, async (req, res) => {
    try {
        const { patientId } = req.params;
        const { baby_name, birth_date, birth_time, birth_weight, birth_length, gender, photo_url, message, is_published, theme_color } = req.body;

        // Check if record exists
        const [existing] = await db.query(
            'SELECT id FROM birth_congratulations WHERE patient_id = ?',
            [patientId]
        );

        if (existing.length > 0) {
            // Update existing
            await db.query(`
                UPDATE birth_congratulations SET
                    baby_name = COALESCE(?, baby_name),
                    birth_date = COALESCE(?, birth_date),
                    birth_time = COALESCE(?, birth_time),
                    birth_weight = COALESCE(?, birth_weight),
                    birth_length = COALESCE(?, birth_length),
                    gender = COALESCE(?, gender),
                    photo_url = COALESCE(?, photo_url),
                    message = COALESCE(?, message),
                    is_published = COALESCE(?, is_published),
                    theme_color = COALESCE(?, theme_color)
                WHERE patient_id = ?
            `, [baby_name, birth_date, birth_time, birth_weight, birth_length, gender, photo_url, message, is_published, theme_color, patientId]);

            res.json({ success: true, message: 'Birth congratulations updated' });
        } else {
            // Insert new
            await db.query(`
                INSERT INTO birth_congratulations
                (patient_id, baby_name, birth_date, birth_time, birth_weight, birth_length, gender, photo_url, message, is_published, theme_color)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [patientId, baby_name, birth_date, birth_time, birth_weight, birth_length, gender, photo_url, message, is_published || 0, theme_color || 'pink']);

            res.json({ success: true, message: 'Birth congratulations created' });
        }
    } catch (error) {
        console.error('Error saving birth congratulations:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to save birth congratulations',
            error: error.message
        });
    }
});

// Upload birth photo (Staff only)
router.post('/api/patients/:patientId/birth-congratulations/photo', verifyToken, birthPhotoUpload.single('photo'), async (req, res) => {
    try {
        const { patientId } = req.params;

        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No photo uploaded' });
        }

        // Resize image to max 1024px (width or height)
        const resizedBuffer = await sharp(req.file.buffer)
            .resize(1024, 1024, {
                fit: 'inside',
                withoutEnlargement: true
            })
            .jpeg({ quality: 85 })
            .toBuffer();

        // Upload to R2
        const dateFolder = new Date().toLocaleDateString('en-GB').replace(/\//g, '');
        const filename = `${patientId}_birth_${Date.now()}.jpg`;
        const folder = `birth-photos/${dateFolder}`;

        const uploadResult = await r2Storage.uploadFile(
            resizedBuffer,
            filename,
            'image/jpeg',
            folder
        );

        // Get signed URL for the photo (7 days = 604800 seconds, max allowed)
        const signedUrl = await r2Storage.getSignedDownloadUrl(uploadResult.key, 604800);

        // Update database - store both the signed URL and R2 key
        // The signed URL will be regenerated when needed via the GET endpoint
        await db.query(
            'UPDATE birth_congratulations SET photo_url = ?, photo_r2_key = ? WHERE patient_id = ?',
            [signedUrl, uploadResult.key, patientId]
        );

        res.json({
            success: true,
            message: 'Photo uploaded successfully',
            photo_url: signedUrl
        });
    } catch (error) {
        console.error('Error uploading birth photo:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to upload photo',
            error: error.message
        });
    }
});

// Upload birth photo (Patient self upload)
router.post('/api/patient/birth-photo/:id', verifyPatientToken, birthPhotoUpload.single('photo'), async (req, res) => {
    try {
        const birthId = req.params.id;
        const patientId = req.patient.id;

        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No photo uploaded' });
        }

        const [rows] = await db.query(
            'SELECT id, photo_r2_key FROM birth_congratulations WHERE id = ? AND patient_id = ? LIMIT 1',
            [birthId, patientId]
        );

        if (!rows.length) {
            return res.status(404).json({ success: false, message: 'Data kelahiran tidak ditemukan' });
        }

        // Resize image to max 1024px (width or height)
        const resizedBuffer = await sharp(req.file.buffer)
            .resize(1024, 1024, {
                fit: 'inside',
                withoutEnlargement: true
            })
            .jpeg({ quality: 85 })
            .toBuffer();

        // Upload to R2
        const dateFolder = new Date().toLocaleDateString('en-GB').replace(/\//g, '');
        const filename = `${patientId}_birth_${Date.now()}.jpg`;
        const folder = `birth-photos/${dateFolder}`;

        const uploadResult = await r2Storage.uploadFile(
            resizedBuffer,
            filename,
            'image/jpeg',
            folder
        );

        // Best effort cleanup old key if exists
        const oldKey = rows[0].photo_r2_key;
        if (oldKey) {
            try {
                await r2Storage.deleteFile(oldKey);
            } catch (deleteError) {
                console.error('Error deleting old birth photo from R2:', deleteError);
            }
        }

        // Get signed URL for the photo (7 days)
        const signedUrl = await r2Storage.getSignedDownloadUrl(uploadResult.key, 604800);

        await db.query(
            'UPDATE birth_congratulations SET photo_url = ?, photo_r2_key = ? WHERE id = ? AND patient_id = ?',
            [signedUrl, uploadResult.key, birthId, patientId]
        );

        res.json({
            success: true,
            message: 'Photo uploaded successfully',
            photo_url: signedUrl
        });
    } catch (error) {
        console.error('Error uploading patient birth photo:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to upload photo',
            error: error.message
        });
    }
});

// GET all birth congratulations (Staff only - for admin panel)
router.get('/api/patients/birth-congratulations/all', verifyToken, async (req, res) => {
    try {
        await ensureBirthTestimonialColumns();

        const [rows] = await db.query(`
            SELECT bc.*, p.full_name as patient_name
            FROM birth_congratulations bc
            JOIN patients p ON bc.patient_id = p.id
            ORDER BY bc.created_at DESC
        `);

        // Regenerate signed URLs for all photos
        for (const row of rows) {
            if (row.photo_r2_key) {
                try {
                    row.photo_url = await r2Storage.getSignedDownloadUrl(row.photo_r2_key, 3600);
                } catch (r2Error) {
                    console.error('Error generating signed URL:', r2Error);
                }
            }
        }

        res.json({ success: true, data: rows });
    } catch (error) {
        console.error('Error fetching all birth congratulations:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch birth congratulations',
            error: error.message
        });
    }
});

// GET patient testimonials from birth cards (Staff only)
router.get('/api/birth-testimonials', verifyToken, async (req, res) => {
    try {
        await ensureBirthTestimonialColumns();

        const [rows] = await db.query(`
            SELECT
                bc.id,
                bc.patient_id,
                p.full_name AS patient_name,
                bc.child_number,
                bc.baby_name,
                bc.gender,
                bc.birth_date,
                bc.birth_time,
                bc.patient_testimonial,
                bc.patient_testimonial_submitted_at,
                bc.photo_url,
                bc.photo_r2_key
            FROM birth_congratulations bc
            JOIN patients p ON p.id = bc.patient_id
            WHERE bc.patient_testimonial IS NOT NULL
              AND TRIM(bc.patient_testimonial) <> ''
            ORDER BY bc.patient_testimonial_submitted_at DESC, bc.created_at DESC
        `);

        for (const row of rows) {
            if (row.photo_r2_key) {
                try {
                    row.photo_url = await r2Storage.getSignedDownloadUrl(row.photo_r2_key, 3600);
                } catch (r2Error) {
                    console.error('Error generating signed URL for testimonial list:', r2Error);
                }
            }
            delete row.photo_r2_key;
        }

        res.json({ success: true, data: rows });
    } catch (error) {
        console.error('Error fetching birth testimonials:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch birth testimonials',
            error: error.message
        });
    }
});

// DELETE birth congratulations (Staff only)
router.delete('/api/patients/:patientId/birth-congratulations', verifyToken, async (req, res) => {
    try {
        const { patientId } = req.params;

        // Get R2 key to delete photo
        const [existing] = await db.query(
            'SELECT photo_r2_key FROM birth_congratulations WHERE patient_id = ?',
            [patientId]
        );

        if (existing.length > 0 && existing[0].photo_r2_key) {
            // Delete photo from R2
            try {
                await r2Storage.deleteFile(existing[0].photo_r2_key);
            } catch (r2Error) {
                console.error('Error deleting photo from R2:', r2Error);
            }
        }

        await db.query('DELETE FROM birth_congratulations WHERE patient_id = ?', [patientId]);

        res.json({ success: true, message: 'Birth congratulations deleted' });
    } catch (error) {
        console.error('Error deleting birth congratulations:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete birth congratulations',
            error: error.message
        });
    }
});

router.getEnrichmentStats = getEnrichmentStats;
module.exports = router;


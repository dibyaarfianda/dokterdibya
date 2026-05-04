// routes/appointments.js
const express = require('express');
const router = express.Router();
const pool = require('../db');
const { verifyToken, requireSuperadmin, requirePermission } = require('../middleware/auth');
const { createSession, countMatchingFactors } = require('../services/medifyHttpService');

const MEDIFY_LIVE_QUEUE_CACHE_TTL_MS = 30000;
const MEDIFY_LOCATION_CONFIG = {
    rsia_melinda: {
        label: 'RSIA Melinda',
        batchPrefix: 'melinda-open',
        clinicLabel: 'Poli Obgyn',
        queueRequest: {
            poliId: '1',
            groupId: '0',
            showId: '0',
            byDokter: '0'
        }
    },
    rsud_gambiran: {
        label: 'RSUD Gambiran',
        batchPrefix: 'gambiran-open',
        clinicLabel: 'Poli Obgyn',
        queueRequest: {
            queueUrl: 'https://simrsg.kedirikota.go.id/rawatjalan/poliklinik/5'
        }
    }
};
const medifyLiveQueueCache = {
    rsia_melinda: {
        payload: null,
        expiresAt: 0
    },
    rsud_gambiran: {
        payload: null,
        expiresAt: 0
    }
};
let patientsHasNikColumn = null;

function getMedifyLocationConfig(location) {
    return MEDIFY_LOCATION_CONFIG[location] || null;
}

function normalizePatientName(name) {
    if (!name) return '';
    return String(name)
        .toLowerCase()
        .replace(/^(ny\.?|tn\.?|sdr\.?|sdri\.?|dr\.?|drg\.?)\s*/i, '')
        .replace(/[.,]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function normalizeNik(nik) {
    return String(nik || '').replace(/\D/g, '').trim();
}

function formatUtcYmd(date) {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getGmt7DayWindow(baseDate = new Date()) {
    const gmt7OffsetMs = 7 * 60 * 60 * 1000;
    const gmt7Now = new Date(baseDate.getTime() + gmt7OffsetMs);

    const year = gmt7Now.getUTCFullYear();
    const monthIndex = gmt7Now.getUTCMonth();
    const day = gmt7Now.getUTCDate();

    const dayStartUtc = new Date(Date.UTC(year, monthIndex, day));
    const dayEndUtc = new Date(dayStartUtc.getTime() + 24 * 60 * 60 * 1000);

    const dateStr = formatUtcYmd(dayStartUtc);
    const nextDateStr = formatUtcYmd(dayEndUtc);

    return {
        startDateTime: `${dateStr} 00:00:00`,
        endDateTime: `${nextDateStr} 00:00:00`
    };
}

function resolveLocalPatient(queueItem, patients) {
    const queueName = normalizePatientName(queueItem.patientName);
    if (!queueName) {
        return null;
    }

    const candidatePatients = patients.filter((patient) => {
        const patientName = normalizePatientName(patient.full_name);
        if (!patientName) {
            return false;
        }

        return patientName === queueName
            || patientName.includes(queueName)
            || queueName.includes(patientName);
    });

    if (!candidatePatients.length) {
        return null;
    }

    const scoredPatients = candidatePatients.map((patient) => ({
        patient,
        score: countMatchingFactors({
            name: queueItem.patientName,
            usia: queueItem.age
        }, patient).matchCount
    }));

    const bestScore = Math.max(...scoredPatients.map((item) => item.score));
    if (bestScore < 2) {
        return null;
    }

    const bestMatches = scoredPatients.filter((item) => item.score === bestScore);
    if (bestMatches.length !== 1) {
        return null;
    }

    return bestMatches[0].patient;
}

function buildPatientByNikMap(patients) {
    const patientByNik = new Map();

    for (const patient of patients) {
        const normalizedNik = normalizeNik(patient.nik);
        if (!normalizedNik) {
            continue;
        }

        if (!patientByNik.has(normalizedNik)) {
            patientByNik.set(normalizedNik, patient);
            continue;
        }

        patientByNik.set(normalizedNik, null);
    }

    return patientByNik;
}

async function getMelindaResolverPatients() {
    if (patientsHasNikColumn === null) {
        const [columns] = await pool.query(`SHOW COLUMNS FROM patients LIKE 'nik'`);
        patientsHasNikColumn = Array.isArray(columns) && columns.length > 0;
    }

    const nikSelect = patientsHasNikColumn ? 'nik' : 'NULL AS nik';
    const [patients] = await pool.query(`
        SELECT id, full_name, birth_date, age, whatsapp, phone, ${nikSelect}
        FROM patients
        WHERE full_name IS NOT NULL
    `);

    return patients;
}

async function generateMelindaPlaceholderPatientId(connection) {
    const year = new Date().getFullYear();
    const [rows] = await connection.query(
        `SELECT id
         FROM patients
         WHERE id LIKE ?
         ORDER BY id DESC
         LIMIT 1`,
        [`P${year}%`]
    );

    let nextNumber = 1;
    if (rows.length > 0) {
        const match = String(rows[0].id || '').match(/^P\d{4}(\d+)$/);
        if (match) {
            nextNumber = parseInt(match[1], 10) + 1;
        }
    }

    return `P${year}${String(nextNumber).padStart(3, '0')}`;
}

async function createMelindaPlaceholderPatient(queueItem) {
    const patientName = String(queueItem?.patientName || '').trim();
    if (!patientName) {
        throw new Error('Nama pasien wajib diisi untuk membuat placeholder lokal');
    }

    const patientAge = Number.isFinite(Number(queueItem?.age)) ? Number(queueItem.age) : null;
    const maxRetries = 3;
    let lastError = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        const connection = await pool.getConnection();

        try {
            await connection.beginTransaction();

            const patientId = await generateMelindaPlaceholderPatientId(connection);
            await connection.query(
                `INSERT INTO patients (id, full_name, age, patient_type)
                 VALUES (?, ?, ?, ?)`,
                [patientId, patientName, patientAge, 'walk-in']
            );

            await connection.commit();
            connection.release();

            return {
                id: patientId,
                full_name: patientName,
                age: patientAge,
                patient_type: 'walk-in'
            };
        } catch (error) {
            await connection.rollback();
            connection.release();
            lastError = error;

            if (error.code === 'ER_DUP_ENTRY' && attempt < maxRetries) {
                continue;
            }

            throw error;
        }
    }

    throw lastError || new Error('Gagal membuat placeholder pasien Medify');
}

async function cacheMedifyCpptForPrefill({ location, patient, queueItem, createdBy, session }) {
    const locationConfig = getMedifyLocationConfig(location);
    if (!locationConfig) {
        return {
            status: 'unavailable',
            reason: 'unsupported_location'
        };
    }

    if (!patient?.id || !queueItem?.medId) {
        return {
            status: 'unavailable',
            reason: 'missing_med_id'
        };
    }

    const [existingRows] = await pool.query(
        `SELECT id, status, cppt_data
         FROM medify_import_jobs
         WHERE patient_id = ?
                     AND simrs_source = ?
           AND simrs_med_id = ?
         ORDER BY COALESCE(completed_at, created_at) DESC, id DESC
         LIMIT 1`,
                [patient.id, location, queueItem.medId]
    );

    const existingJob = existingRows[0] || null;
    if (existingJob?.status === 'success' && existingJob?.cppt_data) {
        return {
            status: 'existing',
            reason: null
        };
    }

    try {
        const cpptResult = await session.extractCPPT(queueItem.medId);
        const jobStatus = cpptResult?.skipReason ? 'skipped' : 'success';
        const errorMessage = cpptResult?.skipReason || null;
        const cpptPayload = cpptResult?.skipReason ? null : JSON.stringify(cpptResult);

        if (existingJob?.id) {
            await pool.query(
                `UPDATE medify_import_jobs
                 SET patient_name = ?,
                     patient_age = ?,
                     status = ?,
                     cppt_data = ?,
                     error_message = ?,
                     completed_at = NOW()
                 WHERE id = ?`,
                [
                    patient.full_name,
                    patient.age || queueItem.age || null,
                    jobStatus,
                    cpptPayload,
                    errorMessage,
                    existingJob.id
                ]
            );
        } else {
            await pool.query(
                `INSERT INTO medify_import_jobs
                 (batch_id, patient_id, patient_name, patient_age, simrs_source, status, created_by, simrs_med_id, cppt_data, error_message, completed_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
                [
                    `${locationConfig.batchPrefix}-${patient.id}-${Date.now()}`,
                    patient.id,
                    patient.full_name,
                    patient.age || queueItem.age || null,
                    location,
                    jobStatus,
                    createdBy || null,
                    queueItem.medId,
                    cpptPayload,
                    errorMessage
                ]
            );
        }

        return {
            status: jobStatus,
            reason: errorMessage
        };
    } catch (error) {
        if (existingJob?.id) {
            await pool.query(
                `UPDATE medify_import_jobs
                 SET status = 'failed',
                     error_message = ?,
                     completed_at = NOW()
                 WHERE id = ?`,
                [error.message, existingJob.id]
            );
        } else {
            await pool.query(
                `INSERT INTO medify_import_jobs
                 (batch_id, patient_id, patient_name, patient_age, simrs_source, status, created_by, simrs_med_id, error_message, completed_at)
                 VALUES (?, ?, ?, ?, ?, 'failed', ?, ?, ?, NOW())`,
                [
                    `${locationConfig.batchPrefix}-${patient.id}-${Date.now()}`,
                    patient.id,
                    patient.full_name,
                    patient.age || queueItem.age || null,
                    location,
                    createdBy || null,
                    queueItem.medId,
                    error.message
                ]
            );
        }

        return {
            status: 'failed',
            reason: error.message
        };
    }
}

async function resolveMedifyQueuePatient(location, queueItem, options = {}) {
    const locationConfig = getMedifyLocationConfig(location);
    if (!locationConfig) {
        throw new Error(`Unsupported Medify location: ${location}`);
    }

    const patients = await getMelindaResolverPatients();

    const patientByNik = buildPatientByNikMap(patients);
    const session = createSession(location);

    try {
        await session.login();

        let identityNik = null;
        if (queueItem.medId) {
            try {
                const identity = await session.extractPatientIdentity(queueItem.medId);
                identityNik = normalizeNik(identity.no_identitas);
            } catch (error) {
                identityNik = null;
            }
        }

        let patient = null;
        let matchedBy = null;
        let patientAutoCreated = false;

        if (identityNik) {
            patient = patientByNik.get(identityNik) || null;
            matchedBy = patient ? 'nik' : null;
        }

        if (!patient) {
            patient = resolveLocalPatient(queueItem, patients);
            matchedBy = patient ? 'name_age' : matchedBy;
        }

        if (!patient?.id && options.autoCreatePatient) {
            patient = await createMelindaPlaceholderPatient(queueItem);
            matchedBy = 'auto_created';
            patientAutoCreated = true;
        }

        if (!patient?.id) {
            return {
                success: false,
                matchedBy,
                patientId: null,
                existingMrId: null,
                existingRecordStatus: null,
                identityNik,
                message: identityNik
                    ? 'Pasien tidak ditemukan dengan NIK tersebut di database lokal'
                    : 'Pasien tidak berhasil dicocokkan ke database lokal'
            };
        }

        const prefillSync = await cacheMedifyCpptForPrefill({
            location,
            patient,
            queueItem,
            createdBy: options.createdBy || null,
            session
        });

        const { startDateTime, endDateTime } = getGmt7DayWindow();
        const [recordRows] = await pool.query(
            `SELECT patient_id, mr_id, status
             FROM sunday_clinic_records
             WHERE patient_id = ?
               AND visit_location = ?
               AND created_at >= ?
               AND created_at < ?
             ORDER BY created_at DESC, id DESC
             LIMIT 1`,
                        [patient.id, location, startDateTime, endDateTime]
        );

        return {
            success: true,
            matchedBy,
            patientId: patient.id,
            patientName: patient.full_name,
            existingMrId: recordRows[0]?.mr_id || null,
            existingRecordStatus: recordRows[0]?.status || null,
            identityNik,
            patientAutoCreated,
            prefillStatus: prefillSync.status,
            prefillReason: prefillSync.reason || null
        };
    } finally {
        await session.close();
    }
}

async function fetchMedifyLiveQueuePayload(location, { useCache = true } = {}) {
    const locationConfig = getMedifyLocationConfig(location);
    if (!locationConfig) {
        throw new Error(`Unsupported Medify location: ${location}`);
    }

    const cacheEntry = medifyLiveQueueCache[location];
    if (useCache && cacheEntry && cacheEntry.payload && cacheEntry.expiresAt > Date.now()) {
        return cacheEntry.payload;
    }

    const session = createSession(location);
    try {
        await session.login();
        const queueData = await session.getPolyclinicQueue({
            ...(locationConfig.queueRequest || {}),
            clinicLabel: locationConfig.clinicLabel,
            doctorFilter: 'Semua Dokter',
            onlyToday: false
        });

        const payload = {
            success: true,
            source: 'medify_live',
            location,
            queue: queueData
        };

        if (cacheEntry) {
            cacheEntry.payload = payload;
            cacheEntry.expiresAt = Date.now() + MEDIFY_LIVE_QUEUE_CACHE_TTL_MS;
        }

        return payload;
    } finally {
        await session.close();
    }
}

async function runMedifyQueueRobot(location, options = {}) {
    const queuePayload = await fetchMedifyLiveQueuePayload(location, {
        useCache: options.useCache !== false
    });

    let items = Array.isArray(queuePayload.queue?.items) ? queuePayload.queue.items : [];
    if (Number.isFinite(options.limit) && options.limit > 0) {
        items = items.slice(0, options.limit);
    }

    const summary = {
        queueCount: Array.isArray(queuePayload.queue?.items) ? queuePayload.queue.items.length : 0,
        selectedCount: items.length,
        resolved: 0,
        unresolved: 0,
        autoCreated: 0,
        existingDrd: 0,
        prefillReady: 0,
        prefillSkipped: 0,
        prefillUnavailable: 0,
        matchedByNik: 0,
        matchedByNameAge: 0,
        failures: []
    };

    for (const item of items) {
        const resolution = await resolveMedifyQueuePatient(location, {
            medId: item.medId || null,
            patientName: item.patientName || '',
            age: Number.isFinite(item.age) ? item.age : null,
            medicalRecordNo: item.medicalRecordNo || null
        }, {
            createdBy: options.createdBy || null,
            autoCreatePatient: options.autoCreatePatient === true
        });

        if (!resolution.success) {
            summary.unresolved++;
            summary.failures.push({
                queueNumber: item.queueNumber || null,
                patientName: item.patientName || null,
                message: resolution.message || 'Failed to resolve patient'
            });
            continue;
        }

        summary.resolved++;

        if (resolution.patientAutoCreated) {
            summary.autoCreated++;
        }

        if (resolution.matchedBy === 'nik') {
            summary.matchedByNik++;
        } else if (resolution.matchedBy === 'name_age') {
            summary.matchedByNameAge++;
        }

        if (resolution.existingMrId) {
            summary.existingDrd++;
        }

        if (resolution.prefillStatus === 'success' || resolution.prefillStatus === 'existing') {
            summary.prefillReady++;
        } else if (resolution.prefillStatus === 'skipped') {
            summary.prefillSkipped++;
        } else {
            summary.prefillUnavailable++;
        }
    }

    return {
        success: true,
        location,
        summary
    };
}

// ==================== PUBLIC ROUTES ====================

// GET all appointments (with optional filters)
router.get('/', verifyToken, requirePermission('booking.view'), async (req, res) => {
    try {
        const { patient_id, start_date, end_date, status, today_only } = req.query;
        
        let query = 'SELECT * FROM appointments WHERE 1=1';
        const params = [];
        
        if (patient_id) {
            query += ' AND patient_id = ?';
            params.push(patient_id);
        }
        
        if (start_date) {
            query += ' AND appointment_date >= ?';
            params.push(start_date);
        }
        
        if (end_date) {
            query += ' AND appointment_date <= ?';
            params.push(end_date);
        }
        
        if (status) {
            query += ' AND status = ?';
            params.push(status);
        }
        
        if (today_only === 'true') {
            query += ' AND appointment_date = CURDATE()';
        }
        
        query += ' ORDER BY appointment_date ASC, appointment_time ASC';
        
        const [rows] = await pool.query(query, params);
        
        res.json({
            success: true,
            data: rows
        });
    } catch (error) {
        console.error('Error fetching appointments:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch appointments',
            error: error.message
        });
    }
});

// GET appointments by hospital location
router.get('/hospital/:location', verifyToken, requirePermission('booking.view'), async (req, res) => {
    try {
        const { location } = req.params;

        // Get appointments for this hospital with patient age, upcoming first
        const [rows] = await pool.query(`
            SELECT
                a.id, a.patient_id, a.patient_name, a.hospital_location, a.appointment_date,
                a.appointment_time, a.appointment_type, a.location, a.notes, a.complaint,
                a.detected_category, a.status, a.created_at,
                p.age as patient_age,
                p.birth_date as patient_birth_date
            FROM appointments a
            LEFT JOIN patients p ON a.patient_id = p.id
            WHERE a.hospital_location = ?
            AND a.appointment_date >= CURDATE()
            ORDER BY a.appointment_date ASC, a.appointment_time ASC
        `, [location]);

        // Calculate age from birth_date if age is not available
        const appointmentsWithAge = rows.map(apt => {
            if (!apt.patient_age && apt.patient_birth_date) {
                const today = new Date();
                const birthDate = new Date(apt.patient_birth_date);
                let age = today.getFullYear() - birthDate.getFullYear();
                const monthDiff = today.getMonth() - birthDate.getMonth();
                if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
                    age--;
                }
                apt.patient_age = age >= 0 ? age : null;
            }
            return apt;
        });

        res.json({
            success: true,
            appointments: appointmentsWithAge
        });
    } catch (error) {
        console.error('Error fetching hospital appointments:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch hospital appointments',
            error: error.message
        });
    }
});

router.get('/hospital/:location/live-queue', verifyToken, requirePermission('booking.view'), async (req, res) => {
    try {
        const { location } = req.params;
        const locationConfig = getMedifyLocationConfig(location);

        if (!locationConfig) {
            return res.status(400).json({
                success: false,
                message: 'Live queue hanya tersedia untuk RSIA Melinda dan RSUD Gambiran'
            });
        }

        const payload = await fetchMedifyLiveQueuePayload(location);
        res.json(payload);
    } catch (error) {
        console.error(`Error fetching Medify live queue for ${req.params.location}:`, error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch Medify live queue',
            error: error.message
        });
    }
});

router.post('/hospital/:location/run-robot', verifyToken, requirePermission('booking.view'), async (req, res) => {
    try {
        const { location } = req.params;
        const { limit, useCache, autoCreatePatient } = req.body || {};
        const locationConfig = getMedifyLocationConfig(location);

        if (!locationConfig) {
            return res.status(400).json({
                success: false,
                message: 'Robot hanya tersedia untuk RSIA Melinda dan RSUD Gambiran'
            });
        }

        const result = await runMedifyQueueRobot(location, {
            createdBy: req.user?.id || null,
            limit: Number.isFinite(Number(limit)) ? Number(limit) : null,
            useCache: useCache !== false,
            autoCreatePatient: autoCreatePatient !== false
        });

        res.json(result);
    } catch (error) {
        console.error(`Error running Medify robot for ${req.params.location}:`, error);
        res.status(500).json({
            success: false,
            message: 'Failed to run Medify robot',
            error: error.message
        });
    }
});

router.post('/hospital/:location/resolve-queue-patient', verifyToken, requirePermission('booking.view'), async (req, res) => {
    try {
        const { location } = req.params;
        const { medId, patientName, age, medicalRecordNo, autoCreatePatient } = req.body || {};
        const locationConfig = getMedifyLocationConfig(location);

        if (!locationConfig) {
            return res.status(400).json({
                success: false,
                message: 'Resolve queue patient hanya tersedia untuk RSIA Melinda dan RSUD Gambiran'
            });
        }

        if (!medId && !patientName) {
            return res.status(400).json({
                success: false,
                message: 'medId atau patientName wajib diisi'
            });
        }

        const resolution = await resolveMedifyQueuePatient(location, {
            medId: medId || null,
            patientName: patientName || '',
            age: Number.isFinite(Number(age)) ? Number(age) : null,
            medicalRecordNo: medicalRecordNo || null
        }, {
            createdBy: req.user?.id || null,
            autoCreatePatient: autoCreatePatient === true || autoCreatePatient === 'true'
        });

        if (!resolution.success) {
            return res.status(404).json(resolution);
        }

        res.json(resolution);
    } catch (error) {
        console.error(`Error resolving Medify queue patient for ${req.params.location}:`, error);
        res.status(500).json({
            success: false,
            message: 'Failed to resolve Medify queue patient',
            error: error.message
        });
    }
});

// GET single appointment by ID
router.get('/:id', async (req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT * FROM appointments WHERE id = ?',
            [req.params.id]
        );
        
        if (rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Appointment not found'
            });
        }
        
        res.json({
            success: true,
            data: rows[0]
        });
    } catch (error) {
        console.error('Error fetching appointment:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch appointment',
            error: error.message
        });
    }
});

// GET latest appointment for a specific patient
router.get('/patient/:patient_id/latest', verifyToken, requirePermission('booking.view'), async (req, res) => {
    try {
        const [rows] = await pool.query(
            `SELECT * FROM appointments 
             WHERE patient_id = ? 
             ORDER BY appointment_date DESC, appointment_time DESC 
             LIMIT 1`,
            [req.params.patient_id]
        );
        
        if (rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'No appointments found for this patient'
            });
        }
        
        res.json({
            success: true,
            data: rows[0]
        });
    } catch (error) {
        console.error('Error fetching latest appointment:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch latest appointment',
            error: error.message
        });
    }
});

// ==================== PROTECTED ROUTES (require auth) ====================

// POST new appointment
router.post('/', verifyToken, requirePermission('booking.manage'), async (req, res) => {
    try {
        const {
            patient_id,
            patient_name,
            appointment_date,
            appointment_time,
            appointment_type,
            location,
            notes,
            whatsapp_reminder,
            reminder_time,
            created_by
        } = req.body;
        
        // Validation
        if (!patient_id || !patient_name || !appointment_date || !appointment_time) {
            return res.status(400).json({
                success: false,
                message: 'patient_id, patient_name, appointment_date, and appointment_time are required'
            });
        }
        
        // Check for existing appointment at same time
        const [existing] = await pool.query(
            'SELECT id FROM appointments WHERE appointment_date = ? AND appointment_time = ? AND status IN (?, ?)',
            [appointment_date, appointment_time, 'scheduled', 'confirmed']
        );
        
        if (existing.length > 0) {
            return res.status(409).json({
                success: false,
                message: 'Appointment slot already booked'
            });
        }
        
        // Insert appointment
        const [result] = await pool.query(
            `INSERT INTO appointments (
                patient_id, patient_name, appointment_date, appointment_time, 
                appointment_type, location, notes, whatsapp_reminder, 
                reminder_time, created_by, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                patient_id,
                patient_name,
                appointment_date,
                appointment_time,
                appointment_type || 'Konsultasi',
                location || 'Klinik',
                notes || null,
                whatsapp_reminder || false,
                reminder_time || 60,
                created_by || 'System',
                'scheduled'
            ]
        );
        
        // Get created appointment
        const [appointment] = await pool.query(
            'SELECT * FROM appointments WHERE id = ?',
            [result.insertId]
        );
        
        res.status(201).json({
            success: true,
            message: 'Appointment created successfully',
            data: appointment[0]
        });
    } catch (error) {
        console.error('Error creating appointment:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create appointment',
            error: error.message
        });
    }
});

// PATCH update appointment status only
router.patch('/:id/status', verifyToken, requirePermission('booking.manage'), async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        // Validate status
        const validStatuses = ['scheduled', 'confirmed', 'completed', 'cancelled', 'no_show'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Status tidak valid'
            });
        }

        // Check if appointment exists
        const [existing] = await pool.query(
            'SELECT * FROM appointments WHERE id = ?',
            [id]
        );

        if (existing.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Appointment tidak ditemukan'
            });
        }

        // Update status
        await pool.query(
            'UPDATE appointments SET status = ?, updated_at = NOW() WHERE id = ?',
            [status, id]
        );

        res.json({
            success: true,
            message: 'Status appointment berhasil diupdate'
        });
    } catch (error) {
        console.error('Error updating appointment status:', error);
        res.status(500).json({
            success: false,
            message: 'Gagal mengupdate status appointment',
            error: error.message
        });
    }
});

// PUT update appointment
router.put('/:id', verifyToken, requirePermission('booking.manage'), async (req, res) => {
    try {
        const { id } = req.params;
        const {
            appointment_date,
            appointment_time,
            appointment_type,
            location,
            notes,
            status,
            whatsapp_reminder,
            reminder_time
        } = req.body;
        
        // Check if appointment exists
        const [existing] = await pool.query(
            'SELECT * FROM appointments WHERE id = ?',
            [id]
        );
        
        if (existing.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Appointment not found'
            });
        }
        
        // Check for slot conflict if date/time changed
        if (appointment_date || appointment_time) {
            const checkDate = appointment_date || existing[0].appointment_date;
            const checkTime = appointment_time || existing[0].appointment_time;
            
            const [conflicts] = await pool.query(
                'SELECT id FROM appointments WHERE appointment_date = ? AND appointment_time = ? AND id != ? AND status IN (?, ?)',
                [checkDate, checkTime, id, 'scheduled', 'confirmed']
            );
            
            if (conflicts.length > 0) {
                return res.status(409).json({
                    success: false,
                    message: 'Appointment slot already booked'
                });
            }
        }
        
        // Build update query dynamically
        const updates = [];
        const values = [];
        
        if (appointment_date) { updates.push('appointment_date = ?'); values.push(appointment_date); }
        if (appointment_time) { updates.push('appointment_time = ?'); values.push(appointment_time); }
        if (appointment_type) { updates.push('appointment_type = ?'); values.push(appointment_type); }
        if (location !== undefined) { updates.push('location = ?'); values.push(location); }
        if (notes !== undefined) { updates.push('notes = ?'); values.push(notes || null); }
        if (status) { updates.push('status = ?'); values.push(status); }
        if (whatsapp_reminder !== undefined) { updates.push('whatsapp_reminder = ?'); values.push(whatsapp_reminder); }
        if (reminder_time !== undefined) { updates.push('reminder_time = ?'); values.push(reminder_time); }
        
        if (updates.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No fields to update'
            });
        }
        
        values.push(id);
        
        await pool.query(
            `UPDATE appointments SET ${updates.join(', ')} WHERE id = ?`,
            values
        );
        
        // Get updated appointment
        const [appointment] = await pool.query(
            'SELECT * FROM appointments WHERE id = ?',
            [id]
        );
        
        res.json({
            success: true,
            message: 'Appointment updated successfully',
            data: appointment[0]
        });
    } catch (error) {
        console.error('Error updating appointment:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update appointment',
            error: error.message
        });
    }
});

// DELETE appointment (Superadmin/Dokter only)
router.delete('/:id', verifyToken, requireSuperadmin, async (req, res) => {
    try {
        const { id } = req.params;
        
        // Check if appointment exists
        const [existing] = await pool.query(
            'SELECT * FROM appointments WHERE id = ?',
            [id]
        );
        
        if (existing.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Appointment not found'
            });
        }
        
        // Soft delete by setting status to cancelled
        await pool.query(
            'UPDATE appointments SET status = ? WHERE id = ?',
            ['cancelled', id]
        );
        
        res.json({
            success: true,
            message: 'Appointment cancelled successfully'
        });
    } catch (error) {
        console.error('Error deleting appointment:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete appointment',
            error: error.message
        });
    }
});

// HARD DELETE - Permanently remove appointment from database (Superadmin/Dokter only)
router.delete('/:id/permanent', verifyToken, requireSuperadmin, async (req, res) => {
    try {
        const { id } = req.params;
        
        // Check if appointment exists
        const [existing] = await pool.query(
            'SELECT * FROM appointments WHERE id = ?',
            [id]
        );
        
        if (existing.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Appointment not found'
            });
        }
        
        // Permanently delete from database
        await pool.query('DELETE FROM appointments WHERE id = ?', [id]);
        
        res.json({
            success: true,
            message: 'Appointment permanently deleted'
        });
    } catch (error) {
        console.error('Error permanently deleting appointment:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to permanently delete appointment',
            error: error.message
        });
    }
});

module.exports = router;


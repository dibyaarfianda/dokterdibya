'use strict';

const express = require('express');
const router = express.Router();
const db = require('../db');
const logger = require('../utils/logger');
const { verifyToken, requireSuperadmin } = require('../middleware/auth');
const { findRecordByMrId } = require('../services/sundayClinicService');
const { ROLE_NAMES, isSuperadminRole } = require('../constants/roles');
const activityLogger = require('../services/activityLogger');

// Import realtime sync for broadcasting notifications
let realtimeSync = null;
try {
    realtimeSync = require('../realtime-sync');
} catch (error) {
    logger.warn('realtime-sync not available, notifications will not be broadcasted');
}

// Ensure billing tables exist
async function ensureBillingTables() {
    try {
        // Create sunday_clinic_billings table
        await db.query(`
            CREATE TABLE IF NOT EXISTS sunday_clinic_billings (
                id INT AUTO_INCREMENT PRIMARY KEY,
                mr_id VARCHAR(50) NOT NULL UNIQUE,
                patient_id VARCHAR(10) NOT NULL,
                subtotal DECIMAL(12, 2) NOT NULL DEFAULT 0,
                total DECIMAL(12, 2) NOT NULL DEFAULT 0,
                status ENUM('draft', 'confirmed', 'paid') NOT NULL DEFAULT 'draft',
                billing_data JSON,
                confirmed_at TIMESTAMP NULL,
                confirmed_by VARCHAR(255),
                printed_at TIMESTAMP NULL,
                printed_by VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_mr_id (mr_id),
                INDEX idx_patient_id (patient_id),
                INDEX idx_status (status)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);

        // Create sunday_clinic_billing_items table
        await db.query(`
            CREATE TABLE IF NOT EXISTS sunday_clinic_billing_items (
                id INT AUTO_INCREMENT PRIMARY KEY,
                billing_id INT NOT NULL,
                item_type ENUM('tindakan', 'obat', 'admin') NOT NULL,
                item_code VARCHAR(50),
                item_name VARCHAR(255) NOT NULL,
                quantity INT NOT NULL DEFAULT 1,
                price DECIMAL(12, 2) NOT NULL DEFAULT 0,
                total DECIMAL(12, 2) NOT NULL DEFAULT 0,
                item_data JSON,
                INDEX idx_billing_id (billing_id),
                FOREIGN KEY (billing_id) REFERENCES sunday_clinic_billings(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);

        logger.info('Sunday Clinic billing tables ensured');
    } catch (error) {
        logger.error('Failed to create billing tables:', error.message);
    }
}

// Run table creation
ensureBillingTables();

const INTAKE_SELECT = `
    SELECT submission_id, quick_id, patient_id, phone, status, payload,
           created_at, reviewed_at, reviewed_by, review_notes
    FROM patient_intake_submissions
    WHERE status = 'verified'
`;

function normalizeMrId(value) {
    if (!value || typeof value !== 'string') {
        return '';
    }
    return value.trim().toUpperCase();
}

function toDate(value) {
    if (!value) {
        return null;
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.valueOf())) {
        return null;
    }
    return parsed;
}

function calculateAge(dateValue) {
    const date = toDate(dateValue);
    if (!date) {
        return null;
    }
    const today = new Date();
    let age = today.getFullYear() - date.getFullYear();
    const monthDiff = today.getMonth() - date.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < date.getDate())) {
        age -= 1;
    }
    return age >= 0 ? age : null;
}

function normalizePhone(phone) {
    if (!phone) {
        return null;
    }
    const digits = String(phone).replace(/\D+/g, '');
    if (!digits) {
        return null;
    }
    return digits.slice(-10); // use last 10 digits for loose matching
}

function calculateGestationalAge(lmpValue) {
    const lmpDate = toDate(lmpValue);
    if (!lmpDate) {
        return null;
    }
    const diffMs = Date.now() - lmpDate.getTime();
    if (diffMs < 0) {
        return null;
    }
    const totalDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
    const weeks = Math.floor(totalDays / 7);
    const days = totalDays % 7;
    return {
        weeks,
        days,
        reference: lmpDate.toISOString()
    };
}

function parseJson(value, context) {
    if (!value) {
        return null;
    }
    try {
        return JSON.parse(value);
    } catch (error) {
        logger.warn('Failed to parse JSON payload', {
            context,
            error: error.message
        });
        return null;
    }
}

async function getPatient(patientId) {
    if (!patientId) {
        return null;
    }
    const [rows] = await db.query(
        `SELECT id, full_name, whatsapp, phone, email, birth_date, age, patient_type,
                medical_history, allergy
         FROM patients
         WHERE id = ?
         LIMIT 1`,
        [patientId]
    );
    return rows[0] || null;
}

function getSessionLabel(session) {
    const map = {
        1: '09:00 - 11:30 (Pagi)',
        2: '12:00 - 14:30 (Siang)',
        3: '15:00 - 17:30 (Sore)'
    };
    return map[session] || null;
}

function getSlotTime(session, slotNumber) {
    const startHours = { 1: 9, 2: 12, 3: 15 };
    const baseHour = startHours[session];
    if (!baseHour || !Number.isFinite(Number(slotNumber))) {
        return null;
    }
    const minutesOffset = (Number(slotNumber) - 1) * 15;
    const hour = baseHour + Math.floor(minutesOffset / 60);
    const minute = minutesOffset % 60;
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

async function getAppointment(appointmentId) {
    if (!appointmentId) {
        return null;
    }
    const [rows] = await db.query(
        `SELECT id, patient_id, patient_name, patient_phone, appointment_date,
                session, slot_number, chief_complaint, status, notes, created_at
         FROM sunday_appointments
         WHERE id = ?
         LIMIT 1`,
        [appointmentId]
    );

    if (!rows.length) {
        return null;
    }

    const row = rows[0];
    return {
        id: row.id,
        patientId: row.patient_id,
        patientName: row.patient_name,
        patientPhone: row.patient_phone,
        appointmentDate: row.appointment_date,
        session: row.session,
        sessionLabel: getSessionLabel(row.session),
        slotNumber: row.slot_number,
        slotTime: getSlotTime(row.session, row.slot_number),
        chiefComplaint: row.chief_complaint,
        status: row.status,
        notes: row.notes,
        createdAt: row.created_at
    };
}

async function findLatestIntake(patientId, phoneCandidates) {
    if (patientId) {
        const [rows] = await db.query(
            `${INTAKE_SELECT} AND patient_id = ?
             ORDER BY created_at DESC
             LIMIT 1`,
            [patientId]
        );
        if (rows.length) {
            return rows[0];
        }
    }

    if (!phoneCandidates || phoneCandidates.length === 0) {
        return null;
    }

    for (const phone of phoneCandidates) {
        if (!phone) {
            continue;
        }
        const [rows] = await db.query(
            `${INTAKE_SELECT}
             AND RIGHT(REPLACE(REPLACE(REPLACE(REPLACE(phone, '+', ''), '-', ''), ' ', ''), '.', ''), 10) = ?
             ORDER BY created_at DESC
             LIMIT 1`,
            [phone]
        );
        if (rows.length) {
            return rows[0];
        }
    }

    return null;
}

function buildIntakeSummary(payload) {
    if (!payload || typeof payload !== 'object') {
        return null;
    }

    const metadata = payload.metadata && typeof payload.metadata === 'object'
        ? payload.metadata
        : {};
    const obstetric = metadata.obstetricTotals && typeof metadata.obstetricTotals === 'object'
        ? metadata.obstetricTotals
        : {};

    const eddValue = (metadata.edd && metadata.edd.value) || payload.edd || null;
    const lmpValue = payload.lmp_date || payload.lmp || (metadata.edd && metadata.edd.lmpReference) || null;
    const age = calculateAge(payload.dob || payload.patient_dob) ?? (
        Number.isFinite(Number(payload.patient_age)) ? Number(payload.patient_age) : null
    );

    const riskFlags = Array.isArray(metadata.riskFlags) ? metadata.riskFlags : [];
    const riskFactorCodes = Array.isArray(payload.risk_factors) ? payload.risk_factors : [];

    return {
        fullName: payload.full_name || payload.patient_name || null,
        phone: payload.phone || payload.patient_phone || null,
        dob: payload.dob || payload.patient_dob || null,
        age,
        edd: eddValue,
        lmp: lmpValue,
        bmi: metadata.bmiValue || payload.bmi || null,
        gravida: obstetric.gravida ?? payload.gravida_count ?? payload.gravida ?? null,
        para: obstetric.para ?? payload.para_count ?? payload.para ?? null,
        abortus: obstetric.abortus ?? payload.abortus_count ?? payload.abortus ?? null,
        living: obstetric.living ?? payload.living_children_count ?? payload.living ?? null,
        riskFlags,
        riskFactorCodes,
        highRisk: Boolean(metadata.highRisk || (payload.flags && payload.flags.highRisk)),
        gestationalAge: calculateGestationalAge(lmpValue)
    };
}

function formatRecord(row) {
    if (!row) {
        return null;
    }
    return {
        id: row.id,
        mrId: row.mr_id,
        mr_category: row.mr_category, // Include category for template selection
        visit_location: row.visit_location || 'klinik_private', // Include visit location for UI context
        import_source: row.import_source || null, // Import source: simrs_gambiran, simrs_melinda, etc.
        patientId: row.patient_id,
        appointmentId: row.appointment_id,
        folderPath: row.folder_path,
        status: row.status,
        createdBy: row.created_by,
        finalizedBy: row.finalized_by,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        lastActivityAt: row.last_activity_at,
        finalizedAt: row.finalized_at
    };
}

function formatPatient(row) {
    if (!row) {
        return null;
    }
    return {
        id: row.id,
        fullName: row.full_name,
        whatsapp: row.whatsapp,
        phone: row.phone,
        email: row.email,
        birthDate: row.birth_date,
        age: row.age,
        patientType: row.patient_type,
        medicalHistory: row.medical_history,
        allergy: row.allergy
    };
}

function formatIntakeRow(row) {
    if (!row) {
        return null;
    }
    const payload = parseJson(row.payload, { submissionId: row.submission_id });
    const summary = buildIntakeSummary(payload);
    return {
        submissionId: row.submission_id,
        quickId: row.quick_id,
        patientId: row.patient_id,
        phone: row.phone,
        status: row.status,
        createdAt: row.created_at,
        reviewedAt: row.reviewed_at,
        reviewedBy: row.reviewed_by,
        reviewNotes: row.review_notes,
        payload,
        metadata: payload && typeof payload.metadata === 'object' ? payload.metadata : null,
        review: payload && typeof payload.review === 'object' ? payload.review : null,
        summary
    };
}

function formatMedicalRecordRow(row) {
    if (!row) {
        return null;
    }
    const data = parseJson(row.record_data, {
        medicalRecordId: row.id,
        recordType: row.record_type
    }) || {};
    return {
        id: row.id,
        patientId: row.patient_id,
        visitId: row.visit_id,
        mrId: row.mr_id, // Include mr_id for Sunday Clinic visit tracking
        doctorId: row.doctor_id,
        doctorName: row.doctor_name,
        recordType: row.record_type,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        data
    };
}

async function loadMedicalRecordsBundle(patientId, mrId = null) {
    if (!patientId) {
        return null;
    }

    // Build query with mr_id filter for visit-specific records ONLY
    // Each visit should start fresh - don't load legacy records with null mr_id
    let query = `SELECT id, patient_id, visit_id, mr_id, doctor_id, doctor_name, record_type, record_data,
                created_at, updated_at
         FROM medical_records
         WHERE patient_id = ?`;
    let params = [patientId];

    // ONLY load records for this specific visit (mr_id must match)
    // This ensures new consultations start with empty forms
    if (mrId) {
        query += ` AND mr_id = ?`;
        params.push(mrId);
    } else {
        // No mr_id provided - don't load any records (shouldn't happen normally)
        return null;
    }

    query += ` ORDER BY created_at DESC LIMIT 50`;

    const [rows] = await db.query(query, params);

    if (!rows.length) {
        return null;
    }

    const byType = {};
    let latestComplete = null;
    let latestRecord = null;

    rows.forEach((row) => {
        const formatted = formatMedicalRecordRow(row);
        if (!formatted) {
            return;
        }

        if (!latestRecord) {
            latestRecord = formatted;
        }

        if (row.record_type === 'complete' && !latestComplete) {
            latestComplete = formatted;
        }

        // Only use records with matching mr_id (visit-specific)
        if (!byType[row.record_type]) {
            byType[row.record_type] = formatted;
        }
    });

    return {
        latestComplete,
        byType,
        latestRecord,
        lastUpdatedAt: latestRecord?.updatedAt || latestRecord?.createdAt || null
    };
}

function buildAggregateSummary(record, patient, appointment, intake) {
    const base = intake && intake.summary ? { ...intake.summary } : {};
    const patientName = base.fullName || (patient && patient.fullName) || (appointment && appointment.patientName) || null;
    const age = base.age ?? (patient && patient.age) ?? null;
    return {
        patientName,
        age,
        mrId: record ? record.mrId || record.mr_id : null,
        quickId: intake ? intake.quickId : null,
        edd: base.edd || null,
        lmp: base.lmp || null,
        gestationalAge: base.gestationalAge || null,
        highRisk: Boolean(base.highRisk),
        riskFlags: base.riskFlags || [],
        riskFactorCodes: base.riskFactorCodes || []
    };
}

// ==================== TODAY'S QUEUE ====================

/**
 * GET /api/sunday-clinic/queue/today
 * Get today's confirmed appointments queue for patient navigation
 */
router.get('/queue/today', verifyToken, async (req, res, next) => {
    try {
        // Get today's date in GMT+7
        const now = new Date();
        const gmt7Offset = 7 * 60 * 60 * 1000;
        const todayGMT7 = new Date(now.getTime() + gmt7Offset);
        const todayStr = todayGMT7.toISOString().split('T')[0];

        const [appointments] = await db.query(
            `SELECT
                sa.id,
                sa.patient_id,
                sa.patient_name,
                sa.patient_phone,
                sa.appointment_date,
                sa.session,
                sa.slot_number,
                sa.chief_complaint,
                sa.consultation_category,
                sa.status,
                scr.mr_id,
                scr.mr_category,
                scr.status as record_status
             FROM sunday_appointments sa
             LEFT JOIN sunday_clinic_records scr
                ON scr.appointment_id = sa.id
             WHERE sa.appointment_date = ?
               AND sa.status IN ('confirmed', 'completed')
             ORDER BY sa.session ASC, sa.slot_number ASC`,
            [todayStr]
        );

        // Enrich with session labels and slot times
        const enriched = appointments.map(apt => ({
            id: apt.id,
            patient_id: apt.patient_id,
            patient_name: apt.patient_name,
            patient_phone: apt.patient_phone,
            appointment_date: apt.appointment_date,
            session: apt.session,
            session_label: getSessionLabel(apt.session),
            slot_number: apt.slot_number,
            slot_time: getSlotTime(apt.session, apt.slot_number),
            chief_complaint: apt.chief_complaint,
            consultation_category: apt.consultation_category,
            status: apt.status,
            mr_id: apt.mr_id || null,
            mr_category: apt.mr_category || null,
            record_status: apt.record_status || null,
            has_record: !!apt.mr_id
        }));

        res.json({
            success: true,
            date: todayStr,
            count: enriched.length,
            data: enriched
        });

    } catch (error) {
        logger.error('Error fetching today queue:', error);
        next(error);
    }
});

// ==================== DIRECTORY ====================

router.get('/directory', verifyToken, async (req, res, next) => {
    const search = (req.query.search || '').trim();
    const conditions = [];
    const params = [];

    if (search) {
        const like = `%${search}%`;
        conditions.push(`(
            scr.mr_id LIKE ?
            OR p.full_name LIKE ?
            OR sa.patient_name LIKE ?
            OR p.phone LIKE ?
            OR p.whatsapp LIKE ?
            OR sa.patient_phone LIKE ?
        )`);
        params.push(like, like, like, like, like, like);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    try {
        const [rows] = await db.query(
            `SELECT scr.mr_id,
                    scr.patient_id,
                    scr.appointment_id,
                    scr.status AS record_status,
                    scr.created_at AS record_created_at,
                    scr.updated_at AS record_updated_at,
                    p.full_name AS patient_name,
                    p.whatsapp AS patient_whatsapp,
                    p.phone AS patient_phone,
                    p.age AS patient_age,
                    p.birth_date AS patient_birth_date,
                    sa.patient_name AS appointment_patient_name,
                    sa.patient_phone AS appointment_patient_phone,
                    sa.appointment_date,
                    sa.session,
                    sa.slot_number,
                    sa.status AS appointment_status,
                    sa.chief_complaint
             FROM sunday_clinic_records scr
             LEFT JOIN patients p ON p.id = scr.patient_id
             LEFT JOIN sunday_appointments sa ON sa.id = scr.appointment_id
             ${whereClause}
             ORDER BY COALESCE(p.full_name, sa.patient_name, scr.mr_id) ASC,
                      IFNULL(sa.appointment_date, scr.created_at) DESC,
                      scr.created_at DESC
             LIMIT 400`,
            params
        );

        const patientsMap = new Map();

        rows.forEach((row) => {
            const patientId = row.patient_id || `unknown:${row.mr_id}`;
            let entry = patientsMap.get(patientId);
            if (!entry) {
                entry = {
                    patientId,
                    fullName: row.patient_name || row.appointment_patient_name || row.mr_id,
                    whatsapp: row.patient_whatsapp || null,
                    phone: row.patient_phone || row.appointment_patient_phone || null,
                    age: row.patient_age || null,
                    birthDate: row.patient_birth_date || null,
                    visits: []
                };
                patientsMap.set(patientId, entry);
            }

            entry.visits.push({
                mrId: row.mr_id,
                appointmentId: row.appointment_id,
                appointmentDate: row.appointment_date,
                session: row.session,
                sessionLabel: getSessionLabel(row.session) || null,
                slotNumber: row.slot_number,
                slotTime: getSlotTime(row.session, row.slot_number),
                recordStatus: row.record_status,
                recordCreatedAt: row.record_created_at,
                recordUpdatedAt: row.record_updated_at,
                appointmentStatus: row.appointment_status,
                chiefComplaint: row.chief_complaint || null
            });
        });

        const patients = Array.from(patientsMap.values()).map((entry) => {
            entry.visits.sort((a, b) => {
                const aDate = toDate(a.recordUpdatedAt || a.recordCreatedAt || a.appointmentDate);
                const bDate = toDate(b.recordUpdatedAt || b.recordCreatedAt || b.appointmentDate);
                const aTime = aDate ? aDate.getTime() : 0;
                const bTime = bDate ? bDate.getTime() : 0;
                return bTime - aTime;
            });

            const latestVisit = entry.visits[0];
            const latestVisitAt = latestVisit
                ? toDate(latestVisit.recordUpdatedAt || latestVisit.recordCreatedAt || latestVisit.appointmentDate)
                : null;

            return {
                patientId: entry.patientId,
                fullName: entry.fullName,
                whatsapp: entry.whatsapp,
                phone: entry.phone,
                age: entry.age,
                birthDate: entry.birthDate,
                totalVisits: entry.visits.length,
                latestVisitAt: latestVisitAt ? latestVisitAt.toISOString() : null,
                visits: entry.visits
            };
        });

        res.json({
            success: true,
            data: {
                patients,
                totalPatients: patients.length,
                totalRecords: rows.length
            }
        });
    } catch (error) {
        logger.error('Failed to load Sunday clinic directory', {
            search,
            error: error.message
        });
        next(error);
    }
});

router.get('/records/:mrId', verifyToken, async (req, res, next) => {
    const normalizedMrId = normalizeMrId(req.params.mrId);

    if (!normalizedMrId) {
        return res.status(400).json({
            success: false,
            message: 'MR ID tidak valid.'
        });
    }

    try {
        const recordRow = await findRecordByMrId(normalizedMrId);
        if (!recordRow) {
            return res.status(404).json({
                success: false,
                message: 'Rekam medis Sunday Clinic tidak ditemukan untuk MR ID tersebut.'
            });
        }

        const record = formatRecord(recordRow);
        const patientRow = await getPatient(record.patientId);
        const patient = formatPatient(patientRow);
        const appointment = await getAppointment(record.appointmentId);

        const phoneCandidates = Array.from(new Set([
            normalizePhone(patient && patient.whatsapp),
            normalizePhone(patient && patient.phone),
            normalizePhone(appointment && appointment.patientPhone)
        ].filter(Boolean)));

        const [intakeRow, medicalRecords] = await Promise.all([
            findLatestIntake(record.patientId, phoneCandidates),
            loadMedicalRecordsBundle(record.patientId, record.mrId) // Pass mrId for visit-specific records
        ]);
        const intake = formatIntakeRow(intakeRow);

        const summary = buildAggregateSummary(record, patient, appointment, intake);

        res.json({
            success: true,
            data: {
                record,
                patient,
                appointment,
                intake,
                medicalRecords,
                summary
            }
        });
    } catch (error) {
        logger.error('Failed to load Sunday clinic record', {
            mrId: normalizedMrId,
            error: error.message
        });
        next(error);
    }
});

// Save section data for a Sunday Clinic record
router.post('/records/:mrId/:section', verifyToken, async (req, res, next) => {
    const normalizedMrId = normalizeMrId(req.params.mrId);
    const section = req.params.section;
    const data = req.body;

    if (!normalizedMrId) {
        return res.status(400).json({
            success: false,
            message: 'MR ID tidak valid.'
        });
    }

    const validSections = ['anamnesa', 'pemeriksaan_ginekologi', 'usg', 'diagnosis', 'planning', 'physical_exam', 'pemeriksaan_obstetri', 'resume_medis', 'penunjang'];
    if (!validSections.includes(section)) {
        return res.status(400).json({
            success: false,
            message: `Section tidak valid. Gunakan: ${validSections.join(', ')}`
        });
    }

    try {
        const recordRow = await findRecordByMrId(normalizedMrId);
        if (!recordRow) {
            return res.status(404).json({
                success: false,
                message: 'Rekam medis Sunday Clinic tidak ditemukan.'
            });
        }

        // Check if record exists for this section and mr_id
        const [existingRows] = await db.query(
            `SELECT id FROM medical_records WHERE patient_id = ? AND mr_id = ? AND record_type = ?`,
            [recordRow.patient_id, normalizedMrId, section]
        );

        if (existingRows.length > 0) {
            // Update existing record - also update doctor_id and doctor_name to current user
            await db.query(
                `UPDATE medical_records SET record_data = ?, doctor_id = ?, doctor_name = ?, updated_at = NOW() WHERE id = ?`,
                [JSON.stringify(data), req.user.id || null, req.user.name || null, existingRows[0].id]
            );
        } else {
            // Insert new record with mr_id
            await db.query(
                `INSERT INTO medical_records (patient_id, mr_id, record_type, record_data, doctor_id, doctor_name, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
                [
                    recordRow.patient_id,
                    normalizedMrId,
                    section,
                    JSON.stringify(data),
                    req.user.id || null,
                    req.user.name || null
                ]
            );
        }

        // Update last_activity_at on the Sunday Clinic record
        await db.query(
            `UPDATE sunday_clinic_records SET last_activity_at = NOW() WHERE mr_id = ?`,
            [normalizedMrId]
        );

        // Auto-complete hospital appointment when resume_medis is saved
        // Only for RSIA Melinda, RSUD Gambiran, RS Bhayangkara (not Klinik Private or Sunday Clinic)
        if (section === 'resume_medis') {
            try {
                // Check if this patient has a pending/confirmed appointment at the 3 hospitals
                const [appointmentCheck] = await db.query(
                    `SELECT id, hospital_location, appointment_date
                     FROM appointments
                     WHERE patient_id = ?
                     AND hospital_location IN ('rsia_melinda', 'rsud_gambiran', 'rs_bhayangkara')
                     AND status IN ('scheduled', 'confirmed')
                     ORDER BY appointment_date DESC, created_at DESC
                     LIMIT 1`,
                    [recordRow.patient_id]
                );

                if (appointmentCheck.length > 0) {
                    const appointmentScheduler = require('../services/appointmentScheduler');
                    await appointmentScheduler.autoCompleteOnPayment(
                        appointmentCheck[0].id,
                        `Resume saved for MR ${normalizedMrId}`
                    );
                    logger.info('Auto-completed hospital appointment on resume save', {
                        appointmentId: appointmentCheck[0].id,
                        hospitalLocation: appointmentCheck[0].hospital_location,
                        patientId: recordRow.patient_id
                    });
                }
            } catch (appointmentError) {
                logger.warn('Appointment auto-complete warning:', appointmentError);
                // Don't fail the resume save, just log the error
            }

            // Auto-finalize when resume_medis is saved (all locations including klinik_privat)
            try {
                const [recordInfo] = await db.query(
                    'SELECT visit_location, status FROM sunday_clinic_records WHERE mr_id = ?',
                    [normalizedMrId]
                );

                if (recordInfo.length > 0 && recordInfo[0].status === 'draft') {
                    const userId = req.user.new_id || req.user.id || null;
                    await db.query(
                        `UPDATE sunday_clinic_records
                         SET status = 'finalized',
                             finalized_at = NOW(),
                             finalized_by = ?
                         WHERE mr_id = ?`,
                        [userId, normalizedMrId]
                    );
                    logger.info(`Medical record ${normalizedMrId} auto-finalized after resume_medis saved (location: ${recordInfo[0].visit_location})`);
                }
            } catch (finalizeError) {
                logger.warn('Auto-finalize warning:', finalizeError);
                // Don't fail the resume save
            }
        }

        logger.info('Saved section data for Sunday Clinic', {
            mrId: normalizedMrId,
            section,
            patientId: recordRow.patient_id,
            userId: req.user.id
        });

        res.json({
            success: true,
            message: `Data ${section} berhasil disimpan`
        });
    } catch (error) {
        logger.error('Failed to save section data', {
            mrId: normalizedMrId,
            section,
            error: error.message
        });
        next(error);
    }
});

// ==================== BILLING ENDPOINTS ====================

// Get pending billings list (not confirmed or not paid)
router.get('/billing/pending', verifyToken, async (req, res, next) => {
    try {
        // Get recent billings that are either:
        // 1. Not yet confirmed (is_confirmed = 0)
        // 2. Confirmed but not paid (is_confirmed = 1 AND payment_status != 'paid')
        const [billings] = await db.query(
            `SELECT
                scb.id,
                scb.mr_id,
                scb.total_amount,
                scb.is_confirmed,
                scb.payment_status,
                scb.created_at,
                scr.patient_id,
                COALESCE(p.full_name, sa.patient_name, scr.mr_id) as patient_name,
                COALESCE(p.phone, sa.patient_phone) as patient_phone,
                sa.appointment_date
             FROM sunday_clinic_billings scb
             LEFT JOIN sunday_clinic_records scr ON scr.mr_id = scb.mr_id
             LEFT JOIN patients p ON p.id = scr.patient_id
             LEFT JOIN sunday_appointments sa ON sa.id = scr.appointment_id
             WHERE (scb.is_confirmed = 0 OR scb.payment_status != 'paid')
               AND scb.total_amount > 0
             ORDER BY scb.created_at DESC
             LIMIT 50`
        );

        res.json({
            success: true,
            billings: billings.map(b => ({
                id: b.id,
                mr_id: b.mr_id,
                patient_name: b.patient_name,
                patient_phone: b.patient_phone,
                total_amount: b.total_amount,
                is_confirmed: !!b.is_confirmed,
                payment_status: b.payment_status,
                appointment_date: b.appointment_date,
                created_at: b.created_at
            }))
        });

    } catch (error) {
        console.error('Error fetching pending billings:', error);
        next(error);
    }
});

// Get billing for a Sunday Clinic record
router.get('/billing/:mrId', verifyToken, async (req, res, next) => {
    const normalizedMrId = normalizeMrId(req.params.mrId);

    if (!normalizedMrId) {
        return res.status(400).json({
            success: false,
            message: 'MR ID tidak valid.'
        });
    }

    try {
        const recordRow = await findRecordByMrId(normalizedMrId);
        if (!recordRow) {
            return res.status(404).json({
                success: false,
                message: 'Rekam medis Sunday Clinic tidak ditemukan.'
            });
        }

        // Get billing record
        const [billingRows] = await db.query(
            `SELECT * FROM sunday_clinic_billings WHERE mr_id = ? ORDER BY created_at DESC LIMIT 1`,
            [normalizedMrId]
        );

        let billing = null;
        if (billingRows.length > 0) {
            const billingRow = billingRows[0];
            const [itemRows] = await db.query(
                `SELECT * FROM sunday_clinic_billing_items WHERE billing_id = ? ORDER BY id`,
                [billingRow.id]
            );

            billing = {
                ...billingRow,
                items: itemRows.map(item => ({
                    ...item,
                    item_data: parseJson(item.item_data, {})
                })),
                billing_data: parseJson(billingRow.billing_data, {}),
                change_requests: parseJson(billingRow.change_requests, [])
            };
        }

        res.json({
            success: true,
            data: billing
        });
    } catch (error) {
        logger.error('Failed to load Sunday clinic billing', {
            mrId: normalizedMrId,
            error: error.message
        });
        next(error);
    }
});

// Create or update billing
router.post('/billing/:mrId', verifyToken, async (req, res, next) => {
    const normalizedMrId = normalizeMrId(req.params.mrId);

    if (!normalizedMrId) {
        return res.status(400).json({
            success: false,
            message: 'MR ID tidak valid.'
        });
    }

    try {
        const recordRow = await findRecordByMrId(normalizedMrId);
        if (!recordRow) {
            return res.status(404).json({
                success: false,
                message: 'Rekam medis Sunday Clinic tidak ditemukan.'
            });
        }

        const { items = [], status = 'draft', billingData = {} } = req.body;

        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();

            // Check if billing exists
            const [existingRows] = await connection.query(
                `SELECT id FROM sunday_clinic_billings WHERE mr_id = ?`,
                [normalizedMrId]
            );

            let billingId;

            if (existingRows.length > 0) {
                // Update existing billing
                billingId = existingRows[0].id;

                // Delete existing items
                await connection.query(
                    `DELETE FROM sunday_clinic_billing_items WHERE billing_id = ?`,
                    [billingId]
                );
            } else {
                // Create new billing (will update totals later)
                const [result] = await connection.query(
                    `INSERT INTO sunday_clinic_billings (mr_id, patient_id, subtotal, total, status, billing_data, created_at, updated_at)
                     VALUES (?, ?, 0, 0, ?, ?, NOW(), NOW())`,
                    [normalizedMrId, recordRow.patient_id, status, JSON.stringify(billingData)]
                );
                billingId = result.insertId;
            }

            // Insert items with validated prices
            let subtotal = 0;
            for (const item of items) {
                const quantity = item.quantity || 1;
                const itemType = item.item_type || 'tindakan';
                const itemName = item.item_name || '';
                const itemCode = item.item_code || null;
                let validatedPrice = 0;

                // Validate price based on item type
                if (itemType === 'obat') {
                    // Look up obat price from database
                    let obatRow = null;

                    if (itemCode) {
                        const [rows] = await connection.query(
                            `SELECT id, code, name, price FROM obat WHERE code = ?`,
                            [itemCode]
                        );
                        if (rows.length > 0) {
                            obatRow = rows[0];
                        }
                    }

                    if (!obatRow && itemName) {
                        const [rows] = await connection.query(
                            `SELECT id, code, name, price FROM obat WHERE LOWER(name) = ? LIMIT 1`,
                            [itemName.toLowerCase()]
                        );
                        if (rows.length > 0) {
                            obatRow = rows[0];
                        }
                    }

                    if (obatRow) {
                        validatedPrice = parseFloat(obatRow.price || 0);
                    } else {
                        logger.warn('Obat not found for billing item', { itemName, itemCode });
                    }
                } else if (itemType === 'tindakan') {
                    // Look up tindakan price from database
                    let tindakanRow = null;

                    if (itemCode) {
                        const [rows] = await connection.query(
                            `SELECT id, code, name, price FROM tindakan WHERE code = ?`,
                            [itemCode]
                        );
                        if (rows.length > 0) {
                            tindakanRow = rows[0];
                        }
                    }

                    if (!tindakanRow && itemName) {
                        const [rows] = await connection.query(
                            `SELECT id, code, name, price FROM tindakan WHERE LOWER(name) = ? LIMIT 1`,
                            [itemName.toLowerCase()]
                        );
                        if (rows.length > 0) {
                            tindakanRow = rows[0];
                        }
                    }

                    if (tindakanRow) {
                        validatedPrice = parseFloat(tindakanRow.price || 0);
                    } else {
                        logger.warn('Tindakan not found for billing item', { itemName, itemCode });
                    }
                } else if (itemType === 'admin') {
                    // Look up admin fee from tindakan table
                    const [adminRows] = await connection.query(
                        `SELECT id, code, name, price FROM tindakan
                         WHERE LOWER(category) = 'administratif'
                         OR LOWER(name) LIKE '%admin%'
                         ORDER BY id ASC LIMIT 1`,
                        []
                    );

                    if (adminRows.length > 0) {
                        validatedPrice = parseFloat(adminRows[0].price || 0);
                    } else {
                        // Fall back to default admin fee if not found in database
                        validatedPrice = 5000;
                        logger.warn('Admin fee not found in database, using default: 5000');
                    }
                }

                const itemTotal = quantity * validatedPrice;
                subtotal += itemTotal;

                await connection.query(
                    `INSERT INTO sunday_clinic_billing_items
                     (billing_id, item_type, item_code, item_name, quantity, price, total, item_data)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        billingId,
                        itemType,
                        itemCode,
                        itemName,
                        quantity,
                        validatedPrice,
                        itemTotal,
                        JSON.stringify(item.item_data || {})
                    ]
                );
            }

            // Update billing totals
            const total = subtotal;
            await connection.query(
                `UPDATE sunday_clinic_billings
                 SET subtotal = ?, total = ?, status = ?, billing_data = ?, updated_at = NOW()
                 WHERE id = ?`,
                [subtotal, total, status, JSON.stringify(billingData), billingId]
            );

            await connection.commit();

            res.json({
                success: true,
                message: 'Billing berhasil disimpan',
                data: {
                    billingId,
                    mrId: normalizedMrId
                }
            });
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    } catch (error) {
        logger.error('Failed to save Sunday clinic billing', {
            mrId: normalizedMrId,
            error: error.message
        });
        next(error);
    }
});

// Replace obat items in billing with structured terapi selections
router.post('/billing/:mrId/obat', verifyToken, async (req, res, next) => {
    const normalizedMrId = normalizeMrId(req.params.mrId);
    const items = Array.isArray(req.body.items) ? req.body.items : null;

    if (!normalizedMrId) {
        return res.status(400).json({
            success: false,
            message: 'MR ID tidak valid.'
        });
    }

    if (!items) {
        return res.status(400).json({
            success: false,
            message: 'Payload items harus berupa array.'
        });
    }

    let connection;

    try {
        const recordRow = await findRecordByMrId(normalizedMrId);
        if (!recordRow) {
            return res.status(404).json({
                success: false,
                message: 'Rekam medis Sunday Clinic tidak ditemukan.'
            });
        }

        connection = await db.getConnection();
        await connection.beginTransaction();

        const [billingRows] = await connection.query(
            `SELECT id FROM sunday_clinic_billings WHERE mr_id = ? FOR UPDATE`,
            [normalizedMrId]
        );

        let billingId;

        if (billingRows.length === 0) {
            const [insertResult] = await connection.query(
                `INSERT INTO sunday_clinic_billings (mr_id, patient_id, subtotal, total, status, billing_data, created_at, updated_at)
                 VALUES (?, ?, 0, 0, 'draft', ?, NOW(), NOW())`,
                [normalizedMrId, recordRow.patient_id, JSON.stringify({ source: 'therapy-modal' })]
            );
            billingId = insertResult.insertId;
        } else {
            billingId = billingRows[0].id;
        }

        // NOTE: No longer deleting existing items - now APPENDING new items
        // This allows users to add medications incrementally without losing previous selections

        for (const rawItem of items) {
            const name = typeof rawItem.name === 'string' ? rawItem.name.trim() : '';
            const quantity = Number(rawItem.quantity) > 0 ? Number(rawItem.quantity) : 1;
            const unit = typeof rawItem.unit === 'string' && rawItem.unit.trim() ? rawItem.unit.trim() : 'tablet';
            const caraPakai = typeof rawItem.caraPakai === 'string' ? rawItem.caraPakai.trim() : '';
            const latinSig = typeof rawItem.latinSig === 'string' ? rawItem.latinSig.trim() : '';
            const obatId = rawItem.obatId || rawItem.id || null;

            let obatRow = null;

            if (obatId) {
                const [rows] = await connection.query(
                    `SELECT id, code, name, price FROM obat WHERE id = ?`,
                    [obatId]
                );
                if (rows.length > 0) {
                    obatRow = rows[0];
                }
            }

            if (!obatRow && name) {
                const [rows] = await connection.query(
                    `SELECT id, code, name, price FROM obat WHERE LOWER(name) = ? LIMIT 1`,
                    [name.toLowerCase()]
                );
                if (rows.length > 0) {
                    obatRow = rows[0];
                }
            }

            if (!obatRow) {
                throw new Error(`Obat tidak ditemukan: ${name || obatId || 'tanpa nama'}`);
            }

            const price = parseFloat(obatRow.price || 0);
            const total = price * quantity;

            await connection.query(
                `INSERT INTO sunday_clinic_billing_items
                 (billing_id, item_type, item_code, item_name, quantity, price, total, item_data)
                 VALUES (?, 'obat', ?, ?, ?, ?, ?, ?)` ,
                [
                    billingId,
                    obatRow.code || null,
                    obatRow.name,
                    quantity,
                    price,
                    total,
                    JSON.stringify({
                        caraPakai,
                        latinSig,
                        unit,
                        obatId: obatRow.id,
                        source: 'therapy-modal'
                    })
                ]
            );
        }

        const [[totals]] = await connection.query(
            `SELECT COALESCE(SUM(total), 0) AS subtotal FROM sunday_clinic_billing_items WHERE billing_id = ?`,
            [billingId]
        );

        await connection.query(
            `UPDATE sunday_clinic_billings
             SET subtotal = ?, total = ?, pending_changes = FALSE,
                 last_modified_by = ?, last_modified_at = NOW(), updated_at = NOW()
             WHERE id = ?`,
            [
                totals.subtotal,
                totals.subtotal,
                req.user.name || req.user.id || 'Staff',
                billingId
            ]
        );

        await connection.commit();

        res.json({
            success: true,
            message: 'Daftar obat berhasil diperbarui',
            data: {
                mrId: normalizedMrId,
                billingId,
                subtotal: totals.subtotal
            }
        });
    } catch (error) {
        if (connection) {
            try {
                await connection.rollback();
            } catch (rollbackError) {
                logger.error('Failed to rollback obat update', { error: rollbackError.message });
            }
        }

        logger.error('Failed to update obat items for Sunday clinic billing', {
            mrId: normalizedMrId,
            error: error.message
        });
        next(error);
    } finally {
        if (connection) {
            connection.release();
        }
    }
});

// Confirm billing (doctor action only)
router.post('/billing/:mrId/confirm', verifyToken, async (req, res, next) => {
    const normalizedMrId = normalizeMrId(req.params.mrId);

    try {
        // Check if user is dokter or superadmin
        const isDokter = req.user.role === ROLE_NAMES.DOKTER || req.user.is_superadmin || isSuperadminRole(req.user.role_id);

        if (!isDokter) {
            return res.status(403).json({
                success: false,
                message: 'Hanya dokter yang dapat mengkonfirmasi tagihan'
            });
        }

        // Get billing ID first
        const [[billing]] = await db.query(
            `SELECT id, status FROM sunday_clinic_billings WHERE mr_id = ?`,
            [normalizedMrId]
        );

        if (!billing) {
            return res.status(404).json({
                success: false,
                message: 'Billing tidak ditemukan'
            });
        }

        const [result] = await db.query(
            `UPDATE sunday_clinic_billings
             SET status = 'confirmed', confirmed_at = NOW(), confirmed_by = ?
             WHERE mr_id = ?`,
            [req.user.name || req.user.id || 'Staff', normalizedMrId]
        );

        // NOTE: Stock deduction moved to payment completion endpoint
        // Stock will be deducted when billing is marked as 'paid'

        // Get patient name for notification
        const [[record]] = await db.query(
            `SELECT r.mr_id, p.full_name as patient_name
             FROM sunday_clinic_records r
             JOIN patients p ON r.patient_id = p.id
             WHERE r.mr_id = ?`,
            [normalizedMrId]
        );

        const patientName = record?.patient_name || 'Pasien';
        const doctorName = req.user.name || req.user.id || 'Dokter';

        // Broadcast notification to all connected clients
        if (realtimeSync && realtimeSync.broadcast) {
            realtimeSync.broadcast({
                type: 'billing_confirmed',
                mrId: normalizedMrId,
                patientName,
                doctorName,
                timestamp: new Date().toISOString()
            });
        }

        // Log activity
        await activityLogger.logFromRequest(req, 'Confirm Billing',
            `Confirmed billing for ${patientName} (MR: ${normalizedMrId})`);

        res.json({
            success: true,
            message: 'Billing berhasil dikonfirmasi',
            patientName
        });
    } catch (error) {
        logger.error('Failed to confirm billing', { error: error.message });
        next(error);
    }
});

// Mark billing as paid (payment complete)
router.post('/billing/:mrId/mark-paid', verifyToken, async (req, res, next) => {
    const normalizedMrId = normalizeMrId(req.params.mrId);
    const { payment_method, notes } = req.body;

    try {
        // Get current billing
        const [[billing]] = await db.query(
            'SELECT * FROM sunday_clinic_billings WHERE mr_id = ?',
            [normalizedMrId]
        );

        if (!billing) {
            return res.status(404).json({
                success: false,
                message: 'Billing tidak ditemukan'
            });
        }

        if (billing.status !== 'confirmed') {
            return res.status(400).json({
                success: false,
                message: 'Billing harus dikonfirmasi terlebih dahulu sebelum pembayaran'
            });
        }

        if (billing.status === 'paid') {
            return res.status(400).json({
                success: false,
                message: 'Billing sudah dibayar'
            });
        }

        // Update status to paid
        await db.query(
            `UPDATE sunday_clinic_billings
             SET status = 'paid',
                 last_modified_by = ?,
                 last_modified_at = NOW()
             WHERE mr_id = ?`,
            [req.user.name || req.user.id || 'Staff', normalizedMrId]
        );

        // Deduct stock for obat items using FIFO (only when marking as paid)
        try {
            const InventoryService = require('../services/InventoryService');

            // Get obat items from billing (extract obatId from item_data JSON)
            const [obatItems] = await db.query(
                `SELECT bi.item_code, bi.item_name, bi.quantity,
                        CAST(JSON_EXTRACT(bi.item_data, '$.obatId') AS UNSIGNED) as obat_id
                 FROM sunday_clinic_billing_items bi
                 WHERE bi.billing_id = ? AND bi.item_type = 'obat'
                   AND JSON_EXTRACT(bi.item_data, '$.obatId') IS NOT NULL`,
                [billing.id]
            );

            // Deduct stock for each obat using FIFO
            for (const item of obatItems) {
                try {
                    await InventoryService.deductStockFIFO(
                        item.obat_id,
                        parseInt(item.quantity),
                        'sunday_clinic_billing',
                        billing.id,
                        req.user?.name || 'system'
                    );
                    logger.info(`Stock deducted for ${item.item_name}: ${item.quantity} units`);
                } catch (stockError) {
                    logger.warn(`Stock deduction warning for obat ${item.obat_id} (${item.item_name}):`, stockError.message);
                }
            }
        } catch (inventoryError) {
            logger.error('Inventory deduction error:', inventoryError);
            // Don't fail the payment, just log the error
        }

        // Auto-finalize the medical record when billing is paid
        try {
            const userId = req.user.new_id || req.user.id || null;
            await db.query(
                `UPDATE sunday_clinic_records
                 SET status = 'finalized',
                     finalized_at = NOW(),
                     finalized_by = ?
                 WHERE mr_id = ? AND status = 'draft'`,
                [userId, normalizedMrId]
            );
            logger.info(`Medical record ${normalizedMrId} auto-finalized after payment by user ${userId}`);
        } catch (finalizeError) {
            logger.error('Auto-finalize error:', finalizeError);
            // Don't fail the payment, just log the error
        }

        // Get patient name for notification
        const [[record]] = await db.query(
            `SELECT r.mr_id, p.full_name as patient_name
             FROM sunday_clinic_records r
             JOIN patients p ON r.patient_id = p.id
             WHERE r.mr_id = ?`,
            [normalizedMrId]
        );

        const patientName = record?.patient_name || 'Pasien';

        // Broadcast notification
        if (realtimeSync && realtimeSync.broadcast) {
            realtimeSync.broadcast({
                type: 'billing_paid',
                mrId: normalizedMrId,
                patientName,
                paidBy: req.user.name || req.user.id || 'Staff',
                timestamp: new Date().toISOString()
            });
        }

        // Log activity
        await activityLogger.logFromRequest(req, activityLogger.ACTIONS.FINALIZE_VISIT,
            `Marked billing paid for ${patientName} (MR: ${normalizedMrId}), Total: Rp ${billing.total}`);

        res.json({
            success: true,
            message: 'Pembayaran berhasil dicatat. Stok obat telah dikurangi.',
            patientName
        });
    } catch (error) {
        logger.error('Failed to mark billing as paid', { error: error.message });
        next(error);
    }
});

// Request revision (non-dokter action)
router.post('/billing/:mrId/request-revision', verifyToken, async (req, res, next) => {
    const normalizedMrId = normalizeMrId(req.params.mrId);
    const { message, requestedBy } = req.body;

    try {
        // Insert revision request
        const [result] = await db.query(
            `INSERT INTO sunday_clinic_billing_revisions (mr_id, message, requested_by, created_at)
             VALUES (?, ?, ?, NOW())`,
            [normalizedMrId, message, requestedBy || req.user.name]
        );

        // Get patient name for notification
        const [[record]] = await db.query(
            `SELECT r.mr_id, p.full_name as patient_name
             FROM sunday_clinic_records r
             JOIN patients p ON r.patient_id = p.id
             WHERE r.mr_id = ?`,
            [normalizedMrId]
        );

        const patientName = record?.patient_name || 'Pasien';

        // Broadcast notification to dokter
        logger.info('About to broadcast revision_requested', {
            hasRealtimeSync: !!realtimeSync,
            hasBroadcast: !!(realtimeSync && realtimeSync.broadcast),
            mrId: normalizedMrId,
            revisionId: result.insertId
        });
        
        if (realtimeSync && realtimeSync.broadcast) {
            const broadcastResult = realtimeSync.broadcast({
                type: 'revision_requested',
                mrId: normalizedMrId,
                patientName,
                message,
                requestedBy: requestedBy || req.user.name,
                revisionId: result.insertId,
                timestamp: new Date().toISOString()
            });
            logger.info('Broadcast result:', { success: broadcastResult });
        } else {
            logger.warn('realtimeSync not available for broadcasting');
        }

        res.json({
            success: true,
            message: 'Usulan revisi berhasil dikirim',
            revisionId: result.insertId
        });
    } catch (error) {
        logger.error('Failed to request revision', { error: error.message });
        next(error);
    }
});

// Get pending revisions for dokter
router.get('/billing/revisions/pending', verifyToken, async (req, res, next) => {
    try {
        const [revisions] = await db.query(
            `SELECT r.*, p.full_name as patient_name
             FROM sunday_clinic_billing_revisions r
             JOIN sunday_clinic_records rec ON r.mr_id = rec.mr_id
             JOIN patients p ON rec.patient_id = p.id
             WHERE r.status = 'pending'
             ORDER BY r.created_at DESC`
        );

        res.json({
            success: true,
            data: revisions
        });
    } catch (error) {
        logger.error('Failed to get revisions', { error: error.message });
        next(error);
    }
});

// Approve revision (dokter only)
router.post('/billing/revisions/:id/approve', verifyToken, async (req, res, next) => {
    const revisionId = req.params.id;

    try {
        const isDokter = req.user.role === ROLE_NAMES.DOKTER || req.user.is_superadmin || isSuperadminRole(req.user.role_id);

        if (!isDokter) {
            return res.status(403).json({
                success: false,
                message: 'Hanya dokter yang dapat menyetujui usulan'
            });
        }

        // Get revision details
        const [[revision]] = await db.query(
            'SELECT * FROM sunday_clinic_billing_revisions WHERE id = ?',
            [revisionId]
        );

        if (!revision) {
            return res.status(404).json({
                success: false,
                message: 'Usulan tidak ditemukan'
            });
        }

        // Update revision status and revert billing to draft
        await db.query(
            `UPDATE sunday_clinic_billing_revisions SET status = 'approved' WHERE id = ?`,
            [revisionId]
        );

        await db.query(
            `UPDATE sunday_clinic_billings
             SET status = 'draft', confirmed_at = NULL, confirmed_by = NULL
             WHERE mr_id = ?`,
            [revision.mr_id]
        );

        res.json({
            success: true,
            message: 'Usulan disetujui. Billing dikembalikan ke draft',
            mrId: revision.mr_id
        });
    } catch (error) {
        logger.error('Failed to approve revision', { error: error.message });
        next(error);
    }
});

// Print etiket
router.post('/billing/:mrId/print-etiket', verifyToken, async (req, res, next) => {
    const normalizedMrId = normalizeMrId(req.params.mrId);

    try {
        const pdfGenerator = require('../utils/pdf-generator');

        // Get billing data
        const [[billing]] = await db.query(
            'SELECT * FROM sunday_clinic_billings WHERE mr_id = ?',
            [normalizedMrId]
        );

        if (!billing || !['confirmed', 'paid'].includes(billing.status)) {
            return res.status(400).json({
                success: false,
                message: 'Billing belum dikonfirmasi atau dibayar'
            });
        }

        // Get billing items from sunday_clinic_billing_items
        const [items] = await db.query(
            `SELECT * FROM sunday_clinic_billing_items WHERE billing_id = ?`,
            [billing.id]
        );

        // Parse item_data JSON for each item
        billing.items = items.map(item => ({
            ...item,
            item_data: typeof item.item_data === 'string' ? JSON.parse(item.item_data || '{}') : (item.item_data || {})
        }));

        // Get patient and record data
        const [[record]] = await db.query(
            `SELECT r.*, p.full_name, p.birth_date, p.phone
             FROM sunday_clinic_records r
             JOIN patients p ON r.patient_id = p.id
             WHERE r.mr_id = ?`,
            [normalizedMrId]
        );

        const result = await pdfGenerator.generateEtiket(
            billing,
            { fullName: record.full_name, birthDate: record.birth_date, phone: record.phone },
            { mrId: normalizedMrId }
        );

        // Update printed status and store R2 key
        await db.query(
            `UPDATE sunday_clinic_billings
             SET printed_at = NOW(), printed_by = ?, etiket_url = ?
             WHERE mr_id = ?`,
            [req.user.name || req.user.id, result.r2Key, normalizedMrId]
        );

        // Get signed URL for download (valid for 1 hour)
        const r2Storage = require('../services/r2Storage');
        const signedUrl = await r2Storage.getSignedDownloadUrl(result.r2Key, 3600);

        // Return JSON with download URL (frontend will handle the download)
        res.json({
            success: true,
            downloadUrl: signedUrl,
            filename: result.filename
        });
    } catch (error) {
        logger.error('Failed to print etiket', { error: error.message });
        next(error);
    }
});

// Print invoice
router.post('/billing/:mrId/print-invoice', verifyToken, async (req, res, next) => {
    const normalizedMrId = normalizeMrId(req.params.mrId);

    try {
        const pdfGenerator = require('../utils/pdf-generator');

        // Get billing data
        const [[billing]] = await db.query(
            'SELECT * FROM sunday_clinic_billings WHERE mr_id = ?',
            [normalizedMrId]
        );

        if (!billing || !['confirmed', 'paid'].includes(billing.status)) {
            return res.status(400).json({
                success: false,
                message: 'Billing belum dikonfirmasi atau dibayar'
            });
        }

        // Get billing items from sunday_clinic_billing_items
        const [items] = await db.query(
            `SELECT * FROM sunday_clinic_billing_items WHERE billing_id = ?`,
            [billing.id]
        );

        // Parse item_data JSON for each item
        billing.items = items.map(item => ({
            ...item,
            item_data: typeof item.item_data === 'string' ? JSON.parse(item.item_data || '{}') : (item.item_data || {})
        }));

        // Get patient and record data
        const [[record]] = await db.query(
            `SELECT r.*, p.full_name, p.birth_date, p.phone
             FROM sunday_clinic_records r
             JOIN patients p ON r.patient_id = p.id
             WHERE r.mr_id = ?`,
            [normalizedMrId]
        );

        const result = await pdfGenerator.generateInvoice(
            billing,
            { fullName: record.full_name, birthDate: record.birth_date, phone: record.phone },
            { mrId: normalizedMrId }
        );

        // Update printed status and store R2 key
        await db.query(
            `UPDATE sunday_clinic_billings
             SET printed_at = NOW(), printed_by = ?, invoice_url = ?
             WHERE mr_id = ?`,
            [req.user.name || req.user.id, result.r2Key, normalizedMrId]
        );

        // Get signed URL for download (valid for 1 hour)
        const r2Storage = require('../services/r2Storage');
        const signedUrl = await r2Storage.getSignedDownloadUrl(result.r2Key, 3600);

        // Log activity
        await activityLogger.logFromRequest(req, 'Print Invoice',
            `Printed invoice for MR: ${normalizedMrId}`);

        // Return JSON with download URL (frontend will handle the download)
        res.json({
            success: true,
            downloadUrl: signedUrl,
            filename: result.filename
        });
    } catch (error) {
        logger.error('Failed to print invoice', { error: error.message });
        next(error);
    }
});

// Print invoice (cashier action)
router.post('/billing/:mrId/print', verifyToken, async (req, res, next) => {
    const normalizedMrId = normalizeMrId(req.params.mrId);

    try {
        await db.query(
            `UPDATE sunday_clinic_billings
             SET printed_at = NOW(), printed_by = ?
             WHERE mr_id = ?`,
            [req.user.name || req.user.id || 'Staff', normalizedMrId]
        );

        res.json({
            success: true,
            message: 'Invoice berhasil dicetak',
            cashierName: req.user.name || req.user.id || 'Staff'
        });
    } catch (error) {
        logger.error('Failed to record print', { error: error.message });
        next(error);
    }
});

// Delete billing items by type
router.delete('/billing/:mrId/items/:itemType', verifyToken, async (req, res, next) => {
    const normalizedMrId = normalizeMrId(req.params.mrId);
    const itemType = req.params.itemType;

    // Validate item type
    if (!['tindakan', 'obat', 'admin'].includes(itemType)) {
        return res.status(400).json({
            success: false,
            message: 'Tipe item tidak valid. Gunakan: tindakan, obat, atau admin'
        });
    }

    let connection;

    try {
        const recordRow = await findRecordByMrId(normalizedMrId);
        if (!recordRow) {
            return res.status(404).json({
                success: false,
                message: 'Rekam medis Sunday Clinic tidak ditemukan.'
            });
        }

        connection = await db.getConnection();
        await connection.beginTransaction();

        // Get billing record
        const [billingRows] = await connection.query(
            `SELECT id FROM sunday_clinic_billings WHERE mr_id = ? FOR UPDATE`,
            [normalizedMrId]
        );

        if (billingRows.length === 0) {
            await connection.rollback();
            return res.json({
                success: true,
                message: `Tidak ada billing ditemukan. Tidak ada ${itemType} untuk dihapus.`
            });
        }

        const billingId = billingRows[0].id;

        // Delete items of specified type
        await connection.query(
            `DELETE FROM sunday_clinic_billing_items WHERE billing_id = ? AND item_type = ?`,
            [billingId, itemType]
        );

        // Recalculate billing totals
        const [[totals]] = await connection.query(
            `SELECT COALESCE(SUM(total), 0) AS subtotal FROM sunday_clinic_billing_items WHERE billing_id = ?`,
            [billingId]
        );

        await connection.query(
            `UPDATE sunday_clinic_billings
             SET subtotal = ?, total = ?, updated_at = NOW()
             WHERE id = ?`,
            [totals.subtotal, totals.subtotal, billingId]
        );

        await connection.commit();

        res.json({
            success: true,
            message: `Semua ${itemType} berhasil dihapus`,
            data: {
                mrId: normalizedMrId,
                billingId,
                newSubtotal: totals.subtotal
            }
        });
    } catch (error) {
        if (connection) {
            try {
                await connection.rollback();
            } catch (rollbackError) {
                logger.error('Failed to rollback item deletion', { error: rollbackError.message });
            }
        }

        logger.error('Failed to delete billing items by type', {
            mrId: normalizedMrId,
            itemType,
            error: error.message
        });
        next(error);
    } finally {
        if (connection) {
            connection.release();
        }
    }
});

// Delete billing item by item_code
router.delete('/billing/:mrId/items/code/:code', verifyToken, async (req, res, next) => {
    const normalizedMrId = normalizeMrId(req.params.mrId);
    const itemCode = req.params.code;

    let connection;

    try {
        const recordRow = await findRecordByMrId(normalizedMrId);
        if (!recordRow) {
            return res.status(404).json({
                success: false,
                message: 'Rekam medis Sunday Clinic tidak ditemukan.'
            });
        }

        connection = await db.getConnection();
        await connection.beginTransaction();

        // Get billing record
        const [billingRows] = await connection.query(
            `SELECT id FROM sunday_clinic_billings WHERE mr_id = ? FOR UPDATE`,
            [normalizedMrId]
        );

        if (billingRows.length === 0) {
            await connection.rollback();
            return res.json({
                success: true,
                message: `Tidak ada billing ditemukan.`
            });
        }

        const billingId = billingRows[0].id;

        // Delete item by code
        const [deleteResult] = await connection.query(
            `DELETE FROM sunday_clinic_billing_items WHERE billing_id = ? AND item_code = ?`,
            [billingId, itemCode]
        );

        // Recalculate billing totals
        const [[totals]] = await connection.query(
            `SELECT COALESCE(SUM(total), 0) AS subtotal FROM sunday_clinic_billing_items WHERE billing_id = ?`,
            [billingId]
        );

        await connection.query(
            `UPDATE sunday_clinic_billings
             SET subtotal = ?, total = ?, updated_at = NOW()
             WHERE id = ?`,
            [totals.subtotal, totals.subtotal, billingId]
        );

        await connection.commit();

        res.json({
            success: true,
            message: `Item dengan kode ${itemCode} berhasil dihapus`,
            data: {
                mrId: normalizedMrId,
                billingId,
                deletedCount: deleteResult.affectedRows,
                newSubtotal: totals.subtotal
            }
        });
    } catch (error) {
        if (connection) {
            try {
                await connection.rollback();
            } catch (rollbackError) {
                logger.error('Failed to rollback item deletion by code', { error: rollbackError.message });
            }
        }

        logger.error('Failed to delete billing item by code', {
            mrId: normalizedMrId,
            itemCode,
            error: error.message
        });
        next(error);
    } finally {
        if (connection) {
            connection.release();
        }
    }
});

// Delete billing item by item ID (for individual obat deletion)
router.delete('/billing/:mrId/items/id/:itemId', verifyToken, async (req, res, next) => {
    const normalizedMrId = normalizeMrId(req.params.mrId);
    const itemId = parseInt(req.params.itemId, 10);

    if (!itemId || isNaN(itemId)) {
        return res.status(400).json({
            success: false,
            message: 'Item ID tidak valid'
        });
    }

    let connection;

    try {
        const recordRow = await findRecordByMrId(normalizedMrId);
        if (!recordRow) {
            return res.status(404).json({
                success: false,
                message: 'Rekam medis Sunday Clinic tidak ditemukan.'
            });
        }

        connection = await db.getConnection();
        await connection.beginTransaction();

        // Get billing record and check status
        const [billingRows] = await connection.query(
            `SELECT id, status FROM sunday_clinic_billings WHERE mr_id = ? FOR UPDATE`,
            [normalizedMrId]
        );

        if (billingRows.length === 0) {
            await connection.rollback();
            return res.status(404).json({
                success: false,
                message: 'Billing tidak ditemukan.'
            });
        }

        const billing = billingRows[0];

        // Only allow deletion when status is 'draft'
        if (billing.status !== 'draft') {
            await connection.rollback();
            return res.status(400).json({
                success: false,
                message: 'Tidak dapat menghapus item. Tagihan sudah dikonfirmasi.'
            });
        }

        // Get item details before deletion (for response)
        const [itemRows] = await connection.query(
            `SELECT * FROM sunday_clinic_billing_items WHERE id = ? AND billing_id = ?`,
            [itemId, billing.id]
        );

        if (itemRows.length === 0) {
            await connection.rollback();
            return res.status(404).json({
                success: false,
                message: 'Item tidak ditemukan.'
            });
        }

        const deletedItem = itemRows[0];

        // Delete item by ID
        await connection.query(
            `DELETE FROM sunday_clinic_billing_items WHERE id = ? AND billing_id = ?`,
            [itemId, billing.id]
        );

        // Recalculate billing totals
        const [[totals]] = await connection.query(
            `SELECT COALESCE(SUM(total), 0) AS subtotal FROM sunday_clinic_billing_items WHERE billing_id = ?`,
            [billing.id]
        );

        await connection.query(
            `UPDATE sunday_clinic_billings
             SET subtotal = ?, total = ?, updated_at = NOW()
             WHERE id = ?`,
            [totals.subtotal, totals.subtotal, billing.id]
        );

        await connection.commit();

        res.json({
            success: true,
            message: `Item "${deletedItem.item_name}" berhasil dihapus`,
            data: {
                mrId: normalizedMrId,
                billingId: billing.id,
                deletedItem: {
                    id: deletedItem.id,
                    item_name: deletedItem.item_name,
                    item_type: deletedItem.item_type,
                    quantity: deletedItem.quantity,
                    price: deletedItem.price
                },
                newSubtotal: totals.subtotal
            }
        });
    } catch (error) {
        if (connection) {
            try {
                await connection.rollback();
            } catch (rollbackError) {
                logger.error('Failed to rollback item deletion by ID', { error: rollbackError.message });
            }
        }

        logger.error('Failed to delete billing item by ID', {
            mrId: normalizedMrId,
            itemId,
            error: error.message
        });
        next(error);
    } finally {
        if (connection) {
            connection.release();
        }
    }
});

// Request change to billing (anyone can request)
router.post('/billing/:mrId/request-change', verifyToken, async (req, res, next) => {
    const normalizedMrId = normalizeMrId(req.params.mrId);
    const { items, changeNote } = req.body;

    try {
        const recordRow = await findRecordByMrId(normalizedMrId);
        if (!recordRow) {
            return res.status(404).json({
                success: false,
                message: 'Rekam medis Sunday Clinic tidak ditemukan.'
            });
        }

        // Get existing billing
        const [billingRows] = await db.query(
            `SELECT id, change_requests FROM sunday_clinic_billings WHERE mr_id = ?`,
            [normalizedMrId]
        );

        if (billingRows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Billing tidak ditemukan'
            });
        }

        const billing = billingRows[0];
        const changeRequests = billing.change_requests ? JSON.parse(billing.change_requests) : [];

        // Add new change request
        changeRequests.push({
            requestedBy: req.user.name || req.user.id || 'Staff',
            requestedAt: new Date().toISOString(),
            note: changeNote || 'Perubahan item tagihan',
            items: items
        });

        // Update billing with new items and set pending_changes flag
        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();

            // Delete existing items
            await connection.query(
                `DELETE FROM sunday_clinic_billing_items WHERE billing_id = ?`,
                [billing.id]
            );

            // Insert new items with validated prices
            if (items && items.length > 0) {
                let subtotal = 0;
                for (const item of items) {
                    const quantity = item.quantity || 1;
                    const itemType = item.item_type || 'admin';
                    const itemName = item.item_name || '';
                    const itemCode = item.item_code || null;
                    let validatedPrice = 0;

                    // If price is provided in the request, use it (for preserving existing prices)
                    if (item.price != null && item.price !== '') {
                        const parsedPrice = parseFloat(item.price);
                        if (!isNaN(parsedPrice) && parsedPrice > 0) {
                            validatedPrice = parsedPrice;
                        }
                    }
                    // Otherwise validate price based on item type
                    else if (itemType === 'obat') {
                        // Look up obat price from database
                        let obatRow = null;

                        if (itemCode) {
                            const [rows] = await connection.query(
                                `SELECT id, code, name, price FROM obat WHERE code = ?`,
                                [itemCode]
                            );
                            if (rows.length > 0) {
                                obatRow = rows[0];
                            }
                        }

                        if (!obatRow && itemName) {
                            const [rows] = await connection.query(
                                `SELECT id, code, name, price FROM obat WHERE LOWER(name) = ? LIMIT 1`,
                                [itemName.toLowerCase()]
                            );
                            if (rows.length > 0) {
                                obatRow = rows[0];
                            }
                        }

                        if (obatRow) {
                            validatedPrice = parseFloat(obatRow.price || 0);
                        } else {
                            logger.warn('Obat not found for billing item', { itemName, itemCode });
                        }
                    } else if (itemType === 'tindakan') {
                        // Look up tindakan price from database
                        let tindakanRow = null;

                        if (itemCode) {
                            const [rows] = await connection.query(
                                `SELECT id, code, name, price FROM tindakan WHERE code = ?`,
                                [itemCode]
                            );
                            if (rows.length > 0) {
                                tindakanRow = rows[0];
                            }
                        }

                        if (!tindakanRow && itemName) {
                            const [rows] = await connection.query(
                                `SELECT id, code, name, price FROM tindakan WHERE LOWER(name) = ? LIMIT 1`,
                                [itemName.toLowerCase()]
                            );
                            if (rows.length > 0) {
                                tindakanRow = rows[0];
                            }
                        }

                        if (tindakanRow) {
                            validatedPrice = parseFloat(tindakanRow.price || 0);
                        } else {
                            logger.warn('Tindakan not found for billing item', { itemName, itemCode });
                        }
                    } else if (itemType === 'admin') {
                        // Look up admin fee from tindakan table
                        const [adminRows] = await connection.query(
                            `SELECT id, code, name, price FROM tindakan
                             WHERE LOWER(category) = 'administratif'
                             OR LOWER(name) LIKE '%admin%'
                             ORDER BY id ASC LIMIT 1`,
                            []
                        );

                        if (adminRows.length > 0) {
                            validatedPrice = parseFloat(adminRows[0].price || 0);
                        } else {
                            // Fall back to default admin fee if not found in database
                            validatedPrice = 5000;
                            logger.warn('Admin fee not found in database, using default: 5000');
                        }
                    }

                    const itemTotal = quantity * validatedPrice;
                    subtotal += itemTotal;

                    await connection.query(
                        `INSERT INTO sunday_clinic_billing_items
                         (billing_id, item_type, item_code, item_name, quantity, price, total, item_data)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                        [
                            billing.id,
                            itemType,
                            itemCode,
                            itemName,
                            quantity,
                            validatedPrice,
                            itemTotal,
                            JSON.stringify(item.item_data || {})
                        ]
                    );
                }

                // Update billing totals and set pending_changes flag
                await connection.query(
                    `UPDATE sunday_clinic_billings
                     SET subtotal = ?, total = ?, pending_changes = TRUE,
                         change_requests = ?, last_modified_by = ?, last_modified_at = NOW()
                     WHERE id = ?`,
                    [subtotal, subtotal, JSON.stringify(changeRequests), req.user.name || req.user.id || 'Staff', billing.id]
                );
            }

            await connection.commit();

            res.json({
                success: true,
                message: 'Perubahan berhasil diajukan. Menunggu konfirmasi dokter.'
            });
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    } catch (error) {
        logger.error('Failed to request billing change', { error: error.message });
        next(error);
    }
});

// Approve changes and reconfirm billing (doctor only)
router.post('/billing/:mrId/approve-changes', verifyToken, async (req, res, next) => {
    const normalizedMrId = normalizeMrId(req.params.mrId);

    try {
        const [result] = await db.query(
            `UPDATE sunday_clinic_billings
             SET pending_changes = FALSE, status = 'confirmed',
                 confirmed_at = NOW(), confirmed_by = ?
             WHERE mr_id = ? AND pending_changes = TRUE`,
            [req.user.name || req.user.id || 'Staff', normalizedMrId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: 'Tidak ada perubahan yang perlu dikonfirmasi'
            });
        }

        res.json({
            success: true,
            message: 'Perubahan berhasil dikonfirmasi'
        });
    } catch (error) {
        logger.error('Failed to approve changes', { error: error.message });
        next(error);
    }
});

// Get billing with change request info
router.get('/billing/:mrId/changes', verifyToken, async (req, res, next) => {
    const normalizedMrId = normalizeMrId(req.params.mrId);

    try {
        const [rows] = await db.query(
            `SELECT pending_changes, change_requests, last_modified_by, last_modified_at
             FROM sunday_clinic_billings
             WHERE mr_id = ?`,
            [normalizedMrId]
        );

        if (rows.length === 0) {
            return res.json({
                success: true,
                data: {
                    hasPendingChanges: false,
                    changeRequests: []
                }
            });
        }

        const billing = rows[0];
        res.json({
            success: true,
            data: {
                hasPendingChanges: billing.pending_changes || false,
                changeRequests: billing.change_requests ? JSON.parse(billing.change_requests) : [],
                lastModifiedBy: billing.last_modified_by,
                lastModifiedAt: billing.last_modified_at
            }
        });
    } catch (error) {
        logger.error('Failed to get change requests', { error: error.message });
        next(error);
    }
});

// Get MR category statistics
router.get('/statistics/categories', verifyToken, async (req, res, next) => {
    try {
        const sundayClinicService = require('../services/sundayClinicService');
        const stats = await sundayClinicService.getCategoryStatistics();

        res.json({
            success: true,
            data: stats
        });
    } catch (error) {
        logger.error('Failed to get category statistics', {
            error: error.message
        });
        next(error);
    }
});

/**
 * POST /api/sunday-clinic/generate-anamnesa/:mrId
 * Generate AI-powered anamnesa summary from patient intake
 */
router.post('/generate-anamnesa/:mrId', verifyToken, async (req, res, next) => {
    const { mrId } = req.params;
    const normalizedMrId = normalizeMrId(mrId);

    if (!normalizedMrId) {
        return res.status(400).json({
            success: false,
            message: 'MR ID tidak valid'
        });
    }

    try {
        // Find the record
        const recordRow = await findRecordByMrId(normalizedMrId);
        if (!recordRow) {
            return res.status(404).json({
                success: false,
                message: 'Rekam medis Sunday Clinic tidak ditemukan.'
            });
        }

        // Get patient intake data
        const [intakeRows] = await db.query(
            `SELECT payload FROM patient_intake_submissions
             WHERE patient_id = ? AND status = 'verified'
             ORDER BY created_at DESC
             LIMIT 1`,
            [recordRow.patient_id]
        );

        if (intakeRows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Data intake pasien tidak ditemukan'
            });
        }

        const intakeData = typeof intakeRows[0].payload === 'string'
            ? JSON.parse(intakeRows[0].payload)
            : intakeRows[0].payload;

        // Determine category from MR ID or record
        let category = recordRow.mr_category || 'obstetri';
        if (normalizedMrId.startsWith('MROBS')) {
            category = 'obstetri';
        } else if (normalizedMrId.startsWith('MRGPR')) {
            category = 'gyn_repro';
        } else if (normalizedMrId.startsWith('MRGPS')) {
            category = 'gyn_special';
        }

        // Generate summary using OpenAI
        const { generateAnamnesaSummary } = require('../services/openaiService');
        const summary = await generateAnamnesaSummary(intakeData, category);

        logger.info('Generated anamnesa summary', {
            mrId: normalizedMrId,
            category,
            userId: req.user.id
        });

        res.json({
            success: true,
            data: {
                summary,
                category,
                generatedAt: new Date().toISOString()
            }
        });

    } catch (error) {
        logger.error('Failed to generate anamnesa summary', {
            mrId: normalizedMrId,
            error: error.message
        });

        if (error.message.includes('OPENAI_API_KEY')) {
            return res.status(500).json({
                success: false,
                message: 'OpenAI API tidak dikonfigurasi. Hubungi administrator.'
            });
        }

        res.status(500).json({
            success: false,
            message: 'Gagal generate ringkasan anamnesa: ' + error.message
        });
    }
});

// ==================== RESUME MEDIS PDF & WHATSAPP ====================

/**
 * Generate Resume Medis PDF
 * POST /api/sunday-clinic/resume-medis/pdf
 */
router.post('/resume-medis/pdf', verifyToken, async (req, res, next) => {
    try {
        const { mrId } = req.body;

        if (!mrId) {
            return res.status(400).json({ success: false, message: 'MR ID is required' });
        }

        // Get record data
        const [records] = await db.query(
            `SELECT sc.*, p.full_name, p.age, p.phone
             FROM sunday_clinic_records sc
             LEFT JOIN patients p ON sc.patient_id = p.id
             WHERE sc.mr_id = ?`,
            [mrId]
        );

        if (!records.length) {
            return res.status(404).json({ success: false, message: 'Record not found' });
        }

        const record = records[0];

        // Get resume medis from medical_records
        const [resumeRecords] = await db.query(
            `SELECT record_data FROM medical_records
             WHERE mr_id = ? AND record_type = 'resume_medis'
             ORDER BY created_at DESC LIMIT 1`,
            [mrId]
        );

        if (!resumeRecords.length) {
            return res.status(404).json({ success: false, message: 'Resume medis tidak ditemukan. Silakan generate resume terlebih dahulu.' });
        }

        let resumeData = resumeRecords[0].record_data;
        if (typeof resumeData === 'string') {
            resumeData = JSON.parse(resumeData);
        }

        // Generate PDF
        const pdfGenerator = require('../utils/pdf-generator');
        const patientData = {
            fullName: record.full_name,
            age: record.age,
            phone: record.phone
        };
        const recordData = { mrId };

        const result = await pdfGenerator.generateResumeMedis(resumeData, patientData, recordData);

        // Get signed URL for download (valid for 24 hours)
        const r2Storage = require('../services/r2Storage');
        const signedUrl = await r2Storage.getSignedDownloadUrl(result.r2Key, 86400);

        res.json({
            success: true,
            message: 'PDF generated successfully',
            data: {
                filename: result.filename,
                downloadUrl: signedUrl,
                r2Key: result.r2Key
            }
        });

    } catch (error) {
        logger.error('Generate resume PDF error:', error);
        next(error);
    }
});

/**
 * Download Resume Medis PDF
 * GET /api/sunday-clinic/resume-medis/download/:filename
 */
router.get('/resume-medis/download/:filename', verifyToken, async (req, res, next) => {
    try {
        const { filename } = req.params;
        const path = require('path');
        const fs = require('fs');
        const filepath = path.join(__dirname, '../../..', 'database/invoices', filename);

        if (!fs.existsSync(filepath)) {
            return res.status(404).json({ success: false, message: 'File not found' });
        }

        res.download(filepath, filename);

    } catch (error) {
        logger.error('Download resume PDF error:', error);
        next(error);
    }
});

/**
 * Send Resume Medis via WhatsApp
 * POST /api/sunday-clinic/resume-medis/send-whatsapp
 */
router.post('/resume-medis/send-whatsapp', verifyToken, async (req, res, next) => {
    try {
        const { mrId, phone } = req.body;

        if (!mrId) {
            return res.status(400).json({ success: false, message: 'MR ID is required' });
        }

        if (!phone) {
            return res.status(400).json({ success: false, message: 'Phone number is required' });
        }

        // Get record data
        const [records] = await db.query(
            `SELECT sc.*, p.full_name, p.age, p.phone as patient_phone
             FROM sunday_clinic_records sc
             LEFT JOIN patients p ON sc.patient_id = p.id
             WHERE sc.mr_id = ?`,
            [mrId]
        );

        if (!records.length) {
            return res.status(404).json({ success: false, message: 'Record not found' });
        }

        const record = records[0];

        // Get resume medis from medical_records
        const [resumeRecords] = await db.query(
            `SELECT record_data FROM medical_records
             WHERE mr_id = ? AND record_type = 'resume_medis'
             ORDER BY created_at DESC LIMIT 1`,
            [mrId]
        );

        if (!resumeRecords.length) {
            return res.status(404).json({ success: false, message: 'Resume medis tidak ditemukan. Silakan generate resume terlebih dahulu.' });
        }

        let resumeData = resumeRecords[0].record_data;
        if (typeof resumeData === 'string') {
            resumeData = JSON.parse(resumeData);
        }

        // Generate PDF
        const pdfGenerator = require('../utils/pdf-generator');
        const patientData = {
            fullName: record.full_name,
            age: record.age,
            phone: record.patient_phone
        };
        const recordData = { mrId };

        const pdfResult = await pdfGenerator.generateResumeMedis(resumeData, patientData, recordData);

        // Get signed URL for download (valid for 24 hours)
        const r2Storage = require('../services/r2Storage');
        const pdfUrl = await r2Storage.getSignedDownloadUrl(pdfResult.r2Key, 86400);

        // Generate WhatsApp message
        const whatsappService = require('../services/whatsappService');
        const message = `Halo ${record.full_name || 'Pasien'},

Berikut adalah Resume Medis Anda dari Klinik Privat Dr. Dibya:

No. MR: ${mrId}
Tanggal: ${new Date().toLocaleDateString('id-ID')}

Resume medis Anda dapat diunduh melalui link berikut (berlaku 24 jam):
${pdfUrl}

Terima kasih telah mempercayakan kesehatan Anda kepada kami.

Salam,
Klinik Privat Dr. Dibya
RSIA Melinda, Kediri`;

        // Send via WhatsApp
        const result = await whatsappService.sendViaFonnte(phone, message);

        if (result.success) {
            res.json({
                success: true,
                message: 'Resume medis berhasil dikirim via WhatsApp',
                data: {
                    method: result.method,
                    phone: phone,
                    pdfUrl: pdfUrl
                }
            });
        } else {
            // Fallback to wa.me link
            const waLink = whatsappService.generateWaLink(phone, message);
            res.json({
                success: true,
                message: 'Klik link untuk mengirim via WhatsApp',
                data: {
                    method: 'manual',
                    waLink: waLink,
                    pdfUrl: pdfUrl
                }
            });
        }

    } catch (error) {
        logger.error('Send resume WhatsApp error:', error);
        next(error);
    }
});

// ==========================================
// WALK-IN PATIENT VISIT
// ==========================================

/**
 * POST /api/sunday-clinic/start-walk-in
 * Start a new visit for a walk-in patient (without appointment)
 * Used when staff manually adds a patient to the queue from patient detail modal
 */
router.post('/start-walk-in', verifyToken, async (req, res, next) => {
    try {
        const { patient_id, category, location, visit_date, is_retrospective, import_source } = req.body;

        if (!patient_id) {
            return res.status(400).json({
                success: false,
                message: 'patient_id wajib diisi'
            });
        }

        // Validate category
        const validCategories = ['obstetri', 'gyn_repro', 'gyn_special'];
        const finalCategory = validCategories.includes(category) ? category : 'obstetri';

        // Validate location
        const validLocations = ['klinik_private', 'rsia_melinda', 'rsud_gambiran', 'rs_bhayangkara'];
        const finalLocation = validLocations.includes(location) ? location : 'klinik_private';

        // Parse visit date for retrospective imports
        let visitDateTime = new Date();
        if (visit_date && is_retrospective) {
            visitDateTime = new Date(visit_date);
            if (isNaN(visitDateTime.getTime())) {
                visitDateTime = new Date(); // Fallback to now if invalid
            }
        }
        const visitDateStr = visitDateTime.toISOString().split('T')[0]; // YYYY-MM-DD

        // Check if patient exists
        const [patients] = await db.query(
            'SELECT id, full_name, whatsapp, phone, age, birth_date FROM patients WHERE id = ? LIMIT 1',
            [patient_id]
        );

        if (patients.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Pasien tidak ditemukan'
            });
        }

        const patient = patients[0];
        const patientName = patient.full_name || 'Unknown';

        // Get user ID from token
        const userId = req.user?.id || null;

        // Import service
        const { generateCategoryBasedMrId } = require('../services/sundayClinicService');

        // Retry logic for duplicate key errors (race condition on sequence)
        const MAX_RETRIES = 3;
        let lastError = null;
        let mrId, sequence, folderPath;

        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            const conn = await db.getConnection();

            try {
                await conn.beginTransaction();

                // Generate MR ID (only if no existing record)
                const result = await generateCategoryBasedMrId(finalCategory, conn);
                mrId = result.mrId;
                sequence = result.sequence;
                folderPath = `sunday-clinic/${mrId.toLowerCase()}`;

                // Create the record with visit_location, import_source, and retrospective date if provided
                // import_source values: simrs_gambiran, simrs_melinda, simrs_bhayangkara, or NULL for manual
                await conn.query(
                    `INSERT INTO sunday_clinic_records
                     (mr_id, mr_category, mr_sequence, patient_id, appointment_id, visit_location, import_source, folder_path, status, created_by, created_at)
                     VALUES (?, ?, ?, ?, NULL, ?, ?, ?, 'draft', ?, ?)`,
                    [mrId, finalCategory, sequence, patient_id, finalLocation, import_source || null, folderPath, userId, visitDateTime]
                );

                // Create patient_mr_history if not exists
                const [existingHistory] = await conn.query(
                    'SELECT id FROM patient_mr_history WHERE patient_id = ? AND mr_category = ? LIMIT 1',
                    [patient_id, finalCategory]
                );

                if (existingHistory.length === 0) {
                    await conn.query(
                        `INSERT INTO patient_mr_history
                         (patient_id, mr_id, mr_category, first_visit_date, last_visit_date, visit_count)
                         VALUES (?, ?, ?, ?, ?, 1)`,
                        [patient_id, mrId, finalCategory, visitDateStr, visitDateStr]
                    );
                } else {
                    // For retrospective imports, only update if the visit date is more recent than existing last_visit_date
                    await conn.query(
                        `UPDATE patient_mr_history
                         SET last_visit_date = GREATEST(last_visit_date, ?), visit_count = visit_count + 1, updated_at = NOW()
                         WHERE patient_id = ? AND mr_category = ?`,
                        [visitDateStr, patient_id, finalCategory]
                    );
                }

                await conn.commit();
                conn.release();
                lastError = null;
                break; // Success - exit retry loop

            } catch (error) {
                await conn.rollback();
                conn.release();
                lastError = error;

                // Check if it's a duplicate key error (ER_DUP_ENTRY)
                if (error.code === 'ER_DUP_ENTRY' && attempt < MAX_RETRIES) {
                    logger.warn(`Duplicate key error on attempt ${attempt}, retrying...`, {
                        sequence,
                        error: error.message
                    });
                    // Sync counter before retry
                    await db.query(`
                        UPDATE sunday_clinic_mr_counters c
                        SET c.current_sequence = (SELECT COALESCE(MAX(mr_sequence), 0) FROM sunday_clinic_records)
                        WHERE c.category = 'unified'
                    `);
                    continue;
                }
                throw error; // Non-duplicate error or max retries reached
            }
        }

        if (lastError) {
            throw lastError;
        }

        logger.info('Created walk-in visit record', {
            mrId,
            patientId: patient_id,
            patientName,
            category: finalCategory,
            location: finalLocation,
            importSource: import_source || null,
            visitDate: visitDateStr,
            isRetrospective: !!is_retrospective,
            createdBy: userId
        });

        res.json({
            success: true,
            message: is_retrospective ? 'Rekam medis retrospektif berhasil dibuat' : 'Kunjungan berhasil dibuat',
            data: {
                mrId,
                category: finalCategory,
                location: finalLocation,
                importSource: import_source || null,
                patientId: patient_id,
                patientName,
                folderPath,
                status: 'draft',
                visitDate: visitDateStr,
                isRetrospective: !!is_retrospective
            }
        });

    } catch (error) {
        logger.error('Start walk-in visit error:', error);
        next(error);
    }
});

// ==================== PATIENT VISIT HISTORY ====================

/**
 * GET /api/sunday-clinic/patient-visits/:patientId
 * Get patient's visit history with location information
 * Accessible by both patients and staff
 */
router.get('/patient-visits/:patientId', verifyToken, async (req, res, next) => {
    try {
        const patientId = req.params.patientId;
        const isPatient = req.user?.user_type === 'patient' || req.user?.role === 'patient';

        // Patients can only access their own data
        if (isPatient && req.user.id !== patientId) {
            return res.status(403).json({
                success: false,
                message: 'Akses ditolak'
            });
        }

        const [visits] = await db.query(
            `SELECT
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

        // Location config for frontend display
        const locationConfig = {
            'klinik_private': {
                name: 'Klinik Privat dr. Dibya',
                shortName: 'Klinik Privat',
                logo: '/images/dibyablacklogo.svg',
                color: '#3c8dbc'
            },
            'rsia_melinda': {
                name: 'RSIA Melinda',
                shortName: 'RSIA Melinda',
                logo: '/images/melinda-logo.png',
                color: '#e91e63'
            },
            'rsud_gambiran': {
                name: 'RSUD Gambiran',
                shortName: 'RSUD Gambiran',
                logo: '/images/gambiran-logo.png',
                color: '#17a2b8'
            },
            'rs_bhayangkara': {
                name: 'RS Bhayangkara',
                shortName: 'RS Bhayangkara',
                logo: '/images/bhayangkara-logo.png',
                color: '#28a745'
            }
        };

        // Enrich visits with location display info
        const enrichedVisits = visits.map(visit => {
            const locConfig = locationConfig[visit.visit_location] || locationConfig['klinik_private'];
            return {
                ...visit,
                location_name: locConfig.name,
                location_short: locConfig.shortName,
                location_logo: locConfig.logo,
                location_color: locConfig.color
            };
        });

        res.json({
            success: true,
            count: enrichedVisits.length,
            data: enrichedVisits,
            locationConfig // Send config for frontend use
        });

    } catch (error) {
        logger.error('Error fetching patient visits:', error);
        next(error);
    }
});

/**
 * DELETE /api/sunday-clinic/records/:mrId
 * Delete a medical record completely (Superadmin/Dokter only)
 * Use with caution - this permanently removes all data for this MR
 */
router.delete('/records/:mrId', verifyToken, requireSuperadmin, async (req, res, next) => {
    const { mrId } = req.params;

    try {
        logger.info(`[DELETE MR] Superadmin ${req.user.name} attempting to delete ${mrId}`);

        // First verify the record exists
        const [existing] = await db.query(
            'SELECT mr_id, patient_id, status FROM sunday_clinic_records WHERE mr_id = ?',
            [mrId]
        );

        if (existing.length === 0) {
            return res.status(404).json({
                success: false,
                message: `Rekam medis ${mrId} tidak ditemukan`
            });
        }

        const record = existing[0];

        // Prevent deleting finalized/billed records unless forced
        if (record.status === 'finalized' || record.status === 'billed') {
            const forceDelete = req.query.force === 'true';
            if (!forceDelete) {
                return res.status(400).json({
                    success: false,
                    message: `Rekam medis ${mrId} sudah ${record.status}. Tambahkan ?force=true untuk tetap menghapus.`
                });
            }
        }

        // Start transaction for cleanup
        const connection = await db.getConnection();
        await connection.beginTransaction();

        try {
            // Delete related billing items first (if any)
            await connection.query(
                'DELETE FROM sunday_clinic_billing_items WHERE billing_id IN (SELECT id FROM sunday_clinic_billings WHERE mr_id = ?)',
                [mrId]
            );

            // Delete billing record
            await connection.query(
                'DELETE FROM sunday_clinic_billings WHERE mr_id = ?',
                [mrId]
            );

            // Delete medical records (JSON data)
            await connection.query(
                'DELETE FROM medical_records WHERE mr_id = ?',
                [mrId]
            );

            // Delete patient documents (optional - keep for audit?)
            // await connection.query(
            //     'DELETE FROM patient_documents WHERE mr_id = ?',
            //     [mrId]
            // );

            // Finally delete the main record
            await connection.query(
                'DELETE FROM sunday_clinic_records WHERE mr_id = ?',
                [mrId]
            );

            await connection.commit();

            logger.info(`[DELETE MR] Successfully deleted ${mrId} by ${req.user.name}`, {
                mrId,
                patientId: record.patient_id,
                deletedBy: req.user.id,
                deletedByName: req.user.name
            });

            res.json({
                success: true,
                message: `Rekam medis ${mrId} berhasil dihapus`
            });

        } catch (txError) {
            await connection.rollback();
            throw txError;
        } finally {
            connection.release();
        }

    } catch (error) {
        logger.error(`[DELETE MR] Error deleting ${mrId}:`, error);
        next(error);
    }
});

// ============================================
// UPDATE CATEGORY ENDPOINT
// ============================================

/**
 * PATCH /api/sunday-clinic/records/:id/category
 * Update mr_category for a record
 */
router.patch('/records/:id/category', verifyToken, async (req, res, next) => {
    const recordId = req.params.id;
    const { category } = req.body;

    // Valid categories
    const validCategories = ['obstetri', 'gyn_repro', 'gyn_special'];

    if (!category || !validCategories.includes(category)) {
        return res.status(400).json({
            success: false,
            message: `Kategori tidak valid. Pilihan: ${validCategories.join(', ')}`
        });
    }

    try {
        // Check if record exists
        const [records] = await db.query(
            'SELECT id, mr_id, patient_id, mr_category FROM sunday_clinic_records WHERE id = ?',
            [recordId]
        );

        if (records.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Record tidak ditemukan'
            });
        }

        const record = records[0];
        const oldCategory = record.mr_category;

        // Update category
        await db.query(
            'UPDATE sunday_clinic_records SET mr_category = ?, updated_at = NOW() WHERE id = ?',
            [category, recordId]
        );

        // Log activity
        await activityLogger.log({
            userId: req.user.id,
            userName: req.user.name,
            action: 'update_mr_category',
            entityType: 'sunday_clinic_records',
            entityId: record.mr_id,
            details: {
                recordId,
                mrId: record.mr_id,
                patientId: record.patient_id,
                oldCategory,
                newCategory: category
            }
        });

        logger.info(`[UPDATE CATEGORY] ${record.mr_id} changed from ${oldCategory} to ${category} by ${req.user.name}`);

        res.json({
            success: true,
            message: `Kategori berhasil diubah ke ${category}`,
            data: {
                id: recordId,
                mr_id: record.mr_id,
                old_category: oldCategory,
                new_category: category
            }
        });

    } catch (error) {
        logger.error(`[UPDATE CATEGORY] Error updating record ${recordId}:`, error);
        next(error);
    }
});

// ============================================
// LAST ANTHROPOMETRY ENDPOINT (Copy TB/BB)
// ============================================

/**
 * GET /api/sunday-clinic/last-anthropometry/:patientId
 * Get TB/BB from patient's last visit (for copy feature)
 */
router.get('/last-anthropometry/:patientId', verifyToken, async (req, res, next) => {
    const { patientId } = req.params;
    const { exclude } = req.query; // Current MR ID to exclude

    try {
        const [rows] = await db.query(`
            SELECT
                mr.record_data,
                scr.mr_id,
                scr.created_at as visit_date
            FROM medical_records mr
            JOIN sunday_clinic_records scr ON mr.mr_id COLLATE utf8mb4_unicode_ci = scr.mr_id COLLATE utf8mb4_unicode_ci
            WHERE scr.patient_id = ?
              AND mr.record_type = 'physical_exam'
              AND (? IS NULL OR scr.mr_id != ?)
            ORDER BY scr.created_at DESC
            LIMIT 1
        `, [patientId, exclude || null, exclude || null]);

        if (rows.length === 0) {
            return res.json({
                success: false,
                message: 'Tidak ada data TB/BB dari kunjungan sebelumnya'
            });
        }

        const recordData = typeof rows[0].record_data === 'string'
            ? JSON.parse(rows[0].record_data)
            : rows[0].record_data;

        // Format visit date for display
        const visitDate = new Date(rows[0].visit_date);
        const formattedDate = `${visitDate.getDate()}/${visitDate.getMonth() + 1}/${visitDate.getFullYear()}`;

        res.json({
            success: true,
            data: {
                tinggi_badan: recordData.tinggi_badan || '',
                berat_badan: recordData.berat_badan || '',
                mr_id: rows[0].mr_id,
                visit_date: formattedDate
            }
        });

    } catch (error) {
        logger.error(`[LAST ANTHROPOMETRY] Error fetching for patient ${patientId}:`, error);
        next(error);
    }
});

// Socket.io handler for real-time billing notifications
function setupSocketHandlers(io) {
    logger.info('Setting up Socket.io handlers for Sunday Clinic billing');

    // No additional socket handlers needed - we're using broadcast from routes
    // The realtime-sync module handles socket connections
}

module.exports = router;
module.exports.setupSocketHandlers = setupSocketHandlers;

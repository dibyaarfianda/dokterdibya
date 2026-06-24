'use strict';

const express = require('express');
const { formatDateLocal } = require('../utils/date');
const router = express.Router();
const db = require('../db');
const logger = require('../utils/logger');
const { parseStructuredCPPTText, createSession } = require('../services/medifyHttpService');
const { verifyToken, verifyPatientToken, requireSuperadmin } = require('../middleware/auth');
const { findRecordByMrId } = require('../services/sundayClinicService');
const { ROLE_NAMES, isSuperadminRole } = require('../constants/roles');
const activityLogger = require('../services/activityLogger');
const sundayClinicMedifySyncQueue = require('../services/sundayClinicMedifySyncQueue');
const patientNotifications = require('./patient-notifications');
const {
    normalizeMrId,
    buildMedifyIdentityPrefill,
    normalizePhone
} = require('../services/SundayClinicRouteHelpers');
const {
    getActorFromRequest,
    getBillingSnapshot,
    logBillingAudit
} = require('../services/SundayClinicBillingAuditService');

const createPatientNotification = patientNotifications.createPatientNotification;

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
                paid_at TIMESTAMP NULL,
                paid_by VARCHAR(255),
                printed_at TIMESTAMP NULL,
                printed_by VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_mr_id (mr_id),
                INDEX idx_patient_id (patient_id),
                INDEX idx_status (status)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);

        await db.query(`
            ALTER TABLE sunday_clinic_billings
            ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP NULL,
            ADD COLUMN IF NOT EXISTS paid_by VARCHAR(255) NULL,
            ADD COLUMN IF NOT EXISTS pending_changes BOOLEAN DEFAULT FALSE,
            ADD COLUMN IF NOT EXISTS change_requests JSON NULL,
            ADD COLUMN IF NOT EXISTS last_modified_by VARCHAR(255) NULL,
            ADD COLUMN IF NOT EXISTS last_modified_at TIMESTAMP NULL
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

        await db.query(`
            CREATE TABLE IF NOT EXISTS sunday_clinic_billing_audit_logs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                billing_id INT NOT NULL,
                mr_id VARCHAR(50) NOT NULL,
                action VARCHAR(50) NOT NULL,
                actor_user_id VARCHAR(64) NULL,
                actor_name VARCHAR(255) NOT NULL,
                actor_role VARCHAR(100) NULL,
                summary TEXT NULL,
                before_snapshot JSON NULL,
                after_snapshot JSON NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_billing_id (billing_id),
                INDEX idx_mr_id (mr_id),
                INDEX idx_action (action),
                INDEX idx_created_at (created_at),
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

const MEDIFY_SOAP_SYNC_SECTIONS = new Set([
    'anamnesa',
    'physical_exam',
    'pemeriksaan_obstetri',
    'usg',
    'diagnosis',
    'planning'
]);

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

function isPatientUser(req) {
    return req.user?.user_type === 'patient' || req.user?.role === 'patient';
}

async function writeBillingAudit(client, req, payload) {
    const actor = getActorFromRequest(req);
    return logBillingAudit(client, {
        ...payload,
        ...actor
    });
}

function parseAuditSnapshot(value) {
    if (!value) {
        return null;
    }

    if (typeof value === 'object') {
        return value;
    }

    return parseJson(value, 'billing_audit_snapshot');
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
        dateStr,
        startDateTime: `${dateStr} 00:00:00`,
        endDateTime: `${nextDateStr} 00:00:00`
    };
}

function summarizeMedifySyncStatus(rows) {
    if (!Array.isArray(rows) || rows.length === 0) {
        return null;
    }

    const hasPending = rows.some(row => ['queued', 'processing', 'retrying'].includes(row.status));
    const hasFailed = rows.some(row => row.status === 'failed');
    const hasCompleted = rows.some(row => row.status === 'completed');
    const hasSkipped = rows.some(row => row.status === 'skipped');

    let status = null;
    let label = null;
    if (hasPending) {
        status = 'pending';
        label = 'Sync pending';
    } else if (hasFailed) {
        status = 'failed';
        label = 'Sync gagal';
    } else if (hasCompleted) {
        status = 'completed';
        label = 'Sync selesai';
    } else if (hasSkipped) {
        status = 'skipped';
        label = 'Sync dilewati';
    }

    if (!status) {
        return null;
    }

    const latestRow = rows.reduce((latest, row) => {
        if (!latest) {
            return row;
        }
        return new Date(row.updated_at) > new Date(latest.updated_at) ? row : latest;
    }, null);

    return {
        status,
        label,
        updated_at: latestRow?.updated_at || null,
        hasFailed,
        hasPending,
        hasCompleted,
        hasSkipped
    };
}

const QUEUE_CACHE_TTL_MS = 10000;
const queueTodayCache = {
    key: null,
    expiresAt: 0,
    payload: null
};

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

function mergeStructuredCpptPayload(cpptPayload) {
    const normalizedPayload = cpptPayload && typeof cpptPayload === 'object' ? cpptPayload : {};
    const reparsed = normalizedPayload.rawText ? parseStructuredCPPTText(normalizedPayload.rawText) : null;
    const storedStructured = normalizedPayload.structured || {};
    const rawText = String(normalizedPayload.rawText || '');

    const hasMeaningfulSectionData = (section) => {
        if (!section || typeof section !== 'object') {
            return false;
        }

        return Object.values(section).some((value) => {
            if (Array.isArray(value)) {
                return value.length > 0;
            }

            if (value && typeof value === 'object') {
                return Object.keys(value).length > 0;
            }

            return String(value || '').trim() !== '';
        });
    };

    const selectSection = (storedSection, reparsedSection, sectionPattern) => {
        if (sectionPattern.test(rawText)) {
            return hasMeaningfulSectionData(reparsedSection) ? reparsedSection : {};
        }

        if (hasMeaningfulSectionData(reparsedSection)) {
            return reparsedSection;
        }

        return storedSection;
    };

    return {
        subjective: selectSection(
            storedStructured.subjective || {},
            reparsed?.subjective || {},
            /\bSUBJECTIVE\b/i
        ),
        objective: selectSection(
            storedStructured.objective || {},
            reparsed?.objective || {},
            /\bOBJECTIVE\b/i
        ),
        assessment: selectSection(
            storedStructured.assessment || {},
            reparsed?.assessment || {},
            /\b(?:ASSESSMENT|ASSESMEN|ASSESMENT|DIAGNOSA|DIAGNOSIS|A\s*:)\b/i
        ),
        plan: selectSection(
            storedStructured.plan || {},
            reparsed?.plan || {},
            /\b(?:PLAN|PLANNING|P\s*:)\b/i
        )
    };
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
        const { dateStr: todayStr, startDateTime: todayStart, endDateTime: tomorrowStart } = getGmt7DayWindow();
        const forceRefresh = req.query.refresh === '1';

        if (!forceRefresh && queueTodayCache.key === todayStr && queueTodayCache.expiresAt > Date.now() && queueTodayCache.payload) {
            return res.json(queueTodayCache.payload);
        }

        // Join by appointment_id first, then fallback to patient_id + today's date
        // This handles cases where record was created without appointment_id link
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
                COALESCE(scr1.mr_id, scr2.mr_id) as mr_id,
                COALESCE(scr1.mr_category, scr2.mr_category) as mr_category,
                     COALESCE(scr1.visit_location, scr2.visit_location) as visit_location,
                COALESCE(scr1.status, scr2.status) as record_status,
                COALESCE(scr1.queue_status, scr2.queue_status) as queue_status,
                COALESCE(scr1.exam_started_at, scr2.exam_started_at) as exam_started_at
             FROM sunday_appointments sa
             LEFT JOIN sunday_clinic_records scr1
                                ON scr1.id = (
                                        SELECT scrx.id
                                        FROM sunday_clinic_records scrx
                                        WHERE scrx.appointment_id = sa.id
                                        ORDER BY scrx.created_at DESC, scrx.id DESC
                                        LIMIT 1
                                )
             LEFT JOIN sunday_clinic_records scr2
                                ON scr2.id = (
                                        SELECT scry.id
                                        FROM sunday_clinic_records scry
                                        WHERE scry.patient_id = sa.patient_id
                                            AND scry.appointment_id IS NULL
                                            AND scry.created_at >= ?
                                            AND scry.created_at < ?
                                        ORDER BY scry.created_at DESC, scry.id DESC
                                        LIMIT 1
                                )
             WHERE sa.appointment_date = ?
               AND sa.status IN ('pending_confirmation', 'confirmed', 'completed')
             ORDER BY sa.session ASC, sa.slot_number ASC`,
                        [todayStart, tomorrowStart, todayStr]
        );

        const mrIds = appointments
            .map(apt => normalizeMrId(apt.mr_id))
            .filter(Boolean);

        const medifySyncByMrId = new Map();

        if (mrIds.length > 0) {
            try {
                const placeholders = mrIds.map(() => '?').join(',');
                const [syncRows] = await db.query(
                    `SELECT mr_id, status, updated_at
                     FROM sunday_clinic_medify_sync_jobs
                     WHERE mr_id IN (${placeholders})`,
                    mrIds
                );

                for (const row of syncRows) {
                    const normalizedMrId = normalizeMrId(row.mr_id);
                    if (!normalizedMrId) {
                        continue;
                    }

                    if (!medifySyncByMrId.has(normalizedMrId)) {
                        medifySyncByMrId.set(normalizedMrId, []);
                    }

                    medifySyncByMrId.get(normalizedMrId).push(row);
                }
            } catch (syncError) {
                if (syncError.code !== 'ER_NO_SUCH_TABLE') {
                    throw syncError;
                }

                logger.warn('Medify sync table not ready while loading queue', {
                    error: syncError.message
                });
            }
        }

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
            visit_location: apt.visit_location || null,
            record_status: apt.record_status || null,
            queue_status: apt.queue_status || 'menunggu',
            exam_started_at: apt.exam_started_at || null,
            has_record: !!apt.mr_id,
            medify_sync: apt.visit_location === 'rsia_melinda' && apt.mr_id
                ? summarizeMedifySyncStatus(medifySyncByMrId.get(normalizeMrId(apt.mr_id)) || [])
                : null
        }));

        const payload = {
            success: true,
            date: todayStr,
            count: enriched.length,
            data: enriched
        };

        queueTodayCache.key = todayStr;
        queueTodayCache.expiresAt = Date.now() + QUEUE_CACHE_TTL_MS;
        queueTodayCache.payload = payload;

        res.json(payload);

    } catch (error) {
        logger.error('Error fetching today queue:', error);
        next(error);
    }
});

// ==================== CHECK EXISTING RECORD ====================


// ==================== PATIENT PORTAL - PUBLIC QUEUE ====================

/**
 * Mask a patient name for privacy: first letter + ***
 */
function maskPatientName(name) {
    if (!name) return 'Pasien';
    const trimmed = name.trim();
    return trimmed.charAt(0).toUpperCase() + '***';
}

/**
 * Compute a simplified queue status for patient-facing display.
 * Prefers the explicit queue_status column when available.
 */
function computeQueueStatus(apt) {
    // Use explicit 5-stage status if present
    if (apt.queue_status && apt.queue_status !== 'menunggu') return apt.queue_status;
    // Fallback to legacy 3-stage logic for old records without queue_status
    if (apt.status === 'completed') return 'selesai_periksa';
    if (apt.record_status === 'completed') return 'selesai_periksa';
    if (apt.mr_id) return 'anamnesa';
    return 'menunggu';
}

function isQueueClosedStatus(status) {
    return status === 'selesai_periksa' || status === 'lunas' || status === 'selesai';
}

async function loadTodayQueueForReminderChecks() {
    const { dateStr: todayStr, startDateTime: todayStart, endDateTime: tomorrowStart } = getGmt7DayWindow();
    const [rows] = await db.query(
        `SELECT
            sa.patient_id,
            sa.appointment_date,
            sa.session,
            sa.slot_number,
            COALESCE(scr1.queue_status, scr2.queue_status) as queue_status
         FROM sunday_appointments sa
         LEFT JOIN sunday_clinic_records scr1
                        ON scr1.id = (
                                SELECT scrx.id
                                FROM sunday_clinic_records scrx
                                WHERE scrx.appointment_id = sa.id
                                ORDER BY scrx.created_at DESC, scrx.id DESC
                                LIMIT 1
                        )
         LEFT JOIN sunday_clinic_records scr2
                        ON scr2.id = (
                                SELECT scry.id
                                FROM sunday_clinic_records scry
                                WHERE scry.patient_id = sa.patient_id
                                  AND scry.appointment_id IS NULL
                                  AND scry.created_at >= ?
                                  AND scry.created_at < ?
                                ORDER BY scry.created_at DESC, scry.id DESC
                                LIMIT 1
                        )
         WHERE sa.appointment_date = ?
           AND sa.status IN ('pending_confirmation', 'confirmed', 'completed')
         ORDER BY sa.session ASC, sa.slot_number ASC`,
        [todayStart, tomorrowStart, todayStr]
    );

    return {
        dateStr: todayStr,
        queue: rows.map((row) => ({
            patient_id: row.patient_id,
            appointment_date: row.appointment_date,
            session: Number(row.session),
            slot_number: Number(row.slot_number),
            queue_status: row.queue_status || 'menunggu'
        }))
    };
}

async function processQueueReminderNotifications() {
    try {
        if (!createPatientNotification || !patientNotifications.listActiveQueueReminderSettings) {
            return;
        }

        const { dateStr, queue } = await loadTodayQueueForReminderChecks();
        if (!Array.isArray(queue) || queue.length === 0) {
            return;
        }

        const patientIds = queue.map((item) => item.patient_id).filter(Boolean);
        const settingsRows = await patientNotifications.listActiveQueueReminderSettings(patientIds);

        if (!settingsRows.length) {
            return;
        }

        for (const settings of settingsRows) {
            const patientQueueItem = queue.find((item) => item.patient_id === settings.patient_id);
            if (!patientQueueItem) {
                continue;
            }

            if (patientQueueItem.queue_status === 'diperiksa' || isQueueClosedStatus(patientQueueItem.queue_status)) {
                continue;
            }

            const aheadCount = queue.filter((item) => (
                Number(item.session) === Number(patientQueueItem.session)
                && Number(item.slot_number) < Number(patientQueueItem.slot_number)
                && !isQueueClosedStatus(item.queue_status)
            )).length;

            if (aheadCount > Number(settings.threshold_ahead || 2)) {
                continue;
            }

            const signature = `${dateStr}|${patientQueueItem.session}|${patientQueueItem.slot_number}`;
            if (settings.last_notified_signature === signature) {
                continue;
            }

            const message = aheadCount <= 0
                ? `Nomor antrian Anda di sesi ${patientQueueItem.session} sudah hampir diperiksa. Silakan segera bersiap.`
                : `Tinggal ${aheadCount} pasien lagi sebelum nomor antrian Anda di sesi ${patientQueueItem.session}. Silakan bersiap.`;

            const notification = await createPatientNotification({
                patient_id: settings.patient_id,
                type: 'queue_reminder',
                title: 'Antrian Anda Sudah Dekat',
                message,
                link: '/antrian.html',
                icon: 'fa fa-bell',
                icon_color: 'text-warning'
            });

            if (notification && notification.success) {
                await patientNotifications.markQueueReminderTriggered(settings.patient_id, signature);
            }
        }
    } catch (error) {
        logger.warn('processQueueReminderNotifications failed', { error: error.message });
    }
}

/**
 * Update queue_status for a record, invalidate cache, and broadcast to clients.
 * Only upgrades status (will not downgrade).
 */
const QUEUE_STATUS_ORDER = ['menunggu', 'anamnesa', 'diperiksa', 'selesai_periksa', 'lunas'];
async function updateQueueStatus(mrId, newStatus) {
    if (!QUEUE_STATUS_ORDER.includes(newStatus)) return;
    try {
        const currentIdx = QUEUE_STATUS_ORDER.indexOf(newStatus);
        // Only upgrade
        await db.query(
            `UPDATE sunday_clinic_records
             SET queue_status = ?
             WHERE mr_id = ?
               AND FIELD(queue_status, ${QUEUE_STATUS_ORDER.map(() => '?').join(',')}) < ?`,
            [newStatus, mrId, ...QUEUE_STATUS_ORDER, currentIdx + 1]
        );
        // If diperiksa, also stamp exam start time
        if (newStatus === 'diperiksa') {
            await db.query(
                `UPDATE sunday_clinic_records
                 SET exam_started_at = COALESCE(exam_started_at, NOW())
                 WHERE mr_id = ?`,
                [mrId]
            );
        }
        // Invalidate queue cache
        queueTodayCache.expiresAt = 0;
        // Broadcast via socket.io
        const { dateStr: todayStr } = getGmt7DayWindow();
        if (realtimeSync && realtimeSync.broadcast) {
            realtimeSync.broadcast({
                type: 'queue:updated',
                date: todayStr,
                mrId,
                status: newStatus
            });
        }
        processQueueReminderNotifications().catch((error) => {
            logger.warn('Queue reminder background process failed', {
                mrId,
                newStatus,
                error: error.message
            });
        });
        logger.info(`Queue status updated: ${mrId} -> ${newStatus}`);
    } catch (err) {
        logger.warn('updateQueueStatus failed', { mrId, newStatus, error: err.message });
    }
}

// ==================== QUEUE SETTINGS ====================

/**
 * GET /api/sunday-clinic/queue/settings
 * Returns is_queue_visible flag. No auth required (patients need this).
 */
router.get('/queue/settings', async (req, res, next) => {
    try {
        await db.query(
            'ALTER TABLE clinic_queue_settings ADD COLUMN IF NOT EXISTS doctor_arrived TINYINT(1) NOT NULL DEFAULT 0 AFTER is_queue_visible'
        );
        const [[row]] = await db.query(
            'SELECT is_queue_visible, doctor_arrived, queue_label FROM clinic_queue_settings WHERE id = 1'
        );
        res.json({
            success: true,
            is_queue_visible: row ? Boolean(row.is_queue_visible) : false,
            doctor_arrived: row ? Boolean(row.doctor_arrived) : false,
            queue_label: row?.queue_label || 'Klinik Privat Dr. Dibya'
        });
    } catch (error) {
        logger.error('Error fetching queue settings:', error);
        next(error);
    }
});

/**
 * PUT /api/sunday-clinic/queue/settings
 * Toggle is_queue_visible. Staff only (verifyToken + requireSuperadmin).
 */
router.put('/queue/settings', verifyToken, async (req, res, next) => {
    try {
        await db.query(
            'ALTER TABLE clinic_queue_settings ADD COLUMN IF NOT EXISTS doctor_arrived TINYINT(1) NOT NULL DEFAULT 0 AFTER is_queue_visible'
        );

        const { is_queue_visible, doctor_arrived } = req.body;

        // Always read current values first so each toggle is independent
        const [[currentSettings]] = await db.query(
            'SELECT is_queue_visible, doctor_arrived FROM clinic_queue_settings WHERE id = 1 LIMIT 1'
        );
        const curVisible = currentSettings ? Number(currentSettings.is_queue_visible) : 0;
        const curArrived = currentSettings ? Number(currentSettings.doctor_arrived) : 0;

        let visible;
        let doctorArrived;

        if (typeof is_queue_visible === 'boolean' || is_queue_visible === 0 || is_queue_visible === 1) {
            // Explicit value provided for queue visibility
            visible = is_queue_visible ? 1 : 0;
        } else if (typeof doctor_arrived !== 'undefined') {
            // Only doctor_arrived is being updated — preserve queue visibility as-is
            visible = curVisible;
        } else {
            // Empty body: toggle queue visibility
            visible = curVisible === 1 ? 0 : 1;
        }

        if (typeof doctor_arrived === 'boolean' || doctor_arrived === 0 || doctor_arrived === 1) {
            doctorArrived = doctor_arrived ? 1 : 0;
        } else {
            // Preserve current doctor_arrived when not explicitly provided
            doctorArrived = curArrived;
        }

        await db.query(
            'UPDATE clinic_queue_settings SET is_queue_visible = ?, doctor_arrived = ? WHERE id = 1',
            [visible, doctorArrived]
        );
        // Broadcast setting change to patient portal
        if (realtimeSync && realtimeSync.broadcast) {
            realtimeSync.broadcast({
                type: 'queue:settings_changed',
                is_queue_visible: Boolean(visible),
                doctor_arrived: Boolean(doctorArrived)
            });
        }
        res.json({
            success: true,
            is_queue_visible: Boolean(visible),
            doctor_arrived: Boolean(doctorArrived)
        });
    } catch (error) {
        logger.error('Error updating queue settings:', error);
        next(error);
    }
});

/**
 * PUT /api/sunday-clinic/records/:mrId/queue-status
 * Manually set queue_status (staff only). Used by "Periksa Pasien" button.
 */
router.put('/records/:mrId/queue-status', verifyToken, async (req, res, next) => {
    const normalizedMrId = normalizeMrId(req.params.mrId);
    if (!normalizedMrId) {
        return res.status(400).json({ success: false, message: 'MR ID tidak valid' });
    }
    const { status } = req.body;
    if (!QUEUE_STATUS_ORDER.includes(status)) {
        return res.status(400).json({
            success: false,
            message: `Status tidak valid. Gunakan: ${QUEUE_STATUS_ORDER.join(', ')}`
        });
    }
    try {
        await updateQueueStatus(normalizedMrId, status);
        const [[row]] = await db.query(
            'SELECT queue_status, exam_started_at FROM sunday_clinic_records WHERE mr_id = ?',
            [normalizedMrId]
        );
        res.json({
            success: true,
            mr_id: normalizedMrId,
            queue_status: row?.queue_status || status,
            exam_started_at: row?.exam_started_at || null
        });
    } catch (error) {
        logger.error('Error updating queue status:', error);
        next(error);
    }
});

/**
 * GET /api/sunday-clinic/queue/public
 * Returns today's appointment queue with masked patient names.
 * Patient authentication required; only patients with today's queue booking may view it.
 */
router.get('/queue/public', verifyPatientToken, async (req, res, next) => {
    try {
        const { dateStr: todayStr, startDateTime: todayStart, endDateTime: tomorrowStart } = getGmt7DayWindow();
        const patientId = req.user?.id;

        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '0');

        const [[activeBooking]] = await db.query(
            `SELECT id, appointment_date, session, slot_number, status
             FROM sunday_appointments
             WHERE patient_id = ?
               AND appointment_date = ?
                    AND status IN ('pending', 'pending_confirmation', 'confirmed', 'completed')
             ORDER BY CASE status
                WHEN 'confirmed' THEN 1
                WHEN 'pending_confirmation' THEN 2
                     WHEN 'pending' THEN 3
                     WHEN 'completed' THEN 4
                ELSE 5
             END, session ASC, slot_number ASC
             LIMIT 1`,
            [patientId, todayStr]
        );

        if (!activeBooking) {
            return res.status(403).json({
                success: false,
                code: 'QUEUE_ACCESS_DENIED',
                message: 'Live queue hanya dapat dilihat oleh pasien yang sudah mendaftar antrian hari ini.'
            });
        }

        // Reuse existing staff queue cache if available (same data, just masked)
        if (queueTodayCache.key === todayStr && queueTodayCache.expiresAt > Date.now() && queueTodayCache.payload) {
            const publicData = queueTodayCache.payload.data.map((apt, index) => ({
                queue_position: index + 1,
                session: apt.session,
                session_label: apt.session_label,
                slot_number: apt.slot_number,
                slot_time: apt.slot_time,
                masked_name: maskPatientName(apt.patient_name),
                queue_status: computeQueueStatus(apt),
                appointment_date: todayStr
            }));
            return res.json({ success: true, date: todayStr, count: publicData.length, my_booking: activeBooking, data: publicData });
        }

        // Fetch fresh data when cache is empty
        const [rows] = await db.query(
            `SELECT
                sa.session,
                sa.slot_number,
                sa.patient_name,
                sa.status,
                COALESCE(scr1.mr_id, scr2.mr_id) as mr_id,
                COALESCE(scr1.status, scr2.status) as record_status,
                COALESCE(scr1.queue_status, scr2.queue_status) as queue_status
             FROM sunday_appointments sa
             LEFT JOIN sunday_clinic_records scr1
                ON scr1.id = (
                    SELECT scrx.id FROM sunday_clinic_records scrx
                    WHERE scrx.appointment_id = sa.id
                    ORDER BY scrx.created_at DESC, scrx.id DESC LIMIT 1
                )
             LEFT JOIN sunday_clinic_records scr2
                ON scr2.id = (
                    SELECT scry.id FROM sunday_clinic_records scry
                    WHERE scry.patient_id = sa.patient_id
                      AND scry.appointment_id IS NULL
                      AND scry.created_at >= ? AND scry.created_at < ?
                    ORDER BY scry.created_at DESC, scry.id DESC LIMIT 1
                )
             WHERE sa.appointment_date = ?
               AND sa.status IN ('pending', 'pending_confirmation', 'confirmed', 'completed')
             ORDER BY sa.session ASC, sa.slot_number ASC`,
            [todayStart, tomorrowStart, todayStr]
        );

        const publicData = rows.map((apt, index) => ({
            queue_position: index + 1,
            session: apt.session,
            session_label: getSessionLabel(apt.session),
            slot_number: apt.slot_number,
            slot_time: getSlotTime(apt.session, apt.slot_number),
            masked_name: maskPatientName(apt.patient_name),
            queue_status: computeQueueStatus(apt),
            appointment_date: todayStr
        }));

        res.json({ success: true, date: todayStr, count: publicData.length, my_booking: activeBooking, data: publicData });

    } catch (error) {
        logger.error('Error fetching public queue:', error);
        next(error);
    }
});

// ==================== CHECK EXISTING RECORD ====================
/**
 * GET /api/sunday-clinic/check-existing
 * Check if patient already has a record for today at the specified location
 * Used by PERIKSA button to prevent duplicate DRD creation
 */
router.get('/check-existing', verifyToken, async (req, res, next) => {
    try {
        const { patient_id, location } = req.query;
        const { startDateTime: todayStart, endDateTime: tomorrowStart } = getGmt7DayWindow();

        if (!patient_id) {
            return res.status(400).json({
                success: false,
                message: 'patient_id is required'
            });
        }

        // Check for existing record today at this location (or any location if not specified)
        let query = `
            SELECT mr_id, id, status, visit_location
            FROM sunday_clinic_records
                        WHERE patient_id = ?
                            AND created_at >= ?
                            AND created_at < ?
        `;
                const params = [patient_id, todayStart, tomorrowStart];

        if (location) {
            query += ` AND visit_location = ?`;
            params.push(location);
        }

        query += ` ORDER BY created_at DESC, id DESC LIMIT 1`;

        const [rows] = await db.query(query, params);

        res.json({
            success: true,
            existingMrId: rows[0]?.mr_id || null,
            existingRecordId: rows[0]?.id || null,
            status: rows[0]?.status || null,
            location: rows[0]?.visit_location || null
        });

    } catch (error) {
        logger.error('Error checking existing record:', error);
        next(error);
    }
});

// ==================== DIRECTORY ====================

router.get('/directory', verifyToken, async (req, res, next) => {
    const search = (req.query.search || '').trim();
    const requestedLimit = Number.parseInt(req.query.limit, 10);
    const defaultLimit = search ? 120 : 200;
    const limit = Number.isFinite(requestedLimit)
        ? Math.min(Math.max(requestedLimit, 20), 400)
        : defaultLimit;
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
    const orderByClause = search
        ? `ORDER BY COALESCE(p.full_name, sa.patient_name, scr.mr_id) ASC,
                 IFNULL(sa.appointment_date, scr.created_at) DESC,
                 scr.created_at DESC`
        : `ORDER BY scr.updated_at DESC, scr.created_at DESC`;

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
             ${orderByClause}
             LIMIT ?`,
            [...params, limit]
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
                totalRecords: rows.length,
                limit
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
    const skipMedifySync = req.get('X-Skip-Medify-Sync') === '1';

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

        let medifySyncResult = null;

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

        // Update queue status when anamnesa is saved (klinik_private only)
        if (section === 'anamnesa' && recordRow.visit_location === 'klinik_private') {
            await updateQueueStatus(normalizedMrId, 'anamnesa');
        }

        if (MEDIFY_SOAP_SYNC_SECTIONS.has(section) && recordRow.visit_location === 'rsia_melinda' && !skipMedifySync) {
            try {
                medifySyncResult = await sundayClinicMedifySyncQueue.enqueueDiagnosis({
                    mrId: normalizedMrId,
                    patientId: recordRow.patient_id,
                    visitLocation: recordRow.visit_location,
                    diagnosisData: section === 'diagnosis' ? data : undefined,
                    changedSection: section,
                    eventAt: new Date().toISOString(),
                    createdBy: req.user?.name || req.user?.id || null
                });
            } catch (syncError) {
                logger.warn('Failed to enqueue SOAP sync to Medify', {
                    mrId: normalizedMrId,
                    patientId: recordRow.patient_id,
                    section,
                    error: syncError.message
                });
            }
        }

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

            // Auto-publish resume medis to patient portal
            try {
                const patientId = recordRow.patient_id;
                const resumeContent = data.resume || data.content || '';

                if (resumeContent) {
                    // Get patient name for title
                    const [patientRows] = await db.query(
                        'SELECT full_name FROM patients WHERE id = ?', [patientId]
                    );
                    const patientName = patientRows[0]?.full_name || 'Pasien';
                    const today = new Date();
                    const dateStr = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;
                    const title = `Resume Medis - ${patientName} - ${dateStr}`;

                    // Check if already published for this MR
                    const [existingDoc] = await db.query(
                        `SELECT id FROM patient_documents
                         WHERE patient_id = ? AND mr_id = ? AND document_type = 'resume_medis' AND status = 'published'`,
                        [patientId, normalizedMrId]
                    );

                    const sourceData = JSON.stringify({ content: resumeContent, generatedAt: new Date().toISOString() });

                    if (existingDoc.length > 0) {
                        // Update existing
                        await db.query(
                            `UPDATE patient_documents SET title = ?, source_data = ?, published_at = NOW(), published_by = ?, updated_at = NOW()
                             WHERE id = ?`,
                            [title, sourceData, req.user.id || null, existingDoc[0].id]
                        );
                    } else {
                        // Insert new
                        await db.query(
                            `INSERT INTO patient_documents
                             (patient_id, mr_id, document_type, title, file_name, file_type, file_size,
                              source_data, source, status, published_at, published_by, created_by, created_at)
                             VALUES (?, ?, 'resume_medis', ?, ?, 'text/plain', 0, ?, 'clinic', 'published', NOW(), ?, ?, NOW())`,
                            [patientId, normalizedMrId, title, title,
                             sourceData, req.user.id || null, req.user.id || null]
                        );

                        // Only notify on first publish (not updates)
                        const { createPatientNotification } = require('./patient-notifications');
                        await createPatientNotification({
                            patient_id: patientId,
                            type: 'document',
                            title: 'Resume Medis Baru',
                            message: 'Resume medis Anda telah tersedia. Klik untuk melihat.',
                            link: '/dokumen-medis.html',
                            icon: 'fa fa-file-medical',
                            icon_color: 'text-success'
                        });
                    }

                    // Broadcast Socket.IO for real-time refresh
                    const realtimeSync = require('../realtime-sync');
                    realtimeSync.broadcast({
                        type: 'document:patient_updated',
                        patient_id: patientId,
                        mr_id: normalizedMrId,
                        document_type: 'resume_medis'
                    });

                    logger.info('Resume medis auto-published to patient portal', {
                        mrId: normalizedMrId, patientId, isUpdate: existingDoc.length > 0
                    });
                }
            } catch (autoPublishError) {
                logger.warn('Resume medis auto-publish warning:', autoPublishError);
            }
        }

        // Auto-publish USG photos to patient portal when USG section is saved
        if (section === 'usg') {
            try {
                const photos = data.photos || [];
                const patientId = recordRow.patient_id;

                // 1. Get currently published USG docs for this MR
                const [existingDocs] = await db.query(
                    `SELECT id, file_url FROM patient_documents
                     WHERE patient_id = ? AND mr_id = ? AND document_type = 'usg_photo' AND status = 'published'`,
                    [patientId, normalizedMrId]
                );

                // 2. Build sets for comparison
                const existingUrls = new Set(existingDocs.map(d => d.file_url));
                const currentUrls = new Set(photos.map(p => p.url));

                // 3. Delete removed photos from patient_documents
                const toDelete = existingDocs.filter(d => !currentUrls.has(d.file_url));
                if (toDelete.length > 0) {
                    await db.query(
                        `DELETE FROM patient_documents WHERE id IN (?)`,
                        [toDelete.map(d => d.id)]
                    );
                }

                // 4. Insert new photos into patient_documents
                const toInsert = photos.filter(p => !existingUrls.has(p.url));
                for (const photo of toInsert) {
                    await db.query(
                        `INSERT INTO patient_documents
                         (patient_id, mr_id, document_type, title, file_url, file_path, file_name, file_type, file_size,
                          source, status, published_at, published_by, created_by, created_at)
                         VALUES (?, ?, 'usg_photo', ?, ?, ?, ?, ?, ?, 'clinic', 'published', NOW(), ?, ?, NOW())`,
                        [patientId, normalizedMrId, photo.name || 'Foto USG',
                         photo.url, photo.key || photo.filename, photo.name, photo.type || 'image/jpeg', photo.size || 0,
                         req.user.id || null, req.user.id || null]
                    );
                }

                // 5. Send notification only if new photos were added
                if (toInsert.length > 0) {
                    const { createPatientNotification } = require('./patient-notifications');
                    await createPatientNotification({
                        patient_id: patientId,
                        type: 'document',
                        title: 'Foto USG Baru',
                        message: `${toInsert.length} foto USG baru telah tersedia. Klik untuk melihat.`,
                        link: '/album-usg.html',
                        icon: 'fa fa-image',
                        icon_color: 'text-primary'
                    });
                }

                // 6. Broadcast Socket.IO event for real-time refresh on patient side
                const realtimeSync = require('../realtime-sync');
                realtimeSync.broadcast({
                    type: 'usg:patient_updated',
                    patient_id: patientId,
                    mr_id: normalizedMrId,
                    added: toInsert.length,
                    removed: toDelete.length
                });

                if (toInsert.length > 0 || toDelete.length > 0) {
                    logger.info('USG auto-published to patient portal', {
                        mrId: normalizedMrId, patientId,
                        added: toInsert.length, removed: toDelete.length
                    });
                }
            } catch (autoPublishError) {
                logger.warn('USG auto-publish warning:', autoPublishError);
                // Don't fail the save
            }
        }

        // Auto-publish penunjang/lab results to patient portal when penunjang section is saved
        if (section === 'penunjang') {
            try {
                const files = data.files || [];
                const interpretation = data.interpretation || '';
                const patientId = recordRow.patient_id;

                // 1. Get currently published lab_result docs for this MR
                const [existingDocs] = await db.query(
                    `SELECT id, file_url FROM patient_documents
                     WHERE patient_id = ? AND mr_id = ? AND document_type = 'lab_result' AND status = 'published'`,
                    [patientId, normalizedMrId]
                );

                // 2. Build sets for comparison
                const existingUrls = new Set(existingDocs.map(d => d.file_url));
                const currentUrls = new Set(files.map(f => f.url));

                // 3. Delete removed files from patient_documents
                const toDelete = existingDocs.filter(d => !currentUrls.has(d.file_url));
                if (toDelete.length > 0) {
                    await db.query(
                        `DELETE FROM patient_documents WHERE id IN (?)`,
                        [toDelete.map(d => d.id)]
                    );
                }

                // 4. Insert new files into patient_documents
                const toInsert = files.filter(f => !existingUrls.has(f.url));
                for (const file of toInsert) {
                    await db.query(
                        `INSERT INTO patient_documents
                         (patient_id, mr_id, document_type, title, file_url, file_path, file_name, file_type, file_size,
                          source, status, published_at, published_by, created_by, created_at)
                         VALUES (?, ?, 'lab_result', ?, ?, ?, ?, ?, ?, 'clinic', 'published', NOW(), ?, ?, NOW())`,
                        [patientId, normalizedMrId, file.name || 'Hasil Lab',
                         file.url, file.key || file.filename, file.name, file.type || 'application/octet-stream', file.size || 0,
                         req.user.id || null, req.user.id || null]
                    );
                }

                // 5. Upsert interpretation as lab_interpretation doc
                if (interpretation.trim()) {
                    const [existingInterp] = await db.query(
                        `SELECT id FROM patient_documents
                         WHERE patient_id = ? AND mr_id = ? AND document_type = 'lab_interpretation' AND status = 'published'`,
                        [patientId, normalizedMrId]
                    );
                    const sourceData = JSON.stringify({ content: interpretation, generatedAt: new Date().toISOString() });
                    if (existingInterp.length > 0) {
                        await db.query(
                            `UPDATE patient_documents SET source_data = ?, published_at = NOW(), published_by = ?, updated_at = NOW() WHERE id = ?`,
                            [sourceData, req.user.id || null, existingInterp[0].id]
                        );
                    } else {
                        await db.query(
                            `INSERT INTO patient_documents
                             (patient_id, mr_id, document_type, title, file_name, file_type, file_size, source_data,
                              source, status, published_at, published_by, created_by, created_at)
                             VALUES (?, ?, 'lab_interpretation', 'Interpretasi Hasil Lab', 'Interpretasi Hasil Lab', 'text/plain', 0, ?,
                              'clinic', 'published', NOW(), ?, ?, NOW())`,
                            [patientId, normalizedMrId, sourceData, req.user.id || null, req.user.id || null]
                        );
                    }
                }

                // 6. Send notification only if new files were added
                if (toInsert.length > 0) {
                    const { createPatientNotification } = require('./patient-notifications');
                    await createPatientNotification({
                        patient_id: patientId,
                        type: 'document',
                        title: 'Hasil Lab Baru',
                        message: `${toInsert.length} hasil lab baru telah tersedia. Klik untuk melihat.`,
                        link: '/hasil-lab.html',
                        icon: 'fa fa-flask',
                        icon_color: 'text-info'
                    });
                }

                // 7. Broadcast Socket.IO event for real-time refresh
                const realtimeSync = require('../realtime-sync');
                realtimeSync.broadcast({
                    type: 'document:patient_updated',
                    patient_id: patientId,
                    mr_id: normalizedMrId,
                    document_type: 'lab_result',
                    added: toInsert.length,
                    removed: toDelete.length
                });

                if (toInsert.length > 0 || toDelete.length > 0) {
                    logger.info('Penunjang auto-published to patient portal', {
                        mrId: normalizedMrId, patientId,
                        added: toInsert.length, removed: toDelete.length
                    });
                }
            } catch (autoPublishError) {
                logger.warn('Penunjang auto-publish warning:', autoPublishError);
                // Don't fail the save
            }
        }

        logger.info('Saved section data for Sunday Clinic', {
            mrId: normalizedMrId,
            section,
            patientId: recordRow.patient_id,
            userId: req.user.id
        });

        const responsePayload = {
            success: true,
            message: `Data ${section} berhasil disimpan`
        };

        if (medifySyncResult) {
            responsePayload.sync = medifySyncResult;
        }

        res.json(responsePayload);
    } catch (error) {
        logger.error('Failed to save section data', {
            mrId: normalizedMrId,
            section,
            error: error.message
        });
        next(error);
    }
});

router.get('/records/:mrId/prefill/medify', verifyToken, async (req, res, next) => {
    const normalizedMrId = normalizeMrId(req.params.mrId);
    const emptySections = {
        anamnesa: {},
        physical_exam: {},
        pemeriksaan_obstetri: {},
        usg: {},
        diagnosis: {},
        planning: {}
    };

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

        const medifyPrefillSourceByLocation = {
            rsia_melinda: 'medify_melinda',
            rsud_gambiran: 'medify_gambiran'
        };
        const medifySource = medifyPrefillSourceByLocation[recordRow.visit_location] || null;

        if (!medifySource) {
            return res.json({
                success: true,
                data: {
                    mrId: normalizedMrId,
                    source: null,
                    hasData: false,
                    hasIdentity: false,
                    identity: {},
                    simrsMedId: null,
                    reason: 'unsupported_location',
                    sections: emptySections
                }
            });
        }

        const [rows] = await db.query(
            `SELECT cppt_data, simrs_med_id, completed_at, created_at
             FROM medify_import_jobs
             WHERE patient_id = ?
               AND simrs_source = ?
               AND simrs_med_id IS NOT NULL
               AND status IN ('success', 'skipped')
             ORDER BY COALESCE(completed_at, created_at) DESC, id DESC
             LIMIT 1`,
            [recordRow.patient_id, recordRow.visit_location]
        );

        if (!rows.length) {
            return res.json({
                success: true,
                data: {
                    mrId: normalizedMrId,
                    source: medifySource,
                    hasData: false,
                    hasIdentity: false,
                    identity: {},
                    simrsMedId: null,
                    sections: emptySections
                }
            });
        }

        const cachedCpptPayload = parseJson(rows[0].cppt_data, 'medify_prefill_cppt_data') || {};
        let cpptPayload = cachedCpptPayload;
        let livePrefillFetchedAt = rows[0].completed_at || rows[0].created_at || null;
        let identity = {};

        if (rows[0].simrs_med_id) {
            const medifySession = createSession(recordRow.visit_location);
            try {
                await medifySession.login();

                const liveCpptPayload = await medifySession.extractCPPT(rows[0].simrs_med_id);
                if (liveCpptPayload && !liveCpptPayload.skipReason && String(liveCpptPayload.rawText || '').trim()) {
                    cpptPayload = liveCpptPayload;
                    livePrefillFetchedAt = new Date().toISOString();

                    try {
                        await db.query(
                            `UPDATE medify_import_jobs
                             SET cppt_data = ?,
                                 status = 'success',
                                 error_message = NULL,
                                 completed_at = NOW()
                             WHERE patient_id = ?
                               AND simrs_source = ?
                               AND simrs_med_id = ?
                             ORDER BY COALESCE(completed_at, created_at) DESC, id DESC
                             LIMIT 1`,
                            [
                                JSON.stringify(liveCpptPayload),
                                recordRow.patient_id,
                                recordRow.visit_location,
                                rows[0].simrs_med_id
                            ]
                        );
                    } catch (updateCpptError) {
                        logger.warn('Failed to persist refreshed Medify CPPT payload for Sunday Clinic prefill', {
                            mrId: normalizedMrId,
                            patientId: recordRow.patient_id,
                            simrsMedId: rows[0].simrs_med_id,
                            visitLocation: recordRow.visit_location,
                            error: updateCpptError.message
                        });
                    }
                } else if (liveCpptPayload?.skipReason) {
                    logger.warn('Live Medify CPPT refresh skipped for Sunday Clinic prefill, falling back to cached payload', {
                        mrId: normalizedMrId,
                        patientId: recordRow.patient_id,
                        simrsMedId: rows[0].simrs_med_id,
                        visitLocation: recordRow.visit_location,
                        reason: liveCpptPayload.skipReason
                    });
                }

                const medifyIdentity = await medifySession.extractPatientIdentity(rows[0].simrs_med_id);
                identity = buildMedifyIdentityPrefill(medifyIdentity);
            } catch (medifyRefreshError) {
                logger.warn('Failed to refresh Medify CPPT/identity for Sunday Clinic prefill', {
                    mrId: normalizedMrId,
                    patientId: recordRow.patient_id,
                    simrsMedId: rows[0].simrs_med_id,
                    visitLocation: recordRow.visit_location,
                    error: medifyRefreshError.message
                });
            } finally {
                try {
                    await medifySession.close();
                } catch (closeError) {
                    logger.warn('Failed to close Medify session after Sunday Clinic prefill refresh', {
                        mrId: normalizedMrId,
                        simrsMedId: rows[0].simrs_med_id,
                        error: closeError.message
                    });
                }
            }
        }

        const structured = mergeStructuredCpptPayload(cpptPayload);

        const usiaKehamilanMinggu = structured.assessment?.usia_kehamilan_minggu;
        const usiaKehamilanHari = structured.assessment?.usia_kehamilan_hari;
        const usiaKehamilan = Number.isFinite(usiaKehamilanMinggu)
            ? `${usiaKehamilanMinggu} minggu${usiaKehamilanHari ? ` ${usiaKehamilanHari} hari` : ''}`
            : '';

        const anamnesa = {
            keluhan_utama: structured.subjective?.keluhan_utama || '',
            riwayat_kehamilan_saat_ini: structured.subjective?.rps || '',
            detail_riwayat_penyakit: structured.subjective?.rpd || '',
            riwayat_keluarga: structured.subjective?.rpk || '',
            hpht: convertLooseDateToIso(structured.subjective?.hpht),
            hpl: convertLooseDateToIso(structured.subjective?.hpl),
            usia_kehamilan: usiaKehamilan,
            gravida: structured.assessment?.gravida || '',
            para: structured.assessment?.para || '',
            abortus: structured.assessment?.abortus || '',
            anak_hidup: structured.assessment?.anak_hidup || ''
        };

        const physicalExam = {
            tensi: structured.objective?.tensi || '',
            td: structured.objective?.tensi || '',
            tekanan_darah: structured.objective?.tensi || '',
            nadi: structured.objective?.nadi || '',
            suhu: structured.objective?.suhu || '',
            rr: structured.objective?.rr || '',
            respirasi: structured.objective?.rr || '',
            bb: structured.objective?.berat_badan || '',
            berat_badan: structured.objective?.berat_badan || '',
            tb: structured.objective?.tinggi_badan || '',
            tinggi_badan: structured.objective?.tinggi_badan || ''
        };

        const pemeriksaanObstetri = {
            findings: [
                structured.objective?.lila ? `LILA: ${structured.objective.lila}` : '',
                structured.objective?.tfu ? `TFU: ${structured.objective.tfu}` : '',
                structured.objective?.djj ? `DJJ: ${structured.objective.djj}` : '',
                structured.objective?.vt ? `VT: ${structured.objective.vt}` : ''
            ].filter(Boolean).join('\n')
        };

        const usg = {
            hasil_usg: structured.objective?.usg || '',
            berat_janin: structured.objective?.berat_janin || '',
            presentasi: structured.objective?.presentasi || structured.assessment?.presentasi || '',
            plasenta: structured.objective?.plasenta || '',
            ketuban: structured.objective?.ketuban || ''
        };

        const diagnosis = {
            diagnosis_utama: structured.assessment?.diagnosis || '',
            diagnosis_sekunder: ''
        };

        const hasStructuredPlanParts = Boolean(
            (Array.isArray(structured.plan?.obat) && structured.plan.obat.length > 0)
            || (Array.isArray(structured.plan?.tindakan) && structured.plan.tindakan.length > 0)
            || (Array.isArray(structured.plan?.instruksi) && structured.plan.instruksi.length > 0)
        );

        const planning = {
            tindakan: Array.isArray(structured.plan?.tindakan)
                ? structured.plan.tindakan.join('\n')
                : (structured.plan?.tindakan || ''),
            terapi: Array.isArray(structured.plan?.obat)
                ? structured.plan.obat.join('\n')
                : (structured.plan?.obat || (!hasStructuredPlanParts ? (structured.plan?.raw || '') : '')),
            rencana: Array.isArray(structured.plan?.instruksi)
                ? structured.plan.instruksi.join('\n')
                : (structured.plan?.instruksi || '')
        };

        const hasSectionData = [anamnesa, physicalExam, pemeriksaanObstetri, usg, diagnosis, planning]
            .some(section => Object.values(section).some(value => String(value || '').trim() !== ''));
        const hasIdentity = Object.values(identity).some(value => String(value || '').trim() !== '');

        res.json({
            success: true,
            data: {
                mrId: normalizedMrId,
                source: medifySource,
                hasData: hasSectionData || hasIdentity,
                hasIdentity,
                simrsMedId: rows[0].simrs_med_id,
                fetchedAt: livePrefillFetchedAt,
                identity,
                sections: {
                    anamnesa,
                    physical_exam: physicalExam,
                    pemeriksaan_obstetri: pemeriksaanObstetri,
                    usg,
                    diagnosis,
                    planning
                }
            }
        });
    } catch (error) {
        logger.error('Failed to load Medify prefill data', {
            mrId: normalizedMrId,
            error: error.message
        });
        next(error);
    }
});

router.get('/medify-sync/jobs/:mrId', verifyToken, async (req, res, next) => {
    const normalizedMrId = normalizeMrId(req.params.mrId);
    const limit = Number(req.query.limit || 20);

    if (!normalizedMrId) {
        return res.status(400).json({
            success: false,
            message: 'MR ID tidak valid.'
        });
    }

    try {
        const jobs = await sundayClinicMedifySyncQueue.getJobsByMr(normalizedMrId, limit);
        res.json({
            success: true,
            data: {
                mrId: normalizedMrId,
                jobs
            }
        });
    } catch (error) {
        logger.error('Failed to load Medify sync jobs by MR', {
            mrId: normalizedMrId,
            error: error.message
        });
        next(error);
    }
});

router.get('/medify-sync/stats', verifyToken, async (req, res, next) => {
    try {
        const stats = await sundayClinicMedifySyncQueue.getStats();
        res.json({
            success: true,
            data: stats
        });
    } catch (error) {
        logger.error('Failed to load Medify sync stats', {
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
            const [[pendingPayment]] = await db.query(
                `SELECT id, payment_method, amount, expires_at
                 FROM tagihan_payments
                 WHERE billing_id = ? AND status = 'pending'
                 ORDER BY created_at DESC
                 LIMIT 1`,
                [billingRow.id]
            );

            billing = {
                ...billingRow,
                has_pending_payment: !!pendingPayment,
                pending_payment: pendingPayment || null,
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

        const { items = [], billingData = {} } = req.body;
        const requestedStatus = req.body.status || 'draft';
        const hasRequestedStatus = Object.prototype.hasOwnProperty.call(req.body, 'status');

        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();

            // Check if billing exists
            const [existingRows] = await connection.query(
                `SELECT id, status FROM sunday_clinic_billings WHERE mr_id = ?`,
                [normalizedMrId]
            );

            let billingId;
            let beforeSnapshot = null;
            let auditAction = 'billing_created';
            let statusToPersist = requestedStatus;

            if (existingRows.length > 0) {
                // Update existing billing
                const existingBilling = existingRows[0];
                billingId = existingBilling.id;
                beforeSnapshot = await getBillingSnapshot(connection, billingId);
                auditAction = 'billing_saved';
                statusToPersist = hasRequestedStatus ? requestedStatus : existingBilling.status;

                // Guard: paid billing cannot be edited
                if (existingBilling.status === 'paid') {
                    await connection.rollback();
                    return res.status(400).json({ success: false, message: 'Tagihan sudah dibayar, tidak dapat diubah.' });
                }

                // Guard: confirmed billing - block if pending payment
                if (existingBilling.status === 'confirmed') {
                    const [[pendingPay]] = await connection.query(
                        `SELECT id FROM tagihan_payments WHERE billing_id = ? AND status = 'pending'`, [billingId]
                    );
                    if (pendingPay) {
                        await connection.rollback();
                        return res.status(400).json({ success: false, message: 'Ada pembayaran pending. Batalkan pembayaran terlebih dahulu.' });
                    }
                }

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
                    [normalizedMrId, recordRow.patient_id, statusToPersist, JSON.stringify(billingData)]
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
            const actorName = getActorFromRequest(req).actorName;
            await connection.query(
                `UPDATE sunday_clinic_billings
                 SET subtotal = ?, total = ?, status = ?, billing_data = ?,
                     pending_changes = FALSE,
                     last_modified_by = ?, last_modified_at = NOW(), updated_at = NOW()
                 WHERE id = ?`,
                [subtotal, total, statusToPersist, JSON.stringify(billingData), actorName, billingId]
            );

            const afterSnapshot = await getBillingSnapshot(connection, billingId);
            await writeBillingAudit(connection, req, {
                billingId,
                mrId: normalizedMrId,
                action: auditAction,
                summary: auditAction === 'billing_created'
                    ? 'Tagihan dibuat'
                    : 'Tagihan disimpan dan total diperbarui',
                beforeSnapshot,
                afterSnapshot
            });

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
    let medifySyncResult = null;

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
            `SELECT id, status FROM sunday_clinic_billings WHERE mr_id = ? FOR UPDATE`,
            [normalizedMrId]
        );

        let billingId;
        let beforeSnapshot = null;

        if (billingRows.length === 0) {
            const [insertResult] = await connection.query(
                `INSERT INTO sunday_clinic_billings (mr_id, patient_id, subtotal, total, status, billing_data, created_at, updated_at)
                 VALUES (?, ?, 0, 0, 'draft', ?, NOW(), NOW())`,
                [normalizedMrId, recordRow.patient_id, JSON.stringify({ source: 'therapy-modal' })]
            );
            billingId = insertResult.insertId;
        } else {
            const existingBilling = billingRows[0];
            billingId = existingBilling.id;

            // Guard: paid billing cannot be edited
            if (existingBilling.status === 'paid') {
                await connection.rollback();
                return res.status(400).json({ success: false, message: 'Tagihan sudah dibayar, tidak dapat diubah.' });
            }

            // Guard: confirmed billing - block if pending payment
            if (existingBilling.status === 'confirmed') {
                const [[pendingPay]] = await connection.query(
                    `SELECT id FROM tagihan_payments WHERE billing_id = ? AND status = 'pending'`, [billingId]
                );
                if (pendingPay) {
                    await connection.rollback();
                    return res.status(400).json({ success: false, message: 'Ada pembayaran pending. Batalkan pembayaran terlebih dahulu.' });
                }
            }

            beforeSnapshot = await getBillingSnapshot(connection, billingId);
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

        const afterSnapshot = await getBillingSnapshot(connection, billingId);
        await writeBillingAudit(connection, req, {
            billingId,
            mrId: normalizedMrId,
            action: 'item_added',
            summary: `${items.length} item obat ditambahkan ke tagihan`,
            beforeSnapshot,
            afterSnapshot
        });

        await connection.commit();

        if (recordRow.visit_location === 'rsia_melinda') {
            try {
                medifySyncResult = await sundayClinicMedifySyncQueue.enqueueTerapi({
                    mrId: normalizedMrId,
                    patientId: recordRow.patient_id,
                    visitLocation: recordRow.visit_location,
                    therapyItems: items,
                    eventAt: new Date().toISOString(),
                    createdBy: req.user?.name || req.user?.id || null
                });
            } catch (syncError) {
                logger.warn('Failed to enqueue terapi sync to Medify', {
                    mrId: normalizedMrId,
                    patientId: recordRow.patient_id,
                    error: syncError.message
                });
            }
        }

        const responsePayload = {
            success: true,
            message: 'Daftar obat berhasil diperbarui',
            data: {
                mrId: normalizedMrId,
                billingId,
                subtotal: totals.subtotal
            }
        };

        if (medifySyncResult) {
            responsePayload.sync = medifySyncResult;
        }

        res.json(responsePayload);
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

// Confirm billing (all staff)
router.post('/billing/:mrId/confirm', verifyToken, async (req, res, next) => {
    const normalizedMrId = normalizeMrId(req.params.mrId);
    let connection;

    try {
        // Block patient users from confirming
        if (isPatientUser(req)) {
            return res.status(403).json({
                success: false,
                message: 'Akses ditolak'
            });
        }

        connection = await db.getConnection();
        await connection.beginTransaction();

        // Get billing ID first
        const [[billing]] = await connection.query(
            `SELECT id, status FROM sunday_clinic_billings WHERE mr_id = ? FOR UPDATE`,
            [normalizedMrId]
        );

        if (!billing) {
            await connection.rollback();
            return res.status(404).json({
                success: false,
                message: 'Billing tidak ditemukan'
            });
        }

        if (billing.status === 'paid') {
            await connection.rollback();
            return res.status(400).json({
                success: false,
                message: 'Billing sudah dibayar'
            });
        }

        const beforeSnapshot = await getBillingSnapshot(connection, billing.id);
        const staffName = getActorFromRequest(req).actorName;

        await connection.query(
            `UPDATE sunday_clinic_billings
             SET status = 'confirmed',
                 confirmed_at = NOW(),
                 confirmed_by = ?,
                 pending_changes = FALSE,
                 last_modified_by = ?,
                 last_modified_at = NOW(),
                 updated_at = NOW()
             WHERE mr_id = ?`,
            [staffName, staffName, normalizedMrId]
        );

        const afterSnapshot = await getBillingSnapshot(connection, billing.id);
        await writeBillingAudit(connection, req, {
            billingId: billing.id,
            mrId: normalizedMrId,
            action: 'billing_confirmed',
            summary: 'Tagihan dikonfirmasi',
            beforeSnapshot,
            afterSnapshot
        });

        await connection.commit();
        connection.release();
        connection = null;

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

        // Broadcast notification to all connected clients
        if (realtimeSync && realtimeSync.broadcast) {
            realtimeSync.broadcast({
                type: 'billing_confirmed',
                mrId: normalizedMrId,
                patientName,
                doctorName: staffName,
                timestamp: new Date().toISOString()
            });
        }

        // Log activity
        await activityLogger.logFromRequest(req, 'Confirm Billing',
            `Confirmed billing for ${patientName} (MR: ${normalizedMrId}) by ${staffName}`);

        res.json({
            success: true,
            message: 'Billing berhasil dikonfirmasi',
            patientName
        });
    } catch (error) {
        if (connection) {
            try {
                await connection.rollback();
            } catch (rollbackError) {
                logger.error('Failed to rollback billing confirmation', { error: rollbackError.message });
            }
        }
        logger.error('Failed to confirm billing', { error: error.message });
        next(error);
    } finally {
        if (connection) {
            connection.release();
        }
    }
});

// Mark billing as paid (payment complete)
router.post('/billing/:mrId/mark-paid', verifyToken, async (req, res, next) => {
    const normalizedMrId = normalizeMrId(req.params.mrId);
    const { payment_method, notes } = req.body;
    let lockName = null;
    let lockAcquired = false;

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

        // Prevent concurrent duplicate processing for the same billing.
        lockName = `sunday_mark_paid_${billing.id}`;
        const [[lockRow]] = await db.query('SELECT GET_LOCK(?, 5) AS acquired', [lockName]);
        lockAcquired = Number(lockRow?.acquired || 0) === 1;
        if (!lockAcquired) {
            return res.status(409).json({
                success: false,
                message: 'Billing sedang diproses oleh request lain. Silakan coba lagi.'
            });
        }

        // Re-check billing after lock to avoid stale state race.
        const [[billingLocked]] = await db.query(
            'SELECT * FROM sunday_clinic_billings WHERE mr_id = ?',
            [normalizedMrId]
        );

        if (!billingLocked) {
            return res.status(404).json({
                success: false,
                message: 'Billing tidak ditemukan'
            });
        }

        if (billingLocked.status === 'paid') {
            return res.status(400).json({
                success: false,
                message: 'Billing sudah dibayar'
            });
        }

        if (billingLocked.status !== 'confirmed') {
            return res.status(400).json({
                success: false,
                message: 'Billing harus dikonfirmasi terlebih dahulu sebelum pembayaran'
            });
        }

        const beforeSnapshot = await getBillingSnapshot(db, billingLocked.id);

        const InventoryService = require('../services/InventoryService');

        // Get all obat items from billing and validate mapping first.
        // If mapping or stock is invalid, do not allow billing to be marked paid.
        const [obatItemsRaw] = await db.query(
            `SELECT bi.item_code, bi.item_name, bi.quantity,
                    COALESCE(
                        NULLIF(CAST(JSON_UNQUOTE(JSON_EXTRACT(bi.item_data, '$.obatId')) AS UNSIGNED), 0),
                        (SELECT o.id FROM obat o WHERE bi.item_code IS NOT NULL AND o.code = bi.item_code LIMIT 1),
                        (SELECT o.id FROM obat o WHERE bi.item_code REGEXP '^[0-9]+$' AND o.id = CAST(bi.item_code AS UNSIGNED) LIMIT 1),
                        (SELECT o.id FROM obat o WHERE LOWER(TRIM(o.name)) = LOWER(TRIM(bi.item_name)) ORDER BY o.is_active DESC, o.id ASC LIMIT 1)
                    ) AS obat_id
             FROM sunday_clinic_billing_items bi
             WHERE bi.billing_id = ? AND bi.item_type = 'obat'`,
            [billingLocked.id]
        );

        const invalidObatItems = obatItemsRaw.filter(item => !item.obat_id);
        if (invalidObatItems.length > 0) {
            return res.status(400).json({
                success: false,
                message: `Data obat tidak valid: ${invalidObatItems.map(i => i.item_name || i.item_code || 'tanpa nama').join(', ')}. Simpan ulang item obat sebelum menandai lunas.`
            });
        }

        // Aggregate required qty per obat and pre-check stock availability.
        const requiredByObatId = new Map();
        for (const item of obatItemsRaw) {
            const obatId = Number(item.obat_id);
            const qty = parseInt(item.quantity, 10) || 0;
            requiredByObatId.set(obatId, (requiredByObatId.get(obatId) || 0) + qty);
        }

        if (requiredByObatId.size > 0) {
            const obatIds = Array.from(requiredByObatId.keys());
            const placeholders = obatIds.map(() => '?').join(',');
            const [stocks] = await db.query(
                `SELECT id, name, stock FROM obat WHERE id IN (${placeholders})`,
                obatIds
            );

            const [existingDeductionRows] = await db.query(
                `SELECT obat_id, ABS(SUM(quantity)) AS deducted_qty
                 FROM stock_movements
                 WHERE reference_type = 'sunday_clinic_billing'
                   AND reference_id = ?
                   AND movement_type = 'sale'
                   AND obat_id IN (${placeholders})
                 GROUP BY obat_id`,
                [billingLocked.id, ...obatIds]
            );
            const deductedMap = new Map(existingDeductionRows.map(row => [Number(row.obat_id), Number(row.deducted_qty || 0)]));

            const stockMap = new Map(stocks.map(row => [Number(row.id), row]));
            const insufficient = [];

            for (const obatId of obatIds) {
                const requiredQty = requiredByObatId.get(obatId) || 0;
                const alreadyDeducted = deductedMap.get(obatId) || 0;
                const remainingRequired = Math.max(0, requiredQty - alreadyDeducted);
                const row = stockMap.get(obatId);
                const available = row ? Number(row.stock) : 0;
                if (!row || available < remainingRequired) {
                    insufficient.push({
                        obatId,
                        name: row?.name || `Obat ID ${obatId}`,
                        required: remainingRequired,
                        alreadyDeducted,
                        available
                    });
                }
            }

            if (insufficient.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: `Stok tidak cukup untuk: ${insufficient.map(i => `${i.name} (butuh ${i.required}, tersedia ${i.available})`).join('; ')}`,
                    insufficient
                });
            }
        }

        // Deduct stock for each obat using FIFO.
        // If any deduction fails, abort and keep billing in confirmed status.
        for (const item of obatItemsRaw) {
            try {
                const requiredQty = parseInt(item.quantity, 10) || 0;

                const [[existingDeduction]] = await db.query(
                    `SELECT ABS(COALESCE(SUM(quantity), 0)) AS deducted_qty
                     FROM stock_movements
                     WHERE reference_type = 'sunday_clinic_billing'
                       AND reference_id = ?
                       AND movement_type = 'sale'
                       AND obat_id = ?`,
                    [billingLocked.id, Number(item.obat_id)]
                );

                const alreadyDeducted = Number(existingDeduction?.deducted_qty || 0);
                const remainingQty = Math.max(0, requiredQty - alreadyDeducted);

                if (remainingQty <= 0) {
                    logger.info(`Skip stock deduction for ${item.item_name} because it is already fully deducted`, {
                        mrId: normalizedMrId,
                        billingId: billingLocked.id,
                        obatId: Number(item.obat_id),
                        requiredQty,
                        alreadyDeducted
                    });
                    continue;
                }

                await InventoryService.deductStockFIFO(
                    Number(item.obat_id),
                    remainingQty,
                    'sunday_clinic_billing',
                    billingLocked.id,
                    req.user?.name || 'system'
                );
                logger.info(`Stock deducted for ${item.item_name}: ${remainingQty} units`);
            } catch (stockError) {
                logger.error(`Stock deduction failed for obat ${item.obat_id} (${item.item_name})`, {
                    mrId: normalizedMrId,
                    billingId: billingLocked.id,
                    error: stockError.message
                });
                return res.status(500).json({
                    success: false,
                    message: `Gagal mengurangi stok untuk ${item.item_name}: ${stockError.message}`
                });
            }
        }

        // Update status to paid only after stock deduction succeeds.
        const paidBy = req.user.name || req.user.id || 'Staff';
        await db.query(
            `UPDATE sunday_clinic_billings
             SET status = 'paid',
                 paid_at = NOW(),
                 paid_by = ?,
                 last_modified_by = ?,
                 last_modified_at = NOW()
              WHERE mr_id = ?`,
            [paidBy, paidBy, normalizedMrId]
        );

        const afterSnapshot = await getBillingSnapshot(db, billingLocked.id);
        await writeBillingAudit(db, req, {
            billingId: billingLocked.id,
            mrId: normalizedMrId,
            action: 'billing_marked_paid',
            summary: `Tagihan ditandai lunas (${payment_method || 'metode tidak dicatat'})`,
            beforeSnapshot,
            afterSnapshot
        });

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

        // Update queue status to lunas (klinik_private only - billing only exists for klinik_private)
        await updateQueueStatus(normalizedMrId, 'lunas');

        // Log activity
        await activityLogger.logFromRequest(req, activityLogger.ACTIONS.FINALIZE_VISIT,
            `Marked billing paid for ${patientName} (MR: ${normalizedMrId}), Total: Rp ${billingLocked.total}`);

        res.json({
            success: true,
            message: 'Pembayaran berhasil dicatat.',
            patientName
        });
    } catch (error) {
        logger.error('Failed to mark billing as paid', { error: error.message });
        next(error);
    } finally {
        if (lockAcquired && lockName) {
            try {
                await db.query('SELECT RELEASE_LOCK(?)', [lockName]);
            } catch (releaseError) {
                logger.error('Failed to release mark-paid lock', {
                    mrId: normalizedMrId,
                    lockName,
                    error: releaseError.message
                });
            }
        }
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
            `SELECT id, status FROM sunday_clinic_billings WHERE mr_id = ? FOR UPDATE`,
            [normalizedMrId]
        );

        if (billingRows.length === 0) {
            await connection.rollback();
            return res.json({
                success: true,
                message: `Tidak ada billing ditemukan. Tidak ada ${itemType} untuk dihapus.`
            });
        }

        const billing = billingRows[0];
        const billingId = billing.id;

        // Paid billing cannot be edited
        if (billing.status === 'paid') {
            await connection.rollback();
            return res.status(400).json({ success: false, message: 'Tagihan sudah dibayar, tidak dapat diubah.' });
        }

        // Block edit if pending payment exists
        if (billing.status === 'confirmed') {
            const [[pendingPay]] = await connection.query(
                `SELECT id FROM tagihan_payments WHERE billing_id = ? AND status = 'pending'`, [billingId]
            );
            if (pendingPay) {
                await connection.rollback();
                return res.status(400).json({ success: false, message: 'Ada pembayaran pending. Batalkan pembayaran terlebih dahulu.' });
            }
        }

        const beforeSnapshot = await getBillingSnapshot(connection, billingId);

        // Delete items of specified type
        const [deleteResult] = await connection.query(
            `DELETE FROM sunday_clinic_billing_items WHERE billing_id = ? AND item_type = ?`,
            [billingId, itemType]
        );

        // Recalculate billing totals
        const [[totals]] = await connection.query(
            `SELECT COALESCE(SUM(total), 0) AS subtotal FROM sunday_clinic_billing_items WHERE billing_id = ?`,
            [billingId]
        );

        const actorName = getActorFromRequest(req).actorName;
        await connection.query(
            `UPDATE sunday_clinic_billings
             SET subtotal = ?, total = ?,
                 last_modified_by = ?, last_modified_at = NOW(), updated_at = NOW()
             WHERE id = ?`,
            [totals.subtotal, totals.subtotal, actorName, billingId]
        );

        const afterSnapshot = await getBillingSnapshot(connection, billingId);
        await writeBillingAudit(connection, req, {
            billingId,
            mrId: normalizedMrId,
            action: 'item_removed',
            summary: `${deleteResult.affectedRows || 0} item ${itemType} dihapus dari tagihan`,
            beforeSnapshot,
            afterSnapshot
        });

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
            `SELECT id, status FROM sunday_clinic_billings WHERE mr_id = ? FOR UPDATE`,
            [normalizedMrId]
        );

        if (billingRows.length === 0) {
            await connection.rollback();
            return res.json({
                success: true,
                message: `Tidak ada billing ditemukan.`
            });
        }

        const billing = billingRows[0];
        const billingId = billing.id;

        // Paid billing cannot be edited
        if (billing.status === 'paid') {
            await connection.rollback();
            return res.status(400).json({ success: false, message: 'Tagihan sudah dibayar, tidak dapat diubah.' });
        }

        // Block edit if pending payment exists
        if (billing.status === 'confirmed') {
            const [[pendingPay]] = await connection.query(
                `SELECT id FROM tagihan_payments WHERE billing_id = ? AND status = 'pending'`, [billingId]
            );
            if (pendingPay) {
                await connection.rollback();
                return res.status(400).json({ success: false, message: 'Ada pembayaran pending. Batalkan pembayaran terlebih dahulu.' });
            }
        }

        const beforeSnapshot = await getBillingSnapshot(connection, billingId);

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

        const actorName = getActorFromRequest(req).actorName;
        await connection.query(
            `UPDATE sunday_clinic_billings
             SET subtotal = ?, total = ?,
                 last_modified_by = ?, last_modified_at = NOW(), updated_at = NOW()
             WHERE id = ?`,
            [totals.subtotal, totals.subtotal, actorName, billingId]
        );

        const afterSnapshot = await getBillingSnapshot(connection, billingId);
        await writeBillingAudit(connection, req, {
            billingId,
            mrId: normalizedMrId,
            action: 'item_removed',
            summary: `${deleteResult.affectedRows || 0} item kode ${itemCode} dihapus dari tagihan`,
            beforeSnapshot,
            afterSnapshot
        });

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

        // Paid billing cannot be edited by anyone
        if (billing.status === 'paid') {
            await connection.rollback();
            return res.status(400).json({
                success: false,
                message: 'Tagihan sudah dibayar, tidak dapat diubah.'
            });
        }

        // Block edit if there's a pending payment
        if (billing.status === 'confirmed') {
            const [[pendingPayment]] = await connection.query(
                `SELECT id FROM tagihan_payments WHERE billing_id = ? AND status = 'pending'`,
                [billing.id]
            );
            if (pendingPayment) {
                await connection.rollback();
                return res.status(400).json({
                    success: false,
                    message: 'Ada pembayaran pending. Batalkan pembayaran terlebih dahulu.'
                });
            }
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
        const beforeSnapshot = await getBillingSnapshot(connection, billing.id);

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

        const actorName = getActorFromRequest(req).actorName;
        await connection.query(
            `UPDATE sunday_clinic_billings
             SET subtotal = ?, total = ?,
                 last_modified_by = ?, last_modified_at = NOW(), updated_at = NOW()
             WHERE id = ?`,
            [totals.subtotal, totals.subtotal, actorName, billing.id]
        );

        const afterSnapshot = await getBillingSnapshot(connection, billing.id);
        await writeBillingAudit(connection, req, {
            billingId: billing.id,
            mrId: normalizedMrId,
            action: 'item_removed',
            summary: `Item "${deletedItem.item_name}" dihapus dari tagihan`,
            beforeSnapshot,
            afterSnapshot
        });

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

// Get billing audit history (staff only)
router.get('/billing/:mrId/audit', verifyToken, async (req, res, next) => {
    const normalizedMrId = normalizeMrId(req.params.mrId);

    try {
        if (isPatientUser(req)) {
            return res.status(403).json({
                success: false,
                message: 'Akses ditolak'
            });
        }

        const [rows] = await db.query(
            `SELECT id, billing_id, mr_id, action, actor_user_id, actor_name,
                    actor_role, summary, before_snapshot, after_snapshot, created_at
             FROM sunday_clinic_billing_audit_logs
             WHERE mr_id = ?
             ORDER BY created_at DESC, id DESC`,
            [normalizedMrId]
        );

        res.json({
            success: true,
            data: rows.map(row => ({
                ...row,
                before_snapshot: parseAuditSnapshot(row.before_snapshot),
                after_snapshot: parseAuditSnapshot(row.after_snapshot)
            }))
        });
    } catch (error) {
        logger.error('Failed to get billing audit history', {
            mrId: normalizedMrId,
            error: error.message
        });
        next(error);
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
        const result = await whatsappService.sendAuto(phone, message);

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
        const visitDateStr = formatDateLocal(visitDateTime); // YYYY-MM-DD

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
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '0');

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
            JOIN sunday_clinic_records scr ON mr.mr_id = scr.mr_id
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

// Import and mount billing payment routes (Xendit integration)
const billingPaymentRoutes = require('./billing-payment');
router.use('/billing', billingPaymentRoutes);

module.exports = router;
module.exports.setupSocketHandlers = setupSocketHandlers;

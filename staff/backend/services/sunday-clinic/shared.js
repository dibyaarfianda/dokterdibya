'use strict';

const { formatDateLocal } = require('../../utils/date');
const db = require('../../db');
const logger = require('../../utils/logger');
const { parseStructuredCPPTText, createSession } = require('../medifyHttpService');
const { findRecordByMrId } = require('../sundayClinicService');
const { ROLE_NAMES, isSuperadminRole } = require('../../constants/roles');
const activityLogger = require('../activityLogger');
const sundayClinicMedifySyncQueue = require('../sundayClinicMedifySyncQueue');
const patientNotifications = require('../../routes/patient-notifications');
const {
    normalizeMrId,
    buildMedifyIdentityPrefill,
    normalizePhone
} = require('../SundayClinicRouteHelpers');
const {
    getActorFromRequest,
    getBillingSnapshot,
    getAdditionalBillingSnapshot,
    logBillingAudit,
    logAdditionalBillingAudit
} = require('../SundayClinicBillingAuditService');

const createPatientNotification = patientNotifications.createPatientNotification;

const ADDITIONAL_BILLING_ADD_ONS = Object.freeze({
    S02: { code: 'S02', name: 'Surat Keterangan SpOG', price: 20000 },
    S03: { code: 'S03', name: 'Buku Ginekologi', price: 25000 },
    S04: { code: 'S04', name: 'Buku Obstetri (Kehamilan)', price: 40000 }
});
const ADDITIONAL_BILLING_PAYMENT_METHODS = new Set(['cash', 'debit', 'transfer']);
const ADDITIONAL_BILLING_MAX_ITEMS = 50;
const ADDITIONAL_BILLING_MAX_QUANTITY = 1000;

// Import realtime sync for broadcasting notifications
let realtimeSync = null;
try {
    realtimeSync = require('../../realtime-sync');
} catch (error) {
    logger.warn('realtime-sync not available, notifications will not be broadcasted');
}

function parsePrescriptionTemplateItems(rawItems) {
    if (Array.isArray(rawItems)) return rawItems;
    if (!rawItems) return [];
    try {
        return JSON.parse(rawItems);
    } catch (error) {
        return [];
    }
}

function normalizePrescriptionTemplateItems(items) {
    if (!Array.isArray(items)) return null;

    const normalized = items
        .map((item) => {
            const name = typeof item.name === 'string' ? item.name.trim() : '';
            if (!name) return null;

            const quantity = Number(item.quantity) > 0 ? Number(item.quantity) : 1;
            const unit = typeof item.unit === 'string' && item.unit.trim() ? item.unit.trim() : 'tablet';
            const caraPakai = typeof item.caraPakai === 'string' ? item.caraPakai.trim() : '';
            const latinSig = typeof item.latinSig === 'string' ? item.latinSig.trim() : '';
            const obatId = item.obatId || item.id || null;

            return {
                obatId,
                name,
                quantity,
                unit,
                caraPakai,
                latinSig
            };
        })
        .filter(Boolean);

    return normalized.length > 0 ? normalized : null;
}

function getPrescriptionTemplateActor(req) {
    return req.user?.name || req.user?.email || req.user?.id || 'Staff';
}

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

async function writeAdditionalBillingAudit(client, req, payload) {
    const actor = getActorFromRequest(req);
    return logAdditionalBillingAudit(client, {
        ...payload,
        ...actor
    });
}

function createAdditionalBillingError(message, statusCode = 400) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

function parseAdditionalBillingId(value) {
    const additionalBillingId = Number(value);
    if (!Number.isSafeInteger(additionalBillingId) || additionalBillingId <= 0) {
        throw createAdditionalBillingError('ID tagihan tambahan tidak valid.');
    }
    return additionalBillingId;
}

function normalizeAdditionalBillingText(value, label, maxLength = 500) {
    if (value === undefined || value === null || value === '') {
        return '';
    }
    if (typeof value !== 'string') {
        throw createAdditionalBillingError(`${label} tidak valid.`);
    }
    const normalized = value.trim();
    if (normalized.length > maxLength) {
        throw createAdditionalBillingError(`${label} terlalu panjang.`);
    }
    return normalized;
}

async function normalizeAdditionalBillingItems(connection, rawItems) {
    if (!Array.isArray(rawItems) || rawItems.length === 0) {
        throw createAdditionalBillingError('Tagihan tambahan harus berisi minimal satu item.');
    }
    if (rawItems.length > ADDITIONAL_BILLING_MAX_ITEMS) {
        throw createAdditionalBillingError(`Maksimal ${ADDITIONAL_BILLING_MAX_ITEMS} item per tagihan tambahan.`);
    }

    const normalizedItems = [];
    for (const rawItem of rawItems) {
        if (!rawItem || typeof rawItem !== 'object') {
            throw createAdditionalBillingError('Format item tagihan tambahan tidak valid.');
        }

        const itemType = typeof rawItem.item_type === 'string'
            ? rawItem.item_type.trim().toLowerCase()
            : '';
        const quantity = Number(rawItem.quantity);
        if (!Number.isSafeInteger(quantity) || quantity <= 0 || quantity > ADDITIONAL_BILLING_MAX_QUANTITY) {
            throw createAdditionalBillingError(`Jumlah item harus berupa angka bulat antara 1 dan ${ADDITIONAL_BILLING_MAX_QUANTITY}.`);
        }

        if (itemType === 'obat') {
            const obatId = Number(rawItem.obat_id ?? rawItem.obatId ?? rawItem.id);
            if (!Number.isSafeInteger(obatId) || obatId <= 0) {
                throw createAdditionalBillingError('Obat tagihan tambahan tidak valid.');
            }

            const [[obat]] = await connection.query(
                `SELECT id, code, name, price, unit
                 FROM obat
                 WHERE id = ? AND is_active = 1
                 LIMIT 1`,
                [obatId]
            );
            if (!obat) {
                throw createAdditionalBillingError('Obat tidak ditemukan atau sudah tidak aktif.');
            }

            const caraPakai = normalizeAdditionalBillingText(rawItem.caraPakai ?? rawItem.cara_pakai, 'Aturan pakai');
            const latinSig = normalizeAdditionalBillingText(rawItem.latinSig ?? rawItem.latin_sig, 'Signa latin');
            const price = Number(obat.price || 0);

            normalizedItems.push({
                item_type: 'obat',
                item_code: obat.code || null,
                item_name: obat.name,
                quantity,
                price,
                total: price * quantity,
                item_data: {
                    source: 'additional-billing',
                    obatId: obat.id,
                    unit: obat.unit || '',
                    caraPakai,
                    latinSig
                }
            });
            continue;
        }

        if (itemType === 'admin') {
            const code = typeof (rawItem.item_code || rawItem.code) === 'string'
                ? (rawItem.item_code || rawItem.code).trim().toUpperCase()
                : '';
            const addOn = ADDITIONAL_BILLING_ADD_ONS[code];
            if (!addOn) {
                throw createAdditionalBillingError('Item surat atau buku tidak tersedia untuk tagihan tambahan.');
            }

            normalizedItems.push({
                item_type: 'admin',
                item_code: addOn.code,
                item_name: addOn.name,
                quantity,
                price: addOn.price,
                total: addOn.price * quantity,
                item_data: {
                    source: 'additional-billing',
                    catalog: 'additional-addon'
                }
            });
            continue;
        }

        throw createAdditionalBillingError('Jenis item tagihan tambahan tidak didukung.');
    }

    return normalizedItems;
}

async function insertAdditionalBillingItems(connection, additionalBillingId, items) {
    for (const item of items) {
        await connection.query(
            `INSERT INTO sunday_clinic_additional_billing_items
             (additional_billing_id, item_type, item_code, item_name, quantity, price, total, item_data)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                additionalBillingId,
                item.item_type,
                item.item_code,
                item.item_name,
                item.quantity,
                item.price,
                item.total,
                JSON.stringify(item.item_data || {})
            ]
        );
    }
}

async function getAdditionalBillingRecordForUpdate(connection, mrId, additionalBillingId) {
    const [[additionalBilling]] = await connection.query(
        `SELECT ab.*, parent.status AS parent_billing_status
         FROM sunday_clinic_additional_billings ab
         JOIN sunday_clinic_billings parent ON parent.id = ab.parent_billing_id
         WHERE ab.id = ? AND ab.mr_id = ?
         FOR UPDATE`,
        [additionalBillingId, mrId]
    );

    if (!additionalBilling) {
        throw createAdditionalBillingError('Tagihan tambahan tidak ditemukan.', 404);
    }
    if (additionalBilling.parent_billing_status !== 'paid') {
        throw createAdditionalBillingError('Tagihan utama harus lunas sebelum tagihan tambahan diproses.');
    }

    return additionalBilling;
}

async function loadAdditionalBillingDocument(mrId, additionalBillingId) {
    const [[billing]] = await db.query(
        `SELECT ab.*
         FROM sunday_clinic_additional_billings ab
         JOIN sunday_clinic_billings parent ON parent.id = ab.parent_billing_id
         WHERE ab.id = ? AND ab.mr_id = ? AND parent.status = 'paid'`,
        [additionalBillingId, mrId]
    );

    if (!billing) {
        throw createAdditionalBillingError('Tagihan tambahan tidak ditemukan.', 404);
    }
    if (!['confirmed', 'paid'].includes(billing.status)) {
        throw createAdditionalBillingError('Tagihan tambahan harus dikonfirmasi sebelum dicetak.');
    }

    const [items] = await db.query(
        `SELECT * FROM sunday_clinic_additional_billing_items
         WHERE additional_billing_id = ?
         ORDER BY id ASC`,
        [additionalBillingId]
    );
    billing.items = items.map(item => ({
        ...item,
        item_data: typeof item.item_data === 'string'
            ? (parseJson(item.item_data, 'additional_billing_item') || {})
            : (item.item_data || {})
    }));

    const [[record]] = await db.query(
        `SELECT r.*, p.full_name, p.birth_date, p.phone
         FROM sunday_clinic_records r
         JOIN patients p ON r.patient_id = p.id
         WHERE r.mr_id = ?`,
        [mrId]
    );
    if (!record) {
        throw createAdditionalBillingError('Data pasien untuk tagihan tambahan tidak ditemukan.', 404);
    }

    return { billing, record };
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

module.exports = {
    formatDateLocal,
    db,
    logger,
    parseStructuredCPPTText,
    createSession,
    findRecordByMrId,
    ROLE_NAMES,
    isSuperadminRole,
    activityLogger,
    sundayClinicMedifySyncQueue,
    normalizeMrId,
    buildMedifyIdentityPrefill,
    normalizePhone,
    getActorFromRequest,
    getBillingSnapshot,
    getAdditionalBillingSnapshot,
    logBillingAudit,
    logAdditionalBillingAudit,
    createPatientNotification,
    ADDITIONAL_BILLING_ADD_ONS,
    ADDITIONAL_BILLING_PAYMENT_METHODS,
    ADDITIONAL_BILLING_MAX_ITEMS,
    ADDITIONAL_BILLING_MAX_QUANTITY,
    realtimeSync,
    parsePrescriptionTemplateItems,
    normalizePrescriptionTemplateItems,
    getPrescriptionTemplateActor,
    INTAKE_SELECT,
    toDate,
    calculateAge,
    MEDIFY_SOAP_SYNC_SECTIONS,
    calculateGestationalAge,
    parseJson,
    isPatientUser,
    writeBillingAudit,
    writeAdditionalBillingAudit,
    createAdditionalBillingError,
    parseAdditionalBillingId,
    normalizeAdditionalBillingText,
    normalizeAdditionalBillingItems,
    insertAdditionalBillingItems,
    getAdditionalBillingRecordForUpdate,
    loadAdditionalBillingDocument,
    parseAuditSnapshot,
    getPatient,
    getSessionLabel,
    getSlotTime,
    formatUtcYmd,
    getGmt7DayWindow,
    summarizeMedifySyncStatus,
    QUEUE_CACHE_TTL_MS,
    queueTodayCache,
    getAppointment,
    findLatestIntake,
    mergeStructuredCpptPayload,
    buildIntakeSummary,
    formatRecord,
    formatPatient,
    formatIntakeRow,
    formatMedicalRecordRow,
    loadMedicalRecordsBundle,
    buildAggregateSummary
};

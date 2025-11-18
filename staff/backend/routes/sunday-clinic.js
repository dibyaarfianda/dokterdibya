'use strict';

const express = require('express');
const router = express.Router();
const db = require('../db');
const logger = require('../utils/logger');
const { verifyToken } = require('../middleware/auth');
const { findRecordByMrId } = require('../services/sundayClinicService');

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
        doctorId: row.doctor_id,
        doctorName: row.doctor_name,
        recordType: row.record_type,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        data
    };
}

async function loadMedicalRecordsBundle(patientId) {
    if (!patientId) {
        return null;
    }

    const [rows] = await db.query(
        `SELECT id, patient_id, visit_id, doctor_id, doctor_name, record_type, record_data,
                created_at, updated_at
         FROM medical_records
         WHERE patient_id = ?
         ORDER BY created_at DESC
         LIMIT 50`,
        [patientId]
    );

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
            loadMedicalRecordsBundle(record.patientId)
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

// ==================== BILLING ENDPOINTS ====================

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
                    // Use hardcoded admin fee
                    validatedPrice = 5000;
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

        await connection.query(
            `DELETE FROM sunday_clinic_billing_items WHERE billing_id = ? AND item_type = 'obat'`,
            [billingId]
        );

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
                req.user.name || req.user.email || req.user.id,
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

// Confirm billing (doctor action)
router.post('/billing/:mrId/confirm', verifyToken, async (req, res, next) => {
    const normalizedMrId = normalizeMrId(req.params.mrId);

    try {
        const [result] = await db.query(
            `UPDATE sunday_clinic_billings
             SET status = 'confirmed', confirmed_at = NOW(), confirmed_by = ?
             WHERE mr_id = ?`,
            [req.user.name || req.user.email || 'Staff', normalizedMrId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: 'Billing tidak ditemukan'
            });
        }

        res.json({
            success: true,
            message: 'Billing berhasil dikonfirmasi'
        });
    } catch (error) {
        logger.error('Failed to confirm billing', { error: error.message });
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
            [req.user.name || req.user.email || 'Staff', normalizedMrId]
        );

        res.json({
            success: true,
            message: 'Invoice berhasil dicetak',
            cashierName: req.user.name || req.user.email || 'Staff'
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
            requestedBy: req.user.name || req.user.email || req.user.id,
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
                        // Use hardcoded admin fee
                        validatedPrice = 5000;
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
                    [subtotal, subtotal, JSON.stringify(changeRequests), req.user.name || req.user.email || req.user.id, billing.id]
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
            [req.user.name || req.user.email || req.user.id, normalizedMrId]
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

module.exports = router;

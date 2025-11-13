'use strict';

const database = require('../utils/database');
const logger = require('../utils/logger');

function sanitizePhone(raw) {
    if (!raw) {
        return null;
    }
    const digits = String(raw).replace(/[^0-9]/g, '');
    if (!digits) {
        return null;
    }
    if (digits.startsWith('62')) {
        return digits;
    }
    if (digits.startsWith('0')) {
        return `62${digits.slice(1)}`;
    }
    return digits.length >= 9 ? `62${digits}` : digits;
}

function calculateAge(dob) {
    if (!dob) {
        return null;
    }
    const birth = new Date(dob);
    if (Number.isNaN(birth.valueOf())) {
        return null;
    }
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
        age -= 1;
    }
    return age;
}

function buildAllergyString(payload) {
    if (!payload) {
        return null;
    }
    const notes = [];
    if (payload.allergy_drugs) {
        notes.push(`Obat: ${payload.allergy_drugs}`.trim());
    }
    if (payload.allergy_food) {
        notes.push(`Makanan: ${payload.allergy_food}`.trim());
    }
    if (payload.allergy_env) {
        notes.push(`Lingkungan: ${payload.allergy_env}`.trim());
    }
    return notes.length ? notes.join('\n') : null;
}

function buildMedicalHistory(existingHistory, record) {
    const payload = record.payload || {};
    const metadata = payload.metadata || {};
    const historyEntry = {
        submissionId: record.submissionId,
        collectedAt: record.receivedAt || null,
        reviewStatus: record.status || null,
        verifiedAt: record.review?.verifiedAt || null,
        reviewer: record.review?.verifiedBy || null,
        notes: record.review?.notes || null,
        highRisk: Boolean(metadata.highRisk),
        riskFlags: metadata.riskFlags || [],
        obstetricTotals: metadata.obstetricTotals || {},
        edd: metadata.edd || null,
        lmp: payload.lmp || null,
        gravida: metadata.obstetricTotals?.gravida ?? payload.gravida ?? null,
        para: metadata.obstetricTotals?.para ?? null,
        abortus: metadata.obstetricTotals?.abortus ?? null,
        living: metadata.obstetricTotals?.living ?? null,
        medications: payload.medications || [],
        pastConditions: payload.past_conditions || [],
        allergies: {
            drugs: payload.allergy_drugs || null,
            food: payload.allergy_food || null,
            environment: payload.allergy_env || null,
        },
    };

    const history = [];
    if (existingHistory) {
        try {
            const parsed = JSON.parse(existingHistory);
            if (Array.isArray(parsed.records)) {
                history.push(...parsed.records);
            }
        } catch (error) {
            // Ignore parse errors and start a clean history chain
        }
    }
    history.push(historyEntry);
    return JSON.stringify({ source: 'patient-intake', records: history });
}

async function findExistingPatient(connection, payload, sanitizedPhone) {
    if (sanitizedPhone) {
        const [byPhone] = await connection.query(
            'SELECT id, medical_history FROM patients WHERE whatsapp = ? LIMIT 1',
            [sanitizedPhone]
        );
        if (byPhone.length) {
            return byPhone[0];
        }
    }
    if (payload.full_name && payload.dob) {
        const [byIdentity] = await connection.query(
            'SELECT id, medical_history FROM patients WHERE full_name = ? AND birth_date = ? LIMIT 1',
            [payload.full_name, payload.dob]
        );
        if (byIdentity.length) {
            return byIdentity[0];
        }
    }
    if (payload.full_name) {
        const [byName] = await connection.query(
            'SELECT id, medical_history FROM patients WHERE full_name = ? ORDER BY created_at DESC LIMIT 1',
            [payload.full_name]
        );
        if (byName.length) {
            return byName[0];
        }
    }
    return null;
}

async function ensurePatient(connection, record, sanitizedPhone) {
    const payload = record.payload || {};
    const existing = await findExistingPatient(connection, payload, sanitizedPhone);
    const age = calculateAge(payload.dob);
    const allergy = buildAllergyString(payload);
    const medicalHistory = buildMedicalHistory(existing?.medical_history, record);

    if (existing) {
        const updateSegments = [];
        const params = [];

        if (payload.full_name) {
            updateSegments.push('full_name = ?');
            params.push(payload.full_name);
        }
        if (sanitizedPhone) {
            updateSegments.push('whatsapp = ?');
            params.push(sanitizedPhone);
        }
        if (payload.dob) {
            updateSegments.push('birth_date = ?');
            params.push(payload.dob);
        }
        if (age !== null) {
            updateSegments.push('age = ?');
            params.push(age);
        }
        updateSegments.push('is_pregnant = 1');
        if (allergy) {
            updateSegments.push('allergy = ?');
            params.push(allergy);
        }
        updateSegments.push('medical_history = ?');
        params.push(medicalHistory);
        updateSegments.push('updated_at = NOW()');
        params.push(existing.id);

        await connection.query(`UPDATE patients SET ${updateSegments.join(', ')} WHERE id = ?`, params);
        return { patientId: existing.id, created: false, updated: true };
    }

    const [rows] = await connection.query(
        'SELECT LPAD(COALESCE(MAX(CAST(id AS UNSIGNED)), 0) + 1, 5, "0") AS nextId FROM patients'
    );
    const nextId = rows[0]?.nextId || '00001';

    await connection.query(
        'INSERT INTO patients (id, full_name, whatsapp, birth_date, age, is_pregnant, allergy, medical_history, patient_type, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, NOW(), NOW())',
        [
            nextId,
            payload.full_name || 'Pasien Intake',
            sanitizedPhone,
            payload.dob || null,
            age,
            allergy,
            medicalHistory,
            'web',
        ]
    );

    return { patientId: nextId, created: true, updated: false };
}

function buildVisitSummary(record, context) {
    const payload = record.payload || {};
    const metadata = payload.metadata || {};
    return {
        intakeSubmissionId: record.submissionId,
        source: 'patient-intake',
        status: record.status || null,
        reviewer: context.reviewer || record.review?.verifiedBy || null,
        reviewedAt: context.reviewedAt || record.review?.verifiedAt || null,
        notes: context.notes || record.review?.notes || null,
        highRisk: Boolean(metadata.highRisk),
        riskFlags: metadata.riskFlags || [],
        obstetricTotals: metadata.obstetricTotals || {},
        edd: metadata.edd || null,
        lmp: payload.lmp || null,
        gravida: metadata.obstetricTotals?.gravida ?? payload.gravida ?? null,
        para: metadata.obstetricTotals?.para ?? null,
        abortus: metadata.obstetricTotals?.abortus ?? null,
        living: metadata.obstetricTotals?.living ?? null,
    };
}

async function upsertVisit(connection, patientId, record, context) {
    const payload = record.payload || {};
    const visitSummary = buildVisitSummary(record, context);
    const servicesJson = JSON.stringify(visitSummary);
    const medicationsJson = JSON.stringify(payload.medications || []);
    const reviewer = context.reviewer || record.review?.verifiedBy || null;
    const reviewedAt = context.reviewedAt ? new Date(context.reviewedAt) : null;
    const visitDate = reviewedAt && !Number.isNaN(reviewedAt.valueOf()) ? reviewedAt : new Date();

    const [existing] = await connection.query(
        `SELECT id FROM visits
         WHERE is_dummy = 1
           AND services IS NOT NULL
           AND JSON_UNQUOTE(JSON_EXTRACT(services, '$.intakeSubmissionId')) = ?
         LIMIT 1`,
        [record.submissionId]
    );

    if (existing.length) {
        const visitId = existing[0].id;
        await connection.query(
            `UPDATE visits
             SET patient_id = ?,
                 patient_name = ?,
                 visit_date = ?,
                 examiner = ?,
                 services = ?,
                 medications = ?,
                 updated_at = NOW()
             WHERE id = ?`,
            [patientId, payload.full_name || 'Pasien Intake', visitDate, reviewer, servicesJson, medicationsJson, visitId]
        );
        return { visitId, created: false };
    }

    const [result] = await connection.query(
        `INSERT INTO visits
            (patient_id, patient_name, visit_date, examiner, services, medications, grand_total, is_dummy, created_at, updated_at)
         VALUES
            (?, ?, ?, ?, ?, ?, 0.00, 1, NOW(), NOW())`,
        [patientId, payload.full_name || 'Pasien Intake', visitDate, reviewer, servicesJson, medicationsJson]
    );

    return { visitId: result.insertId, created: true };
}

function buildExamData(record) {
    return {
        intakeSubmissionId: record.submissionId,
        source: 'patient-intake',
        collectedAt: record.receivedAt || null,
        status: record.status || null,
        payload: record.payload || {},
        review: record.review || {},
        summary: record.summary || null,
    };
}

async function upsertMedicalExam(connection, patientId, visitId, record, context) {
    const examPayload = buildExamData(record);
    const examiner = context.reviewer || record.review?.verifiedBy || null;
    const reviewedAt = context.reviewedAt ? new Date(context.reviewedAt) : null;
    const examDate = reviewedAt && !Number.isNaN(reviewedAt.valueOf()) ? reviewedAt : new Date();
    const examDataJson = JSON.stringify(examPayload);

    const [existing] = await connection.query(
        `SELECT id FROM medical_exams
         WHERE exam_type = 'anamnesa'
           AND exam_data IS NOT NULL
           AND JSON_UNQUOTE(JSON_EXTRACT(exam_data, '$.intakeSubmissionId')) = ?
         LIMIT 1`,
        [record.submissionId]
    );

    if (existing.length) {
        const examId = existing[0].id;
        await connection.query(
            `UPDATE medical_exams
             SET patient_id = ?,
                 visit_id = ?,
                 exam_data = ?,
                 examiner = ?,
                 exam_date = ?,
                 updated_at = NOW()
             WHERE id = ?`,
            [patientId, visitId || null, examDataJson, examiner, examDate, examId]
        );
        return { examId, created: false };
    }

    const [result] = await connection.query(
        `INSERT INTO medical_exams
            (patient_id, visit_id, exam_type, exam_data, examiner, exam_date, created_at, updated_at)
         VALUES
            (?, ?, 'anamnesa', ?, ?, ?, NOW(), NOW())`,
        [patientId, visitId || null, examDataJson, examiner, examDate]
    );

    return { examId: result.insertId, created: true };
}

async function process(record, context = {}) {
    if (!record || !record.submissionId) {
        throw new Error('Data intake tidak valid untuk integrasi.');
    }
    if (record.integration?.status === 'completed') {
        return record.integration;
    }

    const integrationResult = await database.transaction(async (connection) => {
        const sanitizedPhone = sanitizePhone(record.payload?.phone);
        const patientInfo = await ensurePatient(connection, record, sanitizedPhone);
        const visitInfo = await upsertVisit(connection, patientInfo.patientId, record, context);
        const examInfo = await upsertMedicalExam(connection, patientInfo.patientId, visitInfo.visitId, record, context);

        return {
            status: 'completed',
            integratedAt: new Date().toISOString(),
            patientId: patientInfo.patientId,
            visitId: visitInfo.visitId,
            medicalExamId: examInfo.examId,
            createdNewPatient: patientInfo.created,
            updatedExistingPatient: patientInfo.updated,
            visitCreated: visitInfo.created,
            examCreated: examInfo.created,
            reviewer: context.reviewer || record.review?.verifiedBy || null,
            notes: context.notes || record.review?.notes || null,
            risk: {
                highRisk: Boolean(record.summary?.highRisk || record.payload?.metadata?.highRisk),
                flags: record.summary?.riskFlags || record.payload?.metadata?.riskFlags || [],
            },
        };
    });

    logger.info('Patient intake integrated into EMR', {
        submissionId: record.submissionId,
        patientId: integrationResult.patientId,
        visitId: integrationResult.visitId,
        medicalExamId: integrationResult.medicalExamId,
    });

    return integrationResult;
}

module.exports = {
    process,
};

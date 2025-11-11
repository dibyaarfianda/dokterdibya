#!/usr/bin/env node
'use strict';

const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const LOG_DIR = path.join(__dirname, '..', 'logs', 'patient-intake');

function getArg(key) {
    const index = process.argv.findIndex((arg) => arg === key);
    if (index === -1) {
        return null;
    }
    const next = process.argv[index + 1];
    if (!next || next.startsWith('--')) {
        return true;
    }
    return next;
}

function deriveKey() {
    const secret = process.env.INTAKE_ENCRYPTION_KEY;
    if (!secret) {
        return null;
    }
    return crypto.createHash('sha256').update(String(secret)).digest();
}

function decryptRecord(wrapper, key) {
    if (!wrapper.encrypted) {
        return wrapper;
    }
    if (!key) {
        throw new Error('INTAKE_ENCRYPTION_KEY tidak ditemukan saat mencoba mendekripsi.');
    }
    const { iv, authTag, data } = wrapper.encrypted;
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(authTag, 'base64'));
    const decrypted = Buffer.concat([
        decipher.update(Buffer.from(data, 'base64')),
        decipher.final(),
    ]);
    return JSON.parse(decrypted.toString('utf8'));
}

async function loadRecord(submissionId, key) {
    const files = await fs.readdir(LOG_DIR);
    const target = files.find((file) => file.startsWith(submissionId));
    if (!target) {
        throw new Error(`Submission ${submissionId} tidak ditemukan.`);
    }
    const raw = await fs.readFile(path.join(LOG_DIR, target), 'utf8');
    const parsed = JSON.parse(raw);
    return decryptRecord(parsed, key);
}

function mapToEmrStructures(record) {
    const payload = record.payload || {};
    const meta = payload.metadata || {};
    const eddInfo = meta.edd || {};
    const totals = meta.obstetricTotals || {};
    const now = new Date().toISOString();

    const patientProfile = {
        fullName: payload.full_name || null,
        nik: payload.nik || null,
        dob: payload.dob || null,
        phone: payload.phone || null,
        address: payload.address || null,
        maritalStatus: payload.marital_status || null,
        occupation: payload.occupation || null,
        education: payload.education || null,
        emergencyContact: payload.emergency_contact || null,
        createdAt: now,
    };

    const pregnancy = {
        lmp: payload.lmp || null,
        edd: eddInfo.value || payload.edd || null,
        eddSource: eddInfo.source || null,
        firstCheckGestationalAge: payload.first_check_ga || null,
        heightCm: payload.height || null,
        weightKg: payload.weight || null,
        bmi: payload.bmi || null,
        bmiCategory: meta.bmiCategory || null,
        bloodPressure: payload.blood_pressure || null,
        muacCm: payload.muac || null,
        generalCondition: payload.general_condition || null,
        status: 'patient_reported',
        riskFlags: meta.riskFlags || [],
        highRisk: Boolean(meta.highRisk),
    };

    const obstetricHistory = (payload.previousPregnancies || []).map((item) => ({
        sequence: item.index || null,
        year: item.year || null,
        deliveryMode: item.mode || null,
        complications: item.complication || null,
        babyWeight: item.weight || null,
        childAlive: item.alive || item.child_alive || null,
        origin: 'patient',
    }));

    const prenatalVisits = (payload.prenatalVisits || []).map((item) => ({
        visitNumber: item.index || item.visit_no || null,
        visitDate: item.date || item.visit_date || null,
        gestationalAge: item.ga || item.visit_ga || null,
        weight: item.weight || item.visit_weight || null,
        bloodPressure: item.bp || item.visit_bp || null,
        fetalHeartRate: item.fhr || item.visit_fhr || null,
        notes: item.note || item.visit_note || null,
        origin: 'patient',
    }));

    const labResults = (payload.labResults || []).map((item) => ({
        testName: item.test || item.lab_test || null,
        recommendedAt: item.recommended || item.lab_recommend || null,
        performedAt: item.date || item.lab_date || null,
        result: item.result || item.lab_result || null,
        followUp: item.follow || item.lab_follow || null,
        origin: 'patient',
    }));

    return {
        submissionId: record.submissionId,
        receivedAt: record.receivedAt,
        patientProfile,
        pregnancy: {
            ...pregnancy,
            totals: {
                gravida: totals.gravida ?? payload.gravida ?? null,
                para: totals.para ?? null,
                abortus: totals.abortus ?? null,
                living: totals.living ?? null,
            },
        },
        medications: payload.medications || [],
        obstetricHistory,
        prenatalVisits,
        labResults,
        audit: {
            signature: payload.signature?.value || payload.patient_signature || null,
            consent: Boolean(payload.consent),
            finalAck: Boolean(payload.final_ack),
            clientIp: record.client?.ip || null,
            userAgent: record.client?.userAgent || null,
        },
        originalPayload: payload,
    };
}

async function main() {
    const submissionId = getArg('--id') || getArg('--submission');
    if (!submissionId) {
        console.error('Gunakan --id <submissionId> untuk memilih data yang akan diekstrak.');
        process.exitCode = 1;
        return;
    }
    try {
        const key = deriveKey();
        const record = loadRecord(submissionId, key);
        const resolved = await record;
        const mapped = mapToEmrStructures(resolved);
        if (getArg('--json')) {
            console.log(JSON.stringify(mapped, null, 2));
            return;
        }
        console.log(`[${mapped.submissionId}] Ready for EMR import`);
        console.log('Patient profile:', mapped.patientProfile);
        console.log('Pregnancy core :', mapped.pregnancy);
        console.log('Medications    :', mapped.medications);
        console.log('Obstetric hx   :', mapped.obstetricHistory);
        console.log('Prenatal visits:', mapped.prenatalVisits);
        console.log('Lab results    :', mapped.labResults);
    } catch (error) {
        console.error('Gagal memproses intake:', error.message);
        process.exitCode = 1;
    }
}

main();

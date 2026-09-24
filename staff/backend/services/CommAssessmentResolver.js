'use strict';

const db = require('../db');

const LOCATIONS = Object.freeze({ melinda: 'rsia_melinda', gambiran: 'rsud_gambiran', bhayangkara: 'rs_bhayangkara' });
class ResolutionError extends Error {
    constructor(statusCode, code) {
        super(code);
        this.statusCode = statusCode;
        this.code = code;
    }
}
const fail = (status, code) => { throw new ResolutionError(status, code); };
const clean = value => typeof value === 'string' ? value.trim() : '';

async function resolve(input = {}) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) fail(400, 'INVALID_SOURCE');
    const facility = clean(input.facility);
    const location = LOCATIONS[facility];
    if (!location) fail(400, 'INVALID_SOURCE');
    const hospitalMrId = clean(input.no_rm);
    const caseId = clean(input.case_id);
    const nik = clean(input.nik).replace(/\D/g, '');
    if (!hospitalMrId && !caseId && !nik) fail(400, 'INVALID_SOURCE');
    if (nik && !/^\d{16}$/.test(nik)) fail(400, 'INVALID_SOURCE');

    const evidence = [];
    if (hospitalMrId) {
        const [rows] = await db.query(
            `SELECT patient_id FROM patient_external_ids
             WHERE source_system = 'COMM' AND facility = ? AND hospital_mr_id = ?`,
            [location, hospitalMrId]
        );
        evidence.push(...rows);
    }
    if (nik) {
        const [records] = await db.query(
            `SELECT patient_id FROM patient_records WHERE REGEXP_REPLACE(nik, '[^0-9]', '') = ? AND patient_id IS NOT NULL`, [nik]
        );
        const [intake] = await db.query(
            `SELECT patient_id FROM patient_intake_submissions WHERE REGEXP_REPLACE(nik, '[^0-9]', '') = ? AND patient_id IS NOT NULL`, [nik]
        );
        evidence.push(...records, ...intake);
    }
    if (caseId) {
        const [jobs] = await db.query(
            `SELECT patient_id FROM medify_import_jobs WHERE simrs_source = ? AND simrs_med_id = ? AND patient_id IS NOT NULL`,
            [facility, caseId]
        );
        evidence.push(...jobs);
    }
    const patients = new Set(evidence.map(row => clean(row.patient_id)).filter(Boolean));
    if (!patients.size) fail(404, 'PATIENT_NOT_FOUND');
    if (patients.size > 1) fail(409, 'PATIENT_AMBIGUOUS');
    const patientId = [...patients][0];

    const [visits] = await db.query(
        `SELECT mr_id FROM sunday_clinic_records
         WHERE patient_id = ? AND visit_location = ? AND mr_id IS NOT NULL AND TRIM(mr_id) <> ''`,
        [patientId, location]
    );
    if (!visits.length) fail(404, 'VISIT_NOT_FOUND');
    if (visits.length !== 1) fail(409, 'VISIT_AMBIGUOUS');
    const mrId = clean(visits[0].mr_id);
    const [sections] = await db.query(
        `SELECT id, version, record_data FROM medical_records
         WHERE patient_id = ? AND mr_id = ? AND record_type = 'anamnesa'`,
        [patientId, mrId]
    );
    if (sections.length > 1) fail(409, 'SECTION_AMBIGUOUS');
    let anamnesa = null;
    if (sections.length) {
        const row = sections[0];
        const version = Number(row.version);
        if (!Number.isSafeInteger(version) || version < 1) fail(409, 'SECTION_INVALID');
        let data;
        try { data = typeof row.record_data === 'string' ? JSON.parse(row.record_data) : row.record_data; }
        catch (_) { fail(409, 'SECTION_INVALID'); }
        if (!data || typeof data !== 'object' || Array.isArray(data)) fail(409, 'SECTION_INVALID');
        anamnesa = { id: row.id, version, data };
    }
    return { patientId, mrId, anamnesa };
}

module.exports = { resolve, ResolutionError };

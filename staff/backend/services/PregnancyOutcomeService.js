'use strict';

/**
 * Staff marks a pregnancy as ended by keguguran / lahir mati (pregnancy_outcomes table).
 * Never reads or writes birth_congratulations and never sends notifications.
 */

const { toDateString, resolvePregnancyEnd, hphtFromReference } = require('./PregnancyEnd');

const OUTCOME_TYPES = ['keguguran', 'lahir_mati'];
const NOTE_MAX = 500;

class PregnancyOutcomeError extends Error {
    constructor(status, message) {
        super(message);
        this.name = 'PregnancyOutcomeError';
        this.status = status;
    }
}

function pad(n) {
    return String(n).padStart(2, '0');
}

function localToday(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Strict 'YYYY-MM-DD' only (round-trips through toDateString), else null. */
function parseEventDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return null;
    return toDateString(value.trim());
}

function parseRecordData(raw) {
    if (!raw) return null;
    if (typeof raw === 'object') return raw;
    try {
        return JSON.parse(raw);
    } catch (e) {
        return null;
    }
}

async function loadHphtSources(db, patientId) {
    const result = { anamnesa: null, usg: null };

    // Same shape as routes/patients.js obstetri HPHT, for a single patient.
    const [anamnesaRows] = await db.query(
        `SELECT JSON_UNQUOTE(JSON_EXTRACT(mr.record_data, '$.hpht')) AS hpht
         FROM sunday_clinic_records scr
         JOIN medical_records mr
             ON mr.mr_id = scr.mr_id
             AND mr.record_type = 'anamnesa'
         WHERE scr.patient_id = ?
             AND scr.mr_category = 'obstetri'
             AND JSON_UNQUOTE(JSON_EXTRACT(mr.record_data, '$.hpht')) IS NOT NULL
             AND JSON_UNQUOTE(JSON_EXTRACT(mr.record_data, '$.hpht')) != ''
         ORDER BY scr.last_activity_at DESC
         LIMIT 1`,
        [patientId]
    );
    if (anamnesaRows && anamnesaRows.length > 0) {
        const hpht = hphtFromReference({ kind: 'hpht', date: anamnesaRows[0].hpht });
        if (hpht) result.anamnesa = hpht;
    }

    // Same shape as routes/patients-auth.js latest USG EDD.
    const [usgRows] = await db.query(
        `SELECT record_data, created_at AS record_date
         FROM medical_records
         WHERE patient_id = ?
         AND record_type = 'usg'
         AND JSON_EXTRACT(record_data, '$.edd') IS NOT NULL
         AND JSON_EXTRACT(record_data, '$.edd') != ''
         AND JSON_EXTRACT(record_data, '$.edd') != 'null'
         ORDER BY created_at DESC
         LIMIT 1`,
        [patientId]
    );
    if (usgRows && usgRows.length > 0) {
        const data = parseRecordData(usgRows[0].record_data);
        const hpht = data ? hphtFromReference({ kind: 'hpl', date: data.edd }) : null;
        if (hpht) result.usg = hpht;
    }

    return result;
}

function createPregnancyOutcomeService({ db, now = () => new Date() }) {
    async function record(patientId, { outcome_type, event_date, note } = {}, staffId) {
        if (!OUTCOME_TYPES.includes(outcome_type)) {
            throw new PregnancyOutcomeError(400, 'Jenis kejadian tidak valid');
        }
        const eventDate = parseEventDate(event_date);
        if (!eventDate) {
            throw new PregnancyOutcomeError(400, 'Tanggal kejadian tidak valid');
        }
        if (eventDate > localToday(now())) {
            throw new PregnancyOutcomeError(400, 'Tanggal kejadian tidak boleh di masa depan');
        }
        let cleanNote = null;
        if (note !== undefined && note !== null) {
            const trimmed = String(note).trim();
            if (trimmed.length > NOTE_MAX) {
                throw new PregnancyOutcomeError(400, 'Catatan maksimal 500 karakter');
            }
            cleanNote = trimmed === '' ? null : trimmed;
        }

        const [patients] = await db.query('SELECT id FROM patients WHERE id = ?', [patientId]);
        if (!patients || patients.length === 0) {
            throw new PregnancyOutcomeError(404, 'Pasien tidak ditemukan');
        }

        // The staff list uses the anamnesa HPHT, so the outcome must end that one when it exists;
        // the USG-derived HPHT (EDD - 280) is only the fallback when there is no anamnesa HPHT.
        const sources = await loadHphtSources(db, patientId);
        const hpht = sources.anamnesa || sources.usg;
        if (!hpht) {
            throw new PregnancyOutcomeError(400, 'Pasien tidak punya data kehamilan (HPHT/HPL)');
        }
        const accepted = resolvePregnancyEnd(hpht, [{ type: outcome_type, date: eventDate }]).ended;
        if (!accepted) {
            throw new PregnancyOutcomeError(400, 'Tanggal kejadian lebih awal dari HPHT kehamilan ini');
        }

        const [result] = await db.query(
            'INSERT INTO pregnancy_outcomes (patient_id, outcome_type, event_date, note, recorded_by) VALUES (?, ?, ?, ?, ?)',
            [patientId, outcome_type, eventDate, cleanNote, staffId]
        );
        return { id: result.insertId, outcome_type, event_date: eventDate };
    }

    async function voidOutcome(patientId, outcomeId, staffId) {
        const [result] = await db.query(
            'UPDATE pregnancy_outcomes SET voided_at = NOW(), voided_by = ? WHERE id = ? AND patient_id = ? AND voided_at IS NULL',
            [staffId, outcomeId, patientId]
        );
        if (!result || result.affectedRows === 0) {
            throw new PregnancyOutcomeError(404, 'Penandaan tidak ditemukan');
        }
    }

    return { record, voidOutcome };
}

module.exports = { PregnancyOutcomeError, createPregnancyOutcomeService, OUTCOME_TYPES };

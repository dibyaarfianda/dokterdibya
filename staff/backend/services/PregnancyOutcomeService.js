'use strict';

/**
 * Staff marks a pregnancy as ended by keguguran / lahir mati (pregnancy_outcomes table).
 * Never reads or writes birth_congratulations and never sends notifications.
 */

const { toDateString, resolvePregnancyEnd, hphtFromReference } = require('./PregnancyEnd');
const { gaWeeksAt, lossTypeForGa } = require('./PregnancyEpisodeRules');

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

function actorIdOf(actor) {
    if (actor && typeof actor === 'object') return actor.id !== undefined ? actor.id : null;
    return actor === undefined ? null : actor;
}

function createPregnancyOutcomeService({ db, now = () => new Date(), episodes } = {}) {
    let episodeService = episodes;
    function episodesOf() {
        if (!episodeService) {
            const { createPregnancyEpisodeService } = require('./PregnancyEpisodeService');
            episodeService = createPregnancyEpisodeService({ db, now });
        }
        return episodeService;
    }

    async function inTransaction(work) {
        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();
            const result = await work(conn);
            await conn.commit();
            return result;
        } catch (err) {
            try { await conn.rollback(); } catch (e) { /* keep original error */ }
            throw err;
        } finally {
            conn.release();
        }
    }

    async function record(patientId, { outcome_type, event_date, note } = {}, actor) {
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

        const staffId = actorIdOf(actor);
        const id = await inTransaction(async conn => {
            const [result] = await conn.query(
                'INSERT INTO pregnancy_outcomes (patient_id, outcome_type, event_date, note, recorded_by) VALUES (?, ?, ?, ?, ?)',
                [patientId, outcome_type, eventDate, cleanNote, staffId]
            );
            await episodesOf().endOngoing(
                patientId,
                {
                    outcome: outcome_type === 'keguguran' ? 'abortus' : 'lahir_mati',
                    ended_on: eventDate,
                    linkTable: 'pregnancy_outcomes',
                    linkId: result.insertId
                },
                actor,
                conn
            );
            return result.insertId;
        });

        const response = { id, outcome_type, event_date: eventDate };
        const expected = lossTypeForGa(gaWeeksAt(hpht, eventDate));
        const chosen = outcome_type === 'keguguran' ? 'abortus' : 'lahir_mati';
        if (expected && expected !== chosen) {
            response.warning = expected === 'abortus'
                ? 'Usia kehamilan <20 minggu biasanya dicatat sebagai abortus'
                : 'Usia kehamilan ≥20 minggu biasanya dicatat sebagai lahir mati';
        }
        return response;
    }

    async function voidOutcome(patientId, outcomeId, actor) {
        const staffId = actorIdOf(actor);
        await inTransaction(async conn => {
            const [rows] = await conn.query(
                'SELECT id, patient_id, outcome_type, event_date, pregnancy_id, voided_at FROM pregnancy_outcomes WHERE id = ? AND patient_id = ? AND voided_at IS NULL FOR UPDATE',
                [outcomeId, patientId]
            );
            const outcome = rows && rows[0];
            if (!outcome) {
                throw new PregnancyOutcomeError(404, 'Penandaan tidak ditemukan');
            }
            const [result] = await conn.query(
                'UPDATE pregnancy_outcomes SET voided_at = NOW(), voided_by = ? WHERE id = ? AND patient_id = ? AND voided_at IS NULL',
                [staffId, outcomeId, patientId]
            );
            if (!result || result.affectedRows === 0) {
                throw new PregnancyOutcomeError(404, 'Penandaan tidak ditemukan');
            }
            if (!outcome.pregnancy_id) return;

            const [pregRows] = await conn.query(
                'SELECT id, hpht, status, outcome, ended_on FROM pregnancies WHERE id = ? AND patient_id = ? FOR UPDATE',
                [outcome.pregnancy_id, patientId]
            );
            const pregnancy = pregRows && pregRows[0];
            if (!pregnancy) return;
            const endedByThis = pregnancy.status === 'ended'
                && (pregnancy.outcome === 'abortus' || pregnancy.outcome === 'lahir_mati')
                && toDateString(pregnancy.ended_on) === toDateString(outcome.event_date);
            if (!endedByThis) return;

            const flagReview = () => conn.query('UPDATE pregnancies SET needs_review = 1, updated_by = ? WHERE id = ?', [staffId, pregnancy.id]);

            if (!pregnancy.hpht) {
                // No start date: this row only exists because of the outcome, so never reopen it.
                const count = async (sql, params) => {
                    const [rowsN] = await conn.query(sql, params);
                    return Number(rowsN && rowsN[0] ? rowsN[0].n : 0);
                };
                const visits = await count('SELECT COUNT(*) AS n FROM sunday_clinic_records WHERE pregnancy_id = ?', [pregnancy.id]);
                const births = await count('SELECT COUNT(*) AS n FROM birth_congratulations WHERE pregnancy_id = ?', [pregnancy.id]);
                const otherOutcomes = await count('SELECT COUNT(*) AS n FROM pregnancy_outcomes WHERE pregnancy_id = ? AND id <> ?', [pregnancy.id, outcome.id]);
                if (visits + births + otherOutcomes === 0) {
                    await conn.query('UPDATE pregnancy_outcomes SET pregnancy_id = NULL WHERE id = ?', [outcome.id]);
                    await conn.query('DELETE FROM pregnancies WHERE id = ? AND patient_id = ?', [pregnancy.id, patientId]);
                } else {
                    await flagReview();
                }
                return;
            }

            const [others] = await conn.query(
                "SELECT id FROM pregnancies WHERE patient_id = ? AND status = 'ongoing' AND id <> ? FOR UPDATE",
                [patientId, pregnancy.id]
            );
            if (others && others.length > 0) {
                await flagReview();
            } else {
                await conn.query(
                    "UPDATE pregnancies SET status = 'ongoing', outcome = NULL, ended_on = NULL, ga_weeks_at_end = NULL, updated_by = ? WHERE id = ?",
                    [staffId, pregnancy.id]
                );
            }
        });
    }

    return { record, voidOutcome };
}

module.exports = { PregnancyOutcomeError, createPregnancyOutcomeService, OUTCOME_TYPES };

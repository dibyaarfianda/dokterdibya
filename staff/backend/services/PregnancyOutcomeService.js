'use strict';

/**
 * Staff marks a pregnancy as ended by keguguran / lahir mati (pregnancy_outcomes table).
 * Never reads or writes birth_congratulations and never sends notifications.
 */

const { toDateString, END_TOLERANCE_DAYS } = require('./PregnancyEnd');
const { loadCurrentPregnancies, datingOf } = require('./CurrentPregnancy');
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
function dayNumber(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    return Date.UTC(y, m - 1, d) / 86400000;
}

function parseEventDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return null;
    return toDateString(value.trim());
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

        const staffId = actorIdOf(actor);
        let hpht = null;
        const id = await inTransaction(async conn => {
            // The outcome ends the patient's ongoing pregnancy row; read it on the same connection as the write.
            const current = (await loadCurrentPregnancies(conn, [patientId])).get(String(patientId));
            const dating = current && current.ongoing ? datingOf(current.ongoing) : null;
            if (!current || !current.ongoing) {
                throw new PregnancyOutcomeError(400, 'Tidak ada kehamilan berjalan');
            }
            if (!dating) {
                throw new PregnancyOutcomeError(400, 'Pasien tidak punya data kehamilan (HPHT/HPL)');
            }
            hpht = dating.hpht;
            if (dayNumber(eventDate) < dayNumber(hpht) - END_TOLERANCE_DAYS) {
                throw new PregnancyOutcomeError(400, 'Tanggal kejadian lebih awal dari HPHT kehamilan ini');
            }
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

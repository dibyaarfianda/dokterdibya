'use strict';

/**
 * Patient-reported end of pregnancy (portal) and reopening a wrong report (dokter/bidan).
 * Only ever updates an existing `pregnancies` row; never inserts one, never writes
 * birth_congratulations or pregnancy_outcomes. Dates are local 'YYYY-MM-DD' strings.
 *
 * Errors: PatientReportError (400/404/409). reopen's role check reuses assertCanClose from
 * PregnancyEpisodeService, whose PregnancyEpisodeError(403) propagates unchanged.
 */

const { datingOf } = require('./CurrentPregnancy');
const { assertCanClose } = require('./PregnancyEpisodeService');
const rules = require('./PatientPregnancyReportRules');

const { PatientReportError, isPastHpl, shouldAsk, snoozeUntil, normalizePatientReport } = rules;

const STALE_MESSAGE = 'Data kehamilan sudah berubah. Muat ulang halaman.';
const NOT_PATIENT_REPORT_MESSAGE = 'Hanya laporan pasien yang dapat dibuka kembali';
const HAS_ONGOING_MESSAGE = 'Pasien sudah punya kehamilan berjalan';

const SELECT_ALL = 'SELECT * FROM pregnancies WHERE patient_id = ? ORDER BY sequence ASC, id ASC';

// Columns cleared when a patient report is reopened (status/flags are set explicitly below).
const REOPEN_NULL_COLUMNS = [
    'outcome', 'ended_on', 'ga_weeks_at_end', 'delivery_method', 'delivery_indication',
    'delivery_place', 'babies', 'term', 'kuretase'
];

function pad(n) {
    return String(n).padStart(2, '0');
}

/** Local calendar day of a Date (server runs in WIB); never toISOString. */
function localDateString(d) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function newestOngoing(rows) {
    const ongoing = rows.filter(r => r.status === 'ongoing');
    ongoing.sort((a, b) => (Number(b.sequence) - Number(a.sequence)) || (Number(b.id) - Number(a.id)));
    return ongoing[0] || null;
}

function createPatientPregnancyReportService({ db, now = () => new Date() }) {
    const today = () => localDateString(now());

    async function withTransaction(work) {
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

    // Own read (no lock): loadCurrentPregnancies does not select report_snoozed_until.
    async function status(patientId) {
        const [rows] = await db.query(SELECT_ALL, [patientId]);
        const row = newestOngoing(rows || []);
        if (!row) return { ask: false, hpht: null };
        const dating = datingOf(row);
        return { ask: shouldAsk(row, today()), hpht: dating ? dating.hpht : null };
    }

    async function submit(patientId, body) {
        return withTransaction(async conn => {
            const [rows] = await conn.query(`${SELECT_ALL} FOR UPDATE`, [patientId]);
            const row = newestOngoing(rows || []);
            const todayStr = today();
            // Ruling R1: only past-HPL is re-checked here; a snooze never blocks an answer.
            if (!row || !isPastHpl(row, todayStr)) throw new PatientReportError(409, STALE_MESSAGE);

            if (body && body.answer === 'masih_hamil') {
                await conn.query('UPDATE pregnancies SET report_snoozed_until = ? WHERE id = ?', [snoozeUntil(todayStr), row.id]);
                return { snoozed: true };
            }

            const { hpht } = datingOf(row);
            const { cols } = normalizePatientReport(body, { hpht, today: todayStr, patientId });
            const keys = Object.keys(cols);
            const [res] = await conn.query(
                `UPDATE pregnancies SET ${keys.map(k => `${k} = ?`).join(', ')} WHERE id = ? AND status = 'ongoing'`,
                [...keys.map(k => cols[k]), row.id]
            );
            if (res && res.affectedRows === 0) throw new PatientReportError(409, STALE_MESSAGE);
            return { closed: true };
        });
    }

    async function reopen(patientId, pregnancyId, actor) {
        assertCanClose(actor);
        return withTransaction(async conn => {
            const [rows] = await conn.query(`${SELECT_ALL} FOR UPDATE`, [patientId]);
            const list = rows || [];
            const target = list.find(r => String(r.id) === String(pregnancyId));
            if (!target) throw new PatientReportError(404, 'Kehamilan tidak ditemukan');
            if (Number(target.ended_by_patient) !== 1 || target.status !== 'ended') {
                throw new PatientReportError(409, NOT_PATIENT_REPORT_MESSAGE);
            }
            if (list.some(r => r.status === 'ongoing')) throw new PatientReportError(409, HAS_ONGOING_MESSAGE);

            await conn.query(
                `UPDATE pregnancies SET ${REOPEN_NULL_COLUMNS.map(c => `${c} = NULL`).join(', ')},
                        status = 'ongoing', ended_by_patient = 0, needs_review = 0, review_reason = NULL,
                        report_snoozed_until = ?
                  WHERE id = ? AND status = 'ended' AND ended_by_patient = 1`,
                [snoozeUntil(today()), target.id]
            );
            return { pregnancy_id: target.id };
        });
    }

    return { status, submit, reopen };
}

module.exports = { createPatientPregnancyReportService };

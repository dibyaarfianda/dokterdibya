'use strict';

// Stage 2: the "current pregnancy" of a patient is read from the pregnancies table
// (not derived from dates). Used by Kelola Pasien lists and search.

const { toDateString } = require('./PregnancyEnd');
const { trackerDates } = require('./PregnancyTrackerDates');

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const FULL_TERM_DAYS = 280;

// pregnancies.outcome -> list pregnancy_end.type
const PREGNANCY_END_TYPES = Object.freeze({
    lahir_hidup: 'birth',
    lahir_mati: 'lahir_mati',
    abortus: 'keguguran',
    ektopik: 'keguguran',
    unknown: 'selesai'
});

function dayNumber(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    return Date.UTC(y, m - 1, d) / MS_PER_DAY;
}

function fromDayNumber(n) {
    return new Date(n * MS_PER_DAY).toISOString().slice(0, 10); // UTC day number -> its own calendar date
}

/** pregnancies row -> { hpht, hpl } ('YYYY-MM-DD'); each derived from the other (+/- 280 days); null if neither. */
function datingOf(row) {
    if (!row) return null;
    const hpht = toDateString(row.hpht);
    const hpl = toDateString(row.hpl);
    if (!hpht && !hpl) return null;
    return {
        hpht: hpht || fromDayNumber(dayNumber(hpl) - FULL_TERM_DAYS),
        hpl: hpl || fromDayNumber(dayNumber(hpht) + FULL_TERM_DAYS)
    };
}

function newestFirst(a, b) {
    return (Number(b.sequence) - Number(a.sequence)) || (Number(b.id) - Number(a.id));
}

/**
 * One batch read for many patients.
 * -> Map<patientId, { ongoing: Row|null, lastEnded: Row|null }>
 * ongoing = newest status='ongoing'; lastEnded = newest ended clinic pregnancy, only when nothing is ongoing.
 */
async function loadCurrentPregnancies(db, patientIds) {
    const map = new Map();
    if (!patientIds || patientIds.length === 0) return map;

    const [rows] = await db.query(
        `SELECT id, patient_id, sequence, source, status, outcome, hpht, hpl, ended_on
           FROM pregnancies
          WHERE patient_id IN (?)
          ORDER BY patient_id, sequence DESC, id DESC`,
        [patientIds]
    );

    const byPatient = new Map();
    for (const row of rows || []) {
        const key = String(row.patient_id);
        if (!byPatient.has(key)) byPatient.set(key, []);
        byPatient.get(key).push(row);
    }

    for (const [patientId, list] of byPatient) {
        list.sort(newestFirst);
        const ongoing = list.find(r => r.status === 'ongoing') || null;
        const lastEnded = ongoing ? null : (list.find(r => r.status === 'ended' && r.source === 'clinic') || null);
        map.set(patientId, { ongoing, lastEnded });
    }

    const endedIds = [...map.values()]
        .map(c => c.lastEnded && c.lastEnded.id)
        .filter(id => id !== null && id !== undefined);
    if (endedIds.length > 0) {
        const [outcomes] = await db.query(
            `SELECT id, pregnancy_id, note
               FROM pregnancy_outcomes
              WHERE voided_at IS NULL AND pregnancy_id IN (?)
              ORDER BY id DESC`,
            [endedIds]
        );
        const byPregnancy = new Map();
        for (const o of outcomes || []) {
            if (!byPregnancy.has(o.pregnancy_id)) byPregnancy.set(o.pregnancy_id, o); // newest wins
        }
        for (const cur of map.values()) {
            if (!cur.lastEnded) continue;
            const o = byPregnancy.get(cur.lastEnded.id);
            if (o) {
                cur.lastEnded.outcome_id = o.id;
                cur.lastEnded.outcome_note = o.note;
            }
        }
    }

    return map;
}

/** Fields for the Kelola Pasien list/search rows. */
function listFields(current, isObstetri, now = new Date()) {
    const out = {
        is_obstetri: isObstetri,
        hpl: null,
        days_pregnant: null,
        has_delivered: false,
        pregnancy_end: null
    };
    if (!current) return out;

    const dating = datingOf(current.ongoing);
    if (dating) {
        out.hpl = dating.hpl;
        const t = trackerDates(dating.hpl, now);
        out.days_pregnant = t ? t.daysPregnant : null;
    }

    const ended = current.lastEnded;
    if (!current.ongoing && ended) {
        const end = {
            type: PREGNANCY_END_TYPES[ended.outcome] || 'selesai',
            date: toDateString(ended.ended_on)
        };
        if (ended.outcome_id !== undefined && ended.outcome_id !== null) {
            end.id = ended.outcome_id;
            end.note = ended.outcome_note === undefined ? null : ended.outcome_note;
        }
        out.pregnancy_end = end;
    }
    out.has_delivered = !!out.pregnancy_end && out.pregnancy_end.type === 'birth';
    return out;
}

module.exports = { loadCurrentPregnancies, datingOf, listFields, PREGNANCY_END_TYPES };

'use strict';

/**
 * Gestational age on a given date, from the patient's latest HPHT or HPL, and the choice of
 * the Kehamilan prepay package that fits it.
 *
 * Dates are plain 'YYYY-MM-DD' strings. All arithmetic uses Date.UTC on the Y/M/D parts so the
 * server timezone (GMT+7) and DST can never shift a day; toISOString is never used.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const FULL_TERM_DAYS = 280;
const MAX_WEEKS = 42;
const HPL_GRACE_DAYS = 14;
const CANDIDATE_LIMIT = 20;

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Day number (days since epoch, UTC) of a valid 'YYYY-MM-DD' string, else null. */
function dayNumber(value) {
    if (typeof value !== 'string') return null;
    const match = DATE_PATTERN.exec(value.trim());
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const ms = Date.UTC(year, month - 1, day);
    const check = new Date(ms);
    if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
    return Math.round(ms / DAY_MS);
}

function isValidDateString(value) {
    return dayNumber(value) !== null;
}

function gestationalWeeksOn(reference, onDate) {
    if (!reference) return null;
    const refDay = dayNumber(reference.date);
    const onDay = dayNumber(onDate);
    if (refDay === null || onDay === null) return null;

    let days;
    if (reference.kind === 'hpht') {
        days = onDay - refDay;
    } else if (reference.kind === 'hpl') {
        if (onDay - refDay > HPL_GRACE_DAYS) return null;
        days = FULL_TERM_DAYS - (refDay - onDay);
    } else {
        return null;
    }

    if (days < 0) return null;
    // "More than 42 weeks" means past 42w0d (294 days), so 42w6d is already out.
    if (days > MAX_WEEKS * 7) return null;
    return { weeks: Math.floor(days / 7), days: days % 7 };
}

const TRIMESTER_NUMBER = { first: 1, second: 2, third: 3, 1: 1, 2: 2, 3: 3 };

/** The EDD of a USG row: top-level edd, else the current trimester's, else the highest trimester holding one. */
function pickUsgEdd(row) {
    if (isValidDateString(row.edd)) return row.edd.trim();
    const byTrimester = { 1: row.t1_edd, 2: row.t2_edd, 3: row.t3_edd };
    const current = TRIMESTER_NUMBER[row.current_trimester];
    if (current && isValidDateString(byTrimester[current])) return byTrimester[current].trim();
    for (const n of [3, 2, 1]) {
        if (isValidDateString(byTrimester[n])) return byTrimester[n].trim();
    }
    return null;
}

function timeOf(value) {
    const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
    return Number.isNaN(ms) ? 0 : ms;
}

/**
 * The newest HPHT/HPL the patient has on record. Newest record wins; HPL only decides a tie
 * (one anamnesa carrying both).
 */
async function findPregnancyReference(db, patientId) {
    const [anamnesaRows] = await db.query(
        `SELECT JSON_UNQUOTE(JSON_EXTRACT(mr.record_data, '$.hpht')) AS hpht,
                JSON_UNQUOTE(JSON_EXTRACT(mr.record_data, '$.hpl')) AS hpl,
                COALESCE(mr.updated_at, mr.created_at) AS recorded_at
           FROM medical_records mr
           JOIN sunday_clinic_records scr ON mr.mr_id = scr.mr_id
          WHERE mr.patient_id = ?
            AND scr.patient_id = ?
            AND mr.record_type = 'anamnesa'
            AND scr.mr_category = 'obstetri'
          ORDER BY COALESCE(mr.updated_at, mr.created_at) DESC
          LIMIT ${CANDIDATE_LIMIT}`,
        [patientId, patientId]
    );
    const [usgRows] = await db.query(
        `SELECT JSON_UNQUOTE(JSON_EXTRACT(record_data, '$.edd')) AS edd,
                JSON_UNQUOTE(JSON_EXTRACT(record_data, '$.current_trimester')) AS current_trimester,
                JSON_UNQUOTE(JSON_EXTRACT(record_data, '$.trimester_1.edd')) AS t1_edd,
                JSON_UNQUOTE(JSON_EXTRACT(record_data, '$.trimester_2.edd')) AS t2_edd,
                JSON_UNQUOTE(JSON_EXTRACT(record_data, '$.trimester_3.edd')) AS t3_edd,
                COALESCE(updated_at, created_at) AS recorded_at
           FROM medical_records
          WHERE patient_id = ?
            AND record_type = 'usg'
          ORDER BY COALESCE(updated_at, created_at) DESC
          LIMIT ${CANDIDATE_LIMIT}`,
        [patientId]
    );

    const candidates = [];
    for (const row of anamnesaRows || []) {
        if (isValidDateString(row.hpl)) candidates.push({ kind: 'hpl', date: row.hpl.trim(), recorded_at: row.recorded_at, source: 'anamnesa' });
        if (isValidDateString(row.hpht)) candidates.push({ kind: 'hpht', date: row.hpht.trim(), recorded_at: row.recorded_at, source: 'anamnesa' });
    }
    for (const row of usgRows || []) {
        const edd = pickUsgEdd(row);
        if (edd) candidates.push({ kind: 'hpl', date: edd, recorded_at: row.recorded_at, source: 'usg' });
    }
    if (candidates.length === 0) return null;

    let best = null;
    for (const candidate of candidates) {
        if (!best) { best = candidate; continue; }
        const a = timeOf(candidate.recorded_at);
        const b = timeOf(best.recorded_at);
        if (a > b || (a === b && candidate.kind === 'hpl' && best.kind !== 'hpl')) best = candidate;
    }
    return best;
}

function compareBySortOrderThenId(a, b) {
    return (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0) || (Number(a.id) || 0) - (Number(b.id) || 0);
}

/** Code of the Kehamilan package whose week range contains `weeks`, else the first null-range one, else null. */
function choosePackage(packages, weeks) {
    if (weeks === null || weeks === undefined) return null;
    const pool = (packages || []).filter(p => p && p.category === 'obstetri' && p.ready);
    const ranged = pool
        .filter(p => p.week_min !== null && p.week_min !== undefined && p.week_max !== null && p.week_max !== undefined)
        .filter(p => weeks >= p.week_min && weeks <= p.week_max)
        .sort(compareBySortOrderThenId);
    if (ranged.length > 0) return ranged[0].code;
    const open = pool
        .filter(p => (p.week_min === null || p.week_min === undefined) && (p.week_max === null || p.week_max === undefined))
        .sort(compareBySortOrderThenId);
    return open.length > 0 ? open[0].code : null;
}

module.exports = {
    isValidDateString,
    gestationalWeeksOn,
    findPregnancyReference,
    choosePackage
};

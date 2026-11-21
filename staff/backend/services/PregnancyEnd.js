'use strict';

/**
 * Pregnancy end rule: a pregnancy (identified by its HPHT) is ended when some end event
 * (birth, keguguran, lahir_mati) happened on or after HPHT - 14 days. The latest such event
 * is the one reported.
 *
 * Dates are local 'YYYY-MM-DD' strings. toISOString is never used for date-only values.
 */

const END_TOLERANCE_DAYS = 14;
const FULL_TERM_DAYS = 280;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})/;

function pad(n) {
    return String(n).padStart(2, '0');
}

function formatLocal(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Local Date at midnight for a valid 'YYYY-MM-DD' string, else null. */
function parseDay(str) {
    if (typeof str !== 'string') return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str);
    if (!m) return null;
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    const date = new Date(y, mo - 1, d);
    if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null;
    return date;
}

function addDays(dateStr, days) {
    const date = parseDay(dateStr);
    if (!date) return null;
    date.setDate(date.getDate() + days);
    return formatLocal(date);
}

/** Date (local components) or string (first 10 chars) -> 'YYYY-MM-DD', else null. */
function toDateString(value) {
    if (value === null || value === undefined || value === '') return null;
    if (value instanceof Date) {
        if (isNaN(value.getTime())) return null;
        return formatLocal(value);
    }
    if (typeof value !== 'string') return null;
    const m = DATE_PATTERN.exec(value.trim());
    if (!m) return null;
    const head = `${m[1]}-${m[2]}-${m[3]}`;
    return parseDay(head) ? head : null;
}

function resolvePregnancyEnd(hpht, events) {
    const hphtStr = toDateString(hpht);
    if (!hphtStr) return { ended: false };
    const threshold = addDays(hphtStr, -END_TOLERANCE_DAYS);
    let best = null;
    for (const ev of events || []) {
        const date = toDateString(ev && ev.date);
        if (!date || date < threshold) continue;
        if (!best || date > best.date) best = { ev, date };
    }
    if (!best) return { ended: false };
    const result = { ended: true, type: best.ev.type, date: best.date };
    if (best.ev.id !== undefined) result.id = best.ev.id;
    if (best.ev.note !== undefined) result.note = best.ev.note;
    return result;
}

function hphtFromReference(ref) {
    if (!ref) return null;
    const date = toDateString(ref.date);
    if (!date) return null;
    if (ref.kind === 'hpl') return addDays(date, -FULL_TERM_DAYS);
    if (ref.kind === 'hpht') return date;
    return null;
}

function resolveLogger(logger) {
    if (logger && typeof logger.warn === 'function') return logger;
    return console;
}

async function loadEndEvents(db, patientIds, logger) {
    const map = new Map();
    if (!patientIds || patientIds.length === 0) return map;
    const placeholders = patientIds.map(() => '?').join(',');

    const outcomeQuery = db.query(
        `SELECT id, patient_id, outcome_type, event_date, note FROM pregnancy_outcomes WHERE voided_at IS NULL AND patient_id IN (${placeholders})`,
        patientIds
    );
    const birthQuery = db.query(
        `SELECT patient_id, birth_date, created_at FROM birth_congratulations WHERE patient_id IN (${placeholders})`,
        patientIds
    );

    let outcomeRows = [];
    let birthRows;
    const [outcomeSettled, birthSettled] = await Promise.allSettled([outcomeQuery, birthQuery]);
    if (birthSettled.status === 'rejected') throw birthSettled.reason;
    birthRows = birthSettled.value[0];
    if (outcomeSettled.status === 'rejected') {
        const err = outcomeSettled.reason;
        if (err && err.code === 'ER_NO_SUCH_TABLE') {
            resolveLogger(logger).warn('[PregnancyEnd] pregnancy_outcomes table missing; using birth records only');
        } else {
            throw err;
        }
    } else {
        outcomeRows = outcomeSettled.value[0];
    }

    const push = (patientId, event) => {
        if (!map.has(patientId)) map.set(patientId, []);
        map.get(patientId).push(event);
    };
    for (const r of outcomeRows) {
        const date = toDateString(r.event_date);
        if (!date) continue;
        push(r.patient_id, { type: r.outcome_type, date, id: r.id, note: r.note });
    }
    for (const r of birthRows) {
        const date = toDateString(r.birth_date) || toDateString(r.created_at);
        if (!date) continue;
        push(r.patient_id, { type: 'birth', date });
    }
    return map;
}

async function trackerEndState(db, patientId, hpht, logger) {
    const map = await loadEndEvents(db, [patientId], logger);
    const end = resolvePregnancyEnd(hpht, map.get(patientId) || []);
    return end.ended ? { ended_on: end.date } : null;
}

function endedSqlCondition(patientIdExpr, hphtExpr) {
    const threshold = `DATE_SUB(LEFT(${hphtExpr}, 10), INTERVAL ${END_TOLERANCE_DAYS} DAY)`;
    return `(
        EXISTS (SELECT 1 FROM pregnancy_outcomes po WHERE po.patient_id = ${patientIdExpr} AND po.voided_at IS NULL AND po.event_date >= ${threshold})
        OR EXISTS (SELECT 1 FROM birth_congratulations bc WHERE bc.patient_id = ${patientIdExpr} AND COALESCE(bc.birth_date, DATE(bc.created_at)) >= ${threshold})
    )`;
}

function pregnancyListFields(hphtStr, events, today) {
    const out = { is_obstetri: false, hpl: null, days_pregnant: null, has_delivered: false, pregnancy_end: null };
    if (!hphtStr) return out;
    out.is_obstetri = true;
    // hpl/days_pregnant replicate routes/patients.js (new Date(hphtStr) + Math.floor) exactly.
    const hpht = new Date(hphtStr);
    if (isNaN(hpht.getTime())) return out;
    const hplDate = new Date(hpht.getTime() + 280 * 24 * 60 * 60 * 1000);
    out.hpl = `${hplDate.getFullYear()}-${pad(hplDate.getMonth() + 1)}-${pad(hplDate.getDate())}`;
    const t = new Date(today.getTime());
    t.setHours(0, 0, 0, 0);
    out.days_pregnant = Math.floor((t.getTime() - hpht.getTime()) / (24 * 60 * 60 * 1000));
    const end = resolvePregnancyEnd(hphtStr, events);
    if (end.ended) {
        out.pregnancy_end = { type: end.type, date: end.date };
        if (end.type !== 'birth') {
            if (end.id !== undefined) out.pregnancy_end.id = end.id;
            if (end.note !== undefined) out.pregnancy_end.note = end.note;
        }
        out.has_delivered = end.type === 'birth';
    }
    return out;
}

module.exports = {
    END_TOLERANCE_DAYS,
    toDateString,
    resolvePregnancyEnd,
    trackerEndState,
    hphtFromReference,
    loadEndEvents,
    endedSqlCondition,
    pregnancyListFields
};

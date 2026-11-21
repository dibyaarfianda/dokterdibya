'use strict';

// Calendar-day maths for the portal pregnancy tracker, in server local time (GMT+7).
// new Date('YYYY-MM-DD') is UTC midnight (07:00 WIB), which made the tracker one day short before 07:00.

const { toDateString } = require('./PregnancyEnd');

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const FULL_TERM_DAYS = 280;

function dayNumber(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    return Date.UTC(y, m - 1, d) / MS_PER_DAY;
}

function fromDayNumber(n) {
    return new Date(n * MS_PER_DAY).toISOString().slice(0, 10); // UTC day number -> its own calendar date
}

/** HPL (date string or Date) + now -> { hpht, daysPregnant, weeksPregnant, daysExtra, daysUntilEdd }, or null. */
function trackerDates(edd, now = new Date()) {
    const eddStr = toDateString(edd);
    const todayStr = toDateString(now);
    if (!eddStr || !todayStr) return null;
    const eddDay = dayNumber(eddStr);
    const hphtDay = eddDay - FULL_TERM_DAYS;
    const daysPregnant = dayNumber(todayStr) - hphtDay;
    return {
        hpht: fromDayNumber(hphtDay),
        daysPregnant,
        weeksPregnant: Math.floor(daysPregnant / 7),
        daysExtra: ((daysPregnant % 7) + 7) % 7,
        daysUntilEdd: eddDay - dayNumber(todayStr)
    };
}

/** A pregnancies row -> HPL 'YYYY-MM-DD': its hpl, else hpht + 280 days, else null. */
function eddFromPregnancy(row) {
    if (!row) return null;
    const hpl = toDateString(row.hpl);
    if (hpl) return hpl;
    const hpht = toDateString(row.hpht);
    return hpht ? fromDayNumber(dayNumber(hpht) + FULL_TERM_DAYS) : null;
}

/** The patient's ongoing pregnancy (dated from the obstetri anamnesa), newest first, or null. */
async function findOngoingPregnancy(db, patientId) {
    const [rows] = await db.query(
        `SELECT id, hpht, hpl, updated_at
           FROM pregnancies
          WHERE patient_id = ? AND status = 'ongoing'
          ORDER BY sequence DESC, id DESC
          LIMIT 1`,
        [patientId]
    );
    return rows[0] || null;
}

module.exports = { trackerDates, eddFromPregnancy, findOngoingPregnancy };

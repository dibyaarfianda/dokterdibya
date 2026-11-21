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

module.exports = { trackerDates };

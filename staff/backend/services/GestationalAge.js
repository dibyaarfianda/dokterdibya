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
    choosePackage
};

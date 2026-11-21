'use strict';

/**
 * Date helpers shared by the pregnancy services. The old "ended = end event on/after
 * HPHT - 14 days" date rule was retired in stage 2: pregnancies are now read from the
 * `pregnancies` table (see CurrentPregnancy.js). END_TOLERANCE_DAYS only remains for
 * code that matches an end event to the HPHT of an ongoing pregnancy.
 *
 * Dates are local 'YYYY-MM-DD' strings. toISOString is never used for date-only values.
 */

const END_TOLERANCE_DAYS = 14;
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

module.exports = {
    END_TOLERANCE_DAYS,
    toDateString
};

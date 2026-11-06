/**
 * Finance period helpers for the staff Finance Analysis page.
 *
 * Calendar dates are handled as plain YYYY-MM-DD values. Day arithmetic runs on
 * synthetic UTC midnights so the server timezone can never shift a date.
 */
const { formatDateLocal } = require('./date');

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_PATTERN = /^(\d{4})-(\d{2})$/;
const DAY_MS = 24 * 60 * 60 * 1000;

const pad = value => String(value).padStart(2, '0');

function toUtcDay(value) {
    const match = DATE_PATTERN.exec(String(value ?? ''));
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const ms = Date.UTC(year, month - 1, day);
    const check = new Date(ms);
    if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
        return null;
    }
    return ms;
}

function fromUtcDay(ms) {
    const date = new Date(ms);
    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function monthBounds(value) {
    const match = MONTH_PATTERN.exec(String(value ?? ''));
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    if (month < 1 || month > 12) return null;
    return { start: Date.UTC(year, month - 1, 1), next: Date.UTC(year, month, 1) };
}

function isPresent(value) {
    return value !== undefined && value !== null && value !== '';
}

function buildPeriod(startMs, endMs) {
    const endExclusiveMs = endMs + DAY_MS;
    const startDate = fromUtcDay(startMs);
    const bounds = monthBounds(startDate.slice(0, 7));
    const isWholeMonth = bounds.start === startMs && bounds.next === endExclusiveMs;

    return {
        ok: true,
        month: isWholeMonth ? startDate.slice(0, 7) : null,
        startDate,
        endDate: fromUtcDay(endMs),
        endExclusive: fromUtcDay(endExclusiveMs),
        totalDays: Math.round((endMs - startMs) / DAY_MS) + 1
    };
}

const fail = message => ({ ok: false, message });

/**
 * Resolve the requested finance period.
 * Accepts start_date + end_date (inclusive), or the legacy month=YYYY-MM.
 * Defaults to the current Jakarta month.
 */
function resolveFinancePeriod(query = {}, now = new Date()) {
    const hasStart = isPresent(query.start_date);
    const hasEnd = isPresent(query.end_date);

    if (hasStart || hasEnd) {
        if (!hasStart || !hasEnd) return fail('Tanggal mulai dan tanggal akhir harus diisi bersamaan');
        const startMs = toUtcDay(query.start_date);
        const endMs = toUtcDay(query.end_date);
        if (startMs === null || endMs === null) return fail('Format tanggal harus YYYY-MM-DD');
        if (startMs > endMs) return fail('Tanggal mulai tidak boleh setelah tanggal akhir');
        return buildPeriod(startMs, endMs);
    }

    const month = isPresent(query.month) ? query.month : formatDateLocal(now).slice(0, 7);
    const bounds = monthBounds(month);
    if (!bounds) return fail('Format bulan harus YYYY-MM');
    return buildPeriod(bounds.start, bounds.next - DAY_MS);
}

/**
 * Spread monthly amounts over a date range by calendar day.
 * rows: [{ month: 'YYYY-MM' (or 'YYYY-MM-DD'), amount }]
 * A month fully inside the range is charged in full; a partly covered month is
 * charged amount x (days in range / days in month), rounded to whole rupiah.
 */
function prorateMonthlyAmounts(rows, startDate, endDate) {
    const startMs = toUtcDay(startDate);
    const endMs = toUtcDay(endDate);
    const months = [];

    if (startMs !== null && endMs !== null) {
        for (const row of rows || []) {
            const fullAmount = Number(row && row.amount);
            if (!Number.isFinite(fullAmount) || fullAmount <= 0) continue;

            const bounds = monthBounds(String((row && row.month) || '').slice(0, 7));
            if (!bounds) continue;

            const overlapStart = Math.max(startMs, bounds.start);
            const overlapEnd = Math.min(endMs, bounds.next - DAY_MS);
            if (overlapEnd < overlapStart) continue;

            const days = Math.round((overlapEnd - overlapStart) / DAY_MS) + 1;
            const daysInMonth = Math.round((bounds.next - bounds.start) / DAY_MS);
            const amount = days === daysInMonth ? fullAmount : Math.round(fullAmount * days / daysInMonth);

            months.push({
                month: fromUtcDay(bounds.start).slice(0, 7),
                days,
                daysInMonth,
                fullAmount,
                amount
            });
        }
    }

    return {
        total: months.reduce((sum, item) => sum + item.amount, 0),
        prorated: months.some(item => item.days < item.daysInMonth),
        months
    };
}

module.exports = {
    resolveFinancePeriod,
    prorateMonthlyAmounts
};

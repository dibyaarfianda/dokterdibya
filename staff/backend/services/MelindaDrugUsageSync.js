'use strict';

/**
 * Copies the Medify Melinda drug usage report into the clinic database.
 * One request at a time, 4 seconds apart. Any error stops the run, and a report is saved only
 * after it passes validation, so stored data is never replaced by a partial or invalid file.
 */

const { DEPOTS, parseDrugUsageReport } = require('./MelindaDrugUsageReport');

const SOURCE = 'rsia_melinda';
const LOCK_NAME = 'melinda_drug_usage_sync';
const REQUEST_GAP_MS = 4000;
const SLOW_RESPONSE_MS = 30000;
const REFRESH_PREVIOUS_MONTH_UNTIL_DAY = 5;
const PERIOD = /^(\d{4})-(0[1-9]|1[0-2])$/;
const INSERT_BATCH = 200;

const pad = number => String(number).padStart(2, '0');
const periodOf = (year, monthIndex) => {
    const date = new Date(year, monthIndex, 1);
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
};

function parsePeriod(period) {
    const match = PERIOD.exec(String(period));
    if (!match) throw new Error(`Periode tidak valid: ${period}`);
    return { year: Number(match[1]), month: Number(match[2]) };
}

function periodsForNight(today) {
    const current = periodOf(today.getFullYear(), today.getMonth());
    if (today.getDate() > REFRESH_PREVIOUS_MONTH_UNTIL_DAY) return [current];
    return [periodOf(today.getFullYear(), today.getMonth() - 1), current];
}

function periodsBetween(from, to) {
    const start = parsePeriod(from);
    const end = parsePeriod(to);
    const periods = [];
    for (let year = start.year, month = start.month; year < end.year || (year === end.year && month <= end.month);) {
        periods.push(`${year}-${pad(month)}`);
        month += 1;
        if (month > 12) { month = 1; year += 1; }
    }
    if (!periods.length) throw new Error('Periode awal melewati periode akhir');
    return periods;
}

function monthRange(period, today) {
    const { year, month } = parsePeriod(period);
    const currentPeriod = periodOf(today.getFullYear(), today.getMonth());
    if (period > currentPeriod) throw new Error(`Periode belum berjalan: ${period}`);
    const lastDay = period === currentPeriod ? today.getDate() : new Date(year, month, 0).getDate();
    return { from: `01/${pad(month)}/${year}`, to: `${pad(lastDay)}/${pad(month)}/${year}` };
}

async function saveReport(pool, period, depot, report) {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        await connection.query('DELETE FROM melinda_drug_usage WHERE period = ? AND depot = ?', [period, depot]);
        for (let index = 0; index < report.items.length; index += INSERT_BATCH) {
            const batch = report.items.slice(index, index + INSERT_BATCH);
            const placeholders = batch.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())').join(', ');
            const values = batch.flatMap(item => [
                period, depot, item.itemKey, item.code, item.name, item.itemType,
                item.qty, item.value, item.inacbgQty, item.inacbgValue,
                item.hari23Qty, item.hari23Value, item.dukQty, item.dukValue
            ]);
            await connection.query(
                `INSERT INTO melinda_drug_usage
                    (period, depot, item_key, item_code, item_name, item_type, qty, value_idr,
                     inacbg_qty, inacbg_value_idr, hari23_qty, hari23_value_idr, duk_qty, duk_value_idr, synced_at)
                 VALUES ${placeholders}`,
                values
            );
        }
        await connection.query(
            `INSERT INTO melinda_drug_usage_reports (period, depot, item_count, total_qty, total_value_idr, synced_at)
             VALUES (?, ?, ?, ?, ?, NOW())
             ON DUPLICATE KEY UPDATE item_count = VALUES(item_count), total_qty = VALUES(total_qty),
                 total_value_idr = VALUES(total_value_idr), synced_at = VALUES(synced_at)`,
            [period, depot, report.items.length, report.totals.qty, report.totals.value]
        );
        await connection.commit();
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

function createMelindaDrugUsageSync({
    pool,
    createSession,
    parse = parseDrugUsageReport,
    sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
    now = () => new Date()
}) {
    async function fetchAll(periods, onSaved) {
        const session = createSession(SOURCE);
        await session.login();
        const today = now();
        let first = true;
        for (const period of periods) {
            const range = monthRange(period, today);
            for (const { code: depot } of DEPOTS) {
                if (!first) await sleep(REQUEST_GAP_MS);
                first = false;
                const response = await session.fetchDrugUsageReport(depot, range.from, range.to);
                if (response.status !== 200) {
                    throw new Error(`Medify membalas HTTP ${response.status} untuk ${depot} ${period}`);
                }
                let report;
                try {
                    report = await parse(response.buffer);
                } catch (error) {
                    throw new Error(`${depot} ${period}: ${error.message}`);
                }
                await saveReport(pool, period, depot, report);
                onSaved();
                if (response.ms > SLOW_RESPONSE_MS) {
                    return { status: 'stopped', message: `Medify lambat (${response.ms} ms) di ${depot} ${period}` };
                }
            }
        }
        return { status: 'success', message: null };
    }

    async function run({ periods } = {}) {
        const targets = periods && periods.length ? periods : periodsForNight(now());
        targets.forEach(parsePeriod);
        const lock = await pool.getConnection();
        let locked = false;
        try {
            const [rows] = await lock.query('SELECT GET_LOCK(?, 0) AS got', [LOCK_NAME]);
            locked = Number(rows[0]?.got) === 1;
            if (!locked) return { status: 'skipped', reportsSaved: 0, message: 'Sinkronisasi lain sedang berjalan' };

            const [inserted] = await lock.query(
                "INSERT INTO melinda_drug_usage_runs (status, periods, started_at) VALUES ('running', ?, NOW())",
                [targets.join(',')]
            );
            let reportsSaved = 0;
            let outcome;
            try {
                outcome = await fetchAll(targets, () => { reportsSaved += 1; });
            } catch (error) {
                outcome = { status: 'failed', message: String(error.message || error).slice(0, 255) };
            }
            await lock.query(
                'UPDATE melinda_drug_usage_runs SET status = ?, reports_saved = ?, message = ?, finished_at = NOW() WHERE id = ?',
                [outcome.status, reportsSaved, outcome.message, inserted.insertId]
            );
            return { status: outcome.status, reportsSaved, message: outcome.message };
        } finally {
            if (locked) await lock.query('SELECT RELEASE_LOCK(?)', [LOCK_NAME]).catch(() => {});
            lock.release();
        }
    }

    return { run };
}

module.exports = {
    createMelindaDrugUsageSync,
    periodsForNight,
    periodsBetween,
    monthRange,
    REQUEST_GAP_MS,
    SLOW_RESPONSE_MS
};

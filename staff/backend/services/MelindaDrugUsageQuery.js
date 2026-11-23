'use strict';

/**
 * Read side of "Pengeluaran Obat RS". Reads only the clinic database and never contacts Medify.
 */

const ExcelJS = require('exceljs');
const pool = require('../db');
const { DEPOTS } = require('./MelindaDrugUsageReport');

const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;
const TYPES = Object.freeze({ all: 'Semua Barang', obat: 'Obat', alkes: 'Alkes/BHP' });
const STALE_AFTER_HOURS = 36;
const AMOUNT_FIELDS = [
    'qty', 'value_idr', 'inacbg_qty', 'inacbg_value_idr',
    'hari23_qty', 'hari23_value_idr', 'duk_qty', 'duk_value_idr'
];

class DrugUsageFilterError extends Error {
    constructor(message) {
        super(message);
        this.statusCode = 400;
    }
}

function normalizeFilters(query = {}) {
    const period = query.period ? String(query.period) : null;
    const depot = query.depot ? String(query.depot) : 'all';
    const type = query.type ? String(query.type) : 'all';
    if (period && !PERIOD.test(period)) throw new DrugUsageFilterError('Periode tidak valid');
    if (depot !== 'all' && !DEPOTS.some(item => item.code === depot)) throw new DrugUsageFilterError('Depo tidak valid');
    if (!Object.prototype.hasOwnProperty.call(TYPES, type)) throw new DrugUsageFilterError('Jenis barang tidak valid');
    return { period, depot, type };
}

async function loadFreshness() {
    const [[lastRun]] = await pool.query(
        'SELECT status, message, started_at, finished_at FROM melinda_drug_usage_runs ORDER BY id DESC LIMIT 1'
    );
    const [[success]] = await pool.query(
        `SELECT MAX(finished_at) AS last_success, TIMESTAMPDIFF(HOUR, MAX(finished_at), NOW()) AS age_hours
         FROM melinda_drug_usage_runs WHERE status = 'success'`
    );
    const lastSuccess = success?.last_success || null;
    let warning = null;
    if (!lastSuccess) {
        warning = 'Data belum pernah berhasil disinkronkan.';
    } else if (lastRun && ['failed', 'stopped'].includes(lastRun.status)) {
        warning = 'Sinkronisasi terakhir tidak selesai. Sebagian data mungkin belum diperbarui.';
    } else if (Number(success.age_hours) >= STALE_AFTER_HOURS) {
        warning = `Data belum diperbarui lebih dari ${STALE_AFTER_HOURS} jam.`;
    }
    return { lastSuccess, lastStatus: lastRun?.status || null, warning };
}

async function getDrugUsage(query) {
    const filters = normalizeFilters(query);
    const [periodRows] = await pool.query('SELECT DISTINCT period FROM melinda_drug_usage_reports ORDER BY period DESC');
    const periods = periodRows.map(row => row.period);
    const period = filters.period || periods[0] || null;
    const freshness = await loadFreshness();
    const emptyTotals = Object.fromEntries(AMOUNT_FIELDS.map(field => [field, 0]));
    if (!period) {
        return { periods, filters: { ...filters, period }, totals: { ...emptyTotals, item_count: 0 }, items: [], freshness };
    }

    const where = ['period = ?'];
    const params = [period];
    if (filters.depot !== 'all') { where.push('depot = ?'); params.push(filters.depot); }
    if (filters.type !== 'all') { where.push('item_type = ?'); params.push(filters.type); }
    const [rows] = await pool.query(
        `SELECT item_key, MAX(item_code) AS item_code, MAX(item_name) AS item_name, MAX(item_type) AS item_type,
                ${AMOUNT_FIELDS.map(field => `SUM(${field}) AS ${field}`).join(', ')}
         FROM melinda_drug_usage
         WHERE ${where.join(' AND ')}
         GROUP BY item_key
         ORDER BY value_idr DESC, item_name ASC`,
        params
    );
    const items = rows.map(row => ({
        item_key: row.item_key,
        item_code: row.item_code || null,
        item_name: row.item_name,
        item_type: row.item_type,
        ...Object.fromEntries(AMOUNT_FIELDS.map(field => [field, Number(row[field]) || 0]))
    }));
    const totals = { ...emptyTotals, item_count: items.length };
    for (const item of items) AMOUNT_FIELDS.forEach(field => { totals[field] += item[field]; });
    return { periods, filters: { ...filters, period }, totals, items, freshness };
}

async function buildDrugUsageWorkbook(data) {
    const { filters, items, totals } = data;
    const depotName = filters.depot === 'all' ? 'Semua Depo' : DEPOTS.find(item => item.code === filters.depot).name;
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Pengeluaran Obat');
    sheet.columns = [
        { width: 6 }, { width: 15 }, { width: 40 }, { width: 14 }, { width: 11 }, { width: 18 },
        { width: 11 }, { width: 16 }, { width: 11 }, { width: 16 }, { width: 11 }, { width: 16 }
    ];
    sheet.getCell('A1').value = 'Pengeluaran Obat RSIA Melinda';
    sheet.getCell('A1').font = { name: 'Arial', size: 14, bold: true };
    sheet.getCell('A2').value = `Periode ${filters.period} | ${depotName} | ${TYPES[filters.type]}`;
    sheet.getCell('A3').value = 'Nilai Laporan berasal dari Medify dan belum tentu sama dengan nilai kwitansi. Kelompok barang adalah perkiraan.';
    const header = sheet.getRow(5);
    header.values = ['No', 'Kode Obat', 'Nama Barang', 'Kelompok', 'Jumlah', 'Nilai Laporan (Rp)', 'Jumlah INACBG',
        'Nilai INACBG (Rp)', 'Jumlah 23 Hari', 'Nilai 23 Hari (Rp)', 'Jumlah DUK RS', 'Nilai DUK RS (Rp)'];
    header.height = 32;
    header.eachCell(cell => {
        cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    });
    const amountsOf = row => AMOUNT_FIELDS.map(field => row[field]);
    items.forEach((item, index) => {
        sheet.addRow([index + 1, item.item_code || '', item.item_name, TYPES[item.item_type], ...amountsOf(item)]);
    });
    const totalRow = sheet.addRow(['TOTAL', '', '', '', ...amountsOf(totals)]);
    totalRow.font = { name: 'Arial', size: 10, bold: true };
    for (let column = 5; column <= 12; column += 1) sheet.getColumn(column).numFmt = '#,##0';
    sheet.views = [{ state: 'frozen', ySplit: 5 }];
    return Buffer.from(await workbook.xlsx.writeBuffer());
}

module.exports = { normalizeFilters, getDrugUsage, buildDrugUsageWorkbook, DrugUsageFilterError };

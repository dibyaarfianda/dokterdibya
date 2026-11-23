'use strict';

/**
 * Parses the Medify "Laporan Pengeluaran Obat" xlsx of RSIA Melinda.
 * The report is per drug and has no patient columns. Anything unexpected is rejected,
 * so a login page or a changed layout can never replace stored data.
 */

const ExcelJS = require('exceljs');

const DEPOTS = Object.freeze([
    { code: 'depo-rawat-jalan', name: 'Depo Rawat Jalan' },
    { code: 'depo-rawat-inap', name: 'Depo Rawat Inap' },
    { code: 'depo-ruang-bayi', name: 'Depo Ruang Bayi' },
    { code: 'depo-vk', name: 'Depo VK' },
    { code: 'depo-ok', name: 'Depo OK' },
    { code: 'depo-aster', name: 'Depo Aster' },
    { code: 'depo-icu', name: 'Depo ICU' },
    { code: 'depo-hcu', name: 'Depo HCU' }
]);

const SUPPLY_NAME = new RegExp([
    'spuit', 'needle', 'sarung tangan', 'benang', 'chromic', 'sutryl', 'assucryl', 't-dio', 't-hemovine',
    'kasa', 'plester', 'infuset', 'iv catheter', 'folley', 'urine bag', 'underpad', 'masker', 'apron',
    'surgeon cap', 'nurse cap', 'alkohol', 'hansaplast', 'gelang id', 'umbilical', 'mess no', 'spinocan',
    'feeding tube', 'suction', 'tabung edta', 'blood tranfusion', 'buret', 'injection plug', 'oxyflow',
    'pd plate', 'esu pencil', 'dermafix', 'stardec'
].join('|'), 'i');

const HEADER = ['NO.', 'KODE OBAT', 'NAMA OBAT', 'JUMLAH', '', 'INACBG', '', '23 HARI', '', 'DUK RS', ''];
const SUBHEADER = ['', '', '', 'JML', 'HARGA', 'JML', 'HARGA', 'JML', 'HARGA', 'JML', 'HARGA'];
const AMOUNTS = ['qty', 'value', 'inacbgQty', 'inacbgValue', 'hari23Qty', 'hari23Value', 'dukQty', 'dukValue'];
const MIN_VALUE_TOLERANCE = 10;

class DrugUsageReportError extends Error {
    constructor(message) {
        super(message);
        this.name = 'DrugUsageReportError';
    }
}

const classifyItem = name => (SUPPLY_NAME.test(String(name || '')) ? 'alkes' : 'obat');
const cleanText = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const itemKeyOf = name => cleanText(name).toLowerCase().slice(0, 191);

function cellValue(cell) {
    const value = cell.value;
    if (value === null || value === undefined) return '';
    if (typeof value === 'object') {
        if ('result' in value) return value.result ?? '';
        if (Array.isArray(value.richText)) return value.richText.map(part => part.text).join('');
        if ('text' in value) return value.text;
    }
    return value;
}

function parseAmount(value, rowNumber) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const text = cleanText(value).replace(/,/g, '');
    if (text === '') return 0;
    const number = Number(text);
    if (!Number.isFinite(number)) throw new DrugUsageReportError(`Angka tidak valid di baris ${rowNumber}`);
    return number;
}

const rowValues = (sheet, rowNumber) => {
    const row = sheet.getRow(rowNumber);
    return Array.from({ length: HEADER.length }, (_, index) => cellValue(row.getCell(index + 1)));
};

const sameLabels = (actual, expected) => expected.every((label, index) => cleanText(actual[index]).toUpperCase() === label);

function amountsOf(values, rowNumber) {
    return Object.fromEntries(AMOUNTS.map((field, index) => [field, parseAmount(values[index + 3], rowNumber)]));
}

async function parseDrugUsageReport(buffer) {
    if (!Buffer.isBuffer(buffer) || buffer.length < 4 || buffer.toString('latin1', 0, 2) !== 'PK') {
        throw new DrugUsageReportError('Respons Medify bukan file Excel');
    }
    const workbook = new ExcelJS.Workbook();
    try {
        await workbook.xlsx.load(buffer);
    } catch (error) {
        throw new DrugUsageReportError('File Excel Medify tidak dapat dibaca');
    }
    const sheet = workbook.worksheets[0];
    if (!sheet || !sameLabels(rowValues(sheet, 9), HEADER) || !sameLabels(rowValues(sheet, 10), SUBHEADER)) {
        throw new DrugUsageReportError('Format laporan Medify berubah');
    }

    const byKey = new Map();
    let lineCount = 0;
    let totals = null;
    for (let rowNumber = 11; rowNumber <= sheet.rowCount; rowNumber += 1) {
        const values = rowValues(sheet, rowNumber);
        const first = cleanText(values[0]);
        if (/^T\s*O\s*T\s*A\s*L$/i.test(first)) {
            totals = amountsOf(values, rowNumber);
            break;
        }
        if (!/^\d+$/.test(first)) continue;
        const name = cleanText(values[2]);
        if (!name) throw new DrugUsageReportError(`Nama obat kosong di baris ${rowNumber}`);
        lineCount += 1;
        const amounts = amountsOf(values, rowNumber);
        const itemKey = itemKeyOf(name);
        const code = cleanText(values[1]) || null;
        const existing = byKey.get(itemKey);
        if (existing) {
            existing.code = existing.code || code;
            AMOUNTS.forEach(field => { existing[field] += amounts[field]; });
        } else {
            byKey.set(itemKey, { itemKey, code, name: name.slice(0, 191), itemType: classifyItem(name), ...amounts });
        }
    }
    if (!totals) throw new DrugUsageReportError('Baris total laporan tidak ditemukan');

    const items = [...byKey.values()];
    const sum = field => items.reduce((total, item) => total + item[field], 0);
    if (Math.abs(sum('qty') - totals.qty) > 0.001) {
        throw new DrugUsageReportError('Jumlah barang tidak sama dengan total laporan');
    }
    const tolerance = Math.max(MIN_VALUE_TOLERANCE, Math.ceil(lineCount * 0.5));
    if (Math.abs(sum('value') - totals.value) > tolerance) {
        throw new DrugUsageReportError('Nilai barang tidak sama dengan total laporan');
    }
    return { items, totals };
}

module.exports = { DEPOTS, classifyItem, parseDrugUsageReport, DrugUsageReportError };

'use strict';

const ExcelJS = require('exceljs');
const {
    DEPOTS,
    classifyItem,
    parseDrugUsageReport,
    DrugUsageReportError
} = require('../../services/MelindaDrugUsageReport');

const HEAD_1 = ['NO.', 'KODE OBAT', 'NAMA OBAT', 'JUMLAH', '', 'INACBG', '', '23 HARI', '', 'DUK RS', ''];
const HEAD_2 = ['', '', '', 'JML', 'HARGA', 'JML', 'HARGA', 'JML', 'HARGA', 'JML', 'HARGA'];
const line = (no, code, name, qty, value, ina = [0, 0]) => [String(no), code, name, qty, value, ina[0], ina[1], 0, 0, 0, 0];
const total = (qty, value, ina = [0, 0]) => ['T O T A L', '', '', qty, value, ina[0], ina[1], 0, 0, 0, 0];

async function workbook(rows, { head1 = HEAD_1, head2 = HEAD_2 } = {}) {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Sheet1');
    ws.getRow(1).values = ['RSIA Melinda Kediri DHAI'];
    ws.getRow(5).values = ['LAPORAN PENGELUARAN OBAT'];
    ws.getRow(7).values = ['Tanggal : 20 November 2026 sampai 20 November 2026'];
    ws.getRow(9).values = head1;
    ws.getRow(10).values = head2;
    rows.forEach((row, index) => { ws.getRow(11 + index).values = row; });
    return Buffer.from(await wb.xlsx.writeBuffer());
}

describe('Melinda drug usage report parser', () => {
    test('lists the eight service depots', () => {
        expect(DEPOTS.map(d => d.code)).toEqual([
            'depo-rawat-jalan', 'depo-rawat-inap', 'depo-ruang-bayi', 'depo-vk',
            'depo-ok', 'depo-aster', 'depo-icu', 'depo-hcu'
        ]);
    });

    test('parses comma-formatted strings, numbers and INACBG columns', async () => {
        const result = await parseDrugUsageReport(await workbook([
            line(1, 'B000000014', 'Cefadroxil 500mg Kaps', '1,010', '9,500'),
            line(2, 'B000000025', 'Vaksin HB0 Uniject', 82, 3722964, [43, 1952286]),
            total('1,092', '3,732,464', [43, 1952286])
        ]));
        expect(result.items).toHaveLength(2);
        expect(result.items[0]).toMatchObject({ code: 'B000000014', name: 'Cefadroxil 500mg Kaps', itemType: 'obat', qty: 1010, value: 9500 });
        expect(result.items[1]).toMatchObject({ inacbgQty: 43, inacbgValue: 1952286 });
        expect(result.totals).toMatchObject({ qty: 1092, value: 3732464 });
    });

    test('keeps a drug without a code and sums the same name', async () => {
        const result = await parseDrugUsageReport(await workbook([
            line(1, '', 'Asam  Mefenamat 500 mg Tab', 10, 2000),
            line(2, 'B1', 'asam mefenamat 500 mg tab', 5, 1000),
            total(15, 3000)
        ]));
        expect(result.items).toHaveLength(1);
        expect(result.items[0]).toMatchObject({ itemKey: 'asam mefenamat 500 mg tab', code: 'B1', qty: 15, value: 3000 });
    });

    test('accepts an empty depot', async () => {
        const result = await parseDrugUsageReport(await workbook([total(0, 0)]));
        expect(result.items).toEqual([]);
        expect(result.totals).toMatchObject({ qty: 0, value: 0 });
    });

    test('rejects an HTML login page', async () => {
        await expect(parseDrugUsageReport(Buffer.from('<html>Login - Medify</html>'))).rejects.toThrow(DrugUsageReportError);
    });

    test('rejects a changed header', async () => {
        const head1 = [...HEAD_1];
        head1[7] = 'BPJS';
        await expect(parseDrugUsageReport(await workbook([total(0, 0)], { head1 }))).rejects.toThrow(/format/i);
    });

    test('rejects a report without a total row', async () => {
        await expect(parseDrugUsageReport(await workbook([line(1, 'B1', 'Infus RL', 1, 8830)]))).rejects.toThrow(/total/i);
    });

    test('rejects a quantity that differs from the total', async () => {
        await expect(parseDrugUsageReport(await workbook([line(1, 'B1', 'Infus RL', 2, 17660), total(3, 17660)]))).rejects.toThrow(/jumlah/i);
    });

    test('accepts Medify rounding and rejects a larger value gap', async () => {
        await expect(parseDrugUsageReport(await workbook([line(1, 'B1', 'Infus RL', 1, 8830), total(1, 8827)]))).resolves.toBeTruthy();
        await expect(parseDrugUsageReport(await workbook([line(1, 'B1', 'Infus RL', 1, 8830), total(1, 8800)]))).rejects.toThrow(/nilai/i);
    });

    test('classifies supplies by name', () => {
        for (const name of ['Spuit 3 cc', 'Sarung Tangan Steril 7', 'Benang Chromic 0 C58', 'Kasa Kecil per Pcs', 'IV Catheter 20 SPMed', 'Alkohol Swab']) {
            expect(classifyItem(name)).toBe('alkes');
        }
        for (const name of ['Infus RL', 'Ceftriaxon Inj', 'Povidon Iodin per 100 ml', 'Water For Injeksi 25 ml']) {
            expect(classifyItem(name)).toBe('obat');
        }
    });
});

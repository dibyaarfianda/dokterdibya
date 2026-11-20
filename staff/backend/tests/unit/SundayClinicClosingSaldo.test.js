'use strict';

// Tahap 2: a bill stays counted in full on its visit date; closing adds how much of it was
// paid from prepay saldo and how much of the day's returns went back to saldo, so the cashier
// knows the cash/transfer that really moved. Days without saldo keep their fingerprint.

const {
    buildClosingPreview,
    loadFinancialSources,
    insertClosingEntries
} = require('../../services/SundayClinicClosingService');

const DATE = '2026-11-22';
const record = { mr_id: 'DRD9001', patient_id: 'P1', patient_name: 'Pasien Uji', billing_id: 55 };
const paidMain = {
    id: 55, mr_id: 'DRD9001', patient_id: 'P1', patient_name: 'Pasien Uji', total: '365000',
    status: 'paid', paid_at: `${DATE} 10:00:00`, paid_by: 'Kasir', payment_method: null
};
const mainItems = [
    { id: 1, billing_id: 55, item_type: 'tindakan', item_code: 'T40', item_name: 'Konsultasi', quantity: 1, price: 150000, total: 150000 },
    { id: 2, billing_id: 55, item_type: 'tindakan', item_code: 'T09', item_name: 'USG 4D', quantity: 1, price: 190000, total: 190000 },
    { id: 3, billing_id: 55, item_type: 'admin', item_code: 'S01', item_name: 'Biaya Admin', quantity: 1, price: 25000, total: 25000 }
];
const saldoReturn = {
    id: 7, billing_id: 55, mr_id: 'DRD9001', patient_id: 'P1', patient_name: 'Pasien Uji', amount: '20000', saldo_amount: '20000',
    kind: 'money', item_name: null, quantity: 0, payment_method: 'saldo', actor_name: 'Kasir',
    created_at: `${DATE} 11:00:00`, accounting_date: DATE
};
const base = { clinicDate: DATE, records: [record], mainBillings: [paidMain], mainItems };

test('a day without saldo keeps its fingerprint and summary keys', () => {
    const before = buildClosingPreview(base);
    const after = buildClosingPreview({ ...base, saldoUsage: new Map() });
    expect(after.fingerprint).toBe(before.fingerprint);
    expect(after.summary).toEqual(before.summary);
    expect(after.summary).not.toHaveProperty('saldo_paid_total');
    expect(after.transactions[0]).not.toHaveProperty('saldo_amount');
});

test('a bill paid partly from saldo: cash expected is the total minus the saldo part', () => {
    const preview = buildClosingPreview({ ...base, saldoUsage: new Map([['55', 255000]]) });
    expect(preview.can_close).toBe(true);
    expect(preview.summary).toMatchObject({ grand_total: 365000, saldo_paid_total: 255000, cash_expected_total: 110000 });
    expect(preview.summary).not.toHaveProperty('saldo_returned_total');
    expect(preview.transactions[0]).toMatchObject({ source_type: 'main', total: 365000, saldo_amount: 255000 });
    expect(preview.fingerprint).not.toBe(buildClosingPreview(base).fingerprint);
});

test('a return to saldo on the same day keeps the cash expected at zero', () => {
    const preview = buildClosingPreview({ ...base, saldoUsage: new Map([['55', 365000]]), returns: [saldoReturn] });
    expect(preview.summary).toMatchObject({
        grand_total: 345000, saldo_paid_total: 365000, saldo_returned_total: 20000, cash_expected_total: 0
    });
    expect(preview.transactions.find(entry => entry.source_type === 'return')).toMatchObject({ total: -20000, saldo_amount: 20000 });
});

test('a return to saldo on a later day leaves no cash to hand over that day', () => {
    const preview = buildClosingPreview({ clinicDate: DATE, returns: [saldoReturn] });
    expect(preview.summary).toMatchObject({ grand_total: -20000, saldo_returned_total: 20000, cash_expected_total: 0 });
    expect(preview.summary).not.toHaveProperty('saldo_paid_total');
});

test('loading sources reads live saldo usage, locked when closing', async () => {
    const statements = [];
    const client = {
        query: jest.fn(async (sql, params) => {
            statements.push(String(sql).replace(/\s+/g, ' '));
            if (/FROM sunday_clinic_billings b JOIN/.test(String(sql).replace(/\s+/g, ' '))) return [[paidMain]];
            if (/FROM patient_credit_ledger/.test(sql)) {
                expect(params[0]).toEqual(['55']);
                return [[{ id: 1, source_id: '55:obstetri', category: 'obstetri', amount_idr: -255000 }]];
            }
            return [[]];
        })
    };
    const sources = await loadFinancialSources(client, DATE, { forUpdate: true });
    expect(sources.saldoUsage).toEqual(new Map([['55', 255000]]));
    const usageSql = statements.find(sql => sql.includes('FROM patient_credit_ledger'));
    expect(usageSql).toMatch(/FOR UPDATE/);
    expect(usageSql).toMatch(/gateway_mode = 'live'/);
});

test('the closing screen shows the saldo lines only when the summary has them', () => {
    const source = require('fs').readFileSync(require('path').join(__dirname, '../../../public/scripts/sunday-clinic/components/shared/closing.js'), 'utf8');
    expect(source).toContain("'saldo_paid_total' in summary || 'saldo_returned_total' in summary");
    expect(source).toContain('Dibayar dari saldo di muka');
    expect(source).toContain('Retur ke saldo');
    expect(source).toContain('Perkiraan tunai/transfer');
    expect(source).toContain('formatCurrency(summary.cash_expected_total)');
    // Each transaction row says how much of it was saldo, and a full saldo retur reads as such.
    expect(source).toContain("transaction.payment_method === 'saldo' ? 'Kembali ke saldo'");
    expect(source).toContain('formatCurrency(transaction.saldo_amount)');
});

test('closed entries keep the saldo part in their snapshot', async () => {
    const connection = { query: jest.fn(async () => [{ insertId: 1 }]) };
    const preview = buildClosingPreview({ ...base, saldoUsage: new Map([['55', 255000]]) });
    await insertClosingEntries(connection, 9, preview.transactions);
    const snapshot = JSON.parse(connection.query.mock.calls[0][1][13]);
    expect(snapshot.saldo_amount).toBe(255000);
});

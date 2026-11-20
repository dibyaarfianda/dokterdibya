'use strict';

const fs = require('fs');
const path = require('path');
const servicePath = path.join(__dirname, '../../services/sunday-clinic/billing-returns.js');
const { buildReturnPlan, resolveReturnAccountingDate, allocateReturnedStock, createReturn } = fs.existsSync(servicePath) ? require(servicePath) : {};
const { buildClosingPreview } = require('../../services/SundayClinicClosingService');

const invoice = { id: 1, status: 'paid', total: 100000 };
const item = { id: 7, item_type: 'obat', item_name: 'Obat uji', quantity: 10, total: 100000, price: 10000 };
const input = { kind: 'obat', item_id: 7, quantity: 3, reason: 'Dikembalikan pasien', payment_method: 'cash', request_key: 'return-request-0001' };

test('medication refund uses original line amount, ignoring client-supplied price', () => {
    expect(buildReturnPlan).toEqual(expect.any(Function));
    expect(buildReturnPlan({ ...input, amount: 1 }, invoice, [item], []).amount).toBe(30000);
});
test('rejects excessive or invalid medication quantities and foreign items', () => {
    expect(buildReturnPlan).toEqual(expect.any(Function));
    for (const quantity of [0, -1, 1.5, 11, 'NaN']) {
        expect(() => buildReturnPlan({ ...input, quantity }, invoice, [item], [])).toThrow();
    }
    expect(() => buildReturnPlan({ ...input, item_id: 99 }, invoice, [item], [])).toThrow();
    expect(() => buildReturnPlan(input, invoice, [item], [{ kind: 'obat', source_item_id: 7, quantity: 8, amount: 80000 }])).toThrow();
});
test('cash and medication returns share the paid invoice value limit', () => {
    expect(buildReturnPlan).toEqual(expect.any(Function));
    const previous = [{ kind: 'money', amount: 80000 }];
    expect(() => buildReturnPlan(input, invoice, [item], previous)).toThrow();
    expect(buildReturnPlan({ ...input, kind: 'money', amount: 20000 }, invoice, [], previous).amount).toBe(20000);
    for (const amount of [-1, 0, 20001, Infinity, 'bad', 1.001]) {
        expect(() => buildReturnPlan({ ...input, kind: 'money', amount }, invoice, [], previous)).toThrow();
    }
});
test('requires paid source, reason, supported method and durable request key', () => {
    expect(buildReturnPlan).toEqual(expect.any(Function));
    expect(() => buildReturnPlan(input, { ...invoice, status: 'confirmed' }, [item], [])).toThrow();
    expect(() => buildReturnPlan(input, { ...invoice, pending_changes: 1 }, [item], [])).toThrow();
    for (const changes of [{ reason: ' ' }, { payment_method: 'qris' }, { request_key: '' }, { kind: 'other' }]) {
        expect(() => buildReturnPlan({ ...input, ...changes }, invoice, [item], [])).toThrow();
    }
});
test('restores original FIFO and legacy stock without returning a sale twice', () => {
    expect(allocateReturnedStock).toEqual(expect.any(Function));
    const sales = [{ id: 8, obat_id: 2, batch_id: 3, quantity: -2, cost_price: 4000 }, { id: 9, obat_id: 2, batch_id: null, quantity: -5, cost_price: 5000 }];
    const previous = [{ stock_allocations: JSON.stringify([{ sale_id: 8, quantity: 1 }]) }];
    expect(allocateReturnedStock(sales, previous, 3)).toEqual([
        { sale_id: 8, obat_id: 2, batch_id: 3, quantity: 1, cost_price: 4000 },
        { sale_id: 9, obat_id: 2, batch_id: null, quantity: 2, cost_price: 5000 }
    ]);
    expect(() => allocateReturnedStock(sales, previous, 7)).toThrow();
    expect(() => allocateReturnedStock([...sales, { ...sales[0], obat_id: 99 }], [], 1)).toThrow();
});
test('closing subtracts returns and allows a date with returns only', () => {
    const refund = { id: 1, billing_id: 2, mr_id: 'DRD2', patient_id: 'P2', patient_name: 'Uji', amount: 30000, kind: 'obat', item_name: 'Obat uji', quantity: 3, actor_name: 'Dokter', created_at: '2026-10-25 10:00:00', accounting_date: '2026-10-25' };
    const preview = buildClosingPreview({ clinicDate: '2026-10-25', returns: [refund] });
    expect(preview.can_close).toBe(true);
    expect(preview.summary).toMatchObject({ grand_total: -30000, return_total: 30000, return_count: 1, transaction_count: 1 });
    expect(preview.transactions[0]).toMatchObject({ source_type: 'return', total: -30000 });
    expect(preview.fingerprint).not.toBe(buildClosingPreview({ clinicDate: '2026-10-25' }).fingerprint);
});
test('return date defaults to today and allows backdating only within the invoice day and today', () => {
    const bounds = { today: '2026-10-28', minDate: '2026-10-25' };
    expect(resolveReturnAccountingDate(undefined, bounds)).toBe('2026-10-28');
    expect(resolveReturnAccountingDate('', bounds)).toBe('2026-10-28');
    expect(resolveReturnAccountingDate('2026-10-25', bounds)).toBe('2026-10-25');
    expect(resolveReturnAccountingDate('2026-10-27', bounds)).toBe('2026-10-27');
    for (const value of ['2026-10-29', '2026-10-24', '2026-02-30', '25-10-2026', 20261025]) {
        expect(() => resolveReturnAccountingDate(value, bounds)).toThrow();
    }
    expect(resolveReturnAccountingDate('2026-01-01', { today: '2026-10-28', minDate: null })).toBe('2026-01-01');
});

// Tahap 2: a retur on a main bill paid with prepay saldo puts the saldo-paid part back into saldo.
describe('returns on bills paid with saldo', () => {
    const { resolveReturnMoney } = require(servicePath);
    const sqlOf = sql => String(sql).replace(/\s+/g, ' ').trim();

    test('resolveReturnMoney sends the saldo part back to saldo', () => {
        expect(resolveReturnMoney({ amount: 20000, saldoLeft: 365000 }))
            .toEqual({ saldo_amount: 20000, cash_amount: 0, payment_method: 'saldo' });
        expect(resolveReturnMoney({ amount: 50000, saldoLeft: 30000, paymentMethod: 'cash' }))
            .toEqual({ saldo_amount: 30000, cash_amount: 20000, payment_method: 'cash' });
        expect(() => resolveReturnMoney({ amount: 50000, saldoLeft: 30000 })).toThrow('Pilih tunai atau transfer untuk pengembalian.');
        expect(resolveReturnMoney({ amount: 15000.5, saldoLeft: 100000, paymentMethod: 'transfer' }))
            .toEqual({ saldo_amount: 15000, cash_amount: 0.5, payment_method: 'transfer' });
        expect(resolveReturnMoney({ amount: 20000, saldoLeft: 0, paymentMethod: 'transfer' }))
            .toEqual({ saldo_amount: 0, cash_amount: 20000, payment_method: 'transfer' });
    });

    test('a supported method is still checked when sent, and may be left out', () => {
        expect(() => buildReturnPlan({ ...input, payment_method: 'qris' }, invoice, [item], [])).toThrow();
        expect(() => buildReturnPlan({ ...input, payment_method: undefined }, invoice, [item], [])).not.toThrow();
    });

    function returnHarness({ additional = null, usageRows = [{ id: 3, source_id: '55:obstetri', category: 'obstetri', amount_idr: -365000 }], previous = [] } = {}) {
        const statements = [];
        const main = { id: 55, mr_id: 'DRD9001', patient_id: 'P1', status: 'paid', total: '365000', pending_changes: 0 };
        const connection = {
            beginTransaction: jest.fn(), commit: jest.fn(), rollback: jest.fn(), release: jest.fn(),
            query: jest.fn(async (sql, params) => {
                const query = sqlOf(sql);
                statements.push({ query, params });
                if (query.startsWith('SELECT * FROM sunday_clinic_billings WHERE mr_id')) return [[main]];
                if (query.startsWith('SELECT visit_location')) return [[{ visit_location: 'klinik_private' }]];
                if (query.startsWith('SELECT * FROM sunday_clinic_additional_billings')) return [additional ? [additional] : []];
                if (query.startsWith('SELECT * FROM sunday_clinic_billing_returns')) return [previous];
                if (query.includes("entry_type = 'usage'")) return [usageRows];
                if (query.includes("entry_type = 'return_credit'")) return [[]];
                if (query.includes('FROM patient_credit_ledger')) return [[]];
                if (query.startsWith('INSERT INTO sunday_clinic_billing_returns')) return [{ insertId: 7 }];
                if (query.startsWith('INSERT INTO patient_credit_ledger')) return [{ affectedRows: 1 }];
                return [[]];
            })
        };
        const deps = { db: { getConnection: jest.fn(async () => connection) }, audit: jest.fn() };
        return { deps, statements };
    }
    const moneyReturn = { kind: 'money', amount: 20000, reason: 'Obat tidak jadi', request_key: 'saldo-return-0001' };
    const actor = { id: 'U1', name: 'Kasir' };

    test('a fully saldo-paid bill: the retur goes back to saldo without asking a method', async () => {
        const { deps, statements } = returnHarness();
        const result = await createReturn(deps, { mrId: 'DRD9001', input: moneyReturn, actor, accountingDate: '2026-11-22' });
        expect(result).toMatchObject({ id: 7, saldo_amount: 20000, cash_amount: 0, already_saved: false });
        const saved = statements.find(entry => entry.query.startsWith('INSERT INTO sunday_clinic_billing_returns'));
        expect(saved.query).toContain('saldo_amount');
        expect(saved.params).toEqual(expect.arrayContaining(['saldo', 20000]));
        const credit = statements.find(entry => entry.query.startsWith('INSERT INTO patient_credit_ledger'));
        expect(credit.params).toEqual(expect.arrayContaining(['P1', 'obstetri', 'return_credit', 20000, 'sunday_clinic_return', '7:obstetri']));
    });

    test('the patient saldo is locked before the bill usage is read, in the same order as mark-paid', async () => {
        const { deps, statements } = returnHarness();
        await createReturn(deps, { mrId: 'DRD9001', input: moneyReturn, actor, accountingDate: '2026-11-22' });
        const lockAt = statements.findIndex(entry => entry.query.includes("WHERE patient_id = ? AND gateway_mode = 'live'") && entry.query.includes('FOR UPDATE'));
        const usageAt = statements.findIndex(entry => entry.query.includes("entry_type = 'usage'"));
        expect(lockAt).toBeGreaterThan(-1);
        expect(usageAt).toBeGreaterThan(lockAt);
        expect(statements[usageAt].query).not.toContain('FOR UPDATE');
        expect(statements.filter(entry => entry.query.includes("WHERE patient_id = ? AND gateway_mode = 'live'"))).toHaveLength(1);
    });

    test('a second retur after the saldo part is used up needs cash or transfer', async () => {
        const { deps } = returnHarness({
            usageRows: [{ id: 3, source_id: '55:obstetri', category: 'obstetri', amount_idr: -20000 }],
            previous: [{ id: 6, additional_billing_id: null, kind: 'money', amount: '20000', saldo_amount: '20000', request_key: 'older-return-00001' }]
        });
        await expect(createReturn(deps, { mrId: 'DRD9001', input: moneyReturn, actor, accountingDate: '2026-11-22' }))
            .rejects.toThrow('Pilih tunai atau transfer untuk pengembalian.');
        const { deps: cashDeps, statements } = returnHarness({
            usageRows: [{ id: 3, source_id: '55:obstetri', category: 'obstetri', amount_idr: -20000 }],
            previous: [{ id: 6, additional_billing_id: null, kind: 'money', amount: '20000', saldo_amount: '20000', request_key: 'older-return-00001' }]
        });
        const result = await createReturn(cashDeps, { mrId: 'DRD9001', input: { ...moneyReturn, payment_method: 'cash' }, actor, accountingDate: '2026-11-22' });
        expect(result).toMatchObject({ saldo_amount: 0, cash_amount: 20000 });
        expect(statements.some(entry => entry.query.startsWith('INSERT INTO patient_credit_ledger'))).toBe(false);
    });

    test('additional invoice returns never touch saldo', async () => {
        const additional = { id: 81, parent_billing_id: 55, mr_id: 'DRD9001', status: 'paid', total: '50000', pending_changes: 0 };
        const { deps } = returnHarness({ additional });
        await expect(createReturn(deps, { mrId: 'DRD9001', input: { ...moneyReturn, additional_billing_id: 81 }, actor, accountingDate: '2026-11-22' }))
            .rejects.toThrow('Pilih tunai atau transfer untuk pengembalian.');
        const { deps: cashDeps, statements } = returnHarness({ additional });
        await createReturn(cashDeps, { mrId: 'DRD9001', input: { ...moneyReturn, additional_billing_id: 81, payment_method: 'transfer' }, actor, accountingDate: '2026-11-22' });
        expect(statements.some(entry => entry.query.includes('FROM patient_credit_ledger'))).toBe(false);
        expect(statements.some(entry => entry.query.startsWith('INSERT INTO patient_credit_ledger'))).toBe(false);
    });

    test('the retur form shows the saldo split and only asks a method for the cash part', () => {
        const ui = fs.readFileSync(path.join(__dirname, '../../../public/scripts/sunday-clinic/components/shared/billing.js'), 'utf8');
        expect(ui).toContain('kembali ke saldo pasien');
        expect(ui).toContain('diserahkan tunai/transfer');
        expect(ui).toContain('billing-return-method-group');
        expect(ui).toMatch(/saldo_left/);
        expect(ui).toContain("row.payment_method === 'saldo'");
    });
});

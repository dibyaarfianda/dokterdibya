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

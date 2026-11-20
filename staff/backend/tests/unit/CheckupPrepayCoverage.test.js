'use strict';

jest.mock('../../services/PatientCreditLedger', () => ({
    getLiveBalances: jest.fn(),
    getUsageForBillings: jest.fn()
}));

const L = require('../../services/PatientCreditLedger');
const C = require('../../services/CheckupPrepayCoverage');

beforeEach(() => jest.clearAllMocks());

test('a confirmed bill previews the deduction from live saldo', async () => {
    L.getLiveBalances.mockResolvedValue([{ category: 'obstetri', balance_idr: 255000 }]);
    expect(await C.forBilling({}, { id: 1, patient_id: 'P1', status: 'confirmed', total: '365000.00' }))
        .toEqual({ mode: 'preview', live_balance_idr: 255000, deduct_idr: 255000, remaining_due_idr: 110000, used: [] });
    expect(L.getLiveBalances).toHaveBeenCalledWith({}, 'P1');
});

test('saldo larger than the bill only covers the bill', async () => {
    L.getLiveBalances.mockResolvedValue([{ category: 'obstetri', balance_idr: 255000 }, { category: 'gyn_repro', balance_idr: 340000 }]);
    expect(await C.forBilling({}, { id: 1, patient_id: 'P1', status: 'confirmed', total: 300000 }))
        .toMatchObject({ mode: 'preview', live_balance_idr: 595000, deduct_idr: 300000, remaining_due_idr: 0 });
});

test('a paid bill reports the recorded usage', async () => {
    L.getUsageForBillings.mockResolvedValue(new Map([['1', { used_idr: 255000, rows: [{ id: 3, category: 'obstetri', amount_idr: 255000 }] }]]));
    expect(await C.forBilling({}, { id: 1, patient_id: 'P1', status: 'paid', total: 365000 })).toEqual({
        mode: 'used', live_balance_idr: 0, deduct_idr: 255000, remaining_due_idr: 110000,
        used: [{ category: 'obstetri', amount_idr: 255000 }]
    });
    expect(L.getLiveBalances).not.toHaveBeenCalled();
});

test('no saldo, a paid bill without usage, and other statuses report none', async () => {
    L.getLiveBalances.mockResolvedValue([]);
    expect(await C.forBilling({}, { id: 2, patient_id: 'P2', status: 'confirmed', total: 100000 }))
        .toEqual({ mode: 'none', live_balance_idr: 0, deduct_idr: 0, remaining_due_idr: 100000, used: [] });
    L.getUsageForBillings.mockResolvedValue(new Map());
    expect((await C.forBilling({}, { id: 3, patient_id: 'P2', status: 'paid', total: 100000 })).mode).toBe('none');
    expect((await C.forBilling({}, { id: 4, patient_id: 'P2', status: 'draft', total: 100000 })).mode).toBe('none');
    expect(await C.forBilling({}, null)).toEqual({ mode: 'none', live_balance_idr: 0, deduct_idr: 0, remaining_due_idr: 0, used: [] });
});

test('the billing GET attaches the coverage to the bill', () => {
    const source = require('fs').readFileSync(require('path').join(__dirname, '../../services/sunday-clinic/billing.js'), 'utf8');
    expect(source).toContain("require('../CheckupPrepayCoverage')");
    expect(source).toMatch(/prepay: await forBilling\(db, billingRow\)/);
});

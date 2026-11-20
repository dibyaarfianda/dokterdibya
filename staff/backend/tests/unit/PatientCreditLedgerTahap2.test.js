'use strict';

// Tahap 2: live saldo pays Klinik Privat bills, returns credit it back, staff refunds it.
const L = require('../../services/PatientCreditLedger');

const bal = (category, balance_idr, oldest) => ({ category, balance_idr, oldest_at: new Date(oldest) });

describe('planUsage', () => {
    test('takes the bill category first, then the oldest credit', () => {
        const balances = [bal('gyn_repro', 340000, '2026-11-01'), bal('obstetri', 255000, '2026-11-10')];
        expect(L.planUsage(balances, 300000, 'obstetri')).toEqual([
            { category: 'obstetri', amount_idr: 255000 },
            { category: 'gyn_repro', amount_idr: 45000 }
        ]);
        expect(L.planUsage(balances, 300000, null)).toEqual([{ category: 'gyn_repro', amount_idr: 300000 }]);
    });

    test('takes nothing for an empty bill or an empty saldo', () => {
        const balances = [bal('obstetri', 255000, '2026-11-10')];
        expect(L.planUsage(balances, 0, 'obstetri')).toEqual([]);
        expect(L.planUsage(balances, -5, 'obstetri')).toEqual([]);
        expect(L.planUsage([], 100000, 'obstetri')).toEqual([]);
    });

    test('never takes more than the saldo', () => {
        expect(L.planUsage([bal('obstetri', 255000, '2026-11-10')], 365000, 'obstetri'))
            .toEqual([{ category: 'obstetri', amount_idr: 255000 }]);
    });
});

describe('planReturnCredit', () => {
    test('refills the categories used, last used first', () => {
        const usage = [{ id: 1, category: 'obstetri', amount_idr: 255000 }, { id: 2, category: 'gyn_repro', amount_idr: 45000 }];
        expect(L.planReturnCredit(usage, [], 60000)).toEqual([
            { category: 'gyn_repro', amount_idr: 45000 },
            { category: 'obstetri', amount_idr: 15000 }
        ]);
        expect(L.planReturnCredit(usage, [{ category: 'gyn_repro', amount_idr: 45000 }], 10000))
            .toEqual([{ category: 'obstetri', amount_idr: 10000 }]);
    });

    test('never credits more than was used', () => {
        const usage = [{ id: 1, category: 'obstetri', amount_idr: 20000 }];
        expect(L.planReturnCredit(usage, [], 50000)).toEqual([{ category: 'obstetri', amount_idr: 20000 }]);
        expect(L.planReturnCredit(usage, [{ category: 'obstetri', amount_idr: 20000 }], 5000)).toEqual([]);
    });
});

describe('ledger reads and writes', () => {
    test('getLiveBalances reads live rows only and locks when asked', async () => {
        const query = jest.fn(async () => [[
            { category: 'obstetri', amount_idr: 255000, created_at: '2026-11-20 07:48:00' },
            { category: 'obstetri', amount_idr: -55000, created_at: '2026-11-21 09:00:00' },
            { category: 'gyn_repro', amount_idr: 340000, created_at: '2026-11-19 10:00:00' },
            { category: 'gyn_repro', amount_idr: -340000, created_at: '2026-11-21 10:00:00' }
        ]]);
        const balances = await L.getLiveBalances({ query }, 'P1', { forUpdate: true });
        expect(query.mock.calls[0][0]).toMatch(/gateway_mode = 'live'/);
        expect(query.mock.calls[0][0]).toMatch(/FOR UPDATE/);
        expect(query.mock.calls[0][1]).toEqual(['P1']);
        expect(balances).toEqual([{ category: 'obstetri', balance_idr: 200000, oldest_at: new Date('2026-11-20 07:48:00') }]);

        await L.getLiveBalances({ query }, 'P1');
        expect(query.mock.calls[1][0]).not.toMatch(/FOR UPDATE/);
    });

    test('recordUsage writes one negative live row per category', async () => {
        const query = jest.fn(async () => [{ affectedRows: 1 }]);
        const total = await L.recordUsage({ query }, {
            billingId: 9,
            patientId: 'P1',
            plan: [{ category: 'obstetri', amount_idr: 255000 }, { category: 'gyn_repro', amount_idr: 45000 }],
            actor: 'Kasir'
        });
        expect(total).toBe(300000);
        expect(query).toHaveBeenCalledTimes(2);
        expect(query.mock.calls[0][0]).toMatch(/INSERT INTO patient_credit_ledger/);
        expect(query.mock.calls[0][1]).toEqual(expect.arrayContaining(['P1', 'obstetri', -255000, 'sunday_clinic_billing', '9:obstetri', 'Kasir']));
        expect(query.mock.calls[1][1]).toEqual(expect.arrayContaining(['gyn_repro', -45000, '9:gyn_repro']));
    });

    test('recordUsage on a bill already recorded returns the saved total', async () => {
        const duplicate = Object.assign(new Error('dup'), { code: 'ER_DUP_ENTRY' });
        const query = jest.fn(async sql => {
            if (/INSERT INTO/.test(sql)) throw duplicate;
            return [[{ id: 4, source_id: '9:obstetri', category: 'obstetri', amount_idr: -255000 }]];
        });
        const total = await L.recordUsage({ query }, {
            billingId: 9, patientId: 'P1', plan: [{ category: 'obstetri', amount_idr: 255000 }], actor: 'Kasir'
        });
        expect(total).toBe(255000);
    });

    test('getUsageForBillings groups live usage per bill', async () => {
        const query = jest.fn(async () => [[
            { id: 3, source_id: '9:obstetri', category: 'obstetri', amount_idr: -255000 },
            { id: 4, source_id: '9:gyn_repro', category: 'gyn_repro', amount_idr: -45000 },
            { id: 5, source_id: '12:obstetri', category: 'obstetri', amount_idr: -100000 }
        ]]);
        const usage = await L.getUsageForBillings({ query }, [9, 12], { forUpdate: true });
        expect(query.mock.calls[0][0]).toMatch(/entry_type = 'usage'/);
        expect(query.mock.calls[0][0]).toMatch(/gateway_mode = 'live'/);
        expect(query.mock.calls[0][0]).toMatch(/FOR UPDATE/);
        // Index-usable (unique key prefix): locks only these bills' rows, never the whole usage range.
        expect(query.mock.calls[0][0]).not.toMatch(/SUBSTRING_INDEX/);
        expect(query.mock.calls[0][0]).toMatch(/source_id LIKE \? OR source_id LIKE \?/);
        expect(query.mock.calls[0][1]).toEqual(['9:%', '12:%']);
        expect(usage.get('9')).toEqual({
            used_idr: 300000,
            rows: [{ id: 3, category: 'obstetri', amount_idr: 255000 }, { id: 4, category: 'gyn_repro', amount_idr: 45000 }]
        });
        expect(usage.get('12').used_idr).toBe(100000);
        expect((await L.getUsageForBillings({ query }, [])).size).toBe(0);
    });

    test('return credits and refunds use their own sources and signs', async () => {
        const query = jest.fn(async () => [{ affectedRows: 1 }]);
        await L.recordReturnCredit({ query }, { returnId: 7, patientId: 'P1', plan: [{ category: 'obstetri', amount_idr: 20000 }], actor: 'Kasir' });
        expect(query.mock.calls[0][1]).toEqual(expect.arrayContaining(['P1', 'obstetri', 'return_credit', 20000, 'sunday_clinic_return', '7:obstetri']));
        await L.recordRefundRows({ query }, { refundId: 3, patientId: 'P1', plan: [{ category: 'obstetri', amount_idr: 20000 }], actor: 'Dokter' });
        expect(query.mock.calls[1][1]).toEqual(expect.arrayContaining(['P1', 'obstetri', 'refund', -20000, 'credit_refund', '3:obstetri']));
    });
});

describe('assertNoPrepaySaldoEvidence', () => {
    test('refuses a record whose bill was paid with saldo', async () => {
        const connection = { query: jest.fn(async () => [[{ id: 1 }]]) };
        await expect(L.assertNoPrepaySaldoEvidence(connection, { mrId: 'DRD1' }))
            .rejects.toMatchObject({ statusCode: 409, message: 'Tagihan ini dibayar dengan saldo di muka; tidak dapat dihapus.' });
        expect(connection.query.mock.calls[0][1]).toEqual(['DRD1']);
    });

    test('refuses a patient with any live saldo row and allows one without', async () => {
        await expect(L.assertNoPrepaySaldoEvidence({ query: jest.fn(async () => [[{ id: 2 }]]) }, { patientId: 'P1' }))
            .rejects.toMatchObject({ statusCode: 409 });
        const clean = { query: jest.fn(async () => [[]]) };
        await expect(L.assertNoPrepaySaldoEvidence(clean, { patientId: 'P1' })).resolves.toBeUndefined();
        expect(clean.query.mock.calls[0][0]).toMatch(/gateway_mode = 'live'/);
    });
});

'use strict';

// Tahap 2: marking a Klinik Privat main bill paid deducts the patient's live prepay saldo
// in the same transaction as the paid status, and refuses (before any stock movement) when
// the saldo the cashier saw is no longer what the server would take.

const mockDb = { query: jest.fn(), getConnection: jest.fn() };

jest.mock('../../services/sunday-clinic/shared', () => ({
    db: mockDb,
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
    normalizeMrId: value => value,
    getBillingSnapshot: jest.fn(async () => ({})),
    writeBillingAudit: jest.fn(async () => {}),
    activityLogger: { logFromRequest: jest.fn(), ACTIONS: { FINALIZE_VISIT: 'finalize_visit' } }
}));
jest.mock('../../services/sunday-clinic/queue', () => ({ updateQueueStatus: jest.fn() }));
jest.mock('../../utils/pdf-generator', () => ({}));
jest.mock('../../services/r2Storage', () => ({}));
jest.mock('../../services/InventoryService', () => ({ deductStockFIFO: jest.fn() }));
jest.mock('../../services/PatientCreditLedger', () => ({
    lockLiveBalances: jest.fn(),
    planUsage: jest.fn(),
    recordUsage: jest.fn(),
    getLiveBalances: jest.fn(async () => []),
    getPendingRefundHold: jest.fn(async () => 0),
    getUsageForBillings: jest.fn(async () => new Map())
}));

const InventoryService = require('../../services/InventoryService');
const Ledger = require('../../services/PatientCreditLedger');
const { writeBillingAudit } = require('../../services/sunday-clinic/shared');
const { postBillingByMrIdMarkPaid } = require('../../services/sunday-clinic/billing');

const SALDO_CHANGED = 'Saldo pasien berubah. Muat ulang tagihan.';
const sqlOf = sql => String(sql).replace(/\s+/g, ' ').trim();
let calls;

function response() {
    return {
        statusCode: 200,
        status(code) { this.statusCode = code; return this; },
        json: jest.fn()
    };
}

function setup({ total = 365000, lines = [], mrCategory = 'obstetri' } = {}) {
    calls = [];
    const billing = { id: 55, mr_id: 'DRD1600', patient_id: 'P1', status: 'confirmed', total };
    const lockConnection = {
        beginTransaction: jest.fn().mockResolvedValue(),
        commit: jest.fn(async () => { calls.push('commit'); }),
        rollback: jest.fn().mockResolvedValue(),
        release: jest.fn(),
        query: jest.fn(async sql => {
            const query = sqlOf(sql);
            if (query.startsWith('SELECT GET_LOCK')) return [[{ acquired: 1 }]];
            if (query.includes('FROM sunday_clinic_billings') && query.includes('FOR UPDATE')) return [[billing]];
            if (query.startsWith('SELECT mr_category FROM sunday_clinic_records')) return [[{ mr_category: mrCategory }]];
            if (query.startsWith('UPDATE sunday_clinic_billings')) { calls.push('paid-update'); return [{ affectedRows: 1 }]; }
            return [[]];
        })
    };
    mockDb.getConnection.mockResolvedValue(lockConnection);
    mockDb.query.mockImplementation(async sql => {
        const query = sqlOf(sql);
        if (query.includes('FROM sunday_clinic_billings WHERE mr_id = ?')) return [[billing]];
        if (query.startsWith('SELECT bi.item_code')) return [lines];
        if (query.startsWith('SELECT id, name, stock FROM obat')) return [[{ id: 103, name: 'Ossovit', stock: 500 }]];
        if (query.startsWith('SELECT ABS(COALESCE(SUM(quantity), 0))')) return [[{ deducted_qty: 0 }]];
        return [[]];
    });
    Ledger.lockLiveBalances.mockImplementation(async () => { calls.push('lock-saldo'); return [{ category: 'obstetri', balance_idr: 255000 }]; });
    Ledger.recordUsage.mockImplementation(async (_connection, { plan }) => {
        calls.push('record-usage');
        return plan.reduce((sum, entry) => sum + entry.amount_idr, 0);
    });
    return lockConnection;
}

async function markPaid(body) {
    const res = response();
    const next = jest.fn();
    await postBillingByMrIdMarkPaid({ params: { mrId: 'DRD1600' }, body, user: { name: 'Kasir' } }, res, next);
    expect(next).not.toHaveBeenCalled();
    return res;
}

describe('mark-paid with prepay saldo', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        InventoryService.deductStockFIFO.mockResolvedValue({ success: true, totalCost: 0 });
    });

    test('no saldo: the paid path is unchanged and no usage is recorded', async () => {
        setup();
        Ledger.planUsage.mockReturnValue([]);
        const res = await markPaid({});
        expect(res.statusCode).toBe(200);
        expect(Ledger.recordUsage).not.toHaveBeenCalled();
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, prepay: { deduct_idr: 0, remaining_due_idr: 365000 } }));
    });

    test('saldo smaller than the bill is recorded right before the paid update', async () => {
        setup();
        Ledger.planUsage.mockReturnValue([{ category: 'obstetri', amount_idr: 255000 }]);
        const res = await markPaid({ expected_prepay_idr: 255000 });
        expect(res.statusCode).toBe(200);
        // Tahap 3: the amount planned is min(floor(total), live - hold) = min(365000, 255000).
        expect(Ledger.planUsage).toHaveBeenCalledWith([{ category: 'obstetri', balance_idr: 255000 }], 255000, 'obstetri');
        expect(Ledger.recordUsage).toHaveBeenCalledWith(expect.anything(), {
            billingId: 55, patientId: 'P1', plan: [{ category: 'obstetri', amount_idr: 255000 }], actor: 'Kasir'
        });
        expect(calls).toEqual(['lock-saldo', 'record-usage', 'paid-update', 'commit']);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ prepay: { deduct_idr: 255000, remaining_due_idr: 110000 } }));
        expect(writeBillingAudit).toHaveBeenCalledWith(expect.anything(), expect.anything(),
            expect.objectContaining({ summary: expect.stringContaining('saldo Rp 255.000') }));
    });

    test('a changed saldo returns 409 before any stock movement', async () => {
        setup({ lines: [{ item_code: 'OB025199', item_name: 'Ossovit', quantity: 1, obat_id: 103 }] });
        Ledger.planUsage.mockReturnValue([{ category: 'obstetri', amount_idr: 255000 }]);
        const res = await markPaid({ expected_prepay_idr: 200000 });
        expect(res.statusCode).toBe(409);
        expect(res.json).toHaveBeenCalledWith({ success: false, message: SALDO_CHANGED });
        expect(InventoryService.deductStockFIFO).not.toHaveBeenCalled();
        expect(Ledger.recordUsage).not.toHaveBeenCalled();
        expect(calls).not.toContain('paid-update');
    });

    test('an old cashier page that sends no expected amount gets 409 when saldo exists', async () => {
        setup();
        Ledger.planUsage.mockReturnValue([{ category: 'obstetri', amount_idr: 255000 }]);
        const res = await markPaid({ payment_method: 'cash' });
        expect(res.statusCode).toBe(409);
        expect(Ledger.recordUsage).not.toHaveBeenCalled();
    });

    test('a bill total with cents deducts whole rupiah only', async () => {
        setup({ total: '100000.50' });
        Ledger.planUsage.mockImplementation((_balances, amount) => [{ category: 'obstetri', amount_idr: amount }]);
        const res = await markPaid({ expected_prepay_idr: 100000 });
        expect(res.statusCode).toBe(200);
        expect(Ledger.planUsage).toHaveBeenCalledWith(expect.any(Array), 100000, 'obstetri');
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ prepay: { deduct_idr: 100000, remaining_due_idr: 0.5 } }));
    });

    test('saldo the cashier saw that is gone by the click returns 409 instead of charging the full bill', async () => {
        setup();
        Ledger.planUsage.mockReturnValue([]);
        const res = await markPaid({ expected_prepay_idr: 255000 });
        expect(res.statusCode).toBe(409);
        expect(res.json).toHaveBeenCalledWith({ success: false, message: SALDO_CHANGED });
        expect(calls).not.toContain('paid-update');
    });

    test('a failure after the usage insert rolls back the usage with the paid status', async () => {
        const lockConnection = setup();
        Ledger.planUsage.mockReturnValue([{ category: 'obstetri', amount_idr: 255000 }]);
        lockConnection.query.mockImplementation(async sql => {
            const query = sqlOf(sql);
            if (query.startsWith('SELECT GET_LOCK')) return [[{ acquired: 1 }]];
            if (query.includes('FROM sunday_clinic_billings') && query.includes('FOR UPDATE')) return [[{ id: 55, mr_id: 'DRD1600', patient_id: 'P1', status: 'confirmed', total: 365000 }]];
            if (query.startsWith('SELECT mr_category FROM sunday_clinic_records')) return [[{ mr_category: 'obstetri' }]];
            if (query.startsWith('UPDATE sunday_clinic_billings')) throw new Error('lost connection');
            return [[]];
        });
        const res = response();
        const next = jest.fn();
        await postBillingByMrIdMarkPaid({ params: { mrId: 'DRD1600' }, body: { expected_prepay_idr: 255000 }, user: { name: 'Kasir' } }, res, next);
        expect(Ledger.recordUsage).toHaveBeenCalled();
        expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'lost connection' }));
        expect(lockConnection.rollback).toHaveBeenCalled();
        expect(lockConnection.commit).not.toHaveBeenCalled();
    });

    test('Review Focus 3: a pending withdrawal request holds its amount, read under the saldo lock', async () => {
        const lockConnection = setup();
        Ledger.getPendingRefundHold.mockImplementationOnce(async () => { calls.push('hold'); return 200000; });
        Ledger.planUsage.mockImplementation((_balances, amount) => [{ category: 'obstetri', amount_idr: amount }]);

        const stale = await markPaid({ expected_prepay_idr: 255000 });
        expect(stale.statusCode).toBe(409);
        expect(stale.json).toHaveBeenCalledWith({ success: false, message: SALDO_CHANGED });
        expect(Ledger.planUsage).toHaveBeenCalledWith([{ category: 'obstetri', balance_idr: 255000 }], 55000, 'obstetri');
        expect(Ledger.getPendingRefundHold).toHaveBeenCalledWith(lockConnection, 'P1', { forUpdate: true });
        expect(calls.slice(0, 2)).toEqual(['lock-saldo', 'hold']);
        expect(Ledger.recordUsage).not.toHaveBeenCalled();

        setup();
        Ledger.getPendingRefundHold.mockResolvedValueOnce(200000);
        const res = await markPaid({ expected_prepay_idr: 55000 });
        expect(res.statusCode).toBe(200);
        expect(Ledger.recordUsage).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
            plan: [{ category: 'obstetri', amount_idr: 55000 }]
        }));
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ prepay: { deduct_idr: 55000, remaining_due_idr: 310000 } }));
    });

    test('a patient without live saldo never reads the hold (no extra locks)', async () => {
        setup();
        Ledger.lockLiveBalances.mockImplementationOnce(async () => []);
        Ledger.planUsage.mockReturnValue([]);
        const res = await markPaid({});
        expect(res.statusCode).toBe(200);
        expect(Ledger.getPendingRefundHold).not.toHaveBeenCalled();
        expect(Ledger.planUsage).toHaveBeenCalledWith([], 0, 'obstetri');
    });

    test('a hold as large as the live saldo leaves nothing to deduct', async () => {
        setup();
        Ledger.getPendingRefundHold.mockResolvedValueOnce(255000);
        Ledger.planUsage.mockImplementation((_balances, amount) => (amount > 0 ? [{ category: 'obstetri', amount_idr: amount }] : []));
        const res = await markPaid({});
        expect(res.statusCode).toBe(200);
        expect(Ledger.planUsage).toHaveBeenCalledWith(expect.any(Array), 0, 'obstetri');
        expect(Ledger.recordUsage).not.toHaveBeenCalled();
    });

    test('a zero total bill needs no expected amount and records nothing', async () => {
        setup({ total: 0 });
        Ledger.planUsage.mockReturnValue([]);
        const res = await markPaid({});
        expect(res.statusCode).toBe(200);
        expect(Ledger.planUsage).toHaveBeenCalledWith(expect.any(Array), 0, 'obstetri');
        expect(Ledger.recordUsage).not.toHaveBeenCalled();
    });
});

'use strict';

// Regression: therapy items are appended, so one obat can sit on several billing
// lines. Mark-paid compared each line's quantity with the obat's total already
// deducted, so 30 + 30 of the same obat only deducted 30.

const mockDb = { query: jest.fn(), getConnection: jest.fn() };

jest.mock('../../services/sunday-clinic/shared', () => ({
    db: mockDb,
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
    normalizeMrId: value => value,
    getBillingSnapshot: jest.fn(async () => ({})),
    writeBillingAudit: jest.fn(async () => {}),
    activityLogger: { logFromRequest: jest.fn() }
}));
jest.mock('../../services/sunday-clinic/queue', () => ({ updateQueueStatus: jest.fn() }));
jest.mock('../../utils/pdf-generator', () => ({}));
jest.mock('../../services/r2Storage', () => ({}));
jest.mock('../../services/InventoryService', () => ({ deductStockFIFO: jest.fn() }));

const InventoryService = require('../../services/InventoryService');
const { postBillingByMrIdMarkPaid } = require('../../services/sunday-clinic/billing');

const sqlOf = sql => String(sql).replace(/\s+/g, ' ').trim();
const ossovitLine = quantity => ({ item_code: 'OB025199', item_name: 'Ossovit', quantity, obat_id: 103 });

function response() {
    return {
        statusCode: 200,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json: jest.fn()
    };
}

function setup({ lines, alreadyDeducted = 0 }) {
    const billing = { id: 55, mr_id: 'DRD1600', status: 'confirmed' };
    const lockConnection = {
        beginTransaction: jest.fn().mockResolvedValue(),
        commit: jest.fn().mockResolvedValue(),
        rollback: jest.fn().mockResolvedValue(),
        release: jest.fn(),
        query: jest.fn(async sql => {
            const query = sqlOf(sql);
            if (query.startsWith('SELECT GET_LOCK')) return [[{ acquired: 1 }]];
            if (query.includes('FROM sunday_clinic_billings') && query.includes('FOR UPDATE')) return [[billing]];
            // Stop the flow right after stock deduction: the paid update "loses" a race.
            if (query.startsWith('UPDATE sunday_clinic_billings')) return [{ affectedRows: 0 }];
            return [[]];
        })
    };
    mockDb.getConnection.mockResolvedValue(lockConnection);
    mockDb.query.mockImplementation(async sql => {
        const query = sqlOf(sql);
        if (query.includes('FROM sunday_clinic_billings WHERE mr_id = ?')) return [[billing]];
        if (query.startsWith('SELECT bi.item_code')) return [lines];
        if (query.startsWith('SELECT id, name, stock FROM obat')) return [[{ id: 103, name: 'Ossovit', stock: 500 }]];
        if (query.startsWith('SELECT obat_id, ABS(SUM(quantity))')) {
            return [alreadyDeducted ? [{ obat_id: 103, deducted_qty: alreadyDeducted }] : []];
        }
        if (query.startsWith('SELECT ABS(COALESCE(SUM(quantity), 0))')) return [[{ deducted_qty: alreadyDeducted }]];
        return [[]];
    });
    return lockConnection;
}

async function markPaid() {
    const res = response();
    await postBillingByMrIdMarkPaid(
        { params: { mrId: 'DRD1600' }, body: { payment_method: 'cash' }, user: { name: 'Kasir' } },
        res,
        jest.fn()
    );
    return res;
}

describe('Sunday Clinic mark-paid deducts stock per obat', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        InventoryService.deductStockFIFO.mockResolvedValue({ success: true, totalCost: 0 });
    });

    test('two lines of the same obat are deducted as one total', async () => {
        setup({ lines: [ossovitLine(30), ossovitLine(30)] });

        const res = await markPaid();

        expect(InventoryService.deductStockFIFO).toHaveBeenCalledTimes(1);
        expect(InventoryService.deductStockFIFO).toHaveBeenCalledWith(103, 60, 'sunday_clinic_billing', 55, 'Kasir');
        expect(res.statusCode).toBe(409);
    });

    test('a retry deducts only what is still missing for that obat', async () => {
        setup({ lines: [ossovitLine(30), ossovitLine(30)], alreadyDeducted: 30 });

        await markPaid();

        expect(InventoryService.deductStockFIFO).toHaveBeenCalledTimes(1);
        expect(InventoryService.deductStockFIFO).toHaveBeenCalledWith(103, 30, 'sunday_clinic_billing', 55, 'Kasir');
    });

    test('nothing is deducted again once the obat total is fully deducted', async () => {
        setup({ lines: [ossovitLine(30), ossovitLine(30)], alreadyDeducted: 60 });

        await markPaid();

        expect(InventoryService.deductStockFIFO).not.toHaveBeenCalled();
    });

    test('a single line still deducts its quantity', async () => {
        setup({ lines: [ossovitLine(15)] });

        await markPaid();

        expect(InventoryService.deductStockFIFO).toHaveBeenCalledWith(103, 15, 'sunday_clinic_billing', 55, 'Kasir');
    });
});

const fs = require('fs');
const path = require('path');
const { createFakeConnection, createFakePool } = require('../helpers/fakeConnection');

let mockConnection;

jest.mock('../../db', () => ({
    getConnection: (...args) => require('../helpers/fakeConnection').createFakePool(mockConnection).getConnection(...args),
    query: (...args) => mockConnection.query(...args)
}));
jest.mock('../../utils/cache', () => ({ delPattern: jest.fn() }));
jest.mock('../../utils/logger', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
}));

const StockLedgerService = require('../../services/StockLedgerService');
const InventoryService = require('../../services/InventoryService');

const OK = [{ affectedRows: 1, insertId: 99 }];

function fifoHandlers() {
    return [
        [/FROM obat WHERE id = \? FOR UPDATE/, [[{ id: 7, stock: 10, default_cost_price: 900 }]]],
        [/FROM obat_batches[\s\S]*FOR UPDATE/, [[
            { id: 1, quantity_remaining: 2, cost_price: 1000 },
            { id: 2, quantity_remaining: 5, cost_price: 1100 }
        ]]],
        [/UPDATE obat_batches/, OK],
        [/INSERT INTO stock_movements/, OK],
        [/UPDATE obat SET stock = stock - \?/, OK],
        [/SELECT stock FROM obat WHERE id = \?/, [[{ stock: 6 }]]]
    ];
}

function firstIndex(calls, regex) {
    return calls.findIndex((c) => regex.test(c.sql));
}

describe('StockLedgerService lock order', () => {
    afterEach(() => jest.restoreAllMocks());

    test('deductStockFIFO locks the obat row before any batch row', async () => {
        const { connection, calls } = createFakeConnection(fifoHandlers());
        mockConnection = connection;
        await StockLedgerService.deductStockFIFO(7, 4, 'obat_sale', 55, 'Staf');
        const obatIdx = firstIndex(calls, /FROM obat WHERE id = \? FOR UPDATE/);
        const batchIdx = firstIndex(calls, /FROM obat_batches[\s\S]*FOR UPDATE/);
        expect(obatIdx).toBeGreaterThanOrEqual(0);
        expect(batchIdx).toBeGreaterThan(obatIdx);
    });

    test('deductStockFIFO keeps FIFO results', async () => {
        const { connection, calls } = createFakeConnection(fifoHandlers());
        mockConnection = connection;
        const result = await StockLedgerService.deductStockFIFO(7, 4, 'obat_sale', 55, 'Staf');
        expect(result.totalCost).toBe(4200);
        expect(result.deductions.map((d) => d.batchId)).toEqual([1, 2]);
        const movementQuantities = calls
            .filter((c) => /INSERT INTO stock_movements/.test(c.sql))
            .map((c) => c.params[2]);
        expect(movementQuantities).toEqual([-2, -2]);
    });

    test('recordPurchase locks the obat row before inserting the batch', async () => {
        const { connection, calls } = createFakeConnection([
            [/FROM obat WHERE id = \? FOR UPDATE/, [[{ id: 7, stock: 10, default_cost_price: 900 }]]],
            [/INSERT INTO obat_batches/, OK],
            [/INSERT INTO stock_movements/, OK],
            [/UPDATE obat SET stock = stock \+ \?/, OK],
            [/UPDATE obat SET default_cost_price/, OK]
        ]);
        mockConnection = connection;
        await StockLedgerService.recordPurchase({
            obatId: 7, purchaseDate: '2026-11-06', costPrice: 1000, quantity: 5, createdBy: 'Staf'
        });
        const obatIdx = firstIndex(calls, /FROM obat WHERE id = \? FOR UPDATE/);
        const insertIdx = firstIndex(calls, /INSERT INTO obat_batches/);
        expect(obatIdx).toBeGreaterThanOrEqual(0);
        expect(insertIdx).toBeGreaterThan(obatIdx);
    });

    test('InventoryService delegates stock writes', async () => {
        const deductSpy = jest.spyOn(StockLedgerService, 'deductStockFIFO').mockResolvedValue('x');
        await expect(InventoryService.deductStockFIFO(1, 1, 't', 2, 'u')).resolves.toBe('x');
        expect(deductSpy).toHaveBeenCalledWith(1, 1, 't', 2, 'u');

        const input = { obatId: 1, quantity: 2 };
        const purchaseSpy = jest.spyOn(StockLedgerService, 'recordPurchase').mockResolvedValue('y');
        await expect(InventoryService.recordPurchase(input)).resolves.toBe('y');
        expect(purchaseSpy).toHaveBeenCalledWith(input);
    });

    test('clinic return locks obat rows before restoring batches', () => {
        const source = fs.readFileSync(
            path.join(__dirname, '../../services/sunday-clinic/billing-returns.js'),
            'utf8'
        );
        const lockPos = source.search(/SELECT id FROM obat WHERE id IN \(\?\) ORDER BY id FOR UPDATE/);
        const restorePos = source.indexOf('UPDATE obat_batches SET quantity_remaining = quantity_remaining +');
        expect(lockPos).toBeGreaterThanOrEqual(0);
        expect(restorePos).toBeGreaterThan(lockPos);
    });
});

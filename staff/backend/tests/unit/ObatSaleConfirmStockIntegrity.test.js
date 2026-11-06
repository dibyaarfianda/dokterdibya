'use strict';

// Regression: each FIFO deduction commits on its own connection, so a
// confirmation that failed on item 2 left item 1 deducted while the sale stayed
// draft; confirming again deducted item 1 a second time. Confirmation must
// pre-check stock, lock the sale, and only deduct what is still missing.

const request = require('supertest');
const express = require('express');

jest.mock('../../db', () => ({ query: jest.fn(), getConnection: jest.fn() }));
jest.mock('../../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../../middleware/auth', () => ({
    verifyToken: (req, res, next) => {
        req.user = { id: 'staff-1', name: 'Urfianita' };
        next();
    }
}));
jest.mock('../../services/InventoryService', () => ({ deductStockFIFO: jest.fn() }));

const db = require('../../db');
const InventoryService = require('../../services/InventoryService');
const obatSalesRouter = require('../../routes/obat-sales');

const sqlOf = sql => String(sql).replace(/\s+/g, ' ').trim();
const draftSale = { id: 1184, sale_number: 'OS-20261106-002', status: 'draft', patient_name: 'Pasien', total: 260000 };
const item = (obatId, quantity) => ({ id: obatId * 100 + quantity, sale_id: 1184, obat_id: obatId, obat_name: `Obat ${obatId}`, quantity });

function app() {
    const instance = express();
    instance.use(express.json());
    instance.use('/api/obat-sales', obatSalesRouter);
    return instance;
}

function setup({ sale = draftSale, items, deducted = [], stock = { 103: 500, 7: 500 } }) {
    const connection = {
        beginTransaction: jest.fn().mockResolvedValue(),
        commit: jest.fn().mockResolvedValue(),
        rollback: jest.fn().mockResolvedValue(),
        release: jest.fn(),
        query: jest.fn(async sql => {
            const query = sqlOf(sql);
            if (query.includes('FROM obat_sales WHERE id = ?')) return [[sale]];
            if (query.includes('FROM obat_sale_items WHERE sale_id = ?')) return [items];
            return [{ affectedRows: 1 }];
        })
    };
    db.getConnection.mockResolvedValue(connection);
    db.query.mockImplementation(async sql => {
        const query = sqlOf(sql);
        if (query.includes('FROM stock_movements')) return [deducted];
        if (query.startsWith('SELECT id, name, stock FROM obat')) {
            return [Object.entries(stock).map(([id, value]) => ({ id: Number(id), name: `Obat ${id}`, stock: value }))];
        }
        return [[]];
    });
    InventoryService.deductStockFIFO.mockImplementation(async (obatId, quantity) => ({ success: true, totalCost: quantity * 1000 }));
    return connection;
}

const confirm = () => request(app()).post('/api/obat-sales/1184/confirm').send({ payment_method: 'cash' });

describe('Obat sale confirmation stock integrity', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('locks the sale row inside the transaction before checking it is still a draft', async () => {
        const connection = setup({ items: [item(103, 30)] });

        const res = await confirm();

        expect(res.status).toBe(200);
        const firstQuery = sqlOf(connection.query.mock.calls[0][0]);
        expect(firstQuery).toMatch(/FROM obat_sales WHERE id = \? FOR UPDATE$/);
        expect(connection.beginTransaction.mock.invocationCallOrder[0])
            .toBeLessThan(connection.query.mock.invocationCallOrder[0]);
        expect(connection.commit).toHaveBeenCalledTimes(1);
        expect(connection.release).toHaveBeenCalledTimes(1);
    });

    test('a second confirmation of a sale that is no longer draft deducts nothing and releases the lock', async () => {
        const connection = setup({ sale: { ...draftSale, status: 'paid' }, items: [item(103, 30)] });

        const res = await confirm();

        expect(res.status).toBe(400);
        expect(InventoryService.deductStockFIFO).not.toHaveBeenCalled();
        expect(connection.rollback).toHaveBeenCalled();
        expect(connection.release).toHaveBeenCalledTimes(1);
    });

    test('a shortage on any line is reported before any stock is deducted', async () => {
        const connection = setup({ items: [item(103, 30), item(7, 10)], stock: { 103: 500, 7: 4 } });

        const res = await confirm();

        expect(res.status).toBe(400);
        expect(res.body.message).toContain('butuh 10, tersedia 4');
        expect(InventoryService.deductStockFIFO).not.toHaveBeenCalled();
        expect(connection.commit).not.toHaveBeenCalled();
    });

    test('retrying after a halfway failure deducts only what is still missing', async () => {
        const connection = setup({
            items: [item(103, 30), item(7, 10)],
            deducted: [{ obat_id: 103, deducted_qty: '30', deducted_cost: '177750.00' }]
        });

        const res = await confirm();

        expect(res.status).toBe(200);
        expect(InventoryService.deductStockFIFO).toHaveBeenCalledTimes(1);
        expect(InventoryService.deductStockFIFO).toHaveBeenCalledWith(7, 10, 'obat_sale', 1184, 'Urfianita');
        const saleUpdate = connection.query.mock.calls.find(([sql]) => sqlOf(sql).startsWith('UPDATE obat_sales'));
        // cost_total keeps the cost of the deduction made by the earlier attempt
        expect(saleUpdate[1][3]).toBe(177750 + 10000);
    });

    test('the same obat on two lines is deducted once for the total', async () => {
        setup({ items: [item(103, 15), item(103, 15)] });

        const res = await confirm();

        expect(res.status).toBe(200);
        expect(InventoryService.deductStockFIFO).toHaveBeenCalledTimes(1);
        expect(InventoryService.deductStockFIFO).toHaveBeenCalledWith(103, 30, 'obat_sale', 1184, 'Urfianita');
    });

    test('test sales still skip stock deduction', async () => {
        setup({ sale: { ...draftSale, patient_name: 'tes' }, items: [item(103, 30)] });

        const res = await confirm();

        expect(res.status).toBe(200);
        expect(InventoryService.deductStockFIFO).not.toHaveBeenCalled();
    });
});

const request = require('supertest');
const express = require('express');

jest.mock('../../middleware/auth', () => {
    const pass = (req, res, next) => next();
    const factory = () => pass;
    return {
        verifyToken: (req, res, next) => {
            req.user = { id: 'U1', name: 'Staf Uji' };
            next();
        },
        requireMenuAccess: factory,
        requireMenuAccessOrAccountPermission: factory,
        requirePermission: factory,
        requireSuperadmin: pass,
        requireSuperadminOrAccountPermission: factory,
        requireRoles: factory
    };
});

jest.mock('../../middleware/validation', () => ({
    validateObat: [(req, res, next) => next()],
    validateObatUpdate: [(req, res, next) => next()]
}));

jest.mock('../../db', () => ({ query: jest.fn(), getConnection: jest.fn() }));
jest.mock('../../utils/cache', () => ({
    get: jest.fn(),
    set: jest.fn(),
    delPattern: jest.fn(),
    getOrSet: jest.fn()
}));
jest.mock('../../services/StockAdjustmentRequestService', () => ({
    createAdjustmentRequest: jest.fn(),
    actorFromRequest: jest.requireActual('../../services/StockAdjustmentRequestService').actorFromRequest
}));

const db = require('../../db');
const { createAdjustmentRequest } = require('../../services/StockAdjustmentRequestService');

function buildApp() {
    const app = express();
    app.use(express.json());
    app.use('/', require('../../routes/obat'));
    app.use('/api/v1', require('../../routes/v1/obat'));
    app.use('/api/inventory', require('../../routes/inventory'));
    return app;
}

describe('direct stock edit paths are closed', () => {
    let app;
    beforeEach(() => {
        jest.clearAllMocks();
        app = buildApp();
    });

    const updateCalls = () => db.query.mock.calls.filter(([sql]) => /^\s*UPDATE obat/.test(sql));

    test('different stock on PUT is rejected with 409 and nothing is written', async () => {
        db.query.mockImplementation(async (sql) => (/^\s*SELECT/.test(sql) ? [[{ stock: 10 }]] : [{ affectedRows: 1 }]));
        const res = await request(app).put('/api/obat/7').send({ name: 'A', category: 'Obat', price: 1, stock: 3 });
        expect(res.status).toBe(409);
        expect(res.body.code).toBe('STOCK_EDIT_NOT_ALLOWED');
        expect(updateCalls()).toHaveLength(0);
    });

    test('stale cached form stock is rejected with a reload hint', async () => {
        db.query.mockImplementation(async (sql) => (/^\s*SELECT/.test(sql) ? [[{ stock: 10 }]] : [{ affectedRows: 1 }]));
        const res = await request(app).put('/api/obat/7').send({ name: 'A', category: 'Obat', price: 1, stock: 9 });
        expect(res.status).toBe(409);
        expect(res.body.message).toMatch(/muat ulang/);
        expect(updateCalls()).toHaveLength(0);
    });

    test('PUT without stock or with equal stock saves and the UPDATE has no stock column', async () => {
        db.query.mockImplementation(async (sql) => (/^\s*SELECT/.test(sql) ? [[{ stock: 10 }]] : [{ affectedRows: 1 }]));
        const base = { name: 'A', category: 'Obat', price: 1, unit: 'tablet', min_stock: 5, is_active: 1 };
        const r1 = await request(app).put('/api/obat/7').send(base);
        const r2 = await request(app).put('/api/obat/7').send({ ...base, stock: 10 });
        expect(r1.status).toBe(200);
        expect(r2.status).toBe(200);
        const updates = updateCalls();
        expect(updates).toHaveLength(2);
        updates.forEach(([sql]) => expect(sql).not.toMatch(/\bstock\s*=/));
    });

    test('POST always inserts stock 0', async () => {
        db.query.mockResolvedValue([{ insertId: 11 }]);
        const res = await request(app)
            .post('/api/obat')
            .send({ code: 'X', name: 'A', category: 'Obat', price: 1, stock: 50 });
        expect(res.status).toBe(201);
        const [sql, params] = db.query.mock.calls.find(([s]) => /^\s*INSERT INTO obat/.test(s));
        const cols = sql.match(/\(([^)]*)\)\s*VALUES/)[1].split(',').map((c) => c.trim());
        expect(params[cols.indexOf('stock')]).toBe(0);
    });

    test('PATCH stock endpoints are gone', async () => {
        const r1 = await request(app).patch('/api/obat/7/stock').send({ adjustment: 5 });
        const r2 = await request(app).patch('/api/v1/obat/7/stock').send({ quantity: 5 });
        [r1, r2].forEach((r) => {
            expect(r.status).toBe(410);
            expect(r.body.code).toBe('STOCK_ENDPOINT_REMOVED');
        });
        expect(db.query).not.toHaveBeenCalled();
    });

    test('manual FIFO deduct endpoint is gone', async () => {
        const res = await request(app).post('/api/inventory/deduct').send({ obat_id: 7, quantity: 1 });
        expect(res.status).toBe(410);
        expect(res.body.code).toBe('STOCK_ENDPOINT_REMOVED');
    });

    test('adjust creates a pending request instead of changing stock', async () => {
        createAdjustmentRequest.mockResolvedValue({ id: 5, status: 'pending' });
        const body = { obat_id: 7, adjustment: -2, reason: 'rusak' };
        const res = await request(app).post('/api/inventory/adjust').send(body);
        expect(res.status).toBe(201);
        expect(res.body.data).toEqual({ id: 5, status: 'pending' });
        expect(createAdjustmentRequest).toHaveBeenCalledWith(body, { id: 'U1', name: 'Staf Uji' });
    });

    test('adjust maps validation errors', async () => {
        createAdjustmentRequest.mockRejectedValue(Object.assign(new Error('Obat harus dipilih'), { statusCode: 400 }));
        const res = await request(app).post('/api/inventory/adjust').send({});
        expect(res.status).toBe(400);
        expect(res.body.message).toBe('Obat harus dipilih');
    });
});

describe('ObatService no longer writes stock', () => {
    function load() {
        let svc;
        const dbMock = {
            findById: jest.fn(async () => ({ id: 7, stock: 10 })),
            updateById: jest.fn(async () => 1),
            insert: jest.fn(async () => ({ insertId: 9 })),
            exists: jest.fn(async () => false)
        };
        const cacheMock = {
            keys: { obat: (id) => 'obat:' + id },
            getOrSet: jest.fn(async () => ({ id: 7, stock: 999 })),
            delPattern: jest.fn()
        };
        jest.isolateModules(() => {
            jest.doMock('../../utils/database', () => dbMock);
            jest.doMock('../../utils/cache', () => cacheMock);
            svc = require('../../services/ObatService');
        });
        return { svc, dbMock, cacheMock };
    }

    test('updateObat rejects a differing stock with 409', async () => {
        const { svc } = load();
        await expect(svc.updateObat(7, { name: 'A', stock: 3 })).rejects.toMatchObject({ statusCode: 409 });
    });

    test('updateObat reads stock from findById, not the cache', async () => {
        const { svc, dbMock, cacheMock } = load();
        await expect(svc.updateObat(7, { name: 'A', stock: 10 })).resolves.not.toThrow();
        expect(dbMock.findById).toHaveBeenCalledWith('obat', 7);
        expect(cacheMock.getOrSet).not.toHaveBeenCalled();
    });

    test('updateObat update object has no stock key', async () => {
        const { svc, dbMock } = load();
        await svc.updateObat(7, { name: 'A' });
        const data = dbMock.updateById.mock.calls[0][2];
        expect(Object.keys(data)).not.toContain('stock');
    });

    test('createObat inserts stock 0', async () => {
        const { svc, dbMock } = load();
        await svc.createObat({ code: 'X', name: 'A', category: 'Obat', price: 1, stock: 50 });
        expect(dbMock.insert.mock.calls[0][1].stock).toBe(0);
    });

    test('stock mutators are removed', () => {
        const { svc } = load();
        expect(typeof svc.updateStock).toBe('undefined');
        expect(typeof svc.deductStock).toBe('undefined');
        expect(typeof svc.addStock).toBe('undefined');
    });
});

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

jest.mock('../../db', () => ({ query: jest.fn(), getConnection: jest.fn(), deleteById: jest.fn() }));
jest.mock('../../utils/cache', () => ({
    get: jest.fn(),
    set: jest.fn(),
    delPattern: jest.fn(),
    getOrSet: jest.fn()
}));

const db = require('../../db');
const ObatService = require('../../services/ObatService');

function buildApp() {
    const app = express();
    app.use(express.json());
    app.use('/', require('../../routes/obat'));
    app.use('/api/v1', require('../../routes/v1/obat'));
    return app;
}

const noHistory = { movement_count: 0, batch_count: 0, sale_item_count: 0, adjustment_request_count: 0 };

function mockObat(obat, history) {
    db.query.mockImplementation(async (sql) => {
        if (/FROM obat WHERE id = \?/.test(sql) && /^\s*SELECT/.test(sql)) return [[obat]];
        if (/movement_count/.test(sql)) return [[history]];
        if (/^\s*DELETE FROM obat/.test(sql)) return [{ affectedRows: 1 }];
        throw new Error('Unexpected SQL: ' + sql);
    });
}

const deleteCalls = () => db.query.mock.calls.filter(([sql]) => /DELETE FROM obat/.test(sql));
const historyCalls = () => db.query.mock.calls.filter(([sql]) => /movement_count/.test(sql));

describe('obat delete guards', () => {
    let app;
    beforeEach(() => {
        jest.clearAllMocks();
        app = buildApp();
    });

    test('permanent delete refuses an obat that still has stock', async () => {
        mockObat({ id: 7, name: 'A', is_active: 0, stock: 3 }, noHistory);
        const res = await request(app).delete('/api/obat/7/permanent');
        expect(res.status).toBe(409);
        expect(res.body.code).toBe('OBAT_HAS_STOCK');
        expect(deleteCalls()).toHaveLength(0);
        expect(historyCalls()).toHaveLength(0);
    });

    test('permanent delete refuses an obat with adjustment requests', async () => {
        mockObat({ id: 7, name: 'A', is_active: 0, stock: 0 }, { ...noHistory, adjustment_request_count: 1 });
        const res = await request(app).delete('/api/obat/7/permanent');
        expect(res.status).toBe(409);
        expect(res.body.code).toBe('OBAT_HAS_ADJUSTMENT_REQUESTS');
        expect(deleteCalls()).toHaveLength(0);
    });

    test('permanent delete still works for an inactive obat with zero stock and no history', async () => {
        mockObat({ id: 7, name: 'A', is_active: 0, stock: 0 }, noHistory);
        const res = await request(app).delete('/api/obat/7/permanent');
        expect(res.status).toBe(200);
        expect(deleteCalls()).toHaveLength(1);
        expect(deleteCalls()[0][1]).toEqual(['7']);
    });

    test('v1 delete is closed', async () => {
        const res = await request(app).delete('/api/v1/obat/7');
        expect(res.status).toBe(410);
        expect(res.body.code).toBe('ENDPOINT_REMOVED');
        expect(db.query).not.toHaveBeenCalled();
        expect(typeof ObatService.deleteObat).toBe('undefined');
    });
});

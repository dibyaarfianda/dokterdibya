const { createFakeConnection } = require('../helpers/fakeConnection');

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

const Service = require('../../services/StockAdjustmentRequestService');

const ACTOR = { id: 'U1', name: 'Staf Uji' };
const OK = [{ affectedRows: 1, insertId: 99 }];

const base = { obat_id: 7, quantity_delta: -3, reason_category: 'rusak', reason_note: 'pecah botol' };

function pendingRequest(overrides = {}) {
    return {
        id: 41, obat_id: 7, batch_id: null, quantity_delta: -3,
        reason_category: 'rusak', status: 'pending', ...overrides
    };
}

function approveHandlers({ request, obat, batches, extra = [] }) {
    return [
        [/FROM stock_adjustment_requests WHERE id = \? FOR UPDATE/, [[request]]],
        [/FROM obat WHERE id = \? FOR UPDATE/, obat === null ? [[]] : [[obat]]],
        [/FROM obat_batches[\s\S]*FOR UPDATE/, [batches]],
        [/SELECT cost_price[\s\S]*FROM obat_batches/, [[]]],
        [/INSERT INTO obat_batches/, [{ affectedRows: 1, insertId: 55 }]],
        [/UPDATE obat_batches/, OK],
        [/INSERT INTO stock_movements/, OK],
        [/UPDATE obat SET stock = stock \+ \?/, OK],
        [/UPDATE stock_adjustment_requests/, OK],
        ...extra
    ];
}

function expectError(promise, statusCode, message) {
    return promise.then(
        () => { throw new Error('expected rejection'); },
        (error) => {
            expect(error.statusCode).toBe(statusCode);
            if (message) expect(error.message).toBe(message);
        }
    );
}

describe('normalizeAdjustmentInput', () => {
    test('normalizes a valid manual request', () => {
        expect(Service.normalizeAdjustmentInput({
            obat_id: '7', quantity_delta: '-3', reason_category: 'rusak', reason_note: ' pecah botol '
        })).toEqual({ obatId: 7, batchId: null, quantityDelta: -3, reasonCategory: 'rusak', reasonNote: 'pecah botol' });
    });

    test('rejects malformed quantity_delta', () => {
        for (const bad of ['2.5', '1e2', ' 3', '-0', 0, true, '', null, 'abc', 100001]) {
            let thrown;
            try {
                Service.normalizeAdjustmentInput({ ...base, quantity_delta: bad });
            } catch (e) { thrown = e; }
            expect(thrown && thrown.statusCode).toBe(400);
        }
    });

    test('rejects opname and unknown categories, batch on increases, expiry without batch', () => {
        const run = (patch) => {
            try { Service.normalizeAdjustmentInput({ ...base, ...patch }); } catch (e) { return e; }
            return null;
        };
        let e = run({ reason_category: 'opname' });
        expect([e.statusCode, e.message]).toEqual([400, 'Kategori alasan tidak valid']);
        e = run({ reason_category: 'ngawur' });
        expect([e.statusCode, e.message]).toEqual([400, 'Kategori alasan tidak valid']);
        e = run({ quantity_delta: 2, batch_id: 3 });
        expect([e.statusCode, e.message]).toEqual([400, 'Batch hanya bisa dipilih untuk pengurangan stok']);
        e = run({ reason_category: 'kedaluwarsa' });
        expect([e.statusCode, e.message]).toEqual([400, 'Pilih batch untuk obat kedaluwarsa']);
        e = run({ obat_id: 0 });
        expect([e.statusCode, e.message]).toEqual([400, 'Obat harus dipilih']);
        e = run({ reason_note: '   ' });
        expect([e.statusCode, e.message]).toEqual([400, 'Catatan alasan wajib diisi (maksimal 1000 karakter)']);
        e = run({ quantity_delta: 100001 });
        expect([e.statusCode, e.message]).toEqual([400, 'Jumlah penyesuaian terlalu besar']);
    });
});

describe('createAdjustmentRequest', () => {
    test('create stores a pending request without touching stock', async () => {
        const { connection, calls } = createFakeConnection([
            [/SELECT id, stock FROM obat WHERE id = \?/, [[{ id: 7, stock: 10 }]]],
            [/INSERT INTO stock_adjustment_requests/, [{ insertId: 41 }]]
        ]);
        mockConnection = connection;
        const result = await Service.createAdjustmentRequest(base, ACTOR);
        expect(result).toEqual({ id: 41, status: 'pending' });
        const insert = calls.find((c) => /INSERT INTO stock_adjustment_requests/.test(c.sql));
        expect(insert.params).toEqual(expect.arrayContaining([10, 'U1', 'Staf Uji']));
        expect(calls.some((c) => /UPDATE obat|INSERT INTO stock_movements/.test(c.sql))).toBe(false);
    });
});

describe('approveAdjustmentRequest', () => {
    test('approve applies FIFO deductions in lock order and records the decision', async () => {
        const { connection, calls } = createFakeConnection(approveHandlers({
            request: pendingRequest(),
            obat: { id: 7, stock: 10, default_cost_price: 1000 },
            batches: [
                { id: 1, quantity_remaining: 2, cost_price: 1000 },
                { id: 2, quantity_remaining: 5, cost_price: 1100 }
            ]
        }));
        mockConnection = connection;
        const result = await Service.approveAdjustmentRequest(41, ACTOR, ' ok ');

        const idx = (re) => calls.findIndex((c) => re.test(c.sql));
        const reqLock = idx(/FROM stock_adjustment_requests WHERE id = \? FOR UPDATE/);
        const obatLock = idx(/FROM obat WHERE id = \? FOR UPDATE/);
        const batchLock = idx(/FROM obat_batches[\s\S]*FOR UPDATE/);
        expect(reqLock).toBeGreaterThanOrEqual(0);
        expect(obatLock).toBeGreaterThan(reqLock);
        expect(batchLock).toBeGreaterThan(obatLock);

        const batchUpdates = calls.filter((c) => /UPDATE obat_batches/.test(c.sql)).map((c) => c.params);
        expect(batchUpdates).toEqual([[2, 1, 2], [1, 2, 1]]);

        const movements = calls.filter((c) => /INSERT INTO stock_movements/.test(c.sql));
        expect(movements).toHaveLength(2);
        expect(movements.map((m) => m.params[2])).toEqual([-2, -1]);
        for (const m of movements) {
            expect(m.sql).toContain("'adjustment'");
            expect(m.sql).toContain("'stock_adjustment_request'");
            expect(m.params).toContain(41);
        }

        const stockUpdate = calls.find((c) => /UPDATE obat SET stock = stock \+ \?/.test(c.sql));
        expect(stockUpdate.params[0]).toBe(-3);

        const decision = calls.find((c) => /UPDATE stock_adjustment_requests/.test(c.sql));
        expect(decision.sql).toContain("'approved'");
        expect(decision.params).toContain(10);
        const json = decision.params.find((p) => typeof p === 'string' && p.startsWith('['));
        expect(Array.isArray(JSON.parse(json))).toBe(true);

        expect(connection.commit).toHaveBeenCalledTimes(1);
        expect(connection.release).toHaveBeenCalled();
        expect(result).toMatchObject({ id: 41, status: 'approved', stockAfter: 7 });
    });

    test('approve records the legacy remainder', async () => {
        const { connection, calls } = createFakeConnection(approveHandlers({
            request: pendingRequest({ quantity_delta: -6 }),
            obat: { id: 7, stock: 10, default_cost_price: 1000 },
            batches: [{ id: 1, quantity_remaining: 2, cost_price: 1000 }]
        }));
        mockConnection = connection;
        const result = await Service.approveAdjustmentRequest(41, ACTOR, null);
        const movements = calls.filter((c) => /INSERT INTO stock_movements/.test(c.sql));
        const legacy = movements.filter((c) => c.params[1] === null);
        expect(legacy).toHaveLength(1);
        expect(legacy[0].params[2]).toBe(-4);
        expect(result.status).toBe('approved');
    });

    test('approve refuses to drive stock below zero', async () => {
        const { connection, calls } = createFakeConnection(approveHandlers({
            request: pendingRequest({ quantity_delta: -5 }),
            obat: { id: 7, stock: 2, default_cost_price: 1000 },
            batches: []
        }));
        mockConnection = connection;
        await expectError(Service.approveAdjustmentRequest(41, ACTOR, null), 422, 'Stok tidak cukup untuk penyesuaian ini');
        expect(connection.rollback).toHaveBeenCalled();
        expect(calls.some((c) => /UPDATE obat_batches|UPDATE obat SET|INSERT INTO stock_movements|UPDATE stock_adjustment_requests/.test(c.sql))).toBe(false);
    });

    test('approve creates a batch for increases', async () => {
        const { connection, calls } = createFakeConnection(approveHandlers({
            request: pendingRequest({ quantity_delta: 4, reason_category: 'lainnya' }),
            obat: { id: 7, stock: 10, default_cost_price: 1000 },
            batches: []
        }));
        mockConnection = connection;
        await Service.approveAdjustmentRequest(41, ACTOR, null);
        const batchInsert = calls.find((c) => /INSERT INTO obat_batches/.test(c.sql));
        expect(batchInsert.params).toEqual(expect.arrayContaining([4, 'Penyesuaian #41']));
        const movement = calls.find((c) => /INSERT INTO stock_movements/.test(c.sql));
        expect(movement.params[1]).toBe(55);
        expect(movement.params[2]).toBe(4);
    });

    test('approve on a decided request returns 409', async () => {
        const { connection, calls } = createFakeConnection(approveHandlers({
            request: pendingRequest({ status: 'approved' }),
            obat: { id: 7, stock: 10, default_cost_price: 1000 },
            batches: []
        }));
        mockConnection = connection;
        await expectError(Service.approveAdjustmentRequest(41, ACTOR, null), 409, 'Pengajuan sudah diputuskan');
        expect(connection.rollback).toHaveBeenCalled();
        expect(calls.some((c) => /FROM obat WHERE id = \? FOR UPDATE/.test(c.sql))).toBe(false);
    });

    test('approve on a deleted obat returns 404 and keeps the request pending', async () => {
        const { connection, calls } = createFakeConnection(approveHandlers({
            request: pendingRequest(),
            obat: null,
            batches: []
        }));
        mockConnection = connection;
        await expectError(Service.approveAdjustmentRequest(41, ACTOR, null), 404, 'Obat tidak ditemukan');
        expect(calls.some((c) => /UPDATE stock_adjustment_requests/.test(c.sql))).toBe(false);
        expect(connection.rollback).toHaveBeenCalled();
    });
});

describe('rejectAdjustmentRequest', () => {
    test('reject requires a note and never writes stock', async () => {
        const empty = createFakeConnection([]);
        mockConnection = empty.connection;
        await expectError(Service.rejectAdjustmentRequest(41, ACTOR, '   '), 400, 'Catatan penolakan wajib diisi');
        expect(empty.calls.length).toBe(0);

        const { connection, calls } = createFakeConnection([
            [/FROM stock_adjustment_requests WHERE id = \? FOR UPDATE/, [[pendingRequest()]]],
            [/SELECT stock FROM obat WHERE id = \?/, [[{ stock: 10 }]]],
            [/UPDATE stock_adjustment_requests/, OK]
        ]);
        mockConnection = connection;
        const result = await Service.rejectAdjustmentRequest(41, ACTOR, 'tidak sesuai');
        expect(result).toEqual({ id: 41, status: 'rejected' });
        const update = calls.find((c) => /UPDATE stock_adjustment_requests/.test(c.sql));
        expect(update.sql).toContain("'rejected'");
        expect(update.params).toContain(10);
        expect(calls.some((c) => /UPDATE obat|stock_movements|UPDATE obat_batches/.test(c.sql))).toBe(false);
        expect(connection.commit).toHaveBeenCalledTimes(1);
    });
});

describe('views and listing', () => {
    test('request view computes value and staleness', () => {
        const row = { quantity_delta: -3, default_cost_price: 0, latest_batch_cost: 1100, status: 'pending', age_days: 8 };
        expect(Service.toRequestView(row)).toMatchObject({ value: -3300, is_stale: true });
        expect(Service.toRequestView({ ...row, age_days: 7 }).is_stale).toBe(false);
    });

    test('list rejects unknown status', async () => {
        await expectError(Service.listAdjustmentRequests({ status: 'bogus' }), 400, 'Status tidak valid');
    });

    test('list keeps requests whose obat was deleted', async () => {
        const { connection, calls } = createFakeConnection([
            [/SELECT sar\.\*/, [[]]],
            [/COUNT\(\*\) AS total/, [[{ total: 0 }]]]
        ]);
        mockConnection = connection;
        await Service.listAdjustmentRequests({ status: 'all' });
        const listSql = calls.find((c) => /SELECT sar\.\*/.test(c.sql)).sql;
        const countSql = calls.find((c) => /COUNT\(\*\) AS total/.test(c.sql)).sql;
        expect(listSql).toMatch(/LEFT JOIN obat o ON o\.id = sar\.obat_id/);
        expect(countSql).toMatch(/LEFT JOIN obat o ON o\.id = sar\.obat_id/);
    });
});

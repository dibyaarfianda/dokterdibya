'use strict';

// Tahap 2: staff page "Pembayaran di Muka" API — orders, saldo, ledger, refunds, estimate editor.
process.env.JWT_SECRET ||= 'staff-prepay-test';

const express = require('express');
const request = require('supertest');
const { ROLE_IDS } = require('../../constants/roles');

jest.mock('../../middleware/auth', () => ({
    ...jest.requireActual('../../middleware/auth'),
    verifyToken: (req, res, next) => {
        req.user = JSON.parse(req.headers['x-test-user'] || 'null');
        const permissions = JSON.parse(req.headers['x-test-permissions'] || 'null');
        if (permissions) req.accountAccess = { isActive: true, mode: 'account', permissions: new Set(permissions) };
        return req.user ? next() : res.status(401).end();
    }
}));
jest.mock('../../services/StaffPrepayService', () => ({
    ...jest.requireActual('../../services/StaffPrepayService'),
    listOrders: jest.fn(async () => []),
    listBalances: jest.fn(async () => []),
    getPatientLedger: jest.fn(async () => ({ patient: { id: 'P1', name: 'Pasien' }, balances: { live: [], sandbox: [] }, entries: [] })),
    createRefund: jest.fn(async () => ({ id: 3, amount_idr: 20000, already_saved: false })),
    getEstimateMapping: jest.fn(async () => ({ mapping: {}, categories: [], tindakan: [] })),
    saveEstimateMapping: jest.fn(async () => ({ mapping: {}, categories: [] }))
}));

const service = require('../../services/StaffPrepayService');
const { PERMISSION_CATALOG } = require('../../config/accessControlCatalog');
const { getDelegableCatalog } = require('../../services/AccessControlManagementService');
const { resolveRouteAccess } = require('../../config/accessControlRegistry');

const STAFF = { id: 'S1', name: 'Kasir', role: 'admin', role_id: ROLE_IDS.ADMIN };
const DOCTOR = { id: 'D1', name: 'Dokter', role: 'dokter', role_id: ROLE_IDS.DOKTER };

function buildApp() {
    const app = express();
    app.use(express.json());
    app.use('/api/staff-prepay', require('../../routes/staff-prepay'));
    return app;
}
const as = (user, permissions) => ({
    'x-test-user': JSON.stringify(user),
    ...(permissions ? { 'x-test-permissions': JSON.stringify(permissions) } : {})
});

describe('access control', () => {
    test('the registry maps every staff-prepay route to the intended permission', () => {
        const base = { sourceFile: 'staff-prepay', fileMiddleware: '', handlerPrefix: 'verifyToken' };
        const expectPermission = (method, routePath, permission) =>
            expect(resolveRouteAccess({ ...base, method, routePath })).toEqual(expect.objectContaining({ permission }));
        expectPermission('GET', '/orders', 'billing.view');
        expectPermission('GET', '/balances', 'billing.view');
        expectPermission('GET', '/patients/:patientId/ledger', 'billing.view');
        expectPermission('POST', '/refunds', 'billing.reset');
        expectPermission('GET', '/estimate-mapping', 'checkup_prepay.manage_estimate');
        expectPermission('PUT', '/estimate-mapping', 'checkup_prepay.manage_estimate');
    });

    test('the estimate permission is protected and never delegable', () => {
        const entry = PERMISSION_CATALOG.find(item => item.name === 'checkup_prepay.manage_estimate');
        expect(entry).toBeDefined();
        expect(entry.protected).toBe(true);
        expect(new Set(getDelegableCatalog().map(item => item.name)).has('checkup_prepay.manage_estimate')).toBe(false);
    });
});

describe('HTTP API', () => {
    const app = buildApp();
    beforeEach(() => jest.clearAllMocks());

    test('orders need billing.view and default to live paid orders', async () => {
        expect((await request(app).get('/api/staff-prepay/orders').set(as(STAFF, []))).status).toBe(403);
        const res = await request(app).get('/api/staff-prepay/orders').set(as(STAFF, ['billing.view']));
        expect(res.status).toBe(200);
        expect(service.listOrders).toHaveBeenCalledWith({ status: 'paid', mode: 'live', from: null, to: null });
    });

    test('bad filters are rejected before the service runs', async () => {
        const res = await request(app).get('/api/staff-prepay/orders?status=hacked&from=2026-13-40').set(as(DOCTOR));
        expect(res.status).toBe(400);
        expect(service.listOrders).not.toHaveBeenCalled();
        const ledger = await request(app).get('/api/staff-prepay/patients/P1%27%20OR%201=1/ledger').set(as(DOCTOR));
        expect(ledger.status).toBe(400);
        expect(service.getPatientLedger).not.toHaveBeenCalled();
    });

    test('refunds need billing.reset and pass the actor', async () => {
        const body = { patient_id: 'P1', amount_idr: 20000, method: 'tunai', reason: 'Batal periksa', request_key: 'refund-key-000000001' };
        expect((await request(app).post('/api/staff-prepay/refunds').set(as(STAFF, ['billing.view'])).send(body)).status).toBe(403);
        const res = await request(app).post('/api/staff-prepay/refunds').set(as(STAFF, ['billing.view', 'billing.reset'])).send(body);
        expect(res.status).toBe(200);
        expect(service.createRefund).toHaveBeenCalledWith(expect.objectContaining({
            patientId: 'P1', amountIdr: 20000, method: 'tunai', reason: 'Batal periksa', requestKey: 'refund-key-000000001',
            actor: { id: 'S1', name: 'Kasir' }
        }));
    });

    test('the estimate editor is for the doctor only', async () => {
        const staffAll = as(STAFF, ['billing.view', 'billing.reset', 'checkup_prepay.manage_estimate']);
        expect((await request(app).get('/api/staff-prepay/estimate-mapping').set(staffAll)).status).toBe(403);
        expect((await request(app).put('/api/staff-prepay/estimate-mapping').set(staffAll).send({ mapping: {} })).status).toBe(403);
        expect((await request(app).get('/api/staff-prepay/estimate-mapping').set(as(DOCTOR))).status).toBe(200);
    });

    test('service errors keep their status and message', async () => {
        service.createRefund.mockRejectedValueOnce(Object.assign(new Error('Nominal refund melebihi saldo live pasien.'), { statusCode: 400 }));
        const res = await request(app).post('/api/staff-prepay/refunds').set(as(DOCTOR))
            .send({ patient_id: 'P1', amount_idr: 999999, method: 'tunai', reason: 'x', request_key: 'refund-key-000000002' });
        expect(res.status).toBe(400);
        expect(res.body).toEqual({ success: false, message: 'Nominal refund melebihi saldo live pasien.' });
    });
});

describe('StaffPrepayService', () => {
    const real = jest.requireActual('../../services/StaffPrepayService');
    const sqlOf = sql => String(sql).replace(/\s+/g, ' ').trim();

    test('orders are prepay only and fall back to the patient id for a missing name', async () => {
        const statements = [];
        const db = {
            query: jest.fn(async (sql, params) => {
                statements.push({ sql: sqlOf(sql), params });
                if (sqlOf(sql).includes('FROM payment_orders')) {
                    return [[{ order_ref: 'DPK-1', patient_id: 'P9', product_code: 'obstetri', amount_idr: 255000, fee_idr: 3000,
                        payment_method: 'va_bni', va_number: '988', status: 'paid', gateway_mode: 'live' }]];
                }
                return [[]];
            })
        };
        const rows = await real.listOrders({ status: 'paid', mode: 'live', from: '2026-11-01', to: '2026-11-30' }, { db });
        expect(statements[0].sql).toContain("order_type = 'checkup_prepay'");
        expect(statements[0].params).toEqual(expect.arrayContaining(['paid', 'live', '2026-11-01', '2026-11-30']));
        expect(rows[0]).toMatchObject({ patient_name: 'P9', product_label: 'Kehamilan (Obstetri)', va_number: '988', fee_idr: 3000 });
    });

    function refundHarness({ balances = [{ category: 'obstetri', amount_idr: 255000, created_at: '2026-11-20 07:48:00' }], saved = null } = {}) {
        const statements = [];
        const connection = {
            beginTransaction: jest.fn(), commit: jest.fn(), rollback: jest.fn(), release: jest.fn(),
            query: jest.fn(async (sql, params) => {
                const query = sqlOf(sql);
                statements.push({ query, params });
                if (query.startsWith('SELECT id, amount_idr, request_hash FROM patient_credit_refunds')) return [saved ? [saved] : []];
                if (query.includes('FROM patient_credit_ledger') && query.includes('FOR UPDATE')) return [balances];
                if (query.startsWith('INSERT INTO patient_credit_refunds')) return [{ insertId: 3 }];
                if (query.startsWith('INSERT INTO patient_credit_ledger')) return [{ affectedRows: 1 }];
                return [[]];
            })
        };
        return { db: { getConnection: jest.fn(async () => connection) }, connection, statements };
    }
    const refund = { patientId: 'P1', amountIdr: 20000, method: 'tunai', reason: 'Batal periksa', requestKey: 'refund-key-000000001', actor: { id: 'D1', name: 'Dokter' } };

    test('a refund locks the live saldo, saves the refund and its ledger rows', async () => {
        const h = refundHarness();
        const result = await real.createRefund(refund, { db: h.db });
        expect(result).toEqual({ id: 3, amount_idr: 20000, already_saved: false });
        expect(h.connection.commit).toHaveBeenCalled();
        const ledger = h.statements.find(entry => entry.query.startsWith('INSERT INTO patient_credit_ledger'));
        expect(ledger.params).toEqual(expect.arrayContaining(['P1', 'obstetri', 'refund', -20000, 'credit_refund', '3:obstetri']));
    });

    test('a refund larger than the live saldo is refused', async () => {
        const h = refundHarness();
        await expect(real.createRefund({ ...refund, amountIdr: 300000 }, { db: h.db })).rejects.toMatchObject({ statusCode: 400 });
        expect(h.connection.rollback).toHaveBeenCalled();
        expect(h.statements.some(entry => entry.query.startsWith('INSERT'))).toBe(false);
    });

    test('a retry with the same key returns the saved refund; a different request with it is refused', async () => {
        const hash = real.refundRequestHash({ patient_id: 'P1', amount_idr: 20000, method: 'tunai', reason: 'Batal periksa' });
        const same = refundHarness({ saved: { id: 3, amount_idr: 20000, request_hash: hash } });
        await expect(real.createRefund(refund, { db: same.db })).resolves.toEqual({ id: 3, amount_idr: 20000, already_saved: true });
        const other = refundHarness({ saved: { id: 3, amount_idr: 20000, request_hash: hash } });
        await expect(real.createRefund({ ...refund, reason: 'Lain' }, { db: other.db })).rejects.toMatchObject({ statusCode: 409 });
    });

    test('invalid refund input never reaches the database', async () => {
        const h = refundHarness();
        for (const bad of [{ amountIdr: 0 }, { amountIdr: 1.5 }, { method: 'qris' }, { reason: '  ' }, { requestKey: 'short' }, { patientId: '' }]) {
            await expect(real.createRefund({ ...refund, ...bad }, { db: h.db })).rejects.toMatchObject({ statusCode: 400 });
        }
        expect(h.db.getConnection).not.toHaveBeenCalled();
    });

    test('saving a mapping with an inactive tindakan keeps it but marks the product not ready', async () => {
        const { createCheckupEstimateService } = require('../../services/CheckupEstimateService');
        const db = {
            query: jest.fn(async sql => {
                const query = sqlOf(sql);
                if (query.startsWith('INSERT INTO settings')) return [{ affectedRows: 1 }];
                if (query.startsWith('SELECT setting_value')) {
                    return [[{ setting_value: JSON.stringify({ categories: { obstetri: { items: [{ tindakan_id: 40, quantity: 1 }] } } }) }]];
                }
                if (query.includes('FROM tindakan WHERE id IN')) {
                    return [[{ id: 1, code: 'S01', name: 'Admin', category: 'LAYANAN', price: 25000, is_active: 1 },
                        { id: 40, code: 'K40', name: 'Konsultasi', category: 'LAYANAN', price: 150000, is_active: 0 }]];
                }
                return [[]];
            })
        };
        const repository = {
            listPackages: jest.fn(async () => [{ id: 1, code: 'obstetri', name: 'Kehamilan (Obstetri)', description: null, category: 'obstetri', week_min: null, week_max: null, is_active: true, sort_order: 10, items: [{ item_type: 'tindakan', ref_id: 40, quantity: 1, sort_order: 0 }] }])
        };
        const estimates = createCheckupEstimateService({ db, repository });
        const result = await real.saveEstimateMapping({ categories: { obstetri: { items: [{ tindakan_id: 40, quantity: 1 }] } } }, { estimates });
        const obstetri = result.categories.find(entry => entry.code === 'obstetri');
        expect(obstetri.ready).toBe(false);
        expect(obstetri.issues.join(' ')).toContain('nonaktif');
    });
});

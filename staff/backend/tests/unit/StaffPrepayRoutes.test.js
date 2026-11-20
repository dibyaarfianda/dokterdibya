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
    listPackagesForStaff: jest.fn(async () => ({ priced_at: 'now', packages: [] })),
    getCatalog: jest.fn(async () => ({ tindakan: [], obat: [], admin: { id: 1, name: 'Admin', price: 25000 } })),
    savePackage: jest.fn(async () => ({ id: 7, code: 'pkg_7', name: 'Paket' })),
    setPackageActive: jest.fn(async (id, active) => ({ id, is_active: active }))
}));

let mockRefundRequests = null;
jest.mock('../../services/PatientRefundRequestService', () => ({
    ...jest.requireActual('../../services/PatientRefundRequestService'),
    getPatientRefundRequestService: () => mockRefundRequests
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
        expectPermission('GET', '/packages', 'checkup_prepay.manage_estimate');
        expectPermission('GET', '/packages/catalog', 'checkup_prepay.manage_estimate');
        expectPermission('POST', '/packages', 'checkup_prepay.manage_estimate');
        expectPermission('PUT', '/packages/:id', 'checkup_prepay.manage_estimate');
        expectPermission('PATCH', '/packages/:id/active', 'checkup_prepay.manage_estimate');
        expectPermission('GET', '/refund-requests', 'billing.view');
        expectPermission('POST', '/refund-requests/:id/complete', 'billing.reset');
        expectPermission('POST', '/refund-requests/:id/reject', 'billing.reset');
    });

    test('the withdrawal routes are explicit overrides, not inferred from the path words', () => {
        const { ROUTE_PERMISSION_OVERRIDES } = require('../../config/accessControlRegistry');
        expect(ROUTE_PERMISSION_OVERRIDES.get('staff-prepay:GET:/refund-requests')).toBe('billing.view');
        expect(ROUTE_PERMISSION_OVERRIDES.get('staff-prepay:POST:/refund-requests/:id/complete')).toBe('billing.reset');
        expect(ROUTE_PERMISSION_OVERRIDES.get('staff-prepay:POST:/refund-requests/:id/reject')).toBe('billing.reset');
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

    test('the package editor is for the superadmin or doctor only, not a delegated permission', async () => {
        const staffAll = as(STAFF, ['billing.view', 'billing.reset', 'checkup_prepay.manage_estimate']);
        const body = { name: 'Paket', category: 'obstetri', items: [{ item_type: 'tindakan', ref_id: 9, quantity: 1 }] };
        expect((await request(app).post('/api/staff-prepay/packages').set(staffAll).send(body)).status).toBe(403);
        expect((await request(app).put('/api/staff-prepay/packages/7').set(staffAll).send(body)).status).toBe(403);
        expect((await request(app).patch('/api/staff-prepay/packages/7/active').set(staffAll).send({ active: false })).status).toBe(403);
        expect((await request(app).get('/api/staff-prepay/packages').set(staffAll)).status).toBe(403);
        expect((await request(app).get('/api/staff-prepay/packages/catalog').set(staffAll)).status).toBe(403);
        expect(service.savePackage).not.toHaveBeenCalled();

        const superadmin = { id: 'A1', name: 'Admin Super', role: 'admin', role_id: ROLE_IDS.ADMIN, is_superadmin: 1 };
        const bySuperadmin = await request(app).post('/api/staff-prepay/packages').set(as(superadmin)).send(body);
        expect(bySuperadmin.status).toBe(200);
        expect(service.savePackage).toHaveBeenLastCalledWith(body, { id: 'A1', name: 'Admin Super' });
        const byDoctor = await request(app).post('/api/staff-prepay/packages').set(as(DOCTOR)).send(body);
        expect(byDoctor.status).toBe(200);
        expect(byDoctor.body.data).toMatchObject({ id: 7 });
    });

    test('package routes: list, catalog, update by id, activate by id; the old estimate-mapping is gone', async () => {
        expect((await request(app).get('/api/staff-prepay/packages').set(as(DOCTOR))).status).toBe(200);
        expect((await request(app).get('/api/staff-prepay/packages/catalog').set(as(DOCTOR))).body.data.admin).toMatchObject({ id: 1 });
        const body = { name: 'Paket', category: 'obstetri', items: [] };
        const put = await request(app).put('/api/staff-prepay/packages/7').set(as(DOCTOR)).send(body);
        expect(put.status).toBe(200);
        expect(service.savePackage).toHaveBeenLastCalledWith({ ...body, id: 7 }, { id: 'D1', name: 'Dokter' });
        // A body id never turns a create into an update of another package.
        await request(app).post('/api/staff-prepay/packages').set(as(DOCTOR)).send({ ...body, id: 99 });
        expect(service.savePackage).toHaveBeenLastCalledWith(body, { id: 'D1', name: 'Dokter' });
        expect((await request(app).put('/api/staff-prepay/packages/abc').set(as(DOCTOR)).send(body)).status).toBe(404);

        const off = await request(app).patch('/api/staff-prepay/packages/7/active').set(as(DOCTOR)).send({ active: false });
        expect(off.status).toBe(200);
        expect(service.setPackageActive).toHaveBeenLastCalledWith(7, false, { id: 'D1', name: 'Dokter' });

        expect((await request(app).get('/api/staff-prepay/estimate-mapping').set(as(DOCTOR))).status).toBe(404);
        expect((await request(app).put('/api/staff-prepay/estimate-mapping').set(as(DOCTOR)).send({ mapping: {} })).status).toBe(404);
    });

    test('a save the service refuses keeps its 400 message', async () => {
        service.savePackage.mockRejectedValueOnce(Object.assign(new Error('Item 1: konsultasi tidak boleh di paket'), { statusCode: 400 }));
        const res = await request(app).post('/api/staff-prepay/packages').set(as(DOCTOR)).send({ name: 'X' });
        expect(res.status).toBe(400);
        expect(res.body).toEqual({ success: false, message: 'Item 1: konsultasi tidak boleh di paket' });
    });

    describe('withdrawal requests', () => {
        const refundService = () => ({
            listForStaff: jest.fn(async () => []),
            completeRequest: jest.fn(async ({ id }) => ({ id, status: 'done', refund_id: 30 })),
            rejectRequest: jest.fn(async ({ id }) => ({ id, status: 'rejected' }))
        });

        test('the list needs billing.view; only billing.reset or the doctor see full account numbers', async () => {
            mockRefundRequests = refundService();
            expect((await request(app).get('/api/staff-prepay/refund-requests').set(as(STAFF, []))).status).toBe(403);

            const viewOnly = await request(app).get('/api/staff-prepay/refund-requests').set(as(STAFF, ['billing.view']));
            expect(viewOnly.status).toBe(200);
            expect(viewOnly.headers['cache-control']).toMatch(/no-store/);
            expect(mockRefundRequests.listForStaff).toHaveBeenLastCalledWith({ canSeeAccount: false });

            await request(app).get('/api/staff-prepay/refund-requests').set(as(STAFF, ['billing.view', 'billing.reset']));
            expect(mockRefundRequests.listForStaff).toHaveBeenLastCalledWith({ canSeeAccount: true });
            await request(app).get('/api/staff-prepay/refund-requests').set(as(DOCTOR));
            expect(mockRefundRequests.listForStaff).toHaveBeenLastCalledWith({ canSeeAccount: true });
        });

        test('the account number is not in a billing.view-only response', async () => {
            const { createPatientRefundRequestService } = jest.requireActual('../../services/PatientRefundRequestService');
            const row = {
                id: 5, patient_id: 'P1', amount_idr: 200000, bank_name: 'BCA', account_number: '1234567890', account_holder: 'Siti Aminah',
                status: 'pending', request_key: 'req-key-aaaaaaaaaaaa', refund_id: null, decision_note: null, decided_by: null,
                decided_at: null, created_at: '2026-11-21 09:00:00'
            };
            const db = {
                query: jest.fn(async sql => {
                    const query = String(sql).replace(/\s+/g, ' ');
                    if (query.includes("WHERE status = 'pending'")) return [[row]];
                    if (query.includes('FROM patients WHERE id IN')) return [[{ id: 'P1', full_name: 'Ny. Siti Aminah' }]];
                    return [[]];
                })
            };
            mockRefundRequests = createPatientRefundRequestService({ db, staffPrepay: {}, realtime: { broadcast: jest.fn() } });

            const viewOnly = await request(app).get('/api/staff-prepay/refund-requests').set(as(STAFF, ['billing.view']));
            expect(viewOnly.status).toBe(200);
            expect(JSON.stringify(viewOnly.body)).not.toContain('1234567890');
            expect(viewOnly.body.data[0]).toMatchObject({ id: 5, account_number: '•••• 7890', name_differs: false, patient_name: 'Ny. Siti Aminah' });

            const reset = await request(app).get('/api/staff-prepay/refund-requests').set(as(STAFF, ['billing.view', 'billing.reset']));
            expect(reset.body.data[0].account_number).toBe('1234567890');
        });

        test('complete and reject need billing.reset and pass the actor', async () => {
            mockRefundRequests = refundService();
            const viewOnly = as(STAFF, ['billing.view']);
            const cashier = as(STAFF, ['billing.view', 'billing.reset']);
            expect((await request(app).post('/api/staff-prepay/refund-requests/5/complete').set(viewOnly)).status).toBe(403);
            expect((await request(app).post('/api/staff-prepay/refund-requests/5/reject').set(viewOnly).send({ note: 'Rekening salah' })).status).toBe(403);
            expect(mockRefundRequests.completeRequest).not.toHaveBeenCalled();
            expect(mockRefundRequests.rejectRequest).not.toHaveBeenCalled();

            const done = await request(app).post('/api/staff-prepay/refund-requests/5/complete').set(cashier);
            expect(done.status).toBe(200);
            expect(done.body.data).toEqual({ id: 5, status: 'done', refund_id: 30 });
            expect(mockRefundRequests.completeRequest).toHaveBeenCalledWith({ id: 5, actor: { id: 'S1', name: 'Kasir' } });

            const rejected = await request(app).post('/api/staff-prepay/refund-requests/6/reject').set(cashier).send({ note: 'Rekening salah' });
            expect(rejected.status).toBe(200);
            expect(mockRefundRequests.rejectRequest).toHaveBeenCalledWith({ id: 6, note: 'Rekening salah', actor: { id: 'S1', name: 'Kasir' } });
        });

        test('a malformed id is 404 and service status codes are kept', async () => {
            mockRefundRequests = refundService();
            const bad = await request(app).post('/api/staff-prepay/refund-requests/5%20OR%201/complete').set(as(DOCTOR));
            expect(bad.status).toBe(404);
            expect(mockRefundRequests.completeRequest).not.toHaveBeenCalled();

            mockRefundRequests.completeRequest.mockRejectedValueOnce(Object.assign(new Error('Pengajuan ini sudah ditutup.'), { statusCode: 409 }));
            const closed = await request(app).post('/api/staff-prepay/refund-requests/5/complete').set(as(DOCTOR));
            expect(closed.status).toBe(409);
            expect(closed.body).toEqual({ success: false, message: 'Pengajuan ini sudah ditutup.' });
        });
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

    function refundHarness({ balances = [{ category: 'obstetri', amount_idr: 255000, created_at: '2026-11-20 07:48:00' }], saved = null, pending = [] } = {}) {
        const statements = [];
        const connection = {
            beginTransaction: jest.fn(), commit: jest.fn(), rollback: jest.fn(), release: jest.fn(),
            query: jest.fn(async (sql, params) => {
                const query = sqlOf(sql);
                statements.push({ query, params });
                if (query.startsWith('SELECT id, amount_idr, request_hash FROM patient_credit_refunds')) return [saved ? [saved] : []];
                if (query.includes('FROM patient_credit_ledger') && query.includes('FOR UPDATE')) return [balances];
                if (query.includes('FROM patient_credit_refund_requests') && query.includes("status = 'pending'")) return [pending];
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

    test('a direct refund cannot dip into saldo held by a pending withdrawal request', async () => {
        const h = refundHarness({ pending: [{ id: 5, amount_idr: 200000, request_key: 'req-key-aaaaaaaaaaaa' }] });
        await expect(real.createRefund({ ...refund, amountIdr: 100000 }, { db: h.db })).rejects.toMatchObject({
            statusCode: 400, message: expect.stringMatching(/55[.,]000/)
        });
        expect(h.statements.some(entry => entry.query.startsWith('INSERT'))).toBe(false);
        const ok = refundHarness({ pending: [{ id: 5, amount_idr: 200000, request_key: 'req-key-aaaaaaaaaaaa' }] });
        await expect(real.createRefund({ ...refund, amountIdr: 55000 }, { db: ok.db })).resolves.toMatchObject({ amount_idr: 55000 });
    });

    test('lock order: live saldo, then the pending requests (FOR UPDATE), then the refund key', async () => {
        const h = refundHarness();
        await real.createRefund(refund, { db: h.db });
        const reads = h.statements.map(entry => entry.query).filter(query => query.startsWith('SELECT'));
        expect(reads[0]).toMatch(/FROM patient_credit_ledger .* FOR UPDATE$/);
        expect(reads[1]).toMatch(/FROM patient_credit_refund_requests .*status = 'pending'.* FOR UPDATE$/);
        expect(reads[2]).toMatch(/^SELECT id, amount_idr, request_hash FROM patient_credit_refunds .* FOR UPDATE$/);
    });

    test('createRefundWithin runs on the caller transaction and may spend the hold of its own request', async () => {
        const h = refundHarness({ pending: [{ id: 5, amount_idr: 200000, request_key: 'req-key-aaaaaaaaaaaa' }, { id: 8, amount_idr: 50000, request_key: 'req-key-bbbbbbbbbbbb' }] });
        const result = await real.createRefundWithin(h.connection, {
            patientId: 'P1', amountIdr: 200000, method: 'transfer', reason: 'Pencairan atas permintaan pasien #5',
            requestKey: 'refund-request-5', actor: { id: 'S1', name: 'Kasir' }, forRequestId: 5
        });
        expect(result).toEqual({ id: 3, amount_idr: 200000, already_saved: false });
        expect(h.connection.beginTransaction).not.toHaveBeenCalled();
        expect(h.connection.commit).not.toHaveBeenCalled();
        expect(h.connection.release).not.toHaveBeenCalled();
        // The other pending request (8) still holds its 50000: 255000 - 50000 = 205000 is the cap.
        const over = refundHarness({ pending: [{ id: 5, amount_idr: 210000, request_key: 'req-key-aaaaaaaaaaaa' }, { id: 8, amount_idr: 50000, request_key: 'req-key-bbbbbbbbbbbb' }] });
        await expect(real.createRefundWithin(over.connection, {
            patientId: 'P1', amountIdr: 210000, method: 'transfer', reason: 'Pencairan atas permintaan pasien #5',
            requestKey: 'refund-request-5', actor: {}, forRequestId: 5
        })).rejects.toMatchObject({ statusCode: 400 });
    });

    test('invalid refund input never reaches the database', async () => {
        const h = refundHarness();
        for (const bad of [{ amountIdr: 0 }, { amountIdr: 1.5 }, { method: 'qris' }, { reason: '  ' }, { requestKey: 'short' }, { patientId: '' }]) {
            await expect(real.createRefund({ ...refund, ...bad }, { db: h.db })).rejects.toMatchObject({ statusCode: 400 });
        }
        expect(h.db.getConnection).not.toHaveBeenCalled();
    });

    describe('package editor service', () => {
        const actor = { id: 'D1', name: 'Dokter' };
        const BEFORE = { id: 7, code: 'pkg_7', name: 'Lama', description: null, category: 'obstetri', week_min: 20, week_max: 24, is_active: true, sort_order: 10,
            items: [{ item_type: 'tindakan', ref_id: 9, quantity: 1, sort_order: 0 }] };

        function harness({ tindakanRows = [{ id: 9, name: 'USG 4 Dimensi', category: 'LAYANAN' }, { id: 56, name: 'Konsul Singkat', category: 'LAYANAN' }], before = BEFORE } = {}) {
            const connection = { beginTransaction: jest.fn(), commit: jest.fn(), rollback: jest.fn(), release: jest.fn() };
            const db = {
                getConnection: jest.fn(async () => connection),
                query: jest.fn(async (sql, params) => {
                    if (sqlOf(sql).includes('FROM tindakan WHERE id IN')) return [tindakanRows.filter(row => params[0].includes(row.id))];
                    return [[]];
                })
            };
            const repository = {
                listPackages: jest.fn(async () => (before ? [before] : [])),
                savePackage: jest.fn(async (_c, input) => ({ id: input.id || 8, code: input.id ? 'pkg_7' : 'pkg_8' })),
                setPackageActive: jest.fn(async () => true)
            };
            const estimates = {
                invalidate: jest.fn(),
                priceAllForStaff: jest.fn(async () => ({ packages: [{ id: 7, ready: true, amount_idr: 190000 }, { id: 8, ready: true, amount_idr: 120000 }] }))
            };
            const activityLogger = { log: jest.fn(async () => 1) };
            return { db, connection, repository, estimates, activityLogger, opts: { db, repository, estimates, activityLogger } };
        }
        const form = (items, extra = {}) => ({ name: 'Baru', category: 'obstetri', week_min: 20, week_max: 26, items, ...extra });

        test('a save with a consultation item is refused with 400 and the message, before any write', async () => {
            const h = harness();
            await expect(real.savePackage(form([{ item_type: 'tindakan', ref_id: 56, quantity: 1 }]), actor, h.opts))
                .rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('konsultasi tidak boleh di paket') });
            expect(h.db.getConnection).not.toHaveBeenCalled();
            expect(h.activityLogger.log).not.toHaveBeenCalled();
        });

        test('an update saves in one transaction, drops the cache and writes a before to after audit line', async () => {
            const h = harness();
            const result = await real.savePackage(form([{ item_type: 'tindakan', ref_id: 9, quantity: 2 }], { id: 7 }), actor, h.opts);
            expect(result).toMatchObject({ id: 7, amount_idr: 190000 });
            expect(h.connection.commit).toHaveBeenCalled();
            expect(h.repository.savePackage).toHaveBeenCalledWith(h.connection, expect.objectContaining({ id: 7, name: 'Baru', is_active: true }), actor);
            expect(h.estimates.invalidate).toHaveBeenCalled();
            expect(h.activityLogger.log).toHaveBeenCalledTimes(1);
            const [userId, userName, action, details] = h.activityLogger.log.mock.calls[0];
            expect([userId, userName, action]).toEqual(['D1', 'Dokter', 'Paket Bayar di Muka']);
            expect(details).toContain('pkg_7');
            expect(details).toContain('"Lama" -> "Baru"');
            expect(details).toContain('minggu 20-24 -> minggu 20-26');
            expect(details).toContain('tindakan:9x1 -> tindakan:9x2');
        });

        test('an update of a missing package is 404 and rolls back', async () => {
            const h = harness({ before: null });
            await expect(real.savePackage(form([{ item_type: 'tindakan', ref_id: 9, quantity: 1 }], { id: 7 }), actor, h.opts))
                .rejects.toMatchObject({ statusCode: 404 });
            expect(h.connection.rollback).toHaveBeenCalled();
            expect(h.repository.savePackage).not.toHaveBeenCalled();
            expect(h.activityLogger.log).not.toHaveBeenCalled();
        });

        test('a create is audited as new and an update that omits is_active keeps the package state', async () => {
            const created = harness();
            await real.savePackage(form([{ item_type: 'tindakan', ref_id: 9, quantity: 1 }]), actor, created.opts);
            expect(created.activityLogger.log.mock.calls[0][3]).toContain('pkg_8 dibuat');
            const off = harness({ before: { ...BEFORE, is_active: false } });
            await real.savePackage(form([{ item_type: 'tindakan', ref_id: 9, quantity: 1 }], { id: 7 }), actor, off.opts);
            expect(off.repository.savePackage.mock.calls[0][1].is_active).toBe(false);
        });

        test('activating or deactivating is audited and a non-boolean is refused', async () => {
            const h = harness();
            const result = await real.setPackageActive(7, false, actor, h.opts);
            expect(result).toMatchObject({ id: 7 });
            expect(h.repository.setPackageActive).toHaveBeenCalledWith(h.db, 7, false, actor);
            expect(h.estimates.invalidate).toHaveBeenCalled();
            const [, , action, details] = h.activityLogger.log.mock.calls[0];
            expect(action).toBe('Paket Bayar di Muka');
            expect(details).toContain('aktif -> nonaktif');
            await expect(real.setPackageActive(7, 'no', actor, h.opts)).rejects.toMatchObject({ statusCode: 400 });
            await expect(real.setPackageActive(99, true, actor, harness({ before: null }).opts)).rejects.toMatchObject({ statusCode: 404 });
        });

        test('the catalog carries the admin fee line', async () => {
            const db = { query: jest.fn(async () => [[{ id: 1, name: 'Administrasi', price: '25000.00' }]]) };
            const estimates = { loadCatalog: jest.fn(async () => ({ tindakan: [], obat: [] })) };
            expect(await real.getCatalog({ db, estimates })).toEqual({ tindakan: [], obat: [], admin: { id: 1, name: 'Administrasi', price: 25000 } });
        });
    });
});

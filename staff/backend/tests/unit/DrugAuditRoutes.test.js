'use strict';

process.env.JWT_SECRET ||= 'drug-audit-test';

const express = require('express');
const request = require('supertest');
const { ROLE_IDS } = require('../../constants/roles');

jest.mock('../../middleware/auth', () => ({
    ...jest.requireActual('../../middleware/auth'),
    verifyToken: (req, res, next) => {
        req.user = JSON.parse(req.headers['x-test-user'] || 'null');
        return req.user ? next() : res.status(401).end();
    }
}));
jest.mock('../../services/DrugAuditReconciliationService', () => ({
    getReconciliation: jest.fn()
}));
jest.mock('../../services/StockAdjustmentRequestService', () => ({
    ...jest.requireActual('../../services/StockAdjustmentRequestService'),
    listAdjustmentRequests: jest.fn(),
    approveAdjustmentRequest: jest.fn(),
    rejectAdjustmentRequest: jest.fn()
}));

const { getReconciliation } = require('../../services/DrugAuditReconciliationService');
const {
    listAdjustmentRequests,
    approveAdjustmentRequest,
    rejectAdjustmentRequest
} = require('../../services/StockAdjustmentRequestService');
const { requireDoctorRole, isDelegatedAccountPermission } = require('../../middleware/auth');
const { PERMISSION_CATALOG } = require('../../config/accessControlCatalog');
const { getDelegableCatalog } = require('../../services/AccessControlManagementService');
const { resolveRouteAccess } = require('../../config/accessControlRegistry');

const PERMISSIONS = ['drug_audit.view', 'drug_audit.approve'];
const STAFF = { id: 'S1', name: 'Staf', role_id: ROLE_IDS.ADMIN };
const DOCTOR = { id: 'D1', name: 'Dokter', role_id: ROLE_IDS.DOKTER };

function responseDouble() {
    return {
        statusCode: 200,
        body: null,
        status: jest.fn(function status(code) { this.statusCode = code; return this; }),
        json: jest.fn(function json(body) { this.body = body; return this; })
    };
}

function accountRequest(permission, granted = [permission]) {
    return {
        user: { id: 'STAFF-ACCOUNT', role: 'staff', role_id: null, user_type: 'staff' },
        accountAccess: { mode: 'account', permissions: new Set(granted) },
        accountAccessResolution: { permission, ruleId: 'staff-drug-audit' },
        context: { requestId: 'drug-audit-test' },
        path: '/drug-audit'
    };
}

function buildApp() {
    const app = express();
    app.use(express.json());
    app.use('/api/drug-audit', require('../../routes/drug-audit'));
    return app;
}

describe('drug audit permissions', () => {
    test.each(PERMISSIONS)('delegated %s grant never passes the doctor guard', permission => {
        expect(isDelegatedAccountPermission(accountRequest(permission), [permission])).toBe(false);
        const res = responseDouble();
        const next = jest.fn();
        requireDoctorRole(accountRequest(permission), res, next);
        expect(next).not.toHaveBeenCalled();
        expect(res.statusCode).toBe(403);
    });

    test('superadmin without the doctor role is rejected', () => {
        const res = responseDouble();
        const next = jest.fn();
        requireDoctorRole({ user: { id: 'S', is_superadmin: 1, role_id: ROLE_IDS.ADMIN } }, res, next);
        expect(next).not.toHaveBeenCalled();
        expect(res.statusCode).toBe(403);
    });

    test('doctor role passes', () => {
        const res = responseDouble();
        const next = jest.fn();
        requireDoctorRole({ user: { id: 'D', role_id: ROLE_IDS.DOKTER } }, res, next);
        expect(next).toHaveBeenCalledTimes(1);
    });

    test('drug audit permissions are protected and not delegable', () => {
        const delegable = new Set(getDelegableCatalog().map(item => item.name));
        for (const name of PERMISSIONS) {
            const entry = PERMISSION_CATALOG.find(item => item.name === name);
            expect(entry).toBeDefined();
            expect(entry.protected).toBe(true);
            expect(delegable.has(name)).toBe(false);
        }
    });

    test('registry maps drug audit routes', () => {
        const base = { sourceFile: 'drug-audit', fileMiddleware: '', handlerPrefix: 'verifyToken, requireDoctorRole' };
        expect(resolveRouteAccess({ ...base, method: 'POST', routePath: '/adjustment-requests/:id/approve' }))
            .toEqual(expect.objectContaining({ permission: 'drug_audit.approve' }));
        expect(resolveRouteAccess({ ...base, method: 'GET', routePath: '/reconciliation' }))
            .toEqual(expect.objectContaining({ permission: 'drug_audit.view' }));
    });
});

describe('drug audit HTTP API', () => {
    const app = buildApp();
    const as = user => ({ 'x-test-user': JSON.stringify(user) });

    beforeEach(() => jest.clearAllMocks());

    test('reconciliation rejects staff', async () => {
        const res = await request(app).get('/api/drug-audit/reconciliation').set(as(STAFF));
        expect(res.status).toBe(403);
        expect(getReconciliation).not.toHaveBeenCalled();
    });

    test('reconciliation passes only_mismatch for doctor', async () => {
        getReconciliation.mockResolvedValue({ summary: {}, rows: [] });
        const res = await request(app).get('/api/drug-audit/reconciliation?only_mismatch=1').set(as(DOCTOR));
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(getReconciliation).toHaveBeenCalledWith({ onlyMismatch: true });
    });

    test('list clamps limit and defaults status/offset', async () => {
        listAdjustmentRequests.mockResolvedValue({ rows: [], total: 0 });
        const res = await request(app).get('/api/drug-audit/adjustment-requests?limit=999').set(as(DOCTOR));
        expect(res.status).toBe(200);
        expect(listAdjustmentRequests).toHaveBeenCalledWith({ status: 'pending', limit: 200, offset: 0 });
        expect(res.body.pagination).toEqual({ total: 0, limit: 200, offset: 0 });
    });

    test('approve calls service with numeric id and actor', async () => {
        approveAdjustmentRequest.mockResolvedValue({ id: 41 });
        const res = await request(app).post('/api/drug-audit/adjustment-requests/41/approve').set(as(DOCTOR));
        expect(res.status).toBe(200);
        expect(approveAdjustmentRequest).toHaveBeenCalledWith(41, { id: 'D1', name: 'Dokter' }, undefined);
    });

    test('service errors keep their status and message', async () => {
        const error = Object.assign(new Error('Pengajuan sudah diputuskan'), { statusCode: 409, code: 'ALREADY_DECIDED' });
        rejectAdjustmentRequest.mockRejectedValue(error);
        const res = await request(app).post('/api/drug-audit/adjustment-requests/41/reject')
            .set(as(DOCTOR)).send({ decision_note: 'alasan' });
        expect(res.status).toBe(409);
        expect(res.body).toEqual({ success: false, code: 'ALREADY_DECIDED', message: 'Pengajuan sudah diputuskan' });
    });

    test('invalid id returns 400 without calling the service', async () => {
        const res = await request(app).post('/api/drug-audit/adjustment-requests/abc/reject').set(as(DOCTOR));
        expect(res.status).toBe(400);
        expect(res.body.message).toBe('Pengajuan tidak valid');
        expect(rejectAdjustmentRequest).not.toHaveBeenCalled();
    });
});

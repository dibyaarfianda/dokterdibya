'use strict';

process.env.JWT_SECRET ||= 'docboard-account-permissions-test';
jest.mock('../../services/SurgeryService', () => ({
    createSurgery: jest.fn(), updateSurgery: jest.fn(), deleteSurgery: jest.fn(),
}));
jest.mock('../../services/DocBoardPushService', () => ({}));
jest.mock('../../services/whatsappService', () => ({}));
const { createRuntimeAccessResolver, createAccountModeAccessBoundary } = require('../../security/accountModeAccess');
const resolve = createRuntimeAccessResolver();

describe('DocBoard scheduling follows its account permissions', () => {
    test.each([
        ['POST', '/api/docboard/surgery', 'docboard.write'],
        ['PUT', '/api/docboard/surgery/9', 'docboard.write'],
        ['PATCH', '/api/docboard/surgery/9/status', 'docboard.write'],
        ['POST', '/api/sunday-clinic/records/DRD200/planned-sc/91/cancel', 'docboard.write'],
        ['DELETE', '/api/docboard/surgery/9', 'docboard.delete'],
        ['PUT', '/api/docboard/surgery/9/outcome', 'medical_records.edit'],
        ['PATCH', '/api/docboard/surgery/9/post-op-notes', 'medical_records.edit'],
    ])('%s %s uses %s regardless of legacy role', async (method, originalUrl, permission) => {
        expect(resolve(method, originalUrl)).toEqual(expect.objectContaining({ permission }));
        for (const [roleName, grants, allowed] of [
            ['bidan', [permission], true],
            ['admin', [], false],
            ['managerial', ['unrelated.write'], false],
        ]) {
            const state = { userId: 'observer-account', userType: 'staff', isActive: true,
                isSuperadmin: false, roleId: null, roleName, mode: 'account', accessVersion: 8 };
            const boundary = createAccountModeAccessBoundary({
                verifyJwt: () => ({ id: state.userId, user_type: 'staff' }),
                accessControlService: {
                    getStaffAccountState: async () => state,
                    getEffectiveAccess: async () => ({ ...state, permissions: new Set(grants) }),
                },
                resolveRequestAccess: resolve,
                logger: { warn() {}, error() {} },
            });
            const req = { method, originalUrl, headers: { authorization: 'Bearer fixture' } };
            const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json() { return this; } };
            const next = jest.fn();
            await boundary(req, res, next);
            expect(next.mock.calls.length).toBe(allowed ? 1 : 0);
            if (!allowed) expect(res.statusCode).toBe(403);
        }
    });
});

describe('operation form preserves the original clinical guard', () => {
    const express = require('express');
    const request = require('supertest');
    const router = require('../../routes/surgery');
    const service = require('../../services/SurgeryService');

    test('DocBoard write alone cannot overwrite clinical fields through the edit form', async () => {
        const app = express();
        app.use(express.json());
        app.use((req, _res, next) => {
            req.user = { id: 'observer-account', role: 'bidan', user_type: 'staff' };
            req.accountAccess = { isActive: true, permissions: new Set(['docboard.write']) };
            req.accountAccessResolution = { permission: 'docboard.write' };
            next();
        });
        app.use('/api/docboard/surgery', router);
        await request(app).put('/api/docboard/surgery/9').send({ post_op_notes: 'Forbidden write' }).expect(403);
        await request(app).post('/api/docboard/surgery').send({ patient_name: 'Fixture' }).expect(403);
        expect(service.updateSurgery).not.toHaveBeenCalled();
        expect(service.createSurgery).not.toHaveBeenCalled();
    });
});

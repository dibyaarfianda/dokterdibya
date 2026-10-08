'use strict';

const fs = require('fs');
const path = require('path');

jest.mock('../../db', () => ({ query: jest.fn() }));
jest.mock('../../utils/logger', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
}));

const db = require('../../db');
const logger = require('../../utils/logger');
const { ROLE_IDS, ROLE_NAMES } = require('../../constants/roles');

const migrationPath = path.resolve(__dirname, '../../migrations/20261008_account_access_foundation.sql');
const authRoutePath = path.resolve(__dirname, '../../routes/auth.js');

function accountRow(overrides = {}) {
    return {
        new_id: 'STAFF0001',
        user_type: 'staff',
        is_active: 1,
        is_superadmin: 0,
        role_id: ROLE_IDS.ADMIN,
        role_name: ROLE_NAMES.ADMIN,
        access_mode: 'legacy',
        access_version: 1,
        ...overrides
    };
}

function permissionRows() {
    return [
        { name: 'announcements.edit' }
    ];
}

describe('account access foundation migration', () => {
    test('creates additive policy, invitation and immutable audit tables without deleting legacy authorization data', () => {
        expect(fs.existsSync(migrationPath)).toBe(true);
        const sql = fs.readFileSync(migrationPath, 'utf8').replace(/--[^\n]*/g, '');

        expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS user_access_policies/i);
        expect(sql).toMatch(/mode ENUM\('legacy',\s*'account'\).*DEFAULT 'legacy'/i);
        expect(sql).toMatch(/access_version BIGINT UNSIGNED NOT NULL DEFAULT 1/i);
        expect(sql).toMatch(/INSERT IGNORE INTO user_access_policies[\s\S]+FROM users[\s\S]+user_type = 'staff'/i);

        expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS staff_access_invitations/i);
        expect(sql).toMatch(/token_hash CHAR\(64\).*ascii_bin/i);
        expect(sql).toMatch(/expires_at DATETIME\(6\) NOT NULL/i);
        expect(sql).toMatch(/used_at DATETIME\(6\) NULL/i);
        expect(sql).toMatch(/cancelled_at DATETIME\(6\) NULL/i);
        expect(sql).not.toMatch(/\braw_token\b|\bpassword\b/i);

        expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS user_permission_audits/i);
        expect(sql).toMatch(/before_state JSON NULL/i);
        expect(sql).toMatch(/after_state JSON NULL/i);
        expect(sql).toMatch(/BEFORE UPDATE ON user_permission_audits[\s\S]+SIGNAL SQLSTATE '45000'/i);
        expect(sql).toMatch(/BEFORE DELETE ON user_permission_audits[\s\S]+SIGNAL SQLSTATE '45000'/i);

        expect(sql).not.toMatch(/DROP\s+(?:TABLE|COLUMN)|TRUNCATE|DELETE\s+FROM\s+(?:users|roles|user_roles|permissions|role_permissions|role_visibility|user_permission_grants)/i);
        expect(sql.trim().endsWith(';')).toBe(true);
    });
});

describe('AccessControlService', () => {
    test('a non-doctor policy still marked legacy uses only per-account grants after final cutover', async () => {
        const query = jest.fn()
            .mockResolvedValueOnce([[accountRow()]])
            .mockResolvedValueOnce([permissionRows()]);
        const { AccessControlService } = require('../../services/AccessControlService');
        const service = new AccessControlService({ db: { query }, logger });

        const access = await service.getEffectiveAccess('STAFF0001');

        expect(access.mode).toBe('account');
        expect(access.accessVersion).toBe(1);
        expect([...access.legacyPermissions]).toEqual(['announcements.edit']);
        expect([...access.accountPermissions]).toEqual(['announcements.edit']);
        expect([...access.permissions]).toEqual(['announcements.edit']);
        expect(access.isDoctorProtected).toBe(false);
    });

    test('account mode uses only per-account grants', async () => {
        const query = jest.fn()
            .mockResolvedValueOnce([[accountRow({ access_mode: 'account', access_version: 8 })]])
            .mockResolvedValueOnce([permissionRows()]);
        const { AccessControlService } = require('../../services/AccessControlService');
        const service = new AccessControlService({ db: { query }, logger });

        const access = await service.getEffectiveAccess('STAFF0001');

        expect(access.mode).toBe('account');
        expect(access.accessVersion).toBe(8);
        expect([...access.permissions]).toEqual(['announcements.edit']);
        expect(service.hasAnyPermission(access, ['patients.view'])).toBe(false);
        expect(service.hasAnyPermission(access, ['announcements.edit'])).toBe(true);
    });

    test.each([
        { role_id: ROLE_IDS.DOKTER, is_superadmin: 0 },
        { role_id: ROLE_IDS.ADMIN, is_superadmin: 1 }
    ])('doctor or superadmin remains protected with the full catalog: %j', async protectedFields => {
        const query = jest.fn()
            .mockResolvedValueOnce([[accountRow({ ...protectedFields, access_mode: 'account' })]])
            .mockResolvedValueOnce([[{ name: 'patients.view' }, { name: 'billing.pay' }]]);
        const { AccessControlService } = require('../../services/AccessControlService');
        const service = new AccessControlService({ db: { query }, logger });

        const access = await service.getEffectiveAccess('STAFF0001');

        expect(access.isDoctorProtected).toBe(true);
        expect([...access.permissions]).toEqual(['billing.pay', 'patients.view']);
        expect([...access.accountPermissions]).toEqual(['billing.pay', 'patients.view']);
    });

    test('final account evaluation does not emit legacy shadow differences', async () => {
        logger.info.mockClear();
        const query = jest.fn()
            .mockResolvedValueOnce([[accountRow()]])
            .mockResolvedValueOnce([permissionRows()]);
        const { AccessControlService } = require('../../services/AccessControlService');
        const service = new AccessControlService({ db: { query }, logger });

        await service.getEffectiveAccess('STAFF0001');

        expect(logger.info).not.toHaveBeenCalledWith('Access control shadow difference', expect.anything());
        expect(JSON.stringify(logger.info.mock.calls)).not.toContain('STAFF0001');
    });
});

describe('active Staff middleware', () => {
    beforeEach(() => {
        db.query.mockReset();
        logger.warn.mockClear();
        logger.error.mockClear();
    });

    function response() {
        return {
            status: jest.fn().mockReturnThis(),
            json: jest.fn()
        };
    }

    test('reloads the active Staff principal from the database before continuing', async () => {
        const { verifyActiveStaff } = require('../../middleware/auth');
        db.query.mockResolvedValueOnce([[accountRow()]]);
        const req = { user: { id: 'STAFF0001', role: 'stale', role_id: 999 }, context: { requestId: 'r1' } };
        const res = response();
        const next = jest.fn();

        await verifyActiveStaff(req, res, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(req.user).toMatchObject({
            id: 'STAFF0001',
            role: ROLE_NAMES.ADMIN,
            role_id: ROLE_IDS.ADMIN,
            user_type: 'staff',
            is_active: true
        });
    });

    test('rejects an inactive Staff JWT with ACCOUNT_INACTIVE', async () => {
        const { verifyActiveStaff } = require('../../middleware/auth');
        db.query.mockResolvedValueOnce([[accountRow({ is_active: 0 })]]);
        const res = response();
        const next = jest.fn();

        await verifyActiveStaff({ user: { id: 'STAFF0001' } }, res, next);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            success: false,
            code: 'ACCOUNT_INACTIVE'
        }));
        expect(next).not.toHaveBeenCalled();
    });

    test('rejects missing or non-Staff database identities with ACCESS_DENIED', async () => {
        const { verifyActiveStaff } = require('../../middleware/auth');
        for (const rows of [[], [accountRow({ user_type: 'patient' })]]) {
            db.query.mockResolvedValueOnce([rows]);
            const res = response();
            const next = jest.fn();
            await verifyActiveStaff({ user: { id: 'STAFF0001' } }, res, next);
            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'ACCESS_DENIED' }));
            expect(next).not.toHaveBeenCalled();
        }
    });
});

describe('auth route shadow integration contract', () => {
    test('login and identity refresh check active status and /auth/me delegates permissions to AccessControlService', () => {
        const source = fs.readFileSync(authRoutePath, 'utf8');
        const login = source.slice(source.indexOf("router.post('/api/auth/login'"), source.indexOf('// Staff avatars'));
        const me = source.slice(source.indexOf("router.get('/api/auth/me'"), source.indexOf('// GET /api/staff/verify'));

        expect(login).toContain('u.is_active');
        expect(login).toContain('ACCOUNT_INACTIVE');
        expect(me).toContain('accessControlService.getEffectiveAccess(userId)');
        expect(me).not.toContain('FROM role_permissions');
        expect(me).not.toContain('FROM user_permission_grants');
    });
});

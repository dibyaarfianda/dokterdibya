'use strict';

const fs = require('fs');
const path = require('path');

jest.mock('../../db', () => ({ query: jest.fn(), getConnection: jest.fn() }));
jest.mock('../../utils/notification', () => ({ sendEmail: jest.fn() }));

const servicePath = path.resolve(__dirname, '../../services/AccessControlManagementService.js');
const routePath = path.resolve(__dirname, '../../routes/access-control.js');
const pagePath = path.resolve(__dirname, '../../../public/fragments/pages/kelola-access-page.html');
const scriptPath = path.resolve(__dirname, '../../../public/scripts/kelola-access.js');
const activationPath = path.resolve(__dirname, '../../../public/activate-access.html');
const jobLabelMigrationPath = path.resolve(__dirname, '../../migrations/20261008_account_access_job_label.sql');
const accessTemplateLabelMigrationPath = path.resolve(__dirname, '../../migrations/20261009_access_template_labels.sql');

function codedError(code, statusCode, message = code) {
    const error = new Error(message);
    error.code = code;
    error.statusCode = statusCode;
    error.isOperational = true;
    return error;
}

function createApiTestApp({ management = {}, auth = {} } = {}) {
    const express = require('express');
    const { createAccessControlRouter } = require('../../routes/access-control');
    const app = express();
    app.use(express.json());

    const managementService = {
        validateInvitation: jest.fn().mockResolvedValue({ valid: true }),
        acceptInvitation: jest.fn().mockResolvedValue({ accepted: true }),
        getCatalog: jest.fn().mockResolvedValue({ permissions: [], templates: [], job_labels: [] }),
        listUsers: jest.fn().mockResolvedValue([]),
        getUser: jest.fn().mockResolvedValue({ id: 'STAFF0001' }),
        savePermissions: jest.fn().mockResolvedValue({ access_version: 2 }),
        setStatus: jest.fn().mockResolvedValue({ access_version: 2 }),
        createInvitation: jest.fn().mockResolvedValue({ user: { id: 'STAFF0002' }, email_sent: true }),
        resendInvitation: jest.fn().mockResolvedValue({ email_sent: true }),
        ...management
    };
    const pass = (req, _res, next) => {
        req.user = { id: 'DOCTOR001', role_id: 1, is_superadmin: true };
        next();
    };
    const effectiveAccessService = {
        getEffectiveAccess: jest.fn().mockResolvedValue({}),
        toPublicAccess: jest.fn().mockReturnValue({ mode: 'legacy', access_version: 1, permissions: [] })
    };
    app.use('/api/access-control', createAccessControlRouter({
        managementService,
        effectiveAccessService,
        refreshAccessRooms: jest.fn().mockResolvedValue(undefined),
        auth: { verifyToken: pass, verifyActiveStaff: pass, requireSuperadmin: pass, ...auth }
    }));
    app.use((error, _req, res, _next) => res.status(error.statusCode || 500).json({
        success: false,
        code: error.code,
        message: error.message
    }));
    return { app, managementService, effectiveAccessService };
}

describe('access-control management contracts', () => {
    test('keeps the display-only job label outside legacy authorization columns', () => {
        const sql = fs.readFileSync(jobLabelMigrationPath, 'utf8');
        expect(sql).toMatch(/ALTER TABLE user_access_policies[\s\S]+job_label VARCHAR\(80\)[\s\S]+job_role_id INT/i);
        expect(sql).toMatch(/COALESCE\(r\.display_name, r\.name, u\.role, 'Staff'\)/i);
        expect(sql).not.toMatch(/UPDATE\s+users\s+SET\s+(?:role|role_id)/i);
    });

    test('migrates legacy staff labels to the five approved templates without changing authorization roles', () => {
        const sql = fs.readFileSync(accessTemplateLabelMigrationPath, 'utf8');

        for (const label of ['Owner', 'Koordinator', 'Farmasi', 'Staff', 'Observer']) {
            expect(sql).toContain(`'${label}'`);
        }
        expect(sql).toMatch(/UPDATE\s+user_access_policies/i);
        expect(sql).toMatch(/COALESCE\(u\.role_id,\s*0\)\s*<>/i);
        expect(sql).not.toMatch(/UPDATE\s+users\s+SET/i);
        expect(sql).not.toMatch(/role_permissions|role_visibility/i);
    });

    test('exposes the approved catalog and invitation endpoints', () => {
        expect(fs.existsSync(routePath)).toBe(true);
        const source = fs.readFileSync(routePath, 'utf8');

        for (const route of [
            "router.get('/catalog'",
            "router.get('/users'",
            "router.get('/users/:id'",
            "router.put('/users/:id/permissions'",
            "router.patch('/users/:id/status'",
            "router.post('/invitations'",
            "router.post('/users/:id/invitations'",
            "router.get('/me'",
            "router.post('/invitations/validate'",
            "router.post('/invitations/accept'"
        ]) {
            expect(source).toContain(route);
        }
        expect(source).toMatch(/verifyToken[\s\S]+verifyActiveStaff[\s\S]+requireSuperadmin/);
    });

    test('hashes invitation tokens and puts the raw token only in the URL fragment', () => {
        const {
            hashInvitationToken,
            buildInvitationLink
        } = require('../../services/AccessControlManagementService');

        const token = 'raw-secret-token';
        const hash = hashInvitationToken(token);
        const link = buildInvitationLink(token, 'https://dokterdibya.com/staff/public/activate-access.html');

        expect(hash).toMatch(/^[a-f0-9]{64}$/);
        expect(hash).not.toContain(token);
        expect(link).toBe('https://dokterdibya.com/staff/public/activate-access.html#token=raw-secret-token');
        expect(link.split('#')[0]).not.toContain(token);
    });

    test.each([
        ['short', false],
        ['alllowercase123!', false],
        ['ALLUPPERCASE123!', false],
        ['NoDigitsHere!', false],
        ['NoSpecial1234', false],
        ['Strong-Password9!', true]
    ])('checks strong password %s', (password, expected) => {
        const { validateStrongPassword } = require('../../services/AccessControlManagementService');
        expect(validateStrongPassword(password).valid).toBe(expected);
    });

    test('hides internal and protected access-management permissions from delegation', () => {
        const { getDelegableCatalog } = require('../../services/AccessControlManagementService');
        const catalog = getDelegableCatalog();
        const names = new Set(catalog.map(item => item.name));

        expect(names.has('patients.view')).toBe(true);
        expect(names.has('patient_access.manage')).toBe(true);
        expect(names.has('assistant_daf.use')).toBe(true);
        expect(names.has('navigation.dashboard')).toBe(false);
        expect(names.has('access.manage')).toBe(false);
        expect(names.has('roles.manage_permissions')).toBe(false);
        expect(names.has('users.manage_roles')).toBe(false);
        expect(names.has('system.reset')).toBe(false);
    });

    test('provides the five fixed access templates with approved safety boundaries', () => {
        const {
            getAccessTemplates,
            getDelegableCatalog,
            resolveSelectedPermissions
        } = require('../../services/AccessControlManagementService');
        const catalog = getDelegableCatalog();
        const templates = getAccessTemplates();
        const byKey = new Map(templates.map(template => [template.key, template]));

        expect(templates.map(template => template.label)).toEqual([
            'Owner',
            'Koordinator',
            'Farmasi',
            'Staff',
            'Observer'
        ]);
        expect(byKey.get('owner').permissions).toHaveLength(catalog.length);
        expect(byKey.get('owner').permissions).not.toContain('access.manage');
        expect(byKey.get('owner').permissions).not.toContain('system.reset');

        expect(byKey.get('coordinator').permissions).toEqual(expect.arrayContaining([
            'patients.edit',
            'medical_records.edit',
            'online_queue.write',
            'staff_briefing.write'
        ]));
        expect(byKey.get('coordinator').permissions).not.toEqual(expect.arrayContaining([
            'patients.bulk_delete',
            'settings.system'
        ]));

        expect(byKey.get('pharmacy').permissions).toEqual(expect.arrayContaining([
            'inventory.view',
            'inventory.purchase',
            'medications.sales_write',
            'billing.view'
        ]));
        expect(byKey.get('pharmacy').permissions).not.toContain('medical_records.edit');

        expect(byKey.get('staff').permissions).toEqual(expect.arrayContaining([
            'patients.edit',
            'appointments.edit',
            'online_queue.write'
        ]));
        expect(byKey.get('staff').permissions).not.toContain('patients.delete');
        expect(byKey.get('staff').permissions).not.toContain('medical_records.edit');

        const catalogByName = new Map(catalog.map(permission => [permission.name, permission]));
        expect(byKey.get('observer').permissions.length).toBeGreaterThan(0);
        expect(byKey.get('observer').permissions.every(name => catalogByName.get(name).action === 'view')).toBe(true);
        expect(byKey.get('observer').permissions).toContain('patients.view');
        expect(byKey.get('observer').permissions).not.toContain('patients.edit');

        for (const template of templates) {
            expect(resolveSelectedPermissions(template.permissions)).toEqual(template.permissions);
        }
    });

    test('serves templates and fixed job labels without reading legacy roles', async () => {
        const { AccessControlManagementService } = require('../../services/AccessControlManagementService');
        const db = { query: jest.fn().mockRejectedValue(new Error('legacy roles must not be read')) };
        const service = new AccessControlManagementService({ db });

        const catalog = await service.getCatalog();

        expect(db.query).not.toHaveBeenCalled();
        expect(catalog.templates.map(template => template.label)).toEqual([
            'Owner', 'Koordinator', 'Farmasi', 'Staff', 'Observer'
        ]);
        expect(catalog.job_labels).toEqual(catalog.templates.map(template => ({
            name: template.key,
            label: template.label
        })));
    });

    test('derives navigation from selected module access without granting access management', () => {
        const { deriveNavigationPermissions, resolveSelectedPermissions } = require('../../services/AccessControlManagementService');
        const selected = resolveSelectedPermissions(['patients.edit', 'online_queue.write']);
        expect(selected).toEqual(expect.arrayContaining(['patients.edit', 'online_queue.write', 'booking.manage']));
        expect(deriveNavigationPermissions(selected)).toContain('navigation.kelola_pasien');
        expect(deriveNavigationPermissions(selected)).not.toContain('navigation.kelola_roles');
    });

    test('rejects stale versions and protected doctor targets with stable error codes', () => {
        const {
            assertAccessVersion,
            assertMutableStaffAccount
        } = require('../../services/AccessControlManagementService');

        expect(() => assertAccessVersion(4, 3)).toThrow(expect.objectContaining({
            code: 'ACCESS_VERSION_CONFLICT',
            statusCode: 409
        }));
        expect(() => assertMutableStaffAccount({ user_type: 'staff', role_id: 1, is_superadmin: 0 })).toThrow(expect.objectContaining({
            code: 'ACCESS_DENIED',
            statusCode: 403
        }));
    });

    test('doctor-only management rejection uses ACCESS_DENIED', () => {
        const { requireSuperadmin } = require('../../middleware/auth');
        const req = { user: { id: 'STAFF0001', role_id: 22, is_superadmin: false }, context: { requestId: 'r1' } };
        const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
        requireSuperadmin(req, res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'ACCESS_DENIED' }));
    });
});

describe('Kelola Akses rollout UI', () => {
    test('ships layout A and activation UI as the only access-management layout', () => {
        for (const file of [pagePath, scriptPath, activationPath]) {
            expect(fs.existsSync(file)).toBe(true);
        }

        const page = fs.readFileSync(pagePath, 'utf8');
        const script = fs.readFileSync(scriptPath, 'utf8');
        const activation = fs.readFileSync(activationPath, 'utf8');
        const main = fs.readFileSync(path.resolve(__dirname, '../../../public/scripts/main.js'), 'utf8');

        expect(page).toMatch(/access-account-list/);
        expect(page).toMatch(/access-permission-matrix/);
        expect(page).toMatch(/access-audit-history/);
        expect(page).toMatch(/Tambah Akun/);
        expect(page).toMatch(/access-template/);
        expect(page).toMatch(/access-template-apply/);
        expect(page).toMatch(/access-check-all/);
        expect(page).toMatch(/access-uncheck-all/);
        expect(script).toMatch(/API_ROOT\s*=\s*['"]\/api\/access-control['"]/);
        expect(script).toMatch(/request\(['"]\/catalog['"]\)/);
        expect(script).toMatch(/access_version/);
        expect(script).toMatch(/applySelectedTemplate/);
        expect(script).toMatch(/setAllPermissionsChecked/);
        expect(activation).toMatch(/location\.hash/);
        expect(activation).toMatch(/invitations\/validate/);
        expect(activation).toMatch(/invitations\/accept/);
        expect(main).toContain("importWithVersion('./kelola-access.js')");
        expect(main).not.toContain('ACCESS_CONTROL_ROLLOUT_ENABLED');
    });
});

describe('access-control API behavior', () => {
    const request = require('supertest');

    test('serves catalog, account detail, mutations, invitations and current access', async () => {
        const { app, managementService } = createApiTestApp();

        await request(app).get('/api/access-control/catalog').expect(200);
        await request(app).get('/api/access-control/users').expect(200);
        await request(app).get('/api/access-control/users/STAFF0001').expect(200);
        await request(app).put('/api/access-control/users/STAFF0001/permissions')
            .send({ permissions: ['patients.view'], access_version: 1 }).expect(200);
        await request(app).patch('/api/access-control/users/STAFF0001/status')
            .send({ is_active: false, access_version: 1 }).expect(200);
        await request(app).post('/api/access-control/invitations')
            .send({ name: 'Staff Baru', email: 'staff@example.test', template_key: 'staff' }).expect(201);
        await request(app).post('/api/access-control/users/STAFF0001/invitations').send({}).expect(200);
        await request(app).post('/api/access-control/invitations/validate').send({ token: 'x'.repeat(32) }).expect(200);
        await request(app).post('/api/access-control/invitations/accept')
            .send({ token: 'x'.repeat(32), password: 'Strong-Password9!' }).expect(200);
        await request(app).get('/api/access-control/me').expect(200);

        expect(managementService.savePermissions).toHaveBeenCalledWith(
            'STAFF0001',
            expect.objectContaining({ access_version: 1 }),
            'DOCTOR001'
        );
        expect(managementService.createInvitation).toHaveBeenCalledWith(
            expect.objectContaining({ email: 'staff@example.test', template_key: 'staff' }),
            'DOCTOR001'
        );
    });

    test.each([
        ['ACCESS_DENIED', 403, 'validateInvitation', '/api/access-control/invitations/validate'],
        ['INVITATION_EXPIRED', 410, 'validateInvitation', '/api/access-control/invitations/validate'],
        ['ACCESS_VERSION_CONFLICT', 409, 'savePermissions', '/api/access-control/users/STAFF0001/permissions']
    ])('returns stable %s failures', async (code, status, method, endpoint) => {
        const { app } = createApiTestApp({
            management: { [method]: jest.fn().mockRejectedValue(codedError(code, status)) }
        });
        const call = endpoint.includes('/permissions')
            ? request(app).put(endpoint).send({ permissions: [], access_version: 1 })
            : request(app).post(endpoint).send({ token: 'x'.repeat(32) });
        const response = await call.expect(status);
        expect(response.body.code).toBe(code);
    });

    test.each([
        ['AUTH_REQUIRED', 401],
        ['ACCOUNT_INACTIVE', 403]
    ])('preserves auth failure %s', async (code, status) => {
        const deny = (_req, res) => res.status(status).json({ success: false, code });
        const { app } = createApiTestApp({ auth: { verifyToken: deny } });
        const response = await request(app).get('/api/access-control/catalog').expect(status);
        expect(response.body.code).toBe(code);
    });
});

describe('invitation lifecycle service', () => {
    const { AccessControlManagementService } = require('../../services/AccessControlManagementService');

    function fakeConnection(responses) {
        return {
            query: jest.fn(async () => responses.shift() || [{ affectedRows: 1 }]),
            beginTransaction: jest.fn().mockResolvedValue(undefined),
            commit: jest.fn().mockResolvedValue(undefined),
            rollback: jest.fn().mockResolvedValue(undefined),
            release: jest.fn()
        };
    }

    test('creates a zero-permission pending account even when email delivery fails and never returns the raw token', async () => {
        const connection = fakeConnection([
            [[]],
            [[]],
            [{ affectedRows: 1 }],
            [{ affectedRows: 1 }],
            [{ affectedRows: 1 }],
            [{ affectedRows: 1 }]
        ]);
        const notificationService = { sendEmail: jest.fn().mockResolvedValue({ success: false }) };
        const service = new AccessControlManagementService({
            db: { getConnection: jest.fn().mockResolvedValue(connection) },
            notificationService,
            logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
            randomBytes: size => Buffer.alloc(size, size === 6 ? 0xab : 0xcd)
        });

        const result = await service.createInvitation({
            name: 'Staff Baru',
            email: 'STAFF@EXAMPLE.TEST',
            template_key: 'staff'
        }, 'DOCTOR001');

        expect(result).toEqual(expect.objectContaining({
            email_sent: false,
            invitation_expires_in_hours: 24,
            user: expect.objectContaining({
                is_active: false,
                status: 'pending',
                access_mode: 'account',
                permission_count: 0,
                role_id: null,
                template_key: 'staff',
                job_label: 'Staff'
            })
        }));
        expect(JSON.stringify(result)).not.toMatch(/token|activate-access/i);
        expect(connection.commit).toHaveBeenCalledTimes(1);
        expect(connection.rollback).not.toHaveBeenCalled();
        expect(notificationService.sendEmail).toHaveBeenCalledTimes(1);

        const userInsert = connection.query.mock.calls.find(call => /INSERT INTO users/.test(call[0]));
        expect(userInsert[1]).toEqual(expect.arrayContaining(['staff', null]));
        const policyInsert = connection.query.mock.calls.find(call => /INSERT INTO user_access_policies/.test(call[0]));
        expect(policyInsert[1]).toEqual([result.user.id, 'Staff', null]);
        const invitationInsert = connection.query.mock.calls.find(call => /INSERT INTO staff_access_invitations/.test(call[0]));
        expect(invitationInsert[1][1]).toMatch(/^[a-f0-9]{64}$/);
        expect(invitationInsert[1][1]).not.toContain('zc3N');
    });

    test('rejects duplicate email before creating any account', async () => {
        const connection = fakeConnection([[[{ new_id: 'EXISTING01' }]]]);
        const service = new AccessControlManagementService({
            db: { getConnection: jest.fn().mockResolvedValue(connection) },
            notificationService: { sendEmail: jest.fn() }
        });
        await expect(service.createInvitation({
            name: 'Staff Baru',
            email: 'staff@example.test',
            role_id: 22
        }, 'DOCTOR001')).rejects.toEqual(expect.objectContaining({ code: 'EMAIL_EXISTS', statusCode: 409 }));
        expect(connection.rollback).toHaveBeenCalledTimes(1);
        expect(connection.commit).not.toHaveBeenCalled();
    });

    test('treats an SMTP exception as a pending delivery failure without exposing the token', async () => {
        const logger = { warn: jest.fn(), info: jest.fn(), error: jest.fn() };
        const service = new AccessControlManagementService({
            notificationService: { sendEmail: jest.fn().mockRejectedValue(Object.assign(new Error('smtp down'), { code: 'SMTP_DOWN' })) },
            logger
        });
        await expect(service._deliverInvitation({
            email: 'staff@example.test',
            name: 'Staff Baru',
            token: 'x'.repeat(32)
        })).resolves.toBe(false);
        expect(logger.warn).toHaveBeenCalledWith('Staff invitation delivery unavailable', expect.objectContaining({
            account: expect.stringMatching(/^[a-f0-9]{12}$/),
            reason: 'SMTP_DOWN'
        }));
        expect(JSON.stringify(logger.warn.mock.calls)).not.toContain('staff@example.test');
        expect(JSON.stringify(logger.warn.mock.calls)).not.toContain('x'.repeat(32));
    });

    test.each([
        [{ used_at: new Date(), cancelled_at: null, is_expired: 0, is_active: 0 }, 'ACCESS_DENIED', 403],
        [{ used_at: null, cancelled_at: null, is_expired: 1, is_active: 0 }, 'INVITATION_EXPIRED', 410],
        [{ used_at: null, cancelled_at: new Date(), is_expired: 0, is_active: 0 }, 'ACCESS_DENIED', 403]
    ])('rejects unusable invitation state %#', async (stateRow, code, statusCode) => {
        const service = new AccessControlManagementService({
            db: { query: jest.fn().mockResolvedValue([[{
                id: 1,
                user_id: 'STAFF0001',
                user_type: 'staff',
                role_id: null,
                is_superadmin: 0,
                ...stateRow
            }]]) }
        });
        await expect(service.validateInvitation('x'.repeat(32))).rejects.toEqual(expect.objectContaining({ code, statusCode }));
    });

    test('accepts a valid invitation once with a bcrypt hash and activates the account', async () => {
        const invitation = {
            id: 91,
            user_id: 'STAFF0001',
            user_type: 'staff',
            role_id: null,
            is_superadmin: 0,
            is_active: 0,
            is_expired: 0,
            used_at: null,
            cancelled_at: null,
            access_version: 4,
            name: 'Staff Baru',
            email: 'staff@example.test',
            job_label: 'Bidan'
        };
        const connection = fakeConnection([
            [[invitation]],
            [{ affectedRows: 1 }],
            [{ affectedRows: 1 }],
            [{ affectedRows: 1 }],
            [{ affectedRows: 1 }]
        ]);
        const bcryptImpl = { hash: jest.fn().mockResolvedValue('bcrypt-hash-only') };
        const service = new AccessControlManagementService({
            db: { getConnection: jest.fn().mockResolvedValue(connection) },
            bcryptImpl
        });

        await expect(service.acceptInvitation('x'.repeat(32), 'Strong-Password9!')).resolves.toEqual({ accepted: true });
        expect(bcryptImpl.hash).toHaveBeenCalledWith('Strong-Password9!', 12);
        const passwordUpdate = connection.query.mock.calls.find(call => /SET password_hash = \?, is_active = 1/.test(call[0]));
        expect(passwordUpdate[1]).toEqual(['bcrypt-hash-only', 'STAFF0001']);
        expect(connection.query.mock.calls.some(call => /SET used_at = NOW/.test(call[0]))).toBe(true);
        expect(connection.commit).toHaveBeenCalledTimes(1);
    });
});

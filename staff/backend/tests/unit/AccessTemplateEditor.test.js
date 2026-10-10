'use strict';

const fs = require('fs');
const path = require('path');

jest.mock('../../db', () => ({ query: jest.fn(), getConnection: jest.fn() }));

const migrationPath = path.resolve(__dirname, '../../migrations/20261010_access_template_editor.sql');
const routePath = path.resolve(__dirname, '../../routes/access-control.js');

function fakeConnection(responses) {
    return {
        query: jest.fn(async () => responses.shift() || [{ affectedRows: 1 }]),
        beginTransaction: jest.fn().mockResolvedValue(undefined),
        commit: jest.fn().mockResolvedValue(undefined),
        rollback: jest.fn().mockResolvedValue(undefined),
        release: jest.fn()
    };
}

describe('persistent access templates', () => {
    test('migration adds template definitions, immutable audits, and explicit account membership', () => {
        const sql = fs.readFileSync(migrationPath, 'utf8');

        expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS staff_access_templates/i);
        expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS staff_access_template_permissions/i);
        expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS staff_access_template_audits/i);
        expect(sql).toMatch(/ALTER TABLE user_access_policies[\s\S]+template_key/i);
        expect(sql).toMatch(/staff_access_template_audits_no_update/i);
        expect(sql).toMatch(/staff_access_template_audits_no_delete/i);
        expect(sql).not.toMatch(/role_permissions|role_visibility/i);
    });

    test('lists a customized template from storage while retaining code defaults for untouched templates', async () => {
        const { AccessTemplateService } = require('../../services/AccessTemplateService');
        const db = {
            query: jest.fn()
                .mockResolvedValueOnce([[{
                    template_key: 'staff',
                    template_version: 4,
                    is_customized: 1,
                    updated_at: new Date('2026-10-10T00:00:00Z'),
                    updated_by: 'DOCTOR001'
                }]])
                .mockResolvedValueOnce([[
                    { template_key: 'staff', name: 'patients.view' },
                    { template_key: 'staff', name: 'appointments.view' }
                ]])
        };
        const service = new AccessTemplateService({ db });

        const templates = await service.listTemplates();
        const byKey = new Map(templates.map(template => [template.key, template]));

        expect(templates.map(template => template.key)).toEqual([
            'owner', 'coordinator', 'pharmacy', 'staff', 'observer'
        ]);
        expect(byKey.get('staff')).toEqual(expect.objectContaining({
            template_version: 4,
            is_customized: true,
            permissions: expect.arrayContaining(['patients.view', 'appointments.view'])
        }));
        expect(byKey.get('owner').template_version).toBe(1);
        expect(byKey.get('owner').is_customized).toBe(false);
    });

    test('save-only updates the template and audit without mutating account grants', async () => {
        const { AccessTemplateService } = require('../../services/AccessTemplateService');
        const { resolveStaffPermissions } = require('../../services/AccessControlManagementService');
        const resolved = resolveStaffPermissions(['patients.view']);
        const connection = fakeConnection([
            [[{ template_version: 2, is_customized: 1 }]],
            [[{ name: 'patients.view' }]],
            [{ affectedRows: 1 }],
            [resolved.map((name, index) => ({ id: index + 1, name }))],
            [{ affectedRows: 1 }],
            [{ affectedRows: 1 }],
            [{ affectedRows: 1 }]
        ]);
        const service = new AccessTemplateService({
            db: { getConnection: jest.fn().mockResolvedValue(connection) }
        });

        const result = await service.saveTemplate('staff', {
            permissions: ['patients.view'],
            template_version: 2
        }, 'DOCTOR001', { applyToAccounts: false });

        expect(result).toEqual(expect.objectContaining({
            affected_count: 0,
            affected_user_ids: [],
            template: expect.objectContaining({ key: 'staff', template_version: 3 })
        }));
        const sql = connection.query.mock.calls.map(call => call[0]).join('\n');
        expect(sql).toMatch(/staff_access_template_permissions/i);
        expect(sql).toMatch(/staff_access_template_audits/i);
        expect(sql).not.toMatch(/(?:DELETE FROM|INSERT INTO) user_permission_grants/i);
        expect(connection.commit).toHaveBeenCalledTimes(1);
        expect(connection.rollback).not.toHaveBeenCalled();
    });

    test('rejects a stale template version before writing any template state', async () => {
        const { AccessTemplateService } = require('../../services/AccessTemplateService');
        const connection = fakeConnection([[[{ template_version: 5, is_customized: 1 }]]]);
        const service = new AccessTemplateService({
            db: { getConnection: jest.fn().mockResolvedValue(connection) }
        });

        await expect(service.saveTemplate('staff', {
            permissions: ['patients.view'],
            template_version: 4
        }, 'DOCTOR001')).rejects.toEqual(expect.objectContaining({
            code: 'ACCESS_VERSION_CONFLICT',
            statusCode: 409
        }));
        expect(connection.rollback).toHaveBeenCalledTimes(1);
        expect(connection.query).toHaveBeenCalledTimes(1);
    });

    test('exposes doctor-only save and apply routes', () => {
        const source = fs.readFileSync(routePath, 'utf8');
        expect(source).toContain("router.put('/templates/:key'");
        expect(source).toContain("router.post('/templates/:key/apply'");
        expect(source.indexOf('router.use(auth.verifyToken, auth.verifyActiveStaff, auth.requireSuperadmin)'))
            .toBeLessThan(source.indexOf("router.put('/templates/:key'"));
    });

    test('bulk apply targets only explicit non-doctor members and increments each account version', async () => {
        const { AccessTemplateService } = require('../../services/AccessTemplateService');
        const {
            deriveNavigationPermissions,
            resolveStaffPermissions
        } = require('../../services/AccessControlManagementService');
        const templatePermissions = resolveStaffPermissions(['patients.view']);
        const assigned = [...new Set([
            ...templatePermissions,
            ...deriveNavigationPermissions(templatePermissions)
        ])].sort((left, right) => left.localeCompare(right));
        const connection = fakeConnection([
            [[{ template_version: 7, is_customized: 1 }]],
            [[{ name: 'patients.view' }]],
            [{ affectedRows: 1 }],
            [templatePermissions.map((name, index) => ({ id: index + 1, name }))],
            [{ affectedRows: templatePermissions.length }],
            [{ affectedRows: 1 }],
            [[{ user_id: 'STAFF0001', access_version: 3 }]],
            [assigned.map((name, index) => ({ id: index + 100, name }))],
            [[{ name: 'patients.view' }]],
            [{ affectedRows: 1 }],
            [{ affectedRows: assigned.length }],
            [{ affectedRows: 1 }],
            [{ affectedRows: 1 }],
            [{ affectedRows: 1 }]
        ]);
        const service = new AccessTemplateService({
            db: { getConnection: jest.fn().mockResolvedValue(connection) }
        });

        const result = await service.saveTemplate('staff', {
            permissions: ['patients.view'],
            template_version: 7
        }, 'DOCTOR001', { applyToAccounts: true });

        expect(result.affected_user_ids).toEqual(['STAFF0001']);
        expect(result.affected_count).toBe(1);
        const targetSelect = connection.query.mock.calls.find(call => /FROM user_access_policies uap/.test(call[0]));
        expect(targetSelect[0]).toMatch(/uap\.template_key = \?/i);
        expect(targetSelect[0]).toMatch(/u\.is_superadmin, 0\) = 0/i);
        expect(targetSelect[0]).toMatch(/u\.role_id, 0\) <> \?/i);
        expect(targetSelect[1]).toEqual(['staff', 1]);
        expect(connection.query.mock.calls.some(call => (
            /UPDATE user_access_policies SET access_version = \?/.test(call[0])
            && call[1][0] === 4
            && call[1][1] === 'STAFF0001'
        ))).toBe(true);
        expect(connection.query.mock.calls.some(call => (
            /INSERT INTO user_permission_audits/.test(call[0])
            && call[1][1] === 'STAFF0001'
            && call[1][2] === 4
        ))).toBe(true);
        expect(connection.commit).toHaveBeenCalledTimes(1);
    });

    test('bulk apply rolls back template and account changes together on any write failure', async () => {
        const { AccessTemplateService } = require('../../services/AccessTemplateService');
        const { resolveStaffPermissions } = require('../../services/AccessControlManagementService');
        const templatePermissions = resolveStaffPermissions(['patients.view']);
        const connection = fakeConnection([
            [[{ template_version: 1, is_customized: 0 }]],
            [{ affectedRows: 1 }],
            [templatePermissions.map((name, index) => ({ id: index + 1, name }))],
            [{ affectedRows: templatePermissions.length }],
            [{ affectedRows: 1 }],
            [[{ user_id: 'STAFF0001', access_version: 2 }]]
        ]);
        connection.query.mockImplementationOnce(async () => [[{ template_version: 1, is_customized: 0 }]])
            .mockImplementationOnce(async () => [{ affectedRows: 1 }])
            .mockImplementationOnce(async () => [templatePermissions.map((name, index) => ({ id: index + 1, name }))])
            .mockImplementationOnce(async () => [{ affectedRows: templatePermissions.length }])
            .mockImplementationOnce(async () => [{ affectedRows: 1 }])
            .mockImplementationOnce(async () => [[{ user_id: 'STAFF0001', access_version: 2 }]])
            .mockRejectedValueOnce(new Error('permission lookup failed'));
        const service = new AccessTemplateService({
            db: { getConnection: jest.fn().mockResolvedValue(connection) }
        });

        await expect(service.saveTemplate('staff', {
            permissions: ['patients.view'],
            template_version: 1
        }, 'DOCTOR001', { applyToAccounts: true })).rejects.toThrow('permission lookup failed');
        expect(connection.rollback).toHaveBeenCalledTimes(1);
        expect(connection.commit).not.toHaveBeenCalled();
    });
});

describe('template-backed staff invitations', () => {
    test('assigns the latest persisted template before the invited account is activated', async () => {
        const { AccessControlManagementService } = require('../../services/AccessControlManagementService');
        const {
            deriveNavigationPermissions,
            resolveStaffPermissions
        } = require('../../services/AccessControlManagementService');
        const templatePermissions = resolveStaffPermissions(['patients.view']);
        const assigned = [...new Set([
            ...templatePermissions,
            ...deriveNavigationPermissions(templatePermissions)
        ])].sort((left, right) => left.localeCompare(right));
        const connection = fakeConnection([
            [[]],
            [[]],
            [{ affectedRows: 1 }],
            [{ affectedRows: 1 }],
            [assigned.map((name, index) => ({ id: index + 1, name }))],
            [{ affectedRows: assigned.length }],
            [{ affectedRows: 1 }],
            [{ affectedRows: 1 }]
        ]);
        const templateService = {
            getTemplate: jest.fn().mockResolvedValue({
                key: 'staff',
                label: 'Staff',
                permissions: templatePermissions,
                template_version: 9
            })
        };
        const service = new AccessControlManagementService({
            db: { getConnection: jest.fn().mockResolvedValue(connection) },
            templateService,
            notificationService: { sendEmail: jest.fn().mockResolvedValue({ success: true }) },
            randomBytes: size => Buffer.alloc(size, size === 6 ? 0xab : 0xcd)
        });

        const result = await service.createInvitation({
            name: 'Staff Baru',
            email: 'staff@example.test',
            template_key: 'staff'
        }, 'DOCTOR001');

        expect(templateService.getTemplate).toHaveBeenCalledWith('staff', connection);
        const policyInsert = connection.query.mock.calls.find(call => /INSERT INTO user_access_policies/.test(call[0]));
        expect(policyInsert[0]).toMatch(/template_key/i);
        expect(policyInsert[1]).toEqual([result.user.id, 'Staff', null, 'staff']);
        const grantsInsert = connection.query.mock.calls.find(call => /INSERT INTO user_permission_grants/.test(call[0]));
        expect(grantsInsert[1][0]).toHaveLength(assigned.length);
        expect(result.user.permission_count).toBe(assigned.length);
    });
});

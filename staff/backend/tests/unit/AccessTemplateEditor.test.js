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
});

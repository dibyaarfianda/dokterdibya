'use strict';

process.env.JWT_SECRET ||= 'task11-test-secret';

const fs = require('fs');
const path = require('path');

const backendRoot = path.resolve(__dirname, '../..');
const publicRoot = path.resolve(backendRoot, '../public');
const TASK11_PERMISSION_PREFIXES = [
    'analytics.', 'assistant_daf.', 'clinic_monitor.', 'clinical_ai.',
    'dashboard.', 'docboard.', 'integrations.', 'logs.', 'medical_import.',
    'patient_access.', 'patient_activity.', 'patient_demo.', 'system.', 'usg_reader.'
];

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
        accountAccessResolution: { permission, ruleId: 'staff-task11' },
        context: { requestId: 'task11-test' },
        path: '/task11'
    };
}

describe('Task 11 monitoring, integration, and system route matrix', () => {
    test.each([
        ['POST', '/api/medify-batch/credentials', 'integrations.write'],
        ['POST', '/api/medify-batch/sync/gambiran', 'integrations.sync'],
        ['GET', '/api/medify-batch/status', 'integrations.view'],
        ['POST', '/api/metrics/reset', 'system.reset'],
        ['GET', '/api/metrics', 'system.monitor'],
        ['POST', '/api/app-version/update', 'system.write'],
        ['POST', '/api/patient-demo/reset', 'patient_demo.manage'],
        ['GET', '/api/logs/summary', 'logs.view'],
        ['GET', '/api/docboard/audit/gambiran/export.xlsx', 'docboard.view'],
        ['POST', '/api/docboard/command/cleanup', 'docboard.write'],
        ['POST', '/api/docboard/command/prune-rules', 'docboard.write'],
        ['POST', '/api/medical-import/parse', 'medical_import.use'],
        ['POST', '/api/usg-reader/analyze', 'usg_reader.use']
    ])('%s %s requires %s', (method, route, permission) => {
        const { createRuntimeAccessResolver } = require('../../security/accountModeAccess');
        const resolve = createRuntimeAccessResolver();
        expect(resolve(method, route)).toEqual(expect.objectContaining({ permission }));
    });

    test('every mapped Task 11 HTTP route allows its exact grant and denies a zero-grant account', async () => {
        const { buildRuntimeAccessRules, createAccountModeAccessBoundary } = require('../../security/accountModeAccess');
        const routes = buildRuntimeAccessRules({
            serverFile: path.join(backendRoot, 'server.js'),
            routesDir: path.join(backendRoot, 'routes')
        }).filter(route => TASK11_PERMISSION_PREFIXES.some(prefix => route.resolution?.permission?.startsWith(prefix)));
        expect(routes.length).toBeGreaterThanOrEqual(150);

        const state = {
            userId: 'STAFF-ACCOUNT', userType: 'staff', isActive: true, isSuperadmin: false,
            roleId: null, roleName: 'staff', mode: 'account', accessVersion: 1
        };
        for (const route of routes) {
            const run = async permissions => {
                const req = {
                    method: route.method,
                    originalUrl: route.fullPath,
                    headers: { authorization: 'Bearer test-token' },
                    context: { requestId: 'task11-complete-matrix' }
                };
                const res = responseDouble();
                const next = jest.fn();
                const boundary = createAccountModeAccessBoundary({
                    verifyJwt: () => ({ id: state.userId, user_type: 'staff' }),
                    accessControlService: {
                        getStaffAccountState: jest.fn().mockResolvedValue(state),
                        getEffectiveAccess: jest.fn().mockResolvedValue({ ...state, permissions: new Set(permissions) })
                    },
                    resolveRequestAccess: () => route.resolution,
                    logger: { warn: jest.fn(), error: jest.fn() }
                });
                await boundary(req, res, next);
                return { res, next };
            };

            const permission = route.resolution.permission;
            expect((await run([permission])).next).toHaveBeenCalledTimes(1);
            const denied = await run([]);
            expect(denied.next).not.toHaveBeenCalled();
            expect(denied.res.body).toEqual(expect.objectContaining({ code: 'ACCESS_DENIED' }));
        }
    });
});

describe('Task 11 delegated guards and protected actions', () => {
    test('Task 11 permissions delegate while access management and emergency reset stay doctor-only', () => {
        const { isDelegatedAccountPermission } = require('../../middleware/auth');
        for (const permission of [
            'analytics.export', 'assistant_daf.use', 'clinic_monitor.sync', 'clinical_ai.use',
            'dashboard.view', 'docboard.delete', 'integrations.write', 'logs.view',
            'medical_import.use', 'patient_access.manage', 'patient_activity.view',
            'patient_demo.manage', 'system.monitor', 'system.write', 'usg_reader.use'
        ]) {
            expect(isDelegatedAccountPermission(accountRequest(permission), [permission])).toBe(true);
        }
        expect(isDelegatedAccountPermission(accountRequest('access.manage'), ['access.manage'])).toBe(false);
        expect(isDelegatedAccountPermission(accountRequest('system.reset'), ['system.reset'])).toBe(false);
    });

    test('legacy role guards accept the exact routed account grant but reject protected actions', () => {
        const { requireSuperadmin, requireRoles, requireDoctorRole } = require('../../middleware/auth');
        for (const guard of [requireSuperadmin, requireRoles('admin'), requireDoctorRole]) {
            const next = jest.fn();
            const res = responseDouble();
            guard(accountRequest('system.write'), res, next);
            expect(next).toHaveBeenCalledTimes(1);
        }
        for (const permission of ['access.manage', 'system.reset']) {
            const next = jest.fn();
            const res = responseDouble();
            requireSuperadmin(accountRequest(permission), res, next);
            expect(next).not.toHaveBeenCalled();
            expect(res.statusCode).toBe(403);
        }
    });

    test('protected permissions are omitted from the doctor-managed catalog', () => {
        const { getDelegableCatalog } = require('../../services/AccessControlManagementService');
        const names = new Set(getDelegableCatalog().map(item => item.name));
        expect(names.has('access.manage')).toBe(false);
        expect(names.has('system.reset')).toBe(false);
        expect(names.has('system.monitor')).toBe(true);
        expect(names.has('system.write')).toBe(true);
        expect(names.has('integrations.sync')).toBe(true);
    });
});

describe('Task 11 management UI and action visibility', () => {
    test('Layout A rollout is enabled and system navigation opens with read access', () => {
        const main = fs.readFileSync(path.join(publicRoot, 'scripts/main.js'), 'utf8');
        const registry = require('../../config/accessControlRegistry');
        expect(main).toContain('const ACCESS_CONTROL_ROLLOUT_ENABLED = true;');
        expect(registry.STAFF_NAVIGATION_MAP['nav-medify-sync']).toBe('integrations.view');
        expect(registry.STAFF_NAVIGATION_MAP['management-nav-kelola-roles']).toBe('navigation.kelola_roles');
    });

    test('integration and system action controls use exact account permissions', () => {
        const medify = fs.readFileSync(path.join(publicRoot, 'scripts/medify-sync.js'), 'utf8');
        const email = fs.readFileSync(path.join(publicRoot, 'scripts/email-settings.js'), 'utf8');
        const demo = fs.readFileSync(path.join(publicRoot, 'scripts/patient-demo-manager.js'), 'utf8');
        const blocklist = fs.readFileSync(path.join(publicRoot, 'scripts/patient-block-list.js'), 'utf8');
        expect(medify).toContain("hasAccountPermission('integrations.sync')");
        expect(medify).toContain("hasAccountPermission('integrations.write')");
        expect(email).toContain("canUsePermission('system.write')");
        expect(demo).toContain("hasAccountPermission('patient_demo.manage')");
        expect(blocklist).toContain("hasAccountPermission('patient_access.manage')");
        expect(medify).toContain("element.dataset.accountPermission = 'integrations.sync'");
        expect(medify).toContain("element.dataset.accountPermission = 'integrations.write'");
        expect(demo).toContain("button.dataset.accountPermission = 'patient_demo.manage'");
    });

    test('Staff chat remains exempt and operational realtime events are permission-routed', () => {
        const realtime = fs.readFileSync(path.join(backendRoot, 'security/realtimePermissions.js'), 'utf8');
        const registry = fs.readFileSync(path.join(backendRoot, 'config/accessControlRegistry.js'), 'utf8');
        expect(registry).toMatch(/chat[\s\S]{0,120}staff_chat/);
        expect(realtime).toContain("'medify_progress': 'integrations.view'");
        expect(realtime).toContain("'medify_sync_complete': 'integrations.view'");
    });
});

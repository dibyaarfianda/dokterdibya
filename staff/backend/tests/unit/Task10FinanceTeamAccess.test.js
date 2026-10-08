'use strict';

process.env.JWT_SECRET ||= 'task10-test-secret';

const fs = require('fs');
const path = require('path');

const backendRoot = path.resolve(__dirname, '../..');
const publicRoot = path.resolve(backendRoot, '../public');
const TASK10_PERMISSION_PREFIXES = [
    'billing.', 'finance_analysis.', 'inventory.', 'medications.',
    'obat_alkes.', 'obat_alkes_logs.', 'obat_logs.', 'services.',
    'settings.medications_manage', 'settings.services_manage', 'stock.',
    'suppliers.', 'cost_estimates.', 'staff_briefing.', 'staff_payroll.',
    'staff_points.', 'staff_workdesk.', 'tanya_finance.'
];

function responseDouble() {
    return {
        statusCode: 200,
        body: null,
        status: jest.fn(function status(code) { this.statusCode = code; return this; }),
        json: jest.fn(function json(body) { this.body = body; return this; })
    };
}

function accountRequest(permission) {
    return {
        user: { id: 'STAFF-ACCOUNT', role: 'staff', role_id: null, user_type: 'staff' },
        accountAccess: { mode: 'account', permissions: new Set([permission]) },
        accountAccessResolution: { permission, ruleId: 'staff-task10' },
        context: { requestId: 'task10-test' },
        path: '/task10'
    };
}

describe('Task 10 medicine, finance, and team route matrix', () => {
    test.each([
        ['POST', '/api/inventory/purchase', 'inventory.purchase'],
        ['POST', '/api/inventory/adjust', 'inventory.adjust'],
        ['POST', '/api/inventory/deduct', 'inventory.adjust'],
        ['GET', '/api/inventory/activity-log', 'obat_logs.view'],
        ['GET', '/api/obat/download/price-list', 'obat_logs.export'],
        ['PATCH', '/api/obat/7/stock', 'stock.update'],
        ['PATCH', '/api/v1/obat/7/stock', 'stock.update'],
        ['POST', '/api/obat-sales/7/confirm', 'billing.finalize'],
        ['POST', '/api/obat-sales/7/mark-paid', 'billing.process_payment'],
        ['POST', '/api/obat-sales/7/invoice-base64', 'billing.export'],
        ['POST', '/api/obat-sales/7/etiket-base64', 'billing.export'],
        ['POST', '/api/obat-sales/7/print-invoice', 'billing.export'],
        ['POST', '/api/sunday-clinic/billing/DRD1/cancel', 'billing.reset'],
        ['POST', '/api/sunday-clinic/billing/DRD1/mark-paid', 'billing.process_payment'],
        ['POST', '/api/sunday-clinic/billing/DRD1/print-invoice', 'billing.export'],
        ['DELETE', '/api/sunday-clinic/billing/DRD1/items/id/5', 'billing.reset'],
        ['POST', '/api/sunday-clinic/closing', 'billing.finalize'],
        ['POST', '/api/staff-briefing/today/start', 'staff_briefing.finalize'],
        ['POST', '/api/staff-payroll/batches/1/finalize', 'staff_payroll.finalize'],
        ['GET', '/api/staff-payroll/driver-payrolls', 'staff_payroll.view'],
        ['PUT', '/api/staff-payroll/driver-payrolls/2026-10', 'staff_payroll.write'],
        ['PATCH', '/api/staff-payroll/driver-payrolls/2026-10/name', 'staff_payroll.write'],
        ['DELETE', '/api/staff-payroll/driver-payrolls/2026-10', 'staff_payroll.delete'],
        ['POST', '/api/staff-payroll/driver-payrolls/2026-10/finalize', 'staff_payroll.finalize'],
        ['GET', '/api/estimasi-biaya', 'cost_estimates.view'],
        ['PUT', '/api/estimasi-biaya', 'cost_estimates.write'],
        ['GET', '/api/suppliers', 'suppliers.view'],
        ['DELETE', '/api/suppliers/1', 'suppliers.delete']
    ])('%s %s requires %s', (method, route, permission) => {
        const { createRuntimeAccessResolver } = require('../../security/accountModeAccess');
        const resolve = createRuntimeAccessResolver();
        expect(resolve(method, route)).toEqual(expect.objectContaining({ permission }));
    });

    test('every mapped Task 10 HTTP route allows its exact grant and denies a zero-grant account', async () => {
        const { buildRuntimeAccessRules, createAccountModeAccessBoundary } = require('../../security/accountModeAccess');
        const routes = buildRuntimeAccessRules({
            serverFile: path.join(backendRoot, 'server.js'),
            routesDir: path.join(backendRoot, 'routes')
        }).filter(route => TASK10_PERMISSION_PREFIXES.some(prefix => route.resolution?.permission?.startsWith(prefix)));
        expect(routes.length).toBeGreaterThanOrEqual(135);

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
                    context: { requestId: 'task10-complete-matrix' }
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

describe('Task 10 delegated guards, UI actions, and realtime boundaries', () => {
    test('finance analysis selection includes every read dependency used by its page', () => {
        const {
            getDelegableCatalog,
            resolveSelectedPermissions
        } = require('../../services/AccessControlManagementService');
        const finance = getDelegableCatalog().find(item => item.name === 'finance_analysis.view');
        expect(finance.dependencies).toEqual(expect.arrayContaining([
            'analytics.view',
            'inventory.view',
            'visits.view'
        ]));
        expect(resolveSelectedPermissions(['finance_analysis.view'])).toEqual(expect.arrayContaining([
            'finance_analysis.view',
            'analytics.view',
            'inventory.view',
            'visits.view'
        ]));
    });

    test('delegated payroll makes both its item and Private parent navigable', () => {
        const { STAFF_NAVIGATION_MAP } = require('../../config/accessControlRegistry');
        const { accessControlService } = require('../../services/AccessControlService');
        expect(STAFF_NAVIGATION_MAP['nav-private']).toBe('navigation.staff_payroll');
        const access = accessControlService.toPublicAccess({
            mode: 'account',
            accessVersion: 1,
            isDoctorProtected: false,
            jobLabel: 'Keuangan',
            permissions: new Set(['navigation.staff_payroll']),
            legacyPermissions: new Set()
        });
        expect(access.navigation).toEqual(expect.arrayContaining(['nav-private', 'nav-staff-payroll']));
    });

    test('Task 10 permissions delegate while system rollout remains closed', () => {
        const { isDelegatedAccountPermission } = require('../../middleware/auth');
        for (const permission of [
            'billing.process_payment', 'inventory.adjust', 'medications.sales_delete',
            'obat_alkes.edit', 'settings.services_manage', 'suppliers.delete',
            'cost_estimates.write', 'staff_briefing.finalize', 'staff_payroll.finalize',
            'staff_workdesk.write', 'tanya_finance.export'
        ]) {
            expect(isDelegatedAccountPermission(accountRequest(permission), [permission])).toBe(true);
        }
        expect(isDelegatedAccountPermission(accountRequest('system.reset'), ['system.reset'])).toBe(false);
    });

    test('legacy accounting and team guards accept only their exact account permission', () => {
        const auth = fs.readFileSync(path.join(backendRoot, 'middleware/auth.js'), 'utf8');
        const inventory = fs.readFileSync(path.join(backendRoot, 'routes/inventory.js'), 'utf8');
        const billings = fs.readFileSync(path.join(backendRoot, 'routes/billings.js'), 'utf8');
        const billing = fs.readFileSync(path.join(backendRoot, 'routes/sunday-clinic/billing.js'), 'utf8');
        const closing = fs.readFileSync(path.join(backendRoot, 'routes/sunday-clinic/closing.js'), 'utf8');
        const prescription = fs.readFileSync(path.join(backendRoot, 'routes/sunday-clinic/prescription.js'), 'utf8');
        const payroll = fs.readFileSync(path.join(backendRoot, 'routes/staff-payroll.js'), 'utf8');
        const briefing = fs.readFileSync(path.join(backendRoot, 'routes/staff-briefing.js'), 'utf8');
        const tanyaStats = fs.readFileSync(path.join(backendRoot, 'routes/tanya-stats.js'), 'utf8');
        expect(auth).toContain('function requireDoctorRoleOrAccountPermission(permission)');
        expect(inventory).toContain("requireMenuAccessOrAccountPermission('obat_alkes', 'inventory.adjust')");
        expect(billings).toContain("requireMenuAccessOrAccountPermission('keuangan', 'billing.process_payment')");
        expect(billing).toContain("requireSuperadminOrAccountPermission('billing.reset')");
        expect(closing).toContain("requireDoctorRoleOrAccountPermission('billing.finalize')");
        expect(prescription).toContain("requireDoctorRoleOrAccountPermission('medications.select')");
        expect(payroll).toContain("requireDoctorRoleOrAccountPermission('staff_payroll.finalize')");
        expect(briefing).toContain("requireSuperadminOrAccountPermission('staff_briefing.finalize')");
        expect(tanyaStats).toContain("requireSuperadminOrAccountPermission('tanya_finance.view')");
    });

    test('medicine, billing, payroll, briefing, and estimate UI checks exact action permissions', () => {
        const medicine = fs.readFileSync(path.join(publicRoot, 'scripts/kelola-obat.js'), 'utf8');
        const sales = fs.readFileSync(path.join(publicRoot, 'scripts/penjualan-obat.js'), 'utf8');
        const billing = fs.readFileSync(path.join(publicRoot, 'scripts/sunday-clinic/components/shared/billing.js'), 'utf8');
        const payroll = fs.readFileSync(path.join(publicRoot, 'scripts/staff-payroll.js'), 'utf8');
        const briefing = fs.readFileSync(path.join(publicRoot, 'scripts/staff-briefing.js'), 'utf8');
        const estimates = fs.readFileSync(path.join(publicRoot, 'scripts/pages/estimasi-biaya-page.js'), 'utf8');
        for (const permission of ['obat_alkes.create', 'obat_alkes.edit', 'obat_alkes.delete']) {
            expect(medicine).toContain(`hasAccountPermission('${permission}')`);
        }
        for (const permission of ['medications.sales_write', 'medications.sales_delete', 'billing.finalize', 'billing.process_payment', 'billing.export']) {
            expect(sales).toContain(`hasAccountPermission('${permission}')`);
        }
        for (const permission of ['billing.create', 'billing.reset', 'billing.finalize', 'billing.process_payment', 'billing.export']) {
            expect(billing).toContain(`hasAccountPermission('${permission}')`);
        }
        for (const permission of ['staff_payroll.write', 'staff_payroll.delete', 'staff_payroll.finalize', 'staff_payroll.export']) {
            expect(payroll).toContain(`hasAccountPermission('${permission}')`);
        }
        expect(briefing).toContain("hasAccountPermission('staff_briefing.write')");
        expect(briefing).toContain("hasAccountPermission('staff_briefing.finalize')");
        expect(estimates).toContain("hasAccountPermission('cost_estimates.write')");
    });

    test('billing events remain permission-routed, team modules have no broad broadcasts, and Staff chat stays exempt', () => {
        const realtime = fs.readFileSync(path.join(backendRoot, 'security/realtimePermissions.js'), 'utf8');
        const sync = fs.readFileSync(path.join(backendRoot, 'realtime-sync.js'), 'utf8');
        const payroll = fs.readFileSync(path.join(backendRoot, 'routes/staff-payroll.js'), 'utf8');
        const briefing = fs.readFileSync(path.join(backendRoot, 'routes/staff-briefing.js'), 'utf8');
        const registry = fs.readFileSync(path.join(backendRoot, 'config/accessControlRegistry.js'), 'utf8');
        for (const event of ['billing:updated', 'billing_updated', 'payment_received', 'billing_confirmed', 'billing_paid', 'revision_requested']) {
            expect(realtime).toContain(`'${event}': 'billing.view'`);
        }
        expect(sync).toContain("permissionRoom(permission)");
        expect(sync).not.toContain("io.to('staff').emit(event.type");
        expect(payroll).not.toMatch(/\.to\(['\"]staff['\"]\)/);
        expect(briefing).not.toMatch(/\.to\(['\"]staff['\"]\)/);
        expect(registry).toMatch(/chat[\s\S]{0,120}staff_chat/);
    });
});

'use strict';

process.env.JWT_SECRET ||= 'task8-test-secret';

const fs = require('fs');
const path = require('path');

const backendRoot = path.resolve(__dirname, '../..');
const publicRoot = path.resolve(backendRoot, '../public');
const TASK8_PERMISSION_PREFIXES = [
    'appointments.', 'booking.', 'hospital_appointments.', 'online_queue.',
    'practice_schedules.', 'sunday_clinic.'
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
        accountAccessResolution: { permission, ruleId: 'staff-task8' },
        context: { requestId: 'task8-test' },
        path: '/task8'
    };
}

describe('Task 8 clinic, schedule, booking, and queue route matrix', () => {
    test.each([
        ['GET', '/api/appointments', 'appointments.view'],
        ['POST', '/api/appointments', 'appointments.create'],
        ['PATCH', '/api/appointments/A-1/status', 'appointments.edit'],
        ['DELETE', '/api/appointments/A-1', 'appointments.delete'],
        ['DELETE', '/api/appointments/A-1/permanent', 'appointments.delete'],
        ['POST', '/api/appointments/hospital/rsia_melinda/run-robot', 'appointments.sync'],
        ['POST', '/api/appointments/hospital/rsia_melinda/resolve-queue-patient', 'appointments.sync'],
        ['GET', '/api/appointment-archive', 'appointments.view'],
        ['POST', '/api/appointment-archive/archive-old', 'appointments.archive'],
        ['POST', '/api/appointment-archive/restore/A-1', 'appointments.archive'],
        ['DELETE', '/api/appointment-archive/A-1', 'appointments.delete'],
        ['GET', '/api/sunday-appointments/list', 'online_queue.view'],
        ['POST', '/api/sunday-appointments/A-1/trigger-confirmation-popup', 'online_queue.write'],
        ['POST', '/api/sunday-appointments/A-1/manual-confirm', 'online_queue.write'],
        ['PUT', '/api/sunday-appointments/A-1/status', 'online_queue.write'],
        ['POST', '/api/sunday-appointments/A-1/start-clinic-record', 'sunday_clinic.create'],
        ['GET', '/api/sunday-clinic/queue/today', 'online_queue.view'],
        ['PUT', '/api/sunday-clinic/queue/settings', 'online_queue.write'],
        ['GET', '/api/practice-schedules/all', 'practice_schedules.view'],
        ['POST', '/api/practice-schedules', 'practice_schedules.write'],
        ['DELETE', '/api/practice-schedules/1', 'practice_schedules.delete'],
        ['POST', '/api/practice-schedules/disabled-dates', 'practice_schedules.write'],
        ['DELETE', '/api/practice-schedules/disabled-dates/1', 'practice_schedules.delete'],
        ['GET', '/api/booking-settings', 'booking.view'],
        ['PUT', '/api/booking-settings/1', 'booking.manage'],
        ['POST', '/api/booking-settings/force-cancel/A-1', 'booking.manage']
    ])('%s %s requires %s', (method, route, permission) => {
        const { createRuntimeAccessResolver } = require('../../security/accountModeAccess');
        const resolve = createRuntimeAccessResolver();
        expect(resolve(method, route)).toEqual(expect.objectContaining({ permission }));
    });

    test('every mapped Task 8 HTTP route allows its exact grant and denies a zero-grant account', async () => {
        const { buildRuntimeAccessRules, createAccountModeAccessBoundary } = require('../../security/accountModeAccess');
        const routes = buildRuntimeAccessRules({
            serverFile: path.join(backendRoot, 'server.js'),
            routesDir: path.join(backendRoot, 'routes')
        }).filter(route => TASK8_PERMISSION_PREFIXES.some(prefix => route.resolution?.permission?.startsWith(prefix)));
        expect(routes.length).toBeGreaterThanOrEqual(51);

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
                    context: { requestId: 'task8-complete-matrix' }
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

describe('Task 8 delegated guards and UI actions', () => {
    test('Task 8 permissions delegate while later rollout groups remain closed', () => {
        const { isDelegatedAccountPermission } = require('../../middleware/auth');
        for (const permission of [
            'appointments.view', 'appointments.sync', 'booking.manage', 'online_queue.write',
            'practice_schedules.delete', 'sunday_clinic.create'
        ]) {
            expect(isDelegatedAccountPermission(accountRequest(permission), [permission])).toBe(true);
        }
        expect(isDelegatedAccountPermission(accountRequest('billing.process_payment'), ['billing.process_payment'])).toBe(false);
    });

    test('legacy route guards accept the exact boundary-authorized Task 8 permission', () => {
        const appointments = fs.readFileSync(path.join(backendRoot, 'routes/appointments.js'), 'utf8');
        const archive = fs.readFileSync(path.join(backendRoot, 'routes/appointment-archive.js'), 'utf8');
        const schedules = fs.readFileSync(path.join(backendRoot, 'routes/practice-schedules.js'), 'utf8');
        const booking = fs.readFileSync(path.join(backendRoot, 'routes/booking-settings.js'), 'utf8');
        expect(appointments).toContain("requirePermission('booking.view', 'appointments.view')");
        expect(appointments).toContain("requirePermission('booking.view', 'appointments.sync')");
        expect(appointments).toContain("requirePermission('booking.manage', 'appointments.create')");
        expect(appointments).toContain("requirePermission('booking.manage', 'appointments.edit')");
        expect(appointments).toContain("requireSuperadminOrAccountPermission('appointments.delete')");
        expect(archive).toContain("requireSuperadminOrAccountPermission('appointments.delete')");
        expect(schedules).toContain("isDelegatedAccountPermission(req, ['practice_schedules.delete'])");
        expect(booking).toContain("requireSuperadminOrAccountPermission('booking.manage')");
    });

    test('clinic, appointment, schedule, booking, and online-queue UI checks exact permissions', () => {
        const queue = fs.readFileSync(path.join(publicRoot, 'scripts/antrian-online.js'), 'utf8');
        const appointments = fs.readFileSync(path.join(publicRoot, 'scripts/appointments.js'), 'utf8');
        const schedules = fs.readFileSync(path.join(publicRoot, 'scripts/kelola-jadwal.js'), 'utf8');
        const booking = fs.readFileSync(path.join(publicRoot, 'scripts/kelola-booking-settings.js'), 'utf8');
        const clinic = fs.readFileSync(path.join(publicRoot, 'scripts/klinik-private.js'), 'utf8');
        const main = fs.readFileSync(path.join(publicRoot, 'scripts/main.js'), 'utf8');
        expect(queue).toContain("hasPermission('online_queue.write')");
        for (const permission of ['appointments.create', 'appointments.edit', 'appointments.delete']) {
            expect(appointments).toContain(`hasPermission('${permission}')`);
        }
        for (const permission of ['practice_schedules.write', 'practice_schedules.delete']) {
            expect(schedules).toContain(`hasAccountPermission('${permission}')`);
        }
        expect(booking).toContain("hasAccountPermission('booking.manage')");
        expect(clinic).toContain("hasAccountPermission('online_queue.write')");
        expect(clinic).toContain("hasAccountPermission('sunday_clinic.create')");
        expect(main).toContain("hasPermission('appointments.sync')");
        expect(main).toContain("hasPermission('appointments.edit')");
    });

    test('queue realtime events remain permission-routed and Staff chat remains exempt', () => {
        const realtime = fs.readFileSync(path.join(backendRoot, 'security/realtimePermissions.js'), 'utf8');
        const registry = fs.readFileSync(path.join(backendRoot, 'config/accessControlRegistry.js'), 'utf8');
        for (const event of ['booking:new', 'booking:update', 'booking:cancel', 'queue:updated', 'queue:settings_changed']) {
            expect(realtime).toContain(`'${event}': 'online_queue.view'`);
        }
        expect(registry).toMatch(/chat[\s\S]{0,120}staff_chat/);
    });
});

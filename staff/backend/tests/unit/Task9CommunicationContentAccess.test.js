'use strict';

process.env.JWT_SECRET ||= 'task9-test-secret';

const fs = require('fs');
const path = require('path');

const backendRoot = path.resolve(__dirname, '../..');
const publicRoot = path.resolve(backendRoot, '../public');
const TASK9_PERMISSION_PREFIXES = [
    'announcements.', 'articles.', 'birth_classes.', 'community_chat.',
    'greeting_cards.', 'notifications.', 'patient_feedback.', 'patient_questions.',
    'patient_stories.', 'polls.', 'staff_announcements.', 'support_chat.'
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
        accountAccessResolution: { permission, ruleId: 'staff-task9' },
        context: { requestId: 'task9-test' },
        path: '/task9'
    };
}

describe('Task 9 communication and content route matrix', () => {
    test.each([
        ['GET', '/api/patient-questions/staff/all', 'patient_questions.view'],
        ['POST', '/api/patient-questions/staff/Q-1/reply', 'patient_questions.write'],
        ['POST', '/api/patient-questions/staff/Q-1/close', 'patient_questions.finalize'],
        ['GET', '/api/announcements', 'announcements.view'],
        ['POST', '/api/announcements', 'announcements.create'],
        ['DELETE', '/api/announcements/1', 'announcements.delete'],
        ['GET', '/api/staff-announcements', 'staff_announcements.view'],
        ['POST', '/api/staff-announcements/1/read', 'staff_announcements.view'],
        ['POST', '/api/staff-announcements', 'staff_announcements.write'],
        ['DELETE', '/api/staff-announcements/1', 'staff_announcements.delete'],
        ['GET', '/api/articles/admin/all', 'articles.view'],
        ['PATCH', '/api/articles/1/publish', 'articles.publish'],
        ['GET', '/api/patient-stories/admin/all', 'patient_stories.view'],
        ['PATCH', '/api/patient-stories/admin/1/approve', 'patient_stories.write'],
        ['GET', '/api/support-chat/staff/pending', 'support_chat.view'],
        ['POST', '/api/support-chat/staff/1/reply', 'support_chat.write'],
        ['GET', '/api/community-chat/rooms', 'community_chat.view'],
        ['POST', '/api/community-chat/rooms/general/messages', 'community_chat.write'],
        ['POST', '/api/community-chat/rooms/general/archive', 'community_chat.moderate'],
        ['GET', '/api/polls/staff/list', 'polls.view'],
        ['POST', '/api/polls/staff/create', 'polls.write'],
        ['GET', '/api/birth-classes/sessions', 'birth_classes.view'],
        ['POST', '/api/birth-classes/sessions', 'birth_classes.write'],
        ['DELETE', '/api/birth-classes/sessions/1', 'birth_classes.delete'],
        ['GET', '/api/patient-feedback', 'patient_feedback.view'],
        ['GET', '/api/notifications', 'notifications.view'],
        ['POST', '/api/notifications', 'notifications.write'],
        ['DELETE', '/api/notifications/1', 'notifications.delete']
    ])('%s %s requires %s', (method, route, permission) => {
        const { createRuntimeAccessResolver } = require('../../security/accountModeAccess');
        const resolve = createRuntimeAccessResolver();
        expect(resolve(method, route)).toEqual(expect.objectContaining({ permission }));
    });

    test('every mapped Task 9 HTTP route allows its exact grant and denies a zero-grant account', async () => {
        const { buildRuntimeAccessRules, createAccountModeAccessBoundary } = require('../../security/accountModeAccess');
        const routes = buildRuntimeAccessRules({
            serverFile: path.join(backendRoot, 'server.js'),
            routesDir: path.join(backendRoot, 'routes')
        }).filter(route => TASK9_PERMISSION_PREFIXES.some(prefix => route.resolution?.permission?.startsWith(prefix)));
        expect(routes.length).toBeGreaterThanOrEqual(75);

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
                    context: { requestId: 'task9-complete-matrix' }
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

describe('Task 9 delegated guards, UI actions, and realtime boundaries', () => {
    test('Task 9 permissions remain delegated as finance opens and system stays closed', () => {
        const { isDelegatedAccountPermission } = require('../../middleware/auth');
        for (const permission of [
            'patient_questions.write', 'articles.publish', 'community_chat.moderate',
            'polls.write', 'support_chat.write', 'birth_classes.delete',
            'staff_announcements.delete', 'notifications.write'
        ]) {
            expect(isDelegatedAccountPermission(accountRequest(permission), [permission])).toBe(true);
        }
        expect(isDelegatedAccountPermission(accountRequest('billing.process_payment'), ['billing.process_payment'])).toBe(true);
        expect(isDelegatedAccountPermission(accountRequest('system.reset'), ['system.reset'])).toBe(false);
    });

    test('legacy doctor, role, superadmin, and menu guards accept only the exact account permission', () => {
        const auth = fs.readFileSync(path.join(backendRoot, 'middleware/auth.js'), 'utf8');
        const questions = fs.readFileSync(path.join(backendRoot, 'routes/patient-questions.js'), 'utf8');
        const articles = fs.readFileSync(path.join(backendRoot, 'routes/articles.js'), 'utf8');
        const stories = fs.readFileSync(path.join(backendRoot, 'routes/patient-stories.js'), 'utf8');
        const feedback = fs.readFileSync(path.join(backendRoot, 'routes/patient-feedback.js'), 'utf8');
        const staffAnnouncements = fs.readFileSync(path.join(backendRoot, 'routes/staff-announcements.js'), 'utf8');
        const notifications = fs.readFileSync(path.join(backendRoot, 'routes/notifications.js'), 'utf8');
        const birthClasses = fs.readFileSync(path.join(backendRoot, 'routes/birth-classes.js'), 'utf8');
        expect(auth).toContain('function requireRolesOrAccountPermission(permission, ...allowedRoles)');
        expect(auth).toContain('function requireMenuAccessOrAccountPermission(menuKey, permission)');
        expect(questions).toContain("requireAccountPermissionOrDokter('patient_questions.write')");
        expect(questions).toContain("requireAccountPermissionOrDokter('patient_questions.finalize')");
        expect(questions).toContain("isDelegatedAccountPermission(req, ['patient_questions.write'])");
        expect(questions).toContain("isDelegatedAccountPermission(req, ['patient_questions.finalize'])");
        expect(questions).toContain('!delegatedAccount && question.assigned_doctor_id !== currentUserId');
        expect(articles).toContain("requireRolesOrAccountPermission('articles.publish', ROLE_NAMES.DOKTER)");
        expect(stories).toContain("requireRolesOrAccountPermission('patient_stories.write', ROLE_NAMES.DOKTER, ROLE_NAMES.ADMIN)");
        expect(feedback).toContain("requireSuperadminOrAccountPermission('patient_feedback.view')");
        expect(staffAnnouncements).toContain("requireSuperadminOrAccountPermission('staff_announcements.write')");
        expect(notifications).toContain("requireSuperadminOrAccountPermission('notifications.delete')");
        expect(birthClasses).toContain("requireMenuAccessOrAccountPermission('klinik_privat', 'birth_classes.write')");
    });

    test('communication and content UI checks exact write, delete, publish, and moderation permissions', () => {
        const questions = fs.readFileSync(path.join(publicRoot, 'scripts/tanya-dokter.js'), 'utf8');
        const support = fs.readFileSync(path.join(publicRoot, 'scripts/support-chat-staff.js'), 'utf8');
        const moderation = fs.readFileSync(path.join(publicRoot, 'scripts/pages/content-moderation-page.js'), 'utf8');
        const polls = fs.readFileSync(path.join(publicRoot, 'scripts/kelola-voting.js'), 'utf8');
        const announcements = fs.readFileSync(path.join(publicRoot, 'scripts/kelola-announcement.js'), 'utf8');
        const staffAnnouncements = fs.readFileSync(path.join(publicRoot, 'scripts/shell/notifications.js'), 'utf8');
        const birthClasses = fs.readFileSync(path.join(publicRoot, 'scripts/kelas-persalinan.js'), 'utf8');
        for (const permission of ['patient_questions.write', 'patient_questions.finalize']) {
            expect(questions).toContain(`hasAccountPermission('${permission}')`);
        }
        expect(support).toContain("hasAccountPermission('support_chat.write')");
        for (const permission of ['articles.write', 'articles.publish', 'articles.delete', 'patient_stories.write']) {
            expect(moderation).toContain(`hasAccountPermission('${permission}')`);
        }
        expect(polls).toContain("hasAccountPermission('polls.write')");
        expect(announcements).toContain("hasPermission('announcements.create')");
        expect(announcements).toContain("hasPermission('announcements.delete')");
        expect(staffAnnouncements).toContain("canManageStaffAnnouncements('staff_announcements.write')");
        expect(staffAnnouncements).toContain("canManageStaffAnnouncements('staff_announcements.delete')");
        expect(birthClasses).toContain("hasAccountPermission('birth_classes.write')");
        expect(birthClasses).toContain("hasAccountPermission('birth_classes.delete')");
    });

    test('communication realtime events stay permission-routed and Staff chat remains matrix-exempt', () => {
        const realtime = fs.readFileSync(path.join(backendRoot, 'security/realtimePermissions.js'), 'utf8');
        const registry = fs.readFileSync(path.join(backendRoot, 'config/accessControlRegistry.js'), 'utf8');
        for (const event of [
            'staff-announcement:new', 'staff-announcement:updated', 'staff-announcement:deleted',
            'support:escalated', 'support:escalated_message', 'support:session_resolved'
        ]) {
            expect(realtime).toMatch(new RegExp(`'${event.replace(':', '\\:')}': '(staff_announcements|support_chat)\\.view'`));
        }
        expect(registry).toMatch(/chat[\s\S]{0,120}staff_chat/);
    });
});

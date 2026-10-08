'use strict';

const fs = require('fs');
const path = require('path');

const backendRoot = path.resolve(__dirname, '../..');
const publicRoot = path.resolve(backendRoot, '../public');

function responseDouble() {
    return {
        statusCode: 200,
        body: null,
        status: jest.fn(function status(code) {
            this.statusCode = code;
            return this;
        }),
        json: jest.fn(function json(body) {
            this.body = body;
            return this;
        })
    };
}

function account(overrides = {}) {
    return {
        userId: 'STAFF-NEW',
        userType: 'staff',
        isActive: true,
        isSuperadmin: false,
        roleId: null,
        roleName: 'staff',
        mode: 'account',
        accessVersion: 1,
        ...overrides
    };
}

describe('account-mode default-deny boundary', () => {
    let createAccountModeAccessBoundary;
    let createRuntimeAccessResolver;

    beforeAll(() => {
        ({ createAccountModeAccessBoundary, createRuntimeAccessResolver } = require('../../security/accountModeAccess'));
    });

    function boundaryHarness({ state = account(), permissions = [], resolution = null, claims = { id: 'STAFF-NEW', user_type: 'staff' } } = {}) {
        const access = {
            ...state,
            isDoctorProtected: Boolean(state.isSuperadmin || state.roleId === 1),
            permissions: new Set(permissions)
        };
        const service = {
            getStaffAccountState: jest.fn().mockResolvedValue(state),
            getEffectiveAccess: jest.fn().mockResolvedValue(access)
        };
        const middleware = createAccountModeAccessBoundary({
            verifyJwt: jest.fn().mockReturnValue(claims),
            accessControlService: service,
            resolveRequestAccess: jest.fn().mockReturnValue(resolution),
            logger: { warn: jest.fn(), error: jest.fn() }
        });
        const req = {
            method: 'GET',
            originalUrl: '/api/patients',
            path: '/patients',
            headers: { authorization: 'Bearer valid-token' },
            context: { requestId: 'test-request' }
        };
        const res = responseDouble();
        const next = jest.fn();
        return { middleware, req, res, next, service };
    }

    test('denies an unmapped endpoint for account-mode Staff', async () => {
        const h = boundaryHarness();
        h.req.originalUrl = '/api/unmapped-new-route';
        await h.middleware(h.req, h.res, h.next);
        expect(h.res.status).toHaveBeenCalledWith(403);
        expect(h.res.body).toEqual(expect.objectContaining({ code: 'ACCESS_DENIED' }));
        expect(h.next).not.toHaveBeenCalled();
    });

    test('denies a mapped direct API call without the required grant', async () => {
        const h = boundaryHarness({ resolution: { permission: 'patients.view', ruleId: 'staff-patients' } });
        await h.middleware(h.req, h.res, h.next);
        expect(h.res.status).toHaveBeenCalledWith(403);
        expect(h.res.body).toEqual(expect.objectContaining({ code: 'ACCESS_DENIED' }));
    });

    test('allows mapped grants and named profile, identity, and chat exemptions', async () => {
        const mapped = boundaryHarness({
            permissions: ['patients.view'],
            resolution: { permission: 'patients.view', ruleId: 'staff-patients' }
        });
        await mapped.middleware(mapped.req, mapped.res, mapped.next);
        expect(mapped.next).toHaveBeenCalledTimes(1);

        for (const exemption of ['staff_profile', 'staff_identity', 'staff_chat']) {
            const explicit = boundaryHarness({ resolution: { exemption, ruleId: `named-${exemption}` } });
            await explicit.middleware(explicit.req, explicit.res, explicit.next);
            expect(explicit.next).toHaveBeenCalledTimes(1);
        }
    });

    test('keeps legacy Staff reversible and protected doctors unrestricted', async () => {
        const legacy = boundaryHarness({ state: account({ mode: 'legacy' }) });
        await legacy.middleware(legacy.req, legacy.res, legacy.next);
        expect(legacy.next).toHaveBeenCalledTimes(1);
        expect(legacy.service.getEffectiveAccess).not.toHaveBeenCalled();

        const doctor = boundaryHarness({ state: account({ roleId: 1, isSuperadmin: true }) });
        await doctor.middleware(doctor.req, doctor.res, doctor.next);
        expect(doctor.next).toHaveBeenCalledTimes(1);
        expect(doctor.service.getEffectiveAccess).not.toHaveBeenCalled();
    });

    test('rejects an inactive Staff account with ACCOUNT_INACTIVE', async () => {
        const h = boundaryHarness({ state: account({ isActive: false }) });
        await h.middleware(h.req, h.res, h.next);
        expect(h.res.status).toHaveBeenCalledWith(403);
        expect(h.res.body).toEqual(expect.objectContaining({ code: 'ACCOUNT_INACTIVE' }));
        expect(h.next).not.toHaveBeenCalled();
    });

    test('leaves missing, malformed, invalid, and patient credentials to existing route authentication', async () => {
        const missing = boundaryHarness();
        delete missing.req.headers.authorization;
        await missing.middleware(missing.req, missing.res, missing.next);
        expect(missing.next).toHaveBeenCalledTimes(1);
        expect(missing.service.getStaffAccountState).not.toHaveBeenCalled();

        const patient = boundaryHarness({ claims: { id: 'PAT-1', user_type: 'patient', role: 'patient' } });
        await patient.middleware(patient.req, patient.res, patient.next);
        expect(patient.next).toHaveBeenCalledTimes(1);
        expect(patient.service.getStaffAccountState).not.toHaveBeenCalled();
    });

    test('resolves mounted production routes to permissions or named exemptions', () => {
        const resolve = createRuntimeAccessResolver({
            serverFile: path.join(backendRoot, 'server.js'),
            routesDir: path.join(backendRoot, 'routes')
        });
        expect(resolve('GET', '/api/patients')).toEqual(expect.objectContaining({ permission: 'patients.view' }));
        expect(resolve('GET', '/api/auth/me')).toEqual(expect.objectContaining({ exemption: 'staff_identity' }));
        expect(resolve('GET', '/api/access/me')).toEqual(expect.objectContaining({ exemption: 'staff_identity' }));
        expect(resolve('GET', '/api/chat/messages')).toEqual(expect.objectContaining({ exemption: 'staff_chat' }));
        expect(resolve('GET', '/api/definitely-unmapped')).toBeNull();
    });
});

describe('account access identity and zero-grant shell', () => {
    test('publishes the canonical self-service endpoint and effective account-mode access in /auth/me', () => {
        const selfRoute = fs.readFileSync(path.join(backendRoot, 'routes/account-access-self.js'), 'utf8');
        const authRoute = fs.readFileSync(path.join(backendRoot, 'routes/auth.js'), 'utf8');
        expect(selfRoute).toContain("router.get('/me'");
        expect(selfRoute).toMatch(/verifyToken[\s\S]+verifyActiveStaff/);
        expect(authRoute).toContain('toPublicAccess(access)');
        expect(authRoute).not.toContain('toPublicAccess(access, { legacyDecision: true })');
    });

    test('hydrates navigation from /api/access/me and preserves profile plus the global chat popup for zero grants', () => {
        const authClient = fs.readFileSync(path.join(publicRoot, 'scripts/vps-auth-v2.js'), 'utf8');
        const accountUi = fs.readFileSync(path.join(publicRoot, 'scripts/shell/account-access.js'), 'utf8');
        const main = fs.readFileSync(path.join(publicRoot, 'scripts/main.js'), 'utf8');
        const shell = fs.readFileSync(path.join(publicRoot, 'index-adminlte.html'), 'utf8');

        expect(authClient).toMatch(/fetch\(`\$\{API_BASE\}\/api\/access\/me`/);
        expect(shell).toContain('Akses belum diberikan');
        expect(accountUi).toContain('navbar-profile-btn');
        expect(accountUi).not.toContain('chat-popup-container');
        expect(main).toMatch(/user\?\.access_mode === 'account'/);
        expect(main).toMatch(/showNoAccessPage/);
        expect(shell).toContain('id="content-no-access-page"');
        expect(shell).toContain('id="chat-popup-container"');
    });

    test('refreshes active sessions when the private access version notification arrives', () => {
        const realtime = fs.readFileSync(path.join(publicRoot, 'scripts/realtime-sync.js'), 'utf8');
        expect(realtime).toContain("state.socket.on('access:changed'");
        expect(realtime).toContain('fetchAccountAccess');
        expect(realtime).toContain('await signOut()');
        expect(realtime).toContain("'staff:access-changed'");
    });
});

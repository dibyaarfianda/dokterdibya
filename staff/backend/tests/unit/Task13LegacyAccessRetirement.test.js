'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const request = require('supertest');

const backendRoot = path.resolve(__dirname, '../..');
const publicRoot = path.resolve(backendRoot, '../public');

function pass(req, _res, next) {
    req.user ||= { id: 'DOCTOR001', role_id: 1, role: 'dokter', is_superadmin: true };
    next();
}

function fakeDb() {
    return {
        query: jest.fn(async sql => {
            if (/FROM roles r/i.test(sql)) return [[]];
            if (/FROM permissions p/i.test(sql)) return [[]];
            if (/FROM users u/i.test(sql)) return [[]];
            return [[]];
        })
    };
}

describe('Task 13 legacy access retirement', () => {
    test('runtime authorization does not read or write legacy role authorization tables', () => {
        const runtimeFiles = [
            'services/AccessControlService.js',
            'middleware/auth.js',
            'routes/roles.js',
            'routes/role-visibility.js'
        ];
        const legacySql = /\b(?:FROM|JOIN|INTO|UPDATE|DELETE\s+FROM)\s+(?:role_permissions|role_visibility)\b/i;

        for (const file of runtimeFiles) {
            const source = fs.readFileSync(path.join(backendRoot, file), 'utf8');
            expect(source).not.toMatch(legacySql);
        }
    });

    test('legacy role and visibility writes return 410 without touching the database', async () => {
        const db = fakeDb();
        const auth = {
            verifyToken: pass,
            verifyActiveStaff: pass,
            requireSuperadmin: pass
        };
        const { createLegacyRoleAdapterRouter } = require('../../routes/roles');
        const { createLegacyVisibilityAdapterRouter } = require('../../routes/role-visibility');
        const app = express();
        app.use(express.json());
        app.use(createLegacyRoleAdapterRouter({ db, auth }));
        app.use('/api/role-visibility', createLegacyVisibilityAdapterRouter({ db, auth }));

        const writes = [
            request(app).post('/api/roles').send({ name: 'legacy' }),
            request(app).put('/api/roles/2').send({ display_name: 'Legacy' }),
            request(app).delete('/api/roles/2'),
            request(app).put('/api/roles/2/permissions').send({ permission_ids: [] }),
            request(app).put('/api/users/STAFF001/roles').send({ role_ids: [2] }),
            request(app).put('/api/users/STAFF001/role').send({ role_id: 2 }),
            request(app).put('/api/users/STAFF001/status').send({ is_active: false }),
            request(app).put('/api/role-visibility/bidan').send({ visibility: {} }),
            request(app).post('/api/role-visibility/toggle').send({ role: 'bidan', menuKey: 'dashboard', isVisible: true })
        ];

        for (const response of await Promise.all(writes)) {
            expect(response.status).toBe(410);
            expect(response.body).toEqual(expect.objectContaining({
                success: false,
                code: 'LEGACY_ACCESS_DISABLED'
            }));
        }
        expect(db.query).not.toHaveBeenCalled();
    });

    test('legacy visibility read adapter reflects the current account grant set', async () => {
        const auth = {
            verifyToken: pass,
            verifyActiveStaff: pass,
            requireSuperadmin: pass
        };
        const effectiveAccessService = {
            getEffectiveAccess: jest.fn(async () => ({
                isDoctorProtected: false,
                permissions: new Set(['navigation.dashboard', 'navigation.staff_briefing'])
            }))
        };
        const { createLegacyVisibilityAdapterRouter } = require('../../routes/role-visibility');
        const app = express();
        app.use('/api/role-visibility', createLegacyVisibilityAdapterRouter({
            db: fakeDb(),
            auth,
            effectiveAccessService
        }));

        const response = await request(app).get('/api/role-visibility/my/menus').expect(200);
        expect(response.body.adapter).toBe('account_permissions');
        expect(response.body.data.dashboard).toBe(true);
        expect(response.body.data.staff_briefing).toBe(true);
        expect(response.body.data.kelola_pasien).toBe(false);
    });

    test('self-read role adapters remain available for one asset cycle while writes stay protected', () => {
        const { createRuntimeAccessResolver } = require('../../security/accountModeAccess');
        const resolve = createRuntimeAccessResolver({
            serverFile: path.join(backendRoot, 'server.js'),
            routesDir: path.join(backendRoot, 'routes')
        });
        expect(resolve('GET', '/api/users/STAFF001/roles')).toEqual(expect.objectContaining({
            exemption: 'legacy_access_adapter'
        }));
        expect(resolve('GET', '/api/users/STAFF001/permissions')).toEqual(expect.objectContaining({
            exemption: 'legacy_access_adapter'
        }));
        expect(resolve('PUT', '/api/users/STAFF001/role')).toEqual(expect.objectContaining({
            permission: 'access.manage'
        }));
        expect(resolve('GET', '/api/role-visibility/my/menus')).toEqual(expect.objectContaining({
            exemption: 'legacy_access_adapter'
        }));
    });

    test('the Staff shell contains only Layout A and no legacy role or visibility UI', () => {
        const shell = fs.readFileSync(path.join(publicRoot, 'index-adminlte.html'), 'utf8');
        const main = fs.readFileSync(path.join(publicRoot, 'scripts/main.js'), 'utf8');
        const descriptors = fs.readFileSync(path.join(publicRoot, 'scripts/shell/page-descriptors.js'), 'utf8');

        expect(shell).toContain('<p>Kelola Akses</p>');
        expect(shell).toContain('data-page-fragment="/staff/public/fragments/pages/kelola-access-page.html"');
        expect(shell).not.toContain('Users / Roles');
        expect(shell).not.toContain('id="role-modal"');
        expect(shell).not.toContain('id="user-roles-modal"');
        expect(main).not.toContain('ACCESS_CONTROL_ROLLOUT_ENABLED');
        expect(main).not.toContain("'./kelola-roles.js'");
        expect(main).not.toContain('/api/role-visibility');
        expect(descriptors).toContain("'Kelola Akses'");
        expect(fs.existsSync(path.join(publicRoot, 'scripts/kelola-roles.js'))).toBe(false);
        expect(fs.existsSync(path.join(publicRoot, 'fragments/pages/kelola-roles-page.html'))).toBe(false);
    });
});

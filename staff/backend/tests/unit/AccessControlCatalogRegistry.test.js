'use strict';

const fs = require('fs');
const path = require('path');

const backendRoot = path.resolve(__dirname, '../..');

describe('granular permission catalog and Staff route registry', () => {
    test('every route declaration resolves to a catalog permission or a named exemption', () => {
        const { inventoryRouteDeclarations } = require('../../security/accessRouteInventory');
        const { resolveRouteAccess, NAMED_EXEMPTIONS } = require('../../config/accessControlRegistry');
        const { PERMISSION_CATALOG } = require('../../config/accessControlCatalog');
        const permissionNames = new Set(PERMISSION_CATALOG.map(permission => permission.name));
        const routesDir = path.join(backendRoot, 'routes');
        const routes = inventoryRouteDeclarations(routesDir);

        expect(routes.length).toBeGreaterThan(300);

        const unresolved = [];
        for (const route of routes) {
            const resolution = resolveRouteAccess(route);
            if (!resolution) {
                unresolved.push(`${route.sourceFile}:${route.method} ${route.routePath}`);
                continue;
            }
            if (resolution.permission) {
                expect(permissionNames.has(resolution.permission)).toBe(true);
                continue;
            }
            expect(NAMED_EXEMPTIONS.has(resolution.exemption)).toBe(true);
        }

        expect(unresolved).toEqual([]);
    });

    test('catalog names are unique and cover normal plus sensitive actions', () => {
        const { PERMISSION_CATALOG } = require('../../config/accessControlCatalog');
        const names = PERMISSION_CATALOG.map(permission => permission.name);
        expect(new Set(names).size).toBe(names.length);

        const actions = new Set(PERMISSION_CATALOG.map(permission => permission.action));
        for (const action of ['view', 'write', 'delete', 'payment', 'export', 'reset', 'sync', 'finalize', 'merge', 'bulk_delete', 'publish']) {
            expect(actions.has(action)).toBe(true);
        }

        for (const permission of PERMISSION_CATALOG.filter(item => item.protected)) {
            expect(permission.legacySources).toEqual([{ kind: 'doctor' }]);
        }
    });

    test('every legacy menu key maps to a catalog permission and every Staff navigation item is inventoried', () => {
        const { MENU_PERMISSION_MAP, STAFF_NAVIGATION_MAP } = require('../../config/accessControlRegistry');
        const { PERMISSION_CATALOG } = require('../../config/accessControlCatalog');
        const permissionNames = new Set(PERMISSION_CATALOG.map(permission => permission.name));
        const roleVisibilitySource = fs.readFileSync(path.join(backendRoot, 'routes/role-visibility.js'), 'utf8');
        const menuKeys = [...roleVisibilitySource.matchAll(/\{ key: '([^']+)'/g)].map(match => match[1]);

        for (const menuKey of menuKeys) {
            expect(MENU_PERMISSION_MAP[menuKey]).toBeTruthy();
            expect(permissionNames.has(MENU_PERMISSION_MAP[menuKey])).toBe(true);
        }

        const shell = fs.readFileSync(path.resolve(backendRoot, '../public/index-adminlte.html'), 'utf8');
        const navIds = [...shell.matchAll(/id="((?:nav|management-nav)-[^"]+)"/g)].map(match => match[1]);
        for (const navId of navIds) {
            expect(STAFF_NAVIGATION_MAP[navId]).toBeTruthy();
            expect(permissionNames.has(STAFF_NAVIGATION_MAP[navId])).toBe(true);
        }
    });
});

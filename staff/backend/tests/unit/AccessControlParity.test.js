'use strict';

const fs = require('fs');
const path = require('path');

describe('legacy-to-account grant parity', () => {
    test('builds deterministic non-doctor grants from legacy permissions, menus, roles and all-Staff sources', () => {
        const { buildExpectedGrantNames } = require('../../scripts/backfill-account-permissions');
        const fixture = {
            user: { userId: 'STAFF1', roleId: 4, roleName: 'managerial', isDoctorProtected: false },
            rolePermissions: new Set(['patients.view', 'patients.edit']),
            directPermissions: new Set(['announcements.edit']),
            visibleMenus: new Set(['kelola_pasien']),
            catalog: [
                { name: 'patients.view', legacySources: [{ kind: 'permission', value: 'patients.view' }] },
                { name: 'patients.edit', legacySources: [{ kind: 'permission', value: 'patients.edit' }] },
                { name: 'patients.merge', legacySources: [{ kind: 'permission', value: 'patients.edit' }] },
                { name: 'announcements.edit', legacySources: [{ kind: 'permission', value: 'announcements.edit' }] },
                { name: 'staff_workdesk.view', legacySources: [{ kind: 'all_staff' }] },
                { name: 'access.manage', legacySources: [{ kind: 'doctor' }], protected: true }
            ]
        };

        expect([...buildExpectedGrantNames(fixture)]).toEqual([
            'announcements.edit',
            'patients.edit',
            'patients.merge',
            'patients.view',
            'staff_workdesk.view'
        ]);
    });

    test('parity report separates explained catalog expansion from unexplained differences', () => {
        const { compareGrantParity } = require('../../scripts/backfill-account-permissions');
        const expected = new Set(['patients.view', 'patients.merge']);
        const actual = new Set(['patients.view', 'patients.merge']);
        expect(compareGrantParity(expected, actual)).toEqual({
            missing: [],
            unexpected: [],
            unexplained: 0
        });
    });

    test('doctor accounts are protected and excluded from grant migration', () => {
        const { buildExpectedGrantNames } = require('../../scripts/backfill-account-permissions');
        expect([...buildExpectedGrantNames({
            user: { userId: 'DOC1', roleId: 1, roleName: 'dokter', isDoctorProtected: true },
            rolePermissions: new Set(['patients.view']),
            directPermissions: new Set(),
            visibleMenus: new Set(),
            catalog: [{ name: 'patients.view', legacySources: [{ kind: 'permission', value: 'patients.view' }] }]
        })]).toEqual([]);
    });

    test('migration records immutable baseline and resulting grant audits', () => {
        const source = fs.readFileSync(path.resolve(__dirname, '../../scripts/backfill-account-permissions.js'), 'utf8');
        expect(source).toContain("'catalog_migration_baseline'");
        expect(source).toContain("'catalog_migration_grants'");
        expect(source).toContain('INSERT IGNORE INTO user_permission_grants');
    });
});

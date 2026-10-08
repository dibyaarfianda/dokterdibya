'use strict';

const fs = require('fs');
const path = require('path');

const servicePath = '../../services/AccountAccessCutoverService';
const scriptPath = path.resolve(__dirname, '../../scripts/cutover-account-access.js');

function parity(role, users = 1, grants = 3) {
    return {
        unexplained_differences: 0,
        roles: {
            [role]: {
                users,
                expected_grants: grants,
                actual_grants: grants,
                missing: 0,
                unexpected: 0
            }
        }
    };
}

function database({ role = 'managerial', mode = 'legacy', version = 4, protectedAccount = false, empty = false } = {}) {
    const target = {
        user_id: 'STAFF-A',
        role_id: protectedAccount ? 1 : 7,
        is_superadmin: protectedAccount ? 1 : 0,
        mode,
        access_version: version
    };
    const grantRows = empty ? [] : [
        { user_id: 'STAFF-A', name: 'patients.view' },
        { user_id: 'STAFF-A', name: 'staff_chat.view' },
        { user_id: 'STAFF-A', name: 'system.monitor' }
    ];
    const states = [
        { role_name: 'front_office', users: 0, account_users: 0, legacy_users: 0 },
        { role_name: 'admin', users: 0, account_users: 0, legacy_users: 0 },
        {
            role_name: role,
            users: empty ? 0 : 1,
            account_users: !empty && mode === 'account' ? 1 : 0,
            legacy_users: !empty && mode === 'legacy' ? 1 : 0
        },
        { role_name: 'bidan', users: role === 'bidan' ? 1 : 0, account_users: 0, legacy_users: role === 'bidan' ? 1 : 0 }
    ];
    let grantRead = 0;
    const connection = {
        beginTransaction: jest.fn().mockResolvedValue(undefined),
        commit: jest.fn().mockResolvedValue(undefined),
        rollback: jest.fn().mockResolvedValue(undefined),
        release: jest.fn(),
        query: jest.fn(async sql => {
            const normalized = sql.replace(/\s+/g, ' ').trim();
            if (normalized.startsWith('INSERT IGNORE INTO user_access_policies')) return [{ affectedRows: 0 }];
            if (normalized.includes('AS role_name') && normalized.includes('GROUP BY')) return [states];
            if (normalized.includes('FOR UPDATE') && normalized.includes('uap.access_version')) return [empty ? [] : [target]];
            if (normalized.includes('FROM user_permission_grants upg')) {
                grantRead += 1;
                return [grantRows];
            }
            if (normalized.includes('ORDER BY u.is_superadmin DESC')) return [[{ actor_user_id: 'DOCTOR-A' }]];
            if (normalized.startsWith('UPDATE user_access_policies')) return [{ affectedRows: 1 }];
            if (normalized.startsWith('INSERT INTO user_permission_audits')) return [{ insertId: 1 }];
            throw new Error(`Unexpected SQL: ${normalized}`);
        })
    };
    return {
        db: { getConnection: jest.fn().mockResolvedValue(connection) },
        connection,
        grantRows,
        getGrantReadCount: () => grantRead
    };
}

describe('Task 12 account cutover CLI', () => {
    test('accepts only one ordered role and one operation', () => {
        const { parseArguments, ROLE_ORDER } = require(servicePath);
        expect(ROLE_ORDER).toEqual(['front_office', 'admin', 'managerial', 'bidan']);
        expect(parseArguments(['--role=managerial'])).toEqual({ role: 'managerial', operation: 'dry-run', reportPath: null });
        expect(parseArguments(['--role=bidan', '--apply', '--report=/root/report.json'])).toEqual({
            role: 'bidan', operation: 'apply', reportPath: '/root/report.json'
        });
        expect(() => parseArguments(['--role=dokter', '--apply'])).toThrow('Invalid cutover role');
        expect(() => parseArguments(['--role=managerial', '--apply', '--rollback'])).toThrow('exactly one operation');
        expect(() => parseArguments(['--role=managerial', '--unknown'])).toThrow('Unknown cutover argument');
    });

    test('blocks out-of-order apply and reverse-order rollback', () => {
        const { assertRoleOrder } = require(servicePath);
        expect(() => assertRoleOrder([
            { role_name: 'managerial', users: 2, account_users: 0, legacy_users: 2 }
        ], 'bidan', 'apply')).toThrow('CUTOVER_ORDER_BLOCKED');
        expect(() => assertRoleOrder([
            { role_name: 'bidan', users: 1, account_users: 1, legacy_users: 0 }
        ], 'managerial', 'rollback')).toThrow('CUTOVER_ROLLBACK_ORDER_BLOCKED');
        expect(() => assertRoleOrder([], 'managerial', 'apply')).not.toThrow();
    });
});

describe('Task 12 account cutover behavior', () => {
    test('dry-run reports parity and rolls back without an audit', async () => {
        const fixture = database();
        const { runCutover } = require(servicePath);
        const report = await runCutover({
            db: fixture.db,
            role: 'managerial',
            operation: 'dry-run',
            parityChecker: jest.fn().mockResolvedValue(parity('managerial'))
        });
        expect(report).toMatchObject({ operation: 'dry-run', role: 'managerial', accounts: 1, changed_accounts: 1, grants_unchanged: true });
        expect(JSON.stringify(report)).not.toContain('STAFF-A');
        expect(fixture.connection.rollback).toHaveBeenCalledTimes(1);
        expect(fixture.connection.commit).not.toHaveBeenCalled();
        expect(fixture.connection.query.mock.calls.some(([sql]) => sql.includes('user_permission_audits'))).toBe(false);
    });

    test('apply switches to account mode, increments access_version, audits, and never changes grants', async () => {
        const fixture = database({ mode: 'legacy', version: 4 });
        const { runCutover } = require(servicePath);
        const report = await runCutover({
            db: fixture.db,
            role: 'managerial',
            operation: 'apply',
            parityChecker: jest.fn().mockResolvedValue(parity('managerial'))
        });
        expect(report).toMatchObject({ operation: 'apply', changed_accounts: 1, audits_written: 1, access_version_before: { min: 4, max: 4 }, access_version_after: { min: 5, max: 5 }, grants_unchanged: true });
        expect(fixture.connection.commit).toHaveBeenCalledTimes(1);
        expect(fixture.connection.query).toHaveBeenCalledWith(
            expect.stringContaining('u.role_id = ?'),
            [7]
        );
        expect(fixture.connection.query).toHaveBeenCalledWith(
            expect.stringContaining('UPDATE user_access_policies SET mode = ?, access_version = ?'),
            ['account', 5, 'STAFF-A']
        );
        expect(fixture.connection.query).toHaveBeenCalledWith(
            expect.stringContaining('INSERT INTO user_permission_audits'),
            expect.arrayContaining(['DOCTOR-A', 'STAFF-A', 'account_cutover', 5])
        );
        const source = fs.readFileSync(scriptPath, 'utf8');
        expect(source).not.toMatch(/(?:DELETE|INSERT|UPDATE)[\s\S]{0,50}user_permission_grants/i);
    });

    test('rollback returns to legacy, increments access_version, and records a rollback audit', async () => {
        const fixture = database({ mode: 'account', version: 8 });
        const { runCutover } = require(servicePath);
        const report = await runCutover({
            db: fixture.db,
            role: 'managerial',
            operation: 'rollback',
            parityChecker: jest.fn().mockResolvedValue(parity('managerial'))
        });
        expect(report).toMatchObject({ operation: 'rollback', changed_accounts: 1, audits_written: 1, access_version_after: { min: 9, max: 9 }, grants_unchanged: true });
        expect(fixture.connection.query).toHaveBeenCalledWith(
            expect.stringContaining('UPDATE user_access_policies SET mode = ?, access_version = ?'),
            ['legacy', 9, 'STAFF-A']
        );
        expect(fixture.connection.query).toHaveBeenCalledWith(
            expect.stringContaining('INSERT INTO user_permission_audits'),
            expect.arrayContaining(['DOCTOR-A', 'STAFF-A', 'account_cutover_rollback', 9])
        );
    });

    test('fails closed on parity drift or a protected doctor target', async () => {
        const { runCutover } = require(servicePath);
        const drift = database();
        await expect(runCutover({
            db: drift.db,
            role: 'managerial',
            operation: 'apply',
            parityChecker: jest.fn().mockResolvedValue({ ...parity('managerial'), unexplained_differences: 1 })
        })).rejects.toThrow('CUTOVER_PARITY_FAILED');
        expect(drift.db.getConnection).not.toHaveBeenCalled();

        const protectedFixture = database({ protectedAccount: true });
        await expect(runCutover({
            db: protectedFixture.db,
            role: 'managerial',
            operation: 'apply',
            parityChecker: jest.fn().mockResolvedValue(parity('managerial'))
        })).rejects.toThrow('CUTOVER_PROTECTED_ACCOUNT');
        expect(protectedFixture.connection.rollback).toHaveBeenCalledTimes(1);
    });

    test('fails closed when the parity report is stale for the locked role snapshot', async () => {
        const { runCutover } = require(servicePath);
        const userCountDrift = database();
        await expect(runCutover({
            db: userCountDrift.db,
            role: 'managerial',
            operation: 'apply',
            parityChecker: jest.fn().mockResolvedValue(parity('managerial', 2, 3))
        })).rejects.toThrow('CUTOVER_PARITY_STALE');
        expect(userCountDrift.connection.rollback).toHaveBeenCalledTimes(1);

        const grantCountDrift = database();
        await expect(runCutover({
            db: grantCountDrift.db,
            role: 'managerial',
            operation: 'apply',
            parityChecker: jest.fn().mockResolvedValue(parity('managerial', 1, 4))
        })).rejects.toThrow('CUTOVER_PARITY_STALE');
        expect(grantCountDrift.connection.rollback).toHaveBeenCalledTimes(1);
    });

    test('skips an empty role without creating an audit', async () => {
        const fixture = database({ role: 'front_office', empty: true });
        const { runCutover } = require(servicePath);
        const report = await runCutover({
            db: fixture.db,
            role: 'front_office',
            operation: 'apply',
            parityChecker: jest.fn().mockResolvedValue(parity('front_office', 0, 0))
        });
        expect(report).toMatchObject({ accounts: 0, changed_accounts: 0, audits_written: 0, grants_unchanged: true });
        expect(fixture.connection.commit).toHaveBeenCalledTimes(1);
        expect(fixture.connection.query.mock.calls.some(([sql]) => sql.includes('user_permission_audits'))).toBe(false);
    });
});

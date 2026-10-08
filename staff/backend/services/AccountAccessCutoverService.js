'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { ROLE_IDS, ROLE_NAME_TO_ID } = require('../constants/roles');

const ROLE_ORDER = Object.freeze(['front_office', 'admin', 'managerial', 'bidan']);
const ROLE_ID_ORDER = Object.freeze(ROLE_ORDER.map(roleName => ROLE_NAME_TO_ID[roleName]));
const OPERATIONS = Object.freeze(['dry-run', 'apply', 'rollback']);

function parseArguments(argv) {
    let role = null;
    let reportPath = null;
    const selectedOperations = [];
    for (const argument of argv) {
        if (argument.startsWith('--role=')) {
            if (role !== null) throw new Error('Duplicate cutover role');
            role = argument.slice('--role='.length);
        } else if (argument === '--apply') {
            selectedOperations.push('apply');
        } else if (argument === '--rollback') {
            selectedOperations.push('rollback');
        } else if (argument === '--dry-run') {
            selectedOperations.push('dry-run');
        } else if (argument.startsWith('--report=')) {
            if (reportPath !== null) throw new Error('Duplicate cutover report');
            reportPath = argument.slice('--report='.length);
        } else {
            throw new Error(`Unknown cutover argument: ${argument}`);
        }
    }
    if (!ROLE_ORDER.includes(role)) throw new Error('Invalid cutover role');
    if (selectedOperations.length > 1) throw new Error('Choose exactly one operation');
    if (reportPath !== null && !reportPath) throw new Error('Invalid cutover report path');
    return { role, operation: selectedOperations[0] || 'dry-run', reportPath };
}

function numeric(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function assertRoleOrder(states, role, operation) {
    if (!ROLE_ORDER.includes(role)) throw new Error('Invalid cutover role');
    if (!OPERATIONS.includes(operation)) throw new Error('Invalid cutover operation');
    if (operation === 'dry-run') return;
    const selectedIndex = ROLE_ORDER.indexOf(role);
    const byRole = new Map((states || []).map(state => [state.role_name, state]));
    if (operation === 'apply') {
        const blocked = ROLE_ORDER.slice(0, selectedIndex).some(name => {
            const state = byRole.get(name);
            return numeric(state?.users) > 0 && numeric(state?.legacy_users) > 0;
        });
        if (blocked) throw new Error('CUTOVER_ORDER_BLOCKED');
        return;
    }
    const blocked = ROLE_ORDER.slice(selectedIndex + 1).some(name =>
        numeric(byRole.get(name)?.account_users) > 0
    );
    if (blocked) throw new Error('CUTOVER_ROLLBACK_ORDER_BLOCKED');
}

function buildGrantFingerprint(rows) {
    const entries = (rows || [])
        .map(row => `${row.user_id}:${row.name}`)
        .sort((left, right) => left.localeCompare(right));
    return crypto.createHash('sha256').update(entries.join('\n')).digest('hex');
}

function versionRange(values) {
    if (!values.length) return { min: null, max: null };
    return { min: Math.min(...values), max: Math.max(...values) };
}

function ensureParity(report, role) {
    const summary = report?.roles?.[role];
    if (numeric(report?.unexplained_differences) !== 0
        || numeric(summary?.missing) !== 0
        || numeric(summary?.unexpected) !== 0) {
        throw new Error('CUTOVER_PARITY_FAILED');
    }
    return summary || {
        users: 0,
        expected_grants: 0,
        actual_grants: 0,
        missing: 0,
        unexpected: 0,
        fingerprint: null
    };
}

async function defaultParityChecker(options) {
    const { runBackfill } = require('../scripts/backfill-account-permissions');
    return runBackfill(options);
}

async function loadGrantRows(connection, userIds) {
    if (!userIds.length) return [];
    const [rows] = await connection.query(
        `SELECT upg.user_id, p.name
         FROM user_permission_grants upg
         INNER JOIN permissions p ON p.id = upg.permission_id
         WHERE upg.user_id IN (?)
         ORDER BY upg.user_id, p.name`,
        [userIds]
    );
    return rows;
}

function accountGrantState(grantRows, userId) {
    const names = grantRows
        .filter(row => row.user_id === userId)
        .map(row => row.name)
        .sort((left, right) => left.localeCompare(right));
    return {
        permission_count: names.length,
        permission_fingerprint: crypto.createHash('sha256').update(names.join('\n')).digest('hex')
    };
}

async function runCutover({ db, role, operation = 'dry-run', parityChecker = defaultParityChecker } = {}) {
    if (!db || typeof db.getConnection !== 'function') throw new Error('Cutover database is required');
    if (!ROLE_ORDER.includes(role)) throw new Error('Invalid cutover role');
    if (!OPERATIONS.includes(operation)) throw new Error('Invalid cutover operation');

    const parityReport = await parityChecker({ apply: false, db });
    const roleParity = ensureParity(parityReport, role);
    const roleId = ROLE_NAME_TO_ID[role];
    const connection = await db.getConnection();
    await connection.beginTransaction();
    try {
        await connection.query(
            `INSERT IGNORE INTO user_access_policies (user_id, mode, access_version)
             SELECT u.new_id, 'legacy', 1
             FROM users u
             WHERE u.user_type = 'staff' AND u.role_id = ?`,
            [roleId]
        );
        const [states] = await connection.query(
            `SELECT COALESCE(r.name, u.role) AS role_name,
                    COUNT(*) AS users,
                    SUM(uap.mode = 'account') AS account_users,
                    SUM(uap.mode = 'legacy') AS legacy_users
             FROM users u
             LEFT JOIN roles r ON r.id = u.role_id
             INNER JOIN user_access_policies uap ON uap.user_id = u.new_id
             WHERE u.user_type = 'staff'
               AND u.role_id IN (?)
             GROUP BY COALESCE(r.name, u.role)`,
            [ROLE_ID_ORDER]
        );
        assertRoleOrder(states, role, operation);

        const [targets] = await connection.query(
            `SELECT u.new_id AS user_id, u.role_id, u.is_superadmin,
                    uap.mode, uap.access_version
             FROM users u
             INNER JOIN user_access_policies uap ON uap.user_id = u.new_id
             WHERE u.user_type = 'staff' AND u.role_id = ?
             ORDER BY u.new_id
             FOR UPDATE`,
            [roleId]
        );
        if (targets.length !== numeric(roleParity.users)) {
            throw new Error('CUTOVER_PARITY_STALE');
        }
        if (targets.some(target => Number(target.is_superadmin) === 1 || Number(target.role_id) === ROLE_IDS.DOKTER)) {
            throw new Error('CUTOVER_PROTECTED_ACCOUNT');
        }

        const userIds = targets.map(target => target.user_id);
        const beforeGrants = await loadGrantRows(connection, userIds);
        if (beforeGrants.length !== numeric(roleParity.actual_grants)
            || beforeGrants.length !== numeric(roleParity.expected_grants)) {
            throw new Error('CUTOVER_PARITY_STALE');
        }
        const beforeFingerprint = buildGrantFingerprint(beforeGrants);
        const desiredMode = operation === 'rollback' ? 'legacy' : 'account';
        const changes = targets.filter(target => target.mode !== desiredMode);
        const versionsBefore = targets.map(target => Math.max(1, numeric(target.access_version)));
        const versionsAfter = targets.map(target => {
            const current = Math.max(1, numeric(target.access_version));
            return target.mode === desiredMode || operation === 'dry-run' ? current : current + 1;
        });
        let auditsWritten = 0;

        if (operation !== 'dry-run' && changes.length) {
            const [actors] = await connection.query(
                `SELECT u.new_id AS actor_user_id
                 FROM users u
                 WHERE u.user_type = 'staff' AND u.is_active = 1
                   AND (u.role_id = ? OR u.is_superadmin = 1)
                 ORDER BY u.is_superadmin DESC, u.new_id
                 LIMIT 1`,
                [ROLE_IDS.DOKTER]
            );
            if (!actors.length) throw new Error('CUTOVER_ACTOR_UNAVAILABLE');
            const actorUserId = actors[0].actor_user_id;
            const action = operation === 'rollback' ? 'account_cutover_rollback' : 'account_cutover';
            for (const target of changes) {
                const nextVersion = Math.max(1, numeric(target.access_version)) + 1;
                const grantState = accountGrantState(beforeGrants, target.user_id);
                await connection.query(
                    'UPDATE user_access_policies SET mode = ?, access_version = ? WHERE user_id = ?',
                    [desiredMode, nextVersion, target.user_id]
                );
                await connection.query(
                    `INSERT INTO user_permission_audits
                        (actor_user_id, target_user_id, action, access_version, before_state, after_state)
                     VALUES (?, ?, ?, ?, ?, ?)`,
                    [
                        actorUserId,
                        target.user_id,
                        action,
                        nextVersion,
                        JSON.stringify({ mode: target.mode, ...grantState }),
                        JSON.stringify({ mode: desiredMode, ...grantState })
                    ]
                );
                auditsWritten += 1;
            }
        }

        const afterGrants = await loadGrantRows(connection, userIds);
        const afterFingerprint = buildGrantFingerprint(afterGrants);
        if (afterFingerprint !== beforeFingerprint || afterGrants.length !== beforeGrants.length) {
            throw new Error('CUTOVER_GRANTS_CHANGED');
        }

        const report = {
            operation,
            role,
            accounts: targets.length,
            changed_accounts: changes.length,
            unchanged_accounts: targets.length - changes.length,
            target_mode: desiredMode,
            grants: beforeGrants.length,
            grant_fingerprint: beforeFingerprint,
            grants_unchanged: true,
            access_version_before: versionRange(versionsBefore),
            access_version_after: versionRange(versionsAfter),
            audits_written: auditsWritten,
            parity: {
                users: numeric(roleParity.users),
                expected_grants: numeric(roleParity.expected_grants),
                actual_grants: numeric(roleParity.actual_grants),
                missing: numeric(roleParity.missing),
                unexpected: numeric(roleParity.unexpected),
                unexplained_differences: numeric(parityReport.unexplained_differences)
            }
        };

        if (operation === 'dry-run') await connection.rollback();
        else await connection.commit();
        return report;
    } catch (error) {
        try { await connection.rollback(); } catch (_rollbackError) {}
        throw error;
    } finally {
        connection.release();
    }
}

function writeReport(reportPath, report) {
    if (!reportPath) return;
    const target = path.resolve(reportPath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
    fs.chmodSync(target, 0o600);
}

module.exports = {
    ROLE_ORDER,
    assertRoleOrder,
    buildGrantFingerprint,
    parseArguments,
    runCutover,
    writeReport
};

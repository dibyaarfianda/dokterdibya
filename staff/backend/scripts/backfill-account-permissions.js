'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { LEGACY_PERMISSION_NAMES, PERMISSION_CATALOG } = require('../config/accessControlCatalog');
const { MENU_PERMISSION_MAP } = require('../config/accessControlRegistry');
const { ROLE_IDS } = require('../constants/roles');

function sortedSet(values) {
    return new Set([...new Set(values || [])].sort((a, b) => a.localeCompare(b)));
}

function sourceMatches(source, context, resolved) {
    if (!source || !source.kind) return false;
    if (source.kind === 'all_staff') return true;
    if (source.kind === 'doctor') return context.user.isDoctorProtected;
    if (source.kind === 'role') return context.user.roleName === source.value;
    if (source.kind === 'menu') return context.visibleMenus.has(source.value);
    if (source.kind === 'permission') {
        return context.rolePermissions.has(source.value)
            || context.directPermissions.has(source.value)
            || resolved.has(source.value);
    }
    throw new Error(`Unknown legacy permission source: ${source.kind}`);
}

function buildExpectedGrantNames(context) {
    if (context.user.isDoctorProtected) return new Set();

    const catalog = context.catalog || PERMISSION_CATALOG;
    const resolved = sortedSet(context.directPermissions || []);
    let changed = true;
    while (changed) {
        changed = false;
        for (const item of catalog) {
            if (resolved.has(item.name)) continue;
            if ((item.legacySources || []).some(source => sourceMatches(source, context, resolved))) {
                resolved.add(item.name);
                changed = true;
            }
        }
    }
    return sortedSet(resolved);
}

function compareGrantParity(expected, actual) {
    const missing = [...expected].filter(name => !actual.has(name)).sort();
    const unexpected = [...actual].filter(name => !expected.has(name)).sort();
    return { missing, unexpected, unexplained: missing.length + unexpected.length };
}

function parseJson(value) {
    if (!value) return null;
    if (typeof value === 'object') return value;
    try {
        return JSON.parse(value);
    } catch (_error) {
        return null;
    }
}

function hashNames(names) {
    return crypto.createHash('sha256').update([...names].sort().join('\n')).digest('hex');
}

function buildLegacySurfaceConflicts(state) {
    const legacyNames = new Set(LEGACY_PERMISSION_NAMES);
    const conflicts = new Map();
    for (const user of state.users) {
        if (user.isDoctorProtected) continue;
        const rolePermissions = state.byRole.get(user.roleId) || new Set();
        const directPermissions = state.baselineDirectByUser.get(user.userId)
            || state.currentDirectByUser.get(user.userId)
            || new Set();
        const visibleMenus = state.menusByRole.get(user.roleName) || new Set();
        for (const [menuKey, permissionName] of Object.entries(MENU_PERMISSION_MAP)) {
            if (!legacyNames.has(permissionName)) continue;
            const menuVisible = visibleMenus.has(menuKey);
            const endpointGranted = rolePermissions.has(permissionName) || directPermissions.has(permissionName);
            if (menuVisible === endpointGranted) continue;
            const key = `${user.roleName || 'none'}|${menuKey}|${menuVisible}|${endpointGranted}`;
            if (!conflicts.has(key)) {
                conflicts.set(key, {
                    role: user.roleName || 'none',
                    menu_key: menuKey,
                    permission: permissionName,
                    menu_visible: menuVisible,
                    endpoint_granted: endpointGranted,
                    accounts: 0,
                    resolution: endpointGranted ? 'preserve_endpoint_access' : 'preserve_menu_denial'
                });
            }
            conflicts.get(key).accounts += 1;
        }
    }
    return [...conflicts.values()].sort((left, right) =>
        `${left.role}|${left.menu_key}`.localeCompare(`${right.role}|${right.menu_key}`)
    );
}

async function loadMigrationState(connection) {
    const [users] = await connection.query(
        `SELECT u.new_id AS user_id, u.role_id, COALESCE(r.name, u.role) AS role_name,
                u.is_superadmin
         FROM users u
         LEFT JOIN roles r ON r.id = u.role_id
         WHERE u.user_type = 'staff'
         ORDER BY u.new_id`
    );
    const [rolePermissionRows] = await connection.query(
        `SELECT rp.role_id, p.name
         FROM role_permissions rp
         INNER JOIN permissions p ON p.id = rp.permission_id`
    );
    const [directRows] = await connection.query(
        `SELECT upg.user_id, p.name
         FROM user_permission_grants upg
         INNER JOIN permissions p ON p.id = upg.permission_id`
    );
    const [visibilityRows] = await connection.query(
        `SELECT role_name, menu_key
         FROM role_visibility
         WHERE is_visible = 1`
    );
    const [baselineRows] = await connection.query(
        `SELECT target_user_id, after_state
         FROM user_permission_audits
         WHERE action = 'catalog_migration_baseline'
         ORDER BY id`
    );

    const byRole = new Map();
    for (const row of rolePermissionRows) {
        if (!byRole.has(Number(row.role_id))) byRole.set(Number(row.role_id), new Set());
        byRole.get(Number(row.role_id)).add(row.name);
    }
    const currentDirectByUser = new Map();
    for (const row of directRows) {
        if (!currentDirectByUser.has(row.user_id)) currentDirectByUser.set(row.user_id, new Set());
        currentDirectByUser.get(row.user_id).add(row.name);
    }
    const baselineDirectByUser = new Map();
    for (const row of baselineRows) {
        const parsed = parseJson(row.after_state);
        if (!baselineDirectByUser.has(row.target_user_id) && Array.isArray(parsed?.direct_permissions)) {
            baselineDirectByUser.set(row.target_user_id, new Set(parsed.direct_permissions));
        }
    }
    const menusByRole = new Map();
    for (const row of visibilityRows) {
        if (!menusByRole.has(row.role_name)) menusByRole.set(row.role_name, new Set());
        menusByRole.get(row.role_name).add(row.menu_key);
    }

    return {
        users: users.map(row => ({
            userId: row.user_id,
            roleId: row.role_id == null ? null : Number(row.role_id),
            roleName: row.role_name || null,
            isDoctorProtected: Number(row.is_superadmin) === 1 || Number(row.role_id) === ROLE_IDS.DOKTER
        })),
        byRole,
        currentDirectByUser,
        baselineDirectByUser,
        menusByRole
    };
}

function expectedForUser(state, user) {
    return buildExpectedGrantNames({
        user,
        rolePermissions: state.byRole.get(user.roleId) || new Set(),
        directPermissions: state.baselineDirectByUser.get(user.userId)
            || state.currentDirectByUser.get(user.userId)
            || new Set(),
        visibleMenus: state.menusByRole.get(user.roleName) || new Set(),
        catalog: PERMISSION_CATALOG
    });
}

async function seedCatalog(connection) {
    for (const item of PERMISSION_CATALOG) {
        await connection.query(
            `INSERT INTO permissions (name, display_name, category, description)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE name = VALUES(name)`,
            [item.name, item.displayName, item.category, item.description]
        );
    }
}

async function permissionIdMap(connection) {
    const [rows] = await connection.query('SELECT id, name FROM permissions');
    return new Map(rows.map(row => [row.name, Number(row.id)]));
}

async function findMigrationActor(connection) {
    const [rows] = await connection.query(
        `SELECT new_id
         FROM users
         WHERE user_type = 'staff' AND is_active = 1
           AND (role_id = ? OR is_superadmin = 1)
         ORDER BY is_superadmin DESC, new_id
         LIMIT 1`,
        [ROLE_IDS.DOKTER]
    );
    if (!rows.length) throw new Error('No active protected doctor account is available as migration actor');
    return rows[0].new_id;
}

async function writeBaselineAudit(connection, actorId, user, directPermissions) {
    await connection.query(
        `INSERT INTO user_permission_audits
            (actor_user_id, target_user_id, action, access_version, before_state, after_state)
         SELECT ?, ?, 'catalog_migration_baseline', 1, NULL, ?
         WHERE NOT EXISTS (
            SELECT 1 FROM user_permission_audits
            WHERE target_user_id = ? AND action = 'catalog_migration_baseline'
         )`,
        [actorId, user.userId, JSON.stringify({ direct_permissions: [...directPermissions].sort() }), user.userId]
    );
}

async function insertExpectedGrants(connection, user, expected, ids) {
    for (const name of expected) {
        const permissionId = ids.get(name);
        if (!permissionId) throw new Error(`Permission missing after catalog seed: ${name}`);
        await connection.query(
            `INSERT IGNORE INTO user_permission_grants (user_id, permission_id)
             VALUES (?, ?)`,
            [user.userId, permissionId]
        );
    }
}

async function writeGrantAudit(connection, actorId, user, beforePermissions, afterPermissions) {
    await connection.query(
        `INSERT INTO user_permission_audits
            (actor_user_id, target_user_id, action, access_version, before_state, after_state)
         SELECT ?, ?, 'catalog_migration_grants', 1, ?, ?
         WHERE NOT EXISTS (
            SELECT 1 FROM user_permission_audits
            WHERE target_user_id = ? AND action = 'catalog_migration_grants'
         )`,
        [
            actorId,
            user.userId,
            JSON.stringify({ permissions: [...beforePermissions].sort() }),
            JSON.stringify({ permissions: [...afterPermissions].sort() }),
            user.userId
        ]
    );
}

async function loadActualGrantNames(connection) {
    const [rows] = await connection.query(
        `SELECT upg.user_id, p.name
         FROM user_permission_grants upg
         INNER JOIN permissions p ON p.id = upg.permission_id`
    );
    const result = new Map();
    for (const row of rows) {
        if (!result.has(row.user_id)) result.set(row.user_id, new Set());
        result.get(row.user_id).add(row.name);
    }
    return result;
}

function buildSanitizedReport(state, expectedByUser, actualByUser, mode) {
    const roles = new Map();
    let unexplained = 0;
    let migratedUsers = 0;
    for (const user of state.users) {
        if (user.isDoctorProtected) continue;
        migratedUsers += 1;
        const expected = expectedByUser.get(user.userId) || new Set();
        const actual = actualByUser.get(user.userId) || new Set();
        const parity = compareGrantParity(expected, actual);
        unexplained += parity.unexplained;
        if (!roles.has(user.roleName || 'none')) {
            roles.set(user.roleName || 'none', { users: 0, expected: 0, actual: 0, missing: 0, unexpected: 0, fingerprints: [] });
        }
        const summary = roles.get(user.roleName || 'none');
        summary.users += 1;
        summary.expected += expected.size;
        summary.actual += actual.size;
        summary.missing += parity.missing.length;
        summary.unexpected += parity.unexpected.length;
        summary.fingerprints.push(hashNames(actual));
    }

    const legacySurfaceConflicts = buildLegacySurfaceConflicts(state);
    return {
        mode,
        catalog_permissions: PERMISSION_CATALOG.length,
        migrated_users: migratedUsers,
        protected_doctors_skipped: state.users.length - migratedUsers,
        unexplained_differences: unexplained,
        explained_legacy_surface_conflicts: legacySurfaceConflicts.reduce((sum, item) => sum + item.accounts, 0),
        legacy_surface_conflicts: legacySurfaceConflicts,
        roles: Object.fromEntries([...roles.entries()].sort().map(([role, summary]) => [role, {
            users: summary.users,
            expected_grants: summary.expected,
            actual_grants: summary.actual,
            missing: summary.missing,
            unexpected: summary.unexpected,
            fingerprint: hashNames(summary.fingerprints)
        }]))
    };
}

async function runBackfill({ apply = false, db = require('../db') } = {}) {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const initialState = await loadMigrationState(connection);
        const expectedByUser = new Map();
        for (const user of initialState.users) expectedByUser.set(user.userId, expectedForUser(initialState, user));

        if (apply) {
            const actorId = await findMigrationActor(connection);
            await seedCatalog(connection);
            const ids = await permissionIdMap(connection);
            for (const user of initialState.users) {
                if (user.isDoctorProtected) continue;
                const baseline = initialState.baselineDirectByUser.get(user.userId)
                    || initialState.currentDirectByUser.get(user.userId)
                    || new Set();
                await writeBaselineAudit(connection, actorId, user, baseline);
                await insertExpectedGrants(connection, user, expectedByUser.get(user.userId), ids);
                await writeGrantAudit(connection, actorId, user, baseline, expectedByUser.get(user.userId));
            }
        }

        const actualByUser = apply
            ? await loadActualGrantNames(connection)
            : initialState.currentDirectByUser;
        const report = buildSanitizedReport(initialState, expectedByUser, actualByUser, apply ? 'apply' : 'dry-run');
        if (apply && report.unexplained_differences !== 0) {
            throw new Error(`Grant parity failed with ${report.unexplained_differences} unexplained differences`);
        }
        if (apply) await connection.commit();
        else await connection.rollback();
        return report;
    } catch (error) {
        try { await connection.rollback(); } catch (_rollbackError) {}
        throw error;
    } finally {
        connection.release();
    }
}

function parseArguments(argv) {
    const apply = argv.includes('--apply');
    const reportArg = argv.find(arg => arg.startsWith('--report='));
    return { apply, reportPath: reportArg ? reportArg.slice('--report='.length) : null };
}

async function main() {
    const options = parseArguments(process.argv.slice(2));
    const db = require('../db');
    try {
        const report = await runBackfill({ apply: options.apply, db });
        const serialized = `${JSON.stringify(report, null, 2)}\n`;
        if (options.reportPath) {
            const target = path.resolve(options.reportPath);
            fs.mkdirSync(path.dirname(target), { recursive: true });
            fs.writeFileSync(target, serialized, { mode: 0o600 });
        }
        process.stdout.write(serialized);
        if (report.unexplained_differences !== 0) process.exitCode = 2;
    } finally {
        await db.end();
    }
}

if (require.main === module) {
    main().catch(error => {
        process.stderr.write(`Account permission backfill failed: ${error.message}\n`);
        process.exitCode = 1;
    });
}

module.exports = {
    buildExpectedGrantNames,
    buildLegacySurfaceConflicts,
    buildSanitizedReport,
    compareGrantParity,
    runBackfill
};

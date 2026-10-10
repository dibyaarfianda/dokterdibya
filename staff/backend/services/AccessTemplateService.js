'use strict';

const defaultDb = require('../db');
const { ROLE_IDS } = require('../constants/roles');
const {
    assertAccessVersion,
    deriveNavigationPermissions,
    getAccessTemplates,
    resolveAccessTemplate,
    resolveStaffPermissions
} = require('./AccessControlManagementService');

function accessError(message, statusCode, code) {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.code = code;
    error.isOperational = true;
    return error;
}

function sortedUnique(values) {
    return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

class AccessTemplateService {
    constructor({ db = defaultDb } = {}) {
        this.db = db;
    }

    async listTemplates(client = this.db) {
        const defaults = getAccessTemplates();
        const [storedRows] = await client.query(
            `SELECT template_key, template_version, is_customized, updated_at, updated_by
             FROM staff_access_templates`
        );
        const [permissionRows] = storedRows.length
            ? await client.query(
                `SELECT satp.template_key, p.name
                 FROM staff_access_template_permissions satp
                 INNER JOIN permissions p ON p.id = satp.permission_id
                 ORDER BY satp.template_key, p.name`
            )
            : [[]];
        const storedByKey = new Map(storedRows.map(row => [row.template_key, row]));
        const permissionsByKey = new Map();
        for (const row of permissionRows) {
            if (!permissionsByKey.has(row.template_key)) permissionsByKey.set(row.template_key, []);
            permissionsByKey.get(row.template_key).push(row.name);
        }

        return defaults.map(template => {
            const stored = storedByKey.get(template.key);
            const customized = Number(stored?.is_customized) === 1;
            return {
                ...template,
                permissions: customized
                    ? resolveStaffPermissions(permissionsByKey.get(template.key) || [])
                    : template.permissions,
                template_version: Math.max(1, Number(stored?.template_version) || 1),
                is_customized: customized,
                updated_at: stored?.updated_at || null,
                updated_by: stored?.updated_by || null
            };
        });
    }

    async getTemplate(templateKey, client = this.db) {
        const resolvedDefault = resolveAccessTemplate(templateKey);
        const templates = await this.listTemplates(client);
        return templates.find(template => template.key === resolvedDefault.key);
    }

    async _readTemplatePermissions(connection, templateKey) {
        const [rows] = await connection.query(
            `SELECT p.name
             FROM staff_access_template_permissions satp
             INNER JOIN permissions p ON p.id = satp.permission_id
             WHERE satp.template_key = ?
             ORDER BY p.name`,
            [templateKey]
        );
        return rows.map(row => row.name);
    }

    async _loadPermissionRows(connection, permissionNames) {
        const [permissionRows] = await connection.query(
            'SELECT id, name FROM permissions WHERE name IN (?)',
            [permissionNames]
        );
        if (permissionRows.length !== permissionNames.length) {
            throw accessError('Katalog izin belum sinkron dengan database.', 500, 'PERMISSION_CATALOG_MISMATCH');
        }
        return permissionRows;
    }

    async saveTemplate(templateKey, input, actorUserId, { applyToAccounts = false } = {}) {
        const metadata = resolveAccessTemplate(templateKey);
        const resolved = resolveStaffPermissions(input?.permissions);
        const connection = await this.db.getConnection();
        await connection.beginTransaction();
        try {
            const [templateRows] = await connection.query(
                `SELECT template_version, is_customized
                 FROM staff_access_templates
                 WHERE template_key = ?
                 FOR UPDATE`,
                [metadata.key]
            );
            if (!templateRows.length) {
                throw accessError('Template jabatan belum tersedia.', 503, 'ACCESS_TEMPLATE_UNAVAILABLE');
            }
            assertAccessVersion(input?.template_version, templateRows[0].template_version);
            const beforePermissions = Number(templateRows[0].is_customized) === 1
                ? await this._readTemplatePermissions(connection, metadata.key)
                : metadata.permissions;

            await connection.query(
                'DELETE FROM staff_access_template_permissions WHERE template_key = ?',
                [metadata.key]
            );
            const permissionRows = await this._loadPermissionRows(connection, resolved);
            if (permissionRows.length) {
                await connection.query(
                    'INSERT INTO staff_access_template_permissions (template_key, permission_id) VALUES ?',
                    [permissionRows.map(permission => [metadata.key, permission.id])]
                );
            }
            const nextVersion = Number(templateRows[0].template_version) + 1;
            await connection.query(
                `UPDATE staff_access_templates
                 SET template_version = ?, is_customized = 1, updated_by = ?
                 WHERE template_key = ?`,
                [nextVersion, actorUserId, metadata.key]
            );

            const affectedUserIds = applyToAccounts
                ? await this._applyToAccounts(connection, metadata, resolved, actorUserId)
                : [];
            await connection.query(
                `INSERT INTO staff_access_template_audits
                    (actor_user_id, template_key, action, template_version,
                     affected_account_count, before_state, after_state)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                    actorUserId,
                    metadata.key,
                    applyToAccounts ? 'template_saved_and_applied' : 'template_saved',
                    nextVersion,
                    affectedUserIds.length,
                    JSON.stringify({ permissions: beforePermissions }),
                    JSON.stringify({ permissions: resolved })
                ]
            );
            await connection.commit();
            return {
                template: {
                    ...metadata,
                    permissions: resolved,
                    template_version: nextVersion,
                    is_customized: true,
                    updated_by: actorUserId
                },
                affected_user_ids: affectedUserIds,
                affected_count: affectedUserIds.length
            };
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    async _applyToAccounts(connection, metadata, templatePermissions, actorUserId) {
        const [targets] = await connection.query(
            `SELECT u.new_id AS user_id, uap.access_version
             FROM user_access_policies uap
             INNER JOIN users u ON u.new_id = uap.user_id
             WHERE uap.template_key = ?
               AND u.user_type = 'staff'
               AND COALESCE(u.is_superadmin, 0) = 0
               AND COALESCE(u.role_id, 0) <> ?
             ORDER BY u.new_id
             FOR UPDATE`,
            [metadata.key, ROLE_IDS.DOKTER]
        );
        if (!targets.length) return [];

        const assigned = sortedUnique([
            ...templatePermissions,
            ...deriveNavigationPermissions(templatePermissions)
        ]);
        const permissionRows = await this._loadPermissionRows(connection, assigned);
        for (const target of targets) {
            const [beforeRows] = await connection.query(
                `SELECT p.name
                 FROM user_permission_grants upg
                 INNER JOIN permissions p ON p.id = upg.permission_id
                 WHERE upg.user_id = ?
                 ORDER BY p.name`,
                [target.user_id]
            );
            await connection.query('DELETE FROM user_permission_grants WHERE user_id = ?', [target.user_id]);
            if (permissionRows.length) {
                await connection.query(
                    'INSERT INTO user_permission_grants (user_id, permission_id) VALUES ?',
                    [permissionRows.map(permission => [target.user_id, permission.id])]
                );
            }
            const nextAccessVersion = Number(target.access_version) + 1;
            await connection.query(
                'UPDATE user_access_policies SET access_version = ? WHERE user_id = ?',
                [nextAccessVersion, target.user_id]
            );
            await connection.query(
                `INSERT INTO user_permission_audits
                    (actor_user_id, target_user_id, action, access_version, before_state, after_state)
                 VALUES (?, ?, 'template_applied', ?, ?, ?)`,
                [
                    actorUserId,
                    target.user_id,
                    nextAccessVersion,
                    JSON.stringify({ permissions: beforeRows.map(row => row.name) }),
                    JSON.stringify({ permissions: assigned, template_key: metadata.key })
                ]
            );
        }
        return targets.map(target => target.user_id);
    }
}

const accessTemplateService = new AccessTemplateService();

module.exports = {
    AccessTemplateService,
    accessTemplateService
};

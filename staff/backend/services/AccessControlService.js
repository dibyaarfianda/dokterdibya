'use strict';

const defaultDb = require('../db');
const defaultLogger = require('../utils/logger');
const { ROLE_IDS } = require('../constants/roles');
const { STAFF_NAVIGATION_MAP } = require('../config/accessControlRegistry');

function asSortedSet(values) {
    return new Set([...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b)));
}

class AccessControlService {
    constructor({ db = defaultDb, logger = defaultLogger } = {}) {
        this.db = db;
        this.logger = logger;
    }

    async getStaffAccountState(userId) {
        if (!userId) return null;

        const [rows] = await this.db.query(
            `SELECT
                u.new_id,
                u.user_type,
                u.is_active,
                u.is_superadmin,
                u.role_id,
                COALESCE(r.name, u.role) AS role_name,
                COALESCE(uap.mode, 'legacy') AS access_mode,
                COALESCE(uap.access_version, 1) AS access_version,
                COALESCE(uap.job_label, r.display_name, r.name, u.role, 'Staff') AS job_label
             FROM users u
             LEFT JOIN roles r ON r.id = u.role_id
             LEFT JOIN user_access_policies uap ON uap.user_id = u.new_id
             WHERE u.new_id = ?
             LIMIT 1`,
            [userId]
        );

        if (!rows.length) return null;
        const row = rows[0];
        return {
            userId: row.new_id,
            userType: row.user_type,
            isActive: Number(row.is_active) === 1,
            isSuperadmin: Number(row.is_superadmin) === 1,
            roleId: row.role_id == null ? null : Number(row.role_id),
            roleName: row.role_name || null,
            jobLabel: row.job_label || 'Staff',
            mode: row.access_mode === 'account' ? 'account' : 'legacy',
            accessVersion: Math.max(1, Number(row.access_version) || 1)
        };
    }

    async getEffectiveAccess(userId) {
        const account = await this.getStaffAccountState(userId);
        if (!account || account.userType !== 'staff') {
            const error = new Error('Staff access denied');
            error.code = 'ACCESS_DENIED';
            error.statusCode = 403;
            throw error;
        }

        const isDoctorProtected = account.isSuperadmin || account.roleId === ROLE_IDS.DOKTER;
        let accountPermissions;

        if (isDoctorProtected) {
            const [rows] = await this.db.query('SELECT name FROM permissions ORDER BY name');
            accountPermissions = asSortedSet(rows.map(row => row.name));
        } else {
            const [rows] = await this.db.query(
                `SELECT p.name
                 FROM user_permission_grants upg
                 INNER JOIN permissions p ON p.id = upg.permission_id
                 WHERE upg.user_id = ?
                 ORDER BY p.name`,
                [userId]
            );
            accountPermissions = asSortedSet(rows.map(row => row.name));
        }

        // After the final cutover, the stored mode is retained only for audited
        // rollback with an older application release. Current non-doctor
        // authorization always uses the per-account assignment table.
        const permissions = accountPermissions;
        const effectiveMode = isDoctorProtected ? account.mode : 'account';

        return {
            ...account,
            mode: effectiveMode,
            isDoctorProtected,
            permissions,
            // Keep these aliases for one compatibility cycle. They intentionally
            // expose the same account decision and never consult legacy tables.
            legacyPermissions: accountPermissions,
            accountPermissions
        };
    }

    hasAnyPermission(access, requiredPermissions) {
        if (!access || !access.permissions || !Array.isArray(requiredPermissions) || !requiredPermissions.length) {
            return false;
        }
        return requiredPermissions.some(permission => access.permissions.has(permission));
    }

    toPublicAccess(access) {
        const permissions = access.permissions;
        const navigation = Object.entries(STAFF_NAVIGATION_MAP)
            .filter(([, permission]) => permissions.has(permission))
            .map(([navId]) => navId)
            .sort((a, b) => a.localeCompare(b));
        return {
            mode: access.mode,
            access_version: access.accessVersion,
            is_doctor_protected: access.isDoctorProtected,
            job_label: access.jobLabel,
            permissions: [...permissions],
            navigation
        };
    }
}

const accessControlService = new AccessControlService();

module.exports = {
    AccessControlService,
    accessControlService
};

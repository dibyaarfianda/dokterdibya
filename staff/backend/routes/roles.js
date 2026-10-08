'use strict';

const express = require('express');
const defaultDb = require('../db');
const { asyncHandler, AppError } = require('../middleware/errorHandler');
const { sendSuccess } = require('../utils/response');
const { HTTP_STATUS } = require('../config/constants');
const {
    verifyToken,
    verifyActiveStaff,
    requireSuperadmin
} = require('../middleware/auth');
const { accessControlService } = require('../services/AccessControlService');
const { ROLE_IDS, isSuperadminRole } = require('../constants/roles');

const LEGACY_DISABLED_MESSAGE = 'Pengelolaan role lama telah dinonaktifkan. Gunakan Kelola Akses per akun.';

function legacyWriteDisabled(_req, res) {
    return res.status(410).json({
        success: false,
        code: 'LEGACY_ACCESS_DISABLED',
        message: LEGACY_DISABLED_MESSAGE
    });
}

function canReadAnotherUser(req, userId) {
    return String(req.user?.id) === String(userId)
        || Boolean(req.user?.is_superadmin)
        || isSuperadminRole(req.user?.role_id);
}

function createLegacyRoleAdapterRouter({
    db = defaultDb,
    effectiveAccessService = accessControlService,
    auth = { verifyToken, verifyActiveStaff, requireSuperadmin }
} = {}) {
    const router = express.Router();
    const protectedRead = [auth.verifyToken, auth.verifyActiveStaff, auth.requireSuperadmin];
    const protectedWrite = [auth.verifyToken, auth.verifyActiveStaff, auth.requireSuperadmin, legacyWriteDisabled];

    // Read-only compatibility endpoints for one Staff asset cycle. Counts and
    // assignments come from per-account grants; roles are only job labels.
    router.get('/api/roles', ...protectedRead, asyncHandler(async (_req, res) => {
        const [roles] = await db.query(`
            SELECT r.*,
                (SELECT COUNT(DISTINCT upg.permission_id)
                 FROM users assigned_user
                 INNER JOIN user_permission_grants upg ON upg.user_id = assigned_user.new_id
                 WHERE assigned_user.user_type = 'staff' AND assigned_user.role_id = r.id) AS permission_count,
                (SELECT COUNT(*) FROM users assigned_user
                 WHERE assigned_user.user_type = 'staff' AND assigned_user.role_id = r.id) AS user_count
            FROM roles r
            ORDER BY permission_count DESC, r.name ASC
        `);
        sendSuccess(res, roles, 'Legacy role labels retrieved from account assignments');
    }));

    router.get('/api/roles/:id', ...protectedRead, asyncHandler(async (req, res) => {
        const [roleRows] = await db.query('SELECT * FROM roles WHERE id = ?', [req.params.id]);
        if (!roleRows.length) throw new AppError('Role tidak ditemukan', HTTP_STATUS.NOT_FOUND);
        const [permissions] = await db.query(`
            SELECT p.*,
                CASE
                    WHEN ? = ${ROLE_IDS.DOKTER} THEN 1
                    WHEN EXISTS (
                        SELECT 1
                        FROM users assigned_user
                        INNER JOIN user_permission_grants upg ON upg.user_id = assigned_user.new_id
                        WHERE assigned_user.user_type = 'staff'
                          AND assigned_user.role_id = ?
                          AND upg.permission_id = p.id
                    ) THEN 1 ELSE 0
                END AS is_assigned
            FROM permissions p
            ORDER BY p.category, p.name
        `, [Number(req.params.id), Number(req.params.id)]);
        sendSuccess(res, { ...roleRows[0], permissions }, 'Legacy role detail adapted from account assignments');
    }));

    router.get('/api/permissions', ...protectedRead, asyncHandler(async (_req, res) => {
        const [permissions] = await db.query(`
            SELECT p.*, COUNT(DISTINCT assigned_user.role_id) AS role_count
            FROM permissions p
            LEFT JOIN user_permission_grants upg ON upg.permission_id = p.id
            LEFT JOIN users assigned_user ON assigned_user.new_id = upg.user_id
                AND assigned_user.user_type = 'staff'
            GROUP BY p.id
            ORDER BY p.category, p.name
        `);
        const grouped = {};
        for (const permission of permissions) {
            (grouped[permission.category] ||= []).push(permission);
        }
        sendSuccess(res, { permissions, grouped }, 'Permissions retrieved from account assignments');
    }));

    router.get('/api/users/:userId/permissions', auth.verifyToken, auth.verifyActiveStaff, asyncHandler(async (req, res) => {
        if (!canReadAnotherUser(req, req.params.userId)) {
            throw new AppError('Akses ditolak', HTTP_STATUS.FORBIDDEN, true, 'ACCESS_DENIED');
        }
        const access = await effectiveAccessService.getEffectiveAccess(req.params.userId);
        const names = [...access.permissions];
        if (!names.length) return sendSuccess(res, [], 'User permissions retrieved successfully');
        const [permissions] = await db.query(
            `SELECT name, display_name, category, description
             FROM permissions
             WHERE name IN (?)
             ORDER BY category, name`,
            [names]
        );
        return sendSuccess(res, permissions, 'User permissions retrieved successfully');
    }));

    router.get('/api/users/:userId/roles', auth.verifyToken, auth.verifyActiveStaff, asyncHandler(async (req, res) => {
        if (!canReadAnotherUser(req, req.params.userId)) {
            throw new AppError('Akses ditolak', HTTP_STATUS.FORBIDDEN, true, 'ACCESS_DENIED');
        }
        const [roles] = await db.query(`
            SELECT r.id, r.name, r.display_name, r.description, 1 AS is_primary,
                CASE WHEN r.id = ${ROLE_IDS.DOKTER}
                     THEN (SELECT COUNT(*) FROM permissions)
                     ELSE (SELECT COUNT(*) FROM user_permission_grants upg WHERE upg.user_id = u.new_id)
                END AS permission_count
            FROM users u
            INNER JOIN roles r ON r.id = u.role_id
            WHERE u.new_id = ? AND u.user_type = 'staff'
            LIMIT 1
        `, [req.params.userId]);
        sendSuccess(res, roles, 'User job label retrieved successfully');
    }));

    router.get('/api/users', ...protectedRead, asyncHandler(async (_req, res) => {
        const [users] = await db.query(`
            SELECT u.new_id AS id, u.name, u.email, u.is_active, u.created_at, u.user_type,
                r.id AS primary_role_id, r.name AS primary_role_name, r.display_name AS primary_role_display,
                CASE WHEN r.id = ${ROLE_IDS.DOKTER}
                     THEN (SELECT COUNT(*) FROM permissions)
                     ELSE COUNT(DISTINCT upg.permission_id)
                END AS max_permission_count
            FROM users u
            LEFT JOIN roles r ON r.id = u.role_id
            LEFT JOIN user_permission_grants upg ON upg.user_id = u.new_id
            WHERE u.user_type = 'staff'
            GROUP BY u.new_id, u.name, u.email, u.is_active, u.created_at, u.user_type,
                r.id, r.name, r.display_name
            ORDER BY max_permission_count DESC, u.name ASC
        `);
        for (const user of users) {
            user.roles = user.primary_role_id ? [{
                id: user.primary_role_id,
                name: user.primary_role_name,
                display_name: user.primary_role_display,
                is_primary: 1,
                permission_count: Number(user.max_permission_count) || 0
            }] : [];
        }
        sendSuccess(res, users, 'Users retrieved from account assignments');
    }));

    router.post('/api/roles', ...protectedWrite);
    router.put('/api/roles/:id', ...protectedWrite);
    router.delete('/api/roles/:id', ...protectedWrite);
    router.put('/api/roles/:id/permissions', ...protectedWrite);
    router.put('/api/users/:userId/roles', ...protectedWrite);
    router.put('/api/users/:userId/role', ...protectedWrite);
    router.put('/api/users/:userId/status', ...protectedWrite);

    return router;
}

module.exports = createLegacyRoleAdapterRouter();
module.exports.createLegacyRoleAdapterRouter = createLegacyRoleAdapterRouter;
module.exports.LEGACY_DISABLED_MESSAGE = LEGACY_DISABLED_MESSAGE;

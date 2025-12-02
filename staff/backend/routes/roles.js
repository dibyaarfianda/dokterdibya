const express = require('express');
const router = express.Router();
const db = require('../db');
const { verifyToken, requireMenuAccess, requireRole, requireSuperadmin } = require('../middleware/auth');
const { asyncHandler, AppError } = require('../middleware/errorHandler');
const { sendSuccess, sendError } = require('../utils/response');
const { HTTP_STATUS, ERROR_MESSAGES, SUCCESS_MESSAGES } = require('../config/constants');
const logger = require('../utils/logger');
const { ROLE_IDS, isSuperadminRole, isAdminRole } = require('../constants/roles');

// ==========================================
// ROLE MANAGEMENT ROUTES
// ==========================================

// GET /api/roles - Get all roles
router.get('/api/roles', verifyToken, requireMenuAccess('kelola_roles'), asyncHandler(async (req, res) => {
    const [roles] = await db.query(`
        SELECT r.*,
            COUNT(DISTINCT rp.permission_id) as permission_count,
            COUNT(DISTINCT u.new_id) as user_count
        FROM roles r
        LEFT JOIN role_permissions rp ON r.id = rp.role_id
        LEFT JOIN users u ON r.id = u.role_id
        GROUP BY r.id
        ORDER BY permission_count DESC, r.name ASC
    `);

    sendSuccess(res, roles, 'Roles retrieved successfully');
}));

// GET /api/roles/:id - Get role details with permissions
router.get('/api/roles/:id', verifyToken, requireMenuAccess('kelola_roles'), asyncHandler(async (req, res) => {
    const { id } = req.params;

    const [roleRows] = await db.query('SELECT * FROM roles WHERE id = ?', [id]);
    
    if (roleRows.length === 0) {
        throw new AppError('Role tidak ditemukan', HTTP_STATUS.NOT_FOUND);
    }

    const role = roleRows[0];

    // Get permissions for this role
    const [permissions] = await db.query(`
        SELECT p.*, 
            CASE WHEN rp.id IS NOT NULL THEN 1 ELSE 0 END as is_assigned
        FROM permissions p
        LEFT JOIN role_permissions rp ON p.id = rp.permission_id AND rp.role_id = ?
        ORDER BY p.category, p.name
    `, [id]);

    role.permissions = permissions;

    sendSuccess(res, role, 'Role details retrieved successfully');
}));

// POST /api/roles - Create new role
router.post('/api/roles', verifyToken, requireMenuAccess('kelola_roles'), asyncHandler(async (req, res) => {
    const { name, display_name, description } = req.body;

    if (!name || !display_name) {
        throw new AppError('Name dan display name wajib diisi', HTTP_STATUS.BAD_REQUEST);
    }

    // Check if role name already exists
    const [existing] = await db.query('SELECT id FROM roles WHERE name = ?', [name]);
    if (existing.length > 0) {
        throw new AppError('Role dengan nama tersebut sudah ada', HTTP_STATUS.CONFLICT);
    }

    const [result] = await db.query(
        'INSERT INTO roles (name, display_name, description, is_system) VALUES (?, ?, ?, 0)',
        [name, display_name, description || null]
    );

    logger.info(`Role created: ${name} by user ${req.user.id}`);

    sendSuccess(res, { id: result.insertId, name, display_name, description }, 'Role berhasil dibuat', HTTP_STATUS.CREATED);
}));

// PUT /api/roles/:id - Update role
router.put('/api/roles/:id', verifyToken, requireMenuAccess('kelola_roles'), asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { display_name, description } = req.body;

    // Check if role exists
    const [roleRows] = await db.query('SELECT * FROM roles WHERE id = ?', [id]);
    if (roleRows.length === 0) {
        throw new AppError('Role tidak ditemukan', HTTP_STATUS.NOT_FOUND);
    }

    const role = roleRows[0];

    // Don't allow editing dokter role (superadmin)
    if (role.id === ROLE_IDS.DOKTER) {
        throw new AppError('Role dokter (superadmin) tidak dapat diubah', HTTP_STATUS.FORBIDDEN);
    }

    await db.query(
        'UPDATE roles SET display_name = ?, description = ? WHERE id = ?',
        [display_name, description || null, id]
    );

    logger.info(`Role updated: ${role.name} (ID: ${id}) by user ${req.user.id}`);

    sendSuccess(res, null, 'Role berhasil diperbarui');
}));

// DELETE /api/roles/:id - Delete role (Superadmin/Dokter only)
router.delete('/api/roles/:id', verifyToken, requireSuperadmin, asyncHandler(async (req, res) => {
    const { id } = req.params;

    // Check if role exists
    const [roleRows] = await db.query('SELECT * FROM roles WHERE id = ?', [id]);
    if (roleRows.length === 0) {
        throw new AppError('Role tidak ditemukan', HTTP_STATUS.NOT_FOUND);
    }

    const role = roleRows[0];

    // Don't allow deleting dokter role (superadmin)
    if (role.id === ROLE_IDS.DOKTER) {
        throw new AppError('Role dokter (superadmin) tidak dapat dihapus', HTTP_STATUS.FORBIDDEN);
    }

    // Check if role is assigned to users
    const [users] = await db.query('SELECT COUNT(*) as count FROM users WHERE role_id = ?', [id]);
    if (users[0].count > 0) {
        throw new AppError(`Role tidak dapat dihapus karena masih digunakan oleh ${users[0].count} pengguna`, HTTP_STATUS.CONFLICT);
    }

    await db.query('DELETE FROM roles WHERE id = ?', [id]);

    logger.info(`Role deleted: ${role.name} (ID: ${id}) by user ${req.user.id}`);

    sendSuccess(res, null, 'Role berhasil dihapus');
}));

// PUT /api/roles/:id/permissions - Update role permissions
router.put('/api/roles/:id/permissions', verifyToken, requireMenuAccess('kelola_roles'), asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { permission_ids } = req.body;

    if (!Array.isArray(permission_ids)) {
        throw new AppError('permission_ids harus berupa array', HTTP_STATUS.BAD_REQUEST);
    }

    // Check if role exists
    const [roleRows] = await db.query('SELECT * FROM roles WHERE id = ?', [id]);
    if (roleRows.length === 0) {
        throw new AppError('Role tidak ditemukan', HTTP_STATUS.NOT_FOUND);
    }

    const role = roleRows[0];

    // Don't allow editing dokter role permissions (superadmin)
    if (role.id === ROLE_IDS.DOKTER) {
        throw new AppError('Permission role dokter (superadmin) tidak dapat diubah', HTTP_STATUS.FORBIDDEN);
    }

    // Start transaction
    const connection = await db.getConnection();
    await connection.beginTransaction();

    try {
        // Delete existing permissions
        await connection.query('DELETE FROM role_permissions WHERE role_id = ?', [id]);

        // Insert new permissions
        if (permission_ids.length > 0) {
            const values = permission_ids.map(pid => [id, pid]);
            await connection.query(
                'INSERT INTO role_permissions (role_id, permission_id) VALUES ?',
                [values]
            );
        }

        await connection.commit();
        connection.release();

        logger.info(`Role permissions updated for ${role.name} (ID: ${id}) by user ${req.user.id}`);

        sendSuccess(res, null, 'Permission role berhasil diperbarui');
    } catch (error) {
        await connection.rollback();
        connection.release();
        throw error;
    }
}));

// ==========================================
// PERMISSION MANAGEMENT ROUTES
// ==========================================

// GET /api/permissions - Get all permissions
router.get('/api/permissions', verifyToken, requireMenuAccess('kelola_roles'), asyncHandler(async (req, res) => {
    const [permissions] = await db.query(`
        SELECT p.*, 
            COUNT(DISTINCT rp.role_id) as role_count
        FROM permissions p
        LEFT JOIN role_permissions rp ON p.id = rp.permission_id
        GROUP BY p.id
        ORDER BY p.category, p.name
    `);

    // Group by category
    const grouped = {};
    permissions.forEach(perm => {
        if (!grouped[perm.category]) {
            grouped[perm.category] = [];
        }
        grouped[perm.category].push(perm);
    });

    sendSuccess(res, { permissions, grouped }, 'Permissions retrieved successfully');
}));

// ==========================================
// USER ROLE MANAGEMENT ROUTES
// ==========================================

// GET /api/users/:userId/permissions - Get user permissions (aggregated from all roles)
router.get('/api/users/:userId/permissions', verifyToken, requireMenuAccess('kelola_roles'), asyncHandler(async (req, res) => {
    const { userId } = req.params;

    // Users can view their own permissions
    // Admins can view anyone's permissions
    const isOwnPermissions = req.user.id === userId;
    const isAdmin = req.user.is_superadmin || isAdminRole(req.user.role_id);

    if (!isOwnPermissions && !isAdmin) {
        throw new AppError('Akses ditolak', HTTP_STATUS.FORBIDDEN);
    }

    // Query permissions from ALL assigned roles (aggregated)
    const [permissions] = await db.query(`
        SELECT DISTINCT p.name, p.display_name, p.category, p.description
        FROM user_roles ur
        INNER JOIN role_permissions rp ON ur.role_id = rp.role_id
        INNER JOIN permissions p ON rp.permission_id = p.id
        WHERE ur.user_id = ?
        ORDER BY p.category, p.name
    `, [userId]);

    sendSuccess(res, permissions, 'User permissions retrieved successfully');
}));

// GET /api/users/:userId/roles - Get all roles assigned to user
// Note: No requireMenuAccess here - users can always see their own roles
// The isOwnRoles check inside handles authorization
router.get('/api/users/:userId/roles', verifyToken, asyncHandler(async (req, res) => {
    const { userId } = req.params;

    const isOwnRoles = req.user.id === userId;
    const isAdmin = req.user.is_superadmin || isAdminRole(req.user.role_id);

    if (!isOwnRoles && !isAdmin) {
        throw new AppError('Akses ditolak', HTTP_STATUS.FORBIDDEN);
    }

    const [roles] = await db.query(`
        SELECT r.id, r.name, r.display_name, r.description, ur.is_primary,
            (SELECT COUNT(*) FROM role_permissions WHERE role_id = r.id) as permission_count
        FROM user_roles ur
        INNER JOIN roles r ON ur.role_id = r.id
        WHERE ur.user_id = ?
        ORDER BY ur.is_primary DESC, r.display_name ASC
    `, [userId]);

    sendSuccess(res, roles, 'User roles retrieved successfully');
}));

// PUT /api/users/:userId/roles - Assign multiple roles to user
router.put('/api/users/:userId/roles', verifyToken, requireMenuAccess('kelola_roles'), asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const { role_ids, primary_role_id } = req.body;

    if (!Array.isArray(role_ids) || role_ids.length === 0) {
        throw new AppError('role_ids harus berupa array dengan minimal 1 role', HTTP_STATUS.BAD_REQUEST);
    }

    // Check if user exists
    const [userRows] = await db.query('SELECT new_id, name, email FROM users WHERE new_id = ?', [userId]);
    if (userRows.length === 0) {
        throw new AppError('User tidak ditemukan', HTTP_STATUS.NOT_FOUND);
    }

    // Check if all roles exist
    const [validRoles] = await db.query('SELECT id, name, display_name FROM roles WHERE id IN (?)', [role_ids]);
    if (validRoles.length !== role_ids.length) {
        throw new AppError('Satu atau lebih role tidak ditemukan', HTTP_STATUS.NOT_FOUND);
    }

    // Check for dokter role assignment permission
    const hasDokterRole = validRoles.some(r => r.id === ROLE_IDS.DOKTER);
    if (hasDokterRole && !req.user.is_superadmin && !isSuperadminRole(req.user.role_id)) {
        throw new AppError('Hanya dokter yang dapat menetapkan role dokter', HTTP_STATUS.FORBIDDEN);
    }

    // Determine primary role (highest permission count or specified)
    let primaryId = primary_role_id;
    if (!primaryId || !role_ids.includes(primaryId)) {
        // Get role with highest permission count as primary
        const [rolePerms] = await db.query(`
            SELECT role_id, COUNT(*) as perm_count
            FROM role_permissions
            WHERE role_id IN (?)
            GROUP BY role_id
            ORDER BY perm_count DESC
            LIMIT 1
        `, [role_ids]);
        primaryId = rolePerms.length > 0 ? rolePerms[0].role_id : role_ids[0];
    }

    const connection = await db.getConnection();
    await connection.beginTransaction();

    try {
        // Delete existing roles
        await connection.query('DELETE FROM user_roles WHERE user_id = ?', [userId]);

        // Insert new roles
        const values = role_ids.map(rid => [userId, rid, rid === primaryId ? 1 : 0]);
        await connection.query('INSERT INTO user_roles (user_id, role_id, is_primary) VALUES ?', [values]);

        // Update users table with primary role for backward compatibility
        const primaryRole = validRoles.find(r => r.id === primaryId);
        await connection.query('UPDATE users SET role_id = ?, role = ? WHERE new_id = ?',
            [primaryId, primaryRole.name, userId]);

        await connection.commit();
        connection.release();

        logger.info(`User ${userId} assigned roles [${role_ids.join(',')}] (primary: ${primaryId}) by user ${req.user.id}`);

        sendSuccess(res, { assigned_roles: role_ids, primary_role_id: primaryId }, 'Roles berhasil ditetapkan');
    } catch (error) {
        await connection.rollback();
        connection.release();
        throw error;
    }
}));

// PUT /api/users/:userId/role - Assign single role (backward compatible)
router.put('/api/users/:userId/role', verifyToken, requireMenuAccess('kelola_roles'), asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const { role_id } = req.body;

    if (!role_id) {
        throw new AppError('role_id wajib diisi', HTTP_STATUS.BAD_REQUEST);
    }

    // Check if user exists
    const [userRows] = await db.query('SELECT new_id, name, email FROM users WHERE new_id = ?', [userId]);
    if (userRows.length === 0) {
        throw new AppError('User tidak ditemukan', HTTP_STATUS.NOT_FOUND);
    }

    // Check if role exists
    const [roleRows] = await db.query('SELECT id, name, display_name FROM roles WHERE id = ?', [role_id]);
    if (roleRows.length === 0) {
        throw new AppError('Role tidak ditemukan', HTTP_STATUS.NOT_FOUND);
    }

    const role = roleRows[0];

    // Only superadmin can assign dokter role
    if (role.id === ROLE_IDS.DOKTER && !req.user.is_superadmin && !isSuperadminRole(req.user.role_id)) {
        throw new AppError('Hanya dokter yang dapat menetapkan role dokter', HTTP_STATUS.FORBIDDEN);
    }

    const connection = await db.getConnection();
    await connection.beginTransaction();

    try {
        // Update user_roles table
        await connection.query('DELETE FROM user_roles WHERE user_id = ?', [userId]);
        await connection.query('INSERT INTO user_roles (user_id, role_id, is_primary) VALUES (?, ?, 1)', [userId, role_id]);

        // Update users table for backward compatibility
        await connection.query('UPDATE users SET role_id = ?, role = ? WHERE new_id = ?', [role_id, role.name, userId]);

        await connection.commit();
        connection.release();

        logger.info(`User ${userId} assigned role ${role.name} by user ${req.user.id}`);

        sendSuccess(res, null, `Role ${role.display_name} berhasil ditetapkan`);
    } catch (error) {
        await connection.rollback();
        connection.release();
        throw error;
    }
}));

// GET /api/users - Get all staff users with their roles (sorted by highest permission count)
router.get('/api/users', verifyToken, requireRole(ROLE_IDS.DOKTER, ROLE_IDS.ADMIN), asyncHandler(async (req, res) => {
    // Get staff users with their max permission count for sorting
    const [users] = await db.query(`
        SELECT u.new_id as id, u.name, u.email, u.is_active,
            u.created_at, u.user_type,
            r.id as primary_role_id, r.name as primary_role_name, r.display_name as primary_role_display,
            COALESCE((
                SELECT COUNT(DISTINCT rp.permission_id)
                FROM user_roles ur2
                INNER JOIN role_permissions rp ON ur2.role_id = rp.role_id
                WHERE ur2.user_id = u.new_id
            ), 0) as max_permission_count
        FROM users u
        LEFT JOIN roles r ON u.role_id = r.id
        WHERE u.user_type = 'staff'
        ORDER BY max_permission_count DESC, u.name ASC
    `);

    // Get all roles for each user
    const userIds = users.map(u => u.id);
    if (userIds.length > 0) {
        const [userRoles] = await db.query(`
            SELECT ur.user_id, r.id as role_id, r.name as role_name, r.display_name, ur.is_primary,
                (SELECT COUNT(*) FROM role_permissions WHERE role_id = r.id) as permission_count
            FROM user_roles ur
            INNER JOIN roles r ON ur.role_id = r.id
            WHERE ur.user_id IN (?)
            ORDER BY ur.is_primary DESC, permission_count DESC, r.display_name ASC
        `, [userIds]);

        // Map roles to users
        const rolesMap = {};
        userRoles.forEach(ur => {
            if (!rolesMap[ur.user_id]) rolesMap[ur.user_id] = [];
            rolesMap[ur.user_id].push({
                id: ur.role_id,
                name: ur.role_name,
                display_name: ur.display_name,
                is_primary: ur.is_primary,
                permission_count: ur.permission_count
            });
        });

        users.forEach(user => {
            user.roles = rolesMap[user.id] || [];
        });
    }

    sendSuccess(res, users, 'Users retrieved successfully');
}));

// PUT /api/users/:userId/status - Toggle user active status
router.put('/api/users/:userId/status', verifyToken, requireRole(ROLE_IDS.DOKTER, ROLE_IDS.ADMIN), asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const { is_active } = req.body;

    if (typeof is_active !== 'boolean') {
        throw new AppError('is_active harus berupa boolean', HTTP_STATUS.BAD_REQUEST);
    }

    // Check if user exists
    const [userRows] = await db.query('SELECT new_id, name, email FROM users WHERE new_id = ?', [userId]);
    if (userRows.length === 0) {
        throw new AppError('User tidak ditemukan', HTTP_STATUS.NOT_FOUND);
    }

    // Don't allow deactivating yourself
    if (userId === req.user.id) {
        throw new AppError('Anda tidak dapat menonaktifkan akun sendiri', HTTP_STATUS.FORBIDDEN);
    }

    await db.query('UPDATE users SET is_active = ? WHERE new_id = ?', [is_active, userId]);

    logger.info(`User ${userId} ${is_active ? 'activated' : 'deactivated'} by user ${req.user.id}`);

    sendSuccess(res, null, `User berhasil ${is_active ? 'diaktifkan' : 'dinonaktifkan'}`);
}));

module.exports = router;

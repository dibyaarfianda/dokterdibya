const express = require('express');
const router = express.Router();
const db = require('../db');
const { verifyToken, requireRole, requirePermission } = require('../middleware/auth');
const { asyncHandler, AppError } = require('../middleware/errorHandler');
const { sendSuccess, sendError } = require('../utils/response');
const { HTTP_STATUS, ERROR_MESSAGES, SUCCESS_MESSAGES } = require('../config/constants');
const logger = require('../utils/logger');

// ==========================================
// ROLE MANAGEMENT ROUTES
// ==========================================

// GET /api/roles - Get all roles
router.get('/api/roles', verifyToken, requirePermission('roles.view'), asyncHandler(async (req, res) => {
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
router.get('/api/roles/:id', verifyToken, requirePermission('roles.view'), asyncHandler(async (req, res) => {
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
router.post('/api/roles', verifyToken, requirePermission('roles.create'), asyncHandler(async (req, res) => {
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
router.put('/api/roles/:id', verifyToken, requirePermission('roles.edit'), asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { display_name, description } = req.body;

    // Check if role exists
    const [roleRows] = await db.query('SELECT * FROM roles WHERE id = ?', [id]);
    if (roleRows.length === 0) {
        throw new AppError('Role tidak ditemukan', HTTP_STATUS.NOT_FOUND);
    }

    const role = roleRows[0];

    // Don't allow editing dokter role (superadmin)
    if (role.name === 'dokter') {
        throw new AppError('Role dokter (superadmin) tidak dapat diubah', HTTP_STATUS.FORBIDDEN);
    }

    await db.query(
        'UPDATE roles SET display_name = ?, description = ? WHERE id = ?',
        [display_name, description || null, id]
    );

    logger.info(`Role updated: ${role.name} (ID: ${id}) by user ${req.user.id}`);

    sendSuccess(res, null, 'Role berhasil diperbarui');
}));

// DELETE /api/roles/:id - Delete role
router.delete('/api/roles/:id', verifyToken, requirePermission('roles.delete'), asyncHandler(async (req, res) => {
    const { id } = req.params;

    // Check if role exists
    const [roleRows] = await db.query('SELECT * FROM roles WHERE id = ?', [id]);
    if (roleRows.length === 0) {
        throw new AppError('Role tidak ditemukan', HTTP_STATUS.NOT_FOUND);
    }

    const role = roleRows[0];

    // Don't allow deleting dokter role (superadmin)
    if (role.name === 'dokter') {
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
router.put('/api/roles/:id/permissions', verifyToken, requirePermission('roles.edit'), asyncHandler(async (req, res) => {
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
    if (role.name === 'dokter') {
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
router.get('/api/permissions', verifyToken, requirePermission('roles.view'), asyncHandler(async (req, res) => {
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

// GET /api/users/:userId/permissions - Get user permissions
router.get('/api/users/:userId/permissions', verifyToken, asyncHandler(async (req, res) => {
    const { userId } = req.params;

    // Users can view their own permissions
    // Admins can view anyone's permissions
    const isOwnPermissions = req.user.id === userId;
    const isAdmin = req.user.is_superadmin || ['dokter', 'admin'].includes(req.user.role);

    if (!isOwnPermissions && !isAdmin) {
        throw new AppError('Akses ditolak', HTTP_STATUS.FORBIDDEN);
    }

    // Query using new_id
    const [permissions] = await db.query(`
        SELECT DISTINCT p.name, p.display_name, p.category, p.description
        FROM users u
        INNER JOIN roles r ON u.role_id = r.id
        INNER JOIN role_permissions rp ON r.id = rp.role_id
        INNER JOIN permissions p ON rp.permission_id = p.id
        WHERE u.new_id = ?
        ORDER BY p.category, p.name
    `, [userId]);

    sendSuccess(res, permissions, 'User permissions retrieved successfully');
}));

// PUT /api/users/:userId/role - Assign role to user
router.put('/api/users/:userId/role', verifyToken, requirePermission('roles.edit'), asyncHandler(async (req, res) => {
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
    if (role.name === 'dokter' && !req.user.is_superadmin && req.user.role !== 'dokter') {
        throw new AppError('Hanya dokter yang dapat menetapkan role dokter', HTTP_STATUS.FORBIDDEN);
    }

    await db.query('UPDATE users SET role_id = ?, role = ? WHERE new_id = ?', [role_id, role.name, userId]);

    logger.info(`User ${userId} assigned role ${role.name} by user ${req.user.id}`);

    sendSuccess(res, null, `Role ${role.display_name} berhasil ditetapkan`);
}));

// GET /api/users - Get all users with roles (enhanced)
router.get('/api/users', verifyToken, requireRole('dokter', 'admin'), asyncHandler(async (req, res) => {
    const [users] = await db.query(`
        SELECT u.new_id as id, u.name, u.email, u.is_active,
            u.created_at, u.user_type,
            r.id as role_id, r.name as role_name, r.display_name as role_display_name
        FROM users u
        LEFT JOIN roles r ON u.role_id = r.id
        ORDER BY u.created_at DESC
    `);

    sendSuccess(res, users, 'Users retrieved successfully');
}));

// PUT /api/users/:userId/status - Toggle user active status
router.put('/api/users/:userId/status', verifyToken, requireRole('dokter', 'admin'), asyncHandler(async (req, res) => {
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

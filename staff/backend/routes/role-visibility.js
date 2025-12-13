/**
 * Role Visibility API
 * Manage menu visibility per role
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const { verifyToken, requireSuperadmin } = require('../middleware/auth');
const { ROLE_NAMES, isSuperadminRole } = require('../constants/roles');

// Menu definitions
const MENUS = [
    { key: 'dashboard', label: 'Dashboard', icon: 'fa-tachometer-alt' },
    { key: 'pasien_baru', label: 'Pasien Baru', icon: 'fa-user-plus' },
    { key: 'klinik_privat', label: 'Klinik Privat', icon: 'fa-clinic-medical' },
    { key: 'rsia_melinda', label: 'RSIA Melinda', icon: 'fa-hospital' },
    { key: 'rsud_gambiran', label: 'RSUD Gambiran', icon: 'fa-hospital-alt' },
    { key: 'rs_bhayangkara', label: 'RS Bhayangkara', icon: 'fa-hospital-user' },
    { key: 'obat_alkes', label: 'Obat/Alkes', icon: 'fa-pills' },
    { key: 'keuangan', label: 'Keuangan', icon: 'fa-money-bill-wave' },
    { key: 'kelola_pasien', label: 'Kelola Pasien', icon: 'fa-users-cog' },
    { key: 'kelola_roles', label: 'Kelola Roles', icon: 'fa-user-shield' }
];

/**
 * GET /api/role-visibility
 * Get all visibility settings (grouped by role)
 */
router.get('/', verifyToken, async (req, res) => {
    try {
        const [rows] = await db.query(
            'SELECT role_name, menu_key, is_visible FROM role_visibility ORDER BY role_name, menu_key'
        );

        // Group by role
        const byRole = {};
        rows.forEach(row => {
            if (!byRole[row.role_name]) {
                byRole[row.role_name] = {};
            }
            byRole[row.role_name][row.menu_key] = row.is_visible === 1;
        });

        res.json({
            success: true,
            data: byRole,
            menus: MENUS
        });
    } catch (error) {
        console.error('Error fetching role visibility:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * GET /api/role-visibility/:role
 * Get visibility settings for specific role
 */
router.get('/:role', verifyToken, async (req, res) => {
    try {
        const { role } = req.params;
        const [rows] = await db.query(
            'SELECT menu_key, is_visible FROM role_visibility WHERE role_name = ?',
            [role]
        );

        const visibility = {};
        rows.forEach(row => {
            visibility[row.menu_key] = row.is_visible === 1;
        });

        res.json({
            success: true,
            data: visibility,
            menus: MENUS
        });
    } catch (error) {
        console.error('Error fetching role visibility:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * GET /api/role-visibility/my/menus
 * Get visibility for current user's role
 */
router.get('/my/menus', verifyToken, async (req, res) => {
    try {
        const userRole = req.user.role;

        // Superadmin/dokter sees everything
        if (req.user.is_superadmin || userRole === ROLE_NAMES.DOKTER || isSuperadminRole(req.user.role_id)) {
            const visibility = {};
            MENUS.forEach(menu => {
                visibility[menu.key] = true;
            });
            return res.json({ success: true, data: visibility, menus: MENUS });
        }

        const [rows] = await db.query(
            'SELECT menu_key, is_visible FROM role_visibility WHERE role_name = ?',
            [userRole]
        );

        const visibility = {};
        // Default all to false
        MENUS.forEach(menu => {
            visibility[menu.key] = false;
        });
        // Override with DB settings
        rows.forEach(row => {
            visibility[row.menu_key] = row.is_visible === 1;
        });

        res.json({
            success: true,
            data: visibility,
            menus: MENUS
        });
    } catch (error) {
        console.error('Error fetching my visibility:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * PUT /api/role-visibility/:role
 * Update visibility settings for a role (superadmin only)
 */
router.put('/:role', verifyToken, requireSuperadmin, async (req, res) => {
    try {
        const { role } = req.params;
        const { visibility } = req.body; // { menu_key: boolean, ... }

        if (!visibility || typeof visibility !== 'object') {
            return res.status(400).json({ success: false, message: 'Visibility object required' });
        }

        // Update each menu visibility
        for (const [menuKey, isVisible] of Object.entries(visibility)) {
            await db.query(
                `INSERT INTO role_visibility (role_name, menu_key, is_visible)
                 VALUES (?, ?, ?)
                 ON DUPLICATE KEY UPDATE is_visible = ?`,
                [role, menuKey, isVisible ? 1 : 0, isVisible ? 1 : 0]
            );
        }

        res.json({
            success: true,
            message: `Visibility updated for role: ${role}`
        });
    } catch (error) {
        console.error('Error updating role visibility:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * POST /api/role-visibility/toggle
 * Toggle single menu visibility (superadmin only)
 */
router.post('/toggle', verifyToken, requireSuperadmin, async (req, res) => {
    try {
        const { role, menuKey, isVisible } = req.body;

        if (!role || !menuKey || isVisible === undefined) {
            return res.status(400).json({ success: false, message: 'role, menuKey, and isVisible required' });
        }

        await db.query(
            `INSERT INTO role_visibility (role_name, menu_key, is_visible)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE is_visible = ?`,
            [role, menuKey, isVisible ? 1 : 0, isVisible ? 1 : 0]
        );

        res.json({
            success: true,
            message: `${menuKey} visibility for ${role}: ${isVisible}`
        });
    } catch (error) {
        console.error('Error toggling visibility:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;

'use strict';

const express = require('express');
const defaultDb = require('../db');
const { asyncHandler } = require('../middleware/errorHandler');
const { verifyToken, verifyActiveStaff, requireSuperadmin } = require('../middleware/auth');
const { accessControlService } = require('../services/AccessControlService');
const { MENU_PERMISSION_MAP } = require('../config/accessControlRegistry');
const { ROLE_NAMES } = require('../constants/roles');

const MENUS = Object.freeze([
    { key: 'kantor_saya', label: 'Kantor Saya', icon: 'fa-briefcase' },
    { key: 'dashboard', label: 'Dashboard', icon: 'fa-tachometer-alt' },
    { key: 'kelola_pasien', label: 'Kelola Pasien', icon: 'fa-users-cog' },
    { key: 'pasien_baru', label: 'Pasien Baru', icon: 'fa-user-plus' },
    { key: 'penjualan-obat', label: 'Penjualan Obat', icon: 'fa-shopping-cart' },
    { key: 'klinik_privat', label: 'Klinik Privat', icon: 'fa-clinic-medical' },
    { key: 'rsia_melinda', label: 'RSIA Melinda', icon: 'fa-hospital' },
    { key: 'rsud_gambiran', label: 'RSUD Gambiran', icon: 'fa-hospital-alt' },
    { key: 'rs_bhayangkara', label: 'RS Bhayangkara', icon: 'fa-hospital-user' },
    { key: 'obat_alkes', label: 'Obat/Alkes', icon: 'fa-pills' },
    { key: 'keuangan', label: 'Keuangan', icon: 'fa-money-bill-wave' },
    { key: 'kelola_roles', label: 'Kelola Akses', icon: 'fa-user-shield' },
    { key: 'ucapan_kelahiran', label: 'Ucapan Kelahiran', icon: 'fa-baby' },
    { key: 'staff_points', label: 'Point Staff', icon: 'fa-star' },
    { key: 'staff_briefing', label: 'Briefing Poli Minggu', icon: 'fa-clipboard-check' },
    { key: 'staff_payroll', label: 'Gajian', icon: 'fa-money-check-alt' }
]);

function visibilityFromPermissions(permissions, isDoctorProtected = false) {
    const result = {};
    for (const menu of MENUS) {
        result[menu.key] = isDoctorProtected || permissions.has(MENU_PERMISSION_MAP[menu.key]);
    }
    return result;
}

function legacyWriteDisabled(_req, res) {
    return res.status(410).json({
        success: false,
        code: 'LEGACY_ACCESS_DISABLED',
        message: 'Pengaturan visibilitas berbasis role telah dinonaktifkan. Gunakan Kelola Akses per akun.'
    });
}

function createLegacyVisibilityAdapterRouter({
    db = defaultDb,
    effectiveAccessService = accessControlService,
    auth = { verifyToken, verifyActiveStaff, requireSuperadmin }
} = {}) {
    const router = express.Router();

    router.get('/my/menus', auth.verifyToken, auth.verifyActiveStaff, asyncHandler(async (req, res) => {
        const access = await effectiveAccessService.getEffectiveAccess(req.user.id);
        res.json({
            success: true,
            adapter: 'account_permissions',
            data: visibilityFromPermissions(access.permissions, access.isDoctorProtected),
            menus: MENUS
        });
    }));

    // The role-level shape is necessarily lossy after per-account cutover. It
    // reports the union of account navigation grants for compatibility only.
    router.get('/', auth.verifyToken, auth.verifyActiveStaff, auth.requireSuperadmin, asyncHandler(async (_req, res) => {
        const [rows] = await db.query(`
            SELECT r.name AS role_name, p.name AS permission_name
            FROM roles r
            LEFT JOIN users u ON u.role_id = r.id AND u.user_type = 'staff'
            LEFT JOIN user_permission_grants upg ON upg.user_id = u.new_id
            LEFT JOIN permissions p ON p.id = upg.permission_id
            ORDER BY r.name, p.name
        `);
        const byRole = {};
        for (const row of rows) {
            byRole[row.role_name] ||= Object.fromEntries(MENUS.map(menu => [menu.key, row.role_name === ROLE_NAMES.DOKTER]));
            const menu = MENUS.find(item => MENU_PERMISSION_MAP[item.key] === row.permission_name);
            if (menu) byRole[row.role_name][menu.key] = true;
        }
        res.json({ success: true, adapter: 'account_permissions', data: byRole, menus: MENUS });
    }));

    router.get('/:role', auth.verifyToken, auth.verifyActiveStaff, auth.requireSuperadmin, asyncHandler(async (req, res) => {
        const [rows] = await db.query(`
            SELECT p.name AS permission_name
            FROM users u
            INNER JOIN roles r ON r.id = u.role_id
            LEFT JOIN user_permission_grants upg ON upg.user_id = u.new_id
            LEFT JOIN permissions p ON p.id = upg.permission_id
            WHERE u.user_type = 'staff' AND r.name = ?
            ORDER BY p.name
        `, [req.params.role]);
        const permissions = new Set(rows.map(row => row.permission_name).filter(Boolean));
        res.json({
            success: true,
            adapter: 'account_permissions',
            data: visibilityFromPermissions(permissions, req.params.role === ROLE_NAMES.DOKTER),
            menus: MENUS
        });
    }));

    router.put('/:role', auth.verifyToken, auth.verifyActiveStaff, auth.requireSuperadmin, legacyWriteDisabled);
    router.post('/toggle', auth.verifyToken, auth.verifyActiveStaff, auth.requireSuperadmin, legacyWriteDisabled);

    return router;
}

module.exports = createLegacyVisibilityAdapterRouter();
module.exports.createLegacyVisibilityAdapterRouter = createLegacyVisibilityAdapterRouter;
module.exports.MENUS = MENUS;

/**
 * Registration Codes Routes
 * Manages registration codes for patient portal access
 * Only patients connected to WhatsApp Business receive codes
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const logger = require('../utils/logger');
const { verifyToken, requireSuperadmin, requirePermission } = require('../middleware/auth');

/**
 * Generate a unique 6-character alphanumeric code
 */
function generateCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed I, O, 0, 1 for clarity
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

/**
 * GET /api/registration-codes/public
 * Get current active public code (Staff only)
 */
router.get('/public', verifyToken, requirePermission('registration_codes.view'), async (req, res) => {
    try {
        const [codes] = await db.query(
            `SELECT * FROM registration_codes
             WHERE is_public = 1 AND status = 'active' AND expires_at > NOW()
             ORDER BY created_at DESC LIMIT 1`
        );

        if (codes.length === 0) {
            return res.json({
                success: true,
                code: null,
                message: 'Tidak ada kode publik aktif'
            });
        }

        res.json({
            success: true,
            code: codes[0].code,
            expires_at: codes[0].expires_at,
            created_at: codes[0].created_at
        });

    } catch (error) {
        logger.error('Get public code error', error);
        res.status(500).json({
            success: false,
            message: 'Gagal mengambil kode publik'
        });
    }
});

/**
 * Generate registration code handler
 * - Can be used by multiple registrants
 * - Valid for 24 hours
 * - Invalidates previous codes when new one is generated
 */
async function generatePublicCode(req, res) {
    try {
        // Invalidate all previous public codes
        await db.query(
            `UPDATE registration_codes SET status = 'expired' WHERE is_public = 1 AND status = 'active'`
        );

        // Generate unique code
        let code;
        let isUnique = false;
        let attempts = 0;

        while (!isUnique && attempts < 10) {
            code = generateCode();
            const [existing] = await db.query(
                'SELECT id FROM registration_codes WHERE code = ?',
                [code]
            );
            if (existing.length === 0) {
                isUnique = true;
            }
            attempts++;
        }

        if (!isUnique) {
            return res.status(500).json({
                success: false,
                message: 'Gagal generate kode unik'
            });
        }

        // Set expiration to 24 hours from now
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 24);

        // Insert public code
        await db.query(
            `INSERT INTO registration_codes (code, is_public, created_by, expires_at)
             VALUES (?, 1, ?, ?)`,
            [code, req.user.id, expiresAt]
        );

        logger.info('Registration code generated', {
            code,
            createdBy: req.user.id,
            expiresAt
        });

        res.json({
            success: true,
            message: 'Kode registrasi berhasil dibuat (berlaku 24 jam)',
            code,
            expires_at: expiresAt
        });

    } catch (error) {
        logger.error('Generate registration code error', error);
        res.status(500).json({
            success: false,
            message: 'Gagal membuat kode registrasi'
        });
    }
}

// POST /api/registration-codes/generate - Main endpoint
router.post('/generate', verifyToken, requirePermission('registration_codes.create'), generatePublicCode);

// POST /api/registration-codes/generate-public - Alias for backward compatibility
router.post('/generate-public', verifyToken, requirePermission('registration_codes.create'), generatePublicCode);

/**
 * POST /api/registration-codes/validate
 * Validate a registration code (Public - for patient registration)
 * All codes are public and can be used multiple times
 */
router.post('/validate', async (req, res) => {
    try {
        const { code } = req.body;

        if (!code) {
            return res.status(400).json({
                success: false,
                message: 'Kode registrasi harus diisi'
            });
        }

        const normalizedCode = code.toUpperCase().trim();

        // Check if code exists and is valid (active and not expired)
        const [codes] = await db.query(
            `SELECT * FROM registration_codes
             WHERE code = ? AND status = 'active' AND expires_at > NOW()`,
            [normalizedCode]
        );

        if (codes.length === 0) {
            // Check if code exists but expired
            const [expiredCodes] = await db.query(
                'SELECT * FROM registration_codes WHERE code = ?',
                [normalizedCode]
            );

            if (expiredCodes.length > 0) {
                const existingCode = expiredCodes[0];
                if (existingCode.status === 'expired' || new Date(existingCode.expires_at) < new Date()) {
                    return res.status(400).json({
                        success: false,
                        message: 'Kode registrasi sudah kadaluarsa'
                    });
                }
            }

            return res.status(400).json({
                success: false,
                message: 'Kode registrasi tidak valid'
            });
        }

        res.json({
            success: true,
            message: 'Kode registrasi valid'
        });

    } catch (error) {
        logger.error('Validate registration code error', error);
        res.status(500).json({
            success: false,
            message: 'Gagal memvalidasi kode'
        });
    }
});

/**
 * POST /api/registration-codes/use
 * Log code usage (all codes are public and reusable)
 */
router.post('/use', async (req, res) => {
    try {
        const { code, patient_id } = req.body;

        if (!code) {
            return res.status(400).json({
                success: false,
                message: 'Kode registrasi harus diisi'
            });
        }

        const normalizedCode = code.toUpperCase().trim();

        // Verify code exists and is valid
        const [codeInfo] = await db.query(
            `SELECT * FROM registration_codes
             WHERE code = ? AND status = 'active' AND expires_at > NOW()`,
            [normalizedCode]
        );

        if (codeInfo.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Kode tidak valid atau sudah kadaluarsa'
            });
        }

        // Log usage (don't mark as used - codes are reusable)
        logger.info('Registration code used', {
            code: normalizedCode,
            patientId: patient_id
        });

        res.json({
            success: true,
            message: 'Kode berhasil digunakan'
        });

    } catch (error) {
        logger.error('Use registration code error', error);
        res.status(500).json({
            success: false,
            message: 'Gagal menggunakan kode'
        });
    }
});

/**
 * GET /api/registration-codes
 * Get all registration codes (Staff only)
 */
router.get('/', verifyToken, requirePermission('registration_codes.view'), async (req, res) => {
    try {
        const { status, page = 1, limit = 20 } = req.query;
        const offset = (page - 1) * limit;

        let whereClause = '1=1';
        const params = [];

        if (status) {
            whereClause += ' AND rc.status = ?';
            params.push(status);
        }

        // Get codes with creator info
        const [codes] = await db.query(
            `SELECT rc.*, u.name as created_by_name
             FROM registration_codes rc
             LEFT JOIN users u ON rc.created_by = u.new_id
             WHERE ${whereClause}
             ORDER BY rc.created_at DESC
             LIMIT ? OFFSET ?`,
            [...params, parseInt(limit), offset]
        );

        // Get total count
        const [countResult] = await db.query(
            `SELECT COUNT(*) as total FROM registration_codes rc WHERE ${whereClause}`,
            params
        );

        res.json({
            success: true,
            data: codes,
            pagination: {
                total: countResult[0].total,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: Math.ceil(countResult[0].total / limit)
            }
        });

    } catch (error) {
        logger.error('Get registration codes error', error);
        res.status(500).json({
            success: false,
            message: 'Gagal mengambil data kode registrasi'
        });
    }
});

/**
 * DELETE /api/registration-codes/:id
 * Delete/revoke a registration code (Superadmin/Dokter only)
 */
router.delete('/:id', verifyToken, requirePermission('registration_codes.delete'), async (req, res) => {
    try {
        const { id } = req.params;

        const [result] = await db.query(
            'DELETE FROM registration_codes WHERE id = ? AND status = "active"',
            [id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: 'Kode tidak ditemukan atau sudah digunakan'
            });
        }

        logger.info('Registration code deleted', { id });

        res.json({
            success: true,
            message: 'Kode registrasi berhasil dihapus'
        });

    } catch (error) {
        logger.error('Delete registration code error', error);
        res.status(500).json({
            success: false,
            message: 'Gagal menghapus kode'
        });
    }
});

/**
 * GET /api/registration-codes/settings
 * Get registration code settings (Public)
 */
router.get('/settings', async (req, res) => {
    try {
        const [settings] = await db.query(
            "SELECT setting_value FROM settings WHERE setting_key = 'registration_code_required'"
        );

        const required = settings.length > 0 && settings[0].setting_value === 'true';

        res.json({
            success: true,
            registration_code_required: required
        });

    } catch (error) {
        // If settings table doesn't exist or error, default to required
        res.json({
            success: true,
            registration_code_required: true
        });
    }
});

/**
 * PUT /api/registration-codes/settings
 * Update registration code settings (Staff only)
 */
router.put('/settings', verifyToken, async (req, res) => {
    try {
        // Only superadmin can change this setting
        if (!req.user.is_superadmin) {
            return res.status(403).json({
                success: false,
                message: 'Hanya superadmin yang dapat mengubah pengaturan ini'
            });
        }

        const { registration_code_required } = req.body;

        await db.query(
            `INSERT INTO settings (setting_key, setting_value, description)
             VALUES ('registration_code_required', ?, 'Require registration code for patient registration')
             ON DUPLICATE KEY UPDATE setting_value = ?`,
            [registration_code_required ? 'true' : 'false', registration_code_required ? 'true' : 'false']
        );

        logger.info('Registration code settings updated', {
            required: registration_code_required,
            updatedBy: req.user.id
        });

        res.json({
            success: true,
            message: 'Pengaturan berhasil disimpan',
            registration_code_required
        });

    } catch (error) {
        logger.error('Update registration code settings error', error);
        res.status(500).json({
            success: false,
            message: 'Gagal menyimpan pengaturan'
        });
    }
});

module.exports = router;

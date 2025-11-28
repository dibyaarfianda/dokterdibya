/**
 * Registration Codes Routes
 * Manages registration codes for patient portal access
 * Only patients connected to WhatsApp Business receive codes
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const logger = require('../utils/logger');
const { verifyToken } = require('../middleware/auth');

// Lazy load notification service
let notificationService;
function getNotificationService() {
    if (!notificationService) {
        notificationService = require('../utils/notification');
    }
    return notificationService;
}

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
 * POST /api/registration-codes/generate
 * Generate a new registration code (Staff only)
 */
router.post('/generate', verifyToken, async (req, res) => {
    try {
        const { patient_name, phone } = req.body;

        if (!phone) {
            return res.status(400).json({
                success: false,
                message: 'Nomor telepon harus diisi'
            });
        }

        // Normalize phone number (ensure starts with 628)
        let normalizedPhone = phone.replace(/[^0-9]/g, '');
        if (normalizedPhone.startsWith('0')) {
            normalizedPhone = '62' + normalizedPhone.substring(1);
        } else if (!normalizedPhone.startsWith('62')) {
            normalizedPhone = '62' + normalizedPhone;
        }

        // Check if there's already an active code for this phone
        const [existingCodes] = await db.query(
            `SELECT * FROM registration_codes
             WHERE phone = ? AND status = 'active' AND expires_at > NOW()
             ORDER BY created_at DESC LIMIT 1`,
            [normalizedPhone]
        );

        if (existingCodes.length > 0) {
            // Return existing code
            return res.json({
                success: true,
                message: 'Kode registrasi sudah ada untuk nomor ini',
                code: existingCodes[0].code,
                expires_at: existingCodes[0].expires_at,
                existing: true
            });
        }

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

        // Set expiration to 7 days from now
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7);

        // Insert code
        await db.query(
            `INSERT INTO registration_codes (code, patient_name, phone, created_by, expires_at)
             VALUES (?, ?, ?, ?, ?)`,
            [code, patient_name || null, normalizedPhone, req.user.id, expiresAt]
        );

        logger.info('Registration code generated', {
            code,
            phone: normalizedPhone,
            createdBy: req.user.id
        });

        res.json({
            success: true,
            message: 'Kode registrasi berhasil dibuat',
            code,
            phone: normalizedPhone,
            expires_at: expiresAt
        });

    } catch (error) {
        logger.error('Generate registration code error', error);
        res.status(500).json({
            success: false,
            message: 'Gagal membuat kode registrasi'
        });
    }
});

/**
 * POST /api/registration-codes/send-whatsapp
 * Send registration code via WhatsApp (Staff only)
 */
router.post('/send-whatsapp', verifyToken, async (req, res) => {
    try {
        const { code, phone, patient_name } = req.body;

        if (!code || !phone) {
            return res.status(400).json({
                success: false,
                message: 'Kode dan nomor telepon harus diisi'
            });
        }

        // Normalize phone
        let normalizedPhone = phone.replace(/[^0-9]/g, '');
        if (normalizedPhone.startsWith('0')) {
            normalizedPhone = '62' + normalizedPhone.substring(1);
        } else if (!normalizedPhone.startsWith('62')) {
            normalizedPhone = '62' + normalizedPhone;
        }

        // Build message
        const clinicName = process.env.CLINIC_NAME || 'Klinik dr. Dibya';
        const portalUrl = process.env.PATIENT_PORTAL_URL || 'https://dokterdibya.com';

        const greeting = patient_name ? `Halo ${patient_name},\n\n` : 'Halo,\n\n';
        const message = `${greeting}Anda telah terdaftar di ${clinicName}.\n\n` +
            `Berikut adalah kode registrasi portal pasien Anda:\n\n` +
            `*${code}*\n\n` +
            `Gunakan kode ini untuk mendaftar di portal pasien kami:\n${portalUrl}/register.html\n\n` +
            `Kode ini berlaku selama 7 hari.\n\n` +
            `Terima kasih telah mempercayakan kesehatan Anda kepada kami.\n\n` +
            `Salam,\n${clinicName}`;

        // Try to send via WhatsApp API (Fonnte first, then Twilio, then manual)
        const notification = getNotificationService();

        const result = await notification.sendWhatsAppAuto(normalizedPhone, message);

        if (result.success) {
            if (result.method === 'fonnte') {
                logger.info('Registration code sent via WhatsApp (Fonnte)', {
                    code,
                    phone: normalizedPhone,
                    id: result.id
                });

                return res.json({
                    success: true,
                    message: 'Kode berhasil dikirim via WhatsApp',
                    method: 'fonnte'
                });
            } else if (result.method === 'twilio') {
                logger.info('Registration code sent via WhatsApp (Twilio)', {
                    code,
                    phone: normalizedPhone,
                    sid: result.sid
                });

                return res.json({
                    success: true,
                    message: 'Kode berhasil dikirim via WhatsApp',
                    method: 'twilio'
                });
            } else if (result.method === 'manual') {
                // Return manual wa.me link
                return res.json({
                    success: true,
                    message: 'Link WhatsApp berhasil dibuat',
                    method: 'manual',
                    waLink: result.waLink
                });
            }
        }

        // Fallback if all methods fail
        const encodedMessage = encodeURIComponent(message);
        const waLink = `https://wa.me/${normalizedPhone}?text=${encodedMessage}`;

        res.json({
            success: true,
            message: 'Link WhatsApp berhasil dibuat (fallback)',
            method: 'manual',
            waLink
        });

    } catch (error) {
        logger.error('Send WhatsApp registration code error', error);
        res.status(500).json({
            success: false,
            message: 'Gagal mengirim kode via WhatsApp'
        });
    }
});

/**
 * POST /api/registration-codes/validate
 * Validate a registration code (Public - for patient registration)
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

        // Check if code exists and is valid
        const [codes] = await db.query(
            `SELECT * FROM registration_codes
             WHERE code = ? AND status = 'active' AND expires_at > NOW()`,
            [normalizedCode]
        );

        if (codes.length === 0) {
            // Check if code exists but expired or used
            const [expiredCodes] = await db.query(
                'SELECT * FROM registration_codes WHERE code = ?',
                [normalizedCode]
            );

            if (expiredCodes.length > 0) {
                const existingCode = expiredCodes[0];
                if (existingCode.status === 'used') {
                    return res.status(400).json({
                        success: false,
                        message: 'Kode registrasi sudah digunakan'
                    });
                } else if (existingCode.status === 'expired' || new Date(existingCode.expires_at) < new Date()) {
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

        const validCode = codes[0];

        res.json({
            success: true,
            message: 'Kode registrasi valid',
            data: {
                patient_name: validCode.patient_name,
                phone: validCode.phone
            }
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
 * Mark a code as used (Called after successful registration)
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

        // Update code status
        const [result] = await db.query(
            `UPDATE registration_codes
             SET status = 'used', used_at = NOW(), used_by_patient_id = ?
             WHERE code = ? AND status = 'active'`,
            [patient_id || null, normalizedCode]
        );

        if (result.affectedRows === 0) {
            return res.status(400).json({
                success: false,
                message: 'Kode tidak ditemukan atau sudah digunakan'
            });
        }

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
router.get('/', verifyToken, async (req, res) => {
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
 * Delete/revoke a registration code (Staff only)
 */
router.delete('/:id', verifyToken, async (req, res) => {
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

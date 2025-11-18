const db = require('../db');
const logger = require('../utils/logger');

const TEMPLATE_KEYS = {
    VERIFICATION: 'verification',
    PASSWORD_RESET: 'password_reset',
    ANNOUNCEMENT: 'announcement'
};

const DEFAULT_TEMPLATES = {
    [TEMPLATE_KEYS.VERIFICATION]: {
        subject: 'Verifikasi Email Anda',
        body: `Halo {user_name},\n\nTerima kasih telah mendaftar di {clinic_name}.\nKode verifikasi Anda: {verification_code}\n\nAnda juga bisa mengklik tautan berikut untuk verifikasi:\n{verification_link}\n\nKode berlaku selama 24 jam.\n\nTerima kasih,\nTim {clinic_name}`
    },
    [TEMPLATE_KEYS.PASSWORD_RESET]: {
        subject: 'Permintaan Reset Password',
        body: `Halo {user_name},\n\nKami menerima permintaan untuk mereset password akun Anda.\nKode reset Anda: {reset_code}\n\nKlik tautan berikut untuk mengatur ulang password:\n{reset_link}\n\nKode berlaku selama 24 jam. Jika Anda tidak meminta reset password, abaikan email ini.\n\nTerima kasih,\nTim {clinic_name}`
    },
    [TEMPLATE_KEYS.ANNOUNCEMENT]: {
        subject: 'Pengumuman dari {clinic_name}',
        body: `Halo {user_name},\n\n{announcement_content}\n\nTerima kasih,\nTim {clinic_name}`
    }
};

function cloneTemplate(template) {
    return {
        subject: template.subject,
        body: template.body
    };
}

class EmailTemplateService {
    constructor() {
        this.allowedKeys = new Set(Object.values(TEMPLATE_KEYS));
    }

    getAllowedKeys() {
        return Array.from(this.allowedKeys);
    }

    getDefaultTemplate(key) {
        return DEFAULT_TEMPLATES[key] ? cloneTemplate(DEFAULT_TEMPLATES[key]) : null;
    }

    async getSenderProfile() {
        try {
            const [rows] = await db.query(
                'SELECT sender_name, reply_to, updated_at, updated_by FROM email_settings WHERE id = 1'
            );

            const record = rows && rows.length > 0 ? rows[0] : null;
            const fallbackName = process.env.EMAIL_SENDER_NAME || process.env.CLINIC_NAME || 'Klinik Dr. Dibya';

            return {
                senderName: (record?.sender_name || fallbackName || '').trim() || fallbackName,
                replyTo: record?.reply_to || null,
                updatedAt: record?.updated_at ? record.updated_at.toISOString() : null,
                updatedBy: record?.updated_by || null,
                source: record ? 'database' : 'default'
            };
        } catch (error) {
            logger.error('Failed to load email sender profile', { error: error.message });
            const fallbackName = process.env.EMAIL_SENDER_NAME || process.env.CLINIC_NAME || 'Klinik Dr. Dibya';
            return {
                senderName: fallbackName,
                replyTo: null,
                updatedAt: null,
                updatedBy: null,
                source: 'fallback'
            };
        }
    }

    async getTemplates() {
        const templates = {};
        // Seed with defaults
        for (const key of this.allowedKeys) {
            templates[key] = {
                ...this.getDefaultTemplate(key),
                updatedAt: null,
                updatedBy: null,
                source: 'default'
            };
        }

        try {
            const allowedKeys = this.getAllowedKeys();
            if (allowedKeys.length > 0) {
                const placeholders = allowedKeys.map(() => '?').join(', ');
                const [rows] = await db.query(
                    `SELECT template_key, subject, body, updated_at, updated_by FROM email_templates WHERE template_key IN (${placeholders})`,
                    allowedKeys
                );

                rows.forEach(row => {
                    if (!this.allowedKeys.has(row.template_key)) {
                        return;
                    }
                    templates[row.template_key] = {
                        subject: row.subject,
                        body: row.body,
                        updatedAt: row.updated_at ? row.updated_at.toISOString() : null,
                        updatedBy: row.updated_by || null,
                        source: 'database'
                    };
                });
            }
        } catch (error) {
            logger.error('Failed to load email templates', { error: error.message });
        }

        return templates;
    }

    async getTemplate(templateKey) {
        if (!this.allowedKeys.has(templateKey)) {
            throw new Error(`Unsupported email template key: ${templateKey}`);
        }

        const defaults = this.getDefaultTemplate(templateKey);

        try {
            const [rows] = await db.query(
                'SELECT template_key, subject, body, updated_at, updated_by FROM email_templates WHERE template_key = ? LIMIT 1',
                [templateKey]
            );

            if (rows.length === 0) {
                return {
                    ...defaults,
                    updatedAt: null,
                    updatedBy: null,
                    source: 'default'
                };
            }

            const row = rows[0];
            return {
                subject: row.subject,
                body: row.body,
                updatedAt: row.updated_at ? row.updated_at.toISOString() : null,
                updatedBy: row.updated_by || null,
                source: 'database'
            };
        } catch (error) {
            logger.error('Failed to load email template', { templateKey, error: error.message });
            return {
                ...defaults,
                updatedAt: null,
                updatedBy: null,
                source: 'fallback'
            };
        }
    }

    sanitizeTemplatePayload(templates) {
        const sanitized = {};
        const missingKeys = [];

        for (const key of this.allowedKeys) {
            const payload = templates?.[key];
            if (!payload) {
                missingKeys.push(key);
                continue;
            }

            const subject = String(payload.subject || '').trim();
            const body = String(payload.body || '').trim();

            if (!subject || !body) {
                throw new Error(`Template ${key} memerlukan subject dan body`);
            }

            sanitized[key] = { subject, body };
        }

        if (missingKeys.length > 0) {
            throw new Error(`Template berikut wajib diisi: ${missingKeys.join(', ')}`);
        }

        return sanitized;
    }

    async saveSettings({ senderName, templates, userId }) {
        const trimmedSender = String(senderName || '').trim();
        if (!trimmedSender) {
            throw new Error('Nama pengirim tidak boleh kosong');
        }

        const sanitizedTemplates = this.sanitizeTemplatePayload(templates);

        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();

            await connection.query(
                `INSERT INTO email_settings (id, sender_name, updated_by) VALUES (1, ?, ?)
                 ON DUPLICATE KEY UPDATE sender_name = VALUES(sender_name), updated_by = VALUES(updated_by)` ,
                [trimmedSender, userId || null]
            );

            for (const key of Object.keys(sanitizedTemplates)) {
                const { subject, body } = sanitizedTemplates[key];
                await connection.query(
                    `INSERT INTO email_templates (template_key, subject, body, updated_by)
                     VALUES (?, ?, ?, ?)
                     ON DUPLICATE KEY UPDATE subject = VALUES(subject), body = VALUES(body), updated_by = VALUES(updated_by)` ,
                    [key, subject, body, userId || null]
                );
            }

            await connection.commit();
        } catch (error) {
            await connection.rollback();
            logger.error('Failed to save email settings', { error: error.message });
            throw error;
        } finally {
            connection.release();
        }
    }

    async getSettings() {
        const [profile, templates] = await Promise.all([
            this.getSenderProfile(),
            this.getTemplates()
        ]);

        return {
            senderName: profile.senderName,
            replyTo: profile.replyTo,
            templates
        };
    }
}

const service = new EmailTemplateService();
service.TEMPLATE_KEYS = TEMPLATE_KEYS;
service.DEFAULT_TEMPLATES = DEFAULT_TEMPLATES;

module.exports = service;

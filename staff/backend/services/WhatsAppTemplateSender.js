const { resolveTemplate, buildBodyComponents } = require('../config/whatsapp-templates');

const MIN_PHONE_DIGITS = 10;
const MAX_ERROR_LENGTH = 500;

function createWhatsAppTemplateSender({ db, whatsapp, logger } = {}) {
    const database = db || require('../db');
    const wa = whatsapp || require('./whatsappService');
    const log = logger || require('../utils/logger');

    function isConfigured() {
        return !!(wa.meta && wa.meta.enabled);
    }

    async function send({ purpose, refType, refId, patientId, phone, values } = {}) {
        if (!isConfigured()) return { status: 'failed', reason: 'meta_not_configured' };

        if (refId === undefined || refId === null || refId === '') return { status: 'failed', reason: 'missing_ref' };

        const template = resolveTemplate(purpose);
        if (!template) return { status: 'failed', reason: 'unknown_template' };

        const normalized = wa.formatPhoneNumber(phone);
        if (!normalized || String(normalized).replace(/\D/g, '').length < MIN_PHONE_DIGITS) {
            return { status: 'skipped', reason: 'invalid_phone' };
        }

        let components;
        try {
            components = buildBodyComponents(template, values || {});
        } catch (err) {
            return { status: 'failed', reason: err.message };
        }

        const refKey = refId === undefined || refId === null ? null : String(refId);
        const rowParams = [purpose, refType || null, refKey, patientId || null, normalized, template.name];

        const [optRows] = await database.query('SELECT 1 FROM wa_opt_outs WHERE phone = ? LIMIT 1', [normalized]);
        if (optRows && optRows.length > 0) {
            await database.query(
                `INSERT IGNORE INTO wa_messages
                    (direction, purpose, ref_type, ref_id, patient_id, phone, template_name, status, error_message)
                 VALUES ('outbound', ?, ?, ?, ?, ?, ?, 'skipped', 'opted_out')`,
                rowParams
            );
            return { status: 'skipped', reason: 'opted_out' };
        }

        const [claim] = await database.query(
            `INSERT IGNORE INTO wa_messages
                (direction, purpose, ref_type, ref_id, patient_id, phone, template_name, status)
             VALUES ('outbound', ?, ?, ?, ?, ?, ?, 'claimed')`,
            rowParams
        );
        if (!claim || claim.affectedRows === 0) {
            return { status: 'skipped', reason: 'already_claimed' };
        }

        let result;
        try {
            result = await wa.sendViaMetaCloud(normalized, null, {
                templateName: template.name,
                templateLanguage: template.language,
                templateComponents: components
            });
        } catch (err) {
            result = { success: false, error: err.message };
        }

        if (result && result.success && result.messageId) {
            await database.query(
                `UPDATE wa_messages SET status = 'sent', wa_message_id = ?
                 WHERE purpose = ? AND ref_id <=> ?`,
                [result.messageId, purpose, refKey]
            );
            return { status: 'sent', messageId: result.messageId };
        }

        const errorMessage = String((result && result.error) || 'send_failed').slice(0, MAX_ERROR_LENGTH);
        await database.query(
            `UPDATE wa_messages SET status = 'failed', error_message = ?
             WHERE purpose = ? AND ref_id <=> ?`,
            [errorMessage, purpose, refKey]
        );
        log.warn(`[WhatsAppTemplateSender] ${purpose} ref=${refKey} failed: ${errorMessage}`);
        return { status: 'failed', reason: errorMessage };
    }

    return { isConfigured, send };
}

module.exports = { createWhatsAppTemplateSender };

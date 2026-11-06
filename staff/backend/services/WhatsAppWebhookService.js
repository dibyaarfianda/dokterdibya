const crypto = require('crypto');

const RANK_LIST = "'claimed','sent','delivered','read'";
const TRACKED_STATUSES = new Set(['sent', 'delivered', 'read', 'failed']);
const OPT_OUT_WORDS = new Set(['STOP', 'BERHENTI']);
const BODY_MAX = 1000;

function verifySignature(rawBody, header, appSecret) {
    if (!appSecret || !header || typeof header !== 'string' || !rawBody) return false;
    const expected = 'sha256=' + crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
    const a = Buffer.from(header);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
}

function createWhatsAppWebhookService({
    db = require('../db'),
    logger = require('../utils/logger'),
    formatPhone = (p) => require('./whatsappService').formatPhoneNumber(p)
} = {}) {
    async function applyStatus(st) {
        if (!st || !st.id || !TRACKED_STATUSES.has(st.status)) return false;
        if (st.status === 'failed') {
            const title = st.errors && st.errors[0] && st.errors[0].title;
            await db.query(
                `UPDATE wa_messages SET status = ?, error_message = ?
                 WHERE wa_message_id = ? AND direction = 'outbound'`,
                ['failed', title ? String(title).slice(0, 500) : null, st.id]
            );
            return true;
        }
        await db.query(
            `UPDATE wa_messages SET status = ?
             WHERE wa_message_id = ? AND direction = 'outbound'
               AND status <> 'failed'
               AND FIELD(status, ${RANK_LIST}) < FIELD(?, ${RANK_LIST})`,
            [st.status, st.id, st.status]
        );
        return true;
    }

    async function applyMessage(msg, counts) {
        if (!msg || msg.type !== 'text' || !msg.id || !msg.text || typeof msg.text.body !== 'string') return;
        const phone = formatPhone(msg.from);
        if (!phone) return;
        const text = msg.text.body;
        await db.query(
            `INSERT IGNORE INTO wa_messages
                (direction, phone, wa_message_id, status, body_text)
             VALUES ('inbound', ?, ?, 'received', ?)`,
            [phone, msg.id, text.slice(0, BODY_MAX)]
        );
        counts.inbound++;
        if (OPT_OUT_WORDS.has(text.trim().toUpperCase())) {
            await db.query(
                'INSERT IGNORE INTO wa_opt_outs (phone, source) VALUES (?, ?)',
                [phone, 'inbound_stop']
            );
            counts.optOuts++;
        }
    }

    async function handlePayload(payload) {
        const counts = { statuses: 0, inbound: 0, optOuts: 0 };
        const entries = payload && Array.isArray(payload.entry) ? payload.entry : [];
        for (const entry of entries) {
            const changes = entry && Array.isArray(entry.changes) ? entry.changes : [];
            for (const change of changes) {
                const value = change && change.value;
                if (!value) continue;
                for (const st of Array.isArray(value.statuses) ? value.statuses : []) {
                    try {
                        if (await applyStatus(st)) counts.statuses++;
                    } catch (err) {
                        logger.warn(`[WhatsAppWebhook] status event failed: ${err.message}`);
                    }
                }
                for (const msg of Array.isArray(value.messages) ? value.messages : []) {
                    try {
                        await applyMessage(msg, counts);
                    } catch (err) {
                        logger.warn(`[WhatsAppWebhook] inbound message failed: ${err.message}`);
                    }
                }
            }
        }
        return counts;
    }

    return { handlePayload };
}

module.exports = { verifySignature, createWhatsAppWebhookService };

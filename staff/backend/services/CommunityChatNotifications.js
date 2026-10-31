'use strict';

const { displayName } = require('./CommunityChatAttention');

function previewText(value) {
    const text = String(value || '').replace(/^\[\[q:[A-Za-z0-9+/=]+\]\]\s*/, '')
        .replace(/<[^>]*>/g, '').replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, ' ')
        .replace(/\s+/g, ' ').trim();
    const characters = Array.from(text);
    return characters.length > 120 ? characters.slice(0, 120).join('') + '…' : text;
}

function createChatNotifications({ db, push }) {
    async function getSettings(patientId) {
        const [rows] = await db.query('SELECT enabled FROM patient_chat_notification_settings WHERE patient_id = ? LIMIT 1', [patientId]);
        return { enabled: Number(rows[0]?.enabled) === 1 };
    }

    async function setSettings(patientId, enabled) {
        if (typeof enabled !== 'boolean') throw Object.assign(new Error('Pengaturan notifikasi tidak valid.'), { status: 400 });
        await db.query(`INSERT INTO patient_chat_notification_settings (patient_id, enabled) VALUES (?, ?)
            ON DUPLICATE KEY UPDATE enabled = VALUES(enabled), updated_at = CURRENT_TIMESTAMP`, [patientId, enabled ? 1 : 0]);
        return { enabled };
    }

    async function notify(room, message, sender) {
        if (Number(room.is_archived) === 1) return;
        // Staff messages in a direct room are delivered by the patient inbox notification (PatientInbox).
        if (Number(room.is_direct) === 1 && sender.userType === 'staff') return;
        const [rows] = await db.query(`SELECT s.patient_id, s.enabled,
                (cm.id IS NOT NULL) AS joined
            FROM patient_chat_notification_settings s
            JOIN community_chat_rooms r ON r.id = ? AND r.is_archived = 0
            LEFT JOIN community_chat_room_members cm ON cm.room_id = r.id AND cm.user_id = s.patient_id AND cm.user_type = 'patient'
            WHERE s.enabled = 1
              AND ((r.is_direct = 0 AND cm.id IS NOT NULL) OR (r.is_direct = 1 AND r.direct_patient_id = s.patient_id))`, [room.id]);
        const targets = new Set(rows.filter(row => Number(row.enabled) === 1
            && !(sender.userType === 'patient' && String(row.patient_id) === String(sender.userId))
            && (Number(room.is_direct) === 1 ? String(room.direct_patient_id) === String(row.patient_id) : Number(row.joined) === 1))
            .map(row => String(row.patient_id)));
        const url = '/community-chat.html?room=' + encodeURIComponent(room.slug) + '&message=' + encodeURIComponent(message.id);
        const title = Number(room.is_direct) === 1 ? 'Pesan pribadi · dokterDIBYA' : 'Chat Komunitas · ' + previewText(room.name);
        const body = previewText(displayName(sender) + ': ' + previewText(message.message));
        for (const patientId of targets) {
            try {
                const result = await push.sendToPatient(patientId, title, body, {
                    type: 'community_chat', url, room: String(room.slug), message_id: String(message.id),
                    tag: 'community-chat-' + String(message.id)
                });
                if (!result.success || result.failed) console.warn('[CommunityChat] patient push incomplete', { message_id: message.id });
            } catch (error) {
                console.warn('[CommunityChat] patient push failed', { message_id: message.id });
            }
        }
    }

    return { getSettings, setSettings, notify };
}

module.exports = { createChatNotifications, previewText };

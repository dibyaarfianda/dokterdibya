'use strict';

const { previewText } = require('./CommunityChatNotifications');

// Patient inbox = active direct community chat rooms (one per patient).
// Patients only ever see their own room; every staff member sees all rooms.
function createPatientInbox({ db, createPatientNotification }) {
    function viewer(user, isPatientUser) {
        const type = isPatientUser(user) ? 'patient' : 'staff';
        return { id: String(user.id), type };
    }

    async function listConversations(user, isPatientUser, { search = '' } = {}) {
        const me = viewer(user, isPatientUser);
        const params = [me.type, me.id, me.type];
        let scope = '';
        if (me.type === 'patient') {
            scope = 'AND r.direct_patient_id = ?';
            params.push(me.id);
        } else if (search) {
            const like = `%${String(search).slice(0, 60)}%`;
            scope = 'AND (p.full_name LIKE ? OR r.direct_patient_id LIKE ? OR p.phone LIKE ?)';
            params.push(like, like, like);
        }

        const [rows] = await db.query(
            `SELECT r.slug, r.direct_patient_id, r.created_at,
                    p.full_name AS patient_name, p.phone AS patient_phone,
                    lm.id AS last_message_id, lm.message AS last_message,
                    lm.sender_type AS last_sender_type, lm.sender_name AS last_sender_name,
                    lm.created_at AS last_message_at,
                    (SELECT COUNT(*) FROM community_chat_messages um
                      WHERE um.room_id = r.id
                        AND um.id > GREATEST(COALESCE(cm.last_read_message_id, 0), COALESCE(baseline.message_id, 0))
                        AND um.sender_type <> ?) AS unread_count
             FROM community_chat_rooms r
             LEFT JOIN patients p ON p.id = r.direct_patient_id
             LEFT JOIN community_chat_messages lm
                ON lm.id = (SELECT MAX(x.id) FROM community_chat_messages x WHERE x.room_id = r.id)
             LEFT JOIN community_chat_room_members cm
                ON cm.room_id = r.id AND cm.user_id = ? AND cm.user_type = ?
             LEFT JOIN community_chat_attention_baseline baseline ON baseline.id = 1
             WHERE r.is_archived = 0 AND r.is_direct = 1 ${scope}
             ORDER BY COALESCE(lm.created_at, r.created_at) DESC
             LIMIT 200`,
            params
        );

        const conversations = rows.map(row => ({
            slug: row.slug,
            patient_id: me.type === 'staff' ? row.direct_patient_id : undefined,
            patient_name: me.type === 'staff' ? (row.patient_name || `Pasien ${row.direct_patient_id}`) : undefined,
            patient_phone: me.type === 'staff' ? (row.patient_phone || null) : undefined,
            last_message: row.last_message_id ? previewText(row.last_message) : '',
            last_sender_type: row.last_sender_type || null,
            last_sender_name: row.last_sender_type === 'staff' ? (row.last_sender_name || 'Staf') : null,
            last_message_at: row.last_message_at || row.created_at,
            unread_count: Number(row.unread_count) || 0,
            awaiting_reply: row.last_sender_type === 'patient'
        }));

        return {
            conversations,
            unread_total: conversations.reduce((sum, item) => sum + item.unread_count, 0),
            awaiting_reply: conversations.filter(item => item.awaiting_reply).length
        };
    }

    async function counts(user, isPatientUser) {
        const me = viewer(user, isPatientUser);
        if (me.type === 'staff') {
            // Shared staff badge: conversations whose latest message is from the patient.
            const [rows] = await db.query(
                `SELECT COUNT(*) AS awaiting
                 FROM community_chat_rooms r
                 JOIN community_chat_messages lm
                    ON lm.id = (SELECT MAX(x.id) FROM community_chat_messages x WHERE x.room_id = r.id)
                 WHERE r.is_archived = 0 AND r.is_direct = 1 AND lm.sender_type = 'patient'`
            );
            const awaiting = Number(rows[0]?.awaiting) || 0;
            return { awaiting_reply: awaiting, unread_total: awaiting };
        }
        const [rows] = await db.query(
            `SELECT COUNT(m.id) AS unread
             FROM community_chat_rooms r
             LEFT JOIN community_chat_room_members cm
                ON cm.room_id = r.id AND cm.user_id = ? AND cm.user_type = 'patient'
             LEFT JOIN community_chat_attention_baseline baseline ON baseline.id = 1
             JOIN community_chat_messages m
                ON m.room_id = r.id AND m.sender_type = 'staff'
               AND m.id > GREATEST(COALESCE(cm.last_read_message_id, 0), COALESCE(baseline.message_id, 0))
             WHERE r.is_archived = 0 AND r.is_direct = 1 AND r.direct_patient_id = ?`,
            [me.id, me.id]
        );
        return { unread_total: Number(rows[0]?.unread) || 0, awaiting_reply: 0 };
    }

    // In-app notification (+ push via createPatientNotification) when staff writes to a patient.
    async function notifyPatient(room, message, sender) {
        if (!room || Number(room.is_direct) !== 1 || Number(room.is_archived) === 1) return null;
        if (sender?.userType !== 'staff' || !room.direct_patient_id) return null;
        const body = previewText(message?.message) || 'Anda menerima pesan baru.';
        return createPatientNotification({
            patient_id: String(room.direct_patient_id),
            type: 'direct_message',
            title: 'Pesan baru dari dokterDIBYA',
            message: body,
            link: '/pesan.html?room=' + encodeURIComponent(room.slug),
            icon: 'fa fa-envelope',
            icon_color: 'text-success'
        });
    }

    return { listConversations, counts, notifyPatient };
}

module.exports = { createPatientInbox };

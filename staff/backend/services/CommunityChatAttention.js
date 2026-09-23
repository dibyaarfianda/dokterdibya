function displayName(identity) {
    const name = String(identity.nickname || (identity.userType === 'staff' ? identity.defaultName : '') || '').trim();
    return name && !name.includes('@') ? name : (identity.userType === 'staff' ? 'Staf' : 'Anggota');
}

function parseJson(value, fallback) {
    try { return typeof value === 'string' ? JSON.parse(value) : (value || fallback); }
    catch (_) { return fallback; }
}

function messageDto(row) {
    if (!row) return row;
    const { mentions_json, reply_snapshot, ...message } = row;
    message.mentions = parseJson(mentions_json, []);
    message.reply = parseJson(reply_snapshot, null);
    return message;
}

function invalid(message) {
    return Object.assign(new Error(message), { status: 400 });
}

async function validateMetadata(db, room, body, text) {
    const requested = body.mentions || [];
    if (!Array.isArray(requested) || requested.length > 30) throw invalid('Mention tidak valid.');
    const mentions = [];
    if (requested.length) {
        const [members] = await db.query(
            `SELECT cm.user_id, cm.user_type,
                CASE WHEN cm.user_type = 'patient'
                    THEN COALESCE(NULLIF(cp.nickname, ''), NULLIF(ps.nickname, ''), 'Anggota')
                    ELSE COALESCE(NULLIF(cp.nickname, ''), NULLIF(u.name, ''), 'Staf') END AS display_name
             FROM community_chat_room_members cm
             LEFT JOIN community_chat_profiles cp ON cp.user_id = cm.user_id AND cp.user_type = cm.user_type
             LEFT JOIN patient_portal_settings ps ON ps.patient_id = cm.user_id AND cm.user_type = 'patient'
             LEFT JOIN users u ON u.new_id = cm.user_id AND cm.user_type = 'staff'
             WHERE cm.room_id = ?`, [room.id]);
        let previousEnd = 0;
        for (const mention of [...requested].sort((a, b) => a.start - b.start)) {
            const member = members.find(item => String(item.user_id) === String(mention.user_id) && item.user_type === mention.user_type);
            if (!member || !['patient', 'staff'].includes(mention.user_type) ||
                (Number(room.is_direct) === 1 && mention.user_type === 'patient' && String(room.direct_patient_id) !== String(mention.user_id))) {
                throw invalid('Anggota mention tidak memiliki akses ke room ini.');
            }
            const label = displayName({ nickname: member.display_name, userType: member.user_type });
            const { start, end } = mention;
            if (!Number.isInteger(start) || !Number.isInteger(end) || start < previousEnd ||
                end > text.length || end <= start || text.slice(start, end) !== '@' + label) {
                throw invalid('Mention berubah. Pilih kembali anggota yang ingin dipanggil.');
            }
            mentions.push({ user_id: String(member.user_id), user_type: member.user_type, start, end, label });
            previousEnd = end;
        }
    }
    let reply = null;
    if (body.reply_to_message_id != null) {
        if (!/^[1-9]\d*$/.test(String(body.reply_to_message_id))) throw invalid('Quote tidak valid.');
        const [rows] = await db.query('SELECT * FROM community_chat_messages WHERE id = ? AND room_id = ? LIMIT 1', [body.reply_to_message_id, room.id]);
        if (!rows.length) throw invalid('Pesan quote sudah dihapus atau berasal dari room lain.');
        const original = rows[0];
        reply = {
            id: original.id, sender_id: original.sender_id, sender_type: original.sender_type,
            sender: displayName({ nickname: original.sender_nickname, defaultName: original.sender_name, userType: original.sender_type }),
            text: String(original.message).replace(/^\[\[q:[A-Za-z0-9+/=]+\]\]\n?/, '').slice(0, 180)
        };
    }
    return { mentions, reply };
}

function convertText(text, mentions, convert) {
    let message = '', position = 0;
    const updated = [];
    for (const mention of mentions) {
        message += convert(text.slice(position, mention.start));
        const start = message.length;
        message += text.slice(mention.start, mention.end);
        updated.push({ ...mention, start, end: message.length });
        position = mention.end;
    }
    message += convert(text.slice(position));
    return { message, mentions: updated };
}

function recipients(mentions, reply, sender) {
    const found = new Map();
    for (const mention of mentions) found.set(mention.user_type + ':' + mention.user_id, { ...mention, reason: 'mention' });
    if (reply) {
        const key = reply.sender_type + ':' + reply.sender_id;
        if (!found.has(key)) found.set(key, { user_id: String(reply.sender_id), user_type: reply.sender_type, reason: 'quote' });
    }
    found.delete(sender.userType + ':' + sender.userId);
    return [...found.values()];
}

async function notify(room, message, sender, targets) {
    const link = '/community-chat.html?room=' + encodeURIComponent(room.slug) + '&message=' + encodeURIComponent(message.id);
    for (const target of targets) {
        const title = target.reason === 'mention' ? 'Anda dipanggil di Chat Komunitas' : 'Pesan Anda di-quote';
        const text = displayName(sender) + (target.reason === 'mention' ? ' memanggil Anda di ' : ' mengutip pesan Anda di ') + room.name + '.';
        try {
            let result;
            if (target.user_type === 'patient') {
                result = await require('../routes/patient-notifications').createPatientNotification({
                    patient_id: target.user_id, type: 'system', title, message: text, link,
                    icon: 'fa fa-comments', icon_color: 'text-success'
                });
            } else {
                result = await require('../routes/notifications').createNotification({
                    user_id: target.user_id, type: 'system', title, message: text, link: link + '&staffBridge=1',
                    icon: 'fas fa-comments', icon_color: 'text-success'
                });
                const push = await require('./DocBoardPushService').sendToUser(target.user_id, title, text, { url: link + '&staffBridge=1', type: 'community_chat' });
                if (push.failed || !push.success) console.warn('[CommunityChat] staff push failed', { message_id: message.id, failed: push.failed });
            }
            if (!result.success) console.error('[CommunityChat] notification failed', { message_id: message.id });
        } catch (error) {
            console.error('[CommunityChat] notification failed', { message_id: message.id, error: error.message });
        }
    }
}

module.exports = { displayName, messageDto, validateMetadata, convertText, recipients, notify };

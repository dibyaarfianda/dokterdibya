const { resolveStaffIdentity } = require('../utils/staffIdentity');
const { ROLE_NAMES, isSuperadminRole } = require('../constants/roles');

// Use the same name, avatar URL and avatar version as /api/auth/me (Staff Profile).
async function loadStaffProfiles(db, userIds) {
    const ids = [...new Set(userIds.filter(Boolean).map(String))];
    if (!ids.length) return new Map();
    const [rows] = await db.query(
        `SELECT new_id, name, role, role_id, is_superadmin,
            CASE WHEN photo_url IS NULL OR photo_url = '' THEN 0 ELSE 1 END AS has_photo,
            UNIX_TIMESTAMP(updated_at) AS avatar_version
         FROM users
         WHERE new_id IN (?) AND user_type = 'staff'`, [ids]);
    return new Map(rows.map(row => {
        const name = String(row.name || '').trim();
        return [String(row.new_id), {
            name: name && !name.includes('@') ? name : 'Staf',
            isDoctor: Number(row.is_superadmin) === 1 || isSuperadminRole(Number(row.role_id)) || row.role === ROLE_NAMES.DOKTER,
            avatarUrl: resolveStaffIdentity({
                name: row.name, userId: row.new_id,
                hasPhoto: Boolean(row.has_photo), avatarVersion: row.avatar_version
            }).photo_url
        }];
    }));
}

async function hydrateStaffMessages(db, messages) {
    const replies = messages.map(message => {
        try { return typeof message.reply_snapshot === 'string' ? JSON.parse(message.reply_snapshot) : message.reply_snapshot; }
        catch (_) { return null; }
    });
    const profiles = await loadStaffProfiles(db, [
        ...messages.filter(message => message.sender_type === 'staff').map(message => message.sender_id),
        ...replies.filter(reply => reply?.sender_type === 'staff').map(reply => reply.sender_id)
    ]);
    return messages.map((message, index) => {
        const profile = message.sender_type === 'staff' && profiles.get(String(message.sender_id));
        const hydrated = profile ? {
            ...message, sender_name: profile.name, sender_nickname: profile.name, sender_avatar: profile.avatarUrl
        } : message;
        const reply = replies[index];
        const replyProfile = reply?.sender_type === 'staff' && profiles.get(String(reply.sender_id));
        return replyProfile ? { ...hydrated, reply_snapshot: { ...reply, sender: replyProfile.name } } : hydrated;
    });
}

module.exports = { loadStaffProfiles, hydrateStaffMessages };

const STAFF_MALE_AVATAR = '/staff/public/images/avatarlaki.png';
const STAFF_FEMALE_AVATAR = '/staff/public/images/avatarwanita.png';

function resolveStaffGender(name) {
    const normalizedName = String(name || '')
        .toLowerCase()
        .replace(/\s+/g, '')
        .replace(/\./g, '');

    return normalizedName === 'drdibya' ? 'laki-laki' : 'perempuan';
}

function resolveStaffIdentity({ name, userId, hasPhoto, avatarVersion }) {
    const gender = resolveStaffGender(name);
    const safeUserId = String(userId || '').trim();
    const version = Number(avatarVersion) || 0;
    const fallbackAvatar = gender === 'laki-laki' ? STAFF_MALE_AVATAR : STAFF_FEMALE_AVATAR;

    return {
        gender,
        photo_url: hasPhoto && safeUserId
            ? `/api/auth/staff-avatar/${encodeURIComponent(safeUserId)}?v=${version}`
            : fallbackAvatar
    };
}

function decodeDataImageUrl(value) {
    if (typeof value !== 'string') return null;

    const match = value.match(/^data:(image\/(?:png|jpe?g|webp|gif));base64,([A-Za-z0-9+/=\s]+)$/i);
    if (!match) return null;

    const buffer = Buffer.from(match[2].replace(/\s+/g, ''), 'base64');
    if (!buffer.length) return null;

    return {
        mimeType: match[1].toLowerCase().replace('image/jpg', 'image/jpeg'),
        buffer
    };
}

module.exports = {
    STAFF_MALE_AVATAR,
    STAFF_FEMALE_AVATAR,
    resolveStaffIdentity,
    decodeDataImageUrl
};

const db = require('../db');

const DEFAULT_SETTINGS = {
    nickname: null,
    notification_sound: 'default'
};

const ALLOWED_NOTIFICATION_SOUNDS = new Set(['default', 'chime', 'bell', 'soft', 'none']);
const MAX_NICKNAME_LENGTH = 40;
const MIN_NICKNAME_LENGTH = 3;
const FORBIDDEN_NICKNAME_WORDS = [
    'kontol', 'memek', 'ngentot', 'anjing', 'bangsat', 'bajingan', 'tolol',
    'goblok', 'asu', 'jancok', 'perek', 'pelacur', 'fuck', 'fucker',
    'bitch', 'motherfucker', 'shit', 'dick', 'pussy', 'cunt'
];
const FORBIDDEN_DOCTOR_NICKNAME_MARKERS = [
    'drdibyaarfianda',
    'dokterdibyaarfianda',
    'dibyaarfianda',
    'drdibya',
    'dokterdibya',
    'dibya',
    'arfianda'
];

function normalizeNicknameForMatch(value = '') {
    return String(value || '')
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/g, '');
}

function normalizeSettings(row) {
    return {
        nickname: row?.nickname || null,
        notification_sound: ALLOWED_NOTIFICATION_SOUNDS.has(row?.notification_sound)
            ? row.notification_sound
            : DEFAULT_SETTINGS.notification_sound
    };
}

function validateAndNormalizeInput(input = {}) {
    const rawNickname = input.nickname == null ? '' : String(input.nickname).trim();
    const notificationSound = input.notification_sound || DEFAULT_SETTINGS.notification_sound;

    if (rawNickname && rawNickname.length < MIN_NICKNAME_LENGTH) {
        const error = new Error(`Nickname minimal ${MIN_NICKNAME_LENGTH} karakter`);
        error.statusCode = 422;
        throw error;
    }

    if (rawNickname.length > MAX_NICKNAME_LENGTH) {
        const error = new Error('Nickname maksimal 40 karakter');
        error.statusCode = 422;
        throw error;
    }

    if (!ALLOWED_NOTIFICATION_SOUNDS.has(notificationSound)) {
        const error = new Error('Suara notifikasi tidak valid');
        error.statusCode = 422;
        throw error;
    }

    return {
        nickname: rawNickname || null,
        notification_sound: notificationSound
    };
}

async function validateNicknameRestrictions(rawNickname) {
    if (!rawNickname) return;

    const compact = normalizeNicknameForMatch(rawNickname);
    if (!compact) {
        const error = new Error('Nickname tidak valid');
        error.statusCode = 422;
        throw error;
    }

    if (FORBIDDEN_DOCTOR_NICKNAME_MARKERS.some((marker) => compact.includes(marker))) {
        const error = new Error('Nickname tidak boleh menyerupai nama Dr. Dibya Arfianda atau staff');
        error.statusCode = 422;
        throw error;
    }

    if (FORBIDDEN_NICKNAME_WORDS.some((word) => compact.includes(normalizeNicknameForMatch(word)))) {
        const error = new Error('Nickname mengandung kata yang tidak diperbolehkan');
        error.statusCode = 422;
        throw error;
    }

    const [staffRows] = await db.query(
        `SELECT name
         FROM users
         WHERE user_type <> 'patient'
           AND name IS NOT NULL
           AND name <> ''
         LIMIT 500`
    );

    for (const row of staffRows || []) {
        const normalizedFull = normalizeNicknameForMatch(row.name || '');
        if (normalizedFull.length >= 3 && compact.includes(normalizedFull)) {
            const error = new Error('Nickname tidak boleh menyerupai nama Dr. Dibya Arfianda atau staff');
            error.statusCode = 422;
            throw error;
        }

        const nameParts = String(row.name || '')
            .toLowerCase()
            .normalize('NFKD')
            .replace(/[\u0300-\u036f]/g, '')
            .split(/[^a-z0-9]+/)
            .filter((part) => part.length >= 3);

        for (const part of nameParts) {
            if (compact.includes(part)) {
                const error = new Error('Nickname tidak boleh menyerupai nama Dr. Dibya Arfianda atau staff');
                error.statusCode = 422;
                throw error;
            }
        }
    }
}

async function getSettings(patientId) {
    const [rows] = await db.query(
        `SELECT nickname, notification_sound
         FROM patient_portal_settings
         WHERE patient_id = ?
         LIMIT 1`,
        [patientId]
    );

    return rows.length ? normalizeSettings(rows[0]) : { ...DEFAULT_SETTINGS };
}

async function saveSettings(patientId, input) {
    const settings = validateAndNormalizeInput(input);
    await validateNicknameRestrictions(settings.nickname);

    await db.query(
        `INSERT INTO patient_portal_settings
            (patient_id, nickname, notification_sound)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE
            nickname = VALUES(nickname),
            notification_sound = VALUES(notification_sound),
            updated_at = CURRENT_TIMESTAMP`,
        [patientId, settings.nickname, settings.notification_sound]
    );

    await syncCommunityChatNickname(patientId, settings.nickname);

    return getSettings(patientId);
}

async function syncCommunityChatNickname(patientId, nickname) {
    try {
        await db.query(
            `INSERT INTO community_chat_profiles
                (user_id, user_type, nickname)
             VALUES (?, 'patient', ?)
             ON DUPLICATE KEY UPDATE
                nickname = VALUES(nickname),
                updated_at = CURRENT_TIMESTAMP`,
            [patientId, nickname]
        );
    } catch (error) {
        if (error && error.code === 'ER_NO_SUCH_TABLE') return;
        throw error;
    }
}

module.exports = {
    DEFAULT_SETTINGS,
    ALLOWED_NOTIFICATION_SOUNDS,
    MIN_NICKNAME_LENGTH,
    validateAndNormalizeInput,
    validateNicknameRestrictions,
    getSettings,
    saveSettings
};

const db = require('../db');

const DEFAULT_SETTINGS = {
    nickname: null,
    notification_sound: 'default'
};

const ALLOWED_NOTIFICATION_SOUNDS = new Set(['default', 'chime', 'bell', 'soft', 'none']);
const MAX_NICKNAME_LENGTH = 40;

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

    return getSettings(patientId);
}

module.exports = {
    DEFAULT_SETTINGS,
    ALLOWED_NOTIFICATION_SOUNDS,
    validateAndNormalizeInput,
    getSettings,
    saveSettings
};

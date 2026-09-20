'use strict';

/**
 * Single source of truth for booking session settings (booking_settings table).
 *
 * Both the patient booking flow (routes/sunday-appointments.js) and the Sunday
 * clinic queue/record services (services/sunday-clinic/*) compute slot times and
 * session labels from here, so changing a session start time in Pengaturan
 * Booking is reflected everywhere instead of only on the booking page.
 */

const db = require('../db');

const DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const CACHE_TTL = 60000; // 1 minute cache

// Legacy defaults, only used when booking_settings is unavailable or has no row
// for the requested session (e.g. historical appointments on a deleted session).
const LEGACY_START_HOURS = { 1: 9, 2: 12, 3: 15 };
const LEGACY_SLOT_DURATION = 15;
const LEGACY_SESSION_LABELS = {
    1: '09:00 - 11:30 (Pagi)',
    2: '12:00 - 14:30 (Siang)',
    3: '15:00 - 17:30 (Sore)'
};
const LEGACY_SESSION_SETTINGS = [
    { session: 1, name: 'Pagi', dayOfWeek: 0, dayName: 'Minggu', startTime: '09:00', endTime: '11:30', slotDuration: 15, maxSlots: 10, label: LEGACY_SESSION_LABELS[1] },
    { session: 2, name: 'Siang', dayOfWeek: 0, dayName: 'Minggu', startTime: '12:00', endTime: '14:30', slotDuration: 15, maxSlots: 10, label: LEGACY_SESSION_LABELS[2] },
    { session: 3, name: 'Sore', dayOfWeek: 0, dayName: 'Minggu', startTime: '15:00', endTime: '17:30', slotDuration: 15, maxSlots: 10, label: LEGACY_SESSION_LABELS[3] }
];

let sessionSettingsCache = null;
let sessionSettingsCacheTime = 0;
let sessionSettingsVersion = 0;

function getDayName(dayOfWeek) {
    return DAY_NAMES[dayOfWeek] || 'Tidak diketahui';
}

function invalidateSessionSettingsCache() {
    sessionSettingsCache = null;
    sessionSettingsCacheTime = 0;
    sessionSettingsVersion += 1;
}

/**
 * Bumped whenever the settings change, so downstream caches holding values
 * derived from these settings (e.g. the today-queue payload with its computed
 * slot_time) can detect that they are stale.
 */
function getSessionSettingsVersion() {
    return sessionSettingsVersion;
}

/**
 * Active session settings from the database, cached for CACHE_TTL.
 */
async function getSessionSettings() {
    const now = Date.now();
    if (sessionSettingsCache && (now - sessionSettingsCacheTime) < CACHE_TTL) {
        return sessionSettingsCache;
    }

    try {
        const [settings] = await db.query(
            `SELECT session_number, session_name, COALESCE(day_of_week, 0) AS day_of_week, start_time, end_time, slot_duration, max_slots
             FROM booking_settings WHERE is_active = 1 ORDER BY session_number ASC`
        );

        sessionSettingsCache = settings.map(s => ({
            session: s.session_number,
            name: s.session_name,
            dayOfWeek: Number.parseInt(s.day_of_week, 10) || 0,
            dayName: getDayName(Number.parseInt(s.day_of_week, 10) || 0),
            startTime: s.start_time.substring(0, 5),
            endTime: s.end_time.substring(0, 5),
            slotDuration: s.slot_duration,
            maxSlots: s.max_slots,
            label: `${s.start_time.substring(0, 5)} - ${s.end_time.substring(0, 5)} (${s.session_name})`
        }));
        sessionSettingsCacheTime = now;
        return sessionSettingsCache;
    } catch (error) {
        console.error('Error fetching session settings:', error);
        // Fallback to default if DB fails
        return LEGACY_SESSION_SETTINGS;
    }
}

/**
 * Last loaded settings without hitting the database. Returns null when nothing
 * has been loaded yet, so callers fall back to the legacy defaults.
 */
function getCachedSessionSettings() {
    return sessionSettingsCache;
}

function findSessionSetting(settings, session) {
    return (settings || []).find(s => s.session === parseInt(session));
}

/**
 * Session label ("08:00 - 10:30 (Pagi)"), or null when the session is unknown.
 */
function getSessionLabelFromSettings(settings, session) {
    const found = findSessionSetting(settings, session);
    if (found) {
        return found.label;
    }
    return LEGACY_SESSION_LABELS[session] || null;
}

/**
 * Slot start time in HH:MM, derived from the configured session start time and
 * slot duration. Returns null when the session or slot number is unknown.
 */
function getSlotTimeFromSettings(settings, session, slotNumber) {
    // Guard against null/'' (Number() turns both into 0) producing a bogus time
    const slot = slotNumber === null || slotNumber === '' ? NaN : Number(slotNumber);
    if (!Number.isFinite(slot) || slot < 1) {
        return null;
    }

    const found = findSessionSetting(settings, session);
    const [startHour, startMinute] = found
        ? found.startTime.split(':').map(Number)
        : [LEGACY_START_HOURS[session], 0];
    if (!Number.isFinite(startHour)) {
        return null;
    }

    const slotDuration = Number(found?.slotDuration) || LEGACY_SLOT_DURATION;
    const totalMinutes = (startHour * 60 + (startMinute || 0)) + (slot - 1) * slotDuration;
    const hour = Math.floor(totalMinutes / 60);
    const minute = totalMinutes % 60;
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

module.exports = {
    DAY_NAMES,
    getDayName,
    getSessionSettings,
    getCachedSessionSettings,
    invalidateSessionSettingsCache,
    getSessionSettingsVersion,
    findSessionSetting,
    getSessionLabelFromSettings,
    getSlotTimeFromSettings
};

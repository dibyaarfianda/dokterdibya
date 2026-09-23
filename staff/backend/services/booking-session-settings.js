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
const { slotTime, schedule } = require('../../public/scripts/booking-slot-utils');

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
 * Return active settings for booking; cache inactive settings too for existing-booking time resolution.
 */
async function getSessionSettings() {
    const now = Date.now();
    if (sessionSettingsCache && (now - sessionSettingsCacheTime) < CACHE_TTL) {
        return sessionSettingsCache.filter(s => s.isActive);
    }

    try {
        const [settings] = await db.query(
            `SELECT session_number, session_name, COALESCE(day_of_week, 0) AS day_of_week, start_time, end_time, slot_duration, max_slots, break_start_time, break_duration_minutes, is_active
             FROM booking_settings ORDER BY session_number ASC`
        );

        sessionSettingsCache = settings.map(s => ({
            session: s.session_number,
            isActive: s.is_active === undefined || Number(s.is_active) === 1,
            name: s.session_name,
            dayOfWeek: Number.parseInt(s.day_of_week, 10) || 0,
            dayName: getDayName(Number.parseInt(s.day_of_week, 10) || 0),
            startTime: s.start_time.substring(0, 5),
            endTime: s.end_time.substring(0, 5),
            slotDuration: s.slot_duration,
            maxSlots: s.max_slots,
            breakStartTime: s.break_start_time ? s.break_start_time.substring(0, 5) : null,
            breakDurationMinutes: s.break_duration_minutes ?? null,
            label: `${s.start_time.substring(0, 5)} - ${s.end_time.substring(0, 5)} (${s.session_name})`
        }));
        sessionSettingsCacheTime = now;
        return sessionSettingsCache.filter(s => s.isActive);
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
    return (settings || []).find(s => s.session === parseInt(session))
        || (sessionSettingsCache || []).find(s => s.session === parseInt(session));
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
    return slotTime({
        start_time: `${startHour}:${String(startMinute || 0).padStart(2, '0')}`,
        slot_duration: slotDuration,
        break_start_time: found?.breakStartTime,
        break_duration_minutes: found?.breakDurationMinutes
    }, slot);
}

// Joined booking rows also include inactive sessions, which still need accurate notification times.
function getSlotTimeFromBookingRow(row) {
    if (!row.start_time) return getSlotTimeFromSettings([], row.session, row.slot_number);
    return slotTime({ ...row, slot_duration: Number(row.slot_duration) || LEGACY_SLOT_DURATION }, row.slot_number);
}

function getSessionBreak(setting) {
    if (!setting?.breakStartTime || !setting.breakDurationMinutes) return null;
    const result = schedule({ start_time: setting.startTime, end_time: setting.endTime,
        slot_duration: setting.slotDuration, max_slots: setting.maxSlots,
        break_start_time: setting.breakStartTime, break_duration_minutes: setting.breakDurationMinutes });
    return { startTime: setting.breakStartTime, endTime: result.break_end_time,
        durationMinutes: Number(setting.breakDurationMinutes) };
}

module.exports = {
    getSessionBreak,
    DAY_NAMES,
    getDayName,
    getSessionSettings,
    getCachedSessionSettings,
    invalidateSessionSettingsCache,
    getSessionSettingsVersion,
    findSessionSetting,
    getSessionLabelFromSettings,
    getSlotTimeFromSettings,
    getSlotTimeFromBookingRow
};

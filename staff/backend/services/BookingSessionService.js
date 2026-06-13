const db = require('../db');

const DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const CACHE_TTL_MS = 60000;

let activeSettingsCache = null;
let activeSettingsCacheKey = null;
let activeSettingsCacheTime = 0;
let staffSettingsCache = null;
let staffSettingsCacheKey = null;
let staffSettingsCacheTime = 0;

function isV2Enabled() {
    return /^(1|true|yes|on)$/i.test(String(process.env.BOOKING_SESSION_V2_ENABLED || ''));
}

function normalizeDayOfWeek(value) {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed >= 0 && parsed <= 6 ? parsed : 0;
}

function getDayName(dayOfWeek) {
    return DAY_NAMES[normalizeDayOfWeek(dayOfWeek)];
}

function timeToHHMM(value, fallback = '00:00') {
    if (!value) return fallback;
    return String(value).substring(0, 5);
}

function buildLabel(row) {
    return `${timeToHHMM(row.start_time)} - ${timeToHHMM(row.end_time)} (${row.session_name})`;
}

function mapSessionRow(row, source) {
    const dayOfWeek = normalizeDayOfWeek(row.day_of_week);
    const templateId = source === 'v2' ? row.id : null;

    return {
        id: row.id,
        source,
        templateId,
        booking_session_template_id: templateId,
        session: Number.parseInt(row.session_number, 10),
        session_number: Number.parseInt(row.session_number, 10),
        name: row.session_name,
        session_name: row.session_name,
        dayOfWeek,
        day_of_week: dayOfWeek,
        dayName: getDayName(dayOfWeek),
        day_name: getDayName(dayOfWeek),
        startTime: timeToHHMM(row.start_time),
        start_time: timeToHHMM(row.start_time),
        endTime: timeToHHMM(row.end_time),
        end_time: timeToHHMM(row.end_time),
        slotDuration: Number.parseInt(row.slot_duration, 10) || 15,
        slot_duration: Number.parseInt(row.slot_duration, 10) || 15,
        maxSlots: Number.parseInt(row.max_slots, 10) || 10,
        max_slots: Number.parseInt(row.max_slots, 10) || 10,
        is_active: row.is_active === undefined ? 1 : Number(row.is_active),
        label: buildLabel(row)
    };
}

async function queryLegacySettings(activeOnly) {
    const where = activeOnly ? 'WHERE is_active = 1' : '';
    const [rows] = await db.query(
        `SELECT id, session_number, session_name, COALESCE(day_of_week, 0) AS day_of_week,
                start_time, end_time, slot_duration, max_slots, is_active
         FROM booking_settings
         ${where}
         ORDER BY session_number ASC`
    );
    return rows.map(row => mapSessionRow(row, 'legacy'));
}

async function queryV2Settings(activeOnly) {
    const where = activeOnly ? 'WHERE is_active = 1' : '';
    const [rows] = await db.query(
        `SELECT id, session_number, session_name, day_of_week,
                start_time, end_time, slot_duration, max_slots, is_active
         FROM booking_session_templates
         ${where}
         ORDER BY day_of_week ASC, session_number ASC, start_time ASC, id ASC`
    );
    return rows.map(row => mapSessionRow(row, 'v2'));
}

function getFallbackSettings() {
    return [
        { id: null, session_number: 1, session_name: 'Pagi', day_of_week: 0, start_time: '09:00:00', end_time: '11:30:00', slot_duration: 15, max_slots: 10, is_active: 1 },
        { id: null, session_number: 2, session_name: 'Siang', day_of_week: 0, start_time: '12:00:00', end_time: '14:30:00', slot_duration: 15, max_slots: 10, is_active: 1 },
        { id: null, session_number: 3, session_name: 'Sore', day_of_week: 0, start_time: '15:00:00', end_time: '17:30:00', slot_duration: 15, max_slots: 10, is_active: 1 }
    ].map(row => mapSessionRow(row, 'fallback'));
}

async function getSettings({ activeOnly = true, preferV2 = isV2Enabled(), allowFallback = true } = {}) {
    const cacheKey = `${activeOnly ? 'active' : 'staff'}:${preferV2 ? 'v2' : 'legacy'}`;
    const now = Date.now();
    const cache = activeOnly ? activeSettingsCache : staffSettingsCache;
    const cacheKeyRef = activeOnly ? activeSettingsCacheKey : staffSettingsCacheKey;
    const cacheTime = activeOnly ? activeSettingsCacheTime : staffSettingsCacheTime;

    if (cache && cacheKeyRef === cacheKey && now - cacheTime < CACHE_TTL_MS) {
        return cache;
    }

    let settings;
    try {
        settings = preferV2 ? await queryV2Settings(activeOnly) : await queryLegacySettings(activeOnly);
    } catch (error) {
        if (!preferV2 || !allowFallback) throw error;
        settings = await queryLegacySettings(activeOnly);
    }

    if (!settings.length && allowFallback && activeOnly) {
        settings = getFallbackSettings();
    }

    if (activeOnly) {
        activeSettingsCache = settings;
        activeSettingsCacheKey = cacheKey;
        activeSettingsCacheTime = now;
    } else {
        staffSettingsCache = settings;
        staffSettingsCacheKey = cacheKey;
        staffSettingsCacheTime = now;
    }

    return settings;
}

async function getActiveSessionSettings(options = {}) {
    return getSettings({ ...options, activeOnly: true });
}

async function getStaffSessionSettings(options = {}) {
    return getSettings({ ...options, activeOnly: false });
}

function parseDateOnlyUtc(dateString) {
    return new Date(`${String(dateString).slice(0, 10)}T00:00:00Z`);
}

async function getConfiguredPracticeDays(options = {}) {
    const settings = await getActiveSessionSettings(options);
    const days = Array.from(new Set(settings.map(setting => setting.dayOfWeek))).sort((left, right) => left - right);
    return days.length ? days : [0];
}

async function getSessionsForDate(dateString, options = {}) {
    const date = parseDateOnlyUtc(dateString);
    const dayOfWeek = date.getUTCDay();
    const settings = await getActiveSessionSettings(options);
    return {
        dayOfWeek,
        sessions: settings.filter(setting => setting.dayOfWeek === dayOfWeek)
    };
}

function findSession(settings, { session, templateId, dayOfWeek } = {}) {
    const numericTemplateId = Number.parseInt(templateId, 10);
    if (Number.isInteger(numericTemplateId)) {
        const byTemplate = settings.find(setting => Number(setting.templateId) === numericTemplateId);
        if (byTemplate) return byTemplate;
    }

    const numericSession = Number.parseInt(session, 10);
    return settings.find(setting => {
        if (Number(setting.session) !== numericSession) return false;
        return dayOfWeek === undefined || setting.dayOfWeek === normalizeDayOfWeek(dayOfWeek);
    }) || null;
}

async function findBookingSession({ date, session, templateId } = {}) {
    const { dayOfWeek, sessions } = await getSessionsForDate(date);
    const found = findSession(sessions, { session, templateId, dayOfWeek });
    return { dayOfWeek, sessionSetting: found, availableSessions: sessions };
}

function getSlotTime(setting, slotNumber) {
    if (!setting) return null;
    const [hours, mins] = String(setting.startTime || setting.start_time || '09:00').split(':').map(Number);
    const duration = Number.parseInt(setting.slotDuration || setting.slot_duration, 10) || 15;
    const totalMinutes = (hours * 60 + mins) + ((Number.parseInt(slotNumber, 10) || 1) - 1) * duration;
    const hour = Math.floor(totalMinutes / 60);
    const minute = totalMinutes % 60;
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

async function resolveAppointmentSession({ appointment, settings } = {}) {
    const availableSettings = settings || await getActiveSessionSettings();
    const date = appointment && appointment.appointment_date ? parseDateOnlyUtc(appointment.appointment_date) : null;
    const dayOfWeek = date ? date.getUTCDay() : undefined;
    const setting = findSession(availableSettings, {
        session: appointment.session,
        templateId: appointment.booking_session_template_id,
        dayOfWeek
    }) || findSession(availableSettings, { session: appointment.session });

    return {
        setting,
        templateId: setting ? setting.templateId : null,
        sessionLabel: setting ? setting.label : 'Unknown',
        slotTime: setting ? getSlotTime(setting, appointment.slot_number) : null
    };
}

function clearCache() {
    activeSettingsCache = null;
    activeSettingsCacheKey = null;
    activeSettingsCacheTime = 0;
    staffSettingsCache = null;
    staffSettingsCacheKey = null;
    staffSettingsCacheTime = 0;
}

module.exports = {
    DAY_NAMES,
    isV2Enabled,
    normalizeDayOfWeek,
    getDayName,
    getActiveSessionSettings,
    getStaffSessionSettings,
    getConfiguredPracticeDays,
    getSessionsForDate,
    findBookingSession,
    findSession,
    getSlotTime,
    resolveAppointmentSession,
    clearCache
};

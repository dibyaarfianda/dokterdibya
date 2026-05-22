const express = require('express');
const router = express.Router();
const db = require('../db');
const { createSundayClinicRecord } = require('../services/sundayClinicService');
const { getGMT7Date, getGMT7Timestamp } = require('../utils/idGenerator');
const { createPatientNotification } = require('./patient-notifications');
const realtimeSync = require('../realtime-sync');
const patientActivityLogger = require('../services/patientActivityLogger');

const DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
let bookingSettingsDaySchemaReady = false;

// Middleware to verify JWT token
const verifyToken = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
        return res.status(401).json({ message: 'Token tidak ditemukan' });
    }

    try {
        const jwt = require('jsonwebtoken');
        const JWT_SECRET = process.env.JWT_SECRET;
        if (!JWT_SECRET) {
            return res.status(500).json({ message: 'Server configuration error' });
        }
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ message: 'Token tidak valid' });
    }
};

function getDayName(dayOfWeek) {
    return DAY_NAMES[dayOfWeek] || 'Tidak diketahui';
}

async function ensureBookingSettingsDayColumn() {
    if (bookingSettingsDaySchemaReady) {
        return;
    }

    const [rows] = await db.query(
        `SELECT 1
         FROM information_schema.columns
         WHERE table_schema = DATABASE()
           AND table_name = 'booking_settings'
           AND column_name = 'day_of_week'
         LIMIT 1`
    );

    if (rows.length === 0) {
        await db.query(
            `ALTER TABLE booking_settings
             ADD COLUMN day_of_week TINYINT NOT NULL DEFAULT 0 AFTER session_name`
        );
    }

    bookingSettingsDaySchemaReady = true;
}

// Helper function to get next available practice dates based on configured days
function getNextPracticeDates(availableDays, count = 8) {
    const practiceDates = [];
    const normalizedDays = Array.from(new Set(
        availableDays
            .map(day => Number.parseInt(day, 10))
            .filter(day => Number.isInteger(day) && day >= 0 && day <= 6)
    ));

    if (!normalizedDays.length) {
        normalizedDays.push(0);
    }

    // Use GMT+7 (Jakarta/Indonesian time) - getGMT7Date returns a Date object
    const now = getGMT7Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const day = now.getDate();
    const currentHour = now.getHours();

    // Create date at midnight for today
    let current = new Date(year, month, day, 0, 0, 0, 0);

    // Check if today is a configured practice day and it's before 9 PM (21:00)
    const isTodayPracticeDay = normalizedDays.includes(current.getDay());
    const isBeforeCutoff = currentHour < 21; // Before 9 PM

    // If today is a configured practice day and before 9 PM, include today
    if (isTodayPracticeDay && isBeforeCutoff) {
        // Create UTC date for API response
        const todayUtc = new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
        practiceDates.push(todayUtc);
    }

    // Continue from tomorrow
    current.setDate(current.getDate() + 1);

    while (practiceDates.length < count) {
        if (normalizedDays.includes(current.getDay())) {
            const practiceDateUtc = new Date(Date.UTC(
                current.getFullYear(),
                current.getMonth(),
                current.getDate(),
                0, 0, 0, 0
            ));
            practiceDates.push(practiceDateUtc);
        }
        current.setDate(current.getDate() + 1);
    }

    return practiceDates;
}

// Cache for session settings
let sessionSettingsCache = null;
let sessionSettingsCacheTime = 0;
const CACHE_TTL = 60000; // 1 minute cache

// Helper function to get session settings from database
async function getSessionSettings() {
    await ensureBookingSettingsDayColumn();
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
        return [
            { session: 1, name: 'Pagi', dayOfWeek: 0, dayName: 'Minggu', startTime: '09:00', endTime: '11:30', slotDuration: 15, maxSlots: 10, label: '09:00 - 11:30 (Pagi)' },
            { session: 2, name: 'Siang', dayOfWeek: 0, dayName: 'Minggu', startTime: '12:00', endTime: '14:30', slotDuration: 15, maxSlots: 10, label: '12:00 - 14:30 (Siang)' },
            { session: 3, name: 'Sore', dayOfWeek: 0, dayName: 'Minggu', startTime: '15:00', endTime: '17:30', slotDuration: 15, maxSlots: 10, label: '15:00 - 17:30 (Sore)' }
        ];
    }
}

async function getConfiguredPracticeDays() {
    const settings = await getSessionSettings();
    const days = Array.from(new Set(settings.map(setting => setting.dayOfWeek))).sort((left, right) => left - right);
    return days.length ? days : [0];
}

// Helper function to get session time label (async version with fallback)
async function getSessionLabelAsync(session) {
    const settings = await getSessionSettings();
    const found = settings.find(s => s.session === parseInt(session));
    return found ? found.label : 'Unknown';
}

// Sync version for backward compatibility (uses cache)
function getSessionLabel(session) {
    if (sessionSettingsCache) {
        const found = sessionSettingsCache.find(s => s.session === parseInt(session));
        return found ? found.label : 'Unknown';
    }
    // Fallback to hardcoded if cache not loaded
    const labels = {
        1: '09:00 - 11:30 (Pagi)',
        2: '12:00 - 14:30 (Siang)',
        3: '15:00 - 17:30 (Sore)'
    };
    return labels[session] || 'Unknown';
}

// Helper function to calculate slot time (async version)
async function getSlotTimeAsync(session, slotNumber) {
    const settings = await getSessionSettings();
    const found = settings.find(s => s.session === parseInt(session));

    if (!found) {
        // Fallback
        const startHours = { 1: 9, 2: 12, 3: 15 };
        const startHour = startHours[session] || 9;
        const minutes = (slotNumber - 1) * 15;
        const hour = startHour + Math.floor(minutes / 60);
        const minute = minutes % 60;
        return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    }

    const [hours, mins] = found.startTime.split(':').map(Number);
    const totalMinutes = (hours * 60 + mins) + (slotNumber - 1) * found.slotDuration;
    const hour = Math.floor(totalMinutes / 60);
    const minute = totalMinutes % 60;
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

// Sync version for backward compatibility
function getSlotTime(session, slotNumber) {
    if (sessionSettingsCache) {
        const found = sessionSettingsCache.find(s => s.session === parseInt(session));
        if (found) {
            const [hours, mins] = found.startTime.split(':').map(Number);
            const totalMinutes = (hours * 60 + mins) + (slotNumber - 1) * found.slotDuration;
            const hour = Math.floor(totalMinutes / 60);
            const minute = totalMinutes % 60;
            return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
        }
    }
    // Fallback to hardcoded
    const startHours = { 1: 9, 2: 12, 3: 15 };
    const startHour = startHours[session] || 9;
    const minutes = (slotNumber - 1) * 15;
    const hour = startHour + Math.floor(minutes / 60);
    const minute = minutes % 60;
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

// Helper function to get category label
function getCategoryLabel(category) {
    const labels = {
        'obstetri': 'Kehamilan (Obstetri)',
        'gyn_repro': 'Program Hamil (Reproduksi)',
        'gyn_special': 'Ginekologi Umum'
    };
    return labels[category] || category || '-';
}

function calculateAge(birthDate) {
    if (!(birthDate instanceof Date) || isNaN(birthDate.getTime())) {
        return null;
    }
    const today = getGMT7Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
    }
    return age < 0 ? null : age;
}

/**
 * GET /api/sunday-appointments/available
 * Get available slots for a specific date
 */
router.get('/available', verifyToken, async (req, res) => {
    try {
        const { date } = req.query;
        
        if (!date) {
            return res.status(400).json({ message: 'Tanggal harus diisi' });
        }
        
        // Parse date in UTC to avoid timezone issues
        const appointmentDate = new Date(date + 'T00:00:00Z');
        const dayOfWeek = appointmentDate.getUTCDay();
        const sessionSettings = await getSessionSettings();
        const availableSessions = sessionSettings.filter(setting => setting.dayOfWeek === dayOfWeek);
        
        console.log('Available slots request:', { date, dayOfWeek, dateObj: appointmentDate });
        
        if (availableSessions.length === 0) {
            return res.status(400).json({
                message: `Janji temu tidak tersedia di hari ${getDayName(dayOfWeek)}`,
                debug: { date, dayOfWeek, dateObj: appointmentDate.toISOString() }
            });
        }

        // Check if date is disabled (cuti/libur)
        const [disabledCheck] = await db.query(
            `SELECT reason FROM disabled_practice_dates
             WHERE disabled_date = ? AND (location IS NULL OR location = 'klinik_privat')`,
            [date]
        );
        if (disabledCheck.length > 0) {
            return res.status(400).json({
                message: `Maaf, tanggal ini tidak tersedia. ${disabledCheck[0].reason || 'Jadwal tidak tersedia'}`
            });
        }

        // Get booked slots for this date
        const [bookedSlots] = await db.query(
            `SELECT session, slot_number FROM sunday_appointments
             WHERE appointment_date = ? AND status NOT IN ('cancelled', 'no_show')`,
            [date]
        );

        // Build available slots structure from dynamic settings
        const sessions = availableSessions.map(setting => ({
            session: setting.session,
            label: setting.label,
            slots: []
        }));

        // Populate slots for each session
        for (const sessionObj of sessions) {
            const setting = availableSessions.find(s => s.session === sessionObj.session);
            const maxSlots = setting ? setting.maxSlots : 10;

            for (let slot = 1; slot <= maxSlots; slot++) {
                const isBooked = bookedSlots.some(
                    b => b.session === sessionObj.session && b.slot_number === slot
                );
                const slotTime = await getSlotTimeAsync(sessionObj.session, slot);
                sessionObj.slots.push({
                    number: slot,
                    time: slotTime,
                    available: !isBooked
                });
            }
        }
        
        res.json({
            date,
            dayOfWeek: getDayName(dayOfWeek),
            sessions
        });
        
    } catch (error) {
        console.error('Error getting available slots:', error);
        res.status(500).json({ message: 'Terjadi kesalahan saat mengambil data slot' });
    }
});

/**
 * GET /api/sunday-appointments/sundays
 * Get list of next available practice dates (excluding disabled dates)
 */
router.get('/sundays', verifyToken, async (req, res) => {
    try {
        const configuredDays = await getConfiguredPracticeDays();
        const practiceDates = getNextPracticeDates(configuredDays, 8);
        const formattedSundays = practiceDates.map(date => ({
            date: date.toISOString().split('T')[0],
            formatted: date.toLocaleDateString('id-ID', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                timeZone: 'UTC'
            }),
            dayOfWeek: date.getUTCDay(),
            dayName: getDayName(date.getUTCDay())
        }));

        // Check for disabled dates (klinik_privat or all locations)
        const dateStrings = formattedSundays.map(s => s.date);
        const [disabledDates] = await db.query(
            `SELECT disabled_date, reason FROM disabled_practice_dates
             WHERE disabled_date IN (?) AND (location IS NULL OR location = 'klinik_privat')`,
            [dateStrings]
        );

        // Create a set of disabled date strings for fast lookup
        const disabledSet = new Set(disabledDates.map(d => {
            const dateObj = new Date(d.disabled_date);
            const y = dateObj.getFullYear();
            const m = String(dateObj.getMonth() + 1).padStart(2, '0');
            const day = String(dateObj.getDate()).padStart(2, '0');
            return `${y}-${m}-${day}`;
        }));

        // Filter out disabled dates
        const availableSundays = formattedSundays.filter(s => !disabledSet.has(s.date));

        console.log('Practice dates generated:', formattedSundays.length, 'Available:', availableSundays.length);
        res.json({ sundays: availableSundays, dates: availableSundays });
    } catch (error) {
        console.error('Error getting practice dates:', error);
        res.status(500).json({ message: 'Terjadi kesalahan' });
    }
});

/**
 * POST /api/sunday-appointments/book
 * Book an appointment
 */
router.post('/book', verifyToken, async (req, res) => {
    try {
        const { appointment_date, session, slot_number, chief_complaint, consultation_category } = req.body;
        
        // Validation
        if (!appointment_date || !session || !slot_number || !chief_complaint) {
            return res.status(400).json({ message: 'Semua field harus diisi' });
        }

        // Get dynamic session settings for validation
        const sessionSettings = await getSessionSettings();
        const sessionSetting = sessionSettings.find(s => s.session === parseInt(session));
        const appointmentDate = new Date(appointment_date + 'T00:00:00Z');
        const appointmentDayOfWeek = appointmentDate.getUTCDay();

        const validSessions = sessionSettings
            .filter(s => s.dayOfWeek === appointmentDayOfWeek)
            .map(s => s.session);

        if (!sessionSetting || !validSessions.includes(parseInt(session))) {
            return res.status(400).json({ message: `Sesi tidak valid (pilihan: ${validSessions.join(', ')})` });
        }

        const maxSlots = sessionSetting ? sessionSetting.maxSlots : 10;
        if (slot_number < 1 || slot_number > maxSlots) {
            return res.status(400).json({ message: `Nomor slot harus antara 1-${maxSlots}` });
        }
        
        if (sessionSetting.dayOfWeek !== appointmentDayOfWeek) {
            return res.status(400).json({
                message: `Sesi ini hanya tersedia di hari ${sessionSetting.dayName}`
            });
        }

        // Check if date is disabled
        const [disabledCheck] = await db.query(
            `SELECT id, reason FROM disabled_practice_dates
             WHERE disabled_date = ? AND (location IS NULL OR location = 'klinik_privat')`,
            [appointment_date]
        );
        if (disabledCheck.length > 0) {
            const reason = disabledCheck[0].reason || 'Jadwal tidak tersedia';
            return res.status(400).json({
                message: `Maaf, tanggal ini tidak tersedia untuk booking. ${reason}`
            });
        }

        // Get patient info
        const [patients] = await db.query(
            'SELECT id, full_name, phone FROM patients WHERE id = ?',
            [req.user.id]
        );
        
        if (patients.length === 0) {
            return res.status(404).json({ message: 'Data pasien tidak ditemukan' });
        }
        
        const patient = patients[0];
        
        // Check if slot is already booked
        const [existingBooking] = await db.query(
            `SELECT id FROM sunday_appointments 
             WHERE appointment_date = ? AND session = ? AND slot_number = ? 
             AND status NOT IN ('cancelled', 'no_show')`,
            [appointment_date, session, slot_number]
        );
        
        if (existingBooking.length > 0) {
            return res.status(409).json({ message: 'Slot ini sudah dibooking oleh pasien lain' });
        }
        
        // Check if patient already has any upcoming appointment
        const [patientExisting] = await db.query(
            `SELECT id, appointment_date, session, slot_number FROM sunday_appointments 
             WHERE patient_id = ? 
             AND appointment_date >= CURDATE()
             AND status NOT IN ('cancelled', 'no_show', 'completed')`,
            [req.user.id]
        );
        
        if (patientExisting.length > 0) {
            const existingAppt = patientExisting[0];
            const existingDate = new Date(existingAppt.appointment_date);
            return res.status(409).json({ 
                message: `Anda sudah memiliki janji temu di Klinik Privat pada ${existingDate.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} sesi ${getSessionLabel(existingAppt.session)}. Anda hanya dapat membooking 1 slot. Silakan batalkan janji temu yang ada jika ingin mengubah jadwal.` 
            });
        }
        
        // Validate consultation category
        const validCategories = ['obstetri', 'gyn_repro', 'gyn_special'];
        const category = validCategories.includes(consultation_category) ? consultation_category : 'obstetri';

        // Remove any cancelled/no_show entry for this slot to avoid UNIQUE constraint violation
        await db.query(
            `DELETE FROM sunday_appointments
             WHERE appointment_date = ? AND session = ? AND slot_number = ?
             AND status IN ('cancelled', 'no_show')`,
            [appointment_date, session, slot_number]
        );

        // Generate confirmation token
        const crypto = require('crypto');
        const confirmationToken = crypto.randomBytes(32).toString('hex');

        // Sunday bookings require attendance confirmation by the weekend cron flow.
        const appointmentDayOfWeekForBooking = new Date(appointment_date + 'T00:00:00Z').getUTCDay();
        const requiresConfirmation = appointmentDayOfWeekForBooking === 0; // 0 = Sunday
        const bookingStatus = requiresConfirmation ? 'pending_confirmation' : 'confirmed';

        // Create appointment
        const [result] = await db.query(
            `INSERT INTO sunday_appointments
             (patient_id, patient_name, patient_phone, appointment_date, session, slot_number, chief_complaint, consultation_category, status, confirmation_token)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [patient.id, patient.full_name, patient.phone, appointment_date, session, slot_number, chief_complaint, category, bookingStatus, confirmationToken]
        );

        // Broadcast new booking to all connected staff
        realtimeSync.broadcastNewBooking({
            id: result.insertId,
            patient_name: patient.full_name,
            appointment_date: appointment_date,
            session: session,
            session_label: getSessionLabel(session),
            slot_number: slot_number,
            status: bookingStatus
        });

        // Track booking activity (fire-and-forget)
        patientActivityLogger.logActivity(req.user.id, patientActivityLogger.EVENTS.BOOKING, { detail: 'Booking ' + appointment_date + ' Sesi ' + session }, req);

        const responseMessage = requiresConfirmation
            ? 'Booking berhasil! Konfirmasi kehadiran Anda di hari-H sebelum jam 09.00 WIB agar nama Anda muncul di antrian.'
            : 'Janji temu berhasil dibuat dan langsung terkonfirmasi!';

        res.status(201).json({
            message: responseMessage,
            appointmentId: result.insertId,
            status: bookingStatus,
            requiresConfirmation,
            details: {
                date: appointmentDate.toLocaleDateString('id-ID', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                }),
                session: getSessionLabel(session),
                time: getSlotTime(session, slot_number),
                slot: slot_number
            }
        });
        
    } catch (error) {
        console.error('Error booking appointment:', error);
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: 'Slot ini sudah dibooking oleh pasien lain' });
        }
        res.status(500).json({ message: 'Terjadi kesalahan saat membuat janji temu' });
    }
});

/**
 * GET /api/sunday-appointments/my-bookings
 * Get patient's bookings (used by patient portal)
 * Supports ?status=confirmed,pending filter
 */
router.get('/my-bookings', verifyToken, async (req, res) => {
    try {
        let query = `SELECT id, appointment_date, session, slot_number, chief_complaint,
                            consultation_category, status, notes, created_at
                     FROM sunday_appointments
                     WHERE patient_id = ?`;
        const params = [req.user.id];

        // Optional status filter
        if (req.query.status) {
            const statuses = req.query.status.split(',').map(s => s.trim());
            query += ` AND status IN (${statuses.map(() => '?').join(',')})`;
            params.push(...statuses);
        }

        query += ` ORDER BY appointment_date DESC, session ASC, slot_number ASC`;

        const [bookings] = await db.query(query, params);

        const formatted = bookings.map(b => ({
            ...b,
            appointment_date: b.appointment_date,
            slot_time: getSlotTime(b.session, b.slot_number),
            sessionLabel: getSessionLabel(b.session),
            categoryLabel: getCategoryLabel(b.consultation_category),
            dateFormatted: new Date(b.appointment_date).toLocaleDateString('id-ID', {
                weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
            })
        }));

        res.json({ success: true, bookings: formatted });

    } catch (error) {
        console.error('Error getting patient bookings:', error);
        res.status(500).json({ success: false, message: 'Terjadi kesalahan' });
    }
});

/**
 * GET /api/sunday-appointments/patient
 * Get patient's appointments
 */
router.get('/patient', verifyToken, async (req, res) => {
    try {
        const [appointments] = await db.query(
            `SELECT id, appointment_date, session, slot_number, chief_complaint, consultation_category, status, notes,
                    cancellation_reason, cancelled_by, cancelled_at, created_at
             FROM sunday_appointments
             WHERE patient_id = ?
             ORDER BY appointment_date DESC, session ASC, slot_number ASC`,
            [req.user.id]
        );

        const formatted = appointments.map(apt => {
            const slotTime = getSlotTime(apt.session, apt.slot_number);

            let startDateTime = null;
            let arrivalTime = null;
            let arrivalTimeFormatted = null;
            let isPast = new Date(apt.appointment_date) < new Date();

            if (slotTime && /^\d{2}:\d{2}$/.test(slotTime)) {
                // MySQL DATE is returned as UTC midnight, but represents local date
                // Add 7 hours to get correct GMT+7 date, then extract date part
                const aptDate = new Date(apt.appointment_date);
                const gmt7Offset = aptDate.getTime() + (7 * 60 * 60 * 1000);
                const dateStr = new Date(gmt7Offset).toISOString().split('T')[0];
                const start = new Date(`${dateStr}T${slotTime}:00+07:00`); // Create date in GMT+7
                if (!isNaN(start.getTime())) {
                    startDateTime = start.toISOString();
                    const arrival = new Date(start.getTime() - (15 * 60 * 1000));
                    arrivalTime = arrival.toISOString();
                    arrivalTimeFormatted = arrival.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
                    isPast = start < new Date();
                }
            }

                
            return {
                ...apt,
                dateFormatted: new Date(apt.appointment_date).toLocaleDateString('id-ID', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                }),
                sessionLabel: getSessionLabel(apt.session),
                time: slotTime,
                startDateTime,
                arrivalTime,
                arrivalTimeFormatted,
                isPast,
                categoryLabel: getCategoryLabel(apt.consultation_category)
            };
        });

        res.json({ appointments: formatted });

    } catch (error) {
        console.error('Error getting patient appointments:', error);
        res.status(500).json({ message: 'Terjadi kesalahan' });
    }
});

/**
 * GET /api/sunday-appointments/my-pending-confirmation
 * Returns the next pending_confirmation appointment for the logged-in patient.
 */
router.get('/my-pending-confirmation', verifyToken, async (req, res) => {
    try {
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '0');

        const [rows] = await db.query(
            `SELECT id, DATE_FORMAT(appointment_date, '%Y-%m-%d') AS appointment_date, session, slot_number, chief_complaint, consultation_category, status
             FROM sunday_appointments
             WHERE patient_id = ?
               AND status = 'pending_confirmation'
               AND appointment_date >= CURDATE()
               AND confirmation_popup_enabled_at IS NOT NULL
             ORDER BY appointment_date ASC, session ASC, slot_number ASC
             LIMIT 1`,
            [req.user.id]
        );

        if (rows.length === 0) {
            return res.json({ success: true, appointment: null });
        }

        const apt = rows[0];
        res.json({
            success: true,
            appointment: {
                id: apt.id,
                appointment_date: apt.appointment_date,
                session_label: getSessionLabel(apt.session),
                slot_time: getSlotTime(apt.session, apt.slot_number),
                slot_number: apt.slot_number,
                chief_complaint: apt.chief_complaint,
                status: apt.status
            }
        });
    } catch (error) {
        console.error('Error getting pending confirmation:', error);
        res.status(500).json({ success: false, message: 'Terjadi kesalahan' });
    }
});

/**
 * POST /api/sunday-appointments/:id/confirm-attendance
 * Confirm attendance via patient portal (authenticated)
 */
router.post('/:id/confirm-attendance', verifyToken, async (req, res) => {
    try {
        const { id } = req.params;

        const [rows] = await db.query(
            `SELECT id, patient_id, patient_name, session, slot_number, status
             FROM sunday_appointments
             WHERE id = ? AND patient_id = ? AND status = 'pending_confirmation'`,
            [id, req.user.id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Jadwal tidak ditemukan atau sudah dikonfirmasi' });
        }

        await db.query(
            `UPDATE sunday_appointments
             SET status = 'confirmed', confirmed_at = NOW()
             WHERE id = ?`,
            [id]
        );

        // Broadcast to staff
        try {
            realtimeSync.broadcastNewBooking({
                id: parseInt(id),
                patient_name: rows[0].patient_name,
                session: rows[0].session,
                session_label: getSessionLabel(rows[0].session),
                slot_number: rows[0].slot_number,
                status: 'confirmed',
                _event: 'attendance_confirmed'
            });
        } catch (rtErr) {
            console.error('Realtime broadcast error:', rtErr.message);
        }

        res.json({ success: true, message: 'Kehadiran dikonfirmasi! Nama Anda akan muncul di antrian.' });
    } catch (error) {
        console.error('Error confirming attendance:', error);
        res.status(500).json({ success: false, message: 'Terjadi kesalahan' });
    }
});

/**
 * POST /api/sunday-appointments/:id/cancel-attendance
 * Cancel attendance via patient portal (authenticated, no reason required)
 */
router.post('/:id/cancel-attendance', verifyToken, async (req, res) => {
    try {
        const { id } = req.params;

        const [rows] = await db.query(
            `SELECT id, patient_id, patient_name, session, slot_number, status
             FROM sunday_appointments
             WHERE id = ? AND patient_id = ? AND status = 'pending_confirmation'`,
            [id, req.user.id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Jadwal tidak ditemukan atau sudah diproses' });
        }

        await db.query(
            `UPDATE sunday_appointments
             SET status = 'cancelled',
                 cancelled_by = 'patient',
                 cancellation_reason = 'Tidak dapat hadir (konfirmasi hari-H)',
                 cancelled_at = NOW()
             WHERE id = ?`,
            [id]
        );

        // Broadcast slot released
        try {
            realtimeSync.broadcastCancellation({
                id: parseInt(id),
                patient_name: rows[0].patient_name,
                session: rows[0].session,
                slot_number: rows[0].slot_number,
                status: 'cancelled'
            });
        } catch (rtErr) {
            console.error('Realtime broadcast error:', rtErr.message);
        }

        res.json({ success: true, message: 'Jadwal dibatalkan.' });
    } catch (error) {
        console.error('Error cancelling attendance:', error);
        res.status(500).json({ success: false, message: 'Terjadi kesalahan' });
    }
});

/**
 * GET /api/sunday-appointments/by-token/:token
 * Get appointment info by confirmation token (no auth — token IS the auth)
 */
router.get('/by-token/:token', async (req, res) => {
    try {
        const { token } = req.params;

        if (!token || token.length !== 64) {
            return res.status(400).json({ success: false, message: 'Token tidak valid' });
        }

        const [rows] = await db.query(
            `SELECT id, patient_name, appointment_date, session, slot_number, chief_complaint, status
             FROM sunday_appointments
             WHERE confirmation_token = ?`,
            [token]
        );

        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Token tidak ditemukan' });
        }

        const apt = rows[0];

        // Check if token is still usable
        if (apt.status !== 'pending_confirmation') {
            const statusLabel = apt.status === 'confirmed' ? 'sudah dikonfirmasi'
                : apt.status === 'cancelled' ? 'sudah dibatalkan'
                : apt.status;
            return res.json({
                success: true,
                appointment: {
                    id: apt.id,
                    patient_name: apt.patient_name,
                    appointment_date: apt.appointment_date,
                    session_label: getSessionLabel(apt.session),
                    slot_time: getSlotTime(apt.session, apt.slot_number),
                    chief_complaint: apt.chief_complaint,
                    status: apt.status
                },
                expired: true,
                expiredMessage: `Jadwal ini ${statusLabel}.`
            });
        }

        res.json({
            success: true,
            appointment: {
                id: apt.id,
                patient_name: apt.patient_name,
                appointment_date: apt.appointment_date,
                session_label: getSessionLabel(apt.session),
                slot_time: getSlotTime(apt.session, apt.slot_number),
                chief_complaint: apt.chief_complaint,
                status: apt.status
            },
            expired: false
        });
    } catch (error) {
        console.error('Error getting appointment by token:', error);
        res.status(500).json({ success: false, message: 'Terjadi kesalahan' });
    }
});

/**
 * POST /api/sunday-appointments/by-token/:token/confirm
 * Confirm attendance via WhatsApp link token (no auth)
 */
router.post('/by-token/:token/confirm', async (req, res) => {
    try {
        const { token } = req.params;

        const [rows] = await db.query(
            `SELECT id, patient_id, patient_name, session, slot_number, status
             FROM sunday_appointments
             WHERE confirmation_token = ? AND status = 'pending_confirmation'`,
            [token]
        );

        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Token tidak valid atau sudah kedaluwarsa' });
        }

        const apt = rows[0];

        await db.query(
            `UPDATE sunday_appointments
             SET status = 'confirmed', confirmed_at = NOW()
             WHERE id = ?`,
            [apt.id]
        );

        // Create in-app notification
        try {
            await createPatientNotification({
                patient_id: apt.patient_id,
                type: 'appointment',
                title: 'Kehadiran Dikonfirmasi',
                message: `Kehadiran Anda (${getSessionLabel(apt.session)}, slot ${apt.slot_number}) telah dikonfirmasi. Nama Anda akan muncul di antrian.`,
                link: '/riwayat-kunjungan.html',
                icon: 'fa fa-check-circle',
                icon_color: 'text-success'
            });
        } catch (notifErr) {
            console.error('Notification error:', notifErr.message);
        }

        // Broadcast to staff
        try {
            realtimeSync.broadcastNewBooking({
                id: apt.id,
                patient_name: apt.patient_name,
                session: apt.session,
                session_label: getSessionLabel(apt.session),
                slot_number: apt.slot_number,
                status: 'confirmed',
                _event: 'attendance_confirmed'
            });
        } catch (rtErr) {
            console.error('Realtime broadcast error:', rtErr.message);
        }

        res.json({ success: true, message: 'Kehadiran berhasil dikonfirmasi! Nama Anda akan muncul di antrian.' });
    } catch (error) {
        console.error('Error confirming by token:', error);
        res.status(500).json({ success: false, message: 'Terjadi kesalahan' });
    }
});

/**
 * POST /api/sunday-appointments/by-token/:token/cancel
 * Cancel attendance via WhatsApp link token (no auth)
 */
router.post('/by-token/:token/cancel', async (req, res) => {
    try {
        const { token } = req.params;

        const [rows] = await db.query(
            `SELECT id, patient_id, patient_name, session, slot_number, status
             FROM sunday_appointments
             WHERE confirmation_token = ? AND status = 'pending_confirmation'`,
            [token]
        );

        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Token tidak valid atau sudah kedaluwarsa' });
        }

        const apt = rows[0];

        await db.query(
            `UPDATE sunday_appointments
             SET status = 'cancelled',
                 cancelled_by = 'patient',
                 cancellation_reason = 'Tidak dapat hadir (konfirmasi via WhatsApp)',
                 cancelled_at = NOW()
             WHERE id = ?`,
            [apt.id]
        );

        // Create in-app notification
        try {
            await createPatientNotification({
                patient_id: apt.patient_id,
                type: 'appointment',
                title: 'Jadwal Dibatalkan',
                message: `Jadwal Anda (${getSessionLabel(apt.session)}, slot ${apt.slot_number}) telah dibatalkan.`,
                link: '/riwayat-kunjungan.html',
                icon: 'fa fa-times-circle',
                icon_color: 'text-danger'
            });
        } catch (notifErr) {
            console.error('Notification error:', notifErr.message);
        }

        // Broadcast slot released
        try {
            realtimeSync.broadcastCancellation({
                id: apt.id,
                patient_name: apt.patient_name,
                session: apt.session,
                slot_number: apt.slot_number,
                status: 'cancelled'
            });
        } catch (rtErr) {
            console.error('Realtime broadcast error:', rtErr.message);
        }

        res.json({ success: true, message: 'Jadwal berhasil dibatalkan.' });
    } catch (error) {
        console.error('Error cancelling by token:', error);
        res.status(500).json({ success: false, message: 'Terjadi kesalahan' });
    }
});

/**
 * PUT /api/sunday-appointments/:id/cancel
 * Cancel an appointment
 */
router.put('/:id/cancel', verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;
        
        // Check if appointment exists and belongs to patient
        const [appointments] = await db.query(
            'SELECT * FROM sunday_appointments WHERE id = ? AND patient_id = ?',
            [id, req.user.id]
        );
        
        if (appointments.length === 0) {
            return res.status(404).json({ message: 'Janji temu tidak ditemukan' });
        }
        
        const appointment = appointments[0];
        
        const cancellationReason = typeof reason === 'string' ? reason.trim() : '';
        if (!cancellationReason || cancellationReason.length < 10) {
            return res.status(400).json({ message: 'Mohon berikan alasan pembatalan minimal 10 karakter' });
        }

        if (appointment.status === 'cancelled') {
            return res.status(400).json({ message: 'Janji temu sudah dibatalkan' });
        }
        
        if (appointment.status === 'completed') {
            return res.status(400).json({ message: 'Janji temu yang sudah selesai tidak dapat dibatalkan' });
        }

        const slotTime = getSlotTime(appointment.session, appointment.slot_number);
        if (slotTime) {
            const appointmentStart = new Date(`${appointment.appointment_date}T${slotTime}:00`);
            if (!isNaN(appointmentStart.getTime()) && appointmentStart <= new Date()) {
                return res.status(400).json({ message: 'Janji temu yang sudah berjalan atau lewat tidak dapat dibatalkan' });
            }
        }
        
        // Update status to cancelled
        await db.query(
            `UPDATE sunday_appointments
             SET status = 'cancelled',
                 cancellation_reason = ?,
                 cancelled_by = 'patient',
                 cancelled_at = NOW(),
                 updated_at = NOW()
             WHERE id = ?`,
            [cancellationReason, id]
        );

        // Broadcast cancellation to staff
        realtimeSync.broadcastBookingCancel({
            id: id,
            patient_name: appointment.patient_name,
            appointment_date: appointment.appointment_date
        });

        res.json({ success: true, message: 'Janji temu berhasil dibatalkan', reason: cancellationReason });
        
    } catch (error) {
        console.error('Error cancelling appointment:', error);
        res.status(500).json({ message: 'Terjadi kesalahan' });
    }
});

/**
 * POST /api/sunday-appointments/:id/start-clinic-record
 * Ensure Sunday Clinic medical record exists for the appointment and return MR info
 */
router.post('/:id/start-clinic-record', verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { category: requestCategory } = req.body || {};

        const [appointments] = await db.query(
            `SELECT a.*, a.consultation_category, p.id AS patient_db_id, p.full_name
             FROM sunday_appointments a
             LEFT JOIN patients p ON CAST(a.patient_id AS CHAR) = CAST(p.id AS CHAR)
             WHERE a.id = ?
             LIMIT 1`,
            [id]
        );

        if (appointments.length === 0) {
            return res.status(404).json({ message: 'Janji temu tidak ditemukan' });
        }

        const appointment = appointments[0];

        if (!appointment.patient_db_id) {
            return res.status(400).json({ message: 'Data pasien belum tersedia untuk janji temu ini' });
        }

        const userId = req.user && req.user.id ? req.user.id : null;

        // Fetch latest intake data for the patient to determine correct category
        let intakeData = null;
        try {
            const [intakeRows] = await db.query(
                `SELECT payload FROM patient_intake_submissions
                 WHERE patient_id = ? AND status = 'verified'
                 ORDER BY created_at DESC
                 LIMIT 1`,
                [appointment.patient_db_id]
            );

            if (intakeRows.length > 0 && intakeRows[0].payload) {
                intakeData = typeof intakeRows[0].payload === 'string'
                    ? JSON.parse(intakeRows[0].payload)
                    : intakeRows[0].payload;
            }
        } catch (intakeError) {
            console.error('Failed to fetch intake data, will use default category:', intakeError);
        }

        // Priority: 1) Staff selection from modal, 2) Appointment category, 3) Intake data
        const validCategories = ['obstetri', 'gyn_repro', 'gyn_special'];
        const finalCategory = validCategories.includes(requestCategory)
            ? requestCategory
            : (appointment.consultation_category || null);

        const { record, created } = await createSundayClinicRecord({
            appointmentId: appointment.id,
            patientId: appointment.patient_db_id,
            category: finalCategory,
            intakeData: intakeData,
            createdBy: userId
        });

        res.json({
            success: true,
            created,
            record: {
                id: record.id,
                mrId: record.mr_id,
                status: record.status,
                folderPath: record.folder_path,
                patientId: record.patient_id,
                appointmentId: record.appointment_id,
                createdAt: record.created_at,
                updatedAt: record.updated_at,
                lastActivityAt: record.last_activity_at,
                finalizedAt: record.finalized_at,
                finalizedBy: record.finalized_by
            }
        });

    } catch (error) {
        console.error('Error starting Sunday clinic record:', error);
        res.status(500).json({ message: 'Terjadi kesalahan saat memulai rekam medis Klinik Private' });
    }
});

/**
 * GET /api/sunday-appointments/list (STAFF ONLY)
 * Get all appointments with filters
 */
router.get('/list', verifyToken, async (req, res) => {
    try {
        const { date, status, session } = req.query;
        
        let query = `
            SELECT a.*, p.full_name, p.phone, p.email, p.birth_date AS patient_birth_date
            FROM sunday_appointments a
            LEFT JOIN patients p ON CAST(a.patient_id AS CHAR) = CAST(p.id AS CHAR)
            WHERE 1=1
        `;
        const params = [];
        
        if (date) {
            query += ' AND a.appointment_date = ?';
            params.push(date);
        }
        
        if (status) {
            query += ' AND a.status = ?';
            params.push(status);
        } else {
            query += ' AND a.status != ?';
            params.push('cancelled');
        }
        
        if (session) {
            query += ' AND a.session = ?';
            params.push(session);
        }
        
        query += ' ORDER BY a.appointment_date DESC, a.session ASC, a.slot_number ASC';
        
        const [appointments] = await db.query(query, params);
        
        const formatted = appointments.map(apt => {
            const birthDateSource = apt.patient_birth_date ? new Date(apt.patient_birth_date) : null;
            const hasValidBirth = birthDateSource && !isNaN(birthDateSource.getTime());
            const patientAge = hasValidBirth ? calculateAge(birthDateSource) : null;
            const birthIso = hasValidBirth ? birthDateSource.toISOString() : null;

            return {
                ...apt,
                patientAge,
                patientBirthDate: birthIso,
                dateFormatted: new Date(apt.appointment_date).toLocaleDateString('id-ID', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                }),
                sessionLabel: getSessionLabel(apt.session),
                time: getSlotTime(apt.session, apt.slot_number),
                categoryLabel: getCategoryLabel(apt.consultation_category)
            };
        });

        res.json({ appointments: formatted });
        
    } catch (error) {
        console.error('Error getting appointments list:', error);
        res.status(500).json({ message: 'Terjadi kesalahan' });
    }
});

/**
 * GET /api/sunday-appointments/patient-by-id (STAFF ONLY)
 * Get patient's appointments by patient ID (for staff use)
 */
router.get('/patient-by-id', verifyToken, async (req, res) => {
    try {
        const { patientId } = req.query;
        
        if (!patientId) {
            return res.status(400).json({ 
                success: false, 
                message: 'Patient ID required' 
            });
        }
        
        const [appointments] = await db.query(
            `SELECT id, appointment_date, session, slot_number, chief_complaint, status, notes,
                    cancellation_reason, cancelled_by, cancelled_at, created_at
             FROM sunday_appointments
             WHERE patient_id = ?
             ORDER BY appointment_date DESC, session ASC, slot_number ASC`,
            [patientId]
        );
        
        const formatted = appointments.map(apt => {
            const slotTime = getSlotTime(apt.session, apt.slot_number);

            // Calculate isPast correctly with GMT+7 timezone
            let isPast = new Date(apt.appointment_date) < new Date();
            if (slotTime && /^\d{2}:\d{2}$/.test(slotTime)) {
                const aptDate = new Date(apt.appointment_date);
                const gmt7Offset = aptDate.getTime() + (7 * 60 * 60 * 1000);
                const dateStr = new Date(gmt7Offset).toISOString().split('T')[0];
                const start = new Date(`${dateStr}T${slotTime}:00+07:00`);
                if (!isNaN(start.getTime())) {
                    isPast = start < new Date();
                }
            }

            return {
                ...apt,
                dateFormatted: new Date(apt.appointment_date).toLocaleDateString('id-ID', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                }),
                sessionLabel: getSessionLabel(apt.session),
                time: slotTime,
                isPast
            };
        });
        
        res.json({ 
            success: true, 
            appointments: formatted 
        });
        
    } catch (error) {
        console.error('Error getting patient appointments by ID:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Terjadi kesalahan' 
        });
    }
});

/**
 * PUT /api/sunday-appointments/:id/status (STAFF ONLY)
 * Update appointment status
 */
router.put('/:id/status', verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { status, notes, cancellationReason } = req.body;
        
        const validStatuses = ['pending', 'pending_confirmation', 'confirmed', 'completed', 'cancelled', 'no_show'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ message: 'Status tidak valid' });
        }

        let trimmedNotes = typeof notes === 'string' ? notes.trim() : null;
        if (trimmedNotes === '') {
            trimmedNotes = null;
        }

        let trimmedCancellation = typeof cancellationReason === 'string' ? cancellationReason.trim() : null;
        if (trimmedCancellation === '') {
            trimmedCancellation = null;
        }
        const cancellationReasonToSave = status === 'cancelled'
            ? (trimmedCancellation || trimmedNotes || null)
            : null;
        const cancelledByValue = status === 'cancelled' ? 'staff' : null;
        const cancelledAtClause = status === 'cancelled' ? 'NOW()' : 'NULL';

        // Get appointment details first for notification
        const [appointments] = await db.query(
            `SELECT sa.*, bs.session_name, bs.start_time
             FROM sunday_appointments sa
             LEFT JOIN booking_settings bs ON sa.session = bs.session_number
             WHERE sa.id = ?`,
            [id]
        );

        if (appointments.length === 0) {
            return res.status(404).json({ message: 'Appointment tidak ditemukan' });
        }

        const appointment = appointments[0];

        await db.query(
            `UPDATE sunday_appointments
             SET status = ?,
                 notes = ?,
                 cancellation_reason = ?,
                 cancelled_by = ?,
                 cancelled_at = ${cancelledAtClause},
                 updated_at = NOW()
             WHERE id = ?`,
            [status, trimmedNotes, cancellationReasonToSave, cancelledByValue, id]
        );

        // Create patient notification based on status change
        try {
            const appointmentDate = new Date(appointment.appointment_date);
            const formattedDate = appointmentDate.toLocaleDateString('id-ID', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric'
            });

            // Calculate slot time
            const startTime = appointment.start_time ? appointment.start_time.substring(0, 5) : '09:00';
            const [hours, mins] = startTime.split(':').map(Number);
            const totalMinutes = (hours * 60 + mins) + (appointment.slot_number - 1) * 15;
            const slotHour = Math.floor(totalMinutes / 60);
            const slotMinute = totalMinutes % 60;
            const slotTime = `${String(slotHour).padStart(2, '0')}:${String(slotMinute).padStart(2, '0')}`;

            const statusMessages = {
                'confirmed': {
                    title: 'Janji Temu Dikonfirmasi',
                    message: `Janji temu Anda pada ${formattedDate} pukul ${slotTime} telah dikonfirmasi. Sampai jumpa di klinik!`,
                    icon: 'fa fa-check-circle',
                    icon_color: 'text-success'
                },
                'cancelled': {
                    title: 'Janji Temu Dibatalkan',
                    message: `Janji temu Anda pada ${formattedDate} pukul ${slotTime} telah dibatalkan.${cancellationReasonToSave ? ' Alasan: ' + cancellationReasonToSave : ''}`,
                    icon: 'fa fa-times-circle',
                    icon_color: 'text-danger'
                },
                'completed': {
                    title: 'Kunjungan Selesai',
                    message: `Terima kasih telah berkunjung pada ${formattedDate}. Semoga lekas sembuh!`,
                    icon: 'fa fa-heart',
                    icon_color: 'text-info'
                },
                'no_show': {
                    title: 'Tidak Hadir',
                    message: `Anda tidak hadir pada janji temu ${formattedDate} pukul ${slotTime}. Silakan booking ulang jika masih membutuhkan konsultasi.`,
                    icon: 'fa fa-user-times',
                    icon_color: 'text-warning'
                }
            };

            if (statusMessages[status] && appointment.patient_id) {
                await createPatientNotification({
                    patient_id: appointment.patient_id,
                    type: 'appointment',
                    ...statusMessages[status]
                });
            }
        } catch (notifError) {
            console.error('Failed to create patient notification:', notifError);
        }

        // Broadcast status update to all staff
        realtimeSync.broadcastBookingUpdate({
            id: id,
            patient_name: appointment.patient_name,
            appointment_date: appointment.appointment_date,
            session: appointment.session,
            status: status
        });

        res.json({ message: 'Status berhasil diupdate' });

    } catch (error) {
        console.error('Error updating appointment status:', error);
        res.status(500).json({ message: 'Terjadi kesalahan' });
    }
});

module.exports = router;

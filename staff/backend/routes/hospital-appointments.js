/**
 * Hospital Appointments Routes
 * Handles booking for hospital practices (non-Sunday clinics)
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const { getGMT7Date } = require('../utils/idGenerator');

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

// Hospital info for display
const hospitalInfo = {
    'klinik_private': {
        name: 'Klinik Privat',
        shortName: 'Privat',
        icon: 'clinic-medical',
        color: '#007bff',
        address: 'Klinik Privat'
    },
    'rsia_melinda': {
        name: 'RSIA Melinda',
        shortName: 'Melinda',
        icon: 'hospital-o',
        color: '#e91e63',
        address: 'Jl. Raya Melinda No. 1'
    },
    'rsud_gambiran': {
        name: 'RSUD Gambiran',
        shortName: 'Gambiran',
        icon: 'hospital-o',
        color: '#2196f3',
        address: 'Jl. Gambiran No. 1'
    },
    'rs_bhayangkara': {
        name: 'RS Bhayangkara',
        shortName: 'Bhayangkara',
        icon: 'hospital-o',
        color: '#2196f3',
        address: 'Jl. Bhayangkara No. 1'
    }
};

// Day names in Indonesian
const dayNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

/**
 * Check if we should show hospital booking
 * Returns true if current time is after Sunday 21:00 and before next Sunday 21:00
 */
function shouldShowHospitalBooking() {
    const now = getGMT7Date();
    const dayOfWeek = now.getDay(); // 0 = Sunday
    const hour = now.getHours();

    // After Sunday 21:00 until next Sunday 21:00
    // Sunday after 21:00 -> show
    // Mon-Sat any time -> show
    // Sunday before 21:00 -> don't show (use regular Sunday booking)
    if (dayOfWeek === 0) {
        return hour >= 21;
    }
    return true; // Mon-Sat always show
}

/**
 * GET /api/hospital-appointments/schedules
 * Get available hospital schedules for the week
 */
router.get('/schedules', verifyToken, async (req, res) => {
    try {
        // Check if hospital booking should be shown
        if (!shouldShowHospitalBooking()) {
            return res.json({
                showHospitalBooking: false,
                message: 'Booking rumah sakit tersedia setelah Minggu pukul 21:00'
            });
        }

        // Get hospital schedules from practice_schedules (include inactive for display)
        const [schedules] = await db.query(`
            SELECT location, day_of_week, start_time, end_time, is_active
            FROM practice_schedules
            WHERE location != 'sunday_clinic'
            ORDER BY day_of_week ASC, start_time ASC
        `);

        // Get current date info
        const now = getGMT7Date();
        const currentDayOfWeek = now.getDay();
        const currentHour = now.getHours();

        // Calculate dates for each day from tomorrow to next Sunday
        const availableDates = [];
        const seenDates = new Set();

        // Helper to format date as YYYY-MM-DD in local time
        const formatDateLocal = (d) => {
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        };

        // Start from tomorrow
        let checkDate = new Date(now);
        checkDate.setDate(checkDate.getDate() + 1);
        checkDate.setHours(0, 0, 0, 0);

        // Generate dates for next 7 days (up to next Sunday)
        for (let i = 0; i < 7; i++) {
            const dateStr = formatDateLocal(checkDate);
            const dayOfWeek = checkDate.getDay();

            // Stop after next Sunday
            if (dayOfWeek === 0 && i > 0) {
                // Include Sunday but stop after
                const matchingSchedules = schedules.filter(s => s.day_of_week === dayOfWeek);
                if (matchingSchedules.length > 0 && !seenDates.has(dateStr)) {
                    seenDates.add(dateStr);
                    for (const schedule of matchingSchedules) {
                        const hospital = hospitalInfo[schedule.location] || {
                            name: schedule.location,
                            shortName: schedule.location,
                            icon: 'hospital-o',
                            color: '#607d8b'
                        };

                        availableDates.push({
                            date: dateStr,
                            dayOfWeek,
                            dayName: dayNames[dayOfWeek],
                            location: schedule.location,
                            hospitalName: hospital.name,
                            hospitalShortName: hospital.shortName,
                            hospitalIcon: hospital.icon,
                            hospitalColor: hospital.color,
                            startTime: schedule.start_time.substring(0, 5),
                            endTime: schedule.end_time.substring(0, 5),
                            formatted: `${dayNames[dayOfWeek]}, ${checkDate.getDate()} ${checkDate.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}`,
                            isActive: schedule.is_active === 1
                        });
                    }
                }
                break;
            }

            // Find schedules for this day
            const matchingSchedules = schedules.filter(s => s.day_of_week === dayOfWeek);
            if (matchingSchedules.length > 0 && !seenDates.has(dateStr)) {
                seenDates.add(dateStr);
                for (const schedule of matchingSchedules) {
                    const hospital = hospitalInfo[schedule.location] || {
                        name: schedule.location,
                        shortName: schedule.location,
                        icon: 'hospital-o',
                        color: '#607d8b'
                    };

                    availableDates.push({
                        date: dateStr,
                        dayOfWeek,
                        dayName: dayNames[dayOfWeek],
                        location: schedule.location,
                        hospitalName: hospital.name,
                        hospitalShortName: hospital.shortName,
                        hospitalIcon: hospital.icon,
                        hospitalColor: hospital.color,
                        startTime: schedule.start_time.substring(0, 5),
                        endTime: schedule.end_time.substring(0, 5),
                        formatted: `${dayNames[dayOfWeek]}, ${checkDate.getDate()} ${checkDate.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}`,
                        isActive: schedule.is_active === 1
                    });
                }
            }

            checkDate.setDate(checkDate.getDate() + 1);
        }

        // Sort by date then by day of week order
        availableDates.sort((a, b) => {
            const dateCompare = a.date.localeCompare(b.date);
            if (dateCompare !== 0) return dateCompare;
            return a.dayOfWeek - b.dayOfWeek;
        });

        res.json({
            showHospitalBooking: true,
            schedules: availableDates,
            hospitalInfo
        });

    } catch (error) {
        console.error('Error getting hospital schedules:', error);
        res.status(500).json({ message: 'Gagal memuat jadwal rumah sakit' });
    }
});

/**
 * POST /api/hospital-appointments/book
 * Book a hospital appointment (auto-confirmed)
 */
router.post('/book', verifyToken, async (req, res) => {
    try {
        const { date, location, complaint, consultation_category } = req.body;
        const patientId = req.user.id;

        if (!date || !location) {
            return res.status(400).json({ message: 'Tanggal dan lokasi wajib diisi' });
        }

        // Get patient info
        const [patients] = await db.query(
            'SELECT id, full_name, phone, whatsapp FROM patients WHERE id = ?',
            [patientId]
        );

        if (patients.length === 0) {
            return res.status(404).json({ message: 'Pasien tidak ditemukan' });
        }

        const patient = patients[0];
        const patientName = patient.full_name || 'Unknown';

        // Get schedule info for the location and day
        const bookingDate = new Date(date);
        const dayOfWeek = bookingDate.getDay();

        const [schedules] = await db.query(`
            SELECT start_time, end_time
            FROM practice_schedules
            WHERE location = ? AND day_of_week = ? AND is_active = 1
        `, [location, dayOfWeek]);

        if (schedules.length === 0) {
            return res.status(400).json({ message: 'Jadwal tidak ditemukan untuk tanggal tersebut' });
        }

        const schedule = schedules[0];
        const appointmentTime = schedule.start_time;

        // Check for existing booking on same date and location
        const [existing] = await db.query(`
            SELECT id FROM appointments
            WHERE patient_id = ? AND appointment_date = ? AND hospital_location = ? AND status != 'cancelled'
        `, [patientId, date, location]);

        if (existing.length > 0) {
            return res.status(409).json({ message: 'Anda sudah memiliki booking di rumah sakit ini pada tanggal tersebut' });
        }

        // Create appointment with status 'booked' (auto-confirmed)
        const [result] = await db.query(`
            INSERT INTO appointments (
                patient_id, patient_name, hospital_location, appointment_date, appointment_time,
                appointment_type, location, notes, complaint, detected_category, status, created_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', ?)
        `, [
            patientId,
            patientName,
            location,
            date,
            appointmentTime,
            consultation_category === 'obstetri' ? 'USG' : 'Konsultasi',
            hospitalInfo[location]?.name || location,
            complaint || null,
            complaint || null,
            consultation_category || 'obstetri',
            patientId
        ]);

        const hospital = hospitalInfo[location] || { name: location };
        const formattedDate = bookingDate.toLocaleDateString('id-ID', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });

        res.json({
            success: true,
            message: 'Booking berhasil! Status sudah terkonfirmasi.',
            details: {
                id: result.insertId,
                hospital: hospital.name,
                date: formattedDate,
                time: `${schedule.start_time.substring(0, 5)} - ${schedule.end_time.substring(0, 5)}`,
                status: 'confirmed'
            }
        });

    } catch (error) {
        console.error('Error booking hospital appointment:', error);
        res.status(500).json({ message: 'Gagal membuat booking' });
    }
});

/**
 * GET /api/hospital-appointments/patient
 * Get patient's hospital appointments
 */
router.get('/patient', verifyToken, async (req, res) => {
    try {
        const patientId = req.user.id;

        const [appointments] = await db.query(`
            SELECT
                id, patient_name, hospital_location, appointment_date, appointment_time,
                appointment_type, location, notes, complaint, status, created_at
            FROM appointments
            WHERE patient_id = ? AND hospital_location IS NOT NULL
            ORDER BY appointment_date DESC, appointment_time DESC
        `, [patientId]);

        // Format appointments
        const formatted = appointments.map(apt => {
            const date = new Date(apt.appointment_date);
            const hospital = hospitalInfo[apt.hospital_location] || { name: apt.hospital_location };

            return {
                ...apt,
                hospitalName: hospital.name,
                hospitalColor: hospital.color,
                dateFormatted: date.toLocaleDateString('id-ID', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric'
                }),
                time: apt.appointment_time ? apt.appointment_time.substring(0, 5) : '-',
                isPast: date < new Date()
            };
        });

        res.json({
            appointments: formatted
        });

    } catch (error) {
        console.error('Error getting patient hospital appointments:', error);
        res.status(500).json({ message: 'Gagal memuat jadwal booking' });
    }
});

module.exports = router;

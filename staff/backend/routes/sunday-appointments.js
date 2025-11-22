const express = require('express');
const router = express.Router();
const db = require('../db');
const { createSundayClinicRecord } = require('../services/sundayClinicService');
const { getGMT7Date, getGMT7Timestamp } = require('../utils/idGenerator');

// Middleware to verify JWT token
const verifyToken = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
        return res.status(401).json({ message: 'Token tidak ditemukan' });
    }

    try {
        const jwt = require('jsonwebtoken');
        const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ message: 'Token tidak valid' });
    }
};

// Helper function to get next Sundays
function getNextSundays(count = 8) {
    const sundays = [];
    // Use GMT+7 (Jakarta/Indonesian time)
    const today = getGMT7Date();
    const year = today.getUTCFullYear();
    const month = today.getUTCMonth();
    const day = today.getUTCDate();

    // Create date at midnight GMT+7
    let current = new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
    current.setUTCDate(current.getUTCDate() + 1); // Start from tomorrow

    while (sundays.length < count) {
        if (current.getUTCDay() === 0) { // Sunday
            sundays.push(new Date(current));
        }
        current.setUTCDate(current.getUTCDate() + 1);
    }

    return sundays;
}

// Helper function to get session time label
function getSessionLabel(session) {
    const labels = {
        1: '09:00 - 11:30 (Pagi)',
        2: '12:00 - 14:30 (Siang)',
        3: '15:00 - 17:30 (Sore)'
    };
    return labels[session] || 'Unknown';
}

// Helper function to calculate slot time
function getSlotTime(session, slotNumber) {
    const startHours = { 1: 9, 2: 12, 3: 15 };
    const startHour = startHours[session];
    const minutes = (slotNumber - 1) * 15;
    const hour = startHour + Math.floor(minutes / 60);
    const minute = minutes % 60;
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
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
        
        console.log('Available slots request:', { date, dayOfWeek, dateObj: appointmentDate });
        
        // Check if it's a Sunday (0 = Sunday)
        if (dayOfWeek !== 0) {
            return res.status(400).json({ 
                message: 'Janji temu hanya tersedia di hari Minggu',
                debug: { date, dayOfWeek, dateObj: appointmentDate.toISOString() }
            });
        }
        
        // Get booked slots for this date
        const [bookedSlots] = await db.query(
            `SELECT session, slot_number FROM sunday_appointments 
             WHERE appointment_date = ? AND status NOT IN ('cancelled', 'no_show')`,
            [date]
        );
        
        // Build available slots structure
        const sessions = [
            { session: 1, label: '09:00 - 11:30 (Pagi)', slots: [] },
            { session: 2, label: '12:00 - 14:30 (Siang)', slots: [] },
            { session: 3, label: '15:00 - 17:30 (Sore)', slots: [] }
        ];
        
        sessions.forEach(sessionObj => {
            for (let slot = 1; slot <= 10; slot++) {
                const isBooked = bookedSlots.some(
                    b => b.session === sessionObj.session && b.slot_number === slot
                );
                sessionObj.slots.push({
                    number: slot,
                    time: getSlotTime(sessionObj.session, slot),
                    available: !isBooked
                });
            }
        });
        
        res.json({
            date,
            dayOfWeek: 'Minggu',
            sessions
        });
        
    } catch (error) {
        console.error('Error getting available slots:', error);
        res.status(500).json({ message: 'Terjadi kesalahan saat mengambil data slot' });
    }
});

/**
 * GET /api/sunday-appointments/sundays
 * Get list of next available Sundays
 */
router.get('/sundays', verifyToken, async (req, res) => {
    try {
        const sundays = getNextSundays(8);
        const formattedSundays = sundays.map(date => ({
            date: date.toISOString().split('T')[0],
            formatted: date.toLocaleDateString('id-ID', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric',
                timeZone: 'UTC'
            }),
            dayOfWeek: date.getUTCDay() // Should be 0 for Sunday
        }));
        
        console.log('Sundays generated:', formattedSundays);
        res.json({ sundays: formattedSundays });
    } catch (error) {
        console.error('Error getting sundays:', error);
        res.status(500).json({ message: 'Terjadi kesalahan' });
    }
});

/**
 * POST /api/sunday-appointments/book
 * Book an appointment
 */
router.post('/book', verifyToken, async (req, res) => {
    try {
        const { appointment_date, session, slot_number, chief_complaint } = req.body;
        
        // Validation
        if (!appointment_date || !session || !slot_number || !chief_complaint) {
            return res.status(400).json({ message: 'Semua field harus diisi' });
        }
        
        if (![1, 2, 3].includes(parseInt(session))) {
            return res.status(400).json({ message: 'Sesi tidak valid (harus 1, 2, atau 3)' });
        }
        
        if (slot_number < 1 || slot_number > 10) {
            return res.status(400).json({ message: 'Nomor slot harus antara 1-10' });
        }
        
        const appointmentDate = new Date(appointment_date);
        if (appointmentDate.getDay() !== 0) {
            return res.status(400).json({ message: 'Janji temu hanya tersedia di hari Minggu' });
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
        
        // Check if patient already has any upcoming Sunday appointment
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
                message: `Anda sudah memiliki janji temu di Klinik Privat Minggu pada ${existingDate.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} sesi ${getSessionLabel(existingAppt.session)}. Anda hanya dapat membooking 1 slot. Silakan batalkan janji temu yang ada jika ingin mengubah jadwal.` 
            });
        }
        
        // Create appointment
        const [result] = await db.query(
            `INSERT INTO sunday_appointments 
             (patient_id, patient_name, patient_phone, appointment_date, session, slot_number, chief_complaint, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
            [patient.id, patient.full_name, patient.phone, appointment_date, session, slot_number, chief_complaint]
        );
        
        res.status(201).json({
            message: 'Janji temu berhasil dibuat',
            appointmentId: result.insertId,
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
 * GET /api/sunday-appointments/patient
 * Get patient's appointments
 */
router.get('/patient', verifyToken, async (req, res) => {
    try {
        const [appointments] = await db.query(
            `SELECT id, appointment_date, session, slot_number, chief_complaint, status, notes,
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
                isPast
            };
        });

        res.json({ appointments: formatted });

    } catch (error) {
        console.error('Error getting patient appointments:', error);
        res.status(500).json({ message: 'Terjadi kesalahan' });
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
        
        res.json({ message: 'Janji temu berhasil dibatalkan', reason: cancellationReason });
        
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

        const [appointments] = await db.query(
            `SELECT a.*, p.id AS patient_db_id, p.full_name
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

        const { record, created } = await createSundayClinicRecord({
            appointmentId: appointment.id,
            patientId: appointment.patient_db_id,
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
                time: getSlotTime(apt.session, apt.slot_number)
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
        
        const validStatuses = ['pending', 'confirmed', 'completed', 'cancelled', 'no_show'];
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
        
        res.json({ message: 'Status berhasil diupdate' });
        
    } catch (error) {
        console.error('Error updating appointment status:', error);
        res.status(500).json({ message: 'Terjadi kesalahan' });
    }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const db = require('../db');

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
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Start from today or next day
    let current = new Date(today);
    current.setDate(current.getDate() + 1);
    
    while (sundays.length < count) {
        if (current.getDay() === 0) { // Sunday
            sundays.push(new Date(current));
        }
        current.setDate(current.getDate() + 1);
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
        
        const appointmentDate = new Date(date);
        
        // Check if it's a Sunday
        if (appointmentDate.getDay() !== 0) {
            return res.status(400).json({ message: 'Janji temu hanya tersedia di hari Minggu' });
        }
        
        // Get booked slots for this date
        const [bookedSlots] = await db.query(
            `SELECT session, slot_number FROM appointments 
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
                day: 'numeric' 
            })
        }));
        
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
            `SELECT id FROM appointments 
             WHERE appointment_date = ? AND session = ? AND slot_number = ? 
             AND status NOT IN ('cancelled', 'no_show')`,
            [appointment_date, session, slot_number]
        );
        
        if (existingBooking.length > 0) {
            return res.status(409).json({ message: 'Slot ini sudah dibooking oleh pasien lain' });
        }
        
        // Check if patient already has appointment on this date
        const [patientExisting] = await db.query(
            `SELECT id FROM appointments 
             WHERE patient_id = ? AND appointment_date = ? 
             AND status NOT IN ('cancelled', 'no_show')`,
            [req.user.id, appointment_date]
        );
        
        if (patientExisting.length > 0) {
            return res.status(409).json({ 
                message: 'Anda sudah memiliki janji temu di tanggal ini. Silakan pilih tanggal lain atau batalkan janji temu yang ada.' 
            });
        }
        
        // Create appointment
        const [result] = await db.query(
            `INSERT INTO appointments 
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
            `SELECT id, appointment_date, session, slot_number, chief_complaint, status, notes, created_at
             FROM appointments
             WHERE patient_id = ?
             ORDER BY appointment_date DESC, session ASC, slot_number ASC`,
            [req.user.id]
        );
        
        const formatted = appointments.map(apt => ({
            ...apt,
            dateFormatted: new Date(apt.appointment_date).toLocaleDateString('id-ID', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
            }),
            sessionLabel: getSessionLabel(apt.session),
            time: getSlotTime(apt.session, apt.slot_number),
            isPast: new Date(apt.appointment_date) < new Date()
        }));
        
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
        
        // Check if appointment exists and belongs to patient
        const [appointments] = await db.query(
            'SELECT * FROM appointments WHERE id = ? AND patient_id = ?',
            [id, req.user.id]
        );
        
        if (appointments.length === 0) {
            return res.status(404).json({ message: 'Janji temu tidak ditemukan' });
        }
        
        const appointment = appointments[0];
        
        if (appointment.status === 'cancelled') {
            return res.status(400).json({ message: 'Janji temu sudah dibatalkan' });
        }
        
        if (appointment.status === 'completed') {
            return res.status(400).json({ message: 'Janji temu yang sudah selesai tidak dapat dibatalkan' });
        }
        
        // Update status to cancelled
        await db.query(
            'UPDATE appointments SET status = "cancelled", updated_at = NOW() WHERE id = ?',
            [id]
        );
        
        res.json({ message: 'Janji temu berhasil dibatalkan' });
        
    } catch (error) {
        console.error('Error cancelling appointment:', error);
        res.status(500).json({ message: 'Terjadi kesalahan' });
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
            SELECT a.*, p.full_name, p.phone, p.email
            FROM appointments a
            LEFT JOIN patients p ON a.patient_id = p.id
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
        
        const formatted = appointments.map(apt => ({
            ...apt,
            dateFormatted: new Date(apt.appointment_date).toLocaleDateString('id-ID', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
            }),
            sessionLabel: getSessionLabel(apt.session),
            time: getSlotTime(apt.session, apt.slot_number)
        }));
        
        res.json({ appointments: formatted });
        
    } catch (error) {
        console.error('Error getting appointments list:', error);
        res.status(500).json({ message: 'Terjadi kesalahan' });
    }
});

/**
 * PUT /api/sunday-appointments/:id/status (STAFF ONLY)
 * Update appointment status
 */
router.put('/:id/status', verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { status, notes } = req.body;
        
        const validStatuses = ['pending', 'confirmed', 'completed', 'cancelled', 'no_show'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ message: 'Status tidak valid' });
        }
        
        await db.query(
            'UPDATE appointments SET status = ?, notes = ?, updated_at = NOW() WHERE id = ?',
            [status, notes || null, id]
        );
        
        res.json({ message: 'Status berhasil diupdate' });
        
    } catch (error) {
        console.error('Error updating appointment status:', error);
        res.status(500).json({ message: 'Terjadi kesalahan' });
    }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const db = require('../db');
const { verifyToken, requirePermission, requireSuperadmin } = require('../middleware/auth');

/**
 * GET /api/booking-settings
 * Get all booking session settings
 */
router.get('/', verifyToken, async (req, res) => {
    try {
        const [settings] = await db.query(
            `SELECT id, session_number, session_name, start_time, end_time,
                    slot_duration, max_slots, is_active, created_at, updated_at
             FROM booking_settings
             ORDER BY session_number ASC`
        );

        // Format times for display
        const formatted = settings.map(s => ({
            ...s,
            start_time: s.start_time.substring(0, 5), // HH:MM
            end_time: s.end_time.substring(0, 5),
            label: `${s.start_time.substring(0, 5)} - ${s.end_time.substring(0, 5)} (${s.session_name})`
        }));

        res.json({ success: true, settings: formatted });
    } catch (error) {
        console.error('Error fetching booking settings:', error);
        res.status(500).json({ success: false, message: 'Gagal mengambil data pengaturan booking' });
    }
});

/**
 * GET /api/booking-settings/public
 * Get active booking settings for patient-facing booking page (no auth required)
 */
router.get('/public', async (req, res) => {
    try {
        const [settings] = await db.query(
            `SELECT session_number, session_name, start_time, end_time,
                    slot_duration, max_slots
             FROM booking_settings
             WHERE is_active = 1
             ORDER BY session_number ASC`
        );

        // Format for booking page consumption
        const sessions = settings.map(s => ({
            session: s.session_number,
            name: s.session_name,
            startTime: s.start_time.substring(0, 5),
            endTime: s.end_time.substring(0, 5),
            label: `${s.start_time.substring(0, 5)} - ${s.end_time.substring(0, 5)} (${s.session_name})`,
            slotDuration: s.slot_duration,
            maxSlots: s.max_slots
        }));

        res.json({ success: true, sessions });
    } catch (error) {
        console.error('Error fetching public booking settings:', error);
        res.status(500).json({ success: false, message: 'Gagal mengambil data sesi' });
    }
});

/**
 * PUT /api/booking-settings/:id
 * Update a booking session setting
 */
router.put('/:id', verifyToken, requireSuperadmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { session_name, start_time, end_time, slot_duration, max_slots, is_active } = req.body;

        // Validate required fields
        if (!session_name || !start_time || !end_time) {
            return res.status(400).json({ success: false, message: 'Nama sesi, waktu mulai, dan waktu selesai harus diisi' });
        }

        // Validate time format (HH:MM)
        const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
        if (!timeRegex.test(start_time) || !timeRegex.test(end_time)) {
            return res.status(400).json({ success: false, message: 'Format waktu tidak valid (gunakan HH:MM)' });
        }

        // Validate slot_duration and max_slots
        const duration = parseInt(slot_duration) || 15;
        const slots = parseInt(max_slots) || 10;

        if (duration < 5 || duration > 60) {
            return res.status(400).json({ success: false, message: 'Durasi slot harus antara 5-60 menit' });
        }

        if (slots < 1 || slots > 30) {
            return res.status(400).json({ success: false, message: 'Jumlah slot harus antara 1-30' });
        }

        // Update the setting
        await db.query(
            `UPDATE booking_settings
             SET session_name = ?, start_time = ?, end_time = ?,
                 slot_duration = ?, max_slots = ?, is_active = ?,
                 updated_at = NOW()
             WHERE id = ?`,
            [session_name, start_time + ':00', end_time + ':00', duration, slots, is_active ? 1 : 0, id]
        );

        res.json({ success: true, message: 'Pengaturan sesi berhasil diupdate' });
    } catch (error) {
        console.error('Error updating booking setting:', error);
        res.status(500).json({ success: false, message: 'Gagal mengupdate pengaturan' });
    }
});

/**
 * POST /api/booking-settings
 * Create a new booking session
 */
router.post('/', verifyToken, requireSuperadmin, async (req, res) => {
    try {
        const { session_number, session_name, start_time, end_time, slot_duration, max_slots, is_active } = req.body;

        // Validate required fields
        if (!session_number || !session_name || !start_time || !end_time) {
            return res.status(400).json({ success: false, message: 'Semua field harus diisi' });
        }

        // Check if session_number already exists
        const [existing] = await db.query('SELECT id FROM booking_settings WHERE session_number = ?', [session_number]);
        if (existing.length > 0) {
            return res.status(400).json({ success: false, message: 'Nomor sesi sudah ada' });
        }

        const duration = parseInt(slot_duration) || 15;
        const slots = parseInt(max_slots) || 10;

        await db.query(
            `INSERT INTO booking_settings (session_number, session_name, start_time, end_time, slot_duration, max_slots, is_active)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [session_number, session_name, start_time + ':00', end_time + ':00', duration, slots, is_active ? 1 : 0]
        );

        res.status(201).json({ success: true, message: 'Sesi baru berhasil ditambahkan' });
    } catch (error) {
        console.error('Error creating booking setting:', error);
        res.status(500).json({ success: false, message: 'Gagal membuat sesi baru' });
    }
});

/**
 * DELETE /api/booking-settings/:id
 * Delete a booking session
 */
router.delete('/:id', verifyToken, requireSuperadmin, async (req, res) => {
    try {
        const { id } = req.params;

        // Check if there are existing appointments using this session
        const [session] = await db.query('SELECT session_number FROM booking_settings WHERE id = ?', [id]);
        if (session.length === 0) {
            return res.status(404).json({ success: false, message: 'Sesi tidak ditemukan' });
        }

        const [appointments] = await db.query(
            `SELECT COUNT(*) as count FROM sunday_appointments
             WHERE session = ? AND status NOT IN ('cancelled', 'completed')`,
            [session[0].session_number]
        );

        if (appointments[0].count > 0) {
            return res.status(400).json({
                success: false,
                message: `Tidak dapat menghapus sesi ini karena masih ada ${appointments[0].count} appointment aktif`
            });
        }

        await db.query('DELETE FROM booking_settings WHERE id = ?', [id]);

        res.json({ success: true, message: 'Sesi berhasil dihapus' });
    } catch (error) {
        console.error('Error deleting booking setting:', error);
        res.status(500).json({ success: false, message: 'Gagal menghapus sesi' });
    }
});

/**
 * GET /api/booking-settings/bookings
 * Get all upcoming bookings for management
 */
router.get('/bookings', verifyToken, requireSuperadmin, async (req, res) => {
    try {
        const { date, session, status } = req.query;

        let query = `
            SELECT
                sa.id,
                sa.patient_id,
                sa.patient_name,
                sa.patient_phone,
                sa.appointment_date,
                sa.session,
                sa.slot_number,
                sa.chief_complaint,
                sa.consultation_category,
                sa.status,
                sa.created_at,
                bs.session_name,
                bs.start_time,
                bs.end_time
            FROM sunday_appointments sa
            LEFT JOIN booking_settings bs ON sa.session = bs.session_number
            WHERE sa.appointment_date >= CURDATE()
        `;

        const params = [];

        if (date) {
            query += ' AND sa.appointment_date = ?';
            params.push(date);
        }

        if (session) {
            query += ' AND sa.session = ?';
            params.push(session);
        }

        if (status && status !== 'all') {
            query += ' AND sa.status = ?';
            params.push(status);
        }

        query += ' ORDER BY sa.appointment_date ASC, sa.session ASC, sa.slot_number ASC';

        const [bookings] = await db.query(query, params);

        // Calculate slot times
        const enrichedBookings = bookings.map(b => {
            const startTime = b.start_time ? b.start_time.substring(0, 5) : '09:00';
            const [hours, mins] = startTime.split(':').map(Number);
            const totalMinutes = (hours * 60 + mins) + (b.slot_number - 1) * 15;
            const slotHour = Math.floor(totalMinutes / 60);
            const slotMinute = totalMinutes % 60;
            const slotTime = `${String(slotHour).padStart(2, '0')}:${String(slotMinute).padStart(2, '0')}`;

            return {
                ...b,
                slot_time: slotTime,
                session_label: b.session_name ? `${startTime} - ${b.end_time?.substring(0, 5)} (${b.session_name})` : `Sesi ${b.session}`
            };
        });

        res.json({ success: true, bookings: enrichedBookings });
    } catch (error) {
        console.error('Error fetching bookings:', error);
        res.status(500).json({ success: false, message: 'Gagal mengambil data booking' });
    }
});

/**
 * POST /api/booking-settings/force-cancel/:id
 * Force cancel a booking with notification to patient
 */
router.post('/force-cancel/:id', verifyToken, requireSuperadmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { reason, notify_patient } = req.body;

        if (!reason) {
            return res.status(400).json({ success: false, message: 'Alasan pembatalan harus diisi' });
        }

        // Get booking details first
        const [bookings] = await db.query(
            `SELECT sa.*, p.email as patient_email, bs.session_name, bs.start_time
             FROM sunday_appointments sa
             LEFT JOIN patients p ON sa.patient_id = p.id
             LEFT JOIN booking_settings bs ON sa.session = bs.session_number
             WHERE sa.id = ?`,
            [id]
        );

        if (bookings.length === 0) {
            return res.status(404).json({ success: false, message: 'Booking tidak ditemukan' });
        }

        const booking = bookings[0];

        if (booking.status === 'cancelled') {
            return res.status(400).json({ success: false, message: 'Booking sudah dibatalkan sebelumnya' });
        }

        // Calculate slot time
        const startTime = booking.start_time ? booking.start_time.substring(0, 5) : '09:00';
        const [hours, mins] = startTime.split(':').map(Number);
        const totalMinutes = (hours * 60 + mins) + (booking.slot_number - 1) * 15;
        const slotHour = Math.floor(totalMinutes / 60);
        const slotMinute = totalMinutes % 60;
        const slotTime = `${String(slotHour).padStart(2, '0')}:${String(slotMinute).padStart(2, '0')}`;

        // Update booking status
        await db.query(
            `UPDATE sunday_appointments
             SET status = 'cancelled',
                 cancelled_by = 'staff',
                 cancellation_reason = ?,
                 cancelled_at = NOW()
             WHERE id = ?`,
            [reason, id]
        );

        // Format date for notification
        const appointmentDate = new Date(booking.appointment_date);
        const formattedDate = appointmentDate.toLocaleDateString('id-ID', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });

        let notificationSent = false;

        // Send notification to patient if requested
        if (notify_patient && booking.patient_phone) {
            try {
                // Send WhatsApp notification
                const message = `*PEMBATALAN JANJI TEMU*\n\nYth. ${booking.patient_name},\n\nDengan ini kami informasikan bahwa janji temu Anda telah dibatalkan oleh pihak klinik:\n\n📅 Tanggal: ${formattedDate}\n⏰ Waktu: ${slotTime}\n📍 Sesi: ${booking.session_name || 'Sesi ' + booking.session}\n\n📝 Alasan: ${reason}\n\nMohon maaf atas ketidaknyamanan ini. Silakan melakukan booking ulang melalui website kami.\n\nTerima kasih,\nKlinik dr. Dibya`;

                // Try to send via WhatsApp API (if configured)
                const waResponse = await fetch(`${process.env.WA_API_URL || 'http://localhost:3001'}/send-message`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        phone: booking.patient_phone,
                        message: message
                    })
                });

                if (waResponse.ok) {
                    notificationSent = true;
                }
            } catch (waError) {
                console.error('Failed to send WhatsApp notification:', waError);
            }

            // Also try email if available
            if (booking.patient_email) {
                try {
                    const emailService = require('../services/emailService');
                    await emailService.sendEmail({
                        to: booking.patient_email,
                        subject: 'Pembatalan Janji Temu - Klinik dr. Dibya',
                        html: `
                            <h2>Pembatalan Janji Temu</h2>
                            <p>Yth. ${booking.patient_name},</p>
                            <p>Dengan ini kami informasikan bahwa janji temu Anda telah dibatalkan oleh pihak klinik:</p>
                            <ul>
                                <li><strong>Tanggal:</strong> ${formattedDate}</li>
                                <li><strong>Waktu:</strong> ${slotTime}</li>
                                <li><strong>Sesi:</strong> ${booking.session_name || 'Sesi ' + booking.session}</li>
                            </ul>
                            <p><strong>Alasan pembatalan:</strong> ${reason}</p>
                            <p>Mohon maaf atas ketidaknyamanan ini. Silakan melakukan booking ulang melalui website kami.</p>
                            <p>Terima kasih,<br>Klinik dr. Dibya</p>
                        `
                    });
                    notificationSent = true;
                } catch (emailError) {
                    console.error('Failed to send email notification:', emailError);
                }
            }
        }

        res.json({
            success: true,
            message: `Booking berhasil dibatalkan${notificationSent ? ' dan notifikasi telah dikirim ke pasien' : ''}`,
            notification_sent: notificationSent
        });
    } catch (error) {
        console.error('Error force cancelling booking:', error);
        res.status(500).json({ success: false, message: 'Gagal membatalkan booking' });
    }
});

module.exports = router;

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

module.exports = router;

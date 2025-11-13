const express = require('express');
const router = express.Router();
const db = require('../db');

// Optional middleware for auth (public can view, staff can edit)
const optionalAuth = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (token) {
        try {
            const jwt = require('jsonwebtoken');
            const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
            const decoded = jwt.verify(token, JWT_SECRET);
            req.user = decoded;
        } catch (error) {
            // Token invalid, continue as public
        }
    }
    next();
};

// Middleware to verify JWT token for staff only
const verifyStaffToken = (req, res, next) => {
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

/**
 * GET /api/practice-schedules
 * Get practice schedules for a location (public access)
 */
router.get('/', optionalAuth, async (req, res) => {
    try {
        const { location } = req.query;
        
        if (!location) {
            return res.status(400).json({ message: 'Parameter location diperlukan' });
        }
        
        const validLocations = ['klinik_privat', 'rsud_gambiran', 'rsia_melinda', 'rs_bhayangkara'];
        if (!validLocations.includes(location)) {
            return res.status(400).json({ message: 'Lokasi tidak valid' });
        }
        
        const [schedules] = await db.query(
            `SELECT * FROM practice_schedules 
             WHERE location = ? AND is_active = 1 
             ORDER BY day_of_week ASC, start_time ASC`,
            [location]
        );
        
        res.json({ schedules });
        
    } catch (error) {
        console.error('Error getting practice schedules:', error);
        res.status(500).json({ message: 'Terjadi kesalahan saat mengambil jadwal' });
    }
});

/**
 * GET /api/practice-schedules/all
 * Get all practice schedules (staff only)
 */
router.get('/all', verifyStaffToken, async (req, res) => {
    try {
        const [schedules] = await db.query(
            `SELECT * FROM practice_schedules 
             ORDER BY location ASC, day_of_week ASC, start_time ASC`
        );
        
        res.json({ schedules });
        
    } catch (error) {
        console.error('Error getting all schedules:', error);
        res.status(500).json({ message: 'Terjadi kesalahan' });
    }
});

/**
 * POST /api/practice-schedules
 * Create new practice schedule (staff only)
 */
router.post('/', verifyStaffToken, async (req, res) => {
    try {
        const { location, day_of_week, start_time, end_time, notes } = req.body;
        
        // Validation
        if (!location || day_of_week === undefined || !start_time || !end_time) {
            return res.status(400).json({ message: 'Semua field wajib diisi' });
        }
        
        const validLocations = ['klinik_privat', 'rsud_gambiran', 'rsia_melinda', 'rs_bhayangkara'];
        if (!validLocations.includes(location)) {
            return res.status(400).json({ message: 'Lokasi tidak valid' });
        }
        
        if (day_of_week < 0 || day_of_week > 6) {
            return res.status(400).json({ message: 'Hari tidak valid (0-6)' });
        }
        
        const [result] = await db.query(
            `INSERT INTO practice_schedules (location, day_of_week, start_time, end_time, notes) 
             VALUES (?, ?, ?, ?, ?)`,
            [location, day_of_week, start_time, end_time, notes || null]
        );
        
        res.status(201).json({ 
            message: 'Jadwal berhasil ditambahkan',
            id: result.insertId 
        });
        
    } catch (error) {
        console.error('Error creating schedule:', error);
        res.status(500).json({ message: 'Terjadi kesalahan saat menambah jadwal' });
    }
});

/**
 * PUT /api/practice-schedules/:id
 * Update practice schedule (staff only)
 */
router.put('/:id', verifyStaffToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { location, day_of_week, start_time, end_time, notes, is_active } = req.body;
        
        const [result] = await db.query(
            `UPDATE practice_schedules 
             SET location = ?, day_of_week = ?, start_time = ?, end_time = ?, 
                 notes = ?, is_active = ?, updated_at = NOW()
             WHERE id = ?`,
            [location, day_of_week, start_time, end_time, notes || null, is_active !== undefined ? is_active : 1, id]
        );
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Jadwal tidak ditemukan' });
        }
        
        res.json({ message: 'Jadwal berhasil diupdate' });
        
    } catch (error) {
        console.error('Error updating schedule:', error);
        res.status(500).json({ message: 'Terjadi kesalahan saat mengupdate jadwal' });
    }
});

/**
 * DELETE /api/practice-schedules/:id
 * Delete practice schedule (staff only)
 */
router.delete('/:id', verifyStaffToken, async (req, res) => {
    try {
        const { id } = req.params;
        
        const [result] = await db.query(
            'DELETE FROM practice_schedules WHERE id = ?',
            [id]
        );
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Jadwal tidak ditemukan' });
        }
        
        res.json({ message: 'Jadwal berhasil dihapus' });
        
    } catch (error) {
        console.error('Error deleting schedule:', error);
        res.status(500).json({ message: 'Terjadi kesalahan saat menghapus jadwal' });
    }
});

module.exports = router;

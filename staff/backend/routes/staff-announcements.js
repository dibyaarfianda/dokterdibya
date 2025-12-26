/**
 * Staff Announcements API
 * Internal announcements for staff only (not shown to patients)
 * Only dokter (superadmin) can create/edit/delete
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const logger = require('../utils/logger');
const { verifyToken, requireSuperadmin } = require('../middleware/auth');

/**
 * GET /api/staff-announcements
 * Get all active staff announcements (for all staff)
 */
router.get('/', verifyToken, async (req, res, next) => {
    try {
        const [announcements] = await db.query(
            `SELECT * FROM staff_announcements
             WHERE status = 'active'
             ORDER BY
                CASE priority
                    WHEN 'urgent' THEN 1
                    WHEN 'important' THEN 2
                    WHEN 'normal' THEN 3
                END,
                created_at DESC
             LIMIT 20`
        );

        res.json({ success: true, data: announcements });
    } catch (error) {
        logger.error('Failed to fetch staff announcements', { error: error.message });
        next(error);
    }
});

/**
 * GET /api/staff-announcements/all
 * Get all staff announcements including inactive (for management)
 */
router.get('/all', verifyToken, requireSuperadmin, async (req, res, next) => {
    try {
        const [announcements] = await db.query(
            `SELECT * FROM staff_announcements
             ORDER BY created_at DESC`
        );

        res.json({ success: true, data: announcements });
    } catch (error) {
        logger.error('Failed to fetch all staff announcements', { error: error.message });
        next(error);
    }
});

/**
 * GET /api/staff-announcements/:id
 * Get single announcement
 */
router.get('/:id', verifyToken, async (req, res, next) => {
    try {
        const [[announcement]] = await db.query(
            'SELECT * FROM staff_announcements WHERE id = ?',
            [req.params.id]
        );

        if (!announcement) {
            return res.status(404).json({ success: false, message: 'Announcement not found' });
        }

        res.json({ success: true, data: announcement });
    } catch (error) {
        logger.error('Failed to fetch staff announcement', { error: error.message });
        next(error);
    }
});

/**
 * POST /api/staff-announcements
 * Create new staff announcement (dokter only)
 */
router.post('/', verifyToken, requireSuperadmin, async (req, res, next) => {
    try {
        const { title, message, priority, status } = req.body;

        if (!title || !message) {
            return res.status(400).json({
                success: false,
                message: 'Title dan message harus diisi'
            });
        }

        const createdBy = req.user?.uid || req.user?.id || req.user?.email || 'unknown';
        const createdByName = req.user?.name || req.user?.displayName || 'dr. Dibya';

        const [result] = await db.query(
            `INSERT INTO staff_announcements (title, message, priority, status, created_by, created_by_name)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [title, message, priority || 'normal', status || 'active', createdBy, createdByName]
        );

        const [[newAnnouncement]] = await db.query(
            'SELECT * FROM staff_announcements WHERE id = ?',
            [result.insertId]
        );

        // Emit Socket.IO event for real-time update
        if (newAnnouncement.status === 'active' && req.app.get('io')) {
            req.app.get('io').emit('staff-announcement:new', newAnnouncement);
            logger.info('Emitted staff-announcement:new', { id: newAnnouncement.id });
        }

        logger.info('Staff announcement created', { id: newAnnouncement.id, title });

        res.json({
            success: true,
            message: 'Pengumuman berhasil dibuat',
            data: newAnnouncement
        });
    } catch (error) {
        logger.error('Failed to create staff announcement', { error: error.message });
        next(error);
    }
});

/**
 * PUT /api/staff-announcements/:id
 * Update staff announcement (dokter only)
 */
router.put('/:id', verifyToken, requireSuperadmin, async (req, res, next) => {
    try {
        const { title, message, priority, status } = req.body;
        const { id } = req.params;

        const [result] = await db.query(
            `UPDATE staff_announcements
             SET title = ?, message = ?, priority = ?, status = ?
             WHERE id = ?`,
            [title, message, priority, status, id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Announcement not found' });
        }

        const [[updated]] = await db.query(
            'SELECT * FROM staff_announcements WHERE id = ?',
            [id]
        );

        // Emit Socket.IO event
        if (req.app.get('io')) {
            req.app.get('io').emit('staff-announcement:updated', updated);
        }

        logger.info('Staff announcement updated', { id, title });

        res.json({
            success: true,
            message: 'Pengumuman berhasil diperbarui',
            data: updated
        });
    } catch (error) {
        logger.error('Failed to update staff announcement', { error: error.message });
        next(error);
    }
});

/**
 * POST /api/staff-announcements/:id/read
 * Mark announcement as read by current user
 */
router.post('/:id/read', verifyToken, async (req, res, next) => {
    try {
        const { id } = req.params;
        const userId = req.user?.id || req.user?.uid || req.user?.new_id;

        if (!userId) {
            return res.status(401).json({ success: false, message: 'User ID not found' });
        }

        // Insert or ignore if already read
        await db.query(
            `INSERT IGNORE INTO staff_announcement_reads (announcement_id, user_id)
             VALUES (?, ?)`,
            [id, userId]
        );

        logger.info('Staff announcement marked as read', { announcementId: id, userId });

        res.json({ success: true, message: 'Marked as read' });
    } catch (error) {
        logger.error('Failed to mark announcement as read', { error: error.message });
        next(error);
    }
});

/**
 * DELETE /api/staff-announcements/:id
 * Delete staff announcement (dokter only)
 */
router.delete('/:id', verifyToken, requireSuperadmin, async (req, res, next) => {
    try {
        const [result] = await db.query(
            'DELETE FROM staff_announcements WHERE id = ?',
            [req.params.id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Announcement not found' });
        }

        // Emit Socket.IO event
        if (req.app.get('io')) {
            req.app.get('io').emit('staff-announcement:deleted', { id: req.params.id });
        }

        logger.info('Staff announcement deleted', { id: req.params.id });

        res.json({
            success: true,
            message: 'Pengumuman berhasil dihapus'
        });
    } catch (error) {
        logger.error('Failed to delete staff announcement', { error: error.message });
        next(error);
    }
});

module.exports = router;

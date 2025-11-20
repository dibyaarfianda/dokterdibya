const express = require('express');
const router = express.Router();
const db = require('../db');
const { verifyToken } = require('../middleware/auth');

// Get all active announcements (public - for patient dashboard)
router.get('/active', async (req, res) => {
    try {
        const [announcements] = await db.query(
            `SELECT id, title, message, image_url, formatted_content, content_type,
                    created_by_name, priority, created_at
             FROM announcements
             WHERE status = 'active'
             ORDER BY
                CASE priority
                    WHEN 'urgent' THEN 1
                    WHEN 'important' THEN 2
                    WHEN 'normal' THEN 3
                END,
                created_at DESC
             LIMIT 10`
        );

        res.json({ success: true, data: announcements });
    } catch (error) {
        console.error('Error fetching active announcements:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get all announcements (staff only)
router.get('/', verifyToken, async (req, res) => {
    try {
        const [announcements] = await db.query(
            `SELECT * FROM announcements 
             ORDER BY created_at DESC`
        );
        
        res.json({ success: true, data: announcements });
    } catch (error) {
        console.error('Error fetching announcements:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get single announcement
router.get('/:id', async (req, res) => {
    try {
        const [announcements] = await db.query(
            'SELECT * FROM announcements WHERE id = ?',
            [req.params.id]
        );
        
        if (announcements.length === 0) {
            return res.status(404).json({ success: false, message: 'Announcement not found' });
        }
        
        res.json({ success: true, data: announcements[0] });
    } catch (error) {
        console.error('Error fetching announcement:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Create announcement (staff only)
router.post('/', verifyToken, async (req, res) => {
    try {
        const { title, message, image_url, formatted_content, content_type, priority, status } = req.body;
        const userId = req.user.uid;
        const userName = req.user.name || req.user.email || 'dr. Dibya Arfianda, SpOG, M.Ked.Klin.';

        if (!title || !message) {
            return res.status(400).json({
                success: false,
                message: 'Title and message are required'
            });
        }

        const [result] = await db.query(
            `INSERT INTO announcements (title, message, image_url, formatted_content, content_type,
                                       created_by, created_by_name, priority, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                title,
                message,
                image_url || null,
                formatted_content || null,
                content_type || 'plain',
                userId,
                userName,
                priority || 'normal',
                status || 'active'
            ]
        );

        const [newAnnouncement] = await db.query(
            'SELECT * FROM announcements WHERE id = ?',
            [result.insertId]
        );

        res.json({
            success: true,
            message: 'Announcement created successfully',
            data: newAnnouncement[0]
        });
    } catch (error) {
        console.error('Error creating announcement:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Update announcement (staff only)
router.put('/:id', verifyToken, async (req, res) => {
    try {
        const { title, message, image_url, formatted_content, content_type, priority, status } = req.body;
        const { id } = req.params;

        const [result] = await db.query(
            `UPDATE announcements
             SET title = ?, message = ?, image_url = ?, formatted_content = ?,
                 content_type = ?, priority = ?, status = ?
             WHERE id = ?`,
            [title, message, image_url || null, formatted_content || null,
             content_type || 'plain', priority, status, id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: 'Announcement not found'
            });
        }

        const [updated] = await db.query(
            'SELECT * FROM announcements WHERE id = ?',
            [id]
        );

        res.json({
            success: true,
            message: 'Announcement updated successfully',
            data: updated[0]
        });
    } catch (error) {
        console.error('Error updating announcement:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Delete announcement (staff only)
router.delete('/:id', verifyToken, async (req, res) => {
    try {
        const [result] = await db.query(
            'DELETE FROM announcements WHERE id = ?',
            [req.params.id]
        );
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'Announcement not found' 
            });
        }
        
        res.json({ 
            success: true, 
            message: 'Announcement deleted successfully' 
        });
    } catch (error) {
        console.error('Error deleting announcement:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;

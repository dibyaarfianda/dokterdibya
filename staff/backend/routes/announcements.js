const express = require('express');
const router = express.Router();
const db = require('../db');
const logger = require('../utils/logger');
const { verifyToken } = require('../middleware/auth');

function extractUserField(value) {
    if (value === undefined || value === null) {
        return null;
    }
    const text = String(value).trim();
    return text.length ? text : null;
}

function resolveUserId(payload) {
    if (!payload || typeof payload !== 'object') {
        return null;
    }

    const primary = extractUserField(payload.uid)
        || extractUserField(payload.id)
        || extractUserField(payload.user_id)
        || extractUserField(payload.email)
        || extractUserField(payload.sub);
    if (primary) {
        return primary;
    }

    if (payload.user && typeof payload.user === 'object') {
        return resolveUserId(payload.user);
    }

    if (Array.isArray(payload.identities)) {
        for (const entry of payload.identities) {
            const extracted = resolveUserId(entry);
            if (extracted) {
                return extracted;
            }
        }
    }

    return null;
}

function resolveUserName(payload) {
    if (!payload || typeof payload !== 'object') {
        return null;
    }

    const primary = extractUserField(payload.name)
        || extractUserField(payload.displayName)
        || extractUserField(payload.fullName);
    if (primary) {
        return primary;
    }

    if (payload.user && typeof payload.user === 'object') {
        return resolveUserName(payload.user);
    }

    return null;
}

// Get all active announcements (public - for patient dashboard)
router.get('/active', async (req, res) => {
    try {
        // Check if new columns exist by querying information_schema
        let hasNewColumns = false;
        try {
            const [columns] = await db.query(
                `SELECT COUNT(*) as count FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE()
                 AND TABLE_NAME = 'announcements'
                 AND COLUMN_NAME IN ('image_url', 'formatted_content', 'content_type')`
            );
            hasNewColumns = columns[0].count === 3;
        } catch (e) {
            console.log('Could not check columns, assuming basic schema:', e.message);
        }

        // Build query based on available columns
        let selectColumns = 'id, title, message, created_by_name, priority, created_at';
        if (hasNewColumns) {
            selectColumns = 'id, title, message, image_url, formatted_content, content_type, created_by_name, priority, created_at';
        }

        const [announcements] = await db.query(
            `SELECT ${selectColumns}
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
        const userId = resolveUserId(req.user)
            || extractUserField(req.body?.created_by)
            || extractUserField(req.body?.createdBy);
        const userName = resolveUserName(req.user)
            || extractUserField(req.body?.created_by_name)
            || extractUserField(req.user?.email)
            || 'dr. Dibya Arfianda, SpOG, M.Ked.Klin.';

        if (!title || !message) {
            return res.status(400).json({
                success: false,
                message: 'Title and message are required'
            });
        }

        if (!userId) {
            logger.warn('Announcements create missing user identity', {
                path: req.path,
                method: req.method,
                tokenPayload: req.user || null,
            });
            return res.status(401).json({
                success: false,
                message: 'Tidak dapat mengenali akun. Silakan login ulang dan coba lagi.'
            });
        }

        // Check if new columns exist using information_schema
        let hasNewColumns = false;
        try {
            const [columns] = await db.query(
                `SELECT COUNT(*) as count FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE()
                 AND TABLE_NAME = 'announcements'
                 AND COLUMN_NAME IN ('image_url', 'formatted_content', 'content_type')`
            );
            hasNewColumns = columns[0].count === 3;
        } catch (e) {
            console.log('Could not check columns, assuming basic schema:', e.message);
        }

        let result;

        if (hasNewColumns) {
            // Use new schema with image and formatting support
            [result] = await db.query(
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
        } else {
            // Use basic schema (backward compatibility)
            console.log('Using basic announcement schema (new columns not available)');
            [result] = await db.query(
                `INSERT INTO announcements (title, message, created_by, created_by_name, priority, status)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [
                    title,
                    message,
                    userId,
                    userName,
                    priority || 'normal',
                    status || 'active'
                ]
            );
        }

        const [newAnnouncementResult] = await db.query(
            'SELECT * FROM announcements WHERE id = ?',
            [result.insertId]
        );

        res.json({
            success: true,
            message: 'Announcement created successfully',
            data: newAnnouncementResult[0]
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
        const userId = resolveUserId(req.user)
            || extractUserField(req.body?.updated_by)
            || extractUserField(req.body?.created_by)
            || extractUserField(req.body?.createdBy);

        if (!userId) {
            logger.warn('Announcements update missing user identity', {
                path: req.path,
                method: req.method,
                tokenPayload: req.user || null,
            });
            return res.status(401).json({
                success: false,
                message: 'Tidak dapat mengenali akun. Silakan login ulang dan coba lagi.'
            });
        }

        // Check if new columns exist using information_schema
        let hasNewColumns = false;
        try {
            const [columns] = await db.query(
                `SELECT COUNT(*) as count FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE()
                 AND TABLE_NAME = 'announcements'
                 AND COLUMN_NAME IN ('image_url', 'formatted_content', 'content_type')`
            );
            hasNewColumns = columns[0].count === 3;
        } catch (e) {
            console.log('Could not check columns, assuming basic schema:', e.message);
        }

        let result;

        if (hasNewColumns) {
            // Use new schema with image and formatting support
            [result] = await db.query(
                `UPDATE announcements
                 SET title = ?, message = ?, image_url = ?, formatted_content = ?,
                     content_type = ?, priority = ?, status = ?
                 WHERE id = ?`,
                [title, message, image_url || null, formatted_content || null,
                 content_type || 'plain', priority, status, id]
            );
        } else {
            // Use basic schema (backward compatibility)
            console.log('Using basic announcement schema (new columns not available)');
            [result] = await db.query(
                `UPDATE announcements
                 SET title = ?, message = ?, priority = ?, status = ?
                 WHERE id = ?`,
                [title, message, priority, status, id]
            );
        }

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

/**
 * Staff Notifications Routes
 * Handles notification management for staff members
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const { verifyToken, requireSuperadmin } = require('../middleware/auth');

/**
 * GET /api/notifications
 * Get notifications for current user
 */
router.get('/', verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const roleId = req.user.role_id;
        const { limit = 20, offset = 0, unread_only = false } = req.query;

        // Get notifications that are:
        // 1. Targeted to this user specifically
        // 2. Targeted to user's role
        // 3. Broadcast (user_id and role_id are both NULL)
        let query = `
            SELECT
                n.*,
                CASE
                    WHEN n.user_id IS NOT NULL THEN n.is_read
                    ELSE COALESCE(nr.id IS NOT NULL, 0)
                END as is_read,
                CASE
                    WHEN n.user_id IS NOT NULL THEN n.read_at
                    ELSE nr.read_at
                END as read_at
            FROM staff_notifications n
            LEFT JOIN staff_notification_reads nr ON n.id = nr.notification_id AND nr.user_id = ?
            WHERE (n.user_id = ? OR n.user_id IS NULL)
              AND (n.role_id = ? OR n.role_id IS NULL)
        `;

        const params = [userId, userId, roleId];

        if (unread_only === 'true' || unread_only === true) {
            query += `
                AND (
                    (n.user_id IS NOT NULL AND n.is_read = 0)
                    OR (n.user_id IS NULL AND nr.id IS NULL)
                )
            `;
        }

        query += ` ORDER BY n.created_at DESC LIMIT ? OFFSET ?`;
        params.push(parseInt(limit), parseInt(offset));

        const [notifications] = await db.query(query, params);

        // Get unread count
        const [countResult] = await db.query(`
            SELECT COUNT(*) as count
            FROM staff_notifications n
            LEFT JOIN staff_notification_reads nr ON n.id = nr.notification_id AND nr.user_id = ?
            WHERE (n.user_id = ? OR n.user_id IS NULL)
              AND (n.role_id = ? OR n.role_id IS NULL)
              AND (
                  (n.user_id IS NOT NULL AND n.is_read = 0)
                  OR (n.user_id IS NULL AND nr.id IS NULL)
              )
        `, [userId, userId, roleId]);

        res.json({
            success: true,
            notifications,
            unread_count: countResult[0].count
        });

    } catch (error) {
        console.error('Error fetching notifications:', error);
        res.status(500).json({ success: false, message: 'Gagal mengambil notifikasi' });
    }
});

/**
 * GET /api/notifications/count
 * Get unread notification count for badge
 */
router.get('/count', verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const roleId = req.user.role_id;

        const [countResult] = await db.query(`
            SELECT COUNT(*) as count
            FROM staff_notifications n
            LEFT JOIN staff_notification_reads nr ON n.id = nr.notification_id AND nr.user_id = ?
            WHERE (n.user_id = ? OR n.user_id IS NULL)
              AND (n.role_id = ? OR n.role_id IS NULL)
              AND (
                  (n.user_id IS NOT NULL AND n.is_read = 0)
                  OR (n.user_id IS NULL AND nr.id IS NULL)
              )
        `, [userId, userId, roleId]);

        res.json({
            success: true,
            count: countResult[0].count
        });

    } catch (error) {
        console.error('Error fetching notification count:', error);
        res.status(500).json({ success: false, message: 'Gagal mengambil jumlah notifikasi' });
    }
});

/**
 * POST /api/notifications/:id/read
 * Mark a notification as read
 */
router.post('/:id/read', verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        // Check if notification exists
        const [notifications] = await db.query(
            'SELECT * FROM staff_notifications WHERE id = ?',
            [id]
        );

        if (notifications.length === 0) {
            return res.status(404).json({ success: false, message: 'Notifikasi tidak ditemukan' });
        }

        const notification = notifications[0];

        if (notification.user_id) {
            // Direct notification - update is_read
            await db.query(
                'UPDATE staff_notifications SET is_read = 1, read_at = NOW() WHERE id = ?',
                [id]
            );
        } else {
            // Broadcast notification - insert into reads table
            await db.query(
                `INSERT IGNORE INTO staff_notification_reads (notification_id, user_id) VALUES (?, ?)`,
                [id, userId]
            );
        }

        res.json({ success: true, message: 'Notifikasi ditandai sudah dibaca' });

    } catch (error) {
        console.error('Error marking notification as read:', error);
        res.status(500).json({ success: false, message: 'Gagal menandai notifikasi' });
    }
});

/**
 * POST /api/notifications/read-all
 * Mark all notifications as read
 */
router.post('/read-all', verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const roleId = req.user.role_id;

        // Mark direct notifications as read
        await db.query(
            'UPDATE staff_notifications SET is_read = 1, read_at = NOW() WHERE user_id = ? AND is_read = 0',
            [userId]
        );

        // Insert read records for broadcast notifications
        await db.query(`
            INSERT IGNORE INTO staff_notification_reads (notification_id, user_id)
            SELECT n.id, ?
            FROM staff_notifications n
            LEFT JOIN staff_notification_reads nr ON n.id = nr.notification_id AND nr.user_id = ?
            WHERE n.user_id IS NULL
              AND (n.role_id = ? OR n.role_id IS NULL)
              AND nr.id IS NULL
        `, [userId, userId, roleId]);

        res.json({ success: true, message: 'Semua notifikasi ditandai sudah dibaca' });

    } catch (error) {
        console.error('Error marking all notifications as read:', error);
        res.status(500).json({ success: false, message: 'Gagal menandai semua notifikasi' });
    }
});

/**
 * POST /api/notifications
 * Create a new notification (superadmin only)
 */
router.post('/', verifyToken, requireSuperadmin, async (req, res) => {
    try {
        const { type, title, message, link, icon, icon_color, user_id, role_id } = req.body;

        if (!title || !message) {
            return res.status(400).json({ success: false, message: 'Title dan message harus diisi' });
        }

        const [result] = await db.query(`
            INSERT INTO staff_notifications (type, title, message, link, icon, icon_color, user_id, role_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            type || 'system',
            title,
            message,
            link || null,
            icon || 'fas fa-bell',
            icon_color || 'text-primary',
            user_id || null,
            role_id || null
        ]);

        res.status(201).json({
            success: true,
            notification_id: result.insertId,
            message: 'Notifikasi berhasil dibuat'
        });

    } catch (error) {
        console.error('Error creating notification:', error);
        res.status(500).json({ success: false, message: 'Gagal membuat notifikasi' });
    }
});

/**
 * DELETE /api/notifications/:id
 * Delete a notification (superadmin only)
 */
router.delete('/:id', verifyToken, requireSuperadmin, async (req, res) => {
    try {
        const { id } = req.params;

        await db.query('DELETE FROM staff_notifications WHERE id = ?', [id]);

        res.json({ success: true, message: 'Notifikasi berhasil dihapus' });

    } catch (error) {
        console.error('Error deleting notification:', error);
        res.status(500).json({ success: false, message: 'Gagal menghapus notifikasi' });
    }
});

/**
 * GET /api/notifications/with-announcements
 * Get notifications combined with recent announcements
 */
router.get('/with-announcements', verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const roleId = req.user.role_id;
        const { limit = 10 } = req.query;

        // Get notifications
        const [notifications] = await db.query(`
            SELECT
                n.id,
                n.type,
                n.title,
                n.message,
                n.link,
                n.icon,
                n.icon_color,
                n.created_at,
                'notification' as source,
                CASE
                    WHEN n.user_id IS NOT NULL THEN n.is_read
                    ELSE COALESCE(nr.id IS NOT NULL, 0)
                END as is_read
            FROM staff_notifications n
            LEFT JOIN staff_notification_reads nr ON n.id = nr.notification_id AND nr.user_id = ?
            WHERE (n.user_id = ? OR n.user_id IS NULL)
              AND (n.role_id = ? OR n.role_id IS NULL)
            ORDER BY n.created_at DESC
            LIMIT ?
        `, [userId, userId, roleId, parseInt(limit)]);

        // Get recent announcements
        const [announcements] = await db.query(`
            SELECT
                id,
                'announcement' as type,
                title,
                SUBSTRING(message, 1, 200) as message,
                NULL as link,
                CASE priority
                    WHEN 'urgent' THEN 'fas fa-exclamation-triangle'
                    WHEN 'important' THEN 'fas fa-exclamation-circle'
                    ELSE 'fas fa-bullhorn'
                END as icon,
                CASE priority
                    WHEN 'urgent' THEN 'text-danger'
                    WHEN 'important' THEN 'text-warning'
                    ELSE 'text-info'
                END as icon_color,
                created_at,
                'announcement' as source,
                0 as is_read
            FROM announcements
            WHERE status = 'active'
            ORDER BY
                CASE priority
                    WHEN 'urgent' THEN 1
                    WHEN 'important' THEN 2
                    ELSE 3
                END,
                created_at DESC
            LIMIT ?
        `, [parseInt(limit)]);

        // Combine and sort by date
        const combined = [...notifications, ...announcements]
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
            .slice(0, parseInt(limit));

        // Get unread count
        const [countResult] = await db.query(`
            SELECT COUNT(*) as count
            FROM staff_notifications n
            LEFT JOIN staff_notification_reads nr ON n.id = nr.notification_id AND nr.user_id = ?
            WHERE (n.user_id = ? OR n.user_id IS NULL)
              AND (n.role_id = ? OR n.role_id IS NULL)
              AND (
                  (n.user_id IS NOT NULL AND n.is_read = 0)
                  OR (n.user_id IS NULL AND nr.id IS NULL)
              )
        `, [userId, userId, roleId]);

        res.json({
            success: true,
            items: combined,
            unread_count: countResult[0].count
        });

    } catch (error) {
        console.error('Error fetching notifications with announcements:', error);
        res.status(500).json({ success: false, message: 'Gagal mengambil data' });
    }
});

/**
 * POST /api/notifications/badge-counts
 * Get counts for sidebar notification badges (only items newer than lastSeen)
 */
router.post('/badge-counts', verifyToken, async (req, res) => {
    try {
        const { lastSeen = {} } = req.body;
        const counts = {
            klinik_private: 0,
            rsia_melinda: 0,
            rsud_gambiran: 0,
            rs_bhayangkara: 0,
            artikel: 0
        };

        // 1. Count new Klinik Privat appointments (sunday_appointments)
        const klinikLastSeen = lastSeen.klinik_private || '1970-01-01';
        const [klinikResult] = await db.query(`
            SELECT COUNT(*) as count
            FROM sunday_appointments
            WHERE appointment_date >= CURDATE()
            AND status IN ('pending', 'confirmed')
            AND created_at > ?
        `, [klinikLastSeen]);
        counts.klinik_private = klinikResult[0]?.count || 0;

        // 2. Count new RSIA Melinda appointments
        const rsiaLastSeen = lastSeen.rsia_melinda || '1970-01-01';
        const [rsiaResult] = await db.query(`
            SELECT COUNT(*) as count
            FROM appointments
            WHERE hospital_location = 'rsia_melinda'
            AND appointment_date >= CURDATE()
            AND status IN ('scheduled', 'confirmed')
            AND created_at > ?
        `, [rsiaLastSeen]);
        counts.rsia_melinda = rsiaResult[0]?.count || 0;

        // 3. Count new RSUD Gambiran appointments
        const rsudLastSeen = lastSeen.rsud_gambiran || '1970-01-01';
        const [rsudResult] = await db.query(`
            SELECT COUNT(*) as count
            FROM appointments
            WHERE hospital_location = 'rsud_gambiran'
            AND appointment_date >= CURDATE()
            AND status IN ('scheduled', 'confirmed')
            AND created_at > ?
        `, [rsudLastSeen]);
        counts.rsud_gambiran = rsudResult[0]?.count || 0;

        // 4. Count new RS Bhayangkara appointments
        const bhayangkaraLastSeen = lastSeen.rs_bhayangkara || '1970-01-01';
        const [bhayangkaraResult] = await db.query(`
            SELECT COUNT(*) as count
            FROM appointments
            WHERE hospital_location = 'rs_bhayangkara'
            AND appointment_date >= CURDATE()
            AND status IN ('scheduled', 'confirmed')
            AND created_at > ?
        `, [bhayangkaraLastSeen]);
        counts.rs_bhayangkara = bhayangkaraResult[0]?.count || 0;

        // 5. Count new article likes
        const artikelLastSeen = lastSeen.artikel || '1970-01-01';
        const [artikelResult] = await db.query(`
            SELECT COUNT(*) as count
            FROM article_likes
            WHERE created_at > ?
        `, [artikelLastSeen]);
        counts.artikel = artikelResult[0]?.count || 0;

        res.json({
            success: true,
            counts
        });

    } catch (error) {
        console.error('Error getting badge counts:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get badge counts'
        });
    }
});

// Helper function to create notification (for use in other modules)
async function createNotification({
    type = 'system',
    title,
    message,
    link = null,
    icon = 'fas fa-bell',
    icon_color = 'text-primary',
    user_id = null,
    role_id = null
}) {
    try {
        const [result] = await db.query(`
            INSERT INTO staff_notifications (type, title, message, link, icon, icon_color, user_id, role_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [type, title, message, link, icon, icon_color, user_id, role_id]);

        return { success: true, id: result.insertId };
    } catch (error) {
        console.error('Error creating notification:', error);
        return { success: false, error: error.message };
    }
}

module.exports = router;
module.exports.createNotification = createNotification;

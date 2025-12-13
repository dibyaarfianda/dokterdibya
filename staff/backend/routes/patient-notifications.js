/**
 * Patient Notifications Routes
 * Handles notification management for patients
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const { verifyPatientToken } = require('../middleware/auth');

/**
 * GET /api/patient-notifications
 * Get notifications for current patient
 */
router.get('/', verifyPatientToken, async (req, res) => {
    try {
        const patientId = req.patient?.patientId || req.patient?.id;
        const { limit = 20, offset = 0, unread_only = false } = req.query;

        if (!patientId) {
            return res.status(401).json({ success: false, message: 'Patient not authenticated' });
        }

        let query = `
            SELECT * FROM patient_notifications
            WHERE patient_id = ?
        `;
        const params = [patientId];

        if (unread_only === 'true' || unread_only === true) {
            query += ' AND is_read = 0';
        }

        query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit), parseInt(offset));

        const [notifications] = await db.query(query, params);

        // Get unread count
        const [countResult] = await db.query(
            'SELECT COUNT(*) as count FROM patient_notifications WHERE patient_id = ? AND is_read = 0',
            [patientId]
        );

        res.json({
            success: true,
            notifications,
            unread_count: countResult[0].count
        });

    } catch (error) {
        console.error('Error fetching patient notifications:', error);
        res.status(500).json({ success: false, message: 'Gagal mengambil notifikasi' });
    }
});

/**
 * GET /api/patient-notifications/count
 * Get unread notification count for badge
 */
router.get('/count', verifyPatientToken, async (req, res) => {
    try {
        const patientId = req.patient?.patientId || req.patient?.id;

        if (!patientId) {
            return res.status(401).json({ success: false, message: 'Patient not authenticated' });
        }

        const [countResult] = await db.query(
            'SELECT COUNT(*) as count FROM patient_notifications WHERE patient_id = ? AND is_read = 0',
            [patientId]
        );

        res.json({
            success: true,
            count: countResult[0].count
        });

    } catch (error) {
        console.error('Error fetching patient notification count:', error);
        res.status(500).json({ success: false, message: 'Gagal mengambil jumlah notifikasi' });
    }
});

/**
 * GET /api/patient-notifications/with-announcements
 * Get notifications combined with active announcements
 */
router.get('/with-announcements', verifyPatientToken, async (req, res) => {
    try {
        const patientId = req.patient?.patientId || req.patient?.id;
        const { limit = 20 } = req.query;

        if (!patientId) {
            return res.status(401).json({ success: false, message: 'Patient not authenticated' });
        }

        // Get patient notifications
        const [notifications] = await db.query(`
            SELECT 
                id,
                type,
                title,
                message,
                link,
                icon,
                icon_color,
                is_read,
                created_at,
                'notification' as source
            FROM patient_notifications
            WHERE patient_id = ?
            ORDER BY created_at DESC
            LIMIT ?
        `, [patientId, parseInt(limit)]);

        // Get active announcements
        const [announcements] = await db.query(`
            SELECT
                id,
                'announcement' as type,
                title,
                SUBSTRING(message, 1, 200) as message,
                NULL as link,
                CASE priority
                    WHEN 'urgent' THEN 'fa fa-exclamation-triangle'
                    WHEN 'important' THEN 'fa fa-exclamation-circle'
                    ELSE 'fa fa-bullhorn'
                END as icon,
                CASE priority
                    WHEN 'urgent' THEN 'text-danger'
                    WHEN 'important' THEN 'text-warning'
                    ELSE 'text-info'
                END as icon_color,
                0 as is_read,
                created_at,
                'announcement' as source
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
        const [countResult] = await db.query(
            'SELECT COUNT(*) as count FROM patient_notifications WHERE patient_id = ? AND is_read = 0',
            [patientId]
        );

        res.json({
            success: true,
            items: combined,
            unread_count: countResult[0].count
        });

    } catch (error) {
        console.error('Error fetching patient notifications with announcements:', error);
        res.status(500).json({ success: false, message: 'Gagal mengambil data' });
    }
});

/**
 * POST /api/patient-notifications/:id/read
 * Mark a notification as read
 */
router.post('/:id/read', verifyPatientToken, async (req, res) => {
    try {
        const { id } = req.params;
        const patientId = req.patient?.patientId || req.patient?.id;

        if (!patientId) {
            return res.status(401).json({ success: false, message: 'Patient not authenticated' });
        }

        await db.query(
            'UPDATE patient_notifications SET is_read = 1, read_at = NOW() WHERE id = ? AND patient_id = ?',
            [id, patientId]
        );

        res.json({ success: true, message: 'Notifikasi ditandai sudah dibaca' });

    } catch (error) {
        console.error('Error marking patient notification as read:', error);
        res.status(500).json({ success: false, message: 'Gagal menandai notifikasi' });
    }
});

/**
 * POST /api/patient-notifications/read-all
 * Mark all notifications as read
 */
router.post('/read-all', verifyPatientToken, async (req, res) => {
    try {
        const patientId = req.patient?.patientId || req.patient?.id;

        if (!patientId) {
            return res.status(401).json({ success: false, message: 'Patient not authenticated' });
        }

        await db.query(
            'UPDATE patient_notifications SET is_read = 1, read_at = NOW() WHERE patient_id = ? AND is_read = 0',
            [patientId]
        );

        res.json({ success: true, message: 'Semua notifikasi ditandai sudah dibaca' });

    } catch (error) {
        console.error('Error marking all patient notifications as read:', error);
        res.status(500).json({ success: false, message: 'Gagal menandai semua notifikasi' });
    }
});

// Helper function to create patient notification (for use in other modules)
async function createPatientNotification({
    patient_id,
    type = 'system',
    title,
    message,
    link = null,
    icon = 'fa fa-bell',
    icon_color = 'text-primary'
}) {
    try {
        const [result] = await db.query(`
            INSERT INTO patient_notifications (patient_id, type, title, message, link, icon, icon_color)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [patient_id, type, title, message, link, icon, icon_color]);

        // Broadcast notification via Socket.IO for real-time updates
        try {
            const realtimeSync = require('../realtime-sync');
            realtimeSync.broadcastPatientNotification({
                id: result.insertId,
                patient_id,
                type,
                title,
                message,
                icon,
                icon_color
            });
        } catch (broadcastError) {
            console.warn('Failed to broadcast notification:', broadcastError.message);
        }

        return { success: true, id: result.insertId };
    } catch (error) {
        console.error('Error creating patient notification:', error);
        return { success: false, error: error.message };
    }
}

module.exports = router;
module.exports.createPatientNotification = createPatientNotification;

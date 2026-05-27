/**
 * Patient Notifications Routes
 * Handles notification management for patients
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const { verifyPatientToken } = require('../middleware/auth');

let queueReminderSchemaReady = false;

function getDefaultQueueReminderSettings() {
    return {
        enabled: false,
        threshold_ahead: 2,
        background_push_enabled: false,
        last_notified_signature: null,
        last_notified_at: null
    };
}

async function ensureQueueReminderSchema() {
    if (queueReminderSchemaReady) {
        return;
    }

    await db.query(`
        CREATE TABLE IF NOT EXISTS patient_queue_reminder_settings (
            patient_id VARCHAR(32) NOT NULL PRIMARY KEY,
            enabled TINYINT(1) NOT NULL DEFAULT 0,
            threshold_ahead INT NOT NULL DEFAULT 2,
            background_push_enabled TINYINT(1) NOT NULL DEFAULT 0,
            last_notified_signature VARCHAR(160) NULL,
            last_notified_at DATETIME NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_queue_reminder_active (enabled, background_push_enabled)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    queueReminderSchemaReady = true;
}

async function getQueueReminderSettings(patientId) {
    await ensureQueueReminderSchema();

    const [rows] = await db.query(
        `SELECT patient_id, enabled, threshold_ahead, background_push_enabled,
                last_notified_signature, last_notified_at
         FROM patient_queue_reminder_settings
         WHERE patient_id = ?
         LIMIT 1`,
        [patientId]
    );

    const row = rows[0];
    if (!row) {
        return getDefaultQueueReminderSettings();
    }

    return {
        enabled: Boolean(row.enabled),
        threshold_ahead: Number(row.threshold_ahead) || 2,
        background_push_enabled: Boolean(row.background_push_enabled),
        last_notified_signature: row.last_notified_signature || null,
        last_notified_at: row.last_notified_at || null
    };
}

async function saveQueueReminderSettings(patientId, settings) {
    await ensureQueueReminderSchema();

    const enabled = settings.enabled ? 1 : 0;
    const thresholdAhead = Math.min(10, Math.max(1, Number(settings.threshold_ahead) || 2));
    const backgroundPushEnabled = settings.background_push_enabled ? 1 : 0;

    await db.query(
        `INSERT INTO patient_queue_reminder_settings
            (patient_id, enabled, threshold_ahead, background_push_enabled)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
            enabled = VALUES(enabled),
            threshold_ahead = VALUES(threshold_ahead),
            background_push_enabled = VALUES(background_push_enabled),
            updated_at = CURRENT_TIMESTAMP`,
        [patientId, enabled, thresholdAhead, backgroundPushEnabled]
    );

    return getQueueReminderSettings(patientId);
}

async function listActiveQueueReminderSettings(patientIds) {
    await ensureQueueReminderSchema();

    if (!Array.isArray(patientIds) || patientIds.length === 0) {
        return [];
    }

    const uniquePatientIds = Array.from(new Set(patientIds.filter(Boolean)));
    if (uniquePatientIds.length === 0) {
        return [];
    }

    const placeholders = uniquePatientIds.map(() => '?').join(',');
    const [rows] = await db.query(
        `SELECT patient_id, enabled, threshold_ahead, background_push_enabled,
                last_notified_signature, last_notified_at
         FROM patient_queue_reminder_settings
         WHERE patient_id IN (${placeholders})
           AND enabled = 1
           AND background_push_enabled = 1`,
        uniquePatientIds
    );

    return rows.map((row) => ({
        patient_id: row.patient_id,
        enabled: Boolean(row.enabled),
        threshold_ahead: Number(row.threshold_ahead) || 2,
        background_push_enabled: Boolean(row.background_push_enabled),
        last_notified_signature: row.last_notified_signature || null,
        last_notified_at: row.last_notified_at || null
    }));
}

async function markQueueReminderTriggered(patientId, signature) {
    await ensureQueueReminderSchema();

    await db.query(
        `UPDATE patient_queue_reminder_settings
         SET last_notified_signature = ?,
             last_notified_at = NOW(),
             updated_at = CURRENT_TIMESTAMP
         WHERE patient_id = ?`,
        [signature, patientId]
    );
}

/**
 * GET /api/patient-notifications/queue-reminder-settings
 * Get persistent queue reminder settings for current patient.
 */
router.get('/queue-reminder-settings', verifyPatientToken, async (req, res) => {
    try {
        const patientId = req.patient?.patientId || req.patient?.id;

        if (!patientId) {
            return res.status(401).json({ success: false, message: 'Patient not authenticated' });
        }

        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '0');

        const settings = await getQueueReminderSettings(patientId);
        res.json({ success: true, settings });
    } catch (error) {
        console.error('Error fetching queue reminder settings:', error);
        res.status(500).json({ success: false, message: 'Gagal mengambil pengaturan reminder antrian' });
    }
});

/**
 * PUT /api/patient-notifications/queue-reminder-settings
 * Save persistent queue reminder settings for current patient.
 */
router.put('/queue-reminder-settings', verifyPatientToken, async (req, res) => {
    try {
        const patientId = req.patient?.patientId || req.patient?.id;

        if (!patientId) {
            return res.status(401).json({ success: false, message: 'Patient not authenticated' });
        }

        const settings = await saveQueueReminderSettings(patientId, {
            enabled: req.body?.enabled,
            threshold_ahead: req.body?.threshold_ahead,
            background_push_enabled: req.body?.background_push_enabled
        });

        res.json({ success: true, settings });
    } catch (error) {
        console.error('Error saving queue reminder settings:', error);
        res.status(500).json({ success: false, message: 'Gagal menyimpan pengaturan reminder antrian' });
    }
});

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

        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '0');
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

        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '0');

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
 * POST /api/patient-notifications/mark-read-by-link
 * Mark notifications as read by matching link field
 * Used when patient opens a document page (album-usg, hasil-lab, dokumen-medis)
 */
router.post('/mark-read-by-link', verifyPatientToken, async (req, res) => {
    try {
        const patientId = req.patient?.patientId || req.patient?.id;
        const { link } = req.body;

        if (!patientId) {
            return res.status(401).json({ success: false, message: 'Patient not authenticated' });
        }

        if (!link) {
            return res.status(400).json({ success: false, message: 'Link is required' });
        }

        const [result] = await db.query(
            'UPDATE patient_notifications SET is_read = 1, read_at = NOW() WHERE patient_id = ? AND link = ? AND is_read = 0',
            [patientId, link]
        );

        res.json({ success: true, marked: result.affectedRows });

    } catch (error) {
        console.error('Error marking notifications by link:', error);
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

        // Broadcast notification via Socket.IO for real-time updates (web)
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
            console.warn('Failed to broadcast Socket.IO notification:', broadcastError.message);
        }

        // Send push notification to all patient devices (Web Push + FCM)
        try {
            const pushService = require('../services/pushNotificationService');
            pushService.sendToPatient(patient_id, title, message, {
                notification_id: String(result.insertId),
                type: type,
                link: link || '',
                url: link || '/patient-menu.html'
            }).catch(function(err) {
                console.warn('Push notification send failed:', err.message);
            });
        } catch (pushError) {
            console.warn('Failed to send push notification:', pushError.message);
        }

        return { success: true, id: result.insertId };
    } catch (error) {
        console.error('Error creating patient notification:', error);
        return { success: false, error: error.message };
    }
}

module.exports = router;
module.exports.createPatientNotification = createPatientNotification;
module.exports.getQueueReminderSettings = getQueueReminderSettings;
module.exports.saveQueueReminderSettings = saveQueueReminderSettings;
module.exports.listActiveQueueReminderSettings = listActiveQueueReminderSettings;
module.exports.markQueueReminderTriggered = markQueueReminderTriggered;

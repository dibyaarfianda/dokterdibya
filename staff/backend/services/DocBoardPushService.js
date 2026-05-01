'use strict';

/**
 * DocBoard Push Notification Service
 * Sends push notifications to staff via Web Push (VAPID)
 * and stores notifications in docboard_notifications table.
 */

const webpush = require('web-push');
const db = require('../db');
const logger = require('../utils/logger');

// Reuse same VAPID keys as patient push service
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@dokterdibya.com';

let webPushReady = false;

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  try {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    webPushReady = true;
    logger.info('DocBoard Web Push (VAPID) configured');
  } catch (err) {
    logger.error('DocBoard Web Push config failed:', err.message);
  }
} else {
  logger.warn('VAPID keys not set - DocBoard Web Push disabled');
}

/**
 * Store a notification in docboard_notifications table.
 */
async function storeNotification(userId, type, title, message, location, referenceId) {
  try {
    const [result] = await db.query(
      `INSERT INTO docboard_notifications (user_id, type, title, message, location, reference_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [userId || null, type || 'info', title, message, location || null, referenceId || null]
    );
    return result.insertId;
  } catch (err) {
    logger.error('Failed to store docboard notification:', err.message);
    return null;
  }
}

/**
 * Store notification for all staff (user_id = NULL means global).
 */
async function storeGlobalNotification(type, title, message, location, referenceId) {
  return storeNotification(null, type, title, message, location, referenceId);
}

/**
 * Send Web Push to a single subscription.
 */
async function sendWebPush(tokenRow, title, body, data) {
  if (!webPushReady) {
    throw new Error('Web Push not configured');
  }

  const subscription = {
    endpoint: tokenRow.endpoint,
    keys: {
      p256dh: tokenRow.p256dh,
      auth: tokenRow.auth_key
    }
  };

  const payload = JSON.stringify({
    title: title,
    body: body,
    url: data.url || '/docboard/',
    icon: '/docboard/icons/icon-192.png',
    badge: '/docboard/icons/icon-192.png',
    data: data
  });

  return webpush.sendNotification(subscription, payload, { TTL: 86400 });
}

// Map notification type to preference key
const TYPE_PREF_MAP = {
  new_booking: 'notify_new_booking',
  status_change: 'notify_status_change',
  surgery_reminder: 'notify_reminder',
  sync_failure: 'notify_sync_failure'
};

/**
 * Send push notification to all staff with registered tokens.
 * Respects per-user notification preferences.
 */
async function sendToAllStaff(title, body, data = {}) {
  try {
    const [tokens] = await db.query(
      'SELECT pt.id, pt.user_id, pt.endpoint, pt.p256dh, pt.auth_key FROM docboard_push_tokens pt'
    );

    if (!tokens || tokens.length === 0) {
      return { success: true, sent: 0, failed: 0, reason: 'no_tokens' };
    }

    // Load preferences for all users who have tokens
    const userIds = [...new Set(tokens.map(t => t.user_id).filter(Boolean))];
    let prefsMap = {};
    if (userIds.length > 0) {
      try {
        const [prefRows] = await db.query(
          'SELECT user_id, preferences FROM docboard_preferences WHERE user_id IN (?)',
          [userIds]
        );
        for (const row of prefRows) {
          const p = typeof row.preferences === 'string' ? JSON.parse(row.preferences) : row.preferences;
          prefsMap[row.user_id] = p;
        }
      } catch { /* preferences table may not exist yet */ }
    }

    const prefKey = TYPE_PREF_MAP[data.type] || null;

    let sent = 0;
    let failed = 0;
    let skipped = 0;
    const invalidTokenIds = [];

    for (const t of tokens) {
      // Check user preference
      if (prefKey && t.user_id && prefsMap[t.user_id]) {
        if (prefsMap[t.user_id][prefKey] === false) {
          skipped++;
          continue;
        }
      }

      try {
        await sendWebPush(t, title, body, data);
        sent++;
      } catch (err) {
        failed++;
        if (err.statusCode === 410 || err.statusCode === 404) {
          invalidTokenIds.push(t.id);
        }
      }
    }

    // Cleanup invalid tokens
    if (invalidTokenIds.length > 0) {
      db.query(
        'DELETE FROM docboard_push_tokens WHERE id IN (?)',
        [invalidTokenIds]
      ).catch(err => {
        logger.error('Failed to cleanup invalid docboard tokens:', err.message);
      });
    }

    return { success: true, sent, failed, skipped };
  } catch (err) {
    logger.error('Failed to send docboard push to all staff:', err.message);
    return { success: false, sent: 0, failed: 0, error: err.message };
  }
}

// Location name map
const LOCATION_NAMES = {
  klinik_private: 'Klinik Privat',
  rsia_melinda: 'RSIA Melinda',
  rsud_gambiran: 'RSUD Gambiran',
  rs_bhayangkara: 'RS Bhayangkara'
};

/**
 * Send notification when a new surgery is booked.
 */
async function sendNewBookingNotification(surgery) {
  const title = 'Operasi baru dijadwalkan';
  const opName = surgery.op_name_id || surgery.op_name || surgery.operation_type_other || 'Operasi';
  const locName = LOCATION_NAMES[surgery.location] || surgery.location;
  const dateObj = new Date(surgery.surgery_date);
  const dateStr = `${dateObj.getDate()}/${dateObj.getMonth() + 1}/${dateObj.getFullYear()}`;
  const message = `${surgery.patient_name} - ${opName} di ${locName} (${dateStr})`;

  // Store in DB
  await storeGlobalNotification('new_booking', title, message, surgery.location, surgery.id);

  // Send push
  return sendToAllStaff(title, message, {
    type: 'new_booking',
    surgeryId: surgery.id,
    url: `/docboard/surgery/${surgery.id}`
  });
}

/**
 * Send notification when surgery status changes.
 */
async function sendStatusChangeNotification(surgery, newStatus) {
  const statusLabels = {
    planned: 'Rencana',
    confirmed: 'Dikonfirmasi',
    in_progress: 'Berlangsung',
    completed: 'Selesai',
    cancelled: 'Dibatalkan',
    postponed: 'Ditunda'
  };

  const statusLabel = statusLabels[newStatus] || newStatus;
  const title = `Status operasi: ${statusLabel}`;
  const message = `${surgery.patient_name} - ${surgery.op_name_id || surgery.op_name || 'Operasi'}`;

  // Store in DB
  await storeGlobalNotification('status_change', title, message, surgery.location, surgery.id);

  // Send push
  return sendToAllStaff(title, message, {
    type: 'status_change',
    surgeryId: surgery.id,
    url: `/docboard/surgery/${surgery.id}`
  });
}

/**
 * Send reminder for tomorrow's surgeries.
 */
async function sendSurgeryReminder(surgery) {
  const opName = surgery.op_name_id || surgery.op_name || surgery.operation_type_other || 'Operasi';
  const timeStr = surgery.surgery_time ? surgery.surgery_time.substring(0, 5) : '';
  const title = 'Reminder: Operasi besok';
  const message = `${surgery.patient_name} - ${opName}${timeStr ? ' pukul ' + timeStr : ''}`;

  // Store in DB
  await storeGlobalNotification('surgery_reminder', title, message, surgery.location, surgery.id);

  // Send push
  return sendToAllStaff(title, message, {
    type: 'surgery_reminder',
    surgeryId: surgery.id,
    url: `/docboard/surgery/${surgery.id}`
  });
}

/**
 * Send notification when sync fails.
 */
async function sendSyncFailureNotification(location, error) {
  const locName = LOCATION_NAMES[location] || location;
  const title = `Sync gagal - ${locName}`;
  const message = error || 'Sinkronisasi data gagal. Coba lagi nanti.';

  // Store in DB
  await storeGlobalNotification('sync_failure', title, message, location, null);

  // Send push
  return sendToAllStaff(title, message, {
    type: 'sync_failure',
    location: location,
    url: '/docboard/settings'
  });
}

/**
 * Send daily reminders for tomorrow's surgeries.
 * Call this from a cron or scheduled task.
 */
async function sendDailyReminders() {
  try {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;

    const [surgeries] = await db.query(
      `SELECT s.*, ot.name as op_name, ot.name_id as op_name_id
       FROM surgery_schedules s
       JOIN surgery_operation_types ot ON s.operation_type_id = ot.id
       WHERE s.surgery_date = ? AND s.status NOT IN ('cancelled', 'completed')
       ORDER BY s.surgery_time`,
      [tomorrowStr]
    );

    if (surgeries.length === 0) {
      logger.info('DocBoard: No surgeries tomorrow, no reminders to send');
      return { sent: 0 };
    }

    let sentCount = 0;
    let waSent = 0;
    const whatsapp = require('./whatsappService');

    for (const surgery of surgeries) {
      await sendSurgeryReminder(surgery);
      sentCount++;

      // Also send WhatsApp reminder if patient has phone
      if (surgery.patient_id && whatsapp.canSendAutomatically()) {
        try {
          const [patients] = await db.query('SELECT phone, whatsapp FROM patients WHERE id = ?', [surgery.patient_id]);
          const p = patients[0];
          const phone = p?.whatsapp || p?.phone;
          if (phone) {
            const waResult = await whatsapp.sendSurgeryReminder(surgery, phone);
            if (waResult.success) waSent++;
          }
        } catch { /* non-blocking */ }
      }
    }

    logger.info(`DocBoard: Sent ${sentCount} push + ${waSent} WhatsApp reminders for ${tomorrowStr}`);
    return { sent: sentCount, whatsapp: waSent };
  } catch (err) {
    logger.error('DocBoard: Failed to send daily reminders:', err.message);
    return { sent: 0, error: err.message };
  }
}

/**
 * Get VAPID public key for frontend subscription.
 */
function getVapidPublicKey() {
  return VAPID_PUBLIC_KEY || null;
}

module.exports = {
  storeNotification,
  storeGlobalNotification,
  sendToAllStaff,
  sendNewBookingNotification,
  sendStatusChangeNotification,
  sendSurgeryReminder,
  sendSyncFailureNotification,
  sendDailyReminders,
  getVapidPublicKey,
  isReady: function () { return webPushReady; }
};

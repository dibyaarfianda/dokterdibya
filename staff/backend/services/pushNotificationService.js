'use strict';

/**
 * Push Notification Service
 * Unified service for sending push notifications to PWA (Web Push) and
 * Capacitor/native apps (FCM/APNS). Manages tokens in push_tokens table.
 *
 * Supports multiple devices per patient with deduplication.
 */

const webpush = require('web-push');
const db = require('../db');
const firebase = require('./firebase');
const logger = require('../utils/logger');

// Configure VAPID for Web Push
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@dokterdibya.com';

let webPushReady = false;

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
    try {
        webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
        webPushReady = true;
        console.log('Web Push (VAPID) configured');
    } catch (err) {
        console.error('Web Push config failed:', err.message);
    }
} else {
    console.warn('VAPID keys not set — Web Push disabled');
}

/**
 * Register a push token for a patient.
 * Upserts: if same token exists, updates patient_id and timestamp.
 *
 * @param {string} patientId
 * @param {string} platform - 'web' | 'android' | 'ios'
 * @param {object} tokenData
 *   For web:     { endpoint, p256dh, auth }
 *   For mobile:  { token }
 * @returns {Promise<{success: boolean, id?: number}>}
 */
async function registerToken(patientId, platform, tokenData) {
    if (!patientId) return { success: false, error: 'patient_id required' };

    let token, endpoint, p256dh, authKey;

    if (platform === 'web') {
        if (!tokenData.endpoint) return { success: false, error: 'endpoint required for web' };
        endpoint = tokenData.endpoint;
        p256dh = tokenData.p256dh || null;
        authKey = tokenData.auth || null;
        // Use endpoint as unique token identifier for web
        token = tokenData.endpoint;
    } else {
        if (!tokenData.token) return { success: false, error: 'token required for mobile' };
        token = tokenData.token;
        endpoint = null;
        p256dh = null;
        authKey = null;
    }

    try {
        // Upsert: INSERT or UPDATE on duplicate token
        const [result] = await db.query(
            `INSERT INTO push_tokens (patient_id, platform, token, endpoint, p256dh, auth_key)
             VALUES (?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
                patient_id = VALUES(patient_id),
                platform = VALUES(platform),
                endpoint = VALUES(endpoint),
                p256dh = VALUES(p256dh),
                auth_key = VALUES(auth_key),
                updated_at = CURRENT_TIMESTAMP`,
            [patientId, platform, token, endpoint, p256dh, authKey]
        );

        return { success: true, id: result.insertId || result.affectedRows };
    } catch (err) {
        logger.error('Failed to register push token', { error: err.message, patientId, platform });
        return { success: false, error: err.message };
    }
}

/**
 * Unregister a push token.
 * @param {string} patientId
 * @param {string} token - The token or endpoint to remove
 * @returns {Promise<{success: boolean}>}
 */
async function unregisterToken(patientId, token) {
    if (!patientId || !token) return { success: false, error: 'patient_id and token required' };

    try {
        await db.query(
            'DELETE FROM push_tokens WHERE patient_id = ? AND token = ?',
            [patientId, token]
        );
        return { success: true };
    } catch (err) {
        logger.error('Failed to unregister push token', { error: err.message, patientId });
        return { success: false, error: err.message };
    }
}

/**
 * Unregister all tokens for a patient (e.g., on account deletion).
 * @param {string} patientId
 */
async function unregisterAllTokens(patientId) {
    try {
        await db.query('DELETE FROM push_tokens WHERE patient_id = ?', [patientId]);
        return { success: true };
    } catch (err) {
        logger.error('Failed to unregister all tokens', { error: err.message, patientId });
        return { success: false, error: err.message };
    }
}

/**
 * Send push notification to a single patient (all their devices).
 * Sends via Web Push for web tokens and FCM for mobile tokens.
 *
 * @param {string} patientId
 * @param {string} title
 * @param {string} body
 * @param {object} data - Additional payload (url, type, notification_id, etc.)
 * @returns {Promise<{success: boolean, sent: number, failed: number}>}
 */
async function sendToPatient(patientId, title, body, data = {}) {
    try {
        const [tokens] = await db.query(
            'SELECT id, platform, token, endpoint, p256dh, auth_key FROM push_tokens WHERE patient_id = ?',
            [patientId]
        );

        if (!tokens || tokens.length === 0) {
            return { success: true, sent: 0, failed: 0, reason: 'no_tokens' };
        }

        let sent = 0;
        let failed = 0;
        const invalidTokenIds = [];

        for (const t of tokens) {
            try {
                if (t.platform === 'web') {
                    await sendWebPush(t, title, body, data);
                    sent++;
                } else {
                    // android or ios — use FCM
                    const result = await firebase.sendNotification(t.token, title, body, data);
                    if (result.success) {
                        sent++;
                    } else if (result.shouldRemove) {
                        invalidTokenIds.push(t.id);
                        failed++;
                    } else {
                        failed++;
                    }
                }
            } catch (err) {
                failed++;
                // Web Push 410 Gone = subscription expired
                if (err.statusCode === 410 || err.statusCode === 404) {
                    invalidTokenIds.push(t.id);
                }
            }
        }

        // Cleanup invalid tokens (fire-and-forget)
        if (invalidTokenIds.length > 0) {
            db.query(
                'DELETE FROM push_tokens WHERE id IN (?)',
                [invalidTokenIds]
            ).catch(function(err) {
                logger.error('Failed to cleanup invalid tokens', { error: err.message });
            });
        }

        return { success: true, sent, failed };
    } catch (err) {
        logger.error('Failed to send push to patient', { error: err.message, patientId });
        return { success: false, sent: 0, failed: 0, error: err.message };
    }
}

/**
 * Send push notification to ALL patients with tokens (for announcements).
 * Batches FCM sends (max 500) and Web Push individually.
 *
 * @param {string} title
 * @param {string} body
 * @param {object} data
 * @returns {Promise<{success: boolean, sent: number, failed: number}>}
 */
async function sendToAll(title, body, data = {}) {
    try {
        const [tokens] = await db.query(
            'SELECT id, platform, token, endpoint, p256dh, auth_key FROM push_tokens'
        );

        if (!tokens || tokens.length === 0) {
            return { success: true, sent: 0, failed: 0 };
        }

        const webTokens = tokens.filter(function(t) { return t.platform === 'web'; });
        const mobileTokens = tokens.filter(function(t) { return t.platform !== 'web'; });

        let sent = 0;
        let failed = 0;
        const invalidTokenIds = [];

        // Send Web Push individually
        for (const t of webTokens) {
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

        // Send FCM in batches of 500
        if (mobileTokens.length > 0) {
            var batchSize = 500;
            for (var i = 0; i < mobileTokens.length; i += batchSize) {
                var batch = mobileTokens.slice(i, i + batchSize);
                var fcmTokens = batch.map(function(t) { return t.token; });

                var result = await firebase.sendNotificationToMultiple(fcmTokens, title, body, data);
                if (result.success) {
                    sent += result.successCount;
                    failed += result.failureCount;

                    // Map invalid FCM tokens back to DB IDs
                    if (result.invalidTokens && result.invalidTokens.length > 0) {
                        for (var j = 0; j < batch.length; j++) {
                            if (result.invalidTokens.indexOf(batch[j].token) !== -1) {
                                invalidTokenIds.push(batch[j].id);
                            }
                        }
                    }
                } else {
                    failed += batch.length;
                }
            }
        }

        // Cleanup invalid tokens (fire-and-forget)
        if (invalidTokenIds.length > 0) {
            db.query(
                'DELETE FROM push_tokens WHERE id IN (?)',
                [invalidTokenIds]
            ).catch(function(err) {
                logger.error('Failed to cleanup invalid tokens after broadcast', { error: err.message });
            });
        }

        return { success: true, sent, failed };
    } catch (err) {
        logger.error('Failed to broadcast push', { error: err.message });
        return { success: false, sent: 0, failed: 0, error: err.message };
    }
}

/**
 * Send a Web Push notification to a single subscription.
 * @param {object} tokenRow - Row from push_tokens table
 * @param {string} title
 * @param {string} body
 * @param {object} data
 */
async function sendWebPush(tokenRow, title, body, data) {
    if (!webPushReady) {
        throw new Error('Web Push not configured');
    }

    var subscription = {
        endpoint: tokenRow.endpoint || tokenRow.token,
        keys: {
            p256dh: tokenRow.p256dh,
            auth: tokenRow.auth_key
        }
    };

    var payload = JSON.stringify({
        title: title,
        body: body,
        url: data.url || data.link || '/patient-menu.html',
        icon: '/images/pwa-icons/icon-192x192.png',
        badge: '/images/pwa-icons/icon-72x72.png',
        data: data
    });

    return webpush.sendNotification(subscription, payload, { TTL: 86400 });
}

/**
 * Get the public VAPID key for frontend subscription.
 * @returns {string|null}
 */
function getVapidPublicKey() {
    return VAPID_PUBLIC_KEY || null;
}

module.exports = {
    registerToken,
    unregisterToken,
    unregisterAllTokens,
    sendToPatient,
    sendToAll,
    sendWebPush,
    getVapidPublicKey,
    isReady: function() { return webPushReady; }
};

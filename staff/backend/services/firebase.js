/**
 * Firebase Admin SDK service for push notifications.
 *
 * Initialization is intentionally lazy: a missing credential must not delay or
 * fail the HTTP server startup. The first push attempt performs initialization
 * and returns the existing failure contract when Firebase is unavailable.
 */
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');
const logger = require('../utils/logger');

let firebaseInitialized = false;
let firebaseInitializationAttempted = false;

function resolveFirebaseCredential() {
    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
        return admin.credential.cert(serviceAccount);
    }

    if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
        return admin.credential.cert(path.resolve(process.env.FIREBASE_SERVICE_ACCOUNT_PATH));
    }

    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        return admin.credential.applicationDefault();
    }

    const legacyCredentialPath = path.join(
        __dirname,
        '../config/dokterdibya-8583b-firebase-adminsdk-fbsvc-53a279e55b.json'
    );
    if (fs.existsSync(legacyCredentialPath)) {
        return admin.credential.cert(legacyCredentialPath);
    }

    return null;
}

function initializeFirebase() {
    if (firebaseInitialized) return true;
    if (firebaseInitializationAttempted) return false;

    firebaseInitializationAttempted = true;

    try {
        if (Array.isArray(admin.apps) && admin.apps.length > 0) {
            firebaseInitialized = true;
            return true;
        }

        const credential = resolveFirebaseCredential();
        if (!credential) {
            logger.warn('Firebase push notifications unavailable: credentials are not configured');
            return false;
        }

        admin.initializeApp({ credential });
        firebaseInitialized = true;
        logger.info('Firebase Admin SDK initialized');
        return true;
    } catch (error) {
        logger.warn('Firebase push notifications unavailable', { error: error.message });
        return false;
    }
}

/**
 * Send push notification to a single device.
 */
async function sendNotification(fcmToken, title, body, data = {}) {
    if (!initializeFirebase()) {
        return { success: false, error: 'Firebase not initialized' };
    }

    const message = {
        token: fcmToken,
        notification: { title, body },
        data: {
            ...data,
            title: String(title),
            body: String(body)
        },
        android: {
            priority: 'high',
            notification: {
                channelId: 'dokterdibya_notifications_v2',
                priority: 'high',
                defaultSound: true,
                defaultVibrateTimings: true,
                sound: 'default'
            }
        }
    };

    try {
        const response = await admin.messaging().send(message);
        logger.info('FCM notification sent', { messageId: response });
        return { success: true, messageId: response };
    } catch (error) {
        logger.error('FCM send failed', { error: error.message });

        if (error.code === 'messaging/invalid-registration-token'
            || error.code === 'messaging/registration-token-not-registered') {
            return { success: false, error: 'invalid_token', shouldRemove: true };
        }

        return { success: false, error: error.message };
    }
}

/**
 * Send push notification to multiple devices.
 */
async function sendNotificationToMultiple(fcmTokens, title, body, data = {}) {
    if (!fcmTokens || fcmTokens.length === 0) {
        return { success: true, successCount: 0, failureCount: 0 };
    }

    if (!initializeFirebase()) {
        return { success: false, error: 'Firebase not initialized' };
    }

    const message = {
        notification: { title, body },
        data: {
            ...data,
            title: String(title),
            body: String(body)
        },
        android: {
            priority: 'high',
            notification: {
                channelId: 'dokterdibya_notifications_v2',
                priority: 'high',
                defaultSound: true,
                defaultVibrateTimings: true,
                sound: 'default'
            }
        },
        tokens: fcmTokens
    };

    try {
        const response = await admin.messaging().sendEachForMulticast(message);
        const invalidTokens = [];

        response.responses.forEach((result, index) => {
            if (!result.success
                && (result.error?.code === 'messaging/invalid-registration-token'
                    || result.error?.code === 'messaging/registration-token-not-registered')) {
                invalidTokens.push(fcmTokens[index]);
            }
        });

        logger.info('FCM multicast completed', {
            successCount: response.successCount,
            failureCount: response.failureCount
        });

        return {
            success: true,
            successCount: response.successCount,
            failureCount: response.failureCount,
            invalidTokens
        };
    } catch (error) {
        logger.error('FCM multicast failed', { error: error.message });
        return { success: false, error: error.message };
    }
}

module.exports = {
    initializeFirebase,
    sendNotification,
    sendNotificationToMultiple,
    isInitialized: () => firebaseInitialized
};

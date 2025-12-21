/**
 * Firebase Admin SDK service for push notifications
 */
const admin = require('firebase-admin');
const path = require('path');

// Initialize Firebase Admin SDK
const serviceAccountPath = path.join(__dirname, '../config/dokterdibya-8583b-firebase-adminsdk-fbsvc-53a279e55b.json');

let firebaseInitialized = false;

try {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccountPath)
    });
    firebaseInitialized = true;
    console.log('✅ Firebase Admin SDK initialized');
} catch (error) {
    console.error('❌ Firebase Admin SDK initialization failed:', error.message);
}

/**
 * Send push notification to a single device
 * @param {string} fcmToken - Device FCM token
 * @param {string} title - Notification title
 * @param {string} body - Notification body
 * @param {object} data - Additional data payload
 * @returns {Promise<object>} - Send result
 */
async function sendNotification(fcmToken, title, body, data = {}) {
    if (!firebaseInitialized) {
        console.error('Firebase not initialized');
        return { success: false, error: 'Firebase not initialized' };
    }

    const message = {
        token: fcmToken,
        notification: {
            title: title,
            body: body
        },
        data: {
            ...data,
            // Convert all values to strings (FCM requirement)
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
        console.log('✅ FCM notification sent:', response);
        return { success: true, messageId: response };
    } catch (error) {
        console.error('❌ FCM send error:', error.message);

        // Handle invalid token
        if (error.code === 'messaging/invalid-registration-token' ||
            error.code === 'messaging/registration-token-not-registered') {
            return { success: false, error: 'invalid_token', shouldRemove: true };
        }

        return { success: false, error: error.message };
    }
}

/**
 * Send push notification to multiple devices
 * @param {string[]} fcmTokens - Array of FCM tokens
 * @param {string} title - Notification title
 * @param {string} body - Notification body
 * @param {object} data - Additional data payload
 * @returns {Promise<object>} - Send results
 */
async function sendNotificationToMultiple(fcmTokens, title, body, data = {}) {
    if (!firebaseInitialized) {
        console.error('Firebase not initialized');
        return { success: false, error: 'Firebase not initialized' };
    }

    if (!fcmTokens || fcmTokens.length === 0) {
        return { success: true, successCount: 0, failureCount: 0 };
    }

    const message = {
        notification: {
            title: title,
            body: body
        },
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
        console.log(`✅ FCM multicast: ${response.successCount} success, ${response.failureCount} failed`);

        // Collect invalid tokens for removal
        const invalidTokens = [];
        response.responses.forEach((resp, idx) => {
            if (!resp.success) {
                const error = resp.error;
                if (error.code === 'messaging/invalid-registration-token' ||
                    error.code === 'messaging/registration-token-not-registered') {
                    invalidTokens.push(fcmTokens[idx]);
                }
            }
        });

        return {
            success: true,
            successCount: response.successCount,
            failureCount: response.failureCount,
            invalidTokens: invalidTokens
        };
    } catch (error) {
        console.error('❌ FCM multicast error:', error.message);
        return { success: false, error: error.message };
    }
}

module.exports = {
    sendNotification,
    sendNotificationToMultiple,
    isInitialized: () => firebaseInitialized
};

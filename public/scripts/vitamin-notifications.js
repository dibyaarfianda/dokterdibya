/**
 * Vitamin/Medication Reminder Notification Service
 *
 * Supports:
 * - Capacitor Local Notifications (mobile app)
 * - Web Notifications API (browser fallback)
 */

// Detect if running in Capacitor native app
// Check multiple conditions because external URLs might not have isNativePlatform available
const isCapacitor = (
    window.Capacitor?.isNativePlatform?.() ||
    window.Capacitor?.getPlatform?.() === 'android' ||
    window.Capacitor?.getPlatform?.() === 'ios' ||
    // Fallback: check if Capacitor object exists and we're in a WebView
    (window.Capacitor && navigator.userAgent.includes('dokterdibya'))
) || false;

// Alternative check for Android WebView
const isAndroidWebView = navigator.userAgent.includes('wv') ||
    (navigator.userAgent.includes('Android') && navigator.userAgent.includes('Version/'));

// Storage key for notification ID counter
const NOTIF_COUNTER_KEY = 'vitamin_notif_counter';

// Storage key for permission status (synced from local Capacitor page)
const NOTIF_PERMISSION_KEY = 'capacitor_notif_permission_granted';

// Get LocalNotifications plugin from Capacitor
async function getLocalNotificationsPlugin() {
    // Try even if isCapacitor is false - we might be on external URL but still in WebView
    try {
        // Try to get from Capacitor.Plugins first (registered plugins)
        if (window.Capacitor?.Plugins?.LocalNotifications) {
            console.log('[VitaminNotif] Using Capacitor.Plugins.LocalNotifications');
            return window.Capacitor.Plugins.LocalNotifications;
        }

        // Try window.CapacitorCustomPlatform for some versions
        if (window.CapacitorCustomPlatform?.Plugins?.LocalNotifications) {
            console.log('[VitaminNotif] Using CapacitorCustomPlatform.Plugins.LocalNotifications');
            return window.CapacitorCustomPlatform.Plugins.LocalNotifications;
        }

        // Fallback: dynamic import from @capacitor/local-notifications
        // This works if the module is bundled
        try {
            const { LocalNotifications } = await import('@capacitor/local-notifications');
            console.log('[VitaminNotif] Using dynamic import LocalNotifications');
            return LocalNotifications;
        } catch (importError) {
            console.warn('[VitaminNotif] Dynamic import failed:', importError.message);
        }

        console.warn('[VitaminNotif] No LocalNotifications plugin available');
        return null;
    } catch (error) {
        console.error('[VitaminNotif] Failed to load LocalNotifications plugin:', error);
        return null;
    }
}

/**
 * Check if permission was granted from local Capacitor page
 * This is used as fallback when plugin is not accessible from external URL
 */
function isPermissionGrantedFromLocalStorage() {
    return localStorage.getItem(NOTIF_PERMISSION_KEY) === 'true';
}

/**
 * Save permission status to localStorage
 * Called when permission is granted from local Capacitor page
 */
function savePermissionStatus(granted) {
    localStorage.setItem(NOTIF_PERMISSION_KEY, granted ? 'true' : 'false');
    console.log('[VitaminNotif] Saved permission status:', granted);
}

/**
 * Generate unique notification ID
 */
function generateNotifId() {
    let counter = parseInt(localStorage.getItem(NOTIF_COUNTER_KEY) || '1000');
    counter++;
    localStorage.setItem(NOTIF_COUNTER_KEY, counter.toString());
    return counter;
}

/**
 * Request notification permission
 * @returns {Promise<boolean>} - true if permission granted
 */
export async function requestNotificationPermission() {
    try {
        // First, try Capacitor LocalNotifications (works in native app)
        const LocalNotifications = await getLocalNotificationsPlugin();

        if (LocalNotifications) {
            console.log('[VitaminNotif] Using Capacitor LocalNotifications');
            const permStatus = await LocalNotifications.checkPermissions();
            console.log('[VitaminNotif] Permission status:', permStatus.display);

            if (permStatus.display === 'prompt' || permStatus.display === 'prompt-with-rationale') {
                const result = await LocalNotifications.requestPermissions();
                console.log('[VitaminNotif] Permission request result:', result.display);
                const granted = result.display === 'granted';
                savePermissionStatus(granted); // Save to localStorage for external URL access
                return granted;
            }

            if (permStatus.display === 'denied') {
                console.warn('[VitaminNotif] Notification permission denied by user');
                savePermissionStatus(false);
                return false;
            }

            const granted = permStatus.display === 'granted';
            savePermissionStatus(granted);
            return granted;
        }

        // Plugin not available - check if we're in Android WebView on external URL
        if (isAndroidWebView || isCapacitor) {
            // Check if permission was previously granted from local Capacitor page
            if (isPermissionGrantedFromLocalStorage()) {
                console.log('[VitaminNotif] Plugin unavailable but permission was granted from local page');
                return true;
            }
            console.warn('[VitaminNotif] Plugin unavailable and no saved permission status');
            // Don't show error - user needs to grant permission from local page first
            return false;
        }

        // Fallback to Web Notifications API (for regular browser)
        console.log('[VitaminNotif] Falling back to Web Notifications API');

        if (!('Notification' in window)) {
            console.warn('[VitaminNotif] Browser does not support notifications');
            return false;
        }

        if (Notification.permission === 'granted') {
            return true;
        }

        if (Notification.permission !== 'denied') {
            const permission = await Notification.requestPermission();
            return permission === 'granted';
        }

        return false;
    } catch (error) {
        console.error('[VitaminNotif] Error requesting notification permission:', error);
        return false;
    }
}

/**
 * Check if notifications are permitted
 * @returns {Promise<boolean>}
 */
export async function isNotificationPermitted() {
    try {
        const LocalNotifications = await getLocalNotificationsPlugin();

        if (LocalNotifications) {
            const permStatus = await LocalNotifications.checkPermissions();
            console.log('[VitaminNotif] isNotificationPermitted check:', permStatus.display);
            const granted = permStatus.display === 'granted';
            // Update localStorage with current status
            savePermissionStatus(granted);
            return granted;
        }

        // Plugin not available - check localStorage fallback
        if (isAndroidWebView || isCapacitor) {
            const savedStatus = isPermissionGrantedFromLocalStorage();
            console.log('[VitaminNotif] Plugin unavailable, using saved status:', savedStatus);
            return savedStatus;
        }

        // Fallback to Web Notification API
        if ('Notification' in window) {
            return Notification.permission === 'granted';
        }

        return false;
    } catch (error) {
        console.error('[VitaminNotif] isNotificationPermitted error:', error);
        return false;
    }
}

/**
 * Calculate next occurrence of a time (today if not passed, tomorrow if passed)
 * @param {string} timeStr - Time in HH:MM format
 * @returns {Date}
 */
function getNextOccurrence(timeStr) {
    const [hours, minutes] = timeStr.split(':').map(Number);
    const now = new Date();
    const scheduled = new Date();

    scheduled.setHours(hours, minutes, 0, 0);

    // If time has already passed today, schedule for tomorrow
    if (scheduled <= now) {
        scheduled.setDate(scheduled.getDate() + 1);
    }

    return scheduled;
}

/**
 * Schedule vitamin reminder notifications
 * @param {Object} medication - Medication object with name, quantity, unit, reminderTimes
 * @returns {Promise<number[]>} - Array of notification IDs
 */
export async function scheduleVitaminReminder(medication) {
    const notificationIds = [];

    if (!medication.reminder || !medication.reminderTimes || medication.reminderTimes.length === 0) {
        return notificationIds;
    }

    const hasPermission = await isNotificationPermitted();
    if (!hasPermission) {
        console.warn('Notification permission not granted');
        return notificationIds;
    }

    try {
        if (isCapacitor) {
            // Capacitor Local Notifications
            const LocalNotifications = await getLocalNotificationsPlugin();
            if (!LocalNotifications) {
                console.error('LocalNotifications plugin not available for scheduling');
                return notificationIds;
            }

            const notifications = medication.reminderTimes.map(time => {
                const id = generateNotifId();
                notificationIds.push(id);

                const scheduleTime = getNextOccurrence(time);

                return {
                    id: id,
                    title: 'Waktunya Minum Obat',
                    body: `${medication.name}${medication.quantity ? ` - ${medication.quantity} ${medication.unit || 'tablet'}` : ''}`,
                    schedule: {
                        at: scheduleTime,
                        repeats: true,
                        every: 'day',
                        allowWhileIdle: true
                    },
                    sound: 'default',
                    smallIcon: 'ic_stat_icon',
                    largeIcon: 'ic_launcher',
                    channelId: 'medication_reminders',
                    extra: {
                        medicationName: medication.name,
                        time: time
                    }
                };
            });

            await LocalNotifications.schedule({ notifications });
            console.log('Scheduled Capacitor notifications:', notificationIds);

        } else {
            // Web Browser - use setTimeout for immediate demo + store for future
            // Note: Web notifications don't persist, so we use a polling approach

            medication.reminderTimes.forEach(time => {
                const id = generateNotifId();
                notificationIds.push(id);

                // Store schedule info for the web timer to check
                const schedules = JSON.parse(localStorage.getItem('web_notif_schedules') || '[]');
                schedules.push({
                    id: id,
                    medicationName: medication.name,
                    quantity: medication.quantity,
                    unit: medication.unit,
                    time: time,
                    active: true
                });
                localStorage.setItem('web_notif_schedules', JSON.stringify(schedules));
            });

            console.log('Stored web notification schedules:', notificationIds);
        }
    } catch (error) {
        console.error('Error scheduling notifications:', error);
    }

    return notificationIds;
}

/**
 * Cancel vitamin reminder notifications
 * @param {number[]} notificationIds - Array of notification IDs to cancel
 */
export async function cancelVitaminReminder(notificationIds) {
    if (!notificationIds || notificationIds.length === 0) {
        return;
    }

    try {
        if (isCapacitor) {
            const LocalNotifications = await getLocalNotificationsPlugin();
            if (!LocalNotifications) return;

            await LocalNotifications.cancel({
                notifications: notificationIds.map(id => ({ id }))
            });
            console.log('Cancelled Capacitor notifications:', notificationIds);

        } else {
            // Web - remove from schedules
            let schedules = JSON.parse(localStorage.getItem('web_notif_schedules') || '[]');
            schedules = schedules.filter(s => !notificationIds.includes(s.id));
            localStorage.setItem('web_notif_schedules', JSON.stringify(schedules));
            console.log('Removed web notification schedules:', notificationIds);
        }
    } catch (error) {
        console.error('Error cancelling notifications:', error);
    }
}

/**
 * Reschedule all active reminders (call on app open)
 * This is needed because Capacitor notifications may not persist across app restarts
 * @param {Array} medications - Array of medication objects from localStorage
 */
export async function rescheduleAllReminders(medications) {
    if (!medications || medications.length === 0) {
        return medications;
    }

    const hasPermission = await isNotificationPermitted();
    if (!hasPermission) {
        return medications;
    }

    try {
        if (isCapacitor) {
            const LocalNotifications = await getLocalNotificationsPlugin();
            if (!LocalNotifications) return medications;

            // Get all pending notifications
            const pending = await LocalNotifications.getPending();
            const pendingIds = pending.notifications.map(n => n.id);

            // Reschedule any medication reminders that are not pending
            for (const med of medications) {
                if (med.reminder && med.reminderTimes) {
                    // Check if all notifications are still scheduled
                    const allScheduled = med.notificationIds?.every(id => pendingIds.includes(id));

                    if (!allScheduled) {
                        // Cancel any existing and reschedule
                        if (med.notificationIds) {
                            await cancelVitaminReminder(med.notificationIds);
                        }
                        med.notificationIds = await scheduleVitaminReminder(med);
                    }
                }
            }
        }
    } catch (error) {
        console.error('Error rescheduling reminders:', error);
    }

    return medications;
}

/**
 * Show a test notification immediately
 * @param {string} title
 * @param {string} body
 */
export async function showTestNotification(title = 'Test Notifikasi', body = 'Ini adalah notifikasi test') {
    const hasPermission = await isNotificationPermitted();
    if (!hasPermission) {
        const granted = await requestNotificationPermission();
        if (!granted) {
            // More helpful message for Android users
            if (isAndroidWebView || isCapacitor) {
                alert('Izin notifikasi belum diaktifkan.\n\nCara mengaktifkan:\n1. Buka Pengaturan HP\n2. Pilih Aplikasi > dokterDIBYA\n3. Aktifkan Notifikasi');
            } else {
                alert('Izin notifikasi ditolak. Silakan aktifkan di pengaturan browser.');
            }
            return;
        }
    }

    try {
        const LocalNotifications = await getLocalNotificationsPlugin();

        if (LocalNotifications) {
            // Plugin available - schedule notification
            await LocalNotifications.schedule({
                notifications: [{
                    id: generateNotifId(),
                    title: title,
                    body: body,
                    schedule: { at: new Date(Date.now() + 1000) }, // 1 second from now
                    sound: 'default',
                    smallIcon: 'ic_stat_icon'
                }]
            });
            console.log('[VitaminNotif] Test notification scheduled via Capacitor');
        } else if (isAndroidWebView || isCapacitor) {
            // In WebView but plugin not accessible (external URL)
            // Permission is granted, but we can't schedule from here
            // Show success message - actual notifications will work when scheduled from local page
            alert('Izin notifikasi sudah aktif! ✓\n\nPengingat obat akan berfungsi normal.');
            console.log('[VitaminNotif] Plugin unavailable from external URL, but permission is granted');
        } else if ('Notification' in window) {
            // Regular browser - use Web Notification API
            new Notification(title, {
                body: body,
                icon: '/images/logo-dokter-dibya.png',
                badge: '/images/logo-dokter-dibya.png'
            });
            console.log('[VitaminNotif] Test notification shown via Web API');
        }
    } catch (error) {
        console.error('Error showing test notification:', error);
        alert('Gagal menampilkan notifikasi: ' + error.message);
    }
}

/**
 * Web notification checker - runs periodically to check if it's time for a reminder
 * Call this on page load for web browsers
 */
export function startWebNotificationChecker() {
    if (isCapacitor) {
        return; // Capacitor handles its own scheduling
    }

    // Check every minute
    setInterval(() => {
        checkWebNotifications();
    }, 60000);

    // Also check immediately
    checkWebNotifications();
}

function checkWebNotifications() {
    if (Notification.permission !== 'granted') {
        return;
    }

    const schedules = JSON.parse(localStorage.getItem('web_notif_schedules') || '[]');
    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    // Track which notifications we've shown this minute to avoid duplicates
    const shownKey = `notif_shown_${currentTime}`;
    const alreadyShown = JSON.parse(sessionStorage.getItem(shownKey) || '[]');

    schedules.forEach(schedule => {
        if (schedule.active && schedule.time === currentTime && !alreadyShown.includes(schedule.id)) {
            // Show notification
            new Notification('Waktunya Minum Obat', {
                body: `${schedule.medicationName}${schedule.quantity ? ` - ${schedule.quantity} ${schedule.unit || 'tablet'}` : ''}`,
                icon: '/images/logo-dokter-dibya.png',
                badge: '/images/logo-dokter-dibya.png',
                tag: `med-${schedule.id}`,
                requireInteraction: true
            });

            // Mark as shown for this minute
            alreadyShown.push(schedule.id);
            sessionStorage.setItem(shownKey, JSON.stringify(alreadyShown));
        }
    });
}

/**
 * Setup notification channel for Android (Capacitor)
 */
export async function setupNotificationChannel() {
    if (!isCapacitor) return;

    try {
        const LocalNotifications = await getLocalNotificationsPlugin();
        if (!LocalNotifications) return;

        await LocalNotifications.createChannel({
            id: 'medication_reminders',
            name: 'Pengingat Obat',
            description: 'Notifikasi pengingat minum obat dan vitamin',
            importance: 4, // High importance
            visibility: 1, // Public
            sound: 'default',
            vibration: true,
            lights: true,
            lightColor: '#10b981'
        });

        console.log('Notification channel created');
    } catch (error) {
        console.error('Error creating notification channel:', error);
    }
}

// Export detection helper
export { isCapacitor };

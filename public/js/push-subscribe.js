/**
 * PWA Web Push Subscription Manager
 * Handles subscribing/unsubscribing to Web Push notifications.
 * Include this script in patient-facing HTML pages (after login).
 *
 * Flow:
 * 1. Check if Push API is supported
 * 2. Get VAPID public key from backend
 * 3. Subscribe to push via service worker
 * 4. Send subscription to backend (POST /api/patients/push-token)
 * 5. On logout, unsubscribe and notify backend
 */
(function() {
    'use strict';

    var LOG_PREFIX = '[PushSub]';

    // Check if Push API is available
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        console.log(LOG_PREFIX, 'Push not supported in this browser');
        return;
    }

    // Get auth token
    function getToken() {
        return localStorage.getItem('vps_auth_token');
    }

    // Wait for service worker to be ready, then attempt subscription
    function init() {
        var token = getToken();
        if (!token) {
            console.log(LOG_PREFIX, 'No auth token, skipping push subscription');
            return;
        }

        // Check notification permission first
        if (!('Notification' in window)) {
            console.log(LOG_PREFIX, 'Notification API not supported');
            return;
        }

        if (Notification.permission === 'denied') {
            console.log(LOG_PREFIX, 'Notification permission denied');
            showNotifBanner();
            return;
        }

        if (Notification.permission === 'default') {
            // Not yet asked — show banner to prompt user
            console.log(LOG_PREFIX, 'Notification permission not yet granted, showing banner');
            showNotifBanner();
            return;
        }

        // Permission granted — proceed with subscription
        doSubscribe(token);
    }

    // Perform the actual push subscription
    function doSubscribe(token) {
        navigator.serviceWorker.ready.then(function(registration) {
            // Check existing subscription
            registration.pushManager.getSubscription().then(function(existing) {
                if (existing) {
                    console.log(LOG_PREFIX, 'Already subscribed, syncing with backend');
                    sendSubscriptionToBackend(existing, token);
                    return;
                }

                // Not subscribed yet — get VAPID key and subscribe
                fetchVapidKey().then(function(vapidKey) {
                    if (!vapidKey) return;

                    subscribeToPush(registration, vapidKey, token);
                });
            });
        });
    }

    // Show notification permission prompt (modal or banner)
    function showNotifBanner() {
        function tryShow() {
            // Check if user dismissed modal recently (skip for 7 days)
            var dismissed = localStorage.getItem('notif_modal_dismissed');
            if (dismissed) {
                var dismissedDate = parseInt(dismissed, 10);
                var daysSince = (Date.now() - dismissedDate) / (1000 * 60 * 60 * 24);
                if (daysSince < 7) {
                    // Show inline banner instead of modal
                    var banner = document.getElementById('notif-permission-banner');
                    if (banner) banner.style.display = 'block';
                    return;
                }
            }

            // Show modal popup
            var modal = document.getElementById('notif-permission-modal');
            if (modal) {
                modal.style.display = 'block';
            } else {
                // Fallback to inline banner if modal doesn't exist
                var banner = document.getElementById('notif-permission-banner');
                if (banner) banner.style.display = 'block';
            }
        }
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', tryShow);
        } else {
            tryShow();
        }
    }

    // Dismiss modal (user tapped "Nanti saja")
    window.dismissNotifModal = function() {
        var modal = document.getElementById('notif-permission-modal');
        if (modal) modal.style.display = 'none';
        localStorage.setItem('notif_modal_dismissed', String(Date.now()));
        // Show inline banner as a subtle reminder
        var banner = document.getElementById('notif-permission-banner');
        if (banner) banner.style.display = 'block';
    };

    // Request notification permission (called from banner or modal button)
    window.requestNotifPermission = function() {
        Notification.requestPermission().then(function(permission) {
            var banner = document.getElementById('notif-permission-banner');
            var modal = document.getElementById('notif-permission-modal');
            if (permission === 'granted') {
                console.log(LOG_PREFIX, 'Permission granted by user');
                if (banner) banner.style.display = 'none';
                if (modal) modal.style.display = 'none';
                localStorage.removeItem('notif_modal_dismissed');
                var token = getToken();
                if (token) doSubscribe(token);
            } else if (permission === 'denied') {
                console.log(LOG_PREFIX, 'Permission denied by user');
                if (modal) modal.style.display = 'none';
                if (banner) {
                    banner.innerHTML = '<div style="padding:14px 18px;color:#ff6b6b;font-size:13px;">' +
                        '<i class="fa fa-times-circle"></i> Notifikasi diblokir. Buka pengaturan browser untuk mengaktifkan.' +
                        '</div>';
                }
            }
        });
    };

    // Fetch VAPID public key from backend
    function fetchVapidKey() {
        return fetch('/api/patients/vapid-key')
            .then(function(res) { return res.json(); })
            .then(function(data) {
                if (data.success && data.vapidPublicKey) {
                    return data.vapidPublicKey;
                }
                console.warn(LOG_PREFIX, 'VAPID key not available');
                return null;
            })
            .catch(function(err) {
                console.warn(LOG_PREFIX, 'Failed to fetch VAPID key:', err.message);
                return null;
            });
    }

    // Convert VAPID key from base64 URL to Uint8Array
    function urlBase64ToUint8Array(base64String) {
        var padding = '='.repeat((4 - base64String.length % 4) % 4);
        var base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
        var rawData = window.atob(base64);
        var outputArray = new Uint8Array(rawData.length);
        for (var i = 0; i < rawData.length; i++) {
            outputArray[i] = rawData.charCodeAt(i);
        }
        return outputArray;
    }

    // Subscribe to push notifications
    function subscribeToPush(registration, vapidKey, authToken) {
        var options = {
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(vapidKey)
        };

        registration.pushManager.subscribe(options)
            .then(function(subscription) {
                console.log(LOG_PREFIX, 'Subscribed to Web Push');
                sendSubscriptionToBackend(subscription, authToken);
            })
            .catch(function(err) {
                if (Notification.permission === 'denied') {
                    console.log(LOG_PREFIX, 'Notification permission denied by user');
                } else {
                    console.error(LOG_PREFIX, 'Subscribe failed:', err);
                }
            });
    }

    // Send subscription to backend
    function sendSubscriptionToBackend(subscription, authToken) {
        var subJSON = subscription.toJSON();

        fetch('/api/patients/push-token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + authToken
            },
            body: JSON.stringify({
                platform: 'web',
                endpoint: subJSON.endpoint,
                p256dh: subJSON.keys ? subJSON.keys.p256dh : null,
                auth: subJSON.keys ? subJSON.keys.auth : null
            })
        })
        .then(function(res) { return res.json(); })
        .then(function(data) {
            if (data.success) {
                console.log(LOG_PREFIX, 'Subscription sent to backend');
            } else {
                console.warn(LOG_PREFIX, 'Backend rejected subscription:', data.message);
            }
        })
        .catch(function(err) {
            console.warn(LOG_PREFIX, 'Failed to send subscription:', err.message);
        });
    }

    /**
     * Unsubscribe from push (call on logout).
     * Exported as window.unsubscribeWebPush for use by logout flow.
     */
    function unsubscribeWebPush() {
        if (!('serviceWorker' in navigator)) return Promise.resolve();

        return navigator.serviceWorker.ready.then(function(registration) {
            return registration.pushManager.getSubscription();
        }).then(function(subscription) {
            if (!subscription) return;

            var endpoint = subscription.endpoint;
            var authToken = getToken();

            // Unsubscribe from browser
            return subscription.unsubscribe().then(function() {
                console.log(LOG_PREFIX, 'Unsubscribed from browser push');

                // Notify backend (fire-and-forget)
                if (authToken) {
                    fetch('/api/patients/push-token', {
                        method: 'DELETE',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': 'Bearer ' + authToken
                        },
                        body: JSON.stringify({ endpoint: endpoint })
                    }).catch(function() {});
                }
            });
        }).catch(function(err) {
            console.warn(LOG_PREFIX, 'Unsubscribe error:', err.message);
        });
    }

    // Export for logout flow
    window.unsubscribeWebPush = unsubscribeWebPush;

    // Also register Capacitor FCM token if running in Android/iOS WebView
    function registerCapacitorToken() {
        var token = getToken();
        if (!token) return;

        // Check if Capacitor plugin is accessible
        if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.PushNotifications) {
            var Push = window.Capacitor.Plugins.PushNotifications;

            // Listen for token
            Push.addListener('registration', function(fcmToken) {
                if (!fcmToken || !fcmToken.value) return;
                console.log(LOG_PREFIX, 'Capacitor FCM token received');

                var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
                fetch('/api/patients/push-token', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + token
                    },
                    body: JSON.stringify({
                        platform: isIOS ? 'ios' : 'android',
                        token: fcmToken.value
                    })
                }).catch(function() {});
            });

            // Trigger registration
            Push.register().catch(function() {});
        }
    }

    // Initialize after short delay (don't block page load)
    setTimeout(function() {
        init();
        registerCapacitorToken();
    }, 3000);
})();

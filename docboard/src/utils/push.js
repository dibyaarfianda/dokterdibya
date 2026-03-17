import { api } from '../services/api';

/**
 * Check if push notifications are supported in this browser.
 */
export function isPushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

/**
 * Get current push subscription (if any).
 */
async function getExistingSubscription() {
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

/**
 * Check if the user is currently subscribed to push.
 */
export async function isPushSubscribed() {
  if (!isPushSupported()) return false;
  try {
    const sub = await getExistingSubscription();
    return !!sub;
  } catch {
    return false;
  }
}

/**
 * Convert a base64 VAPID key to Uint8Array for applicationServerKey.
 */
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Subscribe to push notifications.
 * Requests permission, creates subscription, registers with backend.
 */
export async function subscribeToPush() {
  if (!isPushSupported()) {
    throw new Error('Push notifications tidak didukung browser ini');
  }

  // Request notification permission
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Izin notifikasi ditolak');
  }

  // Get VAPID key from backend
  const { vapidKey } = await api.getVapidKey();
  if (!vapidKey) {
    throw new Error('VAPID key tidak tersedia');
  }

  // Subscribe via service worker
  const reg = await navigator.serviceWorker.ready;
  const subscription = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidKey)
  });

  // Extract keys for backend
  const subJson = subscription.toJSON();
  await api.registerPush({
    endpoint: subJson.endpoint,
    platform: 'web',
    keys: {
      p256dh: subJson.keys.p256dh,
      auth: subJson.keys.auth
    }
  });

  return subscription;
}

/**
 * Unsubscribe from push notifications.
 */
export async function unsubscribeFromPush() {
  const subscription = await getExistingSubscription();
  if (subscription) {
    const endpoint = subscription.endpoint;
    await subscription.unsubscribe();
    await api.unregisterPush(endpoint);
  }
}

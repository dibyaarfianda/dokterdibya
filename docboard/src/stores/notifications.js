import { signal } from '@preact/signals';
import { api } from '../services/api';

export const unreadCount = signal(0);

let pollTimer = null;

/**
 * Fetch unread count from API and update signal.
 */
export async function refreshUnreadCount() {
  try {
    const data = await api.getUnreadCount();
    unreadCount.value = data.count || 0;
  } catch {
    // silently fail
  }
}

/**
 * Start polling unread count every 60 seconds.
 */
export function startUnreadPolling() {
  refreshUnreadCount();
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(refreshUnreadCount, 60000);
}

/**
 * Stop polling.
 */
export function stopUnreadPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

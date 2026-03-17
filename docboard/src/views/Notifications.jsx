import { useEffect, useState } from 'preact/hooks';
import { route } from 'preact-router';
import { api } from '../services/api';
import { LOCATIONS } from '../utils/constants';
import { relativeTime } from '../utils/date';
import { SkeletonList } from '../components/SkeletonLoader';
import { refreshUnreadCount } from '../stores/notifications';

const NOTIF_ICONS = {
  new_booking: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" stroke-width="2">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
      <line x1="12" y1="14" x2="12" y2="18" />
      <line x1="10" y1="16" x2="14" y2="16" />
    </svg>
  ),
  surgery_reminder: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" stroke-width="2">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12,6 12,12 16,14" />
    </svg>
  ),
  status_change: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" stroke-width="2">
      <polyline points="9,11 12,14 22,4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  ),
  sync_failure: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#EF4444" stroke-width="2">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  ),
  info: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#64748B" stroke-width="2">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  )
};

const NOTIF_ICON_BG = {
  new_booking: '#DBEAFE',
  surgery_reminder: '#FEF3C7',
  status_change: '#EDE9FE',
  sync_failure: '#FEE2E2',
  info: '#F1F5F9'
};

export default function Notifications() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadNotifications();
  }, []);

  async function loadNotifications() {
    try {
      const data = await api.getNotifications();
      setItems(data.notifications || []);
    } catch (err) {
      console.error('Failed to load notifications:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleMarkAllRead() {
    try {
      await api.markAllNotificationsRead();
      setItems(prev => prev.map(n => ({ ...n, is_read: 1 })));
      refreshUnreadCount();
    } catch (err) {
      console.error('Failed to mark all read:', err);
    }
  }

  async function handleTapNotification(notif) {
    // Mark as read if unread
    if (!notif.is_read) {
      try {
        await api.markNotificationRead(notif.id);
        setItems(prev => prev.map(n => n.id === notif.id ? { ...n, is_read: 1 } : n));
        refreshUnreadCount();
      } catch (err) {
        console.error('Failed to mark notification read:', err);
      }
    }

    // Navigate to surgery detail if applicable
    if (notif.reference_id && ['new_booking', 'surgery_reminder', 'status_change'].includes(notif.type)) {
      route(`/docboard/surgery/${notif.reference_id}`);
    }
  }

  const hasUnread = items.some(n => !n.is_read);

  return (
    <div class="view-notifications">
      <div class="page-header">
        <h1 class="page-title">Notifikasi</h1>
        {hasUnread && (
          <button class="btn-mark-all-read" onClick={handleMarkAllRead}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="9,11 12,14 22,4" />
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
            </svg>
            Tandai semua dibaca
          </button>
        )}
      </div>

      {loading ? (
        <SkeletonList count={5} />
      ) : items.length > 0 ? (
        <div class="notif-list">
          {items.map((n, i) => (
            <div
              key={n.id || i}
              class={`notif-item ${!n.is_read ? 'unread' : ''}`}
              onClick={() => handleTapNotification(n)}
              style={{ cursor: n.reference_id ? 'pointer' : 'default' }}
            >
              <div
                class="notif-icon"
                style={{ backgroundColor: NOTIF_ICON_BG[n.type] || NOTIF_ICON_BG.info }}
              >
                {NOTIF_ICONS[n.type] || NOTIF_ICONS.info}
              </div>
              <div class="notif-content">
                <div class="notif-title">{n.title}</div>
                <div class="notif-body">{n.message}</div>
                <div class="notif-meta">
                  {n.location && LOCATIONS[n.location] && (
                    <span
                      class="notif-location"
                      style={{ color: LOCATIONS[n.location].color }}
                    >
                      {LOCATIONS[n.location].shortName}
                    </span>
                  )}
                  <span class="notif-time">{relativeTime(n.created_at)}</span>
                </div>
              </div>
              {!n.is_read && <span class="notif-unread-dot" />}
            </div>
          ))}
        </div>
      ) : (
        <div class="empty-state">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" stroke-width="1.5">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
          <p>Belum ada notifikasi</p>
        </div>
      )}
    </div>
  );
}

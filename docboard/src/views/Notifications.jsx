import { useEffect, useState } from 'preact/hooks';
import { api } from '../services/api';
import { LOCATIONS } from '../utils/constants';
import { relativeTime } from '../utils/date';
import { SkeletonList } from '../components/SkeletonLoader';

const NOTIF_ICONS = {
  booking: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" stroke-width="2">
      <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="8.5" cy="7" r="4" />
      <line x1="20" y1="8" x2="20" y2="14" />
      <line x1="23" y1="11" x2="17" y2="11" />
    </svg>
  ),
  cancel: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#EF4444" stroke-width="2">
      <circle cx="12" cy="12" r="10" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  ),
  sync: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" stroke-width="2">
      <polyline points="23,4 23,10 17,10" />
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
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

  return (
    <div class="view-notifications">
      <div class="page-header">
        <h1 class="page-title">Notifikasi</h1>
      </div>

      {loading ? (
        <SkeletonList count={5} />
      ) : items.length > 0 ? (
        <div class="notif-list">
          {items.map((n, i) => (
            <div key={n.id || i} class={`notif-item ${n.read ? '' : 'unread'}`}>
              <div class="notif-icon">
                {NOTIF_ICONS[n.type] || NOTIF_ICONS.info}
              </div>
              <div class="notif-content">
                <div class="notif-title">{n.title}</div>
                <div class="notif-body">{n.message}</div>
                <div class="notif-meta">
                  {n.location && (
                    <span
                      class="notif-location"
                      style={{ color: LOCATIONS[n.location]?.color }}
                    >
                      {LOCATIONS[n.location]?.shortName}
                    </span>
                  )}
                  <span class="notif-time">{relativeTime(n.created_at)}</span>
                </div>
              </div>
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

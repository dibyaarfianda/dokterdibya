import { useState, useEffect } from 'preact/hooks';
import { route } from 'preact-router';
import { user, logout } from '../stores/auth';
import { api } from '../services/api';
import { LOCATIONS, SYNC_STATUS } from '../utils/constants';
import { relativeTime } from '../utils/date';

export default function Settings() {
  const [syncData, setSyncData] = useState({});
  const [syncing, setSyncing] = useState({});

  useEffect(() => {
    loadSyncStatus();
  }, []);

  async function loadSyncStatus() {
    try {
      const data = await api.getSyncStatus();
      setSyncData(data.statuses || {});
    } catch (err) {
      console.error('Failed to load sync status:', err);
    }
  }

  async function handleSync(location) {
    setSyncing(prev => ({ ...prev, [location]: true }));
    try {
      await api.triggerSync(location);
      await loadSyncStatus();
    } catch (err) {
      alert(`Sync gagal: ${err.message}`);
    } finally {
      setSyncing(prev => ({ ...prev, [location]: false }));
    }
  }

  function handleLogout() {
    if (confirm('Keluar dari DocBoard?')) {
      logout();
    }
  }

  return (
    <div class="view-settings">
      <div class="page-header">
        <h1 class="page-title">Lainnya</h1>
      </div>

      {/* Profile card */}
      <div class="settings-card">
        <div class="profile-row">
          <div class="profile-avatar">
            {(user.value?.name || 'U').charAt(0).toUpperCase()}
          </div>
          <div class="profile-info">
            <div class="profile-name">{user.value?.name || 'User'}</div>
            <div class="profile-role">{user.value?.role || ''}</div>
          </div>
        </div>
      </div>

      {/* Sync Status */}
      <div class="settings-section">
        <h3 class="settings-section-title">Status Sinkronisasi</h3>
        {Object.entries(LOCATIONS).map(([key, loc]) => {
          const status = syncData[key] || {};
          const syncInfo = SYNC_STATUS[status.sync_status] || SYNC_STATUS.pending;
          const isSyncing = syncing[key];

          return (
            <div key={key} class="sync-row">
              <span class="location-dot" style={{ backgroundColor: loc.color }} />
              <div class="sync-row-info">
                <div class="sync-row-name">{loc.name}</div>
                <div class="sync-row-meta">
                  <span class="sync-status-label" style={{ color: syncInfo.color }}>
                    {syncInfo.label}
                  </span>
                  {status.last_synced_at && (
                    <span class="sync-row-time">{relativeTime(status.last_synced_at)}</span>
                  )}
                </div>
              </div>
              <button
                class="sync-btn-small"
                onClick={() => handleSync(key)}
                disabled={isSyncing}
                title="Sync sekarang"
              >
                <svg
                  class={isSyncing ? 'spinning' : ''}
                  width="16" height="16" viewBox="0 0 24 24"
                  fill="none" stroke="currentColor" stroke-width="2"
                >
                  <polyline points="23,4 23,10 17,10" />
                  <polyline points="1,20 1,14 7,14" />
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                </svg>
              </button>
            </div>
          );
        })}
      </div>

      {/* Analytics */}
      <div class="settings-card settings-card-link" onClick={() => route('/docboard/analytics')}>
        <div class="settings-link-row">
          <div class="settings-link-icon" style={{ background: '#EEF2FF', color: '#3B82F6' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="20" x2="18" y2="10" />
              <line x1="12" y1="20" x2="12" y2="4" />
              <line x1="6" y1="20" x2="6" y2="14" />
            </svg>
          </div>
          <div class="settings-link-info">
            <div class="settings-link-title">Statistik Operasi</div>
            <div class="settings-link-desc">Lihat data & tren operasi</div>
          </div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" stroke-width="2">
            <polyline points="9,18 15,12 9,6" />
          </svg>
        </div>
      </div>

      {/* AI placeholder */}
      <div class="settings-card ai-card">
        <div class="ai-card-content">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" stroke-width="2">
            <polygon points="13,2 3,14 12,14 11,22 21,10 12,10" />
          </svg>
          <div>
            <div class="ai-card-title">AI Assistant</div>
            <div class="ai-card-desc">Briefing otomatis, prediksi volume pasien, dan lainnya</div>
          </div>
        </div>
        <span class="coming-soon-badge">Segera Hadir</span>
      </div>

      {/* Logout */}
      <button class="btn-logout" onClick={handleLogout}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <polyline points="16,17 21,12 16,7" />
          <line x1="21" y1="12" x2="9" y2="12" />
        </svg>
        Keluar
      </button>
    </div>
  );
}

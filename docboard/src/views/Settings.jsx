import { useState, useEffect } from 'preact/hooks';
import { route } from 'preact-router';
import { user, logout } from '../stores/auth';
import { api } from '../services/api';
import { LOCATIONS, SYNC_STATUS } from '../utils/constants';
import { relativeTime } from '../utils/date';
import { isPushSupported, isPushSubscribed, subscribeToPush, unsubscribeFromPush } from '../utils/push';
import { isNandaUser } from '../utils/access';

const NOTIF_PREFS = [
  { key: 'notify_new_booking', label: 'Operasi Baru', desc: 'Saat operasi dijadwalkan' },
  { key: 'notify_status_change', label: 'Perubahan Status', desc: 'Saat status operasi berubah' },
  { key: 'notify_reminder', label: 'Reminder Harian', desc: 'Pengingat operasi besok (21:00)' },
  { key: 'notify_sync_failure', label: 'Sync Gagal', desc: 'Saat sinkronisasi data gagal' }
];

function MoreMenuItem({ title, desc, icon, color, bg, onClick }) {
  return (
    <div class="settings-card settings-card-link" onClick={onClick}>
      <div class="settings-link-row">
        <div class="settings-link-icon" style={{ background: bg, color }}>
          {icon}
        </div>
        <div class="settings-link-info">
          <div class="settings-link-title">{title}</div>
          {desc && <div class="settings-link-desc">{desc}</div>}
        </div>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" stroke-width="2">
          <polyline points="9,18 15,12 9,6" />
        </svg>
      </div>
    </div>
  );
}

const icons = {
  data: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <ellipse cx="12" cy="5" rx="8" ry="3" />
      <path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5" />
      <path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
    </svg>
  ),
  calendar: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M8 2v4M16 2v4M3 10h18" />
      <path d="M8 14h5M8 18h8" />
    </svg>
  ),
  private: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M8 2v4M16 2v4M3 10h18" />
      <path d="M12 17.5c-1.8-1.2-3-2.2-3-3.5a1.7 1.7 0 0 1 3-1.1A1.7 1.7 0 0 1 15 14c0 1.3-1.2 2.3-3 3.5z" />
    </svg>
  ),
  chart: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  ),
  audit: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  ),
  monitor: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M3 5h18v10H3z" />
      <path d="M8 21h8" />
      <path d="M12 15v6" />
      <path d="M7 10h3l2-3 2 6 2-3h1" />
    </svg>
  ),
  settings: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1A2 2 0 1 1 4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7A2 2 0 1 1 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3h.1a1.7 1.7 0 0 0 1-1.6V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.6h.1a1.7 1.7 0 0 0 1.9-.3l.1-.1A2 2 0 1 1 19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1a1.7 1.7 0 0 0 1.6 1h.1a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.6 1z" />
    </svg>
  ),
};

export default function Settings({ mode = 'menu' }) {
  const [syncData, setSyncData] = useState({});
  const [syncing, setSyncing] = useState({});
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushLoading, setPushLoading] = useState(true);
  const [pushSupported] = useState(isPushSupported());
  const [prefs, setPrefs] = useState({ notify_new_booking: true, notify_status_change: true, notify_reminder: true, notify_sync_failure: true });
  const [prefsLoading, setPrefsLoading] = useState(false);
  const isNanda = isNandaUser(user.value);

  useEffect(() => {
    loadSyncStatus();
    checkPushStatus();
    loadPreferences();
  }, []);

  async function loadSyncStatus() {
    try {
      const data = await api.getSyncStatus();
      setSyncData(data.statuses || {});
    } catch (err) {
      console.error('Failed to load sync status:', err);
    }
  }

  async function checkPushStatus() {
    if (!pushSupported) {
      setPushLoading(false);
      return;
    }
    try {
      const subscribed = await isPushSubscribed();
      setPushEnabled(subscribed);
    } catch {
      // ignore
    }
    setPushLoading(false);
  }

  async function handlePushToggle() {
    setPushLoading(true);
    try {
      if (pushEnabled) {
        await unsubscribeFromPush();
        setPushEnabled(false);
      } else {
        await subscribeToPush();
        setPushEnabled(true);
      }
    } catch (err) {
      alert(err.message || 'Gagal mengubah pengaturan notifikasi');
    }
    setPushLoading(false);
  }

  async function handleTestNotification() {
    if (!pushEnabled) {
      alert('Aktifkan notifikasi push terlebih dahulu');
      return;
    }
    // Show a test notification locally
    try {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification('DocBoard Test', {
        body: 'Notifikasi push berfungsi dengan baik!',
        icon: '/docboard/icons/icon-192.png',
        badge: '/docboard/icons/icon-192.png',
        vibrate: [200, 100, 200]
      });
    } catch (err) {
      alert('Gagal menampilkan notifikasi test: ' + err.message);
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

  async function loadPreferences() {
    try {
      const data = await api.getPreferences();
      if (data.preferences) setPrefs(data.preferences);
    } catch { /* preferences endpoint may not exist yet */ }
  }

  async function togglePref(key) {
    const updated = { ...prefs, [key]: !prefs[key] };
    setPrefs(updated);
    setPrefsLoading(true);
    try {
      await api.updatePreferences(updated);
    } catch (err) {
      setPrefs(prefs); // revert
      alert('Gagal menyimpan: ' + err.message);
    }
    setPrefsLoading(false);
  }

  function handleLogout() {
    if (confirm('Keluar dari DocBoard?')) {
      logout();
    }
  }

  if (mode === 'menu') {
    return (
      <div class="view-settings">
        <div class="page-header">
          <h1 class="page-title">Lainnya</h1>
        </div>

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

        <div class="settings-section">
          <h3 class="settings-section-title">Sub-menu</h3>
          <MoreMenuItem title="Data" desc={isNanda ? 'Data operasi rumah sakit' : 'Confidential'} icon={icons.data} color="#2563EB" bg="#EEF2FF" onClick={() => route('/docboard/data')} />
          <MoreMenuItem title="Monitor Pasien" desc={isNanda ? 'Admission & operasi Gambiran' : 'Confidential'} icon={icons.monitor} color="#047857" bg="#ECFDF5" onClick={() => route('/docboard/monitor')} />
          <MoreMenuItem title="Audit" desc={isNanda ? 'Audit operasi Gambiran' : 'Confidential'} icon={icons.audit} color="#0891B2" bg="#ECFEFF" onClick={() => route('/docboard/audit')} />
          <MoreMenuItem title="Ilmiah" desc={isNanda ? 'Agenda ilmiah dan diskusi kasus' : 'Confidential'} icon={icons.calendar} color="#2563EB" bg="#EEF2FF" onClick={() => route('/docboard/scientific')} />
          <MoreMenuItem title="Pribadi" desc={isNanda ? 'Agenda pribadi' : 'Confidential'} icon={icons.private} color="#EA580C" bg="#FFF7ED" onClick={() => route('/docboard/personal')} />
          <MoreMenuItem title="Statistik Operasi" desc="Lihat data dan tren operasi" icon={icons.chart} color="#3B82F6" bg="#EEF2FF" onClick={() => route('/docboard/analytics')} />
          <MoreMenuItem title="Setting" desc="Notifikasi, sinkronisasi, dan pengaturan DocBoard" icon={icons.settings} color="#64748B" bg="#F1F5F9" onClick={() => route('/docboard/settings/preferences')} />
        </div>

        <button class="btn-logout" onClick={handleLogout}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16,17 21,12 16,7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          Logout
        </button>
      </div>
    );
  }

  return (
    <div class="view-settings">
      <div class="page-header">
        <h1 class="page-title">Setting</h1>
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

      {/* Schedule Spaces */}
      <div class="settings-section">
        <h3 class="settings-section-title">Ruang Jadwal</h3>
        <div class="settings-card settings-card-link" onClick={() => route('/docboard/scientific')}>
          <div class="settings-link-row">
            <div class="settings-link-icon" style={{ background: '#EEF2FF', color: '#2563EB' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <path d="M8 2v4M16 2v4M3 10h18" />
                <path d="M8 14h5M8 18h8" />
              </svg>
            </div>
            <div class="settings-link-info">
              <div class="settings-link-title">Ilmiah</div>
              <div class="settings-link-desc">Pertemuan staff Obgyn, seminar, dan diskusi kasus</div>
            </div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" stroke-width="2">
              <polyline points="9,18 15,12 9,6" />
            </svg>
          </div>
        </div>
        <div class="settings-card settings-card-link" onClick={() => route('/docboard/procedures')}>
          <div class="settings-link-row">
            <div class="settings-link-icon" style={{ background: '#ECFDF5', color: '#059669' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <path d="M8 2v4M16 2v4M3 10h18" />
                <path d="M12 14v5M9.5 16.5h5" />
              </svg>
            </div>
            <div class="settings-link-info">
              <div class="settings-link-title">Tindakan</div>
              <div class="settings-link-desc">IUD, implan, pap smear/IVA, stripping membrane, USG VK, dan USG Poli</div>
            </div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" stroke-width="2">
              <polyline points="9,18 15,12 9,6" />
            </svg>
          </div>
        </div>
        {isNanda && (
          <div class="settings-card settings-card-link" onClick={() => route('/docboard/personal')}>
            <div class="settings-link-row">
              <div class="settings-link-icon" style={{ background: '#FFF7ED', color: '#EA580C' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="4" width="18" height="18" rx="2" />
                  <path d="M8 2v4M16 2v4M3 10h18" />
                  <path d="M12 17.5c-1.8-1.2-3-2.2-3-3.5a1.7 1.7 0 0 1 3-1.1A1.7 1.7 0 0 1 15 14c0 1.3-1.2 2.3-3 3.5z" />
                </svg>
              </div>
              <div class="settings-link-info">
                <div class="settings-link-title">Pribadi</div>
                <div class="settings-link-desc">Janji keluarga, agenda rumah, dan urusan pribadi</div>
              </div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" stroke-width="2">
                <polyline points="9,18 15,12 9,6" />
              </svg>
            </div>
          </div>
        )}
      </div>

      {/* Push Notifications */}
      <div class="settings-section">
        <h3 class="settings-section-title">Notifikasi Push</h3>
        <div class="settings-card">
          <div class="push-toggle-row">
            <div class="push-toggle-info">
              <div class="push-toggle-label">Notifikasi Push</div>
              <div class="push-toggle-desc">
                {!pushSupported
                  ? 'Browser tidak mendukung push notification'
                  : pushEnabled
                    ? 'Aktif - menerima notifikasi operasi'
                    : 'Nonaktif - aktifkan untuk menerima notifikasi'}
              </div>
            </div>
            <label class={`toggle-switch ${!pushSupported ? 'disabled' : ''}`}>
              <input
                type="checkbox"
                checked={pushEnabled}
                disabled={!pushSupported || pushLoading}
                onChange={handlePushToggle}
              />
              <span class="toggle-slider" />
            </label>
          </div>
          {pushEnabled && (
            <button class="btn-test-notif" onClick={handleTestNotification}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
              Kirim Notifikasi Test
            </button>
          )}
        </div>
      </div>

      {/* Notification Preferences */}
      {pushEnabled && (
        <div class="settings-section">
          <h3 class="settings-section-title">Jenis Notifikasi</h3>
          <div class="settings-card">
            {NOTIF_PREFS.map(np => (
              <div key={np.key} class="pref-toggle-row">
                <div class="pref-toggle-info">
                  <div class="pref-toggle-label">{np.label}</div>
                  <div class="pref-toggle-desc">{np.desc}</div>
                </div>
                <label class="toggle-switch">
                  <input type="checkbox" checked={prefs[np.key] !== false} onChange={() => togglePref(np.key)} disabled={prefsLoading} />
                  <span class="toggle-slider" />
                </label>
              </div>
            ))}
          </div>
        </div>
      )}

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

      {/* Command Center */}
      <div class="settings-card settings-card-link" onClick={() => route('/docboard/command')}>
        <div class="settings-link-row">
          <div class="settings-link-icon" style={{ background: '#FEF3C7', color: '#D97706' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="2" y="3" width="20" height="18" rx="2" /><path d="M2 9h20" /><path d="M9 3v18" />
            </svg>
          </div>
          <div class="settings-link-info">
            <div class="settings-link-title">Command Center</div>
            <div class="settings-link-desc">Dashboard, rules, compliance</div>
          </div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" stroke-width="2">
            <polyline points="9,18 15,12 9,6" />
          </svg>
        </div>
      </div>

      {/* AI Assistant */}
      <div class="settings-card ai-card">
        <div class="ai-card-content">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" stroke-width="2">
            <polygon points="13,2 3,14 12,14 11,22 21,10 12,10" />
          </svg>
          <div>
            <div class="ai-card-title">AI Assistant</div>
            <div class="ai-card-desc">Morning briefing otomatis tersedia di halaman Kalender</div>
          </div>
        </div>
        <span class="ai-active-badge">Aktif</span>
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

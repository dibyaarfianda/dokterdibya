import { getIdToken } from './vps-auth-v2.js';
import { renderOnlineQueuePageHtml } from './live-queue-dashboard-utils.js';

let pageBound = false;
let queuePollTimer = null;
let socketBound = false;
const ONLINE_QUEUE_POLL_INTERVAL_MS = 45000;
const ONLINE_QUEUE_ERROR_BACKOFF_MS = 60000;
let queueInFlight = false;
let queueBackoffUntil = 0;
let lastSettings = {
    is_queue_visible: false,
    doctor_arrived: false
};

function formatDateLabel(dateValue) {
    if (!dateValue) return 'Hari ini';
    const date = new Date(`${dateValue}T00:00:00+07:00`);
    if (Number.isNaN(date.getTime())) return String(dateValue);
    return date.toLocaleDateString('id-ID', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'Asia/Jakarta'
    });
}

function setRootLoading() {
    const root = document.getElementById('antrian-online-root');
    if (!root) return;
    root.innerHTML = `
        <div class="card card-success card-outline">
            <div class="card-body text-center py-5 text-muted">
                <i class="fas fa-spinner fa-spin fa-2x mb-2"></i>
                <p class="mb-0">Memuat antrian online...</p>
            </div>
        </div>
    `;
}

function setRootError(message) {
    const root = document.getElementById('antrian-online-root');
    if (!root) return;
    root.innerHTML = `
        <div class="alert alert-danger">
            <i class="fas fa-exclamation-triangle mr-1"></i>${escapeHtml(message || 'Gagal memuat antrian online.')}
        </div>
    `;
}

function escapeHtml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

async function loadQueueSettings() {
    try {
        const response = await fetch('/api/sunday-clinic/queue/settings?_t=' + Date.now(), {
            headers: { 'Cache-Control': 'no-cache' }
        });
        const result = await response.json();
        if (result && result.success) {
            lastSettings = {
                is_queue_visible: Boolean(result.is_queue_visible),
                doctor_arrived: Boolean(result.doctor_arrived)
            };
        }
    } catch (error) {
        console.warn('[AntrianOnline] loadQueueSettings failed:', error);
    }
    return lastSettings;
}

async function loadAntrianOnlineQueue(forceRefresh = false) {
    const page = document.getElementById('antrian-online-page');
    if (page && page.classList.contains('d-none')) {
        return;
    }
    if (!forceRefresh && document.visibilityState !== 'visible') return;
    if (!forceRefresh && Date.now() < queueBackoffUntil) return;
    if (queueInFlight) return;

    const root = document.getElementById('antrian-online-root');
    if (!root) return;

    if (!root.dataset.loaded) {
        setRootLoading();
    }

    const token = await getIdToken();
    if (!token) {
        setRootError('Sesi login tidak ditemukan. Silakan login ulang.');
        return;
    }

    queueInFlight = true;
    try {
        const [settings, response] = await Promise.all([
            loadQueueSettings(),
            fetch(`/api/sunday-clinic/queue/today?refresh=${forceRefresh ? '1' : '0'}&_t=${Date.now()}`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Cache-Control': 'no-cache'
                }
            })
        ]);

        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.success) {
            if (response.status >= 500 || response.status === 429) {
                queueBackoffUntil = Date.now() + ONLINE_QUEUE_ERROR_BACKOFF_MS;
            }
            throw new Error(result.message || 'Gagal memuat antrian online.');
        }

        const queueItems = Array.isArray(result.data) ? result.data : [];
        queueBackoffUntil = 0;
        root.dataset.loaded = '1';
        root.innerHTML = renderOnlineQueuePageHtml(queueItems, {
            dateLabel: formatDateLabel(result.date),
            updatedAt: new Date(),
            isQueueVisible: settings.is_queue_visible,
            doctorArrived: settings.doctor_arrived
        });
    } catch (error) {
        console.error('[AntrianOnline] loadAntrianOnlineQueue failed:', error);
        queueBackoffUntil = Date.now() + ONLINE_QUEUE_ERROR_BACKOFF_MS;
        setRootError(error.message || 'Gagal memuat antrian online.');
    } finally {
        queueInFlight = false;
    }
}

function bindPageActions() {
    if (pageBound) return;
    pageBound = true;

    const page = document.getElementById('antrian-online-page');
    if (!page) return;

    page.addEventListener('click', async (event) => {
        const refreshButton = event.target.closest('#antrian-online-refresh-btn');
        if (refreshButton) {
            event.preventDefault();
            await loadAntrianOnlineQueue(true);
            return;
        }

        const visibilityButton = event.target.closest('#antrian-online-visibility-btn');
        if (visibilityButton) {
            event.preventDefault();
            if (typeof window.toggleStaffQueueVisibility === 'function') {
                await window.toggleStaffQueueVisibility();
            }
            await loadAntrianOnlineQueue(true);
            return;
        }

        const doctorButton = event.target.closest('#antrian-online-doctor-btn');
        if (doctorButton) {
            event.preventDefault();
            if (typeof window.setDoctorArrivalStatus === 'function') {
                await window.setDoctorArrivalStatus(!lastSettings.doctor_arrived);
            }
            await loadAntrianOnlineQueue(true);
        }
    });
}

function setupRealtimeQueueUpdates() {
    if (!queuePollTimer) {
        queuePollTimer = setInterval(() => loadAntrianOnlineQueue(false), ONLINE_QUEUE_POLL_INTERVAL_MS);
    }

    if (socketBound) return;

    const bindSocket = () => {
        const socket = window.socket || (window.__realtimeSyncState && window.__realtimeSyncState.socket);
        if (!socket || typeof socket.on !== 'function') {
            setTimeout(bindSocket, 1500);
            return;
        }

        socketBound = true;
        socket.on('queue:updated', () => loadAntrianOnlineQueue(true));
        socket.on('queue:settings_changed', () => loadAntrianOnlineQueue(true));
    };

    bindSocket();
}

export function initAntrianOnlinePage() {
    bindPageActions();
    setupRealtimeQueueUpdates();
    return loadAntrianOnlineQueue(true);
}

window.initAntrianOnlinePage = initAntrianOnlinePage;
window.refreshAntrianOnlineQueue = () => loadAntrianOnlineQueue(true);

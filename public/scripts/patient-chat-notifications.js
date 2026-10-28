const SETTINGS_URL = '/api/community-chat/me/notifications';

function bounded(promise, message, timeout = 15000) {
    let timer;
    return Promise.race([promise, new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeout);
    })]).finally(() => clearTimeout(timer));
}

export function createPatientChatNotificationController({ getToken }) {
    async function request(url, body) {
        const token = await getToken();
        if (!token) throw new Error('Silakan login kembali.');
        const response = await bounded(fetch(url, {
            method: body === undefined ? 'GET' : (url === SETTINGS_URL ? 'PUT' : 'POST'),
            cache: 'no-store',
            headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
            ...(body === undefined ? {} : { body: JSON.stringify(body) })
        }), 'Koneksi terlalu lama. Periksa koneksi lalu muat ulang pengaturan.');
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.message || 'Pengaturan notifikasi gagal disimpan.');
        return data;
    }

    function supported() {
        return window.isSecureContext && 'Notification' in window && 'PushManager' in window && 'serviceWorker' in navigator;
    }

    async function getDeviceStatus() {
        if (!supported()) return { ready: false, message: 'Push tidak tersedia di browser ini. Di iPhone, buka melalui aplikasi web yang ditambahkan ke layar utama.' };
        if (Notification.permission === 'denied') return { ready: false, message: 'Izin notifikasi diblokir. Aktifkan melalui pengaturan browser/HP.' };
        if (Notification.permission !== 'granted') return { ready: false, message: 'Izin notifikasi belum diberikan di perangkat ini.' };
        const registration = await navigator.serviceWorker.getRegistration('/');
        const subscription = await registration?.pushManager.getSubscription();
        return { ready: !!subscription, message: subscription ? 'Perangkat ini siap menerima push.' : 'Perangkat ini belum terhubung ke push.' };
    }

    async function connectDevice() {
        if (!supported()) throw new Error('Push tidak tersedia. Gunakan browser yang mendukung; di iPhone tambahkan aplikasi web ke layar utama.');
        // Called from a user click: request permission before awaiting network work.
        const permission = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
        if (permission !== 'granted') throw new Error(permission === 'denied' ? 'Izin notifikasi diblokir. Aktifkan melalui pengaturan browser/HP.' : 'Izin notifikasi belum diberikan.');
        let registration = await navigator.serviceWorker.getRegistration('/');
        if (!registration) registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        registration = await bounded(navigator.serviceWorker.ready, 'Layanan notifikasi belum siap. Muat ulang halaman lalu coba lagi.');
        let subscription = await registration.pushManager.getSubscription();
        if (!subscription) {
            const keyResponse = await bounded(fetch('/api/patients/vapid-key', { cache: 'no-store' }), 'Layanan push tidak merespons.');
            const keyData = await keyResponse.json();
            if (!keyResponse.ok || !keyData.success || !keyData.vapidPublicKey) throw new Error('Layanan push belum tersedia. Coba lagi nanti.');
            const key = keyData.vapidPublicKey;
            const bytes = window.atob((key + '='.repeat((4 - key.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
            subscription = await bounded(registration.pushManager.subscribe({
                userVisibleOnly: true, applicationServerKey: Uint8Array.from(bytes, char => char.charCodeAt(0))
            }), 'Push belum terhubung. Periksa pengaturan notifikasi perangkat.');
        }
        const saved = subscription.toJSON();
        await request('/api/patients/push-token', {
            platform: 'web', endpoint: saved.endpoint, p256dh: saved.keys?.p256dh, auth: saved.keys?.auth
        });
    }

    return {
        getSettings: async () => (await request(SETTINGS_URL)).settings,
        getDeviceStatus,
        async setEnabled(enabled) {
            if (enabled) await connectDevice();
            return (await request(SETTINGS_URL, { enabled })).settings;
        }
    };
}

export function setupPatientChatNotifications({ container, getToken, showToast = () => {} }) {
    if (!container) return null;
    const controller = createPatientChatNotificationController({ getToken });
    container.innerHTML = '<label style="display:flex;align-items:center;gap:10px;cursor:pointer"><input type="checkbox" data-chat-push-toggle role="switch" disabled> Notifikasi chat di HP</label>' +
        '<p data-chat-push-status role="status" style="font-size:12px;line-height:1.5;margin:8px 0">Memuat pengaturan…</p>' +
        '<p style="font-size:12px;line-height:1.5;margin:8px 0">Menampilkan cuplikan pesan pada notifikasi HP, termasuk layar kunci. Bunyi mengikuti izin dan pengaturan suara HP.</p>' +
        '<button type="button" data-chat-push-connect hidden>Hubungkan perangkat ini</button>';
    const toggle = container.querySelector('[data-chat-push-toggle]');
    const status = container.querySelector('[data-chat-push-status]');
    const connect = container.querySelector('[data-chat-push-connect]');
    let enabled = false;
    let busy = false;

    async function render() {
        toggle.checked = enabled;
        toggle.disabled = busy;
        connect.disabled = busy;
        const device = await controller.getDeviceStatus();
        status.textContent = enabled ? 'Aktif untuk akun ini. ' + device.message : 'Notifikasi chat nonaktif untuk akun ini.';
        connect.hidden = !enabled || device.ready;
    }
    async function refresh() {
        try {
            enabled = (await controller.getSettings()).enabled;
            await render();
        } catch (error) {
            status.textContent = error.message;
            toggle.disabled = true;
        }
    }
    async function change(next) {
        if (busy) return;
        busy = true;
        toggle.disabled = connect.disabled = true;
        status.textContent = 'Menyimpan pengaturan…';
        try {
            enabled = (await controller.setEnabled(next)).enabled;
            showToast(enabled ? 'Notifikasi chat diaktifkan.' : 'Notifikasi chat dinonaktifkan.');
        } catch (error) {
            showToast(error.message, 'error');
            // Read the account setting again after uncertain network outcomes, never auto-resend.
            try { enabled = (await controller.getSettings()).enabled; } catch (_) { /* retain last confirmed value */ }
            status.textContent = error.message;
            toggle.checked = enabled;
            busy = false;
            toggle.disabled = connect.disabled = false;
            return;
        }
        busy = false;
        await render();
    }
    toggle.addEventListener('change', () => { change(toggle.checked).catch(error => { status.textContent = error.message; }); });
    connect.addEventListener('click', () => { change(true).catch(error => { status.textContent = error.message; }); });
    return { ready: refresh(), refresh };
}

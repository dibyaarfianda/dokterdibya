/* Popup "akun ditangguhkan" untuk portal pasien. Dimuat oleh patient-session.js. */
(function initPatientAccountSuspension(global) {
    'use strict';

    if (global.__patientAccountSuspensionLoaded || !global.document) return;
    global.__patientAccountSuspensionLoaded = true;

    const doc = global.document;
    const INBOX_PATH = '/pesan.html';
    const SKIP_PATHS = new Set([
        '/', '/index.html', '/app-logout.html', '/patient-login.html',
        '/mobile-google-callback.html', '/patient-demo-login.html'
    ]);
    const path = global.location?.pathname || '';
    const isInboxPage = path === INBOX_PATH;
    let rendered = false;
    let inboxAvailable = null;

    function getToken() {
        return global.PatientSession?.getToken?.() || null;
    }

    function escapeHtml(value) {
        return String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[ch]));
    }

    function injectStyle() {
        if (doc.getElementById('patient-suspension-style')) return;
        const style = doc.createElement('style');
        style.id = 'patient-suspension-style';
        style.textContent = [
            '#patient-suspension-overlay{position:fixed;inset:0;z-index:2147483646;background:rgba(17,12,16,.72);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:20px;font-family:system-ui,-apple-system,"Segoe UI",sans-serif}',
            '#patient-suspension-overlay .pso-card{width:100%;max-width:400px;background:#fff;color:#2a1f26;border-radius:20px;padding:26px 22px 20px;box-shadow:0 24px 60px rgba(0,0,0,.35);text-align:center}',
            '#patient-suspension-overlay .pso-icon{width:56px;height:56px;margin:0 auto 12px;border-radius:50%;background:#fde8ea;color:#c2334d;display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:800}',
            '#patient-suspension-overlay h2{margin:0 0 8px;font-size:20px;font-weight:800}',
            '#patient-suspension-overlay p{margin:0 0 12px;font-size:14px;line-height:1.5;color:#5b4b55}',
            '#patient-suspension-overlay .pso-reason{background:#fff6f7;border:1px solid #f4c7cf;border-radius:12px;padding:10px 12px;margin:0 0 16px;text-align:left;font-size:14px;color:#2a1f26}',
            '#patient-suspension-overlay .pso-reason small{display:block;font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#c2334d;margin-bottom:4px}',
            '#patient-suspension-overlay .pso-btn{display:block;width:100%;border:0;border-radius:12px;padding:12px 14px;font-size:15px;font-weight:700;cursor:pointer;text-decoration:none;margin-top:8px}',
            '#patient-suspension-overlay .pso-primary{background:#c2334d;color:#fff}',
            '#patient-suspension-overlay .pso-secondary{background:#f2eef0;color:#5b4b55}',
            '#patient-suspension-overlay .pso-note{font-size:12px;color:#8a7a84;margin:10px 0 0}',
            '#patient-suspension-banner{position:sticky;top:0;z-index:2147483645;background:#fde8ea;color:#7a1d2f;border-bottom:1px solid #f4c7cf;padding:10px 14px;font:600 13px/1.4 system-ui,sans-serif;text-align:center}',
            'body.patient-suspended-lock{overflow:hidden!important}'
        ].join('');
        doc.head.appendChild(style);
    }

    async function checkInboxAvailable() {
        if (inboxAvailable !== null) return inboxAvailable;
        try {
            const response = await fetch(INBOX_PATH, { method: 'HEAD', cache: 'no-store' });
            inboxAvailable = response.ok;
        } catch (_error) {
            inboxAvailable = false;
        }
        return inboxAvailable;
    }

    function renderBanner(info) {
        if (doc.getElementById('patient-suspension-banner')) return;
        injectStyle();
        const banner = doc.createElement('div');
        banner.id = 'patient-suspension-banner';
        banner.setAttribute('role', 'status');
        banner.textContent = 'Akun Anda ditangguhkan' + (info.reason ? ': ' + info.reason : '') + '. Anda tetap bisa mengirim pesan ke staff di halaman ini.';
        doc.body.prepend(banner);
    }

    async function renderOverlay(info) {
        if (rendered || !doc.body) return;
        if (isInboxPage) { renderBanner(info); return; }
        rendered = true;
        injectStyle();

        const hasInbox = await checkInboxAvailable();
        const overlay = doc.createElement('div');
        overlay.id = 'patient-suspension-overlay';
        overlay.setAttribute('role', 'alertdialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-labelledby', 'pso-title');
        overlay.innerHTML = `
            <div class="pso-card">
                <div class="pso-icon" aria-hidden="true">!</div>
                <h2 id="pso-title">Akun Ditangguhkan</h2>
                <p>Akun Anda sementara ditangguhkan karena tidak mengikuti aturan penggunaan portal. Fitur portal tidak bisa dipakai sampai penangguhan dicabut staff.</p>
                ${info.reason ? `<div class="pso-reason"><small>Alasan</small>${escapeHtml(info.reason)}</div>` : ''}
                ${hasInbox
                    ? '<p>Silakan hubungi staff melalui menu Pesan untuk klarifikasi atau perbaikan data.</p><a class="pso-btn pso-primary" href="' + INBOX_PATH + '">Hubungi Staff lewat Pesan</a>'
                    : '<p>Menu Pesan untuk menghubungi staff sedang disiapkan. Sementara itu silakan hubungi klinik.</p>'}
                <button type="button" class="pso-btn pso-secondary" data-pso-logout>Keluar</button>
                <p class="pso-note">Jika data Anda sudah sesuai identitas asli, staff akan mengaktifkan kembali akun Anda.</p>
            </div>`;
        overlay.querySelector('[data-pso-logout]').addEventListener('click', () => {
            global.PatientSession?.clearAuth?.();
            global.location.href = '/patient-login.html';
        });
        doc.body.appendChild(overlay);
        doc.body.classList.add('patient-suspended-lock');
    }

    function showWhenReady(info) {
        if (doc.readyState === 'loading') {
            doc.addEventListener('DOMContentLoaded', () => renderOverlay(info), { once: true });
        } else {
            renderOverlay(info);
        }
    }

    // Any patient API call answered with ACCOUNT_SUSPENDED opens the popup, even
    // if the suspension happened while the page was already open.
    const nativeFetch = global.fetch ? global.fetch.bind(global) : null;
    if (nativeFetch) {
        global.fetch = function patchedFetch(input, init) {
            return nativeFetch(input, init).then((response) => {
                if (response.status === 403 && !rendered) {
                    response.clone().json().then((data) => {
                        if (data && data.code === 'ACCOUNT_SUSPENDED') showWhenReady({ reason: data.reason || '' });
                    }).catch(() => {});
                }
                return response;
            });
        };
    }

    async function checkStatus() {
        const token = getToken();
        if (!token || SKIP_PATHS.has(path) || global.PatientSession?.isDemoMode?.()) return;
        try {
            const response = await nativeFetch('/api/patients/account-status?_t=' + Date.now(), {
                headers: { Authorization: 'Bearer ' + token, 'Cache-Control': 'no-cache' }
            });
            if (!response.ok) return;
            const data = await response.json();
            if (data && data.suspended) showWhenReady({ reason: data.reason || '' });
        } catch (_error) {
            // Status check is best-effort; the API boundary still enforces suspension.
        }
    }

    checkStatus();
    global.addEventListener?.('auth:credentials-changed', checkStatus);
})(window);

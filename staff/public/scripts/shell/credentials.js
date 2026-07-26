import { TOKEN_KEY } from '../vps-auth-v2.js';

const TOKEN_STORAGE_KEYS = [TOKEN_KEY, 'token', 'auth_token'];
const STAFF_SESSION_INVALID_MESSAGE = 'Sesi login tidak valid, silakan login ulang';

export class StaffCredentialError extends Error {
    constructor(message, details = {}) {
        super(message);
        this.name = 'StaffCredentialError';
        this.httpStatus = details.httpStatus || null;
        this.code = details.code || 'staff_credential_error';
        this.shellErrorRendered = Boolean(details.shellErrorRendered);
    }
}

function safeGetStorageItem(storage, key) {
    try {
        return storage?.getItem(key) || null;
    } catch (error) {
        console.warn('[STAFF CREDENTIAL] Unable to read token storage:', key, error);
        return null;
    }
}

function safeRemoveStorageItem(storage, key) {
    try {
        storage?.removeItem(key);
    } catch (error) {
        console.warn('[STAFF CREDENTIAL] Unable to clear token storage:', key, error);
    }
}

export function resolveStaffToken() {
    for (const key of TOKEN_STORAGE_KEYS) {
        const localToken = safeGetStorageItem(window.localStorage, key);
        if (localToken) return localToken;

        const sessionToken = safeGetStorageItem(window.sessionStorage, key);
        if (sessionToken) return sessionToken;
    }

    return null;
}

export function clearStaffCredentialState() {
    for (const key of TOKEN_STORAGE_KEYS) {
        safeRemoveStorageItem(window.localStorage, key);
        safeRemoveStorageItem(window.sessionStorage, key);
    }

    safeRemoveStorageItem(window.localStorage, 'must_change_password');
    safeRemoveStorageItem(window.sessionStorage, 'must_change_password');
}

function updateCredentialDebug(status, details = {}) {
    const payload = {
        status,
        httpStatus: details.httpStatus || null,
        message: details.message || null,
        checkedAt: new Date().toISOString(),
        userId: details.userId || null,
        userRole: details.userRole || null
    };

    window.__staffCredentialCheck = payload;
    return payload;
}

function normalizeUser(user) {
    if (!user || typeof user !== 'object') return null;

    if (user.id && !user.uid) {
        user.uid = user.id;
    }

    if (user.uid && !user.id) {
        user.id = user.uid;
    }

    return user;
}

function extractVerifiedUser(payload) {
    return payload?.data?.user || payload?.user || null;
}

function isPatientUser(user) {
    if (!user) return false;
    return user.user_type === 'patient' || user.userType === 'patient' || user.role === 'patient';
}

function getErrorHost() {
    return document.getElementById('main-app') || document.body;
}

function buildShellErrorMarkup(title, message, details) {
    const safeTitle = escapeHtml(title);
    const safeMessage = escapeHtml(message);
    const safeDetails = escapeHtml(details);
    const detailMarkup = safeDetails
        ? `<p class="text-muted mb-3" style="font-size: 12px;">${safeDetails}</p>`
        : '';

    return `
        <div class="staff-shell-error-state d-flex align-items-center justify-content-center" style="min-height: 100vh; padding: 24px; background: #f4f6f9;">
            <div class="card shadow-sm" style="max-width: 520px; width: 100%; border: 0; border-radius: 14px;">
                <div class="card-body text-center" style="padding: 32px;">
                    <div class="mb-3" style="width: 56px; height: 56px; border-radius: 50%; background: #fff3cd; color: #856404; display: inline-flex; align-items: center; justify-content: center;">
                        <i class="fas fa-user-lock" aria-hidden="true"></i>
                    </div>
                    <h4 class="mb-2" style="font-weight: 700; color: #343a40;">${safeTitle}</h4>
                    <p class="mb-2" style="color: #495057;">${safeMessage}</p>
                    ${detailMarkup}
                    <div class="d-flex justify-content-center flex-wrap" style="gap: 10px;">
                        <button type="button" class="btn btn-primary" data-staff-credential-action="login">Login ulang</button>
                        <button type="button" class="btn btn-outline-secondary" data-staff-credential-action="refresh">Perbarui aplikasi</button>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

async function refreshStaffApplication() {
    const tasks = [];

    if ('serviceWorker' in navigator) {
        tasks.push(
            navigator.serviceWorker.getRegistrations()
                .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
        );
    }

    if ('caches' in window) {
        tasks.push(
            caches.keys()
                .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
        );
    }

    await Promise.allSettled(tasks);
    window.location.reload();
}

export function renderStaffShellError(options = {}) {
    const title = options.title || 'Staff panel tidak bisa dimuat';
    const message = options.message || STAFF_SESSION_INVALID_MESSAGE;
    const details = options.details || '';
    const host = getErrorHost();

    if (!host) return false;

    host.innerHTML = buildShellErrorMarkup(title, message, details);

    const loginButton = host.querySelector('[data-staff-credential-action="login"]');
    const refreshButton = host.querySelector('[data-staff-credential-action="refresh"]');

    if (loginButton) {
        loginButton.addEventListener('click', () => {
            clearStaffCredentialState();
            window.location.replace('/staff/public/login.html');
        });
    }

    if (refreshButton) {
        refreshButton.addEventListener('click', () => {
            refreshStaffApplication().catch(() => window.location.reload());
        });
    }

    return true;
}

function createRenderedError(message, details = {}) {
    return new StaffCredentialError(message, {
        ...details,
        shellErrorRendered: true
    });
}

export async function verifyStaffCredentials({ auth, serverVerifiedUser } = {}) {
    updateCredentialDebug('checking');

    const token = resolveStaffToken();
    if (!token) {
        clearStaffCredentialState();
        updateCredentialDebug('missing', { message: STAFF_SESSION_INVALID_MESSAGE });
        renderStaffShellError({
            title: 'Sesi staff tidak ditemukan',
            message: STAFF_SESSION_INVALID_MESSAGE,
            details: 'Token login tidak ditemukan di localStorage atau sessionStorage.'
        });
        throw createRenderedError(STAFF_SESSION_INVALID_MESSAGE, { code: 'missing_token' });
    }

    let response = null;
    let user = normalizeUser(serverVerifiedUser);

    // initAuth() has already validated this exact user against /api/auth/me.
    // Keep the direct request as the fallback when that initial check returned
    // no usable user, so invalid/network sessions still get the detailed guard UI.
    if (!user) {
        try {
            response = await fetch(`/api/auth/me?_t=${Date.now()}`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Cache-Control': 'no-cache'
                },
                cache: 'no-store'
            });
        } catch (error) {
            const message = 'Tidak bisa memverifikasi sesi staff. Periksa koneksi lalu perbarui aplikasi.';
            updateCredentialDebug('error', { message });
            renderStaffShellError({
                title: 'Verifikasi sesi gagal',
                message,
                details: error?.message || ''
            });
            throw createRenderedError(message, { code: 'network_error' });
        }

        if (response.status === 401 || response.status === 403) {
            clearStaffCredentialState();
            updateCredentialDebug('invalid', {
                httpStatus: response.status,
                message: STAFF_SESSION_INVALID_MESSAGE
            });
            renderStaffShellError({
                title: 'Sesi staff tidak valid',
                message: STAFF_SESSION_INVALID_MESSAGE,
                details: `Server menolak kredensial staff (HTTP ${response.status}).`
            });
            throw createRenderedError(STAFF_SESSION_INVALID_MESSAGE, {
                httpStatus: response.status,
                code: 'invalid_token'
            });
        }

        if (!response.ok) {
            const message = `Gagal memverifikasi sesi staff (HTTP ${response.status}).`;
            updateCredentialDebug('error', {
                httpStatus: response.status,
                message
            });
            renderStaffShellError({
                title: 'Verifikasi sesi gagal',
                message,
                details: 'Coba perbarui aplikasi. Jika tetap gagal, cek status backend.'
            });
            throw createRenderedError(message, {
                httpStatus: response.status,
                code: 'verification_failed'
            });
        }

        const payload = await response.json().catch(() => null);
        user = normalizeUser(extractVerifiedUser(payload));
    }

    const httpStatus = response?.status || 200;

    if (!user?.id || isPatientUser(user)) {
        clearStaffCredentialState();
        updateCredentialDebug('invalid', {
            httpStatus,
            message: STAFF_SESSION_INVALID_MESSAGE
        });
        renderStaffShellError({
            title: 'Akses staff ditolak',
            message: STAFF_SESSION_INVALID_MESSAGE,
            details: 'Payload sesi bukan akun staff yang valid.'
        });
        throw createRenderedError(STAFF_SESSION_INVALID_MESSAGE, {
            httpStatus,
            code: 'invalid_staff_payload'
        });
    }

    if (auth && typeof auth === 'object') {
        auth.currentUser = user;
    }

    updateCredentialDebug('valid', {
        httpStatus,
        userId: user.id || user.uid,
        userRole: user.role || user.role_display_name || null
    });

    return user;
}

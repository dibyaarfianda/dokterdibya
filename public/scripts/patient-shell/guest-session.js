const GUEST_MODE_KEY = 'sisiwanita_guest_mode';
const GUEST_STARTED_AT_KEY = 'sisiwanita_guest_started_at';
const GUEST_SESSION_ID_KEY = 'sisiwanita_guest_session_id';
const GUEST_SESSION_TTL_MS = 4 * 60 * 60 * 1000;

export const GUEST_DEMO_PROFILE = Object.freeze({
    id: 'DEMO',
    patient_id: 'DEMO',
    medicalRecordId: 'DEMO',
    fullname: 'Tamu SISIwanita',
    full_name: 'Tamu SISIwanita',
    name: 'Tamu SISIwanita',
    email: 'demo@sisiwanita.id',
    phone: '-',
    birth_date: null,
    is_guest: true
});

export function createGuestSession(options = {}) {
    const clearPatientAuth = options.clearPatientAuth || (() => {});

    function isLocalHost() {
        return window.location.hostname === 'localhost'
            || window.location.hostname === '127.0.0.1'
            || window.location.hostname === '[::1]';
    }

    function clear() {
        try {
            localStorage.removeItem(GUEST_MODE_KEY);
            localStorage.removeItem(GUEST_STARTED_AT_KEY);
            sessionStorage.removeItem(GUEST_MODE_KEY);
            sessionStorage.removeItem(GUEST_STARTED_AT_KEY);
            sessionStorage.removeItem(GUEST_SESSION_ID_KEY);
        } catch (error) {}
    }

    function getSessionId() {
        try {
            let existing = sessionStorage.getItem(GUEST_SESSION_ID_KEY);
            if (existing) return existing;
            existing = 'guest_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
            sessionStorage.setItem(GUEST_SESSION_ID_KEY, existing);
            return existing;
        } catch (error) {
            return 'guest_' + Date.now().toString(36);
        }
    }

    function isActive() {
        if (!isLocalHost()) {
            clear();
            return false;
        }

        const marker = sessionStorage.getItem(GUEST_MODE_KEY) || localStorage.getItem(GUEST_MODE_KEY);
        if (marker !== '1') return false;

        const startedAt = Number(
            sessionStorage.getItem(GUEST_STARTED_AT_KEY)
            || localStorage.getItem(GUEST_STARTED_AT_KEY)
            || 0
        );
        if (startedAt && Date.now() - startedAt > GUEST_SESSION_TTL_MS) {
            clear();
            return false;
        }
        return true;
    }

    function start() {
        if (!isLocalHost()) {
            clear();
            return false;
        }

        try {
            const existingGuestSessionId = sessionStorage.getItem(GUEST_SESSION_ID_KEY);
            clearPatientAuth();
            clear();
            if (existingGuestSessionId) {
                sessionStorage.setItem(GUEST_SESSION_ID_KEY, existingGuestSessionId);
            }
            sessionStorage.setItem(GUEST_MODE_KEY, '1');
            sessionStorage.setItem(GUEST_STARTED_AT_KEY, String(Date.now()));
            return true;
        } catch (error) {
            return false;
        }
    }

    function track(eventType, details, pagePath) {
        if (!isActive()) return;

        try {
            const payload = JSON.stringify({
                session_id: getSessionId(),
                event_type: eventType,
                page_path: pagePath || (window.location.pathname + window.location.search),
                page_title: document.title,
                details: details || '',
                referrer: document.referrer || ''
            });
            if (navigator.sendBeacon) {
                navigator.sendBeacon('/api/guest-activity', new Blob([payload], { type: 'application/json' }));
                return;
            }
            fetch('/api/guest-activity', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: payload,
                keepalive: true
            }).catch(() => {});
        } catch (error) {}
    }

    return Object.freeze({
        clear,
        isActive,
        isLocalHost,
        start,
        track
    });
}

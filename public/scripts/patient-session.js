(function initializePatientSession(global) {
    'use strict';

    const TOKEN_KEY = 'vps_auth_token';
    const USER_KEY = 'patient_user';
    const DEMO_MODE_KEY = 'patient_demo_mode';
    const LEGACY_TOKEN_KEYS = ['patient_token', 'auth_token', 'token'];

    function safely(operation, fallback = null) {
        try {
            return operation();
        } catch (error) {
            console.warn('[PatientSession] Browser storage is unavailable:', error);
            return fallback;
        }
    }

    function read(storage, key) {
        return safely(() => storage.getItem(key));
    }

    function remove(storage, key) {
        safely(() => storage.removeItem(key));
    }

    function write(storage, key, value) {
        return safely(() => {
            storage.setItem(key, value);
            return true;
        }, false);
    }

    function clearTokenKeys() {
        [TOKEN_KEY, ...LEGACY_TOKEN_KEYS].forEach((key) => {
            remove(global.localStorage, key);
            remove(global.sessionStorage, key);
        });
    }

    function getToken() {
        const canonical = read(global.localStorage, TOKEN_KEY)
            || read(global.sessionStorage, TOKEN_KEY);
        if (canonical) return canonical;

        for (const key of LEGACY_TOKEN_KEYS) {
            const persistentToken = read(global.localStorage, key);
            const sessionToken = read(global.sessionStorage, key);
            const token = persistentToken || sessionToken;
            if (!token) continue;

            setToken(token, { persistent: Boolean(persistentToken) });
            return token;
        }

        return null;
    }

    function setToken(token, options = {}) {
        clearTokenKeys();
        if (!options.demoMode) remove(global.sessionStorage, DEMO_MODE_KEY);
        if (!token) return null;

        const storage = options.persistent ? global.localStorage : global.sessionStorage;
        write(storage, TOKEN_KEY, String(token));
        return String(token);
    }

    function getUser() {
        const raw = read(global.localStorage, USER_KEY)
            || read(global.sessionStorage, USER_KEY);
        if (!raw) return null;

        return safely(() => JSON.parse(raw));
    }

    function setUser(user, options = {}) {
        remove(global.localStorage, USER_KEY);
        remove(global.sessionStorage, USER_KEY);
        if (!user) return null;

        const storage = options.persistent ? global.localStorage : global.sessionStorage;
        write(storage, USER_KEY, JSON.stringify(user));
        return user;
    }

    function clearAuth() {
        clearTokenKeys();
        remove(global.localStorage, USER_KEY);
        remove(global.sessionStorage, USER_KEY);
        remove(global.sessionStorage, DEMO_MODE_KEY);
    }

    function isDemoMode() {
        return read(global.sessionStorage, DEMO_MODE_KEY) === 'true';
    }

    function setDemoMode(enabled) {
        if (enabled) write(global.sessionStorage, DEMO_MODE_KEY, 'true');
        else remove(global.sessionStorage, DEMO_MODE_KEY);
        renderDemoBanner();
        return Boolean(enabled);
    }

    function renderDemoBanner() {
        if (!isDemoMode() || !global.document) return;
        if (global.document.getElementById('patient-demo-mode-banner')) return;
        const style = global.document.createElement('style');
        style.id = 'patient-demo-mode-style';
        style.textContent = '#patient-demo-mode-banner{position:fixed;top:0;left:0;right:0;z-index:2147483647;background:#231a05;color:#ffe08a;border-bottom:3px solid #f0ad00;text-align:center;font:800 13px/1.25 system-ui,sans-serif;letter-spacing:.035em;padding:9px 42px}body.patient-demo-mode{padding-top:38px!important}';
        const banner = global.document.createElement('div');
        banner.id = 'patient-demo-mode-banner';
        banner.setAttribute('role', 'status');
        banner.textContent = 'MODE DUMMY — tidak menggunakan data pasien nyata';
        global.document.head.appendChild(style);
        global.document.body.prepend(banner);
        global.document.body.classList.add('patient-demo-mode');
    }

    if (global.document) {
        if (global.document.readyState === 'loading') global.document.addEventListener('DOMContentLoaded', renderDemoBanner, { once: true });
        else renderDemoBanner();
    }

    global.PatientSession = Object.freeze({
        TOKEN_KEY,
        USER_KEY,
        DEMO_MODE_KEY,
        getToken,
        setToken,
        getUser,
        setUser,
        clearAuth,
        isDemoMode,
        setDemoMode,
        renderDemoBanner
    });
})(window);

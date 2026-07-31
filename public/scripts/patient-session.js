(function initializePatientSession(global) {
    'use strict';

    const TOKEN_KEY = 'vps_auth_token';
    const USER_KEY = 'patient_user';
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
    }

    global.PatientSession = Object.freeze({
        TOKEN_KEY,
        USER_KEY,
        getToken,
        setToken,
        getUser,
        setUser,
        clearAuth
    });
})(window);

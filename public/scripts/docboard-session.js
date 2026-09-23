// Shared with DocBoard's API client. Keep staff and patient sessions separate.
const DOCBOARD_TOKEN_KEY = 'docboard_token';
export const docboardSession = Object.freeze({
    getToken() {
        try { return localStorage.getItem(DOCBOARD_TOKEN_KEY); }
        catch (_) { return null; }
    },
    setToken(token) {
        localStorage.setItem(DOCBOARD_TOKEN_KEY, token);
        window.dispatchEvent?.(new CustomEvent('auth:credentials-changed'));
    },
    clearToken() {
        localStorage.removeItem(DOCBOARD_TOKEN_KEY);
        window.dispatchEvent?.(new CustomEvent('auth:credentials-changed'));
    }
});

import { badgeLabel } from './community-chat-ui.js?v=20260923chat1';
import '/scripts/socket-credentials.js';

export function startCommunityBadge({ getToken, enabled, badge }) {
    if (!badge) return;
    let busy = false, previousToken = null, timer = null, socket = null;
    let stopped = false, refreshTimer = null;
    async function refresh() {
        if (stopped) return;
        const token = getToken();
        if (!enabled() || !token) {
            previousToken = null; badge.hidden = true; badge.textContent = '';
            socket?.stopCredentialTracking?.(); socket?.disconnect(); socket = null;
            return;
        }
        if (token !== previousToken) {
            badge.hidden = true; badge.textContent = ''; previousToken = token;
            socket?.stopCredentialTracking?.(); socket?.disconnect(); socket = null;
            connect();
        }
        if (document.hidden || busy) return;
        busy = true;
        try {
            const response = await fetch('/api/community-chat/unread?_t=' + Date.now(), {
                headers: { Authorization: 'Bearer ' + token, 'Cache-Control': 'no-cache' }, cache: 'no-store'
            });
            if (!response.ok) return;
            const data = await response.json();
            if (!data.success || token !== getToken() || !enabled()) return;
            const total = Math.max(0, Number(data.total) || 0);
            badge.textContent = badgeLabel(total);
            badge.hidden = total === 0;
            badge.setAttribute('aria-label', total + ' pesan chat belum dibaca');
        } catch (_) {
            // Keep the last confirmed count through temporary network failures.
        } finally { busy = false; }
    }
    function schedule() {
        clearTimeout(refreshTimer);
        refreshTimer = setTimeout(refresh, 150);
    }
    async function connect() {
        if (stopped || !enabled() || !getToken() || socket) return;
        if (!window.io) {
            window.__communitySocketLoader ||= new Promise(resolve => {
                const script = document.createElement('script');
                script.src = '/socket.io/socket.io.js';
                script.onload = resolve; script.onerror = resolve;
                document.head.appendChild(script);
            });
            await window.__communitySocketLoader;
        }
        if (stopped || !enabled() || !getToken() || !window.io || socket) return;
        socket = window.io(window.location.origin, { transports: ['polling'], upgrade: false, autoConnect: false,
            auth: callback => callback({ token: getToken() }) });
        window.bindSocketCredentials(socket, getToken);
        socket.on('community:rooms:changed', schedule);
        socket.on('connect', schedule);
    }
    function resume() { refresh(); connect(); }
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('pageshow', resume);
    window.addEventListener('focus', resume);
    window.addEventListener('storage', resume);
    window.addEventListener('community:read', schedule);
    timer = setInterval(refresh, 15000);
    resume();
    return () => {
        stopped = true; clearInterval(timer); clearTimeout(refreshTimer); socket?.stopCredentialTracking?.(); socket?.disconnect();
        document.removeEventListener('visibilitychange', resume);
        for (const event of ['pageshow', 'focus', 'storage']) window.removeEventListener(event, resume);
        window.removeEventListener('community:read', schedule);
    };
}

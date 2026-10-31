// Unread staff-message badge for the patient "Pesan" menu card.
const badge = document.getElementById('patient-inbox-badge');
let busy = false;

async function refresh() {
    if (!badge || busy || document.hidden) return;
    const token = window.PatientSession?.getToken?.();
    if (!token) { badge.hidden = true; return; }
    busy = true;
    try {
        const response = await fetch('/api/community-chat/inbox/count?_t=' + Date.now(), {
            headers: { Authorization: 'Bearer ' + token, 'Cache-Control': 'no-cache' }, cache: 'no-store'
        });
        if (!response.ok) return;
        const data = await response.json();
        if (!data.success) return;
        const total = Math.max(0, Number(data.unread_total) || 0);
        badge.textContent = total > 99 ? '99+' : String(total);
        badge.hidden = total === 0;
        badge.setAttribute('aria-label', total + ' pesan belum dibaca');
    } catch (_) {
        // Keep the last count through temporary network failures.
    } finally {
        busy = false;
    }
}

if (badge) {
    refresh();
    setInterval(refresh, 20000);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('pageshow', refresh);
    window.addEventListener('auth:credentials-changed', refresh);
}

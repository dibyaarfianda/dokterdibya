import { getIdToken } from '../vps-auth-v2.js';

const JOB_KEY = 'support-chat-badge';
let initialized = false;

function updateBadge(count) {
    const badge = document.getElementById('support-chat-badge');
    if (!badge) return;
    const safeCount = Math.max(0, Number(count) || 0);
    badge.textContent = safeCount > 0 ? String(safeCount) : '';
    badge.classList.toggle('d-none', safeCount === 0);
    badge.style.display = safeCount > 0 ? 'inline-flex' : 'none';
}

async function refreshSupportChatBadge({ signal } = {}) {
    const token = await getIdToken();
    if (!token) return;
    const response = await fetch('/api/support-chat/staff/count', {
        signal,
        headers: {
            Authorization: `Bearer ${token}`,
            'Cache-Control': 'no-cache'
        }
    });
    if (!response.ok) throw new Error(`Support badge HTTP ${response.status}`);
    const data = await response.json();
    updateBadge(data.count || 0);
}

export function initSupportChatBadge() {
    if (initialized) return;
    const coordinator = window.staffPollingCoordinator;
    if (!coordinator) return;
    initialized = true;
    coordinator.register(JOB_KEY, {
        interval: 60000,
        backoff: 120000,
        run: refreshSupportChatBadge
    });
}

export { refreshSupportChatBadge, updateBadge };

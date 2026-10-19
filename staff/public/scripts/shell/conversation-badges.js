import { getIdToken } from '../vps-auth-v2.js';

const sources = {
    tanya: { url: '/api/patient-questions/staff/count', field: 'count', nav: 'nav-tanya-dokter' },
    community: { url: '/api/community-chat/unread', field: 'total', nav: 'nav-community-chat' }
};
const counts = { tanya: 0, community: 0 };
let initialized = false;
const userNow = () => window.currentStaffUser || window.auth?.currentUser;
const allowed = key => Boolean(userNow()) && (userNow().is_doctor_protected || userNow().navigation?.includes(sources[key].nav));
function apply() {
    const selected = window.staffMobileQuickMenu?.selected() || ['tanya'];
    document.querySelectorAll('[data-conversation-badge]').forEach(badge => {
        const key = badge.dataset.conversationBadge;
        const count = key === 'more'
            ? Object.keys(counts).reduce((total, name) => total + (!selected.includes(name) && allowed(name) ? counts[name] : 0), 0)
            : allowed(key) ? counts[key] || 0 : 0;
        badge.textContent = count ? count > 99 ? '99+' : String(count) : '';
        badge.hidden = count === 0;
        badge.classList.toggle('d-none', count === 0);
        badge.setAttribute('aria-label', count + (key === 'tanya' ? ' pertanyaan menunggu jawaban' : ' pesan belum dibaca'));
    });
}
function update(key, count) {
    counts[key] = Number.isFinite(Number(count)) ? Math.max(0, Math.floor(Number(count))) : 0;
    apply();
}
async function refresh(key, { signal } = {}) {
    if (!allowed(key)) { update(key, 0); return; }
    const userId = userNow()?.id;
    const token = await getIdToken();
    if (!token) return;
    const response = await fetch(sources[key].url + '?_t=' + Date.now(), {
        signal, cache: 'no-store', headers: { Authorization: 'Bearer ' + token, 'Cache-Control': 'no-cache' }
    });
    if (!response.ok) throw new Error('Conversation badge HTTP ' + response.status);
    const data = await response.json();
    if (data.success && !signal?.aborted && userId === userNow()?.id && allowed(key)) update(key, data[sources[key].field]);
}
function trigger() {
    apply();
    Object.keys(sources).forEach(key => window.staffPollingCoordinator?.trigger('staff-' + key + '-badge'));
}
export function initConversationBadges() {
    if (initialized || !window.staffPollingCoordinator) return;
    initialized = true;
    Object.keys(sources).forEach(key => window.staffPollingCoordinator.register('staff-' + key + '-badge', {
        interval: 15000, backoff: 60000, run: options => refresh(key, options)
    }));
    document.addEventListener('page:changed', trigger);
    window.addEventListener('focus', trigger);
    window.addEventListener('staff:access-changed', () => { update('tanya', 0); update('community', 0); trigger(); });
    window.addEventListener('staff:conversation-changed', trigger);
}
window.staffConversationBadges = { init: initConversationBadges, update, apply };

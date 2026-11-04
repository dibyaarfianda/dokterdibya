/**
 * GLOBAL RULE - staff sidebar "new" red dots.
 *
 * Every sidebar menu (<li class="nav-item" id="...">) gets a small red dot when
 * something new happened in that section since this staff member last opened it.
 * The dot disappears as soon as the page is opened (nav-link becomes .active).
 *
 * Backend: GET /api/staff-menu-badges, POST /api/staff-menu-badges/seen
 * Sources per menu: staff/backend/config/menu-activity-sources.js
 *
 * Mirrors: any element with [data-menu-dot="<li id>"] (mobile quick menu, "Lainnya"
 * sheet) follows the same state; [data-menu-dot="more"] lights up when a menu
 * hidden behind "Lainnya" has a dot.
 */
import { staffApiRequest } from '../staff-api.js';

const JOB_KEY = 'staff-menu-new-dots';
const SOCKET_EVENTS = [
    'booking:new',
    'support:escalated',
    'support:new_message',
    'community:message:new',
    'staff-announcement:new',
    'announcement:new',
    'poll:created'
];

let initialized = false;
let badges = {};
let activeKeys = new Set();
let socketBound = null;
let socketTriggerTimer = null;
const lastSeenPost = new Map();

const userNow = () => window.currentStaffUser || window.auth?.currentUser || null;

function sidebarItems() {
    return Array.from(document.querySelectorAll('li.nav-item[id]'))
        .filter(item => item.closest('.nav-sidebar') || item.closest('#staff-compact-shortcuts') || item.closest('.main-sidebar'));
}

function linkOf(item) {
    return item.querySelector(':scope > .nav-link');
}

function ensureDot(item) {
    const link = linkOf(item);
    if (!link) return null;
    let dot = link.querySelector(':scope .staff-new-dot[data-menu-dot]');
    if (dot) return dot;
    dot = document.createElement('span');
    dot.className = 'staff-new-dot';
    dot.dataset.menuDot = item.id;
    dot.hidden = true;
    dot.setAttribute('aria-label', 'Ada yang baru');
    // Attached to the link (not the <p>) so it stays visible when the sidebar is collapsed.
    link.appendChild(dot);
    return dot;
}

function currentActiveKeys() {
    return new Set(sidebarItems()
        .filter(item => linkOf(item)?.classList.contains('active') && !item.classList.contains('has-treeview'))
        .map(item => item.id));
}

function hasDot(key) {
    return Boolean(badges[key]) && !activeKeys.has(key);
}

function apply() {
    const items = sidebarItems();
    items.forEach(item => {
        if (item.classList.contains('has-treeview')) return;
        const dot = ensureDot(item);
        if (dot) dot.hidden = !hasDot(item.id);
    });
    // Parent treeview menus: dot when any child has one.
    items.filter(item => item.classList.contains('has-treeview')).forEach(parent => {
        const dot = ensureDot(parent);
        if (!dot) return;
        const children = Array.from(parent.querySelectorAll('.nav-treeview li.nav-item[id]'));
        dot.hidden = !children.some(child => hasDot(child.id));
    });
    // Mirrors outside the sidebar (mobile quick menu, "Lainnya" sheet).
    const hiddenKeys = (window.staffMobileQuickMenu?.moreItems?.() || []).map(entry => entry.navId).filter(Boolean);
    document.querySelectorAll('[data-menu-dot]').forEach(el => {
        if (el.closest('li.nav-item[id]') && el.dataset.menuDot === el.closest('li.nav-item[id]').id) return;
        const key = el.dataset.menuDot;
        el.hidden = key === 'more' ? !hiddenKeys.some(hasDot) : !hasDot(key);
    });
    window.dispatchEvent(new CustomEvent('staff:menu-dots-changed'));
}

async function postSeen(key) {
    if (!key) return;
    const last = lastSeenPost.get(key) || 0;
    if (Date.now() - last < 5000) return;
    lastSeenPost.set(key, Date.now());
    try {
        await staffApiRequest('/api/staff-menu-badges/seen', {
            method: 'POST',
            body: JSON.stringify({ navKey: key }),
            retries: 0
        });
    } catch (error) {
        lastSeenPost.delete(key);
        if (error?.status !== 400) console.warn('[menu-new-dots] seen failed:', error?.message || error);
    }
}

function syncActive() {
    const next = currentActiveKeys();
    const changed = [...next].some(key => !activeKeys.has(key)) || [...activeKeys].some(key => !next.has(key));
    if (!changed) return;
    const left = [...activeKeys].filter(key => !next.has(key));
    const opened = [...next].filter(key => !activeKeys.has(key));
    activeKeys = next;
    opened.forEach(key => { badges[key] = false; });
    // Mark both the page just opened and the page just left (covers items that
    // arrived while the staff was looking at it).
    [...opened, ...left].forEach(key => postSeen(key));
    apply();
}

function bindSocket() {
    const socket = window.socket;
    if (!socket || socketBound === socket || typeof socket.on !== 'function') return;
    socketBound = socket;
    const onEvent = () => {
        clearTimeout(socketTriggerTimer);
        // Small delay so the server-side latest-activity cache can expire/refresh.
        socketTriggerTimer = setTimeout(() => window.staffPollingCoordinator?.trigger(JOB_KEY), 1500);
    };
    SOCKET_EVENTS.forEach(name => socket.on(name, onEvent));
}

async function refresh({ signal } = {}) {
    if (!userNow()) return;
    bindSocket();
    syncActive();
    // Pages that stay open keep their seen time fresh, so a staff member's own
    // edits on the open page never light up a dot for themselves.
    await Promise.all([...activeKeys].map(key => postSeen(key)));
    const userId = userNow()?.id;
    const result = await staffApiRequest('/api/staff-menu-badges?_t=' + Date.now(), {
        signal,
        retries: 0,
        coalesce: false,
        headers: { 'Cache-Control': 'no-cache' }
    });
    if (!result?.success || signal?.aborted || userId !== userNow()?.id) return;
    badges = result.badges || {};
    activeKeys.forEach(key => { badges[key] = false; });
    apply();
}

function observeActive() {
    const observer = new MutationObserver(syncActive);
    sidebarItems().forEach(item => {
        const link = linkOf(item);
        if (link) observer.observe(link, { attributes: true, attributeFilter: ['class'] });
    });
}

export function initMenuNewBadges() {
    if (initialized || !window.staffPollingCoordinator) return;
    initialized = true;
    apply();
    observeActive();
    document.addEventListener('page:changed', () => setTimeout(syncActive, 0));
    window.addEventListener('focus', () => window.staffPollingCoordinator?.trigger(JOB_KEY));
    window.addEventListener('staff:auth-ready', () => window.staffPollingCoordinator?.trigger(JOB_KEY));
    window.addEventListener('staff:access-changed', () => {
        badges = {};
        apply();
        window.staffPollingCoordinator?.trigger(JOB_KEY);
    });
    window.staffPollingCoordinator.register(JOB_KEY, {
        interval: 60000,
        backoff: 120000,
        run: refresh
    });
}

window.staffMenuNewBadges = {
    init: initMenuNewBadges,
    apply,
    refresh: () => window.staffPollingCoordinator?.trigger(JOB_KEY),
    hasDot
};

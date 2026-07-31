import { staffApiRequest } from '../staff-api.js';

const LOCATIONS = [
    'klinik_private',
    'rsia_melinda',
    'rsud_gambiran',
    'rs_bhayangkara',
    'artikel'
];

let scheduleHandle = null;
let refreshInterval = null;

function getLastSeenTimestamp(location) {
    return localStorage.getItem(`badge_last_seen_${location}`) || null;
}

function markBadgeRead(location) {
    localStorage.setItem(`badge_last_seen_${location}`, new Date().toISOString());
    const badge = document.getElementById(`badge-${location.replace(/_/g, '-')}`);
    if (badge) {
        badge.classList.add('d-none');
        badge.textContent = '0';
    }
}

function updateBadge(badgeId, count) {
    const badge = document.getElementById(badgeId);
    if (!badge) return;
    badge.textContent = String(count || 0);
    badge.classList.toggle('d-none', !(count > 0));
}

async function loadNotificationBadges() {
    try {
        const lastSeen = Object.fromEntries(
            LOCATIONS.map(location => [location, getLastSeenTimestamp(location)])
        );
        const result = await staffApiRequest('/api/notifications/badge-counts', {
            method: 'POST',
            body: JSON.stringify({ lastSeen }),
            retries: 0
        });
        if (!result?.success) return;

        const counts = result.counts || {};
        updateBadge('badge-klinik-private', counts.klinik_private);
        updateBadge('badge-rsia-melinda', counts.rsia_melinda);
        updateBadge('badge-rsud-gambiran', counts.rsud_gambiran);
        updateBadge('badge-rs-bhayangkara', counts.rs_bhayangkara);
        updateBadge('badge-artikel-likes', counts.artikel);
    } catch (error) {
        console.error('Error loading notification badges:', error);
    }
}

function scheduleNotificationBadges(delayMs = 900) {
    if (scheduleHandle) return;

    const execute = () => {
        scheduleHandle = null;
        loadNotificationBadges();
    };

    if (typeof window.requestIdleCallback === 'function') {
        scheduleHandle = window.requestIdleCallback(execute, { timeout: delayMs + 800 });
    } else {
        scheduleHandle = window.setTimeout(execute, delayMs);
    }

    if (!refreshInterval) {
        refreshInterval = window.setInterval(() => {
            if (document.visibilityState === 'visible') loadNotificationBadges();
        }, 120000);
    }
}

Object.assign(window, {
    markBadgeRead,
    loadNotificationBadges,
    scheduleNotificationBadges
});

import { staffApiRequest } from '../staff-api.js';
import { escapeHtml, escapeAttribute, sanitizeUrl } from '../safe-render.js';

// Notification system variables
let notificationPollInterval = null;
let lastNotificationCount = 0;
let notificationCountInFlight = false;
let notificationCountBackoffUntil = 0;
let notificationSystemInitialized = false;
const NOTIFICATION_COUNT_ERROR_BACKOFF_MS = 60000;
const NOTIFICATION_ICON_PATTERN = /^(?:fas|far|fab)\s+fa-[a-z0-9-]+$/;
const NOTIFICATION_COLOR_PATTERN = /^text-(?:primary|secondary|success|danger|warning|info|muted|dark)$/;

function normalizeNotificationId(value) {
    const id = Number.parseInt(value, 10);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function normalizeNotificationSource(value) {
    return value === 'announcement' ? 'announcement' : 'notification';
}

function normalizeNotificationIcon(value) {
    const icon = String(value || '').trim();
    return NOTIFICATION_ICON_PATTERN.test(icon) ? icon : 'fas fa-bell';
}

function normalizeNotificationColor(value) {
    const color = String(value || '').trim();
    return NOTIFICATION_COLOR_PATTERN.test(color) ? color : 'text-primary';
}

function initNotificationSystem() {
    if (notificationSystemInitialized || !window.auth?.currentUser) return;
    notificationSystemInitialized = true;

    // Load unread count first, full list only when user opens dropdown.
    loadNotificationCount();

    // Poll for new notifications every 30 seconds, pause when tab hidden
    notificationPollInterval = setInterval(() => {
        if (document.visibilityState === 'visible') {
            loadNotificationCount();
        }
    }, 30000);

    // Resume immediately when tab becomes visible again
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            loadNotificationCount();
        }
    });

    // Load notifications when dropdown is opened
    const notificationDropdown = document.getElementById('notification-dropdown');
    if (notificationDropdown) {
        notificationDropdown.addEventListener('show.bs.dropdown', loadNotifications);
        // Also handle jQuery events for Bootstrap 4
        $(notificationDropdown).on('show.bs.dropdown', loadNotifications);
    }
}

async function loadNotificationCount() {
    if (notificationCountInFlight) return;
    if (Date.now() < notificationCountBackoffUntil) return;

    notificationCountInFlight = true;
    try {
        const data = await staffApiRequest('/api/notifications/count', {
            retries: 1,
            coalesce: true
        });
        if (data.success) {
            notificationCountBackoffUntil = 0;
            updateNotificationBadge(data.count);
        }
    } catch (error) {
        if (error?.status >= 500 || error?.status === 429 || !error?.status) {
            notificationCountBackoffUntil = Date.now() + NOTIFICATION_COUNT_ERROR_BACKOFF_MS;
        }
        console.error('[Notifications] Error loading count:', error);
    } finally {
        notificationCountInFlight = false;
    }
}

function updateNotificationBadge(count) {
    const badge = document.getElementById('notification-badge');
    const headerCount = document.getElementById('notification-header-count');

    if (badge) {
        if (count > 0) {
            badge.textContent = count > 99 ? '99+' : count;
            badge.style.display = 'inline';

            // Animate if count increased
            if (count > lastNotificationCount) {
                badge.classList.add('notification-pulse');
                setTimeout(() => badge.classList.remove('notification-pulse'), 1000);
            }
        } else {
            badge.style.display = 'none';
        }
    }

    if (headerCount) {
        headerCount.textContent = count;
    }

    lastNotificationCount = count;
}

async function loadNotifications() {
    try {
        const data = await staffApiRequest('/api/notifications/with-announcements?limit=10', {
            retries: 1,
            coalesce: true
        });
        if (data.success) {
            renderNotificationList(data.items || []);
            updateNotificationBadge(data.unread_count);
        }
    } catch (error) {
        console.error('[Notifications] Error loading notifications:', error);
        document.getElementById('notification-list').innerHTML = `
            <div class="dropdown-item text-center text-muted py-3">
                <i class="fas fa-exclamation-circle text-danger"></i> Gagal memuat notifikasi
            </div>
        `;
    }
}

function renderNotificationList(items) {
    const container = document.getElementById('notification-list');
    if (!container) return;

    if (items.length === 0) {
        container.innerHTML = `
            <div class="dropdown-item text-center text-muted py-3">
                <i class="far fa-bell-slash"></i> Tidak ada notifikasi
            </div>
        `;
        return;
    }

    container.innerHTML = items.map(item => {
        const isRead = item.is_read;
        const timeAgo = formatTimeAgo(item.created_at);
        const bgClass = isRead ? '' : 'bg-light';
        const id = normalizeNotificationId(item.id);
        const source = normalizeNotificationSource(item.source);
        const link = normalizeNotificationLink(item.link);
        const icon = normalizeNotificationIcon(item.icon);
        const iconColor = normalizeNotificationColor(item.icon_color);

        return `
            <a href="#" class="dropdown-item notification-dropdown-item ${bgClass}"
               data-notification-id="${id || ''}"
               data-notification-source="${source}"
               data-notification-link="${escapeAttribute(link)}">
                <div class="d-flex align-items-start">
                    <div class="mr-2">
                        <i class="${icon} ${iconColor}"></i>
                    </div>
                    <div class="flex-grow-1" style="min-width: 0;">
                        <div class="d-flex justify-content-between align-items-center">
                            <strong class="text-dark" style="font-size: 13px;">${escapeHtml(item.title)}</strong>
                            ${!isRead ? '<span class="badge badge-primary badge-sm ml-1">Baru</span>' : ''}
                        </div>
                        <p class="text-muted text-sm mb-0" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                            ${escapeHtml(item.message?.substring(0, 80) || '')}${item.message?.length > 80 ? '...' : ''}
                        </p>
                        <small class="text-muted">${timeAgo}</small>
                    </div>
                </div>
            </a>
        `;
    }).join('');

    container.querySelectorAll('.notification-dropdown-item').forEach(link => {
        link.addEventListener('click', event => {
            event.preventDefault();
            const id = normalizeNotificationId(link.dataset.notificationId);
            if (!id) return;
            handleNotificationClick(
                id,
                normalizeNotificationSource(link.dataset.notificationSource),
                link.dataset.notificationLink || ''
            );
        });
    });
}

const NOTIFICATION_ACTIONS = Object.freeze({
    showKelolaPengumumanPage: () => window.showKelolaPengumumanPage?.(),
    showNotificationsPage: (id) => window.showNotificationsPage?.(id || null)
});

function normalizeNotificationLink(link) {
    const target = String(link || '').trim();
    if (!target) return '';

    if (target.startsWith('#')) {
        return target;
    }

    if (target.startsWith('javascript:')) {
        const actionMatch = target.match(/^javascript:([A-Za-z_$][\w$]*)\((\d*)\);?$/);
        return actionMatch && NOTIFICATION_ACTIONS[actionMatch[1]] ? target : '';
    }

    return sanitizeUrl(target);
}

function runNotificationNavigation(link) {
    const target = normalizeNotificationLink(link);
    if (!target) {
        if (link) console.warn('[Notifications] Blocked unsupported link:', link);
        return false;
    }

    if (target.startsWith('#')) {
        window.location.hash = target;
        return true;
    }

    if (target.startsWith('javascript:')) {
        const actionMatch = target.match(/^javascript:([A-Za-z_$][\w$]*)\((\d*)\);?$/);
        const action = actionMatch ? NOTIFICATION_ACTIONS[actionMatch[1]] : null;
        action(actionMatch?.[2] ? Number(actionMatch[2]) : null);
        return true;
    }

    window.location.assign(target);
    return true;
}

async function handleNotificationClick(id, source, link) {
    try {
        // Mark as read based on source type
        if (source === 'notification') {
            await staffApiRequest(`/api/notifications/${id}/read`, { method: 'POST' });
        } else if (source === 'announcement') {
            await staffApiRequest(`/api/staff-announcements/${id}/read`, { method: 'POST' });
        }

        // Update badge count
        loadNotificationCount();
    } catch (error) {
        console.error('[Notifications] Error marking as read:', error);
    }

    // Close dropdown first
    $('#notification-dropdown .dropdown-toggle').dropdown('hide');

    runNotificationNavigation(link);
}

async function markAllNotificationsRead() {
    try {
        const data = await staffApiRequest('/api/notifications/read-all', { method: 'POST' });
        if (data?.success !== false) {
            loadNotifications();
            updateNotificationBadge(0);
            if (typeof showToast === 'function') {
                showToast('Semua notifikasi ditandai sudah dibaca', 'success');
            }
        }
    } catch (error) {
        console.error('[Notifications] Error marking all as read:', error);
    }
}

function showAllNotifications() {
    // Close dropdown
    $('#notification-dropdown .dropdown-toggle').dropdown('hide');

    // Navigate to notifications page
    showNotificationsPage();
}

// ========== NOTIFICATIONS PAGE FUNCTIONS ==========
let notificationPageData = [];
let notificationPageFilter = 'all';
let notificationPagePage = 1;
const notificationPageLimit = 20;

async function showNotificationsPage(highlightAnnouncementId = null) {
    const markdownReady = Promise.resolve(window.ensureStaffFeature?.('markdown'))
        .catch(error => console.warn('[Notifications] Markdown renderer unavailable, using plain text:', error));

    // Hide all pages
    document.querySelectorAll('[id$="-page"]').forEach(page => {
        page.classList.add('d-none');
    });

    // Show notifications page
    const notifPage = document.getElementById('notifications-page');
    if (notifPage) {
        notifPage.classList.remove('d-none');
    }

    // Update page title
    const pageTitle = document.getElementById('page-title');
    if (pageTitle) {
        pageTitle.textContent = 'Notifikasi';
    }

    // Remove active from all nav items
    document.querySelectorAll('.nav-sidebar .nav-link').forEach(link => {
        link.classList.remove('active');
    });

    // Set active on notifications nav
    const navNotifications = document.querySelector('#nav-notifications .nav-link');
    if (navNotifications) {
        navNotifications.classList.add('active');
    }

    const notificationsContainer = document.getElementById('notifications-page-list');
    if (notificationsContainer) {
        notificationsContainer.innerHTML = `
            <div class="text-center py-5">
                <i class="fas fa-spinner fa-spin fa-2x text-muted"></i>
                <p class="mt-2 text-muted">Memuat notifikasi...</p>
            </div>
        `;
    }

    const announcementsReady = loadStaffAnnouncements();
    await markdownReady;
    loadNotificationsPage();
    announcementsReady.then(() => {
        // Scroll to and highlight specific announcement if provided
        const safeAnnouncementId = normalizeNotificationId(highlightAnnouncementId);
        if (safeAnnouncementId) {
            setTimeout(() => {
                const announcementEl = document.querySelector(`[data-announcement-id="${safeAnnouncementId}"]`);
                if (announcementEl) {
                    announcementEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    announcementEl.classList.add('highlight-flash');
                    setTimeout(() => announcementEl.classList.remove('highlight-flash'), 2000);
                }
            }, 300);
        }
    });
}

// Make showNotificationsPage globally available
window.showNotificationsPage = showNotificationsPage;

// ========== STAFF ANNOUNCEMENTS ==========
async function loadStaffAnnouncements() {
    const container = document.getElementById('staff-announcements-list');
    if (!container) return;

    try {
        const data = await staffApiRequest('/api/staff-announcements');
        const announcements = data.data || [];

        if (announcements.length === 0) {
            container.innerHTML = '<div class="text-muted text-center py-3"><i class="fas fa-info-circle mr-2"></i>Tidak ada pengumuman staff.</div>';
            return;
        }

        const isDokter = window.staffRoleConstants?.isSuperadminUser?.(window.auth?.currentUser) === true;

        container.innerHTML = announcements.map(a => {
            const announcementId = normalizeNotificationId(a.id);
            if (!announcementId) return '';
            const priorityClass = a.priority === 'urgent' ? 'border-danger' : (a.priority === 'important' ? 'border-warning' : 'border-info');
            const priorityIcon = a.priority === 'urgent' ? 'fa-exclamation-triangle text-danger' : (a.priority === 'important' ? 'fa-exclamation-circle text-warning' : 'fa-bullhorn text-info');
            const priorityBadge = a.priority === 'urgent' ? '<span class="badge badge-danger ml-2">URGENT</span>' : (a.priority === 'important' ? '<span class="badge badge-warning ml-2">Penting</span>' : '');
            const timeAgo = formatTimeAgo(new Date(a.created_at));

            return `
                <div class="callout ${priorityClass} mb-2" data-announcement-id="${announcementId}">
                    <div class="d-flex justify-content-between">
                        <h6 class="mb-1"><i class="fas ${priorityIcon} mr-2"></i>${escapeHtml(a.title)}${priorityBadge}</h6>
                        ${isDokter ? `
                            <div class="btn-group btn-group-sm">
                                <button class="btn btn-outline-secondary btn-xs" onclick="editStaffAnnouncement(${announcementId})" title="Edit">
                                    <i class="fas fa-edit"></i>
                                </button>
                                <button class="btn btn-outline-danger btn-xs" onclick="deleteStaffAnnouncement(${announcementId})" title="Hapus">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </div>
                        ` : ''}
                    </div>
                    <p class="mb-1" style="white-space: pre-wrap;">${escapeHtml(a.message)}</p>
                    <small class="text-muted">${escapeHtml(a.created_by_name || 'Admin')} - ${timeAgo}</small>
                </div>
            `;
        }).join('');

    } catch (error) {
        console.error('Failed to load staff announcements:', error);
        container.innerHTML = '<div class="text-danger text-center py-3"><i class="fas fa-exclamation-circle mr-2"></i>Gagal memuat pengumuman.</div>';
    }
}

function showCreateStaffAnnouncement() {
    document.getElementById('staff-announcement-id').value = '';
    document.getElementById('staff-announcement-title').value = '';
    document.getElementById('staff-announcement-message').value = '';
    document.getElementById('staff-announcement-priority').value = 'normal';
    document.getElementById('staff-announcement-status').value = 'active';
    document.getElementById('modal-staff-announcement-title').textContent = 'Buat Pengumuman Staff';
    $('#modal-staff-announcement').modal('show');
}

async function editStaffAnnouncement(id) {
    try {
        const announcementId = normalizeNotificationId(id);
        if (!announcementId) throw new Error('ID pengumuman tidak valid');
        const data = await staffApiRequest(`/api/staff-announcements/${announcementId}`);
        if (!data.success) throw new Error(data.message);

        const a = data.data;
        document.getElementById('staff-announcement-id').value = a.id;
        document.getElementById('staff-announcement-title').value = a.title;
        document.getElementById('staff-announcement-message').value = a.message;
        document.getElementById('staff-announcement-priority').value = a.priority;
        document.getElementById('staff-announcement-status').value = a.status;
        document.getElementById('modal-staff-announcement-title').textContent = 'Edit Pengumuman Staff';
        $('#modal-staff-announcement').modal('show');
    } catch (error) {
        Swal.fire('Error', error.message, 'error');
    }
}

async function saveStaffAnnouncement() {
    const id = document.getElementById('staff-announcement-id').value;
    const title = document.getElementById('staff-announcement-title').value.trim();
    const message = document.getElementById('staff-announcement-message').value.trim();
    const priority = document.getElementById('staff-announcement-priority').value;
    const status = document.getElementById('staff-announcement-status').value;

    if (!title || !message) {
        Swal.fire('Error', 'Judul dan isi pengumuman harus diisi', 'error');
        return;
    }

    try {
        const announcementId = id ? normalizeNotificationId(id) : null;
        if (id && !announcementId) throw new Error('ID pengumuman tidak valid');
        const url = announcementId ? `/api/staff-announcements/${announcementId}` : '/api/staff-announcements';
        const method = id ? 'PUT' : 'POST';

        const data = await staffApiRequest(url, {
            method,
            body: JSON.stringify({ title, message, priority, status })
        });

        if (!data.success) throw new Error(data.message);

        $('#modal-staff-announcement').modal('hide');
        Swal.fire('Sukses', id ? 'Pengumuman berhasil diperbarui' : 'Pengumuman berhasil dibuat', 'success');
        loadStaffAnnouncements();
    } catch (error) {
        Swal.fire('Error', error.message, 'error');
    }
}

async function deleteStaffAnnouncement(id) {
    const result = await Swal.fire({
        title: 'Hapus Pengumuman?',
        text: 'Pengumuman akan dihapus permanen.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Ya, Hapus',
        cancelButtonText: 'Batal'
    });

    if (!result.isConfirmed) return;

    try {
        const announcementId = normalizeNotificationId(id);
        if (!announcementId) throw new Error('ID pengumuman tidak valid');
        const data = await staffApiRequest(`/api/staff-announcements/${announcementId}`, {
            method: 'DELETE'
        });
        if (!data.success) throw new Error(data.message);

        Swal.fire('Sukses', 'Pengumuman berhasil dihapus', 'success');
        loadStaffAnnouncements();
    } catch (error) {
        Swal.fire('Error', error.message, 'error');
    }
}

// Export functions
window.loadStaffAnnouncements = loadStaffAnnouncements;
window.showCreateStaffAnnouncement = showCreateStaffAnnouncement;
window.editStaffAnnouncement = editStaffAnnouncement;
window.saveStaffAnnouncement = saveStaffAnnouncement;
window.deleteStaffAnnouncement = deleteStaffAnnouncement;

// ========== END STAFF ANNOUNCEMENTS ==========

async function loadNotificationsPage() {
    const container = document.getElementById('notifications-page-list');
    if (!container) return;

    // Show loading
    container.innerHTML = `
        <div class="text-center py-5">
            <i class="fas fa-spinner fa-spin fa-2x text-muted"></i>
            <p class="mt-2 text-muted">Memuat notifikasi...</p>
        </div>
    `;

    try {
        const [notifResult, annResult] = await Promise.allSettled([
            staffApiRequest('/api/notifications?limit=50'),
            staffApiRequest('/api/announcements?status=active&limit=20')
        ]);

        let notifications = [];
        let announcements = [];

        if (notifResult.status === 'fulfilled') {
            const notifData = notifResult.value;
            if (notifData.success) {
                notifications = notifData.notifications.map(n => ({ ...n, source: 'notification' }));
            }
        }

        if (annResult.status === 'fulfilled') {
            const annData = annResult.value;
            if (annData.success) {
                announcements = (annData.data || annData.announcements || []).map(a => ({
                    id: a.id,
                    type: 'announcement',
                    title: a.title,
                    message: a.message,
                    link: 'javascript:showKelolaPengumumanPage()',
                    icon: a.priority === 'urgent' ? 'fas fa-exclamation-triangle' : (a.priority === 'important' ? 'fas fa-exclamation-circle' : 'fas fa-bullhorn'),
                    icon_color: a.priority === 'urgent' ? 'text-danger' : (a.priority === 'important' ? 'text-warning' : 'text-info'),
                    created_at: a.created_at,
                    source: 'announcement',
                    is_read: 0
                }));
            }
        }

        if (notifResult.status === 'rejected' && annResult.status === 'rejected') {
            throw notifResult.reason;
        }

        // Combine and sort
        notificationPageData = [...notifications, ...announcements]
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        // Update stats
        updateNotificationPageStats();

        // Render with current filter
        renderNotificationsPageList();

    } catch (error) {
        console.error('[Notifications Page] Error:', error);
        container.innerHTML = `
            <div class="alert alert-danger">
                <i class="fas fa-exclamation-triangle mr-2"></i>
                Gagal memuat notifikasi. <a href="#" onclick="loadNotificationsPage(); return false;">Coba lagi</a>
            </div>
        `;
    }
}

function updateNotificationPageStats() {
    const notifications = notificationPageData.filter(n => n.source === 'notification');
    const announcements = notificationPageData.filter(n => n.source === 'announcement');
    const unread = notifications.filter(n => !n.is_read);
    const read = notifications.filter(n => n.is_read);

    document.getElementById('notif-stat-unread').textContent = unread.length;
    document.getElementById('notif-stat-read').textContent = read.length;
    document.getElementById('notif-stat-announcements').textContent = announcements.length;
    document.getElementById('notif-stat-total').textContent = notificationPageData.length;
}

function filterNotifications(filter) {
    notificationPageFilter = filter;
    notificationPagePage = 1;

    // Update tab active state
    document.querySelectorAll('#notification-tabs .nav-link').forEach(tab => {
        tab.classList.remove('active');
        if (tab.dataset.filter === filter) {
            tab.classList.add('active');
        }
    });

    renderNotificationsPageList();
}

// Render markdown for notification messages (safe subset)
function renderNotificationMarkdown(text) {
    if (!text) return '';
    try {
        if (window.marked && window.DOMPurify) {
            window.marked.setOptions({
                breaks: true,
                gfm: true
            });
            let html = window.marked.parse(text);
            html = html.replace(/^<p>/, '').replace(/<\/p>\n?$/, '');
            return window.DOMPurify.sanitize(html, {
                ALLOWED_TAGS: ['a', 'b', 'br', 'code', 'em', 'i', 'li', 'ol', 'p', 'strong', 'ul'],
                ALLOWED_ATTR: ['href', 'rel', 'target']
            });
        }
    } catch (e) {
        console.error('[Notifications] Markdown parse error:', e);
    }
    // Fallback to escaped text
    return escapeHtml(text);
}

function renderNotificationsPageList() {
    const container = document.getElementById('notifications-page-list');
    if (!container) return;

    // Filter data
    let filtered = notificationPageData;
    if (notificationPageFilter === 'unread') {
        filtered = notificationPageData.filter(n => !n.is_read);
    } else if (notificationPageFilter === 'notification') {
        filtered = notificationPageData.filter(n => n.source === 'notification');
    } else if (notificationPageFilter === 'announcement') {
        filtered = notificationPageData.filter(n => n.source === 'announcement');
    }

    if (filtered.length === 0) {
        container.innerHTML = `
            <div class="text-center py-5">
                <i class="far fa-bell-slash fa-3x text-muted mb-3"></i>
                <p class="text-muted">Tidak ada notifikasi${notificationPageFilter !== 'all' ? ' dalam kategori ini' : ''}.</p>
            </div>
        `;
        document.getElementById('notifications-pagination-container').style.display = 'none';
        return;
    }

    // Pagination
    const totalPages = Math.ceil(filtered.length / notificationPageLimit);
    const start = (notificationPagePage - 1) * notificationPageLimit;
    const end = Math.min(start + notificationPageLimit, filtered.length);
    const pageData = filtered.slice(start, end);

    // Render list
    container.innerHTML = pageData.map(item => {
        const isRead = item.is_read;
        const timeAgo = formatTimeAgo(item.created_at);
        const source = normalizeNotificationSource(item.source);
        const itemId = normalizeNotificationId(item.id);
        const link = normalizeNotificationLink(item.link);
        const icon = normalizeNotificationIcon(item.icon);
        const sourceLabel = source === 'announcement' ?
            '<span class="badge badge-info badge-sm ml-2">Pengumuman</span>' :
            '<span class="badge badge-secondary badge-sm ml-2">Notifikasi</span>';

        return `
            <div class="card mb-2 notification-card ${!isRead ? 'border-left-primary' : ''}"
                 data-notification-link="${escapeAttribute(link)}"
                 style="border-left-width: ${!isRead ? '4px' : '1px'}; cursor: ${link ? 'pointer' : 'default'};">
                <div class="card-body py-3">
                    <div class="d-flex align-items-start">
                        <div class="mr-3">
                            <span class="btn btn-${!isRead ? 'primary' : 'secondary'} btn-sm rounded-circle" style="width: 40px; height: 40px; padding: 0; display: flex; align-items: center; justify-content: center;">
                                <i class="${icon}"></i>
                            </span>
                        </div>
                        <div class="flex-grow-1">
                            <div class="d-flex justify-content-between align-items-start">
                                <div>
                                    <h6 class="mb-1 ${!isRead ? 'font-weight-bold' : ''}">
                                        ${escapeHtml(item.title)}
                                        ${!isRead ? '<span class="badge badge-primary ml-2">Baru</span>' : ''}
                                        ${sourceLabel}
                                    </h6>
                                    <div class="text-muted mb-2 notification-message">${renderNotificationMarkdown(item.message?.substring(0, 500) || '')}${item.message?.length > 500 ? '...' : ''}</div>
                                    <small class="text-muted">
                                        <i class="far fa-clock mr-1"></i>${timeAgo}
                                    </small>
                                </div>
                                <div class="ml-3">
                                    ${source === 'notification' && !isRead && itemId ? `
                                        <button class="btn btn-sm btn-outline-primary" data-notification-action="mark-read" data-notification-id="${itemId}" title="Tandai dibaca">
                                            <i class="fas fa-check"></i>
                                        </button>
                                    ` : ''}
                                    ${link ? `
                                        <a href="#" data-notification-action="open-link" class="btn btn-sm btn-outline-secondary ml-1" title="Lihat detail">
                                            <i class="fas fa-external-link-alt"></i>
                                        </a>
                                    ` : ''}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    container.querySelectorAll('.notification-card[data-notification-link]').forEach(card => {
        card.addEventListener('click', event => {
            if (event.target.closest('button, a')) return;
            runNotificationNavigation(card.dataset.notificationLink || '');
        });
    });
    container.querySelectorAll('[data-notification-action="mark-read"]').forEach(button => {
        button.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            const id = normalizeNotificationId(button.dataset.notificationId);
            if (id) markNotificationReadPage(id);
        });
    });
    container.querySelectorAll('[data-notification-action="open-link"]').forEach(linkButton => {
        linkButton.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            const card = linkButton.closest('.notification-card');
            runNotificationNavigation(card?.dataset.notificationLink || '');
        });
    });

    // Update pagination
    document.getElementById('notif-showing-start').textContent = start + 1;
    document.getElementById('notif-showing-end').textContent = end;
    document.getElementById('notif-showing-total').textContent = filtered.length;

    if (totalPages > 1) {
        document.getElementById('notifications-pagination-container').style.display = 'flex';
        renderNotificationsPagination(totalPages);
    } else {
        document.getElementById('notifications-pagination-container').style.display = 'none';
    }
}

function renderNotificationsPagination(totalPages) {
    const pagination = document.getElementById('notifications-pagination');
    if (!pagination) return;

    let html = '';

    // Previous
    html += `<li class="page-item ${notificationPagePage === 1 ? 'disabled' : ''}">
        <a class="page-link" href="#" onclick="goToNotificationPage(${notificationPagePage - 1}); return false;">&laquo;</a>
    </li>`;

    // Page numbers
    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= notificationPagePage - 2 && i <= notificationPagePage + 2)) {
            html += `<li class="page-item ${i === notificationPagePage ? 'active' : ''}">
                <a class="page-link" href="#" onclick="goToNotificationPage(${i}); return false;">${i}</a>
            </li>`;
        } else if (i === notificationPagePage - 3 || i === notificationPagePage + 3) {
            html += '<li class="page-item disabled"><span class="page-link">...</span></li>';
        }
    }

    // Next
    html += `<li class="page-item ${notificationPagePage === totalPages ? 'disabled' : ''}">
        <a class="page-link" href="#" onclick="goToNotificationPage(${notificationPagePage + 1}); return false;">&raquo;</a>
    </li>`;

    pagination.innerHTML = html;
}

function goToNotificationPage(page) {
    if (page < 1) return;
    notificationPagePage = page;
    renderNotificationsPageList();
    // Scroll to top
    document.getElementById('notifications-page').scrollIntoView({ behavior: 'smooth' });
}

async function markNotificationReadPage(id) {
    try {
        const notificationId = normalizeNotificationId(id);
        if (!notificationId) return;
        const data = await staffApiRequest(`/api/notifications/${notificationId}/read`, {
            method: 'POST'
        });
        if (data?.success !== false) {
            // Update local data
            const item = notificationPageData.find(n => normalizeNotificationId(n.id) === notificationId && n.source === 'notification');
            if (item) {
                item.is_read = 1;
            }
            updateNotificationPageStats();
            renderNotificationsPageList();
            loadNotificationCount(); // Update badge
        }
    } catch (error) {
        console.error('[Notifications Page] Error marking as read:', error);
    }
}

async function markAllNotificationsReadPage() {
    try {
        const data = await staffApiRequest('/api/notifications/read-all', { method: 'POST' });
        if (data?.success !== false) {
            // Update local data
            notificationPageData.forEach(n => {
                if (n.source === 'notification') {
                    n.is_read = 1;
                }
            });
            updateNotificationPageStats();
            renderNotificationsPageList();
            loadNotificationCount(); // Update badge
            if (typeof showToast === 'function') {
                showToast('Semua notifikasi ditandai sudah dibaca', 'success');
            }
        }
    } catch (error) {
        console.error('[Notifications Page] Error marking all as read:', error);
    }
}

function formatTimeAgo(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    if (diffSec < 60) return 'Baru saja';
    if (diffMin < 60) return `${diffMin} menit lalu`;
    if (diffHour < 24) return `${diffHour} jam lalu`;
    if (diffDay < 7) return `${diffDay} hari lalu`;

    return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

function handleNotifPageClick(link) {
    runNotificationNavigation(link);
}
window.handleNotifPageClick = handleNotifPageClick;
window.initStaffNotificationSystem = initNotificationSystem;
window.handleNotificationClick = handleNotificationClick;
window.markAllNotificationsRead = markAllNotificationsRead;
window.showAllNotifications = showAllNotifications;
window.loadNotificationsPage = loadNotificationsPage;
window.filterNotifications = filterNotifications;
window.goToNotificationPage = goToNotificationPage;
window.markNotificationReadPage = markNotificationReadPage;
window.markAllNotificationsReadPage = markAllNotificationsReadPage;

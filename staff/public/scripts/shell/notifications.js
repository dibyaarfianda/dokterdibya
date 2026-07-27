// Notification system variables
let notificationPollInterval = null;
let lastNotificationCount = 0;
let notificationCountInFlight = false;
let notificationCountBackoffUntil = 0;
let notificationSystemInitialized = false;
const NOTIFICATION_COUNT_ERROR_BACKOFF_MS = 60000;

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
        const token = await window.getIdToken();
        if (!token) return;

        const response = await fetch('/api/notifications/count', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
            if (response.status >= 500 || response.status === 429) {
                notificationCountBackoffUntil = Date.now() + NOTIFICATION_COUNT_ERROR_BACKOFF_MS;
            }
            return;
        }

        const data = await response.json();
        if (data.success) {
            notificationCountBackoffUntil = 0;
            updateNotificationBadge(data.count);
        }
    } catch (error) {
        notificationCountBackoffUntil = Date.now() + NOTIFICATION_COUNT_ERROR_BACKOFF_MS;
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
        const token = await window.getIdToken();
        if (!token) return;

        const response = await fetch('/api/notifications/with-announcements?limit=10', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) return;

        const data = await response.json();
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

        return `
            <a href="#" class="dropdown-item ${bgClass}" onclick="handleNotificationClick(${item.id}, '${item.source}', '${item.link || ''}'); return false;">
                <div class="d-flex align-items-start">
                    <div class="mr-2">
                        <i class="${item.icon || 'fas fa-bell'} ${item.icon_color || 'text-primary'}"></i>
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
}

const NOTIFICATION_ACTIONS = Object.freeze({
    showKelolaPengumumanPage: () => window.showKelolaPengumumanPage?.(),
    showNotificationsPage: (id) => window.showNotificationsPage?.(id || null)
});

function runNotificationNavigation(link) {
    const target = String(link || '').trim();
    if (!target) return false;

    if (target.startsWith('#')) {
        window.location.hash = target;
        return true;
    }

    if (target.startsWith('javascript:')) {
        const actionMatch = target.match(/^javascript:([A-Za-z_$][\w$]*)\((\d*)\);?$/);
        const action = actionMatch ? NOTIFICATION_ACTIONS[actionMatch[1]] : null;
        if (!action) {
            console.warn('[Notifications] Blocked unsupported action:', target);
            return false;
        }
        action(actionMatch[2] ? Number(actionMatch[2]) : null);
        return true;
    }

    window.location.assign(target);
    return true;
}

async function handleNotificationClick(id, source, link) {
    try {
        const token = await window.getIdToken();

        // Mark as read based on source type
        if (source === 'notification') {
            await fetch(`/api/notifications/${id}/read`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
        } else if (source === 'announcement') {
            await fetch(`/api/staff-announcements/${id}/read`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
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
        const token = await window.getIdToken();
        if (!token) return;

        const response = await fetch('/api/notifications/read-all', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
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

function showNotificationsPage(highlightAnnouncementId = null) {
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

    // Load notifications and staff announcements
    loadNotificationsPage();
    loadStaffAnnouncements().then(() => {
        // Scroll to and highlight specific announcement if provided
        if (highlightAnnouncementId) {
            setTimeout(() => {
                const announcementEl = document.querySelector(`[data-announcement-id="${highlightAnnouncementId}"]`);
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
        const token = (window.getAuthToken ? window.getAuthToken() : '');
        if (!token) return;

        const response = await fetch('/api/staff-announcements', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) throw new Error('Failed to load');

        const data = await response.json();
        const announcements = data.data || [];

        if (announcements.length === 0) {
            container.innerHTML = '<div class="text-muted text-center py-3"><i class="fas fa-info-circle mr-2"></i>Tidak ada pengumuman staff.</div>';
            return;
        }

        const isDokter = window.staffRoleConstants?.isSuperadminUser?.(window.auth?.currentUser) === true;

        container.innerHTML = announcements.map(a => {
            const priorityClass = a.priority === 'urgent' ? 'border-danger' : (a.priority === 'important' ? 'border-warning' : 'border-info');
            const priorityIcon = a.priority === 'urgent' ? 'fa-exclamation-triangle text-danger' : (a.priority === 'important' ? 'fa-exclamation-circle text-warning' : 'fa-bullhorn text-info');
            const priorityBadge = a.priority === 'urgent' ? '<span class="badge badge-danger ml-2">URGENT</span>' : (a.priority === 'important' ? '<span class="badge badge-warning ml-2">Penting</span>' : '');
            const timeAgo = formatTimeAgo(new Date(a.created_at));

            return `
                <div class="callout ${priorityClass} mb-2" data-announcement-id="${a.id}">
                    <div class="d-flex justify-content-between">
                        <h6 class="mb-1"><i class="fas ${priorityIcon} mr-2"></i>${escapeHtml(a.title)}${priorityBadge}</h6>
                        ${isDokter ? `
                            <div class="btn-group btn-group-sm">
                                <button class="btn btn-outline-secondary btn-xs" onclick="editStaffAnnouncement(${a.id})" title="Edit">
                                    <i class="fas fa-edit"></i>
                                </button>
                                <button class="btn btn-outline-danger btn-xs" onclick="deleteStaffAnnouncement(${a.id})" title="Hapus">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </div>
                        ` : ''}
                    </div>
                    <p class="mb-1" style="white-space: pre-wrap;">${escapeHtml(a.message)}</p>
                    <small class="text-muted">${a.created_by_name || 'Admin'} - ${timeAgo}</small>
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
        const token = (window.getAuthToken ? window.getAuthToken() : '');
        const response = await fetch(`/api/staff-announcements/${id}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
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
        const token = (window.getAuthToken ? window.getAuthToken() : '');
        const url = id ? `/api/staff-announcements/${id}` : '/api/staff-announcements';
        const method = id ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method,
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ title, message, priority, status })
        });

        const data = await response.json();
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
        const token = (window.getAuthToken ? window.getAuthToken() : '');
        const response = await fetch(`/api/staff-announcements/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const data = await response.json();
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
        const token = await window.getIdToken();
        if (!token) {
            container.innerHTML = '<div class="alert alert-warning">Silakan login untuk melihat notifikasi.</div>';
            return;
        }

        // Fetch notifications
        const notifResponse = await fetch('/api/notifications?limit=50', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        // Fetch announcements
        const annResponse = await fetch('/api/announcements?status=active&limit=20', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        let notifications = [];
        let announcements = [];

        if (notifResponse.ok) {
            const notifData = await notifResponse.json();
            if (notifData.success) {
                notifications = notifData.notifications.map(n => ({ ...n, source: 'notification' }));
            }
        }

        if (annResponse.ok) {
            const annData = await annResponse.json();
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
        // Use marked.js to parse markdown
        if (typeof marked !== 'undefined') {
            // Configure marked for safe output
            marked.setOptions({
                breaks: true,
                gfm: true
            });
            // Parse and return
            let html = marked.parse(text);
            // Remove wrapping <p> tags to keep it inline-ish
            html = html.replace(/^<p>/, '').replace(/<\/p>\n?$/, '');
            return html;
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
        const sourceLabel = item.source === 'announcement' ?
            '<span class="badge badge-info badge-sm ml-2">Pengumuman</span>' :
            '<span class="badge badge-secondary badge-sm ml-2">Notifikasi</span>';

        return `
            <div class="card mb-2 notification-card ${!isRead ? 'border-left-primary' : ''}" style="border-left-width: ${!isRead ? '4px' : '1px'}; cursor: ${item.link ? 'pointer' : 'default'};" onclick="${item.link ? `handleNotifPageClick('${item.link}')` : ''}">
                <div class="card-body py-3">
                    <div class="d-flex align-items-start">
                        <div class="mr-3">
                            <span class="btn btn-${!isRead ? 'primary' : 'secondary'} btn-sm rounded-circle" style="width: 40px; height: 40px; padding: 0; display: flex; align-items: center; justify-content: center;">
                                <i class="${item.icon || 'fas fa-bell'}"></i>
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
                                    ${item.source === 'notification' && !isRead ? `
                                        <button class="btn btn-sm btn-outline-primary" onclick="markNotificationReadPage(${item.id})" title="Tandai dibaca">
                                            <i class="fas fa-check"></i>
                                        </button>
                                    ` : ''}
                                    ${item.link ? `
                                        <a href="${item.link}" class="btn btn-sm btn-outline-secondary ml-1" title="Lihat detail">
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
        const token = await window.getIdToken();
        if (!token) return;

        const response = await fetch(`/api/notifications/${id}/read`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            // Update local data
            const item = notificationPageData.find(n => n.id === id && n.source === 'notification');
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
        const token = await window.getIdToken();
        if (!token) return;

        const response = await fetch('/api/notifications/read-all', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
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

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function handleNotifPageClick(link) {
    runNotificationNavigation(link);
}
window.handleNotifPageClick = handleNotifPageClick;
window.initStaffNotificationSystem = initNotificationSystem;

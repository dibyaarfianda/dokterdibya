/**
 * Notifications Page
 */

import { api } from '../api.js';
import { showToast, updateBadges } from '../app.js';

export async function renderNotifications(container) {
    container.innerHTML = `
        <div class="fade-in">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                <div class="section-title" style="margin: 0;">Notifikasi</div>
                <button class="btn btn-outline" id="btn-mark-all" style="padding: 6px 12px; font-size: 12px;">
                    <i class="fas fa-check-double"></i> Tandai Semua Dibaca
                </button>
            </div>
            <div id="notifications-list">
                <div class="empty-state">
                    <i class="fas fa-spinner fa-spin"></i>
                    <p>Memuat notifikasi...</p>
                </div>
            </div>
        </div>
    `;

    const listContainer = document.getElementById('notifications-list');

    // Mark all read handler
    document.getElementById('btn-mark-all').addEventListener('click', async () => {
        try {
            await api.markAllNotificationsRead();
            showToast('Semua notifikasi ditandai dibaca');
            updateBadges();
            renderNotifications(container);
        } catch (error) {
            showToast(error.message, 'error');
        }
    });

    // Load notifications
    try {
        const [notifResponse, announcementResponse] = await Promise.all([
            api.getNotifications(),
            api.getStaffAnnouncements().catch(() => ({ success: false }))
        ]);

        const notifications = [];

        // Add system notifications
        if (notifResponse.success && notifResponse.notifications) {
            notifResponse.notifications.forEach(n => {
                notifications.push({
                    id: n.id,
                    type: 'notification',
                    title: n.title || 'Notifikasi',
                    content: n.message || n.content,
                    created_at: n.created_at,
                    is_read: n.is_read || n.read
                });
            });
        }

        // Add staff announcements
        if (announcementResponse.success && announcementResponse.announcements) {
            announcementResponse.announcements.forEach(a => {
                notifications.push({
                    id: a.id,
                    type: 'announcement',
                    title: a.title || 'Pengumuman',
                    content: a.content,
                    created_at: a.created_at,
                    is_read: a.is_read
                });
            });
        }

        // Sort by date (newest first)
        notifications.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        renderNotificationsList(listContainer, notifications);

    } catch (error) {
        listContainer.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-triangle"></i>
                <p>${error.message}</p>
            </div>
        `;
    }
}

function renderNotificationsList(container, notifications) {
    if (!notifications || notifications.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-bell-slash"></i>
                <p>Tidak ada notifikasi</p>
            </div>
        `;
        return;
    }

    container.innerHTML = notifications.map(notif => {
        const icon = notif.type === 'announcement' ? 'bullhorn' : 'bell';
        const borderColor = notif.type === 'announcement' ? 'var(--color-secondary)' : 'var(--color-primary)';

        return `
            <div class="notif-item ${notif.is_read ? '' : 'unread'}"
                 data-id="${notif.id}"
                 data-type="${notif.type}"
                 style="border-left-color: ${borderColor}">
                <div style="display: flex; gap: 12px;">
                    <div style="flex-shrink: 0; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; background: ${notif.is_read ? 'var(--bg-secondary)' : 'rgba(124, 58, 237, 0.2)'}; border-radius: 8px;">
                        <i class="fas fa-${icon}" style="color: ${notif.is_read ? 'var(--text-muted)' : 'var(--color-primary)'}"></i>
                    </div>
                    <div style="flex: 1; min-width: 0;">
                        <div class="notif-title">${notif.title}</div>
                        <div class="notif-content">${truncateText(notif.content, 100)}</div>
                        <div class="notif-time">${formatTimeAgo(notif.created_at)}</div>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    // Add click handlers to mark as read
    container.querySelectorAll('.notif-item').forEach(item => {
        item.addEventListener('click', async () => {
            const id = item.dataset.id;
            const type = item.dataset.type;

            if (item.classList.contains('unread')) {
                try {
                    if (type === 'announcement') {
                        await api.markAnnouncementRead(id);
                    } else {
                        await api.markNotificationRead(id);
                    }
                    item.classList.remove('unread');
                    updateBadges();
                } catch (error) {
                    console.error('Failed to mark as read:', error);
                }
            }

            // Show full content in modal
            showNotificationDetail(item);
        });
    });
}

function truncateText(text, maxLength) {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
}

function formatTimeAgo(dateStr) {
    if (!dateStr) return '';

    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Baru saja';
    if (diffMins < 60) return `${diffMins} menit lalu`;
    if (diffHours < 24) return `${diffHours} jam lalu`;
    if (diffDays < 7) return `${diffDays} hari lalu`;

    return date.toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
    });
}

function showNotificationDetail(itemEl) {
    const title = itemEl.querySelector('.notif-title').textContent;
    const content = itemEl.querySelector('.notif-content').textContent;
    const time = itemEl.querySelector('.notif-time').textContent;

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>${title}</h3>
                <button class="modal-close"><i class="fas fa-times"></i></button>
            </div>
            <div class="modal-body">
                <div style="color: var(--text-primary); line-height: 1.6; white-space: pre-wrap;">${content}</div>
                <div class="text-muted mt-4" style="font-size: 12px;">${time}</div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    modal.querySelector('.modal-close').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });
}

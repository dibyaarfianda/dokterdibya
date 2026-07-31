export function createPatientNotificationController(options = {}) {
    const escapeHtml = options.escapeHtml || (value => String(value ?? ''));
    const formatInfoTime = options.formatInfoTime || (value => String(value || ''));
    const getToken = options.getToken || (() => '');
    const loadNotificationCount = options.loadNotificationCount || (() => {});
    const logout = options.logout || (() => {});
    const openTopbarModal = options.openTopbarModal || (() => {});
    const renderModalLoading = options.renderModalLoading || (() => '');
    const requireRealPatient = options.requireRealPatient || (() => true);
    const stopEvent = options.stopEvent || (() => {});
    let notifications = [];

    function getIcon(type) {
        const iconMap = {
            question_reply: 'fa-solid fa-reply',
            thread_closed: 'fa-solid fa-circle-check',
            booking_confirmed: 'fa-regular fa-calendar-check',
            booking_cancelled: 'fa-regular fa-calendar-xmark',
            appointment: 'fa-regular fa-calendar',
            new_document: 'fa-regular fa-file-lines',
            document: 'fa-regular fa-file-lines',
            new_usg: 'fa-regular fa-image',
            new_lab: 'fa-solid fa-flask',
            announcement: 'fa-solid fa-bullhorn',
            reminder: 'fa-solid fa-bell'
        };
        return iconMap[type] || 'fa-solid fa-bell';
    }

    function render(items) {
        const list = Array.isArray(items) ? items : [];
        const unreadCount = list.filter(item => !item.read_at).length;
        const summary = '<div class="topbar-modal-summary">' +
            '<div><strong>' + list.length + '</strong><span>Total notifikasi</span></div>' +
            '<div><strong>' + unreadCount + '</strong><span>Belum dibaca</span></div>' +
        '</div>';
        if (!list.length) {
            return summary + '<div class="modal-empty"><i class="fa-regular fa-bell-slash"></i><p>Belum ada notifikasi baru.</p></div>';
        }

        const readAll = unreadCount
            ? '<button type="button" class="ghost-action soundable" data-shell-action="mark-all-notifications"><i class="fa-solid fa-check-double"></i> Tandai semua dibaca</button>'
            : '';
        const itemMarkup = list.slice(0, 12).map(item => {
            const isUnread = !item.read_at;
            return '<button type="button" class="notification-item ' + (isUnread ? 'unread' : '') + '" data-shell-action="mark-notification-read" data-notification-id="' + escapeHtml(item.id) + '">' +
                '<span class="notification-icon"><i class="' + getIcon(item.type) + '"></i></span>' +
                '<span class="notification-copy">' +
                    '<strong>' + escapeHtml(item.title || 'Notifikasi') + '</strong>' +
                    '<span>' + escapeHtml(item.message || '') + '</span>' +
                    '<small>' + escapeHtml(formatInfoTime(item.created_at)) + '</small>' +
                '</span>' +
                (isUnread ? '<span class="unread-dot"></span>' : '') +
            '</button>';
        }).join('');
        return summary + readAll + '<div class="notification-list">' + itemMarkup + '</div>';
    }

    async function fetchNotifications() {
        const response = await fetch('/api/patient-notifications?_t=' + Date.now(), {
            headers: {
                'Authorization': 'Bearer ' + getToken(),
                'Cache-Control': 'no-cache'
            },
            cache: 'no-store'
        });
        if (response.status === 401) throw new Error('unauthorized');
        if (!response.ok) throw new Error('notifications failed');
        const data = await response.json().catch(() => ({}));
        return data.success && Array.isArray(data.notifications) ? data.notifications : [];
    }

    async function open(event) {
        stopEvent(event);
        if (!requireRealPatient(
            'Notifikasi berisi data pribadi pasien. Masuk dengan akun pasien untuk membukanya.',
            event
        )) return;

        openTopbarModal('Notifikasi', 'Update pasien', renderModalLoading('Memuat notifikasi...'));
        try {
            notifications = await fetchNotifications();
            openTopbarModal('Notifikasi', 'Update pasien', render(notifications));
            loadNotificationCount();
        } catch (error) {
            if (error?.message === 'unauthorized') {
                logout();
                return;
            }
            openTopbarModal(
                'Notifikasi',
                'Update pasien',
                '<div class="modal-empty"><i class="fa-regular fa-bell-slash"></i><p>Notifikasi belum bisa dimuat.</p></div>'
            );
        }
    }

    async function markRead(id) {
        const item = notifications.find(notification => String(notification.id) === String(id));
        if (item) item.read_at = new Date().toISOString();
        openTopbarModal('Notifikasi', 'Update pasien', render(notifications));
        loadNotificationCount();
        try {
            await fetch('/api/patient-notifications/' + encodeURIComponent(id) + '/read', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer ' + getToken() }
            });
        } catch (_error) {}
    }

    async function markAllRead(event) {
        stopEvent(event);
        notifications.forEach(item => { item.read_at = new Date().toISOString(); });
        openTopbarModal('Notifikasi', 'Update pasien', render(notifications));
        loadNotificationCount();
        try {
            await fetch('/api/patient-notifications/read-all', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer ' + getToken() }
            });
        } catch (_error) {}
    }

    return Object.freeze({
        markAllRead,
        markRead,
        open
    });
}

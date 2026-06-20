/* SISIwanita Patient Tool Shell
   Shared navigation, bottom sheet, avatar, and reveal helpers for portal tool pages. */
(function () {
    'use strict';

    var DEFAULT_ACTIVE_NAV = 'beranda';
    var DEFAULT_HOME_URL = '/patient-menu.html';
    var RUANG_BACA_BADGE_KEY = 'patient_ruang_baca_opened_v1';
    var state = window.__patientToolShellState || {
        initialized: false,
        activeNav: DEFAULT_ACTIVE_NAV,
        homeUrl: DEFAULT_HOME_URL,
        menuData: null,
        notifications: [],
        portalSettings: {
            nickname: null,
            notification_sound: 'default'
        }
    };
    window.__patientToolShellState = state;
    if (!state.portalSettings) {
        state.portalSettings = {
            nickname: null,
            notification_sound: 'default'
        };
    }

    var defaultMenuData = {
        dokumen: { title: 'Dokumen', items: [
            ['fa-solid fa-image', 'Album USG', '/album-usg.html'],
            ['fa-solid fa-flask', 'Hasil Lab', '/hasil-lab.html'],
            ['fa-solid fa-file-medical', 'Resume Medis', '/dokumen-medis.html']
        ]},
        aplikasi: { title: 'Aplikasi', items: [
            ['fa-solid fa-comments', 'Tanya Dokter', '/tanya-dokter.html'],
            ['fa-solid fa-hand', 'Gerakan Bayi', '/kick-counter.html'],
            ['fa-solid fa-chart-line', 'Monitoring Kehamilan', '/pregnancy-tracker.html'],
            ['fa-solid fa-wave-square', 'Hitung Kontraksi', '/contraction-timer.html'],
            ['fa-solid fa-calendar-days', 'Kalender Kesuburan', '/fertility-calendar.html'],
            ['fa-solid fa-pills', 'Jadwal Vitamin', '/jadwal-vitamin.html']
        ]},
        jadwal: { title: 'Jadwal', items: [
            ['fa-solid fa-calendar-check', 'Booking Klinik Minggu', '/booking-klinik.html'],
            ['fa-solid fa-hospital', 'Jadwal Rumah Sakit', '/jadwal-rs.html'],
            ['fa-solid fa-stethoscope', 'Riwayat Kunjungan', '/riwayat-kunjungan.html'],
            ['fa-solid fa-list-ol', 'Antrian Hari Ini', '/antrian.html']
        ]},
        edukasi: { title: 'Ruang Baca', items: [
            ['fa-solid fa-heart', 'Perjalanan Ibu', '/perjalanan-ibu.html'],
            ['fa-solid fa-book-open', 'Ruang Membaca', '/artikel.html'],
            ['fa-solid fa-comment-medical', 'Ruang Cerita', '/ruang-cerita.html', 'Baru']
        ]}
    };

    function ready(callback) {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', callback, { once: true });
        } else {
            callback();
        }
    }

    function escapeHtml(value) {
        var div = document.createElement('div');
        div.textContent = value == null ? '' : String(value);
        return div.innerHTML;
    }

    function getStoredPatient() {
        try { return JSON.parse(localStorage.getItem('patient_user') || '{}'); } catch (error) { return {}; }
    }

    function getToken() {
        return localStorage.getItem('vps_auth_token') || sessionStorage.getItem('vps_auth_token') || localStorage.getItem('patient_token') || '';
    }

    function normalizePatientName(value) {
        return String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();
    }

    function isMyCornerAllowedPatient() {
        var patient = getStoredPatient();
        var patientName = normalizePatientName(patient.fullname || patient.full_name || patient.name || '');
        return patientName === 'nanda ananda' || patientName === 'feby kumalasari';
    }

    function trackMyCornerComingSoon() {
        var token = getToken();
        if (!token || isMockToken(token)) return;
        fetch('/api/patients/track-page', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token
            },
            body: JSON.stringify({ page_name: 'Ruang Saya - Coming Soon' })
        }).catch(function () {});
    }

    function isMockToken(token) {
        return !token || String(token).indexOf('mock-') === 0;
    }

    function getInitials(name) {
        var parts = String(name || '').split(/\s+/).filter(Boolean);
        var initials = parts.slice(0, 2).map(function (part) { return part.charAt(0); }).join('').toUpperCase();
        return initials || 'SW';
    }

    function getProfilePhotoUrl(profile) {
        profile = profile || {};
        return profile.profile_picture || profile.photo_url || profile.photoUrl || profile.avatar_url || '';
    }

    function showShellToast(message, duration) {
        var container = document.getElementById('toast-container') || document.body;
        var toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = message || '';
        container.appendChild(toast);
        window.setTimeout(function () {
            toast.remove();
        }, duration || 2400);
    }

    function go(url) {
        if (!url) return;
        window.location.href = url;
    }

    function formatRelativeTime(value) {
        var date = new Date(value);
        if (Number.isNaN(date.getTime())) return '';
        var diffMs = Date.now() - date.getTime();
        var diffMinutes = Math.max(0, Math.floor(diffMs / 60000));
        if (diffMinutes < 1) return 'Baru saja';
        if (diffMinutes < 60) return diffMinutes + ' menit lalu';
        var diffHours = Math.floor(diffMinutes / 60);
        if (diffHours < 24) return diffHours + ' jam lalu';
        var diffDays = Math.floor(diffHours / 24);
        if (diffDays < 7) return diffDays + ' hari lalu';
        return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
    }

    function formatProfileDate(value) {
        if (!value) return '-';
        var date = new Date(value);
        if (Number.isNaN(date.getTime())) return String(value);
        return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
    }

    function ensureTopbarModal() {
        var existing = document.getElementById('shell-modal');
        if (existing) return existing;

        var overlay = document.createElement('div');
        overlay.className = 'shell-modal-overlay';
        overlay.id = 'shell-modal-overlay';

        var modal = document.createElement('section');
        modal.className = 'shell-modal';
        modal.id = 'shell-modal';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-labelledby', 'shell-modal-title');
        modal.innerHTML = '' +
            '<div class="shell-modal-header">' +
                '<div>' +
                    '<div class="shell-modal-kicker" id="shell-modal-kicker">SISIwanita</div>' +
                    '<h3 id="shell-modal-title">Menu</h3>' +
                '</div>' +
                '<button type="button" class="shell-modal-close" id="shell-modal-close" aria-label="Tutup">&times;</button>' +
            '</div>' +
            '<div class="shell-modal-body" id="shell-modal-body"></div>';

        document.body.appendChild(overlay);
        document.body.appendChild(modal);
        overlay.addEventListener('click', closeTopbarModal);
        modal.querySelector('#shell-modal-close').addEventListener('click', closeTopbarModal);
        return modal;
    }

    function openTopbarModal(title, kicker, bodyHtml) {
        closeSheet();
        var modal = ensureTopbarModal();
        var overlay = document.getElementById('shell-modal-overlay');
        var titleEl = modal.querySelector('#shell-modal-title');
        var kickerEl = modal.querySelector('#shell-modal-kicker');
        var bodyEl = modal.querySelector('#shell-modal-body');
        if (titleEl) titleEl.textContent = title || 'Menu';
        if (kickerEl) kickerEl.textContent = kicker || 'SISIwanita';
        if (bodyEl) bodyEl.innerHTML = bodyHtml || '';
        document.body.classList.add('shell-modal-open');
        if (overlay) overlay.classList.add('active');
        modal.classList.add('active');
    }

    function closeTopbarModal() {
        var overlay = document.getElementById('shell-modal-overlay');
        var modal = document.getElementById('shell-modal');
        if (overlay) overlay.classList.remove('active');
        if (modal) modal.classList.remove('active');
        document.body.classList.remove('shell-modal-open');
    }

    function renderModalLoading(text) {
        return '<div class="shell-modal-empty"><i class="fa-solid fa-spinner fa-spin"></i><p>' + escapeHtml(text || 'Memuat...') + '</p></div>';
    }

    function getNotificationIcon(type) {
        var iconMap = {
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

    function renderNotificationsModal(notifications) {
        notifications = notifications || [];
        var unreadCount = notifications.filter(function (notification) { return !notification.read_at; }).length;
        var header = '<div class="shell-modal-summary">' +
            '<div><strong>' + notifications.length + '</strong><span>Total notifikasi</span></div>' +
            '<div><strong>' + unreadCount + '</strong><span>Belum dibaca</span></div>' +
            '</div>';
        if (!notifications.length) {
            return header + '<div class="shell-modal-empty"><i class="fa-regular fa-bell-slash"></i><p>Belum ada notifikasi baru.</p></div>';
        }
        var actions = unreadCount ? '<button type="button" class="shell-modal-link" data-shell-action="read-all-notifications"><i class="fa-solid fa-check-double"></i>Tandai semua dibaca</button>' : '';
        var items = notifications.slice(0, 12).map(function (notification) {
            var unreadClass = notification.read_at ? '' : ' unread';
            return '<button type="button" class="shell-notification-item' + unreadClass + '" data-notification-id="' + escapeHtml(notification.id) + '">' +
                '<span class="shell-notification-icon"><i class="' + getNotificationIcon(notification.type) + '"></i></span>' +
                '<span class="shell-notification-copy">' +
                    '<strong>' + escapeHtml(notification.title || 'Notifikasi') + '</strong>' +
                    '<span>' + escapeHtml(notification.message || '') + '</span>' +
                    '<small>' + escapeHtml(formatRelativeTime(notification.created_at)) + '</small>' +
                '</span>' +
                (notification.read_at ? '' : '<span class="shell-unread-dot"></span>') +
            '</button>';
        }).join('');
        return header + actions + '<div class="shell-notification-list">' + items + '</div>';
    }

    function updateNotificationBadge(unreadCount) {
        var badge = document.getElementById('notif-badge');
        if (!badge) return;
        if (unreadCount > 0) {
            badge.textContent = unreadCount > 9 ? '9+' : String(unreadCount);
            badge.style.display = 'grid';
        } else {
            badge.textContent = '0';
            badge.style.display = 'none';
        }
    }

    async function fetchNotifications() {
        var token = getToken();
        if (isMockToken(token)) return [];
        var response = await fetch('/api/patient-notifications?_t=' + Date.now(), {
            headers: {
                Authorization: 'Bearer ' + token,
                'Cache-Control': 'no-cache'
            }
        });
        if (!response.ok) throw new Error('notifications failed');
        var data = await response.json();
        return data && data.success && Array.isArray(data.notifications) ? data.notifications : [];
    }

    async function openNotificationModal(event) {
        if (event && typeof event.preventDefault === 'function') event.preventDefault();
        if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
        openTopbarModal('Notifikasi', 'Update pasien', renderModalLoading('Memuat notifikasi...'));
        try {
            state.notifications = await fetchNotifications();
            updateNotificationBadge(state.notifications.filter(function (notification) { return !notification.read_at; }).length);
            openTopbarModal('Notifikasi', 'Update pasien', renderNotificationsModal(state.notifications));
        } catch (error) {
            openTopbarModal('Notifikasi', 'Update pasien', '<div class="shell-modal-empty"><i class="fa-regular fa-bell-slash"></i><p>Notifikasi belum bisa dimuat.</p></div>');
        }
    }

    async function markNotificationRead(id) {
        var token = getToken();
        var notification = state.notifications.find(function (item) { return String(item.id) === String(id); });
        if (notification) notification.read_at = new Date().toISOString();
        updateNotificationBadge(state.notifications.filter(function (item) { return !item.read_at; }).length);
        openTopbarModal('Notifikasi', 'Update pasien', renderNotificationsModal(state.notifications));
        if (isMockToken(token)) return;
        try {
            await fetch('/api/patient-notifications/' + encodeURIComponent(id) + '/read', {
                method: 'POST',
                headers: { Authorization: 'Bearer ' + token }
            });
        } catch (error) {}
    }

    async function markAllNotificationsRead() {
        var token = getToken();
        state.notifications.forEach(function (notification) { notification.read_at = new Date().toISOString(); });
        updateNotificationBadge(0);
        openTopbarModal('Notifikasi', 'Update pasien', renderNotificationsModal(state.notifications));
        if (isMockToken(token)) return;
        try {
            await fetch('/api/patient-notifications/read-all', {
                method: 'POST',
                headers: { Authorization: 'Bearer ' + token }
            });
        } catch (error) {}
    }

    async function fetchPortalSettings() {
        var token = getToken();
        var cached;
        try { cached = JSON.parse(localStorage.getItem('patient_portal_settings') || 'null'); } catch (error) {}
        if (cached) state.portalSettings = Object.assign({}, state.portalSettings, cached);
        if (isMockToken(token)) return state.portalSettings;

        var response = await fetch('/api/patients/portal-settings?_t=' + Date.now(), {
            headers: {
                Authorization: 'Bearer ' + token,
                'Cache-Control': 'no-cache'
            },
            cache: 'no-store'
        });
        if (!response.ok) throw new Error('portal settings failed');
        var data = await response.json().catch(function () { return {}; });
        if (data && data.success && data.settings) {
            state.portalSettings = Object.assign({}, state.portalSettings, data.settings);
            try { localStorage.setItem('patient_portal_settings', JSON.stringify(state.portalSettings)); } catch (error) {}
        }
        return state.portalSettings;
    }

    function getDisplayedNotificationCount() {
        var badge = document.getElementById('notif-badge');
        var value = badge && badge.style.display !== 'none' ? badge.textContent : '';
        return value || '0';
    }

    function renderSettingsModal() {
        var count = getDisplayedNotificationCount();
        var settings = state.portalSettings || {};
        var nickname = settings.nickname || '';
        var sound = settings.notification_sound || 'default';
        var option = function (value, label) {
            return '<option value="' + value + '"' + (sound === value ? ' selected' : '') + '>' + label + '</option>';
        };
        return '<div class="shell-settings-panel">' +
            '<button type="button" class="shell-settings-row" data-shell-action="open-notifications">' +
                '<i class="fa-solid fa-bell"></i><span><strong>Notifikasi</strong><span>Lihat update pasien dan pengumuman klinik</span></span>' +
                '<em class="shell-settings-count">' + escapeHtml(count) + '</em>' +
            '</button>' +
            '<div class="shell-settings-field">' +
                '<label for="portal-nickname">Nickname Anda</label>' +
                '<input id="portal-nickname" class="shell-settings-input" maxlength="40" value="' + escapeHtml(nickname) + '" placeholder="Contoh: Bunda">' +
            '</div>' +
            '<div class="shell-settings-field">' +
                '<label for="portal-notification-sound">Suara Notifikasi</label>' +
                '<select id="portal-notification-sound" class="shell-settings-select">' +
                    option('default', 'Default') +
                    option('chime', 'Chime') +
                    option('bell', 'Bell') +
                    option('soft', 'Soft') +
                    option('none', 'Tanpa Suara') +
                '</select>' +
            '</div>' +
            '<div class="shell-settings-actions">' +
                '<button type="button" class="shell-modal-link" data-shell-action="test-portal-sound"><i class="fa-solid fa-volume-high"></i>Test</button>' +
                '<button type="button" class="shell-modal-link primary" data-shell-action="save-portal-settings"><i class="fa-solid fa-check"></i>Simpan</button>' +
            '</div>' +
            '<button type="button" class="shell-settings-row" data-shell-action="edit-intake">' +
                '<i class="fa-solid fa-clipboard-list"></i><span><strong>Form Intake</strong><span>Edit atau update data intake Anda</span></span>' +
                '<i class="fa-solid fa-chevron-right"></i>' +
            '</button>' +
        '</div>';
    }

    async function openSettingsModal(event) {
        if (event && typeof event.preventDefault === 'function') event.preventDefault();
        if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
        openTopbarModal('Pengaturan', 'Portal SISIwanita', renderSettingsModal());
        try {
            await fetchPortalSettings();
            openTopbarModal('Pengaturan', 'Portal SISIwanita', renderSettingsModal());
        } catch (error) {}
    }

    async function savePortalSettings() {
        var token = getToken();
        var nicknameEl = document.getElementById('portal-nickname');
        var soundEl = document.getElementById('portal-notification-sound');
        var payload = {
            nickname: nicknameEl ? nicknameEl.value : '',
            notification_sound: soundEl ? soundEl.value : 'default'
        };
        if (isMockToken(token)) {
            state.portalSettings = Object.assign({}, state.portalSettings, payload);
            try { localStorage.setItem('patient_portal_settings', JSON.stringify(state.portalSettings)); } catch (error) {}
            openTopbarModal('Pengaturan', 'Portal SISIwanita', renderSettingsModal());
            showShellToast('Pengaturan portal disimpan');
            return;
        }
        try {
            var response = await fetch('/api/patients/portal-settings', {
                method: 'PUT',
                headers: {
                    Authorization: 'Bearer ' + token,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });
            var data = await response.json().catch(function () { return {}; });
            if (!response.ok || !data.success) throw new Error(data.message || 'Pengaturan gagal disimpan');
            state.portalSettings = Object.assign({}, state.portalSettings, data.settings);
            try { localStorage.setItem('patient_portal_settings', JSON.stringify(state.portalSettings)); } catch (error) {}
            openTopbarModal('Pengaturan', 'Portal SISIwanita', renderSettingsModal());
            showShellToast('Pengaturan portal disimpan');
        } catch (error) {
            showShellToast(error.message || 'Pengaturan gagal disimpan');
        }
    }

    function playPortalNotificationSound() {
        var soundEl = document.getElementById('portal-notification-sound');
        var soundType = soundEl ? soundEl.value : state.portalSettings.notification_sound || 'default';
        if (soundType === 'none') {
            showShellToast('Suara notifikasi dinonaktifkan');
            return;
        }
        try {
            var AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx) return;
            var context = state.audioContext || new AudioCtx();
            state.audioContext = context;
            if (context.state === 'suspended') context.resume().catch(function () {});
            var now = context.currentTime;
            var osc = context.createOscillator();
            var gain = context.createGain();
            var frequencyMap = { chime: 880, bell: 660, soft: 440, default: 520 };
            osc.type = soundType === 'bell' ? 'triangle' : 'sine';
            osc.frequency.setValueAtTime(frequencyMap[soundType] || frequencyMap.default, now);
            gain.gain.setValueAtTime(0.0001, now);
            gain.gain.exponentialRampToValueAtTime(0.14, now + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
            osc.connect(gain);
            gain.connect(context.destination);
            osc.start(now);
            osc.stop(now + 0.52);
        } catch (error) {}
    }

    async function fetchProfile() {
        var token = getToken();
        var stored = getStoredPatient();
        if (isMockToken(token)) return stored;
        var response = await fetch('/api/patients/profile?_t=' + Date.now(), {
            headers: {
                Authorization: 'Bearer ' + token,
                'Cache-Control': 'no-cache'
            }
        });
        if (!response.ok) return stored;
        var data = await response.json();
        var profile = data && (data.user || data.patient || data.profile) ? (data.user || data.patient || data.profile) : stored;
        state.currentProfile = profile;
        try { localStorage.setItem('patient_user', JSON.stringify(profile)); } catch (error) {}
        return profile;
    }

    function ensureProfilePhotoInput(mode) {
        var id = mode === 'camera' ? 'shell-profile-photo-camera-input' : 'shell-profile-photo-input';
        var input = document.getElementById(id);
        if (!input) {
            input = document.createElement('input');
            input.type = 'file';
            input.id = id;
            input.accept = 'image/*';
            input.style.display = 'none';
            if (mode === 'camera') input.setAttribute('capture', 'environment');
            document.body.appendChild(input);
        }
        if (input.dataset.bound !== '1') {
            input.dataset.bound = '1';
            input.addEventListener('change', handleProfilePhotoUpload);
        }
        return input;
    }

    function openProfilePhotoPicker(event, mode) {
        if (event && typeof event.preventDefault === 'function') event.preventDefault();
        if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
        var input = ensureProfilePhotoInput(mode || 'gallery');
        input.value = '';
        input.click();
    }

    async function handleProfilePhotoUpload(event) {
        var input = event && event.target;
        var file = input && input.files && input.files[0];
        if (!file) return;
        if (!file.type || file.type.indexOf('image/') !== 0) {
            showShellToast('Pilih file gambar untuk foto profil');
            input.value = '';
            return;
        }
        if (file.size > 2 * 1024 * 1024) {
            showShellToast('Ukuran foto maksimal 2MB');
            input.value = '';
            return;
        }
        var token = getToken();
        if (isMockToken(token)) {
            showShellToast('Login asli diperlukan untuk upload foto');
            input.value = '';
            return;
        }
        var formData = new FormData();
        formData.append('photo', file);
        showShellToast('Mengunggah foto profil...');
        try {
            var response = await fetch('/api/patients/upload-photo', {
                method: 'POST',
                headers: { Authorization: 'Bearer ' + token },
                body: formData
            });
            var data = await response.json().catch(function () { return {}; });
            if (!response.ok || !data.success) throw new Error(data.message || 'Upload foto gagal');
            var photoUrl = data.photo_url || data.profile_picture || data.url || '';
            var profile = Object.assign({}, state.currentProfile || getStoredPatient(), {
                photo_url: photoUrl,
                profile_picture: photoUrl
            });
            state.currentProfile = profile;
            try { localStorage.setItem('patient_user', JSON.stringify(profile)); } catch (error) {}
            updateAvatarInitials(profile);
            openTopbarModal('Profil', 'Akun pasien', renderProfileModal(profile));
            showShellToast('Foto profil berhasil diperbarui');
        } catch (error) {
            showShellToast(error.message || 'Upload foto gagal');
        } finally {
            input.value = '';
        }
    }

    function renderProfileModal(profile) {
        profile = profile || {};
        var name = profile.fullname || profile.full_name || profile.name || 'Pasien SISIwanita';
        var medicalId = profile.medical_record_id || profile.medicalRecordId || profile.mr_id || profile.id || '-';
        var email = profile.email || '-';
        var phone = profile.phone || profile.phone_number || profile.no_hp || '-';
        var birthDate = profile.birth_date || profile.date_of_birth || profile.dob || '';
        var photoUrl = getProfilePhotoUrl(profile);
        var avatarClass = photoUrl ? 'shell-profile-avatar has-photo' : 'shell-profile-avatar';
        var photoHtml = photoUrl ? '<img src="' + escapeHtml(photoUrl) + '" alt="Foto profil">' : '';
        return '<div class="shell-profile-head">' +
            '<div class="' + avatarClass + '">' + photoHtml + '<span class="shell-profile-avatar-fallback">' + escapeHtml(getInitials(name)) + '</span></div>' +
            '<div><span>Profil pasien</span><strong>' + escapeHtml(name) + '</strong><small>Portal Wanita Sehat</small>' +
                '<div class="shell-profile-photo-actions">' +
                    '<button type="button" class="shell-profile-photo-btn primary" data-shell-action="profile-photo-camera"><i class="fa-solid fa-camera"></i>Kamera</button>' +
                    '<button type="button" class="shell-profile-photo-btn" data-shell-action="profile-photo-gallery"><i class="fa-solid fa-image"></i>Pilih foto</button>' +
                '</div>' +
            '</div>' +
            '</div>' +
            '<div class="shell-profile-grid">' +
                '<div><span>No. Rekam Medis</span><strong>' + escapeHtml(medicalId) + '</strong></div>' +
                '<div><span>Email</span><strong>' + escapeHtml(email) + '</strong></div>' +
                '<div><span>Telepon</span><strong>' + escapeHtml(phone) + '</strong></div>' +
                '<div><span>Tanggal Lahir</span><strong>' + escapeHtml(formatProfileDate(birthDate)) + '</strong></div>' +
            '</div>' +
            '<div class="shell-modal-actions">' +
                '<button type="button" class="shell-modal-link" data-shell-action="close-modal"><i class="fa-solid fa-check"></i>Tutup</button>' +
                '<button type="button" class="shell-modal-link danger" data-shell-action="logout"><i class="fa-solid fa-arrow-right-from-bracket"></i>Keluar</button>' +
            '</div>';
    }

    async function openProfileModal(event) {
        if (event && typeof event.preventDefault === 'function') event.preventDefault();
        if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
        openTopbarModal('Profil', 'Akun pasien', renderProfileModal(getStoredPatient()));
        try {
            var profile = await fetchProfile();
            updateAvatarInitials(profile);
            openTopbarModal('Profil', 'Akun pasien', renderProfileModal(profile));
        } catch (error) {}
    }

    function logout() {
        localStorage.removeItem('vps_auth_token');
        sessionStorage.removeItem('vps_auth_token');
        localStorage.removeItem('patient_user');
        window.location.href = '/patient-login.html';
    }

    function bindTopbarModalActions() {
        var notifButton = document.getElementById('home-notif-btn');
        var avatarButton = document.getElementById('user-avatar');
        if (notifButton) {
            notifButton.setAttribute('aria-haspopup', 'dialog');
            notifButton.setAttribute('aria-label', 'Pengaturan');
            var icon = notifButton.querySelector('i');
            if (icon) icon.className = 'fa-solid fa-gear';
            notifButton.onclick = function (event) {
                event.preventDefault();
                event.stopPropagation();
                openSettingsModal(event);
                return false;
            };
        }
        if (avatarButton) {
            avatarButton.setAttribute('aria-haspopup', 'dialog');
            avatarButton.onclick = function (event) {
                event.preventDefault();
                event.stopPropagation();
                openProfileModal(event);
                return false;
            };
        }
    }

    document.addEventListener('click', function (event) {
        var notificationButton = event.target.closest('[data-notification-id]');
        if (notificationButton) {
            event.preventDefault();
            markNotificationRead(notificationButton.getAttribute('data-notification-id'));
            return;
        }
        var action = event.target.closest('[data-shell-action]');
        if (!action) return;
        event.preventDefault();
        var actionName = action.getAttribute('data-shell-action');
        if (actionName === 'read-all-notifications') markAllNotificationsRead();
        if (actionName === 'open-notifications') openNotificationModal(event);
        if (actionName === 'save-portal-settings') savePortalSettings();
        if (actionName === 'test-portal-sound') playPortalNotificationSound();
        if (actionName === 'edit-intake') go('/patient-intake.html');
        if (actionName === 'close-modal') closeTopbarModal();
        if (actionName === 'logout') logout();
        if (actionName === 'profile-photo-camera') openProfilePhotoPicker(event, 'camera');
        if (actionName === 'profile-photo-gallery') openProfilePhotoPicker(event, 'gallery');
    });

    function closeSheet() {
        var overlay = document.getElementById('sheet-overlay');
        var sheet = document.getElementById('bottom-sheet');
        if (overlay) overlay.classList.remove('active');
        if (sheet) sheet.classList.remove('active');
    }

    function hasOpenedRuangBaca() {
        try { return localStorage.getItem(RUANG_BACA_BADGE_KEY) === '1'; } catch (error) { return false; }
    }

    function updateRuangBacaBadges() {
        var isOpened = hasOpenedRuangBaca();
        Array.prototype.forEach.call(document.querySelectorAll('[data-ruang-baca-badge]'), function (badge) {
            badge.style.display = isOpened ? 'none' : 'grid';
        });
    }

    function markRuangBacaOpened() {
        try { localStorage.setItem(RUANG_BACA_BADGE_KEY, '1'); } catch (error) {}
        updateRuangBacaBadges();
    }

    function openSheet(category) {
        var data = (state.menuData || defaultMenuData)[category];
        var overlay = document.getElementById('sheet-overlay');
        var sheet = document.getElementById('bottom-sheet');
        var title = document.getElementById('sheet-title');
        var menu = document.getElementById('sheet-menu');
        if (!data || !overlay || !sheet || !title || !menu) return;
        if (category === 'edukasi') markRuangBacaOpened();

        title.textContent = data.title;
        menu.innerHTML = data.items.map(function (item) {
            return '<a class="sheet-item soundable" href="' + item[2] + '">' +
                '<i class="' + item[0] + '"></i>' +
                '<span>' + escapeHtml(item[1]) + '</span>' +
                (item[3] ? '<em class="feature-new-badge">' + escapeHtml(item[3]) + '</em>' : '') +
                '</a>';
        }).join('');

        overlay.classList.add('active');
        sheet.classList.add('active');
    }

    function openMyCorner() {
        if (!isMyCornerAllowedPatient()) {
            trackMyCornerComingSoon();
            showShellToast('Ruang Saya Coming Soon');
            return;
        }
        if (window.PatientMyCorner && typeof window.PatientMyCorner.open === 'function') {
            return window.PatientMyCorner.open();
        }
        window.location.href = state.homeUrl + '#my-corner';
    }

    function scrollTopHome() {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function updateAvatarInitials(profile) {
        var user = profile || getStoredPatient();
        var name = user.fullname || user.full_name || user.name || 'SISIwanita';
        var photoUrl = getProfilePhotoUrl(user);
        var img = document.getElementById('user-avatar-img');
        var initialsEl = document.getElementById('user-avatar-initials');
        if (img && photoUrl) {
            img.src = photoUrl;
            img.style.display = 'block';
            if (initialsEl) initialsEl.style.display = 'none';
            return;
        }
        if (img) {
            img.removeAttribute('src');
            img.style.display = 'none';
        }
        if (initialsEl) initialsEl.textContent = getInitials(name);
        if (initialsEl) initialsEl.style.display = '';
    }

    function setActiveNav(activeNav) {
        state.activeNav = activeNav || state.activeNav || DEFAULT_ACTIVE_NAV;
        var nav = document.getElementById('home-bottom-nav');
        if (!nav) return;
        Array.prototype.forEach.call(nav.querySelectorAll('.nav-item'), function (item) {
            var key = item.getAttribute('data-tool-nav') || item.getAttribute('data-shell-nav') || '';
            item.classList.toggle('active', key === state.activeNav);
        });
    }

    function triggerIntro() {
        removeHeroStatusChips();
        document.body.classList.remove('header-animated');
        requestAnimationFrame(function () {
            requestAnimationFrame(function () {
                document.body.classList.add('header-animated');
            });
        });
    }

    function removeHeroStatusChips() {
        if (!document.body || !document.body.classList.contains('patient-tool-shell')) return;
        Array.prototype.forEach.call(document.querySelectorAll('.hero-card > .status-chip'), function (chip) {
            chip.remove();
        });
    }

    function showContent(options) {
        options = options || {};
        var loading = document.getElementById(options.loadingId || 'loading-state');
        var content = document.getElementById(options.contentId || 'content-wrapper');
        if (loading) loading.style.display = 'none';
        if (content) content.style.display = options.contentDisplay || 'block';
        document.body.classList.remove('home-sections-locked');
        document.body.classList.add('home-sections-unlocked');
        triggerIntro();
    }

    function init(options) {
        options = options || {};
        state.homeUrl = options.homeUrl || state.homeUrl || DEFAULT_HOME_URL;
        state.activeNav = options.activeNav || document.body.getAttribute('data-tool-shell-active') || state.activeNav || DEFAULT_ACTIVE_NAV;
        state.menuData = options.menuData || state.menuData || defaultMenuData;
        document.body.classList.add('patient-tool-shell');

        ready(function () {
            removeHeroStatusChips();
            updateAvatarInitials(options.profile);
            bindTopbarModalActions();
            setActiveNav(state.activeNav);
            updateRuangBacaBadges();
            fetchNotifications().then(function (notifications) {
                state.notifications = notifications;
                updateNotificationBadge(notifications.filter(function (notification) { return !notification.read_at; }).length);
            }).catch(function () {});
            if (options.unlockOnReady) showContent(options);
        });

        state.initialized = true;
    }

    var api = {
        init: init,
        go: go,
        openSheet: openSheet,
        closeSheet: closeSheet,
        openMyCorner: openMyCorner,
        openSettingsModal: openSettingsModal,
        openNotificationModal: openNotificationModal,
        openProfileModal: openProfileModal,
        openProfilePhotoPicker: openProfilePhotoPicker,
        closeModal: closeTopbarModal,
        markNotificationRead: markNotificationRead,
        markAllNotificationsRead: markAllNotificationsRead,
        scrollTopHome: scrollTopHome,
        updateAvatarInitials: updateAvatarInitials,
        setActiveNav: setActiveNav,
        triggerIntro: triggerIntro,
        removeHeroStatusChips: removeHeroStatusChips,
        showContent: showContent,
        menuData: defaultMenuData
    };

    window.PatientToolShell = api;
    window.go = go;
    window.openSheet = openSheet;
    window.closeSheet = closeSheet;
    window.openMyCorner = openMyCorner;
    window.openSettingsModal = openSettingsModal;
    window.openNotificationModal = openNotificationModal;
    window.openProfileModal = openProfileModal;
    window.openProfilePhotoPicker = openProfilePhotoPicker;
    window.scrollTopHome = scrollTopHome;
})();

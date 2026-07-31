import {
    getPatientToken as getToken,
    getPatientUser,
    setPatientUser,
    clearPatientAuth
} from './patient-shell/session-bootstrap.js';
import { createPatientRouter } from './patient-shell/router.js';
import { bindPatientNavigation } from './patient-shell/navigation.js';
import { bindPatientLayoutLifecycle } from './patient-shell/layout.js';
import { loadPatientFeature } from './patient-shell/feature-loader.js';

(function initPatientMenuShell() {
        const CORNER_NAME_KEY = 'patient_my_corner_name';
        const CORNER_NOTE_KEY = 'patient_my_corner_note';
        const TAP_SOUND_KEY = 'patient_tap_sound_enabled';
        const BUG_REPORT_MAX_LENGTH = 1500;
        const BUG_REPORT_API_MAX_LENGTH = 2000;
        const GUEST_MODE_KEY = 'sisiwanita_guest_mode';
        const GUEST_STARTED_AT_KEY = 'sisiwanita_guest_started_at';
        const GUEST_SESSION_ID_KEY = 'sisiwanita_guest_session_id';
        const GUEST_SESSION_TTL_MS = 4 * 60 * 60 * 1000;
        const GUEST_DEMO_PROFILE = {
            id: 'DEMO',
            patient_id: 'DEMO',
            medicalRecordId: 'DEMO',
            fullname: 'Tamu SISIwanita',
            full_name: 'Tamu SISIwanita',
            name: 'Tamu SISIwanita',
            email: 'demo@sisiwanita.id',
            phone: '-',
            birth_date: null,
            is_guest: true
        };
        const GUEST_DEMO_ROUTES = {
            '/patient-menu.html': {},
            '/jadwal-rs.html': { mockParam: 'mockApi' },
            '/perjalanan-ibu.html': {},
            '/artikel.html': {},
            '/info-terbaru.html': {}
        };
        const GUEST_LOGIN_ROUTES = new Set([
            '/kick-counter.html',
            '/pregnancy-tracker.html',
            '/contraction-timer.html',
            '/fertility-calendar.html',
            '/jadwal-vitamin.html'
        ]);
        let currentProfile = null;
        let homeInfoItems = [];
        let homeAnnouncementDetailsById = {};
        let audioContext = null;
        const cancelBookingState = { appointmentId: '' };
        let liveQueueHomeTimer = null;
        let topbarNotifications = [];
        let currentBirthCongratsId = '';
        let currentBirthCongratsData = null;
        let currentBirthPending = null;
        let birthCongratsSettingsRecords = [];
        let birthCongratsSettingsLoaded = false;
        let birthCongratsSettingsLoading = false;
        let portalSettings = {
            nickname: null,
            notification_sound: 'default'
        };
        let homeBackGuardInstalled = false;
        let homeBackExitConfirmed = false;
        let patientDeferredInstallPrompt = null;
        let patientInstallPromptAutoShown = false;
        const PATIENT_INSTALL_DISMISS_KEY = 'sisiwanita_portal_pwa_install_dismissed';

        const patientRouter = createPatientRouter({
            isGuestMode,
            isGuestLoginRoute,
            getGuestNavigationUrl,
            endGuestAndLogin,
            showGuestUpgradePrompt,
            trackGuestActivity
        });
        const go = patientRouter.go;
        const isPatientHomeRoute = patientRouter.isHomeRoute;

        function isStandalonePwaMode() {
            return window.navigator.standalone === true ||
                (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
        }

        function isNativeCapacitorApp() {
            return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
        }

        function getInstallPlatform() {
            const ua = navigator.userAgent || '';
            const isIOS = /iPad|iPhone|iPod/.test(ua) ||
                (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
            if (isIOS) return 'ios';
            if (/Android/i.test(ua)) return 'android';
            return 'desktop';
        }

        function isIntakeCompleted(profile) {
            return !!profile && (profile.intake_completed === true ||
                profile.intake_completed === 1 ||
                profile.intake_completed === '1');
        }

        function canShowPatientInstallPrompt() {
            if (!currentProfile || currentProfile.is_guest || currentProfile.id === 'DEMO') return false;
            if (!isIntakeCompleted(currentProfile)) return false;
            if (!getToken()) return false;
            if (isGuestMode()) return false;
            if (isStandalonePwaMode() || isNativeCapacitorApp()) return false;
            return getInstallPlatform() === 'android' || getInstallPlatform() === 'ios';
        }

        function configurePatientInstallPrompt(platform) {
            const prompt = document.getElementById('ios-install-prompt');
            const title = document.getElementById('pwa-install-title');
            const subtitle = document.getElementById('pwa-install-subtitle');
            const action = document.getElementById('pwa-install-action');
            const note = document.getElementById('pwa-install-note');
            if (!prompt) return;

            prompt.classList.toggle('is-android', platform === 'android');
            if (platform === 'android') {
                if (title) title.innerHTML = '<i class="fa-brands fa-android"></i> Install SISIwanita';
                if (subtitle) subtitle.textContent = 'Pasang SISIwanita di layar utama Android untuk akses portal lebih cepat.';
                if (action) action.innerHTML = '<i class="fa-solid fa-download"></i> Install sekarang';
                if (note) note.textContent = 'Jika tombol belum memunculkan prompt, buka menu Chrome lalu pilih "Install app".';
                return;
            }

            if (title) title.innerHTML = '<i class="fa-brands fa-apple"></i> Install SISIwanita';
            if (subtitle) subtitle.textContent = 'Simpan SISIwanita ke Home Screen iPhone/iPad setelah login portal.';
            if (note) note.textContent = 'Setelah di-install, buka dari Home Screen untuk pengalaman terbaik.';
        }

        function showPatientInstallPrompt(platform) {
            if (!canShowPatientInstallPrompt()) return;
            const prompt = document.getElementById('ios-install-prompt');
            const overlay = document.getElementById('ios-install-overlay');
            if (!prompt || !overlay) return;

            configurePatientInstallPrompt(platform || getInstallPlatform());
            overlay.classList.add('active');
            prompt.classList.add('active');
            requestAnimationFrame(() => {
                prompt.style.transform = 'translateY(0)';
            });
        }

        function autoShowPatientInstallPrompt() {
            if (patientInstallPromptAutoShown) return;
            if (sessionStorage.getItem(PATIENT_INSTALL_DISMISS_KEY) === 'true') return;
            if (!canShowPatientInstallPrompt()) return;

            patientInstallPromptAutoShown = true;
            setTimeout(() => showPatientInstallPrompt(getInstallPlatform()), 900);
        }

        function dismissPatientInstallPrompt() {
            const prompt = document.getElementById('ios-install-prompt');
            const overlay = document.getElementById('ios-install-overlay');
            if (!prompt || !overlay) return;

            prompt.classList.remove('active', 'is-android');
            overlay.classList.remove('active');
            sessionStorage.setItem(PATIENT_INSTALL_DISMISS_KEY, 'true');
        }

        function installPatientPWA() {
            if (!canShowPatientInstallPrompt()) return;
            if (patientDeferredInstallPrompt) {
                patientDeferredInstallPrompt.prompt();
                patientDeferredInstallPrompt.userChoice.then(() => {
                    patientDeferredInstallPrompt = null;
                    sessionStorage.setItem(PATIENT_INSTALL_DISMISS_KEY, 'true');
                    dismissPatientInstallPrompt();
                });
                return;
            }

            if (/Android/i.test(navigator.userAgent || '')) {
                alert('Untuk memasang SISIwanita, buka menu Chrome lalu pilih "Install app".');
                return;
            }
            alert('Buka menu Share lalu pilih "Add to Home Screen" untuk memasang SISIwanita.');
        }

        function clearGuestMode() {
            try {
                localStorage.removeItem(GUEST_MODE_KEY);
                localStorage.removeItem(GUEST_STARTED_AT_KEY);
                sessionStorage.removeItem(GUEST_MODE_KEY);
                sessionStorage.removeItem(GUEST_STARTED_AT_KEY);
                sessionStorage.removeItem(GUEST_SESSION_ID_KEY);
            } catch (error) {}
        }

        function isLocalDemoHost() {
            return window.location.hostname === 'localhost' ||
                window.location.hostname === '127.0.0.1' ||
                window.location.hostname === '[::1]';
        }

        function getGuestSessionId() {
            try {
                let existing = sessionStorage.getItem(GUEST_SESSION_ID_KEY);
                if (existing) return existing;
                existing = 'guest_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
                sessionStorage.setItem(GUEST_SESSION_ID_KEY, existing);
                return existing;
            } catch (error) {
                return 'guest_' + Date.now().toString(36);
            }
        }

        function trackGuestActivity(eventType, details, pagePath) {
            if (!isGuestMode()) return;
            try {
                const payload = JSON.stringify({
                    session_id: getGuestSessionId(),
                    event_type: eventType,
                    page_path: pagePath || (window.location.pathname + window.location.search),
                    page_title: document.title,
                    details: details || '',
                    referrer: document.referrer || ''
                });
                if (navigator.sendBeacon) {
                    navigator.sendBeacon('/api/guest-activity', new Blob([payload], { type: 'application/json' }));
                    return;
                }
                fetch('/api/guest-activity', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: payload,
                    keepalive: true
                }).catch(() => {});
            } catch (error) {}
        }

        function startGuestMode() {
            if (!isLocalDemoHost()) {
                clearGuestMode();
                return false;
            }
            try {
                const existingGuestSessionId = sessionStorage.getItem(GUEST_SESSION_ID_KEY);
                clearPatientAuth();
                clearGuestMode();
                if (existingGuestSessionId) sessionStorage.setItem(GUEST_SESSION_ID_KEY, existingGuestSessionId);
                sessionStorage.setItem(GUEST_MODE_KEY, '1');
                sessionStorage.setItem(GUEST_STARTED_AT_KEY, String(Date.now()));
                return true;
            } catch (error) {}
            return false;
        }

        function isGuestMode() {
            if (!isLocalDemoHost()) {
                clearGuestMode();
                return false;
            }
            const marker = sessionStorage.getItem(GUEST_MODE_KEY) || localStorage.getItem(GUEST_MODE_KEY);
            if (marker !== '1') return false;
            const startedAt = Number(sessionStorage.getItem(GUEST_STARTED_AT_KEY) || localStorage.getItem(GUEST_STARTED_AT_KEY) || 0);
            if (startedAt && Date.now() - startedAt > GUEST_SESSION_TTL_MS) {
                clearGuestMode();
                return false;
            }
            return true;
        }

        function normalizePatientName(value) {
            return String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();
        }

        const LIVE_PATIENT_IDS = ['P2025091', 'P001'];
        const LIVE_PATIENT_NAMES = ['nanda ananda', 'feby kumalasari'];
        const MY_CORNER_ALLOWED_NAMES = ['nanda ananda', 'feby kumalasari'];

        function isLivePatientProfile(profile) {
            const patientId = String(profile?.id || profile?.patient_id || profile?.medicalRecordId || '').trim();
            const patientName = normalizePatientName(profile?.fullname || profile?.full_name || profile?.name || '');
            return LIVE_PATIENT_IDS.includes(patientId) || LIVE_PATIENT_NAMES.includes(patientName);
        }

        function isMyCornerAllowedProfile(profile) {
            const patientName = normalizePatientName(profile?.fullname || profile?.full_name || profile?.name || '');
            return MY_CORNER_ALLOWED_NAMES.includes(patientName);
        }

        function showMyCornerComingSoon() {
            showToast('Ruang Saya Coming Soon');
        }

        function trackMyCornerComingSoon() {
            if (!currentProfile || isGuestMode()) return;
            const token = getToken();
            if (!token) return;
            fetch('/api/patients/track-page', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + token
                },
                body: JSON.stringify({
                    page_name: 'Ruang Saya - Coming Soon'
                })
            }).catch(() => {});
        }

        function redirectUnsupportedPatient(profile) { return false; }

        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text == null ? '' : String(text);
            return div.innerHTML;
        }

        function getInitials(name) {
            if (!name) return '--';
            return String(name).split(' ').filter(Boolean).map(part => part[0]).join('').slice(0, 2).toUpperCase();
        }

        function stopTopbarEvent(event) {
            if (event && typeof event.preventDefault === 'function') event.preventDefault();
            if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
        }

        function getStoredProfile() {
            if (isGuestMode()) return Object.assign({}, GUEST_DEMO_PROFILE);
            return getPatientUser();
        }

        function renderGuestPromptBody(message) {
            return '<div class="settings-panel guest-prompt-panel">' +
                '<div class="modal-empty guest-prompt-empty">' +
                    '<i class="fa-solid fa-lock" style="font-size:28px;color:var(--green);"></i>' +
                    '<p>' + escapeHtml(message || 'Mode demo hanya untuk melihat-lihat. Masuk dengan akun pasien untuk memakai fitur ini.') + '</p>' +
                '</div>' +
                '<div class="guest-prompt-actions">' +
                    '<button type="button" class="guest-prompt-action" data-shell-action="close-modal"><i class="fa-solid fa-eye"></i><span>Lanjut lihat demo</span></button>' +
                    '<button type="button" class="guest-prompt-action primary" data-shell-action="guest-login"><i class="fa-solid fa-right-to-bracket"></i><span>Masuk / Daftar</span></button>' +
                '</div>' +
            '</div>';
        }

        function showGuestUpgradePrompt(message, event) {
            stopTopbarEvent(event);
            trackGuestActivity('upgrade_prompt', message || 'Prompt fitur pasien asli');
            openTopbarModal('Mode Demo', 'SISIwanita', renderGuestPromptBody(message));
        }

        function requireRealPatient(message, event) {
            if (!isGuestMode()) return true;
            showGuestUpgradePrompt(message, event);
            return false;
        }

        function endGuestAndLogin(event) {
            stopTopbarEvent(event);
            clearPatientAuth();
            trackGuestActivity('login_redirect', 'Guest diarahkan ke login/daftar');
            clearGuestMode();
            window.location.href = '/patient-login.html?mode=register';
        }

        function getGuestNavigationUrl(url) {
            let parsed;
            try { parsed = new URL(url, window.location.origin); } catch (error) { return null; }
            if (parsed.origin !== window.location.origin) return null;
            const rule = GUEST_DEMO_ROUTES[parsed.pathname];
            if (!rule) return null;
            parsed.searchParams.set('guest', '1');
            if (rule.mockParam) parsed.searchParams.set(rule.mockParam, '1');
            return parsed.pathname + parsed.search + parsed.hash;
        }

        function isGuestLoginRoute(url) {
            let parsed;
            try { parsed = new URL(url, window.location.origin); } catch (error) { return false; }
            return parsed.origin === window.location.origin && GUEST_LOGIN_ROUTES.has(parsed.pathname);
        }

        function openTopbarModal(title, kicker, bodyHtml) {
            closeSheet();
            const overlay = document.getElementById('modal-overlay');
            const modal = document.getElementById('topbar-modal');
            const titleEl = document.getElementById('topbar-modal-title');
            const kickerEl = document.getElementById('topbar-modal-kicker');
            const bodyEl = document.getElementById('topbar-modal-body');
            if (!overlay || !modal || !titleEl || !kickerEl || !bodyEl) return;
            titleEl.textContent = title || 'Menu';
            kickerEl.textContent = kicker || 'SISIwanita';
            bodyEl.innerHTML = bodyHtml || '';
            modal.classList.toggle('is-profile-modal', String(title || '').toLowerCase() === 'profil');
            modal.classList.toggle('is-settings-modal', String(title || '').toLowerCase() === 'pengaturan');
            overlay.classList.add('active');
            modal.classList.add('active');
            document.body.style.overflow = 'hidden';
        }

        function closeTopbarModal(event) {
            stopTopbarEvent(event);
            closeAllModals();
        }

        function renderModalLoading(text) {
            return '<div class="modal-empty"><i class="fa-solid fa-spinner fa-spin"></i><p>' + escapeHtml(text || 'Memuat...') + '</p></div>';
        }

        function getNotificationIcon(type) {
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

        function renderNotificationsModal(notifications) {
            notifications = Array.isArray(notifications) ? notifications : [];
            const unreadCount = notifications.filter(item => !item.read_at).length;
            const summary = '<div class="topbar-modal-summary">' +
                '<div><strong>' + notifications.length + '</strong><span>Total notifikasi</span></div>' +
                '<div><strong>' + unreadCount + '</strong><span>Belum dibaca</span></div>' +
            '</div>';
            if (!notifications.length) {
                return summary + '<div class="modal-empty"><i class="fa-regular fa-bell-slash"></i><p>Belum ada notifikasi baru.</p></div>';
            }
            const readAll = unreadCount ? '<button type="button" class="ghost-action soundable" data-shell-action="mark-all-notifications"><i class="fa-solid fa-check-double"></i> Tandai semua dibaca</button>' : '';
            const items = notifications.slice(0, 12).map(function(item) {
                const isUnread = !item.read_at;
                return '<button type="button" class="notification-item ' + (isUnread ? 'unread' : '') + '" data-shell-action="mark-notification-read" data-notification-id="' + escapeHtml(item.id) + '">' +
                    '<span class="notification-icon"><i class="' + getNotificationIcon(item.type) + '"></i></span>' +
                    '<span class="notification-copy">' +
                        '<strong>' + escapeHtml(item.title || 'Notifikasi') + '</strong>' +
                        '<span>' + escapeHtml(item.message || '') + '</span>' +
                        '<small>' + escapeHtml(formatInfoTime(item.created_at)) + '</small>' +
                    '</span>' +
                    (isUnread ? '<span class="unread-dot"></span>' : '') +
                '</button>';
            }).join('');
            return summary + readAll + '<div class="notification-list">' + items + '</div>';
        }

        async function fetchTopbarNotifications() {
            const response = await fetch('/api/patient-notifications?_t=' + Date.now(), {
                headers: { 'Authorization': 'Bearer ' + getToken(), 'Cache-Control': 'no-cache' },
                cache: 'no-store'
            });
            if (response.status === 401) throw new Error('unauthorized');
            if (!response.ok) throw new Error('notifications failed');
            const data = await response.json().catch(() => ({}));
            return data.success && Array.isArray(data.notifications) ? data.notifications : [];
        }

        async function openNotificationModal(event) {
            stopTopbarEvent(event);
            if (!requireRealPatient('Notifikasi berisi data pribadi pasien. Masuk dengan akun pasien untuk membukanya.', event)) return;
            openTopbarModal('Notifikasi', 'Update pasien', renderModalLoading('Memuat notifikasi...'));
            try {
                topbarNotifications = await fetchTopbarNotifications();
                openTopbarModal('Notifikasi', 'Update pasien', renderNotificationsModal(topbarNotifications));
                loadNotificationCount();
            } catch (error) {
                if (error.message === 'unauthorized') { logout(); return; }
                openTopbarModal('Notifikasi', 'Update pasien', '<div class="modal-empty"><i class="fa-regular fa-bell-slash"></i><p>Notifikasi belum bisa dimuat.</p></div>');
            }
        }

        async function markTopbarNotificationRead(id) {
            const item = topbarNotifications.find(notif => String(notif.id) === String(id));
            if (item) item.read_at = new Date().toISOString();
            openTopbarModal('Notifikasi', 'Update pasien', renderNotificationsModal(topbarNotifications));
            loadNotificationCount();
            try {
                await fetch('/api/patient-notifications/' + encodeURIComponent(id) + '/read', {
                    method: 'POST',
                    headers: { 'Authorization': 'Bearer ' + getToken() }
                });
            } catch (error) {}
        }

        async function markAllTopbarNotificationsRead(event) {
            stopTopbarEvent(event);
            topbarNotifications.forEach(item => { item.read_at = new Date().toISOString(); });
            openTopbarModal('Notifikasi', 'Update pasien', renderNotificationsModal(topbarNotifications));
            loadNotificationCount();
            try {
                await fetch('/api/patient-notifications/read-all', {
                    method: 'POST',
                    headers: { 'Authorization': 'Bearer ' + getToken() }
                });
            } catch (error) {}
        }

        function getPortalDisplayName(profile) {
            const nickname = String(portalSettings.nickname || '').trim();
            const sourceName = nickname || profile?.fullname || profile?.full_name || profile?.name || 'Pasien';
            return String(sourceName).split(' ')[0] || 'Pasien';
        }

        function applyPortalSettings(settings) {
            portalSettings = Object.assign({}, portalSettings, settings || {});
            try { localStorage.setItem('patient_portal_settings', JSON.stringify(portalSettings)); } catch (error) {}
            const heroTitle = document.getElementById('hero-title');
            if (heroTitle) heroTitle.textContent = getPortalDisplayName(currentProfile || getStoredProfile()) + ', ini ruang Anda.';
        }

        async function fetchPortalSettings() {
            const response = await fetch('/api/patients/portal-settings?_t=' + Date.now(), {
                headers: { 'Authorization': 'Bearer ' + getToken(), 'Cache-Control': 'no-cache' },
                cache: 'no-store'
            });
            if (response.status === 401) throw new Error('unauthorized');
            if (!response.ok) throw new Error('portal settings failed');
            const data = await response.json().catch(() => ({}));
            return data.success && data.settings ? data.settings : portalSettings;
        }

        async function loadPortalSettings() {
            try {
                let cached = null;
                try { cached = JSON.parse(localStorage.getItem('patient_portal_settings') || 'null'); } catch (error) {}
                if (cached) applyPortalSettings(cached);
                const settings = await fetchPortalSettings();
                applyPortalSettings(settings);
                return settings;
            } catch (error) {
                if (error.message === 'unauthorized') throw error;
                return portalSettings;
            }
        }

        function getDisplayedNotificationCount() {
            const badge = document.getElementById('notif-badge');
            const value = badge && badge.style.display !== 'none' ? badge.textContent : '';
            return value || '0';
        }

        function renderSettingsModal() {
            const count = getDisplayedNotificationCount();
            const nickname = portalSettings.nickname || '';
            const sound = portalSettings.notification_sound || 'default';
            const option = function(value, label) {
                return '<option value="' + value + '"' + (sound === value ? ' selected' : '') + '>' + label + '</option>';
            };
            return '<div class="settings-panel">' +
                '<button type="button" class="settings-row soundable" data-shell-action="open-settings-notifications">' +
                    '<i class="fa-solid fa-bell"></i><span><strong>Notifikasi</strong><span>Lihat update pasien dan pengumuman klinik</span></span>' +
                    '<em class="settings-count">' + escapeHtml(count) + '</em>' +
                '</button>' +
                '<div class="settings-field">' +
                    '<label for="portal-nickname">Nickname Anda</label>' +
                    '<input id="portal-nickname" class="settings-input" maxlength="40" value="' + escapeHtml(nickname) + '" placeholder="Contoh: Bunda">' +
                '</div>' +
                '<div class="settings-field">' +
                    '<label for="portal-notification-sound">Suara Notifikasi</label>' +
                    '<select id="portal-notification-sound" class="settings-select">' +
                        option('default', 'Default') +
                        option('chime', 'Chime') +
                        option('bell', 'Bell') +
                        option('soft', 'Soft') +
                        option('none', 'Tanpa Suara') +
                    '</select>' +
                '</div>' +
                '<div class="settings-actions">' +
                    '<button type="button" class="ghost-action soundable" data-shell-action="test-portal-sound"><i class="fa-solid fa-volume-high"></i> Test</button>' +
                    '<button type="button" class="primary-action soundable" data-shell-action="save-portal-settings"><i class="fa-solid fa-check"></i> Simpan</button>' +
                '</div>' +
                '<button type="button" class="settings-row soundable" data-shell-action="go" data-shell-href="/patient-intake.html">' +
                    '<i class="fa-solid fa-clipboard-list"></i><span><strong>Form Intake</strong><span>Edit atau update data intake Anda</span></span>' +
                    '<i class="fa-solid fa-chevron-right"></i>' +
                '</button>' +
                renderBirthCongratsSettingsPanel() +
            '</div>';
        }

        function renderBirthCongratsSettingsPanel() {
            let content = '';
            if (birthCongratsSettingsLoading || !birthCongratsSettingsLoaded) {
                content = '<div class="modal-empty"><i class="fa-solid fa-spinner fa-spin"></i><p>Memuat ucapan kelahiran...</p></div>';
            } else if (!birthCongratsSettingsRecords.length) {
                content = '<div class="modal-empty"><i class="fa-regular fa-heart"></i><p>Belum ada ucapan kelahiran yang diterbitkan.</p></div>';
            } else {
                content = '<div class="settings-birth-list">' + birthCongratsSettingsRecords.map(function(item) {
                    const id = escapeHtml(item.id || '');
                    const childNumber = Number(item.child_number || 1);
                    const babyName = String(item.baby_name || 'Buah Hati').trim();
                    const published = Number(item.is_published || 0) === 1;
                    const dismissed = Number(item.patient_dismissed || 0) === 1;
                    const submitted = Number(item.patient_data_submitted || 0) === 1;
                    const hasTestimonial = !!String(item.patient_testimonial || '').trim();
                    const dateValue = item.birth_date ? formatDateLong(item.birth_date) : '-';
                    const statusIcon = !submitted ? 'fa-clipboard-list' : (dismissed ? 'fa-eye-slash' : 'fa-eye');
                    const statusText = !submitted ? 'Data kelahiran belum dilengkapi' : (published ? (dismissed ? 'Sedang disembunyikan' : 'Sedang tampil di beranda') : 'Menunggu publikasi');
                    const actions = [];
                    if (!submitted) {
                        actions.push('<button type="button" class="settings-birth-action soundable" data-shell-action="open-birth-data-modal" data-birth-id="' + id + '">Lengkapi data kelahiran</button>');
                    } else if (published) {
                        actions.push('<button type="button" class="settings-birth-action soundable ' + (dismissed ? '' : 'secondary') + '" data-shell-action="toggle-birth-congrats" data-birth-id="' + id + '" data-birth-dismissed="' + (dismissed ? 'true' : 'false') + '">' + (dismissed ? 'Tampilkan lagi' : 'Sembunyikan') + '</button>');
                        actions.push('<button type="button" class="settings-birth-action soundable secondary" data-shell-action="birth-photo-picker" data-birth-id="' + id + '">Upload foto bayi</button>');
                        if (!hasTestimonial) {
                            actions.push('<button type="button" class="settings-birth-action soundable secondary" data-shell-action="open-birth-testimonial-modal" data-birth-id="' + id + '">Kirim testimoni</button>');
                        }
                    }
                    const action = actions.length ? '<div class="settings-birth-actions">' + actions.join('') + '</div>' : '';
                    return '<div class="settings-birth-item">' +
                        '<div class="settings-birth-copy">' +
                            '<strong>' + escapeHtml(babyName) + '</strong>' +
                            '<span>Anak ke-' + escapeHtml(Number.isFinite(childNumber) && childNumber > 0 ? childNumber : 1) + ' - ' + escapeHtml(dateValue) + '</span>' +
                            '<em class="settings-birth-status ' + (dismissed ? 'hidden' : '') + '"><i class="fa-solid ' + statusIcon + '"></i>' + escapeHtml(statusText) + '</em>' +
                        '</div>' +
                        action +
                    '</div>';
                }).join('') + '</div>';
            }
            return '<div class="settings-subpanel" id="birth-congrats-settings-panel">' +
                '<div class="settings-subhead">' +
                    '<span><strong>Ucapan Kelahiran</strong><span>Atur apakah kartu ucapan kelahiran tampil di beranda.</span></span>' +
                    '<i class="fa-solid fa-baby"></i>' +
                '</div>' +
                content +
            '</div>';
        }

        function refreshBirthCongratsSettingsPanel() {
            const panel = document.getElementById('birth-congrats-settings-panel');
            if (!panel) return;
            panel.outerHTML = renderBirthCongratsSettingsPanel();
        }

        async function fetchBirthCongratsSettingsRecords() {
            const response = await fetch('/api/patient/birth-all?_t=' + Date.now(), {
                headers: { 'Authorization': 'Bearer ' + getToken(), 'Cache-Control': 'no-cache' },
                cache: 'no-store'
            });
            if (response.status === 401) throw new Error('unauthorized');
            const data = await response.json().catch(() => ({}));
            if (!response.ok || !data.success) throw new Error(data.message || 'Ucapan kelahiran belum bisa dimuat');
            return Array.isArray(data.data) ? data.data : [];
        }

        async function loadBirthCongratsSettings() {
            birthCongratsSettingsLoading = true;
            refreshBirthCongratsSettingsPanel();
            try {
                birthCongratsSettingsRecords = await fetchBirthCongratsSettingsRecords();
                birthCongratsSettingsLoaded = true;
                return birthCongratsSettingsRecords;
            } finally {
                birthCongratsSettingsLoading = false;
                refreshBirthCongratsSettingsPanel();
            }
        }

        async function openSettingsModal(event) {
            stopTopbarEvent(event);
            if (!requireRealPatient('Pengaturan portal tersimpan untuk akun pasien. Masuk untuk mengatur profil dan notifikasi.', event)) return;
            birthCongratsSettingsLoading = true;
            openTopbarModal('Pengaturan', 'Portal SISIwanita', renderSettingsModal());
            const results = await Promise.allSettled([loadPortalSettings(), loadBirthCongratsSettings()]);
            const unauthorized = results.some(function(result) { return result.status === 'rejected' && result.reason && result.reason.message === 'unauthorized'; });
            if (unauthorized) { logout(); return; }
            if (results[0].status === 'fulfilled') applyPortalSettings(results[0].value);
            if (results[0].status === 'rejected' || results[1].status === 'rejected') {
                showToast('Sebagian pengaturan belum bisa dimuat');
            }
            if (document.getElementById('topbar-modal')?.classList.contains('active')) {
                openTopbarModal('Pengaturan', 'Portal SISIwanita', renderSettingsModal());
            }
        }

        async function toggleBirthCongratsFromSettings(id, shouldShow, event) {
            stopTopbarEvent(event);
            if (!id) return;
            try {
                await updateBirthCongratsVisibility(id, shouldShow);
                await loadBirthCongratsSettings();
                await loadBirthCongratsHome();
                showToast(shouldShow ? 'Ucapan kelahiran ditampilkan lagi' : 'Ucapan kelahiran disembunyikan');
            } catch (error) {
                if (error.message === 'unauthorized') { logout(); return; }
                showToast(error.message || 'Pengaturan ucapan kelahiran gagal');
            }
        }

        async function updateBirthCongratsVisibility(id, shouldShow) {
            const endpoint = shouldShow ? '/api/patient/birth-show/' : '/api/patient/birth-dismiss/';
            const response = await fetch(endpoint + encodeURIComponent(id), {
                method: 'POST',
                headers: { 'Authorization': 'Bearer ' + getToken(), 'Cache-Control': 'no-cache' },
                cache: 'no-store'
            });
            if (response.status === 401) throw new Error('unauthorized');
            const data = await response.json().catch(() => ({}));
            if (!response.ok || !data.success) throw new Error(data.message || 'Ucapan kelahiran gagal diperbarui');
            return data;
        }

        function openSettingsNotifications(event) {
            stopTopbarEvent(event);
            openNotificationModal(event);
        }

        async function savePortalSettings(event) {
            stopTopbarEvent(event);
            if (!requireRealPatient('Mode demo tidak menyimpan pengaturan akun pasien.', event)) return;
            const nickname = document.getElementById('portal-nickname')?.value || '';
            const notificationSound = document.getElementById('portal-notification-sound')?.value || 'default';
            try {
                const response = await fetch('/api/patients/portal-settings', {
                    method: 'PUT',
                    headers: {
                        'Authorization': 'Bearer ' + getToken(),
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        nickname: nickname,
                        notification_sound: notificationSound
                    })
                });
                if (response.status === 401) { logout(); return; }
                const data = await response.json().catch(() => ({}));
                if (!response.ok || !data.success) throw new Error(data.message || 'Pengaturan gagal disimpan');
                applyPortalSettings(data.settings);
                openTopbarModal('Pengaturan', 'Portal SISIwanita', renderSettingsModal());
                showToast('Pengaturan portal disimpan');
            } catch (error) {
                showToast(error.message || 'Pengaturan gagal disimpan');
            }
        }

        async function savePortalNicknameOnly(nickname, notificationSound) {
            const response = await fetch('/api/patients/portal-settings', {
                method: 'PUT',
                headers: {
                    'Authorization': 'Bearer ' + getToken(),
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    nickname: nickname,
                    notification_sound: notificationSound || 'default'
                })
            });
            if (response.status === 401) throw new Error('unauthorized');
            const data = await response.json().catch(() => ({}));
            if (!response.ok || !data.success) throw new Error(data.message || 'Gagal menyimpan nickname');
            return data.settings || {};
        }

        async function ensurePortalNicknameOnLogin() {
            const existingNickname = String(portalSettings.nickname || '').trim();
            if (existingNickname) return true;

            const ruleText = 'Nickname wajib diisi sebelum menggunakan portal.\n\nAturan nickname:\n- minimal 3 karakter\n- tidak boleh mengandung kata kotor/vulgar\n- tidak boleh mengandung nama staff atau nama Dr. Dibya Arfianda';

            for (let attempt = 0; attempt < 5; attempt += 1) {
                const input = window.prompt(ruleText);
                const candidate = String(input || '').trim();
                if (!candidate) {
                    window.alert('Nickname wajib diisi.');
                    continue;
                }

                try {
                    const settings = await savePortalNicknameOnly(candidate, portalSettings.notification_sound || 'default');
                    applyPortalSettings(settings);
                    showToast('Nickname berhasil disimpan');
                    return true;
                } catch (error) {
                    if (error.message === 'unauthorized') {
                        logout();
                        return false;
                    }
                    window.alert(error.message || 'Nickname tidak valid. Coba nama lain.');
                }
            }

            showToast('Nickname wajib diisi untuk melanjutkan.', 'warning');
            return false;
        }

        function playPortalNotificationSound(event) {
            stopTopbarEvent(event);
            const soundType = document.getElementById('portal-notification-sound')?.value || portalSettings.notification_sound || 'default';
            if (soundType === 'none') {
                showToast('Suara notifikasi dinonaktifkan');
                return;
            }
            try {
                const AudioCtx = window.AudioContext || window.webkitAudioContext;
                if (!AudioCtx) return;
                if (!audioContext) audioContext = new AudioCtx();
                if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
                const now = audioContext.currentTime;
                const osc = audioContext.createOscillator();
                const gain = audioContext.createGain();
                const frequencyMap = { chime: 880, bell: 660, soft: 440, default: 520 };
                osc.type = soundType === 'bell' ? 'triangle' : 'sine';
                osc.frequency.setValueAtTime(frequencyMap[soundType] || frequencyMap.default, now);
                gain.gain.setValueAtTime(0.0001, now);
                gain.gain.exponentialRampToValueAtTime(0.14, now + 0.02);
                gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
                osc.connect(gain);
                gain.connect(audioContext.destination);
                osc.start(now);
                osc.stop(now + 0.52);
            } catch (error) {}
        }

        function formatProfileDate(value) {
            if (!value) return '-';
            const date = new Date(value);
            if (Number.isNaN(date.getTime())) return String(value);
            return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
        }

        function formatDateLong(value) {
            if (!value) return '-';
            const date = new Date(value);
            if (Number.isNaN(date.getTime())) return String(value);
            return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
        }

        function formatDateWeekday(value) {
            if (!value) return '';
            const date = new Date(value);
            if (Number.isNaN(date.getTime())) return '';
            return date.toLocaleDateString('id-ID', { weekday: 'long' });
        }

        function parseLocalDateOnly(value) {
            const raw = String(value || '').slice(0, 10);
            const parts = raw.split('-').map(Number);
            if (parts.length === 3 && parts.every(Number.isFinite)) {
                return new Date(parts[0], parts[1] - 1, parts[2]);
            }
            const fallback = new Date(value);
            return Number.isNaN(fallback.getTime()) ? null : fallback;
        }

        function formatBirthClassHomeDate(value) {
            const date = parseLocalDateOnly(value);
            if (!date) return '-';
            return date.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' });
        }

        function formatBirthClassHomeTime(value) {
            if (!value) return '';
            return String(value).slice(0, 5);
        }

        function formatBirthClassHomePrice(value) {
            const amount = Number(value || 0);
            if (!amount) return 'Gratis';
            return new Intl.NumberFormat('id-ID', {
                style: 'currency',
                currency: 'IDR',
                minimumFractionDigits: 0
            }).format(amount);
        }

        function hideBirthClassHomeCard() {
            const card = document.getElementById('birth-class-home-card');
            if (!card) return;
            card.classList.remove('show');
        }

        function renderBirthClassHomeCard(session) {
            const card = document.getElementById('birth-class-home-card');
            if (!card || !session) return;
            const titleEl = document.getElementById('birth-class-home-session-title');
            const priceEl = document.getElementById('birth-class-home-price');
            const dateEl = document.getElementById('birth-class-home-date');
            const quotaEl = document.getElementById('birth-class-home-quota');
            const locationEl = document.getElementById('birth-class-home-location');

            const startTime = formatBirthClassHomeTime(session.start_time);
            const endTime = formatBirthClassHomeTime(session.end_time);
            const timeText = startTime ? startTime + (endTime ? ' - ' + endTime : '') : '-';
            const availableSlots = Number(session.available_slots ?? Math.max(Number(session.quota || 0) - Number(session.registered_count || 0), 0));

            if (titleEl) titleEl.textContent = session.class_title || 'Kelas persiapan persalinan';
            if (priceEl) priceEl.textContent = formatBirthClassHomePrice(session.price);
            if (dateEl) dateEl.textContent = formatBirthClassHomeDate(session.session_date) + ' • ' + timeText;
            if (quotaEl) quotaEl.textContent = availableSlots > 0 ? 'Sisa ' + availableSlots + ' kursi' : 'Kuota penuh';
            if (locationEl) locationEl.textContent = session.location || 'Lokasi menyusul';

            card.classList.add('show');
            requestAnimationFrame(updateHomeActionGap);
        }

        async function loadBirthClassHomeCard() {
            hideBirthClassHomeCard();
            try {
                const response = await fetch('/api/birth-classes/sessions/public?_t=' + Date.now(), {
                    headers: { 'Cache-Control': 'no-cache' },
                    cache: 'no-store'
                });
                const data = await response.json().catch(() => ({}));
                if (!response.ok || !data.success || !Array.isArray(data.data)) return;

                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const sessions = data.data
                    .filter(function(session) {
                        const sessionDate = parseLocalDateOnly(session.session_date);
                        return sessionDate && sessionDate >= today;
                    })
                    .sort(function(a, b) {
                        const dateA = parseLocalDateOnly(a.session_date);
                        const dateB = parseLocalDateOnly(b.session_date);
                        const timeA = String(a.start_time || '');
                        const timeB = String(b.start_time || '');
                        return (dateA - dateB) || timeA.localeCompare(timeB);
                    });

                if (!sessions.length) return;
                renderBirthClassHomeCard(sessions[0]);
            } catch (error) {
                hideBirthClassHomeCard();
            }
        }

        function getProfilePhotoUrl(profile) {
            profile = profile || {};
            return profile.profile_picture || profile.photo_url || profile.photoUrl || profile.avatar_url || '';
        }

        const HOME_PHOTO_STORAGE_KEY = 'patient_home_photo_adjust_v1';
        const HOME_PHOTO_DEFAULT = {
            photoUrl: '',
            zoom: 1,
            offsetX: 0,
            offsetY: 0
        };
        let homePhotoDraft = null;
        let homePhotoGesture = null;
        // Canonical URL from server (R2), updated after load/upload
        let _homePhotoServerUrl = '';

        function normalizeHomePhotoState(state) {
            const normalized = normalizePhotoAdjustState(state || HOME_PHOTO_DEFAULT);
            return normalized;
        }

        function getHomePhotoState() {
            try {
                const raw = localStorage.getItem(HOME_PHOTO_STORAGE_KEY);
                const stored = raw ? JSON.parse(raw) : {};
                // Server URL always wins over any cached photoUrl
                const photoUrl = _homePhotoServerUrl || stored.photoUrl || '';
                return normalizeHomePhotoState(Object.assign({}, HOME_PHOTO_DEFAULT, stored, { photoUrl }));
            } catch (error) {
                return Object.assign({}, HOME_PHOTO_DEFAULT, { photoUrl: _homePhotoServerUrl });
            }
        }

        function saveHomePhotoState(state) {
            const normalized = normalizeHomePhotoState(state);
            // Only persist crop adjustments to localStorage — URL lives in DB/R2
            try {
                const toStore = { zoom: normalized.zoom, offsetX: normalized.offsetX, offsetY: normalized.offsetY };
                localStorage.setItem(HOME_PHOTO_STORAGE_KEY, JSON.stringify(toStore));
            } catch (error) {}
            homePhotoDraft = Object.assign({}, normalized);
            updateHomeHeroPhoto();
            return normalized;
        }

        // Auto-migrate: if localStorage has a base64/blob photoUrl, upload it to R2 silently
        async function migrateHomePhotoToR2(token) {
            try {
                const raw = localStorage.getItem(HOME_PHOTO_STORAGE_KEY);
                if (!raw) return;
                const stored = JSON.parse(raw);
                const localUrl = stored.photoUrl || '';
                // Only migrate base64 data URLs or blob URLs
                if (!localUrl || (!localUrl.startsWith('data:image') && !localUrl.startsWith('blob:'))) return;

                const resp = await fetch(localUrl);
                const blob = await resp.blob();
                const mimeType = blob.type || 'image/jpeg';
                const ext = mimeType.split('/')[1] || 'jpg';
                const formData = new FormData();
                formData.append('photo', blob, 'home-photo.' + ext);

                const uploadResp = await fetch('/api/patients/upload-home-photo', {
                    method: 'POST',
                    headers: { 'Authorization': 'Bearer ' + token },
                    body: formData
                });
                if (!uploadResp.ok) return;
                const data = await uploadResp.json();
                if (data.success && data.home_photo_url) {
                    _homePhotoServerUrl = data.home_photo_url;
                    // Clear photoUrl from localStorage, keep adjustments only
                    const toStore = { zoom: stored.zoom || 1, offsetX: stored.offsetX || 0, offsetY: stored.offsetY || 0 };
                    localStorage.setItem(HOME_PHOTO_STORAGE_KEY, JSON.stringify(toStore));
                    homePhotoDraft = Object.assign({}, homePhotoDraft || {}, { photoUrl: _homePhotoServerUrl });
                    updateHomeHeroPhoto();
                }
            } catch (e) { /* silent migration */ }
        }

        function updateHomeHeroPhoto(state) {
            const current = normalizeHomePhotoState(state || homePhotoDraft || getHomePhotoState());
            const button = document.getElementById('home-hero-photo');
            const img = document.getElementById('home-hero-photo-img');
            if (!button || !img) return current;
            button.style.setProperty('--home-photo-zoom', current.zoom);
            button.style.setProperty('--home-photo-x', current.offsetX + '%');
            button.style.setProperty('--home-photo-y', current.offsetY + '%');
            if (current.photoUrl) {
                img.src = current.photoUrl;
                button.classList.add('has-photo');
            } else {
                img.removeAttribute('src');
                button.classList.remove('has-photo');
            }
            return current;
        }

        function renderHomePhotoModal(state) {
            state = normalizeHomePhotoState(state || homePhotoDraft || getHomePhotoState());
            const previewPhoto = state.photoUrl ? '<img id="home-photo-preview-img" src="' + escapeHtml(state.photoUrl) + '" alt="Pratinjau foto beranda">' : '';
            const emptyState = state.photoUrl ? '' : '<div class="home-photo-preview-empty"><i class="fa-solid fa-image"></i><span>Belum ada foto beranda</span></div>';
            return '<div class="profile-photo-setup">' +
                '<div class="home-photo-preview" id="home-photo-preview" style="--home-photo-zoom:1;--home-photo-x:0%;--home-photo-y:0%;">' +
                    previewPhoto +
                    emptyState +
                '</div>' +
                '<div class="home-photo-hint">Crop hanya bisa diatur saat upload. Jika ingin mengubah crop, upload ulang foto beranda.</div>' +
                '<div class="profile-photo-save-actions">' +
                    '<button type="button" class="ghost-action soundable" data-shell-action="home-photo-picker"><i class="fa-solid fa-upload"></i> Upload Ulang</button>' +
                '</div>' +
            '</div>';
        }
        function bindHomePhotoInput() {
            let input = document.getElementById('home-photo-input');
            if (!input) {
                input = document.createElement('input');
                input.type = 'file';
                input.id = 'home-photo-input';
                input.accept = 'image/*';
                input.className = 'hidden-file-input';
                document.body.appendChild(input);
            }
            if (input.dataset.bound !== '1') {
                input.dataset.bound = '1';
                input.addEventListener('change', handleHomePhotoUpload);
            }
            return input;
        }

        function openHomePhotoPicker(event) {
            stopTopbarEvent(event);
            const input = bindHomePhotoInput();
            input.value = '';
            input.click();
        }

        async function handleHomePhotoUpload(event) {
            var input = event && event.target;
            var file = input && input.files && input.files[0];
            if (!file) return;
            if (!file.type || !file.type.startsWith('image/')) {
                showToast('Pilih file gambar untuk foto beranda');
                if (input) input.value = '';
                return;
            }
            if (file.size > 10 * 1024 * 1024) {
                showToast('Ukuran file maksimal 10MB');
                if (input) input.value = '';
                return;
            }
            try {
                await loadPatientFeature('profilePhotoCropper');
            } catch (error) {
                console.error('[PatientShell] Photo editor failed to load:', error);
            }
            if (typeof window.openProfilePhotoCropper !== 'function') {
                showToast('Editor foto belum siap. Muat ulang halaman lalu coba lagi.');
                if (input) input.value = '';
                return;
            }

            window.openProfilePhotoCropper({
                file: file,
                title: 'Atur Foto Beranda',
                shape: 'square',
                onCancel: function() {
                    if (input) input.value = '';
                },
                onSave: function(blob) {
                    // Upload directly to R2 instead of storing base64 in localStorage
                    var token = getToken();
                    var mimeType = blob.type || 'image/jpeg';
                    var ext = mimeType.split('/')[1] || 'jpg';
                    var formData = new FormData();
                    formData.append('photo', blob, 'home-photo.' + ext);

                    showToast('Mengupload foto beranda...');

                    return fetch('/api/patients/upload-home-photo', {
                        method: 'POST',
                        headers: { 'Authorization': 'Bearer ' + token },
                        body: formData
                    }).then(function(resp) {
                        return resp.json();
                    }).then(function(data) {
                        if (!data.success) throw new Error(data.message || 'Upload gagal');
                        _homePhotoServerUrl = data.home_photo_url;
                        homePhotoDraft = normalizeHomePhotoState({
                            photoUrl: _homePhotoServerUrl,
                            zoom: 1,
                            offsetX: 0,
                            offsetY: 0
                        });
                        saveHomePhotoState(homePhotoDraft);
                        updateHomeHeroPhoto(homePhotoDraft);
                        openTopbarModal('Foto Beranda', 'Tampilan beranda', renderHomePhotoModal(homePhotoDraft));
                        showToast('Foto beranda berhasil disimpan');
                        return true;
                    }).catch(function(error) {
                        showToast(error.message || 'Upload foto beranda gagal');
                        return false;
                    }).finally(function() {
                        if (input) input.value = '';
                    });
                }
            });
        }

        function blobToDataUrl(blob) {
            return new Promise(function(resolve, reject) {
                var reader = new FileReader();
                reader.onload = function() { resolve(String(reader.result || '')); };
                reader.onerror = function() { reject(new Error('Gagal membaca file foto')); };
                reader.readAsDataURL(blob);
            });
        }
        function updateHomePhotoDraftFromInputs() {
            applyHomePhotoDraftToPreview();
        }

        function applyHomePhotoDraftToPreview() {
            const preview = document.getElementById('home-photo-preview');
            if (!preview) return;
            homePhotoDraft = normalizeHomePhotoState(homePhotoDraft || getHomePhotoState());
            preview.style.setProperty('--home-photo-zoom', homePhotoDraft.zoom);
            preview.style.setProperty('--home-photo-x', homePhotoDraft.offsetX + '%');
            preview.style.setProperty('--home-photo-y', homePhotoDraft.offsetY + '%');
            const previewImg = document.getElementById('home-photo-preview-img');
            if (previewImg && homePhotoDraft.photoUrl) previewImg.src = homePhotoDraft.photoUrl;
        }

        function bindHomePhotoPreviewGestures() {
            const preview = document.getElementById('home-photo-preview');
            if (!preview || preview.dataset.gestureBound === '1') return;
            preview.dataset.gestureBound = '1';
            const pointers = new Map();
            let dragStart = null;
            let pinchStart = null;
            let activePointerId = null;

            const clampZoom = function(value) {
                return Math.min(2.2, Math.max(1, value));
            };

            const percentFromPx = function(px, size) {
                if (!size) return 0;
                return (px / size) * 100;
            };

            const updateFromGesture = function() {
                if (!homePhotoDraft) homePhotoDraft = getHomePhotoState();
                homePhotoDraft = normalizeHomePhotoState(homePhotoDraft);
                preview.style.setProperty('--home-photo-zoom', homePhotoDraft.zoom);
                preview.style.setProperty('--home-photo-x', homePhotoDraft.offsetX + '%');
                preview.style.setProperty('--home-photo-y', homePhotoDraft.offsetY + '%');
            };

            const finishGesture = function(pointerId) {
                if (typeof pointerId !== 'undefined' && pointers.has(pointerId)) pointers.delete(pointerId);
                if (typeof pointerId !== 'undefined' && activePointerId === pointerId) activePointerId = null;
                if (pointers.size === 0) {
                    preview.classList.remove('is-dragging');
                    dragStart = null;
                    pinchStart = null;
                }
            };

            const handleMove = function(event) {
                if (!pointers.has(event.pointerId)) return;
                pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
                if (pointers.size === 1 && dragStart) {
                    const rect = preview.getBoundingClientRect();
                    homePhotoDraft = normalizeHomePhotoState(Object.assign({}, homePhotoDraft || getHomePhotoState(), {
                        offsetX: dragStart.offsetX + percentFromPx(event.clientX - dragStart.x, rect.width),
                        offsetY: dragStart.offsetY + percentFromPx(event.clientY - dragStart.y, rect.height)
                    }));
                    updateFromGesture();
                } else if (pointers.size === 2 && pinchStart) {
                    const points = Array.from(pointers.values());
                    const distance = Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y) || 1;
                    const centerX = (points[0].x + points[1].x) / 2;
                    const centerY = (points[0].y + points[1].y) / 2;
                    const rect = preview.getBoundingClientRect();
                    homePhotoDraft = normalizeHomePhotoState(Object.assign({}, homePhotoDraft || getHomePhotoState(), {
                        zoom: clampZoom(pinchStart.zoom * (distance / pinchStart.distance)),
                        offsetX: pinchStart.offsetX + percentFromPx(centerX - pinchStart.centerX, rect.width),
                        offsetY: pinchStart.offsetY + percentFromPx(centerY - pinchStart.centerY, rect.height)
                    }));
                    updateFromGesture();
                }
                event.preventDefault();
            };

            preview.addEventListener('pointerdown', function(event) {
                if (event.button && event.button !== 0) return;
                activePointerId = event.pointerId;
                if (preview.setPointerCapture) {
                    try { preview.setPointerCapture(event.pointerId); } catch (error) {}
                }
                pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
                preview.classList.add('is-dragging');
                if (pointers.size === 1) {
                    dragStart = {
                        x: event.clientX,
                        y: event.clientY,
                        offsetX: normalizeHomePhotoState(homePhotoDraft || getHomePhotoState()).offsetX,
                        offsetY: normalizeHomePhotoState(homePhotoDraft || getHomePhotoState()).offsetY
                    };
                    pinchStart = null;
                } else if (pointers.size === 2) {
                    const points = Array.from(pointers.values());
                    pinchStart = {
                        distance: Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y) || 1,
                        zoom: normalizeHomePhotoState(homePhotoDraft || getHomePhotoState()).zoom,
                        offsetX: normalizeHomePhotoState(homePhotoDraft || getHomePhotoState()).offsetX,
                        offsetY: normalizeHomePhotoState(homePhotoDraft || getHomePhotoState()).offsetY,
                        centerX: (points[0].x + points[1].x) / 2,
                        centerY: (points[0].y + points[1].y) / 2
                    };
                }
                event.preventDefault();
            });

            window.addEventListener('pointermove', handleMove, { passive: false });
            window.addEventListener('pointerup', function(event) { finishGesture(event.pointerId); }, { passive: true });
            window.addEventListener('pointercancel', function(event) { finishGesture(event.pointerId); }, { passive: true });
        }

        function resetHomePhotoDraft(event) {
            stopTopbarEvent(event);
            homePhotoDraft = Object.assign({}, HOME_PHOTO_DEFAULT);
            openTopbarModal('Foto Beranda', 'Tampilan beranda', renderHomePhotoModal(homePhotoDraft));
        }

        function saveHomePhotoDraft(event) {
            stopTopbarEvent(event);
            if (!homePhotoDraft || !homePhotoDraft.photoUrl) {
                showToast('Upload foto beranda terlebih dahulu');
                return;
            }
            saveHomePhotoState(homePhotoDraft);
            openTopbarModal('Foto Beranda', 'Tampilan beranda', renderHomePhotoModal(homePhotoDraft));
            showToast('Foto beranda disimpan');
        }

        function openHomePhotoModal(event) {
            stopTopbarEvent(event);
            if (!requireRealPatient('Foto beranda hanya tersimpan untuk akun pasien. Masuk untuk mengaturnya.', event)) return;
            homePhotoDraft = getHomePhotoState();
            openTopbarModal('Foto Beranda', 'Tampilan beranda', renderHomePhotoModal(homePhotoDraft));
            // Crop is adjusted only during upload; no post-save crop editing.
        }

        const PROFILE_PHOTO_STORAGE_KEY = 'patient_profile_photo_adjust_v1';
        const PROFILE_PHOTO_DEFAULT = {
            photoUrl: '',
            zoom: 1,
            offsetX: 0,
            offsetY: 0
        };
        let profilePhotoDraft = null;

        function clampPhotoAdjust(value, min, max, fallback) {
            const num = Number(value);
            if (!Number.isFinite(num)) return fallback;
            return Math.min(max, Math.max(min, num));
        }

        function normalizePhotoAdjustState(state) {
            state = state || {};
            return {
                photoUrl: state.photoUrl || '',
                zoom: clampPhotoAdjust(state.zoom, 1, 2.2, 1),
                offsetX: clampPhotoAdjust(state.offsetX, -90, 90, 0),
                offsetY: clampPhotoAdjust(state.offsetY, -90, 90, 0)
            };
        }

        function getProfilePhotoAdjustState() {
            try {
                const raw = localStorage.getItem(PROFILE_PHOTO_STORAGE_KEY);
                if (!raw) return Object.assign({}, PROFILE_PHOTO_DEFAULT);
                return normalizePhotoAdjustState(JSON.parse(raw));
            } catch (error) {
                return Object.assign({}, PROFILE_PHOTO_DEFAULT);
            }
        }

        function saveProfilePhotoAdjustState(state) {
            const normalized = normalizePhotoAdjustState(state);
            try {
                localStorage.setItem(PROFILE_PHOTO_STORAGE_KEY, JSON.stringify(normalized));
            } catch (error) {}
            profilePhotoDraft = Object.assign({}, normalized);
            updateProfileAvatar(currentProfile || getStoredProfile());
            return normalized;
        }

        function applyPhotoAdjustToElement(element, state, prefix) {
            if (!element) return;
            const normalized = normalizePhotoAdjustState(state);
            const key = prefix || 'profile-photo';
            element.style.setProperty('--' + key + '-zoom', normalized.zoom);
            element.style.setProperty('--' + key + '-x', normalized.offsetX + 'px');
            element.style.setProperty('--' + key + '-y', normalized.offsetY + 'px');
        }

        function updateProfileAvatar(profile) {
            profile = profile || {};
            const img = document.getElementById('user-avatar-img');
            const initials = document.getElementById('user-avatar-initials');
            if (!img || !initials) return;
            const name = profile.fullname || profile.full_name || profile.name || 'Pasien';
            const basePhotoUrl = getProfilePhotoUrl(profile);
            const adjusted = normalizePhotoAdjustState(profilePhotoDraft || getProfilePhotoAdjustState());
            const photoUrl = adjusted.photoUrl || basePhotoUrl;
            const avatarButton = document.getElementById('user-avatar');
            if (photoUrl) {
                img.src = photoUrl;
                img.style.display = 'block';
                img.style.transformOrigin = 'center center';
                img.style.transform = 'translate(' + adjusted.offsetX + 'px, ' + adjusted.offsetY + 'px) scale(' + adjusted.zoom + ')';
                if (avatarButton) {
                    avatarButton.style.setProperty('--profile-photo-zoom', adjusted.zoom);
                    avatarButton.style.setProperty('--profile-photo-x', adjusted.offsetX + 'px');
                    avatarButton.style.setProperty('--profile-photo-y', adjusted.offsetY + 'px');
                }
                initials.style.display = 'none';
            } else {
                img.removeAttribute('src');
                img.style.display = 'none';
                img.style.transform = '';
                if (avatarButton) {
                    avatarButton.style.removeProperty('--profile-photo-zoom');
                    avatarButton.style.removeProperty('--profile-photo-x');
                    avatarButton.style.removeProperty('--profile-photo-y');
                }
                initials.textContent = getInitials(name);
                initials.style.display = '';
            }
        }

        function openProfilePhotoPicker(event, mode) {
            stopTopbarEvent(event);
            if (!requireRealPatient('Foto profil hanya bisa diatur setelah login sebagai pasien.', event)) return;
            const input = document.getElementById(mode === 'camera' ? 'profile-photo-camera-input' : 'profile-photo-input');
            if (!input) return;
            if (mode === 'camera') input.setAttribute('capture', 'environment');
            else input.removeAttribute('capture');
            input.value = '';
            input.click();
        }

        function bindProfilePhotoInputs() {
            ['profile-photo-camera-input', 'profile-photo-input'].forEach(function(id) {
                const input = document.getElementById(id);
                if (!input || input.dataset.bound === '1') return;
                input.dataset.bound = '1';
                input.addEventListener('change', handleProfilePhotoUpload);
            });
        }

        function renderProfilePhotoEditor(state) {
            state = normalizePhotoAdjustState(state || profilePhotoDraft || getProfilePhotoAdjustState());
            const previewPhoto = state.photoUrl ? '<img id="profile-photo-preview-img" src="' + escapeHtml(state.photoUrl) + '" alt="Pratinjau foto profil">' : '';
            const emptyState = state.photoUrl ? '' : '<div class="profile-photo-preview-empty"><i class="fa-solid fa-user"></i><span>Belum ada foto profil</span></div>';
            return '<div class="profile-photo-setup">' +
                '<div class="profile-photo-preview" id="profile-photo-preview" style="--profile-photo-zoom:' + state.zoom + ';--profile-photo-x:' + state.offsetX + 'px;--profile-photo-y:' + state.offsetY + 'px;">' +
                    previewPhoto +
                    emptyState +
                '</div>' +
                '<div class="profile-photo-controls">' +
                    '<div class="profile-photo-control">' +
                        '<label>Zoom</label>' +
                        '<input type="range" min="1" max="2.2" step="0.01" value="' + state.zoom + '" oninput="updateProfilePhotoDraftFromInputs()" id="profile-photo-zoom">' +
                    '</div>' +
                    '<div class="profile-photo-control">' +
                        '<label>Geser Horizontal</label>' +
                        '<input type="range" min="-90" max="90" step="1" value="' + state.offsetX + '" oninput="updateProfilePhotoDraftFromInputs()" id="profile-photo-offset-x">' +
                    '</div>' +
                    '<div class="profile-photo-control">' +
                        '<label>Geser Vertikal</label>' +
                        '<input type="range" min="-90" max="90" step="1" value="' + state.offsetY + '" oninput="updateProfilePhotoDraftFromInputs()" id="profile-photo-offset-y">' +
                    '</div>' +
                '</div>' +
                '<div class="profile-photo-save-actions">' +
                    '<button type="button" class="ghost-action soundable" data-shell-action="profile-photo-picker" data-photo-mode="camera"><i class="fa-solid fa-camera"></i> Kamera</button>' +
                    '<button type="button" class="ghost-action soundable" data-shell-action="profile-photo-picker" data-photo-mode="gallery"><i class="fa-solid fa-image"></i> Galeri</button>' +
                    '<button type="button" class="secondary-action soundable" data-shell-action="reset-profile-photo-draft"><i class="fa-solid fa-rotate-left"></i> Reset</button>' +
                    '<button type="button" class="primary-action soundable" data-shell-action="save-profile-photo-draft"><i class="fa-solid fa-check"></i> Simpan</button>' +
                '</div>' +
            '</div>';
        }

        function updateProfilePhotoDraftFromInputs() {
            const zoomInput = document.getElementById('profile-photo-zoom');
            const xInput = document.getElementById('profile-photo-offset-x');
            const yInput = document.getElementById('profile-photo-offset-y');
            profilePhotoDraft = normalizePhotoAdjustState(Object.assign({}, profilePhotoDraft || getProfilePhotoAdjustState(), {
                zoom: zoomInput ? Number(zoomInput.value) : 1,
                offsetX: xInput ? Number(xInput.value) : 0,
                offsetY: yInput ? Number(yInput.value) : 0
            }));
            const preview = document.getElementById('profile-photo-preview');
            if (preview) {
                preview.style.setProperty('--profile-photo-zoom', profilePhotoDraft.zoom);
                preview.style.setProperty('--profile-photo-x', profilePhotoDraft.offsetX + 'px');
                preview.style.setProperty('--profile-photo-y', profilePhotoDraft.offsetY + 'px');
            }
            const previewImg = document.getElementById('profile-photo-preview-img');
            if (previewImg && profilePhotoDraft.photoUrl) {
                previewImg.src = profilePhotoDraft.photoUrl;
            }
        }

        function resetProfilePhotoDraft(event) {
            stopTopbarEvent(event);
            profilePhotoDraft = Object.assign({}, PROFILE_PHOTO_DEFAULT, { photoUrl: getProfilePhotoAdjustState().photoUrl || getProfilePhotoUrl(currentProfile || getStoredProfile()) });
            openTopbarModal('Profil', 'Akun pasien', renderProfileModal(currentProfile || getStoredProfile()));
        }

        function saveProfilePhotoDraft(event) {
            stopTopbarEvent(event);
            if (!profilePhotoDraft || !profilePhotoDraft.photoUrl) {
                showToast('Upload foto profil terlebih dahulu');
                return;
            }
            saveProfilePhotoAdjustState(profilePhotoDraft);
            updateProfileAvatar(currentProfile || getStoredProfile());
            openTopbarModal('Profil', 'Akun pasien', renderProfileModal(currentProfile || getStoredProfile()));
            showToast('Foto profil disimpan');
        }

        async function handleProfilePhotoUpload(event) {
            const input = event && event.target;
            const file = input && input.files && input.files[0];
            if (!file) return;
            if (!file.type || !file.type.startsWith('image/')) {
                showToast('Pilih file gambar untuk foto profil');
                input.value = '';
                return;
            }
            if (file.size > 2 * 1024 * 1024) {
                showToast('Ukuran foto maksimal 2MB');
                input.value = '';
                return;
            }

            try {
                await loadPatientFeature('profilePhotoCropper');
            } catch (error) {
                console.error('[PatientShell] Photo editor failed to load:', error);
            }
            if (typeof window.openProfilePhotoCropper !== 'function') {
                showToast('Editor foto belum siap. Muat ulang halaman lalu coba lagi.');
                input.value = '';
                return;
            }

            window.openProfilePhotoCropper({
                file: file,
                title: 'Atur Foto Profil',
                onCancel: function() {
                    input.value = '';
                },
                onSave: function(blob) {
                    return uploadProfilePhotoBlob(blob, input);
                }
            });
        }

        async function uploadProfilePhotoBlob(blob, input) {
            const token = getToken();
            if (!token) { logout(); return false; }

            const formData = new FormData();
            formData.append('photo', blob, 'profile-photo.jpg');
            showToast('Mengunggah foto profil...');
            try {
                const response = await fetch('/api/patients/upload-photo', {
                    method: 'POST',
                    headers: { 'Authorization': 'Bearer ' + token },
                    body: formData
                });
                if (response.status === 401) { logout(); return false; }
                const data = await response.json().catch(function() { return {}; });
                if (!response.ok || !data.success) throw new Error(data.message || 'Upload foto gagal');
                const photoUrl = data.photo_url || data.profile_picture || data.url || '';
                currentProfile = Object.assign({}, currentProfile || getStoredProfile(), {
                    photo_url: photoUrl,
                    profile_picture: photoUrl
                });
                setPatientUser(currentProfile);
                window.currentProfile = currentProfile;
                updateProfileAvatar(currentProfile);
                openTopbarModal('Profil', 'Akun pasien', renderProfileModal(currentProfile));
                showToast('Foto profil berhasil diperbarui');
                return true;
            } catch (error) {
                showToast(error.message || 'Upload foto gagal');
                return false;
            } finally {
                if (input) input.value = '';
            }
        }
        function renderProfileModal(profile) {
            profile = profile || {};
            const name = profile.fullname || profile.full_name || profile.name || 'Pasien SISIwanita';
            const medicalId = profile.medical_record_id || profile.medicalRecordId || profile.mr_id || profile.id || '-';
            const email = profile.email || '-';
            const phone = profile.phone || profile.phone_number || profile.no_hp || '-';
            const birthDate = profile.birth_date || profile.date_of_birth || profile.dob || '';
            const previewState = normalizePhotoAdjustState(profilePhotoDraft || getProfilePhotoAdjustState() || { photoUrl: getProfilePhotoUrl(profile) });
            if (!previewState.photoUrl) previewState.photoUrl = getProfilePhotoUrl(profile);
            const avatarClass = previewState.photoUrl ? 'shell-profile-avatar has-photo' : 'shell-profile-avatar';
            const avatarHtml = previewState.photoUrl
                ? '<img src="' + escapeHtml(previewState.photoUrl) + '" alt="Foto profil">'
                : '<span class="shell-profile-avatar-fallback">' + escapeHtml(getInitials(name)) + '</span>';
            const photoUploadActions =
                '<div class="profile-photo-save-actions">' +
                    '<button type="button" class="ghost-action soundable" data-shell-action="profile-photo-picker" data-photo-mode="camera"><i class="fa-solid fa-camera"></i> Kamera</button>' +
                    '<button type="button" class="ghost-action soundable" data-shell-action="profile-photo-picker" data-photo-mode="gallery"><i class="fa-solid fa-image"></i> Upload Ulang</button>' +
                '</div>' +
                '<div class="profile-photo-note">Crop hanya bisa diatur saat upload. Jika ingin mengubah crop, upload ulang foto profil.</div>';
            return '<div class="shell-profile-head">' +
                '<div class="' + avatarClass + '">' + avatarHtml + '</div>' +
                '<div><span>Profil pasien</span><strong>' + escapeHtml(name) + '</strong><small>Portal Wanita Sehat</small></div>' +
            '</div>' +
            photoUploadActions +
            '<div class="shell-profile-grid">' +
                '<div><span>No. Rekam Medis</span><strong>' + escapeHtml(medicalId) + '</strong></div>' +
                '<div><span>Email</span><strong>' + escapeHtml(email) + '</strong></div>' +
                '<div><span>Telepon</span><strong>' + escapeHtml(phone) + '</strong></div>' +
                '<div><span>Tanggal Lahir</span><strong>' + escapeHtml(formatDateLong(birthDate)) + '</strong></div>' +
            '</div>' +
            '<div class="shell-modal-actions">' +
                '<button type="button" class="shell-modal-link" data-shell-action="close-modal"><i class="fa-solid fa-check"></i>Tutup</button>' +
                '<button type="button" class="shell-modal-link danger" data-shell-action="logout"><i class="fa-solid fa-arrow-right-from-bracket"></i>Keluar</button>' +
            '</div>';
        }

        async function fetchProfileForModal() {
            if (isGuestMode()) return Object.assign({}, GUEST_DEMO_PROFILE);
            try {
                const response = await fetch('/api/patients/profile?_t=' + Date.now(), { headers: { 'Authorization': 'Bearer ' + getToken(), 'Cache-Control': 'no-cache' } });
                if (response.status === 401) throw new Error('unauthorized');
                if (!response.ok) return currentProfile || getStoredProfile();
                const data = await response.json().catch(() => ({}));
                currentProfile = data.user || currentProfile || getStoredProfile();
                setPatientUser(currentProfile);
                return currentProfile;
            } catch (error) {
                if (error.message === 'unauthorized') throw error;
                return currentProfile || getStoredProfile();
            }
        }

        async function openProfileModal(event) {
            stopTopbarEvent(event);
            if (!requireRealPatient('Profil berisi data pasien pribadi. Masuk dengan akun pasien untuk melihatnya.', event)) return;
            openTopbarModal('Profil', 'Akun pasien', renderProfileModal(currentProfile || getStoredProfile()));
            try {
                const profile = await fetchProfileForModal();
                openTopbarModal('Profil', 'Akun pasien', renderProfileModal(profile));
            } catch (error) {
                if (error.message === 'unauthorized') logout();
            }
        }

        function handleSheetNavigation(event, url) {
            stopTopbarEvent(event);
            go(url);
            return false;
        }

        function showToast(message) {
            const toast = document.getElementById('toast');
            toast.textContent = message;
            toast.classList.add('show');
            clearTimeout(toast._timer);
            toast._timer = setTimeout(() => toast.classList.remove('show'), 2200);
        }

        function hasActiveHomeSurface() {
            return !!document.querySelector('.bottom-sheet.active, .modal-card.active:not(#exit-app-modal)');
        }

        function rearmHomeBackGuard() {
            if (homeBackExitConfirmed || !homeBackGuardInstalled || !isPatientHomeRoute()) return;
            try {
                history.pushState({ patientHomeBackGuard: true }, '', window.location.href);
            } catch (error) {}
        }

        function showExitAppModal() {
            closeSheet();
            const overlay = document.getElementById('modal-overlay');
            const modal = document.getElementById('exit-app-modal');
            if (!overlay || !modal) return;
            overlay.classList.add('active');
            modal.classList.add('active');
            document.body.style.overflow = 'hidden';
        }

        function cancelExitApp(event) {
            stopTopbarEvent(event);
            closeAllModals();
        }

        function isAndroidWebView() {
            return /;\s*wv\)|\bwv\b|Version\/\d+(?:\.\d+)?\s+Chrome\/\d+.*Mobile Safari/i.test(navigator.userAgent || '');
        }

        function requestPwaClose() {
            // Android Chrome PWA does not expose a reliable JS API to close
            // a home-screen-launched app window, but this succeeds in some
            // browser contexts. Fallback is handled by confirmExitApp().
            try { window.open('', '_self').close(); } catch (error) {}
            try { window.close(); } catch (error) {}
            return false;
        }

        function confirmExitApp(event) {
            stopTopbarEvent(event);
            homeBackExitConfirmed = true;
            const overlay = document.getElementById('modal-overlay');
            const modal = document.getElementById('exit-app-modal');
            if (overlay) overlay.classList.remove('active');
            if (modal) modal.classList.remove('active');
            document.body.style.overflow = '';

            const pwaClosed = requestPwaClose();
            if (!pwaClosed) {
                // If Chrome blocks window.close(), show a terminal closed state.
                // Do not redirect to login because an authenticated patient can
                // be auto-forwarded back to home.
                window.setTimeout(function() {
                    if (document.visibilityState !== 'hidden') {
                        window.location.replace('/app-closed.html');
                    }
                }, 350);
            }
        }

        function installHomeBackExitGuard() {
            if (homeBackGuardInstalled || !isPatientHomeRoute() || !history.pushState) return;
            homeBackGuardInstalled = true;
            try {
                history.replaceState(Object.assign({}, history.state || {}, { patientHomeRoot: true }), '', window.location.href);
                history.pushState({ patientHomeBackGuard: true }, '', window.location.href);
            } catch (error) {}

            window.addEventListener('popstate', function() {
                if (homeBackExitConfirmed || !isPatientHomeRoute()) return;
                if (hasActiveHomeSurface()) {
                    closeSheet();
                    closeAllModals();
                    rearmHomeBackGuard();
                    return;
                }
                showExitAppModal();
            });
        }

        function getTapSoundPreference() {
            return localStorage.getItem(TAP_SOUND_KEY) !== '0';
        }

        function isTapSoundEnabled() {
            return getTapSoundPreference();
        }

        function updateSoundUI() {
            const enabled = getTapSoundPreference();
            const label = document.getElementById('sound-toggle-label');
            const toggle = document.getElementById('sound-toggle');
            const sw = document.getElementById('corner-sound-switch');
            if (label) label.textContent = enabled ? 'Sound On' : 'Sound Off';
            if (toggle) {
                toggle.setAttribute('aria-pressed', enabled ? 'true' : 'false');
                toggle.querySelector('i').className = enabled ? 'fa-solid fa-volume-low' : 'fa-solid fa-volume-xmark';
            }
            if (sw) sw.classList.toggle('on', enabled);
        }

        function playTapSound() {
            if (!isTapSoundEnabled()) return;
            try {
                const AudioCtx = window.AudioContext || window.webkitAudioContext;
                if (!AudioCtx) return;
                if (!audioContext) audioContext = new AudioCtx();
                if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
                const now = audioContext.currentTime;
                const osc = audioContext.createOscillator();
                const gain = audioContext.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(720, now);
                osc.frequency.exponentialRampToValueAtTime(420, now + 0.055);
                gain.gain.setValueAtTime(0.0001, now);
                gain.gain.exponentialRampToValueAtTime(0.045, now + 0.006);
                gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.065);
                osc.connect(gain);
                gain.connect(audioContext.destination);
                osc.start(now);
                osc.stop(now + 0.07);
            } catch (error) {}
        }

        function toggleTapSound() {
            const currently = getTapSoundPreference();
            localStorage.setItem(TAP_SOUND_KEY, currently ? '0' : '1');
            updateSoundUI();
            if (!currently) {
                setTimeout(playTapSound, 20);
                showToast('Suara tombol aktif');
            } else {
                showToast('Suara tombol dimatikan');
            }
        }

        document.addEventListener('click', function(event) {
            const soundTarget = event.target.closest('.soundable');
            if (soundTarget && !soundTarget.closest('#sound-toggle')) playTapSound();
        }, true);

        function applyMyCorner() {
            const fallback = currentProfile && currentProfile.fullname ? 'Ruang ' + currentProfile.fullname.split(' ')[0] : 'Ruang Saya';
            const name = localStorage.getItem(CORNER_NAME_KEY) || fallback;
            const note = localStorage.getItem(CORNER_NOTE_KEY) || 'Simpan catatan kecil, atur preferensi, dan pin hal yang sering Anda buka.';
            const cornerName = document.getElementById('corner-name');
            const cornerCardTitle = document.getElementById('corner-card-title');
            const cornerDesc = document.getElementById('corner-desc');
            const cornerAction = document.getElementById('my-corner-action-btn');
            const isAllowed = isMyCornerAllowedProfile(currentProfile || getStoredProfile());
            if (cornerName) cornerName.textContent = name;
            if (cornerCardTitle) cornerCardTitle.textContent = name.length > 14 ? 'Ruang' : name;
            if (cornerDesc) cornerDesc.textContent = isAllowed ? note : 'Coming Soon';
            if (cornerAction && !isAllowed) cornerAction.innerHTML = '<i class="fa-solid fa-clock"></i> Coming Soon';
            if (cornerAction && isAllowed) cornerAction.innerHTML = '<i class="fa-solid fa-pen"></i> Atur';
        }

        function openMyCorner() {
            if (!requireRealPatient('Ruang personal tersimpan untuk akun pasien. Masuk untuk membuka dan mengaturnya.')) return;
            if (!isMyCornerAllowedProfile(currentProfile || getStoredProfile())) {
                trackMyCornerComingSoon();
                showMyCornerComingSoon();
                return;
            }
            if (window.PatientMyCorner && typeof window.PatientMyCorner.open === 'function') {
                return window.PatientMyCorner.open();
            }
            showToast('Ruang sedang dimuat');
        }

        function saveMyCorner() {
            if (window.PatientMyCorner && typeof window.PatientMyCorner.save === 'function') {
                return window.PatientMyCorner.save();
            }
            showToast('Ruang sedang dimuat');
        }

        function openModal(id) {
            closeSheet();
            document.getElementById('modal-overlay').classList.add('active');
            document.getElementById(id).classList.add('active');
            document.body.style.overflow = 'hidden';
        }

        function closeAllModals() {
            const exitModal = document.getElementById('exit-app-modal');
            const exitWasActive = exitModal && exitModal.classList.contains('active');
            document.getElementById('modal-overlay').classList.remove('active');
            document.querySelectorAll('.modal-card').forEach(modal => modal.classList.remove('active'));
            document.body.style.overflow = '';
            if (exitWasActive) rearmHomeBackGuard();
        }

        const modalActionHandlers = {
            'close-sheet': function() {
                closeSheet();
            },
            'close-all-modals': function() {
                closeAllModals();
            },
            'close-topbar-modal': function(target, event) {
                closeTopbarModal(event);
            },
            'close-modal': function() {
                closeAllModals();
            },
            'logout': function() {
                closeAllModals();
                logout();
            },
            'guest-login': function(target, event) {
                endGuestAndLogin(event);
            },
            'mark-all-notifications': function(target, event) {
                markAllTopbarNotificationsRead(event);
            },
            'mark-notification-read': function(target) {
                markTopbarNotificationRead(target.dataset.notificationId);
            },
            'open-settings-notifications': function(target, event) {
                openSettingsNotifications(event);
            },
            'test-portal-sound': function(target, event) {
                playPortalNotificationSound(event);
            },
            'save-portal-settings': function(target, event) {
                savePortalSettings(event);
            },
            'profile-photo-picker': function(target, event) {
                openProfilePhotoPicker(event, target.dataset.photoMode || 'gallery');
            },
            'reset-profile-photo-draft': function(target, event) {
                resetProfilePhotoDraft(event);
            },
            'save-profile-photo-draft': function(target, event) {
                saveProfilePhotoDraft(event);
            },
            'close-bug-report-modal': function(target, event) {
                closeBugReportModal(event);
            },
            'submit-bug-report': function(target, event) {
                submitBugReport(event);
            },
            'cancel-exit-app': function(target, event) {
                cancelExitApp(event);
            },
            'confirm-exit-app': function(target, event) {
                confirmExitApp(event);
            },
            'dismiss-patient-install-prompt': function() {
                dismissPatientInstallPrompt();
            },
            'install-patient-pwa': function() {
                installPatientPWA();
            },
            'open-birth-data-modal': function(target, event) {
                openBirthDataModal(event, target.dataset.birthId);
            },
            'toggle-birth-congrats': function(target, event) {
                toggleBirthCongratsFromSettings(target.dataset.birthId, target.dataset.birthDismissed === 'true', event);
            },
            'birth-photo-picker': function(target, event) {
                openBirthPhotoPicker(event, target.dataset.birthId);
            },
            'open-birth-extra-modal': function(target, event) {
                openBirthExtraModal(event, target.dataset.birthId);
            },
            'open-birth-testimonial-modal': function(target, event) {
                openBirthTestimonialModal(event, target.dataset.birthId);
            },
            'close-cancel-booking-modal': function(target, event) {
                closeCancelBookingModal(event);
            }
        };

        function openBugReportModal(event) {
            stopTopbarEvent(event);
            if (!requireRealPatient('Laporan bug memakai konteks akun pasien agar tim bisa menindaklanjuti dengan tepat.', event)) return;
            const textarea = document.getElementById('bug-report-message');
            if (textarea) textarea.value = '';
            updateBugReportCount();
            setBugReportSubmitting(false);
            openModal('bug-report-modal');
            setTimeout(function() {
                if (textarea) textarea.focus();
            }, 120);
        }

        function closeBugReportModal(event) {
            stopTopbarEvent(event);
            closeAllModals();
        }

        function updateBugReportCount() {
            const textarea = document.getElementById('bug-report-message');
            const counter = document.getElementById('bug-report-count');
            if (!textarea || !counter) return;
            counter.textContent = String(textarea.value.length);
        }

        function setBugReportSubmitting(isSubmitting) {
            const textarea = document.getElementById('bug-report-message');
            const button = document.getElementById('bug-report-submit-btn');
            if (textarea) textarea.disabled = isSubmitting;
            if (button) {
                button.disabled = isSubmitting;
                button.innerHTML = isSubmitting
                    ? '<i class="fa-solid fa-spinner fa-spin"></i> Mengirim...'
                    : '<i class="fa-solid fa-paper-plane"></i> Kirim';
            }
        }

        function buildBugReportMessage(message) {
            const profile = currentProfile || getStoredProfile();
            const context = [
                '',
                '--- Konteks otomatis ---',
                'Halaman: ' + window.location.href,
                'Viewport: ' + (window.innerWidth || 0) + 'x' + (window.innerHeight || 0),
                'Pasien: ' + (profile.fullname || profile.full_name || profile.name || '-'),
                'Patient ID: ' + (profile.id || profile.patient_id || profile.medicalRecordId || '-'),
                'User agent: ' + (navigator.userAgent || '-')
            ].join('\n');
            const combined = message + context;
            if (combined.length <= BUG_REPORT_API_MAX_LENGTH) return combined;
            return combined.slice(0, BUG_REPORT_API_MAX_LENGTH - 14) + '\n[terpotong]';
        }

        async function submitBugReport(event) {
            stopTopbarEvent(event);
            if (!requireRealPatient('Mode demo tidak dapat mengirim laporan bug.', event)) return;
            const textarea = document.getElementById('bug-report-message');
            const message = (textarea && textarea.value ? textarea.value : '').trim();
            if (!message) {
                showToast('Tuliskan detail bug/error terlebih dahulu');
                if (textarea) textarea.focus();
                return;
            }
            if (message.length > BUG_REPORT_MAX_LENGTH) {
                showToast('Laporan maksimal ' + BUG_REPORT_MAX_LENGTH + ' karakter');
                return;
            }
            const token = getToken();
            if (!token) {
                showToast('Silakan login ulang untuk mengirim laporan');
                setTimeout(function() { window.location.href = '/patient-login.html'; }, 1000);
                return;
            }

            setBugReportSubmitting(true);
            try {
                const response = await fetch('/api/patient-feedback', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + token,
                        'Cache-Control': 'no-cache'
                    },
                    body: JSON.stringify({
                        category: 'bug',
                        message: buildBugReportMessage(message),
                        rating: null,
                        is_anonymous: false
                    })
                });
                const data = await response.json().catch(function() { return {}; });
                if (!response.ok || !data.success) throw new Error(data.message || 'Gagal mengirim laporan');
                if (textarea) textarea.value = '';
                updateBugReportCount();
                closeAllModals();
                showToast(data.message || 'Laporan bug/error berhasil dikirim');
            } catch (error) {
                showToast(error.message || 'Koneksi bermasalah, coba lagi');
            } finally {
                setBugReportSubmitting(false);
            }
        }

        function todayLabel() {
            const todayValue = document.getElementById('today-value');
            if (todayValue) {
                todayValue.textContent = new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' });
            }
            const hour = new Date().getHours();
            const greeting = hour >= 5 && hour < 11 ? 'Selamat Pagi' : hour >= 11 && hour < 15 ? 'Selamat Siang' : hour >= 15 && hour < 18 ? 'Selamat Sore' : 'Selamat Malam';
            document.getElementById('time-greeting').textContent = greeting;
        }

        async function loadProfile() {
            const token = getToken();
            const response = await fetch('/api/patients/profile?_t=' + Date.now(), { headers: { 'Authorization': 'Bearer ' + token, 'Cache-Control': 'no-cache' } });
            if (response.status === 401) throw new Error('unauthorized');
            if (!response.ok) throw new Error('profile failed');
            const data = await response.json();
            currentProfile = data.user || {};
            setPatientUser(currentProfile);
            
            window.currentProfile = currentProfile;

            // GATE: intake form wajib diisi sebelum bisa akses portal
            if (!isIntakeCompleted(currentProfile)) {
                window.location.replace('/patient-intake.html?required=1');
                return;
            }

            // Set server home photo URL (takes priority over localStorage)
            _homePhotoServerUrl = currentProfile.home_photo_url || '';

            // If no server photo yet but localStorage has one, migrate silently
            if (!_homePhotoServerUrl) {
                migrateHomePhotoToR2(token);
            }

            const firstName = getPortalDisplayName(currentProfile);
            document.getElementById('hero-title').textContent = firstName + ', ini ruang Anda.';
            document.getElementById('hero-copy').innerHTML = 'Kesehatan Anda tersimpan dengan rapi dan aman di <span class="hero-copy-strong">portal wanita sehat</span> ini.';
            updateProfileAvatar(currentProfile);
            updateHomeHeroPhoto();
            applyMyCorner();
            checkVipSubscription();
        }

        async function checkVipSubscription() {
            try {
                const response = await fetch('/api/patient-questions/can-ask', { headers: { 'Authorization': 'Bearer ' + getToken(), 'Cache-Control': 'no-cache' } });
                if (!response.ok) return;
                const data = await response.json();
                if (data.success && data.tier === 'vip') document.getElementById('vip-badge').classList.add('show');
            } catch (error) {}
        }

        async function loadNotificationCount() {
            try {
                const response = await fetch('/api/patient-notifications/count?_t=' + Date.now(), { headers: { 'Authorization': 'Bearer ' + getToken(), 'Cache-Control': 'no-cache' } });
                const data = await response.json();
                const badge = document.getElementById('notif-badge');
                if (data.success && data.count > 0) {
                    badge.textContent = data.count > 99 ? '99+' : data.count;
                    badge.style.display = 'flex';
                } else badge.style.display = 'none';
            } catch (error) {}
        }

        function cleanPreviewText(value, fallback) {
            return String(value || fallback || '').replace(/\s+/g, ' ').trim();
        }

        function truncatePreviewText(value, maxLength) {
            const text = cleanPreviewText(value, '');
            if (text.length <= maxLength) return text;
            return text.slice(0, maxLength).replace(/\s+\S*$/, '') + '...';
        }

        function formatInfoTime(value) {
            const date = new Date(value || '');
            if (Number.isNaN(date.getTime())) return 'Baru';
            const diffMs = Date.now() - date.getTime();
            const diffMinutes = Math.floor(diffMs / 60000);
            const diffHours = Math.floor(diffMs / 3600000);
            const diffDays = Math.floor(diffMs / 86400000);
            if (diffMinutes < 1) return 'Baru saja';
            if (diffMinutes < 60) return diffMinutes + ' menit lalu';
            if (diffHours < 24) return diffHours + ' jam lalu';
            if (diffDays < 7) return diffDays + ' hari lalu';
            return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
        }

        function getInfoTone(item) {
            const source = String(item?.source || item?.type || '').toLowerCase();
            const color = String(item?.icon_color || '').toLowerCase();
            const title = String(item?.title || '').toLowerCase();
            if (color.includes('danger') || title.includes('urgent') || title.includes('mendesak')) return 'urgent';
            if (color.includes('warning') || title.includes('penting')) return 'important';
            if (source === 'notification' && item?.is_read === 0) return 'important';
            return 'normal';
        }

        function normalizeInfoLink(link) {
            const value = String(link || '').trim();
            if (!value) return '';
            if (value.startsWith('/')) return value;
            if (/^https?:\/\//i.test(value)) return value;
            return '';
        }

        async function getAnnouncementFullMessage(item) {
            if (!item || !item.id) {
                return String(item?.message || '').trim();
            }

            const cacheKey = String(item.id);
            if (homeAnnouncementDetailsById[cacheKey]) {
                return homeAnnouncementDetailsById[cacheKey];
            }

            try {
                const response = await fetch('/api/announcements/active?_t=' + Date.now(), {
                    headers: { 'Cache-Control': 'no-cache' },
                    cache: 'no-store'
                });
                const result = await response.json().catch(function() { return {}; });
                const list = result.success && Array.isArray(result.data) ? result.data : [];
                const found = list.find(function(entry) {
                    return String(entry.id) === cacheKey;
                });
                const fullMessage = String(found?.message || item.message || '').trim();
                homeAnnouncementDetailsById[cacheKey] = fullMessage;
                return fullMessage;
            } catch (error) {
                return String(item.message || '').trim();
            }
        }

        async function openHomeInfoDetail(index, event) {
            stopTopbarEvent(event);
            const item = homeInfoItems[index];
            if (!item) return;

            let detailMessage = String(item.message || '').trim();
            if (String(item.source || '').toLowerCase() === 'announcement') {
                detailMessage = await getAnnouncementFullMessage(item);
            }

            if (String(item.source || '').toLowerCase() === 'notification' && item.id) {
                try {
                    await fetch('/api/patient-notifications/' + encodeURIComponent(item.id) + '/read', {
                        method: 'POST',
                        headers: { 'Authorization': 'Bearer ' + getToken() }
                    });
                } catch (error) {}
            }

            const title = cleanPreviewText(item.title, 'Info Terbaru');
            const sourceLabel = String(item.source || '').toLowerCase() === 'announcement' ? 'Pengumuman Klinik' : 'Notifikasi Pasien';
            const meta = sourceLabel + ' • ' + formatInfoTime(item.created_at);
            const safeMessage = escapeHtml(detailMessage || 'Detail belum tersedia.').replace(/\n/g, '<br>');
            const safeLink = normalizeInfoLink(item.link);
            const linkHtml = safeLink
                ? '<div class="shell-modal-actions" style="margin-top:10px;"><a class="shell-modal-link" href="' + escapeHtml(safeLink) + '"><i class="fa-solid fa-arrow-up-right-from-square"></i>Buka Halaman</a></div>'
                : '';

            const bodyHtml =
                '<div class="settings-panel">' +
                    '<div class="section-kicker" style="margin-bottom:6px;">' + escapeHtml(meta) + '</div>' +
                    '<div class="announcement-mini-title" style="font-size:15px;line-height:1.35;margin-bottom:8px;">' + escapeHtml(title) + '</div>' +
                    '<div class="announcement-mini-copy" style="-webkit-line-clamp:unset;display:block;font-size:12px;line-height:1.58;color:var(--ink);">' + safeMessage + '</div>' +
                    linkHtml +
                '</div>';

            openTopbarModal('Info Terbaru', sourceLabel, bodyHtml);
            loadNotificationCount();
        }

        function renderHomeAnnouncements(items, unreadCount) {
            const preview = document.getElementById('announcement-preview');
            const list = document.getElementById('announcement-list');
            const pill = document.getElementById('announcement-count-pill');
            const action = document.getElementById('announcement-action');
            if (!preview || !list || !pill || !action) return;

            const safeItems = Array.isArray(items) ? items.filter(Boolean).slice(0, 2) : [];
            homeInfoItems = safeItems;
            const count = Number(unreadCount || 0);
            if (count > 0) {
                pill.textContent = count > 99 ? '99+' : String(count);
                pill.style.display = 'inline-flex';
            } else {
                pill.style.display = 'none';
            }

            if (safeItems.length === 0) {
                preview.textContent = 'Belum ada kabar baru. Semua informasi klinik akan muncul di sini saat tersedia.';
                list.innerHTML = '<div class="announcement-mini"><span class="announcement-dot"></span><div><div class="announcement-mini-title">Semua tenang hari ini</div><div class="announcement-mini-copy">Tidak ada pengumuman aktif atau notifikasi baru untuk saat ini.</div></div></div>';
                action.innerHTML = '<i class="fa-solid fa-newspaper"></i> Buka Info Terbaru';
                return;
            }

            preview.textContent = 'Update dari SisiWanita';
            list.innerHTML = safeItems.map(function(item, index) {
                const tone = getInfoTone(item);
                const title = cleanPreviewText(item.title, item.source === 'announcement' ? 'Pengumuman Klinik' : 'Notifikasi');
                const message = truncatePreviewText(item.message, 104);
                const meta = item.source === 'announcement' ? 'Pengumuman' : 'Notifikasi';
                return '<button type="button" class="announcement-mini announcement-mini-btn soundable is-' + tone + '" data-shell-action="open-home-info-detail" data-home-info-index="' + index + '">' +
                    '<span class="announcement-dot"></span>' +
                    '<div>' +
                        '<div class="announcement-mini-title">' + escapeHtml(title) + '</div>' +
                        '<div class="announcement-mini-copy">' + escapeHtml(message || 'Buka notifikasi untuk melihat detail.') + '</div>' +
                        '<div class="announcement-mini-meta">' + escapeHtml(meta) + ' - ' + escapeHtml(formatInfoTime(item.created_at)) + '</div>' +
                    '</div>' +
                '</button>';
            }).join('');
            action.innerHTML = '<i class="fa-solid fa-newspaper"></i> Lihat Semua Info';
        }

        async function loadHomeAnnouncements() {
            const preview = document.getElementById('announcement-preview');
            const list = document.getElementById('announcement-list');
            if (preview) preview.textContent = 'Memuat kabar klinik...';
            if (list) list.innerHTML = '';
            try {
                const response = await fetch('/api/patient-notifications/with-announcements?limit=3&_t=' + Date.now(), {
                    headers: { 'Authorization': 'Bearer ' + getToken(), 'Cache-Control': 'no-cache' },
                    cache: 'no-store'
                });
                if (response.status === 401) throw new Error('unauthorized');
                const data = await response.json().catch(() => ({}));
                if (!response.ok || !data.success) throw new Error(data.message || 'info failed');
                renderHomeAnnouncements(data.items, data.unread_count);
            } catch (error) {
                if (error.message === 'unauthorized') { logout(); return; }
                renderHomeAnnouncements([], 0);
            }
        }

        async function loadUnreadDocCounts() {
            try {
                const response = await fetch('/api/patient-documents/unread-counts?_t=' + Date.now(), { headers: { 'Authorization': 'Bearer ' + getToken(), 'Cache-Control': 'no-cache' } });
                const data = await response.json();
                const total = data.success && data.counts ? Number(data.counts.total || 0) : 0;
                const badge = document.getElementById('doc-nav-badge');
                if (total > 0) {
                    badge.textContent = total > 99 ? '99+' : total;
                    badge.style.display = 'grid';
                } else badge.style.display = 'none';
            } catch (error) {}
        }

        async function checkActiveBooking() {
            const panel = document.getElementById('quick-status');
            const cancelButton = document.getElementById('booking-cancel-btn');
            panel.classList.remove('show', 'warning');
            cancelButton.style.display = 'none';
            cancelButton.dataset.appointmentId = '';
            try {
                const response = await fetch('/api/sunday-appointments/my-bookings?status=confirmed,pending,pending_confirmation&_t=' + Date.now(), { headers: { 'Authorization': 'Bearer ' + getToken(), 'Cache-Control': 'no-cache' } });
                if (response.status === 401) throw new Error('unauthorized');
                const data = await response.json();
                if (!data.success || !data.bookings || data.bookings.length === 0) return;
                const booking = data.bookings[0];
                const dateParts = String(booking.appointment_date || '').slice(0, 10).split('-');
                const date = dateParts.length === 3 ? new Date(Number(dateParts[0]), Number(dateParts[1]) - 1, Number(dateParts[2])) : new Date(booking.appointment_date);
                const dateStr = date.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' });
                document.getElementById('booking-status-title').textContent = booking.status === 'confirmed' ? 'Booking Dikonfirmasi' : 'Menunggu Konfirmasi';
                document.getElementById('booking-status-desc').textContent = dateStr + ' - ' + (booking.slot_time || '-');
                panel.classList.add('show');
                requestAnimationFrame(updateHomeActionGap);
                if (booking.status === 'pending' || booking.status === 'pending_confirmation') panel.classList.add('warning');
                if (['confirmed', 'pending', 'pending_confirmation'].includes(booking.status)) {
                    cancelButton.dataset.appointmentId = String(booking.id);
                    cancelButton.style.display = 'inline-flex';
                }
            } catch (error) {
                if (error.message === 'unauthorized') logout();
            }
        }

        function getQueueStatusLabel(status) {
            const labels = {
                menunggu: 'Menunggu',
                anamnesa: 'Hadir',
                diperiksa: 'Diperiksa',
                selesai_periksa: 'Selesai',
                lunas: 'Lunas'
            };
            return labels[status] || 'Menunggu';
        }

        function renderLiveQueueHome(queueItems) {
            const list = document.getElementById('live-queue-home-list');
            const empty = document.getElementById('live-queue-empty');
            const total = document.getElementById('live-queue-total');
            const current = document.getElementById('live-queue-current');
            if (!list || !empty || !total || !current) return;

            const items = Array.isArray(queueItems) ? queueItems : [];
            total.textContent = String(items.length);
            const active = items.find(item => item.queue_status === 'diperiksa') || items.find(item => item.queue_status === 'anamnesa') || items[0];
            current.textContent = active ? '#' + (active.queue_position || active.slot_number || '-') : '-';

            if (items.length === 0) {
                list.innerHTML = '';
                empty.style.display = 'block';
                return;
            }

            empty.style.display = 'none';
            list.innerHTML = items.slice(0, 4).map(function(item, index) {
                const position = item.queue_position || item.slot_number || (index + 1);
                return '<div class="live-queue-item">' +
                    '<div class="live-queue-number">' + escapeHtml(position) + '</div>' +
                    '<div class="live-queue-name">' + escapeHtml(item.masked_name || 'Pasien') + '</div>' +
                    '<div class="live-queue-time">' + escapeHtml(item.slot_time || getQueueStatusLabel(item.queue_status)) + '</div>' +
                '</div>';
            }).join('');
        }

        async function loadLiveQueueHome() {
            const section = document.getElementById('live-queue-home-section');
            if (!section) return;
            try {
                const token = getToken();
                if (!token) {
                    section.classList.remove('show');
                    requestAnimationFrame(updateHomeActionGap);
                    return;
                }

                const settingsResponse = await fetch('/api/sunday-clinic/queue/settings?_t=' + Date.now(), { headers: { 'Cache-Control': 'no-cache' } });
                const settings = await settingsResponse.json();
                if (!settings.success || !settings.is_queue_visible) {
                    section.classList.remove('show');
                    requestAnimationFrame(updateHomeActionGap);
                    return;
                }

                const queueResponse = await fetch('/api/sunday-clinic/queue/public?_t=' + Date.now(), {
                    headers: {
                        'Authorization': 'Bearer ' + token,
                        'Cache-Control': 'no-cache'
                    }
                });
                const queue = await queueResponse.json();
                if (queueResponse.status === 401 || queueResponse.status === 403 || queue.code === 'QUEUE_ACCESS_DENIED') {
                    section.classList.remove('show');
                    requestAnimationFrame(updateHomeActionGap);
                    return;
                }

                if (queue.success) {
                    document.getElementById('live-queue-doctor-status').textContent = settings.doctor_arrived ? 'dr. Dibya sudah datang' : 'dr. Dibya belum datang';
                    section.classList.add('show');
                    requestAnimationFrame(updateHomeActionGap);
                    renderLiveQueueHome(queue.data);
                }
            } catch (error) {
                section.classList.remove('show');
            }
        }

        function initializeLiveQueueHome() {
            loadLiveQueueHome();
            window.clearInterval(liveQueueHomeTimer);
            liveQueueHomeTimer = window.setInterval(loadLiveQueueHome, 15000);
        }

        async function loadPregnancyTrackerHome() {
            const big = document.getElementById('tracker-big');
            const desc = document.getElementById('tracker-desc');
            if (document.body.classList.contains('has-birth-congrats')) return;
            try {
                const response = await fetch('/api/patients/pregnancy-tracker?_t=' + Date.now(), { headers: { 'Authorization': 'Bearer ' + getToken(), 'Cache-Control': 'no-cache' } });
                const result = await response.json();
                if (!result.success || !result.data) {
                    big.textContent = 'Belum ada';
                    desc.textContent = 'Buka tracker untuk mulai mengisi data kehamilan.';
                    return;
                }
                const data = result.data;
                big.textContent = (data.weeksPregnant || 0) + 'w ' + (data.daysExtra || 0) + 'd';
                desc.textContent = 'HPL ' + (data.eddFormatted || '-') + ' • ' + (typeof data.daysUntilEdd === 'number' ? data.daysUntilEdd + ' hari lagi' : 'pantau berkala');
            } catch (error) {
                big.textContent = '-';
                desc.textContent = 'Tracker belum dapat dimuat saat ini.';
            }
        }

        function hidePregnancyTrackerHome() {
            document.body.classList.add('has-birth-congrats');
        }

        function showPregnancyTrackerHome() {
            document.body.classList.remove('has-birth-congrats');
        }

        function normalizeBirthDateInput(value) {
            const raw = String(value || '').trim();
            const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
            if (match) return match[1];
            if (!raw) return '';
            const date = new Date(raw);
            if (Number.isNaN(date.getTime())) return '';
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return year + '-' + month + '-' + day;
        }

        function formatBirthDateTextInput(value) {
            const normalized = normalizeBirthDateInput(value);
            if (!normalized) return '';
            const parts = normalized.split('-');
            return parts.length === 3 ? parts[2] + '/' + parts[1] + '/' + parts[0] : '';
        }

        function normalizeBirthDateSubmitInput(value) {
            const raw = String(value || '').trim();
            if (!raw) return '';
            const iso = normalizeBirthDateInput(raw);
            if (iso) return iso;
            const digits = raw.replace(/\D/g, '');
            const compactMatch = digits.match(/^(\d{2})(\d{2})(\d{4})$/);
            const slashMatch = raw.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
            const match = compactMatch || slashMatch;
            if (!match) return '';
            const day = String(match[1]).padStart(2, '0');
            const month = String(match[2]).padStart(2, '0');
            const year = String(match[3]);
            const date = new Date(Number(year), Number(month) - 1, Number(day));
            if (date.getFullYear() !== Number(year) || date.getMonth() !== Number(month) - 1 || date.getDate() !== Number(day)) return '';
            return year + '-' + month + '-' + day;
        }

        function getBirthDateParts(value) {
            const normalized = normalizeBirthDateInput(value);
            if (!normalized) return { day: '', month: '', year: '' };
            const parts = normalized.split('-');
            return {
                day: String(Number(parts[2]) || ''),
                month: String(Number(parts[1]) || ''),
                year: parts[0] || ''
            };
        }

        const BIRTH_DATE_MONTHS = [
            'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
            'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
        ];
        const birthDateWheelState = { target: '', day: 1, month: 1, year: new Date().getFullYear(), timers: {} };

        function getBirthDateDaysInMonth(month, year) {
            const safeMonth = Math.max(1, Math.min(12, Number(month) || 1));
            const safeYear = Math.max(1900, Math.min(2100, Number(year) || new Date().getFullYear()));
            return new Date(safeYear, safeMonth, 0).getDate();
        }

        function clampBirthDateWheelState() {
            birthDateWheelState.month = Math.max(1, Math.min(12, Number(birthDateWheelState.month) || 1));
            birthDateWheelState.year = Math.max(1900, Math.min(2100, Number(birthDateWheelState.year) || new Date().getFullYear()));
            birthDateWheelState.day = Math.max(1, Math.min(getBirthDateDaysInMonth(birthDateWheelState.month, birthDateWheelState.year), Number(birthDateWheelState.day) || 1));
        }

        function formatBirthDateWheelDisplay(parts) {
            const day = Number(parts && parts.day);
            const month = Number(parts && parts.month);
            const year = Number(parts && parts.year);
            if (!day || !month || !year) return 'Pilih tanggal lahir';
            return day + ' ' + (BIRTH_DATE_MONTHS[month - 1] || 'Bulan') + ' ' + year;
        }

        function renderBirthDateWheelInput(prefix, value) {
            const parts = getBirthDateParts(value);
            return '<div class="settings-field birth-date-field">' +
                '<label for="' + prefix + '-date-trigger">Tanggal Lahir</label>' +
                '<button id="' + prefix + '-date-trigger" type="button" class="settings-input birth-date-trigger soundable" onclick="openBirthDateWheelPicker(event, \'' + prefix + '\')">' +
                    '<span id="' + prefix + '-date-display">' + escapeHtml(formatBirthDateWheelDisplay(parts)) + '</span>' +
                    '<i class="fa-solid fa-calendar-days"></i>' +
                '</button>' +
                '<input id="' + prefix + '-day" type="hidden" value="' + escapeHtml(parts.day) + '">' +
                '<input id="' + prefix + '-month" type="hidden" value="' + escapeHtml(parts.month) + '">' +
                '<input id="' + prefix + '-year" type="hidden" value="' + escapeHtml(parts.year) + '">' +
            '</div>';
        }

        function renderBirthDateWheelOption(type, value, label) {
            const activeValue = Number(birthDateWheelState[type]);
            const isActive = activeValue === Number(value);
            return '<button type="button" class="birth-date-wheel-option soundable' + (isActive ? ' active' : '') + '" data-wheel-value="' + value + '" onclick="selectBirthDateWheelValue(\'' + type + '\', ' + value + ')">' +
                escapeHtml(label) +
            '</button>';
        }

        function renderBirthDateWheelOptions() {
            clampBirthDateWheelState();
            const dayList = document.getElementById('birth-date-wheel-day');
            const monthList = document.getElementById('birth-date-wheel-month');
            const yearList = document.getElementById('birth-date-wheel-year');
            if (!dayList || !monthList || !yearList) return;
            const maxDay = getBirthDateDaysInMonth(birthDateWheelState.month, birthDateWheelState.year);
            dayList.innerHTML = Array.from({ length: maxDay }, function(_, index) {
                const day = index + 1;
                return renderBirthDateWheelOption('day', day, String(day));
            }).join('');
            monthList.innerHTML = BIRTH_DATE_MONTHS.map(function(name, index) {
                const month = index + 1;
                return renderBirthDateWheelOption('month', month, String(month));
            }).join('');
            yearList.innerHTML = Array.from({ length: 201 }, function(_, index) {
                const year = 1900 + index;
                return renderBirthDateWheelOption('year', year, String(year));
            }).join('');
            [dayList, monthList, yearList].forEach(function(list) {
                if (list.dataset.birthDateWheelBound) return;
                list.dataset.birthDateWheelBound = '1';
                list.addEventListener('scroll', handleBirthDateWheelScroll, { passive: true });
            });
            requestAnimationFrame(function() {
                scrollBirthDateWheelToValue('day', birthDateWheelState.day);
                scrollBirthDateWheelToValue('month', birthDateWheelState.month);
                scrollBirthDateWheelToValue('year', birthDateWheelState.year);
            });
        }

        function scrollBirthDateWheelToValue(type, value) {
            const list = document.getElementById('birth-date-wheel-' + type);
            if (!list) return;
            const option = list.querySelector('[data-wheel-value="' + value + '"]');
            if (!option) return;
            const top = option.offsetTop - ((list.clientHeight - option.offsetHeight) / 2);
            list.scrollTo({ top: Math.max(0, top), behavior: 'auto' });
        }

        function handleBirthDateWheelScroll(event) {
            const list = event.target;
            const type = list && list.dataset ? list.dataset.wheelType : '';
            if (!type) return;
            clearTimeout(birthDateWheelState.timers[type]);
            birthDateWheelState.timers[type] = setTimeout(function() {
                const rect = list.getBoundingClientRect();
                const center = rect.top + (rect.height / 2);
                const options = Array.from(list.querySelectorAll('.birth-date-wheel-option'));
                let closest = null;
                let closestDistance = Infinity;
                options.forEach(function(option) {
                    const optionRect = option.getBoundingClientRect();
                    const optionCenter = optionRect.top + (optionRect.height / 2);
                    const distance = Math.abs(optionCenter - center);
                    if (distance < closestDistance) {
                        closestDistance = distance;
                        closest = option;
                    }
                });
                if (!closest) return;
                const value = Number(closest.dataset.wheelValue || '');
                if (value && Number(birthDateWheelState[type]) !== value) {
                    selectBirthDateWheelValue(type, value);
                } else {
                    scrollBirthDateWheelToValue(type, birthDateWheelState[type]);
                }
            }, 90);
        }

        function openBirthDateWheelPicker(event, prefix) {
            stopTopbarEvent(event);
            const now = new Date();
            birthDateWheelState.target = String(prefix || '').trim();
            birthDateWheelState.day = Number(document.getElementById(birthDateWheelState.target + '-day')?.value || now.getDate());
            birthDateWheelState.month = Number(document.getElementById(birthDateWheelState.target + '-month')?.value || (now.getMonth() + 1));
            birthDateWheelState.year = Number(document.getElementById(birthDateWheelState.target + '-year')?.value || now.getFullYear());
            renderBirthDateWheelOptions();
            const modal = document.getElementById('birth-date-wheel-modal');
            if (modal) {
                modal.classList.add('active');
                modal.setAttribute('aria-hidden', 'false');
            }
            document.body.style.overflow = 'hidden';
        }

        function closeBirthDateWheelPicker(event) {
            stopTopbarEvent(event);
            const modal = document.getElementById('birth-date-wheel-modal');
            if (modal) {
                modal.classList.remove('active');
                modal.setAttribute('aria-hidden', 'true');
            }
            if (!document.querySelector('.modal-card.active, .bottom-sheet.active, .birth-photo-modal.active')) {
                document.body.style.overflow = '';
            }
        }

        function selectBirthDateWheelValue(type, value) {
            if (!['day', 'month', 'year'].includes(type)) return;
            birthDateWheelState[type] = Number(value) || birthDateWheelState[type];
            renderBirthDateWheelOptions();
        }

        function applyBirthDateWheelPicker(event) {
            stopTopbarEvent(event);
            clampBirthDateWheelState();
            const prefix = birthDateWheelState.target;
            if (!prefix) return;
            const dayInput = document.getElementById(prefix + '-day');
            const monthInput = document.getElementById(prefix + '-month');
            const yearInput = document.getElementById(prefix + '-year');
            if (dayInput) dayInput.value = String(birthDateWheelState.day);
            if (monthInput) monthInput.value = String(birthDateWheelState.month);
            if (yearInput) yearInput.value = String(birthDateWheelState.year);
            const display = document.getElementById(prefix + '-date-display');
            if (display) display.textContent = formatBirthDateWheelDisplay(birthDateWheelState);
            closeBirthDateWheelPicker(event);
        }

        function normalizeBirthDatePartsSubmitInput(prefix) {
            const day = Number(document.getElementById(prefix + '-day')?.value || '');
            const month = Number(document.getElementById(prefix + '-month')?.value || '');
            const year = Number(document.getElementById(prefix + '-year')?.value || '');
            if (!day || !month || !year) return '';
            const date = new Date(year, month - 1, day);
            if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return '';
            return String(year).padStart(4, '0') + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0');
        }

        function normalizeBirthTimeInput(value) {
            const raw = String(value || '').trim();
            return raw ? raw.slice(0, 5) : '';
        }

        function normalizeBirthWeightGramsInput(value) {
            const raw = String(value || '').trim().toLowerCase();
            const kgMatch = raw.match(/^(\d+(?:[.,]\d+)?)\s*kg$/);
            if (kgMatch) {
                return String(Math.round(Number(kgMatch[1].replace(',', '.')) * 1000)).slice(0, 4);
            }
            return raw.replace(/\D/g, '').slice(0, 4);
        }

        function getCurrentBirthRecord() {
            if (currentBirthCongratsData && currentBirthCongratsData.id) return currentBirthCongratsData;
            const id = currentBirthCongratsId || document.getElementById('birth-congrats-home')?.dataset.birthId || '';
            return id ? { id } : null;
        }

        function updateBirthCongratsActions(data) {
            const record = data || {};
            const hasId = !!record.id;
            const photoAction = document.getElementById('birth-photo-action');
            const extraAction = document.getElementById('birth-extra-action');
            const testimonialAction = document.getElementById('birth-testimonial-action');
            if (photoAction) {
                photoAction.disabled = !hasId;
                photoAction.innerHTML = '<i class="fa-solid fa-upload"></i> ' + (record.photo_url ? 'Ganti foto bayi' : 'Upload foto bayi');
            }
            if (extraAction) extraAction.disabled = !hasId;
            if (testimonialAction) {
                const submitted = !!String(record.patient_testimonial || '').trim();
                testimonialAction.disabled = !hasId || submitted;
                testimonialAction.innerHTML = submitted
                    ? '<i class="fa-solid fa-check"></i> Testimoni terkirim'
                    : '<i class="fa-regular fa-comment-dots"></i> Kirim testimoni';
            }
        }

        function renderBirthDataModal(record) {
            record = record || {};
            const id = escapeHtml(record.id || '');
            const gender = String(record.gender || '').trim().toLowerCase();
            const option = function(value, label) {
                const selected = gender === value || (value === 'male' && gender === 'laki-laki') || (value === 'female' && gender === 'perempuan');
                return '<option value="' + value + '"' + (selected ? ' selected' : '') + '>' + label + '</option>';
            };
            return '<div class="birth-modal-note"><i class="fa-solid fa-baby"></i> Lengkapi data kelahiran agar kartu ucapan dari dokter tampil di beranda.</div>' +
                '<div class="birth-form-grid" data-birth-id="' + id + '">' +
                    '<div class="settings-field full"><label for="birth-data-baby-name">Nama Bayi</label><input id="birth-data-baby-name" class="settings-input" value="' + escapeHtml(record.baby_name || '') + '" placeholder="Contoh: Baby Ananda"></div>' +
                    '<div class="settings-field"><label for="birth-data-gender">Jenis Kelamin</label><select id="birth-data-gender" class="settings-select">' +
                        '<option value="">Pilih</option>' + option('male', 'Laki-laki') + option('female', 'Perempuan') +
                    '</select></div>' +
                    renderBirthDateWheelInput('birth-data', record.birth_date) +
                    '<div class="settings-field"><label for="birth-data-time">Jam Lahir</label><input id="birth-data-time" type="time" class="settings-input" value="' + escapeHtml(normalizeBirthTimeInput(record.birth_time)) + '"></div>' +
                    '<div class="settings-field"><label for="birth-data-weight">BERAT LAHIR (GRAM)</label><input id="birth-data-weight" class="settings-input" inputmode="numeric" maxlength="4" pattern="\\d{4}" value="' + escapeHtml(normalizeBirthWeightGramsInput(record.birth_weight || '')) + '" placeholder="3400"></div>' +
                    '<div class="settings-field"><label for="birth-data-length">PANJANG BADAN (CM)</label><input id="birth-data-length" class="settings-input" value="' + escapeHtml(record.birth_length || '') + '" placeholder="Contoh: 50"></div>' +
                    '<label class="birth-file-box" for="birth-data-photo"><strong><i class="fa-solid fa-upload"></i> Upload foto bayi</strong><span>Opsional. Bisa diisi sekarang atau nanti dari kartu ucapan.</span><input id="birth-data-photo" type="file" accept="image/*"></label>' +
                '</div>' +
                '<div class="modal-actions">' +
                    '<button type="button" class="ghost-action soundable" data-shell-action="close-topbar-modal">Nanti</button>' +
                    '<button type="button" class="primary-action soundable" onclick="submitBirthData(event, \'' + id + '\')"><i class="fa-solid fa-check"></i> Simpan</button>' +
                '</div>';
        }

        function renderBirthExtraModal(record) {
            record = record || getCurrentBirthRecord() || {};
            const id = escapeHtml(record.id || '');
            return '<div class="birth-modal-note">Silhkan isi data bayi Ibu</div>' +
                '<div class="birth-form-grid" data-birth-id="' + id + '">' +
                    renderBirthDateWheelInput('birth-extra', record.birth_date) +
                    '<div class="settings-field"><label for="birth-extra-time">Jam Lahir</label><input id="birth-extra-time" type="time" class="settings-input" value="' + escapeHtml(normalizeBirthTimeInput(record.birth_time)) + '"></div>' +
                    '<div class="settings-field"><label for="birth-extra-weight">BERAT LAHIR (GRAM)</label><input id="birth-extra-weight" class="settings-input" inputmode="numeric" maxlength="4" pattern="\\d{4}" value="' + escapeHtml(normalizeBirthWeightGramsInput(record.birth_weight || record.weight || '')) + '" placeholder="3400"></div>' +
                    '<div class="settings-field"><label for="birth-extra-length">PANJANG BADAN (CM)</label><input id="birth-extra-length" class="settings-input" value="' + escapeHtml(record.birth_length || record.length || '') + '" placeholder="Contoh: 50"></div>' +
                '</div>' +
                '<div class="modal-actions">' +
                    '<button type="button" class="ghost-action soundable" data-shell-action="close-topbar-modal">Batal</button>' +
                    '<button type="button" class="primary-action soundable" onclick="submitBirthExtra(event, \'' + id + '\')"><i class="fa-solid fa-check"></i> Simpan</button>' +
                '</div>';
        }

        function renderBirthTestimonialModal(record) {
            record = record || getCurrentBirthRecord() || {};
            const id = escapeHtml(record.id || '');
            const existing = String(record.patient_testimonial || '').trim();
            if (existing) {
                return '<div class="modal-empty"><i class="fa-solid fa-check"></i><p>Testimoni sudah pernah dikirim.</p></div>';
            }
            return '<div class="birth-modal-note">Kesan dan pesan ini akan muncul di halaman testimoni staff setelah dikirim.</div>' +
                '<div class="settings-field birth-testimonial-field"><label for="birth-testimonial-text">Kesan dan Pesan</label><textarea id="birth-testimonial-text" class="settings-input" maxlength="2000" placeholder="Tuliskan pengalaman persalinan atau pesan untuk dr. Dibya dan tim"></textarea></div>' +
                '<div class="modal-actions">' +
                    '<button type="button" class="ghost-action soundable" data-shell-action="close-topbar-modal">Batal</button>' +
                    '<button type="button" class="primary-action soundable" onclick="submitBirthTestimonial(event, \'' + id + '\')"><i class="fa-solid fa-paper-plane"></i> Kirim testimoni</button>' +
                '</div>';
        }

        async function checkBirthPending(options) {
            options = options || {};
            try {
                const response = await fetch('/api/patient/birth-pending?_t=' + Date.now(), {
                    headers: { 'Authorization': 'Bearer ' + getToken(), 'Cache-Control': 'no-cache' },
                    cache: 'no-store'
                });
                if (response.status === 401) throw new Error('unauthorized');
                const data = await response.json().catch(() => ({}));
                if (!response.ok || !data.success || !data.pending) {
                    currentBirthPending = null;
                    return null;
                }
                currentBirthPending = data.pending;
                hidePregnancyTrackerHome();
                if (!options.silent) {
                    openTopbarModal('Lengkapi Data Kelahiran', 'Ucapan Kelahiran', renderBirthDataModal(currentBirthPending));
                }
                return currentBirthPending;
            } catch (error) {
                if (error.message === 'unauthorized') { logout(); return null; }
                return null;
            }
        }

        function openBirthDataModal(event, birthId) {
            stopTopbarEvent(event);
            const id = String(birthId || currentBirthPending?.id || '').trim();
            const record = birthCongratsSettingsRecords.find(function(item) { return String(item.id || '') === id; }) || currentBirthPending || { id: id };
            openTopbarModal('Lengkapi Data Kelahiran', 'Ucapan Kelahiran', renderBirthDataModal(record));
        }

        function openBirthExtraModal(event) {
            stopTopbarEvent(event);
            const record = getCurrentBirthRecord();
            if (!record || !record.id) {
                showToast('Data kelahiran belum tersedia');
                return;
            }
            openTopbarModal('Edit Detail Kelahiran', 'Ucapan Kelahiran', renderBirthExtraModal(record));
        }

        function openBirthTestimonialModal(event, birthId) {
            stopTopbarEvent(event);
            const id = String(birthId || '').trim();
            const record = birthCongratsSettingsRecords.find(function(item) { return String(item.id || '') === id; }) || getCurrentBirthRecord();
            if (!record || !record.id) {
                showToast('Data kelahiran belum tersedia');
                return;
            }
            openTopbarModal('Kirim Testimoni', 'Ucapan Kelahiran', renderBirthTestimonialModal(record));
        }

        async function submitBirthData(event, birthId) {
            stopTopbarEvent(event);
            const id = String(birthId || currentBirthPending?.id || '').trim();
            if (!id) return;
            const birthDataDateValue = normalizeBirthDatePartsSubmitInput('birth-data');
            if (!birthDataDateValue) {
                showToast('Tanggal lahir wajib diisi dengan tanggal, bulan, dan tahun yang valid');
                return;
            }
            const birthDataWeightDigits = normalizeBirthWeightGramsInput(document.getElementById('birth-data-weight')?.value || '');
            if (!/^\d{4}$/.test(birthDataWeightDigits)) {
                showToast('Berat lahir wajib 4 digit angka dalam gram. Contoh: 3400');
                return;
            }
            const payload = {
                baby_name: document.getElementById('birth-data-baby-name')?.value || '',
                gender: document.getElementById('birth-data-gender')?.value || '',
                birth_date: birthDataDateValue,
                birth_time: document.getElementById('birth-data-time')?.value || '',
                birth_weight: birthDataWeightDigits,
                birth_length: document.getElementById('birth-data-length')?.value || ''
            };
            try {
                const response = await fetch('/api/patient/birth-data/' + encodeURIComponent(id), {
                    method: 'POST',
                    headers: {
                        'Authorization': 'Bearer ' + getToken(),
                        'Content-Type': 'application/json',
                        'Cache-Control': 'no-cache'
                    },
                    cache: 'no-store',
                    body: JSON.stringify(payload)
                });
                if (response.status === 401) throw new Error('unauthorized');
                const data = await response.json().catch(() => ({}));
                if (!response.ok || !data.success) throw new Error(data.message || 'Data kelahiran gagal disimpan');
                const photoInput = document.getElementById('birth-data-photo');
                let photoError = null;
                if (photoInput?.files?.[0]) {
                    try {
                        await uploadBirthPhotoFile(id, photoInput.files[0], { silent: true });
                    } catch (error) {
                        photoError = error;
                    }
                }
                currentBirthPending = null;
                closeTopbarModal(event);
                birthCongratsSettingsLoaded = false;
                await loadBirthCongratsHome();
                showToast(photoError ? 'Data tersimpan, foto bisa diupload ulang' : 'Data kelahiran disimpan');
            } catch (error) {
                if (error.message === 'unauthorized') { logout(); return; }
                showToast(error.message || 'Data kelahiran gagal disimpan');
            }
        }

        async function submitBirthExtra(event, birthId) {
            stopTopbarEvent(event);
            const id = String(birthId || getCurrentBirthRecord()?.id || '').trim();
            if (!id) return;
            const birthDateValue = normalizeBirthDatePartsSubmitInput('birth-extra');
            if (!birthDateValue) {
                showToast('Tanggal lahir wajib diisi dengan tanggal, bulan, dan tahun yang valid');
                return;
            }
            const birthWeightDigits = normalizeBirthWeightGramsInput(document.getElementById('birth-extra-weight')?.value || '');
            if (!/^\d{4}$/.test(birthWeightDigits)) {
                showToast('Berat lahir wajib 4 digit angka dalam gram. Contoh: 3400');
                return;
            }
            try {
                const response = await fetch('/api/patient/birth-extra/' + encodeURIComponent(id), {
                    method: 'POST',
                    headers: {
                        'Authorization': 'Bearer ' + getToken(),
                        'Content-Type': 'application/json',
                        'Cache-Control': 'no-cache'
                    },
                    cache: 'no-store',
                    body: JSON.stringify({
                        birth_date: birthDateValue,
                        birth_time: document.getElementById('birth-extra-time')?.value || '',
                        birth_weight: birthWeightDigits,
                        birth_length: document.getElementById('birth-extra-length')?.value || ''
                    })
                });
                if (response.status === 401) throw new Error('unauthorized');
                const data = await response.json().catch(() => ({}));
                if (!response.ok || !data.success) throw new Error(data.message || 'Detail kelahiran gagal disimpan');
                closeTopbarModal(event);
                await loadBirthCongratsHome();
                showToast('Detail kelahiran disimpan');
            } catch (error) {
                if (error.message === 'unauthorized') { logout(); return; }
                showToast(error.message || 'Detail kelahiran gagal disimpan');
            }
        }

        async function submitBirthTestimonial(event, birthId) {
            stopTopbarEvent(event);
            const id = String(birthId || getCurrentBirthRecord()?.id || '').trim();
            if (!id) {
                showToast('Data kelahiran belum tersedia');
                return;
            }
            const testimonial = String(document.getElementById('birth-testimonial-text')?.value || '').trim();
            if (!testimonial) {
                showToast('Kesan dan pesan wajib diisi');
                return;
            }
            try {
                const response = await fetch('/api/patient/birth-testimonial/' + encodeURIComponent(id), {
                    method: 'POST',
                    headers: {
                        'Authorization': 'Bearer ' + getToken(),
                        'Content-Type': 'application/json',
                        'Cache-Control': 'no-cache'
                    },
                    cache: 'no-store',
                    body: JSON.stringify({ testimonial: testimonial })
                });
                if (response.status === 401) throw new Error('unauthorized');
                const data = await response.json().catch(() => ({}));
                if (!response.ok || !data.success) throw new Error(data.message || 'Testimoni gagal dikirim');
                if (currentBirthCongratsData) currentBirthCongratsData.patient_testimonial = testimonial;
                updateBirthCongratsActions(currentBirthCongratsData || {});
                closeTopbarModal(event);
                showToast('Testimoni berhasil dikirim');
            } catch (error) {
                if (error.message === 'unauthorized') { logout(); return; }
                showToast(error.message || 'Testimoni gagal dikirim');
            }
        }

        function openBirthPhotoPicker(event, birthId) {
            stopTopbarEvent(event);
            const id = String(birthId || getCurrentBirthRecord()?.id || '').trim();
            if (!id) {
                showToast('Data kelahiran belum tersedia');
                return;
            }
            const input = document.getElementById('birth-photo-input');
            if (!input) return;
            input.dataset.birthId = id;
            input.value = '';
            input.click();
        }

        async function handleBirthPhotoUpload(event) {
            const input = event?.target;
            const birthId = String(input?.dataset.birthId || getCurrentBirthRecord()?.id || '').trim();
            const file = input?.files?.[0];
            if (!birthId || !file) return;
            try {
                await uploadBirthPhotoFile(birthId, file);
            } catch (error) {
                if (error.message === 'unauthorized') { logout(); return; }
                showToast(error.message || 'Foto bayi gagal diupload');
            } finally {
                if (input) input.value = '';
            }
        }

        async function uploadBirthPhotoFile(birthId, file, options) {
            options = options || {};
            if (!file.type || !file.type.startsWith('image/')) throw new Error('Pilih file gambar untuk foto bayi');
            if (file.size > 10 * 1024 * 1024) throw new Error('Ukuran foto bayi maksimal 10MB');
            if (!options.silent) showToast('Mengupload foto bayi...');
            const formData = new FormData();
            formData.append('photo', file);
            const response = await fetch('/api/patient/birth-photo/' + encodeURIComponent(birthId), {
                method: 'POST',
                headers: { 'Authorization': 'Bearer ' + getToken(), 'Cache-Control': 'no-cache' },
                cache: 'no-store',
                body: formData
            });
            if (response.status === 401) throw new Error('unauthorized');
            const data = await response.json().catch(() => ({}));
            if (!response.ok || !data.success) throw new Error(data.message || 'Foto bayi gagal diupload');
            if (currentBirthCongratsData && String(currentBirthCongratsData.id || '') === String(birthId)) {
                currentBirthCongratsData.photo_url = data.photo_url || currentBirthCongratsData.photo_url;
                renderBirthCongratsHome(currentBirthCongratsData);
            } else {
                await loadBirthCongratsHome();
            }
            if (!options.silent) showToast('Foto bayi disimpan');
            return data;
        }

        function openBirthPhotoModal(event) {
            stopTopbarEvent(event);
            const photo = document.getElementById('birth-congrats-photo');
            const src = photo?.getAttribute('src') || currentBirthCongratsData?.photo_url || '';
            if (!src) {
                showToast('Foto kelahiran belum tersedia');
                return;
            }
            const modal = document.getElementById('birth-photo-modal');
            const modalImg = document.getElementById('birth-photo-modal-img');
            if (!modal || !modalImg) return;
            modalImg.src = src;
            modalImg.hidden = false;
            modal.classList.add('active');
            modal.setAttribute('aria-hidden', 'false');
            document.body.style.overflow = 'hidden';
        }

        function closeBirthPhotoModal(event) {
            stopTopbarEvent(event);
            const modal = document.getElementById('birth-photo-modal');
            const modalImg = document.getElementById('birth-photo-modal-img');
            if (modal) {
                modal.classList.remove('active');
                modal.setAttribute('aria-hidden', 'true');
            }
            if (modalImg) {
                modalImg.removeAttribute('src');
                modalImg.hidden = true;
            }
            if (!document.querySelector('.modal-card.active, .bottom-sheet.active')) {
                document.body.style.overflow = '';
            }
        }

        function getBirthGenderLabel(value) {
            const normalized = String(value || '').trim().toLowerCase();
            if (normalized === 'male' || normalized === 'laki-laki' || normalized === 'lakilaki') return 'Putra';
            if (normalized === 'female' || normalized === 'perempuan') return 'Putri';
            return 'Buah Hati';
        }

        function getBirthDoctorProfile(value) {
            const fallbackName = 'dr. Dibya Arfianda, SpOG, M.Ked.Klin.';
            const doctorDetail = String(value || fallbackName).trim() || fallbackName;
            const normalizedDoctor = doctorDetail.toLowerCase();
            let doctorSpecialty = '';
            if (normalizedDoctor.includes('spog') || normalizedDoctor.includes('sp.og')) {
                doctorSpecialty = 'Spesialis Kebidanan & Kandungan';
            } else {
                const doctorParts = doctorDetail.split(',').map(function(part) { return part.trim(); }).filter(Boolean);
                if (doctorParts.length > 1) doctorSpecialty = doctorParts.slice(1).join(', ');
            }
            if (!doctorSpecialty) doctorSpecialty = 'Tim pendamping persalinan';
            const doctorTokens = doctorDetail
                .replace(/[^A-Za-z\\s]/g, ' ')
                .split(/\s+/)
                .filter(function(token) {
                    return token && token.length > 1 && token.toLowerCase() !== 'dr';
                });
            const doctorInitials = (doctorTokens.slice(0, 2).map(function(token) {
                return token.charAt(0).toUpperCase();
            }).join('') || 'Dr').slice(0, 2);
            return {
                doctorDetail: doctorDetail,
                doctorSpecialty: doctorSpecialty,
                doctorInitials: doctorInitials
            };
        }

        function hideBirthCongratsHome() {
            const card = document.getElementById('birth-congrats-home');
            if (!card) return;
            currentBirthCongratsId = '';
            currentBirthCongratsData = null;
            card.removeAttribute('data-birth-id');
            card.classList.remove('show');
            updateBirthCongratsActions({});
            showPregnancyTrackerHome();
            requestAnimationFrame(updateHomeActionGap);
        }

        function renderBirthCongratsHome(data) {
            const card = document.getElementById('birth-congrats-home');
            if (!card || !data) return;
            currentBirthCongratsData = data;
            hidePregnancyTrackerHome();

            const babyName = String(data.baby_name || 'Buah Hati Tercinta').trim();
            const doctorProfile = getBirthDoctorProfile(data.doctor_name);
            const childNumber = Number(data.child_number || 1);
            const dateValue = data.birth_date ? formatDateLong(data.birth_date) : '-';
            const dateMetaValue = data.birth_date ? formatDateWeekday(data.birth_date) : '';
            const rawTime = String(data.birth_time || '').trim();
            const timeValue = rawTime ? rawTime.slice(0, 5) : '-';
            const timeMetaValue = rawTime ? 'WIB' : '';
            const weightValue = String(data.birth_weight || data.weight || '-').trim() || '-';
            const lengthValue = String(data.birth_length || data.length || '-').trim() || '-';
            const messageValue = String(data.message || 'Selamat atas kelahiran buah hati Anda!').trim();
            currentBirthCongratsId = String(data.id || '').trim();
            if (currentBirthCongratsId) card.dataset.birthId = currentBirthCongratsId;
            else card.removeAttribute('data-birth-id');

            document.getElementById('birth-congrats-doctor').textContent = 'Dari ' + doctorProfile.doctorDetail;
            document.getElementById('birth-congrats-child-badge').textContent = 'Anak ke-' + (Number.isFinite(childNumber) && childNumber > 0 ? childNumber : 1);
            document.getElementById('birth-congrats-baby-name').textContent = babyName;
            document.getElementById('birth-congrats-subtitle').textContent = '';
            document.getElementById('birth-congrats-date').textContent = dateValue;
            document.getElementById('birth-congrats-date-meta').textContent = dateMetaValue;
            document.getElementById('birth-congrats-time').textContent = timeValue;
            document.getElementById('birth-congrats-time-meta').textContent = timeMetaValue;
            document.getElementById('birth-congrats-weight').textContent = weightValue;
            document.getElementById('birth-congrats-length').textContent = lengthValue;
            document.getElementById('birth-congrats-message').textContent = messageValue;
            document.getElementById('birth-congrats-doctor-initials').textContent = doctorProfile.doctorInitials;
            document.getElementById('birth-congrats-doctor-detail').textContent = doctorProfile.doctorDetail;
            document.getElementById('birth-congrats-doctor-specialty').textContent = doctorProfile.doctorSpecialty;
            const doctorAvatarUrl = String(data.doctor_photo_url || '').trim();
            const doctorAvatarWrap = document.getElementById('birth-congrats-message-avatar');
            const doctorAvatar = document.getElementById('birth-congrats-doctor-avatar-img');
            const doctorAvatarFallback = document.getElementById('birth-congrats-doctor-avatar-fallback');
            if (doctorAvatarWrap && doctorAvatar && doctorAvatarFallback) {
                if (doctorAvatarUrl) {
                    doctorAvatar.src = doctorAvatarUrl;
                    doctorAvatarWrap.classList.add('has-photo');
                } else {
                    doctorAvatar.removeAttribute('src');
                    doctorAvatarWrap.classList.remove('has-photo');
                }
            }

            const photoWrap = document.getElementById('birth-congrats-photo-wrap');
            const photo = document.getElementById('birth-congrats-photo');
            const photoUrl = String(data.photo_url || '').trim();
            if (photoWrap && photo) {
                if (photoUrl) {
                    photo.src = photoUrl;
                    photoWrap.classList.add('has-photo');
                } else {
                    photo.removeAttribute('src');
                    photoWrap.classList.remove('has-photo');
                }
            }

            updateBirthCongratsActions(data);
            card.classList.add('show');
            requestAnimationFrame(updateHomeActionGap);
        }

        async function loadBirthCongratsHome() {
            const card = document.getElementById('birth-congrats-home');
            if (!card) return;
            try {
                const response = await fetch('/api/patient/birth-congratulations?_t=' + Date.now(), {
                    headers: {
                        'Authorization': 'Bearer ' + getToken(),
                        'Cache-Control': 'no-cache'
                    },
                    cache: 'no-store'
                });
                if (response.status === 401) throw new Error('unauthorized');
                const result = await response.json().catch(function() { return {}; });
                if (!response.ok || !result.success || !result.data) {
                    if (currentBirthPending) {
                        currentBirthCongratsId = '';
                        currentBirthCongratsData = null;
                        card.removeAttribute('data-birth-id');
                        card.classList.remove('show');
                        updateBirthCongratsActions({});
                        hidePregnancyTrackerHome();
                        requestAnimationFrame(updateHomeActionGap);
                    } else {
                        hideBirthCongratsHome();
                    }
                    return null;
                }
                renderBirthCongratsHome(result.data);
                return result.data;
            } catch (error) {
                if (error.message === 'unauthorized') { logout(); return; }
                hideBirthCongratsHome();
                return null;
            }
        }

        async function dismissBirthCongratsHome(event) {
            stopTopbarEvent(event);
            const card = document.getElementById('birth-congrats-home');
            const birthId = currentBirthCongratsId || card?.dataset.birthId || '';
            if (!birthId) {
                hideBirthCongratsHome();
                return;
            }
            try {
                await updateBirthCongratsVisibility(birthId, false);
                hideBirthCongratsHome();
                birthCongratsSettingsLoaded = false;
                birthCongratsSettingsRecords = [];
                showToast('Ucapan kelahiran disembunyikan');
            } catch (error) {
                if (error.message === 'unauthorized') { logout(); return; }
                showToast(error.message || 'Ucapan kelahiran gagal disembunyikan');
                loadBirthCongratsHome();
            }
        }

        async function checkAttendanceConfirmation() {
            try {
                const response = await fetch('/api/sunday-appointments/my-pending-confirmation?_t=' + Date.now(), { headers: { 'Authorization': 'Bearer ' + getToken(), 'Cache-Control': 'no-cache' } });
                if (!response.ok) return;
                const data = await response.json();
                if (data.success && data.appointment) showAttendanceConfirmationPopup(data.appointment);
            } catch (error) {}
        }

        function showAttendanceConfirmationPopup(apt) {
            const existing = document.getElementById('attendance-confirm-overlay');
            if (existing) existing.remove();
            const dateParts = String(apt.appointment_date || '').slice(0, 10).split('-');
            const date = dateParts.length === 3 ? new Date(Number(dateParts[0]), Number(dateParts[1]) - 1, Number(dateParts[2])) : new Date(apt.appointment_date);
            const dateStr = date.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
            const overlay = document.createElement('div');
            overlay.id = 'attendance-confirm-overlay';
            overlay.className = 'modal-overlay active';
            overlay.style.zIndex = '90';
            overlay.innerHTML = '<div class="modal-card active" style="pointer-events:auto;">' +
                '<div class="modal-head"><div><div class="section-kicker">Konfirmasi</div><h2>Kehadiran Klinik</h2></div><button class="close-btn soundable" onclick="closeAttendanceConfirmationPopup()"><i class="fa-solid fa-xmark"></i></button></div>' +
                '<p style="color:var(--muted);font-size:12px;line-height:1.55;margin-bottom:12px;">' + dateStr + '<br>' + escapeHtml(apt.session_label || '') + ' • Slot ' + escapeHtml(apt.slot_number || '-') + ' (' + escapeHtml(apt.slot_time || '-') + ')</p>' +
                '<div class="modal-actions"><button class="primary-action soundable" onclick="submitAttendanceConfirmation(' + apt.id + ',\'confirm\')"><i class="fa-solid fa-circle-check"></i> Datang</button><button class="ghost-action soundable" style="color:#b91c1c;" onclick="submitAttendanceConfirmation(' + apt.id + ',\'cancel\')"><i class="fa-solid fa-circle-xmark"></i> Batal</button></div>' +
                '</div>';
            document.body.appendChild(overlay);
            document.body.style.overflow = 'hidden';
        }

        function closeAttendanceConfirmationPopup() {
            const overlay = document.getElementById('attendance-confirm-overlay');
            if (overlay) overlay.remove();
            document.body.style.overflow = '';
        }

        async function submitAttendanceConfirmation(appointmentId, action) {
            try {
                const endpoint = action === 'confirm' ? '/api/sunday-appointments/' + appointmentId + '/confirm-attendance' : '/api/sunday-appointments/' + appointmentId + '/cancel-attendance';
                const response = await fetch(endpoint, { method: 'POST', headers: { 'Authorization': 'Bearer ' + getToken(), 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' } });
                const data = await response.json().catch(() => ({}));
                closeAttendanceConfirmationPopup();
                if (!response.ok || !data.success) throw new Error(data.message || 'Konfirmasi gagal');
                showToast(data.message || 'Konfirmasi berhasil');
                checkActiveBooking();
            } catch (error) { showToast(error.message || 'Konfirmasi gagal'); }
        }

        function cancelActiveBooking(event) {
            if (event) event.preventDefault();
            const id = document.getElementById('booking-cancel-btn').dataset.appointmentId || '';
            if (!id) return;
            cancelBookingState.appointmentId = id;
            document.getElementById('booking-cancel-reason').value = 'Tidak dapat hadir sesuai jadwal';
            document.getElementById('booking-cancel-error').style.display = 'none';
            openModal('cancel-modal');
        }

        function closeCancelBookingModal() { closeAllModals(); cancelBookingState.appointmentId = ''; }

        async function submitCancelBooking() {
            const id = cancelBookingState.appointmentId;
            const reason = document.getElementById('booking-cancel-reason').value.trim();
            const err = document.getElementById('booking-cancel-error');
            if (!id) return;
            if (reason.length < 10) { err.textContent = 'Alasan pembatalan minimal 10 karakter.'; err.style.display = 'block'; return; }
            try {
                const btn = document.getElementById('booking-cancel-submit-btn');
                btn.disabled = true;
                btn.textContent = 'Memproses...';
                const response = await fetch('/api/sunday-appointments/' + id + '/cancel', { method: 'PUT', headers: { 'Authorization': 'Bearer ' + getToken(), 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' }, body: JSON.stringify({ reason }) });
                const data = await response.json().catch(() => ({}));
                if (!response.ok) throw new Error(data.message || 'Gagal membatalkan janji temu');
                closeCancelBookingModal();
                showToast(data.message || 'Janji temu berhasil dibatalkan');
                checkActiveBooking();
            } catch (error) {
                err.textContent = error.message || 'Gagal membatalkan janji temu';
                err.style.display = 'block';
            } finally {
                const btn = document.getElementById('booking-cancel-submit-btn');
                btn.disabled = false;
                btn.textContent = 'Ya, Batalkan';
            }
        }

        const RUANG_BACA_BADGE_KEY = 'patient_ruang_baca_opened_v1';
        const menuData = {
            dokumen: { title: 'Dokumen', items: [
                ['fa-solid fa-image', 'Album USG', '/album-usg.html'],
                ['fa-solid fa-flask', 'Hasil Lab', '/hasil-lab.html'],
                ['fa-solid fa-file-medical', 'Resume Medis', '/dokumen-medis.html']
            ]},
            aplikasi: { title: 'Aplikasi', items: [
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

        function hasOpenedRuangBaca() {
            try { return localStorage.getItem(RUANG_BACA_BADGE_KEY) === '1'; } catch (error) { return false; }
        }

        function updateRuangBacaBadges() {
            const isOpened = hasOpenedRuangBaca();
            document.querySelectorAll('[data-ruang-baca-badge]').forEach(badge => {
                badge.style.display = isOpened ? 'none' : 'grid';
            });
        }

        function markRuangBacaOpened() {
            try { localStorage.setItem(RUANG_BACA_BADGE_KEY, '1'); } catch (error) {}
            updateRuangBacaBadges();
        }

        function openSheet(category) {
            const data = menuData[category];
            if (!data) return;
            if (category === 'edukasi') markRuangBacaOpened();
            document.getElementById('sheet-title').textContent = data.title;
            document.getElementById('sheet-menu').innerHTML = data.items.map(item => '<a class="sheet-item soundable" href="' + item[2] + '" data-shell-action="go" data-shell-href="' + item[2] + '"><i class="' + item[0] + '"></i><span>' + item[1] + '</span>' + (item[3] ? '<em class="feature-new-badge">' + item[3] + '</em>' : '') + '</a>').join('');
            document.getElementById('sheet-overlay').classList.add('active');
            document.getElementById('bottom-sheet').classList.add('active');
        }

        function closeSheet() {
            document.getElementById('sheet-overlay').classList.remove('active');
            document.getElementById('bottom-sheet').classList.remove('active');
        }

        function scrollTopHome() { window.scrollTo({ top: 0, behavior: 'smooth' }); }

        let homeSectionsUnlocked = false;
        let homeTouchStartY = null;
        let homeActionGapFrozen = false;
        let homeActionSettleTimer = null;
        let homeScrollBrakeUntil = 0;
        let homeScrollBrakeTimer = null;
        let homeScrollBrakeTarget = null;
        let homeUnlockTimer = null;
        let homeAutoRevealMode = false;
        const HOME_HERO_ANIMATION_MS = 1620;

        function getHomeViewportHeight() {
            if (window.visualViewport && window.visualViewport.height) return window.visualViewport.height;
            return window.innerHeight || document.documentElement.clientHeight || 720;
        }

        function updateHomeActionGap() {
            const hero = document.querySelector('.hero-card');
            const actionSection = document.getElementById('primary-actions-section');
            if (!hero || !actionSection) return;
            const viewportHeight = getHomeViewportHeight();
            document.documentElement.style.setProperty('--home-viewport-height', Math.ceil(viewportHeight) + 'px');
            if (homeActionGapFrozen || window.scrollY > 4 || document.body.classList.contains('home-actions-revealed')) return;
            const statusPanel = document.getElementById('quick-status');
            const birthClassCard = document.getElementById('birth-class-home-card');
            const anchor = birthClassCard && birthClassCard.classList.contains('show')
                ? birthClassCard
                : (statusPanel && statusPanel.classList.contains('show') ? statusPanel : hero);
            const anchorBottom = anchor.getBoundingClientRect().bottom;
            const targetTop = viewportHeight * 0.78;
            const gap = Math.max(32, Math.min(168, Math.ceil(targetTop - anchorBottom)));
            document.documentElement.style.setProperty('--home-action-gap', gap + 'px');
        }

        function freezeHomeActionGap() {
            if (homeActionGapFrozen) return;
            updateHomeActionGap();
            homeActionGapFrozen = true;
        }

        function settlePrimaryActions() {
            if (!document.body.classList.contains('home-actions-revealed')) return;
            document.body.classList.add('home-actions-settled');
        }

        function getHomeSectionStopY(section) {
            const topbar = document.getElementById('home-topbar');
            const topbarHeight = topbar ? topbar.offsetHeight : 0;
            const sectionTop = section.getBoundingClientRect().top + window.scrollY;
            return Math.max(0, Math.round(sectionTop - topbarHeight - 12));
        }

        function releaseHomeScrollBrake() {
            homeScrollBrakeUntil = 0;
            homeScrollBrakeTarget = null;
            document.body.classList.remove('home-scroll-braking');
        }

        function brakeHomeScrollAt(section, duration) {
            if (!section) return;
            releaseHomeScrollBrake();
        }

        function isHomeScrollBraking() {
            return homeScrollBrakeUntil > Date.now();
        }

        function preventHomeScrollDuringBrake(event) {
            if (!isHomeScrollBraking()) return;
            if (event.target && event.target.closest && event.target.closest('.bottom-sheet.active, .modal-card.active')) return;
        }

        function getNextVisibleHomeSection(section) {
            let nextSection = section ? section.nextElementSibling : null;
            while (nextSection && nextSection.offsetHeight < 24) {
                nextSection = nextSection.nextElementSibling;
            }
            return nextSection;
        }

        function revealLaterSectionsIfReady() {
            if (!document.body.classList.contains('home-actions-revealed') || document.body.classList.contains('home-later-revealed')) return;
            const actionSection = document.getElementById('primary-actions-section');
            if (!actionSection) return;
            const viewportHeight = getHomeViewportHeight();
            const rect = actionSection.getBoundingClientRect();
            if (rect.bottom < viewportHeight * 0.98) {
                document.body.classList.add('home-later-revealed');
                brakeHomeScrollAt(getNextVisibleHomeSection(actionSection), 680);
            }
        }

        function revealPrimaryActionsIfReady() {
            if (!homeSectionsUnlocked || document.body.classList.contains('home-actions-revealed')) return;
            const actionSection = document.getElementById('primary-actions-section');
            if (!actionSection) return;
            const viewportHeight = getHomeViewportHeight();
            const rect = actionSection.getBoundingClientRect();
            const shouldReveal = homeAutoRevealMode || rect.top < viewportHeight * 0.98;
            if (shouldReveal) {
                freezeHomeActionGap();
                document.body.classList.add('home-actions-revealed');
                if (!homeAutoRevealMode) brakeHomeScrollAt(actionSection, 760);
                window.clearTimeout(homeActionSettleTimer);
                homeActionSettleTimer = window.setTimeout(settlePrimaryActions, 980);
                requestAnimationFrame(revealLaterSectionsIfReady);
            }
        }

        function lockHomeSections() {
            homeSectionsUnlocked = false;
            document.body.classList.add('home-sections-locked');
            document.body.classList.remove('home-sections-unlocked');
            document.body.classList.remove('home-actions-revealed');
            document.body.classList.remove('home-actions-settled');
            document.body.classList.remove('home-later-revealed');
            window.clearTimeout(homeActionSettleTimer);
            window.clearTimeout(homeScrollBrakeTimer);
            window.clearTimeout(homeUnlockTimer);
            releaseHomeScrollBrake();
            homeActionGapFrozen = false;
            homeAutoRevealMode = false;
        }

        function unlockHomeSections() {
            if (homeSectionsUnlocked) return;
            homeSectionsUnlocked = true;
            document.body.classList.remove('home-sections-locked');
            document.body.classList.add('home-sections-unlocked');
            requestAnimationFrame(revealPrimaryActionsIfReady);
        }

        function handleHomeScrollReveal() {
            if (window.scrollY > 8) unlockHomeSections();
            revealPrimaryActionsIfReady();
            revealLaterSectionsIfReady();
        }

        function scheduleHomeAutoUnlock() {
            window.clearTimeout(homeUnlockTimer);
            homeUnlockTimer = window.setTimeout(function() {
                homeAutoRevealMode = true;
                unlockHomeSections();
                requestAnimationFrame(function() {
                    revealPrimaryActionsIfReady();
                    homeAutoRevealMode = false;
                });
            }, HOME_HERO_ANIMATION_MS);
        }

        function handleHomeWheelReveal(event) {
            if (event.deltaY > 0) unlockHomeSections();
        }

        function handleHomeTouchStart(event) {
            const touch = event.touches && event.touches[0];
            homeTouchStartY = touch ? touch.clientY : null;
        }

        function handleHomeTouchMove(event) {
            const touch = event.touches && event.touches[0];
            if (!touch || homeTouchStartY === null) return;
            if (homeTouchStartY - touch.clientY > 10) unlockHomeSections();
        }

        function resetScrollToTop() {
            if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
            window.scrollTo(0, 0);
            document.documentElement.scrollTop = 0;
            document.body.scrollTop = 0;
            requestAnimationFrame(function() {
                requestAnimationFrame(function() {
                    window.scrollTo(0, 0);
                });
            });
        }

        function triggerHomeIntroAnimation() {
            document.body.classList.remove('header-animated');
            requestAnimationFrame(function() {
                requestAnimationFrame(function() {
                    document.body.classList.add('header-animated');
                });
            });
        }

        function logout() {
            clearPatientAuth();
            clearGuestMode();
            window.location.href = '/patient-login.html';
        }

        function refreshPatientServiceWorker() {
            if ('serviceWorker' in navigator) {
                const swUrl = window.PATIENT_SERVICE_WORKER_URL || '/sw.js?v=20260731hardening1';
                navigator.serviceWorker.register(swUrl, { scope: '/' })
                    .then(registration => registration.update().catch(() => {}))
                    .catch(() => {});
            }
        }

        function insertGuestDemoBanner() {
            const hero = document.querySelector('.hero-card');
            if (!hero || document.getElementById('guest-demo-banner')) return;
            const banner = document.createElement('section');
            banner.id = 'guest-demo-banner';
            banner.className = 'guest-demo-banner reveal';
            banner.innerHTML = '<i class="fa-solid fa-eye"></i>' +
                '<div><strong>Mode demo aktif</strong><span>Anda bisa melihat tampilan portal. Data medis, booking, chat, dokumen, dan pengaturan hanya aktif setelah login.</span></div>' +
                '<button type="button" data-shell-action="guest-login">Login</button>';
            hero.parentNode.insertBefore(banner, hero);
        }

        function initGuestHome() {
            document.body.classList.add('guest-demo-mode');
            trackGuestActivity('page_view', 'Guest membuka home demo');
            currentProfile = Object.assign({}, GUEST_DEMO_PROFILE);
            window.currentProfile = currentProfile;
            portalSettings = Object.assign({}, portalSettings, { nickname: 'Tamu' });

            const heroTitle = document.getElementById('hero-title');
            const heroCopy = document.getElementById('hero-copy');
            if (heroTitle) heroTitle.textContent = 'Tamu, ini demo portal.';
            if (heroCopy) heroCopy.innerHTML = 'Jelajahi tampilan <span class="hero-copy-strong">portal wanita sehat</span>. Fitur pribadi akan terbuka setelah login pasien.';

            updateProfileAvatar(currentProfile);
            updateHomeHeroPhoto();
            insertGuestDemoBanner();
            applyMyCorner();
            const cornerName = document.getElementById('corner-name');
            const cornerCardTitle = document.getElementById('corner-card-title');
            const cornerDesc = document.getElementById('corner-desc');
            if (cornerName) cornerName.textContent = 'Ruang Demo';
            if (cornerCardTitle) cornerCardTitle.textContent = 'Demo';
            if (cornerDesc) cornerDesc.textContent = 'Preview ruang personal. Masuk untuk menyimpan catatan dan preferensi.';

            const liveQueue = document.getElementById('live-queue-home-section');
            if (liveQueue) liveQueue.style.display = 'none';
            const birthCongrats = document.getElementById('birth-congrats-home');
            if (birthCongrats) {
                birthCongrats.classList.remove('show');
                birthCongrats.style.display = 'none';
            }
            const quickStatus = document.getElementById('quick-status');
            if (quickStatus) quickStatus.classList.remove('show', 'warning');
            const cancelButton = document.getElementById('booking-cancel-btn');
            if (cancelButton) cancelButton.style.display = 'none';
            const notifBadge = document.getElementById('notif-badge');
            const docBadge = document.getElementById('doc-nav-badge');
            if (notifBadge) notifBadge.style.display = 'none';
            if (docBadge) docBadge.style.display = 'none';

            const trackerBig = document.getElementById('tracker-big');
            const trackerDesc = document.getElementById('tracker-desc');
            if (trackerBig) trackerBig.textContent = 'Demo';
            if (trackerDesc) trackerDesc.textContent = 'Buka aplikasi untuk melihat contoh monitoring tanpa data pribadi.';
            renderHomeAnnouncements([{
                source: 'announcement',
                title: 'Selamat datang di demo SISIwanita',
                message: 'Mode ini menampilkan contoh portal. Masuk dengan akun pasien untuk membuka fitur personal.',
                created_at: new Date().toISOString()
            }], 0);

            document.getElementById('loading-state').style.display = 'none';
            document.getElementById('content-wrapper').style.display = 'block';
            document.body.classList.add('home-sections-unlocked', 'home-actions-revealed', 'home-later-revealed', 'home-actions-settled');
            requestAnimationFrame(function() {
                updateHomeActionGap();
                revealPrimaryActionsIfReady();
            });
            triggerHomeIntroAnimation();
            loadBirthClassHomeCard();
        }

        async function init() {
            resetScrollToTop();
            bindProfilePhotoInputs();
            installHomeBackExitGuard();
            lockHomeSections();
            todayLabel();
            updateSoundUI();
            const urlParams = new URLSearchParams(window.location.search);
            if (urlParams.get('guest') === '1') startGuestMode();
            const token = getToken();
            const user = getPatientUser();
            if (!token || !user.id) {
                if (isGuestMode()) {
                    refreshPatientServiceWorker();
                    initGuestHome();
                    return;
                }
                window.location.href = '/patient-login.html';
                return;
            }

            refreshPatientServiceWorker();

            try {
                await loadProfile();
                await loadPortalSettings();
            } catch (error) { if (error.message === 'unauthorized') { logout(); return; } }

            const nicknameReady = await ensurePortalNicknameOnLogin();
            if (!nicknameReady) {
                return;
            }

            document.getElementById('loading-state').style.display = 'none';
            document.getElementById('content-wrapper').style.display = 'block';
            requestAnimationFrame(function() {
                updateHomeActionGap();
                revealPrimaryActionsIfReady();
            });
            triggerHomeIntroAnimation();
            scheduleHomeAutoUnlock();
            loadNotificationCount();
            loadHomeAnnouncements();
            loadUnreadDocCounts();
            initializeLiveQueueHome();
            updateRuangBacaBadges();
            checkActiveBooking();
            loadBirthClassHomeCard();
            checkAttendanceConfirmation();
            const pendingBirth = await checkBirthPending();
            const publishedBirth = await loadBirthCongratsHome();
            if (!pendingBirth && !publishedBirth) loadPregnancyTrackerHome();
            autoShowPatientInstallPrompt();
        }

        const shellActionHandlers = Object.assign({}, modalActionHandlers, {
            'open-settings': function(target, event) {
                openSettingsModal(event);
            },
            'open-profile': function(target, event) {
                openProfileModal(event);
            },
            'go': function(target) {
                go(target.dataset.shellHref || '/patient-menu.html');
            },
            'open-home-photo-modal': function(target, event) {
                openHomePhotoModal(event);
            },
            'home-photo-picker': function(target, event) {
                openHomePhotoPicker(event);
            },
            'open-home-info-detail': function(target, event) {
                openHomeInfoDetail(Number(target.dataset.homeInfoIndex || 0), event);
            },
            'toggle-tap-sound': function() {
                toggleTapSound();
            },
            'dismiss-birth-congrats-home': function(target, event) {
                dismissBirthCongratsHome(event);
            },
            'open-birth-photo-modal': function(target, event) {
                openBirthPhotoModal(event);
            },
            'close-birth-photo-modal': function(target, event) {
                closeBirthPhotoModal(event);
            },
            'close-birth-date-wheel': function(target, event) {
                closeBirthDateWheelPicker(event);
            },
            'open-sheet': function(target) {
                openSheet(target.dataset.shellSheet || '');
            },
            'open-bug-report-modal': function(target, event) {
                openBugReportModal(event);
            },
            'open-my-corner': function() {
                openMyCorner();
            },
            'scroll-top-home': function() {
                scrollTopHome();
            },
            'cancel-active-booking': function(target, event) {
                cancelActiveBooking(event);
            },
            'submit-cancel-booking': function() {
                submitCancelBooking();
            },
            'update-bug-report-count': function() {
                updateBugReportCount();
            },
            'apply-birth-date-wheel': function(target, event) {
                applyBirthDateWheelPicker(event);
            },
            'birth-photo-upload': function(target, event) {
                handleBirthPhotoUpload(event);
            }
        });

        bindPatientNavigation(shellActionHandlers);

        window.openMyCorner = openMyCorner;
        window.saveMyCorner = saveMyCorner;
        window.toggleTapSound = toggleTapSound;
        window.go = go;
        window.handleSheetNavigation = handleSheetNavigation;
        window.endGuestAndLogin = endGuestAndLogin;
        window.openSheet = openSheet;
        window.closeSheet = closeSheet;
        window.closeAllModals = closeAllModals;
        window.closeTopbarModal = closeTopbarModal;
        window.openSettingsModal = openSettingsModal;
        window.openSettingsNotifications = openSettingsNotifications;
        window.dismissBirthCongratsHome = dismissBirthCongratsHome;
        window.toggleBirthCongratsFromSettings = toggleBirthCongratsFromSettings;
        window.openBirthDataModal = openBirthDataModal;
        window.submitBirthData = submitBirthData;
        window.openBirthDateWheelPicker = openBirthDateWheelPicker;
        window.closeBirthDateWheelPicker = closeBirthDateWheelPicker;
        window.selectBirthDateWheelValue = selectBirthDateWheelValue;
        window.applyBirthDateWheelPicker = applyBirthDateWheelPicker;
        window.openBirthExtraModal = openBirthExtraModal;
        window.submitBirthExtra = submitBirthExtra;
        window.openBirthPhotoPicker = openBirthPhotoPicker;
        window.handleBirthPhotoUpload = handleBirthPhotoUpload;
        window.openBirthPhotoModal = openBirthPhotoModal;
        window.closeBirthPhotoModal = closeBirthPhotoModal;
        window.openBirthTestimonialModal = openBirthTestimonialModal;
        window.submitBirthTestimonial = submitBirthTestimonial;
        window.savePortalSettings = savePortalSettings;
        window.playPortalNotificationSound = playPortalNotificationSound;
        window.openNotificationModal = openNotificationModal;
        window.openProfileModal = openProfileModal;
        window.openProfilePhotoPicker = openProfilePhotoPicker;
        window.handleProfilePhotoUpload = handleProfilePhotoUpload;
        window.updateProfilePhotoDraftFromInputs = updateProfilePhotoDraftFromInputs;
        window.markTopbarNotificationRead = markTopbarNotificationRead;
        window.markAllTopbarNotificationsRead = markAllTopbarNotificationsRead;
        window.cancelActiveBooking = cancelActiveBooking;
        window.closeCancelBookingModal = closeCancelBookingModal;
        window.submitCancelBooking = submitCancelBooking;
        window.openBugReportModal = openBugReportModal;
        window.closeBugReportModal = closeBugReportModal;
        window.updateBugReportCount = updateBugReportCount;
        window.submitBugReport = submitBugReport;
        window.cancelExitApp = cancelExitApp;
        window.confirmExitApp = confirmExitApp;
        window.submitAttendanceConfirmation = submitAttendanceConfirmation;
        window.closeAttendanceConfirmationPopup = closeAttendanceConfirmationPopup;
        window.openHomeInfoDetail = openHomeInfoDetail;
        window.scrollTopHome = scrollTopHome;
        window.showToast = showToast;
        window.installPatientPWA = installPatientPWA;
        window.dismissPatientInstallPrompt = dismissPatientInstallPrompt;
        window.showPatientInstallPrompt = showPatientInstallPrompt;

        if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
        window.scrollTo(0, 0);

        window.addEventListener('beforeinstallprompt', function(event) {
            event.preventDefault();
            patientDeferredInstallPrompt = event;
            autoShowPatientInstallPrompt();
        });

        window.addEventListener('appinstalled', function() {
            patientDeferredInstallPrompt = null;
            sessionStorage.setItem(PATIENT_INSTALL_DISMISS_KEY, 'true');
            dismissPatientInstallPrompt();
        });

        bindPatientLayoutLifecycle({
            init,
            keydown(event) {
                if (event.key === 'Escape' && document.getElementById('birth-date-wheel-modal')?.classList.contains('active')) {
                    closeBirthDateWheelPicker(event);
                    return;
                }
                if (event.key === 'Escape' && document.getElementById('birth-photo-modal')?.classList.contains('active')) {
                    closeBirthPhotoModal(event);
                }
            },
            scroll: handleHomeScrollReveal,
            wheel: handleHomeWheelReveal,
            wheelGuard: preventHomeScrollDuringBrake,
            touchstart: handleHomeTouchStart,
            touchmove: handleHomeTouchMove,
            touchGuard: preventHomeScrollDuringBrake,
            resize() {
                updateHomeActionGap();
                if (document.getElementById('home-hero-photo')) updateHomeHeroPhoto();
            },
            visualResize: updateHomeActionGap,
            pageshow(event) {
                resetScrollToTop();
                lockHomeSections();
                requestAnimationFrame(updateHomeActionGap);
                triggerHomeIntroAnimation();
                scheduleHomeAutoUnlock();
                if (isGuestMode()) return;
                if (event.persisted) {
                    loadNotificationCount();
                    loadHomeAnnouncements();
                    loadUnreadDocCounts();
                    checkActiveBooking();
                    checkBirthPending({ silent: true });
                    loadBirthCongratsHome();
                }
            }
        });
})();

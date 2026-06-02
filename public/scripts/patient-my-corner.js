(function () {
    'use strict';

    var API_BASE = '/api/patient-workdesk';
    var CORNER_NAME_KEY = 'patient_my_corner_name';
    var CORNER_NOTE_KEY = 'patient_my_corner_note';
    var GUEST_MODE_KEY = 'sisiwanita_guest_mode';
    var GUEST_STARTED_AT_KEY = 'sisiwanita_guest_started_at';
    var GUEST_SESSION_TTL_MS = 4 * 60 * 60 * 1000;
    var DEFAULT_NOTE = 'Simpan catatan kecil, atur preferensi, dan pin hal yang sering Anda buka.';
    var state = {
        loaded: false,
        loading: false,
        saving: false,
        data: null,
        mode: 'view',
        pendingFocus: null
    };

    var WIDGET_ICONS = {
        'active-booking': 'fa-calendar-check',
        'pregnancy-tracker': 'fa-chart-line',
        documents: 'fa-folder-open',
        'vitamin-reminder': 'fa-pills',
        'tanya-dokter': 'fa-comments',
        'personal-note': 'fa-note-sticky',
        favorites: 'fa-thumbtack'
    };

    var ROOM_ITEMS = {
        'album-usg': { label: 'Album USG', copy: 'Frame USG', icon: 'fa-image', url: '/album-usg.html', className: 'pmc-room-frame' },
        'active-booking': { label: 'Jadwal', copy: 'Kalender klinik', icon: 'fa-calendar-check', url: '/booking-klinik.html', className: 'pmc-room-calendar' },
        'pregnancy-tracker': { label: 'Tracker', copy: 'Kartu kehamilan', icon: 'fa-chart-line', url: '/pregnancy-tracker.html', className: 'pmc-room-tracker' },
        documents: { label: 'Dokumen', copy: 'Map medis', icon: 'fa-folder-open', url: '/dokumen-medis.html', className: 'pmc-room-documents' },
        'vitamin-reminder': { label: 'Vitamin', copy: 'Kotak reminder', icon: 'fa-pills', url: '/jadwal-vitamin.html', className: 'pmc-room-vitamin' },
        'tanya-dokter': { label: 'Tanya Dokter', copy: 'Chat aman', icon: 'fa-comments', url: '/tanya-dokter.html', className: 'pmc-room-chat' },
        'personal-note': { label: 'Catatan', copy: 'Papan pribadi', icon: 'fa-note-sticky', action: 'note', className: 'pmc-room-note' },
        favorites: { label: 'Favorit', copy: 'Shortcut', icon: 'fa-thumbtack', action: 'favorites', className: 'pmc-room-favorites' }
    };

    var ROOM_PRESETS = [
        { id: 'calm', label: 'Calm', accent: '#5c7f72' },
        { id: 'rose', label: 'Rose', accent: '#c56b7b' },
        { id: 'sky', label: 'Sky', accent: '#4e7ea8' },
        { id: 'night', label: 'Night', accent: '#4f5f8f' }
    ];

    function getToken() {
        return localStorage.getItem('vps_auth_token') || sessionStorage.getItem('vps_auth_token') || localStorage.getItem('patient_token') || '';
    }

    function clearGuestMode() {
        localStorage.removeItem(GUEST_MODE_KEY);
        localStorage.removeItem(GUEST_STARTED_AT_KEY);
        sessionStorage.removeItem(GUEST_MODE_KEY);
        sessionStorage.removeItem(GUEST_STARTED_AT_KEY);
    }

    function isGuestMode() {
        var marker = sessionStorage.getItem(GUEST_MODE_KEY) || localStorage.getItem(GUEST_MODE_KEY);
        if (marker !== '1') return false;
        var startedAt = Number(sessionStorage.getItem(GUEST_STARTED_AT_KEY) || localStorage.getItem(GUEST_STARTED_AT_KEY) || 0);
        if (startedAt && Date.now() - startedAt > GUEST_SESSION_TTL_MS) {
            clearGuestMode();
            return false;
        }
        return true;
    }

    function escapeHtml(value) {
        var div = document.createElement('div');
        div.textContent = value == null ? '' : String(value);
        return div.innerHTML;
    }

    function normalizeText(value, fallback) {
        var text = String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
        return text || fallback || '';
    }

    function getPatientFirstName() {
        var profile = window.currentProfile || {};
        var name = profile.fullname || profile.full_name || '';
        return normalizeText(name, 'Pasien').split(' ')[0] || 'Pasien';
    }

    function getFallbackData() {
        var firstName = getPatientFirstName();
        var cornerName = localStorage.getItem(CORNER_NAME_KEY) || ('Ruang ' + firstName);
        var note = localStorage.getItem(CORNER_NOTE_KEY) || DEFAULT_NOTE;
        return {
            layout: {
                version: 1,
                mode: 'mobile-stack',
                widgets: [
                    { id: 'active-booking', label: 'Booking Aktif', visible: true, order: 10 },
                    { id: 'pregnancy-tracker', label: 'Pregnancy Tracker', visible: true, order: 20 },
                    { id: 'documents', label: 'Dokumen', visible: true, order: 30 },
                    { id: 'vitamin-reminder', label: 'Vitamin', visible: true, order: 40 },
                    { id: 'tanya-dokter', label: 'Tanya Dokter', visible: true, order: 50 },
                    { id: 'personal-note', label: 'Catatan Pribadi', visible: true, order: 60 },
                    { id: 'favorites', label: 'Favorit', visible: true, order: 70 }
                ],
                favorites: [
                    { id: 'album-usg', label: 'Album USG', icon: 'fa-image', url: '/album-usg.html' },
                    { id: 'booking', label: 'Booking', icon: 'fa-calendar-check', url: '/booking-klinik.html' },
                    { id: 'tanya-dokter', label: 'Tanya Dokter', icon: 'fa-comments', url: '/tanya-dokter.html' }
                ]
            },
            theme: {
                corner_name: cornerName,
                note: note,
                preset: 'calm',
                accent: '#5c7f72'
            },
            public_settings: {
                public_enabled: false,
                share_code: null,
                public_profile: {
                    display_name: firstName,
                    corner_name: cornerName,
                    intro: 'Ruang publik kecil untuk berbagi hal yang ingin saya tampilkan.',
                    avatar_initials: firstName.slice(0, 2).toUpperCase()
                },
                public_widgets: ['intro', 'favorites']
            },
            updated_at: null
        };
    }

    function mergeData(input) {
        var fallback = getFallbackData();
        var data = input && typeof input === 'object' ? input : {};
        return {
            layout: Object.assign({}, fallback.layout, data.layout || {}),
            theme: Object.assign({}, fallback.theme, data.theme || {}),
            public_settings: Object.assign({}, fallback.public_settings, data.public_settings || {}),
            updated_at: data.updated_at || null
        };
    }

    async function apiRequest(path, options) {
        var token = getToken();
        var headers = Object.assign({
            'Authorization': 'Bearer ' + token,
            'Cache-Control': 'no-cache'
        }, options && options.headers ? options.headers : {});

        var response = await fetch(API_BASE + path + (path.indexOf('?') === -1 ? '?_t=' : '&_t=') + Date.now(), Object.assign({}, options || {}, {
            headers: headers,
            cache: 'no-store'
        }));
        var body = await response.json().catch(function () { return {}; });
        if (!response.ok || body.success === false) {
            throw new Error(body.message || 'Request gagal');
        }
        return body.data || body;
    }

    function updateDashboard(data) {
        var theme = (data && data.theme) || getFallbackData().theme;
        var name = normalizeText(theme.corner_name, 'Ruang Saya');
        var note = normalizeText(theme.note, DEFAULT_NOTE);
        var cornerName = document.getElementById('corner-name');
        var cornerTitle = document.getElementById('corner-card-title');
        var cornerDesc = document.getElementById('corner-desc');
        if (cornerName) cornerName.textContent = name;
        if (cornerTitle) cornerTitle.textContent = name.length > 14 ? 'Ruang' : name;
        if (cornerDesc) cornerDesc.textContent = note;
        document.documentElement.style.setProperty('--pmc-accent', theme.accent || '#5c7f72');
    }

    async function loadWorkdesk() {
        if (isGuestMode()) {
            state.data = state.data || getFallbackData();
            state.loaded = true;
            updateDashboard(state.data);
            return state.data;
        }
        if (state.loading) return state.data || getFallbackData();
        state.loading = true;
        try {
            var data = await apiRequest('/layout', { method: 'GET' });
            state.data = mergeData(data);
            state.loaded = true;
            updateDashboard(state.data);
            migrateLocalOnce();
            return state.data;
        } catch (error) {
            state.data = state.data || getFallbackData();
            updateDashboard(state.data);
            return state.data;
        } finally {
            state.loading = false;
        }
    }

    function migrateLocalOnce() {
        if (sessionStorage.getItem('patient_my_corner_migrated') === '1') return;
        var localName = localStorage.getItem(CORNER_NAME_KEY);
        var localNote = localStorage.getItem(CORNER_NOTE_KEY);
        if (!localName && !localNote) return;
        if (!state.data) return;
        if (localName) state.data.theme.corner_name = localName;
        if (localNote) state.data.theme.note = localNote;
        sessionStorage.setItem('patient_my_corner_migrated', '1');
        saveWorkdesk(false).catch(function () {});
    }

    async function saveWorkdesk(showMessage) {
        if (!state.data || state.saving) return;
        if (isGuestMode()) return state.data;
        state.saving = true;
        try {
            var data = await apiRequest('/layout', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    layout: state.data.layout,
                    theme: state.data.theme,
                    public_settings: state.data.public_settings
                })
            });
            state.data = mergeData(data);
            updateDashboard(state.data);
            renderPanel();
            if (showMessage !== false && window.showToast) window.showToast('Ruang tersimpan');
        } catch (error) {
            if (window.showToast) window.showToast(error.message || 'Gagal menyimpan Ruang');
        } finally {
            state.saving = false;
        }
    }

    function ensureRoot() {
        var root = document.getElementById('pmc-root');
        if (root) return root;
        root = document.createElement('div');
        root.id = 'pmc-root';
        root.innerHTML = '<div class="pmc-backdrop" data-pmc-close="1"></div><section class="pmc-shell" role="dialog" aria-modal="true" aria-label="Ruang Saya"><div id="pmc-panel"></div></section>';
        document.body.appendChild(root);
        root.addEventListener('click', function (event) {
            if (event.target && event.target.getAttribute('data-pmc-close') === '1') closeMyCorner();
        });
        return root;
    }

    function getShareUrl() {
        var settings = state.data && state.data.public_settings ? state.data.public_settings : {};
        if (!settings.share_code) return '';
        return window.location.origin + '/my-corner-visit.html?c=' + encodeURIComponent(settings.share_code);
    }

    function getWidgets() {
        var layout = state.data && state.data.layout ? state.data.layout : getFallbackData().layout;
        return (Array.isArray(layout.widgets) ? layout.widgets : [])
            .slice()
            .sort(function (a, b) { return Number(a.order || 0) - Number(b.order || 0); });
    }

    function renderWidget(widget, index, count) {
        var icon = WIDGET_ICONS[widget.id] || 'fa-circle';
        var hidden = widget.visible === false;
        return '<article class="pmc-widget' + (hidden ? ' is-hidden' : '') + '">' +
            '<div class="pmc-widget-icon"><i class="fa-solid ' + escapeHtml(icon) + '"></i></div>' +
            '<div><h3 class="pmc-widget-title">' + escapeHtml(widget.label || widget.id) + '</h3>' +
            '<div class="pmc-widget-meta">' + (hidden ? 'Disembunyikan' : 'Tampil di stack mobile') + '</div></div>' +
            '<div class="pmc-widget-actions">' +
            '<button class="pmc-widget-action" onclick="PatientMyCorner.moveWidget(' + index + ', -1)" ' + (index === 0 ? 'disabled' : '') + ' aria-label="Naik"><i class="fa-solid fa-arrow-up"></i></button>' +
            '<button class="pmc-widget-action" onclick="PatientMyCorner.moveWidget(' + index + ', 1)" ' + (index === count - 1 ? 'disabled' : '') + ' aria-label="Turun"><i class="fa-solid fa-arrow-down"></i></button>' +
            '<button class="pmc-widget-action" onclick="PatientMyCorner.toggleWidget(' + index + ')" aria-label="Tampil sembunyi"><i class="fa-solid ' + (hidden ? 'fa-eye-slash' : 'fa-eye') + '"></i></button>' +
            '</div></article>';
    }

    function getVisibleRoomItems() {
        var ids = ['album-usg'];
        getWidgets().forEach(function (widget) {
            if (widget.visible === false) return;
            if (ROOM_ITEMS[widget.id] && ids.indexOf(widget.id) === -1) ids.push(widget.id);
        });
        return ids.map(function (id) { return Object.assign({ id: id }, ROOM_ITEMS[id]); });
    }

    function renderHeader(theme) {
        var isDecorating = state.mode === 'decorate';
        var headerTitle = isDecorating ? 'Atur Ruang' : 'Ruang Saya';
        return '<header class="pmc-header">' +
            '<div><div class="pmc-kicker">' + (isDecorating ? 'Dekorasi Ruang' : 'Ruang Mobile') + '</div><h2 class="pmc-title">' + headerTitle + '</h2></div>' +
            '<div class="pmc-header-actions">' +
                '<button class="pmc-close" onclick="PatientMyCorner.close()" aria-label="Tutup"><i class="fa-solid fa-xmark"></i></button>' +
            '</div>' +
            '</header>';
    }

    function renderRoomObject(item) {
        return '<button class="pmc-room-object ' + escapeHtml(item.className) + '" onclick="PatientMyCorner.openItem(\'' + escapeHtml(item.id) + '\')" aria-label="Buka ' + escapeHtml(item.label) + '">' +
            '<span class="pmc-room-object-icon"><i class="fa-solid ' + escapeHtml(item.icon) + '"></i></span>' +
            '<span class="pmc-room-object-text"><strong>' + escapeHtml(item.label) + '</strong><small>' + escapeHtml(item.copy) + '</small></span>' +
            '</button>';
    }

    function renderFavoriteShortcut(item) {
        var url = item.url || '#';
        return '<button class="pmc-favorite-shortcut" onclick="PatientMyCorner.go(\'' + escapeHtml(url) + '\')">' +
            '<i class="fa-solid ' + escapeHtml(item.icon || 'fa-star') + '"></i><span>' + escapeHtml(item.label || 'Favorit') + '</span>' +
            '</button>';
    }

    function renderRoomView(data) {
        var theme = data.theme || getFallbackData().theme;
        var layout = data.layout || getFallbackData().layout;
        var settings = data.public_settings || {};
        var favorites = Array.isArray(layout.favorites) ? layout.favorites : [];
        var visibleObjects = getVisibleRoomItems().length;
        var publicText = settings.public_enabled ? 'Publik aktif' : 'Privat';
        var updatedText = data.updated_at ? 'Tersimpan' : 'Default';
        return '<div class="pmc-content pmc-content-room">' +
            '<section class="pmc-room-hero">' +
                '<div class="pmc-room-heading"><div class="pmc-kicker">Ruang Saya</div><h1>' + escapeHtml(theme.corner_name || 'Ruang Saya') + '</h1><p>' + escapeHtml(theme.note || DEFAULT_NOTE) + '</p></div>' +
                '<button class="pmc-primary pmc-decorate-cta" onclick="PatientMyCorner.setMode(\'decorate\')"><i class="fa-solid fa-wand-magic-sparkles"></i> Dekorasi</button>' +
            '</section>' +
            '<section class="pmc-room-scene" aria-label="Ruang pasien pribadi">' +
                '<div class="pmc-room-wall"></div><div class="pmc-room-window"><i class="fa-solid fa-sun"></i></div><div class="pmc-room-floor"></div>' +
                getVisibleRoomItems().map(renderRoomObject).join('') +
            '</section>' +
            '<section class="pmc-room-status">' +
                '<div><strong>' + visibleObjects + '</strong><span>Objek aktif</span></div>' +
                '<div><strong>' + escapeHtml(publicText) + '</strong><span>Status ruang</span></div>' +
                '<div><strong>' + escapeHtml(updatedText) + '</strong><span>Layout</span></div>' +
            '</section>' +
            '<div class="pmc-section-title">Favorit</div>' +
            '<section class="pmc-favorite-row">' + favorites.slice(0, 4).map(renderFavoriteShortcut).join('') + '</section>' +
        '</div>' +
        '<footer class="pmc-footer pmc-footer-single"><button class="pmc-ghost" onclick="PatientMyCorner.close()"><i class="fa-solid fa-chevron-down"></i> Tutup</button><button class="pmc-primary" onclick="PatientMyCorner.setMode(\'decorate\')"><i class="fa-solid fa-wand-magic-sparkles"></i> Atur Ruang</button></footer>';
    }

    function renderPresetButton(preset, activePreset) {
        return '<button class="pmc-preset-btn ' + (activePreset === preset.id ? 'is-active' : '') + '" onclick="PatientMyCorner.applyPreset(\'' + preset.id + '\')" style="--preset-color:' + escapeHtml(preset.accent) + '">' +
            '<span></span>' + escapeHtml(preset.label) +
            '</button>';
    }

    function renderDecorateView(data) {
        var theme = data.theme || getFallbackData().theme;
        var settings = data.public_settings || {};
        var publicProfile = settings.public_profile || {};
        var shareUrl = getShareUrl();
        var widgets = getWidgets();
        var publicEnabled = !!settings.public_enabled;
        var publicWidgets = Array.isArray(settings.public_widgets) ? settings.public_widgets : [];

        return '<div class="pmc-content">' +
                '<section class="pmc-hero"><div class="pmc-hero-main"><h1 class="pmc-hero-name">Dekorasi</h1><p class="pmc-hero-note">Atur nama, warna, objek, dan versi publik dari ruang pasien.</p></div></section>' +
                '<div class="pmc-section-title">Personalisasi</div>' +
                '<section class="pmc-card">' +
                    '<div class="pmc-field"><label for="pmc-name">Nama ruang</label><input id="pmc-name" maxlength="32" value="' + escapeHtml(theme.corner_name || 'Ruang Saya') + '"></div>' +
                    '<div class="pmc-field"><label for="pmc-note">Catatan pribadi</label><textarea id="pmc-note" maxlength="500">' + escapeHtml(theme.note || DEFAULT_NOTE) + '</textarea></div>' +
                    '<div class="pmc-section-title pmc-section-title-inner">Tema ruang</div>' +
                    '<div class="pmc-preset-row">' + ROOM_PRESETS.map(function (preset) { return renderPresetButton(preset, theme.preset || 'calm'); }).join('') + '</div>' +
                    '<div class="pmc-field"><label for="pmc-accent">Accent color</label><input id="pmc-accent" type="color" value="' + escapeHtml(theme.accent || '#5c7f72') + '"></div>' +
                '</section>' +
                '<div class="pmc-section-title">Kunjungi Ruang</div>' +
                '<section class="pmc-card">' +
                    '<div class="pmc-card-row"><div><h3 class="pmc-card-title">Izinkan dikunjungi</h3><p class="pmc-card-copy">Pasien lain hanya melihat versi publik yang Anda pilih.</p></div>' +
                    '<button class="pmc-switch ' + (publicEnabled ? 'is-on' : '') + '" onclick="PatientMyCorner.togglePublic()" aria-label="Toggle ruang publik"></button></div>' +
                    '<div class="pmc-field"><label for="pmc-public-name">Nama publik</label><input id="pmc-public-name" maxlength="32" value="' + escapeHtml(publicProfile.display_name || getPatientFirstName()) + '"></div>' +
                    '<div class="pmc-field"><label for="pmc-public-intro">Intro publik</label><textarea id="pmc-public-intro" maxlength="220">' + escapeHtml(publicProfile.intro || '') + '</textarea></div>' +
                    '<div class="pmc-chip-row">' + ['intro', 'favorites', 'journey-note', 'public-links'].map(function (id) {
                        var labels = { intro: 'Intro', favorites: 'Favorit', 'journey-note': 'Journey Note', 'public-links': 'Public Links' };
                        return '<button class="pmc-chip-btn ' + (publicWidgets.indexOf(id) !== -1 ? 'is-active' : '') + '" onclick="PatientMyCorner.togglePublicWidget(\'' + id + '\')">' + labels[id] + '</button>';
                    }).join('') + '</div>' +
                    '<div class="pmc-share-box ' + (publicEnabled && shareUrl ? 'is-visible' : '') + '">' +
                        '<span class="pmc-share-url">' + escapeHtml(shareUrl || 'Link dibuat setelah disimpan.') + '</span>' +
                        '<div class="pmc-action-row"><button class="pmc-chip-btn" onclick="PatientMyCorner.copyShareLink()"><i class="fa-solid fa-copy"></i> Copy</button><button class="pmc-chip-btn" onclick="PatientMyCorner.previewPublic()"><i class="fa-solid fa-arrow-up-right-from-square"></i> Preview</button><button class="pmc-chip-btn" onclick="PatientMyCorner.regenerateShareCode()"><i class="fa-solid fa-rotate"></i> Regenerate</button></div>' +
                    '</div>' +
                '</section>' +
                '<div class="pmc-section-title">Objek Ruang</div>' +
                '<section class="pmc-widget-list">' + widgets.map(function (widget, index) { return renderWidget(widget, index, widgets.length); }).join('') + '</section>' +
            '</div>' +
            '<footer class="pmc-footer"><button class="pmc-ghost" onclick="PatientMyCorner.setMode(\'view\')"><i class="fa-solid fa-eye"></i> Lihat Ruang</button><button class="pmc-primary" onclick="PatientMyCorner.save()"><i class="fa-solid fa-check"></i> Simpan</button></footer>';
    }

    function focusPendingField() {
        if (!state.pendingFocus) return;
        var field = document.getElementById(state.pendingFocus);
        state.pendingFocus = null;
        if (field && typeof field.focus === 'function') {
            setTimeout(function () { field.focus(); }, 40);
        }
    }

    function renderPanel() {
        ensureRoot();
        var panel = document.getElementById('pmc-panel');
        if (!panel) return;
        var data = state.data || getFallbackData();
        var theme = data.theme || getFallbackData().theme;
        panel.innerHTML = renderHeader(theme) + (state.mode === 'decorate' ? renderDecorateView(data) : renderRoomView(data));
        focusPendingField();
    }

    function syncInputsToState() {
        if (!state.data) state.data = getFallbackData();
        var name = document.getElementById('pmc-name');
        var note = document.getElementById('pmc-note');
        var accent = document.getElementById('pmc-accent');
        var publicName = document.getElementById('pmc-public-name');
        var publicIntro = document.getElementById('pmc-public-intro');
        if (name) state.data.theme.corner_name = normalizeText(name.value, 'Ruang Saya').slice(0, 32);
        if (note) state.data.theme.note = String(note.value || DEFAULT_NOTE).slice(0, 500);
        if (accent && /^#[0-9a-fA-F]{6}$/.test(accent.value)) state.data.theme.accent = accent.value;
        if (!state.data.public_settings.public_profile) state.data.public_settings.public_profile = {};
        if (publicName) state.data.public_settings.public_profile.display_name = normalizeText(publicName.value, getPatientFirstName()).slice(0, 32);
        state.data.public_settings.public_profile.corner_name = state.data.theme.corner_name;
        if (publicIntro) state.data.public_settings.public_profile.intro = String(publicIntro.value || '').slice(0, 220);
        state.data.public_settings.public_profile.avatar_initials = normalizeText(state.data.public_settings.public_profile.display_name, 'PA').slice(0, 2).toUpperCase();
        localStorage.setItem(CORNER_NAME_KEY, state.data.theme.corner_name);
        localStorage.setItem(CORNER_NOTE_KEY, state.data.theme.note);
        updateDashboard(state.data);
    }

    async function openMyCorner() {
        ensureRoot();
        state.mode = 'view';
        if (!state.loaded) {
            await loadWorkdesk();
        }
        renderPanel();
        document.getElementById('pmc-root').classList.add('is-open');
        document.body.classList.add('pmc-open');
    }

    function closeMyCorner() {
        var root = document.getElementById('pmc-root');
        if (root) root.classList.remove('is-open');
        document.body.classList.remove('pmc-open');
    }

    function reorderWidgets() {
        var widgets = getWidgets();
        widgets.forEach(function (widget, index) {
            widget.order = (index + 1) * 10;
        });
        state.data.layout.widgets = widgets;
    }

    var api = {
        open: openMyCorner,
        close: closeMyCorner,
        setMode: function (mode) {
            if (state.mode === 'decorate') syncInputsToState();
            state.mode = mode === 'decorate' ? 'decorate' : 'view';
            renderPanel();
        },
        go: function (url) {
            if (!url || url === '#') return;
            window.location.href = url;
        },
        openItem: function (id) {
            var item = ROOM_ITEMS[id];
            if (!item) return;
            if (item.url) {
                window.location.href = item.url;
                return;
            }
            if (item.action === 'note') {
                state.mode = 'decorate';
                state.pendingFocus = 'pmc-note';
                renderPanel();
                return;
            }
            if (item.action === 'favorites' && window.showToast) {
                window.showToast('Favorit ada di bawah ruang');
            }
        },
        applyPreset: function (presetId) {
            syncInputsToState();
            var preset = ROOM_PRESETS.find(function (item) { return item.id === presetId; }) || ROOM_PRESETS[0];
            if (!state.data) state.data = getFallbackData();
            state.data.theme.preset = preset.id;
            state.data.theme.accent = preset.accent;
            updateDashboard(state.data);
            renderPanel();
        },
        save: function () {
            syncInputsToState();
            return saveWorkdesk(true);
        },
        reset: async function () {
            try {
                var data = await apiRequest('/reset', { method: 'POST' });
                state.data = mergeData(data);
                updateDashboard(state.data);
                renderPanel();
                if (window.showToast) window.showToast('Ruang direset');
            } catch (error) {
                if (window.showToast) window.showToast(error.message || 'Gagal reset');
            }
        },
        togglePublic: function () {
            syncInputsToState();
            state.data.public_settings.public_enabled = !state.data.public_settings.public_enabled;
            renderPanel();
        },
        togglePublicWidget: function (id) {
            syncInputsToState();
            var list = state.data.public_settings.public_widgets || [];
            var index = list.indexOf(id);
            if (index === -1) list.push(id);
            else list.splice(index, 1);
            state.data.public_settings.public_widgets = list;
            renderPanel();
        },
        regenerateShareCode: function () {
            syncInputsToState();
            state.data.public_settings.public_enabled = true;
            state.data.public_settings.regenerate_share_code = true;
            saveWorkdesk(true);
        },
        copyShareLink: async function () {
            var url = getShareUrl();
            if (!url) {
                if (window.showToast) window.showToast('Simpan dulu untuk membuat link');
                return;
            }
            try {
                await navigator.clipboard.writeText(url);
                if (window.showToast) window.showToast('Link disalin');
            } catch (_error) {
                window.prompt('Copy link Ruang', url);
            }
        },
        previewPublic: function () {
            var url = getShareUrl();
            if (!url) {
                if (window.showToast) window.showToast('Simpan dulu untuk preview');
                return;
            }
            window.location.href = url;
        },
        moveWidget: function (index, direction) {
            syncInputsToState();
            var widgets = getWidgets();
            var target = index + direction;
            if (target < 0 || target >= widgets.length) return;
            var temp = widgets[index];
            widgets[index] = widgets[target];
            widgets[target] = temp;
            state.data.layout.widgets = widgets;
            reorderWidgets();
            renderPanel();
        },
        toggleWidget: function (index) {
            syncInputsToState();
            var widgets = getWidgets();
            if (!widgets[index]) return;
            widgets[index].visible = widgets[index].visible === false;
            state.data.layout.widgets = widgets;
            renderPanel();
        },
        load: loadWorkdesk
    };

    window.PatientMyCorner = api;
    window.openMyCorner = openMyCorner;

    document.addEventListener('DOMContentLoaded', function () {
        loadWorkdesk().catch(function () {});
    });
})();

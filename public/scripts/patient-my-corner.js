(function () {
    'use strict';

    var API_BASE = '/api/patient-workdesk';
    var CORNER_NAME_KEY = 'patient_my_corner_name';
    var CORNER_NOTE_KEY = 'patient_my_corner_note';
    var DEFAULT_NOTE = 'Simpan catatan kecil, atur preferensi, dan pin hal yang sering Anda buka.';
    var state = {
        loaded: false,
        loading: false,
        saving: false,
        data: null
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

    function getToken() {
        return localStorage.getItem('vps_auth_token') || sessionStorage.getItem('vps_auth_token') || localStorage.getItem('patient_token') || '';
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
                    { id: 'album-usg', label: 'Album USG', icon: 'fa-image', url: '/album-usg-trial.html' },
                    { id: 'booking', label: 'Booking', icon: 'fa-calendar-check', url: '/booking-klinik-trial.html' },
                    { id: 'tanya-dokter', label: 'Tanya Dokter', icon: 'fa-comments', url: '/tanya-dokter-trial.html' }
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
        var name = normalizeText(theme.corner_name, 'My Corner');
        var note = normalizeText(theme.note, DEFAULT_NOTE);
        var cornerName = document.getElementById('corner-name');
        var cornerTitle = document.getElementById('corner-card-title');
        var cornerDesc = document.getElementById('corner-desc');
        if (cornerName) cornerName.textContent = name;
        if (cornerTitle) cornerTitle.textContent = name.length > 14 ? 'My Corner' : name;
        if (cornerDesc) cornerDesc.textContent = note;
        document.documentElement.style.setProperty('--pmc-accent', theme.accent || '#5c7f72');
    }

    async function loadWorkdesk() {
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
            if (showMessage !== false && window.showToast) window.showToast('My Corner tersimpan');
        } catch (error) {
            if (window.showToast) window.showToast(error.message || 'Gagal menyimpan My Corner');
        } finally {
            state.saving = false;
        }
    }

    function ensureRoot() {
        var root = document.getElementById('pmc-root');
        if (root) return root;
        root = document.createElement('div');
        root.id = 'pmc-root';
        root.innerHTML = '<div class="pmc-backdrop" data-pmc-close="1"></div><section class="pmc-shell" role="dialog" aria-modal="true" aria-label="My Corner"><div id="pmc-panel"></div></section>';
        document.body.appendChild(root);
        root.addEventListener('click', function (event) {
            if (event.target && event.target.getAttribute('data-pmc-close') === '1') closeMyCorner();
        });
        return root;
    }

    function getShareUrl() {
        var settings = state.data && state.data.public_settings ? state.data.public_settings : {};
        if (!settings.share_code) return '';
        return window.location.origin + '/my-corner-visit-trial.html?c=' + encodeURIComponent(settings.share_code);
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

    function renderPanel() {
        ensureRoot();
        var panel = document.getElementById('pmc-panel');
        if (!panel) return;
        var data = state.data || getFallbackData();
        var theme = data.theme;
        var settings = data.public_settings || {};
        var publicProfile = settings.public_profile || {};
        var shareUrl = getShareUrl();
        var widgets = getWidgets();
        var publicEnabled = !!settings.public_enabled;
        var publicWidgets = Array.isArray(settings.public_widgets) ? settings.public_widgets : [];

        panel.innerHTML = '<header class="pmc-header">' +
            '<div><div class="pmc-kicker">Mobile My Corner</div><h2 class="pmc-title">' + escapeHtml(theme.corner_name || 'My Corner') + '</h2></div>' +
            '<button class="pmc-close" onclick="PatientMyCorner.close()" aria-label="Tutup"><i class="fa-solid fa-xmark"></i></button>' +
            '</header>' +
            '<div class="pmc-content">' +
                '<section class="pmc-hero"><div class="pmc-hero-main"><h1 class="pmc-hero-name">' + escapeHtml(theme.corner_name || 'My Corner') + '</h1><p class="pmc-hero-note">' + escapeHtml(theme.note || DEFAULT_NOTE) + '</p></div></section>' +
                '<div class="pmc-section-title">Personalisasi</div>' +
                '<section class="pmc-card">' +
                    '<div class="pmc-field"><label for="pmc-name">Nama ruang</label><input id="pmc-name" maxlength="32" value="' + escapeHtml(theme.corner_name || 'My Corner') + '"></div>' +
                    '<div class="pmc-field"><label for="pmc-note">Catatan pribadi</label><textarea id="pmc-note" maxlength="500">' + escapeHtml(theme.note || DEFAULT_NOTE) + '</textarea></div>' +
                    '<div class="pmc-field"><label for="pmc-accent">Accent color</label><input id="pmc-accent" type="color" value="' + escapeHtml(theme.accent || '#5c7f72') + '"></div>' +
                '</section>' +
                '<div class="pmc-section-title">Kunjungi Corner</div>' +
                '<section class="pmc-card">' +
                    '<div class="pmc-card-row"><div><h3 class="pmc-card-title">Izinkan dikunjungi</h3><p class="pmc-card-copy">Pasien lain hanya melihat versi publik yang Anda pilih.</p></div>' +
                    '<button class="pmc-switch ' + (publicEnabled ? 'is-on' : '') + '" onclick="PatientMyCorner.togglePublic()" aria-label="Toggle public corner"></button></div>' +
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
                '<div class="pmc-section-title">Widget Stack</div>' +
                '<section class="pmc-widget-list">' + widgets.map(function (widget, index) { return renderWidget(widget, index, widgets.length); }).join('') + '</section>' +
            '</div>' +
            '<footer class="pmc-footer"><button class="pmc-ghost" onclick="PatientMyCorner.reset()"><i class="fa-solid fa-rotate-left"></i> Reset</button><button class="pmc-primary" onclick="PatientMyCorner.save()"><i class="fa-solid fa-check"></i> Simpan</button></footer>';
    }

    function syncInputsToState() {
        if (!state.data) state.data = getFallbackData();
        var name = document.getElementById('pmc-name');
        var note = document.getElementById('pmc-note');
        var accent = document.getElementById('pmc-accent');
        var publicName = document.getElementById('pmc-public-name');
        var publicIntro = document.getElementById('pmc-public-intro');
        if (name) state.data.theme.corner_name = normalizeText(name.value, 'My Corner').slice(0, 32);
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
                if (window.showToast) window.showToast('My Corner direset');
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
                window.prompt('Copy link My Corner', url);
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

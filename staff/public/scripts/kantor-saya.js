(function () {
    'use strict';

    var API_BASE = '/api/staff-workdesk';
    var CACHE_TTL_MS = 60000;
    var WALLPAPER_REFRESH_COOLDOWN_MS = 30000;
    var WALLPAPER_LEASE_REFRESH_MS = 12 * 60 * 1000;
    var GRIDSTACK_CSS_URL = 'https://cdn.jsdelivr.net/npm/gridstack@10.2.0/dist/gridstack.min.css';

    var state = {
        initialized: false,
        initInFlight: false,
        root: null,
        grid: null,
        layout: null,
        theme: null,
        editMode: false,
        saveTimer: null,
        cache: new Map(),
        widgetTimers: new Map(),
        isRendering: false,
        isHydrating: false,
        activeWallpaperPreset: null,
        wallpaperRefreshInFlight: false,
        wallpaperLastRefreshAt: 0,
        wallpaperProbeToken: 0,
        lastWallpaperProbeUrl: null,
        wallpaperProbeFailures: 0,
        wallpaperRetryTimer: null,
        wallpaperLeaseTimer: null,
        wallpaperGuardTimer: null,
        wallpaperGuardLastRestoreAt: 0,
        wallpaperFallbackWarnAt: 0,
        lastSuccessfulWallpaperKey: null,
        lastSuccessfulWallpaperBackground: null
    };

    function getLiveRoot() {
        return document.querySelector('#content-kantor-saya #kantor-saya-page') || document.getElementById('kantor-saya-page');
    }

    function getLiveGridElement() {
        return document.querySelector('#content-kantor-saya #kantor-grid') || document.getElementById('kantor-grid');
    }

    function hasStaleBindings() {
        if (!state.initialized) return false;

        var liveRoot = getLiveRoot();
        var liveGrid = getLiveGridElement();
        var gridEl = state.grid && state.grid.el ? state.grid.el : null;

        return !liveRoot ||
            !liveGrid ||
            !state.root ||
            !state.root.isConnected ||
            !gridEl ||
            !gridEl.isConnected ||
            state.root !== liveRoot ||
            gridEl !== liveGrid;
    }

    function resetGridRuntime() {
        if (state.saveTimer) {
            clearTimeout(state.saveTimer);
            state.saveTimer = null;
        }

        if (state.wallpaperRetryTimer) {
            clearTimeout(state.wallpaperRetryTimer);
            state.wallpaperRetryTimer = null;
        }

        if (state.wallpaperLeaseTimer) {
            clearInterval(state.wallpaperLeaseTimer);
            state.wallpaperLeaseTimer = null;
        }

        if (state.wallpaperGuardTimer) {
            clearInterval(state.wallpaperGuardTimer);
            state.wallpaperGuardTimer = null;
        }

        state.widgetTimers.forEach(function (timer) {
            clearInterval(timer);
        });
        state.widgetTimers.clear();

        if (state.grid && typeof state.grid.destroy === 'function') {
            try {
                state.grid.destroy(false);
            } catch (error) {
                console.warn('[kantor-saya] grid destroy warning:', error);
            }
        }

        state.grid = null;
        state.root = null;
        state.layout = null;
        state.theme = null;
        state.editMode = false;
        state.isRendering = false;
        state.isHydrating = false;
        state.wallpaperRefreshInFlight = false;
        state.wallpaperLastRefreshAt = 0;
        state.wallpaperProbeToken = 0;
        state.wallpaperProbeFailures = 0;
        state.lastWallpaperProbeUrl = null;
        state.lastSuccessfulWallpaperKey = null;
        state.lastSuccessfulWallpaperBackground = null;
        state.initialized = false;
    }

    function ensureGridstackCssLoaded() {
        var linkEls = Array.from(document.querySelectorAll('link[rel="stylesheet"]'));
        var existing = linkEls.find(function (link) {
            return (link.href || '').indexOf('/gridstack@10.2.0/dist/gridstack.min.css') !== -1 ||
                (link.href || '').indexOf('/gridstack.min.css') !== -1;
        });

        if (!existing) {
            existing = document.createElement('link');
            existing.rel = 'stylesheet';
            existing.href = GRIDSTACK_CSS_URL;
            existing.setAttribute('data-gridstack-css', '1');
            document.head.appendChild(existing);
        }

        if (existing.sheet) {
            return Promise.resolve();
        }

        return new Promise(function (resolve) {
            var done = false;
            function finish() {
                if (done) return;
                done = true;
                resolve();
            }

            existing.addEventListener('load', finish, { once: true });
            existing.addEventListener('error', finish, { once: true });
            setTimeout(finish, 1600);
        });
    }

    var PRESET_WALLPAPERS = {
        morning: 'radial-gradient(circle at 10% 20%, rgba(13,110,253,0.16), transparent 40%), radial-gradient(circle at 85% 0%, rgba(16,185,129,0.14), transparent 40%), linear-gradient(160deg, #f8fafc 0%, #eef4ff 50%, #f3f8f5 100%)',
        dusk: 'radial-gradient(circle at 20% 10%, rgba(236,72,153,0.16), transparent 38%), radial-gradient(circle at 80% 12%, rgba(168,85,247,0.14), transparent 36%), linear-gradient(155deg, #eef2ff 0%, #fdf2f8 52%, #f5f3ff 100%)',
        forest: 'radial-gradient(circle at 20% 12%, rgba(22,163,74,0.18), transparent 40%), radial-gradient(circle at 90% 0%, rgba(101,163,13,0.14), transparent 34%), linear-gradient(160deg, #f0fdf4 0%, #dcfce7 45%, #ecfccb 100%)',
        sand: 'radial-gradient(circle at 15% 12%, rgba(245,158,11,0.18), transparent 38%), radial-gradient(circle at 85% 0%, rgba(249,115,22,0.14), transparent 35%), linear-gradient(160deg, #fffbeb 0%, #fef3c7 55%, #ffedd5 100%)',
        ice: 'radial-gradient(circle at 10% 10%, rgba(14,165,233,0.16), transparent 38%), radial-gradient(circle at 82% 0%, rgba(59,130,246,0.12), transparent 32%), linear-gradient(160deg, #f0f9ff 0%, #e0f2fe 45%, #dbeafe 100%)',
        darkglass: 'radial-gradient(circle at 20% 20%, rgba(148,163,184,0.18), transparent 40%), radial-gradient(circle at 85% 0%, rgba(99,102,241,0.12), transparent 36%), linear-gradient(160deg, #1f2937 0%, #273449 50%, #374151 100%)'
    };

    var QUOTES = [
        'Kerja teliti hari ini adalah ketenangan pasien besok.',
        'Satu catatan medis yang rapi bisa menyelamatkan waktu satu tim.',
        'Konsistensi kecil setiap hari membentuk pelayanan yang besar.',
        'Dengar pasien sepenuh hati, data akan lebih mudah dibaca.',
        'Pelayanan hangat dan sistem rapi adalah kombinasi terbaik.',
        'Komunikasi yang jelas mengurangi kesalahan klinis.',
        'Klinik yang baik dibangun dari detail yang dijaga bersama.'
    ];

    var WIDGETS = {
        'shortcut-menu': {
            id: 'shortcut-menu',
            label: 'Shortcut Menu',
            icon: 'fa-thumbtack',
            defaultSize: { w: 6, h: 2, minW: 3, minH: 2 },
            defaultConfig: {
                pinned: ['nav-dashboard', 'nav-kelola-pasien', 'nav-jadwal', 'nav-docboard', 'nav-notifications']
            },
            render: renderShortcutWidget,
            configure: configureShortcutWidget
        },
        'sticky-notes': {
            id: 'sticky-notes',
            label: 'Sticky Notes',
            icon: 'fa-sticky-note',
            defaultSize: { w: 6, h: 3, minW: 3, minH: 2 },
            defaultConfig: { notes: [{ id: 'note-1', color: 'yellow', text: '' }] },
            render: renderStickyNotesWidget
        },
        'todo-list': {
            id: 'todo-list',
            label: 'To-Do List',
            icon: 'fa-list-check',
            defaultSize: { w: 6, h: 3, minW: 3, minH: 2 },
            defaultConfig: { items: [] },
            render: renderTodoWidget
        },
        'jadwal-jaga-saya': {
            id: 'jadwal-jaga-saya',
            label: 'Jadwal Jaga Saya',
            icon: 'fa-calendar-week',
            defaultSize: { w: 4, h: 3, minW: 3, minH: 2 },
            defaultConfig: {},
            render: renderJadwalJagaWidget
        },
        'point-saya': {
            id: 'point-saya',
            label: 'Point Saya',
            icon: 'fa-star',
            defaultSize: { w: 4, h: 2, minW: 3, minH: 2 },
            defaultConfig: {},
            render: renderPointSayaWidget
        },
        'briefing-hari-ini': {
            id: 'briefing-hari-ini',
            label: 'Briefing Hari Ini',
            icon: 'fa-clipboard-check',
            defaultSize: { w: 4, h: 2, minW: 3, minH: 2 },
            defaultConfig: {},
            render: renderBriefingHariIniWidget
        },
        'online-users-mini': {
            id: 'online-users-mini',
            label: 'Online Users Mini',
            icon: 'fa-users',
            defaultSize: { w: 4, h: 3, minW: 3, minH: 2 },
            defaultConfig: {},
            render: renderOnlineUsersWidget
        },
        'quick-search-pasien': {
            id: 'quick-search-pasien',
            label: 'Quick Search Pasien',
            icon: 'fa-search',
            defaultSize: { w: 4, h: 3, minW: 3, minH: 2 },
            defaultConfig: {},
            render: renderQuickSearchWidget
        },
        'clock-greeting': {
            id: 'clock-greeting',
            label: 'Clock + Greeting',
            icon: 'fa-clock',
            defaultSize: { w: 4, h: 2, minW: 3, minH: 2 },
            defaultConfig: {},
            render: renderClockWidget
        },
        'mini-stats': {
            id: 'mini-stats',
            label: 'Mini Stats',
            icon: 'fa-chart-bar',
            defaultSize: { w: 6, h: 2, minW: 3, minH: 2 },
            defaultConfig: {},
            render: renderMiniStatsWidget
        },
        'recent-patients': {
            id: 'recent-patients',
            label: 'Recent Patients',
            icon: 'fa-user-clock',
            defaultSize: { w: 6, h: 3, minW: 3, minH: 2 },
            defaultConfig: {},
            render: renderRecentPatientsWidget
        },
        'external-iframe': {
            id: 'external-iframe',
            label: 'External Iframe / Link',
            icon: 'fa-globe',
            defaultSize: { w: 6, h: 4, minW: 3, minH: 2 },
            defaultConfig: { url: '' },
            render: renderExternalIframeWidget,
            configure: configureExternalIframeWidget
        },
        'pomodoro-timer': {
            id: 'pomodoro-timer',
            label: 'Pomodoro Timer',
            icon: 'fa-hourglass-half',
            defaultSize: { w: 4, h: 2, minW: 3, minH: 2 },
            defaultConfig: { minutes: 25, remaining: 1500 },
            render: renderPomodoroWidget
        },
        'calendar-mini': {
            id: 'calendar-mini',
            label: 'Calendar Mini',
            icon: 'fa-calendar-alt',
            defaultSize: { w: 4, h: 3, minW: 3, minH: 2 },
            defaultConfig: {},
            render: renderCalendarWidget
        },
        'birthday-reminder': {
            id: 'birthday-reminder',
            label: 'Birthday Reminder',
            icon: 'fa-birthday-cake',
            defaultSize: { w: 4, h: 3, minW: 3, minH: 2 },
            defaultConfig: {},
            render: renderBirthdayReminderWidget
        },
        'inventory-alert': {
            id: 'inventory-alert',
            label: 'Inventory Alert',
            icon: 'fa-box-open',
            defaultSize: { w: 4, h: 3, minW: 3, minH: 2 },
            defaultConfig: {},
            render: renderInventoryAlertWidget
        },
        'tanya-dokter-inbox-preview': {
            id: 'tanya-dokter-inbox-preview',
            label: 'Tanya Dokter Inbox',
            icon: 'fa-comment-medical',
            defaultSize: { w: 4, h: 3, minW: 3, minH: 2 },
            defaultConfig: {},
            render: renderTanyaDokterWidget
        },
        'recent-activity-saya': {
            id: 'recent-activity-saya',
            label: 'Recent Activity Saya',
            icon: 'fa-history',
            defaultSize: { w: 6, h: 3, minW: 3, minH: 2 },
            defaultConfig: {},
            render: renderRecentActivityWidget
        },
        'quote-of-the-day': {
            id: 'quote-of-the-day',
            label: 'Quote of the Day',
            icon: 'fa-quote-left',
            defaultSize: { w: 4, h: 2, minW: 3, minH: 2 },
            defaultConfig: {},
            render: renderQuoteWidget
        }
    };

    function getToken() {
        if (typeof window.getAuthToken === 'function') return window.getAuthToken();
        return localStorage.getItem('vps_auth_token') || sessionStorage.getItem('vps_auth_token') || '';
    }

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function safeCssEscape(value) {
        var raw = String(value == null ? '' : value);
        if (window.CSS && typeof window.CSS.escape === 'function') {
            return window.CSS.escape(raw);
        }
        return raw.replace(/([^a-zA-Z0-9_-])/g, '\\$1');
    }

    function toLocalDateTimeString(value) {
        if (!value) return '-';
        var d = new Date(value);
        if (Number.isNaN(d.getTime())) return '-';
        return d.toLocaleString('id-ID', {
            day: '2-digit',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    function updateLastSavedLabel(timestamp) {
        var el = document.getElementById('ks-last-saved');
        if (!el) return;
        if (!timestamp) {
            el.textContent = 'Belum tersimpan';
            return;
        }
        el.textContent = 'Tersimpan ' + toLocalDateTimeString(timestamp);
    }

    function makeRequest(url, options) {
        var headers = Object.assign({}, options && options.headers ? options.headers : {});
        var token = getToken();
        if (token) {
            headers.Authorization = 'Bearer ' + token;
        }

        return fetch(url, Object.assign({}, options || {}, { headers: headers }));
    }

    function showFallbackModal(modalEl) {
        if (!modalEl) return;

        modalEl.style.display = 'block';
        modalEl.classList.add('show');
        modalEl.setAttribute('aria-modal', 'true');
        modalEl.removeAttribute('aria-hidden');
        document.body.classList.add('modal-open');

        var existingBackdrop = document.querySelector('.modal-backdrop.ks-fallback-backdrop');
        if (!existingBackdrop) {
            existingBackdrop = document.createElement('div');
            existingBackdrop.className = 'modal-backdrop fade show ks-fallback-backdrop';
            existingBackdrop.addEventListener('click', function () {
                hideFallbackModal(modalEl);
            });
            document.body.appendChild(existingBackdrop);
        }
    }

    function hideFallbackModal(modalEl) {
        if (!modalEl) return;

        modalEl.classList.remove('show');
        modalEl.style.display = 'none';
        modalEl.setAttribute('aria-hidden', 'true');
        modalEl.removeAttribute('aria-modal');

        var backdrop = document.querySelector('.modal-backdrop.ks-fallback-backdrop');
        if (backdrop) {
            backdrop.remove();
        }

        if (!document.querySelector('.modal.show')) {
            document.body.classList.remove('modal-open');
        }
    }

    function showModal(modalId) {
        var modalEl = document.getElementById(modalId);
        if (!modalEl) return;

        if (window.jQuery && window.jQuery.fn && typeof window.jQuery.fn.modal === 'function') {
            window.jQuery(modalEl).modal('show');
            return;
        }

        if (window.bootstrap && window.bootstrap.Modal) {
            var modal = window.bootstrap.Modal.getOrCreateInstance(modalEl);
            modal.show();
            return;
        }

        showFallbackModal(modalEl);
    }

    function hideModal(modalId) {
        var modalEl = document.getElementById(modalId);
        if (!modalEl) return;

        if (window.jQuery && window.jQuery.fn && typeof window.jQuery.fn.modal === 'function') {
            window.jQuery(modalEl).modal('hide');
            return;
        }

        if (window.bootstrap && window.bootstrap.Modal) {
            var modal = window.bootstrap.Modal.getOrCreateInstance(modalEl);
            modal.hide();
            return;
        }

        hideFallbackModal(modalEl);
    }

    function bindModalDismissFallback(modalId) {
        var modalEl = document.getElementById(modalId);
        if (!modalEl || modalEl.dataset.dismissBound === '1') {
            return;
        }

        modalEl.dataset.dismissBound = '1';

        modalEl.addEventListener('click', function (event) {
            if (event.target === modalEl) {
                hideModal(modalId);
            }
        });

        modalEl.querySelectorAll('[data-dismiss="modal"], .close').forEach(function (button) {
            button.addEventListener('click', function () {
                hideModal(modalId);
            });
        });
    }

    function withCacheBust(url) {
        var separator = url.indexOf('?') === -1 ? '?' : '&';
        return url + separator + '_t=' + Date.now();
    }

    async function apiGet(path) {
        var response = await makeRequest(withCacheBust(API_BASE + path), {
            cache: 'no-store',
            headers: {
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache'
            }
        });
        var body = await response.json().catch(function () { return {}; });
        if (!response.ok || body.success === false) {
            throw new Error(body.message || 'Request gagal');
        }
        return body.data || body;
    }

    async function apiPut(path, payload) {
        var response = await makeRequest(API_BASE + path, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        var body = await response.json().catch(function () { return {}; });
        if (!response.ok || body.success === false) {
            throw new Error(body.message || 'Gagal menyimpan');
        }
        return body.data || body;
    }

    async function apiPostForm(path, formData) {
        var response = await makeRequest(API_BASE + path, {
            method: 'POST',
            body: formData
        });
        var body = await response.json().catch(function () { return {}; });
        if (!response.ok || body.success === false) {
            throw new Error(body.message || 'Gagal upload');
        }
        return body.data || body;
    }

    function normalizeLayout(layoutData) {
        var layout = layoutData && typeof layoutData === 'object' ? layoutData : {};
        var widgets = Array.isArray(layout.widgets) ? layout.widgets.slice() : [];

        if (!widgets.length) {
            widgets = [
                buildWidgetInstance('clock-greeting', { x: 0, y: 0 }),
                buildWidgetInstance('shortcut-menu', { x: 4, y: 0, w: 8, h: 2 }),
                buildWidgetInstance('sticky-notes', { x: 0, y: 2, w: 6, h: 3 }),
                buildWidgetInstance('todo-list', { x: 6, y: 2, w: 6, h: 3 }),
                buildWidgetInstance('mini-stats', { x: 0, y: 5, w: 12, h: 2 })
            ];
        }

        widgets = widgets.map(function (widget, index) {
            var id = widget.widget_id;
            var def = WIDGETS[id] || null;
            var size = def ? def.defaultSize : { w: 4, h: 2, minW: 2, minH: 2 };

            return {
                instance_id: widget.instance_id || ('w-' + Date.now() + '-' + index + '-' + Math.random().toString(36).slice(2, 7)),
                widget_id: id,
                x: Number.isFinite(widget.x) ? widget.x : 0,
                y: Number.isFinite(widget.y) ? widget.y : 0,
                w: Number.isFinite(widget.w) ? widget.w : size.w,
                h: Number.isFinite(widget.h) ? widget.h : size.h,
                config: Object.assign({}, def && def.defaultConfig ? def.defaultConfig : {}, widget.config || {})
            };
        });

        return {
            version: Number(layout.version || 1),
            widgets: widgets
        };
    }

    function normalizeTheme(themeData) {
        var theme = themeData && typeof themeData === 'object' ? themeData : {};
        return {
            accent_color: theme.accent_color || '#0d6efd',
            wallpaper_url: theme.wallpaper_url || null,
            wallpaper_download_url: theme.wallpaper_download_url || null,
            wallpaper_preset: theme.wallpaper_preset || null
        };
    }

    function mergeThemeWithSignedUrlFallback(previousTheme, incomingTheme) {
        var prev = normalizeTheme(previousTheme);
        var next = normalizeTheme(incomingTheme);

        // Keep last known custom wallpaper key when server payload is temporarily incomplete.
        if (!next.wallpaper_url && !next.wallpaper_preset && prev.wallpaper_url) {
            next.wallpaper_url = prev.wallpaper_url;
        }

        if (
            next.wallpaper_url &&
            prev.wallpaper_url === next.wallpaper_url &&
            !next.wallpaper_download_url &&
            prev.wallpaper_download_url
        ) {
            next.wallpaper_download_url = prev.wallpaper_download_url;
        }

        return next;
    }

    function getWallpaperFallback(theme) {
        if (theme.wallpaper_preset && PRESET_WALLPAPERS[theme.wallpaper_preset]) {
            return PRESET_WALLPAPERS[theme.wallpaper_preset];
        }

        // Avoid sudden plain-white look while waiting for custom wallpaper signed URL refresh.
        if (theme.wallpaper_url) {
            return PRESET_WALLPAPERS.dusk;
        }

        return PRESET_WALLPAPERS.morning;
    }

    function getWallpaperBackground(theme) {
        var fallback = getWallpaperFallback(theme);
        if (theme.wallpaper_download_url) {
            var safeUrl = theme.wallpaper_download_url.replace(/'/g, '');
            return "url('" + safeUrl + "'), " + fallback;
        }
        return fallback;
    }

    function clearWallpaperRetryTimer() {
        if (!state.wallpaperRetryTimer) return;
        clearTimeout(state.wallpaperRetryTimer);
        state.wallpaperRetryTimer = null;
    }

    function clearWallpaperLeaseTimer() {
        if (!state.wallpaperLeaseTimer) return;
        clearInterval(state.wallpaperLeaseTimer);
        state.wallpaperLeaseTimer = null;
    }

    function clearWallpaperGuardTimer() {
        if (!state.wallpaperGuardTimer) return;
        clearInterval(state.wallpaperGuardTimer);
        state.wallpaperGuardTimer = null;
    }

    function isRootLikelyVisible() {
        if (!state.root) return false;
        if (state.root.classList && state.root.classList.contains('d-none')) return false;
        if (state.root.getClientRects && state.root.getClientRects().length === 0) return false;
        return true;
    }

    function ensureWallpaperVisualIntegrity(reason) {
        if (!state.root || !state.theme || !isRootLikelyVisible()) return;

        var computed = window.getComputedStyle ? window.getComputedStyle(state.root) : null;
        var computedImage = computed && computed.backgroundImage ? computed.backgroundImage : '';
        if (computedImage && computedImage !== 'none') return;

        var now = Date.now();
        if ((now - state.wallpaperGuardLastRestoreAt) < 4000) {
            return;
        }
        state.wallpaperGuardLastRestoreAt = now;

        console.warn('[kantor-saya] wallpaper guard restore (' + (reason || 'unknown') + ')');
        state.root.style.setProperty('background-image', getWallpaperBackground(state.theme), 'important');
        state.root.style.setProperty('background-size', 'cover', 'important');
        state.root.style.setProperty('background-position', 'center', 'important');

        if (state.theme.wallpaper_url) {
            refreshWallpaperDownloadUrl('guard-restore-' + (reason || 'unknown'), true);
        }
    }

    function ensureWallpaperGuardLoop() {
        if (!state.theme) {
            clearWallpaperGuardTimer();
            return;
        }

        if (state.wallpaperGuardTimer) {
            return;
        }

        state.wallpaperGuardTimer = setInterval(function () {
            ensureWallpaperVisualIntegrity('interval');
        }, 3000);
    }

    function ensureWallpaperLeaseRefreshLoop() {
        if (!state.theme || !state.theme.wallpaper_url) {
            clearWallpaperLeaseTimer();
            return;
        }

        if (state.wallpaperLeaseTimer) {
            return;
        }

        // Refresh signed URL periodically before the 1-hour lease expires.
        state.wallpaperLeaseTimer = setInterval(function () {
            if (!state.theme || !state.theme.wallpaper_url) {
                clearWallpaperLeaseTimer();
                return;
            }

            refreshWallpaperDownloadUrl('lease-refresh', true);
        }, WALLPAPER_LEASE_REFRESH_MS);
    }

    function scheduleWallpaperRefreshRetry(reason) {
        if (state.wallpaperRetryTimer || !state.theme || !state.theme.wallpaper_url) {
            return;
        }

        state.wallpaperRetryTimer = setTimeout(function () {
            state.wallpaperRetryTimer = null;
            refreshWallpaperDownloadUrl(reason || 'scheduled-retry', true);
        }, 4000);
    }

    async function refreshWallpaperDownloadUrl(reason, force) {
        if (!state.theme || !state.theme.wallpaper_url) return;

        var now = Date.now();
        var withinCooldown = (now - state.wallpaperLastRefreshAt) < WALLPAPER_REFRESH_COOLDOWN_MS;
        if (state.wallpaperRefreshInFlight) return;
        if (!force && state.wallpaperLastRefreshAt && withinCooldown) return;

        state.wallpaperRefreshInFlight = true;
        state.wallpaperLastRefreshAt = now;

        try {
            var layoutData = await apiGet('/layout');
            var latestTheme = mergeThemeWithSignedUrlFallback(state.theme, layoutData.theme);

            if (!latestTheme.wallpaper_url) {
                return;
            }

            state.theme.wallpaper_url = latestTheme.wallpaper_url;
            state.theme.wallpaper_download_url = latestTheme.wallpaper_download_url || null;
            state.theme.wallpaper_preset = latestTheme.wallpaper_preset || null;

            if (state.theme.wallpaper_download_url) {
                state.wallpaperProbeFailures = 0;
                clearWallpaperRetryTimer();
            } else {
                scheduleWallpaperRefreshRetry('signed-url-still-missing');
            }

            applyTheme({ skipWallpaperProbe: !state.theme.wallpaper_download_url });
        } catch (error) {
            console.warn('[kantor-saya] refresh wallpaper signed URL failed (' + (reason || 'unknown') + '):', error);
            scheduleWallpaperRefreshRetry('refresh-failed');
        } finally {
            state.wallpaperRefreshInFlight = false;
        }
    }

    function probeCurrentWallpaperUrl() {
        if (!state.theme || !state.theme.wallpaper_url || !state.theme.wallpaper_download_url) {
            state.lastWallpaperProbeUrl = null;
            return;
        }

        var expectedUrl = state.theme.wallpaper_download_url;
        if (state.lastWallpaperProbeUrl === expectedUrl) {
            return;
        }

        state.lastWallpaperProbeUrl = expectedUrl;
        var probeToken = ++state.wallpaperProbeToken;
        var probeImage = new Image();

        probeImage.onload = function () {
            if (probeToken !== state.wallpaperProbeToken) return;
            state.wallpaperProbeFailures = 0;
        };

        probeImage.onerror = function () {
            if (probeToken !== state.wallpaperProbeToken) return;
            if (!state.theme || state.theme.wallpaper_download_url !== expectedUrl) return;

            state.wallpaperProbeFailures += 1;
            state.lastWallpaperProbeUrl = null;

            // First failure is often transient (expired edge cache / flaky mobile network).
            // Retry refresh without immediately dropping the visible wallpaper.
            if (state.wallpaperProbeFailures <= 2) {
                refreshWallpaperDownloadUrl('probe-error-retry', true);
                scheduleWallpaperRefreshRetry('probe-error-retry');
                return;
            }

            // Persistent failure: keep current theme state and keep forcing signed URL refresh.
            scheduleWallpaperRefreshRetry('probe-error-persistent');
            refreshWallpaperDownloadUrl('probe-error-persistent', true);
        };

        probeImage.src = expectedUrl;
    }

    function applyTheme(options) {
        if (!state.root || !state.theme) return;
        var nextBackground = getWallpaperBackground(state.theme);

        if (state.theme.wallpaper_download_url) {
            state.lastSuccessfulWallpaperKey = state.theme.wallpaper_url || null;
            state.lastSuccessfulWallpaperBackground = nextBackground.indexOf('url(') !== -1 ? nextBackground : null;
        } else if (
            state.theme.wallpaper_url &&
            state.theme.wallpaper_url === state.lastSuccessfulWallpaperKey &&
            state.lastSuccessfulWallpaperBackground
        ) {
            nextBackground = state.lastSuccessfulWallpaperBackground;
        }

        if (!state.theme.wallpaper_url) {
            state.lastSuccessfulWallpaperKey = null;
            state.lastSuccessfulWallpaperBackground = null;
        }

        state.root.style.setProperty('--kantor-accent', state.theme.accent_color || '#0d6efd');
        state.root.style.setProperty('background-image', nextBackground, 'important');
        state.root.style.setProperty('background-size', 'cover', 'important');
        state.root.style.setProperty('background-position', 'center', 'important');

        if (state.theme.wallpaper_url) {
            ensureWallpaperLeaseRefreshLoop();
        } else {
            clearWallpaperLeaseTimer();
        }

        ensureWallpaperGuardLoop();

        if (!state.theme.wallpaper_download_url) {
            state.lastWallpaperProbeUrl = null;
            if (state.theme.wallpaper_url) {
                var now = Date.now();
                if ((now - state.wallpaperFallbackWarnAt) > 10000) {
                    state.wallpaperFallbackWarnAt = now;
                    console.warn('[kantor-saya] wallpaper fallback active (signed URL missing, key retained)');
                }
                refreshWallpaperDownloadUrl('missing-signed-url', false);
            }
        } else if (!(options && options.skipWallpaperProbe)) {
            state.wallpaperFallbackWarnAt = 0;
            probeCurrentWallpaperUrl();
        }

        var colorInput = document.getElementById('ks-theme-color');
        if (colorInput) {
            colorInput.value = state.theme.accent_color || '#0d6efd';
        }

        var presetButtons = state.root.querySelectorAll('.ks-preset[data-preset]');
        presetButtons.forEach(function (button) {
            var preset = button.getAttribute('data-preset');
            if (preset && state.theme.wallpaper_preset === preset) {
                button.classList.add('is-selected');
            } else {
                button.classList.remove('is-selected');
            }
        });

        ensureWallpaperVisualIntegrity('apply-theme');
    }

    function getWidgetDef(widgetId) {
        return WIDGETS[widgetId] || null;
    }

    function buildWidgetInstance(widgetId, overrides) {
        var def = getWidgetDef(widgetId);
        if (!def) return null;

        var size = def.defaultSize;
        return {
            instance_id: 'w-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
            widget_id: widgetId,
            x: 0,
            y: 0,
            w: size.w,
            h: size.h,
            config: Object.assign({}, def.defaultConfig || {}, overrides && overrides.config ? overrides.config : {})
        };
    }

    function destroyWidgetRuntime(instanceId) {
        var timer = state.widgetTimers.get(instanceId);
        if (timer) {
            clearInterval(timer);
            state.widgetTimers.delete(instanceId);
        }
    }

    function removeWidget(instanceId) {
        var idx = state.layout.widgets.findIndex(function (widget) { return widget.instance_id === instanceId; });
        if (idx < 0) return;

        var item = state.grid.getGridItems().find(function (el) {
            return el.dataset && el.dataset.instanceId === instanceId;
        });
        if (item) {
            state.grid.removeWidget(item);
        }

        destroyWidgetRuntime(instanceId);
        state.layout.widgets.splice(idx, 1);
        scheduleSave();
    }

    function updateWidgetConfig(instanceId, patch) {
        var widget = state.layout.widgets.find(function (item) { return item.instance_id === instanceId; });
        if (!widget) return;
        widget.config = Object.assign({}, widget.config || {}, patch || {});
        scheduleSave();
    }

    function setWidgetConfig(instanceId, nextConfig) {
        var widget = state.layout.widgets.find(function (item) { return item.instance_id === instanceId; });
        if (!widget) return;
        widget.config = nextConfig || {};
        scheduleSave();
    }

    function setEditMode(enabled) {
        state.editMode = !!enabled;

        if (state.grid) {
            state.grid.enableMove(state.editMode);
            state.grid.enableResize(state.editMode);
        }

        var liveRoot = getLiveRoot();
        if (liveRoot) {
            state.root = liveRoot;
        }

        if (state.root) {
            state.root.classList.toggle('ks-edit-mode', state.editMode);
            state.root.classList.toggle('ks-editing', state.editMode);
        }

        var btn = document.getElementById('ks-btn-edit');
        if (btn) {
            btn.classList.toggle('btn-primary', state.editMode);
            btn.classList.toggle('btn-outline-primary', !state.editMode);
            btn.innerHTML = state.editMode
                ? '<i class="fas fa-lock-open mr-1"></i>Mode Edit ON'
                : '<i class="fas fa-pen mr-1"></i>Mode Edit';
        }
    }

    function scheduleSave() {
        if (state.isHydrating || !state.layout) return;

        if (state.saveTimer) {
            clearTimeout(state.saveTimer);
        }

        state.saveTimer = setTimeout(function () {
            saveLayout().catch(function (error) {
                console.error('[kantor-saya] save error:', error);
            });
        }, 1500);
    }

    async function saveLayout() {
        if (!state.layout) return;

        var payload = {
            layout: state.layout,
            theme: state.theme
        };

        var data = await apiPut('/layout', payload);
        if (data) {
            var previousTheme = state.theme;
            state.layout = normalizeLayout(data.layout || state.layout);
            state.theme = mergeThemeWithSignedUrlFallback(previousTheme, data.theme || previousTheme);
            applyTheme();
            updateLastSavedLabel(data.updated_at || new Date().toISOString());
        }
    }

    async function reloadLayoutFromServer(options) {
        if (!state.grid) return;

        var keepEditMode = !!(options && options.keepEditMode);
        var nextEditMode = keepEditMode && state.editMode;

        state.isHydrating = true;
        try {
            var previousTheme = state.theme;
            var layoutData = await apiGet('/layout');
            state.layout = normalizeLayout(layoutData.layout);
            state.theme = mergeThemeWithSignedUrlFallback(previousTheme, layoutData.theme);

            applyTheme();
            renderGrid();
            setEditMode(nextEditMode);
            updateLastSavedLabel(layoutData.updated_at || null);
        } finally {
            state.isHydrating = false;
        }
    }

    function cacheFetch(key, fetcher, forceRefresh) {
        var now = Date.now();
        var cacheEntry = state.cache.get(key);

        if (!forceRefresh && cacheEntry && cacheEntry.data && cacheEntry.expiresAt > now) {
            return Promise.resolve(cacheEntry.data);
        }

        if (!forceRefresh && cacheEntry && cacheEntry.promise) {
            return cacheEntry.promise;
        }

        var promise = Promise.resolve()
            .then(fetcher)
            .then(function (data) {
                state.cache.set(key, {
                    data: data,
                    expiresAt: Date.now() + CACHE_TTL_MS,
                    promise: null
                });
                return data;
            })
            .catch(function (error) {
                state.cache.delete(key);
                throw error;
            });

        state.cache.set(key, {
            data: null,
            expiresAt: 0,
            promise: promise
        });

        return promise;
    }

    function renderWidgetShell(widgetInstance) {
        var def = getWidgetDef(widgetInstance.widget_id);
        var widgetLabel = def ? def.label : widgetInstance.widget_id;
        var widgetIcon = def ? def.icon : 'fa-cube';

        var item = document.createElement('div');
        item.className = 'grid-stack-item';
        item.dataset.instanceId = widgetInstance.instance_id;
        item.dataset.widgetId = widgetInstance.widget_id;

        item.innerHTML =
            '<div class="grid-stack-item-content">' +
                '<div class="ks-widget">' +
                    '<div class="ks-widget-header">' +
                        '<p class="ks-widget-title"><i class="fas ' + widgetIcon + ' mr-1"></i>' + escapeHtml(widgetLabel) + '</p>' +
                        '<div class="ks-widget-actions">' +
                            '<button type="button" class="btn btn-light btn-sm ks-refresh-btn" title="Refresh"><i class="fas fa-sync-alt"></i></button>' +
                            '<button type="button" class="btn btn-light btn-sm ks-edit-only ks-config-btn" title="Config"><i class="fas fa-cog"></i></button>' +
                            '<button type="button" class="btn btn-danger btn-sm ks-edit-only ks-delete-btn" title="Hapus"><i class="fas fa-trash"></i></button>' +
                        '</div>' +
                    '</div>' +
                    '<div class="ks-widget-body"></div>' +
                '</div>' +
            '</div>';

        return item;
    }

    function bindWidgetActions(widgetInstance, itemEl, bodyEl) {
        var refreshBtn = itemEl.querySelector('.ks-refresh-btn');
        var configBtn = itemEl.querySelector('.ks-config-btn');
        var deleteBtn = itemEl.querySelector('.ks-delete-btn');

        function guardWidgetActionButton(button) {
            if (!button) return;

            ['pointerdown', 'mousedown', 'touchstart', 'dragstart'].forEach(function (eventName) {
                button.addEventListener(eventName, function (event) {
                    event.stopPropagation();
                });
            });
        }

        function showNoConfigMessage(widgetId) {
            var def = getWidgetDef(widgetId);
            var label = def && def.label ? def.label : widgetId;
            window.alert('Widget "' + label + '" belum memiliki pengaturan tambahan.');
        }

        guardWidgetActionButton(refreshBtn);
        guardWidgetActionButton(configBtn);
        guardWidgetActionButton(deleteBtn);

        if (refreshBtn) {
            refreshBtn.addEventListener('click', function (event) {
                event.preventDefault();
                event.stopPropagation();
                renderWidget(widgetInstance, bodyEl, true);
            });
        }

        if (configBtn) {
            configBtn.addEventListener('click', function (event) {
                event.preventDefault();
                event.stopPropagation();

                var def = getWidgetDef(widgetInstance.widget_id);
                if (def && typeof def.configure === 'function') {
                    def.configure(widgetInstance);
                    return;
                }

                showNoConfigMessage(widgetInstance.widget_id);
            });
        }

        if (deleteBtn) {
            deleteBtn.addEventListener('click', function (event) {
                event.preventDefault();
                event.stopPropagation();
                removeWidget(widgetInstance.instance_id);
            });
        }
    }

    function renderGrid() {
        if (!state.grid || !state.layout) return;

        state.isRendering = true;
        state.grid.removeAll(true);

        state.layout.widgets.forEach(function (widget) {
            var def = getWidgetDef(widget.widget_id);
            if (!def) return;

            var shell = renderWidgetShell(widget);
            var size = def.defaultSize || { minW: 2, minH: 2 };
            var minW = Number.isFinite(size.minW) ? size.minW : 2;
            var minH = 1;

            state.grid.addWidget(shell, {
                x: widget.x,
                y: widget.y,
                w: widget.w,
                h: widget.h,
                minW: minW,
                minH: minH
            });

            var body = shell.querySelector('.ks-widget-body');
            bindWidgetActions(widget, shell, body);
            renderWidget(widget, body, false);
        });

        setTimeout(function () {
            state.isRendering = false;
        }, 0);
    }

    function renderWidget(widgetInstance, bodyEl, forceRefresh) {
        if (!bodyEl) return;

        var def = getWidgetDef(widgetInstance.widget_id);
        if (!def || typeof def.render !== 'function') {
            bodyEl.innerHTML = '<div class="ks-empty">Widget belum tersedia.</div>';
            return;
        }

        destroyWidgetRuntime(widgetInstance.instance_id);
        bodyEl.innerHTML = '<div class="text-muted"><i class="fas fa-spinner fa-spin mr-1"></i>Memuat...</div>';

        Promise.resolve()
            .then(function () {
                return def.render(widgetInstance, bodyEl, !!forceRefresh);
            })
            .catch(function (error) {
                console.error('[kantor-saya] render widget error:', widgetInstance.widget_id, error);
                bodyEl.innerHTML = '<div class="text-danger">Gagal memuat widget.</div>';
            });
    }

    function bindGridEvents() {
        if (!state.grid) return;

        state.grid.on('change', function (_event, items) {
            if (state.isRendering || !Array.isArray(items) || !items.length) {
                return;
            }

            items.forEach(function (item) {
                var instanceId = item.el && item.el.dataset ? item.el.dataset.instanceId : null;
                if (!instanceId) return;

                var widget = state.layout.widgets.find(function (entry) {
                    return entry.instance_id === instanceId;
                });

                if (!widget) return;
                widget.x = Number.isFinite(item.x) ? item.x : widget.x;
                widget.y = Number.isFinite(item.y) ? item.y : widget.y;
                widget.w = Number.isFinite(item.w) ? item.w : widget.w;
                widget.h = Number.isFinite(item.h) ? item.h : widget.h;
            });

            scheduleSave();
        });
    }

    function renderWidgetCatalog() {
        var catalog = document.getElementById('ks-widget-catalog');
        if (!catalog) return;

        var html = Object.keys(WIDGETS).map(function (widgetId) {
            var def = WIDGETS[widgetId];
            return (
                '<button type="button" class="ks-widget-option" data-widget-id="' + widgetId + '">' +
                    '<div class="font-weight-bold"><i class="fas ' + def.icon + ' mr-2"></i>' + escapeHtml(def.label) + '</div>' +
                    '<small class="text-muted">Ukuran default: ' + def.defaultSize.w + 'x' + def.defaultSize.h + '</small>' +
                '</button>'
            );
        }).join('');

        catalog.innerHTML = html;

        catalog.querySelectorAll('[data-widget-id]').forEach(function (button) {
            button.addEventListener('click', function () {
                var widgetId = button.getAttribute('data-widget-id');
                addWidget(widgetId);
                hideModal('ks-widget-modal');
            });
        });
    }

    function addWidget(widgetId) {
        var instance = buildWidgetInstance(widgetId);
        if (!instance) return;

        var maxY = state.layout.widgets.reduce(function (acc, item) {
            return Math.max(acc, Number(item.y || 0) + Number(item.h || 0));
        }, 0);

        instance.x = 0;
        instance.y = maxY;

        state.layout.widgets.push(instance);
        renderGrid();
        scheduleSave();
    }

    function bindToolbar() {
        var btnEdit = document.getElementById('ks-btn-edit');
        var btnAddWidget = document.getElementById('ks-btn-add-widget');
        var btnTheme = document.getElementById('ks-btn-theme');
        var btnRefresh = document.getElementById('ks-btn-refresh');
        var btnSaveTheme = document.getElementById('ks-save-theme');
        var btnUploadWallpaper = document.getElementById('ks-btn-upload-wallpaper');
        var wallpaperFile = document.getElementById('ks-wallpaper-file');

        bindModalDismissFallback('ks-widget-modal');
        bindModalDismissFallback('ks-theme-modal');

        if (btnEdit) {
            btnEdit.onclick = function () {
                setEditMode(!state.editMode);
            };
        }

        if (btnAddWidget) {
            btnAddWidget.onclick = function () {
                renderWidgetCatalog();
                showModal('ks-widget-modal');
            };
        }

        if (btnTheme) {
            btnTheme.onclick = function () {
                var colorInput = document.getElementById('ks-theme-color');
                if (colorInput) {
                    colorInput.value = state.theme.accent_color || '#0d6efd';
                }
                showModal('ks-theme-modal');
            };
        }

        if (btnRefresh) {
            btnRefresh.onclick = function () {
                state.cache.clear();
                reloadLayoutFromServer({ keepEditMode: true }).catch(function (error) {
                    console.error('[kantor-saya] refresh layout error:', error);
                    refreshAllWidgets(true);
                });
            };
        }

        if (btnSaveTheme) {
            btnSaveTheme.onclick = function () {
                var colorInput = document.getElementById('ks-theme-color');
                if (colorInput) {
                    state.theme.accent_color = colorInput.value || '#0d6efd';
                }
                applyTheme();
                scheduleSave();
                hideModal('ks-theme-modal');
            };
        }

        if (btnUploadWallpaper && wallpaperFile) {
            btnUploadWallpaper.onclick = function () {
                wallpaperFile.click();
            };

            wallpaperFile.onchange = function () {
                if (!wallpaperFile.files || !wallpaperFile.files[0]) return;
                uploadWallpaper(wallpaperFile.files[0]).finally(function () {
                    wallpaperFile.value = '';
                });
            };
        }

        var colorInputGlobal = document.getElementById('ks-theme-color');
        if (colorInputGlobal) {
            colorInputGlobal.oninput = function () {
                state.theme.accent_color = colorInputGlobal.value || '#0d6efd';
                applyTheme();
            };
        }

        if (state.root) {
            state.root.querySelectorAll('.ks-preset[data-preset]').forEach(function (button) {
                button.onclick = function () {
                    var preset = button.getAttribute('data-preset');
                    if (!preset) return;
                    state.theme.wallpaper_preset = preset;
                    state.theme.wallpaper_url = null;
                    state.theme.wallpaper_download_url = null;
                    state.wallpaperProbeFailures = 0;
                    clearWallpaperRetryTimer();
                    applyTheme();
                    scheduleSave();
                };
            });
        }
    }

    async function uploadWallpaper(file) {
        try {
            var formData = new FormData();
            formData.append('wallpaper', file);

            var result = await apiPostForm('/wallpaper', formData);
            state.theme.wallpaper_url = result.wallpaper_url || null;
            state.theme.wallpaper_download_url = result.wallpaper_download_url || null;
            state.theme.wallpaper_preset = null;
            state.wallpaperProbeFailures = 0;
            clearWallpaperRetryTimer();

            applyTheme();
            if (state.theme.wallpaper_url && !state.theme.wallpaper_download_url) {
                refreshWallpaperDownloadUrl('upload-missing-url', true);
            }
            scheduleSave();
        } catch (error) {
            console.error('[kantor-saya] upload wallpaper error:', error);
            alert('Gagal upload wallpaper: ' + (error.message || 'Unknown error'));
        }
    }

    function refreshAllWidgets(forceRefresh) {
        if (!state.grid) return;
        state.grid.getGridItems().forEach(function (itemEl) {
            var instanceId = itemEl.dataset ? itemEl.dataset.instanceId : null;
            if (!instanceId) return;
            var widget = state.layout.widgets.find(function (entry) { return entry.instance_id === instanceId; });
            if (!widget) return;
            var bodyEl = itemEl.querySelector('.ks-widget-body');
            renderWidget(widget, bodyEl, !!forceRefresh);
        });
    }

    async function init() {
        if (state.initInFlight) {
            return;
        }

        var root = getLiveRoot();
        var gridElement = getLiveGridElement();

        if (!root || !gridElement) {
            return;
        }

        if (state.initialized && !hasStaleBindings()) {
            state.root = root;
            return;
        }

        if (state.initialized && hasStaleBindings()) {
            resetGridRuntime();
        }

        root.classList.remove('d-none');

        state.initInFlight = true;
        state.root = root;

        try {
            if (!window.GridStack) {
                throw new Error('Gridstack tidak tersedia');
            }

            await ensureGridstackCssLoaded();

            state.isHydrating = true;
            var layoutData = await apiGet('/layout');
            state.layout = normalizeLayout(layoutData.layout);
            state.theme = mergeThemeWithSignedUrlFallback(state.theme, layoutData.theme);

            state.grid = window.GridStack.init({
                column: 12,
                margin: 8,
                cellHeight: 92,
                float: true,
                disableDrag: true,
                disableResize: true,
                alwaysShowResizeHandle: true,
                resizable: { handles: 'se' },
                draggable: {
                    handle: '.ks-widget-header',
                    cancel: '.ks-widget-actions, .ks-widget-actions *'
                },
                animate: true
            }, gridElement);

            bindGridEvents();
            bindToolbar();
            applyTheme();
            renderGrid();
            renderWidgetCatalog();
            setEditMode(false);

            updateLastSavedLabel(layoutData.updated_at || null);
            state.initialized = true;
        } catch (error) {
            console.error('[kantor-saya] init error:', error);
            gridElement.innerHTML = '<div class="alert alert-danger">Gagal memuat Kantor Saya: ' + escapeHtml(error.message || 'Unknown') + '</div>';
        } finally {
            state.isHydrating = false;
            state.initInFlight = false;
        }
    }

    function onShow() {
        if (!state.initialized || hasStaleBindings()) {
            if (hasStaleBindings()) {
                resetGridRuntime();
            }
            init();
            return;
        }

        var liveRoot = getLiveRoot();
        if (liveRoot) {
            state.root = liveRoot;
        }

        if (state.root) {
            state.root.classList.remove('d-none');
        }

        if (state.theme) {
            applyTheme();
            ensureWallpaperVisualIntegrity('on-show');
        }

        bindToolbar();
        setEditMode(state.editMode);
        refreshAllWidgets(false);
    }

    function configureShortcutWidget(widgetInstance) {
        var current = Array.isArray(widgetInstance.config.pinned) ? widgetInstance.config.pinned : [];
        var value = window.prompt('Masukkan ID menu dipisah koma (contoh: nav-dashboard,nav-jadwal)', current.join(','));
        if (value === null) return;

        var next = value
            .split(',')
            .map(function (item) { return item.trim(); })
            .filter(Boolean);

        updateWidgetConfig(widgetInstance.instance_id, { pinned: next });
        refreshAllWidgets(true);
    }

    function configureExternalIframeWidget(widgetInstance) {
        var currentUrl = widgetInstance.config.url || '';
        var nextUrl = window.prompt('Masukkan URL (https://...)', currentUrl);
        if (nextUrl === null) return;

        updateWidgetConfig(widgetInstance.instance_id, { url: String(nextUrl || '').trim() });
        refreshAllWidgets(true);
    }

    function renderShortcutWidget(widgetInstance, bodyEl) {
        var pinned = Array.isArray(widgetInstance.config.pinned)
            ? widgetInstance.config.pinned
            : [];

        if (!pinned.length) {
            bodyEl.innerHTML = '<div class="ks-empty">Belum ada shortcut dipilih. Gunakan tombol config.</div>';
            return;
        }

        var html = '<div class="ks-shortcuts">';
        pinned.forEach(function (id) {
            var navText = id;
            var nav = document.querySelector('#' + safeCssEscape(id) + ' .nav-link p');
            if (nav) {
                navText = nav.textContent.trim();
            }
            html += '<button type="button" class="ks-shortcut" data-target-nav="' + escapeHtml(id) + '">' +
                escapeHtml(navText) +
                '</button>';
        });
        html += '</div>';

        bodyEl.innerHTML = html;
        bodyEl.querySelectorAll('[data-target-nav]').forEach(function (button) {
            button.addEventListener('click', function () {
                var navId = button.getAttribute('data-target-nav');
                if (!navId) return;
                var navLink = document.querySelector('#' + safeCssEscape(navId) + ' .nav-link');
                if (navLink) {
                    navLink.click();
                }
            });
        });
    }

    function renderStickyNotesWidget(widgetInstance, bodyEl) {
        var notes = Array.isArray(widgetInstance.config.notes) ? widgetInstance.config.notes : [];
        var text = notes[0] && notes[0].text ? notes[0].text : '';

        bodyEl.innerHTML = '<textarea class="ks-sticky-note" placeholder="Tulis catatan penting...">' + escapeHtml(text) + '</textarea>';

        var textarea = bodyEl.querySelector('.ks-sticky-note');
        if (!textarea) return;

        textarea.addEventListener('input', function () {
            setWidgetConfig(widgetInstance.instance_id, {
                notes: [{ id: 'note-1', color: 'yellow', text: textarea.value }]
            });
        });
    }

    function renderTodoWidget(widgetInstance, bodyEl) {
        var config = widgetInstance.config || {};
        var items = Array.isArray(config.items) ? config.items.slice() : [];

        function commit(nextItems) {
            setWidgetConfig(widgetInstance.instance_id, { items: nextItems });
        }

        function redraw() {
            var rows = items.map(function (item, index) {
                return '<div class="ks-todo-item mb-2" data-index="' + index + '">' +
                    '<input type="checkbox" class="ks-todo-check" ' + (item.done ? 'checked' : '') + '>' +
                    '<input type="text" class="form-control form-control-sm ks-todo-text" value="' + escapeHtml(item.text || '') + '">' +
                    '<button type="button" class="btn btn-sm btn-outline-danger ks-todo-remove"><i class="fas fa-times"></i></button>' +
                '</div>';
            }).join('');

            bodyEl.innerHTML =
                '<div class="mb-2">' +
                    rows +
                '</div>' +
                '<button type="button" class="btn btn-sm btn-outline-primary" id="ks-todo-add">' +
                    '<i class="fas fa-plus mr-1"></i>Tambah Item' +
                '</button>';

            bodyEl.querySelectorAll('.ks-todo-item').forEach(function (rowEl) {
                var idx = Number(rowEl.getAttribute('data-index'));
                var checkEl = rowEl.querySelector('.ks-todo-check');
                var textEl = rowEl.querySelector('.ks-todo-text');
                var removeEl = rowEl.querySelector('.ks-todo-remove');

                if (checkEl) {
                    checkEl.addEventListener('change', function () {
                        items[idx].done = !!checkEl.checked;
                        commit(items);
                    });
                }

                if (textEl) {
                    textEl.addEventListener('input', function () {
                        items[idx].text = textEl.value;
                        commit(items);
                    });
                }

                if (removeEl) {
                    removeEl.addEventListener('click', function () {
                        items.splice(idx, 1);
                        commit(items);
                        redraw();
                    });
                }
            });

            var addBtn = bodyEl.querySelector('#ks-todo-add');
            if (addBtn) {
                addBtn.addEventListener('click', function () {
                    items.push({ id: 'todo-' + Date.now(), text: '', done: false });
                    commit(items);
                    redraw();
                });
            }
        }

        redraw();
    }

    function renderJadwalJagaWidget(widgetInstance, bodyEl, forceRefresh) {
        cacheFetch(widgetInstance.instance_id + ':jadwal-jaga', function () {
            return apiGet('/widgets/jadwal-jaga');
        }, forceRefresh).then(function (data) {
            var days = data.days || [];
            if (!days.length) {
                bodyEl.innerHTML = '<div class="ks-empty">Belum ada data jadwal minggu ini.</div>';
                return;
            }

            bodyEl.innerHTML = '<ul class="ks-list">' + days.map(function (day) {
                return '<li><strong>' + escapeHtml(day.day_label) + '</strong> · ' + escapeHtml(day.date) +
                    '<span class="float-right badge ' + (day.has_duty ? 'badge-success' : 'badge-secondary') + '">' +
                    (day.has_duty ? 'Jaga' : 'Off') +
                    '</span></li>';
            }).join('') + '</ul>';
        }).catch(function (error) {
            bodyEl.innerHTML = '<div class="text-danger">' + escapeHtml(error.message || 'Gagal memuat jadwal') + '</div>';
        });
    }

    function renderPointSayaWidget(widgetInstance, bodyEl, forceRefresh) {
        cacheFetch(widgetInstance.instance_id + ':point-saya', function () {
            return apiGet('/widgets/point-saya');
        }, forceRefresh).then(function (data) {
            bodyEl.innerHTML =
                '<div class="ks-mini-grid">' +
                    '<div class="ks-stat"><div class="ks-stat-label">Total Point</div><div class="ks-stat-value">' + Number(data.total_points || 0).toLocaleString('id-ID') + '</div></div>' +
                    '<div class="ks-stat"><div class="ks-stat-label">Sesi Dirating</div><div class="ks-stat-value">' + Number(data.rated_sessions || 0).toLocaleString('id-ID') + '</div></div>' +
                    '<div class="ks-stat"><div class="ks-stat-label">Rata-Rata</div><div class="ks-stat-value">' + (Number(data.avg_rating || 0) ? Number(data.avg_rating).toFixed(2) : '-') + '</div></div>' +
                    '<div class="ks-stat"><div class="ks-stat-label">Jumlah Dinas</div><div class="ks-stat-value">' + Number(data.duty_count || 0).toLocaleString('id-ID') + '</div></div>' +
                '</div>';
        }).catch(function (error) {
            bodyEl.innerHTML = '<div class="text-danger">' + escapeHtml(error.message || 'Gagal memuat point') + '</div>';
        });
    }

    function renderBriefingHariIniWidget(widgetInstance, bodyEl, forceRefresh) {
        cacheFetch(widgetInstance.instance_id + ':briefing-hari-ini', function () {
            return apiGet('/widgets/briefing-hari-ini');
        }, forceRefresh).then(function (data) {
            bodyEl.innerHTML =
                '<ul class="ks-list">' +
                    '<li><strong>Tanggal</strong><span class="float-right">' + escapeHtml(data.date || '-') + '</span></li>' +
                    '<li><strong>Pasien Hari Ini</strong><span class="float-right">' + Number(data.patient_count || 0).toLocaleString('id-ID') + '</span></li>' +
                    '<li><strong>Status Briefing</strong><span class="float-right badge ' + (data.checked ? 'badge-success' : 'badge-secondary') + '">' + (data.checked ? 'Sudah Checklist' : 'Belum') + '</span></li>' +
                    '<li><strong>Status Kerja</strong><span class="float-right badge ' + (data.started ? 'badge-primary' : 'badge-secondary') + '">' + (data.started ? 'Sudah Start' : 'Belum') + '</span></li>' +
                '</ul>';
        }).catch(function (error) {
            bodyEl.innerHTML = '<div class="text-danger">' + escapeHtml(error.message || 'Gagal memuat briefing') + '</div>';
        });
    }

    function renderOnlineUsersWidget(widgetInstance, bodyEl, forceRefresh) {
        cacheFetch(widgetInstance.instance_id + ':online-users', function () {
            return apiGet('/widgets/online-users');
        }, forceRefresh).then(function (data) {
            var users = data.users || [];
            if (!users.length) {
                bodyEl.innerHTML = '<div class="ks-empty">Tidak ada user online saat ini.</div>';
                return;
            }

            bodyEl.innerHTML = '<ul class="ks-list">' + users.map(function (user) {
                return '<li><strong>' + escapeHtml(user.name || '-') + '</strong><br><small class="text-muted">' +
                    escapeHtml(user.role || 'staff') + ' · ' + escapeHtml(user.activity || 'Online') +
                '</small></li>';
            }).join('') + '</ul>';
        }).catch(function (error) {
            bodyEl.innerHTML = '<div class="text-danger">' + escapeHtml(error.message || 'Gagal memuat online users') + '</div>';
        });
    }

    function renderQuickSearchWidget(widgetInstance, bodyEl) {
        bodyEl.innerHTML =
            '<div class="input-group input-group-sm mb-2">' +
                '<input type="text" class="form-control" placeholder="Cari nama / ID / WhatsApp" id="ks-search-input-' + escapeHtml(widgetInstance.instance_id) + '">' +
                '<div class="input-group-append">' +
                    '<button type="button" class="btn btn-outline-secondary" id="ks-search-btn-' + escapeHtml(widgetInstance.instance_id) + '"><i class="fas fa-search"></i></button>' +
                '</div>' +
            '</div>' +
            '<div id="ks-search-results-' + escapeHtml(widgetInstance.instance_id) + '" class="ks-empty">Masukkan kata kunci untuk mulai mencari.</div>';

        var input = bodyEl.querySelector('#ks-search-input-' + safeCssEscape(widgetInstance.instance_id));
        var button = bodyEl.querySelector('#ks-search-btn-' + safeCssEscape(widgetInstance.instance_id));
        var results = bodyEl.querySelector('#ks-search-results-' + safeCssEscape(widgetInstance.instance_id));
        var debounceTimer = null;

        function runSearch() {
            var q = input.value.trim();
            if (!q) {
                results.innerHTML = '<div class="ks-empty">Masukkan kata kunci untuk mulai mencari.</div>';
                return;
            }

            results.innerHTML = '<div class="text-muted"><i class="fas fa-spinner fa-spin mr-1"></i>Mencari...</div>';
            apiGet('/widgets/quick-search-patients?q=' + encodeURIComponent(q)).then(function (data) {
                var items = data.items || [];
                if (!items.length) {
                    results.innerHTML = '<div class="ks-empty">Tidak ada hasil untuk "' + escapeHtml(q) + '".</div>';
                    return;
                }

                results.innerHTML = '<ul class="ks-list">' + items.map(function (item) {
                    return '<li><strong>' + escapeHtml(item.full_name || '-') + '</strong><br><small class="text-muted">' +
                        escapeHtml(item.id || '-') + ' · ' + escapeHtml(item.whatsapp || '-') +
                    '</small></li>';
                }).join('') + '</ul>';
            }).catch(function (error) {
                results.innerHTML = '<div class="text-danger">' + escapeHtml(error.message || 'Gagal mencari pasien') + '</div>';
            });
        }

        if (button) {
            button.addEventListener('click', runSearch);
        }

        if (input) {
            input.addEventListener('keydown', function (event) {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    runSearch();
                }
            });

            input.addEventListener('input', function () {
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(runSearch, 260);
            });
        }
    }

    function renderClockWidget(widgetInstance, bodyEl) {
        function draw() {
            var now = new Date();
            var hour = now.getHours();
            var greeting = 'Selamat Malam';
            if (hour >= 4 && hour < 11) greeting = 'Selamat Pagi';
            else if (hour >= 11 && hour < 15) greeting = 'Selamat Siang';
            else if (hour >= 15 && hour < 18) greeting = 'Selamat Sore';

            bodyEl.innerHTML =
                '<div style="font-size:28px;font-weight:700;line-height:1.1;">' + now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + '</div>' +
                '<div class="text-muted" style="font-size:12px;">' + now.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) + '</div>' +
                '<div class="mt-2" style="font-size:13px;font-weight:600;">' + greeting + '</div>';
        }

        draw();
        var intervalId = setInterval(draw, 1000);
        state.widgetTimers.set(widgetInstance.instance_id, intervalId);
    }

    function renderMiniStatsWidget(widgetInstance, bodyEl, forceRefresh) {
        cacheFetch(widgetInstance.instance_id + ':mini-stats', function () {
            return apiGet('/widgets/mini-stats');
        }, forceRefresh).then(function (data) {
            bodyEl.innerHTML =
                '<div class="ks-mini-grid">' +
                    '<div class="ks-stat"><div class="ks-stat-label">Appointment Hari Ini</div><div class="ks-stat-value">' + Number(data.appointments_today || 0).toLocaleString('id-ID') + '</div></div>' +
                    '<div class="ks-stat"><div class="ks-stat-label">Support Open</div><div class="ks-stat-value">' + Number(data.support_open || 0).toLocaleString('id-ID') + '</div></div>' +
                    '<div class="ks-stat"><div class="ks-stat-label">Q&A Open</div><div class="ks-stat-value">' + Number(data.unanswered_questions || 0).toLocaleString('id-ID') + '</div></div>' +
                    '<div class="ks-stat"><div class="ks-stat-label">Resolved Saya Hari Ini</div><div class="ks-stat-value">' + Number(data.my_resolved_today || 0).toLocaleString('id-ID') + '</div></div>' +
                '</div>';
        }).catch(function (error) {
            bodyEl.innerHTML = '<div class="text-danger">' + escapeHtml(error.message || 'Gagal memuat mini stats') + '</div>';
        });
    }

    function renderRecentPatientsWidget(widgetInstance, bodyEl, forceRefresh) {
        cacheFetch(widgetInstance.instance_id + ':recent-patients', function () {
            return apiGet('/widgets/recent-patients');
        }, forceRefresh).then(function (data) {
            var items = data.items || [];
            if (!items.length) {
                bodyEl.innerHTML = '<div class="ks-empty">Belum ada pasien terbaru.</div>';
                return;
            }

            bodyEl.innerHTML = '<ul class="ks-list">' + items.map(function (item) {
                return '<li><strong>' + escapeHtml(item.full_name || '-') + '</strong><br><small class="text-muted">' +
                    escapeHtml(item.id || '-') + ' · ' + escapeHtml(item.appointment_date || '-') +
                '</small></li>';
            }).join('') + '</ul>';
        }).catch(function (error) {
            bodyEl.innerHTML = '<div class="text-danger">' + escapeHtml(error.message || 'Gagal memuat pasien terbaru') + '</div>';
        });
    }

    function renderExternalIframeWidget(widgetInstance, bodyEl) {
        var url = String(widgetInstance.config.url || '').trim();
        if (!url) {
            bodyEl.innerHTML = '<div class="ks-empty">URL belum diset. Gunakan tombol config.</div>';
            return;
        }

        if (!/^https?:\/\//i.test(url)) {
            bodyEl.innerHTML = '<div class="ks-empty">URL harus dimulai dengan http:// atau https://</div>';
            return;
        }

        bodyEl.innerHTML =
            '<div class="mb-2"><a href="' + escapeHtml(url) + '" target="_blank" rel="noopener" class="btn btn-sm btn-outline-primary"><i class="fas fa-external-link-alt mr-1"></i>Buka di Tab Baru</a></div>' +
            '<div class="ks-iframe-wrap"><iframe src="' + escapeHtml(url) + '" loading="lazy"></iframe></div>';
    }

    function renderPomodoroWidget(widgetInstance, bodyEl) {
        var config = Object.assign({ minutes: 25, remaining: 1500 }, widgetInstance.config || {});
        var remaining = Number(config.remaining || (config.minutes * 60));
        if (!Number.isFinite(remaining) || remaining <= 0) {
            remaining = 25 * 60;
        }

        var running = false;
        var timerId = null;

        function formatSec(sec) {
            var m = Math.floor(sec / 60);
            var s = sec % 60;
            return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
        }

        function redraw() {
            bodyEl.innerHTML =
                '<div style="font-size:28px;font-weight:700;line-height:1.1;">' + formatSec(remaining) + '</div>' +
                '<div class="mt-2 d-flex" style="gap: 6px;">' +
                    '<button type="button" class="btn btn-sm btn-primary" id="ks-pomo-toggle">' + (running ? 'Pause' : 'Start') + '</button>' +
                    '<button type="button" class="btn btn-sm btn-outline-secondary" id="ks-pomo-reset">Reset</button>' +
                '</div>';

            var toggleBtn = bodyEl.querySelector('#ks-pomo-toggle');
            var resetBtn = bodyEl.querySelector('#ks-pomo-reset');

            if (toggleBtn) {
                toggleBtn.addEventListener('click', function () {
                    running = !running;
                    if (running) {
                        timerId = setInterval(function () {
                            remaining -= 1;
                            if (remaining <= 0) {
                                remaining = 0;
                                running = false;
                                clearInterval(timerId);
                                timerId = null;
                            }
                            updateWidgetConfig(widgetInstance.instance_id, { minutes: config.minutes, remaining: remaining });
                            redraw();
                        }, 1000);
                        state.widgetTimers.set(widgetInstance.instance_id, timerId);
                    } else if (timerId) {
                        clearInterval(timerId);
                        timerId = null;
                        state.widgetTimers.delete(widgetInstance.instance_id);
                    }
                    redraw();
                });
            }

            if (resetBtn) {
                resetBtn.addEventListener('click', function () {
                    if (timerId) {
                        clearInterval(timerId);
                        timerId = null;
                        state.widgetTimers.delete(widgetInstance.instance_id);
                    }
                    running = false;
                    remaining = Number((config.minutes || 25) * 60);
                    updateWidgetConfig(widgetInstance.instance_id, { minutes: config.minutes || 25, remaining: remaining });
                    redraw();
                });
            }
        }

        redraw();
    }

    function renderCalendarWidget(_widgetInstance, bodyEl) {
        var now = new Date();
        var year = now.getFullYear();
        var month = now.getMonth();
        var today = now.getDate();

        var firstDay = new Date(year, month, 1);
        var lastDay = new Date(year, month + 1, 0);
        var startOffset = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;

        var weekHeads = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
        var cells = [];

        for (var i = 0; i < startOffset; i += 1) {
            cells.push('<div class="ks-calendar-day"></div>');
        }

        for (var d = 1; d <= lastDay.getDate(); d += 1) {
            var isToday = d === today;
            cells.push('<div class="ks-calendar-day ' + (isToday ? 'is-today' : '') + '">' + d + '</div>');
        }

        bodyEl.innerHTML =
            '<div class="font-weight-bold mb-2">' + now.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' }) + '</div>' +
            '<div class="ks-calendar">' +
                weekHeads.map(function (h) { return '<div class="ks-calendar-head">' + h + '</div>'; }).join('') +
                cells.join('') +
            '</div>';
    }

    function renderBirthdayReminderWidget(widgetInstance, bodyEl, forceRefresh) {
        cacheFetch(widgetInstance.instance_id + ':birthday-reminder', function () {
            return apiGet('/widgets/birthday-reminder?days=7');
        }, forceRefresh).then(function (data) {
            var items = data.items || [];
            if (!items.length) {
                bodyEl.innerHTML = '<div class="ks-empty">Tidak ada ulang tahun dalam 7 hari ke depan.</div>';
                return;
            }

            bodyEl.innerHTML = '<ul class="ks-list">' + items.map(function (item) {
                var when = item.days_until === 0 ? 'Hari ini' : ('+' + item.days_until + ' hari');
                return '<li><strong>' + escapeHtml(item.name || '-') + '</strong><br><small class="text-muted">' +
                    escapeHtml(item.type || '-') + ' · ' + escapeHtml(item.birth_date || '-') + ' · ' + escapeHtml(when) +
                '</small></li>';
            }).join('') + '</ul>';
        }).catch(function (error) {
            bodyEl.innerHTML = '<div class="text-danger">' + escapeHtml(error.message || 'Gagal memuat ulang tahun') + '</div>';
        });
    }

    function renderInventoryAlertWidget(widgetInstance, bodyEl, forceRefresh) {
        cacheFetch(widgetInstance.instance_id + ':inventory-alert', function () {
            return apiGet('/widgets/inventory-alert');
        }, forceRefresh).then(function (data) {
            var items = data.items || [];
            if (!items.length) {
                bodyEl.innerHTML = '<div class="ks-empty">Tidak ada obat dengan stok rendah.</div>';
                return;
            }

            bodyEl.innerHTML = '<ul class="ks-list">' + items.map(function (item) {
                return '<li><strong>' + escapeHtml(item.name || '-') + '</strong><br><small class="text-muted">Stok: ' +
                    Number(item.stock || 0).toLocaleString('id-ID') + ' / Min: ' + Number(item.min_stock || 0).toLocaleString('id-ID') +
                '</small></li>';
            }).join('') + '</ul>';
        }).catch(function (error) {
            bodyEl.innerHTML = '<div class="text-danger">' + escapeHtml(error.message || 'Gagal memuat alert stok') + '</div>';
        });
    }

    function renderTanyaDokterWidget(widgetInstance, bodyEl, forceRefresh) {
        cacheFetch(widgetInstance.instance_id + ':tanya-preview', function () {
            return apiGet('/widgets/tanya-dokter-preview');
        }, forceRefresh).then(function (data) {
            var items = data.items || [];
            if (!items.length) {
                bodyEl.innerHTML = '<div class="ks-empty">Tidak ada pertanyaan open.</div>';
                return;
            }

            bodyEl.innerHTML = '<ul class="ks-list">' + items.map(function (item) {
                var text = String(item.question_text || '').trim();
                if (text.length > 85) {
                    text = text.slice(0, 85) + '...';
                }
                return '<li><strong>' + escapeHtml(item.patient_name || '-') + '</strong><br><small class="text-muted">' +
                    escapeHtml(text) +
                '</small></li>';
            }).join('') + '</ul>';
        }).catch(function (error) {
            bodyEl.innerHTML = '<div class="text-danger">' + escapeHtml(error.message || 'Gagal memuat inbox Tanya Dokter') + '</div>';
        });
    }

    function renderRecentActivityWidget(widgetInstance, bodyEl, forceRefresh) {
        cacheFetch(widgetInstance.instance_id + ':recent-activity', function () {
            return apiGet('/widgets/recent-activity');
        }, forceRefresh).then(function (data) {
            var items = data.items || [];
            if (!items.length) {
                bodyEl.innerHTML = '<div class="ks-empty">Belum ada aktivitas terbaru.</div>';
                return;
            }

            bodyEl.innerHTML = '<ul class="ks-list">' + items.map(function (item) {
                return '<li><strong>' + escapeHtml(item.action || '-') + '</strong><br><small class="text-muted">' +
                    escapeHtml(item.details || '-') + ' · ' + escapeHtml(toLocalDateTimeString(item.timestamp)) +
                '</small></li>';
            }).join('') + '</ul>';
        }).catch(function (error) {
            bodyEl.innerHTML = '<div class="text-danger">' + escapeHtml(error.message || 'Gagal memuat aktivitas') + '</div>';
        });
    }

    function renderQuoteWidget(_widgetInstance, bodyEl) {
        var now = new Date();
        var start = new Date(now.getFullYear(), 0, 0);
        var dayOfYear = Math.floor((now - start) / 86400000);
        var index = dayOfYear % QUOTES.length;

        bodyEl.innerHTML =
            '<div style="font-size:13px;line-height:1.5;">"' + escapeHtml(QUOTES[index]) + '"</div>' +
            '<div class="text-muted mt-2" style="font-size:11px;">Quote hari ini</div>';
    }

    window.kantorSaya = {
        init: init,
        onShow: onShow,
        refresh: function () {
            state.cache.clear();
            return reloadLayoutFromServer({ keepEditMode: true }).catch(function () {
                refreshAllWidgets(true);
            });
        }
    };
})();

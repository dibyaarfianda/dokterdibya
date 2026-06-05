(function () {
    'use strict';

    var API_BASE = '/api/patient-workdesk';
    var CORNER_NAME_KEY = 'patient_my_corner_name';
    var CORNER_NOTE_KEY = 'patient_my_corner_note';
    var CORNER_SHOW_NAME_KEY = 'patient_my_corner_show_name';
    var CORNER_CLOCK_SIZE_KEY = 'patient_my_corner_clock_size';
    var CORNER_CLOCK_TYPE_KEY = 'patient_my_corner_clock_type';
    var CORNER_BLOCK_ORDER_KEY = 'patient_my_corner_block_order';
    var CORNER_BLOCK_POSITIONS_KEY = 'patient_my_corner_block_positions';
    var CORNER_BLOCK_SIZES_KEY = 'patient_my_corner_block_sizes';
    var CORNER_ICON_ORDER_KEY = 'patient_my_corner_icon_order';
    var CORNER_HIDDEN_ICONS_KEY = 'patient_my_corner_hidden_icons';
    var CORNER_TITLE_FONT_KEY = 'patient_my_corner_title_font';
    var CORNER_TITLE_SIZE_KEY = 'patient_my_corner_title_size';
    var CORNER_RIBBON_TEXT_KEY = 'patient_my_corner_ribbon_text';
    var CORNER_RIBBON_COLOR_KEY = 'patient_my_corner_ribbon_color';
    var DAILY_QUOTE_CACHE_KEY = 'patient_my_corner_daily_quote';
    var USG_THUMBS_CACHE_KEY = 'patient_my_corner_usg_thumbs';
    var INTRO_SEEN_KEY = 'patient_my_corner_intro_seen_date';
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
        pendingFocus: null,
        audioContext: null,
        audioUnlocked: false,
        lastIntroSoundAt: 0,
        dragIcon: null,
        resizeBlock: null,
        suppressPastelClickUntil: 0,
        iconEditMode: false,
        iconEditTimer: null,
        iconEditIgnoreTapUntil: 0,
        selectedRoomBlockId: '',
        settledRoomBlockId: '',
        lastHapticAt: 0,
        dragGhost: null,
        dailyQuote: '',
        usgThumbs: [],
        usgThumbIndex: 0,
        ribbonHoldTimer: null,
        ribbonHoldActive: false
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

    var PASTEL_ICON_IMAGES = {
        'album-usg': 'album.png',
        'active-booking': 'jadwal.png',
        'pregnancy-tracker': 'tracker.png',
        documents: 'dokumen.png',
        'vitamin-reminder': 'vitamin.png',
        'tanya-dokter': 'tanyadokter.png',
        'personal-note': 'resume.png',
        favorites: 'favorit.png'
    };

    var TITLE_FONTS = [
        { id: 'rounded', label: 'Rounded' },
        { id: 'serif', label: 'Serif' },
        { id: 'soft', label: 'Soft' }
    ];

    var TITLE_SIZES = [
        { id: 'small', label: 'Kecil' },
        { id: 'medium', label: 'Sedang' },
        { id: 'large', label: 'Besar' }
    ];

    var ROOM_STATIC_BLOCKS = ['title', 'photo', 'clock', 'ai', 'usg'];
    var ROOM_GRID_COLUMNS = 4;
    var ROOM_GRID_ROWS = 8;

    var RIBBON_COLORS = ['pink', 'mint', 'sky', 'lemon'];
    var RIBBON_TEXT_MAX = 14;

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

    var ROOM_MOODS = [
        { id: 'auto', label: 'Otomatis', icon: 'fa-clock', copy: 'Ikuti waktu', accent: '#5c7f72' },
        { id: 'morning', label: 'Pagi', icon: 'fa-sun', copy: 'Terang lembut', accent: '#5c7f72' },
        { id: 'calm', label: 'Teduh', icon: 'fa-leaf', copy: 'Hijau hening', accent: '#4f7d68' },
        { id: 'warm', label: 'Hangat', icon: 'fa-mug-hot', copy: 'Rasa rumah', accent: '#b8704f' },
        { id: 'night', label: 'Malam', icon: 'fa-moon', copy: 'Fokus pelan', accent: '#57668f' }
    ];

    var ROOM_DECOR_GROUPS = [
        {
            key: 'wallpaper',
            label: 'Dinding',
            options: [
                { id: 'linen', label: 'Linen', icon: 'fa-grip-lines', copy: 'Halus' },
                { id: 'sunwash', label: 'Sunwash', icon: 'fa-sun', copy: 'Cerah' },
                { id: 'botanical', label: 'Botanical', icon: 'fa-leaf', copy: 'Daun tipis' }
            ]
        },
        {
            key: 'floor',
            label: 'Lantai',
            options: [
                { id: 'warm-oak', label: 'Oak', icon: 'fa-grip-lines', copy: 'Hangat' },
                { id: 'soft-mat', label: 'Mat', icon: 'fa-square', copy: 'Lembut' },
                { id: 'plain', label: 'Polos', icon: 'fa-minus', copy: 'Bersih' }
            ]
        },
        {
            key: 'lamp',
            label: 'Lampu',
            options: [
                { id: 'glow', label: 'Glow', icon: 'fa-lightbulb', copy: 'Lembut' },
                { id: 'reading', label: 'Reading', icon: 'fa-book-open', copy: 'Fokus' },
                { id: 'none', label: 'Off', icon: 'fa-circle', copy: 'Minimal' }
            ]
        },
        {
            key: 'plant',
            label: 'Tanaman',
            options: [
                { id: 'leafy', label: 'Leafy', icon: 'fa-seedling', copy: 'Segar' },
                { id: 'sprout', label: 'Sprout', icon: 'fa-spa', copy: 'Kecil' },
                { id: 'none', label: 'Kosong', icon: 'fa-circle', copy: 'Lapang' }
            ]
        },
        {
            key: 'frame',
            label: 'Frame',
            options: [
                { id: 'memory', label: 'Memory', icon: 'fa-image', copy: 'Kenangan' },
                { id: 'quote', label: 'Quote', icon: 'fa-quote-left', copy: 'Kata' },
                { id: 'none', label: 'Kosong', icon: 'fa-circle', copy: 'Tenang' }
            ]
        }
    ];

    var ROOM_STYLE_PRESETS = [
        {
            id: 'quiet',
            label: 'Hening',
            copy: 'Ruang lega, sedikit benda, cocok untuk masuk dan diam sebentar.',
            icon: 'fa-circle',
            accent: '#5c7f72',
            mood: 'auto',
            wallpaper: 'linen',
            floor: 'plain',
            lamp: 'glow',
            plant: 'sprout',
            frame: 'none'
        },
        {
            id: 'natural',
            label: 'Natural',
            copy: 'Ada tanaman kecil dan dinding lebih hidup, tapi tetap lapang.',
            icon: 'fa-seedling',
            accent: '#4f7d68',
            mood: 'auto',
            wallpaper: 'botanical',
            floor: 'warm-oak',
            lamp: 'glow',
            plant: 'leafy',
            frame: 'memory'
        },
        {
            id: 'hangat',
            label: 'Hangat',
            copy: 'Lebih personal untuk malam, dengan cahaya dan warna lembut.',
            icon: 'fa-mug-hot',
            accent: '#b8704f',
            mood: 'auto',
            wallpaper: 'sunwash',
            floor: 'warm-oak',
            lamp: 'reading',
            plant: 'sprout',
            frame: 'quote'
        }
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

    function getStoredProfile() {
        try {
            return JSON.parse(localStorage.getItem('patient_user') || localStorage.getItem('patient_profile') || '{}') || {};
        } catch (_error) {
            return {};
        }
    }

    function getProfilePhotoUrl() {
        var profile = Object.assign({}, getStoredProfile(), window.currentProfile || {});
        return profile.profile_picture || profile.photo_url || profile.photoUrl || profile.avatar_url || profile.picture || '';
    }

    function getPatientDisplayName() {
        var profile = window.currentProfile || {};
        return normalizeText(profile.fullname || profile.full_name || profile.name, getPatientFirstName());
    }

    function getTodayKey() {
        var now = new Date();
        return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
    }

    function getStoredIconOrder() {
        try {
            var parsed = JSON.parse(localStorage.getItem(CORNER_ICON_ORDER_KEY) || '[]');
            return Array.isArray(parsed) ? parsed.filter(function (id) { return ROOM_ITEMS[id]; }) : [];
        } catch (_error) {
            return [];
        }
    }

    function isValidRoomBlockId(id) {
        if (ROOM_STATIC_BLOCKS.indexOf(id) !== -1) return true;
        return typeof id === 'string' && id.indexOf('icon:') === 0 && !!ROOM_ITEMS[id.slice(5)];
    }

    function getStoredBlockOrder() {
        try {
            var parsed = JSON.parse(localStorage.getItem(CORNER_BLOCK_ORDER_KEY) || '[]');
            return Array.isArray(parsed) ? parsed.filter(isValidRoomBlockId) : [];
        } catch (_error) {
            return [];
        }
    }

    function getStoredBlockPositions() {
        try {
            var parsed = JSON.parse(localStorage.getItem(CORNER_BLOCK_POSITIONS_KEY) || '{}');
            return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
        } catch (_error) {
            return {};
        }
    }

    function getStoredBlockSizes() {
        try {
            var parsed = JSON.parse(localStorage.getItem(CORNER_BLOCK_SIZES_KEY) || '{}');
            return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
        } catch (_error) {
            return {};
        }
    }

    function getStoredHiddenIcons() {
        try {
            var parsed = JSON.parse(localStorage.getItem(CORNER_HIDDEN_ICONS_KEY) || '[]');
            return Array.isArray(parsed) ? parsed.filter(function (id) { return ROOM_ITEMS[id]; }) : [];
        } catch (_error) {
            return [];
        }
    }

    function getStoredClockSize() {
        var value = localStorage.getItem(CORNER_CLOCK_SIZE_KEY) || 'medium';
        return ['small', 'medium', 'large'].indexOf(value) === -1 ? 'medium' : value;
    }

    function getStoredClockType() {
        var value = localStorage.getItem(CORNER_CLOCK_TYPE_KEY) || 'analog';
        return value === 'analog' ? 'analog' : 'digital';
    }

    function getStoredTitleFont() {
        var value = localStorage.getItem(CORNER_TITLE_FONT_KEY) || 'rounded';
        return TITLE_FONTS.some(function (item) { return item.id === value; }) ? value : 'rounded';
    }

    function getStoredTitleSize() {
        var value = localStorage.getItem(CORNER_TITLE_SIZE_KEY) || 'medium';
        return TITLE_SIZES.some(function (item) { return item.id === value; }) ? value : 'medium';
    }

    function limitRibbonText(value, fallback) {
        return normalizeText(value, fallback || 'Ruang kecil').slice(0, RIBBON_TEXT_MAX);
    }

    function getStoredRibbonText() {
        return limitRibbonText(localStorage.getItem(CORNER_RIBBON_TEXT_KEY), 'Ruang kecil');
    }

    function getStoredRibbonColor() {
        var value = localStorage.getItem(CORNER_RIBBON_COLOR_KEY) || 'pink';
        return RIBBON_COLORS.indexOf(value) === -1 ? 'pink' : value;
    }

    function getGreetingByHour(date) {
        var hour = date.getHours();
        if (hour >= 4 && hour < 11) return 'Selamat pagi';
        if (hour >= 11 && hour < 15) return 'Selamat siang';
        if (hour >= 15 && hour < 18) return 'Selamat sore';
        return 'Selamat malam';
    }

    function getPastelDateInfo() {
        var now = new Date();
        var day = now.toLocaleDateString('id-ID', { weekday: 'long' });
        var date = now.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
        var time = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }).replace('.', ':');
        return { day: day, date: date, time: time, greeting: getGreetingByHour(now) };
    }

    function getDailyQuoteFallback() {
        var quotes = [
            'Tubuhmu sedang bekerja dengan cara yang lembut. Beri ia waktu, napas, dan kepercayaan hari ini.',
            'Tidak semua hari harus kuat. Kadang cukup hadir, minum air, dan memilih satu langkah kecil yang baik.',
            'Perjalanan menjadi ibu tidak perlu sempurna untuk tetap indah. Pelan-pelan juga sampai.',
            'Hari ini, rawat dirimu seperti seseorang yang sangat kamu sayangi.',
            'Dengarkan tubuhmu. Ia sering bicara pelan, tapi selalu berusaha menjagamu.',
            'Istirahat bukan berhenti. Istirahat adalah cara tubuh menyiapkan tenaga untuk melanjutkan.',
            'Ada banyak hal yang belum pasti, tapi kamu tidak harus memikul semuanya sekaligus.'
        ];
        return quotes[(new Date().getDate() - 1) % quotes.length];
    }

    function isPlaceholderDailyQuote(value) {
        var text = normalizeText(value, '').toLowerCase();
        if (!text) return true;
        return text.indexOf('quote otomatis') !== -1 ||
            text.indexOf('portal wanita sehat') !== -1 ||
            text.indexOf('sisiwanita untuk hari ini') !== -1;
    }

    function getFallbackData() {
        var firstName = getPatientFirstName();
        var cornerName = localStorage.getItem(CORNER_NAME_KEY) || ('Ruang ' + firstName);
        var note = localStorage.getItem(CORNER_NOTE_KEY) || DEFAULT_NOTE;
        var showRoomName = localStorage.getItem(CORNER_SHOW_NAME_KEY) !== '0';
        return {
            layout: {
                version: 1,
                mode: 'mobile-stack',
                pastel_block_order: getStoredBlockOrder(),
                pastel_block_positions: getStoredBlockPositions(),
                pastel_block_sizes: getStoredBlockSizes(),
                pastel_icon_order: getStoredIconOrder(),
                pastel_hidden_icons: getStoredHiddenIcons(),
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
                accent: '#5c7f72',
                mood: 'auto',
                style: 'quiet',
                show_room_name: showRoomName,
                clock_widget_size: getStoredClockSize(),
                clock_widget_type: getStoredClockType(),
                title_font: getStoredTitleFont(),
                title_size: getStoredTitleSize(),
                ribbon_text: getStoredRibbonText(),
                ribbon_color: getStoredRibbonColor(),
                wallpaper: 'linen',
                floor: 'plain',
                lamp: 'glow',
                plant: 'sprout',
                frame: 'none'
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

    function persistRoomPreferences() {
        if (!state.data) return;
        var theme = state.data.theme || {};
        var layout = state.data.layout || {};
        localStorage.setItem(CORNER_CLOCK_SIZE_KEY, theme.clock_widget_size || 'medium');
        localStorage.setItem(CORNER_CLOCK_TYPE_KEY, theme.clock_widget_type || 'digital');
        localStorage.setItem(CORNER_TITLE_FONT_KEY, theme.title_font || 'rounded');
        localStorage.setItem(CORNER_TITLE_SIZE_KEY, theme.title_size || 'medium');
        localStorage.setItem(CORNER_RIBBON_TEXT_KEY, limitRibbonText(theme.ribbon_text, getStoredRibbonText()));
        localStorage.setItem(CORNER_RIBBON_COLOR_KEY, theme.ribbon_color || getStoredRibbonColor());
        localStorage.setItem(CORNER_HIDDEN_ICONS_KEY, JSON.stringify(Array.isArray(layout.pastel_hidden_icons) ? layout.pastel_hidden_icons : []));
        if (Array.isArray(layout.pastel_block_order)) {
            localStorage.setItem(CORNER_BLOCK_ORDER_KEY, JSON.stringify(layout.pastel_block_order));
        }
        if (layout.pastel_block_positions && typeof layout.pastel_block_positions === 'object') {
            localStorage.setItem(CORNER_BLOCK_POSITIONS_KEY, JSON.stringify(layout.pastel_block_positions));
        }
        if (layout.pastel_block_sizes && typeof layout.pastel_block_sizes === 'object') {
            localStorage.setItem(CORNER_BLOCK_SIZES_KEY, JSON.stringify(layout.pastel_block_sizes));
        }
        if (Array.isArray(layout.pastel_icon_order)) {
            localStorage.setItem(CORNER_ICON_ORDER_KEY, JSON.stringify(layout.pastel_icon_order));
        }
    }

    function findChoice(options, value) {
        return options.find(function (option) { return option.id === value; }) || options[0];
    }

    function findDecorGroup(key) {
        return ROOM_DECOR_GROUPS.find(function (group) { return group.key === key; });
    }

    function findRoomStyle(value) {
        return ROOM_STYLE_PRESETS.find(function (preset) { return preset.id === value; }) || ROOM_STYLE_PRESETS[0];
    }

    function getClockMoodId() {
        var hour = new Date().getHours();
        if (hour >= 18 || hour < 5) return 'night';
        if (hour >= 5 && hour < 11) return 'morning';
        return 'calm';
    }

    function getResolvedMood(theme) {
        var rawMood = theme && theme.mood ? theme.mood : 'auto';
        var moodId = rawMood === 'auto' ? getClockMoodId() : rawMood;
        return findChoice(ROOM_MOODS.filter(function (item) { return item.id !== 'auto'; }), moodId);
    }

    function getThemeClass(theme, key, prefix) {
        var group = findDecorGroup(key);
        var value = group ? findChoice(group.options, theme[key]).id : theme[key];
        return prefix + '-' + String(value || '').replace(/[^a-z0-9-]/gi, '-');
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
        var mood = getResolvedMood(theme);
        var cornerName = document.getElementById('corner-name');
        var cornerTitle = document.getElementById('corner-card-title');
        var cornerDesc = document.getElementById('corner-desc');
        if (cornerName) cornerName.textContent = name;
        if (cornerTitle) cornerTitle.textContent = name.length > 14 ? 'Ruang' : name;
        if (cornerDesc) cornerDesc.textContent = note;
        document.documentElement.style.setProperty('--pmc-accent', theme.accent || mood.accent || '#5c7f72');
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
        var localShowName = localStorage.getItem(CORNER_SHOW_NAME_KEY);
        if (!localName && !localNote && localShowName == null) return;
        if (!state.data) return;
        if (localName) state.data.theme.corner_name = localName;
        if (localNote) state.data.theme.note = localNote;
        if (localShowName != null) state.data.theme.show_room_name = localShowName !== '0';
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
            if (showMessage !== false) {
                renderPanel();
                if (window.showToast) window.showToast('Ruang tersimpan');
            }
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
        root.innerHTML = '<div class="pmc-backdrop" data-pmc-close="1"></div><div class="pmc-entry-overlay" onclick="PatientMyCorner.skipIntro()"><div class="pmc-entry-stage" aria-hidden="true"><span class="pmc-entry-door pmc-entry-door-left"></span><span class="pmc-entry-door pmc-entry-door-right"></span><span class="pmc-entry-threshold"></span><span class="pmc-entry-light"></span></div><div class="pmc-entry-copy"><strong id="pmc-entry-room">Ruang Saya</strong></div></div><section class="pmc-shell" role="dialog" aria-modal="true" aria-label="Ruang Saya"><div id="pmc-panel"></div></section>';
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
        var hidden = state.data && state.data.layout && Array.isArray(state.data.layout.pastel_hidden_icons)
            ? state.data.layout.pastel_hidden_icons
            : getStoredHiddenIcons();
        ids = ids.filter(function (id) { return hidden.indexOf(id) === -1; });
        var order = state.data && state.data.layout && Array.isArray(state.data.layout.pastel_icon_order)
            ? state.data.layout.pastel_icon_order
            : getStoredIconOrder();
        var sortedIds = [];
        order.forEach(function (id) {
            if (ids.indexOf(id) !== -1 && sortedIds.indexOf(id) === -1) sortedIds.push(id);
        });
        ids.forEach(function (id) {
            if (sortedIds.indexOf(id) === -1) sortedIds.push(id);
        });
        return sortedIds.map(function (id) { return Object.assign({ id: id }, ROOM_ITEMS[id]); });
    }

    function getVisibleRoomBlockIds(theme) {
        var ids = [];
        if (!theme || theme.show_room_name !== false) ids.push('title');
        ids.push('photo', 'clock', 'ai', 'usg');
        getVisibleRoomItems().slice(0, 8).forEach(function (item) { ids.push('icon:' + item.id); });
        var savedOrder = state.data && state.data.layout && Array.isArray(state.data.layout.pastel_block_order)
            ? state.data.layout.pastel_block_order
            : [];
        var order = savedOrder.length ? savedOrder : getStoredBlockOrder();
        var sortedIds = [];
        order.forEach(function (id) {
            if (ids.indexOf(id) !== -1 && sortedIds.indexOf(id) === -1) sortedIds.push(id);
        });
        ids.forEach(function (id) {
            if (sortedIds.indexOf(id) === -1) sortedIds.push(id);
        });
        return sortedIds;
    }

    function getDefaultRoomBlockSpan(id) {
        if (id === 'title' || id === 'ribbon') return { colSpan: 2, rowSpan: 1 };
        if (id === 'photo') return { colSpan: 1, rowSpan: 1 };
        if (id === 'clock' || id === 'ai' || id === 'usg') return { colSpan: 2, rowSpan: 2 };
        return { colSpan: 1, rowSpan: 1 };
    }

    function getRoomBlockSizeBounds(id) {
        if (id === 'title') return { minCol: 2, minRow: 1, maxCol: 4, maxRow: 1 };
        if (id === 'photo') return { minCol: 1, minRow: 1, maxCol: 2, maxRow: 2 };
        if (id === 'usg') return { minCol: 2, minRow: 2, maxCol: 4, maxRow: 3 };
        if (id === 'clock' || id === 'ai') return { minCol: 2, minRow: 2, maxCol: 4, maxRow: 2 };
        if (typeof id === 'string' && id.indexOf('icon:') === 0) return { minCol: 1, minRow: 1, maxCol: 2, maxRow: 2 };
        return { minCol: 1, minRow: 1, maxCol: 4, maxRow: 4 };
    }

    function normalizeRoomBlockSize(id, size) {
        var fallback = getDefaultRoomBlockSpan(id);
        var bounds = getRoomBlockSizeBounds(id);
        var colSpan = Number(size && size.colSpan) || fallback.colSpan;
        var rowSpan = Number(size && size.rowSpan) || fallback.rowSpan;
        colSpan = Math.max(bounds.minCol, Math.min(bounds.maxCol, Math.min(ROOM_GRID_COLUMNS, Math.round(colSpan))));
        rowSpan = Math.max(bounds.minRow, Math.min(bounds.maxRow, Math.min(ROOM_GRID_ROWS, Math.round(rowSpan))));
        return { colSpan: colSpan, rowSpan: rowSpan };
    }

    function getRoomBlockSpan(id) {
        var sizes = state.data && state.data.layout && state.data.layout.pastel_block_sizes && typeof state.data.layout.pastel_block_sizes === 'object'
            ? state.data.layout.pastel_block_sizes
            : getStoredBlockSizes();
        return normalizeRoomBlockSize(id, sizes[id]);
    }

    function normalizeRoomBlockPosition(id, position) {
        var span = getRoomBlockSpan(id);
        var col = Number(position && position.col) || 1;
        var row = Number(position && position.row) || 1;
        col = Math.max(1, Math.min(ROOM_GRID_COLUMNS - span.colSpan + 1, col));
        row = Math.max(1, Math.min(ROOM_GRID_ROWS - span.rowSpan + 1, row));
        return { col: col, row: row };
    }

    function normalizeRoomBlockPositionForSize(position, size) {
        var col = Number(position && position.col) || 1;
        var row = Number(position && position.row) || 1;
        col = Math.max(1, Math.min(ROOM_GRID_COLUMNS - size.colSpan + 1, col));
        row = Math.max(1, Math.min(ROOM_GRID_ROWS - size.rowSpan + 1, row));
        return { col: col, row: row };
    }

    function canPlaceRoomBlock(occupied, id, col, row) {
        var span = getRoomBlockSpan(id);
        if (col < 1 || row < 1 || col + span.colSpan - 1 > ROOM_GRID_COLUMNS || row + span.rowSpan - 1 > ROOM_GRID_ROWS) return false;
        for (var gridRow = row; gridRow < row + span.rowSpan; gridRow += 1) {
            for (var gridCol = col; gridCol < col + span.colSpan; gridCol += 1) {
                if (occupied[gridRow + ':' + gridCol]) return false;
            }
        }
        return true;
    }

    function markRoomBlockOccupied(occupied, id, position) {
        var span = getRoomBlockSpan(id);
        for (var gridRow = position.row; gridRow < position.row + span.rowSpan; gridRow += 1) {
            for (var gridCol = position.col; gridCol < position.col + span.colSpan; gridCol += 1) {
                occupied[gridRow + ':' + gridCol] = id;
            }
        }
    }

    function getDefaultRoomBlockPositions(ids) {
        var occupied = {};
        var positions = {};
        ids.forEach(function (id) {
            var placed = false;
            for (var row = 1; row <= ROOM_GRID_ROWS && !placed; row += 1) {
                for (var col = 1; col <= ROOM_GRID_COLUMNS && !placed; col += 1) {
                    if (canPlaceRoomBlock(occupied, id, col, row)) {
                        positions[id] = { col: col, row: row };
                        markRoomBlockOccupied(occupied, id, positions[id]);
                        placed = true;
                    }
                }
            }
        });
        return positions;
    }

    function getRoomBlockPositions(theme) {
        var ids = getVisibleRoomBlockIds(theme);
        var positions = getDefaultRoomBlockPositions(ids);
        var saved = state.data && state.data.layout && state.data.layout.pastel_block_positions && typeof state.data.layout.pastel_block_positions === 'object'
            ? state.data.layout.pastel_block_positions
            : getStoredBlockPositions();
        ids.forEach(function (id) {
            if (saved[id]) positions[id] = normalizeRoomBlockPosition(id, saved[id]);
        });
        return positions;
    }

    function resolveRoomBlockPositions(theme, priorityId) {
        var ids = getVisibleRoomBlockIds(theme);
        var positions = getRoomBlockPositions(theme);
        var occupied = {};
        var resolved = {};

        function findOpenPosition(id, preferred) {
            var normalized = normalizeRoomBlockPosition(id, preferred);
            if (canPlaceRoomBlock(occupied, id, normalized.col, normalized.row)) return normalized;
            for (var row = 1; row <= ROOM_GRID_ROWS; row += 1) {
                for (var col = 1; col <= ROOM_GRID_COLUMNS; col += 1) {
                    if (canPlaceRoomBlock(occupied, id, col, row)) return { col: col, row: row };
                }
            }
            return normalized;
        }

        if (priorityId && ids.indexOf(priorityId) !== -1) {
            resolved[priorityId] = normalizeRoomBlockPosition(priorityId, positions[priorityId]);
            markRoomBlockOccupied(occupied, priorityId, resolved[priorityId]);
        }

        sortRoomBlockIdsByPosition(ids, positions).forEach(function (id) {
            if (id === priorityId) return;
            resolved[id] = findOpenPosition(id, positions[id]);
            markRoomBlockOccupied(occupied, id, resolved[id]);
        });
        return resolved;
    }

    function getRoomGridDropPosition(event, id) {
        var grid = document.querySelector('.pmc-room-grid');
        if (!grid || !event) return null;
        var rect = grid.getBoundingClientRect();
        var span = getRoomBlockSpan(id);
        var rowHeight = rect.height / ROOM_GRID_ROWS;
        var biasedClientY = event.clientY - (rowHeight * 0.35);
        var rawCol = Math.floor(((event.clientX - rect.left) / Math.max(1, rect.width)) * ROOM_GRID_COLUMNS) + 1;
        var rawRow = Math.floor(((biasedClientY - rect.top) / Math.max(1, rect.height)) * ROOM_GRID_ROWS) + 1;
        return normalizeRoomBlockPosition(id, { col: rawCol, row: rawRow, colSpan: span.colSpan, rowSpan: span.rowSpan });
    }

    function findBlockAtGridCell(positions, sourceId, col, row) {
        return Object.keys(positions).find(function (id) {
            if (id === sourceId) return false;
            var position = positions[id];
            var span = getRoomBlockSpan(id);
            return col >= position.col && col < position.col + span.colSpan && row >= position.row && row < position.row + span.rowSpan;
        }) || '';
    }

    function sortRoomBlockIdsByPosition(ids, positions) {
        return ids.slice().sort(function (a, b) {
            var posA = positions[a] || { col: 1, row: 1 };
            var posB = positions[b] || { col: 1, row: 1 };
            if (posA.row !== posB.row) return posA.row - posB.row;
            return posA.col - posB.col;
        });
    }

    function getAllPastelRoomItems() {
        var ids = ['album-usg'];
        getWidgets().forEach(function (widget) {
            if (ROOM_ITEMS[widget.id] && ids.indexOf(widget.id) === -1) ids.push(widget.id);
        });
        return ids.map(function (id) { return Object.assign({ id: id }, ROOM_ITEMS[id]); });
    }

    function renderHeader(theme) {
        var isDecorating = state.mode === 'decorate';
        if (isDecorating) {
            return '<header class="pmc-editor-topbar"><button onclick="PatientMyCorner.setMode(\'view\')" aria-label="Lihat ruang"><i class="fa-solid fa-chevron-left"></i></button><span>Atur Ruang</span><button onclick="PatientMyCorner.close()" aria-label="Tutup"><i class="fa-solid fa-xmark"></i></button></header>';
        }
        var headerCopy = isDecorating ? 'Dekorasi dan kunjungan' : 'Pojok personal Anda';
        return '<header class="pmc-header">' +
            '<div class="pmc-header-main"><h2 class="pmc-title">Ruang Saya</h2><p class="pmc-title-sub">' + escapeHtml(headerCopy) + '</p></div>' +
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

    function renderPastelHomeIcon(item, index) {
        var icon = item.icon || WIDGET_ICONS[item.id] || 'fa-heart';
        var image = PASTEL_ICON_IMAGES[item.id] || 'favorit.png';
        return '<div class="pmc-pastel-app-icon pmc-pastel-app-icon-' + (index + 1) + '" data-pastel-icon-id="' + escapeHtml(item.id) + '">' +
            '<b class="pmc-icon-remove" onclick="PatientMyCorner.hidePastelIcon(event, \'' + escapeHtml(item.id) + '\')" aria-label="Sembunyikan ' + escapeHtml(item.label || item.id) + '">-</b>' +
            '<span style="--pmc-pastel-icon-image: url(\'/images/ruang-saya/icons-transparent/' + escapeHtml(image) + '\')"><i class="fa-solid ' + escapeHtml(icon) + '"></i></span>' +
            (item.id === 'album-usg' ? '' : '<small>' + escapeHtml(item.label || item.id) + '</small>') +
        '</div>';
    }

    function renderPastelClockWidget(theme) {
        var info = getPastelDateInfo();
        var size = ['small', 'medium', 'large'].indexOf(theme.clock_widget_size) === -1 ? 'medium' : theme.clock_widget_size;
        var type = theme.clock_widget_type === 'analog' ? 'analog' : 'digital';
        var now = new Date();
        var minuteDeg = now.getMinutes() * 6;
        var hourDeg = ((now.getHours() % 12) * 30) + (now.getMinutes() * 0.5);
        var clockFace = type === 'analog'
            ? '<div class="pmc-analog-clock" aria-label="Jam analog"><i style="--hand-deg:' + hourDeg + 'deg"></i><b style="--hand-deg:' + minuteDeg + 'deg"></b><em></em></div>'
            : '<strong>' + escapeHtml(info.time) + '</strong>';
        return '<div class="pmc-pastel-date-widget pmc-clock-size-' + escapeHtml(size) + ' pmc-clock-type-' + escapeHtml(type) + '">' +
            '<div class="pmc-date-widget-copy"><span>' + escapeHtml(info.day) + '</span>' + clockFace + '<small>' + escapeHtml(info.date) + '</small></div>' +
        '</div>';
    }

    function renderPastelAiGreeting(theme) {
        var note = normalizeText(state.dailyQuote || localStorage.getItem(DAILY_QUOTE_CACHE_KEY), getDailyQuoteFallback());
        return '<div class="pmc-pastel-ai-card"><span>Quote Hari Ini</span><p data-pmc-daily-quote="1">' + escapeHtml(note) + '</p></div>';
    }

    function ensureDailyQuoteBlockVisible() {
        var root = document.getElementById('pmc-root');
        if (!root || !root.classList.contains('is-open') || state.mode !== 'view') return false;
        var block = document.querySelector('.pmc-room-block-ai');
        var card = block ? block.querySelector('.pmc-pastel-ai-card') : null;
        var scene = document.querySelector('.pmc-room-scene');
        if (!block || !card || !scene) return false;
        var blockRect = block.getBoundingClientRect();
        var cardRect = card.getBoundingClientRect();
        var sceneRect = scene.getBoundingClientRect();
        var visible = blockRect.width > 32 && blockRect.height > 32 && cardRect.width > 32 && cardRect.height > 32 &&
            blockRect.right > sceneRect.left + 12 && blockRect.left < sceneRect.right - 12 &&
            blockRect.bottom > sceneRect.top + 12 && blockRect.top < sceneRect.bottom - 12;
        if (visible) return false;

        if (!state.data) state.data = getFallbackData();
        if (!state.data.layout) state.data.layout = getFallbackData().layout;
        if (!state.data.layout.pastel_block_positions || typeof state.data.layout.pastel_block_positions !== 'object') {
            state.data.layout.pastel_block_positions = getStoredBlockPositions();
        }
        if (!state.data.layout.pastel_block_sizes || typeof state.data.layout.pastel_block_sizes !== 'object') {
            state.data.layout.pastel_block_sizes = getStoredBlockSizes();
        }
        state.data.layout.pastel_block_sizes.ai = { colSpan: 2, rowSpan: 2 };
        state.data.layout.pastel_block_positions.ai = { col: 3, row: 2 };
        try {
            localStorage.setItem(CORNER_BLOCK_SIZES_KEY, JSON.stringify(state.data.layout.pastel_block_sizes));
            localStorage.setItem(CORNER_BLOCK_POSITIONS_KEY, JSON.stringify(state.data.layout.pastel_block_positions));
        } catch (_error) {}
        renderPanel();
        saveWorkdesk(false).catch(function () {});
        return true;
    }

    function scheduleDailyQuoteBlockVisibilityCheck() {
        [80, 420, 1200].forEach(function (delay) {
            window.setTimeout(ensureDailyQuoteBlockVisible, delay);
        });
    }

    function renderHomePhotoFrame() {
        return '<button class="pmc-home-photo-frame pmc-settings-gear-button" onclick="PatientMyCorner.setMode(\'decorate\')" aria-label="Pengaturan Ruang Saya">' +
            '<span><i class="fa-solid fa-gear"></i></span>' +
        '</button>';
    }

    function renderRibbonWidget(theme) {
        var color = RIBBON_COLORS.indexOf(theme.ribbon_color) === -1 ? getStoredRibbonColor() : theme.ribbon_color;
        var text = limitRibbonText(theme.ribbon_text, getStoredRibbonText());
        return '<span class="pmc-ribbon-widget pmc-ribbon-' + escapeHtml(color) + '" onpointerdown="PatientMyCorner.beginRibbonPress(event)" onclick="PatientMyCorner.cycleRibbonColor(event)" aria-label="Pita catatan" role="button" tabindex="0">' +
            '<span>' + escapeHtml(text) + '</span>' +
        '</span>';
    }

    function renderUsgThumbWidget() {
        var thumbs = Array.isArray(state.usgThumbs) && state.usgThumbs.length ? state.usgThumbs.slice(0, 3) : getCachedUsgThumbs().slice(0, 3);
        while (thumbs.length < 3) thumbs.push(null);
        var activeIndex = thumbs.length ? Math.abs(state.usgThumbIndex || 0) % thumbs.length : 0;
        return '<button class="pmc-usg-thumb-widget" onclick="PatientMyCorner.cycleUsgThumb(event)" oncontextmenu="event.preventDefault()" aria-label="Geser thumbnail USG">' +
            '<div class="pmc-usg-thumb-stack" style="--pmc-usg-active:' + activeIndex + '">' + thumbs.map(function (img, index) {
                return img && img.file_url
                    ? '<img class="pmc-usg-card pmc-usg-card-' + index + '" src="' + escapeHtml(img.file_url) + '" alt="Thumbnail USG ' + (index + 1) + '" loading="lazy" draggable="false" oncontextmenu="event.preventDefault()">'
                    : '<i class="pmc-usg-card pmc-usg-card-' + index + ' fa-regular fa-image"></i>';
            }).join('') + renderRibbonWidget(state.data && state.data.theme ? state.data.theme : getFallbackData().theme) + '</div></button>';
    }

    function renderRoomResizeHandle(blockId) {
        return '<span class="pmc-room-resize-frame" aria-hidden="true">' +
            '<span class="pmc-room-resize-handle pmc-room-resize-handle-nw" onpointerdown="PatientMyCorner.beginRoomBlockResize(event, \'' + escapeHtml(blockId) + '\', \'nw\')"></span>' +
            '<span class="pmc-room-resize-handle pmc-room-resize-handle-ne" onpointerdown="PatientMyCorner.beginRoomBlockResize(event, \'' + escapeHtml(blockId) + '\', \'ne\')"></span>' +
            '<span class="pmc-room-resize-handle pmc-room-resize-handle-sw" onpointerdown="PatientMyCorner.beginRoomBlockResize(event, \'' + escapeHtml(blockId) + '\', \'sw\')"></span>' +
            '<span class="pmc-room-resize-handle pmc-room-resize-handle-se" onpointerdown="PatientMyCorner.beginRoomBlockResize(event, \'' + escapeHtml(blockId) + '\', \'se\')"></span>' +
        '</span>';
    }

    function renderRoomGridBlock(blockId, index, theme, positions) {
        var blockClass = 'pmc-room-block pmc-room-block-' + blockId.replace(':', '-');
        if (state.selectedRoomBlockId === blockId) blockClass += ' is-selected';
        if (state.settledRoomBlockId === blockId) blockClass += ' is-settled';
        var span = getRoomBlockSpan(blockId);
        var position = normalizeRoomBlockPosition(blockId, positions && positions[blockId]);
        var blockStyle = 'grid-column:' + position.col + ' / span ' + span.colSpan + ';grid-row:' + position.row + ' / span ' + span.rowSpan + ';';
        var actionId = blockId;
        var content = '';
        if (blockId === 'title') {
            content = '<div class="pmc-room-title pmc-title-font-' + escapeHtml(theme.title_font || getStoredTitleFont()) + ' pmc-title-size-' + escapeHtml(theme.title_size || getStoredTitleSize()) + '" aria-label="Nama ruang"><h1>' + escapeHtml(theme.corner_name || 'Ruang Saya') + '</h1></div>';
        } else if (blockId === 'photo') {
            content = renderHomePhotoFrame();
        } else if (blockId === 'clock') {
            content = renderPastelClockWidget(theme);
        } else if (blockId === 'ai') {
            content = renderPastelAiGreeting(theme);
        } else if (blockId === 'usg') {
            content = renderUsgThumbWidget();
        } else if (blockId.indexOf('icon:') === 0) {
            var itemId = blockId.slice(5);
            var item = Object.assign({ id: itemId }, ROOM_ITEMS[itemId] || {});
            content = renderPastelHomeIcon(item, index);
        }
        return '<div class="' + escapeHtml(blockClass) + '" style="' + blockStyle + '" data-room-block-id="' + escapeHtml(blockId) + '" onpointerdown="PatientMyCorner.beginRoomBlockDrag(event, \'' + escapeHtml(blockId) + '\')" onclick="PatientMyCorner.openRoomBlock(event, \'' + escapeHtml(actionId) + '\')" oncontextmenu="event.preventDefault()" onselectstart="return false" ondragstart="return false">' + content + renderRoomResizeHandle(blockId) + '</div>';
    }

    function renderSegmentedOptions(items, activeId, handlerName) {
        return '<div class="pmc-segment-row">' + items.map(function (item) {
            return '<button class="pmc-segment-btn ' + (activeId === item.id ? 'is-active' : '') + '" onclick="PatientMyCorner.' + handlerName + '(\'' + escapeHtml(item.id) + '\')">' + escapeHtml(item.label) + '</button>';
        }).join('') + '</div>';
    }

    function renderIconVisibilitySettings() {
        var hidden = state.data && state.data.layout && Array.isArray(state.data.layout.pastel_hidden_icons) ? state.data.layout.pastel_hidden_icons : [];
        return '<section class="pmc-card pmc-icon-settings-card"><h3 class="pmc-card-title">Icon Ruang Saya</h3><p class="pmc-card-copy">Icon yang disembunyikan dari home bisa dimunculkan lagi di sini.</p><div class="pmc-icon-settings-grid">' +
            getAllPastelRoomItems().map(function (item) {
                var isHidden = hidden.indexOf(item.id) !== -1;
                return '<button class="pmc-icon-setting ' + (isHidden ? 'is-hidden' : 'is-visible') + '" onclick="PatientMyCorner.togglePastelIconVisibility(\'' + escapeHtml(item.id) + '\')"><i class="fa-solid ' + escapeHtml(item.icon || WIDGET_ICONS[item.id] || 'fa-heart') + '"></i><span>' + escapeHtml(item.label || item.id) + '</span><small>' + (isHidden ? 'Tampilkan' : 'Sembunyikan') + '</small></button>';
            }).join('') + '</div></section>';
    }

    function renderDecorationCard(item) {
        return '<article class="pmc-decoration-card">' +
            '<span class="pmc-decoration-icon"><i class="fa-solid ' + escapeHtml(item.icon) + '"></i></span>' +
            '<div><strong>' + escapeHtml(item.label) + '</strong><small>' + escapeHtml(item.copy) + '</small></div>' +
        '</article>';
    }

    function renderMoodButton(item, activeMood) {
        return '<button class="pmc-mood-btn ' + (activeMood === item.id ? 'is-active' : '') + '" onclick="PatientMyCorner.applyDecor(\'mood\', \'' + escapeHtml(item.id) + '\')" style="--mood-color:' + escapeHtml(item.accent) + '">' +
            '<span><i class="fa-solid ' + escapeHtml(item.icon) + '"></i></span><strong>' + escapeHtml(item.label) + '</strong><small>' + escapeHtml(item.copy) + '</small>' +
        '</button>';
    }

    function renderStylePresetButton(preset, activeStyle) {
        return '<button class="pmc-style-preset ' + (activeStyle === preset.id ? 'is-active' : '') + '" onclick="PatientMyCorner.applyRoomStyle(\'' + escapeHtml(preset.id) + '\')" style="--style-color:' + escapeHtml(preset.accent) + '">' +
            '<span><i class="fa-solid ' + escapeHtml(preset.icon) + '"></i></span><div><strong>' + escapeHtml(preset.label) + '</strong><small>' + escapeHtml(preset.copy) + '</small></div>' +
        '</button>';
    }

    function renderDecorOption(group, item, activeValue) {
        return '<button class="pmc-decor-option ' + (activeValue === item.id ? 'is-active' : '') + '" onclick="PatientMyCorner.applyDecor(\'' + escapeHtml(group.key) + '\', \'' + escapeHtml(item.id) + '\')">' +
            '<span><i class="fa-solid ' + escapeHtml(item.icon) + '"></i></span><strong>' + escapeHtml(item.label) + '</strong><small>' + escapeHtml(item.copy) + '</small>' +
        '</button>';
    }

    function renderDecorGroup(group, theme) {
        var activeValue = findChoice(group.options, theme[group.key]).id;
        return '<section class="pmc-decor-group"><div class="pmc-decor-group-head"><strong>' + escapeHtml(group.label) + '</strong><span>' + escapeHtml(findChoice(group.options, activeValue).label) + '</span></div>' +
            '<div class="pmc-decor-option-row">' + group.options.map(function (item) { return renderDecorOption(group, item, activeValue); }).join('') + '</div></section>';
    }

    function renderRoomShortcut(item) {
        var icon = WIDGET_ICONS[item.id] || 'fa-circle';
        var meta = item.visible === false ? 'Disembunyikan' : 'Shortcut personal';
        return '<button class="pmc-room-shortcut" onclick="PatientMyCorner.openItem(\'' + escapeHtml(item.id) + '\')">' +
            '<span><i class="fa-solid ' + escapeHtml(icon) + '"></i></span><div><strong>' + escapeHtml(item.label || item.id) + '</strong><small>' + escapeHtml(meta) + '</small></div>' +
        '</button>';
    }

    function renderRoomView(data) {
        var theme = data.theme || getFallbackData().theme;
        var layout = data.layout || getFallbackData().layout;
        var settings = data.public_settings || {};
        var favorites = Array.isArray(layout.favorites) ? layout.favorites : [];
        var quietFavorites = favorites.slice(0, 3);
        var mood = getResolvedMood(theme);
        var roomBlockIds = getVisibleRoomBlockIds(theme);
        var roomBlockPositions = resolveRoomBlockPositions(theme, 'ai');
        var sceneClass = [
            'pmc-room-scene',
            'pmc-pastel-home',
            'pmc-mood-' + mood.id,
            getThemeClass(theme, 'wallpaper', 'pmc-wall'),
            getThemeClass(theme, 'floor', 'pmc-floor'),
            getThemeClass(theme, 'lamp', 'pmc-lamp'),
            getThemeClass(theme, 'plant', 'pmc-plant'),
            getThemeClass(theme, 'frame', 'pmc-frame')
        ].join(' ');
        return '<div class="pmc-content pmc-content-room pmc-content-room-quiet">' +
            '<section class="' + escapeHtml(sceneClass) + '" aria-label="Ruang pasien pribadi">' +
                '<div class="pmc-room-wall"></div><div class="pmc-room-floor"></div>' +
                '<div class="pmc-pastel-doodle pmc-doodle-frame"><i class="fa-solid fa-image"></i><i class="fa-solid fa-cat"></i></div>' +
                '<div class="pmc-pastel-doodle pmc-doodle-sky"><i class="fa-solid fa-sun"></i><i class="fa-solid fa-cloud"></i></div>' +
                '<div class="pmc-pastel-doodle pmc-doodle-bunny"><i class="fa-solid fa-heart"></i><i class="fa-solid fa-envelope"></i></div>' +
                '<div class="pmc-room-grid" aria-label="Grid Ruang Saya 4 kali 8">' + roomBlockIds.map(function (blockId, index) { return renderRoomGridBlock(blockId, index, theme, roomBlockPositions); }).join('') + '</div>' +
            '</section>' +
            '<button class="pmc-room-edit-done" onclick="PatientMyCorner.finishRoomEdit(event)" aria-label="Selesai mengatur ruang"><i class="fa-solid fa-check"></i><span>Selesai</span></button>' +
        '</div>';
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
        var publicEnabled = !!settings.public_enabled;
        var publicWidgets = Array.isArray(settings.public_widgets) ? settings.public_widgets : [];
        var mood = getResolvedMood(theme);
        var activeStyle = theme.style || 'quiet';
        var autoMood = theme.mood === 'auto' || !theme.mood;
        var showRoomName = theme.show_room_name !== false;

        return '<div class="pmc-content pmc-decorate-content pmc-decorate-content-simple">' +
                '<section class="pmc-decor-studio">' +
                    '<div class="pmc-decor-preview pmc-mood-' + escapeHtml(mood.id) + ' ' + escapeHtml(getThemeClass(theme, 'wallpaper', 'pmc-wall')) + ' ' + escapeHtml(getThemeClass(theme, 'floor', 'pmc-floor')) + ' ' + escapeHtml(getThemeClass(theme, 'lamp', 'pmc-lamp')) + ' ' + escapeHtml(getThemeClass(theme, 'plant', 'pmc-plant')) + ' ' + escapeHtml(getThemeClass(theme, 'frame', 'pmc-frame')) + '">' +
                        '<div class="pmc-decor-preview-wall"></div><div class="pmc-decor-preview-floor"></div><div class="pmc-decor-preview-frame"><i class="fa-solid fa-image"></i></div><div class="pmc-decor-preview-plant"><i class="fa-solid fa-seedling"></i></div><div class="pmc-decor-preview-lamp"><i class="fa-solid fa-lightbulb"></i></div>' +
                    '</div>' +
                    '<div class="pmc-decor-studio-copy"><span>Ruang hidup</span><h1>' + escapeHtml(theme.corner_name || 'Ruang Saya') + '</h1><p>Ruang mengikuti waktu. Saat malam, lampu dan warna ikut meredup otomatis.</p></div>' +
                '</section>' +
                '<section class="pmc-card pmc-auto-room-card">' +
                    '<div><h3 class="pmc-card-title">Suasana otomatis</h3><p class="pmc-card-copy">Sekarang terbaca sebagai ' + escapeHtml(mood.label) + '. Biarkan aktif agar ruang berubah sendiri pagi sampai malam.</p></div>' +
                    '<button class="pmc-switch ' + (autoMood ? 'is-on' : '') + '" onclick="PatientMyCorner.applyDecor(\'mood\', \'auto\')" aria-label="Suasana otomatis"></button>' +
                '</section>' +
                '<div class="pmc-section-title">Pilih Rasa Ruang</div>' +
                '<section class="pmc-style-preset-list">' + ROOM_STYLE_PRESETS.map(function (preset) { return renderStylePresetButton(preset, activeStyle); }).join('') + '</section>' +
                '<div class="pmc-section-title">Nama dan Kalimat</div>' +
                '<section class="pmc-card pmc-identity-card">' +
                    '<div class="pmc-field"><label for="pmc-name">Nama ruang</label><input id="pmc-name" maxlength="32" value="' + escapeHtml(theme.corner_name || 'Ruang Saya') + '"></div>' +
                    '<div class="pmc-field"><label for="pmc-note">Kalimat di ruang</label><textarea id="pmc-note" maxlength="180">' + escapeHtml(theme.note || DEFAULT_NOTE) + '</textarea></div>' +
                    '<div class="pmc-card-row pmc-room-name-toggle"><div><h3 class="pmc-card-title">Tampilkan nama di dinding</h3><p class="pmc-card-copy">Nama ruang menjadi tulisan kecil yang menempel pada dinding.</p></div>' +
                    '<button class="pmc-switch ' + (showRoomName ? 'is-on' : '') + '" onclick="PatientMyCorner.toggleRoomName()" aria-label="Tampilkan nama di dinding"></button></div>' +
                    '<div class="pmc-card-row pmc-title-style-row"><div><h3 class="pmc-card-title">Font judul</h3><p class="pmc-card-copy">Pilih rasa tulisan nama ruang.</p></div></div>' + renderSegmentedOptions(TITLE_FONTS, theme.title_font || getStoredTitleFont(), 'setTitleFont') +
                    '<div class="pmc-card-row pmc-title-style-row"><div><h3 class="pmc-card-title">Ukuran judul</h3><p class="pmc-card-copy">Kecilkan atau besarkan tulisan di dinding.</p></div></div>' + renderSegmentedOptions(TITLE_SIZES, theme.title_size || getStoredTitleSize(), 'setTitleSize') +
                    '<div class="pmc-card-row pmc-title-style-row"><div><h3 class="pmc-card-title">Tipe jam</h3><p class="pmc-card-copy">Pilih analog atau angka.</p></div></div>' + renderSegmentedOptions([{ id: 'digital', label: 'Angka' }, { id: 'analog', label: 'Analog' }], theme.clock_widget_type || getStoredClockType(), 'setClockType') +
                '</section>' +
                renderIconVisibilitySettings() +
                '<section class="pmc-card pmc-public-simple-card">' +
                    '<div class="pmc-card-row"><div><h3 class="pmc-card-title">Izinkan dikunjungi</h3><p class="pmc-card-copy">Pengunjung hanya melihat versi publik yang Anda pilih. Cocok untuk menerima dukungan, bunga, dan inspirasi tanpa membuka data medis.</p></div>' +
                    '<button class="pmc-switch ' + (publicEnabled ? 'is-on' : '') + '" onclick="PatientMyCorner.togglePublic()" aria-label="Izinkan ruang dikunjungi"></button></div>' +
                    '<div class="pmc-visit-benefits"><span><i class="fa-solid fa-seedling"></i> Bunga</span><span><i class="fa-solid fa-heart"></i> Dukungan</span><span><i class="fa-solid fa-lock"></i> Aman</span></div>' +
                    (publicEnabled ? '<div class="pmc-field"><label for="pmc-public-name">Nama publik</label><input id="pmc-public-name" maxlength="32" value="' + escapeHtml(publicProfile.display_name || getPatientFirstName()) + '"></div>' +
                    '<div class="pmc-field"><label for="pmc-public-intro">Intro publik</label><textarea id="pmc-public-intro" maxlength="220">' + escapeHtml(publicProfile.intro || '') + '</textarea></div>' : '') +
                    '<div class="pmc-chip-row">' + ['intro', 'favorites', 'journey-note', 'public-links'].map(function (id) {
                        var labels = { intro: 'Sambutan', favorites: 'Favorit', 'journey-note': 'Catatan', 'public-links': 'Tautan' };
                        return '<button class="pmc-chip-btn ' + (publicWidgets.indexOf(id) !== -1 ? 'is-active' : '') + '" onclick="PatientMyCorner.togglePublicWidget(\'' + id + '\')">' + labels[id] + '</button>';
                    }).join('') + '</div>' +
                    '<div class="pmc-share-box ' + (publicEnabled && shareUrl ? 'is-visible' : '') + '">' +
                        '<span class="pmc-share-url">' + escapeHtml(shareUrl || 'Link dibuat setelah disimpan.') + '</span>' +
                        '<div class="pmc-action-row"><button class="pmc-chip-btn" onclick="PatientMyCorner.copyShareLink()"><i class="fa-solid fa-copy"></i> Salin</button><button class="pmc-chip-btn" onclick="PatientMyCorner.previewPublic()"><i class="fa-solid fa-arrow-up-right-from-square"></i> Lihat</button><button class="pmc-chip-btn" onclick="PatientMyCorner.regenerateShareCode()"><i class="fa-solid fa-rotate"></i> Ganti link</button></div>' +
                    '</div>' +
                '</section>' +
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

    function getContentScrollTop() {
        var content = document.querySelector('#pmc-panel .pmc-content');
        return content ? content.scrollTop : 0;
    }

    function restoreContentScroll(scrollTop) {
        if (!scrollTop) return;
        window.requestAnimationFrame(function () {
            var content = document.querySelector('#pmc-panel .pmc-content');
            if (content) content.scrollTop = Math.min(scrollTop, content.scrollHeight - content.clientHeight);
        });
    }

    function renderPanel(options) {
        options = options || {};
        var scrollTop = options.preserveScroll && state.mode === 'decorate' ? getContentScrollTop() : 0;
        ensureRoot();
        var panel = document.getElementById('pmc-panel');
        if (!panel) return;
        var data = state.data || getFallbackData();
        var theme = data.theme || getFallbackData().theme;
        panel.innerHTML = state.mode === 'decorate' ? renderHeader(theme) + renderDecorateView(data) : renderRoomView(data);
        focusPendingField();
        if (!state.pendingFocus) restoreContentScroll(scrollTop);
        if (state.mode === 'view') scheduleDailyQuoteBlockVisibilityCheck();
    }

    function updateEntryOverlay() {
        var data = state.data || getFallbackData();
        var theme = data.theme || getFallbackData().theme;
        var entryRoom = document.getElementById('pmc-entry-room');
        if (entryRoom) entryRoom.textContent = theme.corner_name || 'Ruang Saya';
    }

    function playIntroSound() {
        try {
            var AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) return;
            var context = state.audioContext || new AudioContext();
            state.audioContext = context;
            var ready = context.state === 'suspended' ? context.resume() : Promise.resolve();
            Promise.resolve(ready).then(function () {
                if (context.state === 'suspended') return;
                var stamp = Date.now();
                if (stamp - state.lastIntroSoundAt < 900) return;
                state.lastIntroSoundAt = stamp;
                var now = context.currentTime;
                var master = context.createGain();
                master.gain.setValueAtTime(0.0001, now);
                master.gain.exponentialRampToValueAtTime(0.28, now + 0.035);
                master.gain.exponentialRampToValueAtTime(0.0001, now + 0.78);
                master.connect(context.destination);

                var noiseBuffer = context.createBuffer(1, Math.floor(context.sampleRate * 0.42), context.sampleRate);
                var samples = noiseBuffer.getChannelData(0);
                for (var index = 0; index < samples.length; index += 1) {
                    samples[index] = (Math.random() * 2 - 1) * Math.pow(1 - index / samples.length, 1.8);
                }
                var noise = context.createBufferSource();
                noise.buffer = noiseBuffer;
                var filter = context.createBiquadFilter();
                filter.type = 'bandpass';
                filter.frequency.setValueAtTime(720, now + 0.04);
                filter.frequency.exponentialRampToValueAtTime(1800, now + 0.42);
                filter.Q.setValueAtTime(0.7, now);
                var noiseGain = context.createGain();
                noiseGain.gain.setValueAtTime(0.0001, now + 0.04);
                noiseGain.gain.exponentialRampToValueAtTime(0.82, now + 0.12);
                noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.48);
                noise.connect(filter).connect(noiseGain).connect(master);
                noise.start(now + 0.04);
                noise.stop(now + 0.52);

                var doorTone = context.createOscillator();
                doorTone.type = 'sine';
                doorTone.frequency.setValueAtTime(118, now);
                doorTone.frequency.exponentialRampToValueAtTime(72, now + 0.22);
                var doorGain = context.createGain();
                doorGain.gain.setValueAtTime(0.0001, now);
                doorGain.gain.exponentialRampToValueAtTime(0.9, now + 0.025);
                doorGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
                doorTone.connect(doorGain).connect(master);
                doorTone.start(now);
                doorTone.stop(now + 0.32);

                var airTone = context.createOscillator();
                airTone.type = 'triangle';
                airTone.frequency.setValueAtTime(420, now + 0.08);
                airTone.frequency.exponentialRampToValueAtTime(880, now + 0.58);
                var airGain = context.createGain();
                airGain.gain.setValueAtTime(0.0001, now + 0.08);
                airGain.gain.exponentialRampToValueAtTime(0.62, now + 0.22);
                airGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.64);
                airTone.connect(airGain).connect(master);
                airTone.start(now + 0.08);
                airTone.stop(now + 0.68);
            }).catch(function () {});
        } catch (error) {}
    }

    function unlockIntroAudio() {
        try {
            var AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) return;
            var context = state.audioContext || new AudioContext();
            state.audioContext = context;
            var ready = context.state === 'suspended' ? context.resume() : Promise.resolve();
            Promise.resolve(ready).then(function () {
                if (state.audioUnlocked || context.state === 'suspended') return;
                var now = context.currentTime;
                var click = context.createOscillator();
                var gain = context.createGain();
                gain.gain.setValueAtTime(0.0001, now);
                gain.gain.exponentialRampToValueAtTime(0.002, now + 0.01);
                gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.04);
                click.frequency.setValueAtTime(260, now);
                click.connect(gain).connect(context.destination);
                click.start(now);
                click.stop(now + 0.05);
                state.audioUnlocked = true;
            }).catch(function () {});
        } catch (error) {}
    }

    function finishIntro() {
        var root = document.getElementById('pmc-root');
        if (!root) return;
        root.classList.remove('is-entering', 'is-entry-short');
        root.classList.add('is-room-ready');
    }

    function startIntro() {
        var root = document.getElementById('pmc-root');
        if (!root) return;
        updateEntryOverlay();
        window.clearTimeout(state.introTimer);
        root.classList.remove('is-room-ready', 'is-entry-short');
        root.classList.add('is-entering');
        playIntroSound();
        localStorage.setItem(INTRO_SEEN_KEY, getTodayKey());
        state.introTimer = window.setTimeout(finishIntro, 3200);
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
        localStorage.setItem(CORNER_SHOW_NAME_KEY, state.data.theme.show_room_name === false ? '0' : '1');
        persistRoomPreferences();
        updateDashboard(state.data);
    }

    function renderIfOpenView() {
        var root = document.getElementById('pmc-root');
        if (root && root.classList.contains('is-open') && state.mode === 'view') renderPanel();
    }

    function clearIconEditMode() {
        window.clearTimeout(state.iconEditTimer);
        state.iconEditMode = false;
        state.selectedRoomBlockId = '';
        var root = document.getElementById('pmc-root');
        if (root) root.classList.remove('is-icon-edit-mode');
        Array.from(document.querySelectorAll('.pmc-room-block.is-hold-ready, .pmc-room-block.is-dragging, .pmc-room-block.is-selected')).forEach(function (item) {
            item.classList.remove('is-hold-ready', 'is-dragging', 'is-selected');
        });
    }

    function scheduleIconEditModeClear(delay) {
        window.clearTimeout(state.iconEditTimer);
        state.iconEditTimer = window.setTimeout(clearIconEditMode, delay || 30000);
    }

    function pulseRoomHaptic(pattern, minGap) {
        if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
        var now = Date.now();
        if (now - state.lastHapticAt < (minGap || 160)) return;
        state.lastHapticAt = now;
        try { navigator.vibrate(pattern || 8); } catch (_error) {}
    }

    function handleIconEditOutsideTap(event) {
        if (!state.iconEditMode) return;
        if (Date.now() < state.iconEditIgnoreTapUntil) return;
        var target = event && event.target;
        if (target && target.closest && target.closest('.pmc-icon-remove')) return;
        if (target && target.closest && target.closest('.pmc-room-block')) return;
        if (target && target.closest && target.closest('.pmc-room-edit-done')) return;
        clearIconEditMode();
    }

    function markRoomBlockSettled(id) {
        if (!id) return;
        state.settledRoomBlockId = id;
        var block = findRoomBlockElement(id);
        if (block) {
            block.classList.remove('is-settled');
            void block.offsetWidth;
            block.classList.add('is-settled');
        }
        window.setTimeout(function () {
            if (state.settledRoomBlockId === id) state.settledRoomBlockId = '';
            var current = findRoomBlockElement(id);
            if (current) current.classList.remove('is-settled');
        }, 460);
    }

    function removeDragGhost() {
        if (state.dragGhost && state.dragGhost.parentNode) {
            state.dragGhost.parentNode.removeChild(state.dragGhost);
        }
        state.dragGhost = null;
    }

    function moveDragGhost(event) {
        if (!state.dragGhost || !event) return;
        state.dragGhost.style.left = event.clientX + 'px';
        state.dragGhost.style.top = event.clientY + 'px';
    }

    function createDragGhost(source, event) {
        removeDragGhost();
        if (!source || !event) return;
        var rect = source.getBoundingClientRect();
        var ghost = source.cloneNode(true);
        ghost.classList.add('pmc-room-drag-ghost');
        ghost.classList.remove('is-dragging', 'is-hold-ready', 'is-selected');
        var sourceClass = String(source.className || '');
        var isLargeWidget = /pmc-room-block-(usg|clock|ai)/.test(sourceClass);
        ghost.style.width = rect.width + 'px';
        ghost.style.height = rect.height + 'px';
        ghost.style.left = event.clientX + 'px';
        ghost.style.top = event.clientY + 'px';
        ghost.style.setProperty('--pmc-drag-offset-x', '50%');
        ghost.style.setProperty('--pmc-drag-offset-y', isLargeWidget ? '62%' : '50%');
        document.body.appendChild(ghost);
        state.dragGhost = ghost;
    }

    function extractDailyQuote(body) {
        if (!body || typeof body !== 'object') return '';
        if (body.success && body.data && body.data.quote) return String(body.data.quote);
        if (body.data && body.data.text) return String(body.data.text);
        if (body.quote) return String(body.quote);
        if (body.text) return String(body.text);
        return '';
    }

    function fetchDailyQuoteFrom(url, token) {
        var headers = { 'Cache-Control': 'no-cache' };
        if (token) headers.Authorization = 'Bearer ' + token;
        return fetch(url + (url.indexOf('?') === -1 ? '?' : '&') + '_t=' + Date.now(), {
            headers: headers,
            cache: 'no-store'
        })
        .then(function (response) {
            if (!response.ok) throw new Error('Quote request failed: ' + response.status);
            return response.json();
        })
        .then(function (body) {
            var quote = extractDailyQuote(body);
            if (!quote) throw new Error('Quote empty');
            return quote;
        });
    }

    function updateDailyQuoteText(quote) {
        var text = isPlaceholderDailyQuote(quote) ? getDailyQuoteFallback() : normalizeText(quote, getDailyQuoteFallback());
        state.dailyQuote = text;
        try { localStorage.setItem(DAILY_QUOTE_CACHE_KEY, text); } catch (_error) {}
        Array.from(document.querySelectorAll('[data-pmc-daily-quote="1"]')).forEach(function (node) {
            node.textContent = text;
        });
        scheduleDailyQuoteBlockVisibilityCheck();
        return text;
    }

    function loadDailyQuote() {
        updateDailyQuoteText(localStorage.getItem(DAILY_QUOTE_CACHE_KEY) || getDailyQuoteFallback());
        var token = getToken();
        return fetchDailyQuoteFrom('/api/patients/daily-quote', token)
            .catch(function () { return fetchDailyQuoteFrom('https://sisiwanita.id/api/patients/daily-quote', token); })
            .then(function (quote) {
                updateDailyQuoteText(quote);
                return state.dailyQuote;
            })
            .catch(function () { return updateDailyQuoteText(state.dailyQuote || getDailyQuoteFallback()); });
    }

    function getCachedUsgThumbs() {
        try {
            var parsed = JSON.parse(localStorage.getItem(USG_THUMBS_CACHE_KEY) || '[]');
            return Array.isArray(parsed) ? parsed : [];
        } catch (_error) {
            return [];
        }
    }

    function loadUsgThumbnails() {
        state.usgThumbs = getCachedUsgThumbs();
        var token = getToken();
        if (!token) return Promise.resolve(state.usgThumbs);
        return fetch('/api/patient-documents/my-documents?type=usg_photo,usg_2d,usg_4d,patient_usg&_t=' + Date.now(), {
            headers: { 'Authorization': 'Bearer ' + token, 'Cache-Control': 'no-cache' },
            cache: 'no-store'
        })
        .then(function (response) { return response.json(); })
        .then(function (body) {
            var docs = body && body.success && Array.isArray(body.documents) ? body.documents : [];
            docs.sort(function (a, b) { return new Date(b.published_at || b.created_at || 0) - new Date(a.published_at || a.created_at || 0); });
            var selectedId = localStorage.getItem('usg_thumbnail_id');
            if (selectedId) {
                docs.sort(function (a, b) {
                    if (String(a.id) === selectedId) return -1;
                    if (String(b.id) === selectedId) return 1;
                    return 0;
                });
            }
            state.usgThumbs = docs.slice(0, 3).map(function (doc) {
                return { id: doc.id, file_url: doc.file_url, title: doc.title || '' };
            });
            localStorage.setItem(USG_THUMBS_CACHE_KEY, JSON.stringify(state.usgThumbs));
            renderIfOpenView();
            return state.usgThumbs;
        })
        .catch(function () { return state.usgThumbs; });
    }

    function editRibbonText() {
        if (!state.data) state.data = getFallbackData();
        if (!state.data.theme) state.data.theme = getFallbackData().theme;
        var current = limitRibbonText(state.data.theme.ribbon_text, getStoredRibbonText());
        var next = window.prompt('Tulis teks pita (maks 14 karakter)', current);
        if (next === null) return;
        next = limitRibbonText(next, current);
        state.data.theme.ribbon_text = next;
        persistRoomPreferences();
        renderPanel();
        saveWorkdesk(false).catch(function () {});
    }

    function findRoomBlockElement(id) {
        return Array.from(document.querySelectorAll('.pmc-room-block')).find(function (item) {
            return item.getAttribute('data-room-block-id') === id;
        });
    }

    function selectRoomBlock(id) {
        if (!id || !isValidRoomBlockId(id)) return;
        state.selectedRoomBlockId = id;
        Array.from(document.querySelectorAll('.pmc-room-block.is-selected')).forEach(function (item) {
            if (item.getAttribute('data-room-block-id') !== id) item.classList.remove('is-selected');
        });
        var block = findRoomBlockElement(id);
        if (block) block.classList.add('is-selected');
    }

    function reorderRoomBlock(sourceId, targetId) {
        if (!sourceId || !targetId || sourceId === targetId) return;
        if (!state.data) state.data = getFallbackData();
        if (!state.data.layout) state.data.layout = getFallbackData().layout;
        var current = getVisibleRoomBlockIds(state.data.theme || getFallbackData().theme);
        var sourceIndex = current.indexOf(sourceId);
        var targetIndex = current.indexOf(targetId);
        if (sourceIndex === -1 || targetIndex === -1) return;
        current.splice(sourceIndex, 1);
        current.splice(targetIndex, 0, sourceId);
        state.data.layout.pastel_block_order = current;
        state.data.layout.pastel_icon_order = current
            .filter(function (id) { return id.indexOf('icon:') === 0; })
            .map(function (id) { return id.slice(5); });
        persistRoomPreferences();
        updateDashboard(state.data);
        renderPanel();
        selectRoomBlock(sourceId);
        markRoomBlockSettled(sourceId);
        saveWorkdesk(false).catch(function () {});
    }

    function moveRoomBlockToPosition(sourceId, targetPosition) {
        if (!sourceId || !targetPosition) return;
        if (!state.data) state.data = getFallbackData();
        if (!state.data.layout) state.data.layout = getFallbackData().layout;
        var theme = state.data.theme || getFallbackData().theme;
        var ids = getVisibleRoomBlockIds(theme);
        var positions = getRoomBlockPositions(theme);
        if (ids.indexOf(sourceId) === -1) return;
        var sourcePosition = normalizeRoomBlockPosition(sourceId, positions[sourceId]);
        var nextPosition = normalizeRoomBlockPosition(sourceId, targetPosition);
        var targetBlockId = findBlockAtGridCell(positions, sourceId, nextPosition.col, nextPosition.row);
        positions[sourceId] = nextPosition;
        if (targetBlockId) {
            positions[targetBlockId] = normalizeRoomBlockPosition(targetBlockId, sourcePosition);
        }
        var sortedIds = sortRoomBlockIdsByPosition(ids, positions);
        state.data.layout.pastel_block_positions = positions;
        state.data.layout.pastel_block_order = sortedIds;
        state.data.layout.pastel_icon_order = sortedIds
            .filter(function (id) { return id.indexOf('icon:') === 0; })
            .map(function (id) { return id.slice(5); });
        persistRoomPreferences();
        updateDashboard(state.data);
        renderPanel();
        selectRoomBlock(sourceId);
        markRoomBlockSettled(sourceId);
        saveWorkdesk(false).catch(function () {});
    }

    function applyRoomBlockResize(blockId, nextSize, shouldRender, nextPosition) {
        if (!blockId || !isValidRoomBlockId(blockId)) return;
        if (!state.data) state.data = getFallbackData();
        if (!state.data.layout) state.data.layout = getFallbackData().layout;
        var theme = state.data.theme || getFallbackData().theme;
        var sizes = state.data.layout.pastel_block_sizes && typeof state.data.layout.pastel_block_sizes === 'object'
            ? state.data.layout.pastel_block_sizes
            : {};
        sizes[blockId] = normalizeRoomBlockSize(blockId, nextSize);
        state.data.layout.pastel_block_sizes = sizes;
        var savedPositions = getRoomBlockPositions(theme);
        if (nextPosition) savedPositions[blockId] = normalizeRoomBlockPositionForSize(nextPosition, sizes[blockId]);
        state.data.layout.pastel_block_positions = savedPositions;
        var positions = resolveRoomBlockPositions(theme, blockId);
        var sortedIds = sortRoomBlockIdsByPosition(getVisibleRoomBlockIds(theme), positions);
        state.data.layout.pastel_block_positions = positions;
        state.data.layout.pastel_block_order = sortedIds;
        state.data.layout.pastel_icon_order = sortedIds
            .filter(function (id) { return id.indexOf('icon:') === 0; })
            .map(function (id) { return id.slice(5); });
        if (shouldRender) {
            renderPanel();
            var root = document.getElementById('pmc-root');
            if (root) root.classList.add('is-icon-edit-mode', 'is-resizing-room-block');
            var block = findRoomBlockElement(blockId);
            if (block) block.classList.add('is-resizing');
        }
    }

    function finishRoomBlockResize(event) {
        var resize = state.resizeBlock;
        if (!resize) return;
        document.removeEventListener('pointermove', handleRoomBlockResizeMove);
        document.removeEventListener('pointerup', finishRoomBlockResize);
        document.removeEventListener('pointercancel', cancelRoomBlockResize);
        var root = document.getElementById('pmc-root');
        if (root) root.classList.remove('is-resizing-room-block');
        Array.from(document.querySelectorAll('.pmc-room-block.is-resizing')).forEach(function (item) { item.classList.remove('is-resizing'); });
        state.resizeBlock = null;
        state.suppressPastelClickUntil = Date.now() + 360;
        state.iconEditIgnoreTapUntil = Date.now() + 80;
        scheduleIconEditModeClear(30000);
        persistRoomPreferences();
        updateDashboard(state.data);
        renderPanel();
        selectRoomBlock(resize.id);
        markRoomBlockSettled(resize.id);
        pulseRoomHaptic([8, 24, 8], 220);
        saveWorkdesk(false).catch(function () {});
        if (event && event.preventDefault) event.preventDefault();
    }

    function cancelRoomBlockResize() {
        if (state.resizeBlock) applyRoomBlockResize(state.resizeBlock.id, state.resizeBlock.startSize, false, state.resizeBlock.startPosition);
        state.resizeBlock = null;
        document.removeEventListener('pointermove', handleRoomBlockResizeMove);
        document.removeEventListener('pointerup', finishRoomBlockResize);
        document.removeEventListener('pointercancel', cancelRoomBlockResize);
        var root = document.getElementById('pmc-root');
        if (root) root.classList.remove('is-resizing-room-block');
        renderPanel();
    }

    function handleRoomBlockResizeMove(event) {
        var resize = state.resizeBlock;
        if (!resize || !event) return;
        var dx = event.clientX - resize.startX;
        var dy = event.clientY - resize.startY;
        var deltaCol = Math.round(dx / Math.max(1, resize.cellWidth));
        var deltaRow = Math.round(dy / Math.max(1, resize.cellHeight));
        var direction = resize.direction || 'se';
        var next = normalizeRoomBlockSize(resize.id, {
            colSpan: resize.startSize.colSpan + (direction.indexOf('e') !== -1 ? deltaCol : direction.indexOf('w') !== -1 ? -deltaCol : 0),
            rowSpan: resize.startSize.rowSpan + (direction.indexOf('s') !== -1 ? deltaRow : direction.indexOf('n') !== -1 ? -deltaRow : 0)
        });
        var rightEdge = resize.startPosition.col + resize.startSize.colSpan - 1;
        var bottomEdge = resize.startPosition.row + resize.startSize.rowSpan - 1;
        var nextPosition = {
            col: direction.indexOf('w') !== -1 ? rightEdge - next.colSpan + 1 : resize.startPosition.col,
            row: direction.indexOf('n') !== -1 ? bottomEdge - next.rowSpan + 1 : resize.startPosition.row
        };
        nextPosition = normalizeRoomBlockPositionForSize(nextPosition, next);
        if (next.colSpan !== resize.currentSize.colSpan || next.rowSpan !== resize.currentSize.rowSpan || nextPosition.col !== resize.currentPosition.col || nextPosition.row !== resize.currentPosition.row) {
            resize.currentSize = next;
            resize.currentPosition = nextPosition;
            resize.moved = true;
            applyRoomBlockResize(resize.id, next, true, nextPosition);
        }
        scheduleIconEditModeClear(30000);
        if (event.preventDefault) event.preventDefault();
    }

    function reorderPastelIcon(sourceId, targetId) {
        reorderRoomBlock('icon:' + sourceId, 'icon:' + targetId);
    }

    function finishPastelIconDrag(event) {
        var drag = state.dragIcon;
        if (!drag) return;
        document.removeEventListener('pointermove', handlePastelIconMove);
        document.removeEventListener('pointerup', finishPastelIconDrag);
        document.removeEventListener('pointercancel', cancelPastelIconDrag);
        var root = document.getElementById('pmc-root');
        if (root) root.classList.remove('is-dragging-pastel-icon');
        removeDragGhost();
        var sourceButton = findRoomBlockElement(drag.id);
        if (sourceButton) sourceButton.classList.remove('is-dragging', 'is-hold-ready');
        state.dragIcon = null;
        window.clearTimeout(drag.timer);
        if (!drag.active) return;
        state.suppressPastelClickUntil = Date.now() + 420;
        state.iconEditIgnoreTapUntil = Date.now() + 80;
        scheduleIconEditModeClear(30000);
        if (!drag.moved) {
            if (drag.id === 'ribbon') editRibbonText();
            return;
        }
        moveRoomBlockToPosition(drag.id, getRoomGridDropPosition(event, drag.id));
        if (event.preventDefault) event.preventDefault();
    }

    function cancelPastelIconDrag() {
        if (state.dragIcon) window.clearTimeout(state.dragIcon.timer);
        state.dragIcon = null;
        document.removeEventListener('pointermove', handlePastelIconMove);
        document.removeEventListener('pointerup', finishPastelIconDrag);
        document.removeEventListener('pointercancel', cancelPastelIconDrag);
        var root = document.getElementById('pmc-root');
        if (root) root.classList.remove('is-dragging-pastel-icon');
        removeDragGhost();
        Array.from(document.querySelectorAll('.pmc-room-block.is-dragging, .pmc-room-block.is-hold-ready')).forEach(function (item) { item.classList.remove('is-dragging', 'is-hold-ready'); });
    }

    function handlePastelIconMove(event) {
        var drag = state.dragIcon;
        if (!drag) return;
        var dx = event.clientX - drag.startX;
        var dy = event.clientY - drag.startY;
        var distance = Math.sqrt(dx * dx + dy * dy);
        if (!drag.active && distance > 8) {
            cancelPastelIconDrag();
            return;
        }
        var moveThreshold = drag.immediate ? 3 : 10;
        if (!drag.active || (!drag.moved && distance < moveThreshold)) return;
        drag.moved = true;
        var root = document.getElementById('pmc-root');
        if (root) root.classList.add('is-dragging-pastel-icon');
        var sourceButton = findRoomBlockElement(drag.id);
        if (sourceButton) {
            sourceButton.classList.add('is-dragging');
            if (!state.dragGhost) createDragGhost(sourceButton, event);
        }
        moveDragGhost(event);
        scheduleIconEditModeClear(30000);
        pulseRoomHaptic([8, 24, 8], 220);
        if (event.preventDefault) event.preventDefault();
    }

    async function openMyCorner() {
        ensureRoot();
        unlockIntroAudio();
        state.mode = 'view';
        if (!state.loaded) {
            await loadWorkdesk();
        }
        state.dailyQuote = localStorage.getItem(DAILY_QUOTE_CACHE_KEY) || state.dailyQuote || getDailyQuoteFallback();
        state.usgThumbs = getCachedUsgThumbs();
        renderPanel();
        document.getElementById('pmc-root').classList.add('is-open');
        document.body.classList.add('pmc-open');
        startIntro();
        scheduleDailyQuoteBlockVisibilityCheck();
        loadDailyQuote().catch(function () {});
        loadUsgThumbnails().catch(function () {});
    }

    function closeMyCorner() {
        var root = document.getElementById('pmc-root');
        window.clearTimeout(state.introTimer);
        if (root) root.classList.remove('is-open', 'is-entering', 'is-entry-short', 'is-room-ready');
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
        skipIntro: finishIntro,
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
        openRoomBlock: function (event, id) {
            if (Date.now() < state.suppressPastelClickUntil) {
                if (event && event.preventDefault) event.preventDefault();
                return;
            }
            if (id === 'photo' || id === 'title' || id === 'ai') {
                this.setMode('decorate');
                return;
            }
            if (id === 'usg') {
                this.cycleUsgThumb(event);
                return;
            }
            if (id === 'ribbon') {
                this.cycleRibbonColor(event);
                return;
            }
            if (id === 'clock') return;
            if (id && id.indexOf('icon:') === 0) this.openItem(id.slice(5));
        },
        openPastelIcon: function (event, id) {
            this.openRoomBlock(event, 'icon:' + id);
        },
        finishRoomEdit: function (event) {
            if (event) {
                if (event.preventDefault) event.preventDefault();
                if (event.stopPropagation) event.stopPropagation();
            }
            pulseRoomHaptic(5, 180);
            clearIconEditMode();
        },
        beginRoomBlockResize: function (event, id, direction) {
            if (!event || event.button > 0 || !isValidRoomBlockId(id)) return;
            if (event.preventDefault) event.preventDefault();
            if (event.stopPropagation) event.stopPropagation();
            if (!state.data) state.data = getFallbackData();
            if (!state.data.layout) state.data.layout = getFallbackData().layout;
            if (!state.data.layout.pastel_block_sizes || typeof state.data.layout.pastel_block_sizes !== 'object') {
                state.data.layout.pastel_block_sizes = getStoredBlockSizes();
            }
            var grid = document.querySelector('.pmc-room-grid');
            var gridRect = grid ? grid.getBoundingClientRect() : null;
            var startSize = getRoomBlockSpan(id);
            var positions = getRoomBlockPositions(state.data.theme || getFallbackData().theme);
            var startPosition = normalizeRoomBlockPosition(id, positions[id]);
            state.resizeBlock = {
                id: id,
                direction: ['nw', 'ne', 'sw', 'se'].indexOf(direction) === -1 ? 'se' : direction,
                startX: event.clientX,
                startY: event.clientY,
                startSize: startSize,
                startPosition: startPosition,
                currentSize: startSize,
                currentPosition: startPosition,
                cellWidth: gridRect ? gridRect.width / ROOM_GRID_COLUMNS : 72,
                cellHeight: gridRect ? gridRect.height / ROOM_GRID_ROWS : 72,
                moved: false
            };
            state.iconEditMode = true;
            var root = document.getElementById('pmc-root');
            if (root) root.classList.add('is-icon-edit-mode', 'is-resizing-room-block');
            var block = findRoomBlockElement(id);
            if (block) block.classList.add('is-resizing');
            selectRoomBlock(id);
            pulseRoomHaptic(8, 180);
            if (event.currentTarget && event.currentTarget.setPointerCapture && event.pointerId !== undefined) {
                try { event.currentTarget.setPointerCapture(event.pointerId); } catch (_error) {}
            }
            document.addEventListener('pointermove', handleRoomBlockResizeMove, { passive: false });
            document.addEventListener('pointerup', finishRoomBlockResize, { passive: false });
            document.addEventListener('pointercancel', cancelRoomBlockResize, { passive: false });
            scheduleIconEditModeClear(30000);
        },
        beginRoomBlockDrag: function (event, id) {
            if (state.resizeBlock || (event && event.target && event.target.closest && event.target.closest('.pmc-room-resize-handle'))) return;
            if (!event || event.button > 0) return;
            if (event.preventDefault) event.preventDefault();
            if (event.stopPropagation) event.stopPropagation();
            if (event.currentTarget && event.currentTarget.setPointerCapture && event.pointerId !== undefined) {
                try { event.currentTarget.setPointerCapture(event.pointerId); } catch (_error) {}
            }
            var root = document.getElementById('pmc-root');
            var isEditing = state.iconEditMode || (root && root.classList.contains('is-icon-edit-mode'));
            state.dragIcon = { id: id, startX: event.clientX, startY: event.clientY, moved: false, active: !!isEditing, immediate: !!isEditing, timer: null };
            if (isEditing) {
                state.iconEditMode = true;
                if (root) root.classList.add('is-icon-edit-mode');
                selectRoomBlock(id);
                scheduleIconEditModeClear(30000);
            } else {
                state.dragIcon.timer = window.setTimeout(function () {
                    if (!state.dragIcon || state.dragIcon.id !== id) return;
                    state.dragIcon.active = true;
                    state.iconEditMode = true;
                    root = document.getElementById('pmc-root');
                    if (root) root.classList.add('is-icon-edit-mode');
                    selectRoomBlock(id);
                    var sourceButton = findRoomBlockElement(id);
                    if (sourceButton) sourceButton.classList.add('is-hold-ready');
                    pulseRoomHaptic(12, 220);
                    scheduleIconEditModeClear(30000);
                }, 520);
            }
            document.addEventListener('pointermove', handlePastelIconMove, { passive: false });
            document.addEventListener('pointerup', finishPastelIconDrag, { passive: false });
            document.addEventListener('pointercancel', cancelPastelIconDrag, { passive: false });
        },
        beginPastelIconDrag: function (event, id) {
            this.beginRoomBlockDrag(event, 'icon:' + id);
        },
        cycleUsgThumb: function (event) {
            if (event) {
                event.preventDefault();
                event.stopPropagation();
            }
            if (Date.now() < state.suppressPastelClickUntil) return;
            var thumbs = Array.isArray(state.usgThumbs) && state.usgThumbs.length ? state.usgThumbs : getCachedUsgThumbs();
            var count = Math.max(1, Math.min(3, thumbs.length || 3));
            state.usgThumbIndex = (Number(state.usgThumbIndex || 0) + 1) % count;
            var stack = document.querySelector('.pmc-usg-thumb-stack');
            if (stack) stack.style.setProperty('--pmc-usg-active', state.usgThumbIndex);
        },
        beginRibbonPress: function (event) {
            if (event) event.stopPropagation();
            state.ribbonHoldActive = false;
            window.clearTimeout(state.ribbonHoldTimer);
            state.ribbonHoldTimer = window.setTimeout(function () {
                state.ribbonHoldActive = true;
            }, 520);
            this.beginRoomBlockDrag(event, 'ribbon');
        },
        cycleRibbonColor: function (event) {
            if (event) {
                event.preventDefault();
                event.stopPropagation();
            }
            if (Date.now() < state.suppressPastelClickUntil || state.ribbonHoldActive) {
                state.ribbonHoldActive = false;
                return;
            }
            if (!state.data) state.data = getFallbackData();
            if (!state.data.theme) state.data.theme = getFallbackData().theme;
            var current = state.data.theme.ribbon_color || getStoredRibbonColor();
            var index = RIBBON_COLORS.indexOf(current);
            var next = RIBBON_COLORS[(index + 1) % RIBBON_COLORS.length];
            state.data.theme.ribbon_color = next;
            persistRoomPreferences();
            renderPanel();
            saveWorkdesk(false).catch(function () {});
        },
        hidePastelIcon: function (event, id) {
            if (event) {
                event.preventDefault();
                event.stopPropagation();
            }
            if (!state.data) state.data = getFallbackData();
            if (!state.data.layout) state.data.layout = getFallbackData().layout;
            var hidden = Array.isArray(state.data.layout.pastel_hidden_icons) ? state.data.layout.pastel_hidden_icons : [];
            if (hidden.indexOf(id) === -1) hidden.push(id);
            state.data.layout.pastel_hidden_icons = hidden;
            persistRoomPreferences();
            clearIconEditMode();
            renderPanel();
            saveWorkdesk(false).catch(function () {});
        },
        togglePastelIconVisibility: function (id) {
            syncInputsToState();
            if (!state.data.layout) state.data.layout = getFallbackData().layout;
            var hidden = Array.isArray(state.data.layout.pastel_hidden_icons) ? state.data.layout.pastel_hidden_icons : [];
            var index = hidden.indexOf(id);
            if (index === -1) hidden.push(id);
            else hidden.splice(index, 1);
            state.data.layout.pastel_hidden_icons = hidden;
            persistRoomPreferences();
            renderPanel({ preserveScroll: true });
            saveWorkdesk(false).catch(function () {});
        },
        resizeClockWidget: function (direction) {
            if (!state.data) state.data = getFallbackData();
            if (!state.data.theme) state.data.theme = getFallbackData().theme;
            var sizes = ['small', 'medium', 'large'];
            var current = state.data.theme.clock_widget_size || getStoredClockSize();
            var index = sizes.indexOf(current);
            if (index === -1) index = 1;
            var next = sizes[Math.max(0, Math.min(sizes.length - 1, index + Number(direction || 0)))];
            state.data.theme.clock_widget_size = next;
            localStorage.setItem(CORNER_CLOCK_SIZE_KEY, next);
            updateDashboard(state.data);
            renderPanel();
            saveWorkdesk(false).catch(function () {});
        },
        setClockType: function (type) {
            if (!state.data) state.data = getFallbackData();
            state.data.theme.clock_widget_type = type === 'analog' ? 'analog' : 'digital';
            persistRoomPreferences();
            renderPanel({ preserveScroll: true });
            saveWorkdesk(false).catch(function () {});
        },
        toggleClockType: function () {
            var current = state.data && state.data.theme ? state.data.theme.clock_widget_type : getStoredClockType();
            this.setClockType(current === 'analog' ? 'digital' : 'analog');
        },
        setTitleFont: function (font) {
            if (!state.data) state.data = getFallbackData();
            state.data.theme.title_font = TITLE_FONTS.some(function (item) { return item.id === font; }) ? font : 'rounded';
            persistRoomPreferences();
            renderPanel({ preserveScroll: true });
            saveWorkdesk(false).catch(function () {});
        },
        setTitleSize: function (size) {
            if (!state.data) state.data = getFallbackData();
            state.data.theme.title_size = TITLE_SIZES.some(function (item) { return item.id === size; }) ? size : 'medium';
            persistRoomPreferences();
            renderPanel({ preserveScroll: true });
            saveWorkdesk(false).catch(function () {});
        },
        applyPreset: function (presetId) {
            syncInputsToState();
            var preset = ROOM_PRESETS.find(function (item) { return item.id === presetId; }) || ROOM_PRESETS[0];
            if (!state.data) state.data = getFallbackData();
            state.data.theme.preset = preset.id;
            state.data.theme.accent = preset.accent;
            updateDashboard(state.data);
            renderPanel({ preserveScroll: true });
        },
        applyDecor: function (key, value) {
            syncInputsToState();
            if (!state.data) state.data = getFallbackData();
            if (key === 'mood') {
                var mood = findChoice(ROOM_MOODS, value);
                state.data.theme.mood = mood.id;
                state.data.theme.accent = mood.accent;
                updateDashboard(state.data);
                renderPanel({ preserveScroll: true });
                return;
            }
            var group = findDecorGroup(key);
            if (!group) return;
            state.data.theme[key] = findChoice(group.options, value).id;
            updateDashboard(state.data);
            renderPanel({ preserveScroll: true });
        },
        applyRoomStyle: function (styleId) {
            syncInputsToState();
            if (!state.data) state.data = getFallbackData();
            var style = findRoomStyle(styleId);
            state.data.theme.style = style.id;
            state.data.theme.mood = style.mood;
            state.data.theme.wallpaper = style.wallpaper;
            state.data.theme.floor = style.floor;
            state.data.theme.lamp = style.lamp;
            state.data.theme.plant = style.plant;
            state.data.theme.frame = style.frame;
            state.data.theme.accent = style.accent;
            updateDashboard(state.data);
            renderPanel({ preserveScroll: true });
        },
        toggleRoomName: function () {
            syncInputsToState();
            if (!state.data) state.data = getFallbackData();
            state.data.theme.show_room_name = state.data.theme.show_room_name === false;
            localStorage.setItem(CORNER_SHOW_NAME_KEY, state.data.theme.show_room_name === false ? '0' : '1');
            updateDashboard(state.data);
            renderPanel({ preserveScroll: true });
        },
        refreshDecorPreview: function () {
            syncInputsToState();
            renderPanel({ preserveScroll: true });
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
            renderPanel({ preserveScroll: true });
        },
        togglePublicWidget: function (id) {
            syncInputsToState();
            var list = state.data.public_settings.public_widgets || [];
            var index = list.indexOf(id);
            if (index === -1) list.push(id);
            else list.splice(index, 1);
            state.data.public_settings.public_widgets = list;
            renderPanel({ preserveScroll: true });
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
            renderPanel({ preserveScroll: true });
        },
        toggleWidget: function (index) {
            syncInputsToState();
            var widgets = getWidgets();
            if (!widgets[index]) return;
            widgets[index].visible = widgets[index].visible === false;
            state.data.layout.widgets = widgets;
            renderPanel({ preserveScroll: true });
        },
        load: loadWorkdesk
    };

    window.PatientMyCorner = api;
    window.openMyCorner = openMyCorner;

    document.addEventListener('DOMContentLoaded', function () {
        loadWorkdesk().catch(function () {});
    });
    document.addEventListener('click', handleIconEditOutsideTap, true);
})();

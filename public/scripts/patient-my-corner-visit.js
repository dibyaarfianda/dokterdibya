(function () {
    'use strict';

    function escapeHtml(value) {
        var div = document.createElement('div');
        div.textContent = value == null ? '' : String(value);
        return div.innerHTML;
    }

    function getCode() {
        return new URLSearchParams(window.location.search).get('c') || '';
    }

    function getClockMoodId() {
        var hour = new Date().getHours();
        if (hour >= 18 || hour < 5) return 'night';
        if (hour < 10) return 'morning';
        if (hour >= 15) return 'warm';
        return 'calm';
    }

    function getVisitMood(theme) {
        var mood = theme && theme.mood ? String(theme.mood) : 'auto';
        return mood === 'auto' ? getClockMoodId() : mood;
    }

    function getThemeClass(theme, key, prefix) {
        var value = theme && theme[key] ? String(theme[key]) : 'none';
        return prefix + '-' + value.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
    }

    function renderError(message) {
        var root = document.getElementById('visit-root');
        if (!root) return;
        root.className = 'visit-card';
        root.innerHTML = '<div class="visit-avatar"><i class="fa-solid fa-lock"></i></div>' +
            '<h1 class="visit-title">Tidak tersedia</h1>' +
            '<p class="visit-intro">' + escapeHtml(message || 'Ruang publik belum tersedia atau link sudah berubah.') + '</p>' +
            '<a class="visit-action" href="/patient-menu.html"><span>Kembali ke portal</span><i class="fa-solid fa-arrow-right"></i></a>';
    }

    function render(data) {
        var root = document.getElementById('visit-root');
        if (!root) return;
        var profile = data.profile || {};
        var theme = data.theme || {};
        var widgets = Array.isArray(data.public_widgets) ? data.public_widgets : [];
        var mood = getVisitMood(theme);
        var roomClass = [
            'visit-room-scene',
            'pmc-room-scene',
            'pmc-mood-' + mood,
            getThemeClass(theme, 'wallpaper', 'pmc-wall'),
            getThemeClass(theme, 'floor', 'pmc-floor'),
            getThemeClass(theme, 'lamp', 'pmc-lamp'),
            getThemeClass(theme, 'plant', 'pmc-plant'),
            getThemeClass(theme, 'frame', 'pmc-frame')
        ].join(' ');
        document.documentElement.style.setProperty('--pmc-accent', theme.accent || '#5c7f72');
        root.className = '';
        root.innerHTML = '<section class="visit-room-shell">' +
            '<div class="' + escapeHtml(roomClass) + '">' +
                '<div class="pmc-room-wall"></div><div class="pmc-room-window"><i class="fa-solid fa-sun"></i></div><div class="pmc-room-floor"></div>' +
                '<div class="pmc-room-title"><span>Ruang yang dikunjungi</span><h1>' + escapeHtml(profile.corner_name || theme.corner_name || 'Ruang Saya') + '</h1><p>milik ' + escapeHtml(profile.display_name || 'Pasien') + '</p></div>' +
                '<div class="pmc-room-whisper"><span>Mode kunjungan</span><p>' + escapeHtml(profile.intro || 'Ruang publik kecil yang pemiliknya izinkan untuk dikunjungi.') + '</p></div>' +
                '<div class="pmc-room-memory" aria-hidden="true"><i class="fa-solid fa-image"></i></div>' +
                '<div class="pmc-room-deco pmc-room-plant" aria-hidden="true"><i class="fa-solid fa-seedling"></i></div>' +
                '<div class="pmc-room-deco pmc-room-lamp" aria-hidden="true"><i class="fa-solid fa-lightbulb"></i></div>' +
                '<div class="pmc-room-rug" aria-hidden="true"></div>' +
            '</div>' +
            '<div class="visit-label"><i class="fa-solid fa-user-shield"></i> Tampilan aman untuk pengunjung</div>' +
            '</section>' +
            '<section class="visit-card visit-widget ' + (widgets.indexOf('intro') !== -1 ? 'is-visible' : '') + '">' +
                '<div class="pmc-kicker">Pemilik Ruang</div>' +
                '<h2 class="pmc-card-title">' + escapeHtml(profile.display_name || 'Pasien') + '</h2>' +
                '<p class="visit-empty">Pemilik memilih sendiri informasi yang tampil di halaman publik ini.</p>' +
            '</section>' +
            '<section class="visit-card visit-widget ' + (widgets.indexOf('favorites') !== -1 ? 'is-visible' : '') + '">' +
                '<div class="pmc-kicker">Favorit Publik</div>' +
                '<div class="visit-actions">' +
                    '<a class="visit-action" href="/artikel.html"><span>Ruang Membaca</span><i class="fa-solid fa-book-open"></i></a>' +
                    '<a class="visit-action" href="/booking-klinik.html"><span>Booking Klinik</span><i class="fa-solid fa-calendar-check"></i></a>' +
                '</div>' +
            '</section>' +
            '<section class="visit-card visit-widget ' + (widgets.indexOf('journey-note') !== -1 ? 'is-visible' : '') + '">' +
                '<div class="pmc-kicker">Catatan Perjalanan</div>' +
                '<p class="visit-empty">Catatan publik ringan akan tampil di sini saat pemilik menambahkannya.</p>' +
            '</section>' +
            '<section class="visit-card visit-widget ' + (widgets.indexOf('public-links') !== -1 ? 'is-visible' : '') + '">' +
                '<div class="pmc-kicker">Tautan Pilihan</div>' +
                '<p class="visit-empty">Link publik pilihan pemilik akan tampil di sini.</p>' +
            '</section>';
    }

    async function init() {
        var code = getCode();
        if (!code) {
            renderError('Kode ruang publik tidak ditemukan.');
            return;
        }

        try {
            var response = await fetch('/api/patient-workdesk/public/' + encodeURIComponent(code) + '?_t=' + Date.now(), {
                cache: 'no-store',
                headers: { 'Cache-Control': 'no-cache' }
            });
            var body = await response.json().catch(function () { return {}; });
            if (!response.ok || body.success === false) {
                throw new Error(body.message || 'Ruang publik tidak tersedia.');
            }
            render(body.data || {});
        } catch (error) {
            renderError(error.message || 'Gagal memuat ruang publik.');
        }
    }

    document.addEventListener('DOMContentLoaded', init);
})();

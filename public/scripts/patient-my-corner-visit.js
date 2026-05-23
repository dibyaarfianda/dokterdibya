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

    function renderError(message) {
        var root = document.getElementById('visit-root');
        if (!root) return;
        root.className = 'visit-card';
        root.innerHTML = '<div class="visit-avatar"><i class="fa-solid fa-lock"></i></div>' +
            '<h1 class="visit-title">Tidak tersedia</h1>' +
            '<p class="visit-intro">' + escapeHtml(message || 'Public corner belum tersedia atau link sudah berubah.') + '</p>' +
            '<a class="visit-action" href="/patient-menu.html"><span>Kembali ke portal</span><i class="fa-solid fa-arrow-right"></i></a>';
    }

    function render(data) {
        var root = document.getElementById('visit-root');
        if (!root) return;
        var profile = data.profile || {};
        var theme = data.theme || {};
        var widgets = Array.isArray(data.public_widgets) ? data.public_widgets : [];
        document.documentElement.style.setProperty('--pmc-accent', theme.accent || '#5c7f72');
        root.className = '';
        root.innerHTML = '<section class="visit-card">' +
            '<div class="visit-avatar">' + escapeHtml(profile.avatar_initials || 'PA') + '</div>' +
            '<h1 class="visit-title">' + escapeHtml(profile.corner_name || theme.corner_name || 'My Corner') + '</h1>' +
            '<p class="visit-intro">' + escapeHtml(profile.intro || 'Ruang publik pasien.') + '</p>' +
            '<div class="visit-label" style="margin-top:12px;"><i class="fa-solid fa-user-shield"></i> Read-only, public-safe</div>' +
            '</section>' +
            '<section class="visit-card visit-widget ' + (widgets.indexOf('intro') !== -1 ? 'is-visible' : '') + '">' +
                '<div class="pmc-kicker">Pemilik Corner</div>' +
                '<h2 class="pmc-card-title">' + escapeHtml(profile.display_name || 'Pasien') + '</h2>' +
                '<p class="visit-empty">Pemilik memilih sendiri informasi yang tampil di halaman publik ini.</p>' +
            '</section>' +
            '<section class="visit-card visit-widget ' + (widgets.indexOf('favorites') !== -1 ? 'is-visible' : '') + '">' +
                '<div class="pmc-kicker">Favorit Publik</div>' +
                '<div class="visit-actions">' +
                    '<a class="visit-action" href="/artikel-trial.html"><span>Ruang Membaca</span><i class="fa-solid fa-book-open"></i></a>' +
                    '<a class="visit-action" href="/booking-klinik-trial.html"><span>Booking Klinik</span><i class="fa-solid fa-calendar-check"></i></a>' +
                '</div>' +
            '</section>' +
            '<section class="visit-card visit-widget ' + (widgets.indexOf('journey-note') !== -1 ? 'is-visible' : '') + '">' +
                '<div class="pmc-kicker">Journey Note</div>' +
                '<p class="visit-empty">Catatan publik ringan akan tampil di sini saat pemilik menambahkannya.</p>' +
            '</section>' +
            '<section class="visit-card visit-widget ' + (widgets.indexOf('public-links') !== -1 ? 'is-visible' : '') + '">' +
                '<div class="pmc-kicker">Public Links</div>' +
                '<p class="visit-empty">Link publik pilihan pemilik akan tampil di sini.</p>' +
            '</section>';
    }

    async function init() {
        var code = getCode();
        if (!code) {
            renderError('Kode public corner tidak ditemukan.');
            return;
        }

        try {
            var response = await fetch('/api/patient-workdesk/public/' + encodeURIComponent(code) + '?_t=' + Date.now(), {
                cache: 'no-store',
                headers: { 'Cache-Control': 'no-cache' }
            });
            var body = await response.json().catch(function () { return {}; });
            if (!response.ok || body.success === false) {
                throw new Error(body.message || 'Public corner tidak tersedia.');
            }
            render(body.data || {});
        } catch (error) {
            renderError(error.message || 'Gagal memuat public corner.');
        }
    }

    document.addEventListener('DOMContentLoaded', init);
})();

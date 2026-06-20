(function() {
    'use strict';
    if (window.__portalBottomNavInit) return;
    var htmlEl = document.documentElement;
    var optOut = htmlEl.getAttribute('data-portal-nav') === 'off' ||
        (document.body && document.body.getAttribute('data-portal-nav') === 'off');
    if (optOut) return;
    window.__portalBottomNavInit = true;

    var pageToCategory = {
        '/patient-menu.html': 'beranda',
        '/album-usg.html': 'dokumen',
        '/dokumen-medis.html': 'dokumen',
        '/hasil-lab.html': 'dokumen',
        '/tanya-dokter.html': 'aplikasi',
        '/kick-counter.html': 'aplikasi',
        '/pregnancy-tracker.html': 'aplikasi',
        '/contraction-timer.html': 'aplikasi',
        '/fertility-calendar.html': 'aplikasi',
        '/jadwal-vitamin.html': 'aplikasi',
        '/estimasi-biaya-kehamilan.html': 'aplikasi',
        '/perjalanan-ibu.html': 'edukasi',
        '/artikel.html': 'edukasi',
        '/artikel-kesehatan.html': 'edukasi',
        '/ruang-cerita.html': 'edukasi',
        '/booking-klinik.html': 'jadwal',
        '/jadwal-rs.html': 'jadwal',
        '/riwayat-kunjungan.html': 'jadwal',
        '/antrian.html': 'jadwal',
        '/feedback.html': 'beranda'
    };

    var menuData = {
        dokumen: [
            ['fa-solid fa-image', 'Album USG', '/album-usg.html'],
            ['fa-solid fa-flask', 'Hasil Lab', '/hasil-lab.html'],
            ['fa-solid fa-file-medical', 'Resume Medis Saya', '/dokumen-medis.html']
        ],
        aplikasi: [
            ['fa-solid fa-comments', 'Tanya Dokter', '/tanya-dokter.html'],
            ['fa-solid fa-hand', 'Gerakan Bayi', '/kick-counter.html'],
            ['fa-solid fa-chart-line', 'Monitoring Kehamilan', '/pregnancy-tracker.html'],
            ['fa-solid fa-wave-square', 'Hitung Kontraksi', '/contraction-timer.html'],
            ['fa-solid fa-calendar-days', 'Kalender Kesuburan', '/fertility-calendar.html'],
            ['fa-solid fa-kit-medical', 'Jadwal Vitamin', '/jadwal-vitamin.html']
        ],
        edukasi: [
            ['fa-solid fa-heart', 'Langkah Awal Ibu', '/perjalanan-ibu.html'],
            ['fa-solid fa-book-open', 'Nadi Pengetahuan', '/artikel.html'],
            ['fa-solid fa-comment-medical', 'Ruang Cerita', '/ruang-cerita.html', 'Baru']
        ],
        jadwal: [
            ['fa-solid fa-calendar-check', 'Booking Klinik Minggu', '/booking-klinik.html'],
            ['fa-solid fa-hospital', 'Jadwal Rumah Sakit', '/jadwal-rs.html'],
            ['fa-solid fa-stethoscope', 'Riwayat Kunjungan', '/riwayat-kunjungan.html'],
            ['fa-solid fa-list-ol', 'Antrian Hari Ini', '/antrian.html']
        ]
    };

    function detectActive() {
        var override = htmlEl.getAttribute('data-portal-nav-active');
        if (override) return override;
        return pageToCategory[(window.location.pathname || '').toLowerCase()] || '';
    }

    function injectStyle() {
        var style = document.createElement('style');
        style.setAttribute('data-portal-bottom-nav', '');
        style.textContent = '.tbn-bottom-nav{position:fixed;left:0;right:0;bottom:0;z-index:1002;padding-bottom:env(safe-area-inset-bottom,0);transform:translateY(100%);transition:transform .45s ease;color:#fff}.tbn-bottom-nav.tbn-nav-visible{transform:translateY(0)}.tbn-bottom-inner{max-width:760px;margin:0 auto;padding:8px 12px 10px;display:grid;grid-template-columns:repeat(5,1fr);gap:2px}.tbn-nav-item{min-height:48px;display:grid;place-items:center;align-content:center;gap:3px;color:inherit;text-decoration:none;border-radius:10px}.tbn-nav-item i{font-size:18px;color:inherit!important}.tbn-nav-item span{font-size:9px;text-transform:uppercase;letter-spacing:.08em;font-weight:600}.tbn-nav-item.active{color:#3b82f6}.tbn-bottom-sheet-overlay{position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:1000;display:none}.tbn-bottom-sheet-overlay.active{display:block}.tbn-bottom-sheet{position:fixed;bottom:70px;left:16px;right:16px;z-index:1001;display:none;max-width:360px;margin:auto}.tbn-bottom-sheet.active{display:block}.tbn-sheet-menu-item{display:flex;align-items:center;gap:14px;padding:14px 18px;color:#fff;text-decoration:none;border-radius:10px}.tbn-sheet-menu-item:hover{background:#fff;color:#0f172a!important}.tbn-feature-new-badge{margin-left:auto;border-radius:999px;background:#e9f8ef;color:#0f6b3d;border:1px solid rgba(15,107,61,.18);padding:3px 8px;font-size:10px;font-style:normal;font-weight:800;text-transform:uppercase;letter-spacing:.05em}';
        document.head.appendChild(style);
    }

    function closeSheet() {
        var overlay = document.getElementById('tbn-sheet-overlay');
        var sheet = document.getElementById('tbn-bottom-sheet');
        if (overlay) overlay.classList.remove('active');
        if (sheet) sheet.classList.remove('active');
    }

    function openSheet(category) {
        var rows = menuData[category] || [];
        var menu = document.getElementById('tbn-sheet-menu');
        menu.innerHTML = rows.map(function(row) {
            return '<a class="tbn-sheet-menu-item" href="' + row[2] + '"><i class="' + row[0] + '"></i><span>' + row[1] + '</span>' + (row[3] ? '<em class="tbn-feature-new-badge">' + row[3] + '</em>' : '') + '</a>';
        }).join('');
        document.getElementById('tbn-sheet-overlay').classList.add('active');
        document.getElementById('tbn-bottom-sheet').classList.add('active');
    }

    function setActive(category) {
        document.querySelectorAll('.tbn-nav-item').forEach(function(item) {
            item.classList.toggle('active', item.dataset.tbnCat === category);
        });
    }

    function injectNav() {
        var wrap = document.createElement('div');
        wrap.setAttribute('data-portal-bottom-nav-root', '');
        wrap.innerHTML = '<div class="tbn-bottom-sheet-overlay" id="tbn-sheet-overlay"></div>' +
            '<div class="tbn-bottom-sheet" id="tbn-bottom-sheet"><div id="tbn-sheet-menu"></div></div>' +
            '<nav class="tbn-bottom-nav" id="tbn-bottom-nav" aria-label="Navigasi bawah"><div class="tbn-bottom-inner">' +
            '<a href="/patient-menu.html" class="tbn-nav-item" data-tbn-cat="beranda"><i class="fa-solid fa-house"></i><span>Beranda</span></a>' +
            '<a href="#" class="tbn-nav-item" data-tbn-cat="dokumen"><i class="fa-solid fa-folder-open"></i><span>Dokumen</span></a>' +
            '<a href="#" class="tbn-nav-item" data-tbn-cat="aplikasi"><i class="fa-solid fa-th-large"></i><span>Aplikasi</span></a>' +
            '<a href="#" class="tbn-nav-item" data-tbn-cat="edukasi"><i class="fa-solid fa-book-open"></i><span>Edukasi</span></a>' +
            '<a href="#" class="tbn-nav-item" data-tbn-cat="jadwal"><i class="fa-solid fa-calendar-check"></i><span>Jadwal</span></a>' +
            '</div></nav>';
        document.body.appendChild(wrap);
        document.getElementById('tbn-sheet-overlay').addEventListener('click', closeSheet);
        document.querySelectorAll('.tbn-nav-item[data-tbn-cat]').forEach(function(item) {
            if (item.dataset.tbnCat === 'beranda') return;
            item.addEventListener('click', function(event) {
                event.preventDefault();
                openSheet(item.dataset.tbnCat);
            });
        });
        setActive(detectActive());
        var nav = document.getElementById('tbn-bottom-nav');
        function update() { nav.classList.toggle('tbn-nav-visible', window.scrollY > 50 || document.documentElement.scrollHeight <= window.innerHeight + 50); }
        window.addEventListener('scroll', update, { passive: true });
        window.addEventListener('resize', update, { passive: true });
        update();
    }

    window.portalBottomNav = { open: openSheet, close: closeSheet, setActive: setActive };
    function init() { injectStyle(); injectNav(); }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
})();

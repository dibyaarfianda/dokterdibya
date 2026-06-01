/* SISIwanita legacy portal page adapter.
   Injects the shared Patient Tool Shell around older portal pages without rewriting their page logic. */
(function () {
    'use strict';

    var VERSION = '20260530d';
    var pageDefaults = {
        '/album-usg.html': {
            activeNav: 'dokumen',
            kicker: 'Album USG',
            title: 'Album USG.',
            copy: 'Galeri privat untuk foto USG dari kunjungan Anda, termasuk penanda foto baru dan pilihan thumbnail.',
            metaLabel: 'Status',
            metaValue: 'Galeri USG'
        },
        '/dokumen-medis.html': {
            activeNav: 'dokumen',
            kicker: 'Resume Medis',
            title: 'Resume medis.',
            copy: 'Buka ringkasan kunjungan dan dokumen medis yang sudah dikirim dokter dalam satu ruang yang rapi.',
            metaLabel: 'Dokumen',
            metaValue: 'Resume Kunjungan'
        },
        '/hasil-lab.html': {
            activeNav: 'dokumen',
            kicker: 'Hasil Lab',
            title: 'Hasil laboratorium.',
            copy: 'Lihat hasil pemeriksaan laboratorium yang dikirim dokter, dengan preview dan unduhan saat file tersedia.',
            metaLabel: 'Dokumen',
            metaValue: 'Lab Result'
        },
        '/riwayat-kunjungan.html': {
            activeNav: 'jadwal',
            kicker: 'Riwayat Kunjungan',
            title: 'Jejak kunjungan.',
            copy: 'Pantau jadwal mendatang, kunjungan selesai, dan status janji temu klinik dari satu halaman.',
            metaLabel: 'Jadwal',
            metaValue: 'Kunjungan Saya'
        },
        '/antrian.html': {
            activeNav: 'jadwal',
            kicker: 'Live Queue',
            title: 'Antrian hari ini.',
            copy: 'Pantau status antrian klinik secara real time dan atur pengingat saat nomor Anda sudah mendekat.',
            metaLabel: 'Refresh',
            metaValue: 'Otomatis 30 detik'
        },
        '/booking-klinik.html': {
            activeNav: 'jadwal',
            kicker: 'Booking Klinik',
            title: 'Atur janji klinik.',
            copy: 'Pilih tanggal praktik, slot waktu, jenis konsultasi, lalu kirim permintaan booking ke staff klinik.',
            metaLabel: 'Alur',
            metaValue: '4 langkah'
        },
        '/jadwal-rs.html': {
            activeNav: 'jadwal',
            kicker: 'Jadwal Rumah Sakit',
            title: 'Jadwal praktik RS.',
            copy: 'Lihat rumah sakit, hari praktik, dan jam praktik dokter dalam satu halaman ringkas.',
            metaLabel: 'Mode',
            metaValue: 'Informasi Jadwal'
        },
        '/tanya-dokter.html': {
            activeNav: 'aplikasi',
            kicker: 'Tanya Dokter',
            title: 'Konsultasi pribadi.',
            copy: 'Ajukan pertanyaan kepada dokter secara asinkron, lihat riwayat percakapan, dan balas saat thread masih terbuka.',
            metaLabel: 'Mode',
            metaValue: 'Asinkron'
        },
        '/artikel.html': {
            activeNav: 'beranda',
            kicker: 'Ruang Membaca',
            title: 'Nadi pengetahuan.',
            copy: 'Kurasi artikel seputar kehamilan, program hamil, dan kesehatan kandungan dalam tampilan yang nyaman dibaca.',
            metaLabel: 'Konten',
            metaValue: 'Artikel'
        }
    };

    var menuData = {
        dokumen: { title: 'Dokumen', items: [
            ['fa-solid fa-image', 'Album USG', '/album-usg.html'],
            ['fa-solid fa-flask', 'Hasil Lab', '/hasil-lab.html'],
            ['fa-solid fa-file-medical', 'Resume Medis', '/dokumen-medis.html']
        ]},
        aplikasi: { title: 'Aplikasi', items: [
            ['fa-solid fa-comments', 'Tanya Dokter', '/tanya-dokter.html'],
            ['fa-solid fa-users', 'Chat Komunitas', '/community-chat.html'],
            ['fa-solid fa-hand', 'Gerakan Bayi', '/kick-counter.html'],
            ['fa-solid fa-chart-line', 'Monitoring Kehamilan', '/pregnancy-tracker.html'],
            ['fa-solid fa-calendar-days', 'Kalender Kesuburan', '/fertility-calendar.html'],
            ['fa-solid fa-pills', 'Jadwal Vitamin', '/jadwal-vitamin.html']
        ]},
        jadwal: { title: 'Jadwal', items: [
            ['fa-solid fa-calendar-check', 'Booking Klinik Minggu', '/booking-klinik.html'],
            ['fa-solid fa-hospital', 'Jadwal Rumah Sakit', '/jadwal-rs.html'],
            ['fa-solid fa-stethoscope', 'Riwayat Kunjungan', '/riwayat-kunjungan.html'],
            ['fa-solid fa-list-ol', 'Antrian Hari Ini', '/antrian.html']
        ]},
        edukasi: { title: 'Edukasi', items: [
            ['fa-solid fa-heart', 'Perjalanan Ibu', '/perjalanan-ibu.html'],
            ['fa-solid fa-book-open', 'Ruang Membaca', '/artikel.html'],
            ['fa-solid fa-stethoscope', 'Istilah Obgyn', '/artikel-kesehatan.html']
        ]}
    };

    function ready(callback) {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', callback, { once: true });
        } else {
            callback();
        }
    }

    function getConfig() {
        var path = (window.location.pathname || '').toLowerCase();
        var defaults = pageDefaults[path] || {
            activeNav: 'beranda',
            kicker: 'SISIwanita',
            title: document.title || 'Portal pasien.',
            copy: 'Ruang pasien SISIwanita dengan tampilan terpadu.',
            metaLabel: 'Portal',
            metaValue: 'SISIwanita'
        };
        var body = document.body;
        return {
            activeNav: body.getAttribute('data-tool-shell-active') || defaults.activeNav,
            kicker: body.getAttribute('data-tool-kicker') || defaults.kicker,
            title: body.getAttribute('data-tool-title') || defaults.title,
            copy: body.getAttribute('data-tool-copy') || defaults.copy,
            metaLabel: body.getAttribute('data-tool-meta-label') || defaults.metaLabel,
            metaValue: body.getAttribute('data-tool-meta-value') || defaults.metaValue
        };
    }

    function injectTopbarBlur() {
        if (document.querySelector('.topbar-blur-fade')) return;
        var fade = document.createElement('div');
        fade.className = 'topbar-blur-fade';
        fade.setAttribute('aria-hidden', 'true');
        fade.innerHTML = [1,2,3,4,5,6,7,8].map(function (i) {
            return '<div class="topbar-blur-' + i + '"></div>';
        }).join('');
        document.body.insertBefore(fade, document.body.firstChild);
    }

    function injectTopbar() {
        if (document.getElementById('home-topbar')) return;
        var topbar = document.createElement('header');
        topbar.className = 'topbar';
        topbar.id = 'home-topbar';
        topbar.innerHTML = '' +
            '<div class="topbar-inner" id="home-topbar-inner">' +
                '<div class="brand">' +
                    '<a class="brand-link soundable" id="home-brand-link" href="/patient-menu.html" aria-label="Beranda SISIwanita">' +
                        '<div class="brand-title" id="home-brand-title">SISI<span>wanita</span></div>' +
                        '<div class="brand-sub" id="home-brand-sub">Portal Wanita Sehat</div>' +
                    '</a>' +
                '</div>' +
                '<div class="top-actions" id="home-top-actions">' +
                    '<button class="icon-btn soundable" id="home-notif-btn" type="button" onclick="openSettingsModal(event)" aria-label="Pengaturan">' +
                        '<i class="fa-solid fa-gear"></i><span class="badge" id="notif-badge">0</span>' +
                    '</button>' +
                    '<button class="avatar soundable" id="user-avatar" type="button" onclick="openProfileModal(event)" aria-label="Profil">' +
                        '<img id="user-avatar-img" alt=""><span id="user-avatar-initials">--</span><span class="vip-badge" id="vip-badge">VIP</span>' +
                    '</button>' +
                '</div>' +
            '</div>';
        var fade = document.querySelector('.topbar-blur-fade');
            if (fade && fade.nextSibling) {
            document.body.insertBefore(topbar, fade.nextSibling);
        } else {
            document.body.insertBefore(topbar, document.body.firstChild);
        }
    }

    function findPrimaryContainer() {
        return document.querySelector('main.app') ||
            document.querySelector('main.main-content') ||
            document.querySelector('.main-content') ||
            document.querySelector('main.content') ||
            document.querySelector('.page-body') ||
            document.querySelector('main.page-wrap') ||
            document.querySelector('main.reading-room') ||
            document.querySelector('.reading-room');
    }

    function injectHero(config) {
        if (document.getElementById('tool-retrofit-hero')) return;
        var container = findPrimaryContainer();
        if (!container) return;
        var hero = document.createElement('section');
        hero.className = 'hero-card reveal tool-retrofit-hero';
        hero.id = 'tool-retrofit-hero';
        hero.innerHTML = '' +
            '<div class="status-chip"><span class="status-dot"></span><span>' + escapeHtml(config.kicker) + '</span></div>' +
            '<h1 class="hero-title">' + escapeHtml(config.title) + '</h1>' +
            '<p class="hero-copy">' + escapeHtml(config.copy) + '</p>' +
            '<div class="today-row">' +
                '<div>' +
                    '<div class="today-label">' + escapeHtml(config.metaLabel) + '</div>' +
                    '<div class="today-value"><i class="fa-solid fa-circle-check"></i> ' + escapeHtml(config.metaValue) + '</div>' +
                '</div>' +
                '<button class="sound-toggle soundable" type="button" onclick="scrollTopHome()">' +
                    '<i class="fa-solid fa-arrow-up"></i><span>Ke atas</span>' +
                '</button>' +
            '</div>';
        container.insertBefore(hero, container.firstChild);
    }

    function applyLegacyRevealStagger() {
        var container = findPrimaryContainer();
        if (!container) return;

        var candidates = Array.prototype.filter.call(container.children || [], function (element) {
            if (!element || element.nodeType !== 1) return false;
            if (element.id === 'tool-retrofit-hero') return false;
            if (element.tagName === 'SCRIPT' || element.tagName === 'STYLE') return false;
            if (element.classList.contains('topbar') || element.classList.contains('bottom-nav')) return false;
            return true;
        });

        candidates.forEach(function (element, index) {
            if (!element.classList.contains('reveal')) {
                element.classList.add('reveal');
            }
            element.style.setProperty('--reveal-delay', (Math.min(index, 8) * 40) + 'ms');
        });
    }

    function injectBottomShell() {
        if (!document.getElementById('sheet-overlay')) {
            var overlay = document.createElement('div');
            overlay.className = 'sheet-overlay';
            overlay.id = 'sheet-overlay';
            overlay.setAttribute('onclick', 'closeSheet()');
            document.body.appendChild(overlay);
        }
        if (!document.getElementById('bottom-sheet')) {
            var sheet = document.createElement('aside');
            sheet.className = 'bottom-sheet';
            sheet.id = 'bottom-sheet';
            sheet.setAttribute('aria-label', 'Menu cepat');
            sheet.innerHTML = '<div class="sheet-title" id="sheet-title">Menu</div><div class="sheet-menu" id="sheet-menu"></div>';
            document.body.appendChild(sheet);
        }
        if (!document.getElementById('home-bottom-nav')) {
            var nav = document.createElement('nav');
            nav.className = 'bottom-nav';
            nav.id = 'home-bottom-nav';
            nav.setAttribute('aria-label', 'Navigasi bawah');
            nav.innerHTML = '' +
                '<div class="bottom-inner" id="home-bottom-inner">' +
                    '<button class="nav-item soundable" data-tool-nav="beranda" type="button" onclick="go(\'/patient-menu.html\')" aria-label="Beranda"><i class="fa-solid fa-house"></i><span>Beranda</span></button>' +
                    '<button class="nav-item soundable" data-tool-nav="dokumen" type="button" onclick="openSheet(\'dokumen\')" aria-label="Dokumen"><i class="fa-solid fa-folder-open"></i><span>Dokumen</span><span class="nav-badge" id="doc-nav-badge">0</span></button>' +
                    '<button class="nav-item soundable" data-tool-nav="aplikasi" type="button" onclick="openSheet(\'aplikasi\')" aria-label="Aplikasi"><i class="fa-solid fa-table-cells-large"></i><span>Aplikasi</span></button>' +
                    '<button class="nav-item soundable" data-tool-nav="jadwal" type="button" onclick="openSheet(\'jadwal\')" aria-label="Jadwal"><i class="fa-solid fa-calendar-check"></i><span>Jadwal</span></button>' +
                    '<button class="nav-item soundable" data-tool-nav="ruang" type="button" onclick="openMyCorner()" aria-label="Ruang"><i class="fa-solid fa-door-open"></i><span>Ruang</span></button>' +
                '</div>';
            document.body.appendChild(nav);
        }
    }

    function removeLegacyInjectedHeaders() {
        Array.prototype.forEach.call(document.querySelectorAll('.portal-unified-header'), function (header) {
            header.remove();
        });
    }

    function watchLegacyInjectedHeaders() {
        removeLegacyInjectedHeaders();
        if (!window.MutationObserver || !document.body) return;
        var observer = new MutationObserver(function (mutations) {
            var shouldClean = mutations.some(function (mutation) {
                return Array.prototype.some.call(mutation.addedNodes || [], function (node) {
                    return node.nodeType === 1 && (node.classList && node.classList.contains('portal-unified-header'));
                });
            });
            if (shouldClean) removeLegacyInjectedHeaders();
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    function escapeHtml(value) {
        var div = document.createElement('div');
        div.textContent = value == null ? '' : String(value);
        return div.innerHTML;
    }

    function setup() {
        var body = document.body;
        if (!body || body.getAttribute('data-tool-retrofit') === 'off') return;
        var config = getConfig();
        body.classList.add('patient-tool-shell', 'legacy-tool-retrofit', 'home-sections-unlocked');
        body.classList.remove('home-sections-locked');
        body.setAttribute('data-tool-shell-active', config.activeNav);
        window.__patientPortalHeaderInstalled = true;

        injectTopbarBlur();
        injectTopbar();
        injectHero(config);
        applyLegacyRevealStagger();
        if (window.PatientToolShell && typeof window.PatientToolShell.removeHeroStatusChips === 'function') {
            window.PatientToolShell.removeHeroStatusChips();
        }
        injectBottomShell();
        watchLegacyInjectedHeaders();

        if (window.PatientToolShell && typeof window.PatientToolShell.init === 'function') {
            window.PatientToolShell.init({ activeNav: config.activeNav, menuData: menuData });
            if (typeof window.PatientToolShell.triggerIntro === 'function') {
                window.PatientToolShell.triggerIntro();
            }
        }

        window.__patientToolRetrofitVersion = VERSION;
    }

    ready(setup);
})();

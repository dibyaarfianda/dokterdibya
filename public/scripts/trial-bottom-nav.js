/**
 * Trial Bottom Navigation - Shared component for all *-trial.html pages
 *
 * Injects a consistent bottom navigation bar (5-item: Beranda, Dokumen, Aplikasi,
 * Edukasi, Jadwal) across trial pages. Includes:
 *  - Bottom sheet submenu (Dokumen/Aplikasi/Edukasi/Jadwal)
 *  - Progressive blur backdrop fade zone
 *  - Show/hide on scroll
 *  - Auto nav-on-light contrast detection
 *  - Hide when footer is visible (IntersectionObserver)
 *  - Active-item auto-detection by URL
 *
 * Usage: <script src="/scripts/trial-bottom-nav.js" defer></script>
 *
 * Opt-out: add data-trial-nav="off" on <html> or <body>.
 * Override active item: add data-trial-nav-active="beranda|dokumen|aplikasi|edukasi|jadwal" on <html>.
 */
(function() {
    'use strict';

    // Skip if already initialized or opted out
    if (window.__trialBottomNavInit) return;
    var htmlEl = document.documentElement;
    var optOut = htmlEl.getAttribute('data-trial-nav') === 'off' ||
                 (document.body && document.body.getAttribute('data-trial-nav') === 'off');
    if (optOut) return;
    window.__trialBottomNavInit = true;

    // ==================== URL → ACTIVE MAPPING ====================
    var pageToCategory = {
        '/patient-menu-simple-trial.html': 'beranda',
        '/patient-menu-trial.html': 'beranda',
        '/album-usg-trial.html': 'dokumen',
        '/dokumen-medis-trial.html': 'dokumen',
        '/hasil-lab-trial.html': 'dokumen',
        '/tanya-dokter-trial.html': 'aplikasi',
        '/kick-counter-trial.html': 'aplikasi',
        '/pregnancy-tracker-trial.html': 'aplikasi',
        '/fertility-calendar-trial.html': 'aplikasi',
        '/jadwal-vitamin-trial.html': 'aplikasi',
        '/estimasi-biaya-kehamilan-trial.html': 'aplikasi',
        '/perjalanan-ibu-trial.html': 'edukasi',
        '/artikel-trial.html': 'edukasi',
        '/artikel-kesehatan-trial.html': 'edukasi',
        '/booking-klinik-trial.html': 'jadwal',
        '/jadwal-rs-trial.html': 'jadwal',
        '/riwayat-kunjungan-trial.html': 'jadwal',
        '/antrian-trial.html': 'jadwal',
        '/feedback-trial.html': 'beranda'
    };

    function detectActive() {
        var override = htmlEl.getAttribute('data-trial-nav-active');
        if (override) return override;
        var path = (window.location.pathname || '').toLowerCase();
        return pageToCategory[path] || '';
    }

    // ==================== BOTTOM SHEET MENU DATA ====================
    var menuData = {
        'dokumen': {
            title: 'Dokumen',
            items: [
                { icon: 'fa-solid fa-image', label: 'Album USG', href: '/album-usg-trial.html' },
                { icon: 'fa-solid fa-flask', label: 'Hasil Lab', href: '/hasil-lab-trial.html' },
                { icon: 'fa-solid fa-file-medical', label: 'Resume Medis Saya', href: '/dokumen-medis-trial.html' }
            ]
        },
        'aplikasi': {
            title: 'Aplikasi',
            items: [
                { icon: 'fa-solid fa-comments', label: 'Tanya Dokter', href: '/tanya-dokter-trial.html' },
                { icon: 'fa-solid fa-hand', label: 'Gerakan Bayi', href: '/kick-counter-trial.html' },
                { icon: 'fa-solid fa-chart-line', label: 'Monitoring Kehamilan', href: '/pregnancy-tracker-trial.html' },
                { icon: 'fa-solid fa-calendar-days', label: 'Kalender Kesuburan', href: '/fertility-calendar-trial.html' },
                { icon: 'fa-solid fa-kit-medical', label: 'Jadwal Vitamin', href: '/jadwal-vitamin-trial.html' }
            ]
        },
        'edukasi': {
            title: 'Edukasi',
            items: [
                { icon: 'fa-solid fa-heart', label: 'Langkah Awal Ibu', href: '/perjalanan-ibu-trial.html' },
                { icon: 'fa-solid fa-book-open', label: 'Nadi Pengetahuan', href: '/artikel-trial.html' },
                { icon: 'fa-solid fa-stethoscope', label: 'Mengenai istilah bidang Obgyn', href: '/artikel-kesehatan-trial.html' }
            ]
        },
        'jadwal': {
            title: 'Jadwal',
            items: [
                { icon: 'fa-solid fa-calendar-check', label: 'Booking Klinik Minggu', href: '/booking-klinik-trial.html' },
                { icon: 'fa-solid fa-hospital', label: 'Jadwal Rumah Sakit', href: '/jadwal-rs-trial.html' },
                { icon: 'fa-solid fa-stethoscope', label: 'Riwayat Kunjungan', href: '/riwayat-kunjungan-trial.html' },
                { icon: 'fa-solid fa-list-ol', label: 'Antrian Hari Ini', href: '/antrian-trial.html' }
            ]
        }
    };

    var sheetAlign = {
        'dokumen': 'left',
        'aplikasi': 'center',
        'edukasi': 'right',
        'jadwal': 'right'
    };

    // ==================== CSS ====================
    var css = [
        '/* Trial Bottom Nav - Shared Styles */',
        '.tbn-nav-blur-fade { position: fixed; left: 0; right: 0; bottom: 0; height: 220px; z-index: 1001; pointer-events: none; transform: translateY(100%); transition: transform 0.7s cubic-bezier(0.76, 0, 0.24, 1); }',
        '.tbn-nav-blur-fade.tbn-nav-visible { transform: translateY(0); }',
        '.tbn-bottom-sheet-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0, 0, 0, 0.35); z-index: 1000; opacity: 0; visibility: hidden; pointer-events: none; transition: opacity 0.3s ease, visibility 0.3s ease; }',
        '.tbn-bottom-sheet-overlay.active { opacity: 1; visibility: visible; pointer-events: auto; }',
        '.tbn-bottom-sheet { position: fixed; bottom: 70px; width: auto; min-width: 200px; max-width: 280px; background: transparent; border: none; box-shadow: none; padding: 6px 0; z-index: 1001; opacity: 0; transform: translateY(30px); transition: opacity 0.7s cubic-bezier(0.25, 1, 0.5, 1), transform 0.7s cubic-bezier(0.25, 1, 0.5, 1); pointer-events: none; max-height: 60vh; overflow-y: auto; }',
        '.tbn-bottom-sheet.active { opacity: 1; transform: translateY(0); pointer-events: auto; }',
        'body.tbn-sheet-open main { filter: blur(6px); transition: filter 0.7s cubic-bezier(0.25, 1, 0.5, 1); }',
        'body.tbn-sheet-open .tbn-bottom-nav { filter: blur(0); }',
        '.tbn-bottom-sheet-menu { padding: 8px 16px; overflow: hidden; }',
        '.tbn-sheet-menu-item { display: flex; align-items: center; padding: 14px 20px; color: #ffffff; text-decoration: none; transform: scale(1) translateY(0); transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), background-color 0.8s ease-out, color 0.8s ease-out; will-change: transform; border-radius: 10px; position: relative; }',
        '.tbn-sheet-menu-item:hover { transform: scale(1.12) translateY(-1px); background: #ffffff; color: rgb(15, 23, 42) !important; transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), background-color 0.3s ease-in, color 0.3s ease-in; z-index: 10; }',
        '.tbn-sheet-menu-item:hover i.tbn-menu-icon, .tbn-sheet-menu-item:hover span, .tbn-sheet-menu-item:hover .tbn-arrow { color: rgb(15, 23, 42) !important; }',
        '.tbn-sheet-menu-item:active { transform: scale(0.97) translateY(0); transition: transform 0.1s ease; }',
        '.tbn-sheet-menu-item.neighbor { transform: scale(1.05); }',
        '.tbn-sheet-menu-item i.tbn-menu-icon { width: 24px; font-size: 15px; color: #ffffff; margin-right: 14px; }',
        '.tbn-sheet-menu-item span { flex: 1; font-size: 14px; font-weight: 500; }',
        '.tbn-sheet-menu-item .tbn-arrow { color: #ffffff; font-size: 11px; }',
        '.tbn-bottom-nav.tbn-on-light .tbn-sheet-menu-item, .tbn-bottom-nav.tbn-on-light .tbn-sheet-menu-item i.tbn-menu-icon, .tbn-bottom-nav.tbn-on-light .tbn-sheet-menu-item span, .tbn-bottom-nav.tbn-on-light .tbn-sheet-menu-item .tbn-arrow { color: rgb(15, 23, 42) !important; }',
        '.tbn-bottom-nav { position: fixed; left: 0; right: 0; bottom: 0; z-index: 1002; --tbn-fg: #ffffff; --tbn-active-fg: rgb(59, 130, 246); --tbn-indicator: #ffffff; border-top: none; box-shadow: none; padding-bottom: env(safe-area-inset-bottom, 0px); transform: translateY(100%); transition: transform 0.7s cubic-bezier(0.76, 0, 0.24, 1); }',
        '.tbn-bottom-nav.tbn-on-light { --tbn-fg: rgb(15, 23, 42); --tbn-indicator: rgb(15, 23, 42); }',
        '.tbn-bottom-nav.tbn-nav-visible { transform: translateY(0); }',
        '.tbn-bottom-inner { max-width: 760px; margin: 0 auto; padding: 8px 12px 10px; display: grid; grid-template-columns: repeat(5, 1fr); gap: 2px; }',
        '.tbn-nav-item { min-height: 48px; position: relative; display: grid; place-items: center; align-content: center; gap: 3px; color: var(--tbn-fg); text-decoration: none; transition: color 0.4s ease-out, transform 0.4s ease-out; cursor: pointer; border-radius: 10px; margin: 0 2px; background-color: transparent; transform: scale(1) translateY(0); z-index: 1; }',
        '.tbn-nav-item i { font-size: 18px; transition: transform 0.4s ease-out, color 0.4s ease-out; transform: scale(1); color: var(--tbn-fg) !important; }',
        '.tbn-nav-item span { font-size: 9px; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 600; color: var(--tbn-fg) !important; }',
        '.tbn-nav-item::after { content: ""; position: absolute; inset: 0; border-radius: 10px; background: transparent; transition: background-color 0.3s ease, transform 0.3s ease; transform: scale(1); z-index: -1; }',
        '.tbn-nav-item.active i, .tbn-nav-item.active span { color: var(--tbn-active-fg) !important; }',
        '.tbn-nav-item.active::before { content: ""; position: absolute; top: -10px; width: 24px; height: 3px; border-radius: 3px; background: var(--tbn-indicator); }',
        '.tbn-nav-item:active { transform: scale(1.04) translateY(0) !important; transition: transform 0.1s ease !important; }',
        '.tbn-nav-item + .tbn-nav-item { border-left: 1px solid rgba(255,255,255,0.12); }',
        '.tbn-bottom-nav.tbn-on-light .tbn-nav-item + .tbn-nav-item { border-left-color: rgba(15,23,42,0.1); }',
        '.tbn-nav-badge { position: absolute; top: 2px; right: calc(50% - 20px); background: #3b82f6; color: #ffffff; font-size: 8px; font-weight: 700; min-width: 16px; height: 16px; line-height: 16px; text-align: center; border-radius: 50%; padding: 0 3px; display: none; border: 2px solid #0d0d0d; }',
        'body.tbn-footer-visible .tbn-bottom-nav, body.tbn-footer-visible .tbn-nav-blur-fade { transform: translateY(100%) !important; opacity: 0; pointer-events: none; transition: transform 0.35s ease, opacity 0.35s ease !important; }',
        '.tbn-toast { position: fixed; bottom: 90px; left: 50%; transform: translateX(-50%); background: rgba(15,23,42,0.92); color: #fff; padding: 10px 18px; border-radius: 24px; font-size: 13px; font-weight: 500; z-index: 2000; opacity: 0; transition: opacity 0.3s ease; pointer-events: none; }'
    ].join('\n');

    // ==================== HTML TEMPLATE ====================
    var navHtml = [
        '<div class="tbn-nav-blur-fade" id="tbn-nav-blur-fade" aria-hidden="true"></div>',
        '<div class="tbn-bottom-sheet-overlay" id="tbn-sheet-overlay"></div>',
        '<nav class="tbn-bottom-nav" id="tbn-bottom-nav" aria-label="Navigasi bawah">',
        '  <div class="tbn-bottom-sheet" id="tbn-bottom-sheet">',
        '    <div class="tbn-bottom-sheet-menu" id="tbn-sheet-menu"></div>',
        '  </div>',
        '  <div class="tbn-bottom-inner">',
        '    <a href="/patient-menu-simple-trial.html" class="tbn-nav-item" data-tbn-cat="beranda">',
        '      <i class="fa-solid fa-house"></i><span>Beranda</span>',
        '    </a>',
        '    <a href="#" class="tbn-nav-item" data-tbn-cat="dokumen">',
        '      <i class="fa-solid fa-folder-open"></i><span>Dokumen</span>',
        '      <span class="tbn-nav-badge" id="tbn-doc-badge">0</span>',
        '    </a>',
        '    <a href="#" class="tbn-nav-item" data-tbn-cat="aplikasi">',
        '      <i class="fa-solid fa-th-large"></i><span>Aplikasi</span>',
        '    </a>',
        '    <a href="#" class="tbn-nav-item" data-tbn-cat="edukasi">',
        '      <i class="fa-solid fa-book-open"></i><span>Edukasi</span>',
        '    </a>',
        '    <a href="#" class="tbn-nav-item" data-tbn-cat="jadwal">',
        '      <i class="fa-solid fa-calendar-check"></i><span>Jadwal</span>',
        '    </a>',
        '  </div>',
        '</nav>'
    ].join('\n');

    // ==================== INJECTION ====================
    function inject() {
        // Inject CSS
        var style = document.createElement('style');
        style.setAttribute('data-trial-bottom-nav', '');
        style.textContent = css;
        document.head.appendChild(style);

        // Inject nav HTML at end of body
        var container = document.createElement('div');
        container.setAttribute('data-trial-bottom-nav-root', '');
        container.innerHTML = navHtml;
        document.body.appendChild(container);

        bindHandlers();
        setActiveFromUrl();
        setupFooterObserver();
        setupScrollShow();
        setupContrastDetection();
    }

    // ==================== BOTTOM SHEET LOGIC ====================
    function showSheet(category, navBtn) {
        var data = menuData[category];
        if (!data) return;

        var menuHtml = '';
        data.items.forEach(function(item) {
            menuHtml += '<a href="' + item.href + '" class="tbn-sheet-menu-item">' +
                '<i class="' + item.icon + ' tbn-menu-icon"></i>' +
                '<span>' + item.label + '</span>' +
                '<i class="fa-solid fa-chevron-right tbn-arrow"></i>' +
                '</a>';
        });

        var sheetMenu = document.getElementById('tbn-sheet-menu');
        sheetMenu.innerHTML = menuHtml;

        // Neighbor magnify effect
        var items = Array.prototype.slice.call(sheetMenu.querySelectorAll('.tbn-sheet-menu-item'));
        items.forEach(function(item, i) {
            item.addEventListener('mouseenter', function() {
                items.forEach(function(c) { c.classList.remove('neighbor'); });
                if (items[i - 1]) items[i - 1].classList.add('neighbor');
                if (items[i + 1]) items[i + 1].classList.add('neighbor');
            });
            item.addEventListener('mouseleave', function() {
                items.forEach(function(c) { c.classList.remove('neighbor'); });
            });
        });

        // Position sheet relative to tapped nav button
        var sheet = document.getElementById('tbn-bottom-sheet');
        var align = sheetAlign[category] || 'center';
        sheet.style.left = '';
        sheet.style.right = '';

        if (navBtn) {
            var btnRect = navBtn.getBoundingClientRect();
            if (align === 'left') {
                sheet.style.left = btnRect.left + 'px';
                sheet.style.right = 'auto';
            } else if (align === 'right') {
                sheet.style.right = (window.innerWidth - btnRect.right) + 'px';
                sheet.style.left = 'auto';
            } else {
                var sw = Math.min(280, window.innerWidth * 0.92);
                sheet.style.left = ((window.innerWidth - sw) / 2) + 'px';
                sheet.style.right = 'auto';
                sheet.style.width = sw + 'px';
            }
        }

        document.getElementById('tbn-sheet-overlay').classList.add('active');
        sheet.classList.add('active');
        document.body.classList.add('tbn-sheet-open');
    }

    function openSheet(category, navBtn) {
        var sheet = document.getElementById('tbn-bottom-sheet');
        if (!sheet) return;
        if (sheet.classList.contains('active')) {
            sheet.style.transition = 'none';
            sheet.classList.remove('active');
            void sheet.offsetHeight;
            sheet.style.transition = '';
            requestAnimationFrame(function() { showSheet(category, navBtn); });
        } else {
            showSheet(category, navBtn);
        }
    }

    function closeSheet() {
        var overlay = document.getElementById('tbn-sheet-overlay');
        var sheet = document.getElementById('tbn-bottom-sheet');
        if (overlay) overlay.classList.remove('active');
        if (sheet) sheet.classList.remove('active');
        document.body.classList.remove('tbn-sheet-open');
    }

    // Expose for external use (onclick handlers, etc.)
    window.trialBottomNav = {
        open: openSheet,
        close: closeSheet,
        setActive: function(cat) { setActive(cat); }
    };

    // ==================== NAV ITEM HANDLERS ====================
    function bindHandlers() {
        var nav = document.getElementById('tbn-bottom-nav');
        if (!nav) return;

        var items = nav.querySelectorAll('.tbn-nav-item[data-tbn-cat]');
        items.forEach(function(item) {
            var cat = item.getAttribute('data-tbn-cat');
            if (cat === 'beranda') {
                // Direct navigation — no handler needed, <a href> works
                return;
            }
            item.addEventListener('click', function(e) {
                e.preventDefault();
                openSheet(cat, item);
            });
        });

        // Close sheet on overlay click
        var overlay = document.getElementById('tbn-sheet-overlay');
        if (overlay) overlay.addEventListener('click', closeSheet);

        // Close sheet on outside click
        document.addEventListener('click', function(e) {
            var sheet = document.getElementById('tbn-bottom-sheet');
            if (!sheet || !sheet.classList.contains('active')) return;
            if (sheet.contains(e.target) || e.target.closest('.tbn-nav-item')) return;
            closeSheet();
        });
    }

    // ==================== ACTIVE STATE ====================
    function setActive(category) {
        var nav = document.getElementById('tbn-bottom-nav');
        if (!nav) return;
        var items = nav.querySelectorAll('.tbn-nav-item');
        items.forEach(function(item) {
            if (item.getAttribute('data-tbn-cat') === category) {
                item.classList.add('active');
                item.setAttribute('aria-current', 'page');
            } else {
                item.classList.remove('active');
                item.removeAttribute('aria-current');
            }
        });
    }

    function setActiveFromUrl() {
        var cat = detectActive();
        if (cat) setActive(cat);
    }

    // ==================== FOOTER OBSERVER ====================
    function setupFooterObserver() {
        var footer = document.querySelector('.site-footer, footer.site-footer, footer');
        if (!footer || !('IntersectionObserver' in window)) return;
        var io = new IntersectionObserver(function(entries) {
            entries.forEach(function(e) {
                document.body.classList.toggle('tbn-footer-visible', e.isIntersecting);
            });
        }, { root: null, threshold: 0.01, rootMargin: '0px 0px -40px 0px' });
        io.observe(footer);
    }

    // ==================== SCROLL SHOW/HIDE ====================
    function setupScrollShow() {
        var nav = document.getElementById('tbn-bottom-nav');
        var blurFade = document.getElementById('tbn-nav-blur-fade');
        if (!nav) return;
        var threshold = 50;

        function onScroll() {
            if (window.scrollY > threshold) {
                nav.classList.add('tbn-nav-visible');
                if (blurFade) blurFade.classList.add('tbn-nav-visible');
            } else {
                nav.classList.remove('tbn-nav-visible');
                if (blurFade) blurFade.classList.remove('tbn-nav-visible');
            }
        }

        // Show immediately if page is short (no scroll possible)
        function checkInitial() {
            if (document.documentElement.scrollHeight <= window.innerHeight + threshold) {
                nav.classList.add('tbn-nav-visible');
                if (blurFade) blurFade.classList.add('tbn-nav-visible');
            } else {
                onScroll();
            }
        }

        window.addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener('resize', checkInitial, { passive: true });
        checkInitial();
        // Re-check after layout settles
        setTimeout(checkInitial, 300);
        setTimeout(checkInitial, 1000);
    }

    // ==================== CONTRAST DETECTION ====================
    function setupContrastDetection() {
        var nav = document.getElementById('tbn-bottom-nav');
        if (!nav) return;

        function parseRgb(color) {
            if (!color) return null;
            var m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/i);
            if (!m) return null;
            return {
                r: parseInt(m[1], 10),
                g: parseInt(m[2], 10),
                b: parseInt(m[3], 10),
                a: m[4] !== undefined ? parseFloat(m[4]) : 1
            };
        }

        function findBackgroundColor(el) {
            var node = el;
            while (node && node !== document.documentElement) {
                var bg = parseRgb(getComputedStyle(node).backgroundColor);
                if (bg && bg.a > 0.05) return bg;
                node = node.parentElement;
            }
            return { r: 13, g: 13, b: 13, a: 1 };
        }

        function isLight(bg) {
            var luminance = (0.2126 * bg.r + 0.7152 * bg.g + 0.0722 * bg.b) / 255;
            return luminance > 0.62;
        }

        function update() {
            var sampleY = Math.max(0, Math.floor(window.innerHeight - nav.offsetHeight - 16));
            var samplePoints = [0.2, 0.5, 0.8];
            var lightHits = 0;
            for (var i = 0; i < samplePoints.length; i += 1) {
                var sampleX = Math.floor(window.innerWidth * samplePoints[i]);
                var stack = document.elementsFromPoint(sampleX, sampleY);
                var target = null;
                for (var j = 0; j < stack.length; j += 1) {
                    var el = stack[j];
                    if (!el) continue;
                    if (el === nav || el.closest('.tbn-bottom-nav') || el.closest('.tbn-nav-blur-fade')) continue;
                    target = el;
                    break;
                }
                if (!target) continue;
                if (isLight(findBackgroundColor(target))) lightHits += 1;
            }
            if (lightHits >= 2) nav.classList.add('tbn-on-light');
            else nav.classList.remove('tbn-on-light');
        }

        var queued = false;
        function schedule() {
            if (queued) return;
            queued = true;
            requestAnimationFrame(function() { queued = false; update(); });
        }

        window.addEventListener('scroll', schedule, { passive: true });
        window.addEventListener('resize', schedule, { passive: true });
        update();
        setTimeout(update, 250);
    }

    // ==================== INIT ====================
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', inject);
    } else {
        inject();
    }
})();

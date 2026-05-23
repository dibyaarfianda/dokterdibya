/**
 * Patient Portal — Trial Theme Router
 *
 * Parallel route set: every old page can have a -trial.html counterpart.
 * Only pages listed in TRIAL_ROUTES get redirected; the rest stay on the
 * old page (with optional lightweight CSS override).
 *
 * Activate:   ?theme=newdesign   (sticky per tab via sessionStorage)
 * Deactivate: ?theme=off | ?theme=old | ?theme=default
 */
(function () {
    'use strict';

    var KEY  = 'patient_portal_theme_mode';
    var MODE = 'newdesign';
    var TRIAL_HOME = '/patient-menu-simple-trial.html';

    // ---- Centralized route map (old ↔ trial) ----
    // Add entries here as new trial pages are created.
    var TRIAL_ROUTES = {
        '/patient-menu.html':       '/patient-menu-trial.html',
        '/profil.html':             '/profil-trial.html',
        '/notifikasi.html':         '/notifikasi-trial.html',
        '/album-usg.html':          '/album-usg-trial.html',
        '/dokumen-medis.html':      '/dokumen-medis-trial.html',
        '/booking-klinik.html':     '/booking-klinik-trial.html',
        '/artikel.html':            '/artikel-trial.html',
        '/artikel-kesehatan.html':  '/artikel-kesehatan-trial.html',
        '/perjalanan-ibu.html':     '/perjalanan-ibu-trial.html',
        '/fertility-calendar.html': '/fertility-calendar-trial.html',
        '/jadwal-vitamin.html':     '/jadwal-vitamin-trial.html',
        '/pregnancy-tracker.html':  '/pregnancy-tracker-trial.html',
        '/kick-counter.html':       '/kick-counter-trial.html',
        '/hasil-lab.html':          '/hasil-lab-trial.html',
        '/jadwal-rs.html':          '/jadwal-rs-trial.html',
        '/riwayat-kunjungan.html':  '/riwayat-kunjungan-trial.html',
        '/antrian.html':            '/antrian-trial.html',
        '/estimasi-biaya-kehamilan.html': '/estimasi-biaya-kehamilan-trial.html',
        '/feedback.html':           '/feedback-trial.html',
        '/patient-login.html':      '/patient-login-trial.html',
        '/tanya-dokter.html':       '/tanya-dokter-trial.html'
    };

    // Build reverse map (trial → old)
    var REVERSE = {};
    for (var old in TRIAL_ROUTES) {
        REVERSE[TRIAL_ROUTES[old]] = old;
    }

    // ---- Helpers ----
    function set(v) { try { v ? sessionStorage.setItem(KEY, v) : sessionStorage.removeItem(KEY); } catch(e){} }
    function get()  { try { return sessionStorage.getItem(KEY); } catch(e){ return null; } }

    // ---- Read / write mode from URL ----
    var params    = new URLSearchParams(window.location.search);
    var fromUrl   = params.get('theme');
    var forceOld  = fromUrl === 'off' || fromUrl === 'old' || fromUrl === 'default';

    if (fromUrl === MODE || fromUrl === 'trial')                  set(MODE);
    else if (forceOld) set(null);

    var active   = get() === MODE;
    var pathname = window.location.pathname;
    var isTrialPage = !!REVERSE[pathname] || /-trial\.html$/i.test(pathname);

    if (isTrialPage && !forceOld) {
        active = true;
        set(MODE);
    }

    function normalizeTrialBrandText(root) {
        if (!isTrialPage) return;
        var scope = root || document.body;
        if (!scope) return;

        if (document.title) {
            document.title = document.title
                .replace(/dokterDIBYA/g, 'SISIwanita')
                .replace(/Dokter Dibya/g, 'SISIwanita')
                .replace(/DokterDibya/g, 'SISIwanita');
        }

        scope.querySelectorAll && scope.querySelectorAll('.brand-title, .site-footer-logo').forEach(function (element) {
            if (/dokter\s*DIBYA|dokterDIBYA|Dokter Dibya|DokterDibya/i.test(element.textContent || '')) {
                element.textContent = 'SISIwanita';
            }
        });

        var walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT, {
            acceptNode: function (node) {
                if (!node || !node.nodeValue) return NodeFilter.FILTER_REJECT;
                if (!/dokterDIBYA|Dokter Dibya|DokterDibya/.test(node.nodeValue)) return NodeFilter.FILTER_REJECT;
                var parent = node.parentElement;
                if (!parent || /^(SCRIPT|STYLE|NOSCRIPT|TEXTAREA|INPUT)$/i.test(parent.tagName)) return NodeFilter.FILTER_REJECT;
                return NodeFilter.FILTER_ACCEPT;
            }
        });

        var nodes = [];
        var node;
        while ((node = walker.nextNode())) nodes.push(node);
        nodes.forEach(function (textNode) {
            textNode.nodeValue = textNode.nodeValue
                .replace(/dokterDIBYA/g, 'SISIwanita')
                .replace(/Dokter Dibya/g, 'SISIwanita')
                .replace(/DokterDibya/g, 'SISIwanita');
        });
    }

    function installTrialBrandNormalizer() {
        if (!isTrialPage || window.__patientTrialBrandNormalizerInstalled) return;
        window.__patientTrialBrandNormalizerInstalled = true;
        var scheduled = false;
        var observer = null;

        function run() {
            scheduled = false;
            try { if (observer) observer.disconnect(); } catch (error) {}
            normalizeTrialBrandText(document.body);
            try {
                if (observer && document.body) {
                    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
                }
            } catch (error) {}
        }

        function schedule() {
            if (scheduled) return;
            scheduled = true;
            window.setTimeout(run, 120);
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', schedule, { once: true });
        } else {
            schedule();
        }

        try {
            observer = new MutationObserver(function () {
                schedule();
            });
            if (document.body) observer.observe(document.body, { childList: true, subtree: true, characterData: true });
        } catch (error) {}
    }

    function getCurrentPageLabel() {
        var title = document.title || '';
        return title
            .replace(/\s*-\s*SISIwanita\s*$/i, '')
            .replace(/\s*-\s*dokterDIBYA\s*$/i, '')
            .trim() || 'Portal Pasien';
    }

    function installUnifiedTrialHeader() {
        if (!isTrialPage || window.__patientTrialHeaderInstalled) return;
        if (pathname === TRIAL_HOME || pathname === '/patient-menu-trial.html') return;
        window.__patientTrialHeaderInstalled = true;

        function run() {
            if (!document.body || document.querySelector('.trial-unified-header')) return;

            var existingHeader = document.querySelector('.topbar, .mini-topbar, .visit-topbar, .topbar-trial');

            var mount = document.querySelector('.app, .visit-app, .feedback-container, .content, .main-content, .page-wrap, .screen, .app-wrapper, .page-body, .fc-container') || document.body;
            var header = document.createElement('header');
            header.className = 'trial-unified-header';

            var brand = document.createElement('a');
            brand.className = 'trial-unified-brand';
            brand.href = trialHomeUrl();
            brand.setAttribute('aria-label', 'Beranda SISIwanita');

            var brandTitle = document.createElement('div');
            brandTitle.className = 'brand-title';
            brandTitle.innerHTML = 'SISI<span>wanita</span>';

            var brandSub = document.createElement('div');
            brandSub.className = 'brand-sub';
            brandSub.textContent = getCurrentPageLabel();

            brand.appendChild(brandTitle);
            brand.appendChild(brandSub);

            var back = document.createElement('button');
            back.type = 'button';
            back.className = 'trial-unified-back';
            back.setAttribute('aria-label', 'Kembali ke portal');
            back.innerHTML = '<i class="fa-solid fa-arrow-left"></i><span>Portal</span>';
            back.addEventListener('click', function () {
                window.goPatientTrialBack();
            });

            header.appendChild(brand);
            header.appendChild(back);

            mount.insertBefore(header, mount.firstChild || null);
            document.body.classList.add('trial-header-normalized');
            if (existingHeader) existingHeader.classList.add('trial-legacy-header');
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', run, { once: true });
        } else {
            run();
        }
    }

    installTrialBrandNormalizer();
    installUnifiedTrialHeader();

    // ---- Redirect logic ----
    // Strip theme param, keep the rest (token, etc.)
    function buildQS() {
        var p = new URLSearchParams(window.location.search);
        p.delete('theme');
        var s = p.toString();
        return s ? '?' + s : '';
    }

    // On an OLD page that has a trial counterpart → redirect to trial
    if (active && TRIAL_ROUTES[pathname]) {
        window.location.replace(TRIAL_ROUTES[pathname] + buildQS() + window.location.hash);
        return;                                // stop further execution
    }

    // On a TRIAL page, only redirect to old counterpart if user explicitly requests old mode.
    if (forceOld && REVERSE[pathname]) {
        window.location.replace(REVERSE[pathname] + buildQS() + window.location.hash);
        return;
    }

    function trialHomeUrl() {
        return TRIAL_HOME;
    }

    window.goPatientTrialBack = function () {
        window.location.href = trialHomeUrl();
    };

    if (isTrialPage && pathname !== TRIAL_HOME && !window.__patientTrialBackGuardInstalled) {
        window.__patientTrialBackGuardInstalled = true;
        try {
            window.history.pushState({ patientTrialBackGuard: true }, document.title, window.location.href);
            window.addEventListener('popstate', function () {
                window.goPatientTrialBack();
            });
        } catch (error) {}
    }

    document.addEventListener('click', function (e) {
        if (!isTrialPage) return;

        var target = e.target && e.target.closest
            ? e.target.closest('a[href], button[onclick], .back-btn, .back-link, .topbar-trial-back, .btn-back, .visit-back')
            : null;
        if (!target) return;

        var href = target.getAttribute('href') || '';
        var onclick = target.getAttribute('onclick') || '';
        var label = (target.textContent || target.getAttribute('aria-label') || '').toLowerCase();
        var isBackTarget =
            href === '/patient-menu.html' ||
            href === '/patient-menu-trial.html' ||
            href === '/patient-menu-simple-trial.html' ||
            href.indexOf('javascript:history.back') === 0 ||
            onclick.indexOf('history.back') !== -1 ||
            onclick.indexOf("'/patient-menu-trial.html'") !== -1 ||
            onclick.indexOf("'/patient-menu-simple-trial.html'") !== -1 ||
            label.indexOf('kembali') !== -1 ||
            label.indexOf('portal') !== -1;

        if (!isBackTarget) return;

        e.preventDefault();
        e.stopPropagation();
        if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
        window.goPatientTrialBack();
    }, true);

    // Trial is OFF and we're on a normal page → nothing to do
    if (!active) return;

    // ---- We are in trial mode on a page (trial or old-without-counterpart) ----

    // For old pages that have NO trial counterpart: apply lightweight CSS
    if (!isTrialPage) {
        document.documentElement.classList.add('trial-newdesign-theme');
        function applyBody() { if (document.body) document.body.classList.add('trial-newdesign-theme'); }
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', applyBody, { once: true });
        else applyBody();

        if (!document.getElementById('patient-theme-trial-css')) {
            var css = document.createElement('link');
            css.id  = 'patient-theme-trial-css';
            css.rel = 'stylesheet';
            css.href = '/styles/patient-portal-newdesign-trial.css';
            document.head.appendChild(css);
        }
        if (!document.getElementById('patient-theme-trial-font')) {
            var font = document.createElement('link');
            font.id  = 'patient-theme-trial-font';
            font.rel = 'stylesheet';
            font.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap';
            document.head.appendChild(font);
        }
    }

    // ---- Link rewriter: keep navigation inside trial route set ----
    document.addEventListener('click', function (e) {
        var link = e.target && e.target.closest ? e.target.closest('a[href]') : null;
        if (!link) return;

        var href = link.getAttribute('href');
        if (!href || href.charAt(0) === '#' || href.indexOf('javascript:') === 0) return;

        try {
            var u = new URL(link.href, window.location.origin);
            if (u.origin !== window.location.origin) return;

            if (u.pathname === '/patient-menu.html' || u.pathname === '/patient-menu-trial.html') {
                link.href = trialHomeUrl();
                return;
            }

            // If the link points to an old page that has a trial counterpart → rewrite
            if (TRIAL_ROUTES[u.pathname]) {
                link.href = TRIAL_ROUTES[u.pathname] + u.search + u.hash;
                return;
            }

            // Otherwise append theme param so the target page stays in trial
            if (u.pathname.endsWith('.html') && !REVERSE[u.pathname]) {
                u.searchParams.set('theme', MODE);
                link.href = u.pathname + u.search + u.hash;
            }
        } catch (ex) { /* ignore malformed */ }
    }, true);
})();

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

    if (fromUrl === MODE)                                         set(MODE);
    else if (forceOld) set(null);

    var active   = get() === MODE;
    var pathname = window.location.pathname;

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

    // Trial is OFF and we're on a normal page → nothing to do
    if (!active) return;

    // ---- We are in trial mode on a page (trial or old-without-counterpart) ----
    var isTrialPage = !!REVERSE[pathname];

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

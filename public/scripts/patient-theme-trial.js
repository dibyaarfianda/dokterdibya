(function () {
    var KEY = 'patient_portal_theme_mode';
    var MODE_NEW = 'newdesign';
    var currentUrl = new URL(window.location.href);
    var modeFromUrl = currentUrl.searchParams.get('theme');
    var activeMode = null;

    function safeSetMode(value) {
        try {
            if (value) {
                sessionStorage.setItem(KEY, value);
            } else {
                sessionStorage.removeItem(KEY);
            }
        } catch (e) {
            // Ignore storage errors in private/incognito contexts.
        }
    }

    function safeGetMode() {
        try {
            return sessionStorage.getItem(KEY);
        } catch (e) {
            return null;
        }
    }

    // Explicit URL controls for switching modes during QA.
    if (modeFromUrl === MODE_NEW) {
        safeSetMode(MODE_NEW);
    } else if (modeFromUrl === 'default' || modeFromUrl === 'old' || modeFromUrl === 'off') {
        safeSetMode(null);
    }

    activeMode = safeGetMode();
    if (activeMode !== MODE_NEW) {
        return;
    }

    document.documentElement.classList.add('trial-newdesign-theme');

    function applyThemeClass() {
        if (document.body) {
            document.body.classList.add('trial-newdesign-theme');
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', applyThemeClass, { once: true });
    } else {
        applyThemeClass();
    }

    // Inject trial stylesheet only when mode is active.
    if (!document.getElementById('patient-theme-trial-css')) {
        var css = document.createElement('link');
        css.id = 'patient-theme-trial-css';
        css.rel = 'stylesheet';
        css.href = '/styles/patient-portal-newdesign-trial.css';
        document.head.appendChild(css);
    }

    // Match the prototype typography when not already present.
    if (!document.getElementById('patient-theme-trial-font')) {
        var font = document.createElement('link');
        font.id = 'patient-theme-trial-font';
        font.rel = 'stylesheet';
        font.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap';
        document.head.appendChild(font);
    }

    // Keep the mode sticky when navigating via anchor links.
    document.addEventListener('click', function (event) {
        var target = event.target;
        if (!target) {
            return;
        }

        var link = target.closest ? target.closest('a[href]') : null;
        if (!link) {
            return;
        }

        var href = link.getAttribute('href');
        if (!href || href.startsWith('javascript:') || href.startsWith('#')) {
            return;
        }

        try {
            var parsed = new URL(link.href, window.location.origin);
            if (parsed.origin !== window.location.origin) {
                return;
            }

            if (parsed.pathname.endsWith('.html')) {
                parsed.searchParams.set('theme', MODE_NEW);
                link.href = parsed.pathname + parsed.search + parsed.hash;
            }
        } catch (e) {
            // Ignore malformed URLs to avoid breaking navigation.
        }
    }, true);
})();

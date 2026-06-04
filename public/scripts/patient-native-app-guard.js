(function() {
    'use strict';

    var DISABLED_PATH = '/mobile-app-disabled.html';
    var currentPath = window.location.pathname || '/';

    function isAndroidWebView() {
        var ua = navigator.userAgent || '';
        return /Android/i.test(ua) && (/(;\s*wv\)|\bwv\b)/i.test(ua) || /Version\/\d+(?:\.\d+)?/i.test(ua));
    }

    function isCapacitorRuntime() {
        return !!(window.Capacitor && (
            (typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform()) ||
            window.Capacitor.Plugins
        ));
    }

    function hasLegacyMobileMarker() {
        try {
            return localStorage.getItem('from_mobile_app') === 'true' ||
                sessionStorage.getItem('from_mobile_app') === 'true';
        } catch (error) {
            return false;
        }
    }

    function isNativeScheme() {
        return /^(capacitor|ionic|file):$/i.test(window.location.protocol || '');
    }

    function shouldBlockNativeApp() {
        if (currentPath === DISABLED_PATH) return false;
        if (window.__allowLegacyPatientNativeApp === true) return false;
        return isNativeScheme() || isAndroidWebView() || isCapacitorRuntime() || hasLegacyMobileMarker();
    }

    if (!shouldBlockNativeApp()) return;

    try {
        localStorage.removeItem('from_mobile_app');
        sessionStorage.removeItem('from_mobile_app');
        sessionStorage.setItem('patient_native_app_blocked_at', String(Date.now()));
    } catch (error) {}

    var target = DISABLED_PATH + '?from=' + encodeURIComponent(currentPath);
    window.location.replace(target);
})();

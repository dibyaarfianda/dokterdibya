(function () {
    'use strict';

    // Where to send a patient after login. Only a short list of portal pages may be returned to,
    // and only with known query parameters, so a crafted ?next= can never send anyone off-site.
    var ALLOWED = {
        '/bayar-estimasi.html': {
            kategori: /^(?:obstetri|obstetri_usg4d|gyn_repro|gyn_special)$/,
            order: /^DPK-[0-9a-f-]{36}$/i
        }
    };

    function sanitize(raw) {
        if (typeof raw !== 'string' || !raw) return null;
        if (raw.charAt(0) !== '/' || raw.charAt(1) === '/' || raw.indexOf('\\') !== -1) return null;
        var url;
        try {
            url = new URL(raw, window.location.origin);
        } catch (error) {
            return null;
        }
        if (url.origin !== window.location.origin) return null;
        var rules = ALLOWED[url.pathname];
        if (!rules) return null;
        var params = new URLSearchParams();
        Object.keys(rules).forEach(function (key) {
            var value = url.searchParams.get(key);
            if (value && rules[key].test(value)) params.set(key, value);
        });
        var query = params.toString();
        return url.pathname + (query ? '?' + query : '');
    }

    function get() {
        try {
            return sanitize(new URLSearchParams(window.location.search).get('next'));
        } catch (error) {
            return null;
        }
    }

    function withNext(href) {
        var next = get();
        if (!next) return href;
        return href + (href.indexOf('?') === -1 ? '?' : '&') + 'next=' + encodeURIComponent(next);
    }

    window.PatientSafeNext = { get: get, sanitize: sanitize, withNext: withNext };
})();

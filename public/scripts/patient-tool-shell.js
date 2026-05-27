/* SISIwanita Patient Tool Shell
   Shared navigation, bottom sheet, avatar, and reveal helpers for trial tool pages. */
(function () {
    'use strict';

    var DEFAULT_ACTIVE_NAV = 'beranda';
    var DEFAULT_HOME_URL = '/patient-menu-simple-trial.html';
    var state = window.__patientToolShellState || {
        initialized: false,
        activeNav: DEFAULT_ACTIVE_NAV,
        homeUrl: DEFAULT_HOME_URL,
        menuData: null
    };
    window.__patientToolShellState = state;

    var defaultMenuData = {
        dokumen: { title: 'Dokumen', items: [
            ['fa-solid fa-image', 'Album USG', '/album-usg-trial.html'],
            ['fa-solid fa-flask', 'Hasil Lab', '/hasil-lab-trial.html'],
            ['fa-solid fa-file-medical', 'Resume Medis', '/dokumen-medis-trial.html']
        ]},
        aplikasi: { title: 'Aplikasi', items: [
            ['fa-solid fa-hand', 'Gerakan Bayi', '/kick-counter-trial.html'],
            ['fa-solid fa-chart-line', 'Monitoring Kehamilan', '/pregnancy-tracker-trial.html'],
            ['fa-solid fa-calendar-days', 'Kalender Kesuburan', '/fertility-calendar-trial.html'],
            ['fa-solid fa-pills', 'Jadwal Vitamin', '/jadwal-vitamin-trial.html']
        ]},
        jadwal: { title: 'Jadwal', items: [
            ['fa-solid fa-calendar-check', 'Booking Klinik Minggu', '/booking-klinik-trial.html'],
            ['fa-solid fa-hospital', 'Jadwal Rumah Sakit', '/jadwal-rs-trial.html'],
            ['fa-solid fa-stethoscope', 'Riwayat Kunjungan', '/riwayat-kunjungan-trial.html'],
            ['fa-solid fa-list-ol', 'Antrian Hari Ini', '/antrian-trial.html']
        ]},
        edukasi: { title: 'Edukasi', items: [
            ['fa-solid fa-heart', 'Perjalanan Ibu', '/perjalanan-ibu-trial.html'],
            ['fa-solid fa-book-open', 'Ruang Membaca', '/artikel-trial.html'],
            ['fa-solid fa-stethoscope', 'Istilah Obgyn', '/artikel-kesehatan-trial.html']
        ]}
    };

    function ready(callback) {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', callback, { once: true });
        } else {
            callback();
        }
    }

    function escapeHtml(value) {
        var div = document.createElement('div');
        div.textContent = value == null ? '' : String(value);
        return div.innerHTML;
    }

    function getStoredPatient() {
        try { return JSON.parse(localStorage.getItem('patient_user') || '{}'); } catch (error) { return {}; }
    }

    function getInitials(name) {
        var parts = String(name || '').split(/\s+/).filter(Boolean);
        var initials = parts.slice(0, 2).map(function (part) { return part.charAt(0); }).join('').toUpperCase();
        return initials || 'SW';
    }

    function go(url) {
        if (!url) return;
        window.location.href = url;
    }

    function closeSheet() {
        var overlay = document.getElementById('sheet-overlay');
        var sheet = document.getElementById('bottom-sheet');
        if (overlay) overlay.classList.remove('active');
        if (sheet) sheet.classList.remove('active');
    }

    function openSheet(category) {
        var data = (state.menuData || defaultMenuData)[category];
        var overlay = document.getElementById('sheet-overlay');
        var sheet = document.getElementById('bottom-sheet');
        var title = document.getElementById('sheet-title');
        var menu = document.getElementById('sheet-menu');
        if (!data || !overlay || !sheet || !title || !menu) return;

        title.textContent = data.title;
        menu.innerHTML = data.items.map(function (item) {
            return '<a class="sheet-item soundable" href="' + item[2] + '">' +
                '<i class="' + item[0] + '"></i>' +
                '<span>' + escapeHtml(item[1]) + '</span>' +
                '</a>';
        }).join('');

        overlay.classList.add('active');
        sheet.classList.add('active');
    }

    function openMyCorner() {
        if (window.PatientMyCorner && typeof window.PatientMyCorner.open === 'function') {
            return window.PatientMyCorner.open();
        }
        window.location.href = state.homeUrl + '#my-corner';
    }

    function scrollTopHome() {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function updateAvatarInitials(profile) {
        var user = profile || getStoredPatient();
        var name = user.fullname || user.full_name || user.name || 'SISIwanita';
        var initialsEl = document.getElementById('user-avatar-initials');
        if (initialsEl) initialsEl.textContent = getInitials(name);
    }

    function setActiveNav(activeNav) {
        state.activeNav = activeNav || state.activeNav || DEFAULT_ACTIVE_NAV;
        var nav = document.getElementById('home-bottom-nav');
        if (!nav) return;
        Array.prototype.forEach.call(nav.querySelectorAll('.nav-item'), function (item) {
            var key = item.getAttribute('data-tool-nav') || item.getAttribute('data-shell-nav') || '';
            item.classList.toggle('active', key === state.activeNav);
        });
    }

    function triggerIntro() {
        document.body.classList.remove('header-animated');
        requestAnimationFrame(function () {
            requestAnimationFrame(function () {
                document.body.classList.add('header-animated');
            });
        });
    }

    function showContent(options) {
        options = options || {};
        var loading = document.getElementById(options.loadingId || 'loading-state');
        var content = document.getElementById(options.contentId || 'content-wrapper');
        if (loading) loading.style.display = 'none';
        if (content) content.style.display = options.contentDisplay || 'block';
        document.body.classList.remove('home-sections-locked');
        document.body.classList.add('home-sections-unlocked');
        triggerIntro();
    }

    function init(options) {
        options = options || {};
        state.homeUrl = options.homeUrl || state.homeUrl || DEFAULT_HOME_URL;
        state.activeNav = options.activeNav || document.body.getAttribute('data-tool-shell-active') || state.activeNav || DEFAULT_ACTIVE_NAV;
        state.menuData = options.menuData || state.menuData || defaultMenuData;
        document.body.classList.add('patient-tool-shell');

        ready(function () {
            updateAvatarInitials(options.profile);
            setActiveNav(state.activeNav);
            if (options.unlockOnReady) showContent(options);
        });

        state.initialized = true;
    }

    var api = {
        init: init,
        go: go,
        openSheet: openSheet,
        closeSheet: closeSheet,
        openMyCorner: openMyCorner,
        scrollTopHome: scrollTopHome,
        updateAvatarInitials: updateAvatarInitials,
        setActiveNav: setActiveNav,
        triggerIntro: triggerIntro,
        showContent: showContent,
        menuData: defaultMenuData
    };

    window.PatientToolShell = api;
    window.go = go;
    window.openSheet = openSheet;
    window.closeSheet = closeSheet;
    window.openMyCorner = openMyCorner;
    window.scrollTopHome = scrollTopHome;
})();
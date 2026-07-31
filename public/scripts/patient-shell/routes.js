export const PATIENT_MENU_DATA = Object.freeze({
    dokumen: {
        title: 'Dokumen',
        items: [
            ['fa-solid fa-image', 'Album USG', '/album-usg.html'],
            ['fa-solid fa-flask', 'Hasil Lab', '/hasil-lab.html'],
            ['fa-solid fa-file-medical', 'Resume Medis', '/dokumen-medis.html']
        ]
    },
    aplikasi: {
        title: 'Aplikasi',
        items: [
            ['fa-solid fa-hand', 'Gerakan Bayi', '/kick-counter.html'],
            ['fa-solid fa-chart-line', 'Monitoring Kehamilan', '/pregnancy-tracker.html'],
            ['fa-solid fa-wave-square', 'Hitung Kontraksi', '/contraction-timer.html'],
            ['fa-solid fa-calendar-days', 'Kalender Kesuburan', '/fertility-calendar.html'],
            ['fa-solid fa-pills', 'Jadwal Vitamin', '/jadwal-vitamin.html']
        ]
    },
    jadwal: {
        title: 'Jadwal',
        items: [
            ['fa-solid fa-calendar-check', 'Booking Klinik Minggu', '/booking-klinik.html'],
            ['fa-solid fa-hospital', 'Jadwal Rumah Sakit', '/jadwal-rs.html'],
            ['fa-solid fa-stethoscope', 'Riwayat Kunjungan', '/riwayat-kunjungan.html'],
            ['fa-solid fa-list-ol', 'Antrian Hari Ini', '/antrian.html']
        ]
    },
    edukasi: {
        title: 'Ruang Baca',
        items: [
            ['fa-solid fa-heart', 'Perjalanan Ibu', '/perjalanan-ibu.html'],
            ['fa-solid fa-book-open', 'Ruang Membaca', '/artikel.html'],
            ['fa-solid fa-comment-medical', 'Ruang Cerita', '/ruang-cerita.html', 'Baru']
        ]
    }
});

const GUEST_DEMO_ROUTES = Object.freeze({
    '/patient-menu.html': Object.freeze({}),
    '/jadwal-rs.html': Object.freeze({ mockParam: 'mockApi' }),
    '/perjalanan-ibu.html': Object.freeze({}),
    '/artikel.html': Object.freeze({}),
    '/info-terbaru.html': Object.freeze({})
});

const GUEST_LOGIN_ROUTES = new Set([
    '/kick-counter.html',
    '/pregnancy-tracker.html',
    '/contraction-timer.html',
    '/fertility-calendar.html',
    '/jadwal-vitamin.html'
]);

export function getGuestNavigationUrl(url) {
    let parsed;
    try {
        parsed = new URL(url, window.location.origin);
    } catch (error) {
        return null;
    }
    if (parsed.origin !== window.location.origin) return null;

    const rule = GUEST_DEMO_ROUTES[parsed.pathname];
    if (!rule) return null;
    parsed.searchParams.set('guest', '1');
    if (rule.mockParam) parsed.searchParams.set(rule.mockParam, '1');
    return parsed.pathname + parsed.search + parsed.hash;
}

export function isGuestLoginRoute(url) {
    let parsed;
    try {
        parsed = new URL(url, window.location.origin);
    } catch (error) {
        return false;
    }
    return parsed.origin === window.location.origin && GUEST_LOGIN_ROUTES.has(parsed.pathname);
}

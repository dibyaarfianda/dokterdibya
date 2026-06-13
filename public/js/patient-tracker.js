/**
 * Patient Page View Tracker
 * Fire-and-forget: tracks patient portal page visits for staff analytics.
 * Include this script in patient-facing HTML pages.
 */
(function() {
    var token = localStorage.getItem('vps_auth_token');
    if (!token) return;

    var pageLabels = {
        '/patient-menu.html': 'SISIwanita - Dashboard Pasien',
        '/profil.html': 'SISIwanita - Profil',
        '/notifikasi.html': 'SISIwanita - Notifikasi',
        '/album-usg.html': 'SISIwanita - Album USG',
        '/dokumen-medis.html': 'SISIwanita - Dokumen Medis',
        '/booking-klinik.html': 'SISIwanita - Booking Klinik',
        '/artikel.html': 'SISIwanita - Artikel',
        '/artikel-kesehatan.html': 'SISIwanita - Artikel Kesehatan',
        '/perjalanan-ibu.html': 'SISIwanita - Perjalanan Ibu',
        '/fertility-calendar.html': 'SISIwanita - Kalender Fertilitas',
        '/jadwal-vitamin.html': 'SISIwanita - Jadwal Vitamin',
        '/pregnancy-tracker.html': 'SISIwanita - Monitoring Kehamilan',
        '/kick-counter.html': 'SISIwanita - Kick Counter',
        '/contraction-timer.html': 'SISIwanita - Penghitung Kontraksi',
        '/hasil-lab.html': 'SISIwanita - Hasil Lab',
        '/jadwal-rs.html': 'SISIwanita - Jadwal RS',
        '/riwayat-kunjungan.html': 'SISIwanita - Riwayat Kunjungan',
        '/antrian.html': 'SISIwanita - Antrian Klinik',
        '/estimasi-biaya-kehamilan.html': 'SISIwanita - Estimasi Biaya Kehamilan',
        '/feedback.html': 'SISIwanita - Feedback',
        '/tanya-dokter.html': 'SISIwanita - Tanya Dokter',
        '/patient-dashboard.html': 'Portal Pasien - Dashboard Lama',
        '/patient-intake.html': 'Portal Pasien - Intake',
        '/patient-billing.html': 'Portal Pasien - Tagihan',
        '/patient-visit-history.html': 'Portal Pasien - Riwayat Visit',
        '/riwayat-medis.html': 'Portal Pasien - Riwayat Medis',
        '/booking-appointment.html': 'Portal Pasien - Booking Appointment',
        '/gallery-kenangan.html': 'Portal Pasien - Galeri Kenangan',
        '/subscription.html': 'Portal Pasien - Subscription',
        '/bantuan.html': 'Portal Pasien - Bantuan'
    };

    var path = location.pathname || '';
    var pageName = pageLabels[path] || document.title || path || 'Halaman Pasien';

    fetch('/api/patients/track-page', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify({ page_name: pageName })
    }).catch(function() {});
})();

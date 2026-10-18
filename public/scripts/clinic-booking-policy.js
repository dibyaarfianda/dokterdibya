(function(root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.ClinicBookingPolicy = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
    'use strict';

    // Keep published versions immutable: change this version when the terms change.
    const version = '20261017-confirmation-v1';
    const title = 'Booking belum berarti kehadiran terkonfirmasi.';
    const schedule = 'Popup konfirmasi di portal aktif mulai H-1 pukul 18:00 WIB dan diperbarui pada hari praktik pukul 07:00 WIB.';
    const immediate = 'Jika booking dibuat setelah waktu aktivasi, popup langsung tersedia saat portal dibuka.';
    const deadline = 'Pilih “Datang” sebelum pukul 14:00 WIB pada hari praktik.';
    const expiry = 'Tanpa konfirmasi hingga batas waktu tersebut, booking dibatalkan otomatis.';
    const support = 'Jika popup tidak muncul atau mengalami kendala, segera hubungi staff klinik sebelum batas waktu.';

    function acknowledgement(body = {}, headers = {}) {
        // Older native clients have no browser Origin/Referer or policy fields.
        // Keep them compatible, but leave their evidence NULL rather than
        // claiming that an unseen checkbox was accepted.
        const required = Boolean(headers.origin || headers.referer)
            || Object.prototype.hasOwnProperty.call(body, 'booking_policy_acknowledged')
            || Object.prototype.hasOwnProperty.call(body, 'booking_policy_version');
        if (!required) return { accepted: false, version: null, error: null };
        if (body.booking_policy_acknowledged !== true) {
            return { error: {
                code: 'BOOKING_POLICY_ACK_REQUIRED',
                message: 'Baca ketentuan konfirmasi kehadiran dan centang pemahaman Anda sebelum membuat booking. Jika centang belum tersedia, muat ulang halaman booking.'
            } };
        }
        if (body.booking_policy_version !== version) {
            return { error: {
                code: 'BOOKING_POLICY_UPDATED',
                message: 'Ketentuan booking telah diperbarui. Muat ulang halaman, baca ketentuan, lalu centang kembali pemahaman Anda.'
            } };
        }
        return { accepted: true, version, error: null };
    }

    function noticeHtml(compact = false) {
        return '<div class="booking-confirmation-notice" role="note" style="padding:12px;border:1px solid rgba(111,143,128,.35);border-radius:12px;background:rgba(111,143,128,.08);font-size:12px;line-height:1.65;margin:12px 0;text-align:left;">' +
            '<strong>' + title + '</strong>' +
            (compact ? '' : '<p style="margin:8px 0;">' + schedule + ' ' + immediate + '</p>') +
            '<p style="margin:8px 0;"><strong>' + deadline + '</strong> ' + expiry + '</p>' +
            '<p style="margin:8px 0 0;">' + support + '</p></div>';
    }

    return Object.freeze({ version, title, schedule, immediate, deadline, expiry, support, noticeHtml, acknowledgement });
});

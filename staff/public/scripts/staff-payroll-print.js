/**
 * Print-safe payroll slip builders for Private > Gajian.
 * Accept finalized payroll snapshots only so draft values cannot look official.
 */
(function installStaffPayrollPrint(root, factory) {
    'use strict';
    var api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) root.staffPayrollPrint = api;
})(typeof window !== 'undefined' ? window : globalThis, function createStaffPayrollPrint() {
    'use strict';

    var MONTH_NAMES = [
        'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
        'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
    ];

    var DIBYA_SIGNATURE_DATA_URL = 'data:image/jpeg;base64,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';

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function formatRp(value) {
        return 'Rp ' + Math.round(Number(value) || 0).toLocaleString('id-ID');
    }

    function formatDate(value) {
        var raw = String(value || '').slice(0, 10);
        var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
        return match ? match[3] + '/' + match[2] + '/' + match[1] : '-';
    }

    function formatMonth(value) {
        var match = /^(\d{4})-(\d{2})/.exec(String(value || ''));
        if (!match) return '-';
        var month = Number(match[2]);
        return (MONTH_NAMES[month - 1] || '-') + ' ' + match[1];
    }

    function safeSlipPart(value) {
        return String(value == null ? '' : value).replace(/[^A-Za-z0-9_-]/g, '-');
    }

    function assertFinalized(record, label) {
        if (!record || record.status !== 'finalized') {
            throw new Error((label || 'Data gaji') + ' harus finalized sebelum slip dicetak');
        }
    }

    function row(label, value, extraClass) {
        return '<tr' + (extraClass ? ' class="' + extraClass + '"' : '') + '>' +
            '<td>' + escapeHtml(label) + '</td><td>' + value + '</td></tr>';
    }

    function documentShell(title, slips) {
        return '<!doctype html><html lang="id"><head><meta charset="utf-8">' +
            '<meta name="viewport" content="width=device-width,initial-scale=1">' +
            '<title>' + escapeHtml(title) + '</title>' +
            '<style>' +
            '@page{size:A4;margin:14mm}*{box-sizing:border-box}body{margin:0;background:#fff;color:#172033;font-family:Arial,sans-serif;font-size:12px}' +
            '.payroll-slip{min-height:257mm;padding:9mm 10mm;border:1px solid #d8dee8;position:relative;page-break-after:always}' +
            '.payroll-slip:last-child{page-break-after:auto}.header{display:grid;grid-template-columns:minmax(0,1fr) minmax(240px,auto);gap:20px;align-items:start;border-bottom:3px solid #15803d;padding-bottom:12px;margin-bottom:18px}' +
            '.brand{font-size:22px;font-weight:800;color:#15803d;letter-spacing:.5px}.unit{font-size:12px;color:#596579;margin-top:3px}' +
            '.slip-title{text-align:right;font-size:16px;font-weight:800}.slip-number{text-align:right;color:#596579;margin-top:5px}' +
            '.meta{width:100%;border-collapse:collapse;margin-bottom:18px}.meta td{padding:6px 8px;border-bottom:1px solid #e5e9f0}.meta td:first-child{width:42%;color:#596579}' +
            '.meta .total td{font-size:16px;font-weight:800;color:#15803d;border-top:2px solid #15803d;border-bottom:2px solid #15803d;padding-top:10px;padding-bottom:10px}' +
            '.section-title{font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.5px;margin:15px 0 5px;color:#344054}' +
            '.status{display:inline-block;padding:3px 8px;border-radius:12px;background:#dcfce7;color:#166534;font-weight:700;font-size:10px}' +
            '.signatures{display:grid;grid-template-columns:210px 210px;justify-content:space-between;gap:60px;margin-top:30px;text-align:center}.signature{width:210px}.line{border-top:1px solid #475467;margin-top:70px;padding-top:6px}.signature-image{display:block;width:150px;height:64px;object-fit:contain;margin:0 auto 6px}.doctor-signature .line{margin-top:0}' +
            '.footer{position:absolute;left:10mm;right:10mm;bottom:8mm;border-top:1px solid #e5e9f0;padding-top:7px;color:#667085;font-size:10px;text-align:center}' +
            '@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}.payroll-slip{border:0}}' +
            '</style></head><body>' + slips.join('') + '</body></html>';
    }

    function slipFrame(title, number, unit, body) {
        return '<section class="payroll-slip">' +
            '<div class="header"><div><div class="brand">DOKTER DIBYA</div><div class="unit">' + escapeHtml(unit) + '</div></div>' +
            '<div><div class="slip-title">' + escapeHtml(title) + '</div><div class="slip-number">No. ' + escapeHtml(number) + '</div></div></div>' +
            body +
            '<div class="signatures"><div class="signature"><div class="line">Penerima</div></div><div class="signature doctor-signature"><img class="signature-image" src="' + DIBYA_SIGNATURE_DATA_URL + '" alt="Tanda tangan dr. Dibya"><div class="line">dr. Dibya</div></div></div>' +
            '<div class="footer">Slip ini dibuat dari data Gajian berstatus Finalized.</div></section>';
    }

    function buildStaffSlip(batch, item) {
        assertFinalized(batch, 'Batch gaji pegawai');
        if (!item) throw new Error('Pegawai tidak ditemukan dalam batch gaji');
        var slipNumber = 'SC-' + safeSlipPart(batch.id) + '-' + safeSlipPart(item.staff_id);
        var attendanceDates = Array.isArray(item.attendance_dates) ? item.attendance_dates : [];
        var notes = String(item.notes || '').trim();
        var body = '<div class="section-title">Identitas & periode</div><table class="meta">' +
            row('Nama Pegawai', escapeHtml(item.staff_name || '-')) +
            row('Jabatan/Role', escapeHtml(item.role_display || item.role_name || '-')) +
            row('Siklus Praktik', escapeHtml(batch.cycle_label || '-')) +
            row('Tanggal Gajian', escapeHtml(formatDate(batch.payroll_date))) +
            (batch.finalized_at ? row('Tanggal Finalisasi', escapeHtml(formatDate(batch.finalized_at))) : '') +
            row('Status', '<span class="status">FINALIZED</span>') +
            '</table><div class="section-title">Rincian gaji</div><table class="meta">' +
            row('Tanggal Hadir', escapeHtml(attendanceDates.length ? attendanceDates.map(formatDate).join(', ') : '-')) +
            row('Jumlah Hadir', escapeHtml(Number(item.attendance_count) || 0) + ' kali') +
            row('Gaji Dasar', escapeHtml(formatRp(item.base_amount))) +
            row('Tambahan Kehadiran', escapeHtml(formatRp(item.additional_amount))) +
            row('Bonus/Penyesuaian', escapeHtml(formatRp(item.adjustment_amount))) +
            (notes ? row('Catatan', escapeHtml(notes)) : '') +
            row('GAJI DITERIMA', escapeHtml(formatRp(item.total_amount)), 'total') +
            '</table>';
        return slipFrame('SLIP GAJI PEGAWAI SUNDAY CLINIC', slipNumber, 'Sunday Clinic', body);
    }

    function buildDriverSlip(record) {
        assertFinalized(record, 'Gaji driver');
        var driverName = String(record.driver_name || '').trim();
        if (!driverName) throw new Error('Nama driver wajib diisi sebelum slip dicetak');
        var monthKey = String(record.payroll_month || '').slice(0, 7).replace('-', '');
        var slipNumber = 'DRV-' + safeSlipPart(monthKey);
        var body = '<div class="section-title">Identitas & periode</div><table class="meta">' +
            row('Nama Driver', escapeHtml(driverName)) +
            row('Bulan Gaji', escapeHtml(formatMonth(record.payroll_month))) +
            (record.finalized_at ? row('Tanggal Finalisasi', escapeHtml(formatDate(record.finalized_at))) : '') +
            row('Status', '<span class="status">FINALIZED</span>') +
            '</table><div class="section-title">Rincian gaji</div><table class="meta">' +
            row('Gaji Bulanan', escapeHtml(formatRp(record.monthly_salary))) +
            row('Hari Kalender', escapeHtml(Number(record.calendar_days) || 0) + ' hari') +
            row('Minggu Libur', escapeHtml(Number(record.sunday_count) || 0) + ' hari') +
            row('Hari Kerja', escapeHtml(Number(record.working_days) || 0) + ' hari') +
            row('Hari Tidak Masuk', escapeHtml(Number(record.absence_days) || 0) + ' hari') +
            row('Potongan per Hari', escapeHtml(formatRp(record.daily_deduction))) +
            row('Total Potongan', escapeHtml(formatRp(record.deduction_amount))) +
            row('GAJI DITERIMA', escapeHtml(formatRp(record.total_amount)), 'total') +
            '</table>';
        return slipFrame('SLIP GAJI DRIVER', slipNumber, 'Private', body);
    }

    function buildStaffSlipDocument(batch, item) {
        return documentShell('Slip Gaji - ' + (item && item.staff_name ? item.staff_name : 'Pegawai'), [buildStaffSlip(batch, item)]);
    }

    function buildBatchSlipDocument(batch) {
        assertFinalized(batch, 'Batch gaji pegawai');
        var paidItems = (batch.items || []).filter(function (item) { return Number(item.total_amount) > 0; });
        if (!paidItems.length) throw new Error('Tidak ada pegawai dengan gaji untuk dicetak');
        return documentShell('Slip Gaji Pegawai Sunday Clinic', paidItems.map(function (item) {
            return buildStaffSlip(batch, item);
        }));
    }

    function buildDriverSlipDocument(record) {
        return documentShell('Slip Gaji Driver - ' + formatMonth(record && record.payroll_month), [buildDriverSlip(record)]);
    }

    return {
        buildDriverSlipDocument: buildDriverSlipDocument,
        buildStaffSlipDocument: buildStaffSlipDocument,
        buildBatchSlipDocument: buildBatchSlipDocument,
        formatMonth: formatMonth,
        formatRp: formatRp
    };
});

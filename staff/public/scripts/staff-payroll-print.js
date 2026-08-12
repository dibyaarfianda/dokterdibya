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
            '.signatures{display:grid;grid-template-columns:210px 210px;justify-content:space-between;gap:60px;margin-top:45px;text-align:center}.signature{width:210px}.line{border-top:1px solid #475467;margin-top:55px;padding-top:6px}' +
            '.footer{position:absolute;left:10mm;right:10mm;bottom:8mm;border-top:1px solid #e5e9f0;padding-top:7px;color:#667085;font-size:10px;text-align:center}' +
            '@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}.payroll-slip{border:0}}' +
            '</style></head><body>' + slips.join('') + '</body></html>';
    }

    function slipFrame(title, number, unit, body) {
        return '<section class="payroll-slip">' +
            '<div class="header"><div><div class="brand">DOKTER DIBYA</div><div class="unit">' + escapeHtml(unit) + '</div></div>' +
            '<div><div class="slip-title">' + escapeHtml(title) + '</div><div class="slip-number">No. ' + escapeHtml(number) + '</div></div></div>' +
            body +
            '<div class="signatures"><div class="signature"><div class="line">Penerima</div></div><div class="signature"><div class="line">Dokter DIBYA</div></div></div>' +
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
        assertFinalized(record, 'Gaji supir');
        var monthKey = String(record.payroll_month || '').slice(0, 7).replace('-', '');
        var slipNumber = 'DRV-' + safeSlipPart(monthKey);
        var body = '<div class="section-title">Identitas & periode</div><table class="meta">' +
            row('Penerima', 'Supir') +
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
        return slipFrame('SLIP GAJI SUPIR', slipNumber, 'Private', body);
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
        return documentShell('Slip Gaji Supir - ' + formatMonth(record && record.payroll_month), [buildDriverSlip(record)]);
    }

    return {
        buildDriverSlipDocument: buildDriverSlipDocument,
        buildStaffSlipDocument: buildStaffSlipDocument,
        buildBatchSlipDocument: buildBatchSlipDocument,
        formatMonth: formatMonth,
        formatRp: formatRp
    };
});

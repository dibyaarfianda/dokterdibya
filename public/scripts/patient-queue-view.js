// Shared by the patient portal and the Staff patient-view preview.
(function(root, factory) {
    const api = factory();
    if (typeof module === "object" && module.exports) module.exports = api;
    if (root) root.PatientQueueView = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function() {
"use strict";
const STATUS_LABELS = {
    menunggu: 'Belum Datang', anamnesa: 'Pasien Hadir', diperiksa: 'Sedang Diperiksa',
    selesai_periksa: 'Selesai Periksa', lunas: 'Lunas', dilayani: 'Sedang Dilayani', selesai: 'Selesai'
};

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function renderDoctorStatusHtml(settings = {}) {
    const state = settings.is_on_break ? 'break' : (settings.doctor_arrived ? 'arrived' : 'waiting');
    const labels = { waiting: 'dr. Dibya belum datang', arrived: 'dr. Dibya sudah datang', break: 'dr. Dibya sedang istirahat' };
    const symbols = { waiting: '◷', arrived: '✓', break: 'Ⅱ' };
    return `<span class="patient-doctor-status patient-doctor-status--${state}" role="status"><span aria-hidden="true">${symbols[state]}</span>${labels[state]}</span>`;
}

function renderPatientQueueHtml(data = [], { visible = true } = {}) {
    if (!visible) return '<div class="state-card"><i class="fa fa-eye-slash"></i><p>Antrian belum dibuka hari ini.<br><small>Silakan coba beberapa saat lagi.</small></p></div>';
    if (!Array.isArray(data) || !data.length) return '<div class="state-card"><i class="fa fa-calendar-times"></i><p>Tidak ada antrian hari ini.<br>Klinik mungkin sedang tidak buka.</p></div>';
    const sessions = new Map();
    for (const item of data) {
        if (!sessions.has(item.session)) sessions.set(item.session, { label: item.session_label, items: [] });
        sessions.get(item.session).items.push(item);
    }
    return [...sessions.keys()].sort((a, b) => Number(a) - Number(b)).map(key => {
        const session = sessions.get(key);
        return `<div class="session-label"><i class="fa fa-clock-o"></i> Sesi ${escapeHtml(session.label)}</div>` + session.items.map(item => {
            const status = Object.hasOwn(STATUS_LABELS, item.queue_status) ? item.queue_status : 'menunggu';
            return `<div class="queue-row status-${status}">
                <div class="slot-num">${escapeHtml(item.slot_number)}</div>
                <div class="queue-info"><div class="queue-name">${escapeHtml(item.masked_name || 'Pasien')}</div>
                <div class="queue-time"><i class="fa fa-clock-o" style="font-size:10px;margin-right:3px;"></i>${escapeHtml(item.slot_time || '-')}</div></div>
                <span class="queue-status-badge badge-${status}">${STATUS_LABELS[status]}</span></div>`;
        }).join('');
    }).join('');
}

return Object.freeze({ renderPatientQueueHtml, renderDoctorStatusHtml });
});

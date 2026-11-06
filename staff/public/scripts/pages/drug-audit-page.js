// Audit Obat (doctor-only): stock adjustment approvals + reconciliation.
const API_BASE = '/api/drug-audit';
const CATEGORY_LABELS = {
    rusak: 'Rusak', pecah: 'Pecah', kedaluwarsa: 'Kedaluwarsa', hilang: 'Hilang',
    salah_hitung: 'Salah hitung', opname: 'Opname', lainnya: 'Lainnya'
};
const RECON_LABELS = { match: 'Cocok', batch_mismatch: 'Selisih batch', movement_mismatch: 'Selisih mutasi' };

let currentStatus = 'pending';
let loadedRequests = [];
let selected = new Set();
let reconLoaded = false;
let bound = false;
let rejectId = null;
let listToken = 0;
let reconToken = 0;

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function formatMoney(value) {
    const n = Number(value) || 0;
    return (n < 0 ? '-' : '') + 'Rp ' + Math.round(Math.abs(n)).toLocaleString('id-ID');
}

function formatSigned(value) {
    const n = Number(value) || 0;
    return (n > 0 ? '+' : '') + n;
}

function formatDateTime(value) {
    if (!value) return '-';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '-';
    const pad = (x) => String(x).padStart(2, '0');
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function el(id) { return document.getElementById(id); }

function showMessage(text, type) {
    const box = el('drug-audit-message');
    if (!box) return;
    if (!text) { box.className = 'alert d-none'; box.textContent = ''; return; }
    box.className = 'alert alert-' + (type || 'danger');
    box.textContent = text;
}

async function drugAuditFetch(path, options = {}) {
    const token = typeof window.getAuthToken === 'function' ? window.getAuthToken() : null;
    const headers = { Authorization: `Bearer ${token}` };
    if (options.body) headers['Content-Type'] = 'application/json';
    const response = await fetch(API_BASE + path, { ...options, headers });
    let data = null;
    try { data = await response.json(); } catch (_e) { data = null; }
    return { ok: response.ok, status: response.status, data };
}

function forbiddenHtml() {
    return '<div class="alert alert-warning">Halaman ini hanya untuk dokter.</div>';
}

function errorText(res, fallback) {
    return (res && res.data && res.data.message) || fallback;
}

function renderCard(r) {
    const delta = Number(r.quantity_delta) || 0;
    const pending = r.status === 'pending';
    const stale = r.is_stale ? ' <span class="badge badge-warning">Menunggu &gt; 7 hari</span>' : '';
    const statusBadge = pending ? '' : ` <span class="badge badge-${r.status === 'approved' ? 'success' : 'secondary'}">${r.status === 'approved' ? 'Disetujui' : 'Ditolak'}</span>`;
    const check = pending
        ? `<input type="checkbox" class="mr-2 drug-audit-select" aria-label="Pilih pengajuan" ${selected.has(r.id) ? 'checked' : ''} onchange="window.toggleDrugAuditSelection(${Number(r.id)}, this.checked)">`
        : '';
    const actions = pending
        ? `<div class="drug-audit-actions">
              <button type="button" class="btn btn-sm btn-success" onclick="window.approveDrugAuditRequest(${Number(r.id)})">Setuju</button>
              <button type="button" class="btn btn-sm btn-outline-danger" onclick="window.openDrugAuditReject(${Number(r.id)})">Tolak</button>
           </div>`
        : (r.decision_note ? `<div class="drug-audit-meta">Catatan keputusan: ${escapeHtml(r.decision_note)}</div>` : '');
    return `<div class="drug-audit-card" data-request-id="${Number(r.id)}">
        <div class="drug-audit-card-head">
            <div class="drug-audit-card-title">${check}${escapeHtml(r.name)} <small class="text-muted">${escapeHtml(r.code)}</small>${stale}${statusBadge}</div>
            <div class="drug-audit-delta ${delta >= 0 ? 'is-plus' : 'is-minus'}">${escapeHtml(formatSigned(delta))} ${escapeHtml(r.unit)}</div>
        </div>
        <div class="drug-audit-meta">${escapeHtml(formatMoney(r.value))} &middot; ${escapeHtml(CATEGORY_LABELS[r.reason_category] || r.reason_category)}</div>
        <div class="drug-audit-meta">${escapeHtml(r.reason_note || '-')}</div>
        <div class="drug-audit-meta">Stok saat diajukan: ${escapeHtml(r.stock_at_request)} &middot; sekarang: ${escapeHtml(r.current_stock)}</div>
        <div class="drug-audit-meta">${escapeHtml(r.requested_by_name || '-')} &middot; ${escapeHtml(formatDateTime(r.requested_at))}</div>
        ${actions}
    </div>`;
}

function updateBulkBar() {
    const bar = el('drug-audit-bulk-bar');
    if (!bar) return;
    const rows = loadedRequests.filter((r) => selected.has(r.id));
    if (!rows.length) { bar.classList.add('d-none'); return; }
    const total = rows.reduce((sum, r) => sum + (Number(r.value) || 0), 0);
    el('drug-audit-bulk-summary').textContent = `${rows.length} dipilih · total ${formatMoney(total)}`;
    bar.classList.remove('d-none');
}

async function loadDrugAuditRequests(status) {
    currentStatus = status || el('drug-audit-status')?.value || 'pending';
    const list = el('drug-audit-list');
    if (!list) return;
    const token = ++listToken;
    selected = new Set();
    loadedRequests = [];
    updateBulkBar();
    list.innerHTML = '<div class="text-muted">Memuat...</div>';
    try {
        const res = await drugAuditFetch(`/adjustment-requests?status=${encodeURIComponent(currentStatus)}&limit=100`);
        if (token !== listToken) return;
        if (res.status === 403) { list.innerHTML = forbiddenHtml(); return; }
        if (!res.ok) { list.innerHTML = `<div class="alert alert-danger">${escapeHtml(errorText(res, 'Gagal memuat pengajuan'))}</div>`; return; }
        loadedRequests = res.data.data || [];
        list.innerHTML = loadedRequests.length
            ? loadedRequests.map(renderCard).join('')
            : '<div class="text-muted">Tidak ada pengajuan.</div>';
    } catch (_e) {
        if (token === listToken) list.innerHTML = '<div class="alert alert-danger">Gagal memuat pengajuan</div>';
    }
}

async function postDecision(id, action, body) {
    return drugAuditFetch(`/adjustment-requests/${encodeURIComponent(id)}/${action}`, {
        method: 'POST',
        body: JSON.stringify(body || {})
    });
}

async function approveDrugAuditRequest(id) {
    const r = loadedRequests.find((x) => x.id === Number(id));
    if (!r) return;
    const text = `Setujui penyesuaian ${r.name} ${formatSigned(r.quantity_delta)} ${r.unit} (${formatMoney(r.value)})?`;
    if (!window.confirm(text)) return;
    showMessage('');
    try {
        const res = await postDecision(r.id, 'approve');
        if (!res.ok) { showMessage(errorText(res, 'Gagal menyetujui pengajuan')); return; }
        showMessage('Pengajuan disetujui.', 'success');
        await loadDrugAuditRequests(currentStatus);
    } catch (_e) {
        showMessage('Gagal menyetujui pengajuan');
    }
}

function openDrugAuditReject(id) {
    rejectId = Number(id);
    const note = el('drug-audit-reject-note');
    if (note) note.value = '';
    el('drug-audit-reject-error')?.classList.add('d-none');
    if (window.$) {
        const modal = window.$('#drug-audit-reject-modal');
        modal.appendTo('body');
        modal.modal('show');
    }
}

async function submitDrugAuditReject() {
    const note = (el('drug-audit-reject-note')?.value || '').trim();
    const err = el('drug-audit-reject-error');
    if (!note) {
        err.textContent = 'Catatan penolakan wajib diisi';
        err.classList.remove('d-none');
        return;
    }
    try {
        const res = await postDecision(rejectId, 'reject', { decision_note: note });
        if (!res.ok) {
            err.textContent = errorText(res, 'Gagal menolak pengajuan');
            err.classList.remove('d-none');
            return;
        }
        if (window.$) window.$('#drug-audit-reject-modal').modal('hide');
        showMessage('Pengajuan ditolak.', 'success');
        await loadDrugAuditRequests(currentStatus);
    } catch (_e) {
        err.textContent = 'Gagal menolak pengajuan';
        err.classList.remove('d-none');
    }
}

function toggleDrugAuditSelection(id, checked) {
    if (checked) selected.add(Number(id)); else selected.delete(Number(id));
    updateBulkBar();
}

async function approveSelectedDrugAuditRequests() {
    const ids = loadedRequests.filter((r) => selected.has(r.id)).map((r) => r.id);
    if (!ids.length) return;
    showMessage('');
    let done = 0;
    for (const id of ids) {
        const r = loadedRequests.find((x) => x.id === id);
        let res;
        try {
            res = await postDecision(id, 'approve');
        } catch (_e) {
            res = { ok: false, data: null };
        }
        if (!res.ok) {
            const failure = `${r ? r.name : 'Pengajuan'}: ${errorText(res, 'Gagal menyetujui pengajuan')} (${done} dari ${ids.length} disetujui)`;
            await loadDrugAuditRequests(currentStatus);
            showMessage(failure);
            return;
        }
        done += 1;
    }
    await loadDrugAuditRequests(currentStatus);
    showMessage(`${done} pengajuan disetujui.`, 'success');
}

function renderReconRow(row) {
    return `<tr>
        <td data-label="Obat">${escapeHtml(row.name)} <small class="text-muted">${escapeHtml(row.code)}</small></td>
        <td data-label="Stok sistem">${escapeHtml(row.stock)} ${escapeHtml(row.unit)}</td>
        <td data-label="Total batch">${escapeHtml(row.batch_total)} ${escapeHtml(row.unit)}</td>
        <td data-label="Status"><span class="badge badge-${row.status === 'match' ? 'success' : 'danger'}">${escapeHtml(RECON_LABELS[row.status] || row.status)}</span></td>
    </tr>`;
}

async function loadDrugAuditReconciliation() {
    const box = el('drug-audit-recon');
    if (!box) return;
    const token = ++reconToken;
    const only = el('drug-audit-only-mismatch')?.checked ? '?only_mismatch=1' : '';
    box.innerHTML = '<div class="text-muted">Memuat...</div>';
    try {
        const res = await drugAuditFetch('/reconciliation' + only);
        if (token !== reconToken) return;
        if (res.status === 403) { box.innerHTML = forbiddenHtml(); return; }
        if (!res.ok) { box.innerHTML = `<div class="alert alert-danger">${escapeHtml(errorText(res, 'Gagal memuat rekonsiliasi'))}</div>`; return; }
        const d = res.data.data || {};
        const s = d.summary || {};
        el('drug-audit-baseline-banner')?.classList.toggle('d-none', !!d.baseline);
        el('drug-audit-recon-summary').textContent = `Cocok ${Number(s.match) || 0} · Selisih batch ${Number(s.batch_mismatch) || 0}`;
        const rows = d.rows || [];
        box.innerHTML = rows.length
            ? `<table class="drug-audit-table"><thead><tr><th>Obat</th><th>Stok sistem</th><th>Total batch</th><th>Status</th></tr></thead><tbody>${rows.map(renderReconRow).join('')}</tbody></table>`
            : '<div class="text-muted">Tidak ada data.</div>';
        reconLoaded = true;
    } catch (_e) {
        if (token === reconToken) box.innerHTML = '<div class="alert alert-danger">Gagal memuat rekonsiliasi</div>';
    }
}

function initDrugAuditPage() {
    showMessage('');
    reconLoaded = false;
    const status = el('drug-audit-status');
    if (!bound && status) {
        bound = true;
        status.addEventListener('change', () => loadDrugAuditRequests(status.value));
        el('drug-audit-only-mismatch')?.addEventListener('change', loadDrugAuditReconciliation);
        if (window.$) {
            window.$('#drug-audit-tabs a[data-toggle="tab"]').on('shown.bs.tab', (event) => {
                if (event.target && event.target.getAttribute('href') === '#drug-audit-tab-reconciliation' && !reconLoaded) {
                    loadDrugAuditReconciliation();
                }
            });
        }
    }
    if (status) status.value = 'pending';
    return loadDrugAuditRequests('pending');
}

window.initDrugAuditPage = initDrugAuditPage;
window.loadDrugAuditRequests = loadDrugAuditRequests;
window.approveDrugAuditRequest = approveDrugAuditRequest;
window.openDrugAuditReject = openDrugAuditReject;
window.submitDrugAuditReject = submitDrugAuditReject;
window.toggleDrugAuditSelection = toggleDrugAuditSelection;
window.approveSelectedDrugAuditRequests = approveSelectedDrugAuditRequests;
window.loadDrugAuditReconciliation = loadDrugAuditReconciliation;

/**
 * Staff page "Pembayaran di Muka" (bayar di muka, Tahap 2).
 *
 * - Pembayaran: prepay orders paid through Duitku (method, VA number, Duitku fee).
 * - Saldo Pasien: saldo per patient and category, its history, and saldo refunds
 *   (recorded after staff hand the money over; billing.reset, like billing returns).
 * - Pencairan: patients' withdrawal requests; staff mark them transferred or reject them
 *   (list billing.view, actions billing.reset).
 * - Paket: create, edit and switch off the prepay packages (tindakan + obat, week range for
 *   Kehamilan); doctor/superadmin only.
 *
 * API: /api/staff-prepay (routes/staff-prepay.js). Sandbox rows are labelled "Uji (sandbox)".
 */
import { createPageRequestScope, staffApiRequest } from '../staff-api.js';
import { escapeHtml, escapeAttribute } from '../safe-render.js';

const API = '/api/staff-prepay';
const METHOD_LABELS = { qris: 'QRIS', va_bni: 'VA BNI', va_bri: 'VA BRI', va_mandiri: 'VA Mandiri', va_bca: 'VA BCA' };
const STATUS_BADGES = {
    paid: '<span class="badge badge-success">Lunas</span>',
    pending: '<span class="badge badge-warning">Menunggu</span>',
    expired: '<span class="badge badge-secondary">Kedaluwarsa</span>',
    cancelled: '<span class="badge badge-secondary">Batal</span>',
    failed: '<span class="badge badge-danger">Gagal</span>'
};
const ENTRY_LABELS = {
    prepay: 'Bayar di muka',
    usage: 'Dipakai untuk tagihan',
    return_credit: 'Retur kembali ke saldo',
    refund: 'Refund ke pasien',
    adjustment: 'Penyesuaian'
};
const SANDBOX_BADGE = '<span class="badge badge-light border ml-1">Uji (sandbox)</span>';

let requestScope = null;
let currentTab = 'orders';
let balancesByPatient = new Map();
let refundPatient = null;
let refundRequestsById = new Map();
const packageState = { catalog: null, list: [], editing: null };

function scope() {
    requestScope?.abort('Request replaced');
    requestScope = createPageRequestScope();
    return requestScope;
}

const isAbort = error => error?.name === 'AbortError';
const byId = id => document.getElementById(id);
const canRefund = () => Boolean(window.hasAccountPermission?.('billing.reset'));
const canEditPackages = () => Boolean(window.hasAccountPermission?.('checkup_prepay.manage_estimate'));
const canViewRequests = () => Boolean(window.hasAccountPermission?.('billing.view'));

function rupiah(amount) {
    const number = Math.round(Number(amount) || 0);
    return 'Rp ' + number.toLocaleString('id-ID', { maximumFractionDigits: 0 });
}

function dateTime(value) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.valueOf())) return String(value);
    if (window.DibyaDateTime?.dateTime) {
        return window.DibyaDateTime.dateTime(date, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleString('id-ID');
}

function flash(message, type = 'success') {
    let box = byId('prepay-flash');
    const body = document.querySelector('#prepay-page .card-body');
    if (!box && body) {
        box = document.createElement('div');
        box.id = 'prepay-flash';
        body.prepend(box);
    }
    if (!box) return;
    box.className = `alert alert-${type} py-2`;
    box.textContent = message;
    box.hidden = !message;
}

function patientButton(patientId, name) {
    return `<button type="button" class="btn btn-link p-0 text-left" data-patient-id="${escapeAttribute(patientId)}"
        onclick="window.prepayShowPatient(this.dataset.patientId)">${escapeHtml(name || patientId)}</button>`;
}

export async function showPrepayPage() {
    await window.activateRegisteredStaffPage?.('prepay');
    byId('prepay-tab-packages-item')?.classList.toggle('d-none', !canEditPackages());
    byId('prepay-tab-refund-requests-item')?.classList.toggle('d-none', !canViewRequests());
    await prepayShowTab(currentTab);
}

const TAB_PANELS = ['orders', 'balances', 'refund-requests', 'packages'];

export async function prepayShowTab(tab) {
    if (tab === 'packages' && !canEditPackages()) tab = 'orders';
    if (tab === 'refund-requests' && !canViewRequests()) tab = 'orders';
    if (!TAB_PANELS.includes(tab)) tab = 'orders';
    currentTab = tab;
    document.querySelectorAll('#prepay-page [data-prepay-tab]').forEach(link => {
        link.classList.toggle('active', link.dataset.prepayTab === tab);
    });
    TAB_PANELS.forEach(name => {
        const panel = byId(`prepay-panel-${name}`);
        if (panel) panel.hidden = name !== tab;
    });
    flash('');
    if (tab === 'orders') return prepayLoadOrders();
    if (tab === 'balances') return prepayLoadBalances();
    if (tab === 'refund-requests') return prepayLoadRefundRequests();
    return prepayLoadPackages();
}

// ---------------------------------------------------------------- Pembayaran

export async function prepayLoadOrders() {
    const tbody = byId('prepay-orders-tbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-3">Memuat…</td></tr>';
    const params = new URLSearchParams({
        status: byId('prepay-order-status')?.value || 'paid',
        mode: byId('prepay-order-mode')?.value || 'live'
    });
    const from = byId('prepay-order-from')?.value;
    const to = byId('prepay-order-to')?.value;
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    try {
        const result = await scope().request(`${API}/orders?${params.toString()}`);
        const rows = Array.isArray(result?.data) ? result.data : [];
        if (!rows.length) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-3">Belum ada pembayaran di muka.</td></tr>';
            return;
        }
        tbody.innerHTML = rows.map(row => `<tr>
            <td>${escapeHtml(dateTime(row.paid_at || row.created_at))}</td>
            <td>${patientButton(row.patient_id, row.patient_name)}${row.gateway_mode === 'sandbox' ? SANDBOX_BADGE : ''}</td>
            <td>${escapeHtml(row.product_label || row.product_code || '-')}</td>
            <td class="prepay-amount">${rupiah(row.amount_idr)}</td>
            <td class="prepay-amount">${row.fee_idr === null || row.fee_idr === undefined ? '-' : rupiah(row.fee_idr)}</td>
            <td>${escapeHtml(METHOD_LABELS[row.payment_method] || row.payment_method || '-')}${row.va_number ? `<small class="d-block text-muted">${escapeHtml(row.va_number)}</small>` : ''}</td>
            <td>${STATUS_BADGES[row.status] || escapeHtml(row.status || '-')}</td>
            <td><small class="text-muted text-nowrap">${escapeHtml(row.order_ref || '-')}</small></td>
        </tr>`).join('');
    } catch (error) {
        if (isAbort(error)) return;
        tbody.innerHTML = `<tr><td colspan="8" class="text-center text-danger py-3">${escapeHtml(error.message || 'Gagal memuat data')}</td></tr>`;
    }
}

// ---------------------------------------------------------------- Saldo Pasien

export async function prepayLoadBalances() {
    const tbody = byId('prepay-balances-tbody');
    if (!tbody) return;
    const mode = byId('prepay-balance-mode')?.value || 'live';
    tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted py-3">Memuat…</td></tr>';
    try {
        const result = await scope().request(`${API}/balances?mode=${encodeURIComponent(mode)}`);
        const rows = Array.isArray(result?.data) ? result.data : [];
        balancesByPatient = new Map(rows.map(row => [String(row.patient_id), row]));
        if (!rows.length) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted py-3">Tidak ada pasien dengan saldo.</td></tr>';
            return;
        }
        tbody.innerHTML = rows.map(row => `<tr>
            <td>${patientButton(row.patient_id, row.patient_name)}${row.gateway_mode === 'sandbox' ? SANDBOX_BADGE : ''}</td>
            <td>${row.categories.map(entry => `<small class="d-block">${escapeHtml(entry.label)}: ${rupiah(entry.balance_idr)}</small>`).join('')}</td>
            <td class="prepay-amount font-weight-bold">${rupiah(row.total_idr)}</td>
            <td class="text-right text-nowrap">
                <button type="button" class="btn btn-sm btn-outline-secondary" data-patient-id="${escapeAttribute(row.patient_id)}"
                    onclick="window.prepayOpenLedger(this.dataset.patientId)">Riwayat</button>
                ${canRefund() && row.gateway_mode === 'live' && row.total_idr > 0 ? `<button type="button" class="btn btn-sm btn-outline-danger ml-1" data-patient-id="${escapeAttribute(row.patient_id)}"
                    onclick="window.prepayOpenRefund(this.dataset.patientId)">Catat Refund</button>` : ''}
            </td>
        </tr>`).join('');
    } catch (error) {
        if (isAbort(error)) return;
        tbody.innerHTML = `<tr><td colspan="4" class="text-center text-danger py-3">${escapeHtml(error.message || 'Gagal memuat data')}</td></tr>`;
    }
}

export async function prepayOpenLedger(patientId) {
    const box = byId('prepay-ledger');
    if (!box || !patientId) return;
    box.hidden = false;
    box.innerHTML = '<div class="text-muted">Memuat riwayat saldo…</div>';
    try {
        const result = await staffApiRequest(`${API}/patients/${encodeURIComponent(patientId)}/ledger`);
        const data = result?.data || {};
        const balanceLine = (list, label) => (list || []).length
            ? `<div><strong>${label}:</strong> ${list.map(entry => `${escapeHtml(entry.label)} ${rupiah(entry.balance_idr)}`).join(' · ')}</div>`
            : '';
        const entries = Array.isArray(data.entries) ? data.entries : [];
        box.innerHTML = `
            <div class="d-flex justify-content-between align-items-center mb-2">
                <h6 class="mb-0">Riwayat saldo · ${escapeHtml(data.patient?.name || patientId)}</h6>
                <button type="button" class="btn btn-sm btn-link" data-patient-id="${escapeAttribute(patientId)}"
                    onclick="window.prepayShowPatient(this.dataset.patientId)">Detail pasien</button>
            </div>
            ${balanceLine(data.balances?.live, 'Saldo asli')}
            ${balanceLine(data.balances?.sandbox, 'Saldo uji (sandbox)')}
            <div class="table-responsive mt-2"><table class="table table-sm prepay-table mb-0">
                <thead><tr><th>Waktu</th><th>Jenis</th><th>Kategori</th><th class="prepay-amount">Nominal</th></tr></thead>
                <tbody>${entries.length ? entries.map(entry => `<tr>
                    <td>${escapeHtml(dateTime(entry.created_at))}${entry.created_by ? `<small class="d-block text-muted">${escapeHtml(entry.created_by)}</small>` : ''}</td>
                    <td>${escapeHtml(ENTRY_LABELS[entry.entry_type] || entry.entry_type)}${entry.mr_id ? ` <small>${escapeHtml(entry.mr_id)}</small>` : ''}${entry.gateway_mode === 'sandbox' ? SANDBOX_BADGE : ''}</td>
                    <td>${escapeHtml(entry.category_label || entry.category)}</td>
                    <td class="prepay-amount ${entry.amount_idr < 0 ? 'text-danger' : 'text-success'}">${entry.amount_idr < 0 ? '−' : '+'}${rupiah(Math.abs(entry.amount_idr))}</td>
                </tr>`).join('') : '<tr><td colspan="4" class="text-center text-muted">Belum ada riwayat.</td></tr>'}</tbody>
            </table></div>`;
    } catch (error) {
        box.innerHTML = `<div class="text-danger">${escapeHtml(error.message || 'Gagal memuat riwayat saldo')}</div>`;
    }
}

export function prepayShowPatient(patientId) {
    if (patientId && typeof window.showPatientDetail === 'function') window.showPatientDetail(patientId);
}

function refundKeyName(patientId) {
    return `prepay-refund-key:${patientId}`;
}

function refundKeyFor(patientId, payload) {
    // The key is kept with the exact request it belongs to: retrying the same refund after an
    // unclear network error reuses it (never recorded twice), while a changed amount, method or
    // reason gets a fresh key instead of being refused as "kunci sudah digunakan".
    const fingerprint = JSON.stringify(payload);
    try {
        const name = refundKeyName(patientId);
        const saved = JSON.parse(sessionStorage.getItem(name) || 'null');
        if (saved && saved.key && saved.payload === fingerprint) return saved.key;
        const key = crypto.randomUUID();
        sessionStorage.setItem(name, JSON.stringify({ key, payload: fingerprint }));
        return key;
    } catch (_error) {
        return crypto.randomUUID();
    }
}

export function prepayOpenRefund(patientId) {
    if (!canRefund()) return;
    const row = balancesByPatient.get(String(patientId));
    const form = byId('prepay-refund-form');
    if (!row || !form) return;
    refundPatient = { id: row.patient_id, name: row.patient_name, total: row.total_idr };
    byId('prepay-refund-patient').textContent = `${row.patient_name} · saldo asli ${rupiah(row.total_idr)}`;
    const amount = byId('prepay-refund-amount');
    amount.max = String(row.total_idr);
    amount.value = String(row.total_idr);
    byId('prepay-refund-reason').value = '';
    byId('prepay-refund-error').hidden = true;
    form.hidden = false;
    form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

export function prepayCloseRefund() {
    const form = byId('prepay-refund-form');
    if (form) form.hidden = true;
    refundPatient = null;
}

export async function prepaySubmitRefund(event) {
    event?.preventDefault?.();
    if (!refundPatient || !canRefund()) return;
    const error = byId('prepay-refund-error');
    const button = byId('prepay-refund-save');
    const amount = Number(byId('prepay-refund-amount').value);
    const reason = byId('prepay-refund-reason').value.trim();
    error.hidden = true;
    if (!Number.isInteger(amount) || amount < 1 || amount > refundPatient.total) {
        error.textContent = `Nominal harus bilangan bulat 1 sampai ${rupiah(refundPatient.total)}.`;
        error.hidden = false;
        return;
    }
    if (!reason) {
        error.textContent = 'Alasan refund wajib diisi.';
        error.hidden = false;
        return;
    }
    if (!window.confirm(`Catat refund ${rupiah(amount)} untuk ${refundPatient.name}? Pastikan uang sudah diserahkan.`)) return;
    button.disabled = true;
    try {
        const payload = { patient_id: refundPatient.id, amount_idr: amount, method: byId('prepay-refund-method').value, reason };
        const result = await staffApiRequest(`${API}/refunds`, {
            method: 'POST',
            retries: 0,
            body: JSON.stringify({ ...payload, request_key: refundKeyFor(refundPatient.id, payload) })
        });
        try { sessionStorage.removeItem(refundKeyName(refundPatient.id)); } catch (_error) { /* storage unavailable */ }
        const patientId = refundPatient.id;
        prepayCloseRefund();
        flash(result?.message || 'Refund saldo berhasil dicatat.');
        await prepayLoadBalances();
        await prepayOpenLedger(patientId);
    } catch (err) {
        error.textContent = err.message || 'Refund belum tersimpan. Coba lagi; transaksi yang sama tidak akan tercatat dua kali.';
        error.hidden = false;
    } finally {
        button.disabled = false;
    }
}

// ---------------------------------------------------------------- Paket

const CATEGORY_LABELS = {
    obstetri: 'Kehamilan (Obstetri)',
    gyn_repro: 'Program Hamil (Reproduksi)',
    gyn_special: 'Ginekologi Umum'
};

// <editor-item-helpers>
const FALLBACK_ADMIN_ID = 1;
const isAdminLine = (item, adminId) => item.item_type === 'tindakan' && Number(item.ref_id) === Number(adminId || FALLBACK_ADMIN_ID);

// The server's priced items start with the admin fee line (tindakan 1). It is added by the server and
// must never be an editable item: the server refuses it as an item.
function editorItemsFromPriced(items, adminId) {
    return (items || [])
        .filter(item => !isAdminLine(item, adminId))
        .map(item => ({ item_type: item.item_type, ref_id: Number(item.ref_id), quantity: Number(item.quantity) || 1 }));
}

function payloadItems(items, adminId) {
    return (items || [])
        .filter(item => !isAdminLine(item, adminId))
        .map(item => ({ item_type: item.item_type, ref_id: Number(item.ref_id), quantity: Number(item.quantity) }));
}
// </editor-item-helpers>

const weekText = pkg => (pkg.week_min === null || pkg.week_min === undefined ? '-' : `${pkg.week_min}–${pkg.week_max}`);

// Ranges are inclusive; a package without a range (or an edit with no range yet) overlaps every week.
function rangesOverlap(minA, maxA, minB, maxB) {
    const unbounded = value => value === null || value === undefined || value === '';
    if (unbounded(minA) || unbounded(maxA) || unbounded(minB) || unbounded(maxB)) return true;
    return Number(minA) <= Number(maxB) && Number(minB) <= Number(maxA);
}

function catalogRow(type, refId) {
    const list = type === 'obat' ? packageState.catalog?.obat : packageState.catalog?.tindakan;
    return (list || []).find(entry => Number(entry.id) === Number(refId)) || null;
}

function itemSubtotal(item) {
    const row = catalogRow(item.item_type, item.ref_id);
    const price = row && row.price !== null && row.price !== undefined ? Number(row.price) : 0;
    return price * (Number(item.quantity) || 0);
}

function packageTotal() {
    const admin = packageState.catalog?.admin;
    const adminPrice = admin && admin.price !== null && admin.price !== undefined ? Number(admin.price) : 0;
    const items = packageState.editing?.items || [];
    return Math.ceil(adminPrice + items.reduce((sum, item) => sum + itemSubtotal(item), 0));
}

function itemOptions(item) {
    const list = (item.item_type === 'obat' ? packageState.catalog?.obat : packageState.catalog?.tindakan) || [];
    const known = list.some(entry => Number(entry.id) === Number(item.ref_id));
    const unit = entry => (item.item_type === 'obat' && entry.unit ? ` /${entry.unit}` : '');
    const options = list.map(entry => `<option value="${Number(entry.id)}" ${Number(entry.id) === Number(item.ref_id) ? 'selected' : ''}>${escapeHtml(entry.name)}${escapeHtml(unit(entry))} — ${entry.price === null ? 'tanpa harga' : rupiah(entry.price)}</option>`);
    // A saved item whose master row is no longer pickable (inactive) stays selectable so saving does not silently swap it.
    if (!known) options.unshift(`<option value="${Number(item.ref_id)}" selected>#${Number(item.ref_id)} (tidak tersedia)</option>`);
    return options.join('');
}

function itemRowsHtml() {
    const items = packageState.editing?.items || [];
    if (!items.length) return '<div class="text-muted small mb-2">Belum ada item. Tambahkan tindakan atau obat.</div>';
    return items.map((item, index) => `<div class="prepay-item-row">
        <span class="prepay-item-kind">${item.item_type === 'obat' ? 'Obat' : 'Tindakan'}</span>
        <select class="form-control form-control-sm" data-index="${index}" data-field="ref_id" aria-label="Pilih ${item.item_type === 'obat' ? 'obat' : 'tindakan'}">${itemOptions(item)}</select>
        <input type="number" min="1" max="${item.item_type === 'obat' ? 200 : 10}" step="1" class="form-control form-control-sm" value="${Number(item.quantity) || 1}" data-index="${index}" data-field="quantity" aria-label="Jumlah">
        <span class="prepay-item-subtotal text-muted" data-subtotal-index="${index}">${rupiah(itemSubtotal(item))}</span>
        <button type="button" class="btn btn-sm btn-outline-danger" title="Hapus" data-index="${index}"
            onclick="window.prepayRemovePackageItem(Number(this.dataset.index))"><i class="fas fa-times"></i></button>
    </div>`).join('');
}

function overlapText() {
    const editing = packageState.editing;
    if (!editing || editing.category !== 'obstetri') return '';
    const minValue = byId('prepay-pkg-week-min')?.value;
    const maxValue = byId('prepay-pkg-week-max')?.value;
    const others = packageState.list.filter(pkg => pkg.is_active && pkg.category === 'obstetri'
        && Number(pkg.id) !== Number(editing.id)
        && rangesOverlap(minValue, maxValue, pkg.week_min, pkg.week_max));
    return 'Paket lain di minggu yang sama: ' + (others.length
        ? others.map(pkg => `${pkg.name} (${pkg.week_min === null ? 'semua minggu' : `${pkg.week_min}–${pkg.week_max}`})`).join(', ')
        : 'tidak ada');
}

function updatePackageTotals() {
    const editing = packageState.editing;
    if (!editing) return;
    editing.items.forEach((item, index) => {
        const cell = document.querySelector(`#prepay-package-editor [data-subtotal-index="${index}"]`);
        if (cell) cell.textContent = rupiah(itemSubtotal(item));
    });
    const total = byId('prepay-pkg-total');
    if (total) total.textContent = `Total estimasi ${rupiah(packageTotal())} (dihitung dari harga saat ini)`;
    const overlap = byId('prepay-pkg-overlap');
    if (overlap) overlap.textContent = overlapText();
}

function renderPackageEditor() {
    const box = byId('prepay-package-editor');
    const editing = packageState.editing;
    if (!box) return;
    if (!editing) {
        box.hidden = true;
        box.innerHTML = '';
        return;
    }
    const admin = packageState.catalog?.admin;
    const issues = editing.issues || [];
    box.hidden = false;
    box.innerHTML = `
        <h6 class="mb-3">${editing.id ? 'Ubah paket' : 'Paket baru'}${editing.code ? ` <small class="text-muted">${escapeHtml(editing.code)}</small>` : ''}</h6>
        <div class="row">
            <div class="form-group col-12 col-md-6"><label for="prepay-pkg-name" class="mb-1">Nama paket</label>
                <input type="text" id="prepay-pkg-name" class="form-control" maxlength="120" value="${escapeAttribute(editing.name)}"></div>
            <div class="form-group col-12 col-md-6"><label for="prepay-pkg-category" class="mb-1">Kategori</label>
                <select id="prepay-pkg-category" class="form-control">${Object.entries(CATEGORY_LABELS).map(([code, label]) => `<option value="${escapeAttribute(code)}" ${code === editing.category ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('')}</select></div>
            <div class="form-group col-12"><label for="prepay-pkg-description" class="mb-1">Deskripsi (opsional)</label>
                <input type="text" id="prepay-pkg-description" class="form-control" maxlength="255" value="${escapeAttribute(editing.description || '')}"></div>
            <div class="form-group col-12 col-md-6" id="prepay-pkg-weeks" ${editing.category === 'obstetri' ? '' : 'hidden'}>
                <label class="mb-1">Usia kehamilan (minggu dari–sampai, kosongkan untuk semua minggu)</label>
                <div class="d-flex align-items-center">
                    <input type="number" id="prepay-pkg-week-min" class="form-control" min="0" max="45" step="1" placeholder="dari" value="${editing.week_min ?? ''}" aria-label="Minggu dari">
                    <span class="mx-2">–</span>
                    <input type="number" id="prepay-pkg-week-max" class="form-control" min="0" max="45" step="1" placeholder="sampai" value="${editing.week_max ?? ''}" aria-label="Minggu sampai">
                </div>
            </div>
            <div class="form-group col-12 col-md-3"><label for="prepay-pkg-sort" class="mb-1">Urutan</label>
                <input type="number" id="prepay-pkg-sort" class="form-control" step="1" value="${Number(editing.sort_order) || 0}"></div>
        </div>
        <div id="prepay-pkg-overlap" class="small text-muted mb-3"></div>
        <div class="prepay-item-admin"><span>${escapeHtml(admin ? admin.name : 'Biaya admin')} <small class="text-muted">(otomatis, tidak bisa diubah)</small></span><span>${admin && admin.price !== null ? rupiah(admin.price) : '-'}</span></div>
        <div id="prepay-pkg-items">${itemRowsHtml()}</div>
        <div class="mb-2">
            <button type="button" class="btn btn-sm btn-outline-primary" onclick="window.prepayAddPackageItem('tindakan')">+ Tambah tindakan</button>
            <button type="button" class="btn btn-sm btn-outline-primary ml-1" onclick="window.prepayAddPackageItem('obat')">+ Tambah obat</button>
        </div>
        <div id="prepay-pkg-total" class="prepay-package-total"></div>
        ${issues.length ? `<ul class="prepay-package-issues">${issues.map(issue => `<li>${escapeHtml(issue)}</li>`).join('')}</ul>` : ''}
        <div class="mt-3">
            <button type="button" id="prepay-pkg-save" class="btn btn-primary" onclick="window.prepaySavePackage()"><i class="fas fa-save mr-1"></i>Simpan paket</button>
            <button type="button" class="btn btn-outline-secondary ml-1" onclick="window.prepayClosePackageEditor()">Batal</button>
        </div>`;
    if (!box.dataset.bound) {
        box.dataset.bound = '1';
        box.addEventListener('input', onPackageInput);
        box.addEventListener('change', onPackageInput);
    }
    updatePackageTotals();
}

function onPackageInput(event) {
    const target = event.target;
    const editing = packageState.editing;
    if (!editing || !target) return;
    if (target.id === 'prepay-pkg-category') {
        editing.category = target.value;
        const weeks = byId('prepay-pkg-weeks');
        if (weeks) weeks.hidden = editing.category !== 'obstetri';
    } else if (target.dataset?.field) {
        const item = editing.items[Number(target.dataset.index)];
        if (!item) return;
        item[target.dataset.field] = Number(target.value);
    }
    updatePackageTotals();
}

function packageRowHtml(pkg) {
    const ready = pkg.ready
        ? '<span class="badge badge-success">Siap</span>'
        : `<span class="badge badge-warning">Belum siap: kartu tidak tampil di halaman utama</span>${(pkg.issues || []).length ? `<ul class="prepay-package-issues">${pkg.issues.map(issue => `<li>${escapeHtml(issue)}</li>`).join('')}</ul>` : ''}`;
    return `<tr>
        <td>${escapeHtml(pkg.name)}${pkg.description ? `<small class="d-block text-muted">${escapeHtml(pkg.description)}</small>` : ''}<small class="text-muted">${escapeHtml(pkg.code)}</small></td>
        <td>${escapeHtml(CATEGORY_LABELS[pkg.category] || pkg.category)}</td>
        <td class="text-nowrap">${escapeHtml(weekText(pkg))}</td>
        <td class="prepay-amount">${pkg.ready ? rupiah(pkg.amount_idr) : '-'}</td>
        <td>${ready}</td>
        <td><button type="button" class="btn btn-sm ${pkg.is_active ? 'btn-success' : 'btn-outline-secondary'}" data-id="${Number(pkg.id)}"
            onclick="window.prepayTogglePackage(Number(this.dataset.id))">${pkg.is_active ? 'Aktif' : 'Nonaktif'}</button></td>
        <td class="text-center">${Number(pkg.sort_order) || 0}</td>
        <td class="text-right"><button type="button" class="btn btn-sm btn-outline-primary" data-id="${Number(pkg.id)}"
            onclick="window.prepayEditPackage(Number(this.dataset.id))">Ubah</button></td>
    </tr>`;
}

function renderPackageList() {
    const tbody = byId('prepay-packages-tbody');
    if (!tbody) return;
    tbody.innerHTML = packageState.list.length
        ? packageState.list.map(packageRowHtml).join('')
        : '<tr><td colspan="8" class="text-center text-muted py-3">Belum ada paket.</td></tr>';
}

async function ensureCatalog() {
    if (packageState.catalog) return packageState.catalog;
    const result = await staffApiRequest(`${API}/packages/catalog`);
    packageState.catalog = result?.data || { tindakan: [], obat: [], admin: null };
    return packageState.catalog;
}

export async function prepayLoadPackages() {
    const tbody = byId('prepay-packages-tbody');
    if (!tbody || !canEditPackages()) return;
    tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-3">Memuat…</td></tr>';
    try {
        const result = await scope().request(`${API}/packages`);
        packageState.list = Array.isArray(result?.data?.packages) ? result.data.packages : [];
        renderPackageList();
        if (packageState.editing) updatePackageTotals();
    } catch (error) {
        if (isAbort(error)) return;
        tbody.innerHTML = `<tr><td colspan="8" class="text-center text-danger py-3">${escapeHtml(error.message || 'Gagal memuat paket')}</td></tr>`;
    }
}

export async function prepayEditPackage(id) {
    if (!canEditPackages()) return;
    try {
        // The catalog is loaded fresh each time the editor opens so prices and obat are current.
        packageState.catalog = null;
        await ensureCatalog();
    } catch (error) {
        flash(error.message || 'Daftar tindakan dan obat belum dapat dimuat.', 'danger');
        return;
    }
    const existing = id === null || id === undefined ? null : packageState.list.find(pkg => Number(pkg.id) === Number(id));
    if (id !== null && id !== undefined && !existing) return;
    packageState.editing = existing
        ? {
            id: existing.id, code: existing.code, name: existing.name, description: existing.description, category: existing.category,
            week_min: existing.week_min, week_max: existing.week_max, sort_order: existing.sort_order, issues: existing.ready ? [] : (existing.issues || []),
            items: editorItemsFromPriced(existing.items, packageState.catalog?.admin?.id)
        }
        : { id: null, code: null, name: '', description: '', category: 'obstetri', week_min: null, week_max: null, sort_order: (packageState.list.length + 1) * 10, issues: [], items: [] };
    renderPackageEditor();
    byId('prepay-package-editor')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

export function prepayClosePackageEditor() {
    packageState.editing = null;
    renderPackageEditor();
}

export function prepayAddPackageItem(type) {
    const editing = packageState.editing;
    if (!editing || !packageState.catalog) return;
    const itemType = type === 'obat' ? 'obat' : 'tindakan';
    const list = itemType === 'obat' ? packageState.catalog.obat : packageState.catalog.tindakan;
    const taken = new Set(editing.items.filter(item => item.item_type === itemType).map(item => Number(item.ref_id)));
    const first = (list || []).find(entry => !taken.has(Number(entry.id)));
    if (!first) {
        flash(itemType === 'obat' ? 'Tidak ada obat lain yang bisa ditambahkan.' : 'Tidak ada tindakan lain yang bisa ditambahkan.', 'warning');
        return;
    }
    editing.items.push({ item_type: itemType, ref_id: Number(first.id), quantity: 1 });
    byId('prepay-pkg-items').innerHTML = itemRowsHtml();
    updatePackageTotals();
}

export function prepayRemovePackageItem(index) {
    const editing = packageState.editing;
    if (!editing || !editing.items[index]) return;
    editing.items.splice(index, 1);
    byId('prepay-pkg-items').innerHTML = itemRowsHtml();
    updatePackageTotals();
}

export async function prepaySavePackage() {
    const editing = packageState.editing;
    if (!editing || !canEditPackages()) return;
    const category = byId('prepay-pkg-category')?.value || editing.category;
    const payload = {
        name: (byId('prepay-pkg-name')?.value || '').trim(),
        description: (byId('prepay-pkg-description')?.value || '').trim(),
        category,
        week_min: null,
        week_max: null,
        sort_order: Number(byId('prepay-pkg-sort')?.value) || 0,
        items: payloadItems(editing.items, packageState.catalog?.admin?.id)
    };
    if (category === 'obstetri') {
        const min = byId('prepay-pkg-week-min')?.value;
        const max = byId('prepay-pkg-week-max')?.value;
        if (min !== '' || max !== '') {
            payload.week_min = min === '' ? null : Number(min);
            payload.week_max = max === '' ? null : Number(max);
        }
    }
    if (!payload.name) return flash('Nama paket wajib diisi.', 'danger');
    if (!payload.items.length) return flash('Tambahkan minimal satu tindakan atau obat.', 'danger');
    if (!window.confirm('Simpan paket? Perubahan langsung tampil di sisiwanita.id.')) return;
    const button = byId('prepay-pkg-save');
    if (button) button.disabled = true;
    try {
        const result = await staffApiRequest(editing.id ? `${API}/packages/${Number(editing.id)}` : `${API}/packages`, {
            method: editing.id ? 'PUT' : 'POST',
            retries: 0,
            body: JSON.stringify(payload)
        });
        packageState.editing = null;
        renderPackageEditor();
        await prepayLoadPackages();
        const saved = result?.data;
        flash(saved && saved.ready === false
            ? 'Paket tersimpan, tetapi belum siap: kartu tidak tampil di halaman utama. Lihat alasannya di daftar.'
            : (result?.message || 'Paket tersimpan.'), saved && saved.ready === false ? 'warning' : 'success');
    } catch (error) {
        flash(error.message || 'Paket belum tersimpan.', 'danger');
    } finally {
        if (button) button.disabled = false;
    }
}

export async function prepayTogglePackage(id) {
    if (!canEditPackages()) return;
    const pkg = packageState.list.find(entry => Number(entry.id) === Number(id));
    if (!pkg) return;
    const next = !pkg.is_active;
    if (!window.confirm(next ? `Aktifkan paket "${pkg.name}"?` : `Nonaktifkan paket "${pkg.name}"? Kartu paket disembunyikan dari pasien.`)) return;
    try {
        const result = await staffApiRequest(`${API}/packages/${Number(pkg.id)}/active`, {
            method: 'PATCH',
            retries: 0,
            body: JSON.stringify({ active: next })
        });
        flash(result?.message || 'Status paket diperbarui.');
        await prepayLoadPackages();
    } catch (error) {
        flash(error.message || 'Status paket belum berubah.', 'danger');
    }
}

// ---------------------------------------------------------------- Pencairan

const REQUEST_STATUS_BADGES = {
    pending: '<span class="badge badge-warning">Menunggu</span>',
    done: '<span class="badge badge-success">Sudah ditransfer</span>',
    rejected: '<span class="badge badge-danger">Ditolak</span>',
    cancelled: '<span class="badge badge-secondary">Dibatalkan pasien</span>'
};

// Local date parts only: the server stores clinic local time.
function localDateTime(value) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.valueOf())) return String(value);
    const two = number => String(number).padStart(2, '0');
    return `${two(date.getDate())}/${two(date.getMonth() + 1)}/${date.getFullYear()} ${two(date.getHours())}:${two(date.getMinutes())}`;
}

function refundRequestRowHtml(row) {
    const pending = row.status === 'pending';
    const actions = pending && canRefund()
        ? `<button type="button" class="btn btn-sm btn-success" data-id="${Number(row.id)}" onclick="window.prepayCompleteRefundRequest(Number(this.dataset.id))">Sudah ditransfer</button>
           <button type="button" class="btn btn-sm btn-outline-danger ml-1" data-id="${Number(row.id)}" onclick="window.prepayRejectRefundRequest(Number(this.dataset.id))">Tolak</button>`
        : '';
    return `<tr>
        <td>${patientButton(row.patient_id, row.patient_name)}</td>
        <td class="prepay-amount font-weight-bold">${rupiah(row.amount_idr)}</td>
        <td>${escapeHtml(row.bank_name || '-')}</td>
        <td class="text-nowrap">${escapeHtml(row.account_number || '-')}</td>
        <td>${escapeHtml(row.account_holder || '-')}${row.name_differs ? ' <span class="badge badge-warning">nama berbeda</span>' : ''}</td>
        <td class="text-nowrap">${escapeHtml(localDateTime(row.created_at))}</td>
        <td>${REQUEST_STATUS_BADGES[row.status] || escapeHtml(row.status || '-')}${row.decision_note ? `<small class="d-block text-muted prepay-note">${escapeHtml(row.decision_note)}</small>` : ''}</td>
        <td class="text-right text-nowrap">${actions}</td>
    </tr>`;
}

export async function prepayLoadRefundRequests() {
    const tbody = byId('prepay-refund-requests-tbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-3">Memuat…</td></tr>';
    try {
        const result = await scope().request(`${API}/refund-requests`);
        const rows = Array.isArray(result?.data) ? result.data : [];
        refundRequestsById = new Map(rows.map(row => [Number(row.id), row]));
        // The API returns pending first; keep that order and show closed ones after.
        const ordered = [...rows.filter(row => row.status === 'pending'), ...rows.filter(row => row.status !== 'pending')];
        tbody.innerHTML = ordered.length
            ? ordered.map(refundRequestRowHtml).join('')
            : '<tr><td colspan="8" class="text-center text-muted py-3">Belum ada pengajuan pencairan.</td></tr>';
    } catch (error) {
        if (isAbort(error)) return;
        tbody.innerHTML = `<tr><td colspan="8" class="text-center text-danger py-3">${escapeHtml(error.message || 'Gagal memuat pengajuan')}</td></tr>`;
    }
}

export async function prepayCompleteRefundRequest(id) {
    if (!canRefund()) return;
    const row = refundRequestsById.get(Number(id));
    if (!row) return;
    if (!window.confirm(`Pastikan ${rupiah(row.amount_idr)} sudah ditransfer ke ${row.bank_name} ${row.account_number} a.n. ${row.account_holder}.`)) return;
    try {
        const result = await staffApiRequest(`${API}/refund-requests/${Number(row.id)}/complete`, { method: 'POST', retries: 0 });
        flash(result?.message || 'Pencairan tercatat sudah ditransfer.');
    } catch (error) {
        // 409 carries the reason (already closed, or cancelled by the patient): show it as the server wrote it.
        flash(error.message || 'Pencairan belum tercatat.', 'danger');
    }
    await prepayLoadRefundRequests();
}

export async function prepayRejectRefundRequest(id) {
    if (!canRefund()) return;
    const row = refundRequestsById.get(Number(id));
    if (!row) return;
    const answer = window.prompt(`Alasan menolak pencairan ${rupiah(row.amount_idr)} untuk ${row.patient_name} (3–500 karakter):`);
    if (answer === null) return;
    const note = answer.trim();
    if (note.length < 3 || note.length > 500) {
        flash('Alasan penolakan wajib diisi (3–500 karakter).', 'danger');
        return;
    }
    try {
        const result = await staffApiRequest(`${API}/refund-requests/${Number(row.id)}/reject`, {
            method: 'POST',
            retries: 0,
            body: JSON.stringify({ note })
        });
        flash(result?.message || 'Pengajuan pencairan ditolak.');
    } catch (error) {
        flash(error.message || 'Pengajuan belum ditolak.', 'danger');
    }
    await prepayLoadRefundRequests();
}

document.addEventListener('page:changed', event => {
    if (event.detail?.page !== 'prepay') {
        requestScope?.abort();
        requestScope = null;
    }
});

Object.assign(window, {
    showPrepayPage,
    prepayShowTab,
    prepayLoadOrders,
    prepayLoadBalances,
    prepayOpenLedger,
    prepayShowPatient,
    prepayOpenRefund,
    prepayCloseRefund,
    prepaySubmitRefund,
    prepayLoadPackages,
    prepayEditPackage,
    prepayClosePackageEditor,
    prepayAddPackageItem,
    prepayRemovePackageItem,
    prepaySavePackage,
    prepayTogglePackage,
    prepayLoadRefundRequests,
    prepayCompleteRefundRequest,
    prepayRejectRefundRequest
});

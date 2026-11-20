/**
 * Staff page "Pembayaran di Muka" (bayar di muka, Tahap 2).
 *
 * - Pembayaran: prepay orders paid through Duitku (method, VA number, Duitku fee).
 * - Saldo Pasien: saldo per patient and category, its history, and saldo refunds
 *   (recorded after staff hand the money over; billing.reset, like billing returns).
 * - Harga Estimasi: which tindakan make up each prepay product (doctor only).
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
let mappingState = null;

function scope() {
    requestScope?.abort('Request replaced');
    requestScope = createPageRequestScope();
    return requestScope;
}

const isAbort = error => error?.name === 'AbortError';
const byId = id => document.getElementById(id);
const canRefund = () => Boolean(window.hasAccountPermission?.('billing.reset'));
const canEditMapping = () => Boolean(window.hasAccountPermission?.('checkup_prepay.manage_estimate'));

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
    byId('prepay-tab-mapping-item')?.classList.toggle('d-none', !canEditMapping());
    await prepayShowTab(currentTab === 'mapping' && !canEditMapping() ? 'orders' : currentTab);
}

export async function prepayShowTab(tab) {
    if (tab === 'mapping' && !canEditMapping()) tab = 'orders';
    currentTab = tab;
    document.querySelectorAll('#prepay-page [data-prepay-tab]').forEach(link => {
        link.classList.toggle('active', link.dataset.prepayTab === tab);
    });
    ['orders', 'balances', 'mapping'].forEach(name => {
        const panel = byId(`prepay-panel-${name}`);
        if (panel) panel.hidden = name !== tab;
    });
    flash('');
    if (tab === 'orders') return prepayLoadOrders();
    if (tab === 'balances') return prepayLoadBalances();
    return prepayLoadMapping();
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

// ---------------------------------------------------------------- Harga Estimasi

function renderMapping() {
    const root = byId('prepay-mapping-root');
    if (!root || !mappingState) return;
    const options = selected => mappingState.tindakan
        .filter(item => Number(item.id) !== Number(mappingState.adminId))
        .map(item => `<option value="${Number(item.id)}" ${Number(item.id) === Number(selected) ? 'selected' : ''}>${escapeHtml(item.name)} — ${rupiah(item.price)} (${escapeHtml(item.category)})</option>`)
        .join('');
    root.innerHTML = mappingState.products.map(product => {
        const priced = mappingState.priced.find(entry => entry.code === product.code) || {};
        const items = mappingState.items[product.code] || [];
        const status = priced.ready
            ? `<span class="badge badge-success">${rupiah(priced.amount_idr)}</span>`
            : `<span class="badge badge-warning">Belum siap: kartu tidak tampil di halaman utama</span>`;
        return `<div class="prepay-mapping-product">
            <div class="d-flex justify-content-between align-items-center mb-2">
                <strong>${escapeHtml(product.label)}</strong>${status}
            </div>
            ${!priced.ready && (priced.issues || []).length ? `<ul class="small text-muted mb-2">${priced.issues.map(issue => `<li>${escapeHtml(issue)}</li>`).join('')}</ul>` : ''}
            ${items.map((item, index) => `<div class="prepay-mapping-row">
                <select class="form-control form-control-sm" data-code="${escapeAttribute(product.code)}" data-index="${index}" data-field="tindakan_id">${options(item.tindakan_id)}</select>
                <input type="number" min="1" max="10" step="1" class="form-control form-control-sm" value="${Number(item.quantity) || 1}" data-code="${escapeAttribute(product.code)}" data-index="${index}" data-field="quantity">
                <button type="button" class="btn btn-sm btn-outline-danger" title="Hapus" data-code="${escapeAttribute(product.code)}" data-index="${index}"
                    onclick="window.prepayRemoveMappingItem(this.dataset.code, Number(this.dataset.index))"><i class="fas fa-times"></i></button>
            </div>`).join('')}
            <button type="button" class="btn btn-sm btn-outline-primary" data-code="${escapeAttribute(product.code)}"
                onclick="window.prepayAddMappingItem(this.dataset.code)"><i class="fas fa-plus mr-1"></i>Tambah tindakan</button>
        </div>`;
    }).join('');
}

function onMappingInput(event) {
    const target = event.target;
    if (!mappingState || !target?.dataset?.field) return;
    const list = mappingState.items[target.dataset.code];
    const item = list && list[Number(target.dataset.index)];
    if (!item) return;
    item[target.dataset.field] = Number(target.value);
}

export async function prepayLoadMapping() {
    const root = byId('prepay-mapping-root');
    if (!root || !canEditMapping()) return;
    root.innerHTML = '<div class="text-muted">Memuat…</div>';
    try {
        const result = await scope().request(`${API}/estimate-mapping`);
        const data = result?.data || {};
        const priced = Array.isArray(data.categories) ? data.categories : [];
        mappingState = {
            products: priced.map(entry => ({ code: entry.code, label: entry.label })),
            priced,
            tindakan: Array.isArray(data.tindakan) ? data.tindakan : [],
            adminId: data.admin_tindakan_id,
            items: Object.fromEntries(priced.map(entry => [
                entry.code,
                (data.mapping?.categories?.[entry.code]?.items || []).map(item => ({ tindakan_id: Number(item.tindakan_id), quantity: Number(item.quantity) || 1 }))
            ]))
        };
        if (!root.dataset.bound) {
            root.dataset.bound = '1';
            root.addEventListener('change', onMappingInput);
        }
        renderMapping();
    } catch (error) {
        if (isAbort(error)) return;
        root.innerHTML = `<div class="text-danger">${escapeHtml(error.message || 'Gagal memuat harga estimasi')}</div>`;
    }
}

export function prepayAddMappingItem(code) {
    if (!mappingState || !mappingState.items[code]) return;
    const first = mappingState.tindakan.find(item => Number(item.id) !== Number(mappingState.adminId));
    if (!first) return;
    mappingState.items[code].push({ tindakan_id: Number(first.id), quantity: 1 });
    renderMapping();
}

export function prepayRemoveMappingItem(code, index) {
    if (!mappingState || !mappingState.items[code]) return;
    mappingState.items[code].splice(index, 1);
    renderMapping();
}

export async function prepaySaveMapping() {
    if (!mappingState || !canEditMapping()) return;
    if (!window.confirm('Simpan harga estimasi? Harga baru langsung tampil di sisiwanita.id.')) return;
    const button = byId('prepay-mapping-save');
    const categories = {};
    for (const [code, items] of Object.entries(mappingState.items)) {
        if (items.length) categories[code] = { items: items.map(item => ({ tindakan_id: Number(item.tindakan_id), quantity: Number(item.quantity) })) };
    }
    if (button) button.disabled = true;
    try {
        const result = await staffApiRequest(`${API}/estimate-mapping`, {
            method: 'PUT',
            retries: 0,
            body: JSON.stringify({ mapping: { categories } })
        });
        mappingState.priced = Array.isArray(result?.data?.categories) ? result.data.categories : mappingState.priced;
        renderMapping();
        flash(result?.message || 'Harga estimasi tersimpan.');
    } catch (error) {
        flash(error.message || 'Harga estimasi belum tersimpan.', 'danger');
    } finally {
        if (button) button.disabled = false;
    }
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
    prepayLoadMapping,
    prepayAddMappingItem,
    prepayRemoveMappingItem,
    prepaySaveMapping
});

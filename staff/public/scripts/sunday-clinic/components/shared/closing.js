import { ROLE_IDS } from '../../../role-constants.js';
import { getIdToken } from '../../../vps-auth-v2.js';

const state = {
    initialized: false,
    authorized: false,
    identity: null,
    preview: null,
    previewController: null,
    historyController: null,
    detailController: null,
    refreshTimer: null,
    confirmArmed: false,
    socket: null,
    socketHandlers: null
};

const DOM_IDS = Object.freeze({
    footer: 'sunday-clinic-closing-footer',
    openButton: 'btn-open-sunday-clinic-closing',
    modal: 'sundayClinicClosingModal',
    date: 'sunday-clinic-closing-date',
    refresh: 'btn-refresh-sunday-clinic-closing',
    submit: 'btn-submit-sunday-clinic-closing',
    content: 'sunday-clinic-closing-content',
    alert: 'sunday-clinic-closing-alert',
    subtitle: 'sunday-clinic-closing-subtitle',
    footerStatus: 'sunday-clinic-closing-footer-status',
    history: 'sunday-clinic-closing-history',
    historyButton: 'btn-load-sunday-clinic-closing-history'
});

function byId(id) {
    return document.getElementById(id);
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function isDoctor(identity) {
    return Number(identity?.role_id) === ROLE_IDS.DOKTER;
}

function formatCurrency(value) {
    const number = Number(value || 0);
    return `Rp ${number.toLocaleString('id-ID', { maximumFractionDigits: 0 })}`;
}

function formatDate(value, includeTime = false) {
    if (!value) return '-';
    const rawValue = String(value);
    const normalized = /^\d{4}-\d{2}-\d{2}$/.test(rawValue)
        ? `${rawValue}T00:00:00+07:00`
        : /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(?::\d{2})?$/.test(rawValue)
            ? `${rawValue.replace(' ', 'T')}+07:00`
            : rawValue;
    const date = new Date(normalized);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat('id-ID', {
        timeZone: 'Asia/Jakarta',
        weekday: includeTime ? undefined : 'long',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: includeTime ? '2-digit' : undefined,
        minute: includeTime ? '2-digit' : undefined
    }).format(date);
}

function getLatestSundayWib(now = new Date()) {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Jakarta',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).formatToParts(now);
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    const calendarDate = new Date(Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day)));
    calendarDate.setUTCDate(calendarDate.getUTCDate() - calendarDate.getUTCDay());
    return [
        calendarDate.getUTCFullYear(),
        String(calendarDate.getUTCMonth() + 1).padStart(2, '0'),
        String(calendarDate.getUTCDate()).padStart(2, '0')
    ].join('-');
}

async function requestClosing(endpoint, options = {}, controller = null) {
    const token = await getIdToken();
    if (!token) throw new Error('Sesi login berakhir. Silakan login ulang.');

    const response = await fetch(endpoint, {
        cache: 'no-store',
        ...options,
        signal: controller?.signal,
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            ...(options.headers || {})
        }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.success === false) {
        const error = new Error(payload.message || `HTTP ${response.status}`);
        error.status = response.status;
        error.code = payload.code || null;
        error.payload = payload;
        throw error;
    }
    return payload.data ?? payload;
}

function setAlert(type, message) {
    const container = byId(DOM_IDS.alert);
    if (!container) return;
    container.innerHTML = message
        ? `<div class="alert alert-${type} mb-0">${escapeHtml(message)}</div>`
        : '';
}

function setLoading(message = 'Memuat rekap closing...') {
    const content = byId(DOM_IDS.content);
    if (content) {
        content.innerHTML = `
            <div class="text-center text-muted py-4">
                <i class="fas fa-spinner fa-spin mr-1"></i>${escapeHtml(message)}
            </div>
        `;
    }
    const submit = byId(DOM_IDS.submit);
    if (submit) submit.disabled = true;
}

function resetConfirmation() {
    state.confirmArmed = false;
    const submit = byId(DOM_IDS.submit);
    if (!submit) return;
    submit.classList.remove('btn-danger');
    submit.classList.add('btn-warning');
    submit.innerHTML = '<i class="fas fa-lock mr-1"></i>Closing Sekarang';
}

function renderIssueList(title, items, type) {
    if (!Array.isArray(items) || items.length === 0) return '';
    const icon = type === 'danger' ? 'fa-ban' : 'fa-exclamation-triangle';
    return `
        <section class="sc-closing-issues alert alert-${type}">
            <h6><i class="fas ${icon} mr-1"></i>${escapeHtml(title)}</h6>
            <ul class="mb-0 pl-3">
                ${items.map(item => {
                    if (typeof item === 'string') return `<li>${escapeHtml(item)}</li>`;
                    const label = item.message || item.label || item.code || 'Perlu diperiksa';
                    const count = Number(item.count || 0);
                    const total = Number(item.total || 0);
                    return `<li>${escapeHtml(label)}${count ? ` (${count})` : ''}${total ? ` — ${formatCurrency(total)}` : ''}</li>`;
                }).join('')}
            </ul>
        </section>
    `;
}

function getItems(transaction) {
    if (Array.isArray(transaction?.items)) return transaction.items;
    if (Array.isArray(transaction?.items_snapshot)) return transaction.items_snapshot;
    if (typeof transaction?.items_snapshot === 'string') {
        try {
            const parsed = JSON.parse(transaction.items_snapshot);
            return Array.isArray(parsed) ? parsed : [];
        } catch (_error) {
            return [];
        }
    }
    return [];
}

function renderTransactionItems(transaction) {
    const items = getItems(transaction);
    if (!items.length) return '<span class="text-muted">Tidak ada rincian item.</span>';
    return `
        <div class="sc-closing-item-list">
            ${items.map(item => `
                <div class="sc-closing-item-row">
                    <span>${escapeHtml(item.item_name || item.name || '-')}</span>
                    <span>${escapeHtml(item.quantity ?? item.qty ?? 1)} × ${formatCurrency(item.price)}</span>
                    <strong>${formatCurrency(item.total ?? (Number(item.quantity || 1) * Number(item.price || 0)))}</strong>
                </div>
            `).join('')}
        </div>
    `;
}

function renderTransactions(transactions) {
    if (!Array.isArray(transactions) || transactions.length === 0) {
        return '<div class="sc-empty"><strong>Belum ada pendapatan</strong>Tidak ada tagihan lunas untuk tanggal praktik ini.</div>';
    }

    return `
        <div class="table-responsive sc-closing-table-wrap">
            <table class="table table-sm table-bordered mb-0 sc-closing-table">
                <thead class="thead-light">
                    <tr>
                        <th>Pasien / DRD</th>
                        <th>Jenis Tagihan</th>
                        <th>Dibayar</th>
                        <th>Petugas</th>
                        <th>Metode</th>
                        <th class="text-right">Nominal</th>
                    </tr>
                </thead>
                <tbody>
                    ${transactions.map((transaction, index) => {
                        const sourceType = transaction.source_type === 'additional' ? 'Tagihan Tambahan' : 'Tagihan Utama';
                        const amount = transaction.amount ?? transaction.total ?? 0;
                        const patientName = transaction.patient_name || transaction.full_name || '-';
                        const reference = transaction.reference_number || transaction.mr_id || '-';
                        return `
                            <tr class="sc-closing-transaction-row">
                                <td data-label="Pasien / DRD">
                                    <strong>${escapeHtml(patientName)}</strong>
                                    <div class="text-muted small">${escapeHtml(transaction.patient_id || '-')} · ${escapeHtml(transaction.mr_id || '-')}</div>
                                </td>
                                <td data-label="Jenis Tagihan">${escapeHtml(sourceType)}<div class="text-muted small">${escapeHtml(reference)}</div></td>
                                <td data-label="Dibayar">${escapeHtml(formatDate(transaction.paid_at || transaction.effective_paid_at, true))}</td>
                                <td data-label="Petugas">${escapeHtml(transaction.paid_by || '-')}</td>
                                <td data-label="Metode">${escapeHtml(transaction.payment_method || 'Tidak tercatat')}</td>
                                <td data-label="Nominal" class="text-right font-weight-bold">${formatCurrency(amount)}</td>
                            </tr>
                            <tr class="sc-closing-items-row">
                                <td colspan="6">
                                    <details>
                                        <summary>Rincian item transaksi ${index + 1}</summary>
                                        ${renderTransactionItems(transaction)}
                                    </details>
                                </td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        </div>
    `;
}

function renderPreview(data) {
    state.preview = data || null;
    resetConfirmation();

    const content = byId(DOM_IDS.content);
    if (!content || !data) return;

    const clinicDate = data.clinic_date || data.date || '';
    const dateInput = byId(DOM_IDS.date);
    if (dateInput && clinicDate) dateInput.value = clinicDate;

    const summary = data.summary || {};
    const breakdown = data.breakdown || {};
    const transactions = data.transactions || data.entries || [];
    const mainCount = summary.main_count
        ?? transactions.filter(transaction => transaction.source_type !== 'additional').length;
    const additionalCount = summary.additional_count
        ?? transactions.filter(transaction => transaction.source_type === 'additional').length;
    const closedRecord = data.closed_record || data.closing || null;
    const isClosed = data.status === 'closed' || Boolean(closedRecord);
    const doctorName = closedRecord?.closed_by_name || closedRecord?.doctor_name || '-';
    const closedAt = closedRecord?.closed_at || null;

    const subtitle = byId(DOM_IDS.subtitle);
    if (subtitle) subtitle.textContent = clinicDate ? `Tanggal praktik ${formatDate(clinicDate)}` : 'Rekap pendapatan tanggal praktik';

    content.innerHTML = `
        ${isClosed ? `
            <div class="alert alert-success sc-closing-closed-banner">
                <i class="fas fa-lock mr-1"></i>
                <strong>Sudah Closing</strong> oleh ${escapeHtml(doctorName)} pada ${escapeHtml(formatDate(closedAt, true))}.
            </div>
        ` : ''}
        <div class="sc-closing-summary-grid">
            <div class="sc-closing-summary-card"><span>Tagihan Utama</span><strong>${formatCurrency(summary.main_total)}</strong><small>${Number(mainCount)} transaksi</small></div>
            <div class="sc-closing-summary-card"><span>Tagihan Tambahan</span><strong>${formatCurrency(summary.additional_total)}</strong><small>${Number(additionalCount)} transaksi</small></div>
            <div class="sc-closing-summary-card sc-closing-summary-total"><span>Total Pendapatan</span><strong>${formatCurrency(summary.grand_total)}</strong><small>${Number(summary.patient_count || 0)} pasien · ${Number(summary.transaction_count || 0)} transaksi</small></div>
        </div>
        <div class="sc-closing-breakdown-grid">
            <div><span>Tindakan</span><strong>${formatCurrency(breakdown.tindakan)}</strong></div>
            <div><span>Obat</span><strong>${formatCurrency(breakdown.obat)}</strong></div>
            <div><span>Administratif</span><strong>${formatCurrency(breakdown.administratif)}</strong></div>
        </div>
        ${renderIssueList('Closing belum dapat dilakukan', data.blockers, 'danger')}
        ${renderIssueList('Anomali yang perlu diperiksa', data.anomalies, 'warning')}
        <section class="sc-closing-transactions mt-3">
            <h6><i class="fas fa-receipt mr-1"></i>Rincian Transaksi</h6>
            ${renderTransactions(transactions)}
        </section>
    `;

    const submit = byId(DOM_IDS.submit);
    if (submit) submit.disabled = isClosed || !data.can_close;
    const footerStatus = byId(DOM_IDS.footerStatus);
    if (footerStatus) {
        footerStatus.textContent = isClosed
            ? `Snapshot final #${closedRecord?.id || data.id || '-'}`
            : data.can_close
                ? 'Semua pemeriksaan finansial siap untuk closing.'
                : 'Selesaikan seluruh blocker sebelum closing.';
    }
}

async function loadPreview(date = '') {
    if (!state.authorized) return;
    if (state.previewController) state.previewController.abort();
    if (state.detailController) state.detailController.abort();
    const controller = new AbortController();
    state.previewController = controller;
    state.detailController = null;
    setAlert('', '');
    setLoading();

    const query = date ? `?date=${encodeURIComponent(date)}` : '';
    try {
        const data = await requestClosing(
            `/api/sunday-clinic/closing/preview${query}`,
            { method: 'GET' },
            controller
        );
        renderPreview(data);
    } catch (error) {
        if (error.name === 'AbortError') return;
        setAlert('danger', error.message || 'Gagal memuat preview closing.');
        const content = byId(DOM_IDS.content);
        if (content) content.innerHTML = '<div class="sc-empty"><strong>Preview tidak tersedia</strong>Coba muat ulang setelah beberapa saat.</div>';
    } finally {
        if (state.previewController === controller) state.previewController = null;
    }
}

function getHistoryRows(data) {
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.items)) return data.items;
    if (Array.isArray(data?.closings)) return data.closings;
    return [];
}

async function loadHistory() {
    if (!state.authorized) return;
    if (state.historyController) state.historyController.abort();
    const controller = new AbortController();
    state.historyController = controller;
    const container = byId(DOM_IDS.history);
    if (container) container.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>Memuat riwayat...';

    try {
        const data = await requestClosing(
            '/api/sunday-clinic/closings?limit=20',
            { method: 'GET' },
            controller
        );
        const rows = getHistoryRows(data);
        if (!container) return;
        container.innerHTML = rows.length ? rows.map(row => `
            <button type="button" class="sc-closing-history-row" data-closing-id="${escapeHtml(row.id)}">
                <span><strong>${escapeHtml(formatDate(row.clinic_date || row.date))}</strong><small>${escapeHtml(row.closed_by_name || '-')} · ${escapeHtml(formatDate(row.closed_at, true))}</small></span>
                <strong>${formatCurrency(row.grand_total ?? row.summary?.grand_total)}</strong>
            </button>
        `).join('') : '<div class="sc-empty py-2">Belum ada riwayat closing.</div>';
    } catch (error) {
        if (error.name !== 'AbortError' && container) container.textContent = error.message || 'Gagal memuat riwayat.';
    } finally {
        if (state.historyController === controller) state.historyController = null;
    }
}

async function loadClosedDetail(id) {
    if (!id) return;
    if (state.previewController) state.previewController.abort();
    if (state.detailController) state.detailController.abort();
    const controller = new AbortController();
    state.previewController = null;
    state.detailController = controller;
    setLoading('Memuat snapshot closing...');
    try {
        const data = await requestClosing(
            `/api/sunday-clinic/closings/${encodeURIComponent(id)}`,
            { method: 'GET' },
            controller
        );
        renderPreview({ ...data, status: 'closed', can_close: false, closed_record: data.closed_record || data.closing || data });
    } catch (error) {
        if (error.name === 'AbortError') return;
        setAlert('danger', error.message || 'Gagal memuat detail closing.');
    } finally {
        if (state.detailController === controller) state.detailController = null;
    }
}

async function submitClosing() {
    const preview = state.preview;
    if (!preview?.can_close || !preview.fingerprint) return;

    const submit = byId(DOM_IDS.submit);
    if (!state.confirmArmed) {
        state.confirmArmed = true;
        if (submit) {
            submit.classList.remove('btn-warning');
            submit.classList.add('btn-danger');
            submit.innerHTML = '<i class="fas fa-check mr-1"></i>Konfirmasi Closing Final';
        }
        setAlert('warning', 'Closing bersifat final dan mengunci transaksi tanggal ini. Tekan Konfirmasi Closing Final untuk melanjutkan.');
        return;
    }

    if (submit) {
        submit.disabled = true;
        submit.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>Memproses...';
    }

    try {
        const data = await requestClosing('/api/sunday-clinic/closing', {
            method: 'POST',
            body: JSON.stringify({
                date: preview.clinic_date || preview.date,
                fingerprint: preview.fingerprint
            })
        });
        setAlert('success', 'Closing Sunday Clinic berhasil disimpan sebagai snapshot final.');
        renderPreview({ ...data, status: 'closed', can_close: false, closed_record: data.closed_record || data.closing || data });
        await loadHistory();
    } catch (error) {
        resetConfirmation();
        if (submit) submit.disabled = !state.preview?.can_close;
        setAlert('danger', error.message || 'Closing gagal diproses.');
        if (['CLOSING_PREVIEW_STALE', 'CLOSING_BLOCKED', 'CLOSING_ALREADY_EXISTS'].includes(error.code)) {
            await loadPreview(byId(DOM_IDS.date)?.value || '');
        }
    }
}

function isModalVisible() {
    return byId(DOM_IDS.modal)?.classList.contains('show');
}

function scheduleLiveRefresh() {
    if (!isModalVisible() || document.visibilityState === 'hidden') return;
    if (state.refreshTimer) window.clearTimeout(state.refreshTimer);
    state.refreshTimer = window.setTimeout(() => {
        state.refreshTimer = null;
        loadPreview(byId(DOM_IDS.date)?.value || '').catch(() => {});
    }, 350);
}

function unbindSocket() {
    if (!state.socket || !state.socketHandlers) return;
    Object.entries(state.socketHandlers).forEach(([eventName, handler]) => state.socket.off(eventName, handler));
    state.socket = null;
    state.socketHandlers = null;
}

function bindSocket() {
    if (!state.authorized || !isModalVisible()) return;
    const socket = window.__realtimeSyncState?.socket || window.socket;
    if (!socket || state.socket === socket) return;
    unbindSocket();
    const events = ['billing_confirmed', 'billing_updated', 'billing_paid', 'payment_received', 'sunday_clinic_closing_updated'];
    state.socketHandlers = {};
    events.forEach(eventName => {
        const handler = scheduleLiveRefresh;
        state.socketHandlers[eventName] = handler;
        socket.on(eventName, handler);
    });
    state.socket = socket;
}

function abortRequests() {
    if (state.previewController) state.previewController.abort();
    if (state.historyController) state.historyController.abort();
    if (state.detailController) state.detailController.abort();
    state.previewController = null;
    state.historyController = null;
    state.detailController = null;
    if (state.refreshTimer) window.clearTimeout(state.refreshTimer);
    state.refreshTimer = null;
}

function deactivate() {
    abortRequests();
    unbindSocket();
    resetConfirmation();
    const modal = byId(DOM_IDS.modal);
    if (modal?.classList.contains('show') && window.jQuery) window.jQuery(modal).modal('hide');
}

function bindDomEvents() {
    const openButton = byId(DOM_IDS.openButton);
    if (openButton && openButton.dataset.closingBound !== '1') {
        openButton.dataset.closingBound = '1';
        openButton.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            const modal = byId(DOM_IDS.modal);
            if (!modal || !window.jQuery) return;
            const queueButton = window.jQuery('#btn-header-queue');
            if (typeof queueButton.dropdown === 'function') {
                queueButton.dropdown('hide');
            } else {
                window.jQuery('#header-queue-dropdown').removeClass('show');
                queueButton.attr('aria-expanded', 'false').parent().removeClass('show');
            }
            window.jQuery(modal).modal('show');
        });
    }

    const refresh = byId(DOM_IDS.refresh);
    if (refresh && refresh.dataset.closingBound !== '1') {
        refresh.dataset.closingBound = '1';
        refresh.addEventListener('click', () => loadPreview(byId(DOM_IDS.date)?.value || ''));
    }

    const date = byId(DOM_IDS.date);
    if (date && date.dataset.closingBound !== '1') {
        date.dataset.closingBound = '1';
        date.addEventListener('change', () => loadPreview(date.value));
    }

    const submit = byId(DOM_IDS.submit);
    if (submit && submit.dataset.closingBound !== '1') {
        submit.dataset.closingBound = '1';
        submit.addEventListener('click', submitClosing);
    }

    const historyButton = byId(DOM_IDS.historyButton);
    if (historyButton && historyButton.dataset.closingBound !== '1') {
        historyButton.dataset.closingBound = '1';
        historyButton.addEventListener('click', loadHistory);
    }

    const history = byId(DOM_IDS.history);
    if (history && history.dataset.closingBound !== '1') {
        history.dataset.closingBound = '1';
        history.addEventListener('click', event => {
            const button = event.target.closest('[data-closing-id]');
            if (button) loadClosedDetail(button.dataset.closingId);
        });
    }

    const modal = byId(DOM_IDS.modal);
    if (modal && modal.dataset.closingBound !== '1' && window.jQuery) {
        modal.dataset.closingBound = '1';
        window.jQuery(modal).on('shown.bs.modal.sundayClosing', () => {
            const dateInput = byId(DOM_IDS.date);
            if (dateInput) dateInput.value = getLatestSundayWib();
            bindSocket();
            loadPreview(dateInput?.value || '');
        });
        window.jQuery(modal).on('hidden.bs.modal.sundayClosing', () => {
            abortRequests();
            unbindSocket();
            resetConfirmation();
        });
    }
}

function handlePageChanged(event) {
    if (event.detail?.page !== 'sunday-clinic') {
        deactivate();
    } else if (isModalVisible()) {
        bindSocket();
    }
}

function handleSocketReady() {
    if (isModalVisible()) bindSocket();
}

function handleVisibilityChange() {
    if (document.visibilityState !== 'hidden' && isModalVisible()) scheduleLiveRefresh();
}

export function initSundayClinicClosing(identity) {
    state.identity = identity || null;
    state.authorized = isDoctor(identity);

    const footer = byId(DOM_IDS.footer);
    if (footer) footer.classList.toggle('d-none', !state.authorized);
    if (!state.authorized) {
        deactivate();
        return false;
    }

    bindDomEvents();
    if (state.initialized) return true;
    state.initialized = true;
    document.addEventListener('page:changed', handlePageChanged);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('realtime:socket-ready', handleSocketReady);
    window.addEventListener('realtime:socket-connected', handleSocketReady);
    return true;
}

export function deactivateSundayClinicClosing() {
    deactivate();
}

export default {
    init: initSundayClinicClosing,
    deactivate: deactivateSundayClinicClosing
};

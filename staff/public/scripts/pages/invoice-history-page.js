import { createPageRequestScope } from '../staff-api.js';
import { escapeHtml, escapeAttribute, sanitizeUrl } from '../safe-render.js';

let invoiceRawData = [];
let invoiceSortCol = '';
let invoiceSortDir = 'asc';
let requestScope = null;

function replaceRequestScope() {
    requestScope?.abort('Request replaced');
    requestScope = createPageRequestScope();
    return requestScope;
}

function isAbortError(error) {
    return error?.name === 'AbortError';
}

function formatDateLocalValue(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function resetSortIndicators() {
    ['date', 'patient', 'total', 'status'].forEach(column => {
        const icon = document.getElementById(`invoice-sort-${column}`);
        const header = document.getElementById(`invoice-th-${column}`);
        if (icon) icon.textContent = '⇅';
        header?.classList.remove('sort-active');
    });
}

export async function showInvoiceHistoryPage() {
    await window.activateRegisteredStaffPage?.('invoice-history');

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    const startInput = document.getElementById('invoice-start-date');
    const endInput = document.getElementById('invoice-end-date');
    if (startInput) startInput.value = formatDateLocalValue(startDate);
    if (endInput) endInput.value = formatDateLocalValue(endDate);
    await loadInvoiceHistory();
}

export async function loadInvoiceHistory() {
    const tbody = document.getElementById('invoice-history-tbody');
    const countBadge = document.getElementById('invoice-count');
    if (!tbody || !countBadge) return;

    tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-4"><i class="fas fa-spinner fa-spin"></i> Memuat data...</td></tr>';

    const params = new URLSearchParams();
    const startDate = document.getElementById('invoice-start-date')?.value || '';
    const endDate = document.getElementById('invoice-end-date')?.value || '';
    const status = document.getElementById('invoice-status-filter')?.value || '';
    const search = document.getElementById('invoice-search')?.value || '';
    if (startDate) params.append('start_date', startDate);
    if (endDate) params.append('end_date', endDate);
    if (status) params.append('status', status);
    if (search) params.append('search', search);

    const scope = replaceRequestScope();
    try {
        const data = await scope.request(`/api/invoices/history?${params.toString()}`);
        invoiceRawData = Array.isArray(data?.invoices) ? data.invoices : [];
        invoiceSortCol = '';
        invoiceSortDir = 'asc';
        window.__invoiceRawData = invoiceRawData;
        window.__invoiceSortCol = invoiceSortCol;
        window.__invoiceSortDir = invoiceSortDir;
        resetSortIndicators();
        countBadge.textContent = `${invoiceRawData.length} invoice`;
        renderInvoiceRows(invoiceRawData);
    } catch (error) {
        if (isAbortError(error)) return;
        console.error('Error loading invoice history:', error);
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-danger py-4"><i class="fas fa-exclamation-triangle"></i> Gagal memuat data</td></tr>';
    }
}

function renderInvoiceRows(invoices) {
    const tbody = document.getElementById('invoice-history-tbody');
    if (!tbody) return;
    if (!Array.isArray(invoices) || invoices.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-4"><i class="fas fa-file-invoice"></i> Tidak ada invoice ditemukan</td></tr>';
        return;
    }

    const statusBadges = {
        paid: '<span class="badge badge-success">Lunas</span>',
        confirmed: '<span class="badge badge-info">Dikonfirmasi</span>',
        draft: '<span class="badge badge-warning">Draft</span>',
        cancelled: '<span class="badge badge-danger">Dibatalkan</span>'
    };
    const locationMap = {
        klinik_private: 'Klinik Privat',
        rsia_melinda: 'RSIA Melinda',
        rsud_gambiran: 'RSUD Gambiran',
        rs_bhayangkara: 'RS Bhayangkara'
    };

    tbody.innerHTML = invoices.map(invoice => {
        const rawDate = invoice.visit_date || invoice.created_at;
        const parsedDate = rawDate ? new Date(rawDate) : null;
        const visitDate = parsedDate && !Number.isNaN(parsedDate.getTime())
            ? parsedDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
            : '-';
        const amount = new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency: 'IDR',
            minimumFractionDigits: 0
        }).format(invoice.total_amount || invoice.total || 0);
        const statusValue = invoice.invoice_status || invoice.status || '';
        const paidBy = invoice.paid_by_display
            || invoice.paid_by
            || (statusValue === 'paid' ? invoice.last_modified_by : '');
        const statusBy = statusValue === 'paid'
            ? (paidBy ? `<small class="text-muted d-block"><i class="fas fa-money-check-alt mr-1"></i>${escapeHtml(paidBy)}</small>` : '')
            : (invoice.confirmed_by ? `<small class="text-muted d-block"><i class="fas fa-user-check mr-1"></i>${escapeHtml(invoice.confirmed_by)}</small>` : '');

        const invoiceUrl = sanitizeUrl(invoice.invoice_signed_url);
        const etiketUrl = sanitizeUrl(invoice.etiket_signed_url);
        const invoiceButton = invoiceUrl
            ? `<a href="${escapeAttribute(invoiceUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn-xs btn-info" title="Lihat Invoice PDF"><i class="fas fa-file-pdf"></i> Invoice</a>`
            : '';
        const etiketButton = etiketUrl
            ? `<a href="${escapeAttribute(etiketUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn-xs btn-secondary ml-1" title="Lihat Etiket PDF"><i class="fas fa-tag"></i> Etiket</a>`
            : '';

        const mrId = String(invoice.mr_id || invoice.invoice_number || '');
        const rawMrUrl = mrId && typeof window.buildSundayClinicAppUrl === 'function'
            ? window.buildSundayClinicAppUrl(mrId, 'billing')
            : '';
        const mrUrl = sanitizeUrl(rawMrUrl);
        const mrLink = mrUrl
            ? `<a href="${escapeAttribute(mrUrl)}" class="invoice-drd-link" title="Buka status tagihan ${escapeAttribute(mrId)}"><code>${escapeHtml(mrId)}</code></a>`
            : `<code>${escapeHtml(mrId || '-')}</code>`;

        return `
            <tr>
                <td>${mrLink}</td>
                <td>${escapeHtml(visitDate)}</td>
                <td>
                    <strong>${escapeHtml(invoice.patient_name || '-')}</strong><br>
                    <small class="text-muted">${escapeHtml(invoice.patient_id || '')}</small>
                </td>
                <td>${escapeHtml(locationMap[invoice.visit_location] || invoice.visit_location || '-')}</td>
                <td class="text-right font-weight-bold">${escapeHtml(amount)}</td>
                <td>${statusBadges[statusValue] || '<span class="badge badge-secondary">-</span>'}${statusBy}</td>
                <td class="text-center">
                    ${invoiceButton}${etiketButton}
                    ${!invoiceButton && !etiketButton ? '<span class="text-muted small">Belum dicetak</span>' : ''}
                </td>
            </tr>`;
    }).join('');
}

export function sortInvoiceTable(column) {
    if (!invoiceRawData.length) return;
    const allowedColumns = new Set(['date', 'patient', 'total', 'status']);
    if (!allowedColumns.has(column)) return;

    invoiceSortDir = invoiceSortCol === column && invoiceSortDir === 'asc' ? 'desc' : 'asc';
    invoiceSortCol = column;
    window.__invoiceSortCol = invoiceSortCol;
    window.__invoiceSortDir = invoiceSortDir;

    ['date', 'patient', 'total', 'status'].forEach(current => {
        const icon = document.getElementById(`invoice-sort-${current}`);
        const header = document.getElementById(`invoice-th-${current}`);
        if (icon) icon.textContent = current === column ? (invoiceSortDir === 'asc' ? '▲' : '▼') : '⇅';
        header?.classList.toggle('sort-active', current === column);
    });

    const sorted = [...invoiceRawData].sort((left, right) => {
        let leftValue;
        let rightValue;
        if (column === 'date') {
            leftValue = new Date(left.visit_date || left.created_at || 0).getTime();
            rightValue = new Date(right.visit_date || right.created_at || 0).getTime();
        } else if (column === 'patient') {
            leftValue = String(left.patient_name || '').toLowerCase();
            rightValue = String(right.patient_name || '').toLowerCase();
        } else if (column === 'total') {
            leftValue = Number(left.total_amount || left.total || 0);
            rightValue = Number(right.total_amount || right.total || 0);
        } else {
            leftValue = left.invoice_status || left.status || '';
            rightValue = right.invoice_status || right.status || '';
        }
        if (leftValue < rightValue) return invoiceSortDir === 'asc' ? -1 : 1;
        if (leftValue > rightValue) return invoiceSortDir === 'asc' ? 1 : -1;
        return 0;
    });

    renderInvoiceRows(sorted);
}

document.addEventListener('click', event => {
    const target = event.target.closest('[data-action]');
    if (!target) return;
    if (target.dataset.action === 'invoice-search') {
        event.preventDefault();
        loadInvoiceHistory();
    }
    if (target.dataset.action === 'invoice-sort') {
        event.preventDefault();
        sortInvoiceTable(target.dataset.sort);
    }
});

document.addEventListener('change', event => {
    if (event.target?.dataset.action === 'invoice-filter') loadInvoiceHistory();
});

document.addEventListener('keydown', event => {
    if (event.target?.id === 'invoice-search' && event.key === 'Enter') {
        event.preventDefault();
        loadInvoiceHistory();
    }
});

document.addEventListener('page:changed', event => {
    if (event.detail?.page !== 'invoice-history') {
        requestScope?.abort();
        requestScope = null;
    }
});

Object.assign(window, {
    showInvoiceHistoryPage,
    loadInvoiceHistory,
    sortInvoiceTable
});

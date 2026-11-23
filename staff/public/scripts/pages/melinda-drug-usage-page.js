/**
 * Staff page "Pengeluaran Obat RS": RSIA Melinda drug usage copied nightly from Medify.
 * The page and the Excel download read the clinic database only.
 * API: /api/melinda-drug-usage (routes/melinda-drug-usage.js).
 */
import { createPageRequestScope } from '../staff-api.js';
import { getIdToken } from '../vps-auth-v2.js';
import { escapeHtml } from '../safe-render.js';

const API = '/api/melinda-drug-usage';
const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const TYPE_LABELS = { obat: 'Obat', alkes: 'Alkes/BHP' };

let requestScope = null;
let loadedFilters = null;

const byId = id => document.getElementById(id);
const isAbort = error => error?.name === 'AbortError';
const number = value => (Number(value) || 0).toLocaleString('id-ID', { maximumFractionDigits: 2 });
const rupiah = value => 'Rp ' + Math.round(Number(value) || 0).toLocaleString('id-ID');

function periodLabel(period) {
    const match = /^(\d{4})-(\d{2})$/.exec(String(period));
    return match ? `${MONTHS[Number(match[2]) - 1]} ${match[1]}` : String(period);
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

function showWarning(message) {
    const box = byId('melinda-usage-warning');
    if (!box) return;
    box.textContent = message || '';
    box.hidden = !message;
}

function setRowMessage(message) {
    const tbody = byId('melinda-usage-tbody');
    if (tbody) tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-3">${escapeHtml(message)}</td></tr>`;
}

function setStats(totals) {
    byId('melinda-usage-count').textContent = number(totals?.item_count);
    byId('melinda-usage-qty').textContent = number(totals?.qty);
    byId('melinda-usage-value').textContent = rupiah(totals?.value_idr);
}

function renderPeriods(periods, selected) {
    const select = byId('melinda-usage-period');
    if (!select) return;
    select.innerHTML = periods.length
        ? periods.map(period => `<option value="${escapeHtml(period)}">${escapeHtml(periodLabel(period))}</option>`).join('')
        : '<option value="">Belum ada data</option>';
    select.value = selected || '';
}

function renderItems(items) {
    const tbody = byId('melinda-usage-tbody');
    if (!tbody) return;
    if (!items.length) {
        setRowMessage('Tidak ada pengeluaran untuk filter ini.');
        return;
    }
    tbody.innerHTML = items.map((item, index) => `<tr>
        <td>${index + 1}</td>
        <td>${escapeHtml(item.item_name)}${item.item_code ? `<span class="melinda-usage-code">${escapeHtml(item.item_code)}</span>` : ''}</td>
        <td>${escapeHtml(TYPE_LABELS[item.item_type] || item.item_type)}</td>
        <td class="melinda-usage-number">${number(item.qty)}</td>
        <td class="melinda-usage-number">${rupiah(item.value_idr)}</td>
    </tr>`).join('');
}

function currentQuery() {
    const params = new URLSearchParams();
    const period = byId('melinda-usage-period')?.value;
    if (period) params.set('period', period);
    params.set('depot', byId('melinda-usage-depot')?.value || 'all');
    params.set('type', byId('melinda-usage-type')?.value || 'all');
    return params;
}

export async function melindaDrugUsageLoad() {
    requestScope?.abort('Request replaced');
    const scope = createPageRequestScope();
    requestScope = scope;
    setRowMessage('Memuat…');
    try {
        const result = await scope.request(`${API}?${currentQuery().toString()}`);
        if (requestScope !== scope) return;
        const data = result?.data || {};
        loadedFilters = data.filters || null;
        renderPeriods(Array.isArray(data.periods) ? data.periods : [], data.filters?.period);
        setStats(data.totals);
        renderItems(Array.isArray(data.items) ? data.items : []);
        showWarning(data.freshness?.warning);
        byId('melinda-usage-freshness').textContent = `Terakhir diperbarui: ${dateTime(data.freshness?.lastSuccess)}.`;
        byId('melinda-usage-export').disabled = !data.filters?.period;
    } catch (error) {
        if (isAbort(error) || requestScope !== scope) return;
        setStats(null);
        setRowMessage('Data gagal dimuat.');
        showWarning(error?.message || 'Gagal memuat data pengeluaran obat.');
    }
}

export async function melindaDrugUsageExport() {
    if (!loadedFilters?.period) return;
    const button = byId('melinda-usage-export');
    button.disabled = true;
    try {
        const params = new URLSearchParams(loadedFilters);
        const token = await getIdToken();
        const response = await fetch(`${API}/export?${params.toString()}`, {
            headers: { Authorization: `Bearer ${token}` },
            cache: 'no-store'
        });
        if (!response.ok) {
            const body = await response.json().catch(() => null);
            throw new Error(body?.message || 'Gagal mengunduh Excel.');
        }
        const url = URL.createObjectURL(await response.blob());
        const link = document.createElement('a');
        link.href = url;
        link.download = `pengeluaran-obat-rs-${loadedFilters.period}-${loadedFilters.depot}-${loadedFilters.type}.xlsx`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (error) {
        showWarning(error?.message || 'Gagal mengunduh Excel.');
    } finally {
        button.disabled = false;
    }
}

export async function showMelindaDrugUsagePage() {
    await window.activateRegisteredStaffPage?.('melinda-drug-usage');
    await melindaDrugUsageLoad();
}

Object.assign(window, {
    showMelindaDrugUsagePage,
    melindaDrugUsageLoad,
    melindaDrugUsageExport
});

import { getIdToken } from './vps-auth-v2.js';

const VPS_API_BASE = ['localhost', '127.0.0.1'].includes(window.location.hostname)
    ? 'http://localhost:3001'
    : window.location.origin.replace(/\/$/, '');

function formatCurrency(amount) {
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0
    }).format(amount || 0);
}

function formatDateLocal(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

async function fetchFinanceStats(token) {
    const today = new Date();
    const todayStr = formatDateLocal(today);

    const response = await fetch(`${VPS_API_BASE}/api/visits?exclude_dummy=true&start_date=${todayStr}&end_date=${todayStr}`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!response.ok) {
        const error = new Error('Failed to load finance stats');
        error.status = response.status;
        throw error;
    }

    const payload = await response.json();
    const visits = Array.isArray(payload.data) ? payload.data : [];

    let totalVisits = 0;
    let totalRevenue = 0;

    visits.forEach(visit => {
        totalVisits += 1;
        const total = Number(visit.grand_total ?? visit.grandTotal ?? visit.total_amount ?? 0);
        if (Number.isFinite(total)) {
            totalRevenue += total;
        }
    });

    const averageBill = totalVisits > 0 ? Math.round(totalRevenue / totalVisits) : 0;

    return {
        totalVisits,
        totalRevenue,
        averageBill
    };
}

function setFinancePlaceholders() {
    const visitsEl = document.getElementById('kpi-total-visits');
    const revenueEl = document.getElementById('kpi-revenue');
    const avgBillEl = document.getElementById('kpi-avg-bill');

    if (visitsEl) visitsEl.textContent = '...';
    if (revenueEl) revenueEl.textContent = '...';
    if (avgBillEl) avgBillEl.textContent = '...';
}

function setFinanceFallback(status) {
    const visitsEl = document.getElementById('kpi-total-visits');
    const revenueEl = document.getElementById('kpi-revenue');
    const avgBillEl = document.getElementById('kpi-avg-bill');

    const blocked = status === 403;

    if (visitsEl) visitsEl.textContent = blocked ? '—' : '0';
    if (revenueEl) revenueEl.textContent = blocked ? '—' : formatCurrency(0);
    if (avgBillEl) avgBillEl.textContent = blocked ? '—' : formatCurrency(0);
}

export async function initFinanceDashboard() {
    const visitsEl = document.getElementById('kpi-total-visits');
    const revenueEl = document.getElementById('kpi-revenue');
    const avgBillEl = document.getElementById('kpi-avg-bill');

    if (!visitsEl && !revenueEl && !avgBillEl) {
        return;
    }

    setFinancePlaceholders();

    try {
        const token = await getIdToken();
        if (!token) {
            setFinanceFallback();
            return;
        }

        const { totalVisits, totalRevenue, averageBill } = await fetchFinanceStats(token);

        if (visitsEl) visitsEl.textContent = totalVisits.toLocaleString('id-ID');
        if (revenueEl) revenueEl.textContent = formatCurrency(totalRevenue);
        if (avgBillEl) avgBillEl.textContent = formatCurrency(averageBill);
    } catch (error) {
        console.warn('initFinanceDashboard failed:', error);
        setFinanceFallback(error.status);
    }
}

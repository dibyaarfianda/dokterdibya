// Uses VPS API for data loading

import { getIdToken } from './vps-auth-v2.js';

// VPS API Configuration
const VPS_API_BASE = ['localhost', '127.0.0.1'].includes(window.location.hostname)
    ? 'http://localhost:3001'
    : window.location.origin.replace(/\/$/, '');

function formatDateLocal(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getNextSundayDate(referenceDate = new Date()) {
    const base = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
    const day = base.getDay();
    const daysUntilSunday = day === 0 ? 7 : 7 - day;
    base.setDate(base.getDate() + daysUntilSunday);
    return base;
}

function getPreviousMonthRange(referenceDate = new Date()) {
    const start = new Date(referenceDate.getFullYear(), referenceDate.getMonth() - 1, 1);
    const end = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 0);
    return { start, end };
}

function renderVisitsChart(dailyData) {
    const container = document.getElementById('visits-30-days-chart');
    if (!container) return;

    if (!dailyData || dailyData.length === 0) {
        container.innerHTML = '<p class="text-muted mb-0">Tidak ada data kunjungan.</p>';
        return;
    }

    const maxCount = Math.max(...dailyData.map(day => day.count), 1);

    const bars = dailyData.map(day => {
        const percentage = maxCount === 0 ? 0 : (day.count / maxCount) * 100;
        const height = day.count === 0 ? 4 : Math.max(percentage, 6);
        return `
            <div class="d-flex flex-column align-items-center" style="min-width: 28px; gap: 6px;">
                <div style="font-size: 11px; font-weight: 600;">${day.count}</div>
                <div class="w-100" style="height: ${height}%; min-height: ${day.count === 0 ? 4 : 12}px; background: linear-gradient(180deg, #4f46ef, #6366f1); border-radius: 6px 6px 0 0;" title="${day.label}: ${day.count} kunjungan"></div>
                <div style="font-size: 10px; color: #6b7280;">${day.label}</div>
            </div>
        `;
    }).join('');

    container.innerHTML = `
        <div style="display: flex; align-items: flex-end; height: 200px; gap: 8px; overflow-x: auto; padding-bottom: 8px;">
            ${bars}
        </div>
        <div class="text-muted" style="font-size: 11px; text-align: right;">* Menampilkan 30 hari terakhir</div>
    `;
}

async function fetchVisitStats(token) {
    const today = new Date();
    const { start: prevMonthStart, end: prevMonthEnd } = getPreviousMonthRange(today);
    const thirtyDayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29);
    const queryStart = prevMonthStart < thirtyDayStart ? prevMonthStart : thirtyDayStart;

    const params = new URLSearchParams({
        exclude_dummy: 'true',
        start_date: formatDateLocal(queryStart),
        end_date: formatDateLocal(today)
    });

    const response = await fetch(`${VPS_API_BASE}/api/visits?${params.toString()}`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!response.ok) {
        const error = new Error('Failed to fetch visit stats');
        error.status = response.status;
        throw error;
    }

    const payload = await response.json();
    const visits = Array.isArray(payload.data) ? payload.data : [];

    const todayKey = formatDateLocal(today);
    const thirtyDayStartKey = formatDateLocal(thirtyDayStart);
    const prevMonthStartKey = formatDateLocal(prevMonthStart);
    const prevMonthEndKey = formatDateLocal(prevMonthEnd);

    const counts = new Map();
    let lastMonthCount = 0;

    visits.forEach(visit => {
        const rawDate = visit.visit_date || visit.visitDate || visit.created_at || visit.createdAt;
        if (!rawDate) return;
        const key = rawDate.substring(0, 10);
        if (key >= thirtyDayStartKey && key <= todayKey) {
            counts.set(key, (counts.get(key) || 0) + 1);
        }
        if (key >= prevMonthStartKey && key <= prevMonthEndKey) {
            lastMonthCount += 1;
        }
    });

    const daily = [];
    const cursor = new Date(thirtyDayStart);
    for (let i = 0; i < 30; i++) {
        const key = formatDateLocal(cursor);
        daily.push({
            date: key,
            label: cursor.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }),
            count: counts.get(key) || 0
        });
        cursor.setDate(cursor.getDate() + 1);
    }

    const totalLast30Days = daily.reduce((sum, item) => sum + item.count, 0);

    return { lastMonthCount, totalLast30Days, daily };
}

async function loadVisitSection() {
    const visitsLastMonthEl = document.getElementById('stat-visits-last-month');
    const visits30DaysEl = document.getElementById('stat-visits-30days-total');
    const chartContainer = document.getElementById('visits-30-days-chart');
    if (!visitsLastMonthEl || !chartContainer) return;

    try {
        const token = await getIdToken();
        if (!token) {
            visitsLastMonthEl.textContent = '0';
            if (visits30DaysEl) visits30DaysEl.textContent = '0';
            chartContainer.innerHTML = '<p class="text-muted mb-0">Tidak terautentikasi.</p>';
            return;
        }

        const stats = await fetchVisitStats(token);
        visitsLastMonthEl.textContent = stats.lastMonthCount.toLocaleString('id-ID');
        if (visits30DaysEl) visits30DaysEl.textContent = stats.totalLast30Days.toLocaleString('id-ID');
        renderVisitsChart(stats.daily);
    } catch (error) {
        console.warn('loadVisitSection failed:', error);
        visitsLastMonthEl.textContent = '0';
        if (visits30DaysEl) visits30DaysEl.textContent = '0';

        if (chartContainer) {
            if (error.status === 403) {
                chartContainer.innerHTML = '<p class="text-muted mb-0">Akses kunjungan dibatasi.</p>';
            } else {
                chartContainer.innerHTML = '<p class="text-danger mb-0">Gagal memuat data kunjungan.</p>';
            }
        }
    }
}

async function loadAppointmentsOverview() {
    const container = document.getElementById('dashboard-today-appointments');
    const totalBookingsEl = document.getElementById('stat-total-bookings');
    const todayAppointmentsEl = document.getElementById('stat-appointments-today');

    if (!container || !totalBookingsEl || !todayAppointmentsEl) return;

    const targetDate = getNextSundayDate(new Date());
    const targetLabel = targetDate.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' });
    const targetKey = formatDateLocal(targetDate);

    container.innerHTML = `<p class="text-muted mb-0">Memuat appointment untuk ${targetLabel}...</p>`;

    try {
        const token = await getIdToken();
        if (!token) {
            container.innerHTML = '<p class="text-muted mb-0">Tidak terautentikasi.</p>';
            totalBookingsEl.textContent = '0';
            todayAppointmentsEl.textContent = '0';
            return;
        }

        const response = await fetch(`${VPS_API_BASE}/api/appointments`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
            if (response.status === 403) {
                container.innerHTML = '<p class="text-muted mb-0">Akses appointment dibatasi.</p>';
            } else {
                container.innerHTML = '<p class="text-danger mb-0">Gagal memuat data appointment.</p>';
            }
            totalBookingsEl.textContent = '0';
            todayAppointmentsEl.textContent = '0';
            return;
        }

        const result = await response.json();
        const appointments = Array.isArray(result.data) ? result.data : [];

        const activeStatuses = new Set(['scheduled', 'confirmed']);

        const activeBookings = appointments.filter(apt => (apt.status || '').toLowerCase() !== 'cancelled');
        const targetAppointments = appointments.filter(apt => {
            const status = (apt.status || '').toLowerCase();
            return activeStatuses.has(status) && apt.appointment_date === targetKey;
        });

        totalBookingsEl.textContent = activeBookings.length.toLocaleString('id-ID');
        todayAppointmentsEl.textContent = targetAppointments.length.toLocaleString('id-ID');

        if (targetAppointments.length === 0) {
            container.innerHTML = `<p class="text-muted mb-0">Tidak ada appointment untuk ${targetLabel}.</p>`;
            return;
        }

        targetAppointments.sort((a, b) => (a.appointment_time || '').localeCompare(b.appointment_time || ''));

        container.innerHTML = `
            <div class="small text-muted mb-2">Jadwal untuk ${targetLabel}</div>
            <ul class="list-unstyled mb-0 small">
                ${targetAppointments.slice(0, 5).map(apt => {
                    const time = (apt.appointment_time || '').substring(0, 5) || '--:--';
                    const type = apt.appointment_type || 'Tidak diketahui';
                    const name = apt.patient_name || 'Pasien';
                    return `<li class="d-flex justify-content-between mb-2">
                        <span><strong>${name}</strong><br>
                        <small class="text-muted">${type}</small></span>
                        <span class="badge badge-primary">${time}</span>
                    </li>`;
                }).join('')}
            </ul>
        `;
    } catch (error) {
        console.warn('loadAppointmentsOverview failed:', error);
        container.innerHTML = '<p class="text-danger mb-0">Gagal memuat data appointment.</p>';
        totalBookingsEl.textContent = '0';
        todayAppointmentsEl.textContent = '0';
    }
}

async function loadRecentActivity() {
    const container = document.getElementById('dashboard-recent-activity');
    if (!container) return;
    container.innerHTML = '<p class="text-muted mb-0">Memuat aktivitas...</p>';

    try {
        const token = await getIdToken();
        if (!token) {
            container.innerHTML = '<p class="text-muted mb-0">Tidak terautentikasi.</p>';
            return;
        }
        
        const response = await fetch(`${VPS_API_BASE}/api/logs?limit=10`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) {
            if (response.status === 403) {
                container.innerHTML = '<p class="text-muted mb-0">Akses log aktivitas dibatasi.</p>';
            } else {
                container.innerHTML = '<p class="text-danger mb-0">Gagal memuat aktivitas.</p>';
            }
            return;
        }

        const result = await response.json();
        if (result.success && result.data && result.data.length > 0) {
            container.innerHTML = `
                <ul class="list-unstyled mb-0 small">
                    ${result.data.map(log => {
                        const time = new Date(log.timestamp);
                        return `<li class="d-flex justify-content-between">
                            <span>${log.user_name}: ${log.action}</span>
                            <span class="text-muted">${time.toLocaleTimeString('id-ID', {hour:'2-digit',minute:'2-digit'})}</span>
                        </li>`;
                    }).join('')}
                </ul>
            `;
            return;
        }
    } catch (e) {
        console.warn('loadRecentActivity failed:', e);
        container.innerHTML = '<p class="text-danger mb-0">Gagal memuat aktivitas.</p>';
        return;
    }

    container.innerHTML = '<p class="text-muted mb-0">Belum ada aktivitas.</p>';
}

export async function initDashboard() {
    const visitsLastMonthEl = document.getElementById('stat-visits-last-month');
    const totalBookingsEl = document.getElementById('stat-total-bookings');
    const todayAppointmentsEl = document.getElementById('stat-appointments-today');
    const onlineUsersEl = document.getElementById('stat-online-users');
    const visits30DaysEl = document.getElementById('stat-visits-30days-total');
    const chartContainer = document.getElementById('visits-30-days-chart');

    if (visitsLastMonthEl) visitsLastMonthEl.textContent = '...';
    if (totalBookingsEl) totalBookingsEl.textContent = '...';
    if (todayAppointmentsEl) todayAppointmentsEl.textContent = '...';
    if (visits30DaysEl) visits30DaysEl.textContent = '...';
    if (chartContainer) chartContainer.innerHTML = '<p class="text-muted mb-0">Memuat data kunjungan...</p>';

    const sidebarOnlineCount = document.getElementById('online-count');
    if (onlineUsersEl) {
        const initialCount = parseInt(sidebarOnlineCount?.textContent || '0', 10);
        onlineUsersEl.textContent = Number.isFinite(initialCount) ? initialCount.toLocaleString('id-ID') : '0';
    }

    window.updateOnlineUsersStat = updateOnlineUsersStat;

    await Promise.all([
        loadVisitSection(),
        loadAppointmentsOverview(),
        loadRecentActivity()
    ]);

    if (sidebarOnlineCount) {
        const latestCount = parseInt(sidebarOnlineCount.textContent || '0', 10);
        updateOnlineUsersStat(Number.isFinite(latestCount) ? latestCount : 0);
    }

    if (window.socketIoInstance && !window.__dashboardActivityListenerAttached) {
        setupActivityLogUpdates();
        window.__dashboardActivityListenerAttached = true;
    }
}

function updateOnlineUsersStat(count) {
    const onlineUsersEl = document.getElementById('stat-online-users');
    if (!onlineUsersEl) return;

    const numericCount = Number(count);
    const safeCount = Number.isFinite(numericCount) ? numericCount : 0;
    onlineUsersEl.textContent = safeCount.toLocaleString('id-ID');
}

// Setup real-time updates for activity logs
function setupActivityLogUpdates() {
    const container = document.getElementById('dashboard-recent-activity');
    if (!container) return;
    if (!window.socketIoInstance) return;
    
    // Listen for new log entries
    window.socketIoInstance.on('newLog', (log) => {
        console.log('New activity log received:', log);
        // Reload activity logs to show latest
        loadRecentActivity();
    });
}



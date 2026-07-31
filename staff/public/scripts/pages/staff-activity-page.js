import { createPageRequestScope } from '../staff-api.js';
import { escapeHtml } from '../safe-render.js';

let activityScope = null;
let filterScope = null;

function replaceScope(current, reason) {
    current?.abort(reason);
    return createPageRequestScope();
}

function isCurrent(scope, current) {
    return scope === current && !scope.signal.aborted;
}

function renderTopUsers(users) {
    const container = document.getElementById('staff-activity-top-users');
    if (!container) return;
    if (!Array.isArray(users) || users.length === 0) {
        container.innerHTML = '<span class="text-muted">Belum ada aktivitas</span>';
        return;
    }
    container.innerHTML = users.slice(0, 5).map(user => (
        `<span class="badge badge-secondary mr-1">${escapeHtml(user.user_name || '-')}`
        + ` (${escapeHtml(user.action_count || 0)})</span>`
    )).join('');
}

function renderActivityRows(logs) {
    const tbody = document.getElementById('staff-activity-body');
    const info = document.getElementById('staff-activity-pagination-info');
    if (!tbody) return;

    if (!Array.isArray(logs) || logs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted py-4"><i class="fas fa-inbox fa-2x mb-2"></i><p>Belum ada aktivitas tercatat</p></td></tr>';
        if (info) info.textContent = 'Menampilkan 0 aktivitas';
        return;
    }

    tbody.innerHTML = logs.map(log => {
        const date = new Date(log.timestamp);
        const timestamp = Number.isNaN(date.getTime()) ? '-' : date.toLocaleString('id-ID', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
        return `
            <tr>
                <td><small>${escapeHtml(timestamp)}</small></td>
                <td><span class="badge badge-info">${escapeHtml(log.user_name || '-')}</span></td>
                <td><span class="badge badge-light">${escapeHtml(log.action || '-')}</span></td>
                <td><small class="text-muted">${escapeHtml(log.details || '-')}</small></td>
            </tr>
        `;
    }).join('');
    if (info) info.textContent = `Menampilkan ${logs.length} aktivitas`;
}

function getActivityQuery() {
    const params = new URLSearchParams();
    const filters = [
        ['user_id', 'staff-activity-user-filter'],
        ['action', 'staff-activity-action-filter'],
        ['start_date', 'staff-activity-start-date'],
        ['end_date', 'staff-activity-end-date']
    ];
    filters.forEach(([key, id]) => {
        const value = document.getElementById(id)?.value || '';
        if (value) params.set(key, value);
    });
    params.set('limit', '100');
    return params.toString();
}

export async function loadStaffActivityLogs() {
    const tbody = document.getElementById('staff-activity-body');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="4" class="text-center py-4"><i class="fas fa-spinner fa-spin"></i> Memuat...</td></tr>';

    const scope = replaceScope(activityScope, 'Activity request replaced');
    activityScope = scope;
    try {
        const summary = await scope.request('/api/logs/summary?days=7');
        if (!isCurrent(scope, activityScope)) return;
        if (summary?.success) {
            const total = document.getElementById('staff-activity-total');
            const users = document.getElementById('staff-activity-users');
            if (total) total.textContent = String(summary.data?.total_activities || 0);
            if (users) users.textContent = String(summary.data?.unique_users || 0);
            renderTopUsers(summary.data?.most_active_users);
        }

        const logs = await scope.request(`/api/logs?${getActivityQuery()}`);
        if (!isCurrent(scope, activityScope)) return;
        renderActivityRows(logs?.success ? logs.data : []);
    } catch (error) {
        if (error?.name === 'AbortError' || !isCurrent(scope, activityScope)) return;
        console.error('Error loading staff activity:', error);
        tbody.innerHTML = '<tr><td colspan="4" class="text-center text-danger py-4"><i class="fas fa-exclamation-triangle fa-2x mb-2"></i><p>Gagal memuat data</p></td></tr>';
    } finally {
        if (activityScope === scope) activityScope = null;
    }
}

export async function loadStaffActivityFilters() {
    const scope = replaceScope(filterScope, 'Filter request replaced');
    filterScope = scope;
    try {
        const [actions, summary] = await Promise.all([
            scope.request('/api/logs/actions'),
            scope.request('/api/logs/summary?days=30')
        ]);
        if (!isCurrent(scope, filterScope)) return;

        const actionSelect = document.getElementById('staff-activity-action-filter');
        if (actionSelect && actions?.success) {
            const actionItems = Array.isArray(actions.data) ? actions.data : [];
            actionSelect.innerHTML = '<option value="">Semua Aksi</option>'
                + actionItems.map(action => `<option value="${escapeHtml(action)}">${escapeHtml(action)}</option>`).join('');
        }

        const userSelect = document.getElementById('staff-activity-user-filter');
        if (userSelect && summary?.success) {
            const users = Array.isArray(summary.data?.most_active_users)
                ? summary.data.most_active_users
                : [];
            userSelect.innerHTML = '<option value="">Semua Staff</option>'
                + users.map(user => (
                    `<option value="${escapeHtml(user.user_id)}">${escapeHtml(user.user_name || '-')}</option>`
                )).join('');
        }
    } catch (error) {
        if (error?.name !== 'AbortError' && isCurrent(scope, filterScope)) {
            console.error('Error loading staff activity filters:', error);
        }
    } finally {
        if (filterScope === scope) filterScope = null;
    }
}

export async function showStaffActivityPage() {
    await window.activateRegisteredStaffPage?.('staff-activity');
    await Promise.all([
        loadStaffActivityLogs(),
        loadStaffActivityFilters()
    ]);
}

document.addEventListener('click', event => {
    const target = event.target.closest('[data-action="refresh-staff-activity"]');
    if (!target || !target.closest('#staff-activity-page')) return;
    event.preventDefault();
    void loadStaffActivityLogs();
});

document.addEventListener('page:changed', event => {
    if (event.detail?.page !== 'staff-activity') {
        activityScope?.abort('Page deactivated');
        filterScope?.abort('Page deactivated');
        activityScope = null;
        filterScope = null;
    }
});

Object.assign(window, {
    showStaffActivityPage,
    loadStaffActivityLogs,
    loadStaffActivityFilters
});

import { createPageRequestScope } from '../staff-api.js';
import { escapeHtml } from '../safe-render.js';

let currentPage = 1;
let totalPages = 1;
let requestScope = null;

function replaceRequestScope() {
    requestScope?.abort('Request replaced');
    requestScope = createPageRequestScope();
    return requestScope;
}

function isCurrentScope(scope) {
    return requestScope === scope && !scope.signal.aborted;
}

function releaseRequestScope(scope) {
    if (requestScope === scope) requestScope = null;
}

function syncCompatibilityState() {
    window.dashboardNewPatientsPage = currentPage;
}

function setPaginationState(pagination, itemCount) {
    totalPages = Math.max(1, Number(pagination?.totalPages) || 1);
    const total = Math.max(0, Number(pagination?.total) || 0);
    const start = itemCount > 0 ? ((currentPage - 1) * 10) + 1 : 0;
    const end = itemCount > 0 ? start + itemCount - 1 : 0;

    const info = document.getElementById('dashboard-new-patients-info');
    const previous = document.getElementById('dashboard-new-patients-prev');
    const next = document.getElementById('dashboard-new-patients-next');
    if (info) info.textContent = `Menampilkan ${start}-${end} dari ${total}`;
    if (previous) previous.disabled = currentPage <= 1;
    if (next) next.disabled = currentPage >= totalPages;
    syncCompatibilityState();
}

function renderRows(patients) {
    const tbody = document.getElementById('dashboard-new-patients-tbody');
    if (!tbody) return;
    if (!patients.length) {
        tbody.innerHTML = '<tr><td colspan="3" class="text-center text-muted">Belum ada pasien terdaftar</td></tr>';
        return;
    }

    tbody.innerHTML = patients.map(patient => {
        const registrationTime = patient.created_at
            ? new Date(patient.created_at).toLocaleString('id-ID', {
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit'
            })
            : '-';
        return `
            <tr>
                <td>${escapeHtml(patient.full_name || '-')}</td>
                <td><small class="text-muted">${escapeHtml(registrationTime)}</small></td>
                <td>
                    <button type="button" class="btn btn-xs btn-info" data-action="view-dashboard-patient" data-patient-id="${escapeHtml(patient.id)}" title="Lihat Detail">
                        <i class="fas fa-eye"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

export async function loadDashboardNewPatients(page = 1) {
    const tbody = document.getElementById('dashboard-new-patients-tbody');
    if (!tbody) return;

    currentPage = Math.max(1, Number.parseInt(page, 10) || 1);
    syncCompatibilityState();
    tbody.innerHTML = '<tr><td colspan="3" class="text-center"><i class="fas fa-spinner fa-spin"></i> Memuat...</td></tr>';

    const scope = replaceRequestScope();
    try {
        const result = await scope.request(
            `/api/patients?view=basic&last_visit_location=no_visit&sort=recent&limit=10&page=${currentPage}&fresh=1`
        );
        if (!isCurrentScope(scope)) return;

        const patients = Array.isArray(result?.data) ? result.data : [];
        setPaginationState(result?.pagination, patients.length);
        renderRows(patients);
    } catch (error) {
        if (error?.name === 'AbortError' || !isCurrentScope(scope)) return;
        console.error('Load dashboard new patients error:', error);
        tbody.innerHTML = '<tr><td colspan="3" class="text-center text-danger">Gagal memuat data</td></tr>';
    } finally {
        releaseRequestScope(scope);
    }
}

document.addEventListener('click', event => {
    const target = event.target.closest('[data-action]');
    if (!target) return;

    if (target.dataset.action === 'dashboard-new-patients-prev') {
        event.preventDefault();
        void loadDashboardNewPatients(currentPage - 1);
    } else if (target.dataset.action === 'dashboard-new-patients-next') {
        event.preventDefault();
        void loadDashboardNewPatients(currentPage + 1);
    } else if (target.dataset.action === 'view-dashboard-patient') {
        event.preventDefault();
        window.viewPatientDetail?.(target.dataset.patientId || '');
    }
});

document.addEventListener('page:changed', event => {
    if (event.detail?.page !== 'dashboard') {
        requestScope?.abort('Page deactivated');
        requestScope = null;
    }
});

Object.assign(window, {
    loadDashboardNewPatients
});
syncCompatibilityState();

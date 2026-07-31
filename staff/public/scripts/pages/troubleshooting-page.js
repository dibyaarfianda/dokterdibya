import { createPageRequestScope } from '../staff-api.js';
import { escapeHtml } from '../safe-render.js';

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

function isAbortError(error) {
    return error?.name === 'AbortError';
}

function setTroubleshootingStatus(message, type = 'info') {
    const status = document.getElementById('troubleshooting-status');
    if (!status) return;
    status.className = `alert alert-${type} py-2 small mb-3`;
    status.textContent = message;
}

function formatTroubleshootingDate(value) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString('id-ID', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function renderTroubleshootingReports(reports) {
    const tbody = document.getElementById('troubleshooting-reports-body');
    if (!tbody) return;

    if (!Array.isArray(reports) || reports.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="text-center text-muted py-4"><i class="far fa-check-circle mr-1"></i> Belum ada laporan bug/error pasien.</td></tr>';
        return;
    }

    tbody.innerHTML = reports.map(report => {
        const patientName = report.is_anonymous
            ? 'Anonim'
            : (report.patient_real_name || report.patient_name || 'Pasien');
        const patientNickname = report.is_anonymous
            ? '-'
            : (report.patient_nickname || report.user_display_name || '-');
        const message = escapeHtml(report.message || '-').replace(/\r?\n/g, '<br>');
        return `
            <tr>
                <td><small>${escapeHtml(formatTroubleshootingDate(report.created_at))}</small></td>
                <td>
                    <div class="font-weight-bold">${escapeHtml(patientName)}</div>
                    <small class="text-muted">ID: ${escapeHtml(patientNickname)}</small>
                </td>
                <td class="troubleshooting-message-cell">${message}</td>
            </tr>
        `;
    }).join('');
}

function resolveTroubleshootingError(error) {
    if (error?.status === 401) {
        return 'Sesi login tidak ditemukan. Silakan login ulang.';
    }
    if (error?.status === 403) {
        return 'Akses laporan troubleshooting hanya tersedia untuk superadmin.';
    }
    return error?.message || String(error || 'Gagal memuat laporan troubleshooting');
}

export async function loadTroubleshootingReports() {
    const tbody = document.getElementById('troubleshooting-reports-body');
    const totalEl = document.getElementById('troubleshooting-total-count');
    const loadedEl = document.getElementById('troubleshooting-last-loaded');
    if (tbody) {
        tbody.innerHTML = '<tr><td colspan="3" class="text-center text-muted py-4"><i class="fas fa-spinner fa-spin mr-1"></i> Memuat laporan...</td></tr>';
    }
    setTroubleshootingStatus('Memuat laporan bug/error pasien...', 'info');

    const scope = replaceRequestScope();
    try {
        const result = await scope.request(`/api/patient-feedback?category=bug&limit=50&offset=0&_=${Date.now()}`);
        if (!isCurrentScope(scope)) return;
        if (!result?.success) {
            throw new Error(result?.message || 'Gagal memuat laporan troubleshooting');
        }

        const reports = Array.isArray(result.data) ? result.data : [];
        renderTroubleshootingReports(reports);
        if (totalEl) totalEl.textContent = String(result.total ?? reports.length);
        if (loadedEl) loadedEl.textContent = new Date().toLocaleString('id-ID');
        setTroubleshootingStatus(
            reports.length ? 'Menampilkan laporan bug/error pasien terbaru.' : 'Belum ada laporan bug/error pasien.',
            reports.length ? 'success' : 'secondary'
        );
    } catch (error) {
        if (isAbortError(error) || !isCurrentScope(scope)) return;
        console.error('[Troubleshooting] load reports error:', error);
        const message = resolveTroubleshootingError(error);
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="3" class="text-center text-danger py-4">${escapeHtml(message)}</td></tr>`;
        }
        if (totalEl) totalEl.textContent = '-';
        setTroubleshootingStatus(message, 'danger');
    } finally {
        releaseRequestScope(scope);
    }
}

export async function showTroubleshootingPage() {
    await window.activateRegisteredStaffPage?.('troubleshooting');
    await loadTroubleshootingReports();
}

document.addEventListener('click', event => {
    const target = event.target.closest('[data-action="refresh-troubleshooting"]');
    if (!target || !target.closest('#troubleshooting-page')) return;
    event.preventDefault();
    void loadTroubleshootingReports();
});

document.addEventListener('page:changed', event => {
    if (event.detail?.page !== 'troubleshooting') {
        requestScope?.abort('Page deactivated');
        requestScope = null;
    }
});

Object.assign(window, {
    showTroubleshootingPage,
    loadTroubleshootingReports
});

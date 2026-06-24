const API_ENDPOINT = '/api/patient-access-blocklist';

let blocklistEntries = [];
let isInitialized = false;

function getToken() {
    if (typeof window !== 'undefined' && typeof window.getAuthToken === 'function') {
        return window.getAuthToken();
    }
    return '';
}

async function apiRequest(path = '', options = {}) {
    const response = await fetch(`${API_ENDPOINT}${path}`, {
        ...options,
        headers: {
            'Authorization': `Bearer ${getToken() || ''}`,
            'Content-Type': 'application/json',
            ...(options.headers || {})
        }
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(data.message || 'Request gagal');
    }

    return data;
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function formatDate(value) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString('id-ID', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Asia/Jakarta'
    });
}

function showToast(type, message) {
    if (window.toastr && typeof window.toastr[type] === 'function') {
        window.toastr[type](message);
        return;
    }
    alert(message);
}

function updateStats() {
    const activeEntries = blocklistEntries.filter(entry => Number(entry.is_active) === 1);
    const activeNames = activeEntries.filter(entry => entry.block_type === 'name').length;
    const activeIps = activeEntries.filter(entry => entry.block_type === 'ip').length;

    const activeEl = document.getElementById('blocklist-stat-active');
    const namesEl = document.getElementById('blocklist-stat-names');
    const ipsEl = document.getElementById('blocklist-stat-ips');

    if (activeEl) activeEl.textContent = activeEntries.length;
    if (namesEl) namesEl.textContent = activeNames;
    if (ipsEl) ipsEl.textContent = activeIps;
}

function renderBlocklistTable() {
    const tbody = document.getElementById('patient-blocklist-tbody');
    if (!tbody) return;

    if (!blocklistEntries.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="text-center text-muted py-4">
                    <i class="fas fa-inbox fa-2x mb-2"></i>
                    <p class="mb-0">Belum ada data</p>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = blocklistEntries.map(entry => {
        const isActive = Number(entry.is_active) === 1;
        const typeLabel = entry.block_type === 'ip' ? 'IP' : 'Nama';
        const typeBadge = entry.block_type === 'ip' ? 'badge-warning' : 'badge-info';
        const statusBadge = isActive
            ? '<span class="badge badge-danger">Aktif</span>'
            : '<span class="badge badge-secondary">Nonaktif</span>';
        const actionButton = isActive
            ? `<button class="btn btn-outline-danger btn-sm" onclick="deactivatePatientBlock(${entry.id})" title="Nonaktifkan"><i class="fas fa-times"></i></button>`
            : '<span class="text-muted">-</span>';

        return `
            <tr>
                <td><span class="badge ${typeBadge}">${typeLabel}</span></td>
                <td><strong>${escapeHtml(entry.value)}</strong><br><small class="text-muted">${escapeHtml(entry.normalized_value)}</small></td>
                <td>${escapeHtml(entry.reason || '-')}</td>
                <td>${statusBadge}</td>
                <td><small>${formatDate(entry.updated_at || entry.created_at)}</small></td>
                <td class="text-center">${actionButton}</td>
            </tr>
        `;
    }).join('');
}

async function loadPatientBlockList() {
    const tbody = document.getElementById('patient-blocklist-tbody');
    if (tbody) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center py-4"><i class="fas fa-spinner fa-spin"></i> Memuat...</td></tr>';
    }

    try {
        const response = await apiRequest();
        blocklistEntries = response.data || [];
        updateStats();
        renderBlocklistTable();
    } catch (error) {
        console.error('[PatientBlockList] load failed:', error);
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="6" class="text-center text-danger py-4"><i class="fas fa-exclamation-triangle"></i> ${escapeHtml(error.message)}</td></tr>`;
        }
    }
}

async function savePatientBlock(event) {
    event.preventDefault();

    const typeEl = document.getElementById('patient-blocklist-type');
    const valueEl = document.getElementById('patient-blocklist-value');
    const reasonEl = document.getElementById('patient-blocklist-reason');

    const payload = {
        block_type: typeEl?.value || 'name',
        value: valueEl?.value?.trim() || '',
        reason: reasonEl?.value?.trim() || ''
    };

    if (!payload.value) {
        showToast('warning', 'Data blocklist wajib diisi');
        return;
    }

    try {
        await apiRequest('', {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        valueEl.value = '';
        if (reasonEl) reasonEl.value = '';
        showToast('success', 'Blocklist tersimpan');
        await loadPatientBlockList();
    } catch (error) {
        console.error('[PatientBlockList] save failed:', error);
        showToast('error', error.message);
    }
}

async function deactivatePatientBlock(id) {
    const confirmed = window.Swal
        ? await window.Swal.fire({
            title: 'Nonaktifkan block?',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Nonaktifkan',
            cancelButtonText: 'Batal'
        }).then(result => result.isConfirmed)
        : confirm('Nonaktifkan block ini?');

    if (!confirmed) return;

    try {
        await apiRequest(`/${id}`, { method: 'DELETE' });
        showToast('success', 'Blocklist dinonaktifkan');
        await loadPatientBlockList();
    } catch (error) {
        console.error('[PatientBlockList] deactivate failed:', error);
        showToast('error', error.message);
    }
}

function initPatientBlockList() {
    const form = document.getElementById('patient-blocklist-form');
    if (form && !isInitialized) {
        form.addEventListener('submit', savePatientBlock);
        isInitialized = true;
    }

    loadPatientBlockList();
}

window.initPatientBlockList = initPatientBlockList;
window.loadPatientBlockList = loadPatientBlockList;
window.deactivatePatientBlock = deactivatePatientBlock;

export { initPatientBlockList, loadPatientBlockList, deactivatePatientBlock };

import { getIdToken, auth, onAuthStateChanged, signOut, initAuth } from './vps-auth-v2.js';

const API_BASE = (() => {
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        return 'http://localhost:3001';
    }
    return window.location.origin.replace(/\/$/, '');
})();

const STATUS_LABELS = {
    patient_reported: 'Patient Reported',
    in_progress: 'In Progress',
    needs_follow_up: 'Needs Follow Up',
    verified: 'Verified',
    rejected: 'Rejected',
};

const STATUS_BADGE = {
    patient_reported: 'badge-secondary',
    in_progress: 'badge-info',
    needs_follow_up: 'badge-warning',
    verified: 'badge-success',
    rejected: 'badge-danger',
};

const tableBody = document.querySelector('#intake-table tbody');
const statusFilter = document.getElementById('filter-status');
const riskFilter = document.getElementById('filter-risk');
const dateFrom = document.getElementById('filter-from');
const dateTo = document.getElementById('filter-to');
const searchInput = document.getElementById('filter-search');
const refreshBtn = document.getElementById('btn-refresh');
const logoutBtn = document.getElementById('btn-logout');
const alertContainer = document.getElementById('alert-container');
const loadingOverlay = document.getElementById('table-loading');

const detailModal = $('#intakeDetailModal');
const detailLoader = document.getElementById('detail-loading');
const detailContent = document.getElementById('detail-content');
const detailRiskBadge = document.getElementById('detail-risk-badge');
const detailStatusBadge = document.getElementById('detail-status-badge');
const detailName = document.getElementById('detail-name');
const detailDob = document.getElementById('detail-dob');
const detailPhone = document.getElementById('detail-phone');
const detailAddress = document.getElementById('detail-address');
const detailLmp = document.getElementById('detail-lmp');
const detailEdd = document.getElementById('detail-edd');
const detailBmi = document.getElementById('detail-bmi');
const detailObstetric = document.getElementById('detail-obstetric');
const detailRiskFlags = document.getElementById('detail-risk-flags');
const detailHistory = document.getElementById('detail-history');
const detailStatusSelect = document.getElementById('detail-status');
const detailReviewer = document.getElementById('detail-reviewed-by');
const detailNotes = document.getElementById('detail-notes');
const saveReviewBtn = document.getElementById('btn-save-review');

let currentSubmissionId = null;
let searchDebounceTimer = null;

function redirectToLogin() {
    window.location.href = 'login.html';
}

function setLoading(isLoading) {
    if (!loadingOverlay) return;
    loadingOverlay.classList.toggle('d-none', !isLoading);
}

function showAlert(message, type = 'info', timeout = 4000) {
    if (!alertContainer) return;
    const wrapper = document.createElement('div');
    wrapper.className = `alert alert-${type} alert-dismissible fade show`;
    wrapper.role = 'alert';
    wrapper.innerHTML = `
        ${message}
        <button type="button" class="close" data-dismiss="alert" aria-label="Close">
            <span aria-hidden="true">&times;</span>
        </button>
    `;
    alertContainer.appendChild(wrapper);
    if (timeout) {
        setTimeout(() => {
            $(wrapper).alert('close');
        }, timeout);
    }
}

async function authorizedFetch(path, options = {}) {
    const token = await getIdToken();
    if (!token) {
        redirectToLogin();
        throw new Error('Unauthorized');
    }
    const headers = new Headers(options.headers || {});
    if (!headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${token}`);
    }
    if (options.body && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
    }
    const response = await fetch(path.startsWith('http') ? path : `${API_BASE}${path}`, {
        ...options,
        headers,
    });
    if (response.status === 401 || response.status === 403) {
        redirectToLogin();
        throw new Error('Unauthorized');
    }
    return response;
}

function formatDate(value) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.valueOf())) return value;
    return new Intl.DateTimeFormat('id-ID', {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    }).format(date);
}

function formatStatus(status) {
    const label = STATUS_LABELS[status] || status || '-';
    const badge = STATUS_BADGE[status] || 'badge-secondary';
    return `<span class="badge ${badge} status-badge"><i class="fas fa-circle"></i> ${label}</span>`;
}

function renderRiskBadge(isHighRisk) {
    return isHighRisk
        ? '<span class="badge badge-high-risk">High</span>'
        : '<span class="badge badge-normal">Normal</span>';
}

function renderTableRows(data) {
    if (!tableBody) return;
    if (!Array.isArray(data) || !data.length) {
        tableBody.innerHTML = '<tr><td colspan="8" class="text-center text-muted">Tidak ada data ditemukan.</td></tr>';
        return;
    }
    const rows = data.map((item) => {
        const received = formatDate(item.receivedAt);
        const status = formatStatus(item.status);
        const risk = renderRiskBadge(item.highRisk);
    const nikLine = item.nik ? `<br><small>NIK: ${item.nik}</small>` : '';
    const patient = item.patientName ? `<strong>${item.patientName}</strong>${nikLine}` : '-';
        const reviewInfo = item.reviewedBy ? `${item.reviewedBy}<br><small>${formatDate(item.reviewedAt)}</small>` : '-';
        const eddText = item.edd ? item.edd : '-';
        const phone = item.phone || '-';
        return `
            <tr>
                <td>${received}</td>
                <td>${patient}</td>
                <td>${phone}</td>
                <td>${status}</td>
                <td>${risk}</td>
                <td>${eddText}</td>
                <td>${reviewInfo}</td>
                <td>
                    <button class="btn btn-outline-primary btn-sm btn-detail" data-id="${item.submissionId}">
                        <i class="fas fa-eye"></i> Detail
                    </button>
                    <button class="btn btn-outline-danger btn-sm btn-delete ml-1" data-id="${item.submissionId}" data-name="${item.patientName || 'pasien'}" title="Hapus data intake">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
    tableBody.innerHTML = rows;
}

async function loadSubmissions() {
    try {
        setLoading(true);
        const params = new URLSearchParams();
        params.set('limit', '200');
        if (statusFilter && statusFilter.value) {
            params.set('status', statusFilter.value);
        }
        if (riskFilter && riskFilter.value) {
            params.set('risk', riskFilter.value);
        }
        if (dateFrom && dateFrom.value) {
            params.set('from', dateFrom.value);
        }
        if (dateTo && dateTo.value) {
            params.set('to', dateTo.value);
        }
        if (searchInput && searchInput.value.trim()) {
            params.set('search', searchInput.value.trim());
        }
        const res = await authorizedFetch(`/api/patient-intake?${params.toString()}`);
        const payload = await res.json();
        if (!payload.success) {
            throw new Error(payload.message || 'Gagal memuat data intake');
        }
        renderTableRows(payload.data || []);
    } catch (error) {
        console.error('loadSubmissions error:', error);
        showAlert(error.message || 'Gagal memuat data intake', 'danger', 6000);
    } finally {
        setLoading(false);
    }
}

function renderRiskFlags(flags) {
    if (!Array.isArray(flags) || !flags.length) {
        detailRiskFlags.innerHTML = '<span class="text-muted">Tidak ada risk flag.</span>';
        return;
    }
    detailRiskFlags.innerHTML = flags.map((flag) => `<span class="risk-flag">${flag}</span>`).join('');
}

function renderHistory(history) {
    if (!Array.isArray(history) || !history.length) {
        detailHistory.innerHTML = '<span class="text-muted">Belum ada riwayat review.</span>';
        return;
    }
    detailHistory.innerHTML = history.map((item) => {
        const label = STATUS_LABELS[item.status] || item.status;
        const timestamp = formatDate(item.timestamp);
        const actor = item.actor || '-';
        const notes = item.notes ? `<div class="text-muted small">"${item.notes}"</div>` : '';
        return `
            <div class="history-entry">
                <div><strong>${label}</strong> oleh <strong>${actor}</strong></div>
                <div class="text-muted small">${timestamp}</div>
                ${notes}
            </div>
        `;
    }).join('');
}

function resetDetailModal() {
    currentSubmissionId = null;
    detailContent.classList.add('d-none');
    detailLoader.classList.remove('d-none');
    detailRiskBadge.className = 'badge';
    detailRiskBadge.textContent = '';
    detailStatusBadge.className = 'badge badge-secondary ml-2';
    detailStatusBadge.textContent = '';
    detailName.textContent = '-';
    detailDob.textContent = '-';
    detailPhone.textContent = '-';
    detailAddress.textContent = '-';
    detailLmp.textContent = '-';
    detailEdd.textContent = '-';
    detailBmi.textContent = '-';
    detailObstetric.textContent = '-';
    detailRiskFlags.innerHTML = '';
    detailHistory.innerHTML = '';
    detailStatusSelect.value = 'verified';
    detailReviewer.value = auth.currentUser?.name || auth.currentUser?.email || '';
    detailNotes.value = '';
}

function populateDetail(record) {
    const payload = record.payload || {};
    const metadata = payload.metadata || {};
    const totals = metadata.obstetricTotals || {};
    const review = record.review || {};

    const statusLabel = STATUS_LABELS[record.status || review.status] || record.status || review.status || 'Unknown';
    const statusBadge = STATUS_BADGE[record.status || review.status] || 'badge-secondary';
    detailStatusBadge.className = `badge ${statusBadge} ml-2`;
    detailStatusBadge.textContent = statusLabel;

    if (record.summary?.highRisk || metadata.highRisk) {
        detailRiskBadge.className = 'badge badge-high-risk';
        detailRiskBadge.textContent = 'High Risk';
    } else {
        detailRiskBadge.className = 'badge badge-normal';
        detailRiskBadge.textContent = 'Normal Risk';
    }

    // Basic identity
    detailName.textContent = payload.full_name || '-';
    detailDob.textContent = payload.dob ? `${payload.dob} (usia ${payload.age || '-'})` : '-';
    detailPhone.textContent = payload.phone || '-';
    detailAddress.textContent = payload.address || '-';
    
    // Family & Social Information
    const familySocialContainer = document.getElementById('detail-family-social');
    if (familySocialContainer) {
        let familySocialHTML = '';
        if (payload.marital_status) {
            familySocialHTML += `<dt class="col-sm-4">Status Pernikahan</dt><dd class="col-sm-8">${payload.marital_status}</dd>`;
        }
        if (payload.husband_name) {
            familySocialHTML += `<dt class="col-sm-4">Nama Suami</dt><dd class="col-sm-8">${payload.husband_name}</dd>`;
        }
        if (payload.husband_age) {
            familySocialHTML += `<dt class="col-sm-4">Umur Suami</dt><dd class="col-sm-8">${payload.husband_age} tahun</dd>`;
        }
        if (payload.husband_job) {
            familySocialHTML += `<dt class="col-sm-4">Pekerjaan Suami</dt><dd class="col-sm-8">${payload.husband_job}</dd>`;
        }
        if (payload.occupation) {
            familySocialHTML += `<dt class="col-sm-4">Pekerjaan</dt><dd class="col-sm-8">${payload.occupation}</dd>`;
        }
        if (payload.education) {
            familySocialHTML += `<dt class="col-sm-4">Pendidikan</dt><dd class="col-sm-8">${payload.education}</dd>`;
        }
        familySocialContainer.innerHTML = familySocialHTML || '<dd class="col-12 text-muted">Tidak ada data</dd>';
    }
    
    // Pregnancy current
    detailLmp.textContent = payload.lmp || '-';
    detailEdd.textContent = metadata.edd?.value || payload.edd || '-';
    detailBmi.textContent = payload.bmi ? `${payload.bmi} (${metadata.bmiCategory || '-'})` : '-';
    detailObstetric.textContent = `G${totals.gravida ?? payload.gravida ?? '-'} P${totals.para ?? '-'} A${totals.abortus ?? '-'} L${totals.living ?? '-'}`;
    
    // Medical History & Risk
    const medicalHistoryContainer = document.getElementById('detail-medical-history');
    if (medicalHistoryContainer) {
        let medicalHTML = '';
        if (payload.height) {
            medicalHTML += `<dt class="col-sm-4">Tinggi Badan</dt><dd class="col-sm-8">${payload.height} cm</dd>`;
        }
        if (payload.weight) {
            medicalHTML += `<dt class="col-sm-4">Berat Badan</dt><dd class="col-sm-8">${payload.weight} kg</dd>`;
        }
        if (payload.risk_factors) {
            medicalHTML += `<dt class="col-sm-4">Faktor Risiko</dt><dd class="col-sm-8">${payload.risk_factors}</dd>`;
        }
        if (payload.past_conditions) {
            medicalHTML += `<dt class="col-sm-4">Riwayat Penyakit</dt><dd class="col-sm-8">${payload.past_conditions}</dd>`;
        }
        if (payload.allergies) {
            medicalHTML += `<dt class="col-sm-4">Alergi</dt><dd class="col-sm-8">${payload.allergies}</dd>`;
        }
        if (payload.current_medications) {
            medicalHTML += `<dt class="col-sm-4">Obat Saat Ini</dt><dd class="col-sm-8">${payload.current_medications}</dd>`;
        }
        if (payload.immunizations) {
            medicalHTML += `<dt class="col-sm-4">Imunisasi</dt><dd class="col-sm-8">${payload.immunizations}</dd>`;
        }
        medicalHistoryContainer.innerHTML = medicalHTML || '<dd class="col-12 text-muted">Tidak ada data</dd>';
    }
    
    // Prenatal/ANC visits
    const prenatalSection = document.getElementById('detail-prenatal-section');
    const prenatalTableContainer = document.getElementById('detail-prenatal-table');
    if (prenatalTableContainer && payload.prenatal_visits && payload.prenatal_visits.length > 0) {
        let tableHTML = '<table class="table table-sm table-bordered"><thead><tr><th>Tanggal</th><th>Tempat</th><th>Keluhan</th><th>Hasil</th><th>Tindakan</th></tr></thead><tbody>';
        payload.prenatal_visits.forEach(visit => {
            tableHTML += `<tr>
                <td>${visit.date || '-'}</td>
                <td>${visit.location || '-'}</td>
                <td>${visit.complaint || '-'}</td>
                <td>${visit.result || '-'}</td>
                <td>${visit.action || '-'}</td>
            </tr>`;
        });
        tableHTML += '</tbody></table>';
        prenatalTableContainer.innerHTML = tableHTML;
        prenatalSection.style.display = 'block';
    } else if (prenatalSection) {
        prenatalSection.style.display = 'none';
    }
    
    // Lab tests
    const labSection = document.getElementById('detail-lab-section');
    const labTableContainer = document.getElementById('detail-lab-table');
    if (labTableContainer && payload.lab_tests && payload.lab_tests.length > 0) {
        let tableHTML = '<table class="table table-sm table-bordered"><thead><tr><th>Tanggal</th><th>Jenis Tes</th><th>Hasil</th><th>Satuan</th><th>Nilai Normal</th></tr></thead><tbody>';
        payload.lab_tests.forEach(test => {
            tableHTML += `<tr>
                <td>${test.date || '-'}</td>
                <td>${test.test_name || '-'}</td>
                <td>${test.result || '-'}</td>
                <td>${test.unit || '-'}</td>
                <td>${test.normal_range || '-'}</td>
            </tr>`;
        });
        tableHTML += '</tbody></table>';
        labTableContainer.innerHTML = tableHTML;
        labSection.style.display = 'block';
    } else if (labSection) {
        labSection.style.display = 'none';
    }
    
    renderRiskFlags(record.summary?.riskFlags || metadata.riskFlags || []);
    renderHistory(review.history || []);

    if (review.status) {
        detailStatusSelect.value = review.status;
    }
    if (review.verifiedBy) {
        detailReviewer.value = review.verifiedBy;
    } else if (!detailReviewer.value) {
        detailReviewer.value = auth.currentUser?.name || auth.currentUser?.email || '';
    }
    if (review.notes) {
        detailNotes.value = review.notes;
    }
}

async function openDetailModal(submissionId) {
    resetDetailModal();
    currentSubmissionId = submissionId;
    detailModal.modal('show');
    try {
        const res = await authorizedFetch(`/api/patient-intake/${submissionId}`);
        const payload = await res.json();
        if (!payload.success) {
            throw new Error(payload.message || 'Gagal memuat detail intake');
        }
        populateDetail(payload.data);
        detailLoader.classList.add('d-none');
        detailContent.classList.remove('d-none');
    } catch (error) {
        console.error('openDetailModal error:', error);
        detailModal.modal('hide');
        showAlert(error.message || 'Gagal memuat detail intake', 'danger', 6000);
    }
}

async function saveReview() {
    if (!currentSubmissionId) {
        return;
    }
    const status = detailStatusSelect.value;
    const reviewer = detailReviewer.value.trim() || auth.currentUser?.name || auth.currentUser?.email || 'clinic_staff';
    const notes = detailNotes.value.trim();

    const payload = {
        status,
        reviewedBy: reviewer,
    };
    if (notes) {
        payload.notes = notes;
    }

    saveReviewBtn.disabled = true;
    saveReviewBtn.innerHTML = '<span class="spinner-border spinner-border-sm mr-2" role="status" aria-hidden="true"></span>Menyimpan...';

    try {
        const res = await authorizedFetch(`/api/patient-intake/${currentSubmissionId}/review`, {
            method: 'PUT',
            body: JSON.stringify(payload),
        });
        const body = await res.json();
        if (!body.success) {
            throw new Error(body.message || 'Gagal memperbarui status review');
        }
        showAlert('Status review berhasil diperbarui.', 'success');
        detailModal.modal('hide');
        await loadSubmissions();
    } catch (error) {
        console.error('saveReview error:', error);
        showAlert(error.message || 'Gagal memperbarui status review', 'danger', 6000);
    } finally {
        saveReviewBtn.disabled = false;
        saveReviewBtn.innerHTML = '<i class="fas fa-save"></i> Simpan';
    }
}

async function deleteSubmission(submissionId, patientName) {
    if (!confirm(`Apakah Anda yakin ingin menghapus data intake untuk pasien "${patientName}"?\n\nData yang dihapus:\n- Data intake di patient-intake-review\n- File data pasien di server\n\nTindakan ini tidak dapat dibatalkan.`)) {
        return;
    }

    try {
        const res = await authorizedFetch(`/api/patient-intake/${submissionId}`, {
            method: 'DELETE',
        });

        const payload = await res.json();
        
        if (!payload.success) {
            throw new Error(payload.message || 'Gagal menghapus data intake');
        }

        showAlert(`Data intake untuk pasien "${patientName}" berhasil dihapus.`, 'success');
        await loadSubmissions();
    } catch (error) {
        console.error('deleteSubmission error:', error);
        showAlert(error.message || 'Gagal menghapus data intake', 'danger', 6000);
    }
}

function attachEventListeners() {
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => loadSubmissions());
    }
    if (statusFilter) {
        statusFilter.addEventListener('change', () => loadSubmissions());
    }
    if (riskFilter) {
        riskFilter.addEventListener('change', () => loadSubmissions());
    }
    if (dateFrom) {
        dateFrom.addEventListener('change', () => loadSubmissions());
    }
    if (dateTo) {
        dateTo.addEventListener('change', () => loadSubmissions());
    }
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            clearTimeout(searchDebounceTimer);
            searchDebounceTimer = setTimeout(() => loadSubmissions(), 350);
        });
    }
    if (tableBody) {
        tableBody.addEventListener('click', (event) => {
            const detailButton = event.target.closest('.btn-detail');
            if (detailButton && detailButton.dataset.id) {
                openDetailModal(detailButton.dataset.id);
                return;
            }
            
            const deleteButton = event.target.closest('.btn-delete');
            if (deleteButton && deleteButton.dataset.id) {
                deleteSubmission(deleteButton.dataset.id, deleteButton.dataset.name);
                return;
            }
        });
    }
    if (saveReviewBtn) {
        saveReviewBtn.addEventListener('click', () => saveReview());
    }
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            await signOut();
            redirectToLogin();
        });
    }
}

async function bootstrap() {
    attachEventListeners();

    await initAuth();

    const token = await getIdToken();
    if (!token || !auth.currentUser) {
        redirectToLogin();
        return;
    }

    loadSubmissions();

    onAuthStateChanged((user) => {
        if (!user) {
            redirectToLogin();
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    bootstrap().catch((error) => {
        console.error('Bootstrap error:', error);
    });
});

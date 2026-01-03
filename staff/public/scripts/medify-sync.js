/**
 * MEDIFY Sync - Frontend UI
 * Handles batch import of medical records from SIMRS
 */

import { getIdToken } from './vps-auth-v2.js';

const API_URL = window.location.hostname === 'localhost'
    ? 'http://localhost:3000/api'
    : '/api';

let currentBatchId = null;
let refreshInterval = null;

/**
 * Initialize MEDIFY Sync page
 */
export async function initMedifySync() {
    console.log('[MedifySync] Initializing...');

    // Check credentials status
    await loadCredentialsStatus();

    // Load sync status and history
    await Promise.all([
        loadSyncStatus(),
        loadSyncHistory()
    ]);

    // Setup Socket.IO listeners for real-time updates
    setupSocketListeners();
}

/**
 * API request helper
 */
async function apiRequest(endpoint, options = {}) {
    const token = await getIdToken();
    const response = await fetch(`${API_URL}${endpoint}`, {
        ...options,
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            ...options.headers
        }
    });

    const data = await response.json();
    if (!response.ok) {
        throw new Error(data.message || 'Request failed');
    }
    return data;
}

/**
 * Load credentials status
 */
async function loadCredentialsStatus() {
    try {
        const data = await apiRequest('/medify-batch/credentials-status');
        if (data.success) {
            updateCredentialsUI(data.credentials);
        }
    } catch (error) {
        console.error('[MedifySync] Error loading credentials status:', error);
    }
}

/**
 * Update credentials UI
 */
function updateCredentialsUI(credentials) {
    const melindaStatus = document.getElementById('melinda-cred-status');
    const gambiranStatus = document.getElementById('gambiran-cred-status');
    const melindaBtn = document.getElementById('btn-sync-melinda');
    const gambiranBtn = document.getElementById('btn-sync-gambiran');

    if (melindaStatus) {
        if (credentials.rsia_melinda) {
            melindaStatus.innerHTML = '<i class="fas fa-check-circle text-success"></i> Configured';
            if (melindaBtn) melindaBtn.disabled = false;
        } else {
            melindaStatus.innerHTML = '<i class="fas fa-times-circle text-danger"></i> Not configured';
            if (melindaBtn) melindaBtn.disabled = true;
        }
    }

    if (gambiranStatus) {
        if (credentials.rsud_gambiran) {
            gambiranStatus.innerHTML = '<i class="fas fa-check-circle text-success"></i> Configured';
            if (gambiranBtn) gambiranBtn.disabled = false;
        } else {
            gambiranStatus.innerHTML = '<i class="fas fa-times-circle text-danger"></i> Not configured';
            if (gambiranBtn) gambiranBtn.disabled = true;
        }
    }
}

/**
 * Load current sync status
 */
async function loadSyncStatus() {
    try {
        const data = await apiRequest('/medify-batch/status');
        if (data.success) {
            updateStatusUI(data);
        }
    } catch (error) {
        console.error('[MedifySync] Error loading status:', error);
    }
}

/**
 * Update status UI
 */
function updateStatusUI(data) {
    const statusContainer = document.getElementById('sync-status-container');
    if (!statusContainer) return;

    if (data.isRunning && data.currentJob) {
        statusContainer.style.display = 'block';
        statusContainer.innerHTML = `
            <div class="alert alert-info">
                <i class="fas fa-spinner fa-spin mr-2"></i>
                <strong>Sync sedang berjalan</strong>
                <p class="mb-0 mt-2">Sedang memproses: ${data.currentJob.patient_name}</p>
            </div>
        `;

        // Start refresh interval
        if (!refreshInterval) {
            refreshInterval = setInterval(loadSyncStatus, 5000);
        }

    } else {
        statusContainer.style.display = 'none';

        // Stop refresh interval
        if (refreshInterval) {
            clearInterval(refreshInterval);
            refreshInterval = null;
        }
    }

    // Update latest batch info
    if (data.batches && data.batches.length > 0) {
        const latest = data.batches[0];
        updateBatchProgress(latest);
    }
}

/**
 * Update batch progress display
 */
function updateBatchProgress(batch) {
    const progressContainer = document.getElementById('batch-progress');
    if (!progressContainer) return;

    const total = batch.total || 0;
    const completed = (batch.success || 0) + (batch.failed || 0) + (batch.skipped || 0);
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

    if (batch.pending > 0 || batch.processing > 0) {
        progressContainer.style.display = 'block';
        progressContainer.innerHTML = `
            <div class="card">
                <div class="card-header">
                    <h3 class="card-title">
                        <i class="fas fa-sync-alt mr-2"></i>
                        Sync Progress - ${getSourceName(batch.simrs_source)}
                    </h3>
                </div>
                <div class="card-body">
                    <div class="progress mb-3" style="height: 25px;">
                        <div class="progress-bar bg-success" role="progressbar"
                             style="width: ${percentage}%"
                             aria-valuenow="${percentage}" aria-valuemin="0" aria-valuemax="100">
                            ${completed}/${total} (${percentage}%)
                        </div>
                    </div>
                    <div class="row text-center">
                        <div class="col-3">
                            <span class="badge badge-warning">${batch.pending || 0}</span>
                            <br><small>Pending</small>
                        </div>
                        <div class="col-3">
                            <span class="badge badge-info">${batch.processing || 0}</span>
                            <br><small>Processing</small>
                        </div>
                        <div class="col-3">
                            <span class="badge badge-success">${batch.success || 0}</span>
                            <br><small>Success</small>
                        </div>
                        <div class="col-3">
                            <span class="badge badge-danger">${batch.failed || 0}</span>
                            <br><small>Failed</small>
                        </div>
                    </div>
                </div>
            </div>
        `;
    } else {
        progressContainer.style.display = 'none';
    }
}

/**
 * Load sync history
 */
async function loadSyncHistory() {
    try {
        const data = await apiRequest('/medify-batch/history?limit=10');
        if (data.success) {
            renderHistoryTable(data.history);
        }
    } catch (error) {
        console.error('[MedifySync] Error loading history:', error);
    }
}

/**
 * Render history table
 */
function renderHistoryTable(history) {
    const tbody = document.getElementById('sync-history-body');
    if (!tbody) return;

    if (!history || history.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="text-center text-muted">
                    <i class="fas fa-inbox mr-2"></i>Belum ada riwayat sync
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = history.map(h => `
        <tr>
            <td>${formatDateTime(h.started_at)}</td>
            <td>${getSourceName(h.simrs_source)}</td>
            <td>${h.total}</td>
            <td><span class="badge badge-success">${h.success || 0}</span></td>
            <td><span class="badge badge-danger">${h.failed || 0}</span></td>
            <td>
                <button class="btn btn-xs btn-info" onclick="window.viewBatchDetails('${h.batch_id}')">
                    <i class="fas fa-eye"></i> Detail
                </button>
            </td>
        </tr>
    `).join('');
}

/**
 * Start sync for a source
 */
async function startSync(source) {
    const btn = document.getElementById(`btn-sync-${source === 'rsia_melinda' ? 'melinda' : 'gambiran'}`);
    const statusContainer = document.getElementById('sync-status-container');
    const progressContainer = document.getElementById('batch-progress');

    // Get date range from inputs
    const dateStartInput = document.getElementById('medify-date-start');
    const dateEndInput = document.getElementById('medify-date-end');

    // Convert YYYY-MM-DD to DD-MM-YYYY for API
    const convertDate = (dateStr) => {
        if (!dateStr) return null;
        const [year, month, day] = dateStr.split('-');
        return `${day}-${month}-${year}`;
    };

    const dateStart = convertDate(dateStartInput?.value);
    const dateEnd = convertDate(dateEndInput?.value);

    const dateRangeText = dateStart && dateEnd
        ? ` (${dateStartInput.value} s/d ${dateEndInput.value})`
        : ' (7 hari terakhir)';

    if (!confirm(`Mulai sync data dari ${getSourceName(source)}${dateRangeText}?`)) {
        return;
    }

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Memulai...';

    // Show initial progress immediately
    if (statusContainer) {
        statusContainer.style.display = 'block';
        statusContainer.innerHTML = `
            <div class="alert alert-info">
                <i class="fas fa-spinner fa-spin mr-2"></i>
                <strong>Memulai sync ${getSourceName(source)}...</strong>
                <p class="mb-0 mt-2">Menghubungkan ke SIMRS...</p>
            </div>
        `;
    }

    try {
        const data = await apiRequest(`/medify-batch/sync/${source}`, {
            method: 'POST',
            body: JSON.stringify({ dateStart, dateEnd })
        });

        if (data.success) {
            currentBatchId = data.batchId;
            showToast(`Sync dimulai untuk ${data.count} pasien`, 'success');

            // Show progress bar
            if (progressContainer && data.count > 0) {
                progressContainer.style.display = 'block';
                progressContainer.innerHTML = `
                    <div class="card card-info">
                        <div class="card-header">
                            <h3 class="card-title">
                                <i class="fas fa-sync-alt fa-spin mr-2"></i>
                                Sync Progress - ${getSourceName(source)}
                            </h3>
                        </div>
                        <div class="card-body">
                            <div class="progress mb-3" style="height: 30px;">
                                <div class="progress-bar progress-bar-striped progress-bar-animated bg-info"
                                     role="progressbar" style="width: 0%"
                                     id="sync-progress-bar">
                                    0/${data.count}
                                </div>
                            </div>
                            <p class="mb-0" id="sync-current-patient">
                                <i class="fas fa-hourglass-start mr-2"></i>Menunggu login ke SIMRS...
                            </p>
                        </div>
                    </div>
                `;
            }

            // Keep button disabled while syncing
            btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Syncing...';

            // Start polling for status
            if (!refreshInterval) {
                refreshInterval = setInterval(loadSyncStatus, 3000);
            }

        } else {
            showToast(data.message || 'Gagal memulai sync', 'error');
            btn.disabled = false;
            btn.innerHTML = `<i class="fas fa-sync-alt mr-2"></i>Sync ${getSourceName(source)}`;
            if (statusContainer) statusContainer.style.display = 'none';
        }

    } catch (error) {
        console.error('[MedifySync] Error starting sync:', error);
        showToast('Error: ' + error.message, 'error');
        btn.disabled = false;
        btn.innerHTML = `<i class="fas fa-sync-alt mr-2"></i>Sync ${getSourceName(source)}`;
        if (statusContainer) statusContainer.style.display = 'none';
    }
}

/**
 * Setup Socket.IO listeners
 */
function setupSocketListeners() {
    // Use window.socket which is set by realtime-sync.js
    if (!window.socket) {
        console.log('[MedifySync] Socket not ready, will retry...');
        setTimeout(setupSocketListeners, 1000);
        return;
    }

    console.log('[MedifySync] Setting up socket listeners');

    window.socket.on('medify_progress', (data) => {
        console.log('[MedifySync] Progress:', data);

        // Update progress bar
        const progressBar = document.getElementById('sync-progress-bar');
        const currentPatient = document.getElementById('sync-current-patient');

        if (progressBar && data.current && data.total) {
            const percentage = Math.round((data.current / data.total) * 100);
            progressBar.style.width = `${percentage}%`;
            progressBar.textContent = `${data.current}/${data.total}`;

            // Change color based on status
            progressBar.className = 'progress-bar progress-bar-striped progress-bar-animated';
            if (data.status === 'success') {
                progressBar.classList.add('bg-success');
            } else if (data.status === 'failed' || data.status === 'skipped') {
                progressBar.classList.add('bg-warning');
            } else {
                progressBar.classList.add('bg-info');
            }
        }

        if (currentPatient) {
            let statusIcon = 'fa-spinner fa-spin';
            let statusText = 'Memproses';

            if (data.status === 'success') {
                statusIcon = 'fa-check text-success';
                statusText = 'Berhasil';
            } else if (data.status === 'failed') {
                statusIcon = 'fa-times text-danger';
                statusText = 'Gagal';
            } else if (data.status === 'skipped') {
                statusIcon = 'fa-forward text-warning';
                statusText = 'Dilewati';
            }

            currentPatient.innerHTML = `
                <i class="fas ${statusIcon} mr-2"></i>
                <strong>${statusText}:</strong> ${data.patientName}
                ${data.error ? `<br><small class="text-muted ml-4">${data.error}</small>` : ''}
            `;
        }

        // Update current job display
        const statusContainer = document.getElementById('sync-status-container');
        if (statusContainer) {
            statusContainer.style.display = 'block';
            statusContainer.innerHTML = `
                <div class="alert alert-info">
                    <i class="fas fa-sync-alt fa-spin mr-2"></i>
                    <strong>Sync berjalan...</strong>
                    ${data.current && data.total ? ` (${data.current}/${data.total})` : ''}
                </div>
            `;
        }
    });

    window.socket.on('medify_sync_complete', (data) => {
        console.log('[MedifySync] Sync complete:', data);
        showToast('Sync selesai!', 'success');

        // Stop refresh interval
        if (refreshInterval) {
            clearInterval(refreshInterval);
            refreshInterval = null;
        }

        // Reset buttons
        const melindaBtn = document.getElementById('btn-sync-melinda');
        const gambiranBtn = document.getElementById('btn-sync-gambiran');
        if (melindaBtn) {
            melindaBtn.disabled = false;
            melindaBtn.innerHTML = '<i class="fas fa-sync-alt mr-2"></i>Sync RSIA Melinda';
        }
        if (gambiranBtn) {
            gambiranBtn.disabled = false;
            gambiranBtn.innerHTML = '<i class="fas fa-sync-alt mr-2"></i>Sync RSUD Gambiran';
        }

        // Update status container
        const statusContainer = document.getElementById('sync-status-container');
        if (statusContainer) {
            statusContainer.innerHTML = `
                <div class="alert alert-success">
                    <i class="fas fa-check-circle mr-2"></i>
                    <strong>Sync selesai!</strong>
                </div>
            `;
            // Hide after 5 seconds
            setTimeout(() => {
                statusContainer.style.display = 'none';
            }, 5000);
        }

        // Hide progress bar after delay
        const progressContainer = document.getElementById('batch-progress');
        if (progressContainer) {
            setTimeout(() => {
                progressContainer.style.display = 'none';
            }, 3000);
        }

        loadSyncStatus();
        loadSyncHistory();

        // Load review section for sending to portal
        if (data.batchId) {
            loadReviewSection(data.batchId);
        }
    });
}

/**
 * View batch details
 */
async function viewBatchDetails(batchId) {
    try {
        const data = await apiRequest(`/medify-batch/jobs/${batchId}`);
        if (data.success) {
            showBatchDetailsModal(data.jobs);
        }
    } catch (error) {
        console.error('[MedifySync] Error loading batch details:', error);
        showToast('Error loading details', 'error');
    }
}

/**
 * Show batch details modal
 */
function showBatchDetailsModal(jobs) {
    const modal = document.getElementById('batch-details-modal');
    const tbody = document.getElementById('batch-details-body');

    if (!modal || !tbody) return;

    tbody.innerHTML = jobs.map(j => `
        <tr>
            <td>${j.patient_name}</td>
            <td>
                <span class="badge badge-${getStatusBadge(j.status)}">
                    ${j.status}
                </span>
            </td>
            <td>${j.simrs_patient_id || '-'}</td>
            <td>${j.records_imported || 0}</td>
            <td>${j.error_message || '-'}</td>
        </tr>
    `).join('');

    $(modal).modal('show');
}

/**
 * Show credentials modal
 */
function showCredentialsModal(source) {
    const modal = document.getElementById('credentials-modal');
    const form = document.getElementById('credentials-form');

    if (!modal || !form) return;

    form.dataset.source = source;
    document.getElementById('cred-source-label').textContent = getSourceName(source);
    document.getElementById('cred-username').value = '';
    document.getElementById('cred-password').value = '';

    $(modal).modal('show');
}

/**
 * Save credentials
 */
async function saveCredentials() {
    const form = document.getElementById('credentials-form');
    const source = form.dataset.source;
    const username = document.getElementById('cred-username').value;
    const password = document.getElementById('cred-password').value;

    if (!username || !password) {
        showToast('Username dan password wajib diisi', 'warning');
        return;
    }

    const btn = document.getElementById('btn-save-credentials');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Menyimpan...';

    try {
        const data = await apiRequest('/medify-batch/credentials', {
            method: 'POST',
            body: JSON.stringify({ source, username, password })
        });

        if (data.success) {
            showToast('Kredensial berhasil disimpan', 'success');
            $('#credentials-modal').modal('hide');
            loadCredentialsStatus();
        } else {
            showToast(data.message || 'Gagal menyimpan', 'error');
        }

    } catch (error) {
        console.error('[MedifySync] Error saving credentials:', error);
        showToast('Error: ' + error.message, 'error');
    }

    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-save mr-2"></i>Simpan';
}

/**
 * Test connection
 */
async function testConnection(source) {
    const btn = document.getElementById(`btn-test-${source === 'rsia_melinda' ? 'melinda' : 'gambiran'}`);
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

    try {
        const data = await apiRequest('/medify-batch/test-connection', {
            method: 'POST',
            body: JSON.stringify({ source })
        });

        if (data.success) {
            showToast('Koneksi berhasil!', 'success');
        } else {
            showToast(data.message || 'Koneksi gagal', 'error');
        }

    } catch (error) {
        console.error('[MedifySync] Error testing connection:', error);
        showToast('Error: ' + error.message, 'error');
    }

    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-plug"></i>';
}

/**
 * Helper functions
 */
function getSourceName(source) {
    const names = {
        'rsia_melinda': 'RSIA Melinda',
        'rsud_gambiran': 'RSUD Gambiran'
    };
    return names[source] || source;
}

function getStatusBadge(status) {
    const badges = {
        'pending': 'warning',
        'processing': 'info',
        'success': 'success',
        'failed': 'danger',
        'skipped': 'secondary'
    };
    return badges[status] || 'light';
}

function formatDateTime(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleString('id-ID', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function showToast(message, type = 'info') {
    if (typeof toastr !== 'undefined') {
        toastr[type](message);
    } else {
        alert(message);
    }
}

// ============================================================================
// REVIEW & SEND TO PORTAL SECTION
// ============================================================================

/**
 * Load review section for sending documents to patient portal
 */
async function loadReviewSection(batchId) {
    const container = document.getElementById('review-container');
    if (!container) return;

    container.innerHTML = `
        <div class="card card-primary">
            <div class="card-header">
                <h3 class="card-title">
                    <i class="fas fa-paper-plane mr-2"></i>
                    Review & Kirim ke Portal Pasien
                </h3>
            </div>
            <div class="card-body">
                <div class="text-center">
                    <i class="fas fa-spinner fa-spin fa-2x"></i>
                    <p class="mt-2">Loading...</p>
                </div>
            </div>
        </div>
    `;

    try {
        const data = await apiRequest(`/medify-batch/review/${batchId}`);
        if (data.success) {
            renderReviewSection(data, batchId);
        }
    } catch (error) {
        console.error('[MedifySync] Error loading review:', error);
        container.innerHTML = `
            <div class="alert alert-danger">
                <i class="fas fa-exclamation-circle mr-2"></i>
                Gagal memuat data review: ${error.message}
            </div>
        `;
    }
}

/**
 * Render review section with patient cards
 */
function renderReviewSection(data, batchId) {
    const container = document.getElementById('review-container');

    if (data.patients.length === 0) {
        container.innerHTML = `
            <div class="alert alert-info">
                <i class="fas fa-info-circle mr-2"></i>
                Tidak ada pasien yang berhasil di-sync untuk dikirim ke portal.
            </div>
        `;
        return;
    }

    const pendingPatients = data.patients.filter(p => !p.alreadySent);

    container.innerHTML = `
        <div class="card card-primary">
            <div class="card-header">
                <h3 class="card-title">
                    <i class="fas fa-paper-plane mr-2"></i>
                    Review & Kirim ke Portal Pasien
                </h3>
                <div class="card-tools">
                    <span class="badge badge-light">
                        ${data.summary.sent}/${data.summary.total} terkirim
                    </span>
                </div>
            </div>
            <div class="card-body">
                <!-- Bulk Actions -->
                <div class="mb-3 d-flex align-items-center flex-wrap">
                    <div class="custom-control custom-checkbox mr-3">
                        <input type="checkbox" class="custom-control-input" id="select-all-patients"
                               onchange="window.toggleSelectAllPatients(this.checked)"
                               ${pendingPatients.length === 0 ? 'disabled' : ''}>
                        <label class="custom-control-label" for="select-all-patients">
                            Pilih Semua
                        </label>
                    </div>
                    <button class="btn btn-primary" id="btn-send-selected"
                            onclick="window.sendSelectedToPortal('${batchId}')"
                            disabled>
                        <i class="fas fa-paper-plane mr-2"></i>
                        Kirim yang Dipilih (<span id="selected-count">0</span>)
                    </button>
                </div>

                <!-- Patient Cards -->
                <div id="patient-review-cards">
                    ${data.patients.map(p => renderPatientCard(p, batchId)).join('')}
                </div>
            </div>
        </div>
    `;
}

/**
 * Render individual patient card
 */
function renderPatientCard(patient, batchId) {
    const docIcons = [];
    if (patient.documents.hasResume) {
        docIcons.push('<i class="fas fa-file-medical-alt text-success" title="Resume Medis"></i>');
    }
    if (patient.documents.usgCount > 0) {
        docIcons.push(`<i class="fas fa-camera text-info" title="${patient.documents.usgCount} Foto USG"></i>`);
    }
    if (patient.documents.labCount > 0) {
        docIcons.push(`<i class="fas fa-flask text-warning" title="${patient.documents.labCount} File Lab"></i>`);
    }

    const statusBadge = patient.alreadySent
        ? '<span class="badge badge-success"><i class="fas fa-check"></i> Sudah Dikirim</span>'
        : '<span class="badge badge-secondary">Belum Dikirim</span>';

    return `
        <div class="card card-outline card-secondary patient-card" id="patient-card-${patient.patientId}">
            <div class="card-header" style="cursor: pointer;"
                 onclick="window.togglePatientPreview('${patient.patientId}', '${patient.mrId}')">
                <div class="d-flex align-items-center flex-wrap">
                    ${!patient.alreadySent ? `
                        <div class="custom-control custom-checkbox mr-2" onclick="event.stopPropagation()">
                            <input type="checkbox" class="custom-control-input patient-checkbox"
                                   id="check-${patient.patientId}"
                                   data-patient-id="${patient.patientId}"
                                   onchange="window.updateSelectedCount()">
                            <label class="custom-control-label" for="check-${patient.patientId}"></label>
                        </div>
                    ` : ''}
                    <div class="flex-grow-1">
                        <strong>${patient.patientName}</strong>
                        <small class="text-muted ml-2">(${patient.mrId || 'No MR'})</small>
                    </div>
                    <div class="doc-icons mx-2">
                        ${docIcons.join('')}
                    </div>
                    <div class="mx-2">
                        ${statusBadge}
                    </div>
                    ${!patient.alreadySent ? `
                        <button class="btn btn-sm btn-info ml-2"
                                onclick="event.stopPropagation(); window.sendSingleToPortal('${batchId}', '${patient.patientId}')"
                                id="btn-send-${patient.patientId}">
                            <i class="fas fa-paper-plane"></i> Kirim
                        </button>
                    ` : ''}
                    <i class="fas fa-chevron-down ml-2" id="chevron-${patient.patientId}"></i>
                </div>
            </div>
            <div class="card-body p-0" id="preview-${patient.patientId}" style="display: none;">
                <div class="text-center p-3">
                    <i class="fas fa-spinner fa-spin"></i> Loading preview...
                </div>
            </div>
        </div>
    `;
}

/**
 * Toggle patient preview expansion
 */
async function togglePatientPreview(patientId, mrId) {
    const previewEl = document.getElementById(`preview-${patientId}`);
    const chevronEl = document.getElementById(`chevron-${patientId}`);

    if (!previewEl || !chevronEl) return;

    if (previewEl.style.display === 'none') {
        previewEl.style.display = 'block';
        chevronEl.classList.remove('fa-chevron-down');
        chevronEl.classList.add('fa-chevron-up');

        // Load preview if not loaded
        if (!previewEl.dataset.loaded) {
            try {
                const data = await apiRequest(`/medify-batch/patient-preview/${patientId}/${mrId}`);
                if (data.success) {
                    previewEl.innerHTML = renderPatientPreview(data.preview);
                    previewEl.dataset.loaded = 'true';
                }
            } catch (error) {
                previewEl.innerHTML = `<div class="p-3 text-danger">Error: ${error.message}</div>`;
            }
        }
    } else {
        previewEl.style.display = 'none';
        chevronEl.classList.remove('fa-chevron-up');
        chevronEl.classList.add('fa-chevron-down');
    }
}

/**
 * Render patient preview content
 */
function renderPatientPreview(preview) {
    let html = '<div class="p-3">';

    // Resume Preview (use resumeFull for complete content)
    if (preview.resumeFull || preview.resume) {
        const resumeText = preview.resumeFull || preview.resume;
        html += `
            <div class="mb-3">
                <h6><i class="fas fa-file-medical-alt text-success mr-2"></i>Resume Medis</h6>
                <div class="resume-preview" style="max-height: 400px; overflow-y: auto; white-space: pre-wrap; font-family: monospace; font-size: 12px; background: #f8f9fa; padding: 10px; border-radius: 4px;">${escapeHtml(resumeText)}</div>
            </div>
        `;
    }

    // USG Photos Thumbnails
    if (preview.usgPhotos && preview.usgPhotos.length > 0) {
        html += `
            <div class="mb-3">
                <h6><i class="fas fa-camera text-info mr-2"></i>Foto USG (${preview.usgPhotos.length})</h6>
                <div class="d-flex flex-wrap">
                    ${preview.usgPhotos.map(p => `
                        <div class="m-1" style="cursor: pointer;"
                             onclick="window.previewImage('${p.thumbnailUrl}', '${escapeHtml(p.title || p.fileName)}')">
                            <img src="${p.thumbnailUrl}"
                                 alt="${escapeHtml(p.title || p.fileName)}"
                                 class="usg-thumbnail">
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    // Lab Files
    if (preview.labFiles && preview.labFiles.length > 0) {
        html += `
            <div class="mb-3">
                <h6><i class="fas fa-flask text-warning mr-2"></i>File Lab (${preview.labFiles.length})</h6>
                <ul class="list-unstyled mb-0">
                    ${preview.labFiles.map(f => `
                        <li>
                            <a href="${f.url}" target="_blank">
                                <i class="fas fa-file-pdf text-danger"></i> ${escapeHtml(f.name)}
                            </a>
                        </li>
                    `).join('')}
                </ul>
            </div>
        `;
    }

    // Lab Interpretation
    if (preview.labInterpretation) {
        html += `
            <div class="mb-3">
                <h6><i class="fas fa-notes-medical text-info mr-2"></i>Interpretasi Lab</h6>
                <div class="bg-light p-2 rounded" style="white-space: pre-wrap;">
                    ${escapeHtml(preview.labInterpretation)}
                </div>
            </div>
        `;
    }

    if (!preview.resume && (!preview.usgPhotos || preview.usgPhotos.length === 0) && (!preview.labFiles || preview.labFiles.length === 0)) {
        html += '<p class="text-muted mb-0">Tidak ada dokumen untuk ditampilkan.</p>';
    }

    html += '</div>';
    return html;
}

/**
 * Send single patient to portal
 */
async function sendSingleToPortal(batchId, patientId) {
    const btn = document.getElementById(`btn-send-${patientId}`);
    if (!btn) return;

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

    try {
        const data = await apiRequest('/medify-batch/send-to-portal', {
            method: 'POST',
            body: JSON.stringify({ batchId, patientIds: [patientId] })
        });

        if (data.success && data.results[0]?.success) {
            showToast('Dokumen berhasil dikirim ke portal!', 'success');

            // Update card UI
            const card = document.getElementById(`patient-card-${patientId}`);
            if (card) {
                const badge = card.querySelector('.badge');
                if (badge) {
                    badge.className = 'badge badge-success';
                    badge.innerHTML = '<i class="fas fa-check"></i> Sudah Dikirim';
                }
                btn.remove();

                // Remove checkbox
                const checkbox = document.getElementById(`check-${patientId}`);
                if (checkbox) {
                    checkbox.closest('.custom-control').remove();
                }
            }

            // Update header counter
            const headerBadge = document.querySelector('#review-container .card-header .badge-light');
            if (headerBadge) {
                const match = headerBadge.textContent.match(/(\d+)\/(\d+)/);
                if (match) {
                    const sent = parseInt(match[1]) + 1;
                    const total = parseInt(match[2]);
                    headerBadge.textContent = `${sent}/${total} terkirim`;
                }
            }

            updateSelectedCount();
        } else {
            throw new Error(data.results[0]?.error || 'Unknown error');
        }

    } catch (error) {
        showToast('Gagal mengirim: ' + error.message, 'error');
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-paper-plane"></i> Kirim';
    }
}

/**
 * Send selected patients to portal (bulk)
 */
async function sendSelectedToPortal(batchId) {
    const checkboxes = document.querySelectorAll('.patient-checkbox:checked');
    const patientIds = Array.from(checkboxes).map(cb => cb.dataset.patientId);

    if (patientIds.length === 0) {
        showToast('Pilih minimal satu pasien', 'warning');
        return;
    }

    const btn = document.getElementById('btn-send-selected');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Mengirim...';

    try {
        const data = await apiRequest('/medify-batch/send-to-portal', {
            method: 'POST',
            body: JSON.stringify({ batchId, patientIds })
        });

        if (data.success) {
            showToast(`Berhasil mengirim ${data.summary.success} dari ${data.summary.total} pasien`, 'success');

            // Refresh the review section
            await loadReviewSection(batchId);
        }

    } catch (error) {
        showToast('Gagal mengirim: ' + error.message, 'error');
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-paper-plane mr-2"></i>Kirim yang Dipilih (<span id="selected-count">0</span>)';
        updateSelectedCount();
    }
}

/**
 * Toggle select all patients
 */
function toggleSelectAllPatients(checked) {
    const checkboxes = document.querySelectorAll('.patient-checkbox');
    checkboxes.forEach(cb => {
        if (!cb.disabled) {
            cb.checked = checked;
        }
    });
    updateSelectedCount();
}

/**
 * Update selected count badge
 */
function updateSelectedCount() {
    const checked = document.querySelectorAll('.patient-checkbox:checked').length;
    const countEl = document.getElementById('selected-count');
    const btn = document.getElementById('btn-send-selected');

    if (countEl) countEl.textContent = checked;
    if (btn) btn.disabled = checked === 0;
}

/**
 * Preview image in modal
 */
function previewImage(url, title) {
    // Create modal if not exists
    let modal = document.getElementById('image-preview-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'image-preview-modal';
        modal.className = 'modal fade';
        modal.innerHTML = `
            <div class="modal-dialog modal-lg">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title" id="preview-image-title">Preview</h5>
                        <button type="button" class="close" data-dismiss="modal">
                            <span>&times;</span>
                        </button>
                    </div>
                    <div class="modal-body text-center">
                        <img id="preview-image-src" src="" style="max-width: 100%; max-height: 70vh;">
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    document.getElementById('preview-image-src').src = url;
    document.getElementById('preview-image-title').textContent = title;
    $(modal).modal('show');
}

/**
 * Escape HTML for safe display
 */
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Load last review from the most recent successful batch
 */
async function loadLastReview() {
    try {
        const data = await apiRequest('/medify-batch/last-batch');
        if (data.success && data.batchId) {
            loadReviewSection(data.batchId);
            showToast(`Loaded review for batch from ${data.source} (${data.successCount} patients)`, 'info');
        } else {
            showToast('Tidak ada batch sync yang tersedia', 'warning');
        }
    } catch (error) {
        console.error('[MedifySync] Error loading last review:', error);
        showToast('Gagal memuat review: ' + error.message, 'error');
    }
}

// Export functions to window for onclick handlers
window.initMedifySync = initMedifySync;
window.startSync = startSync;
window.viewBatchDetails = viewBatchDetails;
window.showCredentialsModal = showCredentialsModal;
window.saveCredentials = saveCredentials;
window.testConnection = testConnection;

// Review & Send to Portal exports
window.loadReviewSection = loadReviewSection;
window.loadLastReview = loadLastReview;
window.togglePatientPreview = togglePatientPreview;
window.sendSingleToPortal = sendSingleToPortal;
window.sendSelectedToPortal = sendSelectedToPortal;
window.toggleSelectAllPatients = toggleSelectAllPatients;
window.updateSelectedCount = updateSelectedCount;
window.previewImage = previewImage;

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

// Export functions to window for onclick handlers
window.initMedifySync = initMedifySync;
window.startSync = startSync;
window.viewBatchDetails = viewBatchDetails;
window.showCredentialsModal = showCredentialsModal;
window.saveCredentials = saveCredentials;
window.testConnection = testConnection;

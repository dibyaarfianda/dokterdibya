/**
 * USG Bulk Upload Module
 * Handles bulk upload of USG photos from all Sunday Clinic locations
 */

import { getIdToken } from './vps-auth-v2.js';

// Use relative URL to avoid CORS issues with www vs non-www
const API_URL = window.location.hostname === 'localhost'
    ? 'http://localhost:3000/api'
    : '/api';

let currentPreviewData = null;
let currentZipFile = null;
let selectedHospital = null;
let hospitals = [];

/**
 * Initialize the bulk upload page
 */
export async function initBulkUploadUSG() {
    await loadHospitals();
    renderPage();
    setupEventListeners();
}

/**
 * Load available hospital locations
 */
async function loadHospitals() {
    try {
        const token = await getIdToken();
        const response = await fetch(`${API_URL}/usg-bulk-upload/hospitals`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        if (data.success) {
            hospitals = data.hospitals;
        }
    } catch (error) {
        console.error('Failed to load hospitals:', error);
        // Fallback hospitals
        hospitals = [
            { value: 'klinik_private', label: 'Klinik Privat' },
            { value: 'rsia_melinda', label: 'RSIA Melinda' },
            { value: 'rsud_gambiran', label: 'RSUD Gambiran' },
            { value: 'rs_bhayangkara', label: 'RS Bhayangkara' }
        ];
    }
}

/**
 * Render the page HTML
 */
function renderPage() {
    const container = document.getElementById('bulk-upload-usg-page');
    if (!container) return;

    const hospitalOptions = hospitals.map(h =>
        `<option value="${h.value}">${h.label}</option>`
    ).join('');

    container.innerHTML = `
        <div class="card">
            <div class="card-header">
                <h3 class="card-title">
                    <i class="fas fa-upload mr-2"></i>Bulk Upload Foto USG
                </h3>
                <div class="card-tools">
                    <span class="badge badge-info" id="selected-hospital-badge">Pilih Lokasi</span>
                </div>
            </div>
            <div class="card-body">
                <!-- Hospital & Date Selector -->
                <div class="row mb-4">
                    <div class="col-md-6">
                        <div class="form-group mb-0">
                            <label for="hospital-select"><strong><i class="fas fa-hospital mr-2"></i>Lokasi Rumah Sakit</strong></label>
                            <select class="form-control" id="hospital-select">
                                <option value="">-- Pilih Lokasi --</option>
                                ${hospitalOptions}
                            </select>
                        </div>
                    </div>
                    <div class="col-md-6">
                        <div class="form-group mb-0">
                            <label for="upload-date"><strong><i class="fas fa-calendar-alt mr-2"></i>Tanggal USG</strong></label>
                            <input type="date" class="form-control" id="upload-date" value="${new Date().toISOString().split('T')[0]}">
                            <small class="text-muted">Tanggal pemeriksaan pasien</small>
                        </div>
                    </div>
                </div>

                <!-- Instructions -->
                <div class="alert alert-info">
                    <h5><i class="fas fa-info-circle mr-2"></i>Petunjuk:</h5>
                    <ol class="mb-0">
                        <li>Pilih lokasi rumah sakit dan tanggal USG</li>
                        <li>Buat file ZIP berisi folder dengan nama pasien</li>
                        <li>Struktur: <code>NamaPasien1/file.jpg</code>, <code>NamaPasien2/file.jpg</code>, dst</li>
                        <li>Sistem akan otomatis mencocokkan nama folder dengan pasien</li>
                        <li>Review dan konfirmasi sebelum upload</li>
                    </ol>
                </div>

                <!-- Upload Zone (disabled until hospital selected) -->
                <div id="upload-zone" class="border border-dashed rounded p-5 text-center mb-4" style="border-width: 2px !important; cursor: pointer;">
                    <i class="fas fa-file-archive fa-3x text-muted mb-3"></i>
                    <h5>Drag & Drop file ZIP di sini</h5>
                    <p class="text-muted mb-3">atau klik untuk memilih file</p>
                    <input type="file" id="zip-file-input" accept=".zip" style="display: none;">
                    <button class="btn btn-primary" id="btn-select-file">
                        <i class="fas fa-folder-open mr-2"></i>Pilih File ZIP
                    </button>
                </div>

                <!-- Selected File Info -->
                <div id="file-info" class="d-none mb-4">
                    <div class="card bg-light">
                        <div class="card-body py-2">
                            <div class="d-flex justify-content-between align-items-center">
                                <div>
                                    <i class="fas fa-file-archive text-warning mr-2"></i>
                                    <span id="file-name"></span>
                                    <small class="text-muted ml-2" id="file-size"></small>
                                </div>
                                <button class="btn btn-sm btn-outline-danger" id="btn-clear-file">
                                    <i class="fas fa-times"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Preview Button -->
                <div id="preview-btn-container" class="d-none text-center mb-4">
                    <button class="btn btn-info btn-lg" id="btn-preview">
                        <i class="fas fa-search mr-2"></i>Preview & Cocokkan Pasien
                    </button>
                </div>

                <!-- Loading -->
                <div id="loading-preview" class="d-none text-center py-5">
                    <div class="spinner-border text-primary" role="status"></div>
                    <p class="mt-3 text-muted">Memproses file ZIP...</p>
                </div>

                <!-- Preview Results -->
                <div id="preview-results" class="d-none">
                    <div class="d-flex justify-content-between align-items-center mb-3">
                        <h5 class="mb-0">
                            <i class="fas fa-list mr-2"></i>Hasil Preview
                            <small class="text-muted ml-2" id="preview-date"></small>
                        </h5>
                        <div id="preview-summary"></div>
                    </div>

                    <div class="table-responsive">
                        <table class="table table-bordered table-hover" id="preview-table">
                            <thead class="thead-light">
                                <tr>
                                    <th style="width: 30px;">
                                        <input type="checkbox" id="select-all-folders" checked>
                                    </th>
                                    <th>Folder</th>
                                    <th>Nama Pasien</th>
                                    <th>Foto</th>
                                    <th>Pasien Cocok</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody id="preview-tbody"></tbody>
                        </table>
                    </div>

                    <div class="mt-4 text-center">
                        <button class="btn btn-secondary mr-2" id="btn-cancel-upload">
                            <i class="fas fa-times mr-2"></i>Batal
                        </button>
                        <button class="btn btn-success btn-lg" id="btn-execute-upload">
                            <i class="fas fa-cloud-upload-alt mr-2"></i>Upload Foto yang Dipilih
                        </button>
                    </div>
                </div>

                <!-- Upload Progress -->
                <div id="upload-progress" class="d-none">
                    <h5 class="mb-3">
                        <i class="fas fa-spinner fa-spin mr-2"></i>Mengupload...
                    </h5>
                    <div class="progress" style="height: 25px;">
                        <div class="progress-bar progress-bar-striped progress-bar-animated"
                             role="progressbar" style="width: 0%;" id="upload-progress-bar">0%</div>
                    </div>
                    <p class="text-muted mt-2" id="upload-status">Mempersiapkan upload...</p>
                </div>

                <!-- Upload Results -->
                <div id="upload-results" class="d-none">
                    <div class="alert alert-success" id="upload-success-alert">
                        <h5><i class="fas fa-check-circle mr-2"></i>Upload Selesai!</h5>
                        <p id="upload-result-summary"></p>
                    </div>
                    <div id="upload-result-details"></div>
                    <div class="mt-4 text-center">
                        <button class="btn btn-primary" id="btn-upload-again">
                            <i class="fas fa-redo mr-2"></i>Upload Lagi
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
    // Hospital selector
    const hospitalSelect = document.getElementById('hospital-select');
    hospitalSelect?.addEventListener('change', (e) => {
        selectedHospital = e.target.value;
        const hospitalBadge = document.getElementById('selected-hospital-badge');
        const uploadZone = document.getElementById('upload-zone');

        if (selectedHospital) {
            const hospital = hospitals.find(h => h.value === selectedHospital);
            hospitalBadge.textContent = hospital?.label || selectedHospital;
            hospitalBadge.className = 'badge badge-success';
            uploadZone.style.opacity = '1';
            uploadZone.style.pointerEvents = 'auto';
        } else {
            hospitalBadge.textContent = 'Pilih Lokasi';
            hospitalBadge.className = 'badge badge-info';
            uploadZone.style.opacity = '0.5';
            uploadZone.style.pointerEvents = 'none';
        }
    });

    // Initialize upload zone as disabled
    const uploadZone = document.getElementById('upload-zone');
    if (uploadZone) {
        uploadZone.style.opacity = '0.5';
        uploadZone.style.pointerEvents = 'none';
    }

    // File input
    const fileInput = document.getElementById('zip-file-input');
    const btnSelectFile = document.getElementById('btn-select-file');

    btnSelectFile?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!selectedHospital) {
            window.showError('Pilih lokasi rumah sakit terlebih dahulu');
            return;
        }
        fileInput?.click();
    });

    uploadZone?.addEventListener('click', () => {
        if (!selectedHospital) {
            window.showError('Pilih lokasi rumah sakit terlebih dahulu');
            return;
        }
        fileInput?.click();
    });

    fileInput?.addEventListener('change', (e) => {
        if (e.target.files?.[0]) {
            handleFileSelect(e.target.files[0]);
        }
    });

    // Drag and drop
    uploadZone?.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadZone.classList.add('bg-light');
    });

    uploadZone?.addEventListener('dragleave', () => {
        uploadZone.classList.remove('bg-light');
    });

    uploadZone?.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadZone.classList.remove('bg-light');
        if (e.dataTransfer.files?.[0]) {
            handleFileSelect(e.dataTransfer.files[0]);
        }
    });

    // Clear file
    document.getElementById('btn-clear-file')?.addEventListener('click', clearFile);

    // Preview button
    document.getElementById('btn-preview')?.addEventListener('click', previewUpload);

    // Cancel button
    document.getElementById('btn-cancel-upload')?.addEventListener('click', resetToUpload);

    // Execute upload
    document.getElementById('btn-execute-upload')?.addEventListener('click', executeUpload);

    // Upload again
    document.getElementById('btn-upload-again')?.addEventListener('click', resetToUpload);

    // Select all checkbox
    document.getElementById('select-all-folders')?.addEventListener('change', (e) => {
        document.querySelectorAll('.folder-checkbox').forEach(cb => {
            if (!cb.disabled) cb.checked = e.target.checked;
        });
    });
}

/**
 * Handle file selection
 */
function handleFileSelect(file) {
    if (!file.name.toLowerCase().endsWith('.zip')) {
        window.showError('Hanya file ZIP yang diizinkan');
        return;
    }

    currentZipFile = file;

    document.getElementById('file-name').textContent = file.name;
    document.getElementById('file-size').textContent = formatFileSize(file.size);
    document.getElementById('file-info').classList.remove('d-none');
    document.getElementById('preview-btn-container').classList.remove('d-none');
    document.getElementById('upload-zone').classList.add('d-none');
}

/**
 * Clear selected file
 */
function clearFile() {
    currentZipFile = null;
    currentPreviewData = null;
    document.getElementById('zip-file-input').value = '';
    document.getElementById('file-info').classList.add('d-none');
    document.getElementById('preview-btn-container').classList.add('d-none');
    document.getElementById('upload-zone').classList.remove('d-none');
    document.getElementById('preview-results').classList.add('d-none');
}

/**
 * Reset to upload state
 */
function resetToUpload() {
    clearFile();
    selectedHospital = null;
    document.getElementById('hospital-select').value = '';
    document.getElementById('selected-hospital-badge').textContent = 'Pilih Lokasi';
    document.getElementById('selected-hospital-badge').className = 'badge badge-info';
    document.getElementById('upload-zone').style.opacity = '0.5';
    document.getElementById('upload-zone').style.pointerEvents = 'none';
    document.getElementById('upload-progress').classList.add('d-none');
    document.getElementById('upload-results').classList.add('d-none');
}

/**
 * Preview upload - send ZIP to server for analysis
 */
async function previewUpload() {
    if (!currentZipFile) return;

    if (!selectedHospital) {
        window.showError('Pilih lokasi rumah sakit terlebih dahulu');
        return;
    }

    const loadingEl = document.getElementById('loading-preview');
    const previewBtnEl = document.getElementById('preview-btn-container');

    loadingEl.classList.remove('d-none');
    previewBtnEl.classList.add('d-none');

    try {
        const token = await getIdToken();
        const uploadDate = document.getElementById('upload-date').value;

        if (!uploadDate) {
            window.showError('Pilih tanggal USG terlebih dahulu');
            loadingEl.classList.add('d-none');
            previewBtnEl.classList.remove('d-none');
            return;
        }

        const formData = new FormData();
        formData.append('zipFile', currentZipFile);
        formData.append('hospital', selectedHospital);
        formData.append('date', uploadDate);

        const response = await fetch(`${API_URL}/usg-bulk-upload/preview`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            body: formData
        });

        const data = await response.json();

        if (!data.success) {
            throw new Error(data.message || 'Preview failed');
        }

        currentPreviewData = data;
        renderPreview(data);

    } catch (error) {
        console.error('Preview error:', error);
        window.showError('Gagal memproses file: ' + error.message);
        previewBtnEl.classList.remove('d-none');
    } finally {
        loadingEl.classList.add('d-none');
    }
}

/**
 * Render preview results
 */
function renderPreview(data) {
    document.getElementById('file-info').classList.add('d-none');
    document.getElementById('preview-results').classList.remove('d-none');

    // Date and Hospital
    document.getElementById('preview-date').textContent = `${data.hospitalName || ''} - ${formatDate(data.date)}`;

    // Summary
    document.getElementById('preview-summary').innerHTML = `
        <span class="badge badge-success mr-1">${data.summary.matched} cocok</span>
        <span class="badge badge-warning mr-1">${data.summary.noMatch} tidak cocok</span>
        <span class="badge badge-info">${data.summary.totalFiles} foto</span>
    `;

    // Table body
    const tbody = document.getElementById('preview-tbody');
    tbody.innerHTML = '';

    for (const folder of data.folders) {
        const isMatched = folder.status === 'matched';
        const hasMultiple = folder.status === 'multiple_matches';
        const isNoMatch = folder.status === 'no_match';

        let patientSelect = '';
        if (hasMultiple) {
            patientSelect = `
                <select class="form-control form-control-sm patient-select" data-folder="${folder.folderName}">
                    <option value="">-- Pilih Pasien --</option>
                    ${folder.matchedPatients.map(p => `
                        <option value="${p.patient_id}" data-mr="${p.mr_id}">${p.full_name} (${p.mr_id || 'No MR'})</option>
                    `).join('')}
                </select>
            `;
        } else if (isMatched && folder.matchedPatients[0]) {
            const p = folder.matchedPatients[0];
            patientSelect = `
                <span class="text-success">
                    <i class="fas fa-check mr-1"></i>${p.full_name}
                    <br><small class="text-muted">${p.mr_id || 'No MR'}</small>
                </span>
                <input type="hidden" class="selected-patient" value="${p.patient_id}" data-mr="${p.mr_id}">
            `;
        } else if (isNoMatch && data.allPatients?.length > 0) {
            patientSelect = `
                <select class="form-control form-control-sm patient-select" data-folder="${folder.folderName}">
                    <option value="">-- Pilih Manual --</option>
                    ${data.allPatients.map(p => `
                        <option value="${p.patient_id}" data-mr="${p.mr_id}">${p.full_name} (${p.mr_id || 'No MR'})</option>
                    `).join('')}
                </select>
            `;
        } else {
            patientSelect = '<span class="text-danger">Tidak ada pasien</span>';
        }

        let statusBadge = '';
        if (isMatched) {
            statusBadge = '<span class="badge badge-success">Cocok</span>';
        } else if (hasMultiple) {
            statusBadge = '<span class="badge badge-warning">Pilih Pasien</span>';
        } else {
            statusBadge = '<span class="badge badge-danger">Tidak Cocok</span>';
        }

        const row = document.createElement('tr');
        row.innerHTML = `
            <td>
                <input type="checkbox" class="folder-checkbox"
                       data-folder="${folder.folderName}"
                       ${isMatched ? 'checked' : ''}
                       ${isNoMatch && !data.allPatients?.length ? 'disabled' : ''}>
            </td>
            <td>
                <code>${folder.folderName}</code>
            </td>
            <td><strong>${folder.extractedName || '-'}</strong></td>
            <td>${folder.files.length} foto</td>
            <td>${patientSelect}</td>
            <td>${statusBadge}</td>
        `;
        tbody.appendChild(row);
    }
}

/**
 * Execute the upload
 */
async function executeUpload() {
    if (!currentZipFile || !currentPreviewData) return;

    // Collect mappings
    const mappings = [];
    document.querySelectorAll('.folder-checkbox:checked').forEach(cb => {
        const folderName = cb.dataset.folder;
        const folder = currentPreviewData.folders.find(f => f.folderName === folderName);
        if (!folder) return;

        let patient_id = null;
        let mr_id = null;

        // Check for selected patient (hidden input or select)
        const row = cb.closest('tr');
        const hiddenInput = row.querySelector('.selected-patient');
        const selectInput = row.querySelector('.patient-select');

        if (hiddenInput) {
            patient_id = hiddenInput.value;
            mr_id = hiddenInput.dataset.mr;
        } else if (selectInput && selectInput.value) {
            patient_id = selectInput.value;
            mr_id = selectInput.options[selectInput.selectedIndex].dataset.mr;
        }

        if (patient_id && mr_id) {
            mappings.push({
                folderName,
                patient_id,
                mr_id,
                files: folder.files
            });
        }
    });

    if (mappings.length === 0) {
        window.showError('Tidak ada folder yang dapat diupload. Pastikan ada pasien yang cocok.');
        return;
    }

    // Show progress
    document.getElementById('preview-results').classList.add('d-none');
    document.getElementById('upload-progress').classList.remove('d-none');

    const progressBar = document.getElementById('upload-progress-bar');
    const statusText = document.getElementById('upload-status');

    progressBar.style.width = '10%';
    progressBar.textContent = '10%';
    statusText.textContent = 'Mengupload file...';

    try {
        const token = await getIdToken();
        const formData = new FormData();
        formData.append('zipFile', currentZipFile);
        formData.append('mappings', JSON.stringify(mappings));
        formData.append('date', currentPreviewData.date);
        formData.append('hospital', currentPreviewData.hospital || selectedHospital);

        progressBar.style.width = '30%';
        progressBar.textContent = '30%';

        const response = await fetch(`${API_URL}/usg-bulk-upload/execute`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            body: formData
        });

        progressBar.style.width = '80%';
        progressBar.textContent = '80%';

        const data = await response.json();

        progressBar.style.width = '100%';
        progressBar.textContent = '100%';

        if (!data.success) {
            throw new Error(data.message || 'Upload failed');
        }

        // Show results
        setTimeout(() => {
            document.getElementById('upload-progress').classList.add('d-none');
            document.getElementById('upload-results').classList.remove('d-none');

            document.getElementById('upload-result-summary').textContent =
                `${data.summary.success} folder berhasil diupload, ${data.summary.skipped} dilewati, ${data.summary.errors} error`;

            // Details table
            let detailsHtml = '<table class="table table-sm"><thead><tr><th>Folder</th><th>Status</th><th>Keterangan</th></tr></thead><tbody>';
            for (const result of data.results) {
                const statusClass = result.status === 'success' ? 'success' : (result.status === 'skipped' ? 'warning' : 'danger');
                const statusText = result.status === 'success' ? `${result.photosUploaded} foto` : (result.reason || result.status);
                detailsHtml += `
                    <tr>
                        <td><code>${result.folder}</code></td>
                        <td><span class="badge badge-${statusClass}">${result.status}</span></td>
                        <td>${statusText}</td>
                    </tr>
                `;
            }
            detailsHtml += '</tbody></table>';
            document.getElementById('upload-result-details').innerHTML = detailsHtml;

            window.showSuccess(`Upload selesai! ${data.summary.success} folder berhasil.`);
        }, 500);

    } catch (error) {
        console.error('Upload error:', error);
        window.showError('Gagal upload: ' + error.message);
        document.getElementById('upload-progress').classList.add('d-none');
        document.getElementById('preview-results').classList.remove('d-none');
    }
}

/**
 * Format file size
 */
function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

/**
 * Format date
 */
function formatDate(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('id-ID', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });
}

// Export for module loading
export { };

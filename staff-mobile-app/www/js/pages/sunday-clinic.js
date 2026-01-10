/**
 * Sunday Clinic Entry Page
 * - Queue view (today's appointments)
 * - Patient search
 * - Walk-in option
 */

import { api } from '../api.js';
import { showToast, showLoading, hideLoading } from '../app.js';

// Store current record for navigation
let currentRecord = null;

export async function renderSundayClinic(container) {
    container.innerHTML = `
        <div class="fade-in">
            <!-- Mode Tabs -->
            <div class="mode-tabs">
                <button class="tab-btn active" data-mode="queue">
                    <i class="fas fa-clipboard-list"></i> Antrian
                </button>
                <button class="tab-btn" data-mode="search">
                    <i class="fas fa-search"></i> Cari Pasien
                </button>
            </div>

            <!-- Queue Mode -->
            <div id="queue-mode" class="mode-content">
                <div id="queue-list" class="list-container">
                    <div class="loading-state">
                        <i class="fas fa-spinner fa-spin"></i>
                        <p>Memuat antrian...</p>
                    </div>
                </div>
            </div>

            <!-- Search Mode -->
            <div id="search-mode" class="mode-content" style="display:none">
                <div class="search-bar">
                    <i class="fas fa-search"></i>
                    <input type="text" id="patient-search" placeholder="Nama, No. HP, atau MR ID..." autocomplete="off">
                </div>
                <div id="search-results" class="list-container">
                    <div class="empty-state">
                        <i class="fas fa-user-md"></i>
                        <p>Ketik minimal 2 karakter untuk mencari</p>
                    </div>
                </div>
            </div>

            <!-- Walk-in FAB -->
            <button id="walkin-fab" class="fab" title="Walk-in">
                <i class="fas fa-plus"></i>
            </button>
        </div>
    `;

    // Inject styles
    injectStyles();

    // Setup tab switching
    const tabBtns = container.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const mode = btn.dataset.mode;
            document.getElementById('queue-mode').style.display = mode === 'queue' ? 'block' : 'none';
            document.getElementById('search-mode').style.display = mode === 'search' ? 'block' : 'none';

            if (mode === 'search') {
                document.getElementById('patient-search').focus();
            }
        });
    });

    // Setup search
    const searchInput = document.getElementById('patient-search');
    let searchTimeout;
    searchInput.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        const query = searchInput.value.trim();

        if (query.length < 2) {
            document.getElementById('search-results').innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-user-md"></i>
                    <p>Ketik minimal 2 karakter untuk mencari</p>
                </div>
            `;
            return;
        }

        searchTimeout = setTimeout(() => searchPatients(query), 300);
    });

    // Setup walk-in FAB
    document.getElementById('walkin-fab').addEventListener('click', showWalkInModal);

    // Load today's queue
    await loadQueue();
}

async function loadQueue() {
    const listContainer = document.getElementById('queue-list');

    try {
        const response = await api.getTodayQueue();

        if (!response.success) {
            listContainer.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>${response.message || 'Gagal memuat antrian'}</p>
                </div>
            `;
            return;
        }

        const queue = response.data?.queue || response.queue || [];

        if (queue.length === 0) {
            listContainer.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-calendar-check"></i>
                    <p>Tidak ada antrian hari ini</p>
                </div>
            `;
            return;
        }

        renderQueueList(listContainer, queue);
    } catch (error) {
        listContainer.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-triangle"></i>
                <p>${error.message}</p>
            </div>
        `;
    }
}

function renderQueueList(container, queue) {
    container.innerHTML = queue.map(item => {
        const statusClass = getStatusClass(item.status);
        const time = item.slot_time ? item.slot_time.substring(0, 5) : '--:--';
        const mrId = item.mr_id || '-';

        return `
            <div class="list-item queue-item" data-mr="${mrId}" data-patient="${item.patient_id}" data-status="${item.status}">
                <div class="item-icon ${statusClass}">
                    <i class="fas fa-user"></i>
                </div>
                <div class="item-content">
                    <div class="item-title">${item.patient_name || 'Pasien'}</div>
                    <div class="item-subtitle">
                        ${mrId !== '-' ? `<span class="mr-tag">${mrId}</span>` : ''}
                        ${item.chief_complaint ? item.chief_complaint.substring(0, 30) + (item.chief_complaint.length > 30 ? '...' : '') : ''}
                    </div>
                </div>
                <div class="item-meta">
                    <span class="item-time">${time}</span>
                    <span class="status-badge ${statusClass}">${getStatusLabel(item.status)}</span>
                </div>
            </div>
        `;
    }).join('');

    // Add click handlers
    container.querySelectorAll('.queue-item').forEach(item => {
        item.addEventListener('click', () => {
            const mrId = item.dataset.mr;
            const patientId = item.dataset.patient;

            if (mrId && mrId !== '-') {
                openMedicalRecord(mrId);
            } else if (patientId) {
                // No MR yet, show option to create
                showCreateRecordModal(patientId, item.querySelector('.item-title').textContent);
            }
        });
    });
}

async function searchPatients(query) {
    const resultsContainer = document.getElementById('search-results');

    resultsContainer.innerHTML = `
        <div class="loading-state">
            <i class="fas fa-spinner fa-spin"></i>
            <p>Mencari...</p>
        </div>
    `;

    try {
        const response = await api.searchPatients(query);

        if (!response.success) {
            resultsContainer.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>${response.message || 'Gagal mencari'}</p>
                </div>
            `;
            return;
        }

        const patients = response.data?.patients || response.patients || [];

        if (patients.length === 0) {
            resultsContainer.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-user-slash"></i>
                    <p>Tidak ada hasil untuk "${query}"</p>
                </div>
            `;
            return;
        }

        renderPatientResults(resultsContainer, patients);
    } catch (error) {
        resultsContainer.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-triangle"></i>
                <p>${error.message}</p>
            </div>
        `;
    }
}

function renderPatientResults(container, patients) {
    container.innerHTML = patients.map(p => {
        const age = p.age || calculateAge(p.date_of_birth);

        return `
            <div class="list-item patient-item" data-id="${p.id}">
                <div class="item-icon">
                    <i class="fas fa-user"></i>
                </div>
                <div class="item-content">
                    <div class="item-title">${p.full_name || p.name || 'Pasien'}</div>
                    <div class="item-subtitle">
                        <span>${p.id}</span>
                        ${age ? `<span>• ${age} thn</span>` : ''}
                        ${p.phone ? `<span>• ${p.phone}</span>` : ''}
                    </div>
                </div>
                <div class="item-meta">
                    <i class="fas fa-chevron-right"></i>
                </div>
            </div>
        `;
    }).join('');

    // Add click handlers - show visit history
    container.querySelectorAll('.patient-item').forEach(item => {
        item.addEventListener('click', () => {
            showPatientVisits(item.dataset.id, item.querySelector('.item-title').textContent);
        });
    });
}

async function showPatientVisits(patientId, patientName) {
    showLoading();

    try {
        const response = await api.getPatientVisits(patientId);
        hideLoading();

        const visits = response.data?.visits || response.visits || [];

        // Create modal
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-sheet">
                <div class="modal-header">
                    <h3>${patientName}</h3>
                    <button class="modal-close"><i class="fas fa-times"></i></button>
                </div>
                <div class="modal-body">
                    ${visits.length === 0 ? `
                        <div class="empty-state small">
                            <i class="fas fa-folder-open"></i>
                            <p>Belum ada kunjungan</p>
                        </div>
                    ` : `
                        <div class="visit-list">
                            ${visits.map(v => `
                                <div class="visit-item" data-mr="${v.mr_id}">
                                    <div class="visit-icon ${getCategoryClass(v.mr_category)}">
                                        <i class="fas fa-file-medical"></i>
                                    </div>
                                    <div class="visit-info">
                                        <div class="visit-mr">${v.mr_id}</div>
                                        <div class="visit-date">${formatDate(v.created_at)}</div>
                                    </div>
                                    <div class="visit-meta">
                                        <span class="category-badge ${getCategoryClass(v.mr_category)}">${getCategoryLabel(v.mr_category)}</span>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    `}
                    <button class="btn-primary btn-block" id="btn-new-visit">
                        <i class="fas fa-plus"></i> Kunjungan Baru
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Close handlers
        modal.querySelector('.modal-close').addEventListener('click', () => modal.remove());
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });

        // Visit click handlers
        modal.querySelectorAll('.visit-item').forEach(item => {
            item.addEventListener('click', () => {
                modal.remove();
                openMedicalRecord(item.dataset.mr);
            });
        });

        // New visit button
        modal.querySelector('#btn-new-visit').addEventListener('click', () => {
            modal.remove();
            showCreateRecordModal(patientId, patientName);
        });

    } catch (error) {
        hideLoading();
        showToast(error.message, 'error');
    }
}

function showCreateRecordModal(patientId, patientName) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-sheet">
            <div class="modal-header">
                <h3>Kunjungan Baru</h3>
                <button class="modal-close"><i class="fas fa-times"></i></button>
            </div>
            <div class="modal-body">
                <p class="patient-info"><strong>${patientName}</strong></p>

                <div class="form-group">
                    <label>Kategori</label>
                    <div class="radio-group">
                        <label class="radio-item">
                            <input type="radio" name="category" value="obstetri" checked>
                            <span>Obstetri</span>
                        </label>
                        <label class="radio-item">
                            <input type="radio" name="category" value="gyn_repro">
                            <span>Gyn Repro</span>
                        </label>
                        <label class="radio-item">
                            <input type="radio" name="category" value="gyn_special">
                            <span>Gyn Special</span>
                        </label>
                    </div>
                </div>

                <div class="form-group">
                    <label>Lokasi</label>
                    <select id="visit-location">
                        <option value="klinik_private">Klinik Privat</option>
                        <option value="rsia_melinda">RSIA Melinda</option>
                        <option value="rsud_gambiran">RSUD Gambiran</option>
                        <option value="rs_bhayangkara">RS Bhayangkara</option>
                    </select>
                </div>

                <button class="btn-primary btn-block" id="btn-create-visit">
                    <i class="fas fa-plus"></i> Buat Rekam Medis
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // Close handlers
    modal.querySelector('.modal-close').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });

    // Create visit
    modal.querySelector('#btn-create-visit').addEventListener('click', async () => {
        const category = modal.querySelector('input[name="category"]:checked').value;
        const location = modal.querySelector('#visit-location').value;

        showLoading();

        try {
            const response = await api.startWalkIn(patientId, category, location);
            hideLoading();

            if (response.success) {
                const mrId = response.data?.mrId || response.mrId;
                modal.remove();
                showToast('Rekam medis berhasil dibuat');
                openMedicalRecord(mrId);
            } else {
                showToast(response.message || 'Gagal membuat rekam medis', 'error');
            }
        } catch (error) {
            hideLoading();
            showToast(error.message, 'error');
        }
    });
}

function showWalkInModal() {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-sheet">
            <div class="modal-header">
                <h3>Walk-in</h3>
                <button class="modal-close"><i class="fas fa-times"></i></button>
            </div>
            <div class="modal-body">
                <p class="info-text">Cari pasien terlebih dahulu untuk membuat kunjungan walk-in.</p>
                <button class="btn-primary btn-block" id="btn-goto-search">
                    <i class="fas fa-search"></i> Cari Pasien
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    modal.querySelector('.modal-close').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });

    modal.querySelector('#btn-goto-search').addEventListener('click', () => {
        modal.remove();
        // Switch to search tab
        document.querySelector('.tab-btn[data-mode="search"]').click();
    });
}

function openMedicalRecord(mrId) {
    // Navigate to medical record page
    import('../app.js').then(app => {
        // Store mrId in sessionStorage for medical-record page
        sessionStorage.setItem('current_mr_id', mrId);
        import('./medical-record.js').then(() => {
            // Navigate using router - will be implemented in app.js update
            window.dispatchEvent(new CustomEvent('navigate:medical-record', { detail: { mrId } }));
        });
    });
}

// ===== Helper Functions =====
function getStatusClass(status) {
    const classes = {
        'confirmed': 'waiting',
        'waiting': 'waiting',
        'arrived': 'pending',
        'in_progress': 'in-progress',
        'completed': 'done',
        'done': 'done',
        'cancelled': 'cancelled'
    };
    return classes[status] || 'waiting';
}

function getStatusLabel(status) {
    const labels = {
        'confirmed': 'Terjadwal',
        'waiting': 'Menunggu',
        'arrived': 'Hadir',
        'in_progress': 'Proses',
        'completed': 'Selesai',
        'done': 'Selesai',
        'cancelled': 'Batal'
    };
    return labels[status] || status;
}

function getCategoryClass(category) {
    const classes = {
        'obstetri': 'obstetri',
        'gyn_repro': 'gyn',
        'gyn_special': 'gyn'
    };
    return classes[category] || '';
}

function getCategoryLabel(category) {
    const labels = {
        'obstetri': 'OBS',
        'gyn_repro': 'GYN',
        'gyn_special': 'GYN-S'
    };
    return labels[category] || category;
}

function calculateAge(dob) {
    if (!dob) return null;
    const birth = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    return age;
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
}

function injectStyles() {
    if (document.getElementById('sunday-clinic-styles')) return;

    const style = document.createElement('style');
    style.id = 'sunday-clinic-styles';
    style.textContent = `
        .mode-tabs {
            display: flex;
            gap: 8px;
            padding: 16px;
            padding-bottom: 8px;
        }

        .mode-tabs .tab-btn {
            flex: 1;
            padding: 12px;
            border: none;
            border-radius: 12px;
            background: var(--color-bg-secondary);
            color: var(--color-text-secondary);
            font-size: 14px;
            font-weight: 500;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            transition: all 0.2s;
        }

        .mode-tabs .tab-btn.active {
            background: var(--color-primary);
            color: white;
        }

        .mode-content {
            padding: 8px 16px 80px;
        }

        .fab {
            position: fixed;
            bottom: calc(70px + env(safe-area-inset-bottom));
            right: 16px;
            width: 56px;
            height: 56px;
            border-radius: 16px;
            background: var(--color-primary);
            color: white;
            border: none;
            font-size: 20px;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 4px 12px rgba(124, 58, 237, 0.4);
            z-index: 100;
        }

        .queue-item .mr-tag {
            display: inline-block;
            padding: 2px 6px;
            background: var(--color-primary);
            color: white;
            border-radius: 4px;
            font-size: 11px;
            font-weight: 600;
            margin-right: 6px;
        }

        .loading-state, .empty-state.small {
            padding: 40px 20px;
            text-align: center;
            color: var(--color-text-secondary);
        }

        .loading-state i, .empty-state.small i {
            font-size: 32px;
            margin-bottom: 12px;
            opacity: 0.5;
        }

        /* Visit List in Modal */
        .visit-list {
            margin-bottom: 16px;
        }

        .visit-item {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 12px;
            background: var(--color-bg-secondary);
            border-radius: 12px;
            margin-bottom: 8px;
            cursor: pointer;
        }

        .visit-icon {
            width: 40px;
            height: 40px;
            border-radius: 10px;
            background: var(--color-bg-card);
            display: flex;
            align-items: center;
            justify-content: center;
            color: var(--color-text-secondary);
        }

        .visit-icon.obstetri {
            background: rgba(236, 72, 153, 0.15);
            color: #ec4899;
        }

        .visit-icon.gyn {
            background: rgba(59, 130, 246, 0.15);
            color: #3b82f6;
        }

        .visit-info {
            flex: 1;
        }

        .visit-mr {
            font-weight: 600;
            font-size: 14px;
        }

        .visit-date {
            font-size: 12px;
            color: var(--color-text-secondary);
        }

        .category-badge {
            padding: 4px 8px;
            border-radius: 6px;
            font-size: 11px;
            font-weight: 600;
        }

        .category-badge.obstetri {
            background: rgba(236, 72, 153, 0.15);
            color: #ec4899;
        }

        .category-badge.gyn {
            background: rgba(59, 130, 246, 0.15);
            color: #3b82f6;
        }

        /* Form elements in modal */
        .patient-info {
            padding: 12px;
            background: var(--color-bg-secondary);
            border-radius: 8px;
            margin-bottom: 16px;
        }

        .form-group {
            margin-bottom: 16px;
        }

        .form-group label {
            display: block;
            margin-bottom: 8px;
            font-weight: 500;
            font-size: 14px;
        }

        .radio-group {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        .radio-item {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 12px;
            background: var(--color-bg-secondary);
            border-radius: 8px;
            cursor: pointer;
        }

        .radio-item input {
            width: 18px;
            height: 18px;
            accent-color: var(--color-primary);
        }

        .form-group select {
            width: 100%;
            padding: 12px;
            border: 1px solid var(--color-bg-card);
            border-radius: 8px;
            background: var(--color-bg-secondary);
            color: var(--color-text);
            font-size: 14px;
        }

        .btn-block {
            width: 100%;
        }

        .info-text {
            text-align: center;
            color: var(--color-text-secondary);
            margin-bottom: 16px;
        }
    `;
    document.head.appendChild(style);
}

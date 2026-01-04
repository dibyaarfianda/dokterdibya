/**
 * Patient History Sidebar Component
 * Provides patient navigation, visit history, and data copy functionality
 */

import apiClient from '../utils/api-client.js';
import stateManager from '../utils/state-manager.js';

class PatientHistorySidebar {
    constructor() {
        this.isOpen = false;
        this.currentPatientId = null;
        this.currentMrId = null;
        this.todayQueue = [];
        this.visitHistory = [];
        this.selectedVisitForCopy = null;
        this.initialized = false;
    }

    /**
     * Initialize sidebar
     */
    async init() {
        if (this.initialized) return;

        console.log('[PatientSidebar] Initializing...');
        this.bindEvents();
        await this.loadTodayQueue();

        // Subscribe to state changes
        stateManager.subscribe('patientData', (patientData) => {
            console.log('[PatientSidebar] patientData changed:', patientData);
            if (patientData) {
                this.currentPatientId = patientData.id;
                console.log('[PatientSidebar] Loading visit history for patientId:', patientData.id);
                this.updateCurrentPatientInfo(patientData);
                this.loadVisitHistory(patientData.id);
                this.highlightCurrentPatientInQueue();
            }
        });

        // Also subscribe to currentMrId changes
        stateManager.subscribe('currentMrId', (mrId) => {
            if (mrId) {
                this.currentMrId = mrId;
                console.log('[PatientSidebar] currentMrId changed:', mrId);
                this.highlightCurrentPatientInQueue();
            }
        });

        // Check if state already has data (sidebar may init after record loaded)
        const currentState = stateManager.getState();
        console.log('[PatientSidebar] Checking existing state:', currentState);

        // Set currentMrId FIRST before loading visit history (so filter works)
        // State has currentMrId directly, not nested in recordData.record
        if (currentState.currentMrId) {
            this.currentMrId = currentState.currentMrId;
            console.log('[PatientSidebar] Set currentMrId from state:', this.currentMrId);
            this.highlightCurrentPatientInQueue();
        }

        // Then load visit history
        if (currentState.patientData) {
            this.currentPatientId = currentState.patientData.id;
            this.updateCurrentPatientInfo(currentState.patientData);
            this.loadVisitHistory(currentState.patientData.id);
        }

        this.initialized = true;
        console.log('[PatientSidebar] Initialized');
    }

    /**
     * Bind DOM events
     */
    bindEvents() {
        // Toggle sidebar
        const toggleBtn = document.getElementById('btn-toggle-patient-sidebar');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => this.toggle());
        }

        const closeBtn = document.getElementById('btn-close-patient-sidebar');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.close());
        }

        // Header Search Button - opens modal
        const headerSearchBtn = document.getElementById('btn-header-search');
        if (headerSearchBtn) {
            headerSearchBtn.addEventListener('click', () => this.openSearchModal());
        }

        // Modal Patient Search
        const modalSearchInput = document.getElementById('modal-patient-search');
        if (modalSearchInput) {
            modalSearchInput.addEventListener('input', this.debounce((e) => {
                this.searchPatientsModal(e.target.value);
            }, 300));

            modalSearchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.searchPatientsModal(e.target.value);
                }
            });
        }

        const modalSearchBtn = document.getElementById('btn-modal-search');
        if (modalSearchBtn) {
            modalSearchBtn.addEventListener('click', () => {
                const query = document.getElementById('modal-patient-search')?.value;
                this.searchPatientsModal(query);
            });
        }

        // Keyboard shortcut Ctrl+K for search
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                this.openSearchModal();
            }
        });

        // Clear search when modal closes
        $('#patientSearchModal').on('hidden.bs.modal', () => {
            const input = document.getElementById('modal-patient-search');
            const results = document.getElementById('modal-search-results');
            if (input) input.value = '';
            if (results) {
                results.innerHTML = `
                    <div class="text-center text-muted py-4">
                        <i class="fas fa-search fa-3x mb-3 text-secondary"></i>
                        <p class="mb-0">Ketik untuk mencari pasien</p>
                        <small class="text-muted">Tekan Enter atau klik tombol cari</small>
                    </div>
                `;
            }
        });

        // Focus input when modal opens
        $('#patientSearchModal').on('shown.bs.modal', () => {
            document.getElementById('modal-patient-search')?.focus();
        });

        // Refresh queue when dropdown is opened
        $('#header-queue-dropdown').parent().on('show.bs.dropdown', () => {
            console.log('[PatientSidebar] Queue dropdown opened, refreshing...');
            this.loadTodayQueue();
        });

        // Copy data button
        const copyBtn = document.getElementById('btn-copy-history-data');
        if (copyBtn) {
            copyBtn.addEventListener('click', () => this.showCopyDataModal());
        }

        // Confirm copy
        const confirmCopyBtn = document.getElementById('btn-confirm-copy');
        if (confirmCopyBtn) {
            confirmCopyBtn.addEventListener('click', () => this.executeCopyData());
        }

        // Handle section header collapse icons
        document.querySelectorAll('.patient-sidebar-section .section-header[data-toggle="collapse"]').forEach(header => {
            header.addEventListener('click', () => {
                const icon = header.querySelector('.toggle-icon');
                if (icon) {
                    const isExpanded = header.getAttribute('aria-expanded') === 'true';
                    header.setAttribute('aria-expanded', !isExpanded);
                }
            });
        });
    }

    /**
     * Toggle sidebar visibility
     */
    toggle() {
        this.isOpen ? this.close() : this.open();
    }

    open() {
        const sidebar = document.getElementById('patient-history-sidebar');
        const toggleBtn = document.getElementById('btn-toggle-patient-sidebar');

        if (sidebar) {
            sidebar.classList.add('open');
            document.body.classList.add('patient-sidebar-open');
            this.isOpen = true;

            if (toggleBtn) {
                toggleBtn.classList.add('active');
            }

            // Refresh data when opening
            this.loadTodayQueue();
            if (this.currentPatientId) {
                this.loadVisitHistory(this.currentPatientId);
            }
        }
    }

    close() {
        const sidebar = document.getElementById('patient-history-sidebar');
        const toggleBtn = document.getElementById('btn-toggle-patient-sidebar');

        if (sidebar) {
            sidebar.classList.remove('open');
            document.body.classList.remove('patient-sidebar-open');
            this.isOpen = false;

            if (toggleBtn) {
                toggleBtn.classList.remove('active');
            }
        }
    }

    /**
     * Load today's appointment queue
     */
    async loadTodayQueue() {
        const headerQueueList = document.getElementById('header-queue-list');
        const headerQueueCount = document.getElementById('header-queue-count');

        console.log('[PatientSidebar] loadTodayQueue called');

        // Show loading state
        if (headerQueueList) {
            headerQueueList.innerHTML = `
                <div class="text-center text-muted p-3">
                    <i class="fas fa-spinner fa-spin"></i> Memuat antrian...
                </div>
            `;
        }

        try {
            console.log('[PatientSidebar] Fetching queue from API...');
            const response = await apiClient.get('/api/sunday-clinic/queue/today');
            console.log('[PatientSidebar] Queue API response:', response);

            if (response.success) {
                this.todayQueue = response.data || [];
                console.log('[PatientSidebar] Queue loaded:', this.todayQueue.length, 'items');
                this.renderQueue();

                // Update header queue count
                if (headerQueueCount) {
                    headerQueueCount.textContent = this.todayQueue.length;
                }
            } else {
                console.warn('[PatientSidebar] API returned success=false:', response.message);
                if (headerQueueList) {
                    headerQueueList.innerHTML = `
                        <div class="text-center text-muted p-3">
                            <i class="fas fa-exclamation-triangle text-warning"></i>
                            <p class="mb-0 small mt-1">${response.message || 'Gagal memuat antrian'}</p>
                        </div>
                    `;
                }
            }
        } catch (error) {
            console.error('[PatientSidebar] Failed to load queue:', error);
            if (headerQueueList) {
                headerQueueList.innerHTML = `
                    <div class="text-center text-muted p-3">
                        <i class="fas fa-exclamation-triangle text-warning"></i>
                        <p class="mb-0 small mt-1">Gagal memuat antrian</p>
                        <small class="text-muted">${error.message || 'Error'}</small>
                    </div>
                `;
            }
        }
    }

    /**
     * Render queue list - renders to header dropdown
     */
    renderQueue() {
        const container = document.getElementById('header-queue-list');
        if (!container) return;

        if (this.todayQueue.length === 0) {
            container.innerHTML = `
                <div class="text-center text-muted p-4">
                    <i class="fas fa-calendar-check fa-2x mb-2 text-secondary"></i>
                    <p class="mb-0">Tidak ada antrian hari ini</p>
                </div>
            `;
            return;
        }

        container.innerHTML = this.todayQueue.map((apt, index) => {
            const isActive = apt.mr_id === this.currentMrId || apt.patient_id === this.currentPatientId;
            const chiefComplaint = apt.chief_complaint ? apt.chief_complaint.substring(0, 30) + (apt.chief_complaint.length > 30 ? '...' : '') : '-';
            const selesaiClass = apt.has_record ? 'patient-selesai' : '';

            return `
                <div class="header-queue-item ${isActive ? 'active' : ''}"
                     data-patient-id="${apt.patient_id}"
                     data-mr-id="${apt.mr_id || ''}"
                     data-appointment-id="${apt.id}"
                     onclick="window.patientSidebar.switchToPatient('${apt.patient_id}', '${apt.mr_id || ''}', '${apt.id}')">
                    <span class="queue-number">${index + 1}</span>
                    <div class="queue-info">
                        <div class="queue-name ${selesaiClass}">${this.escapeHtml(apt.patient_name)}</div>
                        <div class="queue-meta">${apt.slot_time || apt.session_label} • ${chiefComplaint}</div>
                    </div>
                    <div class="queue-status">
                        ${apt.has_record ? '<i class="fas fa-check-circle text-success" title="Sudah ada rekam medis"></i>' : '<i class="far fa-circle text-muted" title="Belum diisi"></i>'}
                    </div>
                </div>
            `;
        }).join('');
    }

    /**
     * Highlight current patient in queue - for header dropdown
     */
    highlightCurrentPatientInQueue() {
        document.querySelectorAll('.header-queue-item').forEach(item => {
            const mrId = item.dataset.mrId;
            const patientId = item.dataset.patientId;

            if (mrId === this.currentMrId || patientId === this.currentPatientId) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });
    }

    /**
     * Open search modal
     */
    openSearchModal() {
        $('#patientSearchModal').modal('show');
    }

    /**
     * Search patients (modal version)
     */
    async searchPatientsModal(query) {
        const container = document.getElementById('modal-search-results');
        if (!container) return;

        if (!query || query.length < 2) {
            container.innerHTML = `
                <div class="text-center text-muted py-4">
                    <i class="fas fa-search fa-3x mb-3 text-secondary"></i>
                    <p class="mb-0">Ketik minimal 2 karakter</p>
                </div>
            `;
            return;
        }

        container.innerHTML = '<div class="text-center p-4"><i class="fas fa-spinner fa-spin fa-2x"></i></div>';

        try {
            const response = await apiClient.get(`/api/sunday-clinic/directory?search=${encodeURIComponent(query)}`);

            if (response.success && response.data?.patients) {
                this.renderModalSearchResults(response.data.patients);
            } else {
                container.innerHTML = `
                    <div class="text-center text-muted py-4">
                        <i class="fas fa-user-slash fa-2x mb-3"></i>
                        <p class="mb-0">Tidak ditemukan</p>
                        <small class="text-muted">Coba kata kunci lain</small>
                    </div>
                `;
            }
        } catch (error) {
            console.error('[PatientSidebar] Search failed:', error);
            container.innerHTML = `
                <div class="text-center text-danger py-4">
                    <i class="fas fa-exclamation-triangle fa-2x mb-3"></i>
                    <p class="mb-0">Pencarian gagal</p>
                </div>
            `;
        }
    }

    /**
     * Render modal search results
     */
    renderModalSearchResults(patients) {
        const container = document.getElementById('modal-search-results');
        if (!container) return;

        if (!patients || patients.length === 0) {
            container.innerHTML = `
                <div class="text-center text-muted py-4">
                    <i class="fas fa-user-slash fa-2x mb-3"></i>
                    <p class="mb-0">Tidak ditemukan</p>
                </div>
            `;
            return;
        }

        // Take first 15 results
        const limited = patients.slice(0, 15);

        container.innerHTML = limited.map(p => {
            const latestVisit = p.visits && p.visits.length > 0 ? p.visits[0] : null;
            const initials = p.fullName ? p.fullName.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase() : '?';

            return `
                <div class="search-result-item" onclick="window.patientSidebar.openPatientFromSearch('${p.patientId}', '${latestVisit?.mrId || ''}'); $('#patientSearchModal').modal('hide');">
                    <div class="patient-avatar">${initials}</div>
                    <div class="patient-info">
                        <div class="patient-name">${this.escapeHtml(p.fullName)}</div>
                        <div class="patient-details">
                            ${p.phone || p.whatsapp || '-'}
                            ${p.age ? ` • ${p.age} tahun` : ''}
                        </div>
                        ${latestVisit ? `<div class="patient-mr">${latestVisit.mrId}</div>` : ''}
                    </div>
                </div>
            `;
        }).join('');
    }

    /**
     * Update current patient info display
     */
    updateCurrentPatientInfo(patient) {
        const container = document.getElementById('current-patient-info');
        if (!container || !patient) return;

        const name = patient.full_name || patient.name || patient.fullName || '-';
        const phone = patient.whatsapp || patient.phone || '';
        const age = patient.age || '';

        container.innerHTML = `
            <div class="patient-name">${this.escapeHtml(name)}</div>
            <div class="patient-meta">
                <span><i class="fas fa-id-badge mr-1"></i>${patient.id}</span>
                ${age ? `<span class="ml-2"><i class="fas fa-birthday-cake mr-1"></i>${age} tahun</span>` : ''}
            </div>
            ${phone ? `
                <div class="patient-meta">
                    <span><i class="fas fa-phone mr-1"></i>${phone}</span>
                </div>
            ` : ''}
        `;
    }

    /**
     * Load visit history for patient
     */
    async loadVisitHistory(patientId) {
        console.log('[PatientSidebar] loadVisitHistory called with patientId:', patientId);
        const container = document.getElementById('visit-history-list');
        const countBadge = document.getElementById('visit-count');
        const copyBtn = document.getElementById('btn-copy-history-data');

        if (!container) {
            console.log('[PatientSidebar] container not found!');
            return;
        }

        container.innerHTML = '<div class="text-center p-3"><i class="fas fa-spinner fa-spin"></i></div>';

        try {
            const response = await apiClient.get(`/api/sunday-clinic/patient-visits/${patientId}`);
            console.log('[PatientSidebar] API response:', response);

            if (response.success) {
                // Get visits excluding current one, then take last 5
                const allVisits = response.data || [];
                this.visitHistory = allVisits
                    .filter(v => v.mr_id !== this.currentMrId)
                    .slice(0, 5);
                this.renderVisitHistory();

                if (countBadge) {
                    countBadge.textContent = this.visitHistory.length;
                }

                // Enable copy button if there's history
                if (copyBtn) {
                    copyBtn.disabled = this.visitHistory.length === 0;
                }
            }
        } catch (error) {
            console.error('[PatientSidebar] Failed to load visit history:', error);
            container.innerHTML = `
                <div class="text-center text-muted p-3">
                    <i class="fas fa-exclamation-triangle text-warning"></i>
                    <p class="mb-0 small mt-1">Gagal memuat riwayat</p>
                </div>
            `;
        }
    }

    /**
     * Render visit history
     */
    renderVisitHistory() {
        const container = document.getElementById('visit-history-list');
        if (!container) return;

        if (this.visitHistory.length === 0) {
            container.innerHTML = `
                <div class="text-center text-muted p-3">
                    <i class="fas fa-folder-open fa-2x mb-2"></i>
                    <p class="mb-0 small">Belum ada riwayat kunjungan</p>
                </div>
            `;
            return;
        }

        container.innerHTML = this.visitHistory.map((visit, index) => {
            const categoryLabel = this.getCategoryLabel(visit.mr_category);

            return `
                <div class="visit-card" data-mr-id="${visit.mr_id}">
                    <div class="visit-card-header" data-toggle="collapse" data-target="#visit-detail-${index}">
                        <div>
                            <div class="visit-mr">${visit.mr_id}</div>
                            <div class="visit-date">${this.formatDate(visit.visit_date)}</div>
                        </div>
                        <div class="d-flex align-items-center">
                            <span class="location-badge" style="background: ${visit.location_color || '#3c8dbc'}; color: #fff;">
                                ${visit.location_short || 'Klinik'}
                            </span>
                            <i class="fas fa-chevron-down ml-2"></i>
                        </div>
                    </div>
                    <div class="collapse" id="visit-detail-${index}">
                        <div class="visit-card-body">
                            <div class="mb-2">
                                <strong>Kategori:</strong> ${categoryLabel}
                            </div>
                            <div id="visit-resume-${index}" class="mb-2">
                                <button class="btn btn-sm btn-outline-info btn-block"
                                        onclick="event.stopPropagation(); window.patientSidebar.loadResume('${visit.mr_id}', ${index})">
                                    <i class="fas fa-file-medical mr-1"></i>Muat Resume
                                </button>
                            </div>
                            <button class="btn btn-sm btn-warning btn-block"
                                    onclick="event.stopPropagation(); window.patientSidebar.selectForCopy('${visit.mr_id}')">
                                <i class="fas fa-copy mr-1"></i>Salin Data dari Kunjungan Ini
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    /**
     * Load resume medis for a visit
     */
    async loadResume(mrId, index) {
        const container = document.getElementById(`visit-resume-${index}`);
        if (!container) return;

        container.innerHTML = '<div class="text-center"><i class="fas fa-spinner fa-spin"></i> Memuat...</div>';

        try {
            const response = await apiClient.get(`/api/medical-records/resume/${mrId}`);

            if (response.success && response.data) {
                const resumeText = response.data.resume || response.data.diagnosis || 'Resume tidak tersedia';
                container.innerHTML = `
                    <div class="resume-preview">${this.escapeHtml(resumeText)}</div>
                `;
            } else {
                container.innerHTML = '<div class="text-muted small">Resume tidak tersedia</div>';
            }
        } catch (error) {
            console.error('[PatientSidebar] Failed to load resume:', error);
            container.innerHTML = '<div class="text-danger small">Gagal memuat resume</div>';
        }
    }

    /**
     * Switch to different patient
     */
    async switchToPatient(patientId, mrId, appointmentId) {
        // Check for unsaved changes
        const isDirty = stateManager.get('isDirty');

        if (isDirty) {
            const confirmed = confirm('Ada perubahan yang belum disimpan. Lanjutkan tanpa menyimpan?');
            if (!confirmed) return;
        }

        if (mrId) {
            // Navigate to existing MR
            window.location.href = `/staff/public/sunday-clinic.html?mr=${mrId}`;
        } else if (appointmentId) {
            // Need to create MR from appointment - open directory
            this.openDirectory(patientId);
        } else {
            // Open directory for this patient
            this.openDirectory(patientId);
        }
    }

    /**
     * Open patient from search
     */
    openPatientFromSearch(patientId, mrId) {
        if (mrId) {
            window.location.href = `/staff/public/sunday-clinic.html?mr=${mrId}`;
        } else {
            this.openDirectory(patientId);
        }
    }

    /**
     * Open directory overlay
     */
    openDirectory(patientId) {
        const overlay = document.getElementById('sc-directory-overlay');
        if (overlay) {
            overlay.hidden = false;
            overlay.setAttribute('aria-hidden', 'false');

            // Pre-fill search if patient ID provided
            if (patientId) {
                const searchInput = document.getElementById('sc-directory-search');
                if (searchInput) {
                    searchInput.value = patientId;
                    searchInput.dispatchEvent(new Event('input'));
                }
            }
        }
    }

    /**
     * Select visit for copy
     */
    selectForCopy(mrId) {
        this.selectedVisitForCopy = mrId;
        this.showCopyDataModal();
    }

    /**
     * Show copy data modal
     */
    async showCopyDataModal() {
        // Use selected visit or find the most recent non-current visit
        let mrId = this.selectedVisitForCopy;

        if (!mrId) {
            const otherVisit = this.visitHistory.find(v => v.mr_id !== this.currentMrId);
            if (otherVisit) {
                mrId = otherVisit.mr_id;
            }
        }

        if (!mrId) {
            window.showToast('warning', 'Tidak ada kunjungan sebelumnya untuk disalin');
            return;
        }

        const previewContainer = document.getElementById('copy-data-preview');
        const confirmBtn = document.getElementById('btn-confirm-copy');

        if (!previewContainer) return;

        previewContainer.innerHTML = `
            <div class="text-center py-4">
                <i class="fas fa-spinner fa-spin fa-2x mb-2"></i>
                <p class="mb-0">Memuat data dari ${mrId}...</p>
            </div>
        `;

        if (confirmBtn) confirmBtn.disabled = true;

        // Show modal
        $('#copyDataModal').modal('show');

        try {
            const response = await apiClient.get(`/api/medical-records/copyable-data/${mrId}`);

            if (response.success && response.data) {
                this.renderCopyPreview(response.data, mrId, previewContainer);
                if (confirmBtn) confirmBtn.disabled = false;
            } else {
                previewContainer.innerHTML = '<div class="text-warning text-center py-4">Tidak ada data yang bisa disalin</div>';
            }
        } catch (error) {
            console.error('[PatientSidebar] Failed to load copyable data:', error);
            previewContainer.innerHTML = '<div class="text-danger text-center py-4">Gagal memuat data</div>';
        }
    }

    /**
     * Render copyable data preview with checkboxes
     */
    renderCopyPreview(data, mrId, container) {
        const fieldLabels = {
            'blood_type': 'Golongan Darah',
            'golonganDarah': 'Golongan Darah',
            'golongan_darah': 'Golongan Darah',
            'rhesus_factor': 'Rhesus',
            'rhesus': 'Rhesus',
            'drug_allergies': 'Alergi Obat',
            'alergiObat': 'Alergi Obat',
            'alergi_obat': 'Alergi Obat',
            'food_allergies': 'Alergi Makanan',
            'alergiMakanan': 'Alergi Makanan',
            'alergi_makanan': 'Alergi Makanan',
            'other_allergies': 'Alergi Lain',
            'alergiLain': 'Alergi Lain',
            'alergi_lingkungan': 'Alergi Lingkungan',
            'past_medical_history': 'Riwayat Penyakit Dahulu',
            'riwayatPenyakitDahulu': 'Riwayat Penyakit Dahulu',
            'detail_riwayat_penyakit': 'Riwayat Penyakit Dahulu',
            'family_medical_history': 'Riwayat Penyakit Keluarga',
            'riwayatPenyakitKeluarga': 'Riwayat Penyakit Keluarga',
            'riwayat_keluarga': 'Riwayat Penyakit Keluarga',
            'gravida_count': 'Gravida',
            'gravida': 'Gravida',
            'para_count': 'Para',
            'para': 'Para',
            'abortus_count': 'Abortus',
            'abortus': 'Abortus',
            'living_children_count': 'Anak Hidup',
            'anakHidup': 'Anak Hidup',
            'anak_hidup': 'Anak Hidup',
            'previous_contraception': 'Riwayat KB',
            'riwayatKB': 'Riwayat KB',
            'metode_kb_terakhir': 'Riwayat KB',
            'pregnancy_history': 'Riwayat Kehamilan',
            'riwayatKehamilan': 'Riwayat Kehamilan',
            'riwayat_kehamilan_saat_ini': 'Riwayat Kehamilan',
            'menarche_age': 'Usia Menarche',
            'menarche': 'Usia Menarche',
            'usia_menarche': 'Usia Menarche',
            'cycle_length': 'Siklus Haid',
            'siklusHaid': 'Siklus Haid',
            'lama_siklus': 'Lama Siklus',
            'cycle_regular': 'Keteraturan Siklus',
            'siklusTeratur': 'Keteraturan Siklus',
            'siklus_teratur': 'Keteraturan Siklus'
        };

        const fields = Object.keys(data);

        if (fields.length === 0) {
            container.innerHTML = '<div class="text-warning text-center py-4">Tidak ada data yang bisa disalin dari kunjungan ini</div>';
            return;
        }

        let html = `
            <div class="mb-3">
                <strong>Data dari: ${mrId}</strong>
            </div>
            <div class="form-check mb-3">
                <input class="form-check-input" type="checkbox" id="select-all-copy" checked onchange="window.patientSidebar.toggleAllCopyFields(this.checked)">
                <label class="form-check-label font-weight-bold" for="select-all-copy">Pilih Semua</label>
            </div>
            <hr>
            <div class="copy-fields-list">
        `;

        fields.forEach(field => {
            const value = data[field];
            const label = fieldLabels[field] || field;
            let displayValue = '';

            if (typeof value === 'object') {
                if (Array.isArray(value)) {
                    displayValue = value.length > 0 ? `${value.length} item` : '-';
                } else {
                    displayValue = JSON.stringify(value).substring(0, 50) + '...';
                }
            } else {
                displayValue = String(value);
            }

            html += `
                <div class="copy-field-row">
                    <div class="form-check">
                        <input class="form-check-input copy-field-checkbox" type="checkbox"
                               id="copy-${field}" data-key="${field}"
                               data-value='${JSON.stringify(value).replace(/'/g, "&#39;")}' checked>
                        <label class="form-check-label" for="copy-${field}">
                            <span class="copy-field-label">${label}:</span>
                            <span class="copy-field-value ml-2">${this.escapeHtml(displayValue)}</span>
                        </label>
                    </div>
                </div>
            `;
        });

        html += '</div>';
        container.innerHTML = html;

        // Store source MR ID
        container.dataset.sourceMrId = mrId;
    }

    /**
     * Toggle all copy field checkboxes
     */
    toggleAllCopyFields(checked) {
        document.querySelectorAll('.copy-field-checkbox').forEach(cb => {
            cb.checked = checked;
        });
    }

    /**
     * Execute copy data to current form
     */
    async executeCopyData() {
        const checkboxes = document.querySelectorAll('.copy-field-checkbox:checked');
        const dataToCopy = {};

        checkboxes.forEach(cb => {
            const key = cb.dataset.key;
            try {
                const value = JSON.parse(cb.dataset.value);
                dataToCopy[key] = value;
            } catch (e) {
                dataToCopy[key] = cb.dataset.value;
            }
        });

        if (Object.keys(dataToCopy).length === 0) {
            window.showToast('warning', 'Pilih minimal satu data untuk disalin');
            return;
        }

        // Get current anamnesa data
        const currentRecordData = stateManager.get('recordData') || {};
        const currentAnamnesa = currentRecordData.anamnesa || {};

        // Merge copied data into anamnesa
        const mergedAnamnesa = { ...currentAnamnesa, ...dataToCopy };

        // Update state
        stateManager.setState({
            recordData: {
                ...currentRecordData,
                anamnesa: mergedAnamnesa
            },
            isDirty: true
        });

        // Close modal
        $('#copyDataModal').modal('hide');

        // Reset selection
        this.selectedVisitForCopy = null;

        // Show success notification
        this.showNotification('Data berhasil disalin ke form. Silakan review dan simpan.', 'success');

        // Trigger re-render if the app supports it
        if (window.sundayClinicApp && typeof window.sundayClinicApp.render === 'function') {
            const activeSection = stateManager.get('activeSection');
            if (activeSection) {
                await window.sundayClinicApp.render(activeSection);
            }
        }
    }

    // ==================== HELPER METHODS ====================

    formatDate(dateStr) {
        if (!dateStr) return '-';
        const date = new Date(dateStr);
        return date.toLocaleDateString('id-ID', {
            day: 'numeric',
            month: 'short',
            year: 'numeric'
        });
    }

    getCategoryLabel(category) {
        const labels = {
            'obstetri': 'Obstetri (Kehamilan)',
            'gyn_repro': 'Program Hamil',
            'gyn_special': 'Ginekologi Umum'
        };
        return labels[category] || category || '-';
    }

    escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    showNotification(message, type = 'info') {
        // Use existing notification system if available
        if (window.Swal) {
            window.Swal.fire({
                toast: true,
                position: 'top-end',
                icon: type,
                title: message,
                showConfirmButton: false,
                timer: 3000
            });
            return;
        }

        // Fallback to simple toast
        const toast = document.createElement('div');
        toast.className = `alert alert-${type} position-fixed shadow`;
        toast.style.cssText = 'top: 70px; right: 20px; z-index: 9999; min-width: 280px; max-width: 400px;';
        toast.innerHTML = `
            <i class="fas fa-${type === 'success' ? 'check-circle' : 'info-circle'} mr-2"></i>
            ${message}
        `;
        document.body.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transition = 'opacity 0.3s';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
}

// Create and export singleton instance
const patientSidebar = new PatientHistorySidebar();

// Expose to window for onclick handlers
window.patientSidebar = patientSidebar;

export default patientSidebar;

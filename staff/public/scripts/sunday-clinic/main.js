/**
 * Sunday Clinic Main Router
 * Dynamically loads components based on MR category
 */

import { MR_CATEGORIES, SECTIONS } from './utils/constants.js';
import apiClient from './utils/api-client.js';
import stateManager from './utils/state-manager.js';

class SundayClinicApp {
    constructor() {
        this.currentMrId = null;
        this.currentCategory = null;
        this.components = {};
        this.initialized = false;
    }

    /**
     * Initialize the application
     */
    async init(mrId, activeSection = SECTIONS.IDENTITY) {
        try {
            console.log('[SundayClinic] Initializing with MR ID:', mrId, 'Section:', activeSection);

            // Show loading state
            this.showLoading();

            // Fetch record data
            const response = await apiClient.getRecord(mrId);

            if (!response.success) {
                throw new Error(response.message || 'Failed to load record');
            }

            // Load into state manager
            await stateManager.loadRecord(response.data);

            // Get category
            this.currentMrId = mrId;
            this.currentCategory = response.data.record.mr_category ||
                                  response.data.intake?.summary?.intakeCategory ||
                                  MR_CATEGORIES.OBSTETRI;

            console.log('[SundayClinic] Category detected:', this.currentCategory);

            // Load template-specific components
            await this.loadComponents();

            // Render the application with active section
            await this.render(activeSection);

            this.initialized = true;

            console.log('[SundayClinic] Initialization complete');

        } catch (error) {
            console.error('[SundayClinic] Initialization failed:', error);
            this.showError(error.message);
        }
    }

    /**
     * Determine component paths based on category
     */
    getComponentPaths() {
        const basePath = '/staff/public/scripts/sunday-clinic/components';

        // Shared components (same for all templates)
        const shared = [
            { section: SECTIONS.IDENTITY, path: `${basePath}/shared/identity-section.js` },
            { section: SECTIONS.PHYSICAL_EXAM, path: `${basePath}/shared/physical-exam.js` },
            { section: SECTIONS.PENUNJANG, path: `${basePath}/shared/penunjang.js` },
            { section: SECTIONS.DIAGNOSIS, path: `${basePath}/shared/diagnosis.js` },
            { section: SECTIONS.PLAN, path: `${basePath}/shared/plan.js` },
            { section: SECTIONS.BILLING, path: `${basePath}/shared/billing.js` }
        ];

        // Template-specific components (vary by category)
        const categoryFolder = this.currentCategory;
        const specific = [
            { section: SECTIONS.ANAMNESA, path: `${basePath}/${categoryFolder}/anamnesa-${categoryFolder}.js` },
            { section: SECTIONS.USG, path: `${basePath}/${categoryFolder}/usg-${categoryFolder}.js` }
        ];

        // Obstetri-specific components
        if (this.currentCategory === MR_CATEGORIES.OBSTETRI) {
            specific.push(
                { section: SECTIONS.PEMERIKSAAN_OBSTETRI, path: `${basePath}/obstetri/pemeriksaan-obstetri.js` }
            );
        }

        return [...shared, ...specific];
    }

    /**
     * Dynamically load component modules
     */
    async loadComponents() {
        const componentPaths = this.getComponentPaths();

        for (const { section, path } of componentPaths) {
            try {
                const module = await import(path);
                this.components[section] = module.default || module;
                console.log(`[SundayClinic] Loaded component: ${section}`);
            } catch (error) {
                console.error(`[SundayClinic] Failed to load component ${section}:`, error);
                // For now, continue even if a component fails to load
                this.components[section] = this.createPlaceholderComponent(section);
            }
        }
    }

    /**
     * Create placeholder component for missing modules
     */
    createPlaceholderComponent(section) {
        return {
            render: (data) => {
                return `
                    <div class="alert alert-warning">
                        <i class="fas fa-construction"></i>
                        <strong>Section: ${section}</strong>
                        <p>Component under development</p>
                    </div>
                `;
            },
            save: async () => {
                console.warn(`[${section}] Save not implemented`);
                return { success: true };
            }
        };
    }

    /**
     * Render specific section (one at a time)
     */
    async render(activeSection = SECTIONS.IDENTITY) {
        const container = document.getElementById('sunday-clinic-content');
        if (!container) {
            console.error('[SundayClinic] Container not found');
            return;
        }

        const state = stateManager.getState();
        let html = '';

        // Render category badge
        html += this.renderCategoryBadge();

        // Render ONLY the active section
        const component = this.components[activeSection];
        if (component) {
            try {
                const sectionHtml = await component.render(state);
                html += `
                    <div class="section-container" data-section="${activeSection}">
                        ${sectionHtml}
                    </div>
                `;
            } catch (error) {
                console.error(`[SundayClinic] Error rendering ${activeSection}:`, error);
                html += `
                    <div class="alert alert-danger">
                        <i class="fas fa-exclamation-triangle"></i>
                        Error rendering section: ${activeSection}
                    </div>
                `;
            }
        } else {
            html += `
                <div class="alert alert-warning">
                    <i class="fas fa-info-circle"></i>
                    Section not found: ${activeSection}
                </div>
            `;
        }

        container.innerHTML = html;

        // Attach event listeners
        this.attachEventListeners();

        // Store current section
        stateManager.setActiveSection(activeSection);

        // Hide loading
        this.hideLoading();
    }

    /**
     * Render category badge
     */
    renderCategoryBadge() {
        const categoryLabels = {
            [MR_CATEGORIES.OBSTETRI]: { label: 'Obstetri', color: 'primary' },
            [MR_CATEGORIES.GYN_REPRO]: { label: 'Ginekologi Reproduksi', color: 'success' },
            [MR_CATEGORIES.GYN_SPECIAL]: { label: 'Ginekologi Khusus', color: 'info' }
        };

        const category = categoryLabels[this.currentCategory] || categoryLabels[MR_CATEGORIES.OBSTETRI];

        return `
            <div class="mb-3">
                <span class="badge badge-${category.color} badge-lg">
                    <i class="fas fa-tag"></i> ${category.label}
                </span>
                <span class="badge badge-secondary badge-lg ml-2">
                    ${this.currentMrId}
                </span>
            </div>
        `;
    }

    /**
     * Attach global event listeners
     */
    attachEventListeners() {
        // Save button
        const saveBtn = document.getElementById('save-record-btn');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => this.saveAll());
        }

        // Section navigation
        document.querySelectorAll('[data-section-nav]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const section = e.currentTarget.dataset.sectionNav;
                this.scrollToSection(section);
            });
        });

        // Planning buttons (for old format obstetri category)
        const inputTindakanBtn = document.getElementById('btn-input-tindakan');
        const inputTerapiBtn = document.getElementById('btn-input-terapi');
        const resetTindakanBtn = document.getElementById('btn-reset-tindakan');
        const resetTerapiBtn = document.getElementById('btn-reset-terapi');
        const savePlanBtn = document.getElementById('save-plan');

        console.log('[SundayClinic] Planning buttons found:', {
            inputTindakan: !!inputTindakanBtn,
            inputTerapi: !!inputTerapiBtn,
            resetTindakan: !!resetTindakanBtn,
            resetTerapi: !!resetTerapiBtn,
            savePlan: !!savePlanBtn
        });

        console.log('[SundayClinic] Planning functions available:', {
            openTindakanModal: typeof window.openTindakanModal,
            openTerapiModal: typeof window.openTerapiModal,
            resetTindakan: typeof window.resetTindakan,
            resetTerapi: typeof window.resetTerapi
        });

        if (inputTindakanBtn && window.openTindakanModal) {
            console.log('[SundayClinic] Attaching openTindakanModal listener');
            inputTindakanBtn.addEventListener('click', window.openTindakanModal);
        }
        if (inputTerapiBtn && window.openTerapiModal) {
            console.log('[SundayClinic] Attaching openTerapiModal listener');
            inputTerapiBtn.addEventListener('click', window.openTerapiModal);
        }
        if (resetTindakanBtn && window.resetTindakan) {
            console.log('[SundayClinic] Attaching resetTindakan listener');
            resetTindakanBtn.addEventListener('click', window.resetTindakan);
        }
        if (resetTerapiBtn && window.resetTerapi) {
            console.log('[SundayClinic] Attaching resetTerapi listener');
            resetTerapiBtn.addEventListener('click', window.resetTerapi);
        }
        if (savePlanBtn) {
            console.log('[SundayClinic] Attaching savePlanningObstetri listener');
            savePlanBtn.addEventListener('click', () => this.savePlanningObstetri());
        }

        // Physical Exam save button (for old format obstetri category)
        const savePhysicalExamBtn = document.getElementById('save-physical-exam');
        if (savePhysicalExamBtn) {
            console.log('[SundayClinic] Attaching savePhysicalExam listener');
            savePhysicalExamBtn.addEventListener('click', () => this.savePhysicalExam());
        }

        // USG save button (for old format obstetri category)
        const saveUSGBtn = document.getElementById('save-usg');
        if (saveUSGBtn) {
            console.log('[SundayClinic] Attaching saveUSGExam listener');
            saveUSGBtn.addEventListener('click', () => this.saveUSGExam());
        }

        // Warn before leaving if there are unsaved changes
        window.addEventListener('beforeunload', (e) => {
            if (stateManager.hasUnsavedChanges()) {
                e.preventDefault();
                e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
                return e.returnValue;
            }
        });
    }

    /**
     * Save all sections
     */
    async saveAll() {
        try {
            this.showLoading('Menyimpan...');

            const sections = Object.keys(this.components);
            const savePromises = [];

            for (const section of sections) {
                const component = this.components[section];
                if (component.save) {
                    savePromises.push(
                        component.save(stateManager.getState())
                            .catch(error => {
                                console.error(`Failed to save ${section}:`, error);
                                return { success: false, section, error: error.message };
                            })
                    );
                }
            }

            const results = await Promise.all(savePromises);

            // Check if all successful
            const failures = results.filter(r => !r.success);

            if (failures.length > 0) {
                throw new Error(`Failed to save: ${failures.map(f => f.section).join(', ')}`);
            }

            // Mark as clean
            stateManager.markClean();

            this.showSuccess('Data berhasil disimpan!');

        } catch (error) {
            console.error('[SundayClinic] Save failed:', error);
            this.showError(error.message);
        } finally {
            this.hideLoading();
        }
    }

    /**
     * Save Planning for obstetri category (old format)
     */
    async savePlanningObstetri() {
        try {
            this.showLoading('Menyimpan Planning...');

            const data = {
                tindakan: document.getElementById('planning-tindakan')?.value || '',
                terapi: document.getElementById('planning-terapi')?.value || '',
                rencana: document.getElementById('planning-rencana')?.value || ''
            };

            const state = stateManager.getState();

            // Patient ID is in recordData.patientId (not recordData.record.patient_id)
            const patientId = state.recordData?.patientId ||
                             state.patientData?.id ||
                             state.intakeData?.patientId;

            if (!patientId) {
                throw new Error('Patient ID tidak ditemukan');
            }

            const token = window.getToken();
            if (!token) {
                throw new Error('Authentication token tidak tersedia');
            }

            const recordPayload = {
                patientId: patientId,
                type: 'planning',
                data: data,
                timestamp: new Date().toISOString()
            };

            // Add doctor info if available
            if (window.currentStaffIdentity?.name) {
                recordPayload.doctorName = window.currentStaffIdentity.name;
            }
            if (window.currentStaffIdentity?.id) {
                recordPayload.doctorId = window.currentStaffIdentity.id;
            }

            const response = await fetch('/api/medical-records', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(recordPayload)
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
                throw new Error(errorData.message || `Server error: ${response.status}`);
            }

            const result = await response.json();
            console.log('[SundayClinic] Planning saved successfully:', result);

            this.showSuccess('Planning berhasil disimpan!');

        } catch (error) {
            console.error('[SundayClinic] Save Planning failed:', error);
            this.showError(error.message);
        } finally {
            this.hideLoading();
        }
    }

    /**
     * Save USG for obstetri category (old format)
     */
    async saveUSGExam() {
        try {
            const saveBtn = document.getElementById('save-usg');
            if (saveBtn) {
                saveBtn.disabled = true;
                saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Menyimpan...';
            }

            this.showLoading('Menyimpan USG...');

            // Detect active trimester
            const activeTrimesterInput = document.querySelector('.trimester-selector .btn.active input');
            const trimester = activeTrimesterInput ? activeTrimesterInput.value : 'first';

            console.log('[SundayClinic] Saving USG for trimester:', trimester);

            // Import helper functions
            const { getMedicalRecordContext } = await import('./utils/helpers.js');

            // Check if existing record exists
            const state = stateManager.getState();
            const context = getMedicalRecordContext(state, 'usg');
            const existingRecordId = context.record?.recordId || context.record?.id || null;

            // Collect data from USG component
            const usgComponent = this.components['usg'];
            if (!usgComponent) {
                throw new Error('USG component not found');
            }

            const data = {
                current_trimester: trimester,
                trimester_1: usgComponent.collectTrimester1Data(),
                trimester_2: usgComponent.collectTrimester2Data(),
                screening: usgComponent.collectScreeningData(),
                trimester_3: usgComponent.collectTrimester3Data()
            };

            const patientId = state.derived?.patientId ||
                             state.recordData?.patientId ||
                             state.patientData?.id;

            if (!patientId) {
                throw new Error('Patient ID tidak ditemukan');
            }

            const token = window.getToken();
            if (!token) {
                throw new Error('Authentication token tidak tersedia');
            }

            let response;
            let successMessage;

            if (existingRecordId) {
                // UPDATE existing record
                console.log('[SundayClinic] Updating existing USG record:', existingRecordId);

                response = await fetch(`/api/medical-records/${existingRecordId}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        data: data,
                        timestamp: new Date().toISOString()
                        // NO doctorName/doctorId for USG!
                    })
                });

                successMessage = 'Data USG berhasil diperbarui!';
            } else {
                // CREATE new record
                console.log('[SundayClinic] Creating new USG record');

                const recordPayload = {
                    patientId: patientId,
                    type: 'usg',
                    data: data,
                    timestamp: new Date().toISOString()
                    // NO doctorName/doctorId for USG!
                };

                response = await fetch('/api/medical-records', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify(recordPayload)
                });

                successMessage = 'Data USG berhasil disimpan!';
            }

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
                throw new Error(errorData.message || `Server error: ${response.status}`);
            }

            const result = await response.json();
            console.log('[SundayClinic] USG saved successfully:', result);

            // Reload the record to show updated data
            await this.reload();

            this.showSuccess(successMessage);

        } catch (error) {
            console.error('[SundayClinic] Save USG failed:', error);
            this.showError(error.message);
        } finally {
            this.hideLoading();

            // Re-enable button
            const saveBtn = document.getElementById('save-usg');
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.innerHTML = '<i class="fas fa-save mr-2"></i>Simpan USG';
            }
        }
    }

    /**
     * Save Physical Exam for obstetri category (old format)
     */
    async savePhysicalExam() {
        try {
            this.showLoading('Menyimpan Pemeriksaan Fisik...');

            const data = {
                tekanan_darah: document.getElementById('pe-tekanan-darah')?.value || '',
                nadi: document.getElementById('pe-nadi')?.value || '',
                suhu: document.getElementById('pe-suhu')?.value || '',
                respirasi: document.getElementById('pe-respirasi')?.value || '',
                kepala_leher: document.getElementById('pe-kepala-leher')?.value || '',
                thorax: document.getElementById('pe-thorax')?.value || '',
                abdomen: document.getElementById('pe-abdomen')?.value || '',
                ekstremitas: document.getElementById('pe-ekstremitas')?.value || '',
                pemeriksaan_obstetri: document.getElementById('pe-obstetri')?.value || ''
            };

            const state = stateManager.getState();

            // Patient ID is in derived state
            const patientId = state.derived?.patientId ||
                             state.recordData?.patientId ||
                             state.patientData?.id;

            if (!patientId) {
                throw new Error('Patient ID tidak ditemukan');
            }

            const token = window.getToken();
            if (!token) {
                throw new Error('Authentication token tidak tersedia');
            }

            const recordPayload = {
                patientId: patientId,
                type: 'physical_exam',
                data: data,
                timestamp: new Date().toISOString()
            };

            // Add doctor info if available
            if (window.currentStaffIdentity?.name) {
                recordPayload.doctorName = window.currentStaffIdentity.name;
            }
            if (window.currentStaffIdentity?.id) {
                recordPayload.doctorId = window.currentStaffIdentity.id;
            }

            const response = await fetch('/api/medical-records', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(recordPayload)
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
                throw new Error(errorData.message || `Server error: ${response.status}`);
            }

            const result = await response.json();
            console.log('[SundayClinic] Physical Exam saved successfully:', result);

            // Reload the record to show updated data
            await this.reload();

            this.showSuccess('Pemeriksaan Fisik berhasil disimpan!');

        } catch (error) {
            console.error('[SundayClinic] Save Physical Exam failed:', error);
            this.showError(error.message);
        } finally {
            this.hideLoading();
        }
    }

    /**
     * Navigate to specific section (one section per page)
     */
    async navigateToSection(section) {
        console.log('[SundayClinic] Navigating to section:', section);

        // Re-render with only the selected section
        await this.render(section);

        // Scroll to top of content
        const content = document.getElementById('sunday-clinic-content');
        if (content) {
            content.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }

    /**
     * Show loading overlay
     */
    showLoading(message = 'Memuat...') {
        const overlay = document.getElementById('loading-overlay');
        if (overlay) {
            overlay.querySelector('.loading-message').textContent = message;
            overlay.style.display = 'flex';
        }
    }

    /**
     * Hide loading overlay
     */
    hideLoading() {
        const overlay = document.getElementById('loading-overlay');
        if (overlay) {
            overlay.style.display = 'none';
        }
    }

    /**
     * Show success message
     */
    showSuccess(message) {
        // Use your existing toast/notification system
        if (window.showToast) {
            window.showToast('success', message);
        } else {
            alert(message);
        }
    }

    /**
     * Show error message
     */
    showError(message) {
        // Use your existing toast/notification system
        if (window.showToast) {
            window.showToast('error', message);
        } else {
            alert('Error: ' + message);
        }
    }

    /**
     * Reload current record
     */
    async reload() {
        if (this.currentMrId) {
            await this.init(this.currentMrId);
        }
    }

    /**
     * Navigate to different record
     */
    async navigate(mrId) {
        // Check for unsaved changes
        if (stateManager.hasUnsavedChanges()) {
            const confirmed = confirm('You have unsaved changes. Continue anyway?');
            if (!confirmed) return;
        }

        // Clear state and load new record
        stateManager.clear();
        await this.init(mrId);
    }
}

// Export singleton instance
const app = new SundayClinicApp();
export default app;

// Make it globally available
window.SundayClinicApp = app;

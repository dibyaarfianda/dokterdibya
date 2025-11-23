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

        if (inputTindakanBtn && window.openTindakanModal) {
            inputTindakanBtn.addEventListener('click', window.openTindakanModal);
        }
        if (inputTerapiBtn && window.openTerapiModal) {
            inputTerapiBtn.addEventListener('click', window.openTerapiModal);
        }
        if (resetTindakanBtn && window.resetTindakan) {
            resetTindakanBtn.addEventListener('click', window.resetTindakan);
        }
        if (resetTerapiBtn && window.resetTerapi) {
            resetTerapiBtn.addEventListener('click', window.resetTerapi);
        }
        if (savePlanBtn) {
            savePlanBtn.addEventListener('click', () => this.savePlanningObstetri());
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
            const patientId = state.recordData?.record?.patient_id;

            if (!patientId) {
                throw new Error('Patient ID tidak ditemukan');
            }

            const token = await apiClient.getToken();
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

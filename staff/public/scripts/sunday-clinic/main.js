/**
 * Sunday Clinic Main Router
 * Dynamically loads components based on MR category
 */

import { MR_CATEGORIES, SECTIONS } from './utils/constants.js';
import apiClient from './utils/api-client.js';
import stateManager from './utils/state-manager.js';
import { getGMT7Timestamp } from './utils/helpers.js';
import BillingNotifications from './utils/billing-notifications.js';
import SendToPatient from './components/shared/send-to-patient.js';

class SundayClinicApp {
    constructor() {
        this.currentMrId = null;
        this.currentCategory = null;
        this.currentLocation = null; // Track visit location for UI context
        this.components = {};
        this.initialized = false;
        this.billingNotifications = null;
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

            // Get category and location
            this.currentMrId = mrId;
            this.currentCategory = response.data.record.mr_category ||
                                  response.data.intake?.summary?.intakeCategory ||
                                  MR_CATEGORIES.OBSTETRI;
            this.currentLocation = response.data.record.visit_location || 'klinik_private';

            console.log('[SundayClinic] Category detected:', this.currentCategory);
            console.log('[SundayClinic] Location detected:', this.currentLocation);

            // Update sidebar based on category
            this.updateSidebarForCategory();

            // Update UI based on visit location (logo, billing visibility)
            this.updateUIForLocation();

            // Load template-specific components
            await this.loadComponents();

            // Check if documents were sent for this visit
            await this.checkSentDocumentsStatus();

            // Render the application with active section
            await this.render(activeSection);

            // Initialize real-time billing notifications
            this.initializeBillingNotifications();

            // Initialize send to patient modal
            this.initializeSendToPatientModal();

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
            { section: SECTIONS.RESUME_MEDIS, path: `${basePath}/shared/resume-medis.js` },
            { section: SECTIONS.BILLING, path: `${basePath}/shared/billing.js` }
        ];

        // Template-specific components (vary by category)
        const categoryFolder = this.currentCategory;
        const specific = [
            { section: SECTIONS.ANAMNESA, path: `${basePath}/${categoryFolder}/anamnesa-${categoryFolder}.js` }
        ];

        // Category-specific components
        if (this.currentCategory === MR_CATEGORIES.OBSTETRI) {
            // Obstetri: Pemeriksaan Obstetri + USG Obstetri
            specific.push(
                { section: SECTIONS.PEMERIKSAAN_OBSTETRI, path: `${basePath}/obstetri/pemeriksaan-obstetri.js` },
                { section: SECTIONS.USG, path: `${basePath}/obstetri/usg-obstetri.js` }
            );
        } else if (this.currentCategory === MR_CATEGORIES.GYN_REPRO ||
                   this.currentCategory === MR_CATEGORIES.GYN_SPECIAL) {
            // Gynecology: Pemeriksaan Ginekologi + USG Ginekologi (both text areas)
            specific.push(
                { section: SECTIONS.PEMERIKSAAN_GINEKOLOGI, path: `${basePath}/shared/pemeriksaan-ginekologi.js` },
                { section: SECTIONS.USG, path: `${basePath}/shared/usg-ginekologi.js` }
            );
        }

        return [...shared, ...specific];
    }

    /**
     * Dynamically load component modules
     */
    async loadComponents() {
        const componentPaths = this.getComponentPaths();
        // Hard version number - increment this to force reload
        const COMPONENT_VERSION = '3.0.0';
        const cacheBuster = `?v=${COMPONENT_VERSION}-${Date.now()}`;

        for (const { section, path } of componentPaths) {
            try {
                const module = await import(path + cacheBuster);
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

        console.log('[SundayClinic] Setting container HTML, length:', html.length);
        console.log('[SundayClinic] Container element:', container);
        container.innerHTML = html;
        console.log('[SundayClinic] Container innerHTML after set:', container.innerHTML.length);

        // Call afterRender if available (after DOM is updated)
        if (component && component.afterRender) {
            setTimeout(() => {
                try {
                    component.afterRender(state);
                    console.log('[SundayClinic] afterRender called for:', activeSection);
                } catch (err) {
                    console.error(`[SundayClinic] Error in afterRender for ${activeSection}:`, err);
                }
            }, 100);
        }

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
     * Update sidebar menu based on category
     * Hide/show menu items that are category-specific
     */
    updateSidebarForCategory() {
        console.log('[SundayClinic] Updating sidebar for category:', this.currentCategory);

        const isObstetri = this.currentCategory === MR_CATEGORIES.OBSTETRI;
        const isGynecology = this.currentCategory === MR_CATEGORIES.GYN_REPRO ||
                            this.currentCategory === MR_CATEGORIES.GYN_SPECIAL;

        // Pemeriksaan Obstetri - only show for obstetri category
        const menuObstetri = document.getElementById('menu-pemeriksaan-obstetri');
        if (menuObstetri) {
            menuObstetri.style.display = isObstetri ? '' : 'none';
            console.log('[SundayClinic] Pemeriksaan Obstetri:', isObstetri ? 'show' : 'hide');
        }

        // Pemeriksaan Ginekologi - only show for gyn_repro and gyn_special
        const menuGinekologi = document.getElementById('menu-pemeriksaan-ginekologi');
        if (menuGinekologi) {
            menuGinekologi.style.display = isGynecology ? '' : 'none';
            console.log('[SundayClinic] Pemeriksaan Ginekologi:', isGynecology ? 'show' : 'hide');
        }

        // Update USG label and icon based on category
        const usgMenu = document.getElementById('menu-usg');
        if (usgMenu) {
            const usgLink = usgMenu.querySelector('.sc-nav-link');
            const icon = usgLink?.querySelector('.nav-icon');
            const label = usgLink?.querySelector('p');

            if (isObstetri) {
                if (icon) icon.className = 'nav-icon fas fa-baby';
                if (label) label.textContent = 'USG Obstetri';
            } else {
                if (icon) icon.className = 'nav-icon fas fa-venus';
                if (label) label.textContent = 'USG Ginekologi';
            }
        }
    }

    /**
     * Update UI based on visit location
     * - Updates sidebar logo/branding based on hospital/clinic
     * - Hides billing menu for hospital visits (billing only for private clinic)
     */
    updateUIForLocation() {
        console.log('[SundayClinic] Updating UI for location:', this.currentLocation);

        const isPrivateClinic = this.currentLocation === 'klinik_private';

        // Location branding configuration
        const locationConfig = {
            'klinik_private': {
                logo: '/images/dibyablacklogo.svg',
                name: 'Klinik Privat dr. Dibya',
                shortName: 'Privat',
                tooltip: 'Keluar dari Klinik Privat',
                color: '#3c8dbc', // info blue
                icon: 'fas fa-clinic-medical'
            },
            'rsia_melinda': {
                logo: '/images/melinda-logo.png',
                name: 'RSIA Melinda',
                shortName: 'RSIA Melinda',
                tooltip: 'Keluar dari RSIA Melinda',
                color: '#e91e63', // pink
                icon: 'fas fa-hospital'
            },
            'rsud_gambiran': {
                logo: '/images/gambiran-logo.png',
                name: 'RSUD Gambiran',
                shortName: 'RSUD Gambiran',
                tooltip: 'Keluar dari RSUD Gambiran',
                color: '#17a2b8', // cyan
                icon: 'fas fa-hospital'
            },
            'rs_bhayangkara': {
                logo: '/images/bhayangkara-logo.png',
                name: 'RS Bhayangkara',
                shortName: 'RS Bhayangkara',
                tooltip: 'Keluar dari RS Bhayangkara',
                color: '#28a745', // green
                icon: 'fas fa-hospital-alt'
            }
        };

        const config = locationConfig[this.currentLocation] || locationConfig['klinik_private'];

        // Update sidebar logo container
        const sidebarLogo = document.getElementById('sidebar-logo');
        const logoContainer = sidebarLogo?.parentElement;

        if (logoContainer) {
            if (isPrivateClinic) {
                // Show original logo for private clinic
                if (sidebarLogo) {
                    sidebarLogo.style.display = '';
                    sidebarLogo.src = config.logo;
                }
                // Remove hospital badge if exists
                const hospitalBadge = logoContainer.querySelector('.hospital-brand-badge');
                if (hospitalBadge) hospitalBadge.remove();
            } else {
                // Hide logo and show hospital brand badge
                if (sidebarLogo) {
                    sidebarLogo.style.display = 'none';
                }
                // Remove existing badge
                const existingBadge = logoContainer.querySelector('.hospital-brand-badge');
                if (existingBadge) existingBadge.remove();

                // Add hospital brand badge
                let badgeContent;
                if (config.logo) {
                    // Use logo image
                    badgeContent = `
                        <img src="${config.logo}" alt="${config.name}" style="max-width: 120px; max-height: 80px; object-fit: contain;">
                    `;
                } else {
                    // Icon-based badge (fallback)
                    badgeContent = `
                        <div style="background: ${config.color}; color: white; padding: 15px; border-radius: 10px;">
                            <i class="${config.icon}" style="font-size: 2rem;"></i>
                            <div style="font-weight: bold; margin-top: 8px; font-size: 0.85rem;">${config.shortName}</div>
                        </div>
                    `;
                }

                const badgeHtml = `
                    <div class="hospital-brand-badge text-center" style="padding: 10px; cursor: pointer;" data-tooltip="${config.tooltip}">
                        ${badgeContent}
                    </div>
                `;
                logoContainer.insertAdjacentHTML('beforeend', badgeHtml);

                // Add click handler for navigation to main admin page
                const badge = logoContainer.querySelector('.hospital-brand-badge');
                if (badge) {
                    badge.addEventListener('click', () => {
                        window.location.href = '/staff/public/index-adminlte.html';
                    });
                }

                console.log('[SundayClinic] Hospital brand badge shown for:', config.name);
            }
        }

        // Hide/show billing menu based on location
        // Billing is only available for private clinic
        const billingMenuItem = document.querySelector('.sc-nav-link[data-section="tagihan"]');
        if (billingMenuItem) {
            const menuItem = billingMenuItem.closest('.nav-item');
            if (menuItem) {
                if (isPrivateClinic) {
                    menuItem.style.display = '';
                    console.log('[SundayClinic] Billing menu shown (private clinic)');
                } else {
                    menuItem.style.display = 'none';
                    console.log('[SundayClinic] Billing menu hidden (hospital visit)');
                }
            }
        }

        // Add a location indicator badge in the header if not private clinic
        this.updateLocationBadge(config, isPrivateClinic);

        // Update page title based on location
        document.title = config.name;
    }

    /**
     * Update/add location badge in header for hospital visits
     */
    updateLocationBadge(config, isPrivateClinic) {
        const existingBadge = document.getElementById('location-context-badge');

        if (isPrivateClinic) {
            // Remove badge if exists
            if (existingBadge) {
                existingBadge.remove();
            }
            return;
        }

        // Add or update location badge for hospital visits
        const headerContainer = document.getElementById('summary-cards-container');
        if (!headerContainer) return;

        const badgeHtml = `
            <div id="location-context-badge" class="mr-3 d-flex align-items-center">
                <span class="badge badge-warning badge-lg" style="font-size: 0.9rem;">
                    <i class="fas fa-hospital mr-1"></i>${config.name}
                </span>
                <small class="text-muted ml-2">(Billing tidak tersedia)</small>
            </div>
        `;

        if (existingBadge) {
            existingBadge.outerHTML = badgeHtml;
        } else {
            headerContainer.insertAdjacentHTML('afterbegin', badgeHtml);
        }
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
        /* const saveUSGBtn = document.getElementById('save-usg');
        if (saveUSGBtn) {
            console.log('[SundayClinic] Attaching saveUSGExam listener');
            saveUSGBtn.addEventListener('click', () => this.saveUSGExam());
        } */

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
        // Prevent double submission
        if (this._savingPlanning) {
            console.warn('[SundayClinic] Planning save already in progress, ignoring duplicate call');
            return;
        }
        this._savingPlanning = true;

        try {
            this.showLoading('Menyimpan Planning...');

            const data = {
                tindakan: document.getElementById('planning-tindakan')?.value || '',
                terapi: document.getElementById('planning-terapi')?.value || '',
                rencana: document.getElementById('planning-rencana')?.value || '',
                saved_at: new Date().toISOString()
            };

            const state = stateManager.getState();
            const mrId = state.currentMrId ||
                        state.recordData?.mrId ||
                        state.recordData?.mr_id ||
                        state.recordData?.record?.mrId ||
                        state.recordData?.record?.mr_id;

            if (!mrId) {
                throw new Error('MR ID tidak ditemukan');
            }

            const token = window.getToken();
            if (!token) {
                throw new Error('Authentication token tidak tersedia');
            }

            const response = await fetch(`/api/sunday-clinic/records/${mrId}/planning`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(data)
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
                throw new Error(errorData.message || `Server error: ${response.status}`);
            }

            const result = await response.json();
            console.log('[SundayClinic] Planning saved successfully:', result);

            // Update state
            stateManager.updateSectionData('planning', data);

            this.showSuccess('Planning berhasil disimpan!');

            // Reload the record to show updated metadata
            await this.fetchRecord(this.currentMrId);

        } catch (error) {
            console.error('[SundayClinic] Save Planning failed:', error);
            this.showError(error.message);
        } finally {
            this.hideLoading();
            this._savingPlanning = false;
        }
    }

    /**
     * Save Pemeriksaan Obstetri
     */
    async savePemeriksaanObstetri() {
        // Prevent double submission
        if (this._savingPemeriksaanObstetri) {
            console.warn('[SundayClinic] Pemeriksaan Obstetri save already in progress, ignoring duplicate call');
            return;
        }
        this._savingPemeriksaanObstetri = true;
        
        try {
            this.showLoading('Menyimpan Pemeriksaan Obstetri...');

            const data = {
                findings: document.getElementById('pemeriksaan-obstetri-findings')?.value || '',
                saved_at: new Date().toISOString()
            };

            const state = stateManager.getState();
            const mrId = state.currentMrId ||
                        state.recordData?.mrId ||
                        state.recordData?.mr_id ||
                        state.recordData?.record?.mrId ||
                        state.recordData?.record?.mr_id;

            if (!mrId) {
                throw new Error('MR ID tidak ditemukan');
            }

            const token = window.getToken();
            if (!token) {
                throw new Error('Authentication token tidak tersedia');
            }

            // Send to API using sunday-clinic endpoint with mrId
            const response = await fetch(`/api/sunday-clinic/records/${mrId}/pemeriksaan_obstetri`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(data)
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
                throw new Error(errorData.message || `Server error: ${response.status}`);
            }

            const result = await response.json();
            console.log('[SundayClinic] Pemeriksaan Obstetri saved successfully:', result);

            // Update state
            stateManager.updateSectionData('pemeriksaan_obstetri', data);

            this.showSuccess('Pemeriksaan Obstetri berhasil disimpan!');

            // Reload the record to show updated metadata
            await this.fetchRecord(this.currentMrId);

        } catch (error) {
            console.error('[SundayClinic] Save Pemeriksaan Obstetri failed:', error);
            this.showError(error.message);
        } finally {
            this.hideLoading();
            this._savingPemeriksaanObstetri = false;
        }
    }

    /**
     * Save USG for obstetri category
     */
    async saveUSGExam() {
        // Prevent double submission
        if (this._savingUSG) {
            console.warn('[SundayClinic] USG save already in progress, ignoring duplicate call');
            return;
        }
        this._savingUSG = true;

        const saveBtn = document.getElementById('btn-save-usg');
        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Menyimpan...';
        }

        try {
            this.showLoading('Menyimpan USG...');

            // Detect active trimester
            const activeTrimesterInput = document.querySelector('.trimester-selector .btn.active input');
            const trimester = activeTrimesterInput ? activeTrimesterInput.value : 'first';

            // Collect USG data directly from DOM
            // Collect contraception for trimester 3
            const contraception = [];
            ['steril', 'iud', 'iud_mirena', 'implant', 'injection', 'pill', 'condom', 'vasectomy', 'none'].forEach(method => {
                if (document.querySelector(`[name="t3_contra_${method}"]`)?.checked) {
                    contraception.push(method);
                }
            });

            // Collect screening checkboxes
            const screeningCheckboxes = [
                'hemisphere', 'lateral_vent', 'cavum', 'profile', 'nasal_bone', 'upper_lip',
                '4chamber', 'heart_left', 'apex', 'heart_size', 'vertebra', 'skin',
                'upper_limbs', 'lower_limbs', 'stomach', 'liver', 'kidneys', 'bladder', 'cord', 'abdominal_wall',
                'no_anomaly', 'suspect'
            ];
            const screeningData = {
                date: document.querySelector('[name="scr_date"]')?.value || '',
                gender: document.querySelector('input[name="scr_gender"]:checked')?.value || '',
                suspect_notes: document.querySelector('[name="scr_suspect_notes"]')?.value || ''
            };
            screeningCheckboxes.forEach(name => {
                screeningData[name] = document.querySelector(`[name="scr_${name}"]`)?.checked || false;
            });

            // Get existing photos data
            let photos = [];
            try {
                const photosDataEl = document.getElementById('usg-photos-data');
                if (photosDataEl && photosDataEl.value) {
                    photos = JSON.parse(photosDataEl.value.replace(/&quot;/g, '"') || '[]');
                }
            } catch (e) { photos = []; }

            const data = {
                current_trimester: trimester,
                trimester_1: {
                    date: document.querySelector('[name="t1_date"]')?.value || '',
                    embryo_count: document.querySelector('input[name="t1_embryo_count"]:checked')?.value || '',
                    gs: document.querySelector('[name="t1_gs"]')?.value || '',
                    crl: document.querySelector('[name="t1_crl"]')?.value || '',
                    ga_weeks: document.querySelector('[name="t1_ga_weeks"]')?.value || '',
                    heart_rate: document.querySelector('[name="t1_heart_rate"]')?.value || '',
                    implantation: document.querySelector('input[name="t1_implantation"]:checked')?.value || '',
                    edd: document.querySelector('[name="t1_edd"]')?.value || '',
                    lmp: document.querySelector('[name="t1_lmp"]')?.value || '',
                    ga_from_edd: document.getElementById('t1-ga-calculated')?.value || '',
                    nt: document.querySelector('[name="t1_nt"]')?.value || '',
                    notes: document.querySelector('[name="t1_notes"]')?.value || ''
                },
                trimester_2: {
                    date: document.querySelector('[name="t2_date"]')?.value || '',
                    fetus_count: document.querySelector('input[name="t2_fetus_count"]:checked')?.value || '',
                    gender: document.querySelector('input[name="t2_gender"]:checked')?.value || '',
                    fetus_lie: document.querySelector('input[name="t2_fetus_lie"]:checked')?.value || '',
                    presentation: document.querySelector('input[name="t2_presentation"]:checked')?.value || '',
                    bpd: document.querySelector('[name="t2_bpd"]')?.value || '',
                    ac: document.querySelector('[name="t2_ac"]')?.value || '',
                    fl: document.querySelector('[name="t2_fl"]')?.value || '',
                    heart_rate: document.querySelector('[name="t2_heart_rate"]')?.value || '',
                    placenta: document.querySelector('input[name="t2_placenta"]:checked')?.value || '',
                    placenta_previa: document.querySelector('[name="t2_placenta_previa"]')?.value || '',
                    afi: document.querySelector('[name="t2_afi"]')?.value || '',
                    efw: document.querySelector('[name="t2_efw"]')?.value || '',
                    edd: document.querySelector('[name="t2_edd"]')?.value || '',
                    lmp: document.querySelector('[name="t2_lmp"]')?.value || '',
                    ga_from_edd: document.getElementById('t2-ga-calculated')?.value || '',
                    notes: document.querySelector('[name="t2_notes"]')?.value || ''
                },
                screening: screeningData,
                trimester_3: {
                    date: document.querySelector('[name="t3_date"]')?.value || '',
                    fetus_count: document.querySelector('input[name="t3_fetus_count"]:checked')?.value || '',
                    gender: document.querySelector('input[name="t3_gender"]:checked')?.value || '',
                    fetus_lie: document.querySelector('input[name="t3_fetus_lie"]:checked')?.value || '',
                    presentation: document.querySelector('input[name="t3_presentation"]:checked')?.value || '',
                    bpd: document.querySelector('[name="t3_bpd"]')?.value || '',
                    ac: document.querySelector('[name="t3_ac"]')?.value || '',
                    fl: document.querySelector('[name="t3_fl"]')?.value || '',
                    heart_rate: document.querySelector('[name="t3_heart_rate"]')?.value || '',
                    placenta: document.querySelector('input[name="t3_placenta"]:checked')?.value || '',
                    placenta_previa: document.querySelector('[name="t3_placenta_previa"]')?.value || '',
                    afi: document.querySelector('[name="t3_afi"]')?.value || '',
                    efw: document.querySelector('[name="t3_efw"]')?.value || '',
                    edd: document.querySelector('[name="t3_edd"]')?.value || '',
                    lmp: document.querySelector('[name="t3_lmp"]')?.value || '',
                    ga_from_edd: document.getElementById('t3-ga-calculated')?.value || '',
                    membrane_sweep: document.querySelector('input[name="t3_membrane_sweep"]:checked')?.value || '',
                    contraception: contraception
                },
                photos: photos,
                saved_at: new Date().toISOString()
            };

            const state = stateManager.getState();
            const mrId = state.currentMrId ||
                        state.recordData?.mrId ||
                        state.recordData?.mr_id ||
                        state.recordData?.record?.mrId ||
                        state.recordData?.record?.mr_id;

            if (!mrId) {
                throw new Error('MR ID tidak ditemukan');
            }

            const token = window.getToken();
            if (!token) {
                throw new Error('Authentication token tidak tersedia');
            }

            // Send to API using sunday-clinic endpoint with mrId
            const response = await fetch(`/api/sunday-clinic/records/${mrId}/usg`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(data)
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
                throw new Error(errorData.message || `Server error: ${response.status}`);
            }

            const result = await response.json();
            console.log('[SundayClinic] USG saved successfully:', result);

            // Update state
            stateManager.updateSectionData('usg', data);

            this.showSuccess('Data USG berhasil disimpan!');

            // Reload the record to show updated metadata
            await this.fetchRecord(this.currentMrId);

        } catch (error) {
            console.error('[SundayClinic] Save USG failed:', error);
            this.showError(error.message);
        } finally {
            this.hideLoading();
            this._savingUSG = false;

            // Re-enable button
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
        // Prevent double submission
        if (this._savingPhysicalExam) {
            console.warn('[SundayClinic] Physical Exam save already in progress, ignoring duplicate call');
            return;
        }
        
        this._savingPhysicalExam = true;
        
        try {
            this.showLoading('Menyimpan Pemeriksaan Fisik...');

            const data = {
                tekanan_darah: document.getElementById('pe-tekanan-darah')?.value || '',
                nadi: document.getElementById('pe-nadi')?.value || '',
                suhu: document.getElementById('pe-suhu')?.value || '',
                respirasi: document.getElementById('pe-respirasi')?.value || '',
                tinggi_badan: document.getElementById('pe-tinggi-badan')?.value || '',
                berat_badan: document.getElementById('pe-berat-badan')?.value || '',
                imt: document.getElementById('pe-imt')?.value || '',
                kategori_imt: document.getElementById('pe-kategori-imt')?.value || '',
                kepala_leher: document.getElementById('pe-kepala-leher')?.value || '',
                thorax: document.getElementById('pe-thorax')?.value || '',
                abdomen: document.getElementById('pe-abdomen')?.value || '',
                ekstremitas: document.getElementById('pe-ekstremitas')?.value || ''
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

            // Get MR ID from state
            const mrId = state.currentMrId || state.recordData?.mrId || state.recordData?.mr_id;
            if (!mrId) {
                throw new Error('MR ID tidak ditemukan');
            }

            // Use the new section save endpoint with mr_id
            const response = await fetch(`/api/sunday-clinic/records/${mrId}/physical_exam`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(data)
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
            this._savingPhysicalExam = false;
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
     * Save Anamnesa
     */
    async saveAnamnesa() {
        // Prevent double submission
        if (this._savingAnamnesa) {
            console.warn('[SundayClinic] Anamnesa save already in progress, ignoring duplicate call');
            return;
        }
        this._savingAnamnesa = true;
        
        const btn = document.getElementById('btn-update-anamnesa');
        if (!btn) {
            this._savingAnamnesa = false;
            return;
        }

        // Disable button
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Menyimpan...';

        try {
            // Collect all field values
            const data = {
                keluhan_utama: document.getElementById('anamnesa-keluhan-utama')?.value || '',
                riwayat_kehamilan_saat_ini: document.getElementById('anamnesa-riwayat-kehamilan')?.value || '',
                hpht: document.getElementById('anamnesa-hpht')?.value || '',
                hpl: document.getElementById('anamnesa-hpl')?.value || '',
                usia_kehamilan: document.getElementById('anamnesa-usia-kehamilan-display')?.value || '',
                detail_riwayat_penyakit: document.getElementById('anamnesa-detail-riwayat')?.value || '',
                riwayat_keluarga: document.getElementById('anamnesa-riwayat-keluarga')?.value || '',
                alergi_obat: document.getElementById('anamnesa-alergi-obat')?.value || '',
                alergi_makanan: document.getElementById('anamnesa-alergi-makanan')?.value || '',
                alergi_lingkungan: document.getElementById('anamnesa-alergi-lingkungan')?.value || '',
                gravida: document.getElementById('anamnesa-gravida')?.value || '',
                para: document.getElementById('anamnesa-para')?.value || '',
                abortus: document.getElementById('anamnesa-abortus')?.value || '',
                anak_hidup: document.getElementById('anamnesa-anak-hidup')?.value || '',
                usia_menarche: document.getElementById('anamnesa-usia-menarche')?.value || '',
                lama_siklus: document.getElementById('anamnesa-lama-siklus')?.value || '',
                siklus_teratur: document.getElementById('anamnesa-siklus-teratur')?.value || '',
                metode_kb_terakhir: document.getElementById('anamnesa-metode-kb')?.value || '',
                kegagalan_kb: document.getElementById('anamnesa-kegagalan-kb')?.value || '',
                jenis_kb_gagal: document.getElementById('anamnesa-jenis-kb-gagal')?.value || ''
            };

            // Get MR ID and token from state
            const state = stateManager.getState();
            const mrId = state.currentMrId ||
                        state.recordData?.mrId ||
                        state.recordData?.mr_id ||
                        state.recordData?.record?.mrId ||
                        state.recordData?.record?.mr_id;

            if (!mrId) {
                this.showError('MR ID tidak ditemukan');
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-save"></i> Simpan';
                return;
            }

            // Get token
            const token = window.getToken();
            if (!token) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-save"></i> Simpan';
                return;
            }

            // Add saved timestamp
            data.saved_at = new Date().toISOString();

            // Send to API using sunday-clinic endpoint with mrId
            const response = await fetch(`/api/sunday-clinic/records/${mrId}/anamnesa`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(data)
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
                throw new Error(errorData.message || `Server error: ${response.status}`);
            }

            const result = await response.json();
            console.log('[SundayClinic] Anamnesa saved successfully:', result);

            // Update state
            stateManager.updateSectionData('anamnesa', data);

            // Show success message
            this.showSuccess('Anamnesa berhasil disimpan!');

            // Reload the record to show updated metadata
            await this.fetchRecord(this.currentMrId);

            // Re-enable button
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-save"></i> Simpan';

        } catch (error) {
            console.error('Error saving anamnesa:', error);
            this.showError('Gagal menyimpan anamnesa: ' + error.message);

            // Re-enable button
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-save"></i> Simpan';
        } finally {
            this._savingAnamnesa = false;
        }
    }

    /**
     * Fetch and reload record data
     */
    async fetchRecord(mrId) {
        const token = window.getToken();
        if (!token) {
            return;
        }

        const normalizedMr = mrId ? String(mrId).trim() : '';
        if (!normalizedMr) {
            this.showError('MR ID tidak ditemukan');
            return;
        }

        this.showLoading('Memuat data rekam medis...');

        try {
            // Use apiClient instead of direct fetch to ensure consistent data structure
            const response = await apiClient.getRecord(normalizedMr);

            if (!response.success) {
                throw new Error(response.message || 'Failed to load record');
            }

            if (!response.data) {
                this.showError('Data rekam medis Sunday Clinic kosong.');
                return;
            }

            // Load record data into state manager
            await stateManager.loadRecord(response.data);

            // Re-render the current section
            const currentSection = stateManager.getState().activeSection || SECTIONS.IDENTITY;
            await this.render(currentSection);

            this.hideLoading();

        } catch (error) {
            console.error('Sunday Clinic: gagal memuat rekam medis', error);
            this.showError('Terjadi kesalahan saat memuat data rekam medis Sunday Clinic.');
            this.hideLoading();
        }
    }

    /**
     * Save Diagnosis
     */
    async saveDiagnosis() {
        // Prevent double submission
        if (this._savingDiagnosis) {
            console.warn('[SundayClinic] Diagnosis save already in progress, ignoring duplicate call');
            return;
        }
        this._savingDiagnosis = true;

        try {
            this.showLoading('Menyimpan Diagnosis...');

            const data = {
                diagnosis_utama: document.getElementById('diagnosis-utama')?.value || '',
                diagnosis_sekunder: document.getElementById('diagnosis-sekunder')?.value || '',
                saved_at: new Date().toISOString()
            };

            const state = stateManager.getState();
            const mrId = state.currentMrId ||
                        state.recordData?.mrId ||
                        state.recordData?.mr_id ||
                        state.recordData?.record?.mrId ||
                        state.recordData?.record?.mr_id;

            if (!mrId) {
                throw new Error('MR ID tidak ditemukan');
            }

            const token = window.getToken();
            if (!token) {
                throw new Error('Authentication token tidak tersedia');
            }

            const response = await fetch(`/api/sunday-clinic/records/${mrId}/diagnosis`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(data)
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
                console.error('Server error response:', errorData);
                throw new Error(errorData.message || `Server error: ${response.status}`);
            }

            const result = await response.json();
            console.log('[SundayClinic] Diagnosis saved successfully:', result);

            // Update state
            stateManager.updateSectionData('diagnosis', data);

            this.showSuccess('Diagnosis berhasil disimpan!');

            // Reload the record to show updated metadata
            await this.fetchRecord(this.currentMrId);

        } catch (error) {
            console.error('Error saving diagnosis:', error);
            this.showError('Gagal menyimpan diagnosis: ' + error.message);
        } finally {
            this.hideLoading();
            this._savingDiagnosis = false;
        }
    }

    /**
     * Generate Resume Medis using AI
     */
    async generateResumeMedis() {
        if (this._generatingResume) {
            console.warn('[SundayClinic] Resume generation already in progress');
            return;
        }
        this._generatingResume = true;

        try {
            this.showLoading('Membuat resume medis dengan AI...');

            const state = stateManager.getState();
            const patientId = state.derived?.patientId;
            
            if (!patientId) {
                throw new Error('Patient ID tidak ditemukan');
            }

            const token = window.getToken();
            if (!token) {
                throw new Error('Authentication token tidak tersedia');
            }

            const response = await fetch('/api/medical-records/generate-resume', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ 
                    patientId,
                    visitId: this.currentMrId // Only use data from current visit
                })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
                throw new Error(errorData.message || `Server error: ${response.status}`);
            }

            const result = await response.json();
            console.log('[SundayClinic] Resume generated:', result);

            // Update display with generated resume
            const resumeContent = document.getElementById('resume-content');
            const resumeDisplay = document.getElementById('resume-display');
            const resumeEmpty = document.getElementById('resume-empty');
            const resumeText = result.data?.resume || '';
            const escapedForAttr = resumeText.replace(/"/g, '&quot;').replace(/'/g, '&#039;');

            if (resumeContent && resumeText) {
                resumeContent.textContent = resumeText;
                resumeContent.setAttribute('data-plain-text', resumeText);
            } else if (resumeDisplay && resumeText) {
                resumeDisplay.innerHTML = `
                    <div class="card bg-light">
                        <div class="card-body">
                            <div id="resume-content" data-plain-text="${escapedForAttr}" style="white-space: pre-wrap; line-height: 1.8;">${this.escapeHtml(resumeText)}</div>
                        </div>
                    </div>
                `;
            } else if (resumeEmpty && resumeText) {
                resumeEmpty.outerHTML = `
                    <div class="resume-display" id="resume-display">
                        <div class="card bg-light">
                            <div class="card-body">
                                <div id="resume-content" data-plain-text="${escapedForAttr}" style="white-space: pre-wrap; line-height: 1.8;">${this.escapeHtml(resumeText)}</div>
                            </div>
                        </div>
                    </div>
                `;
            }

            // Show save button
            const buttonGroup = document.getElementById('resume-button-group');
            if (buttonGroup && !document.getElementById('btn-save-resume')) {
                buttonGroup.innerHTML = `
                    <button type="button" class="btn btn-primary" id="btn-generate-resume" onclick="window.generateResumeMedis()">
                        <i class="fas fa-magic mr-2"></i>Generate Resume AI
                    </button>
                    <button type="button" class="btn btn-success ml-2" id="btn-save-resume" onclick="window.saveResumeMedis()">
                        <i class="fas fa-save mr-2"></i>Simpan Resume
                    </button>
                `;
            }

            this.showSuccess('Resume medis berhasil dibuat!');

        } catch (error) {
            console.error('[SundayClinic] Generate resume failed:', error);
            this.showError(error.message);
        } finally {
            this.hideLoading();
            this._generatingResume = false;
        }
    }

    /**
     * Save Resume Medis
     */
    async saveResumeMedis() {
        if (this._savingResume) {
            console.warn('[SundayClinic] Resume save already in progress');
            return;
        }
        this._savingResume = true;

        try {
            this.showLoading('Menyimpan resume medis...');

            const resumeContent = document.getElementById('resume-content');
            if (!resumeContent) {
                throw new Error('Resume content tidak ditemukan');
            }

            // Get plain text from data attribute (original unformatted text)
            const plainText = resumeContent.getAttribute('data-plain-text');

            const data = {
                resume: plainText || resumeContent.textContent || resumeContent.innerText,
                saved_at: new Date().toISOString()
            };

            const state = stateManager.getState();
            const mrId = state.currentMrId ||
                        state.recordData?.mrId ||
                        state.recordData?.mr_id ||
                        state.recordData?.record?.mrId ||
                        state.recordData?.record?.mr_id ||
                        this.currentMrId;

            if (!mrId) {
                throw new Error('MR ID tidak ditemukan');
            }

            const token = window.getToken();
            if (!token) {
                throw new Error('Authentication token tidak tersedia');
            }

            const response = await fetch(`/api/sunday-clinic/records/${mrId}/resume_medis`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(data)
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
                throw new Error(errorData.message || `Server error: ${response.status}`);
            }

            const result = await response.json();
            console.log('[SundayClinic] Resume saved:', result);

            // Update state
            stateManager.updateSectionData('resume_medis', data);

            this.showSuccess('Resume medis berhasil disimpan!');

            // Reload record to show updated metadata
            await this.fetchRecord(this.currentMrId);

        } catch (error) {
            console.error('[SundayClinic] Save resume failed:', error);
            this.showError(error.message);
        } finally {
            this.hideLoading();
            this._savingResume = false;
        }
    }

    /**
     * Reset Resume Medis (clear generated content and delete from database)
     */
    async resetResumeMedis() {
        const confirmed = confirm('Apakah Anda yakin ingin mereset resume medis? Semua resume medis untuk visit ini akan dihapus dari database.');
        if (!confirmed) return;

        try {
            this.showLoading('Mereset resume medis...');

            const state = stateManager.getState();
            const patientId = state.derived?.patientId;
            const mrId = this.currentMrId;

            if (!patientId || !mrId) {
                throw new Error('Patient ID atau MR ID tidak ditemukan');
            }

            const token = window.getToken();
            if (!token) {
                throw new Error('Authentication token tidak tersedia');
            }

            // Delete all resume_medis records for this visit
            const response = await fetch(`/api/medical-records/by-type/resume_medis?patientId=${patientId}&mrId=${mrId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
                throw new Error(errorData.message || `Server error: ${response.status}`);
            }

            const result = await response.json();
            console.log('[SundayClinic] Resume records deleted:', result.deletedCount || 0);
        

            // Clear the resume display
            const resumeDisplay = document.getElementById('resume-display');
            if (resumeDisplay) {
                resumeDisplay.innerHTML = `
                    <div class="alert alert-warning" id="resume-empty">
                        <i class="fas fa-info-circle mr-2"></i>
                        Resume medis belum dibuat. Klik tombol "Generate Resume AI" untuk membuat resume otomatis dari data pemeriksaan.
                    </div>
                `;
            }

            // Remove save button
            const saveButton = document.getElementById('btn-save-resume');
            if (saveButton) saveButton.remove();
            
            const resetButton = document.getElementById('btn-reset-resume');
            if (resetButton) resetButton.remove();

            this.showSuccess('Resume medis berhasil direset dan dihapus dari database!');

            // Reload to update state
            await this.fetchRecord(this.currentMrId);

        } catch (error) {
            console.error('[SundayClinic] Reset resume failed:', error);
            this.showError(error.message);
        } finally {
            this.hideLoading();
        }
    }

    /**
     * Escape HTML
     */
    escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
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
            // Preserve the current active section when reloading
            const currentSection = stateManager.getState().activeSection || SECTIONS.IDENTITY;
            await this.init(this.currentMrId, currentSection);
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

    /**
     * Initialize real-time billing notifications
     */
    initializeBillingNotifications() {
        if (!this.billingNotifications) {
            this.billingNotifications = new BillingNotifications();
            
            // Make it globally available
            window.realtimeSync = this.billingNotifications;
            
            // Setup event listeners for notifications
            this.setupBillingEventListeners();
            
            console.log('[SundayClinic] Real-time billing notifications initialized');
        }
    }

    /**
     * Setup billing event listeners for auto-refresh
     */
    setupBillingEventListeners() {
        console.log('[SundayClinic] Setting up billing event listeners');
        
        // Listen for billing confirmed event
        this.billingNotifications.on('billing_confirmed', (data) => {
            console.log('[SundayClinic] billing_confirmed listener triggered with data:', data);
            const userRole = window.currentStaffIdentity?.role || '';
            const isDokter = userRole === 'dokter' || userRole === 'superadmin';

            if (!isDokter) {
                BillingNotifications.showClientNotification(
                    `Dokter telah selesai memeriksa ${data.patientName}. Tagihan terkonfirmasi.`,
                    'success'
                );

                // Auto-refresh to reload billing data
                setTimeout(() => {
                    console.log('[SundayClinic] Auto-refreshing after billing confirmed');
                    this.reload();
                }, 2000);
            }
        });

        // Listen for revision requested event (with deduplication guard)
        let lastRevisionId = null;
        let revisionDialogShowing = false;

        this.billingNotifications.on('revision_requested', (data) => {
            console.log('[SundayClinic] revision_requested listener triggered with data:', data);

            // Prevent duplicate dialogs for the same revision
            if (data.revisionId === lastRevisionId || revisionDialogShowing) {
                console.log('[SundayClinic] Skipping duplicate revision notification');
                return;
            }

            const userRole = window.currentStaffIdentity?.role || '';
            const isDokter = userRole === 'dokter' || userRole === 'superadmin';
            console.log('[SundayClinic] User role:', userRole, 'isDokter:', isDokter);

            if (isDokter) {
                console.log('[SundayClinic] Dokter confirmed, showing dialog');
                lastRevisionId = data.revisionId;
                revisionDialogShowing = true;

                // Use custom modal instead of native confirm (native may be blocked)
                this.showRevisionDialog(data).finally(() => {
                    revisionDialogShowing = false;
                });
            }
        });
    }

    /**
     * Check if documents were sent for this visit (persists across refresh)
     */
    async checkSentDocumentsStatus() {
        if (!this.currentMrId) return;

        try {
            const token = window.getToken();
            if (!token) return;

            const response = await fetch(`/api/patient-documents/check-sent/${this.currentMrId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) return;

            const result = await response.json();
            if (result.success && result.hasSentDocuments) {
                // Update state with sent documents info
                const state = stateManager.getState();
                stateManager.setState({
                    ...state,
                    documentsSent: result.sentStatus
                });
                console.log('[SundayClinic] Documents sent status loaded:', result.sentStatus);
            }
        } catch (error) {
            console.warn('[SundayClinic] Could not check sent documents:', error.message);
        }
    }

    /**
     * Initialize send to patient modal
     */
    initializeSendToPatientModal() {
        // Check if modal already exists
        if (document.getElementById('sendToPatientModal')) {
            return;
        }

        // Inject modal HTML into the DOM
        const modalHtml = SendToPatient.renderModal();
        document.body.insertAdjacentHTML('beforeend', modalHtml);

        console.log('[SundayClinic] Send to patient modal initialized');
    }

    /**
     * Show custom revision approval dialog
     */
    showRevisionDialog(data) {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.style.cssText = `
                position: fixed; top: 0; left: 0; right: 0; bottom: 0;
                background: rgba(0,0,0,0.7); display: flex;
                align-items: center; justify-content: center; z-index: 10000;
            `;

            const modal = document.createElement('div');
            modal.style.cssText = `
                background: white; padding: 30px; border-radius: 12px;
                box-shadow: 0 20px 60px rgba(0,0,0,0.3); max-width: 500px; width: 90%;
            `;
            modal.innerHTML = `
                <div style="text-align: center; margin-bottom: 20px;">
                    <div style="width: 60px; height: 60px; border-radius: 50%; background: #f59e0b;
                        color: white; display: flex; align-items: center; justify-content: center;
                        font-size: 32px; margin: 0 auto 15px;">⚠</div>
                    <h3 style="color: #1e293b; margin: 0;">Usulan Revisi Billing</h3>
                </div>
                <div style="background: #f8fafc; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
                    <p style="margin: 0 0 10px; color: #64748b;"><strong>Pasien:</strong> ${data.patientName || 'Unknown'}</p>
                    <p style="margin: 0 0 10px; color: #64748b;"><strong>Dari:</strong> ${data.requestedBy || 'Staff'}</p>
                    <p style="margin: 0; color: #1e293b;"><strong>Pesan:</strong></p>
                    <p style="margin: 5px 0 0; color: #334155; font-style: italic;">"${data.message || 'No message'}"</p>
                </div>
                <p style="text-align: center; color: #64748b; margin-bottom: 20px;">Setujui usulan revisi ini?</p>
                <div style="display: flex; gap: 10px; justify-content: center;">
                    <button id="revision-reject" style="padding: 12px 24px; border: 1px solid #e2e8f0;
                        background: white; border-radius: 8px; cursor: pointer; font-size: 14px;">Tolak</button>
                    <button id="revision-approve" style="padding: 12px 24px; border: none;
                        background: #10b981; color: white; border-radius: 8px; cursor: pointer; font-size: 14px;">Setujui</button>
                </div>
            `;

            overlay.appendChild(modal);
            document.body.appendChild(overlay);

            const cleanup = () => {
                if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
                resolve();
            };

            modal.querySelector('#revision-approve').addEventListener('click', async () => {
                try {
                    const response = await fetch(`/api/sunday-clinic/billing/revisions/${data.revisionId}/approve`, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${window.getToken()}`,
                            'Content-Type': 'application/json'
                        }
                    });
                    const result = await response.json();

                    if (result.success) {
                        cleanup();
                        if (window.showSuccess) window.showSuccess('Usulan disetujui. Billing dikembalikan ke draft.');
                        this.reload();
                    } else {
                        if (window.showError) window.showError('Gagal: ' + (result.message || 'Unknown error'));
                    }
                } catch (error) {
                    console.error('Error approving revision:', error);
                    if (window.showError) window.showError('Gagal menyetujui usulan');
                }
            });

            modal.querySelector('#revision-reject').addEventListener('click', cleanup);
            overlay.addEventListener('click', (e) => { if (e.target === overlay) cleanup(); });
        });
    }
}

// Export singleton instance
const app = new SundayClinicApp();
export default app;

// Make it globally available
window.SundayClinicApp = app;

// Also make save functions globally available for button handlers
window.saveAnamnesa = () => app.saveAnamnesa();
window.savePhysicalExam = () => app.savePhysicalExam();
window.savePemeriksaanObstetri = () => app.savePemeriksaanObstetri();
window.saveUSGExam = () => app.saveUSGExam();
window.savePlanningObstetri = () => app.savePlanningObstetri();
window.saveDiagnosis = () => app.saveDiagnosis();
window.generateResumeMedis = () => app.generateResumeMedis();
window.saveResumeMedis = () => app.saveResumeMedis();
window.resetResumeMedis = () => app.resetResumeMedis();

// PDF Download function
window.downloadResumePDF = async () => {
    const state = stateManager.getState();
    const mrId = state.currentMrId || state.recordData?.mrId || state.recordData?.mr_id;

    if (!mrId) {
        alert('MR ID tidak ditemukan');
        return;
    }

    const btn = document.getElementById('btn-download-pdf');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating...';
    }

    try {
        const token = window.getToken();

        // Step 1: Generate PDF
        const genResponse = await fetch('/api/sunday-clinic/resume-medis/pdf', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ mrId })
        });

        const genResult = await genResponse.json();

        if (!genResult.success) {
            alert(genResult.message || 'Gagal generate PDF');
            return;
        }

        // Step 2: Download PDF with token
        const downloadResponse = await fetch(genResult.data.downloadUrl, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!downloadResponse.ok) {
            throw new Error('Gagal download PDF');
        }

        // Step 3: Create blob and download
        const blob = await downloadResponse.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = genResult.data.filename || `${mrId}_resume.pdf`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        a.remove();

    } catch (error) {
        console.error('Download PDF error:', error);
        alert('Gagal generate PDF: ' + error.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-file-pdf"></i> PDF';
        }
    }
};

// Open WhatsApp Modal
window.openWhatsAppModal = () => {
    const modal = document.getElementById('whatsappResumeModal');
    if (modal) {
        // Pre-fill phone from patient data if available
        const state = stateManager.getState();
        const phone = state.patientData?.phone || state.recordData?.phone || '';
        const phoneInput = document.getElementById('whatsapp-resume-phone');
        if (phoneInput && phone) {
            phoneInput.value = phone;
        }
        $(modal).modal('show');
    }
};

// Send Resume via WhatsApp
window.sendResumeWhatsApp = async () => {
    const state = stateManager.getState();
    const mrId = state.currentMrId || state.recordData?.mrId || state.recordData?.mr_id;
    const phone = document.getElementById('whatsapp-resume-phone')?.value?.trim();

    if (!mrId) {
        alert('MR ID tidak ditemukan');
        return;
    }

    if (!phone) {
        alert('Masukkan nomor WhatsApp tujuan');
        return;
    }

    const btn = document.getElementById('btn-confirm-whatsapp');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Mengirim...';
    }

    try {
        const token = window.getToken();
        const response = await fetch('/api/sunday-clinic/resume-medis/send-whatsapp', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ mrId, phone })
        });

        const result = await response.json();

        if (result.success) {
            if (result.data.method === 'manual') {
                // Open wa.me link in new tab
                window.open(result.data.waLink, '_blank');
                alert('Link WhatsApp dibuka. Silakan kirim pesan.');
            } else {
                alert('Resume medis berhasil dikirim via WhatsApp!');
            }
            $('#whatsappResumeModal').modal('hide');
        } else {
            alert(result.message || 'Gagal mengirim WhatsApp');
        }
    } catch (error) {
        console.error('Send WhatsApp error:', error);
        alert('Gagal mengirim: ' + error.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fab fa-whatsapp mr-1"></i> Kirim';
        }
    }
};

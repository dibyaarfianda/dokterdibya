/**
 * Sunday Clinic - Main Application Entry Point
 * Modular Component-Based Architecture
 *
 * This file replaces the old 6,447-line monolithic implementation
 * with a clean integration layer for the Phase 2 component system.
 *
 * Old file backed up as: sunday-clinic.js.backup
 */

import SundayClinicApp from './sunday-clinic/main.js';
import apiClient from './sunday-clinic/utils/api-client.js';
import stateManager from './sunday-clinic/utils/state-manager.js';

// ============================================================================
// CONSTANTS
// ============================================================================

const SECTION_DEFS = [
    { id: 'identity', label: 'Identitas', icon: 'fa-id-card' },
    { id: 'anamnesa', label: 'Anamnesa', icon: 'fa-clipboard-list' },
    { id: 'physical-exam', label: 'Pemeriksaan Fisik', icon: 'fa-stethoscope' },
    { id: 'pemeriksaan-obstetri', label: 'Pemeriksaan Obstetri', icon: 'fa-heartbeat' },
    { id: 'usg', label: 'USG', icon: 'fa-baby' },
    { id: 'penunjang', label: 'Penunjang', icon: 'fa-flask' },
    { id: 'diagnosis', label: 'Diagnosis', icon: 'fa-diagnoses' },
    { id: 'plan', label: 'Planning', icon: 'fa-clipboard-check' },
    { id: 'billing', label: 'Tagihan', icon: 'fa-file-invoice-dollar' }
];

const SECTION_LOOKUP = new Map(SECTION_DEFS.map(section => [section.id, section]));

// ============================================================================
// STATE
// ============================================================================

const appState = {
    currentMrId: null,
    currentSection: 'identity',
    staffIdentity: {
        id: null,
        name: null
    },
    isInitialized: false
};

// Directory state
const directoryState = {
    loading: false,
    patients: [],
    filteredPatients: [],
    selectedPatientId: null,
    selectedVisitMrId: null,
    searchTerm: '',
    error: null
};

// DOM references
const DOM = {
    root: null,
    content: null,
    loading: null,
    header: null,
    directoryOverlay: null,
    directoryPatientList: null,
    directoryVisitList: null,
    directoryInfo: null,
    directorySearch: null,
    openDirectoryBtn: null,
    closeDirectoryBtn: null,
    staffNameDisplay: null
};

// ============================================================================
// GLOBAL HELPERS (for planning-helpers.js compatibility)
// ============================================================================

// Expose getToken globally for planning-helpers.js
window.getToken = function() {
    const token = localStorage.getItem('vps_auth_token') || sessionStorage.getItem('vps_auth_token');
    if (!token) {
        window.location.href = '/staff/public/login.html';
        return null;
    }
    return token;
};

// Expose routeMrSlug globally for planning-helpers.js
window.routeMrSlug = null;

// Expose showSuccess and showError globally for planning-helpers.js
window.showSuccess = function(message) {
    // Create a temporary toast notification
    const toast = document.createElement('div');
    toast.className = 'alert alert-success position-fixed';
    toast.style.cssText = 'top: 20px; right: 20px; z-index: 9999; min-width: 300px;';
    toast.innerHTML = `
        <i class="fas fa-check-circle mr-2"></i>${escapeHtml(message)}
    `;
    document.body.appendChild(toast);

    // Remove after 3 seconds
    setTimeout(() => {
        toast.style.transition = 'opacity 0.3s';
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
};

window.showError = function(message) {
    // Create a temporary toast notification
    const toast = document.createElement('div');
    toast.className = 'alert alert-danger position-fixed';
    toast.style.cssText = 'top: 20px; right: 20px; z-index: 9999; min-width: 300px;';
    toast.innerHTML = `
        <i class="fas fa-exclamation-circle mr-2"></i>${escapeHtml(message)}
    `;
    document.body.appendChild(toast);

    // Remove after 5 seconds
    setTimeout(() => {
        toast.style.transition = 'opacity 0.3s';
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 5000);
};

// Helper function for escaping HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================================================
// INITIALIZATION
// ============================================================================

document.addEventListener('DOMContentLoaded', async () => {
    console.log('[SundayClinic] Initializing application...');

    try {
        // Check authentication
        if (!await checkAuthentication()) {
            return;
        }

        // Initialize DOM references
        initializeDOMReferences();

        // Setup event listeners
        setupEventListeners();

        // Setup date/time display
        setupDateTimeDisplay();

        // Initialize directory system
        await initializeDirectory();

        // Check for initial MR ID in URL
        const initialRoute = parseRoute();
        if (initialRoute.mrId) {
            await loadMedicalRecord(initialRoute.mrId, initialRoute.section);
        } else {
            showWelcomeScreen();
        }

        appState.isInitialized = true;
        console.log('[SundayClinic] Application initialized successfully');

    } catch (error) {
        console.error('[SundayClinic] Initialization failed:', error);
        showError('Gagal menginisialisasi aplikasi. Silakan refresh halaman.');
    }
});

// ============================================================================
// AUTHENTICATION
// ============================================================================

async function checkAuthentication() {
    const token = localStorage.getItem('vps_auth_token');

    if (!token) {
        console.warn('[SundayClinic] No auth token found, redirecting to login');
        window.location.href = '/staff/public/login.html';
        return false;
    }

    try {
        // Set token in API client
        apiClient.setToken(token);

        // Verify token and get staff info
        const response = await apiClient.get('/api/auth/me');

        if (response.success && response.data && response.data.user) {
            appState.staffIdentity = {
                id: response.data.user.id,
                name: response.data.user.name || response.data.user.email
            };

            // Update staff name display
            if (DOM.staffNameDisplay) {
                DOM.staffNameDisplay.textContent = appState.staffIdentity.name;
            }

            console.log('[SundayClinic] Authenticated as:', appState.staffIdentity.name);
            return true;
        } else {
            throw new Error('Invalid token response');
        }
    } catch (error) {
        console.error('[SundayClinic] Authentication failed:', error);
        localStorage.removeItem('vps_auth_token');
        window.location.href = '/staff/public/login.html';
        return false;
    }
}

// ============================================================================
// DOM INITIALIZATION
// ============================================================================

function initializeDOMReferences() {
    DOM.root = document.getElementById('sunday-clinic-root');
    DOM.content = document.getElementById('sunday-clinic-content');
    DOM.loading = document.getElementById('sunday-clinic-loading');
    DOM.header = document.getElementById('sunday-clinic-header');
    DOM.directoryOverlay = document.getElementById('sc-directory-overlay');
    DOM.directoryPatientList = document.getElementById('sc-directory-patient-list');
    DOM.directoryVisitList = document.getElementById('sc-directory-visit-list');
    DOM.directoryInfo = document.getElementById('sc-directory-info');
    DOM.directorySearch = document.getElementById('sc-directory-search');
    DOM.openDirectoryBtn = document.getElementById('sc-open-directory');
    DOM.closeDirectoryBtn = document.getElementById('sc-directory-close');
    DOM.staffNameDisplay = document.getElementById('staff-name-display');

    // Verify critical DOM elements
    if (!DOM.root || !DOM.content) {
        throw new Error('Critical DOM elements not found');
    }
}

function setupEventListeners() {
    // Directory open/close
    if (DOM.openDirectoryBtn) {
        DOM.openDirectoryBtn.addEventListener('click', openDirectory);
    }

    if (DOM.closeDirectoryBtn) {
        DOM.closeDirectoryBtn.addEventListener('click', closeDirectory);
    }

    // Directory overlay click (close on background click)
    if (DOM.directoryOverlay) {
        DOM.directoryOverlay.addEventListener('click', (e) => {
            if (e.target === DOM.directoryOverlay) {
                closeDirectory();
            }
        });
    }

    // Directory search
    if (DOM.directorySearch) {
        DOM.directorySearch.addEventListener('input', handleDirectorySearch);
    }

    // Logo click (return to dashboard)
    const logo = document.getElementById('sidebar-logo');
    if (logo) {
        logo.addEventListener('click', () => {
            if (confirm('Keluar dari Klinik Privat Minggu?')) {
                window.location.href = '/staff/public/index-adminlte.html';
            }
        });
    }

    // Keyboard shortcuts
    document.addEventListener('keydown', handleKeyboardShortcuts);
}

function setupDateTimeDisplay() {
    const dateDisplay = document.getElementById('date-display');
    const timeDisplay = document.getElementById('time-display');

    if (!dateDisplay || !timeDisplay) return;

    function updateDateTime() {
        const now = new Date();

        // Date format: Senin, 20 Nov 2025
        const dateOptions = { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' };
        dateDisplay.textContent = now.toLocaleDateString('id-ID', dateOptions);

        // Time format: 14:30:45
        const timeOptions = { hour: '2-digit', minute: '2-digit', second: '2-digit' };
        timeDisplay.textContent = now.toLocaleTimeString('id-ID', timeOptions);
    }

    updateDateTime();
    setInterval(updateDateTime, 1000);
}

// ============================================================================
// ROUTE PARSING
// ============================================================================

function parseRoute(pathname = window.location.pathname) {
    const trimmed = pathname.replace(/^\/+|\/+$/g, '');
    const segments = trimmed.split('/');
    const [root, rawMrId = '', rawSection = 'identity', ...rest] = segments;

    if (root !== 'sunday-clinic') {
        return { mrId: null, section: 'identity', remainder: '' };
    }

    return {
        mrId: rawMrId || null,
        section: (rawSection || 'identity').toLowerCase(),
        remainder: rest.join('/')
    };
}

function updateRoute(mrId, section = 'identity') {
    const newPath = `/sunday-clinic/${mrId}/${section}`;
    window.history.pushState({ mrId, section }, '', newPath);
}

// ============================================================================
// MEDICAL RECORD LOADING
// ============================================================================

async function loadMedicalRecord(mrId, section = 'identity') {
    console.log('[SundayClinic] Loading MR:', mrId, 'Section:', section);

    try {
        showLoading();

        // Update app state
        appState.currentMrId = mrId;
        appState.currentSection = section;

        // Update global routeMrSlug for planning-helpers.js
        window.routeMrSlug = mrId;

        // Update route
        updateRoute(mrId, section);

        // Initialize Sunday Clinic App with MR ID (it will fetch the data and render the section)
        await SundayClinicApp.init(mrId, section);

        // Update section navigation
        updateSectionNavigation(section);

        // Hide loading
        hideLoading();

        console.log('[SundayClinic] MR loaded successfully');

    } catch (error) {
        console.error('[SundayClinic] Failed to load MR:', error);
        hideLoading();
        showError('Gagal memuat rekam medis. ' + (error.message || 'Terjadi kesalahan.'));
    }
}

// ============================================================================
// SECTION NAVIGATION
// ============================================================================

window.handleSectionChange = async function(section) {
    console.log('[SundayClinic] Section changed:', section);

    if (!appState.currentMrId) {
        console.warn('[SundayClinic] No MR loaded');
        return;
    }

    appState.currentSection = section;
    updateRoute(appState.currentMrId, section);
    updateSectionNavigation(section);

    // Navigate to section (show only that section)
    await SundayClinicApp.navigateToSection(section);
};

function updateSectionNavigation(activeSection) {
    // Update active state in sidebar
    document.querySelectorAll('.sc-nav-link').forEach(link => {
        if (link.dataset.section === activeSection) {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
        }
    });
}

function scrollToSection(section) {
    // Scroll to the section card
    const sectionCard = document.querySelector(`[data-section="${section}"]`);
    if (sectionCard) {
        sectionCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
        // Scroll to top of content area
        if (DOM.content) {
            DOM.content.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }
}

// ============================================================================
// DIRECTORY SYSTEM
// ============================================================================

async function initializeDirectory() {
    console.log('[SundayClinic] Initializing directory...');

    try {
        const response = await apiClient.get('/api/sunday-clinic/directory');

        if (response.success && response.data) {
            directoryState.patients = response.data.patients || [];
            directoryState.filteredPatients = directoryState.patients;
            console.log('[SundayClinic] Directory loaded:', directoryState.patients.length, 'patients');
        }
    } catch (error) {
        console.error('[SundayClinic] Failed to load directory:', error);
        directoryState.error = error.message;
    }
}

function openDirectory() {
    if (DOM.directoryOverlay) {
        DOM.directoryOverlay.removeAttribute('hidden');
        DOM.directoryOverlay.setAttribute('aria-hidden', 'false');
        renderDirectoryPatients();

        // Focus search input
        if (DOM.directorySearch) {
            setTimeout(() => DOM.directorySearch.focus(), 100);
        }
    }
}

function closeDirectory() {
    if (DOM.directoryOverlay) {
        DOM.directoryOverlay.setAttribute('hidden', '');
        DOM.directoryOverlay.setAttribute('aria-hidden', 'true');

        // Clear selection
        directoryState.selectedPatientId = null;
        directoryState.selectedVisitMrId = null;
        directoryState.searchTerm = '';

        if (DOM.directorySearch) {
            DOM.directorySearch.value = '';
        }
    }
}

function handleDirectorySearch(e) {
    directoryState.searchTerm = e.target.value.toLowerCase().trim();

    if (directoryState.searchTerm === '') {
        directoryState.filteredPatients = directoryState.patients;
    } else {
        directoryState.filteredPatients = directoryState.patients.filter(patient => {
            const searchStr = `${patient.full_name} ${patient.mr_id} ${patient.phone}`.toLowerCase();
            return searchStr.includes(directoryState.searchTerm);
        });
    }

    renderDirectoryPatients();
}

function renderDirectoryPatients() {
    if (!DOM.directoryPatientList) return;

    if (directoryState.filteredPatients.length === 0) {
        DOM.directoryPatientList.innerHTML = `
            <div class="text-center text-muted p-4">
                <i class="fas fa-search fa-2x mb-2"></i>
                <p>Tidak ada pasien ditemukan</p>
            </div>
        `;
        return;
    }

    DOM.directoryPatientList.innerHTML = directoryState.filteredPatients
        .map(patient => `
            <div class="sc-directory-patient-item ${patient.patient_id === directoryState.selectedPatientId ? 'active' : ''}"
                 data-patient-id="${patient.patient_id}"
                 onclick="selectPatient('${patient.patient_id}')"
                 role="option"
                 aria-selected="${patient.patient_id === directoryState.selectedPatientId}">
                <div class="sc-directory-patient-info">
                    <div class="sc-directory-patient-name">${patient.full_name}</div>
                    <div class="sc-directory-patient-meta">
                        ${patient.mr_id ? `MR: ${patient.mr_id}` : ''}
                        ${patient.phone ? `• ${patient.phone}` : ''}
                    </div>
                </div>
                <i class="fas fa-chevron-right"></i>
            </div>
        `)
        .join('');
}

window.selectPatient = async function(patientId) {
    directoryState.selectedPatientId = patientId;
    directoryState.selectedVisitMrId = null;

    renderDirectoryPatients();

    // Load patient visits
    const patient = directoryState.patients.find(p => p.patient_id === patientId);

    if (!patient) return;

    // Show patient info
    if (DOM.directoryInfo) {
        DOM.directoryInfo.innerHTML = `
            <h3>${patient.full_name}</h3>
            <p class="text-muted mb-0">
                ${patient.date_of_birth ? `Lahir: ${formatDate(patient.date_of_birth)}` : ''}
                ${patient.phone ? `• ${patient.phone}` : ''}
            </p>
        `;
    }

    // Load visits
    try {
        const response = await apiClient.get(`/api/sunday-clinic/patients/${patientId}/visits`);

        if (response.success && response.data) {
            renderDirectoryVisits(response.data.visits || []);
        }
    } catch (error) {
        console.error('[SundayClinic] Failed to load visits:', error);
        if (DOM.directoryVisitList) {
            DOM.directoryVisitList.innerHTML = `
                <div class="text-center text-danger p-4">
                    <i class="fas fa-exclamation-circle fa-2x mb-2"></i>
                    <p>Gagal memuat kunjungan</p>
                </div>
            `;
        }
    }
};

function renderDirectoryVisits(visits) {
    if (!DOM.directoryVisitList) return;

    if (visits.length === 0) {
        DOM.directoryVisitList.innerHTML = `
            <div class="text-center text-muted p-4">
                <i class="fas fa-calendar-times fa-2x mb-2"></i>
                <p>Belum ada kunjungan</p>
            </div>
        `;
        return;
    }

    DOM.directoryVisitList.innerHTML = visits
        .map(visit => `
            <div class="sc-directory-visit-item ${visit.mr_id === directoryState.selectedVisitMrId ? 'active' : ''}"
                 data-mr-id="${visit.mr_id}"
                 onclick="selectVisit('${visit.mr_id}')"
                 role="option"
                 aria-selected="${visit.mr_id === directoryState.selectedVisitMrId}">
                <div class="sc-directory-visit-info">
                    <div class="sc-directory-visit-mr">${visit.mr_id}</div>
                    <div class="sc-directory-visit-date">${formatDate(visit.visit_date)}</div>
                    ${visit.mr_category ? `<span class="badge badge-${getCategoryBadgeClass(visit.mr_category)}">${getCategoryLabel(visit.mr_category)}</span>` : ''}
                </div>
                <button class="btn btn-sm btn-primary" onclick="event.stopPropagation(); openVisit('${visit.mr_id}')">
                    <i class="fas fa-folder-open"></i> Buka
                </button>
            </div>
        `)
        .join('');
}

window.selectVisit = function(mrId) {
    directoryState.selectedVisitMrId = mrId;
    renderDirectoryVisits(
        directoryState.patients
            .find(p => p.patient_id === directoryState.selectedPatientId)
            ?.visits || []
    );
};

window.openVisit = async function(mrId) {
    closeDirectory();
    await loadMedicalRecord(mrId, 'identity');
};

function getCategoryBadgeClass(category) {
    const classes = {
        'obstetri': 'primary',
        'gyn_repro': 'success',
        'gyn_special': 'info'
    };
    return classes[category] || 'secondary';
}

function getCategoryLabel(category) {
    const labels = {
        'obstetri': 'Obstetri',
        'gyn_repro': 'Gyn Repro',
        'gyn_special': 'Gyn Special'
    };
    return labels[category] || category;
}

// ============================================================================
// UI HELPERS
// ============================================================================

function showLoading() {
    if (DOM.loading) {
        DOM.loading.style.display = 'flex';
    }
    if (DOM.content) {
        DOM.content.style.opacity = '0.5';
    }
}

function hideLoading() {
    if (DOM.loading) {
        DOM.loading.style.display = 'none';
    }
    if (DOM.content) {
        DOM.content.style.opacity = '1';
    }
}

function showWelcomeScreen() {
    if (DOM.content) {
        DOM.content.innerHTML = `
            <div class="text-center p-5">
                <i class="fas fa-user-md fa-4x text-muted mb-3"></i>
                <h4>Selamat Datang di Klinik Privat Minggu</h4>
                <p class="text-muted">Klik tombol "Pilih Pasien" untuk memulai</p>
                <button class="btn btn-primary btn-lg mt-3" onclick="document.getElementById('sc-open-directory').click()">
                    <i class="fas fa-users mr-2"></i>Pilih Pasien
                </button>
            </div>
        `;
    }
    hideLoading();
}

function showError(message) {
    if (DOM.content) {
        DOM.content.innerHTML = `
            <div class="alert alert-danger m-4">
                <i class="fas fa-exclamation-circle mr-2"></i>
                <strong>Error:</strong> ${message}
            </div>
        `;
    }
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const options = { year: 'numeric', month: 'long', day: 'numeric' };
    return date.toLocaleDateString('id-ID', options);
}

// ============================================================================
// KEYBOARD SHORTCUTS
// ============================================================================

function handleKeyboardShortcuts(e) {
    // Ctrl/Cmd + K: Open directory
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        openDirectory();
    }

    // Escape: Close directory
    if (e.key === 'Escape') {
        closeDirectory();
    }
}

// ============================================================================
// EXPORTS (for debugging in console)
// ============================================================================

window.sundayClinic = {
    loadMedicalRecord,
    openDirectory,
    closeDirectory,
    appState,
    directoryState,
    SundayClinicApp,
    stateManager,
    apiClient
};

console.log('[SundayClinic] Module loaded. Debugging interface available at window.sundayClinic');

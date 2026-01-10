// Core AdminLTE bootstrap for dibyaklinik
// This module ports essential UX from index-asli.html: clock, page switching, and basic bindings.

import { auth, onAuthStateChanged } from './vps-auth-v2.js';
import { validatePatient, validateObatUsage, updatePatientDisplay, getCurrentPatientData, getSelectedServices, getSelectedObat } from './billing.js';
import { showWarning } from './toast.js';
import { initMedicalExam, setCurrentPatientForExam, toggleMedicalExamMenu } from './medical-exam.js';
import { loadSession } from './session-manager.js';
import { initRealtimeSync, disconnectRealtimeSync } from './realtime-sync.js';

// -------------------- AUTH TOKEN HELPER --------------------
// Centralized token getter to avoid inconsistency issues
function getAuthToken() {
    return localStorage.getItem('vps_auth_token') ||
           sessionStorage.getItem('vps_auth_token') ||
           localStorage.getItem('token') ||
           localStorage.getItem('auth_token');
}

// -------------------- CLOCK --------------------
let clockIntervalId = null;
function updateDateTime() {
    const dateEl = document.getElementById('date-display');
    const timeEl = document.getElementById('time-display');
    if (!dateEl || !timeEl) return;
    const now = new Date();
    const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Jakarta' };
    const timeOptions = { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Jakarta', hour12: false };
    dateEl.textContent = now.toLocaleDateString('id-ID', dateOptions);
    timeEl.textContent = `${now.toLocaleTimeString('id-ID', timeOptions)} WIB`;
}
function startClock() {
    if (clockIntervalId) clearInterval(clockIntervalId);
    updateDateTime();
    clockIntervalId = setInterval(updateDateTime, 1000);
}

// -------------------- PAGE SWITCHING --------------------
const pages = {};
const moduleCache = new Map();
// Modules listed here already have static imports elsewhere; skip cache busting
// so we reuse the same evaluated instance across the app.
const skipVersionModules = new Set(['./billing.js', './billing-obat.js', './medical-exam.js']);
const PUBLIC_ASSET_ROOT = new URL('../', import.meta.url).pathname;
function importWithVersion(path) {
    if (moduleCache.has(path)) {
        return moduleCache.get(path);
    }
    let specifier = path;
    const version = window.__assetVersion;
    if (version && !skipVersionModules.has(path)) {
        const separator = path.includes('?') ? '&' : '?';
        specifier = `${path}${separator}v=${version}`;
    }
    const promise = import(specifier);
    moduleCache.set(path, promise);
    return promise;
}
function grab(id) { return document.getElementById(id); }
function initPages() {
    pages.dashboard = grab('dashboard-page');
    pages.klinikPrivate = grab('klinik-private-page');
    pages.patient = grab('patient-page');
    pages.anamnesa = grab('anamnesa-page');
    pages.physical = grab('physical-exam-page');
    pages.usg = grab('usg-exam-page');
    pages.lab = grab('lab-exam-page');
    pages.tindakan = grab('tindakan-page');
    pages.obat = grab('obat-page');
    pages.cashier = grab('cashier-page');
    pages.admin = grab('admin-page');
    pages.pengaturan = grab('pengaturan-page');
    pages.kelolaObat = grab('kelola-obat-page'); 
    pages.logs = grab('log-page');
    pages.appointments = grab('appointments-page');
    pages.analytics = grab('analytics-page');
    pages.profile = grab('profile-settings-page');
    pages.stocks = grab('stocks-page');
    pages.finance = grab('finance-page');
    pages.kelolaPasien = grab('manage-patients-page') || grab('kelola-pasien-page');
    pages.kelolaPasienLegacy = grab('kelola-pasien-page');
    pages.kelolaPengumuman = grab('kelola-pengumuman-page');
    pages.kelolaAppointment = grab('kelola-appointment-page');
    pages.kelolaJadwal = grab('kelola-jadwal-page');
    pages.kelolaTindakan = grab('kelola-tindakan-page');
    pages.kelolaObatManagement = grab('kelola-obat-management-page');
    pages.estimasiBiaya = grab('estimasi-biaya-page');
    pages.financeAnalysis = grab('finance-analysis-page');
    pages.birthCongrats = grab('birth-congrats-page');
    pages.kelolaRoles = grab('kelola-roles-page');
    pages.bookingSettings = grab('booking-settings-page');
    pages.activityLog = grab('activity-log-page');
    pages.kelolaSupplier = grab('kelola-supplier-page');
    pages.staffActivity = grab('staff-activity-page');
    pages.hospitalAppointments = grab('hospital-appointments-page');
    pages.hospitalPatients = grab('hospital-patients-page');
    pages.registrasiPasien = grab('registrasi-pasien-page');
    pages.importFields = grab('import-fields-page');
    pages.notifications = grab('notifications-page');
    pages.artikelKesehatan = grab('artikel-kesehatan-page');
    pages.penjualanObat = grab('penjualan-obat-page');
    pages.bulkUploadUSG = grab('bulk-upload-usg-page');
    pages.medifySync = grab('medify-sync-page');
}
function loadExternalPage(containerId, htmlFile, options = {}) {
    const { forceReload = false } = options;
    const container = document.getElementById(containerId);
    if (!container) return;
    
    const alreadyLoadedSameFile = container.dataset.loaded === 'true' && container.dataset.loadedHtml === htmlFile;
    if (!forceReload && alreadyLoadedSameFile) return;
    
    container.innerHTML = '<div class="text-center p-5"><i class="fas fa-spinner fa-spin fa-2x"></i><p class="mt-2">Memuat...</p></div>';
    
    const fileUrl = new URL(htmlFile, window.location.origin + PUBLIC_ASSET_ROOT).href;
    
    fetch(fileUrl)
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.text();
        })
        .then(html => {
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            const content = doc.querySelector('.content') || doc.querySelector('.content-wrapper') || doc.body;
            container.innerHTML = content.innerHTML;
            container.dataset.loaded = 'true';
            container.dataset.loadedHtml = htmlFile;
            container.dataset.lastLoaded = Date.now().toString();

            // Execute scripts in the loaded content
            executeLoadedScripts(doc, fileUrl);
        })
        .catch(error => {
            console.error('Error loading page:', error, fileUrl);
            container.innerHTML = '<div class="alert alert-danger">Gagal memuat halaman: ' + htmlFile + '</div>';
        });
}

function executeLoadedScripts(doc, baseUrl) {
    const scripts = Array.from(doc.querySelectorAll('script'));

    function copyScriptAttributes(source, target) {
        const typeAttr = source.getAttribute('type');
        if (typeAttr) target.type = typeAttr;
        if (source.getAttribute('nomodule') !== null) target.noModule = true;
        const crossOrigin = source.getAttribute('crossorigin');
        if (crossOrigin) target.crossOrigin = crossOrigin;
        const referrerPolicy = source.getAttribute('referrerpolicy');
        if (referrerPolicy) target.referrerPolicy = referrerPolicy;
        const integrity = source.getAttribute('integrity');
        if (integrity) target.integrity = integrity;
    }

    scripts.forEach(script => {
        const srcAttr = script.getAttribute('src');
        if (srcAttr) {
            const resolvedSrc = new URL(srcAttr, baseUrl).href;
            if (document.querySelector(`script[src="${resolvedSrc}"]`)) {
                return;
            }
            const newScript = document.createElement('script');
            copyScriptAttributes(script, newScript);
            newScript.src = resolvedSrc;
            // Preserve intended async/defer behavior when available
            if (script.defer) newScript.defer = true;
            if (script.async) {
                newScript.async = true;
            } else if (newScript.type !== 'module') {
                newScript.async = false;
            }
            document.body.appendChild(newScript);
            return;
        }

        const text = script.textContent?.trim();
        if (!text) return;

        const inlineScript = document.createElement('script');
        copyScriptAttributes(script, inlineScript);
        inlineScript.textContent = text;
        document.body.appendChild(inlineScript);
        setTimeout(() => inlineScript.remove(), 0);
    });
}
function hideAllPages() {
    Object.values(pages).forEach(p => { if (p) p.classList.add('d-none'); });
    document.querySelectorAll('.nav-sidebar .nav-link').forEach(l => l.classList.remove('active'));
}
function setTitleAndActive(title, navId, mobileAction) {
    const titleEl = document.getElementById('page-title');
    if (titleEl) titleEl.textContent = title;
    if (navId) {
        const link = document.querySelector(`#${navId} .nav-link`);
        if (link) link.classList.add('active');
    }
    if (mobileAction) {
        document.dispatchEvent(new CustomEvent('page:changed', {
            detail: { page: mobileAction }
        }));
    }
    // Log page navigation for audit
    logActivity('Page View', `Viewed ${title}`);
}

// Activity logging function for audit trail
let lastLoggedPage = '';
function logActivity(action, details) {
    // Debounce same page views
    if (action === 'Page View' && details === lastLoggedPage) return;
    if (action === 'Page View') lastLoggedPage = details;

    const token = getAuthToken();
    if (!token) return;

    // Use global user info set by auth.js
    const userId = window.currentUserId || 'unknown';
    const userName = window.currentUserName || 'Unknown';

    // Skip if user not identified yet
    if (userId === 'unknown') return;

    // Fire and forget - don't wait for response
    fetch('/api/logs', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
            user_id: userId,
            user_name: userName,
            action: action,
            details: details
        })
    }).catch(err => console.warn('Activity log failed:', err.message));
}
window.logActivity = logActivity;
function showDashboardPage() {
    hideAllPages();
    pages.dashboard?.classList.remove('d-none');
    setTitleAndActive('Dashboard', 'nav-dashboard', 'dashboard');
    loadDashboardNewPatients();
}

// Dashboard New Patients
let dashboardNewPatientsPage = 1;
let dashboardNewPatientsTotalPages = 1;

async function loadDashboardNewPatients(page = 1) {
    const tbody = document.getElementById('dashboard-new-patients-tbody');
    if (!tbody) return;

    dashboardNewPatientsPage = page;
    tbody.innerHTML = '<tr><td colspan="5" class="text-center"><i class="fas fa-spinner fa-spin"></i> Memuat...</td></tr>';

    try {
        const token = getAuthToken();
        const response = await fetch(`/api/patients?sort=recent&limit=10&page=${page}&_=${Date.now()}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) throw new Error('Gagal memuat data');

        const data = await response.json();
        const pagination = data.pagination || { total: 0, page: 1, totalPages: 1 };
        dashboardNewPatientsTotalPages = pagination.totalPages;

        const start = data.data?.length > 0 ? ((page - 1) * 10) + 1 : 0;
        const end = start > 0 ? start + data.data.length - 1 : 0;

        document.getElementById('dashboard-new-patients-info').textContent =
            `Menampilkan ${start}-${end} dari ${pagination.total}`;
        document.getElementById('dashboard-new-patients-prev').disabled = page <= 1;
        document.getElementById('dashboard-new-patients-next').disabled = page >= dashboardNewPatientsTotalPages;

        if (!data.data || data.data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" class="text-center text-muted">Belum ada pasien terdaftar</td></tr>';
            return;
        }

        tbody.innerHTML = data.data.map(patient => {
            const regDateTime = patient.created_at ? new Date(patient.created_at).toLocaleString('id-ID', {
                day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
            }) : '-';

            return `
                <tr>
                    <td>${patient.full_name || '-'}</td>
                    <td><small class="text-muted">${regDateTime}</small></td>
                    <td>
                        <button class="btn btn-xs btn-info" onclick="viewPatientDetail('${patient.id}')" title="Lihat Detail">
                            <i class="fas fa-eye"></i>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');

    } catch (error) {
        console.error('Load dashboard new patients error:', error);
        tbody.innerHTML = '<tr><td colspan="3" class="text-center text-danger">Gagal memuat data</td></tr>';
    }
}
window.loadDashboardNewPatients = loadDashboardNewPatients;
window.dashboardNewPatientsPage = dashboardNewPatientsPage;
function showKlinikPrivatePage() {
    hideAllPages();
    pages.klinikPrivate?.classList.remove('d-none');
    setTitleAndActive('Klinik Privat', 'nav-klinik-private', 'klinik-private');

    importWithVersion('./klinik-private.js').then(module => {
        if (module && typeof module.initKlinikPrivatePage === 'function') {
            module.initKlinikPrivatePage();
        }
    }).catch(error => {
        console.error('Failed to load klinik-private.js:', error);
    });
}

// Hospital Appointments Page
let currentHospitalLocation = null;
const hospitalNames = {
    'klinik_private': 'Klinik Privat',
    'rsia_melinda': 'RSIA Melinda',
    'rsud_gambiran': 'RSUD Gambiran',
    'rs_bhayangkara': 'RS Bhayangkara'
};
const hospitalColors = {
    'klinik_private': '#007bff',
    'rsia_melinda': '#e91e63',
    'rsud_gambiran': '#2196f3',
    'rs_bhayangkara': '#4caf50'
};
function showHospitalAppointmentsPage(location) {
    currentHospitalLocation = location;
    hideAllPages();
    pages.hospitalAppointments?.classList.remove('d-none');

    const hospitalName = hospitalNames[location] || location;
    const navId = `nav-${location.replace(/_/g, '-')}`;
    setTitleAndActive(hospitalName + ' - Janji Temu', navId, 'hospital-appointments');

    loadHospitalAppointments(location);
}

function showHospitalPatientsPage(location) {
    currentHospitalLocation = location;
    hideAllPages();

    pages.hospitalPatients?.classList.remove('d-none');

    const hospitalName = hospitalNames[location] || location;
    const navId = `nav-${location.replace(/_/g, '-')}-pasien`;

    // Update title
    const titleEl = document.getElementById('hospital-patients-title');
    if (titleEl) {
        titleEl.textContent = `Pasien ${hospitalName}`;
    }

    setTitleAndActive(hospitalName + ' - Pasien', navId, 'hospital-patients');
    loadHospitalPatients(location);
}

// Show Pasien Baru page - patients with no visits yet
function showPasienBaruPage() {
    hideAllPages();
    pages.hospitalPatients?.classList.remove('d-none');

    // Update title
    const titleEl = document.getElementById('hospital-patients-title');
    if (titleEl) {
        titleEl.textContent = 'Pasien Baru (Belum Berkunjung)';
    }

    setTitleAndActive('Pasien Baru', 'nav-pasien-baru', 'hospital-patients');
    loadPasienBaru();
}

async function loadPasienBaru() {
    const tbody = document.getElementById('hospital-patients-tbody');
    const table = document.getElementById('hospital-patients-table');
    if (!tbody || !table) return;

    // Destroy existing DataTable FIRST before loading new data
    try {
        if ($.fn.DataTable.isDataTable('#hospital-patients-table')) {
            $('#hospital-patients-table').DataTable().clear().destroy();
        }
    } catch (e) {
        console.warn('DataTable destroy warning:', e.message);
    }

    tbody.innerHTML = `<tr><td colspan="9" class="text-center"><i class="fas fa-spinner fa-spin"></i> Memuat data pasien baru...</td></tr>`;

    try {
        const token = getAuthToken();
        // Use last_visit_location=no_visit to get patients without any visits
        const response = await fetch(`/api/patients?last_visit_location=no_visit&_=${Date.now()}`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Cache-Control': 'no-cache'
            }
        });

        if (!response.ok) throw new Error('Gagal memuat data');

        const data = await response.json();

        if (!data.data || data.data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="9" class="text-center">Tidak ada pasien baru (semua pasien sudah pernah berkunjung)</td></tr>`;
            return;
        }

        tbody.innerHTML = data.data.map(patient => {
            const birthDate = patient.birth_date ? new Date(patient.birth_date).toLocaleDateString('id-ID', {day: 'numeric', month: 'long', year: 'numeric'}) : '-';
            const regDate = patient.created_at ? new Date(patient.created_at).toLocaleDateString('id-ID', {day: 'numeric', month: 'long', year: 'numeric'}) : '-';
            const statusBadge = patient.status === 'active' ?
                '<span class="badge badge-success">Aktif</span>' :
                '<span class="badge badge-secondary">Nonaktif</span>';

            return `
                <tr>
                    <td>${patient.id}</td>
                    <td>${patient.full_name || '-'}</td>
                    <td>${patient.whatsapp || patient.phone || '-'}</td>
                    <td>${birthDate}</td>
                    <td>${patient.age || '-'}</td>
                    <td><span class="badge badge-warning">Belum berkunjung</span></td>
                    <td>${regDate}</td>
                    <td>${statusBadge}</td>
                    <td class="text-nowrap">
                        <button type="button" class="btn btn-sm btn-info btn-view-hospital-patient" data-patient-id="${patient.id}" title="Detail">
                            <i class="fas fa-eye"></i>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');

        // Initialize DataTable (already destroyed at the beginning of function)
        $('#hospital-patients-table').DataTable({
            responsive: true,
            pageLength: 25,
            order: [[1, 'asc']],
            language: {
                url: '//cdn.datatables.net/plug-ins/1.13.6/i18n/id.json'
            }
        });
    } catch (error) {
        console.error('Error loading pasien baru:', error);
        tbody.innerHTML = `<tr><td colspan="9" class="text-center text-danger">Gagal memuat data: ${error.message}</td></tr>`;
    }
}

async function loadHospitalPatients(location) {
    const tbody = document.getElementById('hospital-patients-tbody');
    const table = document.getElementById('hospital-patients-table');
    if (!tbody || !table) return;

    const hospitalName = hospitalNames[location] || location;

    // Destroy existing DataTable FIRST before loading new data
    try {
        if ($.fn.DataTable.isDataTable('#hospital-patients-table')) {
            $('#hospital-patients-table').DataTable().clear().destroy();
        }
    } catch (e) {
        console.warn('DataTable destroy warning:', e.message);
    }

    tbody.innerHTML = `<tr><td colspan="9" class="text-center"><i class="fas fa-spinner fa-spin"></i> Memuat data pasien ${hospitalName}...</td></tr>`;

    try {
        const token = getAuthToken();
        // Use last_visit_location filter to get patients whose last visit was at this location
        const response = await fetch(`/api/patients?last_visit_location=${location}&_=${Date.now()}`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Cache-Control': 'no-cache'
            }
        });

        if (!response.ok) throw new Error('Gagal memuat data');

        const data = await response.json();

        if (!data.data || data.data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="9" class="text-center">Belum ada pasien dengan kunjungan terakhir di ${hospitalName}</td></tr>`;
            return;
        }

        tbody.innerHTML = data.data.map(patient => {
            const birthDate = patient.birth_date ? new Date(patient.birth_date).toLocaleDateString('id-ID', {day: 'numeric', month: 'long', year: 'numeric'}) : '-';
            const regDate = patient.created_at ? new Date(patient.created_at).toLocaleDateString('id-ID', {day: 'numeric', month: 'long', year: 'numeric'}) : '-';
            const lastVisit = patient.last_visit ? new Date(patient.last_visit).toLocaleDateString('id-ID', {day: 'numeric', month: 'long', year: 'numeric'}) : 'Belum ada';
            const statusBadge = patient.status === 'active' ?
                '<span class="badge badge-success">Aktif</span>' :
                '<span class="badge badge-secondary">Nonaktif</span>';

            return `
                <tr>
                    <td>${patient.id}</td>
                    <td>${patient.full_name || '-'}</td>
                    <td>${patient.whatsapp || patient.phone || '-'}</td>
                    <td>${birthDate}</td>
                    <td>${patient.age || '-'}</td>
                    <td>${lastVisit}</td>
                    <td>${regDate}</td>
                    <td>${statusBadge}</td>
                    <td class="text-nowrap">
                        <button type="button" class="btn btn-sm btn-info btn-view-hospital-patient" data-patient-id="${patient.id}" title="Detail">
                            <i class="fas fa-eye"></i>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');

        // Initialize DataTable (already destroyed at the beginning of function)
        try {
            $('#hospital-patients-table').DataTable({
                pageLength: 25,
                order: [[6, 'desc']],
                language: {
                    url: '//cdn.datatables.net/plug-ins/1.13.6/i18n/id.json'
                }
            });
        } catch (dtError) {
            console.warn('DataTable init warning:', dtError.message);
        }

        // Attach event listeners to view buttons
        document.querySelectorAll('.btn-view-hospital-patient').forEach(btn => {
            btn.addEventListener('click', function(e) {
                e.preventDefault();
                const patientId = this.getAttribute('data-patient-id');
                if (typeof viewPatientDetail === 'function') {
                    viewPatientDetail(patientId);
                }
            });
        });

    } catch (error) {
        console.error('Error loading hospital patients:', error);
        tbody.innerHTML = `<tr><td colspan="9" class="text-center text-danger">Gagal memuat data pasien</td></tr>`;
    }
}

async function loadHospitalAppointments(location) {
    const container = document.getElementById('hospital-appointments-container');
    if (!container) return;

    const hospitalName = hospitalNames[location] || location;
    const hospitalColor = hospitalColors[location] || '#607d8b';

    container.innerHTML = `
        <div class="text-center py-4">
            <i class="fas fa-spinner fa-spin fa-2x"></i>
            <p class="mt-2">Memuat data appointment ${hospitalName}...</p>
        </div>
    `;

    try {
        const token = getAuthToken();
        const response = await fetch(`/api/appointments/hospital/${location}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) throw new Error('Gagal memuat data');

        const data = await response.json();
        renderHospitalAppointmentsTable(data.appointments || [], hospitalName, hospitalColor);

    } catch (error) {
        console.error('Error loading hospital appointments:', error);
        container.innerHTML = `
            <div class="alert alert-danger">
                <i class="fas fa-exclamation-triangle"></i> Gagal memuat data. Silakan coba lagi.
            </div>
        `;
    }
}

function renderHospitalAppointmentsTable(appointments, hospitalName, hospitalColor) {
    const container = document.getElementById('hospital-appointments-container');
    if (!container) return;

    // Get today's date for display
    const today = new Date();
    const dateLabel = today.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

    if (appointments.length === 0) {
        container.innerHTML = `
            <div class="card">
                <div class="card-header d-flex justify-content-between align-items-center" style="background: ${hospitalColor}; color: white;">
                    <div>
                        <h3 class="card-title mb-1"><i class="fas fa-user-plus mr-2"></i>Pasien Terjadwal</h3>
                        <div class="text-white-50 small">${dateLabel}</div>
                    </div>
                    <div class="d-flex align-items-center">
                        <span class="badge badge-light mr-3">0 Pasien</span>
                        <button class="btn btn-sm btn-outline-light" onclick="showHospitalAppointmentsPage('${currentHospitalLocation}')">
                            <i class="fas fa-sync-alt mr-1"></i>Refresh
                        </button>
                    </div>
                </div>
                <div class="card-body text-center py-5 text-muted">
                    <i class="fas fa-calendar-times fa-2x mb-2"></i>
                    <p class="mb-0">Belum ada pasien yang terjadwal untuk ${hospitalName}</p>
                </div>
            </div>
        `;
        return;
    }

    // Category badges
    const categoryBadges = {
        'obstetri': '<span class="badge badge-info">Obstetri</span>',
        'gyn_repro': '<span class="badge badge-success">Reproduksi</span>',
        'gyn_special': '<span class="badge badge-warning">Ginekologi</span>'
    };

    const rows = appointments.map(apt => {
        // Format slot time for first column
        const time = apt.appointment_time ? apt.appointment_time.substring(0, 5) : '';
        const slotNumber = apt.slot_number || '-';
        const slotBadge = `<span class="badge badge-info">${time || '-'}</span><div class="small text-muted mt-1">Slot ${slotNumber}</div>`;

        // Format session info for name column
        const session = apt.session_type || 'Pagi';
        const sessionRange = apt.session_start && apt.session_end ? `${apt.session_start.substring(0,5)} - ${apt.session_end.substring(0,5)}` : '';
        const infoLine = sessionRange ? `<div class="small text-muted">${sessionRange} (${session})</div>` : '';

        // Age
        const age = apt.patient_age ? `${apt.patient_age} th` : '-';

        // Category
        const category = apt.detected_category || apt.consultation_category || apt.appointment_type || '';
        const categoryBadge = categoryBadges[category.toLowerCase()] || `<span class="badge badge-secondary">${category || '-'}</span>`;

        // Complaint
        const complaint = apt.chief_complaint || apt.complaint || apt.notes || '-';

        // Status
        const statusBadge = getStatusBadge(apt.status);

        return `
            <tr>
                <td class="text-center">${slotBadge}</td>
                <td>
                    <div class="font-weight-bold">${apt.patient_name || '-'}</div>
                    ${infoLine}
                </td>
                <td>${age}</td>
                <td>${categoryBadge}</td>
                <td>${complaint}</td>
                <td>${statusBadge}</td>
                <td class="text-center">
                    <button type="button" class="btn btn-sm btn-primary" onclick="startHospitalExam(${apt.id}, '${apt.patient_id}', '${(apt.patient_name || '').replace(/'/g, "\\'")}')">
                        <i class="fas fa-stethoscope mr-1"></i>Periksa
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    container.innerHTML = `
        <div class="card">
            <div class="card-header d-flex justify-content-between align-items-center" style="background: ${hospitalColor}; color: white;">
                <div>
                    <h3 class="card-title mb-1"><i class="fas fa-user-plus mr-2"></i>Pasien Terjadwal</h3>
                    <div class="text-white-50 small">${dateLabel}</div>
                </div>
                <div class="d-flex align-items-center">
                    <span class="badge badge-light mr-3">${appointments.length} Pasien</span>
                    <button class="btn btn-sm btn-outline-light" onclick="showHospitalAppointmentsPage('${currentHospitalLocation}')">
                        <i class="fas fa-sync-alt mr-1"></i>Refresh
                    </button>
                </div>
            </div>
            <div class="card-body p-0">
                <div class="table-responsive">
                    <table class="table table-hover mb-0">
                        <thead class="thead-light">
                            <tr>
                                <th style="width: 8%;" class="text-center">Waktu</th>
                                <th style="width: 25%;">Nama Pasien</th>
                                <th style="width: 8%;">Usia</th>
                                <th style="width: 12%;">Kategori</th>
                                <th style="width: 25%;">Alasan Kontrol</th>
                                <th style="width: 12%;">Status</th>
                                <th style="width: 10%;" class="text-center">Aksi</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rows}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
}

// Start hospital examination - navigate to sunday-clinic with patient info
function startHospitalExam(appointmentId, patientId, patientName) {
    // Navigate to sunday-clinic page with patient info
    const baseUrl = `sunday-clinic.html?patient=${patientId}&appointment=${appointmentId}&location=${currentHospitalLocation}`;
    window.location.href = window.buildMobileUrl ? window.buildMobileUrl(baseUrl) : baseUrl;
}

function getStatusBadge(status) {
    const badges = {
        'scheduled': '<span class="badge badge-warning">Dijadwalkan</span>',
        'confirmed': '<span class="badge badge-info">Terkonfirmasi</span>',
        'completed': '<span class="badge badge-success">Selesai</span>',
        'cancelled': '<span class="badge badge-danger">Dibatalkan</span>',
        'no_show': '<span class="badge badge-secondary">Tidak Hadir</span>'
    };
    return badges[status] || `<span class="badge badge-secondary">${status}</span>`;
}

async function confirmHospitalAppointment(id) {
    if (!confirm('Konfirmasi appointment ini?')) return;
    await updateHospitalAppointmentStatus(id, 'confirmed');
}

async function completeHospitalAppointment(id) {
    if (!confirm('Tandai appointment ini sebagai selesai?')) return;
    await updateHospitalAppointmentStatus(id, 'completed');
}

async function cancelHospitalAppointment(id) {
    if (!confirm('Batalkan appointment ini?')) return;
    await updateHospitalAppointmentStatus(id, 'cancelled');
}

async function updateHospitalAppointmentStatus(id, status) {
    try {
        const token = getAuthToken();
        const response = await fetch(`/api/appointments/${id}/status`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ status })
        });

        if (!response.ok) throw new Error('Gagal mengupdate status');

        // Reload data
        if (currentHospitalLocation) {
            loadHospitalAppointments(currentHospitalLocation);
        }

        showToast('Status appointment berhasil diupdate', 'success');

    } catch (error) {
        console.error('Error updating appointment status:', error);
        showToast('Gagal mengupdate status appointment', 'error');
    }
}

function showTindakanPage() { 
    hideAllPages(); 
    pages.tindakan?.classList.remove('d-none'); 
    setTitleAndActive('Tindakan', 'nav-tindakan', 'tindakan');
    updatePatientDisplay(); // Update patient display saat buka halaman Tindakan
    // Load billing module
    importWithVersion('./billing.js').then(module => {
        if (module.initBilling) {
            module.initBilling();
        }
    });
}
function showObatPage() {
    hideAllPages();
    pages.obat?.classList.remove('d-none');
    setTitleAndActive('Obat & Alkes', 'nav-obat', 'obat');
    
    // Load billing-obat module
    importWithVersion('./billing-obat.js').then(module => {
        if (module.initObat) {
            module.initObat();
        }
    }).catch(error => {
        console.error('Failed to load billing-obat.js:', error);
    });
}
function showCashierPage() { 
    // Load all billing modules dynamically with shared cache version
    Promise.all([
        importWithVersion('./billing.js'),
        importWithVersion('./billing-obat.js'),
        importWithVersion('./cashier.js')
    ]).then(async ([billingModule, billingObatModule, cashierModule]) => {
        // Validate patient before opening Rincian Tagihan
        if (!billingModule.validatePatient()) {
            showPatientPage();
            return;
        }
        
        if (!await billingObatModule.validateObatUsage()) {
            showObatPage();
            return;
        }
        
        hideAllPages(); 
        pages.cashier?.classList.remove('d-none'); 
        setTitleAndActive('Rincian Tagihan', 'nav-cashier', 'cashier');
        
        // Load cashier summary with current billing data
        const patientData = billingModule.getCurrentPatientData();
        const tindakanData = billingModule.getSelectedServices();
        const obatData = billingObatModule.getSelectedObat();
        
        // Use updateCashierSummary from dynamically loaded cashierModule
        cashierModule.updateCashierSummary(patientData, tindakanData, obatData);
        
        // Initialize cashier buttons if not already done
        if (cashierModule.initCashier) {
            cashierModule.initCashier();
        }
    }).catch(error => {
        console.error('Failed to load billing modules:', error);
    });
}
function showPatientPage() { hideAllPages(); pages.patient?.classList.remove('d-none'); setTitleAndActive('Data Pasien', 'nav-patient', 'patients'); }
// Make function globally accessible for onclick handlers
window.showPatientPage = showPatientPage;

async function showAnamnesa() { 
    hideAllPages(); 
    pages.anamnesa?.classList.remove('d-none'); 
    setTitleAndActive('Anamnesa', 'nav-anamnesa', 'anamnesa');
    
    // Load saved anamnesa data for current patient
    const { loadAnamnesaData } = await importWithVersion('./medical-exam.js');
    await loadAnamnesaData();
}

async function showPhysicalExam() { 
    hideAllPages(); 
    pages.physical?.classList.remove('d-none'); 
    setTitleAndActive('Pemeriksaan Fisik', 'nav-physical', 'physical');
    
    // Load saved physical exam data for current patient
    const { loadPhysicalExamData } = await importWithVersion('./medical-exam.js');
    await loadPhysicalExamData();
}

async function showUSGExam() { 
    hideAllPages(); 
    pages.usg?.classList.remove('d-none'); 
    setTitleAndActive('Pemeriksaan USG', 'nav-usg', 'usg');
    
    // Re-check pregnancy status when page opens
    const gynSection = document.getElementById('usg-gynecology-section');
    const obstetriSection = document.getElementById('usg-obstetri-section');
    const anamnesaSelect = document.getElementById('anamnesa-pregnant');
    
    if (anamnesaSelect && gynSection && obstetriSection) {
        const pregnantStatus = anamnesaSelect.value;
        console.log('showUSGExam - Pregnancy status:', pregnantStatus);
        
        if (pregnantStatus === 'ya') {
            obstetriSection.classList.remove('d-none');
            gynSection.classList.add('d-none');
        } else if (pregnantStatus === 'tidak') {
            gynSection.classList.remove('d-none');
            obstetriSection.classList.add('d-none');
        } else {
            gynSection.classList.add('d-none');
            obstetriSection.classList.add('d-none');
        }
    }
    
    // Load saved USG data for current patient
    const { loadUSGExamData } = await importWithVersion('./medical-exam.js');
    await loadUSGExamData();
}

async function showLabExam() { 
    hideAllPages(); 
    pages.lab?.classList.remove('d-none'); 
    setTitleAndActive('Pemeriksaan Penunjang', 'nav-lab', 'lab');
    
    // Load saved lab exam data for current patient
    const { loadLabExamData } = await importWithVersion('./medical-exam.js');
    await loadLabExamData();
}
function showStokOpnamePage() { 
    hideAllPages(); 
    pages.admin?.classList.remove('d-none'); 
    setTitleAndActive('Stok Opname', 'nav-admin', 'stok');
    // Load stok opname data
    importWithVersion('./stok-opname.js').then(module => {
        if (module.initStokOpname) {
            module.initStokOpname();
        }
    });
}
function showPengaturanPage() {
    console.log('🔧 showPengaturanPage called');
    hideAllPages();
    pages.pengaturan?.classList.remove('d-none');
    setTitleAndActive('Pengaturan', 'nav-pengaturan', 'pengaturan');
    
    importWithVersion('./kelola-tindakan.js').then(module => {
        if (module.initKelolaTindakan) {
            module.initKelolaTindakan();
        }
    }).catch(error => {
        console.error('Failed to load kelola-tindakan.js:', error);
    });
}
function showKelolaObatPage() {
    console.log('🔧 showKelolaObatPage called');
    hideAllPages();
    pages.kelolaObat?.classList.remove('d-none');
    setTitleAndActive('Kelola Obat', 'management-nav-kelola-obat', 'kelolaObat');
    
    // Load kelola-obat module
    importWithVersion('./kelola-obat.js').then(module => {
        if (module.initKelolaObat) {
            module.initKelolaObat();
        }
    }).catch(error => {
        console.error('Failed to load kelola-obat.js:', error);
    });
}
function showLogPage() { hideAllPages(); pages.logs?.classList.remove('d-none'); setTitleAndActive('Log Aktivitas', 'nav-logs', 'logs'); }
function showAppointmentsPage() { 
    hideAllPages(); 
    pages.appointments?.classList.remove('d-none'); 
    setTitleAndActive('Appointment', 'nav-appointments', 'appointments');
    // Load appointments module dynamically
    console.log('🔧 Loading appointments module...');
    importWithVersion('./appointments.js').then(module => {
        console.log('✅ Appointments module loaded:', module);
        if (module && module.initAppointments) {
            module.initAppointments();
            console.log('✅ initAppointments called');
        } else {
            console.warn('⚠️ Module loaded but initAppointments not found');
        }
    }).catch(error => {
        console.error('❌ Failed to load appointments.js:', error);
    });
}
function showAnalyticsPage() { hideAllPages(); pages.analytics?.classList.remove('d-none'); setTitleAndActive('Analytics', 'nav-analytics', 'analytics'); }
function showFinancePage() { hideAllPages(); pages.finance?.classList.remove('d-none'); setTitleAndActive('Finance Analysis', 'nav-finance', 'finance'); }
function showKelolaPasienPage() {
    if (typeof window.showManagePatientsPage === 'function') {
        window.showManagePatientsPage();
        return;
    }

    hideAllPages();
    pages.kelolaPasienLegacy?.classList.remove('d-none');
    setTitleAndActive('Kelola Pasien', 'management-nav-kelola-pasien', 'kelola-pasien');
    loadExternalPage('kelola-pasien-page', 'kelola-pasien.html', { forceReload: true });
}
function showKelolaAppointmentPage() { 
    hideAllPages(); 
    pages.kelolaAppointment?.classList.remove('d-none'); 
    setTitleAndActive('Kelola Appointment', 'management-nav-kelola-appointment', 'kelola-appointment');
    
    importWithVersion('./kelola-appointment.js').then(module => {
        if (typeof window.initKelolaAppointment === 'function') {
            window.initKelolaAppointment();
        } else {
            console.error('Kelola Appointment module loaded, but initKelolaAppointment function not found on window.');
        }
    }).catch(error => {
        console.error('Failed to load kelola-appointment.js:', error);
    });
}
function showKelolaJadwalPage() {
    hideAllPages();
    pages.kelolaJadwal?.classList.remove('d-none');
    setTitleAndActive('Kelola Jadwal', 'nav-jadwal', 'kelola-jadwal');
    
    // Dynamically import and initialize the Kelola Jadwal module
    importWithVersion('./kelola-jadwal.js').then(module => {
        if (typeof window.initKelolaJadwal === 'function') {
            window.initKelolaJadwal();
        } else {
            console.error('Kelola Jadwal module loaded, but initKelolaJadwal function not found on window.');
        }
    }).catch(error => {
        console.error('Failed to load kelola-jadwal.js:', error);
    });
}
function showKelolaTindakanPage() {
    showPengaturanPage();
    setTitleAndActive('Kelola Tindakan', 'management-nav-kelola-tindakan', 'kelola-tindakan');
}
function showKelolaObatManagementPage() {
    showKelolaObatPage();
}

// ============================================
// ESTIMASI BIAYA KEHAMILAN
// ============================================
function showEstimasiBiayaPage() {
    hideAllPages();
    pages.estimasiBiaya?.classList.remove('d-none');
    setTitleAndActive('Estimasi Biaya', 'nav-estimasi-biaya', 'estimasi-biaya');
    updateEstimasiBiaya();
}

// Pricing data based on actual tindakan table
const ESTIMASI_HARGA = {
    // Tindakan
    admin: 5000,           // S01 - Biaya Admin
    bukuANC: 25000,        // S03 - Buku Kontrol
    tvs: 150000,           // TVS (Transvaginal Sonography)
    usg2d: 110000,         // S06 - USG 2 Dimensi
    usg4d: 200000,         // S09 - USG 4 Dimensi
    usgKelainan: 300000,   // S07 - USG Kelainan Janin (20-24 minggu)
    usg2dKembar: 200000,   // S10 - USG 2D Janin Kembar
    usg4dKembar: 400000,   // S11 - USG 4D Janin Kembar
    labT1: 200000,         // S30 - Paket T1 (Hb, GDA, Gol Darah, Rhesus, PPIA)
    labT3: 70000,          // S31 - Paket T3 (Hb, GDA)
    ctgNst: 50000,         // S05 - Rekam Jantung Janin (NST/CTG)
    strippingMembrane: 150000, // Stripping of Membrane

    // Obat T1 Cost-Effective
    t1CostFolamilGenio: 85000,    // Folamil Genio 30 tablet

    // Obat T1 Premium
    t1PremOndavell: 150000,       // Ondavell 1x1 pagi
    t1PremElevit: 280000,         // Elevit Pronatal 30 tablet
    t1PremMaltofer: 180000,       // Maltofer Fol 30 tablet

    // Obat T2 Cost-Effective (20-34 minggu)
    t2CostFolamilGold: 95000,     // Folamil Gold 30 tablet
    t2CostFormicalB: 65000,       // Formical B 30 tablet

    // Obat T2 Premium (<20 minggu)
    t2PremElevit: 280000,         // Elevit Pronatal 30 tablet
    t2PremMaltofer: 180000,       // Maltofer Fol 30 tablet

    // Obat T2 Premium (>20 minggu)
    t2Prem20Elevit: 280000,       // Elevit Pronatal 30 tablet
    t2Prem20Prolacta: 320000,     // Prolacta for Mother 30 softgel
    t2Prem20Maltofer: 180000,     // Maltofer Fol 30 tablet
    t2Prem20Ossoral: 150000,      // Ossoral 200 30 tablet

    // Obat T3 Cost-Effective (34-menyusui)
    t3CostDomavit: 75000,         // Domavit 60 tablet (2x1)
    t3CostFolamilGold: 95000,     // Folamil Gold 30 tablet
    t3CostFormicalB: 65000,       // Formical B 30 tablet

    // Obat T3 Premium (sama dengan T2 >20mg)
    t3PremElevit: 280000,
    t3PremProlacta: 320000,
    t3PremMaltofer: 180000,
    t3PremOssoral: 150000
};

function updateEstimasiBiaya() {
    const trimester = document.getElementById('estimasi-fase')?.value || 'semua';
    const tipe = document.getElementById('estimasi-tipe')?.value || 'tunggal';

    // Get options
    const t1Obat = document.getElementById('t1-obat')?.value || 'none';
    const t2Skrining = document.getElementById('t2-skrining')?.checked || false;
    const t2Obat = document.getElementById('t2-obat')?.value || 'none';
    const t3Dengan4D = document.getElementById('t3-4d')?.checked || false;
    const t3Obat = document.getElementById('t3-obat')?.value || 'none';

    const isKembar = tipe === 'kembar';
    const usg2dPrice = isKembar ? ESTIMASI_HARGA.usg2dKembar : ESTIMASI_HARGA.usg2d;
    const usg4dPrice = isKembar ? ESTIMASI_HARGA.usg4dKembar : ESTIMASI_HARGA.usg4d;

    // Trimester 1 (1-13 minggu): ~3 kunjungan
    const t1Items = [
        { nama: 'Biaya Admin', harga: ESTIMASI_HARGA.admin, qty: 3 },
        { nama: 'Buku ANC', harga: ESTIMASI_HARGA.bukuANC, qty: 1 },
        { nama: 'TVS', harga: ESTIMASI_HARGA.tvs, qty: 1 },
        { nama: 'USG 2D', harga: usg2dPrice, qty: 2 },
        { nama: 'Lab Paket T1', harga: ESTIMASI_HARGA.labT1, qty: 1 }
    ];

    // Add T1 medications (x3 untuk T1)
    if (t1Obat === 'cost') {
        t1Items.push({ nama: 'Folamil Genio (30 tab)', harga: ESTIMASI_HARGA.t1CostFolamilGenio, qty: 3 });
    } else if (t1Obat === 'premium') {
        t1Items.push({ nama: 'Ondavell', harga: ESTIMASI_HARGA.t1PremOndavell, qty: 3 });
        t1Items.push({ nama: 'Elevit Pronatal (30 tab)', harga: ESTIMASI_HARGA.t1PremElevit, qty: 3 });
        t1Items.push({ nama: 'Maltofer Fol (30 tab)', harga: ESTIMASI_HARGA.t1PremMaltofer, qty: 3 });
    }

    // Trimester 2 (14-27 minggu): ~5 kunjungan
    // USG 2D: 3x jika tanpa skrining, 2x jika dengan skrining
    const t2Usg2dQty = t2Skrining ? 2 : 3;
    const t2Items = [
        { nama: 'Biaya Admin', harga: ESTIMASI_HARGA.admin, qty: 5 },
        { nama: 'USG 2D', harga: usg2dPrice, qty: t2Usg2dQty }
    ];

    // Add USG Skrining if checked
    if (t2Skrining) {
        t2Items.push({ nama: 'USG Skrining Kelainan (20-24mg)', harga: ESTIMASI_HARGA.usgKelainan, qty: 1 });
    }

    // Add T2 medications (x3 untuk T2)
    if (t2Obat === 'cost') {
        t2Items.push({ nama: 'Folamil Gold (30 tab)', harga: ESTIMASI_HARGA.t2CostFolamilGold, qty: 3 });
        t2Items.push({ nama: 'Formical B (30 tab)', harga: ESTIMASI_HARGA.t2CostFormicalB, qty: 3 });
    } else if (t2Obat === 'premium') {
        // Premium untuk >20 minggu (mayoritas T2)
        t2Items.push({ nama: 'Elevit Pronatal (30 tab)', harga: ESTIMASI_HARGA.t2Prem20Elevit, qty: 3 });
        t2Items.push({ nama: 'Prolacta for Mother (30 softgel)', harga: ESTIMASI_HARGA.t2Prem20Prolacta, qty: 3 });
        t2Items.push({ nama: 'Maltofer Fol (30 tab)', harga: ESTIMASI_HARGA.t2Prem20Maltofer, qty: 3 });
        t2Items.push({ nama: 'Ossoral 200 (30 tab)', harga: ESTIMASI_HARGA.t2Prem20Ossoral, qty: 3 });
    }

    // Trimester 3 (28-40 minggu): ~8 kunjungan
    const t3Items = [
        { nama: 'Biaya Admin', harga: ESTIMASI_HARGA.admin, qty: 8 }
    ];

    // USG options
    if (t3Dengan4D) {
        t3Items.push({ nama: 'USG 2D', harga: usg2dPrice, qty: 3 });
        t3Items.push({ nama: 'USG 4D (28 minggu)', harga: usg4dPrice, qty: 1 });
    } else {
        t3Items.push({ nama: 'USG 2D', harga: usg2dPrice, qty: 4 });
    }

    t3Items.push({ nama: 'Lab Paket T3', harga: ESTIMASI_HARGA.labT3, qty: 1 });
    t3Items.push({ nama: 'CTG/NST', harga: ESTIMASI_HARGA.ctgNst, qty: 2 });
    t3Items.push({ nama: 'Stripping of Membrane', harga: ESTIMASI_HARGA.strippingMembrane, qty: 2 });

    // Add T3 medications (x3 untuk T3)
    if (t3Obat === 'cost') {
        t3Items.push({ nama: 'Domavit (60 tab 3x1) 36mg-menyusui', harga: ESTIMASI_HARGA.t3CostDomavit, qty: 3 });
        t3Items.push({ nama: 'Folamil Gold (30 tab)', harga: ESTIMASI_HARGA.t3CostFolamilGold, qty: 3 });
        t3Items.push({ nama: 'Formical B (30 tab)', harga: ESTIMASI_HARGA.t3CostFormicalB, qty: 3 });
    } else if (t3Obat === 'premium') {
        t3Items.push({ nama: 'Elevit Pronatal (30 tab)', harga: ESTIMASI_HARGA.t3PremElevit, qty: 3 });
        t3Items.push({ nama: 'Prolacta for Mother (30 softgel)', harga: ESTIMASI_HARGA.t3PremProlacta, qty: 3 });
        t3Items.push({ nama: 'Maltofer Fol (30 tab)', harga: ESTIMASI_HARGA.t3PremMaltofer, qty: 3 });
        t3Items.push({ nama: 'Ossoral 200 (30 tab)', harga: ESTIMASI_HARGA.t3PremOssoral, qty: 3 });
    }

    // Render tables
    const renderTable = (items, tableId) => {
        const table = document.getElementById(tableId);
        if (!table) return 0;

        let html = '';
        let subtotal = 0;

        items.forEach(item => {
            const total = item.harga * item.qty;
            subtotal += total;
            html += `
                <tr>
                    <td style="font-size: 11px;">${item.nama}</td>
                    <td class="text-right text-nowrap" style="font-size: 10px;">
                        ${formatRupiah(item.harga)}${item.qty > 1 ? ' x' + item.qty : ''}
                    </td>
                </tr>
            `;
        });

        table.innerHTML = html;
        return subtotal;
    };

    // Show/hide cards based on trimester selection
    const cardT1 = document.getElementById('estimasi-card-t1');
    const cardT2 = document.getElementById('estimasi-card-t2');
    const cardT3 = document.getElementById('estimasi-card-t3');

    let subtotalT1 = 0, subtotalT2 = 0, subtotalT3 = 0;

    if (trimester === 't1' || trimester === 'semua') {
        cardT1?.classList.remove('d-none');
        subtotalT1 = renderTable(t1Items, 'tabel-estimasi-t1');
        document.getElementById('subtotal-t1').textContent = formatRupiah(subtotalT1);
        document.getElementById('perkontrol-t1').textContent = formatRupiah(Math.round(subtotalT1 / 3));
    } else {
        cardT1?.classList.add('d-none');
    }

    if (trimester === 't2' || trimester === 'semua') {
        cardT2?.classList.remove('d-none');
        subtotalT2 = renderTable(t2Items, 'tabel-estimasi-t2');
        document.getElementById('subtotal-t2').textContent = formatRupiah(subtotalT2);
        document.getElementById('perkontrol-t2').textContent = formatRupiah(Math.round(subtotalT2 / 4));
    } else {
        cardT2?.classList.add('d-none');
    }

    if (trimester === 't3' || trimester === 'semua') {
        cardT3?.classList.remove('d-none');
        subtotalT3 = renderTable(t3Items, 'tabel-estimasi-t3');
        document.getElementById('subtotal-t3').textContent = formatRupiah(subtotalT3);
        document.getElementById('perkontrol-t3').textContent = formatRupiah(Math.round(subtotalT3 / 7));
    } else {
        cardT3?.classList.add('d-none');
    }

    // Total
    const total = subtotalT1 + subtotalT2 + subtotalT3;
    document.getElementById('total-estimasi').textContent = formatRupiah(total);
}

function formatRupiah(amount) {
    return 'Rp ' + amount.toLocaleString('id-ID');
}

function showKelolaPengumumanPage() {
    hideAllPages();
    pages.kelolaPengumuman?.classList.remove('d-none');
    setTitleAndActive('Kelola Pengumuman', 'nav-pengumuman', 'kelola-pengumuman');
    
    // Dynamically import and initialize the Kelola Pengumuman module
    importWithVersion('./kelola-announcement.js').then(module => {
        if (typeof window.initKelolaAnnouncement === 'function') {
            window.initKelolaAnnouncement();
        } else {
            console.error('Kelola Announcement module loaded, but initKelolaAnnouncement function not found on window.');
        }
    }).catch(error => {
        console.error('Failed to load kelola-announcement.js:', error);
    });
}

function showPenjualanObatPage() {
    hideAllPages();
    pages.penjualanObat?.classList.remove('d-none');
    setTitleAndActive('Penjualan Obat', 'nav-penjualan-obat', 'penjualan-obat');

    // Dynamically import and initialize the Penjualan Obat module
    importWithVersion('./penjualan-obat.js').then(module => {
        if (typeof window.initPenjualanObat === 'function') {
            window.initPenjualanObat();
        } else {
            console.error('Penjualan Obat module loaded, but initPenjualanObat function not found on window.');
        }
    }).catch(error => {
        console.error('Failed to load penjualan-obat.js:', error);
    });
}

function showBulkUploadUSGPage() {
    hideAllPages();
    pages.bulkUploadUSG?.classList.remove('d-none');
    setTitleAndActive('Bulk Upload USG', 'nav-bulk-upload-usg', 'bulk-upload-usg');

    // Dynamically import and initialize the Bulk Upload USG module
    importWithVersion('./usg-bulk-upload.js').then(module => {
        if (module.initBulkUploadUSG) {
            module.initBulkUploadUSG();
        } else {
            console.error('USG Bulk Upload module loaded, but initBulkUploadUSG function not found.');
        }
    }).catch(error => {
        console.error('Failed to load usg-bulk-upload.js:', error);
    });
}

function showMedifySyncPage() {
    hideAllPages();
    pages.medifySync?.classList.remove('d-none');
    setTitleAndActive('MEDIFY Sync', 'nav-medify-sync', 'medify-sync');

    // Dynamically import and initialize the MEDIFY Sync module
    importWithVersion('./medify-sync.js').then(module => {
        if (module.initMedifySync) {
            module.initMedifySync();
        } else {
            console.error('MEDIFY Sync module loaded, but initMedifySync function not found.');
        }
    }).catch(error => {
        console.error('Failed to load medify-sync.js:', error);
    });
}

function showKelolaRolesPage() {
    hideAllPages();
    pages.kelolaRoles?.classList.remove('d-none');
    setTitleAndActive('Roles Manajemen', 'management-nav-kelola-roles', 'kelola-roles');

    // Dynamically import and initialize the Roles Management module
    importWithVersion('./kelola-roles.js').then(module => {
        if (typeof window.initKelolaRoles === 'function') {
            window.initKelolaRoles();
        } else {
            console.error('Kelola Roles module loaded, but initKelolaRoles function not found on window.');
        }
    }).catch(error => {
        console.error('Failed to load kelola-roles.js:', error);
    });
}

function showStaffActivityPage() {
    hideAllPages();
    pages.staffActivity?.classList.remove('d-none');
    setTitleAndActive('Aktivitas Staff', 'nav-staff-activity', 'staff-activity');
    loadStaffActivityLogs();
    loadStaffActivityFilters();
}

async function loadStaffActivityLogs() {
    const token = getAuthToken();
    const tbody = document.getElementById('staff-activity-body');
    if (!tbody) return;

    // Get filter values
    const userId = document.getElementById('staff-activity-user-filter')?.value || '';
    const action = document.getElementById('staff-activity-action-filter')?.value || '';
    const startDate = document.getElementById('staff-activity-start-date')?.value || '';
    const endDate = document.getElementById('staff-activity-end-date')?.value || '';

    tbody.innerHTML = `<tr><td colspan="4" class="text-center py-4"><i class="fas fa-spinner fa-spin"></i> Memuat...</td></tr>`;

    try {
        // Load summary
        const summaryRes = await fetch('/api/logs/summary?days=7', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const summaryData = await summaryRes.json();

        if (summaryData.success) {
            document.getElementById('staff-activity-total').textContent = summaryData.data.total_activities || 0;
            document.getElementById('staff-activity-users').textContent = summaryData.data.unique_users || 0;

            // Render top users
            const topUsersEl = document.getElementById('staff-activity-top-users');
            if (topUsersEl && summaryData.data.most_active_users?.length > 0) {
                topUsersEl.innerHTML = summaryData.data.most_active_users.slice(0, 5)
                    .map(u => `<span class="badge badge-secondary mr-1">${u.user_name} (${u.action_count})</span>`)
                    .join('');
            } else {
                topUsersEl.innerHTML = '<span class="text-muted">Belum ada aktivitas</span>';
            }
        }

        // Build query params
        const params = new URLSearchParams();
        if (userId) params.append('user_id', userId);
        if (action) params.append('action', action);
        if (startDate) params.append('start_date', startDate);
        if (endDate) params.append('end_date', endDate);
        params.append('limit', '100');

        // Load logs
        const logsRes = await fetch(`/api/logs?${params.toString()}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const logsData = await logsRes.json();

        if (logsData.success && logsData.data?.length > 0) {
            tbody.innerHTML = logsData.data.map(log => {
                const timestamp = new Date(log.timestamp).toLocaleString('id-ID', {
                    day: '2-digit', month: 'short', year: 'numeric',
                    hour: '2-digit', minute: '2-digit'
                });
                return `
                    <tr>
                        <td><small>${timestamp}</small></td>
                        <td><span class="badge badge-info">${log.user_name}</span></td>
                        <td><span class="badge badge-light">${log.action}</span></td>
                        <td><small class="text-muted">${log.details || '-'}</small></td>
                    </tr>
                `;
            }).join('');

            document.getElementById('staff-activity-pagination-info').textContent =
                `Menampilkan ${logsData.data.length} aktivitas`;
        } else {
            tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted py-4">
                <i class="fas fa-inbox fa-2x mb-2"></i><p>Belum ada aktivitas tercatat</p></td></tr>`;
        }
    } catch (error) {
        console.error('Error loading staff activity:', error);
        tbody.innerHTML = `<tr><td colspan="4" class="text-center text-danger py-4">
            <i class="fas fa-exclamation-triangle fa-2x mb-2"></i><p>Gagal memuat data</p></td></tr>`;
    }
}

async function loadStaffActivityFilters() {
    const token = getAuthToken();

    try {
        // Load actions for filter
        const actionsRes = await fetch('/api/logs/actions', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const actionsData = await actionsRes.json();

        const actionSelect = document.getElementById('staff-activity-action-filter');
        if (actionSelect && actionsData.success && actionsData.data?.length > 0) {
            actionSelect.innerHTML = '<option value="">Semua Aksi</option>' +
                actionsData.data.map(a => `<option value="${a}">${a}</option>`).join('');
        }

        // Load users for filter (from summary endpoint)
        const summaryRes = await fetch('/api/logs/summary?days=30', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const summaryData = await summaryRes.json();

        const userSelect = document.getElementById('staff-activity-user-filter');
        if (userSelect && summaryData.success && summaryData.data.most_active_users?.length > 0) {
            userSelect.innerHTML = '<option value="">Semua Staff</option>' +
                summaryData.data.most_active_users.map(u =>
                    `<option value="${u.user_id}">${u.user_name}</option>`
                ).join('');
        }
    } catch (error) {
        console.error('Error loading filters:', error);
    }
}

function showFinanceAnalysisPage() {
    hideAllPages();
    pages.financeAnalysis?.classList.remove('d-none');
    setTitleAndActive('Finance Analysis', 'finance-analysis-nav', 'finance-analysis');
    // Call embedded initialization function after page is visible
    setTimeout(() => {
        if (typeof window.initFinanceAnalysisPage === 'function') {
            window.initFinanceAnalysisPage();
        }
    }, 100);
}

// ==================== BIRTH CONGRATULATIONS ====================
function showBirthCongratsPage() {
    hideAllPages();
    pages.birthCongrats?.classList.remove('d-none');
    setTitleAndActive('Ucapan Kelahiran', 'nav-birth-congrats', 'birth-congrats');
    loadBirthCongratsList();
}

async function loadBirthCongratsList() {
    const container = document.getElementById('birth-congrats-list');
    if (!container) return;

    container.innerHTML = `<div class="text-center text-muted py-5">
        <i class="fas fa-spinner fa-spin fa-2x mb-3"></i>
        <p>Memuat data...</p>
    </div>`;

    try {
        const token = getAuthToken();
        const response = await fetch('/api/patients/birth-congratulations/all', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) throw new Error('Failed to fetch');

        const result = await response.json();
        if (!result.success) throw new Error(result.message);

        // Store data globally for edit function
        window.birthCongratsData = {};
        if (result.data) {
            result.data.forEach(item => {
                window.birthCongratsData[item.patient_id] = item;
            });
        }

        if (!result.data || result.data.length === 0) {
            container.innerHTML = `<div class="text-center text-muted py-5">
                <i class="fas fa-baby fa-3x mb-3" style="color: #007bff; opacity: 0.5;"></i>
                <p>Belum ada data ucapan kelahiran</p>
                <button class="btn btn-primary btn-sm" onclick="showAddBirthCongratsModal()">
                    <i class="fas fa-plus mr-1"></i>Tambah Baru
                </button>
            </div>`;
            return;
        }

        let html = '<div class="row">';
        for (const item of result.data) {
            const birthDate = item.birth_date ? new Date(item.birth_date).toLocaleDateString('id-ID', {
                weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
            }) : '-';
            const genderIcon = item.gender === 'male' ? 'fa-mars text-info' : item.gender === 'female' ? 'fa-venus text-danger' : 'fa-question text-muted';
            const genderText = item.gender === 'male' ? 'Laki-laki' : item.gender === 'female' ? 'Perempuan' : '-';
            const statusBadge = item.is_published
                ? '<span class="badge badge-success"><i class="fas fa-eye"></i> Tampil</span>'
                : '<span class="badge badge-secondary"><i class="fas fa-eye-slash"></i> Sembunyi</span>';

            html += `
            <div class="col-md-6 col-lg-4 mb-4">
                <div class="card h-100" style="border: 2px solid #90caf9; border-radius: 15px; overflow: hidden;">
                    <div class="card-header" style="background: linear-gradient(135deg, #e3f2fd, #bbdefb); border-bottom: none;">
                        <div class="d-flex justify-content-between align-items-center">
                            <h5 class="mb-0" style="color: #1976d2;"><i class="fas fa-baby mr-2"></i>${item.baby_name || 'Baby'}</h5>
                            ${statusBadge}
                        </div>
                        <small class="text-muted">Ibu: ${item.patient_name || '-'}</small>
                    </div>
                    <div class="card-body">
                        ${item.photo_url ? `<div class="text-center mb-3"><img src="${item.photo_url}" alt="Foto" style="max-width: 100%; max-height: 150px; border-radius: 10px; object-fit: cover;"></div>` : ''}
                        <div class="row text-center mb-2">
                            <div class="col-6">
                                <small class="text-muted d-block">Tanggal</small>
                                <strong style="font-size: 12px;">${birthDate}</strong>
                            </div>
                            <div class="col-6">
                                <small class="text-muted d-block">Jam</small>
                                <strong>${item.birth_time ? item.birth_time.substring(0, 5) + ' WIB' : '-'}</strong>
                            </div>
                        </div>
                        <div class="row text-center mb-2">
                            <div class="col-4">
                                <small class="text-muted d-block">Berat</small>
                                <strong>${item.birth_weight || '-'}</strong>
                            </div>
                            <div class="col-4">
                                <small class="text-muted d-block">Panjang</small>
                                <strong>${item.birth_length || '-'}</strong>
                            </div>
                            <div class="col-4">
                                <small class="text-muted d-block">Gender</small>
                                <strong><i class="fas ${genderIcon}"></i> ${genderText}</strong>
                            </div>
                        </div>
                        ${item.message ? `<div class="alert alert-light mb-0 mt-2" style="font-size: 12px; font-style: italic; border-left: 3px solid #007bff;">"${item.message}"</div>` : ''}
                    </div>
                    <div class="card-footer bg-white text-right">
                        <button class="btn btn-outline-info btn-sm" onclick="editBirthCongrats('${item.patient_id}', birthCongratsData['${item.patient_id}'])">
                            <i class="fas fa-edit"></i> Edit
                        </button>
                        <button class="btn btn-outline-danger btn-sm" onclick="deleteBirthCongrats('${item.patient_id}')">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            </div>`;
        }
        html += '</div>';
        container.innerHTML = html;

    } catch (error) {
        console.error('Error loading birth congratulations:', error);
        container.innerHTML = `<div class="alert alert-danger">Gagal memuat data: ${error.message}</div>`;
    }
}

async function showAddBirthCongratsModal() {
    // Reset form
    document.getElementById('birthCongratsForm').reset();
    document.getElementById('bc-edit-id').value = '';
    document.getElementById('birthCongratsModalTitle').textContent = 'Tambah Ucapan Kelahiran';
    document.getElementById('bc-photo-preview').style.display = 'none';
    document.getElementById('bc-is-published').checked = true;

    // Reset color picker to default (pink)
    selectBirthCongratsColor('pink');

    // Load patients for dropdown
    await loadPatientsForBirthCongrats();

    $('#birthCongratsModal').modal('show');
}

async function loadPatientsForBirthCongrats() {
    const select = document.getElementById('bc-patient-id');
    select.innerHTML = '<option value="">-- Memuat pasien... --</option>';

    try {
        const token = getAuthToken();
        const response = await fetch('/api/patients?limit=1000', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const result = await response.json();

        select.innerHTML = '<option value="">-- Pilih Pasien --</option>';
        if (result.success && result.data) {
            for (const p of result.data) {
                select.innerHTML += `<option value="${p.id}">${p.full_name} (${p.id})</option>`;
            }
        }
    } catch (error) {
        console.error('Error loading patients:', error);
        select.innerHTML = '<option value="">-- Error loading --</option>';
    }
}

// Color picker function for birth congratulations
function selectBirthCongratsColor(color) {
    // Update hidden input
    document.getElementById('bc-theme-color').value = color;

    // Update visual - reset all borders then set selected
    document.querySelectorAll('#bc-color-options .color-box').forEach(box => {
        box.style.borderColor = box.dataset.color === color ? '#333' : 'transparent';
    });
}

async function saveBirthCongrats() {
    const patientId = document.getElementById('bc-patient-id').value;
    if (!patientId) {
        showToast('Pilih pasien terlebih dahulu', 'error');
        return;
    }

    // Get selected theme color from hidden input
    const themeColor = document.getElementById('bc-theme-color').value || 'pink';

    const data = {
        baby_name: document.getElementById('bc-baby-name').value,
        birth_date: document.getElementById('bc-birth-date').value || null,
        birth_time: document.getElementById('bc-birth-time').value || null,
        birth_weight: document.getElementById('bc-birth-weight').value,
        birth_length: document.getElementById('bc-birth-length').value,
        gender: document.getElementById('bc-gender').value || null,
        message: document.getElementById('bc-message').value,
        is_published: document.getElementById('bc-is-published').checked ? 1 : 0,
        theme_color: themeColor
    };

    try {
        const token = getAuthToken();

        // Save data first
        const response = await fetch(`/api/patients/${patientId}/birth-congratulations`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });

        if (!response.ok) throw new Error('Failed to save');

        // Upload photo if selected
        const photoInput = document.getElementById('bc-photo');
        if (photoInput.files && photoInput.files[0]) {
            const formData = new FormData();
            formData.append('photo', photoInput.files[0]);

            const photoResponse = await fetch(`/api/patients/${patientId}/birth-congratulations/photo`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData
            });

            if (!photoResponse.ok) {
                console.error('Photo upload failed');
                showToast('Data tersimpan, tapi foto gagal diupload', 'warning');
            }
        }

        showToast('Ucapan kelahiran berhasil disimpan', 'success');
        $('#birthCongratsModal').modal('hide');
        loadBirthCongratsList();

    } catch (error) {
        console.error('Error saving birth congratulations:', error);
        showToast('Gagal menyimpan: ' + error.message, 'error');
    }
}

async function editBirthCongrats(patientId, existingData) {
    await showAddBirthCongratsModal();
    document.getElementById('bc-edit-id').value = patientId;
    document.getElementById('birthCongratsModalTitle').textContent = 'Edit Ucapan Kelahiran';
    document.getElementById('bc-patient-id').value = patientId;

    // Fill form with existing data
    if (existingData) {
        document.getElementById('bc-baby-name').value = existingData.baby_name || '';
        document.getElementById('bc-birth-date').value = existingData.birth_date ? existingData.birth_date.split('T')[0] : '';
        document.getElementById('bc-birth-time').value = existingData.birth_time || '';
        document.getElementById('bc-birth-weight').value = existingData.birth_weight || '';
        document.getElementById('bc-birth-length').value = existingData.birth_length || '';
        document.getElementById('bc-gender').value = existingData.gender || '';
        document.getElementById('bc-message').value = existingData.message || '';
        document.getElementById('bc-is-published').checked = existingData.is_published == 1;

        // Set theme color
        selectBirthCongratsColor(existingData.theme_color || 'pink');

        // Show existing photo preview if available
        if (existingData.photo_url) {
            const preview = document.getElementById('bc-photo-preview');
            if (preview) {
                preview.innerHTML = `<img src="${existingData.photo_url}" style="max-width:150px;max-height:150px;border-radius:8px;">`;
                preview.style.display = 'block';
            }
        }
    }
}

async function deleteBirthCongrats(patientId) {
    if (!confirm('Hapus ucapan kelahiran untuk pasien ini?')) return;

    try {
        const token = getAuthToken();
        const response = await fetch(`/api/patients/${patientId}/birth-congratulations`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) throw new Error('Failed to delete');

        showToast('Ucapan kelahiran berhasil dihapus', 'success');
        loadBirthCongratsList();
    } catch (error) {
        console.error('Error deleting:', error);
        showToast('Gagal menghapus', 'error');
    }
}

// Photo preview handler
document.addEventListener('DOMContentLoaded', function() {
    const photoInput = document.getElementById('bc-photo');
    if (photoInput) {
        photoInput.addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = function(event) {
                    const preview = document.getElementById('bc-photo-preview');
                    preview.querySelector('img').src = event.target.result;
                    preview.style.display = 'block';
                };
                reader.readAsDataURL(file);

                // Update label
                document.querySelector('label[for="bc-photo"]').textContent = file.name;
            }
        });
    }
});

// ==================== INVOICE HISTORY ====================
function showInvoiceHistoryPage() {
    hideAllPages();
    const page = document.getElementById('invoice-history-page');
    if (page) page.classList.remove('d-none');
    setTitleAndActive('Riwayat Invoice', 'nav-invoice-history', 'invoice-history');

    // Set default date range (last 30 days)
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);

    document.getElementById('invoice-start-date').value = startDate.toISOString().split('T')[0];
    document.getElementById('invoice-end-date').value = endDate.toISOString().split('T')[0];

    loadInvoiceHistory();
}

async function loadInvoiceHistory() {
    const tbody = document.getElementById('invoice-history-tbody');
    const countBadge = document.getElementById('invoice-count');

    tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-4"><i class="fas fa-spinner fa-spin"></i> Memuat data...</td></tr>';

    try {
        const token = getAuthToken();
        const startDate = document.getElementById('invoice-start-date').value || '';
        const endDate = document.getElementById('invoice-end-date').value || '';
        const status = document.getElementById('invoice-status-filter').value || '';
        const search = document.getElementById('invoice-search').value || '';

        const params = new URLSearchParams();
        if (startDate) params.append('start_date', startDate);
        if (endDate) params.append('end_date', endDate);
        if (status) params.append('status', status);
        if (search) params.append('search', search);

        const response = await fetch(`/api/invoices/history?${params.toString()}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) throw new Error('Failed to load invoices');

        const data = await response.json();
        const invoices = data.invoices || [];

        countBadge.textContent = `${invoices.length} invoice`;

        if (invoices.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-4"><i class="fas fa-file-invoice"></i> Tidak ada invoice ditemukan</td></tr>';
            return;
        }

        tbody.innerHTML = invoices.map(inv => {
            const visitDate = new Date(inv.visit_date).toLocaleDateString('id-ID', {
                day: 'numeric', month: 'short', year: 'numeric'
            });
            const amount = new Intl.NumberFormat('id-ID', {
                style: 'currency', currency: 'IDR', minimumFractionDigits: 0
            }).format(inv.total_amount || 0);

            const statusBadges = {
                'paid': '<span class="badge badge-success">Lunas</span>',
                'pending': '<span class="badge badge-warning">Pending</span>',
                'cancelled': '<span class="badge badge-danger">Dibatalkan</span>'
            };
            const statusBadge = statusBadges[inv.invoice_status] || '<span class="badge badge-secondary">-</span>';

            return `
                <tr>
                    <td><code>${inv.invoice_number}</code></td>
                    <td>${visitDate}</td>
                    <td>
                        <strong>${inv.patient_name || '-'}</strong><br>
                        <small class="text-muted">${inv.patient_id}</small>
                    </td>
                    <td>${inv.visit_type || '-'}</td>
                    <td class="text-right font-weight-bold">${amount}</td>
                    <td>${statusBadge}</td>
                    <td class="text-center">
                        ${inv.invoice_url ? `<a href="${inv.invoice_url}" target="_blank" class="btn btn-xs btn-info" title="Lihat Invoice"><i class="fas fa-eye"></i></a>` : ''}
                        ${inv.etiket_url ? `<a href="${inv.etiket_url}" target="_blank" class="btn btn-xs btn-secondary ml-1" title="Lihat Etiket"><i class="fas fa-tag"></i></a>` : ''}
                    </td>
                </tr>
            `;
        }).join('');

    } catch (error) {
        console.error('Error loading invoice history:', error);
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-danger py-4"><i class="fas fa-exclamation-triangle"></i> Gagal memuat data</td></tr>';
    }
}

window.showInvoiceHistoryPage = showInvoiceHistoryPage;
window.loadInvoiceHistory = loadInvoiceHistory;
// ==================== END INVOICE HISTORY ====================

function showBookingSettingsPage() {
    hideAllPages();
    pages.bookingSettings?.classList.remove('d-none');
    setTitleAndActive('Pengaturan Booking', 'nav-booking-settings', 'booking-settings');

    // Dynamically import and initialize the Booking Settings module
    importWithVersion('./kelola-booking-settings.js').then(module => {
        if (typeof window.initKelolaBookingSettings === 'function') {
            window.initKelolaBookingSettings();
        } else {
            console.error('Kelola Booking Settings module loaded, but initKelolaBookingSettings function not found on window.');
        }
    }).catch(error => {
        console.error('Failed to load kelola-booking-settings.js:', error);
    });
}

function showImportFieldsPage() {
    hideAllPages();
    pages.importFields?.classList.remove('d-none');
    setTitleAndActive('Kelola Import Fields', 'nav-import-fields', 'import-fields');
    loadExternalPage('import-fields-page', 'kelola-import-fields.html');
}

function showArtikelKesehatanPage() {
    hideAllPages();
    pages.artikelKesehatan?.classList.remove('d-none');
    setTitleAndActive('Ruang Membaca', 'nav-artikel-kesehatan', 'artikel-kesehatan');
    loadArticlesAdmin();
}

// ==================== ARTIKEL KESEHATAN FUNCTIONS ====================

async function loadArticlesAdmin() {
    const tbody = document.getElementById('articles-admin-tbody');
    if (!tbody) return;

    const category = document.getElementById('article-filter-category')?.value || 'all';
    const status = document.getElementById('article-filter-status')?.value || 'all';

    tbody.innerHTML = '<tr><td colspan="6" class="text-center py-4"><i class="fas fa-spinner fa-spin"></i> Memuat...</td></tr>';

    try {
        const token = getAuthToken();
        const params = new URLSearchParams({ category, status, limit: 100 });
        const response = await fetch(`/api/articles/admin/all?${params}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) throw new Error('Failed to load articles');

        const result = await response.json();

        if (!result.data || result.data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-4">Belum ada artikel. Klik "Tambah Artikel" untuk membuat.</td></tr>';
            return;
        }

        tbody.innerHTML = result.data.map(article => `
            <tr>
                <td>
                    <strong>${escapeHtml(article.title)}</strong>
                    ${article.summary ? `<br><small class="text-muted">${escapeHtml(article.summary.substring(0, 60))}...</small>` : ''}
                </td>
                <td><span class="badge badge-info">${escapeHtml(article.category || 'Kehamilan')}</span></td>
                <td>
                    ${article.is_published
                        ? '<span class="badge badge-success">Published</span>'
                        : '<span class="badge badge-secondary">Draft</span>'}
                </td>
                <td>${article.view_count || 0}</td>
                <td>
                    <i class="fas fa-thumbs-up text-primary"></i> ${article.like_count || 0}
                </td>
                <td><small>${formatDate(article.updated_at)}</small></td>
                <td>
                    <button class="btn btn-sm btn-info" onclick="editArticle(${article.id})" title="Edit">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-sm ${article.is_published ? 'btn-warning' : 'btn-success'}"
                            onclick="togglePublishArticle(${article.id}, ${!article.is_published})"
                            title="${article.is_published ? 'Unpublish' : 'Publish'}">
                        <i class="fas ${article.is_published ? 'fa-eye-slash' : 'fa-eye'}"></i>
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="deleteArticle(${article.id})" title="Hapus">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `).join('');

    } catch (error) {
        console.error('Error loading articles:', error);
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-danger py-4">Gagal memuat artikel</td></tr>';
    }
}

function showAddArticleModal() {
    document.getElementById('articleModalTitle').textContent = 'Tambah Artikel Baru';
    document.getElementById('articleForm').reset();
    document.getElementById('article-id').value = '';
    document.getElementById('article-color').value = '#28a7e9';
    $('#articleModal').modal('show');
}

async function editArticle(id) {
    try {
        const token = getAuthToken();
        const response = await fetch(`/api/articles/${id}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) throw new Error('Failed to fetch article');

        const result = await response.json();
        const article = result.data;

        document.getElementById('articleModalTitle').textContent = 'Edit Artikel';
        document.getElementById('article-id').value = article.id;
        document.getElementById('article-title').value = article.title || '';
        document.getElementById('article-summary').value = article.summary || '';
        document.getElementById('article-content').value = article.content || '';
        document.getElementById('article-category').value = article.category || 'Kehamilan';
        document.getElementById('article-source').value = article.source || '';
        document.getElementById('article-icon').value = article.icon || 'fa-heartbeat';
        document.getElementById('article-color').value = article.color || '#28a7e9';
        document.getElementById('article-published').checked = article.is_published === 1;

        $('#articleModal').modal('show');

        // Update preview with loaded content
        updateArticlePreview();
    } catch (error) {
        console.error('Error fetching article:', error);
        alert('Gagal memuat artikel');
    }
}

async function saveArticle() {
    const id = document.getElementById('article-id').value;
    const isEdit = !!id;

    const data = {
        title: document.getElementById('article-title').value.trim(),
        summary: document.getElementById('article-summary').value.trim(),
        content: document.getElementById('article-content').value,
        category: document.getElementById('article-category').value,
        source: document.getElementById('article-source').value.trim(),
        icon: document.getElementById('article-icon').value,
        color: document.getElementById('article-color').value,
        is_published: document.getElementById('article-published').checked
    };

    if (!data.title) {
        alert('Judul artikel wajib diisi');
        return;
    }

    try {
        const token = getAuthToken();
        const url = isEdit ? `/api/articles/${id}` : '/api/articles';
        const method = isEdit ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(data)
        });

        if (!response.ok) throw new Error('Failed to save article');

        $('#articleModal').modal('hide');
        loadArticlesAdmin();

        // Show success notification
        if (typeof toastr !== 'undefined') {
            toastr.success(isEdit ? 'Artikel berhasil diupdate' : 'Artikel berhasil dibuat');
        }
    } catch (error) {
        console.error('Error saving article:', error);
        alert('Gagal menyimpan artikel');
    }
}

async function togglePublishArticle(id, publish) {
    try {
        const token = getAuthToken();
        const response = await fetch(`/api/articles/${id}/publish`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ is_published: publish })
        });

        if (!response.ok) throw new Error('Failed to update publish status');

        loadArticlesAdmin();

        if (typeof toastr !== 'undefined') {
            toastr.success(publish ? 'Artikel dipublish' : 'Artikel di-unpublish');
        }
    } catch (error) {
        console.error('Error toggling publish:', error);
        alert('Gagal mengubah status publish');
    }
}

async function deleteArticle(id) {
    if (!confirm('Yakin ingin menghapus artikel ini?')) return;

    try {
        const token = getAuthToken();
        const response = await fetch(`/api/articles/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) throw new Error('Failed to delete article');

        loadArticlesAdmin();

        if (typeof toastr !== 'undefined') {
            toastr.success('Artikel berhasil dihapus');
        }
    } catch (error) {
        console.error('Error deleting article:', error);
        alert('Gagal menghapus artikel');
    }
}

// Initialize Markdown preview for article editor
function initArticleMarkdownPreview() {
    const contentTextarea = document.getElementById('article-content');
    const previewDiv = document.getElementById('article-preview');
    const previewTab = document.querySelector('a[href="#preview-tab"]');

    if (!contentTextarea || !previewDiv || !previewTab) return;

    // Update preview when switching to preview tab
    previewTab.addEventListener('shown.bs.tab', function() {
        updateArticlePreview();
    });

    // Also update on input (with debounce for performance)
    let previewTimeout;
    contentTextarea.addEventListener('input', function() {
        clearTimeout(previewTimeout);
        previewTimeout = setTimeout(updateArticlePreview, 500);
    });
}

// Update the Markdown preview
function updateArticlePreview() {
    const contentTextarea = document.getElementById('article-content');
    const previewDiv = document.getElementById('article-preview');

    if (!contentTextarea || !previewDiv) return;

    const markdownContent = contentTextarea.value.trim();

    if (!markdownContent) {
        previewDiv.innerHTML = '<p class="text-muted"><i>Preview akan muncul di sini...</i></p>';
        return;
    }

    // Check if marked is available
    if (typeof marked === 'undefined') {
        previewDiv.innerHTML = '<p class="text-danger"><i>Marked.js library tidak tersedia</i></p>';
        return;
    }

    try {
        // Parse and render Markdown
        const htmlContent = marked.parse(markdownContent);
        previewDiv.innerHTML = htmlContent;
    } catch (error) {
        console.error('Error parsing Markdown:', error);
        previewDiv.innerHTML = `<p class="text-danger"><i>Error: ${error.message}</i></p>`;
    }
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ==================== END ARTIKEL KESEHATAN ====================

// ==================== NOTIFICATION BADGES ====================

/**
 * Get last seen timestamp for a location from localStorage
 */
function getLastSeenTimestamp(location) {
    const key = `badge_last_seen_${location}`;
    return localStorage.getItem(key) || null;
}

/**
 * Mark a badge as read - save current timestamp to localStorage
 */
function markBadgeRead(location) {
    const key = `badge_last_seen_${location}`;
    localStorage.setItem(key, new Date().toISOString());

    // Hide the badge immediately
    const badgeId = `badge-${location.replace(/_/g, '-')}`;
    const badge = document.getElementById(badgeId);
    if (badge) {
        badge.classList.add('d-none');
        badge.textContent = '0';
    }
}

/**
 * Update a single badge element
 */
function updateBadge(badgeId, count) {
    const badge = document.getElementById(badgeId);
    if (!badge) return;

    if (count > 0) {
        badge.textContent = count;
        badge.classList.remove('d-none');
    } else {
        badge.classList.add('d-none');
    }
}

/**
 * Load and update sidebar notification badge counts
 */
async function loadNotificationBadges() {
    try {
        const token = getAuthToken();
        if (!token) return;

        // Get last seen timestamps for all locations
        const lastSeen = {
            klinik_private: getLastSeenTimestamp('klinik_private'),
            rsia_melinda: getLastSeenTimestamp('rsia_melinda'),
            rsud_gambiran: getLastSeenTimestamp('rsud_gambiran'),
            rs_bhayangkara: getLastSeenTimestamp('rs_bhayangkara'),
            artikel: getLastSeenTimestamp('artikel')
        };

        const response = await fetch('/api/notifications/badge-counts', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ lastSeen })
        });

        if (!response.ok) return;

        const result = await response.json();
        if (!result.success) return;

        const { counts } = result;

        // Update all badges
        updateBadge('badge-klinik-private', counts.klinik_private || 0);
        updateBadge('badge-rsia-melinda', counts.rsia_melinda || 0);
        updateBadge('badge-rsud-gambiran', counts.rsud_gambiran || 0);
        updateBadge('badge-rs-bhayangkara', counts.rs_bhayangkara || 0);
        updateBadge('badge-artikel-likes', counts.artikel || 0);

    } catch (error) {
        console.error('Error loading notification badges:', error);
    }
}

// Export markBadgeRead to window
window.markBadgeRead = markBadgeRead;

// Reload badges every 2 minutes
setInterval(loadNotificationBadges, 120000);

// ==================== END NOTIFICATION BADGES ====================

function showProfileSettings() {
    hideAllPages();
    pages.profile?.classList.remove('d-none');
    setTitleAndActive('Pengaturan Profil', 'nav-profile-settings', 'profile');
    loadExternalPage('profile-settings-page', 'profile-settings.html');
}

// REMOVED: Email Settings Page
// function showEmailSettingsPage() {
//     hideAllPages();
//     const page = document.getElementById('email-settings-page');
//     if (page) {
//         page.classList.remove('d-none');
//     }
//     setTitleAndActive('Pengaturan Email', 'management-nav-email-settings', 'email-settings');
//
//     // Initialize email settings form if not already done
//     if (!page.dataset.initialized) {
//         initializeEmailSettingsForm();
//         page.dataset.initialized = 'true';
//     }
// }

async function initializeEmailSettingsForm() {
    const form = document.getElementById('email-settings-form');
    if (!form) return;

    // Set up form submit handler
    form.addEventListener('submit', async (event) => {
        event.preventDefault();

        const token = getAuthToken();
        if (!token) {
            alert('Sesi login berakhir. Silakan login ulang.');
            return;
        }

        const payload = {
            senderName: document.getElementById('sender-name')?.value?.trim() || '',
            templates: {
                verification: {
                    subject: document.getElementById('verification-subject')?.value?.trim() || '',
                    body: document.getElementById('verification-body')?.value || ''
                },
                password_reset: {
                    subject: document.getElementById('reset-subject')?.value?.trim() || '',
                    body: document.getElementById('reset-body')?.value || ''
                },
                announcement: {
                    subject: document.getElementById('announcement-subject')?.value?.trim() || '',
                    body: document.getElementById('announcement-body')?.value || ''
                }
            }
        };

        if (!payload.senderName) {
            alert('Nama pengirim tidak boleh kosong.');
            return;
        }

        const submitBtn = form.querySelector('button[type="submit"]');
        const originalText = submitBtn.innerHTML;
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Menyimpan...';

        try {
            const res = await fetch('/api/email-settings', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });

            const result = await res.json().catch(() => ({ success: false, message: 'Gagal menyimpan pengaturan email.' }));

            if (!res.ok || !result.success) {
                throw new Error(result.message || `Gagal menyimpan pengaturan email (status ${res.status})`);
            }

            alert('Pengaturan email berhasil disimpan.');
        } catch (error) {
            console.error('Failed to save email settings:', error);
            alert(error.message || 'Gagal menyimpan pengaturan email.');
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalText;
        }
    });

    // Load existing settings
    const token = getAuthToken();
    if (!token) return;

    try {
        const res = await fetch('/api/email-settings', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (res.ok) {
            const result = await res.json();
            if (result.success && result.data) {
                const { senderName, templates } = result.data;

                if (senderName) {
                    document.getElementById('sender-name').value = senderName;
                }

                if (templates) {
                    if (templates.verification) {
                        document.getElementById('verification-subject').value = templates.verification.subject || '';
                        document.getElementById('verification-body').value = templates.verification.body || '';
                    }
                    if (templates.password_reset) {
                        document.getElementById('reset-subject').value = templates.password_reset.subject || '';
                        document.getElementById('reset-body').value = templates.password_reset.body || '';
                    }
                    if (templates.announcement) {
                        document.getElementById('announcement-subject').value = templates.announcement.subject || '';
                        document.getElementById('announcement-body').value = templates.announcement.body || '';
                    }
                }
            }
        }
    } catch (error) {
        console.error('Failed to load email settings:', error);
    }
}

// -------------------- BASIC BINDINGS --------------------
function bindBasics() {
    const backFromLogBtn = grab('backFromLogBtn');
    backFromLogBtn?.addEventListener('click', showTindakanPage);

    // Summary action buttons (disabled until billing logic is ported)
    const backToTindakanBtn = grab('backToTindakanBtn');
    backToTindakanBtn?.addEventListener('click', showTindakanPage);
}

function getSundayClinicMrFromSession() {
    try {
        const session = loadSession();
        if (!session || !session.patient) {
            return null;
        }
        if (session.patient.sundayClinic && session.patient.sundayClinic.mrId) {
            return session.patient.sundayClinic.mrId;
        }
        return session.patient.mrId || session.patient.mrid || null;
    } catch (error) {
        console.warn('Unable to read session for Sunday Clinic MR:', error);
        return null;
    }
}

function normalizeMrSlug(value) {
    if (!value) {
        return '';
    }
    return String(value)
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '');
}

function openSundayClinicViewer() {
    let mrId = getSundayClinicMrFromSession();
    if (!mrId) {
        const input = window.prompt('Masukkan MR ID Sunday Clinic yang ingin dibuka:');
        if (!input) {
            return;
        }
        mrId = input;
    }

    const slug = normalizeMrSlug(mrId);
    if (!slug) {
        showWarning('Tidak dapat membuka Sunday Clinic tanpa MR ID.');
        return;
    }

    let targetUrl = `/sunday-clinic/${encodeURIComponent(slug)}/identitas`;
    targetUrl = window.buildMobileUrl ? window.buildMobileUrl(targetUrl) : targetUrl;

    // In mobile app mode, navigate in same window (WebView doesn't handle new tabs well)
    if (window.isMobileAppMode && window.isMobileAppMode()) {
        window.location.href = targetUrl;
    } else {
        window.open(targetUrl, '_blank', 'noopener');
    }
}

function openSundayClinicWithMrId(mrId) {
    if (!mrId) {
        showWarning('MR ID tidak valid.');
        return;
    }

    const slug = normalizeMrSlug(mrId);
    if (!slug) {
        showWarning('Tidak dapat membuka Sunday Clinic tanpa MR ID.');
        return;
    }

    let targetUrl = `/sunday-clinic/${encodeURIComponent(slug)}/identitas`;
    targetUrl = window.buildMobileUrl ? window.buildMobileUrl(targetUrl) : targetUrl;

    // In mobile app mode, navigate in same window
    if (window.isMobileAppMode && window.isMobileAppMode()) {
        window.location.href = targetUrl;
    } else {
        window.open(targetUrl, '_blank', 'noopener');
    }
}

function bindSundayClinicLauncher() {
    const button = document.getElementById('btn-open-sunday-clinic');
    if (!button) {
        return;
    }
    
    // Prevent multiple event listeners by checking if already bound
    if (button.dataset.sundayClinicBound === 'true') {
        return;
    }
    
    button.addEventListener('click', event => {
        event.preventDefault();
        openSundayClinicViewer();
    });
    
    // Mark as bound
    button.dataset.sundayClinicBound = 'true';
}

// Markdown parser for role descriptions
function parseMarkdown(text) {
    if (!text) return '';

    let html = text
        // Headers: ### Header
        .replace(/^###\s+(.*)$/gm, '<h6 style="font-weight: 600; margin: 8px 0 4px 0; color: #343a40;">$1</h6>')
        .replace(/^##\s+(.*)$/gm, '<h5 style="font-weight: 600; margin: 10px 0 6px 0; color: #343a40;">$1</h5>')
        .replace(/^#\s+(.*)$/gm, '<h4 style="font-weight: 700; margin: 12px 0 8px 0; color: #343a40;">$1</h4>')
        // Bold: **text** or __text__
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/__(.*?)__/g, '<strong>$1</strong>')
        // Italic: *text* or _text_
        .replace(/\*(?!\*)(.*?)\*/g, '<em>$1</em>')
        .replace(/_(?!_)(.*?)_/g, '<em>$1</em>')
        // Inline code: `code`
        .replace(/`([^`]+)`/g, '<code style="background: #f4f4f4; padding: 2px 6px; border-radius: 4px; font-size: 12px;">$1</code>')
        // Horizontal rule: ---
        .replace(/^---$/gm, '<hr style="border: 0; border-top: 1px solid #dee2e6; margin: 10px 0;">')
        // Blockquote: > text
        .replace(/^>\s+(.*)$/gm, '<blockquote style="border-left: 3px solid #6c757d; padding-left: 12px; margin: 8px 0; color: #6c757d; font-style: italic;">$1</blockquote>');

    // Process lists separately to handle properly
    const lines = html.split('\n');
    let result = [];
    let inList = false;
    let listType = null;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const unorderedMatch = line.match(/^[\-\*]\s+(.*)$/);
        const orderedMatch = line.match(/^\d+\.\s+(.*)$/);

        if (unorderedMatch) {
            if (!inList || listType !== 'ul') {
                if (inList) result.push(listType === 'ol' ? '</ol>' : '</ul>');
                result.push('<ul style="margin: 6px 0; padding-left: 20px; list-style-type: disc;">');
                inList = true;
                listType = 'ul';
            }
            result.push(`<li style="margin: 3px 0; line-height: 1.5;">${unorderedMatch[1]}</li>`);
        } else if (orderedMatch) {
            if (!inList || listType !== 'ol') {
                if (inList) result.push(listType === 'ol' ? '</ol>' : '</ul>');
                result.push('<ol style="margin: 6px 0; padding-left: 20px;">');
                inList = true;
                listType = 'ol';
            }
            result.push(`<li style="margin: 3px 0; line-height: 1.5;">${orderedMatch[1]}</li>`);
        } else {
            if (inList) {
                result.push(listType === 'ol' ? '</ol>' : '</ul>');
                inList = false;
                listType = null;
            }
            // Only add <br> for non-empty lines that aren't already block elements
            if (line.trim() && !line.startsWith('<h') && !line.startsWith('<hr') && !line.startsWith('<blockquote')) {
                result.push(line + '<br>');
            } else if (line.trim()) {
                result.push(line);
            }
        }
    }

    if (inList) {
        result.push(listType === 'ol' ? '</ol>' : '</ul>');
    }

    return result.join('\n')
        // Clean up trailing <br> before block elements
        .replace(/<br>\n*(<\/?(ul|ol|h[1-6]|hr|blockquote))/g, '$1')
        // Clean up multiple <br>
        .replace(/(<br>\s*){2,}/g, '<br><br>');
}

// Fallback greetings when API fails
const FALLBACK_GREETINGS = [
    "Selamat bekerja, semoga harimu menyenangkan!",
    "Semangat menjalani hari ini!",
    "Terima kasih atas dedikasimu hari ini.",
    "Satu langkah kecil, dampak besar untuk pasien.",
    "Kamu hebat sudah sampai di sini!"
];

/**
 * Get daily greeting from AI API (cached per day per user)
 * Changes once per day at midnight
 * Falls back to local greeting if API fails
 */
async function fetchDailyGreeting(userId) {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const storageKey = `daily_greeting_ai_${userId}`;
    const stored = localStorage.getItem(storageKey);

    // Check if we have a valid cached greeting for today
    if (stored) {
        try {
            const { date, greeting } = JSON.parse(stored);
            if (date === today && greeting) {
                return greeting;
            }
        } catch (e) {
            // Invalid stored data, fetch new
        }
    }

    // Fetch from AI API
    try {
        const token = getAuthToken();
        const response = await fetch('/api/ai/daily-greeting', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            const result = await response.json();
            if (result.success && result.data?.greeting) {
                const greeting = result.data.greeting;
                // Cache locally until midnight
                localStorage.setItem(storageKey, JSON.stringify({ date: today, greeting }));
                return greeting;
            }
        }
    } catch (error) {
        console.error('Failed to fetch AI greeting:', error);
    }

    // Fallback to random local greeting
    const fallbackIndex = Math.floor(Math.random() * FALLBACK_GREETINGS.length);
    const fallbackGreeting = FALLBACK_GREETINGS[fallbackIndex];
    localStorage.setItem(storageKey, JSON.stringify({ date: today, greeting: fallbackGreeting }));
    return fallbackGreeting;
}

/**
 * Update daily greeting element with AI-generated greeting
 */
async function updateDailyGreeting(userId) {
    const greetingEl = document.getElementById('daily-greeting');
    if (!greetingEl) return;

    // Show loading state briefly
    greetingEl.style.opacity = '0.6';
    greetingEl.textContent = 'Memuat ucapan hari ini...';

    try {
        const greeting = await fetchDailyGreeting(userId);
        greetingEl.textContent = greeting;
    } catch (error) {
        greetingEl.textContent = 'Selamat bekerja, semoga harimu menyenangkan!';
    }

    greetingEl.style.opacity = '1';
}

// Update welcome card with user roles and job descriptions
async function updateWelcomeCard(user) {
    const welcomeName = document.getElementById('welcome-name');
    const rolesDescList = document.getElementById('roles-description-list');

    if (!welcomeName || !rolesDescList) return;

    // Set name - special greeting for superadmin (dr. Dibya)
    if (user.is_superadmin || user.role_id === 1) {
        welcomeName.innerHTML = '<strong>BOSS</strong>';
    } else {
        welcomeName.textContent = user.name || user.email || 'User';
    }

    // Update daily greeting
    updateDailyGreeting(user.id);

    try {
        // Fetch user's roles with descriptions
        const token = getAuthToken();
        const response = await fetch(`/api/users/${user.id}/roles`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) throw new Error('Failed to fetch roles');

        const data = await response.json();
        const roles = data.data || [];

        if (roles.length === 0) {
            rolesDescList.innerHTML = '<p style="color: #6c757d;"><em>Tidak ada deskripsi role tersedia.</em></p>';
            return;
        }

        // Sort by is_primary DESC, then by permission_count DESC
        roles.sort((a, b) => {
            if (b.is_primary !== a.is_primary) return b.is_primary - a.is_primary;
            return (b.permission_count || 0) - (a.permission_count || 0);
        });

        // Build role descriptions HTML - elegant style for light grey card
        let descriptionsHtml = '';
        roles.forEach((role, index) => {
            const isPrimary = role.is_primary;
            const description = role.description || 'Tidak ada deskripsi untuk role ini.';

            descriptionsHtml += `
                <div style="background: #fff; border-radius: 8px; padding: 12px 16px; margin-bottom: 10px; border: 1px solid #dee2e6;">
                    <div style="font-weight: 600; color: #343a40; margin-bottom: 6px; font-size: 14px;">
                        ${role.display_name || role.name}
                        ${isPrimary ? '<span style="font-size: 11px; background: #e9ecef; color: #495057; padding: 2px 8px; border-radius: 10px; margin-left: 8px;">Primary</span>' : ''}
                    </div>
                    <div style="color: #495057; font-size: 13px; line-height: 1.5;">${parseMarkdown(description)}</div>
                </div>
            `;
        });

        rolesDescList.innerHTML = descriptionsHtml;

    } catch (error) {
        console.error('Error loading role descriptions:', error);
        rolesDescList.innerHTML = '<p style="color: #6c757d;"><em>Gagal memuat deskripsi role.</em></p>';
    }
}

async function initializeApp(user) {
    console.log('[MAIN] initializeApp called with user:', user?.id || 'null', user?.name || 'no name');

    // Store user globally for later access (e.g., showPatientDetail)
    window.currentStaffUser = user || null;

    if (user) {
        // Check if user must change password
        const mustChangePassword = localStorage.getItem('must_change_password') === 'true';
        const forcePasswordChange = new URLSearchParams(window.location.search).get('force_password_change') === '1';

        if (mustChangePassword || forcePasswordChange) {
            console.log('[MAIN] User must change password - showing password change modal');
            // Show force password change modal after DOM is ready
            setTimeout(() => {
                showForcePasswordChangeModal();
            }, 500);
        }

        // Update welcome card
        updateWelcomeCard(user);

        // Fetch menu visibility from API based on user's role
        await applyMenuVisibility(user);

        // Load notification badge counts
        loadNotificationBadges();

        // Initialize real-time sync for online users tracking
        console.log('[MAIN] Calling initRealtimeSync with:', { id: user.id, name: user.name, role: user.role });
        initRealtimeSync(user);

        // Check for SIMRS Melinda import data
        const importParam = new URLSearchParams(window.location.search).get('import');
        if (importParam) {
            console.log('[MAIN] Detected import parameter from Chrome extension');
            try {
                const importData = JSON.parse(decodeURIComponent(importParam));
                console.log('[MAIN] Import data:', importData);

                // Store in sessionStorage for use by patient forms
                sessionStorage.setItem('simrs_import_data', JSON.stringify(importData));

                // Clean URL to remove import parameter
                const cleanUrl = window.location.pathname + window.location.hash;
                window.history.replaceState({}, '', cleanUrl);

                // Show import modal after a short delay
                setTimeout(() => {
                    showSimrsImportModal(importData);
                }, 1000);
            } catch (e) {
                console.error('[MAIN] Failed to parse import data:', e);
            }
        }
    } else {
        console.log('[MAIN] No user, disconnecting realtime sync');
        // User is not logged in, or session expired
        // Disconnect from real-time sync
        disconnectRealtimeSync();
    }
}

/**
 * Fetch menu visibility from database and apply to sidebar
 */
async function applyMenuVisibility(user) {
    // Menu key to DOM element ID mapping
    // Each menu_key from role_visibility table maps to one or more DOM elements
    const menuMapping = {
        'dashboard': null, // Dashboard always visible
        'kelola_pasien': ['nav-kelola-pasien'],
        'pasien_baru': ['nav-kelola-pasien'], // Same as kelola_pasien
        'klinik_privat': ['nav-section-klinik-privat', 'nav-klinik-private', 'nav-klinik-private-pasien'],
        'rsia_melinda': ['nav-section-rsia-melinda', 'nav-rsia-melinda', 'nav-rsia-melinda-pasien'],
        'rsud_gambiran': ['nav-section-rsud-gambiran', 'nav-rsud-gambiran', 'nav-rsud-gambiran-pasien'],
        'rs_bhayangkara': ['nav-section-rs-bhayangkara', 'nav-rs-bhayangkara', 'nav-rs-bhayangkara-pasien'],
        'obat_alkes': ['management-nav-kelola-obat', 'management-nav-kelola-tindakan', 'management-nav-kelola-supplier'],
        'keuangan': ['nav-invoice-history'],
        'kelola_roles': ['management-nav-kelola-roles'],
        'penjualan-obat': ['nav-penjualan-obat', 'nav-estimasi-biaya'],
        'ucapan_kelahiran': ['nav-birth-congrats']
    };

    // Superadmin/dokter sees everything - show all hidden menus
    const isDokter = user.is_superadmin || user.role === 'dokter' || user.role === 'superadmin';
    if (isDokter) {
        // Show dokter-only elements
        document.querySelectorAll('.dokter-only').forEach(el => el.classList.remove('d-none'));
        // Show superadmin-exclusive elements
        document.querySelectorAll('.superadmin-exclusive').forEach(el => el.classList.remove('d-none'));
        // Show invoice history for dokter
        const invoiceNav = document.getElementById('nav-invoice-history');
        if (invoiceNav) invoiceNav.classList.remove('d-none');
        // Show birth congrats menu for dokter
        const birthCongratsNav = document.getElementById('nav-birth-congrats');
        if (birthCongratsNav) birthCongratsNav.classList.remove('d-none');
        return; // All menus visible
    }

    try {
        const token = getAuthToken();
        const response = await fetch('/api/role-visibility/my/menus', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
            console.error('Failed to fetch menu visibility');
            return;
        }

        const result = await response.json();
        if (!result.success) {
            console.error('Menu visibility API error:', result.message);
            return;
        }

        const visibility = result.data;

        // Apply visibility to each menu
        for (const [menuKey, elementIds] of Object.entries(menuMapping)) {
            if (!elementIds) continue; // Skip dashboard

            const isVisible = visibility[menuKey] !== false;

            for (const elementId of elementIds) {
                const element = document.getElementById(elementId);
                if (element) {
                    if (!isVisible) {
                        element.style.display = 'none';
                    } else {
                        element.style.display = '';
                        // Also remove d-none class if present
                        element.classList.remove('d-none');
                    }
                }
            }
        }

        // Hide klinik privat section header if all sub-items are hidden
        const klinikPrivatSection = document.getElementById('nav-section-klinik-privat');
        if (klinikPrivatSection && visibility['klinik_privat'] === false) {
            klinikPrivatSection.style.display = 'none';
        }

    } catch (error) {
        console.error('Error fetching menu visibility:', error);
    }
}

// -------------------- FORCE PASSWORD CHANGE --------------------
function showForcePasswordChangeModal() {
    // Check if modal already exists
    let modal = document.getElementById('force-password-change-modal');
    if (!modal) {
        // Create the modal dynamically
        const modalHtml = `
        <div class="modal fade" id="force-password-change-modal" tabindex="-1" role="dialog" data-backdrop="static" data-keyboard="false">
            <div class="modal-dialog modal-dialog-centered" role="document">
                <div class="modal-content">
                    <div class="modal-header bg-warning">
                        <h5 class="modal-title">
                            <i class="fas fa-exclamation-triangle mr-2"></i>Ganti Password Wajib
                        </h5>
                    </div>
                    <div class="modal-body">
                        <div class="alert alert-warning">
                            <i class="fas fa-info-circle mr-2"></i>
                            Password Anda telah direset. Demi keamanan, Anda <strong>wajib mengganti password</strong> sebelum melanjutkan.
                        </div>
                        <form id="force-password-change-form">
                            <div class="form-group">
                                <label for="force-current-password">Password Saat Ini</label>
                                <input type="password" class="form-control" id="force-current-password" value="123456" readonly>
                                <small class="text-muted">Password default: 123456</small>
                            </div>
                            <div class="form-group">
                                <label for="force-new-password">Password Baru <span class="text-danger">*</span></label>
                                <input type="password" class="form-control" id="force-new-password" required minlength="6" placeholder="Minimal 6 karakter">
                            </div>
                            <div class="form-group">
                                <label for="force-confirm-password">Konfirmasi Password Baru <span class="text-danger">*</span></label>
                                <input type="password" class="form-control" id="force-confirm-password" required minlength="6" placeholder="Ulangi password baru">
                            </div>
                            <div id="force-password-error" class="alert alert-danger d-none"></div>
                        </form>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-primary" id="force-password-submit-btn">
                            <i class="fas fa-save mr-1"></i>Simpan Password Baru
                        </button>
                    </div>
                </div>
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        modal = document.getElementById('force-password-change-modal');

        // Bind submit handler
        document.getElementById('force-password-submit-btn').addEventListener('click', handleForcePasswordChange);

        // Also bind Enter key
        document.getElementById('force-password-change-form').addEventListener('submit', function(e) {
            e.preventDefault();
            handleForcePasswordChange();
        });
    }

    // Show the modal
    $(modal).modal('show');
}

async function handleForcePasswordChange() {
    const currentPassword = document.getElementById('force-current-password').value;
    const newPassword = document.getElementById('force-new-password').value;
    const confirmPassword = document.getElementById('force-confirm-password').value;
    const errorDiv = document.getElementById('force-password-error');
    const submitBtn = document.getElementById('force-password-submit-btn');

    // Validation
    if (!newPassword || !confirmPassword) {
        errorDiv.textContent = 'Semua field harus diisi';
        errorDiv.classList.remove('d-none');
        return;
    }

    if (newPassword.length < 6) {
        errorDiv.textContent = 'Password baru minimal 6 karakter';
        errorDiv.classList.remove('d-none');
        return;
    }

    if (newPassword !== confirmPassword) {
        errorDiv.textContent = 'Password baru dan konfirmasi tidak cocok';
        errorDiv.classList.remove('d-none');
        return;
    }

    if (newPassword === '123456') {
        errorDiv.textContent = 'Password baru tidak boleh sama dengan password default';
        errorDiv.classList.remove('d-none');
        return;
    }

    // Hide error, show loading
    errorDiv.classList.add('d-none');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>Menyimpan...';

    try {
        const token = getAuthToken();
        const response = await fetch('/api/auth/change-password', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                currentPassword: currentPassword,
                newPassword: newPassword
            })
        });

        const result = await response.json();

        if (response.ok && result.success) {
            // Success - clear the flag and close modal
            localStorage.removeItem('must_change_password');

            // Show success message
            submitBtn.innerHTML = '<i class="fas fa-check mr-1"></i>Berhasil!';
            submitBtn.classList.remove('btn-primary');
            submitBtn.classList.add('btn-success');

            // Close modal and reload page after delay
            setTimeout(() => {
                $('#force-password-change-modal').modal('hide');
                // Remove query parameter and reload
                window.location.href = window.location.pathname;
            }, 1500);
        } else {
            throw new Error(result.message || 'Gagal mengubah password');
        }
    } catch (error) {
        console.error('Password change error:', error);
        errorDiv.textContent = error.message || 'Gagal mengubah password. Silakan coba lagi.';
        errorDiv.classList.remove('d-none');
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-save mr-1"></i>Simpan Password Baru';
    }
}

// Make function globally available
window.showForcePasswordChangeModal = showForcePasswordChangeModal;

// -------------------- CHROME EXTENSION IMPORT --------------------
/**
 * AUTOMATIC import from Chrome extension (SIMRS Gambiran/Melinda)
 * Flow: Parse → Search patient → Create MR → Navigate (NO confirmations)
 */
async function checkExtensionImportData() {
    const urlParams = new URLSearchParams(window.location.search);
    const importData = urlParams.get('import');
    if (!importData) return;

    // Clean URL immediately
    window.history.replaceState({}, '', window.location.pathname + window.location.hash);

    try {
        const data = JSON.parse(importData);
        const patientName = data.template?.identitas?.nama || data.raw_parsed?.identity?.nama;
        const visitLocation = data.visit_location || data.source || 'rsud_gambiran';
        const category = data.category || 'obstetri';
        const hospitalNames = { 'rsud_gambiran': 'RSUD Gambiran', 'rsia_melinda': 'RSIA Melinda', 'rs_bhayangkara': 'RS Bhayangkara' };
        const hospitalName = hospitalNames[visitLocation] || 'SIMRS';

        console.log('[Import] Auto-import:', patientName, visitLocation);

        // Show loading (no buttons, just spinner)
        if (window.Swal) {
            Swal.fire({
                title: hospitalName,
                html: `Mengimport <b>${patientName || 'data'}</b>...`,
                allowOutsideClick: false,
                allowEscapeKey: false,
                showConfirmButton: false,
                didOpen: () => Swal.showLoading()
            });
        }

        const token = getAuthToken();
        let patientId = null;

        // Search patient by name
        if (patientName) {
            const res = await fetch(`/api/patients?search=${encodeURIComponent(patientName)}&limit=10`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const result = await res.json();
            if (result.success && result.data) {
                const patients = result.data.patients || result.data;
                // Exact match or single result
                const exact = patients.find(p => (p.full_name || p.name || '').toLowerCase().trim() === patientName.toLowerCase().trim());
                patientId = exact ? (exact.id || exact.patient_id) : (patients.length === 1 ? (patients[0].id || patients[0].patient_id) : null);
            }
        }

        // If no match, show simple selector (minimal UI)
        if (!patientId) {
            if (window.Swal) Swal.close();
            patientId = await showQuickPatientSelector(patientName, hospitalName);
            if (!patientId) return; // User cancelled
        }

        // Create MR directly
        const mrRes = await fetch('/api/sunday-clinic/start-walk-in', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ patient_id: patientId, category, location: visitLocation, import_source: data.source })
        });
        const mrResult = await mrRes.json();

        if (!mrResult.success) throw new Error(mrResult.message || 'Gagal membuat MR');

        // mrId can be at top level or nested in data
        const mrId = mrResult.mrId || mrResult.mr_id || mrResult.data?.mrId || mrResult.data?.mr_id;
        sessionStorage.setItem('simrs_import_data', JSON.stringify(data));
        sessionStorage.setItem('simrs_import_mr_id', mrId);

        // Navigate directly - no confirmation
        if (window.Swal) Swal.close();
        window.location.href = `/sunday-clinic/${mrId.toLowerCase()}/anamnesa`;

    } catch (e) {
        console.error('[Import] Error:', e);
        if (window.Swal) Swal.fire({ icon: 'error', title: 'Error', text: e.message, timer: 3000 });
    }
}

/**
 * Quick patient selector - minimal UI, just a dropdown
 */
async function showQuickPatientSelector(searchName, hospitalName) {
    const token = getAuthToken();
    let options = '';
    try {
        const res = await fetch('/api/patients?limit=500', { headers: { 'Authorization': `Bearer ${token}` } });
        const result = await res.json();
        if (result.success && result.data) {
            (result.data.patients || result.data).forEach(p => {
                options += `<option value="${p.id || p.patient_id}">${p.full_name || p.name}</option>`;
            });
        }
    } catch (e) { console.error(e); }

    const result = await Swal.fire({
        title: hospitalName,
        html: `<p class="mb-2">Pasien "${searchName || 'Unknown'}" tidak ditemukan.</p>
               <select id="quick-patient" class="swal2-select">${options}</select>`,
        confirmButtonText: 'Import',
        showCancelButton: true,
        cancelButtonText: 'Batal',
        preConfirm: () => document.getElementById('quick-patient')?.value
    });

    return result.isConfirmed ? result.value : null;
}

// -------------------- BOOT --------------------
function initMain() {
    initPages();
    startClock();
    bindBasics();
    bindSundayClinicLauncher();
    initMedicalExam(); // Initialize medical examination pages
    initArticleMarkdownPreview(); // Initialize Markdown preview for article editor

    // Check for import data from Chrome extension (SIMRS Gambiran/Melinda)
    checkExtensionImportData();

    onAuthStateChanged(initializeApp);
    
    // Set up global debug function for appointments
    window.debugAppointments = function() {
        console.log('🔧 [DEBUG] ===== APPOINTMENTS DEBUG (Global) =====');
        
        // Basic checks that don't require the module
        const btn = document.getElementById('btn-add-appointment');
        const modal = document.getElementById('appointment-modal');
        const appointmentsPage = document.getElementById('appointments-page');
        
        console.log('🔧 [DEBUG] Basic DOM checks:');
        console.log('  - Button exists?', !!btn);
        console.log('  - Modal exists?', !!modal);
        console.log('  - Appointments page exists?', !!appointmentsPage);
        console.log('  - Appointments page visible?', appointmentsPage && !appointmentsPage.classList.contains('d-none'));
        console.log('  - window.openNewAppointment type:', typeof window.openNewAppointment);
        console.log('  - jQuery available?', typeof $ !== 'undefined');
        console.log('  - Bootstrap modal available?', typeof $ !== 'undefined' && $.fn.modal);
        
        if (btn) {
            console.log('🔧 [DEBUG] Button details:');
            console.log('  - ID:', btn.id);
            console.log('  - Text:', btn.textContent);
            console.log('  - onclick:', btn.onclick);
            console.log('  - parent:', btn.parentNode);
            console.log('  - disabled?', btn.disabled);
            console.log('  - style.display:', btn.style.display);
            console.log('  - style.visibility:', btn.style.visibility);
            console.log('  - computed style:', window.getComputedStyle(btn).display);
            
            // Check for event listeners (if possible)
            console.log('🔧 [DEBUG] Trying to check event listeners...');
            try {
                const listeners = typeof getEventListeners !== 'undefined' ? getEventListeners(btn) : 'getEventListeners not available (Chrome DevTools)';
                console.log('  - Event listeners:', listeners);
            } catch (e) {
                console.log('  - Cannot check event listeners (use Chrome DevTools)');
            }
        }
        
        // If the module is loaded, try to call openNewAppointment
        if (typeof window.openNewAppointment === 'function') {
            console.log('🔧 [DEBUG] Module appears to be loaded (window.openNewAppointment exists)');
            console.log('🔧 [DEBUG] Attempting to manually trigger modal...');
            try {
                window.openNewAppointment();
            } catch (err) {
                console.error('❌ [DEBUG] Error calling openNewAppointment:', err);
            }
        } else {
            console.warn('⚠️ [DEBUG] Appointments module not loaded yet');
            console.warn('⚠️ [DEBUG] Navigate to the appointments page first, then try again');
        }
        
        console.log('🔧 [DEBUG] ===== END DEBUG (Global) =====');
        
        return {
            buttonExists: !!btn,
            modalExists: !!modal,
            pageExists: !!appointmentsPage,
            pageVisible: appointmentsPage && !appointmentsPage.classList.contains('d-none'),
            functionExists: typeof window.openNewAppointment === 'function',
            jqueryExists: typeof $ !== 'undefined'
        };
    };
    
    // Default landing: Dashboard
    showDashboardPage();
}

// Auto-init if DOM is ready, otherwise wait
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMain);
} else {
    initMain();
}

// -------------------- START PATIENT VISIT (Walk-in) --------------------
async function startPatientVisit(patientId, patientName, location, category) {
    try {
        const token = getAuthToken();
        if (!token) {
            alert('Sesi login berakhir. Silakan login ulang.');
            return;
        }

        // Show loading state on button
        const btn = document.getElementById('btn-confirm-new-visit');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Memproses...';
        }

        // Call API to create walk-in visit
        const response = await fetch('/api/sunday-clinic/start-walk-in', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                patient_id: patientId,
                category: category,
                location: location
            })
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.message || 'Gagal memulai kunjungan');
        }

        if (!result.success || !result.data?.mrId) {
            throw new Error('Data rekam medis tidak lengkap');
        }

        // Update session with patient data
        try {
            const { updateSessionPatient } = await import('./session-manager.js');
            updateSessionPatient({
                id: patientId,
                patientId: patientId,
                name: patientName,
                sundayClinic: {
                    mrId: result.data.mrId,
                    status: result.data.status,
                    location: location
                }
            });
        } catch (sessionError) {
            console.warn('Unable to update session:', sessionError);
        }

        // Close the modal
        $('#patientDetailModal').modal('hide');

        // Redirect to Sunday Clinic page
        const mrSlug = String(result.data.mrId).toLowerCase();
        window.location.href = `/sunday-clinic/${mrSlug}/identitas`;

    } catch (error) {
        console.error('Error starting patient visit:', error);
        alert('Gagal memulai kunjungan: ' + error.message);

        // Reset button state
        const btn = document.getElementById('btn-confirm-new-visit');
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-play-circle mr-1"></i> Mulai Kunjungan';
        }
    }
}

// -------------------- PATIENT DETAIL MODAL --------------------
async function showPatientDetail(patientId) {
    try {
        const token = getAuthToken();
        console.log('=== showPatientDetail called ===');
        console.log('Patient ID:', patientId);
        console.log('Auth token exists:', !!token);

        // Try the web-patients endpoint first as it includes intake data
        let response = await fetch(`/api/admin/web-patients/${patientId}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        let patient, intake;

        if (response.ok) {
            // Web patient found (includes intake data)
            const data = await response.json();
            console.log('Patient data received from web-patients:', data);
            patient = data.data.patient;
            intake = data.data.intake;
        } else {
            // Try regular patients endpoint
            response = await fetch(`/api/patients/${patientId}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                console.error('Failed to load patient details, status:', response.status);
                throw new Error('Patient not found');
            }

            const data = await response.json();
            console.log('Patient data received from patients:', data);
            patient = data.data;

            // Try to fetch intake data - first by patient_id, then by phone
            intake = null;
            try {
                const intakeResponse = await fetch('/api/patient-intake', {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });

                if (intakeResponse.ok) {
                    const intakeData = await intakeResponse.json();

                    // Priority 1: Match by patient_id (most reliable)
                    let matchingIntake = intakeData.data?.find(submission =>
                        submission.patient_id === patientId
                    );

                    // Priority 2: Match by phone number (fallback for legacy data)
                    if (!matchingIntake && (patient.whatsapp || patient.phone)) {
                        const phoneToSearch = patient.whatsapp || patient.phone;
                        const normalizedPatientPhone = phoneToSearch.replace(/\D/g, '').slice(-10);
                        matchingIntake = intakeData.data?.find(submission => {
                            const submissionPhone = submission.phone?.replace(/\D/g, '').slice(-10);
                            return submissionPhone === normalizedPatientPhone;
                        });
                    }

                    if (matchingIntake) {
                        intake = {
                            submissionId: matchingIntake.submission_id,
                            quickId: matchingIntake.quick_id,
                            payload: typeof matchingIntake.payload === 'string' ? JSON.parse(matchingIntake.payload) : matchingIntake.payload,
                            status: matchingIntake.status,
                            highRisk: matchingIntake.high_risk,
                            createdAt: matchingIntake.created_at,
                            updatedAt: matchingIntake.updated_at
                        };
                    }
                }
            } catch (intakeError) {
                console.warn('Failed to fetch intake data:', intakeError);
            }
        }
        
        console.log('Final intake data:', intake);

        // Fetch patient's medical records (visit history)
        let patientVisits = [];
        try {
            const visitsResponse = await fetch(`/api/sunday-clinic/patient-visits/${patientId}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            if (visitsResponse.ok) {
                const visitsData = await visitsResponse.json();
                patientVisits = visitsData.data || [];
                console.log('Patient visits loaded:', patientVisits.length);
            }
        } catch (visitsError) {
            console.warn('Failed to fetch patient visits:', visitsError);
        }

        // Build visits table HTML
        const categoryLabels = {
            'obstetri': '<span class="badge badge-info"><i class="fas fa-baby mr-1"></i>Obstetri</span>',
            'gyn_repro': '<span class="badge badge-success"><i class="fas fa-venus mr-1"></i>Reproduksi</span>',
            'gyn_special': '<span class="badge badge-warning"><i class="fas fa-microscope mr-1"></i>Ginekologi</span>'
        };
        const statusLabels = {
            'draft': '<span class="badge badge-secondary">Draft</span>',
            'in_progress': '<span class="badge badge-primary">Dalam Proses</span>',
            'finalized': '<span class="badge badge-success">Selesai</span>',
            'billed': '<span class="badge badge-info">Sudah Billing</span>'
        };

        // Check if user is dokter/superadmin for delete button
        // Decode JWT token directly to get user info (most reliable method)
        let isDokter = false;
        try {
            const token = getAuthToken();
            if (token) {
                const payload = JSON.parse(atob(token.split('.')[1]));
                isDokter = payload.is_superadmin || payload.role === 'dokter' || payload.role === 'superadmin';
                console.log('[Patient Detail] JWT payload:', { role: payload.role, is_superadmin: payload.is_superadmin, isDokter });
            }
        } catch (e) {
            console.warn('[Patient Detail] Could not decode token:', e);
            // Fallback to auth.currentUser
            const staffUser = auth.currentUser || window.currentStaffUser;
            isDokter = staffUser?.is_superadmin || staffUser?.role === 'dokter' || staffUser?.role === 'superadmin';
        }

        let visitsTableHtml = '';
        if (patientVisits.length > 0) {
            const visitsRows = patientVisits.map(visit => {
                const visitDate = new Date(visit.visit_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
                const isFinalized = visit.status === 'finalized';
                const btnClass = isFinalized ? 'btn-outline-danger' : 'btn-danger';
                const btnTitle = isFinalized ? 'Hapus (Finalized - konfirmasi ekstra)' : 'Hapus Rekam Medis';

                return `<tr>
                    <td><code>${visit.mr_id}</code></td>
                    <td>${visitDate}</td>
                    <td><small>${visit.location_short || visit.visit_location}</small></td>
                    <td>${categoryLabels[visit.mr_category] || visit.mr_category || '-'}</td>
                    <td>${statusLabels[visit.status] || visit.status || '-'}</td>
                    <td class="text-center">
                        <a href="/sunday-clinic/${visit.mr_id.toLowerCase()}/identitas" class="btn btn-xs btn-info" title="Buka Rekam Medis">
                            <i class="fas fa-external-link-alt"></i>
                        </a>
                        <button class="btn btn-xs ${btnClass} ml-1" onclick="deleteMedicalRecord('${visit.mr_id}', ${isFinalized})" title="${btnTitle}">
                            <i class="fas fa-trash"></i>
                        </button>
                    </td>
                </tr>`;
            }).join('');

            visitsTableHtml = `<div class="table-responsive">
                <table class="table table-hover table-striped mb-0">
                    <thead class="thead-light">
                        <tr>
                            <th>MR ID</th>
                            <th>Tanggal Kunjungan</th>
                            <th>Lokasi</th>
                            <th>Kategori</th>
                            <th>Status</th>
                            <th class="text-center">Aksi</th>
                        </tr>
                    </thead>
                    <tbody>${visitsRows}</tbody>
                </table>
            </div>`;
        } else {
            visitsTableHtml = `<div class="text-center py-4 text-muted">
                <i class="fas fa-folder-open fa-3x mb-3"></i>
                <p class="mb-0">Belum ada rekam medis</p>
            </div>`;
        }

        // Normalize patient data structure (handle differences between endpoints)
        const normalizedPatient = {
            id: patient.id,
            fullname: patient.fullname || patient.full_name,
            email: patient.email,
            phone: patient.phone || patient.whatsapp,
            birth_date: patient.birth_date,
            age: patient.age,
            photo_url: patient.photo_url,
            google_id: patient.google_id,
            profile_completed: patient.profile_completed,
            status: patient.status,
            registration_date: patient.registration_date || patient.created_at,
            updated_at: patient.updated_at
        };
        
        // Create modal for patient details
        const modal = `
            <div class="modal fade" id="patientDetailModal" tabindex="-1" role="dialog">
                <div class="modal-dialog modal-xl" role="document">
                    <div class="modal-content">
                        <div class="modal-header bg-info">
                            <h4 class="modal-title">
                                <i class="fas fa-user-circle"></i> Detail Pasien
                            </h4>
                            <button type="button" class="close" data-dismiss="modal">&times;</button>
                        </div>
                        <div class="modal-body">
                            <div class="row">
                                <div class="col-md-6">
                                    <table class="table table-bordered">
                                        <tr>
                                            <th width="40%">ID Pasien</th>
                                            <td>${normalizedPatient.id}</td>
                                        </tr>
                                        <tr>
                                            <th>Nama Lengkap</th>
                                            <td><strong>${normalizedPatient.fullname}</strong></td>
                                        </tr>
                                        <tr>
                                            <th>Email</th>
                                            <td>${normalizedPatient.email}</td>
                                        </tr>
                                        <tr>
                                            <th>Telepon</th>
                                            <td>${normalizedPatient.phone || '-'}</td>
                                        </tr>
                                        <tr>
                                            <th>Tanggal Lahir</th>
                                            <td>${normalizedPatient.birth_date ? new Date(normalizedPatient.birth_date).toLocaleDateString('id-ID', {year: 'numeric', month: 'long', day: 'numeric'}) : '-'}</td>
                                        </tr>
                                        <tr>
                                            <th>Usia</th>
                                            <td>${normalizedPatient.age || '-'} tahun</td>
                                        </tr>
                                    </table>
                                </div>
                                <div class="col-md-6">
                                    <table class="table table-bordered">
                                        <tr>
                                            <th width="40%">Foto Profil</th>
                                            <td>
                                                ${normalizedPatient.photo_url ? 
                                                    `<img src="${normalizedPatient.photo_url}" alt="Photo" style="max-width: 100px; border-radius: 50%;">` : 
                                                    '<span class="text-muted">Tidak ada foto</span>'}
                                            </td>
                                        </tr>
                                        <tr>
                                            <th>Google ID</th>
                                            <td>${normalizedPatient.google_id || '<span class="text-muted">Email registration</span>'}</td>
                                        </tr>
                                        <tr>
                                            <th>Profil Lengkap</th>
                                            <td>${normalizedPatient.profile_completed ? 
                                                '<span class="badge badge-success"><i class="fas fa-check"></i> Ya</span>' : 
                                                '<span class="badge badge-warning"><i class="fas fa-times"></i> Belum</span>'}</td>
                                        </tr>
                                        <tr>
                                            <th>Status</th>
                                            <td>${normalizedPatient.status === 'active' ? 
                                                '<span class="badge badge-success">Aktif</span>' : 
                                                '<span class="badge badge-secondary">Nonaktif</span>'}</td>
                                        </tr>
                                        <tr>
                                            <th>Tgl Registrasi</th>
                                            <td>${normalizedPatient.registration_date ? new Date(normalizedPatient.registration_date).toLocaleString('id-ID', {
                                                year: 'numeric', month: 'long', day: 'numeric',
                                                hour: '2-digit', minute: '2-digit'
                                            }) : '-'}</td>
                                        </tr>
                                        <tr>
                                            <th>Terakhir Update</th>
                                            <td>${normalizedPatient.updated_at ? new Date(normalizedPatient.updated_at).toLocaleString('id-ID', {
                                                year: 'numeric', month: 'long', day: 'numeric',
                                                hour: '2-digit', minute: '2-digit'
                                            }) : '-'}</td>
                                        </tr>
                                    </table>
                                </div>
                            </div>
                            
                            ${intake ? `
                            <hr>
                            <h5 class="mb-3">
                                <i class="fas fa-file-medical"></i> Formulir Rekam Medis Awal
                                <span class="badge badge-${intake.highRisk ? 'danger' : 'success'} ml-2">
                                    ${intake.highRisk ? 'High Risk' : 'Normal'}
                                </span>
                            </h5>
                            <div class="row">
                                <div class="col-md-6">
                                    <h6 class="text-primary"><i class="fas fa-user"></i> Data Pribadi</h6>
                                    <table class="table table-sm table-bordered">
                                        <tr><th width="40%">Nama Lengkap</th><td>${intake.payload.full_name || '-'}</td></tr>
                                        <tr><th>Tanggal Lahir</th><td>${intake.payload.dob ? new Date(intake.payload.dob).toLocaleDateString('id-ID', {day: 'numeric', month: 'long', year: 'numeric'}) : '-'}</td></tr>
                                        <tr><th>Usia</th><td>${intake.payload.age || '-'} tahun</td></tr>
                                        <tr><th>Tinggi Badan</th><td>${intake.payload.height ? intake.payload.height + ' cm' : '-'}</td></tr>
                                        <tr><th>Telepon</th><td>${intake.payload.phone || '-'}</td></tr>
                                        <tr><th>Kontak Darurat</th><td>${intake.payload.emergency_contact || '-'}</td></tr>
                                        <tr><th>Alamat</th><td>${intake.payload.address || '-'}</td></tr>
                                        <tr><th>Pekerjaan</th><td>${intake.payload.occupation || '-'}</td></tr>
                                        <tr><th>Pendidikan</th><td>${intake.payload.education || '-'}</td></tr>
                                        <tr><th>Status Pernikahan</th><td>${intake.payload.marital_status || '-'}</td></tr>
                                        ${intake.payload.marital_status === 'Menikah' || intake.payload.marital_status === 'menikah' ? `
                                        <tr><th>Nama Suami</th><td>${intake.payload.husband_name || '-'}</td></tr>
                                        <tr><th>Usia Suami</th><td>${intake.payload.husband_age ? intake.payload.husband_age + ' tahun' : '-'}</td></tr>
                                        <tr><th>Pekerjaan Suami</th><td>${intake.payload.husband_job || '-'}</td></tr>
                                        ` : ''}
                                        <tr><th>Metode Pembayaran</th><td>${Array.isArray(intake.payload.payment_method) ? intake.payload.payment_method.join(', ').toUpperCase() : (intake.payload.payment_method || '-').toUpperCase()}</td></tr>
                                        ${intake.payload.insurance_name ? `<tr><th>Nama Asuransi</th><td>${intake.payload.insurance_name}</td></tr>` : ''}
                                    </table>
                                </div>
                                <div class="col-md-6">
                                    <h6 class="text-primary"><i class="fas fa-heartbeat"></i> Data Medis</h6>
                                    <table class="table table-sm table-bordered">
                                        <tr><th width="40%">Golongan Darah</th><td>${intake.payload.blood_type || '-'}</td></tr>
                                        <tr><th>Rhesus</th><td>${intake.payload.rhesus || '-'}</td></tr>
                                        <tr><th>Alergi Obat</th><td>${intake.payload.allergy_drugs || intake.payload.drug_allergies || '-'}</td></tr>
                                        <tr><th>Alergi Makanan</th><td>${intake.payload.allergy_food || intake.payload.food_allergies || '-'}</td></tr>
                                        <tr><th>Alergi Lingkungan</th><td>${intake.payload.allergy_env || intake.payload.other_allergies || '-'}</td></tr>
                                        <tr><th>Riwayat Penyakit</th><td>${intake.payload.past_conditions || '-'} ${intake.payload.past_conditions_detail ? '(' + intake.payload.past_conditions_detail + ')' : ''}</td></tr>
                                        <tr><th>Riwayat Keluarga</th><td>${intake.payload.family_history || '-'} ${intake.payload.family_history_detail ? '(' + intake.payload.family_history_detail + ')' : ''}</td></tr>
                                    </table>

                                    ${intake.payload.has_children === 'ya' ? `
                                    <h6 class="text-primary mt-3"><i class="fas fa-baby"></i> Data Riwayat Kehamilan</h6>
                                    <table class="table table-sm table-bordered">
                                        <tr><th width="40%">Jumlah Anak Hidup</th><td>${intake.payload.living_children_count || '0'}</td></tr>
                                        <tr><th>Usia Anak Terkecil</th><td>${intake.payload.youngest_child_age ? intake.payload.youngest_child_age + ' tahun' : '-'}</td></tr>
                                        <tr><th>Jumlah Kehamilan</th><td>${intake.payload.total_pregnancies || intake.payload.gravida || '0'}</td></tr>
                                        <tr><th>Persalinan Normal</th><td>${intake.payload.normal_delivery_count || '0'}x</td></tr>
                                        <tr><th>Persalinan Sesar</th><td>${intake.payload.cesarean_delivery_count || '0'}x</td></tr>
                                        <tr><th>Keguguran</th><td>${intake.payload.miscarriage_count || '0'}x</td></tr>
                                        <tr><th>Hamil di Luar Kandungan</th><td>${intake.payload.had_ectopic === 'ya' ? '<span class="text-danger">Ya, pernah</span>' : 'Tidak pernah'}</td></tr>
                                    </table>
                                    ` : `
                                    <h6 class="text-primary mt-3"><i class="fas fa-baby"></i> Data Obstetri</h6>
                                    <table class="table table-sm table-bordered">
                                        <tr><th width="40%">Status</th><td>${intake.payload.has_children === 'tidak' ? 'Belum punya anak' : (intake.payload.marital_status !== 'menikah' ? 'Belum menikah' : '-')}</td></tr>
                                    </table>
                                    `}
                                </div>
                            </div>
                            ${(intake.payload.med_name_1 || intake.payload.med_name_2 || intake.payload.med_name_3) ? `
                            <div class="mt-2">
                                <strong><i class="fas fa-pills"></i> Obat yang Dikonsumsi:</strong>
                                <ul class="mb-0">
                                    ${intake.payload.med_name_1 ? `<li>${intake.payload.med_name_1} ${intake.payload.med_dose_1 ? '- ' + intake.payload.med_dose_1 : ''} ${intake.payload.med_freq_1 ? '(' + intake.payload.med_freq_1 + ')' : ''}</li>` : ''}
                                    ${intake.payload.med_name_2 ? `<li>${intake.payload.med_name_2} ${intake.payload.med_dose_2 ? '- ' + intake.payload.med_dose_2 : ''} ${intake.payload.med_freq_2 ? '(' + intake.payload.med_freq_2 + ')' : ''}</li>` : ''}
                                    ${intake.payload.med_name_3 ? `<li>${intake.payload.med_name_3} ${intake.payload.med_dose_3 ? '- ' + intake.payload.med_dose_3 : ''} ${intake.payload.med_freq_3 ? '(' + intake.payload.med_freq_3 + ')' : ''}</li>` : ''}
                                </ul>
                            </div>
                            ` : ''}
                            <div class="mt-2 text-muted small">
                                <i class="far fa-clock"></i> Diisi: ${new Date(intake.createdAt).toLocaleString('id-ID')}
                                ${intake.updatedAt ? ` | Diperbarui: ${new Date(intake.updatedAt).toLocaleString('id-ID')}` : ''}
                                <span class="badge badge-${intake.status === 'verified' ? 'success' : 'warning'} ml-2">${intake.status}</span>
                            </div>
                            ` : '<div class="alert alert-info"><i class="fas fa-info-circle"></i> Belum ada formulir rekam medis awal</div>'}

                            <hr>
                            <div class="card card-primary card-outline">
                                <div class="card-header d-flex justify-content-between align-items-center">
                                    <h5 class="card-title mb-0">
                                        <i class="fas fa-file-medical"></i> Daftar Rekam Medis
                                    </h5>
                                    <button type="button" class="btn btn-primary btn-sm" id="btn-new-visit" data-patient-id="${normalizedPatient.id}" data-patient-name="${normalizedPatient.fullname}">
                                        <i class="fas fa-plus mr-1"></i> Kunjungan Baru
                                    </button>
                                </div>
                                <div class="card-body p-0">
                                    ${visitsTableHtml}
                                </div>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-dismiss="modal">Tutup</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Remove existing modal if any (aggressive cleanup)
        $('#patientDetailModal').modal('hide');
        $('#patientDetailModal').remove();
        $('.modal-backdrop').remove();
        $('body').removeClass('modal-open');

        // Add and show modal
        $('body').append(modal);
        $('#patientDetailModal').modal('show');

        // Bind event for "Kunjungan Baru" button
        document.getElementById('btn-new-visit')?.addEventListener('click', function() {
            const patientId = this.dataset.patientId;
            const patientName = this.dataset.patientName;

            // Show new visit modal with location/category selection
            showNewVisitModal(patientId, patientName);
        });

        // Clean up modal after close
        $('#patientDetailModal').on('hidden.bs.modal', function () {
            $(this).remove();
        });

    } catch (error) {
        console.error('Error viewing patient detail:', error);
        console.error('Error stack:', error.stack);
        alert('Gagal memuat detail pasien: ' + error.message);
    }
}

/**
 * Show modal to select location and category for new visit
 * Checks for existing draft/in_progress records first
 */
async function showNewVisitModal(patientId, patientName) {
    const token = getAuthToken();

    // Check for existing draft/in_progress records
    let pendingRecords = [];
    try {
        const response = await fetch(`/api/sunday-clinic/patient-visits/${patientId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
            const data = await response.json();
            pendingRecords = (data.data || []).filter(v => v.status === 'draft' || v.status === 'in_progress');
        }
    } catch (err) {
        console.warn('Failed to check existing records:', err);
    }

    // If there are pending records, show warning first
    if (pendingRecords.length > 0) {
        const categoryLabels = {
            'obstetri': 'Obstetri',
            'gyn_repro': 'Reproduksi',
            'gyn_special': 'Ginekologi'
        };

        const pendingList = pendingRecords.map(r => {
            const date = new Date(r.visit_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
            return `<tr>
                <td><code>${r.mr_id}</code></td>
                <td>${date}</td>
                <td>${r.location_short || r.visit_location}</td>
                <td>${categoryLabels[r.mr_category] || r.mr_category}</td>
                <td>
                    <a href="/sunday-clinic/${r.mr_id.toLowerCase()}/identitas" class="btn btn-sm btn-success">
                        <i class="fas fa-arrow-right mr-1"></i>Lanjutkan
                    </a>
                </td>
            </tr>`;
        }).join('');

        const warningHtml = `
            <div class="modal fade" id="pendingRecordsModal" tabindex="-1" role="dialog">
                <div class="modal-dialog modal-lg" role="document">
                    <div class="modal-content">
                        <div class="modal-header bg-warning">
                            <h5 class="modal-title">
                                <i class="fas fa-exclamation-triangle mr-2"></i>Rekam Medis Belum Selesai
                            </h5>
                            <button type="button" class="close" data-dismiss="modal">&times;</button>
                        </div>
                        <div class="modal-body">
                            <p>Pasien <strong>${patientName}</strong> memiliki ${pendingRecords.length} rekam medis yang belum selesai:</p>
                            <div class="table-responsive">
                                <table class="table table-sm table-bordered">
                                    <thead class="thead-light">
                                        <tr>
                                            <th>MR ID</th>
                                            <th>Tanggal</th>
                                            <th>Lokasi</th>
                                            <th>Kategori</th>
                                            <th>Aksi</th>
                                        </tr>
                                    </thead>
                                    <tbody>${pendingList}</tbody>
                                </table>
                            </div>
                            <div class="alert alert-info mt-3 mb-0">
                                <i class="fas fa-info-circle mr-2"></i>
                                Disarankan untuk melanjutkan rekam medis yang sudah ada daripada membuat baru.
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-dismiss="modal">Tutup</button>
                            <button type="button" class="btn btn-warning" id="btn-force-new-visit">
                                <i class="fas fa-plus mr-1"></i>Tetap Buat Baru
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        $('#pendingRecordsModal').remove();
        $('body').append(warningHtml);
        $('#pendingRecordsModal').modal('show');

        // Handle "Tetap Buat Baru" button
        document.getElementById('btn-force-new-visit')?.addEventListener('click', function() {
            $('#pendingRecordsModal').modal('hide');
            showNewVisitForm(patientId, patientName);
        });

        $('#pendingRecordsModal').on('hidden.bs.modal', function() {
            $(this).remove();
        });

        return;
    }

    // No pending records, show the form directly
    showNewVisitForm(patientId, patientName);
}

/**
 * Show the new visit form (location/category selection)
 */
function showNewVisitForm(patientId, patientName) {
    const modalHtml = `
        <div class="modal fade" id="newVisitModal" tabindex="-1" role="dialog">
            <div class="modal-dialog" role="document">
                <div class="modal-content">
                    <div class="modal-header bg-primary text-white">
                        <h5 class="modal-title">
                            <i class="fas fa-plus-circle mr-2"></i>Kunjungan Baru
                        </h5>
                        <button type="button" class="close text-white" data-dismiss="modal">&times;</button>
                    </div>
                    <div class="modal-body">
                        <p class="mb-2">Pasien: <strong>${patientName}</strong></p>
                        <div class="alert alert-warning py-2 mb-3" style="font-size: 13px;">
                            <i class="fas fa-info-circle mr-1"></i>
                            Hanya untuk pasien yang <strong>tidak</strong> mendaftar melalui website/aplikasi
                        </div>
                        <div class="form-group">
                            <label class="font-weight-bold mb-2">Lokasi Kunjungan:</label>
                            <div class="location-options">
                                <label class="d-block mb-2">
                                    <input type="radio" name="new_visit_location" value="klinik_private" checked>
                                    <span class="ml-2"><i class="fas fa-clinic-medical text-primary mr-1"></i> Klinik Private</span>
                                </label>
                                <label class="d-block mb-2">
                                    <input type="radio" name="new_visit_location" value="rsia_melinda">
                                    <span class="ml-2"><i class="fas fa-hospital mr-1" style="color:#e91e63"></i> RSIA Melinda</span>
                                </label>
                                <label class="d-block mb-2">
                                    <input type="radio" name="new_visit_location" value="rsud_gambiran">
                                    <span class="ml-2"><i class="fas fa-hospital text-info mr-1"></i> RSUD Gambiran</span>
                                </label>
                                <label class="d-block mb-2">
                                    <input type="radio" name="new_visit_location" value="rs_bhayangkara">
                                    <span class="ml-2"><i class="fas fa-hospital text-success mr-1"></i> RS Bhayangkara</span>
                                </label>
                            </div>
                        </div>
                        <div class="form-group">
                            <label class="font-weight-bold mb-2">Kategori Konsultasi:</label>
                            <div class="category-options">
                                <label class="d-block mb-2">
                                    <input type="radio" name="new_visit_category" value="obstetri" checked>
                                    <span class="ml-2"><i class="fas fa-baby text-info mr-1"></i> <strong>Obstetri</strong> - Kehamilan</span>
                                </label>
                                <label class="d-block mb-2">
                                    <input type="radio" name="new_visit_category" value="gyn_repro">
                                    <span class="ml-2"><i class="fas fa-venus text-success mr-1"></i> <strong>Reproduksi</strong> - Program Hamil, KB</span>
                                </label>
                                <label class="d-block mb-2">
                                    <input type="radio" name="new_visit_category" value="gyn_special">
                                    <span class="ml-2"><i class="fas fa-microscope text-warning mr-1"></i> <strong>Ginekologi</strong> - Kista, Miom</span>
                                </label>
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-dismiss="modal">Batal</button>
                        <button type="button" class="btn btn-primary" id="btn-confirm-new-visit">
                            <i class="fas fa-play-circle mr-1"></i> Mulai Kunjungan
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Remove existing modal if any
    $('#newVisitModal').remove();
    $('body').append(modalHtml);
    $('#newVisitModal').modal('show');

    // Bind confirm button
    document.getElementById('btn-confirm-new-visit')?.addEventListener('click', async function() {
        const location = document.querySelector('input[name="new_visit_location"]:checked')?.value || 'klinik_private';
        const category = document.querySelector('input[name="new_visit_category"]:checked')?.value || 'obstetri';

        // Close this modal
        $('#newVisitModal').modal('hide');

        // Start the visit
        await startPatientVisit(patientId, patientName, location, category);
    });

    // Clean up modal after close
    $('#newVisitModal').on('hidden.bs.modal', function() {
        $(this).remove();
    });
}

/**
 * Show SIMRS import modal with parsed data preview
 * Supports multiple hospital sources: SIMRS Melinda, RSUD Gambiran, etc.
 */
function showSimrsImportModal(data) {
    // API returns { raw_parsed: {...}, template: {...}, visit_date, visit_time, source, ... }
    // Use raw_parsed for detailed SOAP data
    const parsed = data.raw_parsed || data;
    const template = data.template || {};

    const identity = parsed.identity || template.identity || {};
    const subjective = parsed.subjective || template.subjective || {};
    const objective = parsed.objective || template.objective || {};
    const assessment = parsed.assessment || template.assessment || {};
    const plan = parsed.plan || template.plan || {};

    // Extract visit date/time from response
    const visitDate = data.visit_date || null;
    const visitTime = data.visit_time || null;

    // Detect source hospital
    const source = data.source || 'simrs_melinda';
    const hospitalNames = {
        'simrs_melinda': 'SIMRS Melinda',
        'rsud_gambiran': 'RSUD Gambiran',
        'rs_bhayangkara': 'RS Bhayangkara'
    };
    const hospitalName = hospitalNames[source] || 'SIMRS';

    console.log('[Import Modal] Raw data:', data);
    console.log('[Import Modal] Source:', source, '-> Hospital:', hospitalName);
    console.log('[Import Modal] Parsed:', { identity, subjective, objective, assessment, plan });
    console.log('[Import Modal] Visit date/time:', visitDate, visitTime);

    // Format visit date for display
    let visitDateDisplay = 'Tidak terdeteksi';
    if (visitDate) {
        const dateObj = new Date(visitDate);
        visitDateDisplay = dateObj.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        if (visitTime) {
            visitDateDisplay += ` pukul ${visitTime}`;
        }
    }

    // Format medications list
    const obatList = (plan.obat || []).map(o => `<li>${o}</li>`).join('') || '<li class="text-muted">Tidak ada</li>';

    const modalHtml = `
        <div class="modal fade" id="simrsImportModal" tabindex="-1" role="dialog">
            <div class="modal-dialog modal-xl" role="document">
                <div class="modal-content">
                    <div class="modal-header bg-primary text-white">
                        <h5 class="modal-title">
                            <i class="fas fa-file-import mr-2"></i>
                            Data Import dari ${hospitalName}
                        </h5>
                        <button type="button" class="close text-white" data-dismiss="modal">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="alert alert-info">
                            <i class="fas fa-info-circle mr-2"></i>
                            Data rekam medis berhasil di-import dari ${hospitalName}. Review data di bawah ini.
                        </div>
                        <div class="alert alert-warning">
                            <i class="fas fa-calendar-alt mr-2"></i>
                            <strong>Tanggal Kunjungan:</strong> ${visitDateDisplay}
                            ${visitDate ? '<span class="badge badge-success ml-2">Terdeteksi otomatis</span>' : '<span class="badge badge-secondary ml-2">Akan menggunakan tanggal hari ini</span>'}
                            <input type="hidden" id="import-visit-date" value="${visitDate || ''}">
                            <input type="hidden" id="import-visit-time" value="${visitTime || ''}">
                        </div>

                        <div class="row">
                            <!-- Identity -->
                            <div class="col-md-6">
                                <div class="card card-outline card-primary mb-3">
                                    <div class="card-header py-2">
                                        <h6 class="mb-0"><i class="fas fa-user mr-2"></i>Identitas Pasien</h6>
                                    </div>
                                    <div class="card-body py-2">
                                        <table class="table table-sm table-borderless mb-0">
                                            <tr><th width="40%">Nama</th><td><strong>${identity.nama || '-'}</strong></td></tr>
                                            <tr><th>Tanggal Lahir</th><td>${identity.tanggal_lahir || '-'}</td></tr>
                                            <tr><th>Jenis Kelamin</th><td>${identity.jenis_kelamin || '-'}</td></tr>
                                            <tr><th>Alamat</th><td>${identity.alamat || '-'}</td></tr>
                                            <tr><th>No HP</th><td>${identity.no_hp || '-'}</td></tr>
                                            <tr><th>TB/BB</th><td>${identity.tinggi_badan || '-'} cm / ${identity.berat_badan || '-'} kg</td></tr>
                                        </table>
                                    </div>
                                </div>
                            </div>

                            <!-- Subjective -->
                            <div class="col-md-6">
                                <div class="card card-outline card-info mb-3">
                                    <div class="card-header py-2">
                                        <h6 class="mb-0"><i class="fas fa-comment-medical mr-2"></i>Subjective</h6>
                                    </div>
                                    <div class="card-body py-2">
                                        <table class="table table-sm table-borderless mb-0">
                                            <tr><th width="40%">Keluhan</th><td>${subjective.keluhan_utama || '-'}</td></tr>
                                            <tr><th>HPHT</th><td>${subjective.hpht || '-'}</td></tr>
                                            <tr><th>HPL</th><td>${subjective.hpl || '-'}</td></tr>
                                            <tr><th>RPD</th><td>${subjective.rpd || '-'}</td></tr>
                                        </table>
                                    </div>
                                </div>
                            </div>

                            <!-- Objective -->
                            <div class="col-md-6">
                                <div class="card card-outline card-success mb-3">
                                    <div class="card-header py-2">
                                        <h6 class="mb-0"><i class="fas fa-stethoscope mr-2"></i>Objective</h6>
                                    </div>
                                    <div class="card-body py-2">
                                        <table class="table table-sm table-borderless mb-0">
                                            <tr><th width="40%">K/U</th><td>${objective.keadaan_umum || '-'}</td></tr>
                                            <tr><th>Tensi</th><td>${objective.tensi || '-'}</td></tr>
                                            <tr><th>Nadi</th><td>${objective.nadi || '-'}</td></tr>
                                            <tr><th>Suhu</th><td>${objective.suhu || '-'}</td></tr>
                                            <tr><th>SpO2</th><td>${objective.spo2 || '-'}</td></tr>
                                        </table>
                                    </div>
                                </div>
                            </div>

                            <!-- Assessment -->
                            <div class="col-md-6">
                                <div class="card card-outline card-warning mb-3">
                                    <div class="card-header py-2">
                                        <h6 class="mb-0"><i class="fas fa-diagnoses mr-2"></i>Assessment</h6>
                                    </div>
                                    <div class="card-body py-2">
                                        <table class="table table-sm table-borderless mb-0">
                                            <tr><th width="40%">Diagnosis</th><td>${assessment.diagnosis || '-'}</td></tr>
                                            <tr><th>G/P</th><td>G${assessment.gravida || '-'} P${assessment.para || '-'}</td></tr>
                                            <tr><th>Usia Kehamilan</th><td>${assessment.usia_kehamilan || '-'}</td></tr>
                                        </table>
                                    </div>
                                </div>
                            </div>

                            <!-- Plan -->
                            <div class="col-12">
                                <div class="card card-outline card-danger mb-3">
                                    <div class="card-header py-2">
                                        <h6 class="mb-0"><i class="fas fa-prescription mr-2"></i>Plan / Obat</h6>
                                    </div>
                                    <div class="card-body py-2">
                                        <ul class="mb-0 pl-3">${obatList}</ul>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Patient Selection -->
                        <div class="card card-outline card-dark mt-3">
                            <div class="card-header py-2">
                                <h6 class="mb-0"><i class="fas fa-search mr-2"></i>Pilih Pasien untuk Import</h6>
                            </div>
                            <div class="card-body">
                                <div class="form-group mb-2">
                                    <div class="input-group">
                                        <input type="text" class="form-control" id="import-patient-search"
                                               placeholder="Cari nama pasien..." autocomplete="off">
                                        <div class="input-group-append">
                                            <button class="btn btn-outline-secondary" type="button" onclick="searchPatientForImport()">
                                                <i class="fas fa-search"></i>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                                <div id="import-patient-results" class="list-group" style="max-height: 200px; overflow-y: auto;"></div>
                                <div id="import-selected-patient" class="alert alert-success mt-2 d-none">
                                    <strong>Pasien terpilih:</strong> <span id="import-selected-name"></span>
                                    <input type="hidden" id="import-selected-id">
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-dismiss="modal">
                            <i class="fas fa-times mr-1"></i> Tutup
                        </button>
                        <button type="button" class="btn btn-success" id="btn-start-visit-import" onclick="startVisitWithImport()" disabled>
                            <i class="fas fa-file-import mr-1"></i> Import Rekam Medis
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Remove existing modal if any
    const existing = document.getElementById('simrsImportModal');
    if (existing) existing.remove();

    // Add modal to DOM
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    // Store import data globally for use when starting visit
    window._simrsImportData = data;

    // Bind enter key to search
    document.getElementById('import-patient-search').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            searchPatientForImport();
        }
    });

    // Show modal
    $('#simrsImportModal').modal('show');
}

/**
 * Navigate to patient management with import data ready
 */
function navigateToPatientWithImport() {
    $('#simrsImportModal').modal('hide');

    // Navigate to Kelola Pasien
    if (typeof showKelolaPasienPage === 'function') {
        showKelolaPasienPage();
    }

    // Show toast notification
    if (typeof showSuccess === 'function') {
        showSuccess('Data import tersedia. Gunakan tombol "Pasien Baru" atau cari pasien existing.');
    }
}

/**
 * Search patients for import selection
 */
async function searchPatientForImport() {
    const searchInput = document.getElementById('import-patient-search');
    const resultsDiv = document.getElementById('import-patient-results');
    const query = searchInput.value.trim();

    if (!query || query.length < 2) {
        resultsDiv.innerHTML = '<div class="text-muted p-2">Ketik minimal 2 karakter untuk mencari</div>';
        return;
    }

    resultsDiv.innerHTML = '<div class="text-center p-2"><i class="fas fa-spinner fa-spin"></i> Mencari...</div>';

    try {
        const token = getAuthToken();
        const response = await fetch(`/api/patients?search=${encodeURIComponent(query)}&limit=10`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) throw new Error('Search failed');

        const result = await response.json();
        const patients = result.data || result.patients || [];

        if (patients.length === 0) {
            resultsDiv.innerHTML = '<div class="text-muted p-2">Tidak ditemukan pasien dengan nama tersebut</div>';
            return;
        }

        resultsDiv.innerHTML = patients.map(p => `
            <a href="#" class="list-group-item list-group-item-action" onclick="selectPatientForImport('${p.id}', '${(p.full_name || p.fullname || p.name || '').replace(/'/g, "\\'")}'); return false;">
                <div class="d-flex justify-content-between align-items-center">
                    <div>
                        <strong>${p.full_name || p.fullname || p.name}</strong>
                        <small class="text-muted ml-2">${p.patient_id || p.id}</small>
                    </div>
                    <small class="text-muted">${p.whatsapp || p.phone || ''}</small>
                </div>
            </a>
        `).join('');

    } catch (error) {
        console.error('Search error:', error);
        resultsDiv.innerHTML = '<div class="text-danger p-2">Gagal mencari pasien</div>';
    }
}

/**
 * Select patient for import
 */
function selectPatientForImport(id, name) {
    document.getElementById('import-selected-id').value = id;
    document.getElementById('import-selected-name').textContent = name;
    document.getElementById('import-selected-patient').classList.remove('d-none');
    document.getElementById('import-patient-results').innerHTML = '';
    document.getElementById('import-patient-search').value = '';
    document.getElementById('btn-start-visit-import').disabled = false;
}

/**
 * Start visit with imported SOAP data (retrospective import)
 */
async function startVisitWithImport() {
    const patientId = document.getElementById('import-selected-id').value;
    const btn = document.getElementById('btn-start-visit-import');
    const visitDate = document.getElementById('import-visit-date')?.value || null;
    const visitTime = document.getElementById('import-visit-time')?.value || null;

    if (!patientId) {
        alert('Pilih pasien terlebih dahulu');
        return;
    }

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Memproses...';

    try {
        const token = getAuthToken();
        const importData = window._simrsImportData;

        // Build visit datetime for retrospective import
        let visitDateTime = null;
        if (visitDate) {
            visitDateTime = visitDate;
            if (visitTime) {
                visitDateTime += 'T' + visitTime + ':00';
            }
        }

        console.log('[Import] Creating retrospective visit:', { patientId, visitDateTime, visitDate, visitTime });

        // Create visit record using sunday-clinic start-walk-in API with retrospective date
        const visitResponse = await fetch('/api/sunday-clinic/start-walk-in', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                patient_id: patientId,
                category: 'obstetri',
                location: 'rsia_melinda',
                visit_date: visitDateTime,  // Pass retrospective date
                is_retrospective: !!visitDate  // Flag to indicate this is a past visit
            })
        });

        if (!visitResponse.ok) {
            const err = await visitResponse.json();
            throw new Error(err.message || 'Gagal membuat rekam medis');
        }

        const visitResult = await visitResponse.json();
        const mrId = visitResult.data?.mrId || visitResult.mrId;
        const drdCode = mrId;

        console.log('[Import] Medical record created:', { mrId, drdCode, visitDateTime });

        // Store import data for form filling
        sessionStorage.setItem('simrs_import_mr_id', mrId);
        sessionStorage.setItem('simrs_import_data', JSON.stringify(importData));

        // Close modal
        $('#simrsImportModal').modal('hide');

        // Show success message
        const dateMsg = visitDate ? ` (tanggal ${new Date(visitDate).toLocaleDateString('id-ID')})` : '';
        if (typeof showSuccess === 'function') {
            showSuccess(`Rekam medis ${drdCode} dibuat${dateMsg}! Mengisi data pemeriksaan...`);
        }

        // Navigate to Sunday Clinic page with the new MR ID
        setTimeout(() => {
            // Redirect to Sunday Clinic anamnesa page
            const mrSlug = mrId.toLowerCase();
            window.location.href = `/sunday-clinic/${mrSlug}/anamnesa`;
        }, 800);

    } catch (error) {
        console.error('Import error:', error);
        alert('Gagal: ' + error.message);
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-file-import mr-1"></i> Import Rekam Medis';
    }
}

/**
 * Fill anamnesa form from import data
 */
function fillAnamnesaFromImport(data) {
    const parsed = data.raw_parsed || data;
    const subjective = parsed.subjective || {};
    const assessment = parsed.assessment || {};

    console.log('[Import] Filling anamnesa with:', { subjective, assessment });

    // Try to fill form fields
    const fields = {
        'keluhan-utama': subjective.keluhan_utama,
        'keluhan_utama': subjective.keluhan_utama,
        'riwayat-penyakit-sekarang': subjective.rps,
        'rps': subjective.rps,
        'riwayat-penyakit-dahulu': subjective.rpd,
        'rpd': subjective.rpd,
        'hpht': subjective.hpht,
        'hpl': subjective.hpl,
        'gravida': assessment.gravida,
        'para': assessment.para,
        'usia-kehamilan': assessment.usia_kehamilan
    };

    for (const [fieldId, value] of Object.entries(fields)) {
        if (value) {
            const el = document.getElementById(fieldId) ||
                       document.querySelector(`[name="${fieldId}"]`) ||
                       document.querySelector(`[data-field="${fieldId}"]`);
            if (el) {
                el.value = value;
                el.dispatchEvent(new Event('change', { bubbles: true }));
                console.log(`[Import] Filled ${fieldId}:`, value);
            }
        }
    }

    if (typeof showSuccess === 'function') {
        showSuccess('Data anamnesa dari SIMRS berhasil diisi');
    }
}

window.showSimrsImportModal = showSimrsImportModal;
window.navigateToPatientWithImport = navigateToPatientWithImport;
window.searchPatientForImport = searchPatientForImport;
window.selectPatientForImport = selectPatientForImport;
window.startVisitWithImport = startVisitWithImport;
window.fillAnamnesaFromImport = fillAnamnesaFromImport;

/**
 * Delete a medical record (Dokter/Superadmin only)
 * @param {string} mrId - Medical record ID
 * @param {boolean} isFinalized - Whether the record is finalized (requires extra confirmation)
 */
async function deleteMedicalRecord(mrId, isFinalized = false) {
    let confirmMessage = `Apakah Anda yakin ingin menghapus rekam medis ${mrId}?\n\nData yang dihapus tidak dapat dikembalikan.`;

    if (isFinalized) {
        confirmMessage = `⚠️ PERINGATAN: Rekam medis ${mrId} sudah FINALIZED!\n\nMenghapus rekam medis yang sudah finalized akan menghapus semua data termasuk billing.\n\nApakah Anda YAKIN ingin melanjutkan?`;
    }

    if (!confirm(confirmMessage)) {
        return;
    }

    // Extra confirmation for finalized records
    if (isFinalized) {
        const extraConfirm = prompt(`Ketik "${mrId}" untuk konfirmasi penghapusan:`);
        if (extraConfirm !== mrId) {
            alert('Penghapusan dibatalkan - konfirmasi tidak cocok');
            return;
        }
    }

    try {
        const token = getAuthToken();
        const forceParam = isFinalized ? '?force=true' : '';
        const response = await fetch(`/api/sunday-clinic/records/${mrId}${forceParam}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        const result = await response.json();

        if (!response.ok) {
            if (response.status === 403) {
                alert('Hanya Dokter (Superadmin) yang dapat menghapus rekam medis.');
            } else {
                alert(result.message || 'Gagal menghapus rekam medis');
            }
            return;
        }

        alert(result.message || `Rekam medis ${mrId} berhasil dihapus`);

        // Remove the deleted row from any table showing this MR
        document.querySelectorAll(`button[onclick*="'${mrId}'"]`).forEach(btn => {
            const row = btn.closest('tr');
            if (row) {
                row.remove();
            }
        });

        // Update badge count if exists
        const badge = document.querySelector('#patientMRListModal .badge-info');
        if (badge) {
            const currentCount = parseInt(badge.textContent) || 0;
            if (currentCount > 0) {
                badge.textContent = `${currentCount - 1} rekam medis`;
            }
        }

    } catch (error) {
        console.error('Error deleting medical record:', error);
        alert('Gagal menghapus rekam medis: ' + error.message);
    }
}

// Export showPatientDetail to global scope for onclick handlers
window.showPatientDetail = showPatientDetail;
window.showNewVisitModal = showNewVisitModal;
window.showNewVisitForm = showNewVisitForm;
window.deleteMedicalRecord = deleteMedicalRecord;
window.openSundayClinicWithMrId = openSundayClinicWithMrId;

// Export for manual initialization if needed
export { initMain };

// Expose page switching functions to the global scope for onclick handlers
window.showDashboardPage = showDashboardPage;
window.showKlinikPrivatePage = showKlinikPrivatePage;
window.showTindakanPage = showTindakanPage;
window.showObatPage = showObatPage;
window.showCashierPage = showCashierPage;
window.showAnamnesa = showAnamnesa;
window.showPhysicalExam = showPhysicalExam;
window.showUSGExam = showUSGExam;
window.showLabExam = showLabExam;
window.showLogPage = showLogPage;
window.showAppointmentsPage = showAppointmentsPage;
window.showAnalyticsPage = showAnalyticsPage;
window.showFinancePage = showFinancePage;
window.showKelolaPasienPage = showKelolaPasienPage;
window.showKelolaPengumumanPage = showKelolaPengumumanPage;
window.showKelolaAppointmentPage = showKelolaAppointmentPage;
window.showKelolaJadwalPage = showKelolaJadwalPage;
window.showKelolaTindakanPage = showKelolaTindakanPage;
window.showKelolaObatManagementPage = showKelolaObatManagementPage;
window.showEstimasiBiayaPage = showEstimasiBiayaPage;
window.updateEstimasiBiaya = updateEstimasiBiaya;
window.showFinanceAnalysisPage = showFinanceAnalysisPage;
window.showBirthCongratsPage = showBirthCongratsPage;
window.loadBirthCongratsList = loadBirthCongratsList;
window.showAddBirthCongratsModal = showAddBirthCongratsModal;
window.saveBirthCongrats = saveBirthCongrats;
window.editBirthCongrats = editBirthCongrats;
window.deleteBirthCongrats = deleteBirthCongrats;
window.selectBirthCongratsColor = selectBirthCongratsColor;
window.showKelolaRolesPage = showKelolaRolesPage;
window.showStaffActivityPage = showStaffActivityPage;
window.loadStaffActivityLogs = loadStaffActivityLogs;
window.showBookingSettingsPage = showBookingSettingsPage;
window.showImportFieldsPage = showImportFieldsPage;
window.showArtikelKesehatanPage = showArtikelKesehatanPage;
window.loadArticlesAdmin = loadArticlesAdmin;
window.showAddArticleModal = showAddArticleModal;
window.editArticle = editArticle;
window.saveArticle = saveArticle;
window.togglePublishArticle = togglePublishArticle;
window.deleteArticle = deleteArticle;
window.showProfileSettings = showProfileSettings;
// REMOVED: window.showEmailSettingsPage = showEmailSettingsPage;
window.showStokOpnamePage = showStokOpnamePage;
window.showPengaturanPage = showPengaturanPage;
window.showKelolaObatPage = showKelolaObatPage;
window.showPenjualanObatPage = showPenjualanObatPage;
window.showBulkUploadUSGPage = showBulkUploadUSGPage;
window.showMedifySyncPage = showMedifySyncPage;
window.showHospitalAppointmentsPage = showHospitalAppointmentsPage;
window.showHospitalPatientsPage = showHospitalPatientsPage;
window.showPasienBaruPage = showPasienBaruPage;
window.startPatientVisit = startPatientVisit;
window.confirmHospitalAppointment = confirmHospitalAppointment;
window.completeHospitalAppointment = completeHospitalAppointment;
window.cancelHospitalAppointment = cancelHospitalAppointment;
window.startHospitalExam = startHospitalExam;

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
    pages.financeAnalysis = grab('finance-analysis-page');
    pages.kelolaRoles = grab('kelola-roles-page');
    pages.bookingSettings = grab('booking-settings-page');
    pages.activityLog = grab('activity-log-page');
    pages.kelolaSupplier = grab('kelola-supplier-page');
    pages.staffActivity = grab('staff-activity-page');
    pages.hospitalAppointments = grab('hospital-appointments-page');
    pages.hospitalPatients = grab('hospital-patients-page');
    pages.registrasiPasien = grab('registrasi-pasien-page');
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
}
function showDashboardPage() { hideAllPages(); pages.dashboard?.classList.remove('d-none'); setTitleAndActive('Dashboard', 'nav-dashboard', 'dashboard'); }
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
    if (!tbody) return;

    // Destroy existing DataTable FIRST before loading new data
    if ($.fn.DataTable.isDataTable('#hospital-patients-table')) {
        $('#hospital-patients-table').DataTable().clear().destroy();
    }

    tbody.innerHTML = `<tr><td colspan="10" class="text-center"><i class="fas fa-spinner fa-spin"></i> Memuat data pasien baru...</td></tr>`;

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
            tbody.innerHTML = `<tr><td colspan="10" class="text-center">Tidak ada pasien baru (semua pasien sudah pernah berkunjung)</td></tr>`;
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
                    <td>${patient.email || '-'}</td>
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
        tbody.innerHTML = `<tr><td colspan="10" class="text-center text-danger">Gagal memuat data: ${error.message}</td></tr>`;
    }
}

async function loadHospitalPatients(location) {
    const tbody = document.getElementById('hospital-patients-tbody');
    if (!tbody) return;

    const hospitalName = hospitalNames[location] || location;

    // Destroy existing DataTable FIRST before loading new data
    if ($.fn.DataTable.isDataTable('#hospital-patients-table')) {
        $('#hospital-patients-table').DataTable().clear().destroy();
    }

    tbody.innerHTML = `<tr><td colspan="10" class="text-center"><i class="fas fa-spinner fa-spin"></i> Memuat data pasien ${hospitalName}...</td></tr>`;

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
            tbody.innerHTML = `<tr><td colspan="10" class="text-center">Belum ada pasien dengan kunjungan terakhir di ${hospitalName}</td></tr>`;
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
                    <td>${patient.email || '-'}</td>
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
        $('#hospital-patients-table').DataTable({
            "pageLength": 25,
            "order": [[7, 'desc']]
        });

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
        tbody.innerHTML = `<tr><td colspan="10" class="text-center text-danger">Gagal memuat data pasien</td></tr>`;
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

    if (appointments.length === 0) {
        container.innerHTML = `
            <div class="alert alert-info">
                <i class="fas fa-info-circle"></i> Belum ada appointment untuk ${hospitalName}
            </div>
        `;
        return;
    }

    const rows = appointments.map(apt => {
        const date = new Date(apt.appointment_date);
        const dateStr = date.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        const statusBadge = getStatusBadge(apt.status);

        return `
            <tr>
                <td>${dateStr}</td>
                <td>${apt.appointment_time ? apt.appointment_time.substring(0, 5) : '-'}</td>
                <td>
                    <strong>${apt.patient_name || '-'}</strong><br>
                    <small class="text-muted">${apt.patient_id || '-'}</small>
                </td>
                <td>${apt.detected_category || apt.appointment_type || '-'}</td>
                <td>${apt.complaint || apt.notes || '-'}</td>
                <td>${statusBadge}</td>
                <td>
                    <div class="btn-group btn-group-sm">
                        <button class="btn btn-outline-success" onclick="confirmHospitalAppointment(${apt.id})" title="Konfirmasi" ${apt.status === 'confirmed' ? 'disabled' : ''}>
                            <i class="fas fa-check"></i>
                        </button>
                        <button class="btn btn-outline-primary" onclick="completeHospitalAppointment(${apt.id})" title="Selesai" ${apt.status === 'completed' ? 'disabled' : ''}>
                            <i class="fas fa-check-double"></i>
                        </button>
                        <button class="btn btn-outline-danger" onclick="cancelHospitalAppointment(${apt.id})" title="Batalkan" ${apt.status === 'cancelled' ? 'disabled' : ''}>
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    container.innerHTML = `
        <div class="card">
            <div class="card-header" style="background: ${hospitalColor}; color: white;">
                <h3 class="card-title mb-0">
                    <i class="fas fa-hospital mr-2"></i>
                    Appointment ${hospitalName}
                </h3>
            </div>
            <div class="card-body p-0">
                <div class="table-responsive">
                    <table class="table table-hover table-striped mb-0">
                        <thead>
                            <tr>
                                <th>Tanggal</th>
                                <th>Jam</th>
                                <th>Pasien</th>
                                <th>Jenis</th>
                                <th>Keluhan</th>
                                <th>Status</th>
                                <th>Aksi</th>
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

    const targetUrl = `/sunday-clinic/${encodeURIComponent(slug)}/identitas`;
    window.open(targetUrl, '_blank', 'noopener');
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

    const targetUrl = `/sunday-clinic/${encodeURIComponent(slug)}/identitas`;
    window.open(targetUrl, '_blank', 'noopener');
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
    if (user) {
        // Update welcome card
        updateWelcomeCard(user);

        // Fetch menu visibility from API based on user's role
        await applyMenuVisibility(user);

        // Initialize real-time sync for online users tracking
        console.log('[MAIN] Calling initRealtimeSync with:', { id: user.id, name: user.name, role: user.role });
        initRealtimeSync(user);
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
    const menuMapping = {
        'dashboard': null, // Dashboard always visible
        'pasien_baru': 'nav-registrasi-pasien',
        'klinik_privat': 'nav-klinik-privat',
        'rsia_melinda': 'nav-rsia-melinda',
        'rsud_gambiran': 'nav-rsud-gambiran',
        'rs_bhayangkara': 'nav-rs-bhayangkara',
        'obat_alkes': 'management-nav-kelola-obat',
        'keuangan': 'finance-analysis-nav',
        'kelola_pasien': 'management-nav-kelola-pasien',
        'kelola_roles': 'management-nav-kelola-roles'
    };

    // Superadmin/dokter sees everything
    const isDokter = user.is_superadmin || user.role === 'dokter' || user.role === 'superadmin';
    if (isDokter) {
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
        for (const [menuKey, elementId] of Object.entries(menuMapping)) {
            if (!elementId) continue; // Skip dashboard

            const element = document.getElementById(elementId);
            if (element) {
                if (visibility[menuKey] === false) {
                    element.style.display = 'none';
                } else {
                    element.style.display = ''; // Show
                }
            }
        }

        // Hide management header if no management menus are visible
        const managementMenus = ['obat_alkes', 'keuangan', 'kelola_pasien', 'kelola_roles'];
        const anyManagementVisible = managementMenus.some(key => visibility[key] === true);
        const managementHeader = document.getElementById('management-header');
        if (managementHeader && !anyManagementVisible) {
            managementHeader.style.display = 'none';
        }

    } catch (error) {
        console.error('Error fetching menu visibility:', error);
    }
}

// -------------------- BOOT --------------------
function initMain() {
    initPages();
    startClock();
    bindBasics();
    bindSundayClinicLauncher();
    initMedicalExam(); // Initialize medical examination pages
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
        const btn = document.getElementById('btn-start-patient-visit');
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
        const btn = document.getElementById('btn-start-patient-visit');
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-play-circle mr-2"></i>Mulai Kunjungan';
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

            // Try to fetch intake data separately by phone
            intake = null;
            if (patient.whatsapp || patient.phone) {
                try {
                    const phoneToSearch = patient.whatsapp || patient.phone;
                    const intakeResponse = await fetch('/api/patient-intake', {
                        headers: {
                            'Authorization': `Bearer ${token}`
                        }
                    });
                    
                    if (intakeResponse.ok) {
                        const intakeData = await intakeResponse.json();
                        // Find intake matching this patient's phone
                        const normalizedPatientPhone = phoneToSearch.replace(/\D/g, '').slice(-10);
                        const matchingIntake = intakeData.data?.find(submission => {
                            const submissionPhone = submission.phone?.replace(/\D/g, '').slice(-10);
                            return submissionPhone === normalizedPatientPhone;
                        });
                        
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
        }
        
        console.log('Final intake data:', intake);
        
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
                                    <table class="table table-sm table-bordered">
                                        <tr>
                                            <th width="40%">Nama Lengkap</th>
                                            <td>${intake.payload.full_name || '-'}</td>
                                        </tr>
                                        <tr>
                                            <th>Tanggal Lahir</th>
                                            <td>${intake.payload.dob ? new Date(intake.payload.dob).toLocaleDateString('id-ID', {day: 'numeric', month: 'long', year: 'numeric'}) : '-'}</td>
                                        </tr>
                                        <tr>
                                            <th>Usia</th>
                                            <td>${intake.payload.age || '-'} tahun</td>
                                        </tr>
                                        <tr>
                                            <th>Telepon</th>
                                            <td>${intake.payload.phone || '-'}</td>
                                        </tr>
                                        <tr>
                                            <th>NIK</th>
                                            <td>${intake.payload.nik || '-'}</td>
                                        </tr>
                                        <tr>
                                            <th>Alamat</th>
                                            <td>${intake.payload.address || '-'}</td>
                                        </tr>
                                        <tr>
                                            <th>Status Pernikahan</th>
                                            <td>${intake.payload.marital_status || '-'}</td>
                                        </tr>
                                    </table>
                                </div>
                                <div class="col-md-6">
                                    <table class="table table-sm table-bordered">
                                        <tr>
                                            <th width="40%">Gravida</th>
                                            <td>${intake.payload.gravida || '0'}</td>
                                        </tr>
                                        <tr>
                                            <th>Para</th>
                                            <td>${intake.payload.para || '0'}</td>
                                        </tr>
                                        <tr>
                                            <th>Abortus</th>
                                            <td>${intake.payload.abortus || '0'}</td>
                                        </tr>
                                        <tr>
                                            <th>Anak Hidup</th>
                                            <td>${intake.payload.living_children || '0'}</td>
                                        </tr>
                                        <tr>
                                            <th>HPHT</th>
                                            <td>${intake.payload.lmp ? new Date(intake.payload.lmp).toLocaleDateString('id-ID', {day: 'numeric', month: 'long', year: 'numeric'}) : '-'}</td>
                                        </tr>
                                        <tr>
                                            <th>HPL</th>
                                            <td>${intake.payload.edd || '-'}</td>
                                        </tr>
                                        <tr>
                                            <th>Status</th>
                                            <td><span class="badge badge-${intake.status === 'verified' ? 'success' : 'warning'}">${intake.status}</span></td>
                                        </tr>
                                    </table>
                                </div>
                            </div>
                            ${intake.payload.medications && intake.payload.medications.length > 0 ? `
                            <div class="mt-2">
                                <strong>Obat-obatan:</strong>
                                <ul class="mb-0">
                                    ${intake.payload.medications.map(m => `<li>${m.name || m}</li>`).join('')}
                                </ul>
                            </div>
                            ` : ''}
                            ${intake.payload.allergies ? `
                            <div class="mt-2">
                                <strong>Alergi:</strong> ${intake.payload.allergies}
                            </div>
                            ` : ''}
                            <div class="mt-2 text-muted small">
                                <i class="far fa-clock"></i> Diisi: ${new Date(intake.createdAt).toLocaleString('id-ID')}
                                ${intake.updatedAt ? ` | Diperbarui: ${new Date(intake.updatedAt).toLocaleString('id-ID')}` : ''}
                            </div>
                            ` : '<div class="alert alert-info"><i class="fas fa-info-circle"></i> Belum ada formulir rekam medis awal</div>'}

                            <hr>
                            <div class="card card-primary card-outline">
                                <div class="card-header">
                                    <h5 class="card-title mb-0">
                                        <i class="fas fa-clinic-medical"></i> Mulai Kunjungan
                                    </h5>
                                </div>
                                <div class="card-body">
                                    <div class="row">
                                        <div class="col-md-6">
                                            <label class="font-weight-bold mb-2">Lokasi Kunjungan:</label>
                                            <div class="location-options">
                                                <label class="d-block mb-2">
                                                    <input type="radio" name="visit_location" value="klinik_private" checked>
                                                    <span class="ml-2"><i class="fas fa-clinic-medical text-primary mr-1"></i> Klinik Private</span>
                                                </label>
                                                <label class="d-block mb-2">
                                                    <input type="radio" name="visit_location" value="rsia_melinda">
                                                    <span class="ml-2"><i class="fas fa-hospital text-pink mr-1" style="color:#e91e63"></i> RSIA Melinda</span>
                                                </label>
                                                <label class="d-block mb-2">
                                                    <input type="radio" name="visit_location" value="rsud_gambiran">
                                                    <span class="ml-2"><i class="fas fa-hospital text-info mr-1"></i> RSUD Gambiran</span>
                                                </label>
                                                <label class="d-block mb-2">
                                                    <input type="radio" name="visit_location" value="rs_bhayangkara">
                                                    <span class="ml-2"><i class="fas fa-hospital text-success mr-1"></i> RS Bhayangkara</span>
                                                </label>
                                            </div>
                                        </div>
                                        <div class="col-md-6">
                                            <label class="font-weight-bold mb-2">Kategori Konsultasi:</label>
                                            <div class="category-options">
                                                <label class="d-block mb-2">
                                                    <input type="radio" name="visit_category" value="obstetri" checked>
                                                    <span class="ml-2"><i class="fas fa-baby text-info mr-1"></i> <strong>Obstetri</strong> - Kehamilan</span>
                                                </label>
                                                <label class="d-block mb-2">
                                                    <input type="radio" name="visit_category" value="gyn_repro">
                                                    <span class="ml-2"><i class="fas fa-venus text-success mr-1"></i> <strong>Reproduksi</strong> - Program Hamil, KB</span>
                                                </label>
                                                <label class="d-block mb-2">
                                                    <input type="radio" name="visit_category" value="gyn_special">
                                                    <span class="ml-2"><i class="fas fa-microscope text-warning mr-1"></i> <strong>Ginekologi</strong> - Kista, Miom</span>
                                                </label>
                                            </div>
                                        </div>
                                    </div>
                                    <div class="mt-3 text-center">
                                        <button type="button" class="btn btn-primary btn-lg" id="btn-start-patient-visit" data-patient-id="${normalizedPatient.id}" data-patient-name="${normalizedPatient.fullname}">
                                            <i class="fas fa-play-circle mr-2"></i>Mulai Kunjungan
                                        </button>
                                    </div>
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

        // Bind event for "Mulai Kunjungan" button
        document.getElementById('btn-start-patient-visit')?.addEventListener('click', async function() {
            const patientId = this.dataset.patientId;
            const patientName = this.dataset.patientName;
            const location = document.querySelector('input[name="visit_location"]:checked')?.value || 'klinik_private';
            const category = document.querySelector('input[name="visit_category"]:checked')?.value || 'obstetri';

            await startPatientVisit(patientId, patientName, location, category);
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

// Export showPatientDetail to global scope for onclick handlers
window.showPatientDetail = showPatientDetail;
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
window.showFinanceAnalysisPage = showFinanceAnalysisPage;
window.showKelolaRolesPage = showKelolaRolesPage;
window.showStaffActivityPage = showStaffActivityPage;
window.loadStaffActivityLogs = loadStaffActivityLogs;
window.showBookingSettingsPage = showBookingSettingsPage;
window.showProfileSettings = showProfileSettings;
// REMOVED: window.showEmailSettingsPage = showEmailSettingsPage;
window.showStokOpnamePage = showStokOpnamePage;
window.showPengaturanPage = showPengaturanPage;
window.showKelolaObatPage = showKelolaObatPage;
window.showHospitalAppointmentsPage = showHospitalAppointmentsPage;
window.showHospitalPatientsPage = showHospitalPatientsPage;
window.showPasienBaruPage = showPasienBaruPage;
window.startPatientVisit = startPatientVisit;
window.confirmHospitalAppointment = confirmHospitalAppointment;
window.completeHospitalAppointment = completeHospitalAppointment;
window.cancelHospitalAppointment = cancelHospitalAppointment;

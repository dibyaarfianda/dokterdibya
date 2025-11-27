// Core AdminLTE bootstrap for dibyaklinik
// This module ports essential UX from index-asli.html: clock, page switching, and basic bindings.

import { auth, onAuthStateChanged } from './vps-auth-v2.js';
import { validatePatient, validateObatUsage, updatePatientDisplay, getCurrentPatientData, getSelectedServices, getSelectedObat } from './billing.js';
import { showWarning } from './toast.js';
import { initMedicalExam, setCurrentPatientForExam, toggleMedicalExamMenu } from './medical-exam.js';
import { loadSession } from './session-manager.js';

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
    setTitleAndActive('Kelola Obat', 'nav-kelola-obat', 'kelolaObat');
    
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
    setTitleAndActive('Kelola Pasien', 'nav-kelola-pasien', 'kelola-pasien');
    loadExternalPage('kelola-pasien-page', 'kelola-pasien.html', { forceReload: true });
}
function showKelolaAppointmentPage() { 
    hideAllPages(); 
    pages.kelolaAppointment?.classList.remove('d-none'); 
    setTitleAndActive('Kelola Appointment', 'nav-kelola-appointment', 'kelola-appointment');
    
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
    setTitleAndActive('Kelola Jadwal', 'nav-kelola-jadwal', 'kelola-jadwal');
    
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
    setTitleAndActive('Kelola Tindakan', 'nav-kelola-tindakan', 'kelola-tindakan');
}
function showKelolaObatManagementPage() {
    showKelolaObatPage();
}
function showKelolaPengumumanPage() {
    hideAllPages();
    pages.kelolaPengumuman?.classList.remove('d-none');
    setTitleAndActive('Kelola Pengumuman', 'nav-kelola-pengumuman', 'kelola-pengumuman');
    
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
function showFinanceAnalysisPage() {
    hideAllPages();
    pages.financeAnalysis?.classList.remove('d-none');
    setTitleAndActive('Finance Analysis', 'nav-finance-analysis', 'finance-analysis');
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

        const token = localStorage.getItem('token');
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
    const token = localStorage.getItem('token');
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
        const token = localStorage.getItem('vps_auth_token') || localStorage.getItem('token');
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
        const token = localStorage.getItem('vps_auth_token') || localStorage.getItem('token');
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

function initializeApp(user) {
    if (user) {
        // Update welcome card
        updateWelcomeCard(user);

        // User is logged in, check roles
        const isDokter = user.is_superadmin || user.role === 'dokter' || user.role === 'superadmin';
        const isManagerial = user.role === 'managerial';
        const isBidan = user.role === 'bidan';

        // Get management navigation elements
        const managementHeader = document.getElementById('management-header');
        const financeNav = document.getElementById('finance-analysis-nav');
        const kelolaPasienNav = document.getElementById('management-nav-kelola-pasien');
        const kelolaAppointmentNav = document.getElementById('management-nav-kelola-appointment');
        const kelolaJadwalNav = document.getElementById('management-nav-kelola-jadwal');
        const kelolaTindakanNav = document.getElementById('management-nav-kelola-tindakan');
        const kelolaObatNav = document.getElementById('management-nav-kelola-obat');
        const kelolaRolesNav = document.getElementById('management-nav-kelola-roles');

        if (isDokter) {
            // Dokter sees everything - no hiding
        } else if (isManagerial) {
            // Managerial: Hide only patient management and roles (sensitive)
            if (kelolaPasienNav) kelolaPasienNav.style.display = 'none';
            if (kelolaRolesNav) kelolaRolesNav.style.display = 'none';
        } else if (isBidan) {
            // Bidan: Hide patient management, finance, and roles
            if (financeNav) financeNav.style.display = 'none';
            if (kelolaPasienNav) kelolaPasienNav.style.display = 'none';
            if (kelolaRolesNav) kelolaRolesNav.style.display = 'none';
        } else {
            // Other roles: Hide all management
            if (managementHeader) managementHeader.style.display = 'none';
            if (financeNav) financeNav.style.display = 'none';
            if (kelolaPasienNav) kelolaPasienNav.style.display = 'none';
            if (kelolaAppointmentNav) kelolaAppointmentNav.style.display = 'none';
            if (kelolaJadwalNav) kelolaJadwalNav.style.display = 'none';
            if (kelolaTindakanNav) kelolaTindakanNav.style.display = 'none';
            if (kelolaObatNav) kelolaObatNav.style.display = 'none';
            if (kelolaRolesNav) kelolaRolesNav.style.display = 'none';
        }
    } else {
        // User is not logged in, or session expired
        // You might want to redirect to login page here
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

// -------------------- PATIENT DETAIL MODAL --------------------
async function showPatientDetail(patientId) {
    try {
        console.log('=== showPatientDetail called ===');
        console.log('Patient ID:', patientId);
        console.log('Auth token exists:', !!localStorage.getItem('vps_auth_token'));
        
        // Try the web-patients endpoint first as it includes intake data
        let response = await fetch(`/api/admin/web-patients/${patientId}`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('vps_auth_token')}`
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
                    'Authorization': `Bearer ${localStorage.getItem('vps_auth_token')}`
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
                            'Authorization': `Bearer ${localStorage.getItem('vps_auth_token')}`
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
                              ="badge badge-${intake.highRisk ? 'danger' : 'success'} ml-2">
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
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-dismiss="modal">Tutup</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Remove existing modal if any
        $('#patientDetailModal').remove();
        
        // Add and show modal
        $('body').append(modal);
        $('#patientDetailModal').modal('show');
        
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
window.showBookingSettingsPage = showBookingSettingsPage;
window.showProfileSettings = showProfileSettings;
// REMOVED: window.showEmailSettingsPage = showEmailSettingsPage;
window.showStokOpnamePage = showStokOpnamePage;
window.showPengaturanPage = showPengaturanPage;
window.showKelolaObatPage = showKelolaObatPage;

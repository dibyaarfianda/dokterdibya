// Core AdminLTE bootstrap for dibyaklinik
// This module ports essential UX from index-asli.html: clock, page switching, and basic bindings.

import { validatePatient, validateObatUsage, updatePatientDisplay, getCurrentPatientData, getSelectedServices, getSelectedObat } from './scripts/billing.js';
import { showWarning } from './scripts/toast.js';
import { initMedicalExam, setCurrentPatientForExam, toggleMedicalExamMenu } from './scripts/medical-exam.js';

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
function grab(id) { return document.getElementById(id); }
function initPages() {
    pages.dashboard = grab('dashboard-page');
    pages.patient = grab('patient-page');
    pages.anamnesa = grab('anamnesa-page');
    pages.physical = grab('physical-exam-page');
    pages.usg = grab('usg-exam-page');
    pages.lab = grab('lab-exam-page');
    pages.tindakan = grab('tindakan-page');
    pages.obat = grab('obat-page');
    pages.cashier = grab('cashier-page');

    pages.pengaturan = grab('pengaturan-page');
    pages.kelolaObat = grab('kelola-obat-page'); 
    pages.logs = grab('log-page');
    pages.roles = grab('role-management-page');
    pages.appointments = grab('appointments-page');
    pages.analytics = grab('analytics-page');
    pages.profile = grab('profile-settings-page');
    pages.stocks = grab('stocks-page');
    
    console.log('📄 [MAIN] Pages initialized:', {
        appointments: !!pages.appointments,
        appointmentsElement: pages.appointments
    });
}
function hideAllPages() {
    console.log('🙈 [MAIN] hideAllPages called - hiding', Object.keys(pages).length, 'pages');
    Object.values(pages).forEach(p => { if (p) p.classList.add('d-none'); });
    document.querySelectorAll('.nav-sidebar .nav-link').forEach(l => l.classList.remove('active'));
}
function setTitleAndActive(title, navId) {
    const titleEl = document.getElementById('page-title');
    if (titleEl) titleEl.textContent = title;
    if (navId) {
        const link = document.querySelector(`#${navId} .nav-link`);
        if (link) link.classList.add('active');
    }
}
function showDashboardPage() { hideAllPages(); pages.dashboard?.classList.remove('d-none'); setTitleAndActive('Dashboard', 'nav-dashboard'); }
function showTindakanPage() { 
    hideAllPages(); 
    pages.tindakan?.classList.remove('d-none'); 
    setTitleAndActive('Tindakan', 'nav-tindakan');
    updatePatientDisplay(); // Update patient display saat buka halaman Tindakan
    // Load billing module
    import('./scripts/billing.js').then(module => {
        if (module.initBilling) {
            module.initBilling();
        }
    });
}
function showObatPage() {
    hideAllPages();
    pages.obat?.classList.remove('d-none');
    setTitleAndActive('Obat & Alkes', 'nav-obat');
    
    // Load billing-obat module
    import('./scripts/billing-obat.js').then(module => {
        if (module.initObat) {
            module.initObat();
        }
    }).catch(error => {
        console.error('Failed to load billing-obat.js:', error);
    });
}
function showCashierPage() { 
    // Load all billing modules dynamically
    Promise.all([
        import('./scripts/billing.js'),
        import('./scripts/billing-obat.js'),
        import('./scripts/cashier.js')
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
        setTitleAndActive('Rincian Tagihan', 'nav-cashier');
        
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
function showPatientPage() { hideAllPages(); pages.patient?.classList.remove('d-none'); setTitleAndActive('Data Pasien', 'nav-patient'); }
// Make function globally accessible for onclick handlers
window.showPatientPage = showPatientPage;
function showAnamnesa() { hideAllPages(); pages.anamnesa?.classList.remove('d-none'); setTitleAndActive('Anamnesa', 'nav-anamnesa'); }
function showPhysicalExam() { hideAllPages(); pages.physical?.classList.remove('d-none'); setTitleAndActive('Pemeriksaan Fisik', 'nav-physical'); }
function showUSGExam() { 
    hideAllPages(); 
    pages.usg?.classList.remove('d-none'); 
    setTitleAndActive('Pemeriksaan USG', 'nav-usg');
    
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
}
function showLabExam() { hideAllPages(); pages.lab?.classList.remove('d-none'); setTitleAndActive('Pemeriksaan Penunjang', 'nav-lab'); }

function showPengaturanPage() {
    console.log('🔧 showPengaturanPage called');
    hideAllPages();
    pages.pengaturan?.classList.remove('d-none');
    setTitleAndActive('Pengaturan', 'nav-pengaturan');
    
    // Load kelola-tindakan module
    import('./scripts/kelola-tindakan.js').then(module => {
        if (module.initKelolaTindakan) {
            module.initKelolaTindakan();
        }
    }).catch(error => {
        console.error('Failed to load kelola-tindakan.js:', error);
    });
}
function showKelolaObatPage() {
    console.log('🔧 showKelolaObatPage called');
    console.log('📦 pages.kelolaObat element:', pages.kelolaObat);
    hideAllPages();
    
    if (pages.kelolaObat) {
        pages.kelolaObat.classList.remove('d-none');
        console.log('✅ Removed d-none from kelola-obat-page');
    } else {
        console.error('❌ kelola-obat-page element not found!');
    }
    
    setTitleAndActive('Kelola Obat', 'nav-kelola-obat');
    
    // Load kelola-obat module
    import('./scripts/kelola-obat.js').then(module => {
        console.log('✅ kelola-obat.js module loaded');
        if (module.initKelolaObat) {
            console.log('🚀 Calling initKelolaObat...');
            module.initKelolaObat();
        } else {
            console.error('❌ initKelolaObat function not found in module');
        }
    }).catch(error => {
        console.error('❌ Failed to load kelola-obat.js:', error);
    });
}
function showStocksPage() {
    console.log('🏥 showStocksPage called');
    hideAllPages();
    pages.stocks?.classList.remove('d-none');
    setTitleAndActive('Stocks', 'nav-stocks');
    
    // Load stocks module
    import('./scripts/stocks.js').then(module => {
        if (module.initStocks) {
            module.initStocks();
        }
    }).catch(error => {
        console.error('Failed to load stocks.js:', error);
    });
}
function showLogPage() { hideAllPages(); pages.logs?.classList.remove('d-none'); setTitleAndActive('Log Aktivitas', 'nav-logs'); }
function showRoleManagementPage() { hideAllPages(); pages.roles?.classList.remove('d-none'); setTitleAndActive('Kelola Role', 'nav-roles'); }
function showAppointmentsPage() {
    console.log('🚀 [MAIN] ===== showAppointmentsPage called =====');
    console.log('📦 [MAIN] pages.appointments element:', pages.appointments);
    console.log('📦 [MAIN] pages.appointments exists?', !!pages.appointments);
    
    // Check if element exists in DOM
    const appointmentsPageElement = document.getElementById('appointments-page');
    console.log('🔍 [MAIN] DOM query for appointments-page:', appointmentsPageElement);
    console.log('🔍 [MAIN] Element classes before:', appointmentsPageElement?.className);
    
    hideAllPages();
    console.log('✅ [MAIN] hideAllPages() completed');
    
    if (pages.appointments) {
        const hadDNone = pages.appointments.classList.contains('d-none');
        console.log('🎯 [MAIN] appointments-page has d-none?', hadDNone);
        
        pages.appointments.classList.remove('d-none');
        
        const stillHasDNone = pages.appointments.classList.contains('d-none');
        console.log('✅ [MAIN] Removed d-none from appointments-page');
        console.log('🔍 [MAIN] Element classes after:', pages.appointments.className);
        console.log('🔍 [MAIN] Still has d-none?', stillHasDNone);
        console.log('🔍 [MAIN] Element style.display:', pages.appointments.style.display);
        console.log('🔍 [MAIN] Element offsetHeight:', pages.appointments.offsetHeight);
    } else {
        console.error('❌ [MAIN] appointments-page element not found in pages object!');
        console.error('❌ [MAIN] Trying direct DOM query...');
        if (appointmentsPageElement) {
            appointmentsPageElement.classList.remove('d-none');
            console.log('✅ [MAIN] Removed d-none via direct DOM query');
        }
    }
    
    setTitleAndActive('Appointment', 'nav-appointments');
    console.log('✅ [MAIN] setTitleAndActive completed');
    
    // Load appointments module dynamically
    console.log('📥 [MAIN] Loading appointments.js module...');
    import('./scripts/appointments.js').then(module => {
        console.log('✅ [MAIN] appointments.js module loaded');
        if (module.initAppointments) {
            console.log('🚀 [MAIN] Calling initAppointments...');
            module.initAppointments();
        } else {
            console.error('❌ [MAIN] initAppointments function not found in module');
        }
    }).catch(error => {
        console.error('❌ [MAIN] Failed to load appointments.js:', error);
    });
    
    console.log('🏁 [MAIN] ===== showAppointmentsPage completed =====');
}
function showAnalyticsPage() { hideAllPages(); pages.analytics?.classList.remove('d-none'); setTitleAndActive('Analytics', 'nav-analytics'); }
function showProfileSettings() { 
    hideAllPages(); 
    pages.profile?.classList.remove('d-none'); 
    setTitleAndActive('Profile Settings', null);
    // Load profile module and initialize
    import('./scripts/profile.js').then(module => {
        if (module.initProfile) {
            module.initProfile();
        }
        if (module.loadProfileData) {
            module.loadProfileData();
        }
    });
}
// Expose for inline onclicks already set in HTML
window.showTindakanPage = showTindakanPage;
window.showObatPage = showObatPage;
window.showCashierPage = showCashierPage;
window.showPatientPage = showPatientPage;
window.showAnamnesa = showAnamnesa;
window.showPhysicalExam = showPhysicalExam;
window.showUSGExam = showUSGExam;
window.showLabExam = showLabExam;
window.showProfileSettings = showProfileSettings;

window.showLogPage = showLogPage;
window.showPengaturanPage = showPengaturanPage;
window.showKelolaObatPage = showKelolaObatPage;
window.showStokOpnamePage = showKelolaObatPage; // Alias for backward compatibility
window.showStocksPage = showStocksPage;
window.showRoleManagementPage = showRoleManagementPage;
window.showAppointmentsPage = showAppointmentsPage;
window.showAnalyticsPage = showAnalyticsPage;
window.showDashboardPage = showDashboardPage;

// -------------------- BASIC BINDINGS --------------------
function bindBasics() {
    const backFromLogBtn = grab('backFromLogBtn');
    backFromLogBtn?.addEventListener('click', showTindakanPage);

    // Summary action buttons (disabled until billing logic is ported)
    const backToTindakanBtn = grab('backToTindakanBtn');
    backToTindakanBtn?.addEventListener('click', showTindakanPage);
}

// -------------------- BOOT --------------------
function initMain() {
    initPages();
    startClock();
    bindBasics();
    initMedicalExam(); // Initialize medical examination pages
    // Default landing: Dashboard
    showDashboardPage();
}

// Auto-init if DOM is ready, otherwise wait
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMain);
} else {
    initMain();
}

// Export for manual initialization if needed
export { initMain };



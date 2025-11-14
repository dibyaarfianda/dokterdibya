// Core AdminLTE bootstrap for dibyaklinik
// This module ports essential UX from index-asli.html: clock, page switching, and basic bindings.

import { auth, onAuthStateChanged } from './vps-auth-v2.js';
import { validatePatient, validateObatUsage, updatePatientDisplay, getCurrentPatientData, getSelectedServices, getSelectedObat } from './billing.js';
import { showWarning } from './toast.js';
import { initMedicalExam, setCurrentPatientForExam, toggleMedicalExamMenu } from './medical-exam.js';

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
    pages.admin = grab('admin-page');
    pages.pengaturan = grab('pengaturan-page');
    pages.kelolaObat = grab('kelola-obat-page'); 
    pages.logs = grab('log-page');
    pages.appointments = grab('appointments-page');
    pages.analytics = grab('analytics-page');
    pages.profile = grab('profile-settings-page');
    pages.stocks = grab('stocks-page');
    pages.finance = grab('finance-page');

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
function showTindakanPage() { 
    hideAllPages(); 
    pages.tindakan?.classList.remove('d-none'); 
    setTitleAndActive('Tindakan', 'nav-tindakan', 'tindakan');
    updatePatientDisplay(); // Update patient display saat buka halaman Tindakan
    // Load billing module
    import('./billing.js').then(module => {
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
    import('./billing-obat.js').then(module => {
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
        import('./billing.js'),
        import('./billing-obat.js'),
        import('./cashier.js')
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
    const { loadAnamnesaData } = await import('./medical-exam.js');
    await loadAnamnesaData();
}

async function showPhysicalExam() { 
    hideAllPages(); 
    pages.physical?.classList.remove('d-none'); 
    setTitleAndActive('Pemeriksaan Fisik', 'nav-physical', 'physical');
    
    // Load saved physical exam data for current patient
    const { loadPhysicalExamData } = await import('./medical-exam.js');
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
    const { loadUSGExamData } = await import('./medical-exam.js');
    await loadUSGExamData();
}

async function showLabExam() { 
    hideAllPages(); 
    pages.lab?.classList.remove('d-none'); 
    setTitleAndActive('Pemeriksaan Penunjang', 'nav-lab', 'lab');
    
    // Load saved lab exam data for current patient
    const { loadLabExamData } = await import('./medical-exam.js');
    await loadLabExamData();
}
function showStokOpnamePage() { 
    hideAllPages(); 
    pages.admin?.classList.remove('d-none'); 
    setTitleAndActive('Stok Opname', 'nav-admin', 'stok');
    // Load stok opname data
    import('./stok-opname.js').then(module => {
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
    
    import('./kelola-tindakan.js').then(module => {
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
    import('./kelola-obat.js').then(module => {
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
    import('./appointments.js').then(module => {
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
function showProfileSettings() { 
    hideAllPages(); 
    pages.profile?.classList.remove('d-none'); 
    setTitleAndActive('Profile Settings', null, 'profile'); 
    // Load profile module and initialize
    import('./profile.js').then(module => {
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
window.showStokOpnamePage = showStokOpnamePage;
window.showLogPage = showLogPage;
window.showPengaturanPage = showPengaturanPage;
window.showKelolaObatPage = showKelolaObatPage;
window.showAppointmentsPage = showAppointmentsPage;
window.showAnalyticsPage = showAnalyticsPage;
window.showFinancePage = showFinancePage;
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
                                <span class="badge badge-${intake.highRisk ? 'danger' : 'success'} ml-2">
                                    ${intake.highRisk ? 'High Risk' : 'Normal'}
                                </span>
                                ${intake.quickId ? `<span class="badge badge-info ml-1">RM: ${intake.quickId}</span>` : ''}
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
                                            <td>${intake.payload.dob ? new Date(intake.payload.dob).toLocaleDateString('id-ID') : '-'}</td>
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
                                            <td>${intake.payload.lmp ? new Date(intake.payload.lmp).toLocaleDateString('id-ID') : '-'}</td>
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

// Export for manual initialization if needed
export { initMain };



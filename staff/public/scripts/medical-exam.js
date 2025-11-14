import { auth, getIdToken } from './vps-auth-v2.js';
import { showSuccess, showError } from './toast.js';
import { updateSessionAnamnesa, updateSessionPhysical, updateSessionUSG, updateSessionLab } from './session-manager.js';
import { 
    broadcastAnamnesaUpdate, 
    broadcastPhysicalExamUpdate, 
    broadcastUSGExamUpdate, 
    broadcastLabExamUpdate 
} from './realtime-sync.js';

// VPS API Configuration
const VPS_API_BASE = ['localhost', '127.0.0.1'].includes(window.location.hostname)
    ? 'http://localhost:3001'
    : window.location.origin.replace(/\/$/, '');

let currentPatient = null;
let currentExamData = {
    anamnesa: {},
    physical: {},
    usg: {},
    lab: {}
};

// Show/hide medical exam menu based on patient selection
export function toggleMedicalExamMenu(show) {
    const menuItems = document.querySelectorAll('.medical-exam-menu');
    menuItems.forEach(item => {
        if (show) {
            item.classList.remove('d-none');
        } else {
            item.classList.add('d-none');
        }
    });
}

// Set current patient for medical exam
export function setCurrentPatientForExam(patient) {
    currentPatient = patient;
    
    // Update patient name displays
    const patientNameEls = [
        document.getElementById('anamnesa-patient-name'),
        document.getElementById('physical-patient-name'),
        document.getElementById('usg-patient-name'),
        document.getElementById('lab-patient-name')
    ];
    
    patientNameEls.forEach(el => {
        if (el) {
            const patientId = String(patient.patientId || '').padStart(5, '0');
            el.innerHTML = `<span class="badge badge-secondary mr-2">${patientId}</span>${patient.name}`;
        }
    });
    
    // Show medical exam menu
    toggleMedicalExamMenu(true);
    
    // Auto-load intake data when patient is selected
    if (typeof loadIntakeDataToAnamnesa === 'function') {
        setTimeout(() => {
            loadIntakeDataToAnamnesa();
        }, 500);
    }
}

// Load intake data and appointment data into Anamnesa form
export async function loadIntakeDataToAnamnesa() {
    if (!currentPatient || !currentPatient.patientId) {
        showError('Tidak ada pasien yang dipilih');
        return;
    }
    
    try {
        const token = await getIdToken();
        
        // Show loading indicator
        const loadBtn = document.querySelector('button[onclick="loadIntakeDataToAnamnesa()"]');
        if (loadBtn) {
            loadBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Memuat Data...';
            loadBtn.disabled = true;
        }
        
        // Load intake data
        const intakeResponse = await fetch(`${VPS_API_BASE}/api/patient-intake/patient/${currentPatient.patientId}/latest`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        let intakeData = null;
        if (intakeResponse.ok) {
            const intakeResult = await intakeResponse.json();
            if (intakeResult.success && intakeResult.data) {
                intakeData = intakeResult.data.payload || intakeResult.data;
                console.log('[ANAMNESA] Intake data loaded:', intakeData);
            }
        }
        
        // Load appointment data
        const appointmentResponse = await fetch(`${VPS_API_BASE}/api/appointments/patient/${currentPatient.patientId}/latest`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        let appointmentData = null;
        if (appointmentResponse.ok) {
            const appointmentResult = await appointmentResponse.json();
            if (appointmentResult.success && appointmentResult.data) {
                appointmentData = appointmentResult.data;
                console.log('[ANAMNESA] Appointment data loaded:', appointmentData);
            }
        }
        
        // Populate Anamnesa form with loaded data
        await populateAnamnesaWithIntakeData(intakeData, appointmentData);
        
        // Show success message
        showSuccess('Data intake dan appointment berhasil dimuat');
        
    } catch (error) {
        console.error('[ANAMNESA] Error loading intake data:', error);
        showError('Gagal memuat data intake: ' + error.message);
    } finally {
        // Reset button
        const loadBtn = document.querySelector('button[onclick="loadIntakeDataToAnamnesa()"]');
        if (loadBtn) {
            loadBtn.innerHTML = '<i class="fas fa-sync-alt mr-2"></i>Muat Data dari Intake';
            loadBtn.disabled = false;
        }
    }
}

// Populate Anamnesa form with intake and appointment data
async function populateAnamnesaWithIntakeData(intakeData, appointmentData) {
    if (!intakeData && !appointmentData) {
        console.log('[ANAMNESA] No data to populate');
        return;
    }
    
    console.log('[ANAMNESA] Populating form with data...');
    
    try {
        // === Data Pasien Section ===
        if (intakeData) {
            // Patient basic info
            setFieldValue('anamnesa-patient-fullname', intakeData.fullName);
            setFieldValue('anamnesa-patient-dob', intakeData.dateOfBirth);
            setFieldValue('anamnesa-patient-age', intakeData.age);
            setFieldValue('anamnesa-patient-address', intakeData.address);
            setFieldValue('anamnesa-patient-phone', intakeData.phoneNumber);
            setFieldValue('anamnesa-patient-marital', intakeData.maritalStatus);
            setFieldValue('anamnesa-patient-occupation', intakeData.occupation);
            setFieldValue('anamnesa-patient-education', intakeData.education);
            setFieldValue('anamnesa-patient-payment', intakeData.financingMethod);
            
            // Basic medical info
            setFieldValue('anamnesa-pregnancy-test-date', intakeData.pregnancyTestDate);
            setFieldValue('anamnesa-blood-type', intakeData.bloodType);
            setFieldValue('anamnesa-rhesus', intakeData.rhesus);
            
            // Allergies
            setFieldValue('anamnesa-allergy-drugs', intakeData.drugAllergies);
            setFieldValue('anamnesa-allergy-food', intakeData.foodAllergies);
            setFieldValue('anamnesa-allergy-others', intakeData.environmentalAllergies);
            
            // Current medications
            setFieldValue('anamnesa-current-medications', intakeData.currentMedications);
            
            // Medical history
            setFieldValue('anamnesa-past-conditions', intakeData.pastMedicalConditions);
            setFieldValue('anamnesa-family-history', intakeData.familyMedicalHistory);
            
            // === Status Obstetri Section ===
            // Menstrual history
            setFieldValue('anamnesa-menarche-age', intakeData.menarcheAge);
            setFieldValue('anamnesa-cycle-length', intakeData.menstrualCycleLength);
            setFieldValue('anamnesa-cycle-regular', intakeData.menstrualCycleRegular ? 'Ya' : 'Tidak');
            setFieldValue('anamnesa-lmp', intakeData.lastMenstrualPeriod);
            
            // Pregnancy history
            setFieldValue('anamnesa-gravida', intakeData.gravida);
            setFieldValue('anamnesa-para', intakeData.para);
            setFieldValue('anamnesa-abortus', intakeData.abortus);
            setFieldValue('anamnesa-living-children', intakeData.livingChildren);
            setFieldValue('anamnesa-edd', intakeData.estimatedDueDate);
            
            // Contraception history
            setFieldValue('anamnesa-previous-contraception', intakeData.contraceptionMethod);
            setFieldValue('anamnesa-kb-failure', intakeData.contraceptionFailure ? 'Ya' : 'Tidak');
            setFieldValue('anamnesa-failed-contraception', intakeData.failedContraceptionType);
            
            // Populate pregnancy history table
            populatePregnancyHistoryTable(intakeData.pregnancyHistory);
        }
        
        // === Keluhan Utama from Appointment ===
        if (appointmentData && appointmentData.notes) {
            setFieldValue('anamnesa-complaint', appointmentData.notes);
        }
        
        // Auto-set pregnancy status based on intake data
        if (intakeData && intakeData.pregnancyTestDate) {
            setFieldValue('anamnesa-pregnant', 'ya');
        }
        
        console.log('[ANAMNESA] Form population completed');
        
    } catch (error) {
        console.error('[ANAMNESA] Error populating form:', error);
        throw error;
    }
}

// Helper function to safely set field values
function setFieldValue(fieldId, value) {
    const field = document.getElementById(fieldId);
    if (field && value !== null && value !== undefined) {
        field.value = String(value);
        
        // Trigger change event for select fields
        if (field.tagName === 'SELECT') {
            field.dispatchEvent(new Event('change'));
        }
    }
}

// Populate pregnancy history table
function populatePregnancyHistoryTable(pregnancyHistory) {
    const tbody = document.getElementById('anamnesa-pregnancy-history');
    if (!tbody) return;
    
    // Clear existing rows
    tbody.innerHTML = '';
    
    if (!pregnancyHistory || !Array.isArray(pregnancyHistory)) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">Tidak ada data kehamilan sebelumnya</td></tr>';
        return;
    }
    
    pregnancyHistory.forEach((pregnancy, index) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${index + 1}</td>
            <td>${pregnancy.year || '-'}</td>
            <td>${pregnancy.deliveryMode || '-'}</td>
            <td>${pregnancy.complications || 'Tidak ada'}</td>
            <td>${pregnancy.babyWeight || '-'}</td>
            <td>${pregnancy.childAlive ? 'Ya' : 'Tidak'}</td>
        `;
        tbody.appendChild(row);
    });
}

// Make function globally available
window.loadIntakeDataToAnamnesa = loadIntakeDataToAnamnesa;

// Load medical exam data from API for current patient
export async function loadAnamnesaData() {
    if (!currentPatient || !currentPatient.patientId) {
        console.warn('[ANAMNESA] No patient selected');
        return;
    }
    
    try {
        const token = await getIdToken();
        const response = await fetch(`${VPS_API_BASE}/api/medical-exams/patient/${currentPatient.patientId}/latest/anamnesa`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) {
            console.log('[ANAMNESA] No previous data found for patient');
            return;
        }
        
        const result = await response.json();
        if (result.success && result.data && result.data.exam_data) {
            const data = result.data.exam_data;
            console.log('[ANAMNESA] Loading saved data:', data);
            
            // Populate form fields
            if (document.getElementById('anamnesa-complaint')) document.getElementById('anamnesa-complaint').value = data.complaint || '';
            if (document.getElementById('anamnesa-history')) document.getElementById('anamnesa-history').value = data.history || '';
            if (document.getElementById('anamnesa-pregnant')) {
                document.getElementById('anamnesa-pregnant').value = data.pregnant || '';
                // Trigger change event to show/hide sections
                document.getElementById('anamnesa-pregnant').dispatchEvent(new Event('change'));
            }
            
            // Pregnant section
            if (data.pregnant === 'ya') {
                if (document.getElementById('anamnesa-gravida')) document.getElementById('anamnesa-gravida').value = data.gravida || '';
                if (document.getElementById('anamnesa-term')) document.getElementById('anamnesa-term').value = data.term || '';
                if (document.getElementById('anamnesa-preterm')) document.getElementById('anamnesa-preterm').value = data.preterm || '';
                if (document.getElementById('anamnesa-abortion')) document.getElementById('anamnesa-abortion').value = data.abortion || '';
                if (document.getElementById('anamnesa-living')) document.getElementById('anamnesa-living').value = data.living || '';
                if (document.getElementById('anamnesa-hpht')) document.getElementById('anamnesa-hpht').value = data.hpht || '';
                if (document.getElementById('anamnesa-hpl')) document.getElementById('anamnesa-hpl').value = data.hpl || '';
                if (document.getElementById('anamnesa-preg-diagnosis')) document.getElementById('anamnesa-preg-diagnosis').value = data.diagnosis || '';
            }
            
            // Not pregnant section
            if (data.pregnant === 'tidak') {
                if (document.getElementById('anamnesa-not-preg-diagnosis')) document.getElementById('anamnesa-not-preg-diagnosis').value = data.diagnosis || '';
            }
            
            currentExamData.anamnesa = data;
        }
    } catch (error) {
        console.error('[ANAMNESA] Error loading data:', error);
    }
}

export async function loadPhysicalExamData() {
    if (!currentPatient || !currentPatient.patientId) {
        console.warn('[PHYSICAL] No patient selected');
        return;
    }
    
    try {
        const token = await getIdToken();
        const response = await fetch(`${VPS_API_BASE}/api/medical-exams/patient/${currentPatient.patientId}/latest/physical`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) {
            console.log('[PHYSICAL] No previous data found for patient');
            return;
        }
        
        const result = await response.json();
        if (result.success && result.data && result.data.exam_data) {
            const data = result.data.exam_data;
            console.log('[PHYSICAL] Loading saved data:', data);
            
            // Populate form fields
            if (document.getElementById('physical-bp-systolic')) document.getElementById('physical-bp-systolic').value = data.bpSystolic || '';
            if (document.getElementById('physical-bp-diastolic')) document.getElementById('physical-bp-diastolic').value = data.bpDiastolic || '';
            if (document.getElementById('physical-pulse')) document.getElementById('physical-pulse').value = data.pulse || '';
            if (document.getElementById('physical-temp')) document.getElementById('physical-temp').value = data.temp || '';
            if (document.getElementById('physical-resp')) document.getElementById('physical-resp').value = data.resp || '';
            if (document.getElementById('physical-weight')) document.getElementById('physical-weight').value = data.weight || '';
            if (document.getElementById('physical-height')) document.getElementById('physical-height').value = data.height || '';
            if (document.getElementById('physical-general-condition')) document.getElementById('physical-general-condition').value = data.generalCondition || '';
            if (document.getElementById('physical-consciousness')) document.getElementById('physical-consciousness').value = data.consciousness || '';
            if (document.getElementById('physical-notes')) document.getElementById('physical-notes').value = data.notes || '';
            
            currentExamData.physical = data;
        }
    } catch (error) {
        console.error('[PHYSICAL] Error loading data:', error);
    }
}

export async function loadUSGExamData() {
    if (!currentPatient || !currentPatient.patientId) {
        console.warn('[USG] No patient selected');
        return;
    }
    
    try {
        const token = await getIdToken();
        const response = await fetch(`${VPS_API_BASE}/api/medical-exams/patient/${currentPatient.patientId}/latest/usg`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) {
            console.log('[USG] No previous data found for patient');
            return;
        }
        
        const result = await response.json();
        if (result.success && result.data && result.data.exam_data) {
            const data = result.data.exam_data;
            console.log('[USG] Loading saved data:', data);
            
            // Check pregnancy status to show correct section
            const anamnesaSelect = document.getElementById('anamnesa-pregnant');
            const pregnantStatus = anamnesaSelect ? anamnesaSelect.value : data.pregnant;
            
            if (pregnantStatus === 'ya' && data.obstetri) {
                // Load obstetri data
                const obs = data.obstetri;
                if (document.getElementById('usg-ga-weeks')) document.getElementById('usg-ga-weeks').value = obs.gaWeeks || '';
                if (document.getElementById('usg-ga-days')) document.getElementById('usg-ga-days').value = obs.gaDays || '';
                if (document.getElementById('usg-ac')) document.getElementById('usg-ac').value = obs.ac || '';
                if (document.getElementById('usg-hc')) document.getElementById('usg-hc').value = obs.hc || '';
                if (document.getElementById('usg-fl')) document.getElementById('usg-fl').value = obs.fl || '';
                if (document.getElementById('usg-bpd')) document.getElementById('usg-bpd').value = obs.bpd || '';
                if (document.getElementById('usg-efw')) document.getElementById('usg-efw').value = obs.efw || '';
                if (document.getElementById('usg-amniotic-fluid')) document.getElementById('usg-amniotic-fluid').value = obs.amnioticFluid || '';
                if (document.getElementById('usg-placenta-location')) document.getElementById('usg-placenta-location').value = obs.placentaLocation || '';
                if (document.getElementById('usg-fetal-heartbeat')) document.getElementById('usg-fetal-heartbeat').value = obs.fetalHeartbeat || '';
                if (document.getElementById('usg-fetal-position')) document.getElementById('usg-fetal-position').value = obs.fetalPosition || '';
                if (document.getElementById('usg-notes')) document.getElementById('usg-notes').value = obs.notes || '';
            } else if (pregnantStatus === 'tidak' && data.gynecology) {
                // Load gynecology data
                const gyn = data.gynecology;
                if (document.getElementById('usg-gyn-uterus-size')) document.getElementById('usg-gyn-uterus-size').value = gyn.uterusSize || '';
                if (document.getElementById('usg-gyn-myoma')) document.getElementById('usg-gyn-myoma').checked = gyn.myoma || false;
                if (document.getElementById('usg-gyn-ovarian-cyst')) document.getElementById('usg-gyn-ovarian-cyst').checked = gyn.ovarianCyst || false;
                if (document.getElementById('usg-gyn-polyp')) document.getElementById('usg-gyn-polyp').checked = gyn.polyp || false;
                if (document.getElementById('usg-gyn-endo-thickness')) document.getElementById('usg-gyn-endo-thickness').value = gyn.endoThickness || '';
                if (document.getElementById('usg-gyn-free-fluid')) document.getElementById('usg-gyn-free-fluid').checked = gyn.freeFluid || false;
                if (document.getElementById('usg-gyn-adhesion')) document.getElementById('usg-gyn-adhesion').checked = gyn.adhesion || false;
                if (document.getElementById('usg-gyn-notes')) document.getElementById('usg-gyn-notes').value = gyn.notes || '';
            }
            
            currentExamData.usg = data;
        }
    } catch (error) {
        console.error('[USG] Error loading data:', error);
    }
}

export async function loadLabExamData() {
    if (!currentPatient || !currentPatient.patientId) {
        console.warn('[LAB] No patient selected');
        return;
    }
    
    try {
        const token = await getIdToken();
        const response = await fetch(`${VPS_API_BASE}/api/medical-exams/patient/${currentPatient.patientId}/latest/lab`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) {
            console.log('[LAB] No previous data found for patient');
            return;
        }
        
        const result = await response.json();
        if (result.success && result.data && result.data.exam_data) {
            const data = result.data.exam_data;
            console.log('[LAB] Loading saved data:', data);
            
            // Populate form fields
            if (document.getElementById('lab-test-type')) document.getElementById('lab-test-type').value = data.testType || '';
            if (document.getElementById('lab-results')) document.getElementById('lab-results').value = data.results || '';
            if (document.getElementById('lab-conclusion')) document.getElementById('lab-conclusion').value = data.conclusion || '';
            
            currentExamData.lab = data;
        }
    } catch (error) {
        console.error('[LAB] Error loading data:', error);
    }
}

// Track if already initialized to prevent duplicate event listeners
let anamnesaInitialized = false;
let physicalInitialized = false;
let usgInitialized = false;
let labInitialized = false;

// Initialize Anamnesa page
function initAnamnesa() {
    if (anamnesaInitialized) return; // Prevent duplicate initialization
    anamnesaInitialized = true;
    
    const form = document.getElementById('anamnesa-form');
    const pregnantSelect = document.getElementById('anamnesa-pregnant');
    const pregSection = document.getElementById('anamnesa-preg-section');
    const notPregSection = document.getElementById('anamnesa-not-preg-section');
    const diagnosisDisplay = document.getElementById('anamnesa-diagnosis-display');
    
    // Toggle pregnancy section
    if (pregnantSelect) {
        pregnantSelect.addEventListener('change', () => {
            const value = pregnantSelect.value;
            
            if (value === 'ya') {
                // Show pregnant section, hide not pregnant
                if (pregSection) pregSection.classList.remove('d-none');
                if (notPregSection) notPregSection.classList.add('d-none');
            } else if (value === 'tidak') {
                // Show not pregnant section, hide pregnant
                if (pregSection) pregSection.classList.add('d-none');
                if (notPregSection) notPregSection.classList.remove('d-none');
                if (diagnosisDisplay) diagnosisDisplay.textContent = '';
            } else {
                // Hide both
                if (pregSection) pregSection.classList.add('d-none');
                if (notPregSection) notPregSection.classList.add('d-none');
                if (diagnosisDisplay) diagnosisDisplay.textContent = '';
            }
        });
    }
    
    // Update diagnosis in real-time
    const obstetriFields = [
        'anamnesa-gravida',
        'anamnesa-term',
        'anamnesa-preterm',
        'anamnesa-abortion',
        'anamnesa-living'
    ];
    
    obstetriFields.forEach(fieldId => {
        const field = document.getElementById(fieldId);
        if (field) {
            field.addEventListener('change', updateAnamnesaDiagnosis);
            field.addEventListener('input', updateAnamnesaDiagnosis);
        }
    });
    
    // Form submission
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            await saveAnamnesa();
        });
    }
}

function updateAnamnesaDiagnosis() {
    const diagnosisDisplay = document.getElementById('anamnesa-diagnosis-display');
    if (!diagnosisDisplay) return;
    
    const gravida = document.getElementById('anamnesa-gravida')?.value || '';
    const term = document.getElementById('anamnesa-term')?.value || '';
    const preterm = document.getElementById('anamnesa-preterm')?.value || '';
    const abortion = document.getElementById('anamnesa-abortion')?.value || '';
    const living = document.getElementById('anamnesa-living')?.value || '';
    
    let diagnosis = '';
    if (gravida) {
        diagnosis = `G${gravida}`;
        if (term || preterm || abortion || living) {
            diagnosis += ` P${term}${preterm}${abortion}${living}`;
        }
    }
    
    diagnosisDisplay.textContent = diagnosis;
}

async function saveAnamnesa() {
    if (!currentPatient) {
        showError('Tidak ada pasien yang dipilih');
        return;
    }
    
    try {
        const pregnantStatus = document.getElementById('anamnesa-pregnant')?.value || '';
        
        // Get data based on pregnancy status
        let allergy = '';
        let history = '';
        let hpht = '';
        
        if (pregnantStatus === 'ya') {
            allergy = document.getElementById('anamnesa-allergy')?.value || '';
            history = document.getElementById('anamnesa-history')?.value || '';
            hpht = document.getElementById('anamnesa-hpht')?.value || '';
        } else if (pregnantStatus === 'tidak') {
            allergy = document.getElementById('anamnesa-allergy-notpreg')?.value || '';
            history = document.getElementById('anamnesa-history-notpreg')?.value || '';
            hpht = document.getElementById('anamnesa-hpht-notpreg')?.value || '';
        }
        
        const data = {
            patientId: currentPatient.patientId,
            patientName: currentPatient.name,
            pregnant: pregnantStatus,
            gravida: document.getElementById('anamnesa-gravida')?.value || '',
            term: document.getElementById('anamnesa-term')?.value || '',
            preterm: document.getElementById('anamnesa-preterm')?.value || '',
            abortion: document.getElementById('anamnesa-abortion')?.value || '',
            living: document.getElementById('anamnesa-living')?.value || '',
            allergy: allergy,
            history: history,
            hpht: hpht,
            complaint: document.getElementById('anamnesa-complaint')?.value || '',
            currentIllness: document.getElementById('anamnesa-current-illness')?.value || '',
            examiner: auth.currentUser?.name || auth.currentUser?.email || 'Staff',
            examinerEmail: auth.currentUser?.email || null,
            timestamp: new Date().toISOString()
        };
        
        currentExamData.anamnesa = data;
        
        // Save to session
        updateSessionAnamnesa(data);
        
        // Save to VPS API
        const token = await getIdToken();
        const examData = {
            patient_id: parseInt(currentPatient.patientId),
            exam_type: 'anamnesa',
            exam_data: JSON.stringify(data),
            examiner: auth.currentUser?.name || auth.currentUser?.email || 'Staff',
            exam_date: new Date().toISOString().split('T')[0]
        };
        
        await fetch(`${VPS_API_BASE}/api/medical-exams`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(examData)
        });
        
        // Broadcast anamnesa update to other users
        broadcastAnamnesaUpdate(currentPatient.patientId || currentPatient.id, currentPatient.name);
        
        showSuccess('Anamnesa berhasil disimpan!');
    } catch (err) {
        console.error('Failed to save anamnesa:', err);
        showError('Gagal menyimpan anamnesa. Silakan coba lagi.');
    }
}

// Initialize Physical Exam page
function initPhysicalExam() {
    if (physicalInitialized) return; // Prevent duplicate initialization
    physicalInitialized = true;
    
    const form = document.getElementById('physical-exam-form');
    
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            await savePhysicalExam();
        });
    }
}

async function savePhysicalExam() {
    if (!currentPatient) {
        showError('Tidak ada pasien yang dipilih');
        return;
    }
    
    try {
        const data = {
            patientId: currentPatient.patientId,
            patientName: currentPatient.name,
            bpSystolic: document.getElementById('physical-bp-systolic')?.value || '',
            bpDiastolic: document.getElementById('physical-bp-diastolic')?.value || '',
            pulse: document.getElementById('physical-pulse')?.value || '',
            temp: document.getElementById('physical-temp')?.value || '',
            resp: document.getElementById('physical-resp')?.value || '',
            weight: document.getElementById('physical-weight')?.value || '',
            height: document.getElementById('physical-height')?.value || '',
            generalCondition: document.getElementById('physical-general-condition')?.value || '',
            consciousness: document.getElementById('physical-consciousness')?.value || '',
            notes: document.getElementById('physical-notes')?.value || '',
            examiner: auth.currentUser?.name || auth.currentUser?.email || 'Staff',
            examinerEmail: auth.currentUser?.email || null,
            timestamp: new Date().toISOString()
        };
        
        currentExamData.physical = data;
        
        // Save to session
        updateSessionPhysical(data);
        
        // Save to VPS API
        const token = await getIdToken();
        const examData = {
            patient_id: parseInt(currentPatient.patientId),
            exam_type: 'physical',
            exam_data: JSON.stringify(data),
            examiner: auth.currentUser?.name || auth.currentUser?.email || 'Staff',
            exam_date: new Date().toISOString().split('T')[0]
        };
        
        await fetch(`${VPS_API_BASE}/api/medical-exams`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(examData)
        });
        
        // Broadcast physical exam update to other users
        broadcastPhysicalExamUpdate(currentPatient.patientId || currentPatient.id, currentPatient.name);
        
        showSuccess('Pemeriksaan Fisik berhasil disimpan!');
    } catch (err) {
        console.error('Failed to save physical exam:', err);
        showError('Gagal menyimpan pemeriksaan fisik. Silakan coba lagi.');
    }
}

// Initialize USG Exam page
function initUSGExam() {
    if (usgInitialized) return; // Prevent duplicate initialization
    usgInitialized = true;
    
    const form = document.getElementById('usg-exam-form');
    const gynSection = document.getElementById('usg-gynecology-section');
    const obstetriSection = document.getElementById('usg-obstetri-section');
    
    // Handle myoma checkbox and dynamic inputs
    const myomaCheckbox = document.getElementById('usg-gyn-myoma');
    const myomaDetailSection = document.getElementById('myoma-detail-section');
    const myomaCountSelect = document.getElementById('myoma-count');
    const myomaSizesContainer = document.getElementById('myoma-sizes');
    
    if (myomaCheckbox && myomaDetailSection) {
        myomaCheckbox.addEventListener('change', () => {
            if (myomaCheckbox.checked) {
                myomaDetailSection.classList.remove('d-none');
            } else {
                myomaDetailSection.classList.add('d-none');
                if (myomaCountSelect) myomaCountSelect.value = '';
                if (myomaSizesContainer) myomaSizesContainer.innerHTML = '';
            }
        });
    }
    
    if (myomaCountSelect && myomaSizesContainer) {
        myomaCountSelect.addEventListener('change', () => {
            const count = parseInt(myomaCountSelect.value) || 0;
            myomaSizesContainer.innerHTML = '';
            
            for (let i = 1; i <= count; i++) {
                const div = document.createElement('div');
                div.className = 'form-group';
                div.innerHTML = `
                    <label class="small text-muted">Ukuran myoma ${i}</label>
                    <input type="text" id="myoma-size-${i}" class="form-control form-control-sm" placeholder="Contoh: 3 x 2 cm">
                `;
                myomaSizesContainer.appendChild(div);
            }
        });
    }
    
    // Check pregnancy status from session or anamnesa dropdown
    const checkPregnancyStatus = () => {
        // Try from currentExamData first
        let pregnantStatus = currentExamData.anamnesa?.pregnant;
        
        // If not found, check anamnesa dropdown directly
        if (!pregnantStatus) {
            const anamnesaSelect = document.getElementById('anamnesa-pregnant');
            if (anamnesaSelect) {
                pregnantStatus = anamnesaSelect.value;
            }
        }
        
        console.log('USG Page - Pregnancy status:', pregnantStatus);
        
        if (pregnantStatus === 'ya') {
            if (obstetriSection) obstetriSection.classList.remove('d-none');
            if (gynSection) gynSection.classList.add('d-none');
            console.log('Showing Obstetri section');
        } else if (pregnantStatus === 'tidak') {
            if (gynSection) gynSection.classList.remove('d-none');
            if (obstetriSection) obstetriSection.classList.add('d-none');
            console.log('Showing Ginekologi section');
        } else {
            // Hide both if not selected
            if (gynSection) gynSection.classList.add('d-none');
            if (obstetriSection) obstetriSection.classList.add('d-none');
            console.log('No pregnancy status - hiding both sections');
        }
    };
    
    // Check on page load
    checkPregnancyStatus();
    
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            await saveUSGExam();
        });
    }
}

async function saveUSGExam() {
    if (!currentPatient) {
        showError('Tidak ada pasien yang dipilih');
        return;
    }
    
    try {
        const anamnesaData = currentExamData.anamnesa;
        const isPregnant = anamnesaData?.pregnant === 'ya';
        
        let data = {
            patientId: currentPatient.patientId,
            patientName: currentPatient.name,
            examType: isPregnant ? 'obstetri' : 'ginekologi',
            examiner: auth.currentUser?.name || auth.currentUser?.email || 'Staff',
            examinerEmail: auth.currentUser?.email || null,
            timestamp: new Date().toISOString()
        };
        
        if (isPregnant) {
            // Obstetri data
            data = {
                ...data,
                fetusCount: document.getElementById('usg-fetus-count')?.value || '',
                presentation: document.getElementById('usg-presentation')?.value || '',
                fhr: document.getElementById('usg-fhr')?.value || '',
                fetalMovement: document.getElementById('usg-fetal-movement')?.value || '',
                amnioticFluid: document.getElementById('usg-amniotic-fluid')?.value || '',
                placenta: document.getElementById('usg-placenta')?.value || '',
                bpd: document.getElementById('usg-bpd')?.value || '',
                fl: document.getElementById('usg-fl')?.value || '',
                ac: document.getElementById('usg-ac')?.value || '',
                hc: document.getElementById('usg-hc')?.value || '',
                efw: document.getElementById('usg-efw')?.value || '',
                gaWeeks: document.getElementById('usg-ga-weeks')?.value || '',
                gaDays: document.getElementById('usg-ga-days')?.value || '',
                notes: document.getElementById('usg-notes')?.value || ''
            };
        } else {
            // Ginekologi checklist data
            const myomaChecked = document.getElementById('usg-gyn-myoma')?.checked || false;
            const myomaCount = parseInt(document.getElementById('myoma-count')?.value) || 0;
            const myomaSizes = [];
            
            if (myomaChecked && myomaCount > 0) {
                for (let i = 1; i <= myomaCount; i++) {
                    const sizeInput = document.getElementById(`myoma-size-${i}`);
                    if (sizeInput) {
                        myomaSizes.push(sizeInput.value || '');
                    }
                }
            }
            
            data = {
                ...data,
                uterusNormal: document.getElementById('usg-gyn-uterus-normal')?.checked || false,
                uterusAnteverted: document.getElementById('usg-gyn-uterus-anteverted')?.checked || false,
                uterusRetroverted: document.getElementById('usg-gyn-uterus-retroverted')?.checked || false,
                myoma: myomaChecked,
                myomaCount: myomaCount,
                myomaSizes: myomaSizes,
                adenomyosis: document.getElementById('usg-gyn-adenomyosis')?.checked || false,
                uterusSize: document.getElementById('usg-gyn-uterus-size')?.value || '',
                ovaryNormal: document.getElementById('usg-gyn-ovary-normal')?.checked || false,
                cystRight: document.getElementById('usg-gyn-cyst-right')?.checked || false,
                cystLeft: document.getElementById('usg-gyn-cyst-left')?.checked || false,
                pcos: document.getElementById('usg-gyn-pcos')?.checked || false,
                endometrioma: document.getElementById('usg-gyn-endometrioma')?.checked || false,
                endoNormal: document.getElementById('usg-gyn-endo-normal')?.checked || false,
                endoThick: document.getElementById('usg-gyn-endo-thick')?.checked || false,
                polyp: document.getElementById('usg-gyn-polyp')?.checked || false,
                endoThickness: document.getElementById('usg-gyn-endo-thickness')?.value || '',
                freeFluid: document.getElementById('usg-gyn-free-fluid')?.checked || false,
                adhesion: document.getElementById('usg-gyn-adhesion')?.checked || false,
                notes: document.getElementById('usg-gyn-notes')?.value || ''
            };
        }
        
        currentExamData.usg = data;
        
        // Save to session
        updateSessionUSG(data);
        
        // Save to VPS API
        const token = await getIdToken();
        const examData = {
            patient_id: parseInt(currentPatient.patientId),
            exam_type: 'usg',
            exam_data: JSON.stringify(data),
            examiner: auth.currentUser?.name || auth.currentUser?.email || 'Staff',
            exam_date: new Date().toISOString().split('T')[0]
        };
        
        await fetch(`${VPS_API_BASE}/api/medical-exams`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(examData)
        });
        
        // Broadcast USG exam update to other users
        broadcastUSGExamUpdate(currentPatient.patientId || currentPatient.id, currentPatient.name);
        
        showSuccess('Hasil USG berhasil disimpan!');
    } catch (err) {
        console.error('Failed to save USG exam:', err);
        showError('Gagal menyimpan hasil USG. Silakan coba lagi.');
    }
}

// Initialize Lab Exam page
function initLabExam() {
    if (labInitialized) return; // Prevent duplicate initialization
    labInitialized = true;
    
    const form = document.getElementById('lab-exam-form');
    const uploadInput = document.getElementById('lab-upload');
    const aiBtn = document.getElementById('lab-ai-interpret-btn');
    const preview = document.getElementById('lab-preview');
    const previewImg = document.getElementById('lab-preview-img');
    const aiLoading = document.getElementById('lab-ai-loading');
    
    // Handle file upload
    if (uploadInput) {
        uploadInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file && file.type.startsWith('image/')) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    if (previewImg) previewImg.src = event.target.result;
                    if (preview) preview.classList.remove('d-none');
                    if (aiBtn) aiBtn.disabled = false;
                };
                reader.readAsDataURL(file);
            }
        });
    }
    
    // Handle AI interpretation with Google Gemini
    if (aiBtn) {
        aiBtn.addEventListener('click', async () => {
            const fileInput = document.getElementById('lab-upload');
            const file = fileInput?.files[0];
            
            if (!file) {
                showError('Upload gambar hasil lab terlebih dahulu.');
                return;
            }
            
            if (aiLoading) aiLoading.classList.remove('d-none');
            if (aiBtn) aiBtn.disabled = true;
            
            try {
                console.log('Starting AI analysis...');
                console.log('File type:', file.type);
                console.log('File size:', file.size, 'bytes');
                
                // Read image as base64
                const base64Data = await readFileAsBase64(file);
                console.log('Base64 length:', base64Data.base64.length);
                
                // Call Gemini API
                const result = await analyzeLabWithGemini(base64Data.base64, base64Data.mimeType, currentPatient);
                
                const resultsTextarea = document.getElementById('lab-results');
                if (resultsTextarea) {
                    resultsTextarea.value = result;
                }
                
                if (aiLoading) aiLoading.classList.add('d-none');
                if (aiBtn) aiBtn.disabled = false;
                
                showSuccess('AI telah menganalisis hasil lab!');
            } catch (error) {
                console.error('AI Analysis error:', error);
                console.error('Error details:', error.stack);
                if (aiLoading) aiLoading.classList.add('d-none');
                if (aiBtn) aiBtn.disabled = false;
                showError('Gagal menganalisis: ' + error.message);
            }
        });
    }
    
    // Form submission
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            await saveLabExam();
        });
    }
}

// Helper function to read file as base64
function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            // Extract mime type and base64 data
            const dataUrl = reader.result;
            const [header, base64] = dataUrl.split(',');
            const mimeType = header.match(/:(.*?);/)[1];
            
            resolve({ base64, mimeType });
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// List available Gemini models
async function listAvailableModels(apiKey) {
    const LIST_URL = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    try {
        const response = await fetch(LIST_URL);
        if (response.ok) {
            const data = await response.json();
            console.log('Available models:', data.models?.map(m => m.name));
            return data.models || [];
        }
    } catch (error) {
        console.error('Failed to list models:', error);
    }
    return [];
}

// Analyze lab results with Gemini 2.0 Flash (Fast and Free)
async function analyzeLabWithGemini(base64Image, mimeType, patient) {
    // You can use OpenAI API key or Gemini API key
    const OPENAI_API_KEY = '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'; // Get from https://platform.openai.com/api-keys
    const USE_GEMINI = true; // Set to false to use OpenAI (requires active subscription)
    const GEMINI_API_KEY = 'AIzaSyDdF1Gk1FfrVPzYEc6NwuoJYFFJCVK-2TQ';
    
    const patientName = patient?.name || 'Pasien';
    const prompt = `Anda adalah dokter spesialis patologi klinis yang berpengalaman. Analisis hasil laboratorium pada gambar ini untuk pasien bernama ${patientName}.

Berikan laporan dalam format berikut:

HASIL LABORATORIUM:
[Tuliskan semua parameter yang terlihat dengan nilai dan satuannya]

INTERPRETASI:
[Analisis setiap parameter - apakah normal, tinggi, atau rendah. Sebutkan nilai normal untuk referensi]

KESIMPULAN:
[Ringkasan kondisi pasien berdasarkan hasil lab]

REKOMENDASI:
[Saran tindak lanjut jika diperlukan]

Gunakan bahasa Indonesia yang profesional dan mudah dipahami.`;

    if (!USE_GEMINI) {
        // Use OpenAI GPT-4 Vision (FASTER - typically 2-5 seconds)
        if (!OPENAI_API_KEY || OPENAI_API_KEY === 'YOUR_OPENAI_API_KEY_HERE') {
            throw new Error('API Key OpenAI belum diset. Set USE_GEMINI = false dan update OPENAI_API_KEY');
        }
        
        console.log('Using OpenAI GPT-4 Vision...');
        
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: 'gpt-4o',
                messages: [{
                    role: 'user',
                    content: [
                        { type: 'text', text: prompt },
                        { 
                            type: 'image_url', 
                            image_url: {
                                url: `data:${mimeType};base64,${base64Image}`,
                                detail: 'high'
                            }
                        }
                    ]
                }],
                max_tokens: 2048,
                temperature: 0.3
            })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(`OpenAI Error: ${error.error?.message || 'Unknown error'}`);
        }
        
        const data = await response.json();
        console.log('✓ OpenAI analysis complete');
        return data.choices[0].message.content;
    } else {
        // Use Gemini Flash 2.0 (Fastest Gemini model - 3-8 seconds)
        if (!GEMINI_API_KEY || GEMINI_API_KEY === 'YOUR_GEMINI_API_KEY_HERE') {
            throw new Error('API Key Gemini belum diset');
        }
        
        console.log('Using Gemini 2.0 Flash (fastest)...');
        
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        { text: prompt },
                        {
                            inline_data: {
                                mime_type: mimeType || "image/jpeg",
                                data: base64Image
                            }
                        }
                    ]
                }],
                generationConfig: {
                    temperature: 0.3,
                    maxOutputTokens: 2048
                }
            })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(`Gemini Error: ${error.error?.message || 'Unknown error'}`);
        }
        
        const data = await response.json();
        const result = data.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (!result) {
            throw new Error('No result from Gemini');
        }
        
        console.log('✓ Gemini analysis complete');
        return result;
    }
}

async function saveLabExam() {
    if (!currentPatient) {
        showError('Tidak ada pasien yang dipilih');
        return;
    }
    
    try {
        const data = {
            patientId: currentPatient.patientId,
            patientName: currentPatient.name,
            testType: document.getElementById('lab-test-type')?.value || '',
            results: document.getElementById('lab-results')?.value || '',
            conclusion: document.getElementById('lab-conclusion')?.value || '',
            examiner: auth.currentUser?.name || auth.currentUser?.email || 'Staff',
            examinerEmail: auth.currentUser?.email || null,
            timestamp: new Date().toISOString()
        };
        
        currentExamData.lab = data;
        
        // Save to session
        updateSessionLab(data);
        
        // Save to VPS API
        const token = await getIdToken();
        const examData = {
            patient_id: parseInt(currentPatient.patientId),
            exam_type: 'lab',
            exam_data: JSON.stringify(data),
            examiner: auth.currentUser?.name || auth.currentUser?.email || 'Staff',
            exam_date: new Date().toISOString().split('T')[0]
        };
        
        await fetch(`${VPS_API_BASE}/api/medical-exams`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(examData)
        });
        
        // Broadcast lab exam update to other users
        broadcastLabExamUpdate(currentPatient.patientId || currentPatient.id, currentPatient.name);
        
        showSuccess('Hasil Lab berhasil disimpan!');
    } catch (err) {
        console.error('Failed to save lab exam:', err);
        showError('Gagal menyimpan hasil lab. Silakan coba lagi.');
    }
}

// Initialize all medical exam pages
export function initMedicalExam() {
    initAnamnesa();
    initPhysicalExam();
    initUSGExam();
    initLabExam();
}

// Get all exam data for current patient
export function getCurrentExamData() {
    return currentExamData;
}


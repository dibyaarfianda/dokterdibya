import { getIdToken, auth, signOut, initAuth } from './vps-auth-v2.js';
import { broadcastIntakeVerification } from './realtime-sync.js';

const API_BASE = (() => {
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        return 'http://localhost:3001';
    }
    return window.location.origin.replace(/\/$/, '');
})();

let currentPatientId = null;
let currentIntakeData = null;
let currentAppointmentData = null;

// Get patient ID from URL
function getPatientIdFromURL() {
    const params = new URLSearchParams(window.location.search);
    return params.get('patientId');
}

// Authorized fetch
async function authorizedFetch(path, options = {}) {
    const token = await getIdToken();
    if (!token) {
        window.location.href = 'login.html';
        throw new Error('Unauthorized');
    }
    const headers = new Headers(options.headers || {});
    if (!headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${token}`);
    }
    if (options.body && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
    }
    return fetch(`${API_BASE}${path}`, { ...options, headers });
}

// Show alert
function showAlert(message, type = 'success') {
    const alert = $(`
        <div class="alert alert-${type} alert-dismissible fade show" role="alert">
            ${message}
            <button type="button" class="close" data-dismiss="alert">
                <span>&times;</span>
            </button>
        </div>
    `);
    $('.content').prepend(alert);
    setTimeout(() => alert.alert('close'), 5000);
}

// Load patient data
async function loadPatientData() {
    try {
        const response = await authorizedFetch(`/api/patients/${currentPatientId}`);
        if (!response.ok) throw new Error('Failed to load patient');
        
        const result = await response.json();
        if (!result.success) throw new Error(result.message);
        
        const patient = result.data;
        
        // Update header
        document.getElementById('patient-name-header').textContent = patient.full_name || patient.name || 'Unknown';
        document.getElementById('patient-id-header').textContent = `ID: ${patient.id}`;
        document.getElementById('patient-age-header').textContent = patient.age ? `${patient.age} tahun` : '';
        document.getElementById('patient-phone-header').textContent = patient.whatsapp || patient.phone || '';
        
        return patient;
    } catch (error) {
        console.error('Error loading patient:', error);
        showAlert('Gagal memuat data pasien: ' + error.message, 'danger');
        return null;
    }
}

// Load verified intake data
async function loadVerifiedIntakeData(patient) {
    try {
        console.log('Loading verified intake data for patient:', patient.id);
        
        // Use the correct endpoint for patient-specific intake data
        const response = await authorizedFetch(`/api/patient-intake/by-patient/${patient.id}`);
        if (!response.ok) {
            throw new Error('Failed to load patient intake data');
        }
        
        const result = await response.json();
        if (!result.success) {
            throw new Error(result.message || 'Failed to get patient intake data');
        }
        
        console.log('Patient intake data response:', result);
        
        const intakes = result.data || [];
        console.log('Found intakes for patient:', intakes.length);
        
        // Find intake verified by staff (not auto_system)
        const verifiedIntake = intakes.find(intake => 
            intake.status === 'verified' && 
            intake.reviewed_by && 
            intake.reviewed_by !== 'auto_system'
        );
        
        console.log('Staff verified intake found:', verifiedIntake);
        
        if (verifiedIntake) {
            // Update title to show verified status
            const titleElement = document.querySelector('.card-header .card-title');
            if (titleElement) {
                titleElement.innerHTML = '<i class="fas fa-file-medical"></i> Data Intake Pasien (Terverifikasi)';
            }
            
            // Load full record with payload if needed
            let fullRecord = verifiedIntake;
            if (!verifiedIntake.payload && verifiedIntake.submissionId) {
                try {
                    console.log('Loading full record for:', verifiedIntake.submissionId);
                    const detailResponse = await authorizedFetch(`/api/patient-intake/${verifiedIntake.submissionId}`);
                    if (detailResponse.ok) {
                        const detailResult = await detailResponse.json();
                        if (detailResult.success && detailResult.data) {
                            fullRecord = detailResult.data;
                        }
                    }
                } catch (err) {
                    console.error('Error loading full record:', err);
                }
            }
            
            currentIntakeData = fullRecord;
            displayIntakeData(fullRecord);
        } else {
            // Update title to show not verified status
            const titleElement = document.querySelector('.card-header .card-title');
            if (titleElement) {
                titleElement.innerHTML = '<i class="fas fa-file-medical"></i> Data Intake Pasien';
            }
            
            // Show message to review intake through patient-intake-review.html
            document.getElementById('intake-data-container').innerHTML = 
                `<div class="alert alert-info">
                    <i class="fas fa-info-circle"></i> Belum ada data intake yang terverifikasi untuk pasien ini.
                    <br><br>
                    <a href="patient-intake-review.html" class="btn btn-primary btn-sm">
                        <i class="fas fa-clipboard-check"></i> Review Intake Pasien
                    </a>
                    <small class="text-muted d-block mt-2">
                        Data intake harus diverifikasi melalui halaman Review Intake terlebih dahulu sebelum dapat ditampilkan di sini.
                    </small>
                </div>`;
        }
        
        return verifiedIntake;
    } catch (error) {
        console.error('Error loading intake data:', error);
        document.getElementById('intake-data-container').innerHTML = 
            `<div class="alert alert-warning">
                <i class="fas fa-exclamation-triangle"></i> Tidak dapat memuat data intake: ${error.message}
            </div>`;
        return null;
    }
}

// Display intake data
function displayIntakeData(record) {
    const payload = record.payload || {};
    const metadata = payload.metadata || {};
    
    let html = '<div class="row">';
    
    // Basic Info
    html += '<div class="col-md-6"><div class="intake-data-section">';
    html += '<h6><i class="fas fa-user"></i> Informasi Dasar</h6>';
    html += '<dl class="row mb-0">';
    if (payload.full_name) html += `<dt class="col-sm-5">Nama:</dt><dd class="col-sm-7">${payload.full_name}</dd>`;
    if (payload.dob) html += `<dt class="col-sm-5">Tanggal Lahir:</dt><dd class="col-sm-7">${payload.dob} (${payload.age || '-'} tahun)</dd>`;
    if (payload.phone) html += `<dt class="col-sm-5">Telepon:</dt><dd class="col-sm-7">${payload.phone}</dd>`;
    if (payload.address) html += `<dt class="col-sm-5">Alamat:</dt><dd class="col-sm-7">${payload.address}</dd>`;
    if (payload.blood_type) html += `<dt class="col-sm-5">Golongan Darah:</dt><dd class="col-sm-7">${payload.blood_type} (${payload.rhesus || '-'})</dd>`;
    html += '</dl></div></div>';
    
    // Family Info
    html += '<div class="col-md-6"><div class="intake-data-section">';
    html += '<h6><i class="fas fa-users"></i> Keluarga & Sosial</h6>';
    html += '<dl class="row mb-0">';
    if (payload.marital_status) html += `<dt class="col-sm-5">Status:</dt><dd class="col-sm-7">${payload.marital_status}</dd>`;
    if (payload.husband_name) html += `<dt class="col-sm-5">Suami:</dt><dd class="col-sm-7">${payload.husband_name} (${payload.husband_age || '-'} tahun)</dd>`;
    if (payload.husband_job) html += `<dt class="col-sm-5">Pekerjaan Suami:</dt><dd class="col-sm-7">${payload.husband_job}</dd>`;
    if (payload.occupation) html += `<dt class="col-sm-5">Pekerjaan Ibu:</dt><dd class="col-sm-7">${payload.occupation}</dd>`;
    if (payload.education) html += `<dt class="col-sm-5">Pendidikan:</dt><dd class="col-sm-7">${payload.education}</dd>`;
    if (payload.payment_method) html += `<dt class="col-sm-5">Pembayaran:</dt><dd class="col-sm-7">${payload.payment_method}</dd>`;
    html += '</dl></div></div>';
    
    // Pregnancy Info
    html += '<div class="col-md-6"><div class="intake-data-section">';
    html += '<h6><i class="fas fa-baby"></i> Kehamilan Saat Ini</h6>';
    html += '<dl class="row mb-0">';
    if (payload.lmp) html += `<dt class="col-sm-5">HPHT:</dt><dd class="col-sm-7">${payload.lmp}</dd>`;
    if (metadata.edd?.value || payload.edd) html += `<dt class="col-sm-5">HPL:</dt><dd class="col-sm-7">${metadata.edd?.value || payload.edd}</dd>`;
    if (payload.first_check_ga) html += `<dt class="col-sm-5">Usia Kehamilan:</dt><dd class="col-sm-7">${payload.first_check_ga} minggu</dd>`;
    const totals = metadata.obstetricTotals || {};
    html += `<dt class="col-sm-5">G/P/A/L:</dt><dd class="col-sm-7">G${totals.gravida || '0'} P${totals.para || '0'} A${totals.abortus || '0'} L${totals.living || '0'}</dd>`;
    html += '</dl></div></div>';
    
    // Menstrual History
    html += '<div class="col-md-6"><div class="intake-data-section">';
    html += '<h6><i class="fas fa-calendar-alt"></i> Riwayat Haid</h6>';
    html += '<dl class="row mb-0">';
    if (payload.menarche_age) html += `<dt class="col-sm-5">Menarche:</dt><dd class="col-sm-7">${payload.menarche_age} tahun</dd>`;
    if (payload.cycle_length) html += `<dt class="col-sm-5">Siklus Haid:</dt><dd class="col-sm-7">${payload.cycle_length} hari</dd>`;
    if (payload.cycle_regular) html += `<dt class="col-sm-5">Teratur:</dt><dd class="col-sm-7">${payload.cycle_regular}</dd>`;
    if (payload.kb_failure) html += `<dt class="col-sm-5">Kegagalan KB:</dt><dd class="col-sm-7">${payload.kb_failure}</dd>`;
    html += '</dl></div></div>';
    
    // Medical History & Allergies
    html += '<div class="col-md-6"><div class="intake-data-section">';
    html += '<h6><i class="fas fa-notes-medical"></i> Riwayat Medis & Alergi</h6>';
    html += '<dl class="row mb-0">';
    if (payload.past_conditions && Array.isArray(payload.past_conditions)) {
        html += `<dt class="col-sm-5">Riwayat Penyakit:</dt><dd class="col-sm-7">${payload.past_conditions.join(', ')}</dd>`;
    }
    if (payload.family_history) html += `<dt class="col-sm-5">Riwayat Keluarga:</dt><dd class="col-sm-7">${payload.family_history} (${payload.family_history_detail || '-'})</dd>`;
    if (payload.allergy_drugs) html += `<dt class="col-sm-5">Alergi Obat:</dt><dd class="col-sm-7">${payload.allergy_drugs}</dd>`;
    if (payload.allergy_food) html += `<dt class="col-sm-5">Alergi Makanan:</dt><dd class="col-sm-7">${payload.allergy_food}</dd>`;
    if (payload.allergy_env) html += `<dt class="col-sm-5">Alergi Lingkungan:</dt><dd class="col-sm-7">${payload.allergy_env}</dd>`;
    html += '</dl></div></div>';
    
    // Current Medications
    if (payload.medications && Array.isArray(payload.medications) && payload.medications.length > 0) {
        html += '<div class="col-md-6"><div class="intake-data-section">';
        html += '<h6><i class="fas fa-pills"></i> Obat Saat Ini</h6>';
        html += '<ul class="mb-0">';
        payload.medications.forEach(med => {
            html += `<li>${med.name} ${med.dose} - ${med.freq}</li>`;
        });
        html += '</ul></div></div>';
    }
    
    // Risk Flags
    if (metadata.riskFlags && Array.isArray(metadata.riskFlags) && metadata.riskFlags.length > 0) {
        html += '<div class="col-12"><div class="intake-data-section">';
        html += '<h6><i class="fas fa-exclamation-triangle text-warning"></i> Faktor Risiko</h6>';
        html += '<div class="alert alert-warning mb-0">';
        html += '<ul class="mb-0">';
        metadata.riskFlags.forEach(flag => {
            html += `<li>${flag}</li>`;
        });
        html += '</ul></div></div></div>';
    }
    
    html += '</div>';
    
    document.getElementById('intake-data-container').innerHTML = html;
}

// Load appointment chief complaint
async function loadAppointmentChiefComplaint(patient) {
    try {
        // Try to get latest confirmed appointment for this patient
        const response = await authorizedFetch(`/api/sunday-appointments/patient-by-id?patientId=${patient.id}`);
        if (!response.ok) return null;
        
        const result = await response.json();
        if (!result.success || !result.appointments || result.appointments.length === 0) return null;
        
        // Find most recent confirmed appointment
        const confirmedAppointment = result.appointments
            .filter(apt => apt.status === 'confirmed')
            .sort((a, b) => new Date(b.appointment_date) - new Date(a.appointment_date))[0];
        
        if (confirmedAppointment && confirmedAppointment.chief_complaint) {
            console.log('Found appointment chief complaint:', confirmedAppointment.chief_complaint);
            return confirmedAppointment.chief_complaint;
        }
        
        return null;
    } catch (error) {
        console.error('Error loading appointment chief complaint:', error);
        return null;
    }
}

// Load saved medical records
async function loadMedicalRecords() {
    try {
        const response = await authorizedFetch(`/api/medical-records/${currentPatientId}`);
        if (!response.ok) return;
        
        const result = await response.json();
        if (!result.success || !result.data) return;
        
        const records = result.data;
        console.log('Loaded medical records:', records);
        
        // Load Anamnesa data
        const anamnesaRecord = records.find(r => r.record_type === 'anamnesa');
        if (anamnesaRecord && anamnesaRecord.record_data) {
            const data = anamnesaRecord.record_data;
            
            // Load comprehensive Anamnesa data
            if (data.patient_name) document.getElementById('patient_name').value = data.patient_name;
            if (data.patient_dob) document.getElementById('patient_dob').value = data.patient_dob;
            if (data.patient_age) document.getElementById('patient_age').value = data.patient_age;
            if (data.patient_address) document.getElementById('patient_address').value = data.patient_address;
            if (data.patient_phone) document.getElementById('patient_phone').value = data.patient_phone;
            if (data.patient_marital_status) document.getElementById('patient_marital_status').value = data.patient_marital_status;
            if (data.patient_occupation) document.getElementById('patient_occupation').value = data.patient_occupation;
            if (data.patient_education) document.getElementById('patient_education').value = data.patient_education;
            if (data.patient_husband_name) document.getElementById('patient_husband_name').value = data.patient_husband_name;
            
            if (data.keluhan_utama) document.getElementById('keluhan_utama').value = data.keluhan_utama;
            
            if (data.pregnancy_test_date) document.getElementById('pregnancy_test_date').value = data.pregnancy_test_date;
            if (data.blood_type) document.getElementById('blood_type').value = data.blood_type;
            if (data.rhesus_factor) document.getElementById('rhesus_factor').value = data.rhesus_factor;
            if (data.current_medical_conditions) document.getElementById('current_medical_conditions').value = data.current_medical_conditions;
            if (data.drug_allergies) document.getElementById('drug_allergies').value = data.drug_allergies;
            if (data.food_allergies) document.getElementById('food_allergies').value = data.food_allergies;
            if (data.other_allergies) document.getElementById('other_allergies').value = data.other_allergies;
            if (data.current_medications) document.getElementById('current_medications').value = data.current_medications;
            if (data.past_medical_history) document.getElementById('past_medical_history').value = data.past_medical_history;
            if (data.family_medical_history) document.getElementById('family_medical_history').value = data.family_medical_history;
            
            if (data.menarche_age) document.getElementById('menarche_age').value = data.menarche_age;
            if (data.cycle_length) document.getElementById('cycle_length').value = data.cycle_length;
            if (data.cycle_regular) document.getElementById('cycle_regular').value = data.cycle_regular;
            if (data.lmp_date) document.getElementById('lmp_date').value = data.lmp_date;
            if (data.gravida_count) document.getElementById('gravida_count').value = data.gravida_count;
            if (data.para_count) document.getElementById('para_count').value = data.para_count;
            if (data.abortus_count) document.getElementById('abortus_count').value = data.abortus_count;
            if (data.living_children_count) document.getElementById('living_children_count').value = data.living_children_count;
            if (data.previous_contraception) document.getElementById('previous_contraception').value = data.previous_contraception;
            if (data.contraception_failure) document.getElementById('contraception_failure').value = data.contraception_failure;
            if (data.failed_contraception_type) document.getElementById('failed_contraception_type').value = data.failed_contraception_type;
            
            if (data.pregnancy_history) loadPregnancyHistoryData(data.pregnancy_history);
            if (data.prenatal_care) loadPrenatalData(data.prenatal_care);
        }
        
        // Load Physical Exam data
        const physicalRecord = records.find(r => r.record_type === 'physical_exam');
        if (physicalRecord && physicalRecord.record_data) {
            const data = physicalRecord.record_data;
            if (data.tekanan_darah) document.getElementById('tekanan_darah').value = data.tekanan_darah;
            if (data.nadi) document.getElementById('nadi').value = data.nadi;
            if (data.suhu) document.getElementById('suhu').value = data.suhu;
            if (data.respirasi) document.getElementById('respirasi').value = data.respirasi;
            if (data.kepala_leher) document.getElementById('kepala_leher').value = data.kepala_leher;
            if (data.thorax) document.getElementById('thorax').value = data.thorax;
            if (data.abdomen) document.getElementById('abdomen').value = data.abdomen;
            if (data.ekstremitas) document.getElementById('ekstremitas').value = data.ekstremitas;
            if (data.pemeriksaan_obstetri) document.getElementById('pemeriksaan_obstetri').value = data.pemeriksaan_obstetri;
        }
        
        // Load USG data
        const usgRecord = records.find(r => r.record_type === 'usg');
        if (usgRecord && usgRecord.record_data) {
            const data = usgRecord.record_data;
            if (data.usg_date) document.getElementById('usg_date').value = data.usg_date;
            if (data.usia_kehamilan) document.getElementById('usia_kehamilan').value = data.usia_kehamilan;
            if (data.biometri) document.getElementById('biometri').value = data.biometri;
            if (data.anatomi_janin) document.getElementById('anatomi_janin').value = data.anatomi_janin;
            if (data.plasenta_air_ketuban) document.getElementById('plasenta_air_ketuban').value = data.plasenta_air_ketuban;
            if (data.kesimpulan_usg) document.getElementById('kesimpulan_usg').value = data.kesimpulan_usg;
        }
        
        // Load Lab data
        const labRecord = records.find(r => r.record_type === 'lab');
        if (labRecord && labRecord.record_data) {
            const data = labRecord.record_data;
            if (data.lab_results) document.getElementById('lab_results').value = data.lab_results;
            if (data.radiologi) document.getElementById('radiologi').value = data.radiologi;
            if (data.pemeriksaan_lain) document.getElementById('pemeriksaan_lain').value = data.pemeriksaan_lain;
            if (data.laboratory_tests) loadLabData(data.laboratory_tests);
        }
        
    } catch (error) {
        console.error('Error loading medical records:', error);
        // Don't show error to user - just log it (records may not exist yet)
    }
}

// Populate Enhanced Anamnesa Form with Integrated Data
async function populateAnamnesaForm(patient, intakeData, chiefComplaint) {
    console.log('Populating Anamnesa form with data:', { patient, intakeData, chiefComplaint });
    
    if (!patient) return;
    
    try {
        // Data Pasien Section
        if (patient.full_name || patient.name) {
            document.getElementById('patient_name').value = patient.full_name || patient.name;
        }
        
        if (patient.date_of_birth || patient.dob) {
            document.getElementById('patient_dob').value = patient.date_of_birth || patient.dob || '';
        }
        
        if (patient.age) {
            document.getElementById('patient_age').value = patient.age + ' tahun';
        }
        
        if (patient.address) {
            document.getElementById('patient_address').value = patient.address;
        }
        
        if (patient.whatsapp || patient.phone) {
            document.getElementById('patient_phone').value = patient.whatsapp || patient.phone;
        }
        
        // Load from intake data if available
        if (intakeData && intakeData.payload) {
            const payload = intakeData.payload;
            
            // Override with intake data if available
            if (payload.full_name) document.getElementById('patient_name').value = payload.full_name;
            if (payload.dob) document.getElementById('patient_dob').value = payload.dob;
            if (payload.age) document.getElementById('patient_age').value = payload.age + ' tahun';
            if (payload.address) document.getElementById('patient_address').value = payload.address;
            if (payload.phone) document.getElementById('patient_phone').value = payload.phone;
            if (payload.marital_status) document.getElementById('patient_marital_status').value = payload.marital_status;
            if (payload.occupation) document.getElementById('patient_occupation').value = payload.occupation;
            if (payload.education) document.getElementById('patient_education').value = payload.education;
            if (payload.husband_name) document.getElementById('patient_husband_name').value = payload.husband_name;
            
            // Keluhan Utama - from appointment chief complaint
            if (chiefComplaint) {
                document.getElementById('keluhan_utama').value = chiefComplaint;
            }
            
            // Riwayat Medis Section
            if (payload.pregnancy_test_date) {
                document.getElementById('pregnancy_test_date').value = payload.pregnancy_test_date;
            }
            if (payload.blood_type) {
                document.getElementById('blood_type').value = payload.blood_type;
            }
            if (payload.rhesus_factor) {
                document.getElementById('rhesus_factor').value = payload.rhesus_factor;
            }
            
            // Current Medical Conditions
            const conditions = [];
            if (payload.medical_conditions && Array.isArray(payload.medical_conditions)) {
                conditions.push(...payload.medical_conditions);
            }
            if (payload.other_conditions) {
                conditions.push(payload.other_conditions);
            }
            if (conditions.length > 0) {
                document.getElementById('current_medical_conditions').value = conditions.join('; ');
            }
            
            // Allergies
            if (payload.drug_allergies) {
                document.getElementById('drug_allergies').value = payload.drug_allergies;
            }
            if (payload.food_allergies) {
                document.getElementById('food_allergies').value = payload.food_allergies;
            }
            if (payload.other_allergies) {
                document.getElementById('other_allergies').value = payload.other_allergies;
            }
            
            // Current Medications
            if (payload.current_medications) {
                document.getElementById('current_medications').value = payload.current_medications;
            }
            
            // Past Medical History
            if (payload.past_medical_history) {
                document.getElementById('past_medical_history').value = payload.past_medical_history;
            }
            
            // Family Medical History
            const familyHistory = [];
            if (payload.family_medical_history && Array.isArray(payload.family_medical_history)) {
                familyHistory.push(...payload.family_medical_history);
            }
            if (payload.family_history_details) {
                familyHistory.push(payload.family_history_details);
            }
            if (familyHistory.length > 0) {
                document.getElementById('family_medical_history').value = familyHistory.join('; ');
            }
            
            // Status Obstetri Section
            // Riwayat Menstruasi
            if (payload.menarche_age) {
                document.getElementById('menarche_age').value = payload.menarche_age + ' tahun';
            }
            if (payload.cycle_length) {
                document.getElementById('cycle_length').value = payload.cycle_length;
            }
            if (payload.cycle_regular) {
                document.getElementById('cycle_regular').value = payload.cycle_regular;
            }
            if (payload.lmp_date) {
                document.getElementById('lmp_date').value = payload.lmp_date;
            }
            
            // Obstetric Counts
            if (payload.gravida_count) {
                document.getElementById('gravida_count').value = payload.gravida_count;
            }
            if (payload.para_count) {
                document.getElementById('para_count').value = payload.para_count;
            }
            if (payload.abortus_count) {
                document.getElementById('abortus_count').value = payload.abortus_count;
            }
            if (payload.living_children_count) {
                document.getElementById('living_children_count').value = payload.living_children_count;
            }
            
            // Pregnancy History Table
            if (payload.previous_pregnancies && Array.isArray(payload.previous_pregnancies)) {
                populatePregnancyHistory(payload.previous_pregnancies);
            }
            
            // Contraception History
            if (payload.previous_contraception) {
                document.getElementById('previous_contraception').value = payload.previous_contraception;
            }
            if (payload.contraception_failure) {
                document.getElementById('contraception_failure').value = payload.contraception_failure;
            }
            if (payload.failed_contraception_type) {
                document.getElementById('failed_contraception_type').value = payload.failed_contraception_type;
            }
        }
        
        console.log('Anamnesa form populated successfully');
        
    } catch (error) {
        console.error('Error populating Anamnesa form:', error);
    }
}

// Populate Pregnancy History Table
function populatePregnancyHistory(pregnancies) {
    const tableBody = document.getElementById('pregnancy-history-table');
    if (!tableBody || !pregnancies || pregnancies.length === 0) return;
    
    tableBody.innerHTML = '';
    
    pregnancies.forEach((pregnancy, index) => {
        const row = tableBody.insertRow();
        row.innerHTML = `
            <td>${index + 1}</td>
            <td><input type="number" class="form-control form-control-sm" value="${pregnancy.year || ''}" placeholder="Tahun"></td>
            <td>
                <select class="form-control form-control-sm">
                    <option value="">Pilih Mode</option>
                    <option value="Normal" ${pregnancy.delivery_mode === 'Normal' ? 'selected' : ''}>Normal</option>
                    <option value="Sectio Caesarea" ${pregnancy.delivery_mode === 'Sectio Caesarea' ? 'selected' : ''}>Sectio Caesarea</option>
                    <option value="Vakum" ${pregnancy.delivery_mode === 'Vakum' ? 'selected' : ''}>Vakum</option>
                    <option value="Forceps" ${pregnancy.delivery_mode === 'Forceps' ? 'selected' : ''}>Forceps</option>
                </select>
            </td>
            <td><input type="text" class="form-control form-control-sm" value="${pregnancy.complications || ''}" placeholder="Komplikasi"></td>
            <td><input type="number" class="form-control form-control-sm" value="${pregnancy.baby_weight || ''}" placeholder="gram"></td>
            <td>
                <select class="form-control form-control-sm">
                    <option value="">Pilih</option>
                    <option value="Ya" ${pregnancy.child_alive === 'Ya' || pregnancy.child_alive === true ? 'selected' : ''}>Ya</option>
                    <option value="Tidak" ${pregnancy.child_alive === 'Tidak' || pregnancy.child_alive === false ? 'selected' : ''}>Tidak</option>
                </select>
            </td>
        `;
    });
    
    // Add button to add more pregnancy history rows
    if (pregnancies.length > 0) {
        addPregnancyHistoryControls();
    }
}

// Add controls for pregnancy history table
function addPregnancyHistoryControls() {
    const tableContainer = document.querySelector('#pregnancy-history-table').closest('.table-responsive');
    if (tableContainer && !tableContainer.nextElementSibling?.classList.contains('pregnancy-controls')) {
        const controlsDiv = document.createElement('div');
        controlsDiv.className = 'pregnancy-controls mt-2';
        controlsDiv.innerHTML = `
            <button type="button" class="btn btn-sm btn-success" onclick="addPregnancyHistoryRow()">
                <i class="fas fa-plus"></i> Tambah Kehamilan
            </button>
        `;
        tableContainer.parentNode.insertBefore(controlsDiv, tableContainer.nextSibling);
    }
}

// Add new pregnancy history row
window.addPregnancyHistoryRow = function() {
    const tableBody = document.getElementById('pregnancy-history-table');
    const rowCount = tableBody.rows.length;
    
    const row = tableBody.insertRow();
    row.innerHTML = `
        <td>${rowCount + 1}</td>
        <td><input type="number" class="form-control form-control-sm" placeholder="Tahun"></td>
        <td>
            <select class="form-control form-control-sm">
                <option value="">Pilih Mode</option>
                <option value="Normal">Normal</option>
                <option value="Sectio Caesarea">Sectio Caesarea</option>
                <option value="Vakum">Vakum</option>
                <option value="Forceps">Forceps</option>
            </select>
        </td>
        <td><input type="text" class="form-control form-control-sm" placeholder="Komplikasi"></td>
        <td><input type="number" class="form-control form-control-sm" placeholder="gram"></td>
        <td>
            <select class="form-control form-control-sm">
                <option value="">Pilih</option>
                <option value="Ya">Ya</option>
                <option value="Tidak">Tidak</option>
            </select>
        </td>
    `;
};

// Load Appointment Chief Complaint and integrate into Anamnesa
async function loadAppointmentData() {
    try {
        const response = await authorizedFetch(`/api/appointments?patientId=${currentPatientId}`);
        if (!response.ok) return null;
        
        const result = await response.json();
        if (!result.success || !result.data) return null;
        
        // Find most recent confirmed appointment
        const appointments = result.data;
        const confirmedAppointment = appointments
            .filter(apt => apt.status === 'confirmed')
            .sort((a, b) => new Date(b.appointment_date) - new Date(a.appointment_date))[0];
        
        if (confirmedAppointment) {
            currentAppointmentData = confirmedAppointment;
            // Use notes field as chief complaint
            return confirmedAppointment.notes || null;
        }
        
        return null;
    } catch (error) {
        console.error('Error loading appointment data:', error);
        return null;
    }
}

// Save Anamnesa
window.saveAnamnesa = async function() {
    const data = {
        patientId: currentPatientId,
        type: 'anamnesa',
        data: {
            // Data Pasien
            patient_name: document.getElementById('patient_name').value,
            patient_dob: document.getElementById('patient_dob').value,
            patient_age: document.getElementById('patient_age').value,
            patient_address: document.getElementById('patient_address').value,
            patient_phone: document.getElementById('patient_phone').value,
            patient_marital_status: document.getElementById('patient_marital_status').value,
            patient_occupation: document.getElementById('patient_occupation').value,
            patient_education: document.getElementById('patient_education').value,
            patient_husband_name: document.getElementById('patient_husband_name').value,
            
            // Keluhan Utama
            keluhan_utama: document.getElementById('keluhan_utama').value,
            
            // Riwayat Medis
            pregnancy_test_date: document.getElementById('pregnancy_test_date').value,
            blood_type: document.getElementById('blood_type').value,
            rhesus_factor: document.getElementById('rhesus_factor').value,
            current_medical_conditions: document.getElementById('current_medical_conditions').value,
            drug_allergies: document.getElementById('drug_allergies').value,
            food_allergies: document.getElementById('food_allergies').value,
            other_allergies: document.getElementById('other_allergies').value,
            current_medications: document.getElementById('current_medications').value,
            past_medical_history: document.getElementById('past_medical_history').value,
            family_medical_history: document.getElementById('family_medical_history').value,
            
            // Status Obstetri
            menarche_age: document.getElementById('menarche_age').value,
            cycle_length: document.getElementById('cycle_length').value,
            cycle_regular: document.getElementById('cycle_regular').value,
            lmp_date: document.getElementById('lmp_date').value,
            gravida_count: document.getElementById('gravida_count').value,
            para_count: document.getElementById('para_count').value,
            abortus_count: document.getElementById('abortus_count').value,
            living_children_count: document.getElementById('living_children_count').value,
            previous_contraception: document.getElementById('previous_contraception').value,
            contraception_failure: document.getElementById('contraception_failure').value,
            failed_contraception_type: document.getElementById('failed_contraception_type').value,
            
            // Pregnancy History
            pregnancy_history: getPregnancyHistoryData(),
            
            // Prenatal Care
            prenatal_care: getPrenatalData()
        }
    };
    
    try {
        // Save the medical record
        await saveMedicalRecord(data, 'Anamnesa');
        
        // If there's intake data, mark it as reviewed by staff
        if (currentIntakeData && currentIntakeData.submissionId) {
            await markIntakeAsReviewed(currentIntakeData.submissionId);
        }
        
        showAlert('Anamnesa berhasil disimpan dan formulir pasien telah diverifikasi!', 'success');
    } catch (error) {
        console.error('Error saving anamnesa:', error);
        showAlert('Gagal menyimpan anamnesa: ' + error.message, 'danger');
    }
};

// Get Pregnancy History Data
function getPregnancyHistoryData() {
    const tableBody = document.getElementById('pregnancy-history-table');
    if (!tableBody) return [];
    
    const pregnancies = [];
    const rows = tableBody.rows;
    
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const cells = row.cells;
        
        const pregnancy = {
            year: cells[1].querySelector('input').value,
            delivery_mode: cells[2].querySelector('select').value,
            complications: cells[3].querySelector('input').value,
            baby_weight: cells[4].querySelector('input').value,
            child_alive: cells[5].querySelector('select').value
        };
        
        // Only add if at least year is filled
        if (pregnancy.year) {
            pregnancies.push(pregnancy);
        }
    }
    
    return pregnancies;
}

// Load Pregnancy History Data from saved records
function loadPregnancyHistoryData(pregnancies) {
    if (!pregnancies || pregnancies.length === 0) return;
    
    const tableBody = document.getElementById('pregnancy-history-table');
    if (!tableBody) return;
    
    tableBody.innerHTML = '';
    
    pregnancies.forEach((pregnancy, index) => {
        const row = tableBody.insertRow();
        row.innerHTML = `
            <td>${index + 1}</td>
            <td><input type="number" class="form-control form-control-sm" value="${pregnancy.year || ''}" placeholder="Tahun"></td>
            <td>
                <select class="form-control form-control-sm">
                    <option value="">Pilih Mode</option>
                    <option value="Normal" ${pregnancy.delivery_mode === 'Normal' ? 'selected' : ''}>Normal</option>
                    <option value="Sectio Caesarea" ${pregnancy.delivery_mode === 'Sectio Caesarea' ? 'selected' : ''}>Sectio Caesarea</option>
                    <option value="Vakum" ${pregnancy.delivery_mode === 'Vakum' ? 'selected' : ''}>Vakum</option>
                    <option value="Forceps" ${pregnancy.delivery_mode === 'Forceps' ? 'selected' : ''}>Forceps</option>
                </select>
            </td>
            <td><input type="text" class="form-control form-control-sm" value="${pregnancy.complications || ''}" placeholder="Komplikasi"></td>
            <td><input type="number" class="form-control form-control-sm" value="${pregnancy.baby_weight || ''}" placeholder="gram"></td>
            <td>
                <select class="form-control form-control-sm">
                    <option value="">Pilih</option>
                    <option value="Ya" ${pregnancy.child_alive === 'Ya' || pregnancy.child_alive === true ? 'selected' : ''}>Ya</option>
                    <option value="Tidak" ${pregnancy.child_alive === 'Tidak' || pregnancy.child_alive === false ? 'selected' : ''}>Tidak</option>
                </select>
            </td>
        `;
    });
    
    addPregnancyHistoryControls();
}

// Mark patient intake as reviewed by staff
async function markIntakeAsReviewed(submissionId) {
    try {
        // Get current user info for reviewer name
        const userInfo = await getCurrentUserInfo();
        const reviewerName = userInfo ? userInfo.name || userInfo.username : 'Staff Klinik';
        
        const response = await authorizedFetch(`/api/patient-intake/${submissionId}/review`, {
            method: 'PUT',
            body: JSON.stringify({
                status: 'verified',
                reviewedBy: reviewerName,
                notes: 'Form telah direview dan diverifikasi oleh staff melalui sistem Anamnesa'
            })
        });
        
        if (!response.ok) {
            throw new Error('Failed to mark intake as reviewed');
        }
        
        const result = await response.json();
        console.log('Intake marked as reviewed:', result);
        
        // Broadcast intake verification to other staff
        if (typeof broadcastIntakeVerification === 'function') {
            broadcastIntakeVerification(
                result.patient_info?.id || currentPatientId || 'unknown',
                result.patient_info?.full_name || result.patient_info?.name || 'Unknown Patient',
                submissionId,
                reviewerName
            );
        }
        
        // Send notification to patient
        await sendPatientNotification(submissionId, reviewerName);
        
    } catch (error) {
        console.error('Error marking intake as reviewed:', error);
        // Don't throw error here, as the medical record was already saved
    }
}

// Get current user information
async function getCurrentUserInfo() {
    try {
        const response = await authorizedFetch('/api/auth/me');
        if (response.ok) {
            const result = await response.json();
            return result.user;
        }
    } catch (error) {
        console.error('Error getting user info:', error);
    }
    return null;
}

// Send notification to patient about verification
async function sendPatientNotification(submissionId, reviewerName) {
    try {
        // This is a placeholder - you can implement actual notification system
        // For now, we'll just log it
        console.log(`Patient notification: Form ${submissionId} verified by ${reviewerName}`);
        
        // In a real implementation, you might call:
        // await authorizedFetch('/api/notifications/patient-verification', {
        //     method: 'POST',
        //     body: JSON.stringify({
        //         submissionId,
        //         reviewerName,
        //         message: `Formulir rekam medis Anda telah diverifikasi oleh ${reviewerName}`
        //     })
        // });
        
    } catch (error) {
        console.error('Error sending patient notification:', error);
    }
}

// Save Physical Examination
window.savePhysical = async function() {
    const data = {
        patientId: currentPatientId,
        type: 'physical_exam',
        data: {
            tekanan_darah: document.getElementById('tekanan_darah').value,
            nadi: document.getElementById('nadi').value,
            suhu: document.getElementById('suhu').value,
            respirasi: document.getElementById('respirasi').value,
            kepala_leher: document.getElementById('kepala_leher').value,
            thorax: document.getElementById('thorax').value,
            abdomen: document.getElementById('abdomen').value,
            ekstremitas: document.getElementById('ekstremitas').value,
            pemeriksaan_obstetri: document.getElementById('pemeriksaan_obstetri').value
        }
    };
    
    await saveMedicalRecord(data, 'Pemeriksaan Fisik');
};

// Save USG
window.saveUSG = async function() {
    const data = {
        patientId: currentPatientId,
        type: 'usg',
        data: {
            usg_date: document.getElementById('usg_date').value,
            usia_kehamilan: document.getElementById('usia_kehamilan').value,
            biometri: document.getElementById('biometri').value,
            anatomi_janin: document.getElementById('anatomi_janin').value,
            plasenta_air_ketuban: document.getElementById('plasenta_air_ketuban').value,
            kesimpulan_usg: document.getElementById('kesimpulan_usg').value
        }
    };
    
    await saveMedicalRecord(data, 'USG');
};

// Save Lab
window.saveLab = async function() {
    const data = {
        patientId: currentPatientId,
        type: 'lab',
        data: {
            lab_results: document.getElementById('lab_results').value,
            radiologi: document.getElementById('radiologi').value,
            pemeriksaan_lain: document.getElementById('pemeriksaan_lain').value,
            laboratory_tests: getLabData()
        }
    };
    
    await saveMedicalRecord(data, 'Pemeriksaan Penunjang');
};

// Save All Medical Records
window.saveAllMedicalRecords = async function() {
    const allData = {
        patientId: currentPatientId,
        type: 'complete',
        anamnesa: {
            keluhan_utama: document.getElementById('keluhan_utama').value,
            riwayat_penyakit_sekarang: document.getElementById('riwayat_penyakit_sekarang').value,
            riwayat_penyakit_dahulu: document.getElementById('riwayat_penyakit_dahulu').value,
            riwayat_keluarga: document.getElementById('riwayat_keluarga').value
        },
        physical_exam: {
            tekanan_darah: document.getElementById('tekanan_darah').value,
            nadi: document.getElementById('nadi').value,
            suhu: document.getElementById('suhu').value,
            respirasi: document.getElementById('respirasi').value,
            kepala_leher: document.getElementById('kepala_leher').value,
            thorax: document.getElementById('thorax').value,
            abdomen: document.getElementById('abdomen').value,
            ekstremitas: document.getElementById('ekstremitas').value,
            pemeriksaan_obstetri: document.getElementById('pemeriksaan_obstetri').value
        },
        usg: {
            usg_date: document.getElementById('usg_date').value,
            usia_kehamilan: document.getElementById('usia_kehamilan').value,
            biometri: document.getElementById('biometri').value,
            anatomi_janin: document.getElementById('anatomi_janin').value,
            plasenta_air_ketuban: document.getElementById('plasenta_air_ketuban').value,
            kesimpulan_usg: document.getElementById('kesimpulan_usg').value
        },
        lab: {
            lab_results: document.getElementById('lab_results').value,
            radiologi: document.getElementById('radiologi').value,
            pemeriksaan_lain: document.getElementById('pemeriksaan_lain').value
        },
        diagnosis: {
            diagnosis: document.getElementById('diagnosis').value,
            rencana_tindakan: document.getElementById('rencana_tindakan').value,
            resep: document.getElementById('resep').value,
            catatan: document.getElementById('catatan').value
        }
    };
    
    await saveMedicalRecord(allData, 'Semua Data Rekam Medis');
};

// Generic save function
async function saveMedicalRecord(data, recordType) {
    try {
        const response = await authorizedFetch('/api/medical-records', {
            method: 'POST',
            body: JSON.stringify({
                ...data,
                timestamp: new Date().toISOString(),
                doctorId: auth.currentUser?.id,
                doctorName: auth.currentUser?.name || auth.currentUser?.email
            })
        });
        
        if (!response.ok) throw new Error('Failed to save');
        
        const result = await response.json();
        if (!result.success) throw new Error(result.message);
        
        showAlert(`${recordType} berhasil disimpan!`, 'success');
    } catch (error) {
        console.error('Error saving medical record:', error);
        showAlert(`Gagal menyimpan ${recordType}: ` + error.message, 'danger');
    }
}

// Initialize
async function init() {
    await initAuth();
    
    currentPatientId = getPatientIdFromURL();
    
    if (!currentPatientId) {
        showAlert('ID Pasien tidak ditemukan. Redirecting...', 'danger');
        setTimeout(() => window.location.href = 'index-adminlte.html', 2000);
        return;
    }
    
    // Load patient data first
    const patient = await loadPatientData();
    
    // Then load intake data with patient info
    if (patient) {
        const intakeData = await loadVerifiedIntakeData(patient);
        
        // Load appointment data for chief complaint
        const chiefComplaint = await loadAppointmentData();
        
        // Populate the enhanced Anamnesa form with integrated data
        await populateAnamnesaForm(patient, intakeData, chiefComplaint);
        
        // Load any saved medical records (this will override populated data if records exist)
        await loadMedicalRecords();
    }
    
    // Show main content
    document.getElementById('loading-indicator').classList.add('d-none');
    document.getElementById('main-content').classList.remove('d-none');
}

// Logout
document.getElementById('btn-logout')?.addEventListener('click', async () => {
    await signOut();
    window.location.href = 'login.html';
});

// ========== Dynamic Table Functions for Prenatal Care & Lab Tests ==========

// Prenatal Care Table
let prenatalRowCounter = 1;

function addPrenatalRow() {
    const tbody = document.getElementById('prenatal-body');
    const row = document.createElement('tr');
    row.innerHTML = `
        <td>${prenatalRowCounter}</td>
        <td><input type="date" class="form-control form-control-sm prenatal-date"></td>
        <td><input type="number" class="form-control form-control-sm prenatal-ga" placeholder="minggu" min="0" max="42"></td>
        <td><input type="number" class="form-control form-control-sm prenatal-weight" placeholder="kg" step="0.1"></td>
        <td><input type="text" class="form-control form-control-sm prenatal-bp" placeholder="120/80"></td>
        <td><input type="number" class="form-control form-control-sm prenatal-fhr" placeholder="bpm" min="0" max="200"></td>
        <td><input type="text" class="form-control form-control-sm prenatal-notes" placeholder="Keterangan"></td>
        <td><button type="button" class="btn btn-sm btn-danger" onclick="removePrenatalRow(this)"><i class="fas fa-times"></i></button></td>
    `;
    tbody.appendChild(row);
    prenatalRowCounter++;
}

function removePrenatalRow(button) {
    const row = button.closest('tr');
    row.remove();
    updatePrenatalRowNumbers();
}

function updatePrenatalRowNumbers() {
    const rows = document.querySelectorAll('#prenatal-body tr');
    rows.forEach((row, index) => {
        row.cells[0].textContent = index + 1;
    });
    prenatalRowCounter = rows.length + 1;
}

function getPrenatalData() {
    const rows = document.querySelectorAll('#prenatal-body tr');
    const data = [];
    rows.forEach(row => {
        data.push({
            visit: row.cells[0].textContent,
            date: row.querySelector('.prenatal-date')?.value || '',
            gestational_age: row.querySelector('.prenatal-ga')?.value || '',
            weight: row.querySelector('.prenatal-weight')?.value || '',
            blood_pressure: row.querySelector('.prenatal-bp')?.value || '',
            fetal_heart_rate: row.querySelector('.prenatal-fhr')?.value || '',
            notes: row.querySelector('.prenatal-notes')?.value || ''
        });
    });
    return data;
}

function loadPrenatalData(data) {
    if (!data || !Array.isArray(data)) return;
    const tbody = document.getElementById('prenatal-body');
    tbody.innerHTML = '';
    prenatalRowCounter = 1;
    data.forEach(visit => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${visit.visit || prenatalRowCounter}</td>
            <td><input type="date" class="form-control form-control-sm prenatal-date" value="${visit.date || ''}"></td>
            <td><input type="number" class="form-control form-control-sm prenatal-ga" placeholder="minggu" min="0" max="42" value="${visit.gestational_age || ''}"></td>
            <td><input type="number" class="form-control form-control-sm prenatal-weight" placeholder="kg" step="0.1" value="${visit.weight || ''}"></td>
            <td><input type="text" class="form-control form-control-sm prenatal-bp" placeholder="120/80" value="${visit.blood_pressure || ''}"></td>
            <td><input type="number" class="form-control form-control-sm prenatal-fhr" placeholder="bpm" min="0" max="200" value="${visit.fetal_heart_rate || ''}"></td>
            <td><input type="text" class="form-control form-control-sm prenatal-notes" placeholder="Keterangan" value="${visit.notes || ''}"></td>
            <td><button type="button" class="btn btn-sm btn-danger" onclick="removePrenatalRow(this)"><i class="fas fa-times"></i></button></td>
        `;
        tbody.appendChild(row);
        prenatalRowCounter++;
    });
}

// Lab Tests Table
let labRowCounter = 1;

function addLabRow() {
    const tbody = document.getElementById('lab-tests-body');
    const row = document.createElement('tr');
    row.innerHTML = `
        <td>${labRowCounter}</td>
        <td><input type="text" class="form-control form-control-sm lab-test-type" placeholder="Jenis tes"></td>
        <td>
            <select class="form-control form-control-sm lab-trimester">
                <option value="">-</option>
                <option value="1">Trimester 1</option>
                <option value="2">Trimester 2</option>
                <option value="3">Trimester 3</option>
            </select>
        </td>
        <td><input type="date" class="form-control form-control-sm lab-date"></td>
        <td><input type="text" class="form-control form-control-sm lab-results" placeholder="Hasil"></td>
        <td>
            <select class="form-control form-control-sm lab-followup">
                <option value="">-</option>
                <option value="normal">Normal</option>
                <option value="perlu_monitor">Perlu Monitor</option>
                <option value="konsultasi">Konsultasi</option>
            </select>
        </td>
        <td><button type="button" class="btn btn-sm btn-danger" onclick="removeLabRow(this)"><i class="fas fa-times"></i></button></td>
    `;
    tbody.appendChild(row);
    labRowCounter++;
}

function removeLabRow(button) {
    const row = button.closest('tr');
    row.remove();
    updateLabRowNumbers();
}

function updateLabRowNumbers() {
    const rows = document.querySelectorAll('#lab-tests-body tr');
    rows.forEach((row, index) => {
        row.cells[0].textContent = index + 1;
    });
    labRowCounter = rows.length + 1;
}

function getLabData() {
    const rows = document.querySelectorAll('#lab-tests-body tr');
    const data = [];
    rows.forEach(row => {
        data.push({
            test_number: row.cells[0].textContent,
            test_type: row.querySelector('.lab-test-type')?.value || '',
            trimester: row.querySelector('.lab-trimester')?.value || '',
            test_date: row.querySelector('.lab-date')?.value || '',
            results: row.querySelector('.lab-results')?.value || '',
            followup: row.querySelector('.lab-followup')?.value || ''
        });
    });
    return data;
}

function loadLabData(data) {
    if (!data || !Array.isArray(data)) return;
    const tbody = document.getElementById('lab-tests-body');
    tbody.innerHTML = '';
    labRowCounter = 1;
    data.forEach(test => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${test.test_number || labRowCounter}</td>
            <td><input type="text" class="form-control form-control-sm lab-test-type" placeholder="Jenis tes" value="${test.test_type || ''}"></td>
            <td>
                <select class="form-control form-control-sm lab-trimester">
                    <option value="">-</option>
                    <option value="1" ${test.trimester == '1' ? 'selected' : ''}>Trimester 1</option>
                    <option value="2" ${test.trimester == '2' ? 'selected' : ''}>Trimester 2</option>
                    <option value="3" ${test.trimester == '3' ? 'selected' : ''}>Trimester 3</option>
                </select>
            </td>
            <td><input type="date" class="form-control form-control-sm lab-date" value="${test.test_date || ''}"></td>
            <td><input type="text" class="form-control form-control-sm lab-results" placeholder="Hasil" value="${test.results || ''}"></td>
            <td>
                <select class="form-control form-control-sm lab-followup">
                    <option value="">-</option>
                    <option value="normal" ${test.followup == 'normal' ? 'selected' : ''}>Normal</option>
                    <option value="perlu_monitor" ${test.followup == 'perlu_monitor' ? 'selected' : ''}>Perlu Monitor</option>
                    <option value="konsultasi" ${test.followup == 'konsultasi' ? 'selected' : ''}>Konsultasi</option>
                </select>
            </td>
            <td><button type="button" class="btn btn-sm btn-danger" onclick="removeLabRow(this)"><i class="fas fa-times"></i></button></td>
        `;
        tbody.appendChild(row);
        labRowCounter++;
    });
}

// Event listeners for add buttons
document.getElementById('add-prenatal-row')?.addEventListener('click', addPrenatalRow);
document.getElementById('add-lab-row')?.addEventListener('click', addLabRow);

// Make functions globally accessible
window.addPrenatalRow = addPrenatalRow;
window.removePrenatalRow = removePrenatalRow;
window.addLabRow = addLabRow;
window.removeLabRow = removeLabRow;
window.getPrenatalData = getPrenatalData;
window.getLabData = getLabData;
window.loadPrenatalData = loadPrenatalData;
window.loadLabData = loadLabData;

// Start
init();
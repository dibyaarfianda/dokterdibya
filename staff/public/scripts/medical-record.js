import { getIdToken, auth, signOut, initAuth } from './vps-auth-v2.js';

const API_BASE = (() => {
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        return 'http://localhost:3001';
    }
    return window.location.origin.replace(/\/$/, '');
})();

let currentPatientId = null;
let currentIntakeData = null;

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
        // Get all intake submissions
        const response = await authorizedFetch(`/api/patient-intake?limit=500`);
        if (!response.ok) throw new Error('Failed to load intake data');
        
        const result = await response.json();
        if (!result.success) throw new Error(result.message);
        
        console.log('Total intake submissions:', result.data?.length);
        console.log('Looking for patient:', patient);
        
        // Find verified intake for this patient
        const intakes = result.data || [];
        
        // Try multiple matching strategies
        let verifiedIntake = null;
        
        // Strategy 1: Match by phone (normalize both numbers)
        if (patient.whatsapp || patient.phone) {
            const patientPhone = (patient.whatsapp || patient.phone || '').replace(/\D/g, '');
            verifiedIntake = intakes.find(intake => {
                const isVerified = intake.status === 'verified';
                if (!isVerified) return false;
                
                // Check both summary phone and payload phone
                const summaryPhone = (intake.phone || '').replace(/\D/g, '');
                const payloadPhone = (intake.payload?.phone || '').replace(/\D/g, '');
                
                // Match last 10 digits (Indonesian phone numbers)
                const phoneMatchSummary = summaryPhone && patientPhone && 
                                        summaryPhone.slice(-10) === patientPhone.slice(-10);
                const phoneMatchPayload = payloadPhone && patientPhone && 
                                        payloadPhone.slice(-10) === patientPhone.slice(-10);
                
                if (phoneMatchSummary || phoneMatchPayload) {
                    console.log('Found match by phone:', intake.submissionId, {
                        summaryPhone,
                        payloadPhone,
                        patientPhone
                    });
                }
                return phoneMatchSummary || phoneMatchPayload;
            });
        }
        
        // Strategy 2: Match by name (case insensitive, partial match)
        if (!verifiedIntake && patient.full_name) {
            const patientName = patient.full_name.toLowerCase().trim();
            verifiedIntake = intakes.find(intake => {
                const isVerified = intake.status === 'verified';
                if (!isVerified) return false;
                
                // Check both summary name and payload name
                const summaryName = (intake.patientName || '').toLowerCase().trim();
                const payloadName = (intake.payload?.full_name || '').toLowerCase().trim();
                
                const nameMatchSummary = summaryName && patientName && 
                                       (summaryName === patientName || 
                                        summaryName.includes(patientName) || 
                                        patientName.includes(summaryName));
                const nameMatchPayload = payloadName && patientName && 
                                       (payloadName === patientName || 
                                        payloadName.includes(patientName) || 
                                        patientName.includes(payloadName));
                
                if (nameMatchSummary || nameMatchPayload) {
                    console.log('Found match by name:', intake.submissionId, {
                        summaryName,
                        payloadName,
                        patientName
                    });
                }
                return nameMatchSummary || nameMatchPayload;
            });
        }
        
        // Strategy 3: Show all verified intakes for debugging
        const allVerified = intakes.filter(i => i.status === 'verified');
        console.log('All verified intakes:', allVerified.length);
        if (allVerified.length > 0) {
            console.log('First verified intake:', allVerified[0]);
        }
        
        if (verifiedIntake) {
            // Load full record with payload
            console.log('Loading full record for:', verifiedIntake.submissionId);
            try {
                const detailResponse = await authorizedFetch(`/api/patient-intake/${verifiedIntake.submissionId}`);
                if (detailResponse.ok) {
                    const detailResult = await detailResponse.json();
                    if (detailResult.success && detailResult.data) {
                        currentIntakeData = detailResult.data;
                        displayIntakeData(detailResult.data);
                        return detailResult.data;
                    }
                }
            } catch (err) {
                console.error('Error loading full record:', err);
            }
            
            // Fallback to summary if detail load fails
            currentIntakeData = verifiedIntake;
            displayIntakeData(verifiedIntake);
        } else {
            const allVerifiedWithDetails = allVerified.map(v => ({
                id: v.submissionId,
                name: v.patientName,
                phone: v.phone,
                status: v.status
            }));
            
            document.getElementById('intake-data-container').innerHTML = 
                `<div class="alert alert-info">
                    <i class="fas fa-info-circle"></i> Belum ada data intake yang terverifikasi untuk pasien ini.
                    <br><small class="text-muted">Pasien: ${patient.full_name || patient.name} | Telepon: ${patient.whatsapp || patient.phone || '-'}</small>
                    <br><small class="text-muted">Total intake terverifikasi: ${allVerified.length}</small>
                    ${allVerifiedWithDetails.length > 0 ? `
                        <br><br><strong>Data Verified Available:</strong>
                        <ul class="mb-0 mt-2" style="font-size: 0.85rem;">
                            ${allVerifiedWithDetails.map(v => `
                                <li>${v.name || 'Unknown'} - ${v.phone || 'No phone'} (${v.id})</li>
                            `).join('')}
                        </ul>
                    ` : ''}
                </div>`;
            console.log('Available verified intakes:', allVerifiedWithDetails);
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
    html += '</dl></div></div>';
    
    // Family Info
    if (payload.marital_status || payload.husband_name || payload.occupation) {
        html += '<div class="col-md-6"><div class="intake-data-section">';
        html += '<h6><i class="fas fa-users"></i> Keluarga & Sosial</h6>';
        html += '<dl class="row mb-0">';
        if (payload.marital_status) html += `<dt class="col-sm-5">Status:</dt><dd class="col-sm-7">${payload.marital_status}</dd>`;
        if (payload.husband_name) html += `<dt class="col-sm-5">Suami:</dt><dd class="col-sm-7">${payload.husband_name}</dd>`;
        if (payload.occupation) html += `<dt class="col-sm-5">Pekerjaan:</dt><dd class="col-sm-7">${payload.occupation}</dd>`;
        if (payload.education) html += `<dt class="col-sm-5">Pendidikan:</dt><dd class="col-sm-7">${payload.education}</dd>`;
        html += '</dl></div></div>';
    }
    
    // Pregnancy Info
    html += '<div class="col-md-6"><div class="intake-data-section">';
    html += '<h6><i class="fas fa-baby"></i> Kehamilan Saat Ini</h6>';
    html += '<dl class="row mb-0">';
    if (payload.lmp) html += `<dt class="col-sm-5">HPHT:</dt><dd class="col-sm-7">${payload.lmp}</dd>`;
    if (metadata.edd?.value || payload.edd) html += `<dt class="col-sm-5">HPL:</dt><dd class="col-sm-7">${metadata.edd?.value || payload.edd}</dd>`;
    if (payload.height) html += `<dt class="col-sm-5">TB:</dt><dd class="col-sm-7">${payload.height} cm</dd>`;
    if (payload.weight) html += `<dt class="col-sm-5">BB:</dt><dd class="col-sm-7">${payload.weight} kg</dd>`;
    if (payload.bmi) html += `<dt class="col-sm-5">BMI:</dt><dd class="col-sm-7">${payload.bmi}</dd>`;
    const totals = metadata.obstetricTotals || {};
    html += `<dt class="col-sm-5">G/P/A/L:</dt><dd class="col-sm-7">G${totals.gravida || '-'} P${totals.para || '-'} A${totals.abortus || '-'} L${totals.living || '-'}</dd>`;
    html += '</dl></div></div>';
    
    // Medical History
    if (payload.risk_factors || payload.past_conditions || payload.allergies) {
        html += '<div class="col-md-6"><div class="intake-data-section">';
        html += '<h6><i class="fas fa-notes-medical"></i> Riwayat Medis</h6>';
        html += '<dl class="row mb-0">';
        if (payload.risk_factors) html += `<dt class="col-sm-5">Faktor Risiko:</dt><dd class="col-sm-7">${payload.risk_factors}</dd>`;
        if (payload.past_conditions) html += `<dt class="col-sm-5">Riwayat Penyakit:</dt><dd class="col-sm-7">${payload.past_conditions}</dd>`;
        if (payload.allergies) html += `<dt class="col-sm-5">Alergi:</dt><dd class="col-sm-7">${payload.allergies}</dd>`;
        if (payload.current_medications) html += `<dt class="col-sm-5">Obat Saat Ini:</dt><dd class="col-sm-7">${payload.current_medications}</dd>`;
        html += '</dl></div></div>';
    }
    
    html += '</div>';
    
    document.getElementById('intake-data-container').innerHTML = html;
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
            if (data.keluhan_utama) document.getElementById('keluhan_utama').value = data.keluhan_utama;
            if (data.riwayat_penyakit_sekarang) document.getElementById('riwayat_penyakit_sekarang').value = data.riwayat_penyakit_sekarang;
            if (data.riwayat_penyakit_dahulu) document.getElementById('riwayat_penyakit_dahulu').value = data.riwayat_penyakit_dahulu;
            if (data.riwayat_keluarga) document.getElementById('riwayat_keluarga').value = data.riwayat_keluarga;
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

// Save Anamnesa
window.saveAnamnesa = async function() {
    const data = {
        patientId: currentPatientId,
        type: 'anamnesa',
        data: {
            keluhan_utama: document.getElementById('keluhan_utama').value,
            riwayat_penyakit_sekarang: document.getElementById('riwayat_penyakit_sekarang').value,
            riwayat_penyakit_dahulu: document.getElementById('riwayat_penyakit_dahulu').value,
            riwayat_keluarga: document.getElementById('riwayat_keluarga').value,
            prenatal_care: getPrenatalData()
        }
    };
    
    await saveMedicalRecord(data, 'Anamnesa');
};

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
        await loadVerifiedIntakeData(patient);
        // Load any saved medical records
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
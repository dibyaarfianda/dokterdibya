import { auth, getIdToken } from './vps-auth-v2.js';
import { broadcastPatientSelection } from './realtime-sync.js';
import { showSuccess, showError, showConfirm } from './toast.js';
import { setCurrentPatientForExam, toggleMedicalExamMenu } from './medical-exam.js';
import { updateSessionPatient } from './session-manager.js';

// VPS API Configuration
const VPS_API_BASE = ['localhost', '127.0.0.1'].includes(window.location.hostname)
    ? 'http://localhost:3001'
    : window.location.origin.replace(/\/$/, '');

// Helper function to log activities
async function logActivity(action, details) {
    try {
        const user = auth.currentUser;
        if (!user) return;
        
        await fetch(`${VPS_API_BASE}/api/logs`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${await getIdToken()}`
            },
            body: JSON.stringify({
                user_id: user.id,
                user_name: user.name || user.email,
                action: action,
                details: details
            })
        });
    } catch (err) {
        console.error('Failed to log activity:', err);
        // Don't show error to user - logging is non-critical
    }
}

// Import billing functions to set selected patient
let setSelectedPatientForBilling = null;
import('./billing.js').then(module => {
    if (module.setSelectedPatient) {
        setSelectedPatientForBilling = module.setSelectedPatient;
    }
});

const listEl = document.getElementById('patient-list');
const detailsEl = document.getElementById('patient-details-content');
const searchEl = document.getElementById('patient-search-input');
const patientNameInput = document.getElementById('patientName');
const quickForm = document.getElementById('quick-add-patient');
const quickIdEl = document.getElementById('quick-id');
const quickNameEl = document.getElementById('quick-name');
const quickPhoneEl = document.getElementById('quick-whatsapp');
const quickBirthdateEl = document.getElementById('quick-birthdate');
const quickAgeEl = document.getElementById('quick-age');

// Note: Obstetric/anamnesa fields moved to Anamnesa page
// const quickPregnantEl = document.getElementById('quick-pregnant');
// const quickPregSection = document.getElementById('quick-preg-section');
// const quickGravidaEl = document.getElementById('quick-gravida');
// const quickTermEl = document.getElementById('quick-term');
// const quickPretermEl = document.getElementById('quick-preterm');
// const quickAbortionEl = document.getElementById('quick-abortion');
// const quickLivingEl = document.getElementById('quick-living');
// const quickAllergyEl = document.getElementById('quick-allergy');
// const quickHistoryEl = document.getElementById('quick-history');
// const quickHphtEl = document.getElementById('quick-hpht');

let allPatients = [];
let filteredPatients = [];
let currentlySelectedPatientId = null; // Track which patient's details are currently shown

function toDate(val) {
    if (!val) return null;
    if (val.toDate) return val.toDate();
    if (val.seconds) return new Date(val.seconds * 1000);
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
}

// Helper to get resume status badge
function getResumeStatusBadge(status) {
    const statusMap = {
        'sudah_kirim_usg_resume': { label: 'USG + Resume ✓', class: 'badge-success' },
        'sudah_kirim_resume': { label: 'Resume ✓', class: 'badge-info' },
        'sudah_simpan': { label: 'Tersimpan', class: 'badge-warning' },
        'belum_generate': { label: 'Belum Generate', class: 'badge-secondary' }
    };
    const info = statusMap[status] || { label: 'Pasien Baru', class: 'badge-light' };
    return `<span class="badge ${info.class}" style="font-size: 0.7rem;">${info.label}</span>`;
}

function renderList(items) {
    if (!listEl) return;
    listEl.innerHTML = '';
    if (!items || items.length === 0) {
        listEl.innerHTML = '<div class="text-center text-muted py-5"><i class="fas fa-users fa-2x mb-2"></i><div>Belum ada data pasien</div></div>';
        return;
    }
    const frag = document.createDocumentFragment();
    items.forEach(p => {
        const row = document.createElement('div');
        row.className = 'border rounded p-2 mb-1 hover-shadow';
        row.style.cursor = 'pointer';
        row.style.transition = 'all 0.2s';
        const patientId = String(p.patientId || '').padStart(5, '0');

        row.innerHTML = `
            <div class="d-flex justify-content-between align-items-center" style="gap: 8px;">
                <div class="flex-grow-1" style="cursor: pointer; min-width: 0;">
                    <div class="d-flex align-items-center" style="gap: 6px;">
                        <span class="badge badge-secondary" style="font-size: 0.7rem;">${patientId}</span>
                        <span class="text-truncate" style="font-weight: 600; font-size: 0.9rem;">${p.name || '-'}</span>
                    </div>
                    <div class="small text-muted" style="font-size: 0.75rem;">📞 ${p.whatsapp || '-'}</div>
                </div>
                <div class="text-right d-flex align-items-center" style="gap: 6px; flex-shrink: 0;">
                    ${getResumeStatusBadge(p.resume_status)}
                    <button class="btn btn-sm btn-success select-patient-btn py-0 px-2" data-patient-id="${p.id}" data-patient-name="${p.name}" style="font-size: 0.75rem;">
                        <i class="fas fa-check"></i>
                    </button>
                </div>
            </div>
        `;
        
        // Click on patient info to toggle details
        const infoDiv = row.querySelector('.flex-grow-1');
        infoDiv.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleDetails(p);
        });
        
        // Click on "Pilih" button to select patient for billing
        const selectBtn = row.querySelector('.select-patient-btn');
        selectBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            selectPatientForBilling(p);
        });
        
        // Hover effect
        row.addEventListener('mouseenter', () => {
            row.style.backgroundColor = '#f8f9fa';
        });
        row.addEventListener('mouseleave', () => {
            row.style.backgroundColor = '';
        });
        
        frag.appendChild(row);
    });
    listEl.appendChild(frag);
}

function toggleDetails(p) {
    // If clicking the same patient, hide details
    if (currentlySelectedPatientId === p.id) {
        hideDetails();
    } else {
        // Otherwise, show the new patient's details
        showDetails(p);
    }
}

function hideDetails() {
    if (!detailsEl) return;
    detailsEl.innerHTML = '';
    currentlySelectedPatientId = null;
}

async function showDetails(p) {
    if (!detailsEl) return;
    
    // Set current selected patient
    currentlySelectedPatientId = p.id;
    
    const last = toDate(p.lastVisit);
    const patientId = String(p.patientId || '').padStart(5, '0');
    const birthDateFormatted = p.birthDate ? toDate(p.birthDate).toLocaleDateString('id-ID', {day: 'numeric', month: 'long', year: 'numeric'}) : '-';
    
    // Initial render
    detailsEl.innerHTML = `
        <div class="p-2">
            <div class="h6 mb-2" style="font-weight: 600;">${p.name || '-'} <span class="badge badge-secondary">${patientId}</span></div>
            <div class="small text-muted">No. WhatsApp: ${p.whatsapp || '-'}</div>
            <div class="small text-muted">Tanggal Lahir: ${birthDateFormatted}</div>
            <div class="small text-muted">Usia: ${p.age || '-'}</div>
            <div class="small text-muted">Hamil: ${p.pregnant ? 'Ya' : 'Tidak'}</div>
            ${p.pregnant ? `<div class="small text-muted">Status Obstetri: G${p.gravida || 0} P${p.term || 0}${p.preterm || 0}${p.abortion || 0}${p.living || 0}</div>` : ''}
            <div class="small text-muted">Alergi: ${p.allergy || '-'}</div>
            <div class="small text-muted">Riwayat Penyakit: ${p.history || '-'}</div>
            <div class="small text-muted">HPHT: ${p.hpht || '-'}</div>
            <hr class="my-2">
            <div class="h6 mb-2" style="font-weight: 600;">Riwayat Kontrol:</div>
            <div id="patient-history-list" class="small text-muted">
                <i class="fas fa-spinner fa-spin"></i> Memuat riwayat...
            </div>
        </div>
        <div class="mt-2">
            <button class="btn btn-sm btn-primary mr-2" id="btn-use-patient">Gunakan untuk Tagihan</button>
            <button class="btn btn-sm btn-warning" id="btn-edit-patient">Edit Data</button>
            <!-- Tombol Hapus dihilangkan - hanya tersedia di Kelola Pasien -->
        </div>
    `;
    
    // Fetch and display history
    await loadPatientHistory(p);
    
    const btnUse = document.getElementById('btn-use-patient');
    if (btnUse) {
        btnUse.addEventListener('click', () => {
            selectPatientForBilling(p);
        });
    }
    
    const btnEdit = document.getElementById('btn-edit-patient');
    if (btnEdit) {
        btnEdit.addEventListener('click', () => editPatient(p));
    }
    
    // Tombol delete dihapus dari detail pasien
    // Penghapusan hanya bisa dilakukan dari halaman Kelola Pasien
}

async function loadPatientHistory(patient) {
    const historyListEl = document.getElementById('patient-history-list');
    if (!historyListEl) return;
    
    try {
        const token = await getIdToken();
        if (!token) {
            historyListEl.innerHTML = '<div class="text-danger">Tidak terautentikasi. Silakan login kembali.</div>';
            return;
        }
        
        // Fetch visits for this patient from VPS API
        const patientId = parseInt(patient.patientId);
        const response = await fetch(`${VPS_API_BASE}/api/visits?patient_id=${patientId}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        let visits = [];
        if (response.ok) {
            const result = await response.json();
            if (result.success && result.data) {
                visits = result.data.map(visit => {
                    // Fields are already parsed by the API
                    const visitData = {
                        id: visit.id,
                        patientId: visit.patient_id,
                        patientName: patient.name,
                        date: visit.visit_date,
                        timestamp: visit.created_at,
                        services: visit.services || [],
                        medications: visit.medications || [],
                        grandTotal: parseFloat(visit.grand_total || visit.total_amount || 0),
                        total: parseFloat(visit.grand_total || visit.total_amount || 0),
                        // exam_data is already parsed by API
                        ...(visit.exam_data || {})
                    };
                    return visitData;
                });
            }
        }
        
        // Sort by date descending
        visits.sort((a, b) => {
            const dateA = toDate(a.date);
            const dateB = toDate(b.date);
            return dateB - dateA;
        });
        
                  // Display visit statistics and history
          if (visits.length === 0) {
              historyListEl.innerHTML = '<div class="text-muted">Belum ada riwayat kontrol</div>';
        } else {
            // Get last visit with full date and time
            const lastVisit = toDate(visits[0].date);
            const lastVisitStr = lastVisit ? 
                `${lastVisit.toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} pukul ${lastVisit.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}` : 
                '-';
            
            let html = `
                <div class="alert alert-info mb-2" style="padding: 0.5rem;">
                    <div class="d-flex justify-content-between">
                        <div style="font-weight: 600;">Total Kunjungan: ${visits.length}x</div>
                        <div class="text-primary"><i class="fas fa-calendar-check"></i></div>
                    </div>
                                            <div class="small mt-1">
                            <span style="font-weight: 600;">Terakhir:</span><br>
                            ${lastVisitStr}
                        </div>
                </div>
                <div class="h6 mb-2" style="font-weight: 600;">5 Kunjungan Terakhir:</div>
                <div style="max-height: 200px; overflow-y: auto;">
            `;
            
            const last5 = visits.slice(0, 5);
            last5.forEach((v, idx) => {
                const visitDate = toDate(v.date);
                const dateStr = visitDate ? visitDate.toLocaleDateString('id-ID', {day: 'numeric', month: 'long', year: 'numeric'}) : '-';
                const timeStr = visitDate ? visitDate.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '';
                const services = Array.isArray(v.services) ? v.services.map(s => s.name || s).join(', ') : '-';
                const obat = Array.isArray(v.obat) ? v.obat.map(o => `${o.name} (${o.quantity})`).join(', ') : '-';
                const total = v.grandTotal || v.total || 0;
                
                // Medical examination summary
                let examSummary = '';
                if (v.anamnesa) {
                    const diagnosis = v.anamnesa.pregnant === 'ya' ? 
                        `G${v.anamnesa.gravida || 0} P${v.anamnesa.term || 0}${v.anamnesa.preterm || 0}${v.anamnesa.abortion || 0}${v.anamnesa.living || 0}` : 
                        'Tidak hamil';
                    examSummary += `<div style="font-size: 0.8em;">📋 Anamnesa: ${diagnosis}</div>`;
                }
                if (v.physicalExam) {
                    const bp = v.physicalExam.bpSystolic && v.physicalExam.bpDiastolic ? 
                        `${v.physicalExam.bpSystolic}/${v.physicalExam.bpDiastolic} mmHg` : '-';
                    examSummary += `<div style="font-size: 0.8em;">🩺 TD: ${bp}, Nadi: ${v.physicalExam.pulse || '-'}</div>`;
                }
                if (v.usgExam) {
                    const ga = v.usgExam.gaWeeks ? `${v.usgExam.gaWeeks} minggu ${v.usgExam.gaDays || 0} hari` : '-';
                    examSummary += `<div style="font-size: 0.8em;">👶 USG: UK ${ga}</div>`;
                }
                
                html += `
                    <div class="border-bottom pb-2 mb-2">
                        <div class="h6 mb-1" style="font-weight: 600;">${idx + 1}. ${dateStr} ${timeStr}</div>
                        ${examSummary}
                        <div class="text-muted" style="font-size: 0.85em;">💉 Tindakan: ${services}</div>
                        <div class="text-muted" style="font-size: 0.85em;">💊 Obat: ${obat}</div>
                        <div class="text-success" style="font-size: 0.85em; font-weight: 600;">💰 Total: Rp ${total.toLocaleString('id-ID')}</div>
                    </div>
                `;
            });
            html += '</div>';
            historyListEl.innerHTML = html;
        }
    } catch (err) {
        console.error('Failed to load patient history:', err);
        historyListEl.innerHTML = `<div class="text-danger">Gagal memuat riwayat: ${err.message}</div>`;
    }
}

function applyFilter() {
    const term = (searchEl?.value || '').toLowerCase();
    let items = [...allPatients];
    if (term) {
        const isId = /^\d{5}$/.test(term);
        if (isId) {
            items = items.filter(p => String(p.patientId || '').padStart(5,'0') === term);
        } else {
            items = items.filter(p => (p.name || '').toLowerCase().includes(term));
        }
    }
    filteredPatients = items;
    renderList(filteredPatients);
}

function calculateAge(birthDate) {
    if (!birthDate) return '';
    const birth = new Date(birthDate);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
        age--;
    }
    return age >= 0 ? `${age} tahun` : '';
}

// Note: updateDiagnosis moved to medical-exam.js (Anamnesa page)
// function updateDiagnosis() { ... }

async function loadPatients() {
    try {
        const token = await getIdToken();
        if (!token) {
            console.warn('No authentication token available');
            allPatients = [];
            applyFilter();
            return;
        }
        
        // Load patients from VPS API with cache-busting
        const response = await fetch(`${VPS_API_BASE}/api/patients?_=${Date.now()}`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
            }
        });
        
        if (response.ok) {
            const result = await response.json();
            if (result.success && result.data) {
                allPatients = result.data.map(patient => ({
                    id: patient.id,
                    patientId: patient.id,  // VPS uses 'id' as the primary key
                    name: patient.full_name,
                    whatsapp: patient.whatsapp,
                    birthDate: patient.birth_date,
                    age: patient.age,
                    lastVisit: patient.last_visit ? new Date(patient.last_visit) : null,
                    visitCount: patient.visit_count || 0,
                    resume_status: patient.resume_status || null
                }));
            }
        }
    } catch (e) {
        console.warn('Failed to load patients:', e);
        allPatients = [];
    }
    applyFilter();
}

export async function initPatients() {
    await loadPatients();
    if (searchEl) searchEl.addEventListener('input', applyFilter);

    // Prepare quick form ID
    if (quickIdEl) quickIdEl.value = generateUniqueIdLocal();
    
    // Auto-calculate age when birthdate changes
    if (quickBirthdateEl && quickAgeEl) {
        const updateAge = () => {
            quickAgeEl.value = calculateAge(quickBirthdateEl.value);
        };
        quickBirthdateEl.addEventListener('change', updateAge);
        quickBirthdateEl.addEventListener('input', updateAge);
    }
    
    // Note: Pregnancy toggle and diagnosis listeners moved to Anamnesa page
    // if (quickPregnantEl) quickPregnantEl.addEventListener('change', () => { ... });
    // setupDiagnosisListener(quickGravidaEl);
    // setupDiagnosisListener(quickTermEl);
    // etc.
    if (quickForm) quickForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const isEditMode = quickForm.dataset.editMode === 'true';
        const editId = quickForm.dataset.editId;
        
        const id5 = quickIdEl?.value || generateUniqueIdLocal();
        const name = quickNameEl?.value.trim() || '';
        if (!name) return;
        const whatsapp = quickPhoneEl?.value.trim() || '';
        const birthDate = quickBirthdateEl?.value || '';
        const age = quickAgeEl?.value || '';
        
        // Check for duplicate ID only when adding new patient
        if (!isEditMode && allPatients.some(p => String(p.patientId) === id5)) {
            quickIdEl.value = generateUniqueIdLocal();
            showError('ID bentrok! ID baru telah digenerate. Klik simpan lagi.');
            return;
        }
        
        // Basic patient data - obstetric/anamnesa data will be filled in Anamnesa page
        const docData = {
            patientId: id5,
            name,
            whatsapp,
            birthDate,
            age
        };
        
        try {
            const token = await getIdToken();
            if (!token) {
                showError('Anda tidak terautentikasi. Silakan login kembali.');
                return;
            }

            if (isEditMode && editId) {
                // Update existing patient via VPS API
                const response = await fetch(`${VPS_API_BASE}/api/patients/${editId}`, {
                    method: 'PUT',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        full_name: name,
                        whatsapp: whatsapp,
                        birth_date: birthDate
                    })
                });
                
                if (response.ok) {
                    showSuccess('Data pasien berhasil diupdate!');
                    
                    // Log activity
                    await logActivity('Updated Patient', `Updated patient: ${name}`);
                    
                    // Reload patient list to get fresh data
                    await loadPatients();
                    
                    // Refresh the details view if this patient is currently selected
                    if (currentlySelectedPatientId === editId) {
                        const updatedPatient = allPatients.find(p => p.id === editId);
                        if (updatedPatient) {
                            await showDetails(updatedPatient);
                        }
                    }
                } else {
                    const errorData = await response.json();
                    throw new Error(errorData.message || 'Failed to update patient');
                }
            } else {
                // Add new patient via VPS API
                const response = await fetch(`${VPS_API_BASE}/api/patients`, {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        id: parseInt(id5),
                        full_name: name,
                        whatsapp: whatsapp,
                        birth_date: birthDate
                    })
                });
                
                if (response.ok) {
                    showSuccess('Pasien baru berhasil ditambahkan!');
                    
                    // Log activity
                    await logActivity('Added Patient', `Added new patient: ${name}`);
                } else {
                    const errorData = await response.json();
                    throw new Error(errorData.message || 'Failed to add patient');
                }
            }
            
            // Reset form
            quickNameEl.value = '';
            quickPhoneEl.value = '';
            if (quickBirthdateEl) quickBirthdateEl.value = '';
            if (quickAgeEl) quickAgeEl.value = '';
            quickIdEl.value = generateUniqueIdLocal();
            
            // Reset form state
            delete quickForm.dataset.editId;
            delete quickForm.dataset.editMode;
            const submitBtn = quickForm.querySelector('button[type="submit"]');
            if (submitBtn) submitBtn.textContent = 'Simpan';
            
            // Reload patients from API to ensure fresh data
            await loadPatients();
        } catch (err) {
            console.error('Failed to save patient:', err);
            
            // More specific error messages
            if (err.code === 'permission-denied') {
                showError('Akses ditolak. Periksa role dan izin VPS API.');
            } else if (err.code === 'unavailable') {
                showError('Koneksi ke server klinik terputus. Periksa jaringan Anda.');
            } else if (err.code === 'not-found') {
                showError('Data pasien tidak ditemukan.');
            } else {
                showError(`Gagal menyimpan pasien: ${err.message}`);
            }
        }
    });
}

function generateUniqueIdLocal() {
    // simple 5-digit random ID
    const id = Math.floor(10000 + Math.random() * 90000);
    return String(id);
}

function editPatient(p) {
    // Populate form with existing data
    if (quickIdEl) quickIdEl.value = String(p.patientId || '').padStart(5, '0');
    if (quickNameEl) quickNameEl.value = p.name || '';
    if (quickPhoneEl) quickPhoneEl.value = p.whatsapp || '';
    if (quickBirthdateEl) quickBirthdateEl.value = p.birthDate || '';
    if (quickAgeEl) quickAgeEl.value = p.age || '';
    
    // Note: Obstetric/anamnesa data is now managed in the Anamnesa page
    
    // Store the patient ID for update
    if (quickForm) {
        quickForm.dataset.editId = p.id;
        quickForm.dataset.editMode = 'true';
        
        // Ensure form is visible
        quickForm.classList.remove('d-none');
        const formCard = quickForm.closest('.card');
        if (formCard) formCard.classList.remove('d-none');
        
        // Scroll to form
        setTimeout(() => {
            quickForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
        
        // Change button text and style
        const submitBtn = quickForm.querySelector('button[type="submit"]');
        if (submitBtn) {
            submitBtn.textContent = 'Update Pasien';
            submitBtn.classList.add('btn-warning');
            submitBtn.classList.remove('btn-primary');
        }
        
        // Focus on name field
        if (quickNameEl) {
            setTimeout(() => {
                quickNameEl.focus();
                quickNameEl.select();
            }, 300);
        }
    }
}

async function deletePatient(p) {
    const confirmDelete = await showConfirm(
        `Apakah Anda yakin ingin menghapus pasien <strong>"${p.name}"</strong>?<br><br><span class="text-danger">Data yang dihapus tidak dapat dikembalikan!</span>`,
        'Konfirmasi Hapus Pasien'
    );
    
    if (!confirmDelete) return;
    
    try {
        const token = await getIdToken();
        if (!token) {
            showError('Anda tidak terautentikasi. Silakan login kembali.');
            return;
        }

        // Delete from VPS API
        const response = await fetch(`${VPS_API_BASE}/api/patients/${p.id}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (response.ok) {
            // Remove from local array
            const index = allPatients.findIndex(patient => patient.id === p.id);
            if (index !== -1) {
                allPatients.splice(index, 1);
            }
            
                          // Clear details view
              if (detailsEl) {
                  detailsEl.innerHTML = '<div class="text-center text-muted p-4">Pasien berhasil dihapus</div>';
              }
              currentlySelectedPatientId = null; // Reset selected patient
            
            // Refresh list
            applyFilter();
            
            showSuccess('Pasien berhasil dihapus dari database!');
        } else {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Failed to delete patient');
        }
    } catch (err) {
        console.error('Failed to delete patient:', err);
        showError('Gagal menghapus pasien: ' + err.message);
    }
}

async function applyPatientSelection(patient, options = {}) {
    const {
        broadcast = true,
        showToast = true,
    } = options;

    if (!patient || !patient.name) {
        showError('Data pasien tidak valid');
        return;
    }
    
    // Redirect to medical record page
    const patientId = patient.id || patient.patientId;
    window.location.href = `medical-record.html?patientId=${patientId}`;
}

// Function to select patient for billing
async function selectPatientForBilling(patient) {
    await applyPatientSelection(patient, { broadcast: true, showToast: true });
}



// Expose helper for realtime auto-selection
window.__applyRealtimePatientSelection = async (patient) => {
    await applyPatientSelection(patient, { broadcast: false, showToast: false });
};



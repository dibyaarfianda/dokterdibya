import { db } from './firebase-init.js';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { showSuccess, showError, showConfirm } from './toast.js';
import { setCurrentPatientForExam, toggleMedicalExamMenu } from './medical-exam.js';
import { updateSessionPatient } from './session-manager.js';

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
        row.className = 'border rounded p-2 mb-2 hover-shadow';
        row.style.cursor = 'pointer';
        row.style.transition = 'all 0.2s';
        const last = toDate(p.lastVisit);
        const patientId = String(p.patientId || '').padStart(5, '0');
        
        // Debug log
        if (p.name === 'Feby Kumalasari') {
            console.log('Patient Feby Kumalasari data:', {
                lastVisit: p.lastVisit,
                lastVisitParsed: last,
                visitCount: p.visitCount
            });
        }
        
        row.innerHTML = `
            <div class="d-flex justify-content-between align-items-center">
                <div class="flex-grow-1" style="cursor: pointer;">
                    <div class="d-flex align-items-center">
                        <span class="badge badge-secondary mr-2">${patientId}</span>
                        <span class="h6 mb-0" style="font-weight: 600;">${p.name || '-'}</span>
                    </div>
                    <div class="small text-muted">📞 ${p.whatsapp || '-'}</div>
                </div>
                <div class="text-right">
                    <button class="btn btn-sm btn-success select-patient-btn" data-patient-id="${p.id}" data-patient-name="${p.name}">
                        <i class="fas fa-check mr-1"></i>Pilih
                    </button>
                    <div class="small text-muted mt-1">
                        <div>Terakhir: ${last ? last.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) + ' ' + last.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : 'Belum ada'}</div>
                    </div>
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
    
    // Initial render
    detailsEl.innerHTML = `
        <div class="p-2">
            <div class="h6 mb-2" style="font-weight: 600;">${p.name || '-'} <span class="badge badge-secondary">${patientId}</span></div>
            <div class="small text-muted">No. WhatsApp: ${p.whatsapp || '-'}</div>
            <div class="small text-muted">Tanggal Lahir: ${p.birthDate || '-'}</div>
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
}

async function loadPatientHistory(patient) {
    const historyListEl = document.getElementById('patient-history-list');
    if (!historyListEl) return;
    
    try {
        // Fetch visits for this patient
        const visitsCol = collection(db, 'clinic', 'data', 'visits');
        const visitsSnap = await getDocs(visitsCol);
        
        let visits = [];
        visitsSnap.forEach(doc => {
            const data = doc.data();
            if (data.patientName === patient.name || data.patientId === patient.patientId) {
                visits.push({
                    id: doc.id,
                    ...data
                });
            }
        });
        
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
                const dateStr = visitDate ? visitDate.toLocaleDateString('id-ID') : '-';
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
        historyListEl.innerHTML = '<div class="text-danger">Gagal memuat riwayat</div>';
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

export async function initPatients() {
    try {
        const snap = await getDocs(collection(db, 'clinic','data','patients'));
        allPatients = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        
        // Load last visit from visits collection if not in patient document
        const visitsSnap = await getDocs(collection(db, 'clinic','data','visits'));
        const visitsByPatient = {};
        
        visitsSnap.forEach(doc => {
            const visit = doc.data();
            
            // Try multiple keys to match patient
            const patientKeys = [];
            if (visit.patientId) patientKeys.push(String(visit.patientId));
            if (visit.patientName) patientKeys.push(visit.patientName);
            
            const visitDate = toDate(visit.timestamp || visit.date);
            if (!visitDate) return;
            
            // Store visit for all possible keys
            patientKeys.forEach(key => {
                if (!visitsByPatient[key] || visitDate > visitsByPatient[key]) {
                    visitsByPatient[key] = visitDate;
                }
            });
        });
        
        console.log('Visits by patient:', visitsByPatient);
        
        // Update allPatients with last visit if not present
        allPatients = allPatients.map(p => {
            if (!p.lastVisit) {
                // Try multiple keys to find match
                const patientKeys = [];
                if (p.patientId) patientKeys.push(String(p.patientId));
                if (p.name) patientKeys.push(p.name);
                
                for (const key of patientKeys) {
                    if (visitsByPatient[key]) {
                        console.log(`Found lastVisit for ${p.name} (${p.patientId}):`, visitsByPatient[key]);
                        return { ...p, lastVisit: visitsByPatient[key] };
                    }
                }
            }
            return p;
        });
        
    } catch (e) {
        console.warn('Failed to load patients:', e);
        allPatients = [];
    }
    applyFilter();
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
            if (isEditMode && editId) {
                // Update existing patient (only update basic fields, preserve obstetric data if exists)
                const docRef = doc(db, 'clinic', 'data', 'patients', editId);
                await updateDoc(docRef, docData);
                
                // Update local array
                const index = allPatients.findIndex(p => p.id === editId);
                if (index !== -1) {
                    allPatients[index] = { ...allPatients[index], ...docData };
                }
                showSuccess('Data pasien berhasil diupdate!');
            } else {
                // Add new patient
                docData.createdAt = serverTimestamp();
                docData.lastVisit = null;
                docData.nextLocation = 'private';
                docData.visits = [];
                
                const docRef = await addDoc(collection(db, 'clinic','data','patients'), docData);
                allPatients.unshift({ ...docData, id: docRef.id });
                showSuccess('Pasien baru berhasil ditambahkan!');
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
            
            applyFilter();
        } catch (err) {
            console.error('Failed to save patient:', err);
            
            // More specific error messages
            if (err.code === 'permission-denied') {
                showError('Akses ditolak. Periksa Firebase Security Rules.');
            } else if (err.code === 'unavailable') {
                showError('Koneksi Firebase terputus. Periksa internet Anda.');
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
        // Delete from Firebase
        const docRef = doc(db, 'clinic', 'data', 'patients', p.id);
        await deleteDoc(docRef);
        
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
    } catch (err) {
        console.error('Failed to delete patient:', err);
        showError('Gagal menghapus pasien. Silakan coba lagi.');
    }
}

// Function to select patient for billing
async function selectPatientForBilling(patient) {
    if (!patient || !patient.name) {
        showError('Data pasien tidak valid');
        return;
    }
    
    const patientId = String(patient.patientId || '').padStart(5, '0');
    
    // Update display
    const billingPatientNameEl = document.getElementById('billing-patient-name');
    const patientSelectedForBillingEl = document.getElementById('patient-selected-for-billing');
    
    if (billingPatientNameEl) {
        billingPatientNameEl.innerHTML = `
            <span class="badge badge-secondary mr-2">${patientId}</span>
            ${patient.name}
        `;
    }
    
    if (patientSelectedForBillingEl) {
        patientSelectedForBillingEl.classList.remove('d-none');
        // Scroll to top to show selection
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    
    // Set selected patient in billing module
    if (setSelectedPatientForBilling) {
        setSelectedPatientForBilling(patient.name, patient);
    }
    
    // Set patient for medical exam and show medical exam menu
    setCurrentPatientForExam(patient);
    toggleMedicalExamMenu(true);
    
    // Save to session
    updateSessionPatient(patient);
    
    showSuccess(`Pasien "${patient.name}" (${patientId}) dipilih untuk billing`);
}



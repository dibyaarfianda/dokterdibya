// Minimal billing module: load layanan (tindakan), allow selection, update totals.
// Uses VPS API for data loading.

console.log('🔄 billing.js LOADED - Version: 2025-11-08-12:10 - Using AUTH');

import { showWarning, showConfirm } from './toast.js';
import { updateSessionServices, updateSessionObat } from './session-manager.js';
import { getIdToken, hasPermission } from './vps-auth-v2.js';
import { broadcastBillingUpdate } from './realtime-sync.js';

// VPS API Configuration
const VPS_API_BASE = 'https://praktekdrdibya.com';

const serviceListContainer = document.getElementById('serviceList');
const tindakanSearchInput = document.getElementById('tindakanSearchInput');
const selectedServicesList = document.getElementById('selectedServicesList');
const totalAmountTindakanEl = document.getElementById('totalAmountTindakan');

// PATIENT SELECTION ELEMENTS (now in patient-page)
const patientSelect = document.getElementById('patient-select');
const selectedPatientDisplay = document.getElementById('selected-patient-display');
const selectedPatientName = document.getElementById('selected-patient-name');
const tindakanPatientAlert = document.getElementById('tindakan-patient-alert');
const patientSelectedForBilling = document.getElementById('patient-selected-for-billing');
const billingPatientName = document.getElementById('billing-patient-name');

let allServices = [];
let selectedServices = [];
let currentPatient = null;
let currentPatientData = null;
let canSelectServices = true; // Permission flag

const fallbackServices = [
    { id: 'S01', name: 'Administrasi', price: 5000, category: 'Administrasi' },
    { id: 'S06', name: 'USG 2D', price: 150000, category: 'USG' },
    { id: 'S09', name: 'USG 4D', price: 350000, category: 'USG' },
    { id: 'S13', name: 'Vaginal Touche', price: 70000, category: 'Tindakan' },
];

function formatCurrency(number) {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(number || 0);
}

function renderServiceList(filter = '') {
    console.log('🎨 [BILLING] renderServiceList() called with filter:', filter);
    console.log('📊 [BILLING] allServices count:', allServices.length);
    console.log('🎯 [BILLING] serviceListContainer exists:', !!serviceListContainer);
    
    if (!serviceListContainer) return;
    serviceListContainer.innerHTML = '';
    const filtered = allServices.filter(s => s.name.toLowerCase().includes(filter.toLowerCase()));
    
    console.log('🔎 [BILLING] Filtered services count:', filtered.length);
    
    if (filtered.length === 0) {
        serviceListContainer.innerHTML = '<div class="text-center text-muted p-3">Tidak ada layanan yang ditemukan</div>';
        return;
    }
    // Custom category order
    const categoryOrder = [
        'ADMINISTRATIF',
        'LAYANAN',
        'TINDAKAN MEDIS',
        'KONTRASEPSI',
        'VAKSINASI',
        'LABORATORIUM'
    ];
    
    const categoriesSet = new Set(filtered.map(s => s.category));
    const orderedCategories = categoryOrder.filter(cat => categoriesSet.has(cat));
    
    // Add any categories not in the predefined order (fallback)
    const otherCategories = [...categoriesSet].filter(cat => !categoryOrder.includes(cat)).sort();
    const categories = [...orderedCategories, ...otherCategories];
    
    console.log('Categories found:', [...categoriesSet]);
    console.log('Ordered categories:', categories);
    
    categories.forEach(category => {
        const header = document.createElement('div');
        header.className = 'bg-light border-bottom px-3 py-2 font-weight-bold text-white';
        header.style.cssText = 'position: sticky; top: 0px; z-index: 10;';
        header.textContent = category;
        serviceListContainer.appendChild(header);

        filtered.filter(s => s.category === category).forEach(service => {
            const isSelected = selectedServices.some(s => s.id === service.id);
            const row = document.createElement('div');
            row.className = `d-flex justify-content-between align-items-center p-2 border-bottom ${isSelected ? 'bg-primary text-white font-weight-bold' : ''}`;
            row.style.cursor = canSelectServices ? 'pointer' : 'not-allowed';
            row.style.opacity = canSelectServices ? '1' : '0.6';
            row.innerHTML = `
                <span>${service.name}</span>
                <span class="badge ${isSelected ? 'badge-light' : 'badge-secondary'}">${formatCurrency(service.price)}</span>
            `;
            if (canSelectServices) {
                row.onclick = () => toggleService(service);
            }
            serviceListContainer.appendChild(row);
        });
    });
}

function updateSelectedList() {
    if (!selectedServicesList) return;
    selectedServicesList.innerHTML = '';
    if (selectedServices.length === 0) {
        const li = document.createElement('li');
        li.id = 'empty-state-tindakan';
        li.className = 'text-center text-muted py-4';
        li.textContent = 'Pilih layanan di sebelah kiri.';
        selectedServicesList.appendChild(li);
    } else {
        selectedServices.forEach(service => {
            const li = document.createElement('li');
            li.className = 'd-flex justify-content-between align-items-center mb-2 pb-2 border-bottom';
            li.innerHTML = `
                <span>${service.name}</span>
                <div class="d-flex align-items-center">
                    <span class="mr-3">${formatCurrency(service.price)}</span>
                    <button class="btn btn-sm btn-danger" style="width:24px;height:24px;padding:0;line-height:1;">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            `;
            li.querySelector('button').onclick = () => toggleService(service);
            selectedServicesList.appendChild(li);
        });
    }
    const total = selectedServices.reduce((sum, s) => sum + (s.price || 0), 0);
    if (totalAmountTindakanEl) totalAmountTindakanEl.textContent = formatCurrency(total);
}

function toggleService(service) {
    const i = selectedServices.findIndex(s => s.id === service.id);
    if (i >= 0) selectedServices.splice(i, 1); else selectedServices.push(service);
    renderServiceList(tindakanSearchInput?.value || '');
    updateSelectedList();
    
    // Save to session
    updateSessionServices(selectedServices);
    
    // Broadcast billing update if patient is selected
    if (currentPatientData) {
        broadcastBillingUpdate(currentPatientData.patientId || currentPatientData.id, currentPatientData.name);
    }
}

async function loadServices() {
    console.log('🔍 [BILLING] loadServices() called');
    try {
        const token = await getIdToken();
        console.log('🔑 [BILLING] Token status:', token ? 'Available (length: ' + token.length + ')' : 'NOT FOUND');
        
        if (!token) {
            console.warn('❌ [BILLING] No authentication token, using fallback services');
            allServices = fallbackServices;
            console.log('📦 [BILLING] Using fallback services, count:', fallbackServices.length);
            return;
        }
        
        const url = `${VPS_API_BASE}/api/tindakan?active=true`;
        console.log('📡 [BILLING] Fetching from:', url);
        
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        console.log('📥 [BILLING] Response status:', response.status, response.statusText);
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const result = await response.json();
        console.log('📦 [BILLING] API result:', result.success ? 'SUCCESS' : 'FAIL', 'Data count:', result.data?.length || 0);
        
        if (result.success && result.data) {
            allServices = result.data.map(item => ({
                id: item.code || item.id,
                name: item.name,
                price: parseFloat(item.price) || 0,
                category: item.category
            }));
            allServices.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
            console.log('✅ [BILLING] Loaded', allServices.length, 'services from database');
        } else {
            allServices = fallbackServices;
            console.log('⚠️ [BILLING] Using fallback services');
        }
    } catch (e) {
        console.error('❌ [BILLING] Error loading services:', e);
        allServices = fallbackServices;
        console.log('📦 [BILLING] Using fallback services, count:', fallbackServices.length);
    }
}

export async function initBilling() {
    console.log('🚀 [BILLING] initBilling() called');
    
    // Check if user has permission to select services
    canSelectServices = await hasPermission('services.select');
    console.log('🔐 [BILLING] User can select services:', canSelectServices);
    
    await loadServices();
    console.log('✅ [BILLING] loadServices() completed');
    await loadPatientsToSelect();
    console.log('✅ [BILLING] loadPatientsToSelect() completed');
    
    // Disable service selection if no permission (but still show list in read-only mode)
    if (!canSelectServices) {
        if (serviceListContainer) {
            serviceListContainer.innerHTML = '<div class="alert alert-info"><i class="fas fa-eye"></i> Mode Lihat Saja - Anda dapat melihat tindakan yang dipilih tetapi tidak dapat mengubahnya</div>';
        }
        if (tindakanSearchInput) {
            tindakanSearchInput.disabled = true;
            tindakanSearchInput.placeholder = 'Mode lihat saja';
        }
        console.log('ℹ️ [BILLING] Service selection in read-only mode');
    }
    
    renderServiceList('');
    console.log('✅ [BILLING] renderServiceList() called');
    updateSelectedList();
    console.log('✅ [BILLING] updateSelectedList() completed');
    tindakanSearchInput?.addEventListener('input', (e) => renderServiceList(e.target.value));
    
    // Patient selection
    if (patientSelect) {
        patientSelect.addEventListener('change', (e) => {
            if (e.target.value) {
                currentPatient = e.target.options[e.target.selectedIndex].text;
                updatePatientDisplay();
            } else {
                currentPatient = null;
                updatePatientDisplay();
            }
        });
    }
    
    // OBAT is now handled by billing-obat.js module (loaded dynamically when opening Obat page)
}

async function loadPatientsToSelect() {
    if (!patientSelect) return;
    try {
        const token = await getIdToken();
        if (!token) {
            console.warn('No authentication token available');
            return;
        }
        
        const response = await fetch(`${VPS_API_BASE}/api/patients`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (response.ok) {
            const result = await response.json();
            if (result.success && result.data) {
                const patients = result.data;
                patients.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
                patients.forEach(p => {
                    const opt = document.createElement('option');
                    opt.value = p.id;
                    // Hanya tampilkan nama, tanpa kode unik
                    opt.textContent = p.name || 'Tanpa Nama';
                    patientSelect.appendChild(opt);
                });
            }
        }
    } catch (e) {
        console.warn('Failed to load patients:', e);
    }
}

// Patient selection functions
export function updatePatientDisplay() {
    // Update display in patient page
    if (patientSelectedForBilling && billingPatientName) {
        if (currentPatient) {
            patientSelectedForBilling.classList.remove('d-none');
            billingPatientName.textContent = currentPatient;
        } else {
            patientSelectedForBilling.classList.add('d-none');
            billingPatientName.textContent = '';
        }
    }
    
    // Update display in tindakan page
    if (selectedPatientDisplay && selectedPatientName && tindakanPatientAlert) {
        if (currentPatient) {
            selectedPatientDisplay.classList.remove('d-none');
            selectedPatientName.textContent = currentPatient;
            tindakanPatientAlert.classList.add('d-none');
        } else {
            selectedPatientDisplay.classList.add('d-none');
            selectedPatientName.textContent = '';
            tindakanPatientAlert.classList.remove('d-none');
        }
    }
}

export function validatePatient() {
    if (!currentPatient) {
        showWarning('Harap pilih pasien di menu Data Pasien terlebih dahulu!');
        return false;
    }
    return true;
}

export function validateObatUsage() {
    // This function is now in billing-obat.js
    // Keeping stub here for backward compatibility
    return true;
}

export function getCurrentPatient() {
    return currentPatient;
}

export function getSelectedServices() {
    return selectedServices;
}

export function getSelectedObat() {
    // This function is now in billing-obat.js
    // Returning stub for backward compatibility
    return [];
}

export function getCurrentPatientData() {
    // Return stored patient data if available
    if (currentPatientData) {
        return {
            id: currentPatientData.patientId || currentPatientData.id || null,
            name: currentPatientData.name || currentPatient,
            whatsapp: currentPatientData.whatsapp || '-'
        };
    }
    
    // Fallback: Get patient data from select dropdown
    const select = document.getElementById('patient-select');
    if (select && select.value) {
        return {
            id: select.value,
            name: currentPatient,
            whatsapp: '-' // Will be enhanced later with actual data
        };
    }
    
    return {
        name: currentPatient || '-',
        whatsapp: '-'
    };
}

export function setSelectedPatient(patientName, patientData) {
    currentPatient = patientName;
    currentPatientData = patientData;
    
    // Store globally for realtime sync
    window.currentPatientData = patientData;
    
    updatePatientDisplay();
}

export function clearSelectedPatient() {
    currentPatient = null;
    currentPatientData = null;
    updatePatientDisplay();
}

// Global functions for obat are now in billing-obat.js



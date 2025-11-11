// billing-obat.js - Handle Obat from VPS API
// This module handles medications, vials, and medical supplies

import { showSuccess, showError, showWarning } from './toast.js';
import { updateSessionObat } from './session-manager.js';
import { getIdToken, hasPermission } from './vps-auth-v2.js';
import { broadcastBillingUpdate } from './realtime-sync.js';

// API Base URL
const API_BASE = 'https://praktekdrdibya.com/api';

let allObat = [];
let selectedObat = [];
let canSelectMedications = true; // Permission flag

// DOM Elements
let drugsContainer = null;
let ampulsContainer = null;
let consumablesContainer = null;
let selectedObatList = null;
let obatSearchInput = null;
let obatTotalEl = null;

// Category mapping
const categoryMap = {
    'Obat-obatan': 'drugs',
    'Ampul & Vial': 'ampuls',
    'Alkes': 'consumables'
};

function formatCurrency(amount) {
    return 'Rp ' + amount.toLocaleString('id-ID');
}

// ==================== LOAD OBAT FROM VPS ====================
async function loadObat() {
    try {
        const token = await getIdToken();
        if (!token) {
            showError('Tidak terautentikasi. Silakan login kembali.');
            return;
        }
        
        const response = await fetch(`${API_BASE}/obat?active=true`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        
        if (result.success) {
            allObat = result.data.map(item => ({
                ...item,
                categoryType: categoryMap[item.category] || 'drugs',
                price: parseFloat(item.price) || 0
            }));
            console.log('Γ£à Loaded', allObat.length, 'obat items from VPS');
        } else {
            throw new Error(result.message || 'Failed to load obat');
        }
        
    } catch (error) {
        console.error('Γ¥î Error loading obat from VPS:', error);
        showError('Gagal memuat data obat dari server');
        allObat = [];
    }
}

// ==================== RENDER OBAT BY CATEGORY ====================
function renderObatByCategory(category, container, filter = '') {
    if (!container) return;
    
    container.innerHTML = '';
    
    let filtered = allObat.filter(item => item.categoryType === category);
    
    if (filter) {
        filtered = filtered.filter(item => 
            item.name.toLowerCase().includes(filter.toLowerCase())
        );
    }
    
    if (filtered.length === 0) {
        container.innerHTML = '<p class="text-center text-muted py-4">Tidak ada item ditemukan.</p>';
        return;
    }
    
    // Sort by name
    filtered.sort((a, b) => a.name.localeCompare(b.name));
    
    filtered.forEach(item => {
        // Normalize ID types for comparison
        const isSelected = selectedObat.some(s => String(s.id) === String(item.id));
        const row = document.createElement('div');
        row.className = `d-flex justify-content-between align-items-center p-2 border-bottom ${isSelected ? 'bg-success text-white font-weight-bold' : ''}`;
        row.style.cursor = canSelectMedications ? 'pointer' : 'not-allowed';
        row.style.opacity = canSelectMedications ? '1' : '0.6';
        
        // Show stock info
        const stockBadge = item.stock <= item.min_stock 
            ? `<span class="badge badge-danger ml-2">Stok: ${item.stock}</span>`
            : `<span class="badge badge-secondary ml-2">Stok: ${item.stock}</span>`;
        
        row.innerHTML = `
            <span>${item.name} ${stockBadge}</span>
            <span class="badge ${isSelected ? 'badge-light' : 'badge-info'}">${formatCurrency(item.price)}</span>
        `;
        if (canSelectMedications) {
            row.onclick = () => toggleObat(item);
        }
        container.appendChild(row);
    });
}

// ==================== TOGGLE OBAT SELECTION ====================
function toggleObat(item) {
    // Normalize ID types for comparison
    const index = selectedObat.findIndex(s => String(s.id) === String(item.id));
    
    if (index >= 0) {
        // Remove
        selectedObat.splice(index, 1);
    } else {
        // Add with default quantity
        // Include both 'category' (for cashier compatibility) and 'categoryType' (for this module)
        selectedObat.push({
            ...item,
            category: item.categoryType, // Map categoryType to category for cashier compatibility
            quantity: 1,
            usage: item.categoryType === 'drugs' ? '' : null // Only drugs need usage
        });
    }
    
    // Re-render all categories
    renderAllCategories();
    updateSelectedObatList();
    
    // Save to session
    updateSessionObat(selectedObat);
    
    // Broadcast billing update if patient is selected
    if (window.currentPatientId && window.currentPatientData) {
        broadcastBillingUpdate(window.currentPatientId, window.currentPatientData.name);
    }
}

// ==================== RENDER ALL CATEGORIES ====================
function renderAllCategories(filter = '') {
    renderObatByCategory('drugs', drugsContainer, filter);
    renderObatByCategory('ampuls', ampulsContainer, filter);
    renderObatByCategory('consumables', consumablesContainer, filter);
}

// ==================== UPDATE SELECTED OBAT LIST ====================
function updateSelectedObatList() {
    if (!selectedObatList) return;
    
    selectedObatList.innerHTML = '';
    
    if (selectedObat.length === 0) {
        selectedObatList.innerHTML = `
            <div id="empty-state-obat" class="text-center text-muted py-5">
                <i class="fas fa-hand-pointer fa-3x mb-3 opacity-25"></i>
                <p>Pilih obat dari daftar di sebelah kiri</p>
            </div>
        `;
    } else {
        selectedObat.forEach((item, index) => {
            const card = document.createElement('div');
            card.className = 'card card-sm mb-2';
            
            // Cara pakai hanya untuk obat-obatan (drugs), tidak untuk vial/alkes
            const needsUsageInstruction = item.categoryType === 'drugs';
            
            card.innerHTML = `
                <div class="card-body p-2">
                    <div class="d-flex justify-content-between align-items-start mb-2">
                        <div class="flex-grow-1">
                            <strong>${item.name}</strong>
                            <div class="small text-muted">${formatCurrency(item.price || 0)} x <span id="qty-display-${index}">${item.quantity}</span></div>
                        </div>
                        <button class="btn btn-sm btn-danger btn-xs ml-2" onclick="window.removeObat(${item.id})">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div class="form-group mb-2">
                        <label class="small mb-1">Jumlah:</label>
                        <input type="number" class="form-control form-control-sm" value="${item.quantity}" min="1" 
                               onchange="window.updateObatQuantity(${index}, this.value)" style="width: 80px;">
                    </div>
                    ${needsUsageInstruction ? `
                    <div class="form-group mb-0">
                        <label class="small mb-1">Cara Pakai: <span class="badge badge-danger badge-sm">Wajib</span></label>
                        <textarea class="form-control form-control-sm" rows="2" placeholder="Contoh: 3x sehari sesudah makan" 
                                  onchange="window.updateObatUsage(${index}, this.value)" required>${item.usage || ''}</textarea>
                    </div>
                    ` : ''}
                </div>
            `;
            selectedObatList.appendChild(card);
        });
    }
    
    updateObatTotal();
}

// ==================== UPDATE OBAT QUANTITY ====================
window.updateObatQuantity = function(itemIndex, quantity) {
    if (selectedObat[itemIndex]) {
        selectedObat[itemIndex].quantity = parseInt(quantity) || 1;
        updateSelectedObatList();
        updateSessionObat(selectedObat);
    }
};

// ==================== UPDATE OBAT USAGE ====================
window.updateObatUsage = function(itemIndex, usage) {
    if (selectedObat[itemIndex]) {
        selectedObat[itemIndex].usage = usage;
        updateSessionObat(selectedObat);
    }
};

// ==================== REMOVE OBAT ====================
window.removeObat = function(itemId) {
    // Normalize ID types for comparison
    const index = selectedObat.findIndex(s => String(s.id) === String(itemId));
    if (index >= 0) {
        selectedObat.splice(index, 1);
        renderAllCategories();
        updateSelectedObatList();
        updateSessionObat(selectedObat);
    }
};

// ==================== UPDATE OBAT TOTAL ====================
function updateObatTotal() {
    if (!obatTotalEl) return;
    
    const total = selectedObat.reduce((sum, item) => {
        return sum + (parseFloat(item.price) * parseInt(item.quantity));
    }, 0);
    
    obatTotalEl.textContent = formatCurrency(total);
}

// ==================== VALIDATE OBAT USAGE ====================
export function validateObatUsage() {
    const drugs = selectedObat.filter(item => item.categoryType === 'drugs');
    const missingUsage = drugs.filter(item => !item.usage || item.usage.trim() === '');
    
    if (missingUsage.length > 0) {
        showWarning('Mohon lengkapi cara pakai untuk semua obat');
        return false;
    }
    return true;
}

// ==================== INIT OBAT MODULE ====================
export async function initObat() {
    console.log('🔷 Initializing Obat module (VPS Mode)...');
    
    // Get DOM elements
    drugsContainer = document.getElementById('drugs-container');
    ampulsContainer = document.getElementById('ampuls-container');
    consumablesContainer = document.getElementById('consumables-container');
    selectedObatList = document.getElementById('selected-obat-list');
    obatSearchInput = document.getElementById('obatSearchInput');
    obatTotalEl = document.getElementById('totalAmountObat');
    
    if (!drugsContainer || !ampulsContainer || !consumablesContainer) {
        console.error('❌ Required DOM elements for obat not found!');
        return;
    }
    
    // Check if user has permission to select medications
    canSelectMedications = await hasPermission('medications.select');
    console.log('🔐 [OBAT] User can select medications:', canSelectMedications);
    
    // Load obat from VPS
    await loadObat();
    
    // Disable medication selection if no permission (but still show selected items in read-only mode)
    if (!canSelectMedications) {
        const infoMsg = '<div class="alert alert-info"><i class="fas fa-eye"></i> Mode Lihat Saja - Anda dapat melihat obat yang dipilih tetapi tidak dapat mengubahnya</div>';
        if (drugsContainer) drugsContainer.innerHTML = infoMsg;
        if (ampulsContainer) ampulsContainer.innerHTML = '';
        if (consumablesContainer) consumablesContainer.innerHTML = '';
        if (obatSearchInput) {
            obatSearchInput.disabled = true;
            obatSearchInput.placeholder = 'Mode lihat saja';
        }
        console.log('ℹ️ [OBAT] Medication selection in read-only mode');
    }
    
    // Render all categories
    renderAllCategories();
    updateSelectedObatList();
    
    // Bind search input
    if (obatSearchInput) {
        obatSearchInput.addEventListener('input', (e) => {
            renderAllCategories(e.target.value);
        });
    }
    
    console.log('Γ£à Obat module initialized');
}

// ==================== EXPORTS ====================
export function getSelectedObat() {
    return selectedObat;
}

export function setSelectedObat(obat) {
    selectedObat = obat || [];
    renderAllCategories();
    updateSelectedObatList();
}

export function clearSelectedObat() {
    selectedObat = [];
    renderAllCategories();
    updateSelectedObatList();
    updateSessionObat([]);
}

export function getObatTotal() {
    return selectedObat.reduce((sum, item) => {
        return sum + (parseFloat(item.price) * parseInt(item.quantity));
    }, 0);
}


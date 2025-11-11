// kelola-obat.js - Manage Obat (Superadmin Only)
// Handle CRUD operations for medications, vials, and medical supplies

import { showSuccess, showError, showWarning } from './toast.js';
import { getIdToken } from './vps-auth-v2.js';

console.log('🔄 kelola-obat.js LOADED - Version: 2025-11-08-11:40 - Using AUTH');

// API Base URL
const API_BASE = 'https://praktekdrdibya.com/api'; // Protected endpoint for write operations
const PUBLIC_API = 'https://praktekdrdibya.com/public'; // Public endpoint for read operations

let allObat = [];
let isEditMode = false;
let editingObatId = null;
let initialized = false;

// Initialize the module
export function initKelolaObat() {
    console.log('🚀 [KELOLA-OBAT] initKelolaObat() called');
    console.log('📊 [KELOLA-OBAT] Initialized status:', initialized);
    
    if (initialized) {
        console.log('⚠️ [KELOLA-OBAT] Already initialized, reloading data...');
        loadObat(); // Just reload data if already initialized
        return;
    }
    
    initialized = true;
    console.log('🔧 [KELOLA-OBAT] First initialization...');
    
    // Check if required DOM elements exist
    const form = document.getElementById('kelola-obat-form');
    const tbody = document.getElementById('kelola-obat-list-body');
    const searchInput = document.getElementById('kelola-obat-search');
    
    console.log('🎯 [KELOLA-OBAT] DOM elements check:');
    console.log('   - Form:', !!form);
    console.log('   - Table body:', !!tbody);
    console.log('   - Search input:', !!searchInput);
    
    bindFormSubmit();
    bindSearchFilter();
    loadObat();
}

// Bind form submit
function bindFormSubmit() {
    const form = document.getElementById('kelola-obat-form');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const nameInput = document.getElementById('kelola-obat-name');
        const categoryInput = document.getElementById('kelola-obat-category');
        const priceInput = document.getElementById('kelola-obat-price');
        const stockInput = document.getElementById('kelola-obat-stock');

        const name = nameInput?.value?.trim();
        const category = categoryInput?.value?.trim();
        const price = parseFloat(priceInput?.value || 0);
        const stock = parseInt(stockInput?.value || 0);
        const unit = 'pcs'; // Default unit

        if (!name || !category || price < 0) {
            showWarning('Mohon lengkapi semua field dengan benar');
            return;
        }

        try {
            const token = await getIdToken();
            if (!token) {
                showError('Anda tidak terautentikasi. Silakan login kembali.');
                return;
            }

            const headers = {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            };

            let response;
            if (isEditMode && editingObatId) {
                // Update existing obat
                response = await fetch(`${API_BASE}/obat/${editingObatId}`, {
                    method: 'PUT',
                    headers: headers,
                    body: JSON.stringify({ 
                        name, 
                        category, 
                        price, 
                        stock, 
                        unit: 'pcs',
                        min_stock: 10,
                        is_active: true 
                    })
                });
            } else {
                // Add new obat
                const code = `OB${Date.now().toString().slice(-6)}`; // Generate simple code
                response = await fetch(`${API_BASE}/obat`, {
                    method: 'POST',
                    headers: headers,
                    body: JSON.stringify({ code, name, category, price, stock, unit: 'pcs', min_stock: 10 })
                });
            }

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
            }

            const result = await response.json();
            if (result.success) {
                showSuccess(isEditMode ? 'Obat berhasil diperbarui' : 'Obat berhasil ditambahkan');
                form.reset();
                resetForm();
                loadObat();
            } else {
                throw new Error(result.message || 'Gagal menyimpan obat');
            }
        } catch (error) {
            console.error('Error saving obat:', error);
            showError('Gagal menyimpan obat: ' + error.message);
        }
    });
}

// Bind search/filter
function bindSearchFilter() {
    const searchInput = document.getElementById('kelola-obat-search');
    const categoryFilter = document.getElementById('kelola-obat-filter-category');
    
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase().trim();
            const category = categoryFilter?.value || '';
            filterObat(searchTerm, category);
        });
    }
    
    if (categoryFilter) {
        categoryFilter.addEventListener('change', (e) => {
            const category = e.target.value;
            const searchTerm = searchInput?.value.toLowerCase().trim() || '';
            filterObat(searchTerm, category);
        });
    }
}

// Load all obat from VPS
async function loadObat() {
    try {
        console.log('🔍 loadObat() called');
        const token = await getIdToken();
        console.log('🔑 Token status:', token ? 'Available (length: ' + token.length + ')' : 'NOT FOUND');
        
        if (!token) {
            console.error('❌ No token - user not authenticated');
            showError('Tidak terautentikasi. Silakan login kembali.');
            return;
        }
        
        // Use authenticated endpoint - only get active obat
        const url = `${API_BASE}/obat?active=true&_t=${Date.now()}`;
        console.log('📡 Fetching from:', url);
        
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        console.log('📥 Response status:', response.status, response.statusText);
        
        if (!response.ok) {
            if (response.status === 403) {
                throw new Error('Anda tidak memiliki izin untuk melihat data obat');
            }
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        
        if (result.success) {
            allObat = result.data;
            console.log('✅ Loaded', allObat.length, 'obat items from VPS');
        } else {
            throw new Error(result.message || 'Failed to load obat');
        }

        renderObatTable(allObat);
    } catch (error) {
        console.error('Error loading obat:', error);
        showError('Gagal memuat data obat dari server: ' + error.message);
        
        // Show empty state
        const tbody = document.getElementById('kelola-obat-list-body');
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="text-center text-danger py-4">
                        <i class="fas fa-exclamation-triangle fa-2x mb-2"></i>
                        <p class="mb-0"><strong>Error: ${error.message}</strong></p>
                        <small>Silakan refresh halaman atau login kembali</small>
                    </td>
                </tr>
            `;
        }
    }
}

// Filter obat based on search term and category
function filterObat(searchTerm = '', category = '') {
    let filtered = allObat;

    if (category) {
        filtered = filtered.filter(obat => obat.category === category);
    }

    if (searchTerm) {
        filtered = filtered.filter(obat => {
            return (
                obat.name?.toLowerCase().includes(searchTerm) ||
                obat.category?.toLowerCase().includes(searchTerm)
            );
        });
    }

    renderObatTable(filtered);
    
    const countEl = document.getElementById('kelola-obat-total-count');
    if (countEl) countEl.textContent = filtered.length;
}

// Render obat table
function renderObatTable(obat) {
    const tbody = document.getElementById('kelola-obat-list-body');
    if (!tbody) return;

    if (obat.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="text-center text-muted py-4">
                    <i class="fas fa-inbox fa-2x mb-2"></i>
                    <p class="mb-0">Tidak ada data obat</p>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = obat.map((item, index) => {
        const stockBadge = item.stock <= item.min_stock 
            ? `<span class="badge badge-danger">${item.stock}</span>`
            : `<span class="badge badge-success">${item.stock}</span>`;
        
        const categoryBadge = item.category === 'Obat-obatan' 
            ? 'badge-primary' 
            : item.category === 'Ampul & Vial' 
            ? 'badge-info' 
            : 'badge-secondary';
        
        return `
            <tr>
                <td>${index + 1}</td>
                <td>${item.name || '-'}</td>
                <td>
                    <span class="badge ${categoryBadge}">${item.category || '-'}</span>
                </td>
                <td>Rp ${(parseFloat(item.price) || 0).toLocaleString('id-ID')}</td>
                <td class="text-center">${stockBadge}</td>
                <td class="text-center">
                    <button class="btn btn-sm btn-warning mr-1" onclick="window.editObat('${item.id}')">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="window.deleteObat('${item.id}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
    
    const countEl = document.getElementById('kelola-obat-total-count');
    if (countEl) countEl.textContent = obat.length;
}

// Edit obat
function editObat(obatId) {
    const obat = allObat.find(o => o.id == obatId);
    if (!obat) return;

    isEditMode = true;
    editingObatId = obatId;

    const nameInput = document.getElementById('kelola-obat-name');
    const categoryInput = document.getElementById('kelola-obat-category');
    const priceInput = document.getElementById('kelola-obat-price');
    const stockInput = document.getElementById('kelola-obat-stock');
    const submitBtn = document.querySelector('#kelola-obat-form button[type="submit"]');

    if (nameInput) nameInput.value = obat.name || '';
    if (categoryInput) categoryInput.value = obat.category || '';
    if (priceInput) priceInput.value = parseFloat(obat.price) || 0;
    if (stockInput) stockInput.value = obat.stock || 0;

    if (submitBtn) {
        submitBtn.innerHTML = '<i class="fas fa-save mr-1"></i>Update';
        submitBtn.classList.remove('btn-success');
        submitBtn.classList.add('btn-warning');
    }

    const form = document.getElementById('kelola-obat-form');
    if (form) {
        form.scrollIntoView({ behavior: 'smooth', block: 'start' });
        nameInput?.focus();
    }
}

// Delete obat
async function deleteObat(obatId) {
    const obat = allObat.find(o => o.id == obatId);
    if (!obat) return;

    if (!confirm(`Yakin ingin menghapus obat "${obat.name}"?`)) return;

    try {
        const token = await getIdToken();
        if (!token) {
            showError('Anda tidak terautentikasi. Silakan login kembali.');
            return;
        }

        const response = await fetch(`${API_BASE}/obat/${obatId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        if (result.success) {
            showSuccess('Obat berhasil dihapus');
            loadObat();
        } else {
            throw new Error(result.message || 'Gagal menghapus obat');
        }
    } catch (error) {
        console.error('Error deleting obat:', error);
        showError('Gagal menghapus obat: ' + error.message);
    }
}

// Reset form
function resetForm() {
    isEditMode = false;
    editingObatId = null;

    const submitBtn = document.querySelector('#kelola-obat-form button[type="submit"]');
    if (submitBtn) {
        submitBtn.innerHTML = '<i class="fas fa-plus mr-1"></i>Tambah';
        submitBtn.classList.remove('btn-warning');
        submitBtn.classList.add('btn-success');
    }
}

// Expose functions to window
window.editObat = editObat;
window.deleteObat = deleteObat;


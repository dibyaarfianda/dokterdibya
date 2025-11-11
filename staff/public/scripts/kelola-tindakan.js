// Kelola Tindakan - Service Management Module
// Uses VPS API for data operations

import { auth, getIdToken } from './vps-auth-v2.js';
import { showSuccess, showError, showWarning } from './toast.js';

console.log('🔄 kelola-tindakan.js LOADED - Version: 2025-11-08-11:40 - Using AUTH');

// VPS API Configuration
const VPS_API_BASE = ['localhost', '127.0.0.1'].includes(window.location.hostname)
    ? 'http://localhost:3001'
    : window.location.origin.replace(/\/$/, '');

let allServices = [];
let isEditMode = false;
let editingServiceId = null;
let isInitialized = false;

// Initialize the module
export function initKelolaTindakan() {
    console.log('🔧 Initializing Kelola Tindakan...');
    
    // Only bind events once to avoid duplicates
    if (!isInitialized) {
        bindFormSubmit();
        bindSearchFilter();
        isInitialized = true;
    }
    
    loadServices();
}

// Bind form submit
function bindFormSubmit() {
    const form = document.getElementById('add-tindakan-form');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const nameInput = document.getElementById('tindakan-name');
        const categoryInput = document.getElementById('tindakan-category');
        const priceInput = document.getElementById('tindakan-price');

        const name = nameInput?.value?.trim();
        const category = categoryInput?.value?.trim();
        const price = parseFloat(priceInput?.value || 0);

        if (!name || !category || price <= 0) {
            showWarning('Mohon lengkapi semua field dengan benar');
            return;
        }

        try {
            const token = await getIdToken();
            if (!token) {
                showError('Anda tidak terautentikasi. Silakan login kembali.');
                return;
            }

            if (isEditMode && editingServiceId) {
                // Update existing service via VPS API
                const response = await fetch(`${VPS_API_BASE}/api/tindakan/${editingServiceId}`, {
                    method: 'PUT',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ name, category, price })
                });
                if (response.ok) {
                    showSuccess('Tindakan berhasil diperbarui');
                    resetForm();
                } else {
                    const errorData = await response.json();
                    throw new Error(errorData.message || 'Failed to update tindakan');
                }
            } else {
                // Add new service via VPS API - backend will auto-generate code
                const response = await fetch(`${VPS_API_BASE}/api/tindakan`, {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ name, category, price })
                });
                if (response.ok) {
                    showSuccess('Tindakan berhasil ditambahkan');
                } else {
                    const errorData = await response.json();
                    throw new Error(errorData.message || 'Failed to add tindakan');
                }
            }

            form.reset();
            loadServices();
        } catch (error) {
            console.error('Error saving service:', error);
            showError('Gagal menyimpan tindakan: ' + error.message);
        }
    });
}

// Bind search/filter
function bindSearchFilter() {
    const searchInput = document.getElementById('tindakan-search');
    const categoryFilter = document.getElementById('tindakan-filter-category');
    
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase().trim();
            const category = categoryFilter?.value || '';
            filterServices(searchTerm, category);
        });
    }
    
    if (categoryFilter) {
        categoryFilter.addEventListener('change', (e) => {
            const category = e.target.value;
            const searchTerm = searchInput?.value.toLowerCase().trim() || '';
            filterServices(searchTerm, category);
        });
    }
}

// Load all services from VPS API
async function loadServices() {
    try {
        console.log('🔍 loadServices() called');
        const token = await getIdToken();
        console.log('🔑 Token status:', token ? 'Available (length: ' + token.length + ')' : 'NOT FOUND');
        
        if (!token) {
            console.error('❌ No token - user not authenticated');
            showError('Tidak terautentikasi. Silakan login kembali.');
            return;
        }
        
        const url = `${VPS_API_BASE}/api/tindakan?active=true`;
        console.log('📡 Fetching from:', url);
        
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        console.log('📥 Response status:', response.status, response.statusText);
        
        if (response.ok) {
            const result = await response.json();
            if (result.success && result.data) {
                allServices = result.data.map(item => ({
                    id: item.id,  // Use numeric ID for API calls
                    code: item.code,
                    name: item.name,
                    category: item.category,
                    price: parseFloat(item.price) || 0
                }));
            } else {
                allServices = [];
            }
        } else {
            allServices = [];
            if (response.status === 403) {
                showError('Anda tidak memiliki izin untuk melihat data tindakan');
            }
        }

        // Sort in JavaScript
        allServices.sort((a, b) => {
            // First sort by category
            const catCompare = (a.category || '').localeCompare(b.category || '');
            if (catCompare !== 0) return catCompare;
            // Then sort by name
            return (a.name || '').localeCompare(b.name || '');
        });

        renderServiceTable(allServices);
    } catch (error) {
        console.error('Error loading services:', error);
        showError('Gagal memuat data tindakan: ' + error.message);
        
        // Show empty state
        const tbody = document.getElementById('tindakan-list-body');
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" class="text-center text-danger py-4">
                        <i class="fas fa-exclamation-triangle fa-2x mb-2"></i>
                        <p class="mb-0"><strong>Error: ${error.message}</strong></p>
                        <small>Silakan refresh halaman atau login kembali</small>
                    </td>
                </tr>
            `;
        }
    }
}

// Filter services based on search term and category
function filterServices(searchTerm = '', category = '') {
    let filtered = allServices;

    // Filter by category if selected
    if (category) {
        filtered = filtered.filter(service => service.category === category);
    }

    // Filter by search term
    if (searchTerm) {
        filtered = filtered.filter(service => {
            return (
                service.name?.toLowerCase().includes(searchTerm) ||
                service.category?.toLowerCase().includes(searchTerm)
            );
        });
    }

    renderServiceTable(filtered);
    
    // Update count
    const countEl = document.getElementById('tindakan-total-count');
    if (countEl) countEl.textContent = filtered.length;
}

// Render service table
function renderServiceTable(services) {
    const tbody = document.getElementById('tindakan-list-body');
    if (!tbody) return;

    if (services.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="text-center text-muted py-4">
                    <i class="fas fa-inbox fa-2x mb-2"></i>
                    <p class="mb-0">Tidak ada data tindakan</p>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = services.map((service, index) => `
        <tr>
            <td>${index + 1}</td>
            <td>${service.name || '-'}</td>
            <td>
                <span class="badge badge-info">${service.category || '-'}</span>
            </td>
            <td>Rp ${(service.price || 0).toLocaleString('id-ID')}</td>
            <td class="text-center">
                <button class="btn btn-sm btn-warning mr-1" onclick="window.editService('${service.id}')">
                    <i class="fas fa-edit"></i> Edit
                </button>
                <button class="btn btn-sm btn-danger" onclick="window.deleteService('${service.id}')">
                    <i class="fas fa-trash"></i> Hapus
                </button>
            </td>
        </tr>
    `).join('');
    
    // Update total count
    const countEl = document.getElementById('tindakan-total-count');
    if (countEl) countEl.textContent = services.length;
}

// Edit service
function editService(serviceId) {
    const service = allServices.find(s => s.id == serviceId);
    if (!service) return;

    isEditMode = true;
    editingServiceId = serviceId;

    const nameInput = document.getElementById('tindakan-name');
    const categoryInput = document.getElementById('tindakan-category');
    const priceInput = document.getElementById('tindakan-price');
    const submitBtn = document.querySelector('#add-tindakan-form button[type="submit"]');

    if (nameInput) nameInput.value = service.name || '';
    if (categoryInput) categoryInput.value = service.category || '';
    if (priceInput) priceInput.value = service.price || 0;

    if (submitBtn) {
        submitBtn.innerHTML = '<i class="fas fa-save mr-1"></i>Update';
        submitBtn.classList.remove('btn-success');
        submitBtn.classList.add('btn-warning');
    }

    // Scroll to form
    const form = document.getElementById('add-tindakan-form');
    if (form) {
        form.scrollIntoView({ behavior: 'smooth', block: 'start' });
        nameInput?.focus();
    }
}

// Delete service via VPS API
async function deleteService(serviceId) {
    console.log('🗑️ [DELETE] deleteService called with ID:', serviceId, 'Type:', typeof serviceId);
    console.log('📊 [DELETE] All services count:', allServices.length);
    console.log('🔍 [DELETE] All service IDs:', allServices.map(s => ({id: s.id, type: typeof s.id})));
    
    // Try both string and number comparison
    let service = allServices.find(s => s.id === serviceId);
    if (!service) {
        // Try converting to number
        service = allServices.find(s => s.id == serviceId || String(s.id) === String(serviceId));
        console.log('🔄 [DELETE] Retry with type conversion, found:', service);
    }
    
    console.log('🔍 [DELETE] Found service:', service);
    
    if (!service) {
        console.error('❌ [DELETE] Service not found with ID:', serviceId);
        showError('Tindakan tidak ditemukan');
        return;
    }

    const confirmDelete = confirm(`Hapus tindakan "${service.name}"?\n\nTindakan ini tidak dapat dibatalkan.`);
    console.log('❓ [DELETE] User confirmed:', confirmDelete);
    
    if (!confirmDelete) return;

    try {
        const token = await getIdToken();
        console.log('🔑 [DELETE] Token status:', token ? 'Available' : 'NOT FOUND');
        
        if (!token) {
            showError('Anda tidak terautentikasi. Silakan login kembali.');
            return;
        }

        const url = `${VPS_API_BASE}/api/tindakan/${serviceId}`;
        console.log('📡 [DELETE] DELETE request to:', url);
        
        const response = await fetch(url, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        console.log('📥 [DELETE] Response status:', response.status);
        
        if (response.ok) {
            showSuccess('Tindakan berhasil dihapus');
            console.log('✅ [DELETE] Delete successful, reloading services...');
            
            // Wait a moment for database to update, then reload
            setTimeout(() => {
                console.log('🔄 [DELETE] Reloading services now...');
                loadServices();
            }, 500);
        } else {
            const errorData = await response.json();
            console.error('❌ [DELETE] Server error:', errorData);
            throw new Error(errorData.message || 'Failed to delete tindakan');
        }
    } catch (error) {
        console.error('❌ [DELETE] Error:', error);
        console.error('Error deleting service:', error);
        showError('Gagal menghapus tindakan: ' + error.message);
    }
}

// Reset form to add mode
function resetForm() {
    isEditMode = false;
    editingServiceId = null;

    const submitBtn = document.querySelector('#add-tindakan-form button[type="submit"]');
    if (submitBtn) {
        submitBtn.innerHTML = '<i class="fas fa-plus mr-1"></i>Tambah';
        submitBtn.classList.remove('btn-warning');
        submitBtn.classList.add('btn-success');
    }
}

// Generate next code (S34, S35, etc)
function generateNextCode() {
    if (allServices.length === 0) {
        return 'S01';
    }
    
    // Find highest code number
    const codes = allServices
        .map(s => s.code)
        .filter(code => code && code.startsWith('S'))
        .map(code => parseInt(code.substring(1)))
        .filter(num => !isNaN(num));
    
    const maxNum = Math.max(...codes, 0);
    const nextNum = maxNum + 1;
    
    return 'S' + String(nextNum).padStart(2, '0');
}

// Expose functions to window for onclick handlers (available immediately)
window.editService = editService;
window.deleteService = deleteService;

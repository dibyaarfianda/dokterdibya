/**
 * Penjualan Obat Module
 * Medication sales for hospital patients (RSIA Melinda, RSUD Gambiran, RS Bhayangkara)
 */

import { getIdToken } from './vps-auth-v2.js';

const API_URL = window.location.hostname === 'localhost'
    ? 'http://localhost:3000/api'
    : 'https://dokterdibya.com/api';

let currentUser = null;
let currentSales = [];
let currentSaleData = null;
let obatOptions = [];
// patientSearchTimeout removed - using direct text input now

// Hospital options
const HOSPITALS = [
    { value: 'rsia_melinda', label: 'RSIA Melinda' },
    { value: 'rsud_gambiran', label: 'RSUD Gambiran' },
    { value: 'rs_bhayangkara', label: 'RS Bhayangkara' }
];

// Format currency
function formatRupiah(amount) {
    const number = Math.round(amount || 0);
    return 'Rp ' + number.toLocaleString('id-ID', { maximumFractionDigits: 0 });
}

// Parse rupiah to number
function parseRupiah(str) {
    if (typeof str === 'number') return str;
    return parseInt(String(str).replace(/[^\d]/g, '')) || 0;
}

// Calculate age from birth date
function calculateAge(birthDate) {
    if (!birthDate) return '-';
    const today = new Date();
    const birth = new Date(birthDate);
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
        age--;
    }
    return age + ' tahun';
}

// Get auth token
async function getToken() {
    if (window.getAuthToken) {
        return window.getAuthToken();
    }
    return await getIdToken();
}

// API helper
async function apiRequest(endpoint, options = {}) {
    const token = await getToken();
    const response = await fetch(`${API_URL}${endpoint}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            ...options.headers
        }
    });

    const data = await response.json();
    if (!response.ok) {
        throw new Error(data.error || data.message || 'Request failed');
    }
    return data;
}

// Show alert using SweetAlert2 or fallback
function showAlert(type, message) {
    if (window.Swal) {
        window.Swal.fire({
            icon: type === 'error' ? 'error' : 'success',
            title: type === 'error' ? 'Error' : 'Sukses',
            text: message,
            timer: type === 'error' ? undefined : 2000,
            showConfirmButton: type === 'error'
        });
    } else {
        alert(message);
    }
}

// Show confirm dialog
async function showConfirm(title, text) {
    if (window.Swal) {
        const result = await window.Swal.fire({
            title,
            text,
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Ya',
            cancelButtonText: 'Batal'
        });
        return result.isConfirmed;
    }
    return confirm(`${title}\n${text}`);
}

// Render the page
function renderPage() {
    const container = document.getElementById('penjualan-obat-page');
    if (!container) return;

    container.innerHTML = `
        <div class="container-fluid">
            <!-- Header with New Sale Button -->
            <div class="row mb-3">
                <div class="col-12">
                    <div class="d-flex justify-content-between align-items-center">
                        <button class="btn btn-primary" id="btn-new-obat-sale">
                            <i class="fas fa-plus"></i> Penjualan Baru
                        </button>
                        <div class="d-flex gap-2">
                            <select class="form-control" id="filter-status" style="width: 150px;">
                                <option value="">Semua Status</option>
                                <option value="draft">Draft</option>
                                <option value="confirmed">Confirmed</option>
                                <option value="paid">Paid</option>
                            </select>
                            <select class="form-control" id="filter-hospital" style="width: 180px;">
                                <option value="">Semua RS</option>
                                ${HOSPITALS.map(h => `<option value="${h.value}">${h.label}</option>`).join('')}
                            </select>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Sales List -->
            <div class="row">
                <div class="col-12">
                    <div class="card">
                        <div class="card-header">
                            <h3 class="card-title">Daftar Penjualan Obat</h3>
                        </div>
                        <div class="card-body table-responsive p-0">
                            <table class="table table-hover table-striped" id="obat-sales-table">
                                <thead>
                                    <tr>
                                        <th>No. Penjualan</th>
                                        <th>Tanggal</th>
                                        <th>Pasien</th>
                                        <th>Rumah Sakit</th>
                                        <th>Total</th>
                                        <th>Status</th>
                                        <th>Aksi</th>
                                    </tr>
                                </thead>
                                <tbody id="obat-sales-tbody">
                                    <tr>
                                        <td colspan="7" class="text-center py-4">
                                            <i class="fas fa-spinner fa-spin"></i> Memuat data...
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Sale Form Modal -->
        <div class="modal fade" id="modal-obat-sale" tabindex="-1" data-backdrop="static">
            <div class="modal-dialog modal-xl">
                <div class="modal-content">
                    <div class="modal-header bg-primary text-white">
                        <h5 class="modal-title" id="modal-sale-title">Penjualan Baru</h5>
                        <button type="button" class="close text-white" data-dismiss="modal">
                            <span>&times;</span>
                        </button>
                    </div>
                    <div class="modal-body">
                        <form id="form-obat-sale">
                            <input type="hidden" id="sale-id" value="">

                            <div class="row mb-3">
                                <!-- Patient Name Input -->
                                <div class="col-md-5">
                                    <div class="form-group">
                                        <label>Nama Pasien <span class="text-danger">*</span></label>
                                        <input type="text" class="form-control" id="patient-name"
                                               placeholder="Masukkan nama pasien..." required>
                                    </div>
                                </div>

                                <!-- Patient Age Input -->
                                <div class="col-md-3">
                                    <div class="form-group">
                                        <label>Umur</label>
                                        <input type="text" class="form-control" id="patient-age"
                                               placeholder="cth: 25 tahun">
                                    </div>
                                </div>

                                <!-- Hospital Selection -->
                                <div class="col-md-4">
                                    <div class="form-group">
                                        <label>Rumah Sakit <span class="text-danger">*</span></label>
                                        <select class="form-control" id="hospital-source" required>
                                            <option value="">-- Pilih Rumah Sakit --</option>
                                            ${HOSPITALS.map(h => `<option value="${h.value}">${h.label}</option>`).join('')}
                                        </select>
                                    </div>
                                </div>
                            </div>

                            <!-- Obat Items -->
                            <div class="card">
                                <div class="card-header bg-light">
                                    <h6 class="mb-0"><i class="fas fa-pills"></i> Item Obat/Alkes</h6>
                                </div>
                                <div class="card-body">
                                    <table class="table table-bordered" id="obat-items-table">
                                        <thead class="thead-light">
                                            <tr>
                                                <th style="width: 40%;">Obat/Alkes</th>
                                                <th style="width: 15%;">Qty</th>
                                                <th style="width: 20%;">Harga</th>
                                                <th style="width: 20%;">Subtotal</th>
                                                <th style="width: 5%;"></th>
                                            </tr>
                                        </thead>
                                        <tbody id="obat-items-tbody">
                                            <!-- Items will be added here -->
                                        </tbody>
                                        <tfoot>
                                            <tr>
                                                <td colspan="5">
                                                    <button type="button" class="btn btn-outline-primary btn-sm" id="btn-add-obat-item">
                                                        <i class="fas fa-plus"></i> Tambah Item
                                                    </button>
                                                </td>
                                            </tr>
                                            <tr class="bg-light">
                                                <td colspan="3" class="text-right"><strong>TOTAL:</strong></td>
                                                <td colspan="2"><strong id="grand-total">Rp 0</strong></td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            </div>
                        </form>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-dismiss="modal">Batal</button>
                        <button type="button" class="btn btn-primary" id="btn-save-sale">
                            <i class="fas fa-save"></i> Simpan Draft
                        </button>
                    </div>
                </div>
            </div>
        </div>

        <!-- View Sale Modal -->
        <div class="modal fade" id="modal-view-sale" tabindex="-1">
            <div class="modal-dialog modal-lg">
                <div class="modal-content">
                    <div class="modal-header bg-info text-white">
                        <h5 class="modal-title">Detail Penjualan</h5>
                        <button type="button" class="close text-white" data-dismiss="modal">
                            <span>&times;</span>
                        </button>
                    </div>
                    <div class="modal-body" id="view-sale-content">
                        <!-- Content will be loaded here -->
                    </div>
                    <div class="modal-footer" id="view-sale-footer">
                        <!-- Actions will be added here -->
                    </div>
                </div>
            </div>
        </div>
    `;

    setupEventListeners();
    loadSales();
    loadObatOptions();
}

// Setup event listeners
function setupEventListeners() {
    // New sale button
    document.getElementById('btn-new-obat-sale')?.addEventListener('click', () => openSaleModal());

    // Filter changes
    document.getElementById('filter-status')?.addEventListener('change', loadSales);
    document.getElementById('filter-hospital')?.addEventListener('change', loadSales);

    // Add obat item
    document.getElementById('btn-add-obat-item')?.addEventListener('click', addObatItemRow);

    // Save sale
    document.getElementById('btn-save-sale')?.addEventListener('click', saveSale);
}

// Load sales list
async function loadSales() {
    const tbody = document.getElementById('obat-sales-tbody');
    if (!tbody) return;

    tbody.innerHTML = `
        <tr>
            <td colspan="7" class="text-center py-4">
                <i class="fas fa-spinner fa-spin"></i> Memuat data...
            </td>
        </tr>
    `;

    try {
        const status = document.getElementById('filter-status')?.value || '';
        const hospital = document.getElementById('filter-hospital')?.value || '';

        let endpoint = '/obat-sales?';
        if (status) endpoint += `status=${status}&`;
        if (hospital) endpoint += `hospital_source=${hospital}&`;

        const data = await apiRequest(endpoint);
        currentSales = data.data || [];

        if (currentSales.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="text-center py-4 text-muted">
                        <i class="fas fa-inbox fa-2x mb-2"></i><br>
                        Belum ada data penjualan
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = currentSales.map(sale => {
            const statusBadge = getStatusBadge(sale.status);
            const hospitalLabel = HOSPITALS.find(h => h.value === sale.hospital_source)?.label || sale.hospital_source;
            const createdAt = new Date(sale.created_at).toLocaleDateString('id-ID', {
                day: '2-digit', month: 'short', year: 'numeric'
            });

            return `
                <tr>
                    <td><strong>${sale.sale_number}</strong></td>
                    <td>${createdAt}</td>
                    <td>
                        ${sale.patient_name || '-'}
                        ${sale.patient_age ? `<br><small class="text-muted">${sale.patient_age}</small>` : ''}
                    </td>
                    <td>${hospitalLabel}</td>
                    <td>${formatRupiah(sale.total)}</td>
                    <td>${statusBadge}</td>
                    <td>
                        <button class="btn btn-sm btn-info" onclick="window.viewObatSale(${sale.id})" title="Lihat">
                            <i class="fas fa-eye"></i>
                        </button>
                        ${sale.status === 'draft' ? `
                            <button class="btn btn-sm btn-warning" onclick="window.editObatSale(${sale.id})" title="Edit">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="btn btn-sm btn-danger" onclick="window.deleteObatSale(${sale.id})" title="Hapus">
                                <i class="fas fa-trash"></i>
                            </button>
                        ` : ''}
                    </td>
                </tr>
            `;
        }).join('');

    } catch (error) {
        console.error('Failed to load sales:', error);
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="text-center py-4 text-danger">
                    <i class="fas fa-exclamation-circle"></i> Gagal memuat data: ${error.message}
                </td>
            </tr>
        `;
    }
}

// Get status badge HTML
function getStatusBadge(status) {
    const badges = {
        draft: '<span class="badge badge-secondary">Draft</span>',
        confirmed: '<span class="badge badge-warning">Confirmed</span>',
        paid: '<span class="badge badge-success">Paid</span>'
    };
    return badges[status] || status;
}

// Load obat options for dropdown
async function loadObatOptions() {
    try {
        const data = await apiRequest('/obat');
        obatOptions = (data.data || []).filter(item => item.stock > 0);
    } catch (error) {
        console.error('Failed to load obat options:', error);
        obatOptions = [];
    }
}

// Clear patient form fields
function clearPatientForm() {
    document.getElementById('patient-name').value = '';
    document.getElementById('patient-age').value = '';
}

// Open sale modal (new or edit)
function openSaleModal(saleData = null) {
    currentSaleData = saleData;

    document.getElementById('modal-sale-title').textContent = saleData ? 'Edit Penjualan' : 'Penjualan Baru';
    document.getElementById('sale-id').value = saleData?.id || '';
    document.getElementById('hospital-source').value = saleData?.hospital_source || '';

    // Clear items and patient form
    document.getElementById('obat-items-tbody').innerHTML = '';
    clearPatientForm();

    if (saleData) {
        // Set patient name and age
        document.getElementById('patient-name').value = saleData.patient_name || '';
        document.getElementById('patient-age').value = saleData.patient_age || '';

        // Load items
        if (saleData.items && saleData.items.length > 0) {
            saleData.items.forEach(item => addObatItemRow(item));
        }
    }

    // Add one empty row if no items
    if (document.getElementById('obat-items-tbody').children.length === 0) {
        addObatItemRow();
    }

    updateGrandTotal();
    $('#modal-obat-sale').modal('show');
}

// Add obat item row
function addObatItemRow(itemData = null) {
    const tbody = document.getElementById('obat-items-tbody');
    if (!tbody) return;

    const index = tbody.children.length;
    const row = document.createElement('tr');
    row.className = 'obat-item-row';
    row.dataset.index = index;

    const obatSelect = `
        <select class="form-control form-control-sm obat-select" data-index="${index}" onchange="window.onObatSelect(${index})">
            <option value="">-- Pilih Obat --</option>
            ${obatOptions.map(o => `
                <option value="${o.id}"
                        data-code="${o.code}"
                        data-name="${o.name}"
                        data-price="${o.price}"
                        data-stock="${o.stock}"
                        ${itemData && itemData.obat_id == o.id ? 'selected' : ''}>
                    ${o.code} - ${o.name} (Stok: ${o.stock})
                </option>
            `).join('')}
        </select>
    `;

    row.innerHTML = `
        <td>${obatSelect}</td>
        <td>
            <input type="number" class="form-control form-control-sm text-center item-qty"
                   value="${itemData?.quantity || 1}" min="1" data-index="${index}"
                   onchange="window.updateItemSubtotal(${index})">
        </td>
        <td>
            <input type="number" class="form-control form-control-sm text-right item-price"
                   value="${itemData?.price || 0}" min="0" step="1000" data-index="${index}"
                   onchange="window.updateItemSubtotal(${index})">
        </td>
        <td class="text-right">
            <span class="item-subtotal">${formatRupiah(itemData?.total || 0)}</span>
        </td>
        <td class="text-center">
            <button type="button" class="btn btn-danger btn-sm" onclick="window.removeObatItem(${index})">
                <i class="fas fa-times"></i>
            </button>
        </td>
    `;

    tbody.appendChild(row);

    if (itemData) {
        updateItemSubtotal(index);
    }
}

// On obat select
window.onObatSelect = function(index) {
    const row = document.querySelector(`.obat-item-row[data-index="${index}"]`);
    if (!row) return;

    const select = row.querySelector('.obat-select');
    const option = select.options[select.selectedIndex];
    const price = option.dataset.price || 0;

    row.querySelector('.item-price').value = price;
    updateItemSubtotal(index);
};

// Update item subtotal
window.updateItemSubtotal = function(index) {
    const row = document.querySelector(`.obat-item-row[data-index="${index}"]`);
    if (!row) return;

    const qty = parseInt(row.querySelector('.item-qty').value) || 0;
    const price = parseFloat(row.querySelector('.item-price').value) || 0;
    const subtotal = qty * price;

    row.querySelector('.item-subtotal').textContent = formatRupiah(subtotal);
    updateGrandTotal();
};

// Remove obat item
window.removeObatItem = function(index) {
    const row = document.querySelector(`.obat-item-row[data-index="${index}"]`);
    if (row) {
        row.remove();
        updateGrandTotal();
    }
};

// Update grand total
function updateGrandTotal() {
    let total = 0;
    document.querySelectorAll('.obat-item-row').forEach(row => {
        const qty = parseInt(row.querySelector('.item-qty').value) || 0;
        const price = parseFloat(row.querySelector('.item-price').value) || 0;
        total += qty * price;
    });
    document.getElementById('grand-total').textContent = formatRupiah(total);
}

// Save sale
async function saveSale() {
    const patientName = document.getElementById('patient-name').value.trim();
    const patientAge = document.getElementById('patient-age').value.trim();
    const hospitalSource = document.getElementById('hospital-source').value;
    const saleId = document.getElementById('sale-id').value;

    if (!patientName) {
        showAlert('error', 'Masukkan nama pasien terlebih dahulu');
        return;
    }

    if (!hospitalSource) {
        showAlert('error', 'Pilih rumah sakit terlebih dahulu');
        return;
    }

    // Collect items
    const items = [];
    document.querySelectorAll('.obat-item-row').forEach(row => {
        const select = row.querySelector('.obat-select');
        const option = select.options[select.selectedIndex];

        if (select.value) {
            items.push({
                obat_id: parseInt(select.value),
                obat_code: option.dataset.code || '',
                obat_name: option.dataset.name || '',
                quantity: parseInt(row.querySelector('.item-qty').value) || 1,
                price: parseFloat(row.querySelector('.item-price').value) || 0
            });
        }
    });

    if (items.length === 0) {
        showAlert('error', 'Tambahkan minimal satu item obat');
        return;
    }

    try {
        const payload = {
            patient_name: patientName,
            patient_age: patientAge || null,
            hospital_source: hospitalSource,
            items
        };

        if (saleId) {
            await apiRequest(`/obat-sales/${saleId}`, {
                method: 'PUT',
                body: JSON.stringify(payload)
            });
            showAlert('success', 'Penjualan berhasil diperbarui');
        } else {
            await apiRequest('/obat-sales', {
                method: 'POST',
                body: JSON.stringify(payload)
            });
            showAlert('success', 'Penjualan berhasil disimpan');
        }

        $('#modal-obat-sale').modal('hide');
        loadSales();
    } catch (error) {
        console.error('Failed to save sale:', error);
        showAlert('error', error.message);
    }
}

// View sale
window.viewObatSale = async function(id) {
    try {
        const data = await apiRequest(`/obat-sales/${id}`);
        const sale = data.data;

        const hospitalLabel = HOSPITALS.find(h => h.value === sale.hospital_source)?.label || sale.hospital_source;
        const createdAt = new Date(sale.created_at).toLocaleDateString('id-ID', {
            day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
        });

        const content = document.getElementById('view-sale-content');
        content.innerHTML = `
            <div class="row mb-3">
                <div class="col-md-6">
                    <p><strong>No. Penjualan:</strong> ${sale.sale_number}</p>
                    <p><strong>Tanggal:</strong> ${createdAt}</p>
                    <p><strong>Dibuat oleh:</strong> ${sale.created_by || '-'}</p>
                </div>
                <div class="col-md-6">
                    <p><strong>Pasien:</strong> ${sale.patient_name || '-'}</p>
                    <p><strong>Umur:</strong> ${sale.patient_age || '-'}</p>
                    <p><strong>Rumah Sakit:</strong> ${hospitalLabel}</p>
                </div>
            </div>

            <table class="table table-bordered">
                <thead class="thead-light">
                    <tr>
                        <th>Obat/Alkes</th>
                        <th class="text-center">Qty</th>
                        <th class="text-right">Harga</th>
                        <th class="text-right">Subtotal</th>
                    </tr>
                </thead>
                <tbody>
                    ${(sale.items || []).map(item => `
                        <tr>
                            <td>${item.obat_code} - ${item.obat_name}</td>
                            <td class="text-center">${item.quantity}</td>
                            <td class="text-right">${formatRupiah(item.price)}</td>
                            <td class="text-right">${formatRupiah(item.total)}</td>
                        </tr>
                    `).join('')}
                </tbody>
                <tfoot>
                    <tr class="bg-light">
                        <td colspan="3" class="text-right"><strong>TOTAL:</strong></td>
                        <td class="text-right"><strong>${formatRupiah(sale.total)}</strong></td>
                    </tr>
                </tfoot>
            </table>

            <div class="row">
                <div class="col-12">
                    <p><strong>Status:</strong> ${getStatusBadge(sale.status)}</p>
                    ${sale.confirmed_at ? `<p><small class="text-muted">Confirmed: ${new Date(sale.confirmed_at).toLocaleString('id-ID')} oleh ${sale.confirmed_by}</small></p>` : ''}
                    ${sale.paid_at ? `<p><small class="text-muted">Paid: ${new Date(sale.paid_at).toLocaleString('id-ID')} oleh ${sale.paid_by}</small></p>` : ''}
                </div>
            </div>
        `;

        // Footer actions based on status
        const footer = document.getElementById('view-sale-footer');
        let actions = '<button type="button" class="btn btn-secondary" data-dismiss="modal">Tutup</button>';

        if (sale.status === 'draft') {
            actions += `
                <button type="button" class="btn btn-success" onclick="window.confirmObatSale(${sale.id})">
                    <i class="fas fa-check"></i> Confirm
                </button>
            `;
        } else if (sale.status === 'confirmed') {
            actions += `
                <button type="button" class="btn btn-success" onclick="window.markObatSalePaid(${sale.id})">
                    <i class="fas fa-money-bill"></i> Mark as Paid
                </button>
            `;
        } else if (sale.status === 'paid') {
            actions += `
                <button type="button" class="btn btn-primary" onclick="window.printObatSaleInvoice(${sale.id})">
                    <i class="fas fa-print"></i> Print Invoice
                </button>
            `;
        }

        footer.innerHTML = actions;
        $('#modal-view-sale').modal('show');
    } catch (error) {
        console.error('Failed to load sale:', error);
        showAlert('error', error.message);
    }
};

// Edit sale
window.editObatSale = async function(id) {
    try {
        const data = await apiRequest(`/obat-sales/${id}`);
        openSaleModal(data.data);
    } catch (error) {
        console.error('Failed to load sale for edit:', error);
        showAlert('error', error.message);
    }
};

// Delete sale
window.deleteObatSale = async function(id) {
    const confirmed = await showConfirm('Hapus Penjualan?', 'Penjualan ini akan dihapus permanen.');
    if (!confirmed) return;

    try {
        await apiRequest(`/obat-sales/${id}`, { method: 'DELETE' });
        showAlert('success', 'Penjualan berhasil dihapus');
        loadSales();
    } catch (error) {
        console.error('Failed to delete sale:', error);
        showAlert('error', error.message);
    }
};

// Confirm sale
window.confirmObatSale = async function(id) {
    const confirmed = await showConfirm('Konfirmasi Penjualan?', 'Setelah dikonfirmasi, penjualan tidak dapat diedit.');
    if (!confirmed) return;

    try {
        await apiRequest(`/obat-sales/${id}/confirm`, { method: 'POST' });
        showAlert('success', 'Penjualan berhasil dikonfirmasi');
        $('#modal-view-sale').modal('hide');
        loadSales();
    } catch (error) {
        console.error('Failed to confirm sale:', error);
        showAlert('error', error.message);
    }
};

// Mark sale as paid
window.markObatSalePaid = async function(id) {
    const confirmed = await showConfirm('Tandai Lunas?', 'Stok obat akan dikurangi setelah pembayaran dikonfirmasi.');
    if (!confirmed) return;

    try {
        await apiRequest(`/obat-sales/${id}/mark-paid`, { method: 'POST' });
        showAlert('success', 'Pembayaran berhasil dikonfirmasi');
        $('#modal-view-sale').modal('hide');
        loadSales();
    } catch (error) {
        console.error('Failed to mark paid:', error);
        showAlert('error', error.message);
    }
};

// Print invoice
window.printObatSaleInvoice = async function(id) {
    try {
        const data = await apiRequest(`/obat-sales/${id}/print-invoice`, { method: 'POST' });
        if (data.downloadUrl) {
            window.open(data.downloadUrl, '_blank');
        } else {
            showAlert('error', 'Invoice URL tidak tersedia');
        }
    } catch (error) {
        console.error('Failed to print invoice:', error);
        showAlert('error', error.message);
    }
};

// Initialize module
window.initPenjualanObat = async function() {
    try {
        currentUser = window.auth?.currentUser;
        if (!currentUser) {
            console.error('No authenticated user found');
            return;
        }

        renderPage();
    } catch (error) {
        console.error('Failed to initialize Penjualan Obat:', error);
        showAlert('error', 'Gagal menginisialisasi halaman');
    }
};

// Export for module loading
export { };

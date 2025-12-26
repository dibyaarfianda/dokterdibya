/**
 * Planning Helpers - Modal Workflows for Tindakan and Terapi
 *
 * Handles the old format Planning functionality for obstetri category:
 * - Tindakan (procedures) selection with modal
 * - Terapi (medications) selection with Latin prescription formatting
 * - Billing integration for selected items
 */

// ============================================================================
// GLOBAL STATE
// ============================================================================

window.availableTindakanList = null;
window.selectedObatForPrescription = null;

// ============================================================================
// TINDAKAN FUNCTIONS
// ============================================================================

async function openTindakanModal() {
    try {
        const token = await window.getToken();
        if (!token) return;

        const response = await fetch('/api/tindakan?active=true', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) throw new Error('Failed to fetch tindakan');

        const result = await response.json();
        const tindakanList = result.data || result;

        // Filter out ADMINISTRATIF category
        const filteredTindakan = tindakanList.filter(item => item.category !== 'ADMINISTRATIF');

        // Show modal with tindakan list
        showTindakanModal(filteredTindakan);

    } catch (error) {
        console.error('Error loading tindakan:', error);
        if (typeof showError === 'function') {
            showError('Gagal memuat data tindakan: ' + error.message);
        } else {
            window.showToast('error', 'Gagal memuat data tindakan: ' + error.message);
        }
    }
}

function showTindakanModal(tindakanList) {
    const modal = document.getElementById('tindakan-modal');
    const container = document.getElementById('tindakan-modal-body');
    const searchInput = document.getElementById('tindakan-search');

    if (!modal || !container) return;

    // Store tindakan list for later use
    window.availableTindakanList = tindakanList;

    // Format rupiah helper
    function formatRupiah(amount) {
        return 'Rp ' + (amount || 0).toLocaleString('id-ID');
    }

    // Render function - called on initial load and search filter
    function renderTindakanGrid(filterText = '') {
        const filter = filterText.toLowerCase();

        // Filter items
        const filtered = tindakanList.filter(item =>
            !filter || (item.name && item.name.toLowerCase().includes(filter))
        );

        // Group by category
        const byCategory = {};
        filtered.forEach(item => {
            const cat = item.category || 'Lainnya';
            if (!byCategory[cat]) byCategory[cat] = [];
            byCategory[cat].push(item);
        });

        // Render each category with 4-column grid
        let html = '';
        Object.keys(byCategory).sort().forEach(category => {
            html += `<div class="tindakan-category-header">${escapeHtml(category)}</div>`;
            html += '<div class="row">';
            byCategory[category].forEach((item) => {
                const escapedName = escapeHtml(item.name || '');
                const escapedCode = escapeHtml(item.code || '');
                html += `
                    <div class="col-3 mb-2">
                        <div class="tindakan-item" data-tindakan-id="${item.id || ''}">
                            <div class="custom-control custom-checkbox">
                                <input type="checkbox" class="custom-control-input tindakan-checkbox"
                                       id="tindakan-${item.id}"
                                       data-tindakan-name="${escapedName}"
                                       data-tindakan-code="${escapedCode}"
                                       data-tindakan-id="${item.id || ''}">
                                <label class="custom-control-label" for="tindakan-${item.id}">
                                    ${escapedName}
                                </label>
                            </div>
                            <small class="text-muted">${formatRupiah(item.price)}</small>
                        </div>
                    </div>
                `;
            });
            html += '</div>';
        });

        if (Object.keys(byCategory).length === 0) {
            html = '<div class="text-center text-muted py-3">Tidak ada tindakan ditemukan</div>';
        }

        container.innerHTML = html;

        // Add click handler to each item container (for better UX)
        container.querySelectorAll('.tindakan-item').forEach(item => {
            item.addEventListener('click', (e) => {
                // Don't toggle if clicking directly on checkbox
                if (e.target.type !== 'checkbox') {
                    const checkbox = item.querySelector('.tindakan-checkbox');
                    if (checkbox) {
                        checkbox.checked = !checkbox.checked;
                        item.classList.toggle('selected', checkbox.checked);
                        updateTindakanCount();
                    }
                }
            });
        });

        // Add change listener to each checkbox
        container.querySelectorAll('.tindakan-checkbox').forEach(cb => {
            cb.addEventListener('change', function() {
                const item = this.closest('.tindakan-item');
                if (item) item.classList.toggle('selected', this.checked);
                updateTindakanCount();
            });
        });
    }

    // Search input listener
    if (searchInput) {
        searchInput.value = '';
        searchInput.oninput = (e) => renderTindakanGrid(e.target.value);
    }

    // Initial render
    renderTindakanGrid();

    // Reset count
    updateTindakanCount();

    // Show modal using Bootstrap
    $('#tindakan-modal').modal('show');
}

function updateTindakanCount() {
    const selectedCount = document.querySelectorAll('.tindakan-checkbox:checked').length;
    const countEl = document.getElementById('selected-tindakan-count');
    if (countEl) {
        countEl.innerHTML = `<small>${selectedCount} tindakan dipilih</small>`;
    }
}

async function addSelectedTindakan() {
    // Get all selected tindakan
    const selectedCheckboxes = document.querySelectorAll('.tindakan-checkbox:checked');

    if (selectedCheckboxes.length === 0) {
        if (typeof showError === 'function') {
            showError('Silakan pilih minimal satu tindakan');
        } else {
            window.showToast('warning', 'Silakan pilih minimal satu tindakan');
        }
        return;
    }

    const selectedTindakan = Array.from(selectedCheckboxes).map(cb => ({
        name: cb.dataset.tindakanName,
        code: cb.dataset.tindakanCode,
        id: cb.dataset.tindakanId
    }));

    const textarea = document.getElementById('planning-tindakan');
    if (!textarea) return;

    try {
        // Save to billing database first
        const token = await window.getToken();
        if (token) {
            const mrSlug = window.routeMrSlug;

            // First, fetch existing billing items to append to them
            let existingItems = [];
            try {
                const fetchResponse = await fetch(`/api/sunday-clinic/billing/${mrSlug}`, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });

                if (fetchResponse.ok) {
                    const billingData = await fetchResponse.json();
                    if (billingData.data && billingData.data.items) {
                        // Keep all existing items
                        existingItems = billingData.data.items.map(item => ({
                            item_type: item.item_type,
                            item_code: item.item_code,
                            item_name: item.item_name,
                            quantity: item.quantity,
                            item_data: item.item_data
                        }));
                    }
                }
            } catch (fetchError) {
                console.log('No existing billing found, creating new one');
            }

            // Append all new tindakan to existing items
            const newItems = selectedTindakan.map(t => ({
                item_type: 'tindakan',
                item_code: t.code || null,
                item_name: t.name,
                quantity: 1
            }));

            const allItems = [...existingItems, ...newItems];

            // Save all items together
            const response = await fetch(`/api/sunday-clinic/billing/${mrSlug}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ items: allItems })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || 'Gagal menyimpan ke tagihan');
            }
        }

        // NOTE: No longer adding to textarea - billing items are shown in the item list
        // Textarea is only for custom entries not in the list

        // Hide modal
        $('#tindakan-modal').modal('hide');

        if (typeof showSuccess === 'function') {
            showSuccess(`${selectedTindakan.length} tindakan ditambahkan ke Tagihan`);
        }

        // Refresh billing component if it exists
        refreshBillingIfActive();

        // Refresh tindakan items list in Planning
        if (window.renderTindakanItemsList) {
            await window.renderTindakanItemsList();
        }

    } catch (error) {
        console.error('Error adding tindakan:', error);
        if (typeof showError === 'function') {
            showError('Gagal menambahkan tindakan: ' + error.message);
        } else {
            window.showToast('error', 'Gagal menambahkan tindakan: ' + error.message);
        }
    }
}

async function addTindakan(tindakanName, tindakanCode, tindakanId) {
    const textarea = document.getElementById('planning-tindakan');
    if (!textarea) return;

    try {
        // Save to billing database first
        const token = await window.getToken();
        if (token) {
            const mrSlug = window.routeMrSlug;

            // First, fetch existing billing items to append to them
            let existingItems = [];
            try {
                const fetchResponse = await fetch(`/api/sunday-clinic/billing/${mrSlug}`, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });

                if (fetchResponse.ok) {
                    const billingData = await fetchResponse.json();
                    if (billingData.data && billingData.data.items) {
                        // Keep all existing items
                        existingItems = billingData.data.items.map(item => ({
                            item_type: item.item_type,
                            item_code: item.item_code,
                            item_name: item.item_name,
                            quantity: item.quantity,
                            item_data: item.item_data
                        }));
                    }
                }
            } catch (fetchError) {
                console.log('No existing billing found, creating new one');
            }

            // Append the new tindakan to existing items
            const allItems = [...existingItems, {
                item_type: 'tindakan',
                item_code: tindakanCode || null,
                item_name: tindakanName,
                quantity: 1
            }];

            // Save all items together
            const response = await fetch(`/api/sunday-clinic/billing/${mrSlug}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ items: allItems })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || 'Gagal menyimpan ke tagihan');
            }
        }

        // Add to textarea
        const currentValue = textarea.value.trim();
        if (currentValue) {
            textarea.value = currentValue + '\n' + tindakanName;
        } else {
            textarea.value = tindakanName;
        }

        // Hide modal
        $('#tindakan-modal').modal('hide');

        if (typeof showSuccess === 'function') {
            showSuccess(`Tindakan "${tindakanName}" ditambahkan ke Planning dan Tagihan`);
        }

        // Refresh billing component if it exists
        refreshBillingIfActive();

    } catch (error) {
        console.error('Error adding tindakan:', error);
        if (typeof showError === 'function') {
            showError('Gagal menambahkan tindakan: ' + error.message);
        } else {
            window.showToast('error', 'Gagal menambahkan tindakan: ' + error.message);
        }
    }
}

async function resetTindakan() {
    if (!confirm('Hapus semua tindakan dari Planning dan Tagihan?\n\nTindakan ini akan menghapus semua item tindakan dari billing.')) {
        return;
    }

    try {
        const textarea = document.getElementById('planning-tindakan');
        if (textarea) {
            textarea.value = '';
        }

        // Delete tindakan items from billing database
        const token = await window.getToken();
        if (token) {
            const mrSlug = window.routeMrSlug;
            const response = await fetch(`/api/sunday-clinic/billing/${mrSlug}/items/tindakan`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || 'Gagal menghapus tindakan dari billing');
            }

            const result = await response.json();
            if (typeof showSuccess === 'function') {
                showSuccess(result.message || 'Tindakan berhasil dihapus');
            }

            // Refresh billing component if it exists
            refreshBillingIfActive();

            // Refresh tindakan items list in Planning
            if (window.renderTindakanItemsList) {
                await window.renderTindakanItemsList();
            }
        } else {
            if (typeof showSuccess === 'function') {
                showSuccess('Tindakan dihapus dari textarea');
            }
        }
    } catch (error) {
        console.error('Error resetting tindakan:', error);
        if (typeof showError === 'function') {
            showError('Error: ' + error.message);
        } else {
            window.showToast('error', 'Error: ' + error.message);
        }
    }
}

/**
 * Delete individual tindakan from Planning section
 * This is called when user clicks delete button on Planning UI
 * @param {number} itemId - Billing item ID
 * @param {string} itemName - Tindakan name for display
 */
async function deleteIndividualTindakan(itemId, itemName) {
    if (!confirm(`Hapus tindakan "${itemName}" dari Planning dan Tagihan?`)) {
        return;
    }

    try {
        const token = await window.getToken();
        if (!token) return;

        const mrSlug = window.routeMrSlug;
        if (!mrSlug) {
            window.showToast('error', 'MR ID tidak ditemukan');
            return;
        }

        const response = await fetch(`/api/sunday-clinic/billing/${mrSlug}/items/id/${itemId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || 'Gagal menghapus tindakan');
        }

        const result = await response.json();

        if (typeof showSuccess === 'function') {
            showSuccess(result.message || 'Tindakan berhasil dihapus');
        } else {
            window.showToast('success', result.message || 'Tindakan berhasil dihapus');
        }

        // Refresh billing if active
        refreshBillingIfActive();

        // Re-render the tindakan list in Planning
        if (window.renderTindakanItemsList) {
            await window.renderTindakanItemsList();
        }

    } catch (error) {
        console.error('Error deleting individual tindakan:', error);
        if (typeof showError === 'function') {
            showError('Error: ' + error.message);
        } else {
            window.showToast('error', 'Error: ' + error.message);
        }
    }
}

/**
 * Render tindakan items as a list with individual delete buttons
 * Fetches current billing tindakan items and displays them
 */
async function renderTindakanItemsList() {
    const container = document.getElementById('tindakan-items-container');
    if (!container) return;

    try {
        const token = await window.getToken();
        if (!token) return;

        const mrSlug = window.routeMrSlug;
        if (!mrSlug) return;

        const response = await fetch(`/api/sunday-clinic/billing/${mrSlug}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
            container.innerHTML = '<p class="text-muted small">Belum ada tindakan dari billing.</p>';
            return;
        }

        const result = await response.json();
        const billing = result.data || {};
        const tindakanItems = (billing.items || []).filter(item => item.item_type === 'tindakan');
        const isDraft = billing.status === 'draft';

        if (tindakanItems.length === 0) {
            container.innerHTML = '<p class="text-muted small">Belum ada tindakan. Klik "Input Tindakan" untuk menambahkan.</p>';
            return;
        }

        const escapeHtmlLocal = (str) => {
            if (!str) return '';
            return String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        };

        const listHtml = tindakanItems.map(item => {
            const escapedName = escapeHtmlLocal(item.item_name);

            return `
                <div class="tindakan-list-item d-flex align-items-center p-2 mb-1 border rounded"
                     data-item-id="${item.id}">
                    ${isDraft ? `
                        <button type="button" class="btn btn-sm btn-outline-danger mr-2 tindakan-delete-btn"
                                onclick="window.deleteIndividualTindakan(${item.id}, '${escapedName.replace(/'/g, "\\'")}')"
                                title="Hapus tindakan ini">
                            <i class="fas fa-times"></i>
                        </button>
                    ` : ''}
                    <strong class="small">${escapedName}</strong>
                </div>
            `;
        }).join('');

        container.innerHTML = listHtml;

    } catch (error) {
        console.error('Error rendering tindakan items:', error);
        container.innerHTML = '<p class="text-muted small">Gagal memuat daftar tindakan.</p>';
    }
}

// ============================================================================
// TERAPI/OBAT FUNCTIONS
// ============================================================================

async function openTerapiModal() {
    try {
        const token = await window.getToken();
        if (!token) return;

        const response = await fetch('/api/obat?active=true', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) throw new Error('Failed to fetch obat');

        const result = await response.json();
        const obatList = result.data || result;

        // Show modal with obat list
        showTerapiModal(obatList);

    } catch (error) {
        console.error('Error loading obat:', error);
        if (typeof showError === 'function') {
            showError('Gagal memuat data obat: ' + error.message);
        } else {
            window.showToast('error', 'Gagal memuat data obat: ' + error.message);
        }
    }
}

function showTerapiModal(obatList) {
    const modal = document.getElementById('terapi-modal');
    const tbody = document.getElementById('terapi-modal-body');
    const searchInput = document.getElementById('obat-search');

    if (!modal || !tbody) return;

    // Store obat list for search
    window.availableObatList = obatList;

    // Render function - called on initial load and search filter
    function renderObatTable(filterText = '') {
        const filter = filterText.toLowerCase();

        // Clear existing content
        tbody.innerHTML = '';

        // Filter and populate table
        obatList.forEach((item, index) => {
            // Filter by name or code
            const matchesFilter = !filter ||
                (item.name && item.name.toLowerCase().includes(filter)) ||
                (item.code && item.code.toLowerCase().includes(filter));

            if (!matchesFilter) return;

            const row = document.createElement('tr');
            row.innerHTML = `
                <td>
                    <div class="custom-control custom-checkbox">
                        <input type="checkbox" class="custom-control-input obat-checkbox" id="obat-${index}" data-obat-name="${escapeHtml(item.name || '')}" data-obat-id="${item.id || ''}">
                        <label class="custom-control-label" for="obat-${index}"></label>
                    </div>
                </td>
                <td>${escapeHtml(item.code || '')}</td>
                <td>${escapeHtml(item.name || '')}</td>
                <td>${escapeHtml(item.category || '')}</td>
                <td>${item.stock !== undefined ? item.stock : '-'}</td>
            `;
            tbody.appendChild(row);
        });

        if (tbody.children.length === 0) {
            const row = document.createElement('tr');
            row.innerHTML = '<td colspan="5" class="text-center text-muted">Tidak ada obat ditemukan</td>';
            tbody.appendChild(row);
        }
    }

    // Search input listener
    if (searchInput) {
        searchInput.value = '';
        searchInput.oninput = (e) => renderObatTable(e.target.value);
    }

    // Initial render
    renderObatTable();

    // Add select all functionality
    const selectAllCheckbox = document.getElementById('select-all-obat');
    if (selectAllCheckbox) {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.onchange = function() {
            const checkboxes = document.querySelectorAll('.obat-checkbox');
            checkboxes.forEach(cb => cb.checked = this.checked);
        };
    }

    // Show modal using Bootstrap
    $('#terapi-modal').modal('show');
}

function proceedToCaraPakai() {
    // Get all selected obat
    const selectedCheckboxes = document.querySelectorAll('.obat-checkbox:checked');

    if (selectedCheckboxes.length === 0) {
        if (typeof showError === 'function') {
            showError('Silakan pilih minimal satu obat');
        } else {
            window.showToast('warning', 'Silakan pilih minimal satu obat');
        }
        return;
    }

    const selectedObat = Array.from(selectedCheckboxes).map(cb => ({
        name: cb.dataset.obatName,
        id: cb.dataset.obatId
    }));

    // Hide terapi modal
    $('#terapi-modal').modal('hide');

    // Show batch cara pakai modal
    showBatchCaraPakaiModal(selectedObat);
}

function showBatchCaraPakaiModal(selectedObat) {
    const modalBody = document.getElementById('batch-cara-pakai-body');
    if (!modalBody) return;

    // Build compact form for each selected obat
    let formHtml = '<div class="resep-compact-list">';
    selectedObat.forEach((obat, index) => {
        const isLast = index === selectedObat.length - 1;
        formHtml += `
            <div class="resep-row mb-2 p-2 border rounded" data-index="${index}">
                <div class="d-flex align-items-center flex-wrap">
                    <span class="font-weight-bold mr-2" style="min-width:120px;font-size:0.9rem;">
                        <i class="fas fa-pills text-success mr-1"></i>${escapeHtml(obat.name)}
                    </span>
                    <input type="number" class="form-control form-control-sm draft-terapi-field mr-1"
                           id="jumlah-${index}" min="1" value="1" style="width:60px;"
                           data-next="satuan-${index}">
                    <select class="form-control form-control-sm draft-terapi-field mr-2"
                            id="satuan-${index}" style="width:80px;"
                            data-next="carapakai-${index}">
                        <option value="tablet">tab</option>
                        <option value="kapsul">kap</option>
                        <option value="box">box</option>
                        <option value="botol">btl</option>
                        <option value="tube">tube</option>
                        <option value="sachet">sach</option>
                    </select>
                    <div class="btn-group btn-group-sm mr-2">
                        <button type="button" class="btn btn-outline-secondary quick-dose" data-target="carapakai-${index}" data-value="3x1">3x1</button>
                        <button type="button" class="btn btn-outline-secondary quick-dose" data-target="carapakai-${index}" data-value="2x1">2x1</button>
                        <button type="button" class="btn btn-outline-secondary quick-dose" data-target="carapakai-${index}" data-value="1x1">1x1</button>
                    </div>
                    <input type="text" class="form-control form-control-sm draft-terapi-field flex-grow-1"
                           id="carapakai-${index}" placeholder="atau ketik manual..." style="min-width:140px;"
                           data-next="${isLast ? '' : 'jumlah-' + (index + 1)}"
                           data-is-last="${isLast}">
                </div>
            </div>
        `;
    });
    formHtml += '</div>';

    modalBody.innerHTML = formHtml;

    // Store selected obat data for later use
    window.selectedObatForPrescription = selectedObat;

    // Add event listeners
    setTimeout(() => {
        // Quick dose buttons
        document.querySelectorAll('.quick-dose').forEach(btn => {
            btn.addEventListener('click', function() {
                const targetId = this.dataset.target;
                const value = this.dataset.value;
                const input = document.getElementById(targetId);
                if (input) {
                    input.value = value;
                    input.dispatchEvent(new Event('input'));
                    // Move to next row's jumlah if exists
                    const nextField = input.dataset.next;
                    if (nextField) {
                        const next = document.getElementById(nextField);
                        if (next) next.focus();
                    }
                }
            });
        });

        // Enter key navigation + Tab-like behavior
        document.querySelectorAll('.draft-terapi-field').forEach(field => {
            field.addEventListener('input', updateDraftTerapiPreview);
            field.addEventListener('change', updateDraftTerapiPreview);
            field.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    const nextFieldId = this.dataset.next;
                    if (nextFieldId) {
                        const next = document.getElementById(nextFieldId);
                        if (next) next.focus();
                    } else if (this.dataset.isLast === 'true') {
                        // Last field - submit the form
                        addBatchTerapi();
                    }
                }
            });
        });

        // Focus first input
        const firstInput = document.getElementById('jumlah-0');
        if (firstInput) firstInput.focus();
    }, 100);

    // Show modal
    $('#cara-pakai-modal').modal('show');
}

function backToObatSelection() {
    $('#cara-pakai-modal').modal('hide');
    $('#terapi-modal').modal('show');
}

async function addBatchTerapi() {
    const selectedObat = window.selectedObatForPrescription;
    if (!selectedObat || selectedObat.length === 0) return;

    const textarea = document.getElementById('planning-terapi');
    if (!textarea) return;

    let allPrescriptions = [];
    const structuredItems = [];

    // Collect all prescriptions
    selectedObat.forEach((obat, index) => {
        const jumlahValue = document.getElementById(`jumlah-${index}`)?.value || '1';
        const jumlah = parseInt(jumlahValue, 10);
        const satuan = document.getElementById(`satuan-${index}`)?.value || 'tablet';
        const caraPakai = document.getElementById(`carapakai-${index}`)?.value.trim() || '';

        // Convert to Latin format
        const romanQuantity = toRoman(isNaN(jumlah) ? 1 : jumlah);
        const latinSig = convertToLatinSig(caraPakai);

        // Format: R/ [Drug] [Unit] No. [Roman] Sig. [Latin]
        let prescription = `R/ ${obat.name} ${satuan} No. ${romanQuantity}`;
        if (latinSig) {
            prescription += ` Sig. ${latinSig}`;
        }

        allPrescriptions.push(prescription);

        structuredItems.push({
            obatId: obat.id || null,
            name: obat.name,
            quantity: isNaN(jumlah) ? 1 : jumlah,
            unit: satuan,
            caraPakai,
            latinSig
        });
    });

    // Draft is already stored via updateDraftTerapiPreview, now save to database
    const saved = await saveStructuredTerapi(structuredItems);
    if (!saved) {
        return;
    }

    // NOTE: No longer adding to textarea - items are shown in item list above
    // Textarea is now only for custom entries (vitamins not in list, etc.)

    // Clear draft
    clearDraftTerapi();

    // Hide modal
    $('#cara-pakai-modal').modal('hide');

    if (typeof showSuccess === 'function') {
        showSuccess(`${selectedObat.length} obat disimpan ke Tagihan`);
    }

    // Clear stored data
    window.selectedObatForPrescription = null;

    // Refresh billing component if it exists
    refreshBillingIfActive();

    // Refresh terapi items list in Planning
    if (window.renderTerapiItemsList) {
        await window.renderTerapiItemsList();
    }
}

async function saveStructuredTerapi(prescriptions) {
    try {
        const token = await window.getToken();
        if (!token) {
            return false;
        }

        const mrSlug = window.routeMrSlug;
        const response = await fetch(`/api/sunday-clinic/billing/${mrSlug}/obat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ items: prescriptions })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || 'Gagal menyimpan terapi');
        }

        return true;
    } catch (error) {
        console.error('Error saving structured terapi:', error);
        if (typeof showToastNotification === 'function') {
            showToastNotification('Terapi', 'Gagal menyimpan terapi: ' + error.message, 'warning');
        } else {
            window.showToast('error', 'Gagal menyimpan terapi: ' + error.message);
        }
        return false;
    }
}

async function resetTerapi() {
    if (!confirm('Hapus semua terapi dari Planning dan Tagihan?\n\nTindakan ini akan menghapus semua obat dari billing.')) {
        return;
    }

    try {
        const textarea = document.getElementById('planning-terapi');
        if (textarea) {
            textarea.value = '';
        }

        // Clear draft terapi from sessionStorage
        clearDraftTerapi();

        // Delete obat items from billing database
        const token = await window.getToken();
        if (token) {
            const mrSlug = window.routeMrSlug;
            const response = await fetch(`/api/sunday-clinic/billing/${mrSlug}/items/obat`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || 'Gagal menghapus terapi dari billing');
            }

            const result = await response.json();
            if (typeof showSuccess === 'function') {
                showSuccess(result.message || 'Terapi berhasil dihapus');
            }

            // Refresh billing component if it exists
            refreshBillingIfActive();

            // Refresh terapi items list in Planning
            if (window.renderTerapiItemsList) {
                await window.renderTerapiItemsList();
            }
        } else {
            if (typeof showSuccess === 'function') {
                showSuccess('Terapi dihapus dari textarea');
            }
        }
    } catch (error) {
        console.error('Error resetting terapi:', error);
        if (typeof showError === 'function') {
            showError('Error: ' + error.message);
        } else {
            window.showToast('error', 'Error: ' + error.message);
        }
    }
}

/**
 * Remove a single obat from the Planning terapi textarea
 * Called when an obat is deleted from Billing
 * @param {string} obatName - Name of the obat to remove
 */
function removeObatFromPlanning(obatName) {
    const textarea = document.getElementById('planning-terapi');
    if (!textarea || !obatName) return;

    const currentValue = textarea.value;
    if (!currentValue.trim()) return;

    // Split into lines
    const lines = currentValue.split('\n');

    // Filter out lines that contain this obat name
    // Format is: R/ [Drug Name] [unit] No. [Roman] Sig. [Latin]
    const filteredLines = lines.filter(line => {
        const trimmedLine = line.trim();
        if (!trimmedLine) return true; // Keep empty lines

        // Check if line contains "R/" and the obat name
        if (trimmedLine.startsWith('R/')) {
            // Extract drug name: R/ [Drug Name] tablet/strip/etc No. ...
            const match = trimmedLine.match(/^R\/\s+(.+?)\s+(tablet|strip|kapsul|botol|tube|sachet|ampul|vial|supp|ovula|patch)/i);
            if (match) {
                const drugNameInLine = match[1].trim();
                return drugNameInLine.toLowerCase() !== obatName.toLowerCase();
            }
        }
        return true;
    });

    // Update textarea - remove consecutive empty lines
    const cleanedLines = filteredLines.filter((line, index, arr) => {
        // Keep non-empty lines
        if (line.trim()) return true;
        // Keep first empty line but not consecutive ones
        if (index === 0) return false;
        return arr[index - 1]?.trim();
    });

    textarea.value = cleanedLines.join('\n').trim();
}

/**
 * Delete individual obat from Planning section
 * This is called when user clicks delete button on Planning UI
 * @param {number} itemId - Billing item ID
 * @param {string} itemName - Obat name for display
 */
async function deleteIndividualObat(itemId, itemName) {
    if (!confirm(`Hapus obat "${itemName}" dari Planning dan Tagihan?`)) {
        return;
    }

    try {
        const token = await window.getToken();
        if (!token) return;

        const mrSlug = window.routeMrSlug;
        if (!mrSlug) {
            window.showToast('error', 'MR ID tidak ditemukan');
            return;
        }

        const response = await fetch(`/api/sunday-clinic/billing/${mrSlug}/items/id/${itemId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || 'Gagal menghapus obat');
        }

        const result = await response.json();

        // NOTE: No longer need to touch textarea - it's only for custom entries now
        // Billing items are shown in the item list, not textarea

        // Clear draft if exists
        clearDraftTerapi();

        if (typeof showSuccess === 'function') {
            showSuccess(result.message || 'Obat berhasil dihapus');
        } else {
            window.showToast('success', result.message || 'Obat berhasil dihapus');
        }

        // Refresh billing if active
        refreshBillingIfActive();

        // Re-render the terapi list in Planning
        if (window.renderTerapiItemsList) {
            await window.renderTerapiItemsList();
        }

    } catch (error) {
        console.error('Error deleting individual obat:', error);
        if (typeof showError === 'function') {
            showError('Error: ' + error.message);
        } else {
            window.showToast('error', 'Error: ' + error.message);
        }
    }
}

/**
 * Render terapi items as a list with individual delete buttons
 * Fetches current billing obat items and displays them
 */
async function renderTerapiItemsList() {
    const container = document.getElementById('terapi-items-container');
    if (!container) return;

    try {
        const token = await window.getToken();
        if (!token) return;

        const mrSlug = window.routeMrSlug;
        if (!mrSlug) return;

        const response = await fetch(`/api/sunday-clinic/billing/${mrSlug}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
            container.innerHTML = '<p class="text-muted small">Belum ada obat dari billing.</p>';
            return;
        }

        const result = await response.json();
        const billing = result.data || {};
        const obatItems = (billing.items || []).filter(item => item.item_type === 'obat');
        const isDraft = billing.status === 'draft';

        if (obatItems.length === 0) {
            container.innerHTML = '<p class="text-muted small">Belum ada obat. Klik "Input Terapi" untuk menambahkan.</p>';
            return;
        }

        const escapeHtmlLocal = (str) => {
            if (!str) return '';
            return String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        };

        const listHtml = obatItems.map(item => {
            const itemData = item.item_data || {};
            const caraPakai = itemData.caraPakai || itemData.latinSig || '-';
            const escapedName = escapeHtmlLocal(item.item_name);

            return `
                <div class="terapi-item d-flex align-items-center p-2 mb-1 border rounded"
                     data-item-id="${item.id}">
                    ${isDraft ? `
                        <button type="button" class="btn btn-sm btn-outline-danger mr-2 terapi-delete-btn"
                                onclick="window.deleteIndividualObat(${item.id}, '${escapedName.replace(/'/g, "\\'")}')"
                                title="Hapus obat ini">
                            <i class="fas fa-times"></i>
                        </button>
                    ` : ''}
                    <div class="flex-grow-1">
                        <strong class="small">${escapedName}</strong>
                        <small class="text-muted ml-1">x${item.quantity}</small>
                        <br>
                        <small class="text-muted">${escapeHtmlLocal(caraPakai)}</small>
                    </div>
                </div>
            `;
        }).join('');

        container.innerHTML = listHtml;

    } catch (error) {
        console.error('Error rendering terapi items:', error);
        container.innerHTML = '<p class="text-muted small">Gagal memuat daftar obat.</p>';
    }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

// Convert Arabic number to Roman numerals
function toRoman(num) {
    const romanNumerals = [
        { value: 1000, numeral: 'M' },
        { value: 900, numeral: 'CM' },
        { value: 500, numeral: 'D' },
        { value: 400, numeral: 'CD' },
        { value: 100, numeral: 'C' },
        { value: 90, numeral: 'XC' },
        { value: 50, numeral: 'L' },
        { value: 40, numeral: 'XL' },
        { value: 10, numeral: 'X' },
        { value: 9, numeral: 'IX' },
        { value: 5, numeral: 'V' },
        { value: 4, numeral: 'IV' },
        { value: 1, numeral: 'I' }
    ];

    let result = '';
    let remaining = parseInt(num);

    for (const { value, numeral } of romanNumerals) {
        while (remaining >= value) {
            result += numeral;
            remaining -= value;
        }
    }

    return result;
}

// Convert Indonesian usage instructions to Latin abbreviations
function convertToLatinSig(caraPakai) {
    if (!caraPakai) return '';

    let latinSig = caraPakai.toLowerCase();
    let result = '';

    // Extract frequency pattern (e.g., "3x1", "2x2", "1x1")
    const frequencyMatch = latinSig.match(/(\d+)\s*x\s*(\d+)/);

    if (frequencyMatch) {
        const timesPerDay = frequencyMatch[1];
        const doseAmount = frequencyMatch[2];
        const doseRoman = toRoman(parseInt(doseAmount));

        // Frequency mapping
        const frequencyMap = {
            '1': 'd.d',           // tiap hari (daily)
            '2': 'b.d.d',         // dua kali sehari (twice daily)
            '3': 'ter.d.d',       // tiga kali sehari (three times daily)
            '4': 'q.d.d'          // empat kali sehari (four times daily)
        };

        const freqLatin = frequencyMap[timesPerDay] || `${timesPerDay} dd`;
        result = `${freqLatin} ${doseRoman}`;
    }

    // Timing/meal-related conversions
    const timingConversions = {
        'sebelum makan': 'a.c',
        'setelah makan': 'p.c',
        'pada saat makan': 'd.c',
        'saat makan': 'd.c',
        'dengan makan': 'd.c',
        'bila diperlukan': 'p.r.n',
        'bila perlu': 'p.r.n',
        'jika perlu': 'p.r.n',
        'pagi hari': 'h.m',
        'pagi': 'h.m',
        'malam hari': 'h.v',
        'malam': 'h.v',
        'sore': 'p.m',
        'sebelum tidur': 'h.v',
        'tiap jam': 'o.h',
        'tiap 2 jam': 'o.b.h',
        'tiap pagi': 'o.m',
        'tiap malam': 'o.n',
        'segera': 'cito',
        'diminum sekaligus': 'haust'
    };

    // Find timing conversion
    let timing = '';
    for (const [indonesian, latin] of Object.entries(timingConversions)) {
        if (latinSig.includes(indonesian)) {
            timing = latin;
            break;
        }
    }

    // Build final Latin Sig
    if (timing) {
        result = result ? `${result} ${timing}` : timing;
    }

    // If no conversion happened, preserve original
    if (!result) {
        result = caraPakai;
    }

    return result;
}

// Update draft terapi preview in sessionStorage as user types
function updateDraftTerapiPreview() {
    const selectedObat = window.selectedObatForPrescription;
    if (!selectedObat || selectedObat.length === 0) return;

    const structuredItems = [];
    selectedObat.forEach((obat, index) => {
        const jumlahValue = document.getElementById(`jumlah-${index}`)?.value || '1';
        const jumlah = parseInt(jumlahValue, 10);
        const satuan = document.getElementById(`satuan-${index}`)?.value || 'tablet';
        const caraPakai = document.getElementById(`carapakai-${index}`)?.value.trim() || '';

        structuredItems.push({
            obatId: obat.id || null,
            name: obat.name,
            quantity: isNaN(jumlah) ? 1 : jumlah,
            unit: satuan,
            caraPakai,
            latinSig: convertToLatinSig(caraPakai)
        });
    });

    // Store draft for preview
    storeDraftTerapi(structuredItems);
}

// Draft terapi management functions
function storeDraftTerapi(items) {
    try {
        const mrSlug = window.routeMrSlug;
        const key = `draft_terapi_${mrSlug}`;
        sessionStorage.setItem(key, JSON.stringify(items));
    } catch (error) {
        console.error('Error storing draft terapi:', error);
    }
}

function getDraftTerapi() {
    try {
        const mrSlug = window.routeMrSlug;
        const key = `draft_terapi_${mrSlug}`;
        const data = sessionStorage.getItem(key);
        return data ? JSON.parse(data) : null;
    } catch (error) {
        console.error('Error getting draft terapi:', error);
        return null;
    }
}

function clearDraftTerapi() {
    try {
        const mrSlug = window.routeMrSlug;
        const key = `draft_terapi_${mrSlug}`;
        sessionStorage.removeItem(key);
    } catch (error) {
        console.error('Error clearing draft terapi:', error);
    }
}

// HTML escape helper
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Refresh billing component if active
function refreshBillingIfActive() {
    // Only refresh if user is currently on billing section
    // Don't redirect from Planning to Billing
    const state = window.stateManager?.getState();
    const activeSection = state?.activeSection;
    
    if (activeSection === 'billing' && window.handleSectionChange) {
        // Force reload the billing section if already there
        window.handleSectionChange('billing', { pushHistory: false });
    }
    // If not on billing section, do nothing - stay on current section
}

// ============================================================================
// GLOBAL EXPORTS
// ============================================================================

// Make functions globally accessible for onclick handlers in modals
window.openTindakanModal = openTindakanModal;
window.openTerapiModal = openTerapiModal;
window.addTindakan = addTindakan;
window.addSelectedTindakan = addSelectedTindakan;
window.updateTindakanCount = updateTindakanCount;
window.resetTindakan = resetTindakan;
window.resetTerapi = resetTerapi;
window.proceedToCaraPakai = proceedToCaraPakai;
window.backToObatSelection = backToObatSelection;
window.addBatchTerapi = addBatchTerapi;
window.updateDraftTerapiPreview = updateDraftTerapiPreview;
window.storeDraftTerapi = storeDraftTerapi;
window.getDraftTerapi = getDraftTerapi;
window.clearDraftTerapi = clearDraftTerapi;
window.removeObatFromPlanning = removeObatFromPlanning;
window.deleteIndividualObat = deleteIndividualObat;
window.renderTerapiItemsList = renderTerapiItemsList;
window.deleteIndividualTindakan = deleteIndividualTindakan;
window.renderTindakanItemsList = renderTindakanItemsList;

console.log('[Planning Helpers] Loaded successfully');

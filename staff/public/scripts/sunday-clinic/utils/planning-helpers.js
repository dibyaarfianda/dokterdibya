/**
 * Planning Helpers - Modal Workflows for Tindakan and Terapi
 *
 * Handles the old format Planning functionality for obstetri category:
 * - Tindakan (procedures) selection with modal
 * - Terapi (medications) selection with Latin prescription formatting
 * - Billing integration for selected items
 *
 * VERSION: 2026-01-18-v3
 */

// ============================================================================
// GLOBAL STATE
// ============================================================================

window.PLANNING_HELPERS_VERSION = '2026-08-16-v18-usg-screening';
console.log('[Planning Helpers] Loaded version:', window.PLANNING_HELPERS_VERSION);

console.log('[Planning Helpers] DOM debug marker removed for production/mobile use');

window.availableTindakanList = null;
window.selectedTindakanKeys = new Set();
window.selectedObatForPrescription = null;
window.prescriptionTemplates = [];
window.editingPrescriptionTemplate = null;

function resetTindakanModalSelection() {
    window.selectedTindakanKeys.clear();
    document.querySelectorAll('.tindakan-checkbox').forEach((checkbox) => {
        checkbox.checked = false;
    });
    document.querySelectorAll('.tindakan-item.selected').forEach((item) => {
        item.classList.remove('selected');
    });
    updateTindakanCount();
}

function resetTerapiModalSelection() {
    document.querySelectorAll('.obat-checkbox').forEach((checkbox) => {
        checkbox.checked = false;
    });
    const selectAllCheckbox = document.getElementById('select-all-obat');
    if (selectAllCheckbox) {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = false;
    }
    window.selectedObatForPrescription = null;
}

// Simple loading state helper for modal
function showLoadingStatus(modalBody, status) {
    if (!modalBody) return;
    modalBody.innerHTML = `
        <div class="text-center py-4">
            <div style="color: #666;">${status}</div>
        </div>
    `;
}

// ============================================================================
// TINDAKAN FUNCTIONS
// ============================================================================

const QUICK_TINDAKAN_ALIASES = Object.freeze({
    usg_2d: ['usg 2 dimensi', 'usg 2d'],
    usg_tvs: ['usg tvs', 'tvs', 'usg transvaginal', 'ultrasonografi transvaginal'],
    usg_4d: ['usg 4 dimensi', 'usg 4d'],
    usg_skrining: ['usg kelainan janin', 'usg skrining']
});

function normalizeTindakanName(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

function getTindakanSelectionKey(item) {
    if (item?.id !== undefined && item?.id !== null && item.id !== '') {
        return `id:${item.id}`;
    }
    if (item?.code) return `code:${normalizeTindakanName(item.code)}`;
    return `name:${normalizeTindakanName(item?.name)}`;
}

function syncTindakanCheckboxSelection(checkbox) {
    if (!checkbox) return;

    const selectionKey = checkbox.dataset.tindakanKey;
    if (selectionKey) {
        if (checkbox.checked) {
            window.selectedTindakanKeys.add(selectionKey);
        } else {
            window.selectedTindakanKeys.delete(selectionKey);
        }
    }

    const item = checkbox.closest('.tindakan-item');
    if (item) item.classList.toggle('selected', checkbox.checked);
    updateTindakanCount();
}

function findQuickTindakan(quickKey, tindakanList) {
    const aliases = QUICK_TINDAKAN_ALIASES[quickKey];
    if (!aliases || !Array.isArray(tindakanList)) return null;

    const normalizedAliases = aliases.map(normalizeTindakanName);
    const exactMatch = tindakanList.find((item) =>
        normalizedAliases.includes(normalizeTindakanName(item.name))
    );
    return exactMatch || tindakanList.find((item) => {
        const normalizedName = normalizeTindakanName(item.name);
        return normalizedAliases.some((alias) => normalizedName.includes(alias));
    });
}

async function addQuickTindakan(quickKey, button) {
    const aliases = QUICK_TINDAKAN_ALIASES[quickKey];
    if (!aliases) return false;

    if (button) {
        button.disabled = true;
        button.setAttribute('aria-busy', 'true');
    }

    try {
        let tindakanList = Array.isArray(window.availableTindakanList)
            ? window.availableTindakanList
            : [];

        if (tindakanList.length === 0) {
            const token = await window.getToken();
            if (!token) throw new Error('Sesi habis. Silakan login ulang.');

            const response = await fetch('/api/tindakan?active=true', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) throw new Error(`Gagal memuat tindakan (HTTP ${response.status})`);

            const result = await response.json();
            const availableItems = result.data || result;
            tindakanList = availableItems.filter((item) => item.category !== 'ADMINISTRATIF');
            window.availableTindakanList = tindakanList;
        }

        const tindakan = findQuickTindakan(quickKey, tindakanList);

        if (!tindakan) throw new Error(`Tindakan ${aliases[0].toUpperCase()} tidak ditemukan`);

        return await addTindakan(tindakan.name, tindakan.code, tindakan.id, {
            addToTextarea: false,
            hideModal: false,
            refreshList: true,
            successMessage: `Tindakan "${tindakan.name}" ditambahkan ke Tagihan`
        });
    } catch (error) {
        console.error('Error adding quick tindakan:', error);
        if (typeof showError === 'function') {
            showError(error.message);
        } else {
            window.showToast?.('error', error.message);
        }
        return false;
    } finally {
        if (button) {
            button.disabled = false;
            button.removeAttribute('aria-busy');
        }
    }
}

async function openTindakanModal() {
    console.log('[Planning v11] openTindakanModal called');

    const modalBody = document.getElementById('tindakan-modal-body');

    // If content is already loaded (more than 1 child), just show modal without reloading
    if (modalBody && modalBody.children.length > 1) {
        console.log('[Planning v11] Content already loaded, children:', modalBody.children.length, '- just showing modal');
        resetTindakanModalSelection();
        const searchInput = document.querySelector('#tindakan-modal #sc-tindakan-search')
            || document.querySelector('#tindakan-modal #tindakan-search');
        if (searchInput) {
            searchInput.value = '';
            if (typeof searchInput.oninput === 'function') {
                searchInput.oninput({ target: searchInput });
                resetTindakanModalSelection();
            }
        }
        if (typeof $ !== 'undefined') {
            $('#tindakan-modal').modal('show');
        }
        return;
    }

    // Prevent multiple concurrent calls
    if (window._tindakanModalLoading) {
        console.log('[Planning v11] Already loading tindakan, skipping duplicate call');
        return;
    }
    window._tindakanModalLoading = true;

    // Set flag immediately to prevent show.bs.modal handler from overwriting content
    window._tindakanModalInitialized = true;

    console.log('[Planning v11] modalBody found:', !!modalBody);

    if (modalBody) {
        showLoadingStatus(modalBody, '<i class="fas fa-spinner fa-spin"></i> Memuat data tindakan...');
    } else {
        console.error('[Planning v11] tindakan-modal-body NOT FOUND!');
        alert('ERROR: Modal body element not found!');
        return;
    }

    // Try to show modal immediately so user sees loading state
    try {
        if (typeof $ !== 'undefined' && $('#tindakan-modal').length) {
            $('#tindakan-modal').modal('show');
        }
    } catch (e) {
        console.error('[Planning] Error showing modal:', e);
        showLoadingStatus(modalBody, 'Error showing modal: ' + e.message, '#ffcccb');
    }

    try {
        showLoadingStatus(modalBody, '<i class="fas fa-key"></i> Mendapatkan token...');

        const token = await window.getToken();
        console.log('[Planning v11] Token retrieved:', !!token);
        if (!token) {
            showLoadingStatus(modalBody, '<i class="fas fa-exclamation-triangle"></i> Sesi habis. Silakan login ulang.', '#ffcccb');
            return;
        }

        showLoadingStatus(modalBody, '<i class="fas fa-spinner fa-spin"></i> Mengambil data tindakan dari server...');
        console.log('[Planning v11] Fetching tindakan data...');

        const response = await fetch('/api/tindakan?active=true', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        console.log('[Planning v11] Response status:', response.status);
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);

        const result = await response.json();
        const tindakanList = result.data || result;
        console.log('[Planning v11] Tindakan loaded:', tindakanList.length, 'items');

        showLoadingStatus(modalBody, `<i class="fas fa-check"></i> Diterima ${tindakanList.length} tindakan, memproses...`);

        // Filter out ADMINISTRATIF category
        const filteredTindakan = tindakanList.filter(item => item.category !== 'ADMINISTRATIF');
        console.log('[Planning v11] After filter:', filteredTindakan.length, 'items');

        if (filteredTindakan.length === 0) {
            showLoadingStatus(modalBody, '<i class="fas fa-info-circle"></i> Tidak ada data tindakan tersedia.', '#cce5ff');
            window._tindakanModalLoading = false;
            return;
        }

        // Show modal with tindakan list
        showTindakanModal(filteredTindakan);
        window._tindakanModalLoading = false;

    } catch (error) {
        window._tindakanModalLoading = false;
        console.error('[Planning v11] Error loading tindakan:', error);
        const errorMsg = 'Gagal memuat data tindakan: ' + error.message;

        // Show error in modal body with debug info
        showLoadingStatus(modalBody, `<i class="fas fa-exclamation-triangle"></i> ${errorMsg}`, '#ffcccb');

        if (typeof showError === 'function') {
            showError(errorMsg);
        } else if (window.showToast) {
            window.showToast('error', errorMsg);
        }
    }
}

function showTindakanModal(tindakanList) {
    console.log('[Planning v11] showTindakanModal called with', tindakanList?.length, 'items');

    const modal = document.getElementById('tindakan-modal');
    const container = document.getElementById('tindakan-modal-body');
    const searchInput = document.querySelector('#tindakan-modal #sc-tindakan-search')
        || document.querySelector('#tindakan-modal #tindakan-search');

    console.log('[Planning v11] Elements found:', { modal: !!modal, container: !!container, searchInput: !!searchInput });

    if (!modal || !container) {
        console.error('[Planning v11] MISSING ELEMENTS! modal:', !!modal, 'container:', !!container);
        alert('ERROR: Modal elements not found!');
        return;
    }

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
                const selectionKey = getTindakanSelectionKey(item);
                const escapedSelectionKey = escapeHtml(selectionKey);
                const isSelected = window.selectedTindakanKeys.has(selectionKey);
                html += `
                    <div class="col-6 col-md-3 mb-2">
                        <div class="tindakan-item${isSelected ? ' selected' : ''}" data-tindakan-id="${item.id || ''}">
                            <div class="custom-control custom-checkbox">
                                <input type="checkbox" class="custom-control-input tindakan-checkbox"
                                       id="tindakan-${item.id}"
                                       data-tindakan-name="${escapedName}"
                                       data-tindakan-code="${escapedCode}"
                                       data-tindakan-id="${item.id || ''}"
                                       data-tindakan-key="${escapedSelectionKey}"${isSelected ? ' checked' : ''}>
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

        console.log('[Planning v11] Rendering', Object.keys(byCategory).length, 'categories, HTML length:', html.length);
        container.innerHTML = html;
        console.log('[Planning v11] Container innerHTML set, children:', container.children.length);

        // CRITICAL: Force height with !important - WebView ignores vh units
        // Using cssText to ensure !important is applied
        container.style.cssText = 'min-height: 250px !important; max-height: 400px !important; height: auto !important; overflow-y: auto !important; display: block !important;';
        console.log('[Planning v11] Container cssText forced:', container.style.cssText);
        console.log('[Planning v11] Container offsetHeight:', container.offsetHeight, 'scrollHeight:', container.scrollHeight);

        // Add click handler to each item container (for better UX)
        container.querySelectorAll('.tindakan-item').forEach(item => {
            item.addEventListener('click', (e) => {
                // Don't toggle if clicking directly on checkbox
                if (e.target.type !== 'checkbox') {
                    const checkbox = item.querySelector('.tindakan-checkbox');
                    if (checkbox) {
                        checkbox.checked = !checkbox.checked;
                        syncTindakanCheckboxSelection(checkbox);
                    }
                }
            });
        });

        // Add change listener to each checkbox
        container.querySelectorAll('.tindakan-checkbox').forEach(cb => {
            cb.addEventListener('change', function() {
                syncTindakanCheckboxSelection(this);
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
    resetTindakanModalSelection();

    // Show modal using Bootstrap
    $('#tindakan-modal').modal('show');
}

function updateTindakanCount() {
    const selectedCount = window.selectedTindakanKeys.size;
    const countEl = document.getElementById('selected-tindakan-count');
    if (countEl) {
        countEl.innerHTML = `<small>${selectedCount} tindakan dipilih</small>`;
    }
}

async function addSelectedTindakan() {
    const selectedTindakan = (window.availableTindakanList || [])
        .filter((item) => window.selectedTindakanKeys.has(getTindakanSelectionKey(item)))
        .map((item) => ({
            name: item.name,
            code: item.code,
            id: item.id
        }));

    if (selectedTindakan.length === 0) {
        if (typeof showError === 'function') {
            showError('Silakan pilih minimal satu tindakan');
        } else {
            window.showToast('warning', 'Silakan pilih minimal satu tindakan');
        }
        return;
    }

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

async function addTindakan(tindakanName, tindakanCode, tindakanId, options = {}) {
    const {
        addToTextarea = true,
        hideModal = true,
        refreshList = false,
        successMessage = `Tindakan "${tindakanName}" ditambahkan ke Planning dan Tagihan`
    } = options;
    const textarea = document.getElementById('planning-tindakan');
    if (!textarea) return false;

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

        // Add to textarea only for legacy/manual flows.
        if (addToTextarea) {
            const currentValue = textarea.value.trim();
            if (currentValue) {
                textarea.value = currentValue + '\n' + tindakanName;
            } else {
                textarea.value = tindakanName;
            }
        }

        if (hideModal && typeof $ !== 'undefined' && $('#tindakan-modal').length) {
            $('#tindakan-modal').modal('hide');
        }

        if (typeof showSuccess === 'function') {
            showSuccess(successMessage);
        }

        // Refresh billing component if it exists
        refreshBillingIfActive();

        if (refreshList && window.renderTindakanItemsList) {
            await window.renderTindakanItemsList();
        }

        return true;

    } catch (error) {
        console.error('Error adding tindakan:', error);
        if (typeof showError === 'function') {
            showError('Gagal menambahkan tindakan: ' + error.message);
        } else {
            window.showToast('error', 'Gagal menambahkan tindakan: ' + error.message);
        }
        return false;
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
    console.log('[Planning v11] openTerapiModal called');

    resetTerapiModalSelection();

    // Prevent multiple concurrent calls
    if (window._terapiModalLoading) {
        console.log('[Planning v11] Already loading terapi, skipping duplicate call');
        return;
    }
    window._terapiModalLoading = true;

    // Set flag immediately to prevent show.bs.modal handler from overwriting content
    window._terapiModalInitialized = true;

    // Show loading indicator in modal body first
    const modalBody = document.getElementById('terapi-modal-body');
    console.log('[Planning v11] terapi modalBody found:', !!modalBody);

    // Helper for table row loading messages
    const showTerapiLoading = (msg) => {
        if (modalBody) {
            modalBody.innerHTML = `<tr><td colspan="5" class="text-center py-3">
                <div style="color: #666;">${msg}</div>
            </td></tr>`;
        }
    };

    if (modalBody) {
        showTerapiLoading('<i class="fas fa-spinner fa-spin"></i> Memuat data obat...');
    } else {
        console.error('[Planning v11] terapi-modal-body NOT FOUND!');
        alert('ERROR: Terapi modal body element not found!');
        return;
    }

    // Try to show modal immediately so user sees loading state
    try {
        if (typeof $ !== 'undefined' && $('#terapi-modal').length) {
            $('#terapi-modal').modal('show');
        }
    } catch (e) {
        console.error('[Planning] Error showing modal:', e);
        showTerapiLoading('Error showing modal: ' + e.message, '#ffcccb');
    }

    try {
        showTerapiLoading('<i class="fas fa-key"></i> Mendapatkan token...');

        const token = await window.getToken();
        console.log('[Planning v11] Token retrieved:', !!token);
        if (!token) {
            showTerapiLoading('<i class="fas fa-exclamation-triangle"></i> Sesi habis. Silakan login ulang.', '#ffcccb');
            return;
        }

        showTerapiLoading('<i class="fas fa-spinner fa-spin"></i> Mengambil data obat dari server...');
        console.log('[Planning v11] Fetching obat data...');

        const response = await fetch('/api/obat?active=true', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        console.log('[Planning v11] Response status:', response.status);
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);

        const result = await response.json();
        const obatList = result.data || result;
        console.log('[Planning v11] Obat loaded:', obatList.length, 'items');

        showTerapiLoading(`<i class="fas fa-check"></i> Diterima ${obatList.length} obat, memproses...`);

        if (obatList.length === 0) {
            showTerapiLoading('<i class="fas fa-info-circle"></i> Tidak ada data obat tersedia.', '#cce5ff');
            window._terapiModalLoading = false;
            return;
        }

        // Show modal with obat list
        showTerapiModal(obatList);
        window._terapiModalLoading = false;

    } catch (error) {
        window._terapiModalLoading = false;
        console.error('[Planning v11] Error loading obat:', error);
        const errorMsg = 'Gagal memuat data obat: ' + error.message;

        // Show error in modal body with debug info
        showTerapiLoading(`<i class="fas fa-exclamation-triangle"></i> ${errorMsg}`, '#ffcccb');

        if (typeof showError === 'function') {
            showError(errorMsg);
        } else if (window.showToast) {
            window.showToast('error', errorMsg);
        }
    }
}

function showTerapiModal(obatList) {
    console.log('[Planning v11] showTerapiModal called with', obatList?.length, 'items');

    const modal = document.getElementById('terapi-modal');
    const tbody = document.getElementById('terapi-modal-body');
    const searchInput = document.querySelector('#terapi-modal #obat-search');

    console.log('[Planning v11] Elements check - modal:', !!modal, 'tbody:', !!tbody, 'searchInput:', !!searchInput);

    if (!modal || !tbody) {
        console.error('[Planning v11] MISSING ELEMENTS! modal:', !!modal, 'tbody:', !!tbody);
        return;
    }

    // Store obat list for search
    window.availableObatList = obatList;

    // Track selected obat IDs (persists across search/filter)
    const selectedObatIds = new Set();

    // Render function - called on initial load and search filter
    function renderObatTable(filterText = '') {
        console.log('[Planning v11] renderObatTable called, filter:', filterText, 'obatList.length:', obatList?.length);
        const filter = filterText.toLowerCase();

        // Save current state of ALL visible checkboxes before clearing
        document.querySelectorAll('.obat-checkbox').forEach(cb => {
            if (cb.checked) {
                selectedObatIds.add(cb.dataset.obatId);
            } else {
                selectedObatIds.delete(cb.dataset.obatId);
            }
        });

        // Clear existing content
        tbody.innerHTML = '';

        // Filter and populate table
        obatList.forEach((item, index) => {
            // Filter by name or code
            const matchesFilter = !filter ||
                (item.name && item.name.toLowerCase().includes(filter)) ||
                (item.code && item.code.toLowerCase().includes(filter));

            if (!matchesFilter) return;

            // Check if this item was previously selected
            const isChecked = selectedObatIds.has(String(item.id || ''));

            const row = document.createElement('tr');
            row.innerHTML = `
                <td data-label="Pilih">
                    <div class="custom-control custom-checkbox">
                        <input type="checkbox" class="custom-control-input obat-checkbox" id="obat-${index}" data-obat-name="${escapeHtml(item.name || '')}" data-obat-id="${item.id || ''}" ${isChecked ? 'checked' : ''}>
                        <label class="custom-control-label" for="obat-${index}"></label>
                    </div>
                </td>
                <td data-label="Kode">${escapeHtml(item.code || '')}</td>
                <td data-label="Nama Obat">${escapeHtml(item.name || '')}</td>
                <td data-label="Kategori">${escapeHtml(item.category || '')}</td>
                <td data-label="Stok">${item.stock !== undefined ? item.stock : '-'}</td>
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
    console.log('[Planning v11] About to call renderObatTable...');
    renderObatTable();
    resetTerapiModalSelection();
    console.log('[Planning v11] renderObatTable done, tbody.children:', tbody.children.length);

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

function showBatchCaraPakaiModal(selectedObat, options = {}) {
    const modalBody = document.getElementById('batch-cara-pakai-body');
    if (!modalBody) return;

    window.editingPrescriptionTemplate = options.template || null;

    // Build compact form for each selected obat
    let formHtml = '';
    if (window.editingPrescriptionTemplate) {
        formHtml += `
            <div class="alert alert-success py-2 mb-3">
                <i class="fas fa-edit mr-1"></i>
                Edit template: <strong>${escapeHtml(window.editingPrescriptionTemplate.name || '-')}</strong>
            </div>
        `;
    }
    formHtml += '<div class="resep-compact-list">';
    selectedObat.forEach((obat, index) => {
        const isLast = index === selectedObat.length - 1;
        const quantityValue = Number(obat.quantity) > 0 ? Number(obat.quantity) : 1;
        const selectedUnit = obat.unit || 'tablet';
        const caraPakaiValue = obat.caraPakai || '';
        formHtml += `
            <div class="resep-row mb-2 p-2 border rounded" data-index="${index}">
                <div class="d-flex align-items-center flex-wrap">
                    <span class="font-weight-bold mr-2 sc-medication-name">
                        <i class="fas fa-pills text-success mr-1"></i>${escapeHtml(obat.name)}
                    </span>
                    <input type="number" class="form-control form-control-sm draft-terapi-field mr-1 sc-medication-quantity"
                           id="jumlah-${index}" min="1" value="${escapeHtml(String(quantityValue))}"
                           data-next="satuan-${index}">
                    <select class="form-control form-control-sm draft-terapi-field mr-2 sc-medication-unit"
                            id="satuan-${index}"
                            data-next="carapakai-${index}">
                        <option value="tablet" ${selectedUnit === 'tablet' ? 'selected' : ''}>tab</option>
                        <option value="kapsul" ${selectedUnit === 'kapsul' ? 'selected' : ''}>kap</option>
                        <option value="box" ${selectedUnit === 'box' ? 'selected' : ''}>box</option>
                        <option value="botol" ${selectedUnit === 'botol' ? 'selected' : ''}>btl</option>
                        <option value="tube" ${selectedUnit === 'tube' ? 'selected' : ''}>tube</option>
                        <option value="sachet" ${selectedUnit === 'sachet' ? 'selected' : ''}>sach</option>
                    </select>
                    <div class="btn-group btn-group-sm mr-2">
                        <button type="button" class="btn btn-outline-secondary quick-dose" data-target="carapakai-${index}" data-value="3x1">3x1</button>
                        <button type="button" class="btn btn-outline-secondary quick-dose" data-target="carapakai-${index}" data-value="2x1">2x1</button>
                        <button type="button" class="btn btn-outline-secondary quick-dose" data-target="carapakai-${index}" data-value="1x1">1x1</button>
                    </div>
                    <input type="text" class="form-control form-control-sm draft-terapi-field flex-grow-1 sc-medication-instruction"
                           id="carapakai-${index}" value="${escapeHtml(caraPakaiValue)}" placeholder="atau ketik manual..."
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
    window.editingPrescriptionTemplate = null;
    $('#cara-pakai-modal').modal('hide');
    $('#terapi-modal').modal('show');
}

function collectCurrentPrescriptionItems() {
    const selectedObat = window.selectedObatForPrescription;
    if (!Array.isArray(selectedObat) || selectedObat.length === 0) return [];

    return selectedObat.map((obat, index) => {
        const jumlahValue = document.getElementById(`jumlah-${index}`)?.value || '1';
        const jumlah = parseInt(jumlahValue, 10);
        const satuan = document.getElementById(`satuan-${index}`)?.value || 'tablet';
        const caraPakai = document.getElementById(`carapakai-${index}`)?.value.trim() || '';

        return {
            obatId: obat.obatId || obat.id || null,
            name: obat.name,
            quantity: isNaN(jumlah) ? 1 : jumlah,
            unit: satuan,
            caraPakai,
            latinSig: convertToLatinSig(caraPakai)
        };
    }).filter(item => item.name);
}

async function addBatchTerapi() {
    const selectedObat = window.selectedObatForPrescription;
    if (!selectedObat || selectedObat.length === 0) return;

    const textarea = document.getElementById('planning-terapi');
    if (!textarea) return;

    let allPrescriptions = [];
    const structuredItems = collectCurrentPrescriptionItems();

    // Collect all prescriptions
    structuredItems.forEach((obat) => {
        // Convert to Latin format
        const romanQuantity = toRoman(obat.quantity);
        const latinSig = obat.latinSig;

        // Format: R/ [Drug] [Unit] No. [Roman] Sig. [Latin]
        let prescription = `R/ ${obat.name} ${obat.unit} No. ${romanQuantity}`;
        if (latinSig) {
            prescription += ` Sig. ${latinSig}`;
        }

        allPrescriptions.push(prescription);
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

async function fetchPrescriptionTemplates() {
    const token = await window.getToken();
    if (!token) {
        throw new Error('Sesi habis. Silakan login ulang.');
    }

    const response = await fetch('/api/sunday-clinic/prescription-templates', {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.success) {
        throw new Error(result.message || 'Gagal memuat template obat');
    }

    return Array.isArray(result.data) ? result.data : [];
}

async function openPrescriptionTemplateModal() {
    const container = document.getElementById('prescription-template-list');
    if (container) {
        container.innerHTML = '<div class="text-center text-muted py-3"><i class="fas fa-spinner fa-spin mr-1"></i>Memuat template...</div>';
    }

    if (typeof $ !== 'undefined') {
        $('#prescription-template-modal').modal('show');
    }

    try {
        window.prescriptionTemplates = await fetchPrescriptionTemplates();
        renderPrescriptionTemplateList();
    } catch (error) {
        console.error('Error loading prescription templates:', error);
        if (container) {
            container.innerHTML = `<div class="alert alert-danger mb-0">${escapeHtml(error.message || 'Gagal memuat template obat')}</div>`;
        }
    }
}

function renderPrescriptionTemplateList() {
    const container = document.getElementById('prescription-template-list');
    if (!container) return;

    const templates = Array.isArray(window.prescriptionTemplates) ? window.prescriptionTemplates : [];
    if (templates.length === 0) {
        container.innerHTML = `
            <div class="text-center text-muted py-4">
                <i class="fas fa-layer-group fa-2x mb-2"></i>
                <p class="mb-1">Belum ada template obat.</p>
                <small>Simpan template dari modal Isi Detail Resep.</small>
            </div>
        `;
        return;
    }

    container.innerHTML = templates.map(template => {
        const items = Array.isArray(template.items) ? template.items : [];
        const itemPreview = items.slice(0, 4).map(item => {
            const quantity = item.quantity || 1;
            const unit = item.unit || 'tablet';
            const sig = item.caraPakai ? ` - ${item.caraPakai}` : '';
            return `<li>${escapeHtml(item.name || '-')} ${escapeHtml(String(quantity))} ${escapeHtml(unit)}${escapeHtml(sig)}</li>`;
        }).join('');
        const moreText = items.length > 4 ? `<li class="text-muted">+${items.length - 4} obat lain</li>` : '';

        return `
            <div class="border rounded p-3 mb-2" data-template-id="${template.id}">
                <div class="d-flex justify-content-between align-items-start">
                    <div style="min-width:0;">
                        <div class="font-weight-bold text-success">${escapeHtml(template.name || '-')}</div>
                        <ul class="small mb-0 pl-3">${itemPreview}${moreText}</ul>
                    </div>
                    <div class="btn-group btn-group-sm ml-2 flex-shrink-0">
                        <button type="button" class="btn btn-success" onclick="applyPrescriptionTemplate(${template.id})" title="Pakai template">
                            <i class="fas fa-check"></i>
                        </button>
                        <button type="button" class="btn btn-outline-primary" onclick="editPrescriptionTemplate(${template.id})" title="Edit template">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button type="button" class="btn btn-outline-danger" onclick="deletePrescriptionTemplate(${template.id})" title="Hapus template">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function findPrescriptionTemplate(templateId) {
    const id = Number(templateId);
    return (window.prescriptionTemplates || []).find(template => Number(template.id) === id) || null;
}

async function applyPrescriptionTemplate(templateId) {
    const template = findPrescriptionTemplate(templateId);
    if (!template || !Array.isArray(template.items) || template.items.length === 0) {
        window.showToast && window.showToast('warning', 'Template obat tidak valid');
        return;
    }

    const saved = await saveStructuredTerapi(template.items);
    if (!saved) return;

    if (typeof $ !== 'undefined') {
        $('#prescription-template-modal').modal('hide');
    }

    refreshBillingIfActive();
    if (window.renderTerapiItemsList) {
        await window.renderTerapiItemsList();
    }

    if (window.showToast) {
        window.showToast('success', `Template "${template.name}" dipakai`);
    } else if (typeof showSuccess === 'function') {
        showSuccess(`Template "${template.name}" dipakai`);
    }
}

function editPrescriptionTemplate(templateId) {
    const template = findPrescriptionTemplate(templateId);
    if (!template || !Array.isArray(template.items) || template.items.length === 0) {
        window.showToast && window.showToast('warning', 'Template obat tidak valid');
        return;
    }

    const selectedObat = template.items.map(item => ({
        id: item.obatId || item.id || null,
        obatId: item.obatId || item.id || null,
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        caraPakai: item.caraPakai
    }));

    if (typeof $ !== 'undefined') {
        $('#prescription-template-modal').modal('hide');
    }

    showBatchCaraPakaiModal(selectedObat, { template });
}

async function saveCurrentPrescriptionAsTemplate() {
    const items = collectCurrentPrescriptionItems();
    if (items.length === 0) {
        window.showToast && window.showToast('warning', 'Isi minimal satu obat sebelum menyimpan template');
        return;
    }

    const editingTemplate = window.editingPrescriptionTemplate;
    const defaultName = editingTemplate?.name || '';
    const name = window.prompt('Nama template obat:', defaultName);
    if (!name || !name.trim()) return;

    try {
        const token = await window.getToken();
        if (!token) {
            throw new Error('Sesi habis. Silakan login ulang.');
        }

        const endpoint = editingTemplate?.id
            ? `/api/sunday-clinic/prescription-templates/${editingTemplate.id}`
            : '/api/sunday-clinic/prescription-templates';
        const response = await fetch(endpoint, {
            method: editingTemplate?.id ? 'PUT' : 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                name: name.trim(),
                items
            })
        });

        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.success) {
            throw new Error(result.message || 'Gagal menyimpan template obat');
        }

        window.editingPrescriptionTemplate = null;
        if (window.showToast) {
            window.showToast('success', result.message || 'Template obat berhasil disimpan');
        } else if (typeof showSuccess === 'function') {
            showSuccess(result.message || 'Template obat berhasil disimpan');
        }
    } catch (error) {
        console.error('Error saving prescription template:', error);
        window.showToast && window.showToast('error', error.message || 'Gagal menyimpan template obat');
    }
}

async function deletePrescriptionTemplate(templateId) {
    const template = findPrescriptionTemplate(templateId);
    if (!template) return;

    if (!confirm(`Hapus template obat "${template.name}"?`)) {
        return;
    }

    try {
        const token = await window.getToken();
        if (!token) {
            throw new Error('Sesi habis. Silakan login ulang.');
        }

        const response = await fetch(`/api/sunday-clinic/prescription-templates/${template.id}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.success) {
            throw new Error(result.message || 'Gagal menghapus template obat');
        }

        window.prescriptionTemplates = (window.prescriptionTemplates || []).filter(item => Number(item.id) !== Number(template.id));
        renderPrescriptionTemplateList();
        window.showToast && window.showToast('success', 'Template obat dihapus');
    } catch (error) {
        console.error('Error deleting prescription template:', error);
        window.showToast && window.showToast('error', error.message || 'Gagal menghapus template obat');
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
window.addQuickTindakan = addQuickTindakan;
window.resetTindakan = resetTindakan;
window.resetTerapi = resetTerapi;
window.proceedToCaraPakai = proceedToCaraPakai;
window.backToObatSelection = backToObatSelection;
window.addBatchTerapi = addBatchTerapi;
window.openPrescriptionTemplateModal = openPrescriptionTemplateModal;
window.saveCurrentPrescriptionAsTemplate = saveCurrentPrescriptionAsTemplate;
window.applyPrescriptionTemplate = applyPrescriptionTemplate;
window.editPrescriptionTemplate = editPrescriptionTemplate;
window.deletePrescriptionTemplate = deletePrescriptionTemplate;
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

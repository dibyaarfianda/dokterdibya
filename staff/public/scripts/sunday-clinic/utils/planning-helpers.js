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
            alert('Gagal memuat data tindakan: ' + error.message);
        }
    }
}

function showTindakanModal(tindakanList) {
    const modal = document.getElementById('tindakan-modal');
    const tbody = document.getElementById('tindakan-modal-body');

    if (!modal || !tbody) return;

    // Clear existing content
    tbody.innerHTML = '';

    // Store tindakan list for later use
    window.availableTindakanList = tindakanList;

    // Populate table
    tindakanList.forEach(item => {
        const row = document.createElement('tr');
        const escapedName = escapeHtml(item.name || '');
        const escapedCode = escapeHtml(item.code || '');

        row.innerHTML = `
            <td>${escapedCode}</td>
            <td>${escapedName}</td>
            <td>${escapeHtml(item.category || '')}</td>
            <td>
                <button type="button" class="btn btn-sm btn-success" onclick="window.addTindakan('${escapedName}', '${escapedCode}', ${item.id || 'null'})">
                    <i class="fas fa-plus"></i> Tambah
                </button>
            </td>
        `;
        tbody.appendChild(row);
    });

    // Show modal using Bootstrap
    $('#tindakan-modal').modal('show');
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
            alert('Gagal menambahkan tindakan: ' + error.message);
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
            alert('Error: ' + error.message);
        }
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
            alert('Gagal memuat data obat: ' + error.message);
        }
    }
}

function showTerapiModal(obatList) {
    const modal = document.getElementById('terapi-modal');
    const tbody = document.getElementById('terapi-modal-body');

    if (!modal || !tbody) return;

    // Clear existing content
    tbody.innerHTML = '';

    // Populate table with checkboxes
    obatList.forEach((item, index) => {
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
            alert('Silakan pilih minimal satu obat');
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

    // Build form for each selected obat
    let formHtml = '';
    selectedObat.forEach((obat, index) => {
        formHtml += `
            <div class="card mb-3">
                <div class="card-header bg-light">
                    <h6 class="mb-0"><i class="fas fa-pills mr-2"></i>${escapeHtml(obat.name)}</h6>
                </div>
                <div class="card-body">
                    <div class="form-row">
                        <div class="form-group col-md-4">
                            <label class="font-weight-bold">Jumlah:</label>
                            <input type="number" class="form-control draft-terapi-field" id="jumlah-${index}" min="1" value="1" placeholder="Jumlah">
                        </div>
                        <div class="form-group col-md-4">
                            <label class="font-weight-bold">Satuan:</label>
                            <select class="form-control draft-terapi-field" id="satuan-${index}">
                                <option value="tablet">tablet</option>
                                <option value="kapsul">kapsul</option>
                                <option value="box">box</option>
                                <option value="botol">botol</option>
                                <option value="tube">tube</option>
                                <option value="sachet">sachet</option>
                                <option value="ampul">ampul</option>
                                <option value="vial">vial</option>
                            </select>
                        </div>
                        <div class="form-group col-md-4">
                            <label class="font-weight-bold">Cara Pakai:</label>
                            <input type="text" class="form-control draft-terapi-field" id="carapakai-${index}" placeholder="3x1 sebelum makan">
                        </div>
                    </div>
                    <small class="form-text text-muted">
                        Contoh: "3x1 sebelum makan", "2x1 setelah makan", "1x1 sehari"
                    </small>
                </div>
            </div>
        `;
    });

    modalBody.innerHTML = formHtml;

    // Store selected obat data for later use
    window.selectedObatForPrescription = selectedObat;

    // Add event listeners to update draft on field changes
    setTimeout(() => {
        document.querySelectorAll('.draft-terapi-field').forEach(field => {
            field.addEventListener('input', updateDraftTerapiPreview);
            field.addEventListener('change', updateDraftTerapiPreview);
        });
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

    // Add all prescriptions to textarea
    const currentValue = textarea.value.trim();
    const newEntries = allPrescriptions.join('\n');

    if (currentValue) {
        textarea.value = currentValue + '\n' + newEntries;
    } else {
        textarea.value = newEntries;
    }

    // Clear draft AFTER adding to textarea (items are now saved to both database and Planning)
    clearDraftTerapi();

    // Hide modal
    $('#cara-pakai-modal').modal('hide');

    if (typeof showSuccess === 'function') {
        showSuccess(`${selectedObat.length} resep obat disimpan ke Planning dan Tagihan`);
    }

    // Clear stored data
    window.selectedObatForPrescription = null;

    // Refresh billing component if it exists
    refreshBillingIfActive();
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
            alert('Gagal menyimpan terapi: ' + error.message);
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
            alert('Error: ' + error.message);
        }
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
window.resetTindakan = resetTindakan;
window.resetTerapi = resetTerapi;
window.proceedToCaraPakai = proceedToCaraPakai;
window.backToObatSelection = backToObatSelection;
window.addBatchTerapi = addBatchTerapi;
window.updateDraftTerapiPreview = updateDraftTerapiPreview;
window.storeDraftTerapi = storeDraftTerapi;
window.getDraftTerapi = getDraftTerapi;
window.clearDraftTerapi = clearDraftTerapi;

console.log('[Planning Helpers] Loaded successfully');

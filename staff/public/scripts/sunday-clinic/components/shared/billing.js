/**
 * Billing Component (Shared / Tagihan)
 * Billing items, payments, invoice
 * Used across all 3 templates (Obstetri, Gyn Repro, Gyn Special)
 *
 * Sections:
 * 1. Billing Items (Consultations, Procedures, Tests, Medications)
 * 2. Total Calculation
 * 3. Payment Information
 * 4. Invoice Actions
 */

// Format currency helper - no decimals, with thousands separator
function formatRupiah(amount) {
    const number = Math.round(amount || 0);
    return 'Rp ' + number.toLocaleString('id-ID', { maximumFractionDigits: 0 });
}

function escapeHtml(value) {
    if (!value) return '';
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function formatDateTime(value) {
    if (!value) return '';
    return new Date(value).toLocaleString('id-ID', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

const ADDITIONAL_BILLING_ADD_ONS = [
    { code: 'S02', name: 'Surat Keterangan SpOG', price: 20000 },
    { code: 'S03', name: 'Buku Ginekologi', price: 25000 },
    { code: 'S04', name: 'Buku Obstetri (Kehamilan)', price: 40000 }
];

let additionalBillingModalState = null;
let additionalBillingPaymentState = null;

function getAdditionalBillingToken() {
    return window.getToken?.();
}

function refreshBillingSection() {
    if (window.handleSectionChange) {
        window.handleSectionChange('billing', { pushHistory: false });
    }
}

function showModal(modal) {
    if (window.$ && window.$.fn && window.$.fn.modal) {
        window.$(modal).modal('show');
        return;
    }
    modal.style.display = 'block';
    modal.classList.add('show');
}

function hideModal(modal) {
    if (window.$ && window.$.fn && window.$.fn.modal) {
        window.$(modal).modal('hide');
        return;
    }
    modal.style.display = 'none';
    modal.classList.remove('show');
}

function setAdditionalBillingModalError(message = '') {
    const errorElement = document.getElementById('additional-billing-modal-error');
    if (!errorElement) return;
    errorElement.textContent = message;
    errorElement.style.display = message ? 'block' : 'none';
}

function getAdditionalBillingItemMeta(item) {
    if (item.item_type === 'admin') {
        const addOn = ADDITIONAL_BILLING_ADD_ONS.find(entry => entry.code === item.item_code);
        return {
            name: addOn?.name || item.item_name || 'Item administratif',
            price: Number(addOn?.price ?? item.price ?? 0)
        };
    }

    if (item.item_type === 'tindakan') {
        const tindakan = additionalBillingModalState?.tindakanList?.find(
            entry => Number(entry.id) === Number(item.tindakan_id ?? item.tindakanId)
        );
        return {
            name: tindakan?.name || item.item_name || 'Pelayanan',
            price: Number(tindakan?.price ?? item.price ?? 0)
        };
    }

    const obat = additionalBillingModalState?.obatList?.find(
        entry => Number(entry.id) === Number(item.obat_id ?? item.obatId)
    );
    return {
        name: obat?.name || item.item_name || 'Obat',
        price: Number(obat?.price ?? item.price ?? 0)
    };
}

function renderAdditionalBillingObatOptions(filterText = '') {
    const select = document.getElementById('additional-billing-obat-select');
    if (!select || !additionalBillingModalState) return;

    const previousValue = select.value;
    const normalizedFilter = filterText.trim().toLowerCase();
    const options = (additionalBillingModalState.obatList || [])
        .filter(item => !normalizedFilter ||
            String(item.name || '').toLowerCase().includes(normalizedFilter) ||
            String(item.code || '').toLowerCase().includes(normalizedFilter))
        .map(item => `<option value="${Number(item.id)}">${escapeHtml(item.name)}${item.code ? ` (${escapeHtml(item.code)})` : ''} - ${formatRupiah(item.price)}</option>`)
        .join('');

    select.innerHTML = '<option value="">Pilih obat</option>' + options;
    if (previousValue && select.querySelector(`option[value="${previousValue}"]`)) {
        select.value = previousValue;
    }
}

function renderAdditionalBillingTindakanOptions(filterText = '') {
    const select = document.getElementById('additional-billing-tindakan-select');
    if (!select || !additionalBillingModalState) return;

    const previousValue = select.value;
    const normalizedFilter = filterText.trim().toLowerCase();
    const options = (additionalBillingModalState.tindakanList || [])
        .filter(item => !normalizedFilter ||
            String(item.name || '').toLowerCase().includes(normalizedFilter) ||
            String(item.code || '').toLowerCase().includes(normalizedFilter) ||
            String(item.category || '').toLowerCase().includes(normalizedFilter))
        .map(item => `<option value="${Number(item.id)}">${escapeHtml(item.name)}${item.code ? ` (${escapeHtml(item.code)})` : ''} - ${formatRupiah(item.price)}</option>`)
        .join('');

    select.innerHTML = '<option value="">Pilih pelayanan</option>' + options;
    if (previousValue && select.querySelector(`option[value="${previousValue}"]`)) {
        select.value = previousValue;
    }
}

function getAdditionalBillingItemTypeLabel(itemType) {
    if (itemType === 'obat') return 'Obat';
    if (itemType === 'tindakan') return 'Pelayanan';
    return 'Surat/Buku';
}

function renderAdditionalBillingModalItems() {
    const container = document.getElementById('additional-billing-modal-items');
    const totalElement = document.getElementById('additional-billing-modal-total');
    if (!container || !totalElement || !additionalBillingModalState) return;

    const items = additionalBillingModalState.items || [];
    const total = items.reduce((sum, item) => {
        const meta = getAdditionalBillingItemMeta(item);
        return sum + (Number(item.quantity || 0) * meta.price);
    }, 0);

    totalElement.textContent = formatRupiah(total);
    if (items.length === 0) {
        container.innerHTML = '<tr><td colspan="5" class="text-center text-muted">Belum ada item.</td></tr>';
        return;
    }

    container.innerHTML = items.map((item, index) => {
        const meta = getAdditionalBillingItemMeta(item);
        const subtitle = item.item_type === 'obat' && item.caraPakai
            ? `<small class="text-muted d-block">${escapeHtml(item.caraPakai)}</small>`
            : '';
        return `
            <tr>
                <td>
                    ${escapeHtml(meta.name)}
                    ${subtitle}
                </td>
                <td><span class="badge badge-light">${getAdditionalBillingItemTypeLabel(item.item_type)}</span></td>
                <td class="text-center">${Number(item.quantity || 0)}</td>
                <td class="text-right">${formatRupiah(meta.price * Number(item.quantity || 0))}</td>
                <td class="text-center">
                    <button type="button" class="btn btn-sm btn-outline-danger additional-billing-remove-item"
                            data-item-index="${index}" title="Hapus item" aria-label="Hapus item">
                        <i class="fas fa-times"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

function toggleAdditionalBillingPicker() {
    const itemType = document.getElementById('additional-billing-item-type')?.value || 'obat';
    const obatFields = document.getElementById('additional-billing-obat-fields');
    const tindakanFields = document.getElementById('additional-billing-tindakan-fields');
    const addOnFields = document.getElementById('additional-billing-addon-fields');
    if (obatFields) obatFields.style.display = itemType === 'obat' ? '' : 'none';
    if (tindakanFields) tindakanFields.style.display = itemType === 'tindakan' ? '' : 'none';
    if (addOnFields) addOnFields.style.display = itemType === 'admin' ? '' : 'none';
}

function ensureAdditionalBillingEditorModal() {
    let modal = document.getElementById('additional-billing-modal');
    if (!modal) {
        document.body.insertAdjacentHTML('beforeend', `
            <div class="modal fade" id="additional-billing-modal" tabindex="-1" role="dialog" aria-labelledby="additionalBillingModalTitle" aria-hidden="true">
                <div class="modal-dialog modal-lg" role="document">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title" id="additionalBillingModalTitle"><i class="fas fa-plus-circle mr-2"></i>Tagihan Tambahan</h5>
                            <button type="button" class="close" data-dismiss="modal" aria-label="Tutup"><span aria-hidden="true">&times;</span></button>
                        </div>
                        <div class="modal-body">
                            <div id="additional-billing-modal-error" class="alert alert-danger" style="display:none;"></div>
                            <div class="row">
                                <div class="col-md-4">
                                    <div class="form-group">
                                        <label for="additional-billing-item-type">Jenis</label>
                                        <select id="additional-billing-item-type" class="form-control">
                                            <option value="obat">Obat</option>
                                            <option value="tindakan">Pelayanan</option>
                                            <option value="admin">Surat / Buku</option>
                                        </select>
                                    </div>
                            </div>
                                <div class="col-md-2">
                                    <div class="form-group">
                                        <label for="additional-billing-item-quantity">Jumlah</label>
                                        <input id="additional-billing-item-quantity" class="form-control" type="number" min="1" max="1000" value="1">
                                    </div>
                                </div>
                                <div class="col-md-6 d-flex align-items-end pb-3">
                                    <button type="button" class="btn btn-outline-primary btn-block" id="additional-billing-add-item">
                                        <i class="fas fa-plus mr-1"></i>Tambah Item
                                    </button>
                                </div>
                            </div>
                            <div id="additional-billing-obat-fields">
                                <div class="row">
                                    <div class="col-md-4">
                                        <div class="form-group">
                                            <label for="additional-billing-obat-search">Cari Obat</label>
                                            <input id="additional-billing-obat-search" class="form-control" type="search" placeholder="Nama atau kode obat">
                                        </div>
                                    </div>
                                    <div class="col-md-8">
                                        <div class="form-group">
                                            <label for="additional-billing-obat-select">Obat</label>
                                            <select id="additional-billing-obat-select" class="form-control"></select>
                                        </div>
                                    </div>
                                </div>
                                <div class="row">
                                    <div class="col-md-6">
                                        <div class="form-group">
                                            <label for="additional-billing-cara-pakai">Aturan Pakai</label>
                                            <input id="additional-billing-cara-pakai" class="form-control" type="text" maxlength="500">
                                        </div>
                                    </div>
                                    <div class="col-md-6">
                                        <div class="form-group">
                                            <label for="additional-billing-latin-sig">Signa Latin</label>
                                            <input id="additional-billing-latin-sig" class="form-control" type="text" maxlength="500">
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div id="additional-billing-tindakan-fields" style="display:none;">
                                <div class="row">
                                    <div class="col-md-4">
                                        <div class="form-group">
                                            <label for="additional-billing-tindakan-search">Cari Pelayanan</label>
                                            <input id="additional-billing-tindakan-search" class="form-control" type="search" placeholder="Nama, kode, atau kategori">
                                        </div>
                                    </div>
                                    <div class="col-md-8">
                                        <div class="form-group">
                                            <label for="additional-billing-tindakan-select">Pelayanan</label>
                                            <select id="additional-billing-tindakan-select" class="form-control"></select>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div id="additional-billing-addon-fields" style="display:none;">
                                <div class="form-group">
                                    <label for="additional-billing-addon-select">Surat / Buku</label>
                                    <select id="additional-billing-addon-select" class="form-control">
                                        ${ADDITIONAL_BILLING_ADD_ONS.map(item => `<option value="${item.code}">${escapeHtml(item.name)} - ${formatRupiah(item.price)}</option>`).join('')}
                                    </select>
                                </div>
                            </div>
                            <div class="table-responsive mt-3">
                                <table class="table table-sm table-bordered mb-1">
                                    <thead class="thead-light">
                                        <tr>
                                            <th>Item</th>
                                            <th>Jenis</th>
                                            <th class="text-center">Qty</th>
                                            <th class="text-right">Total</th>
                                            <th style="text-align: center !important; vertical-align: middle !important; width: 54px; min-width: 54px;">Aksi</th>
                                        </tr>
                                    </thead>
                                    <tbody id="additional-billing-modal-items"></tbody>
                                    <tfoot>
                                        <tr class="font-weight-bold">
                                            <td colspan="3" class="text-right">TOTAL</td>
                                            <td class="text-right" id="additional-billing-modal-total">Rp 0</td>
                                            <td></td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-dismiss="modal">Batal</button>
                            <button type="button" class="btn btn-primary" id="additional-billing-save-draft"><i class="fas fa-save mr-1"></i>Simpan Draft</button>
                        </div>
                    </div>
                </div>
            </div>
        `);
        modal = document.getElementById('additional-billing-modal');
    }

    if (modal.dataset.bound === '1') return modal;
    modal.dataset.bound = '1';

    document.getElementById('additional-billing-item-type')?.addEventListener('change', toggleAdditionalBillingPicker);
    document.getElementById('additional-billing-obat-search')?.addEventListener('input', event => {
        renderAdditionalBillingObatOptions(event.target.value || '');
    });
    document.getElementById('additional-billing-tindakan-search')?.addEventListener('input', event => {
        renderAdditionalBillingTindakanOptions(event.target.value || '');
    });
    document.getElementById('additional-billing-add-item')?.addEventListener('click', () => {
        if (!additionalBillingModalState) return;
        const itemType = document.getElementById('additional-billing-item-type')?.value || 'obat';
        const quantity = Number(document.getElementById('additional-billing-item-quantity')?.value || 0);
        if (!Number.isInteger(quantity) || quantity <= 0 || quantity > 1000) {
            setAdditionalBillingModalError('Jumlah item harus berupa angka bulat antara 1 dan 1000.');
            return;
        }

        if (itemType === 'obat') {
            const obatId = Number(document.getElementById('additional-billing-obat-select')?.value || 0);
            const obat = additionalBillingModalState.obatList.find(item => Number(item.id) === obatId);
            if (!obat) {
                setAdditionalBillingModalError('Pilih obat terlebih dahulu.');
                return;
            }
            additionalBillingModalState.items.push({
                item_type: 'obat',
                obat_id: obat.id,
                item_name: obat.name,
                price: Number(obat.price || 0),
                quantity,
                caraPakai: document.getElementById('additional-billing-cara-pakai')?.value || '',
                latinSig: document.getElementById('additional-billing-latin-sig')?.value || ''
            });
        } else if (itemType === 'tindakan') {
            const tindakanId = Number(document.getElementById('additional-billing-tindakan-select')?.value || 0);
            const tindakan = additionalBillingModalState.tindakanList.find(item => Number(item.id) === tindakanId);
            if (!tindakan) {
                setAdditionalBillingModalError('Pilih pelayanan terlebih dahulu.');
                return;
            }
            additionalBillingModalState.items.push({
                item_type: 'tindakan',
                tindakan_id: tindakan.id,
                item_code: tindakan.code,
                item_name: tindakan.name,
                price: Number(tindakan.price || 0),
                quantity
            });
        } else {
            const code = document.getElementById('additional-billing-addon-select')?.value || '';
            const addOn = ADDITIONAL_BILLING_ADD_ONS.find(item => item.code === code);
            if (!addOn) {
                setAdditionalBillingModalError('Pilih surat atau buku terlebih dahulu.');
                return;
            }
            additionalBillingModalState.items.push({
                item_type: 'admin',
                item_code: addOn.code,
                item_name: addOn.name,
                price: addOn.price,
                quantity
            });
        }

        setAdditionalBillingModalError('');
        document.getElementById('additional-billing-item-quantity').value = '1';
        renderAdditionalBillingModalItems();
    });

    document.getElementById('additional-billing-modal-items')?.addEventListener('click', event => {
        const button = event.target.closest('.additional-billing-remove-item');
        if (!button || !additionalBillingModalState) return;
        const index = Number(button.dataset.itemIndex);
        if (!Number.isInteger(index)) return;
        additionalBillingModalState.items.splice(index, 1);
        renderAdditionalBillingModalItems();
    });

    document.getElementById('additional-billing-save-draft')?.addEventListener('click', async function() {
        if (!additionalBillingModalState) return;
        if (additionalBillingModalState.items.length === 0) {
            setAdditionalBillingModalError('Tambahkan minimal satu item.');
            return;
        }

        const token = getAdditionalBillingToken();
        if (!token) return;
        const isEditing = !!additionalBillingModalState.additionalBillingId;
        const endpoint = isEditing
            ? `/api/sunday-clinic/billing/${additionalBillingModalState.mrId}/additional/${additionalBillingModalState.additionalBillingId}`
            : `/api/sunday-clinic/billing/${additionalBillingModalState.mrId}/additional`;

        try {
            this.disabled = true;
            this.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>Menyimpan';
            setAdditionalBillingModalError('');
            const response = await fetch(endpoint, {
                method: isEditing ? 'PUT' : 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ items: additionalBillingModalState.items })
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok || !result.success) {
                throw new Error(result.message || 'Gagal menyimpan tagihan tambahan.');
            }

            hideModal(modal);
            window.showSuccess?.(result.message || 'Tagihan tambahan disimpan.');
            refreshBillingSection();
        } catch (error) {
            setAdditionalBillingModalError(error.message || 'Gagal menyimpan tagihan tambahan.');
        } finally {
            this.disabled = false;
            this.innerHTML = '<i class="fas fa-save mr-1"></i>Simpan Draft';
        }
    });

    return modal;
}

async function openAdditionalBillingEditor(billing = null) {
    const mrId = window.routeMrSlug;
    const token = getAdditionalBillingToken();
    if (!mrId || !token) return;

    const modal = ensureAdditionalBillingEditorModal();
    additionalBillingModalState = {
        mrId,
        additionalBillingId: billing?.id || null,
        items: (billing?.items || []).map(item => ({
            item_type: item.item_type,
            obat_id: item.item_data?.obatId,
            tindakan_id: item.item_data?.tindakanId,
            item_code: item.item_code,
            item_name: item.item_name,
            price: Number(item.price || 0),
            quantity: Number(item.quantity || 1),
            caraPakai: item.item_data?.caraPakai || item.item_data?.cara_pakai || '',
            latinSig: item.item_data?.latinSig || item.item_data?.latin_sig || ''
        })),
        obatList: [],
        tindakanList: []
    };

    document.getElementById('additionalBillingModalTitle').innerHTML = billing
        ? '<i class="fas fa-edit mr-2"></i>Ubah Tagihan Tambahan'
        : '<i class="fas fa-plus-circle mr-2"></i>Tagihan Tambahan';
    document.getElementById('additional-billing-obat-search').value = '';
    document.getElementById('additional-billing-tindakan-search').value = '';
    document.getElementById('additional-billing-item-type').value = 'obat';
    toggleAdditionalBillingPicker();
    setAdditionalBillingModalError('');
    renderAdditionalBillingModalItems();
    showModal(modal);

    try {
        const [obatResponse, tindakanResponse] = await Promise.all([
            fetch('/api/obat?active=true', {
                headers: { 'Authorization': `Bearer ${token}` }
            }),
            fetch('/api/tindakan?active=true', {
                headers: { 'Authorization': `Bearer ${token}` }
            })
        ]);
        const [obatResult, tindakanResult] = await Promise.all([
            obatResponse.json().catch(() => ({})),
            tindakanResponse.json().catch(() => ({}))
        ]);
        if (!obatResponse.ok || !obatResult.success) {
            throw new Error(obatResult.message || 'Gagal memuat daftar obat.');
        }
        if (!tindakanResponse.ok || !tindakanResult.success) {
            throw new Error(tindakanResult.message || 'Gagal memuat daftar pelayanan.');
        }
        additionalBillingModalState.obatList = Array.isArray(obatResult.data) ? obatResult.data : [];
        additionalBillingModalState.tindakanList = (Array.isArray(tindakanResult.data) ? tindakanResult.data : [])
            .filter(item => String(item.category || '').trim().toUpperCase() !== 'ADMINISTRATIF');
        renderAdditionalBillingObatOptions();
        renderAdditionalBillingTindakanOptions();
        renderAdditionalBillingModalItems();
    } catch (error) {
        setAdditionalBillingModalError(error.message || 'Gagal memuat katalog tagihan tambahan.');
    }
}

function ensureAdditionalBillingPaymentModal() {
    let modal = document.getElementById('additional-billing-payment-modal');
    if (!modal) {
        document.body.insertAdjacentHTML('beforeend', `
            <div class="modal fade" id="additional-billing-payment-modal" tabindex="-1" role="dialog" aria-labelledby="additionalBillingPaymentModalTitle" aria-hidden="true">
                <div class="modal-dialog" role="document">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title" id="additionalBillingPaymentModalTitle"><i class="fas fa-money-bill-wave mr-2"></i>Catat Pembayaran</h5>
                            <button type="button" class="close" data-dismiss="modal" aria-label="Tutup"><span aria-hidden="true">&times;</span></button>
                        </div>
                        <div class="modal-body">
                            <div id="additional-billing-payment-error" class="alert alert-danger" style="display:none;"></div>
                            <div class="form-group">
                                <label for="additional-billing-payment-method">Metode Pembayaran</label>
                                <select id="additional-billing-payment-method" class="form-control">
                                    <option value="cash">Tunai</option>
                                    <option value="debit">Debit</option>
                                    <option value="transfer">Transfer</option>
                                </select>
                            </div>
                            <div class="form-group mb-0">
                                <label for="additional-billing-payment-notes">Catatan</label>
                                <textarea id="additional-billing-payment-notes" class="form-control" rows="3" maxlength="2000"></textarea>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-dismiss="modal">Batal</button>
                            <button type="button" class="btn btn-primary" id="additional-billing-payment-save"><i class="fas fa-check mr-1"></i>Tandai Lunas</button>
                        </div>
                    </div>
                </div>
            </div>
        `);
        modal = document.getElementById('additional-billing-payment-modal');
    }

    if (modal.dataset.bound === '1') return modal;
    modal.dataset.bound = '1';
    document.getElementById('additional-billing-payment-save')?.addEventListener('click', async function() {
        if (!additionalBillingPaymentState) return;
        const token = getAdditionalBillingToken();
        if (!token) return;

        const errorElement = document.getElementById('additional-billing-payment-error');
        try {
            this.disabled = true;
            this.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>Memproses';
            errorElement.style.display = 'none';
            const response = await fetch(
                `/api/sunday-clinic/billing/${additionalBillingPaymentState.mrId}/additional/${additionalBillingPaymentState.additionalBillingId}/mark-paid`,
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        payment_method: document.getElementById('additional-billing-payment-method').value,
                        notes: document.getElementById('additional-billing-payment-notes').value
                    })
                }
            );
            const result = await response.json().catch(() => ({}));
            if (!response.ok || !result.success) {
                throw new Error(result.message || 'Gagal mencatat pembayaran tagihan tambahan.');
            }

            hideModal(modal);
            window.showSuccess?.(result.message || 'Pembayaran tagihan tambahan dicatat.');
            refreshBillingSection();
        } catch (error) {
            errorElement.textContent = error.message || 'Gagal mencatat pembayaran tagihan tambahan.';
            errorElement.style.display = 'block';
        } finally {
            this.disabled = false;
            this.innerHTML = '<i class="fas fa-check mr-1"></i>Tandai Lunas';
        }
    });

    return modal;
}

function openAdditionalBillingPaymentModal(billing) {
    const mrId = window.routeMrSlug;
    if (!mrId || !billing?.id) return;
    const modal = ensureAdditionalBillingPaymentModal();
    additionalBillingPaymentState = { mrId, additionalBillingId: billing.id };
    document.getElementById('additional-billing-payment-method').value = 'cash';
    document.getElementById('additional-billing-payment-notes').value = '';
    const errorElement = document.getElementById('additional-billing-payment-error');
    errorElement.style.display = 'none';
    showModal(modal);
}

async function runAdditionalBillingAction(action, billing) {
    const mrId = window.routeMrSlug;
    const token = getAdditionalBillingToken();
    if (!mrId || !token || !billing?.id) return;

    if (action === 'edit') {
        await openAdditionalBillingEditor(billing);
        return;
    }
    if (action === 'mark-paid') {
        openAdditionalBillingPaymentModal(billing);
        return;
    }

    const requiresConfirmation = action === 'confirm';
    if (requiresConfirmation && !window.confirm(`Konfirmasi tagihan tambahan ${billing.reference_number}?`)) {
        return;
    }

    const endpointSuffix = {
        confirm: 'confirm',
        'print-invoice': 'print-invoice',
        'print-etiket': 'print-etiket'
    }[action];
    if (!endpointSuffix) return;

    try {
        const response = await fetch(
            `/api/sunday-clinic/billing/${mrId}/additional/${billing.id}/${endpointSuffix}`,
            {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            }
        );
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.success) {
            throw new Error(result.message || 'Gagal memproses tagihan tambahan.');
        }

        if (result.downloadUrl) {
            window.open(result.downloadUrl, '_blank');
        }
        window.showSuccess?.(result.message || 'Tagihan tambahan berhasil diproses.');
        refreshBillingSection();
    } catch (error) {
        window.showError?.(error.message || 'Gagal memproses tagihan tambahan.');
    }
}

function getAdditionalBillingStatusBadge(status) {
    if (status === 'confirmed') return '<span class="badge badge-success">Dikonfirmasi</span>';
    if (status === 'paid') return '<span class="badge badge-primary">Lunas</span>';
    return '<span class="badge badge-warning">Draft</span>';
}

function renderAdditionalBillingPanel(additionalBillings) {
    const rows = additionalBillings.map(billing => {
        const items = Array.isArray(billing.items) ? billing.items : [];
        const itemSummary = items.map(item => `${item.item_name || '-'} x${Number(item.quantity || 0)}`).join(', ');
        const hasObat = items.some(item => item.item_type === 'obat' && Number(item.quantity || 0) > 0);
        const actionButtons = [];

        if (billing.status === 'draft') {
            actionButtons.push(`<button type="button" class="btn btn-sm btn-outline-primary" data-additional-billing-action="edit" data-additional-billing-id="${billing.id}" title="Ubah draft" aria-label="Ubah draft"><i class="fas fa-edit"></i></button>`);
            actionButtons.push(`<button type="button" class="btn btn-sm btn-outline-success" data-additional-billing-action="confirm" data-additional-billing-id="${billing.id}" title="Konfirmasi tagihan" aria-label="Konfirmasi tagihan"><i class="fas fa-check"></i></button>`);
        } else if (billing.status === 'confirmed') {
            actionButtons.push(`<button type="button" class="btn btn-sm btn-outline-primary" data-additional-billing-action="mark-paid" data-additional-billing-id="${billing.id}" title="Tandai lunas" aria-label="Tandai lunas"><i class="fas fa-money-bill-wave"></i></button>`);
        }

        if (billing.status === 'confirmed' || billing.status === 'paid') {
            actionButtons.push(`<button type="button" class="btn btn-sm btn-outline-success" data-additional-billing-action="print-invoice" data-additional-billing-id="${billing.id}" title="Cetak invoice" aria-label="Cetak invoice"><i class="fas fa-receipt"></i></button>`);
            if (hasObat) {
                actionButtons.push(`<button type="button" class="btn btn-sm btn-outline-secondary" data-additional-billing-action="print-etiket" data-additional-billing-id="${billing.id}" title="Cetak etiket" aria-label="Cetak etiket"><i class="fas fa-tag"></i></button>`);
            }
        }

        return `
            <tr>
                <td data-label="Referensi"><div class="additional-billing-value"><strong>${escapeHtml(billing.reference_number || '-')}</strong><small class="d-block text-muted">${escapeHtml(formatDateTime(billing.created_at))}</small></div></td>
                <td data-label="Item"><div class="additional-billing-value" title="${escapeHtml(itemSummary)}">${escapeHtml(itemSummary || '-')}</div></td>
                <td data-label="Total" class="text-right font-weight-bold"><div class="additional-billing-value">${formatRupiah(billing.total)}</div></td>
                <td data-label="Status" class="text-center"><div class="additional-billing-value">${getAdditionalBillingStatusBadge(billing.status)}</div></td>
                <td data-label="Aksi" style="text-align: center !important; vertical-align: middle !important; white-space: nowrap;"><div class="additional-billing-value additional-billing-actions">${actionButtons.join(' ')}</div></td>
            </tr>
        `;
    }).join('');

    const billingContent = rows ? `
        <div class="table-responsive">
            <table class="table table-sm table-bordered mb-0 additional-billing-table">
                <thead class="thead-light">
                    <tr>
                        <th>Referensi</th>
                        <th>Item</th>
                        <th class="text-right">Total</th>
                        <th style="text-align: center !important; vertical-align: middle !important; width: 116px; min-width: 116px;">Status</th>
                        <th style="text-align: center !important; vertical-align: middle !important; width: 150px; min-width: 150px;">Aksi</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        </div>
    ` : `
        <div class="additional-billing-empty">
            <i class="fas fa-receipt" aria-hidden="true"></i>
            <span>Belum ada tagihan tambahan.</span>
        </div>
    `;

    return `
        <section class="pt-4 mt-4 border-top" id="additional-billing-panel">
            <div class="d-flex justify-content-between align-items-center mb-3">
                <h5 class="mb-0"><i class="fas fa-plus-circle text-primary mr-2"></i>Tagihan Tambahan</h5>
                <button type="button" class="btn btn-primary btn-sm" id="btn-create-additional-billing">
                    <i class="fas fa-plus mr-1"></i>Buat Tagihan Tambahan
                </button>
            </div>
            ${billingContent}
        </section>
    `;
}

export default {
    /**
     * Render the Billing form
     */
    async render(state) {
        const record = state.recordData || {};
        const category = record?.mrCategory || record?.mr_category || 'obstetri';

        // Use obstetri format for all categories (as per user request)
        // Tagihan is the same across obstetri, gyn_repro, gyn_special
        return await this.renderObstetriFormat(state);

        /* Disabled: Use new detailed format for other categories
        const billing = state.billingData || state.recordData?.billing || {};
        const items = billing.items || [];

        return `
            <div class="card mb-3">
                <div class="card-header bg-danger text-white">
                    <h5 class="mb-0">
                        <i class="fas fa-file-invoice-dollar"></i> Tagihan / Billing
                    </h5>
                </div>
                <div class="card-body">
                    <!-- Billing Items Section -->
                    ${this.renderBillingItems(items)}

                    <hr>

                    <!-- Total Calculation Section -->
                    ${this.renderTotalCalculation(billing)}

                    <hr>

                    <!-- Payment Information Section -->
                    ${this.renderPaymentInformation(billing)}

                    <hr>

                    <!-- Invoice Actions Section -->
                    ${this.renderInvoiceActions(billing, state)}
                </div>
            </div>

            <script>
                window.billingItemCounter = ${items.length};

                // Add Billing Item
                window.addBillingItem = function() {
                    const index = window.billingItemCounter++;
                    const html = \`
                        <tr class="billing-item-row" data-index="\${index}">
                            <td>
                                <select class="form-control form-control-sm" name="billing_items[\${index}][category]"
                                        onchange="window.updateBillingCategory(\${index})">
                                    <option value="">-- Pilih --</option>
                                    <option value="konsultasi">Konsultasi</option>
                                    <option value="tindakan">Tindakan</option>
                                    <option value="usg">USG</option>
                                    <option value="lab">Pemeriksaan Lab</option>
                                    <option value="obat">Obat</option>
                                    <option value="lainnya">Lainnya</option>
                                </select>
                            </td>
                            <td>
                                <input type="text" class="form-control form-control-sm" name="billing_items[\${index}][description]"
                                       placeholder="Deskripsi item" required>
                            </td>
                            <td>
                                <input type="number" class="form-control form-control-sm text-center" name="billing_items[\${index}][quantity]"
                                       value="1" min="1" onchange="window.calculateBillingTotal()">
                            </td>
                            <td>
                                <input type="number" class="form-control form-control-sm text-right" name="billing_items[\${index}][price]"
                                       placeholder="0" min="0" step="1000" onchange="window.calculateBillingTotal()">
                            </td>
                            <td class="text-right">
                                <span class="item-subtotal">Rp 0</span>
                            </td>
                            <td class="text-center">
                                <button type="button" class="btn btn-danger btn-sm"
                                        onclick="window.removeBillingItem(\${index})">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </td>
                        </tr>
                    \`;
                    document.querySelector('#billing-items-table tbody').insertAdjacentHTML('beforeend', html);
                    window.calculateBillingTotal();
                };

                window.removeBillingItem = function(index) {
                    const row = document.querySelector(\`.billing-item-row[data-index="\${index}"]\`);
                    if (row) row.remove();
                    window.calculateBillingTotal();
                };

                window.updateBillingCategory = function(index) {
                    // Optional: Auto-fill prices based on category
                    // This could be integrated with a price list from backend
                };

                // Calculate Total
                window.calculateBillingTotal = function() {
                    let subtotal = 0;

                    document.querySelectorAll('.billing-item-row').forEach(row => {
                        const index = row.dataset.index;
                        const quantity = parseFloat(document.querySelector(\`[name="billing_items[\${index}][quantity]"]\`)?.value) || 0;
                        const price = parseFloat(document.querySelector(\`[name="billing_items[\${index}][price]"]\`)?.value) || 0;
                        const itemSubtotal = quantity * price;

                        // Update item subtotal display
                        const subtotalElement = row.querySelector('.item-subtotal');
                        if (subtotalElement) {
                            subtotalElement.textContent = 'Rp ' + Math.round(itemSubtotal).toLocaleString('id-ID', { maximumFractionDigits: 0 });
                        }

                        subtotal += itemSubtotal;
                    });

                    // Update subtotal
                    document.getElementById('billing-subtotal').textContent = 'Rp ' + Math.round(subtotal).toLocaleString('id-ID', { maximumFractionDigits: 0 });

                    // Calculate discount
                    const discountType = document.querySelector('[name="discount_type"]')?.value || 'none';
                    const discountValue = parseFloat(document.querySelector('[name="discount_value"]')?.value) || 0;
                    let discount = 0;

                    if (discountType === 'percentage') {
                        discount = (subtotal * discountValue) / 100;
                    } else if (discountType === 'fixed') {
                        discount = discountValue;
                    }

                    document.getElementById('billing-discount').textContent = 'Rp ' + Math.round(discount).toLocaleString('id-ID', { maximumFractionDigits: 0 });

                    // Calculate tax (if applicable)
                    const taxRate = parseFloat(document.querySelector('[name="tax_rate"]')?.value) || 0;
                    const afterDiscount = subtotal - discount;
                    const tax = (afterDiscount * taxRate) / 100;

                    document.getElementById('billing-tax').textContent = 'Rp ' + Math.round(tax).toLocaleString('id-ID', { maximumFractionDigits: 0 });

                    // Calculate grand total
                    const grandTotal = afterDiscount + tax;
                    document.getElementById('billing-grand-total').textContent = 'Rp ' + Math.round(grandTotal).toLocaleString('id-ID', { maximumFractionDigits: 0 });

                    // Update payment calculation
                    window.calculatePaymentBalance();
                };

                // Calculate Payment Balance
                window.calculatePaymentBalance = function() {
                    const grandTotalText = document.getElementById('billing-grand-total')?.textContent || 'Rp 0';
                    const grandTotal = parseFloat(grandTotalText.replace(/[^0-9]/g, '')) || 0;
                    const amountPaid = parseFloat(document.querySelector('[name="amount_paid"]')?.value) || 0;
                    const balance = grandTotal - amountPaid;

                    const balanceElement = document.getElementById('payment-balance');
                    if (balanceElement) {
                        balanceElement.textContent = 'Rp ' + Math.round(balance).toLocaleString('id-ID', { maximumFractionDigits: 0 });
                        if (balance > 0) {
                            balanceElement.className = 'text-danger font-weight-bold';
                        } else if (balance === 0) {
                            balanceElement.className = 'text-success font-weight-bold';
                        } else {
                            balanceElement.className = 'text-warning font-weight-bold';
                        }
                    }

                    // Update payment status
                    const statusElement = document.querySelector('[name="payment_status"]');
                    if (statusElement && !statusElement.disabled) {
                        if (balance === 0 && grandTotal > 0) {
                            statusElement.value = 'paid';
                        } else if (amountPaid > 0 && balance > 0) {
                            statusElement.value = 'partial';
                        } else {
                            statusElement.value = 'unpaid';
                        }
                    }
                };

                // Initialize calculations
                window.calculateBillingTotal();

                // Attach event listeners
                document.querySelector('[name="discount_type"]')?.addEventListener('change', window.calculateBillingTotal);
                document.querySelector('[name="discount_value"]')?.addEventListener('input', window.calculateBillingTotal);
                document.querySelector('[name="tax_rate"]')?.addEventListener('input', window.calculateBillingTotal);
                document.querySelector('[name="amount_paid"]')?.addEventListener('input', window.calculatePaymentBalance);
            </script>
        `;
    */
    },

    /**
     * Render Billing Items section
     */
    renderBillingItems(items) {
        return `
            <div class="form-section">
                <h6 class="text-primary mb-3">
                    <i class="fas fa-list"></i> Daftar Item Tagihan
                </h6>

                <div class="table-responsive">
                    <table class="table table-bordered table-sm" id="billing-items-table">
                        <thead class="thead-light">
                            <tr>
                                <th width="15%">Kategori</th>
                                <th width="35%">Deskripsi</th>
                                <th width="10%" class="text-center">Qty</th>
                                <th width="15%" class="text-right">Harga Satuan</th>
                                <th width="15%" class="text-right">Subtotal</th>
                                <th width="10%" class="text-center">Aksi</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${this.renderBillingItemsRows(items)}
                        </tbody>
                    </table>
                </div>

                <button type="button" class="btn btn-sm btn-outline-primary" onclick="window.addBillingItem()">
                    <i class="fas fa-plus"></i> Tambah Item
                </button>

                <div class="mt-3">
                    <small class="text-muted">
                        <strong>Note:</strong> Obat yang diresepkan di bagian "Rencana Tatalaksana" dapat ditambahkan di sini sebagai item billing.
                    </small>
                </div>
            </div>
        `;
    },

    /**
     * Render Billing Items rows
     */
    renderBillingItemsRows(items) {
        if (!items || items.length === 0) {
            return `
                <tr>
                    <td colspan="6" class="text-center text-muted">
                        Belum ada item tagihan. Klik "Tambah Item" untuk menambahkan.
                    </td>
                </tr>
            `;
        }

        return items.map((item, index) => {
            const quantity = item.quantity || 1;
            const price = item.price || 0;
            const subtotal = quantity * price;

            return `
                <tr class="billing-item-row" data-index="${index}">
                    <td>
                        <select class="form-control form-control-sm" name="billing_items[${index}][category]"
                                onchange="window.updateBillingCategory(${index})">
                            <option value="">-- Pilih --</option>
                            <option value="konsultasi" ${item.category === 'konsultasi' ? 'selected' : ''}>Konsultasi</option>
                            <option value="tindakan" ${item.category === 'tindakan' ? 'selected' : ''}>Tindakan</option>
                            <option value="usg" ${item.category === 'usg' ? 'selected' : ''}>USG</option>
                            <option value="lab" ${item.category === 'lab' ? 'selected' : ''}>Pemeriksaan Lab</option>
                            <option value="obat" ${item.category === 'obat' ? 'selected' : ''}>Obat</option>
                            <option value="lainnya" ${item.category === 'lainnya' ? 'selected' : ''}>Lainnya</option>
                        </select>
                    </td>
                    <td>
                        <input type="text" class="form-control form-control-sm" name="billing_items[${index}][description]"
                               value="${item.description || ''}"
                               placeholder="Deskripsi item" required>
                    </td>
                    <td>
                        <input type="number" class="form-control form-control-sm text-center" name="billing_items[${index}][quantity]"
                               value="${quantity}" min="1" onchange="window.calculateBillingTotal()">
                    </td>
                    <td>
                        <input type="number" class="form-control form-control-sm text-right" name="billing_items[${index}][price]"
                               value="${price}" min="0" step="1000" onchange="window.calculateBillingTotal()">
                    </td>
                    <td class="text-right">
                        <span class="item-subtotal">Rp ${Math.round(subtotal).toLocaleString('id-ID', { maximumFractionDigits: 0 })}</span>
                    </td>
                    <td class="text-center">
                        <button type="button" class="btn btn-danger btn-sm"
                                onclick="window.removeBillingItem(${index})">
                            <i class="fas fa-trash"></i>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    },

    /**
     * Render Total Calculation section
     */
    renderTotalCalculation(billing) {
        const subtotal = this.calculateSubtotal(billing.items || []);
        const discountType = billing.discount_type || 'none';
        const discountValue = billing.discount_value || 0;
        const taxRate = billing.tax_rate || 0;

        let discount = 0;
        if (discountType === 'percentage') {
            discount = (subtotal * discountValue) / 100;
        } else if (discountType === 'fixed') {
            discount = discountValue;
        }

        const afterDiscount = subtotal - discount;
        const tax = (afterDiscount * taxRate) / 100;
        const grandTotal = afterDiscount + tax;

        return `
            <div class="form-section">
                <h6 class="text-primary mb-3">
                    <i class="fas fa-calculator"></i> Perhitungan Total
                </h6>

                <div class="row">
                    <div class="col-md-6">
                        <div class="form-group">
                            <label>Tipe Diskon:</label>
                            <select class="form-control" name="discount_type">
                                <option value="none" ${discountType === 'none' ? 'selected' : ''}>Tidak ada diskon</option>
                                <option value="percentage" ${discountType === 'percentage' ? 'selected' : ''}>Persentase (%)</option>
                                <option value="fixed" ${discountType === 'fixed' ? 'selected' : ''}>Nominal (Rp)</option>
                            </select>
                        </div>
                    </div>

                    <div class="col-md-6">
                        <div class="form-group">
                            <label>Nilai Diskon:</label>
                            <input type="number" class="form-control" name="discount_value"
                                   value="${discountValue}" min="0" step="0.01"
                                   placeholder="Masukkan nilai diskon">
                        </div>
                    </div>
                </div>

                <div class="row">
                    <div class="col-md-6">
                        <div class="form-group">
                            <label>Pajak (%):</label>
                            <input type="number" class="form-control" name="tax_rate"
                                   value="${taxRate}" min="0" max="100" step="0.1"
                                   placeholder="Contoh: 10 untuk PPN 10%">
                            <small class="text-muted">Kosongkan jika tidak ada pajak</small>
                        </div>
                    </div>
                </div>

                <hr>

                <div class="row">
                    <div class="col-md-8 text-right">
                        <strong>Subtotal:</strong>
                    </div>
                    <div class="col-md-4 text-right">
                        <span id="billing-subtotal" class="h6">Rp ${Math.round(subtotal).toLocaleString('id-ID', { maximumFractionDigits: 0 })}</span>
                    </div>
                </div>

                <div class="row mt-2">
                    <div class="col-md-8 text-right">
                        <strong>Diskon:</strong>
                    </div>
                    <div class="col-md-4 text-right">
                        <span id="billing-discount" class="text-danger">Rp ${Math.round(discount).toLocaleString('id-ID', { maximumFractionDigits: 0 })}</span>
                    </div>
                </div>

                <div class="row mt-2">
                    <div class="col-md-8 text-right">
                        <strong>Pajak:</strong>
                    </div>
                    <div class="col-md-4 text-right">
                        <span id="billing-tax">Rp ${Math.round(tax).toLocaleString('id-ID', { maximumFractionDigits: 0 })}</span>
                    </div>
                </div>

                <hr>

                <div class="row">
                    <div class="col-md-8 text-right">
                        <strong class="h5">TOTAL:</strong>
                    </div>
                    <div class="col-md-4 text-right">
                        <span id="billing-grand-total" class="h4 text-primary font-weight-bold">
                            Rp ${Math.round(grandTotal).toLocaleString('id-ID', { maximumFractionDigits: 0 })}
                        </span>
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * Calculate subtotal from items
     */
    calculateSubtotal(items) {
        if (!items || items.length === 0) return 0;

        return items.reduce((total, item) => {
            const quantity = item.quantity || 1;
            const price = item.price || 0;
            return total + (quantity * price);
        }, 0);
    },

    /**
     * Render Payment Information section
     */
    renderPaymentInformation(billing) {
        const paymentStatus = billing.payment_status || 'unpaid';
        const paymentMethod = billing.payment_method || '';
        const amountPaid = billing.amount_paid || 0;
        const paymentDate = billing.payment_date || '';
        const paymentNotes = billing.payment_notes || '';

        // Calculate balance
        const subtotal = this.calculateSubtotal(billing.items || []);
        const discountType = billing.discount_type || 'none';
        const discountValue = billing.discount_value || 0;
        const taxRate = billing.tax_rate || 0;

        let discount = 0;
        if (discountType === 'percentage') {
            discount = (subtotal * discountValue) / 100;
        } else if (discountType === 'fixed') {
            discount = discountValue;
        }

        const afterDiscount = subtotal - discount;
        const tax = (afterDiscount * taxRate) / 100;
        const grandTotal = afterDiscount + tax;
        const balance = grandTotal - amountPaid;

        let balanceClass = 'text-danger';
        if (balance === 0) balanceClass = 'text-success';
        else if (balance < 0) balanceClass = 'text-warning';

        return `
            <div class="form-section">
                <h6 class="text-primary mb-3">
                    <i class="fas fa-money-bill-wave"></i> Informasi Pembayaran
                </h6>

                <div class="row">
                    <div class="col-md-6">
                        <div class="form-group">
                            <label>Status Pembayaran:</label>
                            <select class="form-control" name="payment_status">
                                <option value="unpaid" ${paymentStatus === 'unpaid' ? 'selected' : ''}>
                                    Belum Dibayar
                                </option>
                                <option value="partial" ${paymentStatus === 'partial' ? 'selected' : ''}>
                                    Dibayar Sebagian
                                </option>
                                <option value="paid" ${paymentStatus === 'paid' ? 'selected' : ''}>
                                    Lunas
                                </option>
                            </select>
                        </div>
                    </div>

                    <div class="col-md-6">
                        <div class="form-group">
                            <label>Metode Pembayaran:</label>
                            <select class="form-control" name="payment_method">
                                <option value="">-- Pilih --</option>
                                <option value="cash" ${paymentMethod === 'cash' ? 'selected' : ''}>Tunai (Cash)</option>
                                <option value="debit" ${paymentMethod === 'debit' ? 'selected' : ''}>Kartu Debit</option>
                                <option value="credit" ${paymentMethod === 'credit' ? 'selected' : ''}>Kartu Kredit</option>
                                <option value="transfer" ${paymentMethod === 'transfer' ? 'selected' : ''}>Transfer Bank</option>
                                <option value="e_wallet" ${paymentMethod === 'e_wallet' ? 'selected' : ''}>E-Wallet (OVO, GoPay, dll)</option>
                                <option value="insurance" ${paymentMethod === 'insurance' ? 'selected' : ''}>Asuransi</option>
                                <option value="other" ${paymentMethod === 'other' ? 'selected' : ''}>Lainnya</option>
                            </select>
                        </div>
                    </div>
                </div>

                <div class="row">
                    <div class="col-md-6">
                        <div class="form-group">
                            <label>Jumlah Dibayar:</label>
                            <div class="input-group">
                                <div class="input-group-prepend">
                                    <span class="input-group-text">Rp</span>
                                </div>
                                <input type="number" class="form-control" name="amount_paid"
                                       value="${amountPaid}" min="0" step="1000"
                                       placeholder="0">
                            </div>
                        </div>
                    </div>

                    <div class="col-md-6">
                        <div class="form-group">
                            <label>Tanggal Pembayaran:</label>
                            <input type="date" class="form-control" name="payment_date"
                                   value="${paymentDate}">
                        </div>
                    </div>
                </div>

                <div class="row">
                    <div class="col-md-12">
                        <div class="form-group">
                            <label>Catatan Pembayaran:</label>
                            <textarea class="form-control" name="payment_notes" rows="2"
                                      placeholder="Catatan tambahan tentang pembayaran...">${paymentNotes}</textarea>
                        </div>
                    </div>
                </div>

                <div class="alert alert-${balance > 0 ? 'warning' : (balance === 0 ? 'success' : 'info')} mt-3">
                    <div class="row">
                        <div class="col-md-6">
                            <strong>Sisa Tagihan:</strong>
                        </div>
                        <div class="col-md-6 text-right">
                            <span id="payment-balance" class="${balanceClass} font-weight-bold h5">
                                Rp ${Math.round(balance).toLocaleString('id-ID', { maximumFractionDigits: 0 })}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * Render Invoice Actions section
     */
    renderInvoiceActions(billing, state) {
        const invoiceNumber = billing.invoice_number || 'Belum dibuat';
        const invoiceDate = billing.invoice_date || '';
        const isConfirmed = billing.is_confirmed || false;

        return `
            <div class="form-section">
                <h6 class="text-primary mb-3">
                    <i class="fas fa-file-invoice"></i> Invoice
                </h6>

                <div class="row mb-3">
                    <div class="col-md-6">
                        <div class="info-group">
                            <label class="text-muted">Nomor Invoice:</label>
                            <div class="info-value">
                                <strong>${invoiceNumber}</strong>
                            </div>
                        </div>
                    </div>

                    <div class="col-md-6">
                        <div class="info-group">
                            <label class="text-muted">Tanggal Invoice:</label>
                            <div class="info-value">
                                ${invoiceDate || 'Belum dibuat'}
                            </div>
                        </div>
                    </div>
                </div>

                <div class="row">
                    <div class="col-md-12">
                        ${isConfirmed ? `
                            <div class="alert alert-success">
                                <i class="fas fa-check-circle"></i>
                                <strong>Invoice sudah dikonfirmasi</strong>
                            </div>
                            <button type="button" class="btn btn-primary" onclick="window.printInvoice()">
                                <i class="fas fa-print"></i> Cetak Invoice
                            </button>
                        ` : `
                            <div class="alert alert-info">
                                <i class="fas fa-info-circle"></i>
                                Invoice akan dibuat setelah Anda menyimpan dan mengkonfirmasi tagihan.
                            </div>
                        `}
                    </div>
                </div>
            </div>

            <script>
                window.printInvoice = function() {
                    // In production, this would call the print invoice API
                    window.showToast('error', 'Fungsi cetak invoice akan diimplementasikan pada integrasi backend');
                };
            </script>
        `;
    },

    /**
     * Save billing data
     */
    async save(state) {
        try {
            const data = {
                items: this.collectBillingItemsData(),
                discount_type: document.querySelector('[name="discount_type"]')?.value || 'none',
                discount_value: parseFloat(document.querySelector('[name="discount_value"]')?.value) || 0,
                tax_rate: parseFloat(document.querySelector('[name="tax_rate"]')?.value) || 0,
                payment_status: document.querySelector('[name="payment_status"]')?.value || 'unpaid',
                payment_method: document.querySelector('[name="payment_method"]')?.value || '',
                amount_paid: parseFloat(document.querySelector('[name="amount_paid"]')?.value) || 0,
                payment_date: document.querySelector('[name="payment_date"]')?.value || '',
                payment_notes: document.querySelector('[name="payment_notes"]')?.value || ''
            };

            // Calculate totals
            const subtotal = this.calculateSubtotal(data.items);
            let discount = 0;
            if (data.discount_type === 'percentage') {
                discount = (subtotal * data.discount_value) / 100;
            } else if (data.discount_type === 'fixed') {
                discount = data.discount_value;
            }

            const afterDiscount = subtotal - discount;
            const tax = (afterDiscount * data.tax_rate) / 100;
            const grandTotal = afterDiscount + tax;

            data.subtotal = subtotal;
            data.discount_amount = discount;
            data.tax_amount = tax;
            data.grand_total = grandTotal;
            data.balance = grandTotal - data.amount_paid;

            console.log('[Billing] Saving data:', data);

            // Validation: At least one item required
            if (!data.items || data.items.length === 0) {
                throw new Error('Minimal satu item tagihan harus diisi');
            }

            // In production, this would call the API
            // const response = await apiClient.saveBilling(state.currentMrId, data);

            return {
                success: true,
                data: data
            };

        } catch (error) {
            console.error('[Billing] Save failed:', error);
            return {
                success: false,
                error: error.message
            };
        }
    },

    /**
     * Collect Billing Items data
     */
    collectBillingItemsData() {
        const items = [];
        document.querySelectorAll('.billing-item-row').forEach(row => {
            const index = row.dataset.index;
            const category = document.querySelector(`[name="billing_items[${index}][category]"]`)?.value;
            const description = document.querySelector(`[name="billing_items[${index}][description]"]`)?.value;
            const quantity = parseFloat(document.querySelector(`[name="billing_items[${index}][quantity]"]`)?.value) || 1;
            const price = parseFloat(document.querySelector(`[name="billing_items[${index}][price]"]`)?.value) || 0;

            if (description) {
                items.push({
                    category: category,
                    description: description,
                    quantity: quantity,
                    price: price,
                    subtotal: quantity * price
                });
            }
        });

        return items;
    },

    /**
     * Render old Obstetri format (read-only with confirmation)
     */
    async renderObstetriFormat(state) {
        // Load billing data from API
        let billing = { items: [], status: 'draft' };
        let additionalBillings = [];
        const mrId = state.recordData?.mrId || state.recordData?.mr_id || state.currentMrId;

        try {
            if (mrId) {
                const token = window.getToken?.();
                if (token) {
                    const response = await fetch(`/api/sunday-clinic/billing/${mrId}`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });

                    if (response.ok) {
                        const result = await response.json();
                        if (result.success && result.data) {
                            billing = result.data;
                        }
                    }
                }
            }
        } catch (error) {
            console.error('[Billing] Failed to load billing data:', error);
        }

        const items = billing.items || [];
        const status = billing.status || 'draft';
        const hasPendingPayment = !!billing.has_pending_payment;
        const canEditBilling = status !== 'paid' && !(status === 'confirmed' && hasPendingPayment);

        if (status === 'paid' && mrId) {
            try {
                const token = getAdditionalBillingToken();
                if (token) {
                    const response = await fetch(`/api/sunday-clinic/billing/${mrId}/additional`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    const result = await response.json().catch(() => ({}));
                    if (response.ok && result.success && Array.isArray(result.data)) {
                        additionalBillings = result.data;
                    } else if (!response.ok) {
                        throw new Error(result.message || 'Gagal memuat tagihan tambahan.');
                    }
                }
            } catch (error) {
                console.error('[Billing] Failed to load additional billing data:', error);
            }
        }
        this.additionalBillings = additionalBillings;

        const escapeHtml = (str) => {
            if (!str) return '';
            return String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        };

        const formatRupiahLocal = (amount) => {
            const number = Math.round(amount || 0);
            return 'Rp ' + number.toLocaleString('id-ID', { maximumFractionDigits: 0 });
        };

        // Calculate total
        let subtotal = 0;
        const itemsHtml = items.map(item => {
            const itemTotal = (item.quantity || 1) * (item.price || 0);
            subtotal += itemTotal;

            // Show delete button for editable obat items.
            const showDeleteBtn = item.item_type === 'obat' && canEditBilling;
            const deleteBtn = showDeleteBtn
                ? `<button type="button" class="btn btn-sm btn-outline-danger ml-2 delete-obat-btn"
                           data-item-id="${item.id}"
                           data-item-name="${escapeHtml(item.item_name)}"
                           title="Hapus obat ini">
                       <i class="fas fa-times"></i>
                   </button>`
                : '';

            return `
                <tr data-item-id="${item.id}">
                    <td data-label="Item">
                        ${escapeHtml(item.item_name)}
                        ${deleteBtn}
                    </td>
                    <td data-label="Qty" class="text-center">${item.quantity || 1}</td>
                    <td data-label="Harga" class="text-right">${formatRupiahLocal(item.price)}</td>
                    <td data-label="Total" class="text-right font-weight-bold">${formatRupiahLocal(itemTotal)}</td>
                </tr>
            `;
        }).join('');

        // Status badge + who confirmed
        const confirmedBy = billing.confirmed_by || '';
        const confirmedAt = billing.confirmed_at ? new Date(billing.confirmed_at).toLocaleString('id-ID', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '';
        const lastModifiedBy = billing.last_modified_by || '';
        const lastModifiedAt = billing.last_modified_at ? formatDateTime(billing.last_modified_at) : '';
        let statusBadge = '<span class="badge badge-warning">Draft</span>';
        if (status === 'confirmed') {
            statusBadge = `<span class="badge badge-success">Dikonfirmasi</span>`;
        } else if (status === 'paid') {
            statusBadge = `<span class="badge badge-primary">Lunas</span>`;
        }
        const confirmedByHtml = (status === 'confirmed' || status === 'paid') && confirmedBy
            ? `<div class="sc-billing-meta sc-billing-meta-confirmed">
                   <i class="fas fa-user-check text-success mr-1"></i>
                   <strong>Dikonfirmasi oleh: ${escapeHtml(confirmedBy)}</strong>
                   ${confirmedAt ? `<span class="text-muted ml-2">${confirmedAt}</span>` : ''}
               </div>`
            : '';
        const lastModifiedHtml = (lastModifiedBy || lastModifiedAt)
            ? `<div class="sc-billing-meta sc-billing-meta-modified">
                   <i class="fas fa-history text-muted mr-1"></i>
                   <strong>Terakhir diubah: ${escapeHtml(lastModifiedBy || 'Staff')}</strong>
                   ${lastModifiedAt ? `<span class="text-muted ml-2">${lastModifiedAt}</span>` : ''}
               </div>`
            : '';
        const historyButtonHtml = billing.id
            ? `<button type="button" class="btn btn-outline-secondary btn-sm flex-fill sc-billing-history-action" id="btn-billing-audit-history">
                   <i class="fas fa-history mr-1"></i>Riwayat Perubahan
               </button>`
            : '';

        // Action buttons
        let actionsHtml = '';
        if (status === 'draft') {
            actionsHtml = `
                <div class="d-flex flex-wrap align-items-center sc-billing-actions" style="gap:6px;">
                    <button type="button" class="btn btn-primary btn-sm flex-fill" id="btn-confirm-billing">
                        <i class="fas fa-check mr-1"></i>Konfirmasi Tagihan
                    </button>
                    <button type="button" class="btn btn-secondary btn-sm flex-fill" id="btn-print-etiket" disabled>
                        <i class="fas fa-tag mr-1"></i>Cetak Etiket
                    </button>
                    <button type="button" class="btn btn-secondary btn-sm flex-fill" id="btn-print-invoice" disabled>
                        <i class="fas fa-receipt mr-1"></i>Cetak Invoice
                    </button>
                    ${historyButtonHtml}
                </div>`;
        } else if (status === 'confirmed') {
            actionsHtml = `
                <div class="d-flex flex-wrap align-items-center sc-billing-actions" style="gap:6px;">
                    <button type="button" class="btn btn-primary btn-sm flex-fill" id="btn-mark-paid">
                        <i class="fas fa-money-bill-wave mr-1"></i>Tandai Lunas
                    </button>
                    <button type="button" class="btn btn-info btn-sm flex-fill" id="btn-pay-online">
                        <i class="fas fa-qrcode mr-1"></i>Bayar Online
                    </button>
                    <button type="button" class="btn btn-success btn-sm flex-fill" id="btn-print-etiket">
                        <i class="fas fa-tag mr-1"></i>Cetak Etiket
                    </button>
                    <button type="button" class="btn btn-success btn-sm flex-fill" id="btn-print-invoice">
                        <i class="fas fa-receipt mr-1"></i>Cetak Invoice
                    </button>
                    ${historyButtonHtml}
                    ${billing.printed_at ? '<span class="small text-muted align-self-center sc-billing-printed-state">Telah dicetak</span>' : ''}
                </div>`;
        } else if (status === 'paid') {
            actionsHtml = `
                <div class="d-flex flex-wrap align-items-center sc-billing-actions" style="gap:6px;">
                    <span class="badge badge-lg badge-primary align-self-center sc-billing-paid-state">
                        <i class="fas fa-check-circle mr-1"></i>Sudah Lunas
                    </span>
                    <button type="button" class="btn btn-success btn-sm flex-fill" id="btn-print-etiket">
                        <i class="fas fa-tag mr-1"></i>Cetak Etiket
                    </button>
                    <button type="button" class="btn btn-success btn-sm flex-fill" id="btn-print-invoice">
                        <i class="fas fa-receipt mr-1"></i>Cetak Invoice
                    </button>
                    ${historyButtonHtml}
                    ${billing.printed_at ? '<span class="small text-muted align-self-center sc-billing-printed-state">Telah dicetak</span>' : ''}
                </div>`;
        }

        // Check which admin items are already in billing
        const existingAdminCodes = items
            .filter(item => item.item_type === 'tindakan' && item.item_code && item.item_code.startsWith('S0'))
            .map(item => item.item_code);

        // Admin items with their codes and prices
        const adminItems = [
            { code: 'S01', name: 'Biaya Admin', price: 5000 },
            { code: 'S03', name: 'Buku Ginekologi', price: 25000 },
            { code: 'S04', name: 'Buku Obstetri (Kehamilan)', price: 40000 },
            { code: 'S02', name: 'Surat Keterangan SpOG', price: 20000 }
        ];

        const adminCheckboxesHtml = adminItems.map(item => {
            const isChecked = existingAdminCodes.includes(item.code);
            return `
                <div class="col-md-6 col-lg-3 mb-2 sc-billing-admin-column">
                    <div class="custom-control custom-checkbox sc-billing-admin-option">
                        <input type="checkbox" class="custom-control-input admin-item-checkbox"
                               id="admin-${item.code}"
                               data-code="${item.code}"
                               data-name="${escapeHtml(item.name)}"
                               data-price="${item.price}"
                               ${isChecked ? 'checked' : ''}
                               ${!canEditBilling ? 'disabled' : ''}>
                        <label class="custom-control-label" for="admin-${item.code}">
                            ${escapeHtml(item.name)}
                            <small class="text-muted d-block">${formatRupiahLocal(item.price)}</small>
                        </label>
                    </div>
                </div>
            `;
        }).join('');

        return `
            <div class="sc-section sc-billing-section">
                <div class="sc-section-header">
                    <h3>Tagihan & Pembayaran</h3>
                </div>
                <div class="sc-card sc-billing-card">
                    <!-- Admin Items Section -->
                    <div class="mb-4 sc-billing-admin-section">
                        <h6 class="text-primary mb-3">
                            <i class="fas fa-clipboard-list mr-2"></i>Biaya Administratif
                        </h6>
                        <div class="row sc-billing-admin-grid">
                            ${adminCheckboxesHtml}
                        </div>
                        ${status === 'confirmed' && hasPendingPayment ? '<small class="text-warning"><i class="fas fa-lock mr-1"></i>Ada pembayaran online pending. Batalkan link pembayaran terlebih dahulu sebelum mengubah tagihan.</small>' : ''}
                        ${status === 'confirmed' && !hasPendingPayment ? '<small class="text-info"><i class="fas fa-edit mr-1"></i>Tagihan sudah dikonfirmasi. Perubahan akan dicatat di riwayat.</small>' : ''}
                        ${status === 'paid' ? '<small class="text-muted"><i class="fas fa-lock mr-1"></i>Tagihan sudah dibayar.</small>' : ''}
                    </div>

                    <hr>

                    <div class="d-flex justify-content-between align-items-center mb-3">
                        <h5 class="mb-0">Rincian Tagihan</h5>
                        ${statusBadge}
                    </div>

                    <div class="sc-billing-table-wrap">
                    <table class="table table-bordered sc-billing-table">
                        <thead class="thead-light">
                            <tr>
                                <th>Item</th>
                                <th width="10%" class="text-center">Qty</th>
                                <th width="20%" class="text-right">Harga</th>
                                <th width="20%" class="text-right">Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${itemsHtml || '<tr><td colspan="4" class="text-center text-muted">Belum ada item tagihan. Item akan muncul setelah Planning disimpan.</td></tr>'}
                            ${itemsHtml ? `
                            <tr class="table-active font-weight-bold sc-billing-total-row">
                                <td colspan="3" class="text-right">GRAND TOTAL</td>
                                <td data-label="Total" class="text-right">${formatRupiahLocal(subtotal)}</td>
                            </tr>
                            ` : ''}
                        </tbody>
                    </table>
                    </div>

                    <div class="sc-billing-meta-stack">
                        ${confirmedByHtml}
                        ${lastModifiedHtml}
                    </div>

                    <div class="mt-3">
                        ${actionsHtml}
                    </div>

                    ${status === 'paid' ? renderAdditionalBillingPanel(additionalBillings) : ''}
                </div>
            </div>
        `;
    },

    /**
     * Setup event handlers after render
     */
    async afterRender(state) {
        // Setup billing button handlers
        setTimeout(() => {
            const additionalBillingsById = new Map(
                (this.additionalBillings || []).map(billing => [Number(billing.id), billing])
            );
            const createAdditionalBillingButton = document.getElementById('btn-create-additional-billing');
            if (createAdditionalBillingButton) {
                createAdditionalBillingButton.addEventListener('click', () => openAdditionalBillingEditor());
            }
            document.querySelectorAll('[data-additional-billing-action]').forEach(button => {
                button.addEventListener('click', async () => {
                    const billing = additionalBillingsById.get(Number(button.dataset.additionalBillingId));
                    if (!billing) {
                        window.showError?.('Tagihan tambahan tidak ditemukan. Muat ulang halaman.');
                        return;
                    }
                    await runAdditionalBillingAction(button.dataset.additionalBillingAction, billing);
                });
            });

            // 0. Admin item checkboxes
            const adminCheckboxes = document.querySelectorAll('.admin-item-checkbox');
            adminCheckboxes.forEach(checkbox => {
                checkbox.addEventListener('change', async function() {
                    const code = this.dataset.code;
                    const name = this.dataset.name;
                    const price = parseFloat(this.dataset.price);
                    const isChecked = this.checked;

                    try {
                        const token = window.getToken?.();
                        if (!token) return;

                        const mrId = window.routeMrSlug;
                        if (!mrId) {
                            window.showToast('error', 'MR ID tidak ditemukan');
                            return;
                        }

                        // Disable checkbox during request
                        this.disabled = true;

                        if (isChecked) {
                            // Add admin item to billing
                            // First fetch existing items
                            let existingItems = [];
                            const fetchResponse = await fetch(`/api/sunday-clinic/billing/${mrId}`, {
                                method: 'GET',
                                headers: { 'Authorization': `Bearer ${token}` }
                            });

                            if (fetchResponse.ok) {
                                const billingData = await fetchResponse.json();
                                if (billingData.data && billingData.data.items) {
                                    existingItems = billingData.data.items.map(item => ({
                                        item_type: item.item_type,
                                        item_code: item.item_code,
                                        item_name: item.item_name,
                                        quantity: item.quantity,
                                        item_data: item.item_data
                                    }));
                                }
                            }

                            // Add new admin item
                            existingItems.push({
                                item_type: 'tindakan',
                                item_code: code,
                                item_name: name,
                                quantity: 1
                            });

                            // Save all items
                            const response = await fetch(`/api/sunday-clinic/billing/${mrId}`, {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                    'Authorization': `Bearer ${token}`
                                },
                                body: JSON.stringify({ items: existingItems })
                            });

                            if (!response.ok) {
                                throw new Error('Gagal menambahkan item');
                            }

                            if (window.showSuccess) {
                                window.showSuccess(`${name} ditambahkan ke tagihan`);
                            }
                        } else {
                            // Remove admin item from billing
                            const response = await fetch(`/api/sunday-clinic/billing/${mrId}/items/code/${code}`, {
                                method: 'DELETE',
                                headers: {
                                    'Authorization': `Bearer ${token}`,
                                    'Content-Type': 'application/json'
                                }
                            });

                            if (!response.ok) {
                                throw new Error('Gagal menghapus item');
                            }

                            if (window.showSuccess) {
                                window.showSuccess(`${name} dihapus dari tagihan`);
                            }
                        }

                        // Reload billing section to show updated items
                        if (window.handleSectionChange) {
                            window.handleSectionChange('billing', { pushHistory: false });
                        }

                    } catch (error) {
                        console.error('Error updating admin item:', error);
                        // Revert checkbox state
                        this.checked = !isChecked;
                        this.disabled = false;
                        if (window.showError) {
                            window.showError(error.message || 'Gagal mengubah item');
                        }
                    }
                });
            });

            // 0b. Individual obat delete buttons
            const deleteObatBtns = document.querySelectorAll('.delete-obat-btn');
            deleteObatBtns.forEach(btn => {
                btn.addEventListener('click', async function() {
                    const itemId = this.dataset.itemId;
                    const itemName = this.dataset.itemName;

                    if (!confirm(`Hapus obat "${itemName}" dari tagihan?`)) {
                        return;
                    }

                    try {
                        const token = window.getToken?.();
                        if (!token) return;

                        const mrId = window.routeMrSlug;
                        if (!mrId) {
                            window.showToast('error', 'MR ID tidak ditemukan');
                            return;
                        }

                        // Disable button during request
                        this.disabled = true;
                        this.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

                        const response = await fetch(`/api/sunday-clinic/billing/${mrId}/items/id/${itemId}`, {
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

                        if (window.showSuccess) {
                            window.showSuccess(result.message || 'Obat berhasil dihapus');
                        }

                        // NOTE: No longer need to touch textarea - it's only for custom entries now
                        // Billing items are shown in the item list, not textarea

                        // Refresh terapi items list in Planning if container exists
                        if (document.getElementById('terapi-items-container') && window.renderTerapiItemsList) {
                            window.renderTerapiItemsList();
                        }

                        // Refresh tindakan items list in Planning if container exists
                        if (document.getElementById('tindakan-items-container') && window.renderTindakanItemsList) {
                            window.renderTindakanItemsList();
                        }

                        // Reload billing section to show updated items
                        if (window.handleSectionChange) {
                            window.handleSectionChange('billing', { pushHistory: false });
                        }

                    } catch (error) {
                        console.error('Error deleting obat:', error);
                        if (window.showError) {
                            window.showError(error.message || 'Gagal menghapus obat');
                        }
                        // Re-enable button on error
                        this.disabled = false;
                        this.innerHTML = '<i class="fas fa-times"></i>';
                    }
                });
            });

            // 1. Confirm billing button (all staff)
                    const confirmBtn = document.getElementById('btn-confirm-billing');
                    if (confirmBtn) {
                        confirmBtn.addEventListener('click', async function() {
                            try {
                                const token = window.getToken?.();
                                if (!token) return;

                                const mrId = window.routeMrSlug;
                                if (!mrId) {
                                    window.showToast('error', 'MR ID tidak ditemukan');
                                    return;
                                }

                                const response = await fetch(`/api/sunday-clinic/billing/${mrId}/confirm`, {
                                    method: 'POST',
                                    headers: {
                                        'Authorization': `Bearer ${token}`,
                                        'Content-Type': 'application/json'
                                    }
                                });

                                if (!response.ok) {
                                    const error = await response.json();
                                    throw new Error(error.message || 'Gagal mengkonfirmasi tagihan');
                                }

                                const result = await response.json();

                                if (window.showSuccess) {
                                    window.showSuccess('Tagihan berhasil dikonfirmasi!');
                                }

                                // Backend will broadcast via Socket.IO
                                console.log('[Billing] Billing confirmed, server will broadcast to all users');

                                // Reload billing section
                                if (window.handleSectionChange) {
                                    window.handleSectionChange('billing', { pushHistory: false });
                                }
                            } catch (error) {
                                console.error('Error confirming billing:', error);
                                if (window.showError) {
                                    window.showError(error.message || 'Gagal mengkonfirmasi tagihan');
                                } else {
                                    window.showToast('error', error.message || 'Gagal mengkonfirmasi tagihan');
                                }
                            }
                        });
                    }

                    // 2. Print etiket button
                    const etiketBtn = document.getElementById('btn-print-etiket');
                    if (etiketBtn) {
                        etiketBtn.addEventListener('click', async function() {
                            if (this.disabled) return;
                            try {
                                const token = window.getToken?.();
                                const mrId = window.routeMrSlug;

                                const response = await fetch(`/api/sunday-clinic/billing/${mrId}/print-etiket`, {
                                    method: 'POST',
                                    headers: {
                                        'Authorization': `Bearer ${token}`,
                                        'Content-Type': 'application/json'
                                    }
                                });

                                if (!response.ok) throw new Error('Gagal mencetak etiket');

                                const data = await response.json();
                                if (data.success && data.downloadUrl) {
                                    // Open download URL in new tab
                                    window.open(data.downloadUrl, '_blank');
                                } else {
                                    throw new Error(data.message || 'Gagal mencetak etiket');
                                }

                                if (window.showSuccess) {
                                    window.showSuccess('Etiket berhasil dicetak!');
                                }

                                // Reload to update printed status
                                setTimeout(() => {
                                    if (window.handleSectionChange) {
                                        window.handleSectionChange('billing', { pushHistory: false });
                                    }
                                }, 1000);
                            } catch (error) {
                                console.error('Error printing etiket:', error);
                                if (window.showError) {
                                    window.showError(error.message);
                                }
                            }
                        });
                    }

                    // 3. Print invoice button
                    const invoiceBtn = document.getElementById('btn-print-invoice');
                    if (invoiceBtn) {
                        invoiceBtn.addEventListener('click', async function() {
                            if (this.disabled) return;

                            try {
                                const token = window.getToken?.();
                                const mrId = window.routeMrSlug;

                                const response = await fetch(`/api/sunday-clinic/billing/${mrId}/print-invoice`, {
                                    method: 'POST',
                                    headers: {
                                        'Authorization': `Bearer ${token}`,
                                        'Content-Type': 'application/json'
                                    }
                                });

                                if (!response.ok) throw new Error('Gagal mencetak invoice');

                                const data = await response.json();
                                if (data.success && data.downloadUrl) {
                                    // Open download URL in new tab
                                    window.open(data.downloadUrl, '_blank');
                                } else {
                                    throw new Error(data.message || 'Gagal mencetak invoice');
                                }

                                if (window.showSuccess) {
                                    window.showSuccess('Invoice berhasil dicetak!');
                                }

                                // Reload to update printed status
                                setTimeout(() => {
                                    if (window.handleSectionChange) {
                                        window.handleSectionChange('billing', { pushHistory: false });
                                    }
                                }, 1000);
                            } catch (error) {
                                console.error('Error printing invoice:', error);
                                if (window.showError) {
                                    window.showError(error.message);
                                }
                            }
                        });
                    }

                    // 4. Billing audit history
                    const auditHistoryBtn = document.getElementById('btn-billing-audit-history');
                    if (auditHistoryBtn && auditHistoryBtn.dataset.bound !== '1') {
                        auditHistoryBtn.dataset.bound = '1';
                        auditHistoryBtn.addEventListener('click', async function() {
                            const token = window.getToken?.();
                            const mrId = window.routeMrSlug;

                            if (!token || !mrId) {
                                window.showToast?.('error', 'MR ID tidak ditemukan');
                                return;
                            }

                            let modal = document.getElementById('billing-audit-modal');
                            if (!modal) {
                                document.body.insertAdjacentHTML('beforeend', `
                                    <div class="modal fade" id="billing-audit-modal" tabindex="-1" role="dialog" aria-labelledby="billingAuditModalLabel" aria-hidden="true">
                                        <div class="modal-dialog modal-lg" role="document">
                                            <div class="modal-content">
                                                <div class="modal-header">
                                                    <h5 class="modal-title" id="billingAuditModalLabel">
                                                        <i class="fas fa-history mr-2"></i>Riwayat Perubahan Tagihan
                                                    </h5>
                                                    <button type="button" class="close" data-dismiss="modal" aria-label="Close">
                                                        <span aria-hidden="true">&times;</span>
                                                    </button>
                                                </div>
                                                <div class="modal-body" id="billing-audit-modal-content"></div>
                                                <div class="modal-footer">
                                                    <button type="button" class="btn btn-secondary" data-dismiss="modal">Tutup</button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                `);
                                modal = document.getElementById('billing-audit-modal');
                            }

                            const content = document.getElementById('billing-audit-modal-content');
                            content.innerHTML = '<div class="text-center text-muted py-3"><i class="fas fa-spinner fa-spin mr-1"></i>Memuat riwayat...</div>';

                            if (window.$ && window.$.fn && window.$.fn.modal) {
                                window.$(modal).modal('show');
                            } else {
                                modal.style.display = 'block';
                                modal.classList.add('show');
                            }

                            try {
                                const response = await fetch(`/api/sunday-clinic/billing/${mrId}/audit`, {
                                    headers: { 'Authorization': `Bearer ${token}` }
                                });

                                if (!response.ok) {
                                    const errorData = await response.json().catch(() => ({}));
                                    throw new Error(errorData.message || 'Gagal memuat riwayat perubahan');
                                }

                                const result = await response.json();
                                const history = Array.isArray(result.data) ? result.data : [];
                                const actionLabels = {
                                    billing_created: 'Tagihan dibuat',
                                    billing_saved: 'Tagihan disimpan',
                                    billing_confirmed: 'Tagihan dikonfirmasi',
                                    item_added: 'Item ditambahkan',
                                    item_removed: 'Item dihapus',
                                    billing_marked_paid: 'Tagihan lunas'
                                };

                                if (history.length === 0) {
                                    content.innerHTML = '<div class="text-muted text-center py-3">Belum ada riwayat perubahan.</div>';
                                    return;
                                }

                                content.innerHTML = history.map(entry => `
                                    <div class="border-bottom py-2">
                                        <div class="d-flex justify-content-between align-items-start">
                                            <div>
                                                <strong>${escapeHtml(actionLabels[entry.action] || entry.action)}</strong>
                                                <div class="text-muted small">
                                                    ${escapeHtml(entry.actor_name || 'Staff')}
                                                    ${entry.actor_role ? `&middot; ${escapeHtml(entry.actor_role)}` : ''}
                                                </div>
                                            </div>
                                            <span class="text-muted small">${escapeHtml(formatDateTime(entry.created_at))}</span>
                                        </div>
                                        ${entry.summary ? `<div class="mt-1">${escapeHtml(entry.summary)}</div>` : ''}
                                    </div>
                                `).join('');
                            } catch (error) {
                                console.error('Error loading billing audit history:', error);
                                content.innerHTML = `<div class="alert alert-danger mb-0">${escapeHtml(error.message || 'Gagal memuat riwayat perubahan')}</div>`;
                            }
                        });
                    }

                    // 5. Mark as Paid button - deducts stock from inventory
                    const markPaidBtn = document.getElementById('btn-mark-paid');
                    if (markPaidBtn && markPaidBtn.dataset.bound !== '1') {
                        markPaidBtn.dataset.bound = '1';
                        markPaidBtn.addEventListener('click', async function() {

                            try {
                                const token = window.getToken?.();
                                if (!token) return;

                                const mrId = window.routeMrSlug;
                                if (!mrId) {
                                    window.showToast('error', 'MR ID tidak ditemukan');
                                    return;
                                }

                                // Disable button during request
                                this.disabled = true;
                                this.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Memproses...';

                                const response = await fetch(`/api/sunday-clinic/billing/${mrId}/mark-paid`, {
                                    method: 'POST',
                                    headers: {
                                        'Authorization': `Bearer ${token}`,
                                        'Content-Type': 'application/json'
                                    }
                                });

                                if (!response.ok) {
                                    const error = await response.json();
                                    throw new Error(error.message || 'Gagal menandai pembayaran');
                                }

                                const result = await response.json();

                                if (window.showSuccess) {
                                    window.showSuccess('Pembayaran berhasil dicatat! Stok obat telah dikurangi.');
                                }

                                // Reload billing section to show updated status
                                if (window.handleSectionChange) {
                                    window.handleSectionChange('billing', { pushHistory: false });
                                }
                            } catch (error) {
                                console.error('Error marking payment:', error);
                                // Re-enable button on error
                                this.disabled = false;
                                this.innerHTML = '<i class="fas fa-money-bill-wave mr-2"></i>Tandai Lunas';

                                if (window.showError) {
                                    window.showError(error.message || 'Gagal menandai pembayaran');
                                } else {
                                    window.showToast('error', error.message || 'Gagal menandai pembayaran');
                                }
                            }
                        });
                    }

                    // 6. Pay Online button - opens Xendit payment modal
                    const payOnlineBtn = document.getElementById('btn-pay-online');
                    if (payOnlineBtn) {
                        payOnlineBtn.addEventListener('click', function() {
                            const mrId = window.routeMrSlug;
                            if (!mrId) {
                                window.showToast('error', 'MR ID tidak ditemukan');
                                return;
                            }

                            // Check if PaymentModal is loaded
                            if (window.PaymentModal && typeof window.PaymentModal.show === 'function') {
                                window.PaymentModal.show(mrId);
                            } else {
                                console.error('PaymentModal not loaded');
                                window.showToast('error', 'Modul pembayaran tidak tersedia');
                            }
                        });
                    }
                }, 100);
    }
};

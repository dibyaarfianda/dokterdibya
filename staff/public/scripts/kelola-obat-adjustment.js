// kelola-obat-adjustment.js - Ajukan penyesuaian stok (menunggu persetujuan dokter)

import { showSuccess, showError, showWarning } from './toast.js';
import { getIdToken } from './vps-auth-v2.js';

let batchRequestSeq = 0;

function formatBatchDate(value) {
    if (!value) return '-';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '-';
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function syncBatchState() {
    const direction = document.getElementById('adj-direction');
    const batch = document.getElementById('adj-batch');
    if (!direction || !batch) return;
    if (direction.value === 'plus') {
        batch.value = '';
        batch.disabled = true;
    } else {
        batch.disabled = false;
    }
}

async function loadBatches(obatId) {
    const batch = document.getElementById('adj-batch');
    const errorEl = document.getElementById('adj-batch-error');
    if (!batch) return;
    const seq = ++batchRequestSeq;
    batch.innerHTML = '<option value="">FIFO otomatis</option>';
    if (errorEl) errorEl.classList.add('d-none');

    try {
        const token = await getIdToken();
        const response = await fetch(`/api/inventory/batches/${encodeURIComponent(obatId)}?_t=${Date.now()}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const result = await response.json();
        if (!result.success || !Array.isArray(result.data)) throw new Error('Respons batch tidak valid');
        if (seq !== batchRequestSeq) return;

        result.data.forEach((b) => {
            const option = document.createElement('option');
            option.value = b.id;
            option.textContent = `${b.batch_number || '-'} · exp ${formatBatchDate(b.expiry_date)} · sisa ${b.quantity_remaining}`;
            batch.appendChild(option);
        });
    } catch (error) {
        console.error('Error loading batches:', error);
        if (seq === batchRequestSeq && errorEl) errorEl.classList.remove('d-none');
    }
}

export function openAdjustmentRequestModal(obatId, obatName) {
    const idEl = document.getElementById('adj-obat-id');
    const nameEl = document.getElementById('adj-obat-name');
    const direction = document.getElementById('adj-direction');
    const quantity = document.getElementById('adj-quantity');
    const category = document.getElementById('adj-category');
    const note = document.getElementById('adj-note');

    if (idEl) idEl.value = obatId;
    if (nameEl) nameEl.textContent = obatName || '';
    if (direction) {
        direction.value = 'minus';
        direction.onchange = syncBatchState;
    }
    if (quantity) quantity.value = '';
    if (category) category.value = 'rusak';
    if (note) note.value = '';
    syncBatchState();

    loadBatches(obatId);
    $('#kelola-obat-adjustment-modal').modal('show');
}

export async function submitAdjustmentRequest() {
    const obatId = document.getElementById('adj-obat-id')?.value;
    const direction = document.getElementById('adj-direction')?.value || 'minus';
    const quantityRaw = document.getElementById('adj-quantity')?.value?.trim() || '';
    const reasonCategory = document.getElementById('adj-category')?.value || '';
    const batchValue = document.getElementById('adj-batch')?.value || '';
    const reasonNote = document.getElementById('adj-note')?.value?.trim() || '';

    const quantity = Number(quantityRaw);
    if (!quantityRaw || !Number.isInteger(quantity) || quantity < 1) {
        showWarning('Jumlah harus bilangan bulat minimal 1');
        return;
    }
    if (!reasonNote) {
        showWarning('Catatan alasan wajib diisi');
        return;
    }
    if (reasonCategory === 'kedaluwarsa' && (!batchValue || direction === 'plus')) {
        showWarning('Pilih batch dan arah Kurangi untuk obat kedaluwarsa');
        return;
    }

    try {
        const token = await getIdToken();
        const response = await fetch('/api/inventory/adjust', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({
                obat_id: obatId,
                quantity_delta: direction === 'minus' ? -quantity : quantity,
                reason_category: reasonCategory,
                reason_note: reasonNote,
                batch_id: batchValue || null
            })
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.success) {
            showError(result.message || `Gagal mengirim pengajuan (HTTP ${response.status})`);
            return;
        }
        showSuccess(result.message);
        $('#kelola-obat-adjustment-modal').modal('hide');
    } catch (error) {
        console.error('Error submitting adjustment request:', error);
        showError('Gagal mengirim pengajuan: ' + error.message);
    }
}

window.openAdjustmentRequestModal = openAdjustmentRequestModal;
window.submitAdjustmentRequest = submitAdjustmentRequest;

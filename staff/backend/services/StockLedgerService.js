const ADJUSTMENT_REASON_CATEGORIES = ['rusak', 'pecah', 'kedaluwarsa', 'hilang', 'salah_hitung', 'opname', 'lainnya'];

function stockLedgerError(message, statusCode, code) {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.code = code;
    return error;
}

function assertNoDirectStockEdit(requestedStock, currentStock) {
    if (requestedStock === undefined || requestedStock === null || requestedStock === '') return;
    if (Number(requestedStock) === Number(currentStock)) return;
    throw stockLedgerError(
        'Stok tidak bisa diubah di sini. Gunakan Ajukan Penyesuaian. Jika Anda tidak mengubah stok, muat ulang halaman.',
        409,
        'STOCK_EDIT_NOT_ALLOWED'
    );
}

function effectiveUnitCost({ defaultCostPrice, latestBatchCost } = {}) {
    const fallback = parseFloat(defaultCostPrice);
    if (fallback > 0) return fallback;
    const latest = parseFloat(latestBatchCost);
    if (latest > 0) return latest;
    return 0;
}

// batches must already be in FIFO order from the caller.
function planAdjustmentAllocation({ quantityDelta, batches, batchId, unitCost }) {
    const delta = Number(quantityDelta);
    if (!Number.isInteger(delta) || delta === 0) {
        throw stockLedgerError('Jumlah penyesuaian harus bilangan bulat selain 0', 400);
    }
    if (delta > 0) {
        return { deductions: [], legacyQuantity: 0, legacyCostPrice: unitCost, newBatchQuantity: delta };
    }

    const list = batches || [];
    let ordered = list;
    if (batchId !== null && batchId !== undefined) {
        const chosen = list.find((b) => Number(b.id) === Number(batchId));
        if (!chosen) {
            throw stockLedgerError('Batch tidak ditemukan untuk obat ini', 409);
        }
        ordered = [chosen, ...list.filter((b) => b !== chosen)];
    }

    let remaining = -delta;
    const deductions = [];
    for (const batch of ordered) {
        if (remaining <= 0) break;
        const available = Number(batch.quantity_remaining);
        if (!(available > 0)) continue;
        const take = Math.min(available, remaining);
        deductions.push({ batchId: batch.id, quantity: take, costPrice: Number(batch.cost_price) });
        remaining -= take;
    }

    return { deductions, legacyQuantity: remaining, legacyCostPrice: unitCost, newBatchQuantity: 0 };
}

module.exports = {
    ADJUSTMENT_REASON_CATEGORIES,
    stockLedgerError,
    assertNoDirectStockEdit,
    effectiveUnitCost,
    planAdjustmentAllocation
};

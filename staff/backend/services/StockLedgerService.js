const db = require('../db');
const logger = require('../utils/logger');
const cache = require('../utils/cache');

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

// Every transaction that writes obat.stock must call this first, before it locks
// or updates any obat_batches row (obat row first, then batches).
async function lockObatRow(connection, obatId) {
    const [rows] = await connection.query(
        'SELECT id, stock, default_cost_price FROM obat WHERE id = ? FOR UPDATE',
        [obatId]
    );
    if (!rows || !rows[0]) {
        throw stockLedgerError('Obat tidak ditemukan', 404, 'OBAT_NOT_FOUND');
    }
    return rows[0];
}

/**
 * Record a new purchase (add stock)
 */
async function recordPurchase({
    obatId,
    supplierId,
    batchNumber,
    purchaseDate,
    expiryDate,
    costPrice,
    quantity,
    invoiceNumber,
    notes,
    createdBy
}) {
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        await lockObatRow(connection, obatId);

        // Create batch record
        const [batchResult] = await connection.query(
            `INSERT INTO obat_batches
             (obat_id, supplier_id, batch_number, purchase_date, expiry_date,
              cost_price, quantity_purchased, quantity_remaining, invoice_number, notes, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [obatId, supplierId || null, batchNumber || null, purchaseDate,
             expiryDate || null, costPrice, quantity, quantity,
             invoiceNumber || null, notes || null, createdBy || null]
        );

        const batchId = batchResult.insertId;

        // Record stock movement
        await connection.query(
            `INSERT INTO stock_movements
             (obat_id, batch_id, movement_type, quantity, cost_price,
              reference_type, reference_id, notes, created_by)
             VALUES (?, ?, 'purchase', ?, ?, 'purchase', ?, ?, ?)`,
            [obatId, batchId, quantity, costPrice, batchId, notes || null, createdBy || null]
        );

        // Update obat stock total
        await connection.query(
            `UPDATE obat SET stock = stock + ? WHERE id = ?`,
            [quantity, obatId]
        );

        // Update default cost price if not set or first purchase
        await connection.query(
            `UPDATE obat SET default_cost_price = ?
             WHERE id = ? AND (default_cost_price = 0 OR default_cost_price IS NULL)`,
            [costPrice, obatId]
        );

        await connection.commit();

        // Invalidate obat cache so stock updates are visible immediately
        cache.delPattern('obat:');

        logger.info(`Purchase recorded: obat_id=${obatId}, qty=${quantity}, batch_id=${batchId}`);

        return {
            success: true,
            batchId,
            message: 'Pembelian berhasil dicatat'
        };
    } catch (error) {
        await connection.rollback();
        logger.error('Record purchase error:', error);
        throw error;
    } finally {
        connection.release();
    }
}

/**
 * Deduct stock using FIFO (First In First Out)
 * Used when billing is finalized
 */
async function deductStockFIFO(obatId, quantity, referenceType, referenceId, createdBy) {
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        const lockedObat = await lockObatRow(connection, obatId);

        // Get oldest batches with remaining stock (FIFO)
        // FOR UPDATE acquires row-level locks to prevent race conditions
        // when concurrent sales run for the same obat
        const [batches] = await connection.query(
            `SELECT id, quantity_remaining, cost_price
             FROM obat_batches
             WHERE obat_id = ? AND quantity_remaining > 0
             ORDER BY purchase_date ASC, id ASC
             FOR UPDATE`,
            [obatId]
        );

        let totalCost = 0;
        const deductions = [];

        if (batches.length === 0) {
            // FALLBACK: No batches exist (legacy stock), deduct directly from obat.stock
            const obatData = [lockedObat];

            const [latestBatchRows] = await connection.query(
                `SELECT cost_price
                 FROM obat_batches
                 WHERE obat_id = ? AND cost_price > 0
                 ORDER BY purchase_date DESC, id DESC
                 LIMIT 1`,
                [obatId]
            );

            if (!obatData[0] || obatData[0].stock < quantity) {
                throw new Error(`Insufficient stock. Available: ${obatData[0]?.stock || 0}, Required: ${quantity}`);
            }

            const defaultCost = parseFloat(obatData[0].default_cost_price) || 0;
            const latestBatchCost = parseFloat(latestBatchRows[0]?.cost_price) || 0;
            const costPrice = defaultCost > 0 ? defaultCost : latestBatchCost;

            // Update obat stock directly
            await connection.query(
                `UPDATE obat SET stock = stock - ? WHERE id = ?`,
                [quantity, obatId]
            );

            // Record movement without batch reference (legacy mode)
            await connection.query(
                `INSERT INTO stock_movements
                 (obat_id, batch_id, movement_type, quantity, cost_price,
                  reference_type, reference_id, notes, created_by)
                 VALUES (?, NULL, 'sale', ?, ?, ?, ?, 'Legacy stock (no batch)', ?)`,
                [obatId, -quantity, costPrice, referenceType, referenceId, createdBy]
            );

            totalCost = quantity * parseFloat(costPrice);
            deductions.push({
                batchId: null,
                quantity: quantity,
                costPrice: costPrice,
                legacy: true
            });

            logger.info(`Stock deducted (legacy/no batch): obat_id=${obatId}, qty=${quantity}`);
        } else {
            // FIFO MODE: Deduct from batches
            const totalAvailable = batches.reduce((sum, b) => sum + Number(b.quantity_remaining || 0), 0);
            let legacyQuantity = 0;
            let legacyCostPrice = 0;

            if (totalAvailable < quantity) {
                const obatData = lockedObat;

                const availableStock = Number(obatData?.stock || 0);
                if (!obatData || availableStock < quantity) {
                    throw new Error(`Insufficient stock. Available: ${Math.max(totalAvailable, availableStock)}, Required: ${quantity}`);
                }

                const [latestBatchRows] = await connection.query(
                    `SELECT cost_price
                     FROM obat_batches
                     WHERE obat_id = ? AND cost_price > 0
                     ORDER BY purchase_date DESC, id DESC
                     LIMIT 1`,
                    [obatId]
                );

                const defaultCost = parseFloat(obatData.default_cost_price) || 0;
                const latestBatchCost = parseFloat(latestBatchRows[0]?.cost_price) || 0;
                legacyCostPrice = defaultCost > 0 ? defaultCost : latestBatchCost;
                legacyQuantity = quantity - totalAvailable;

                logger.warn('FIFO batch quantity below obat stock, using legacy remainder', {
                    obatId,
                    requestedQuantity: quantity,
                    batchAvailable: totalAvailable,
                    legacyQuantity,
                    availableStock
                });
            }

            let remainingToDeduct = Math.min(quantity, totalAvailable);

            for (const batch of batches) {
                if (remainingToDeduct <= 0) break;

                const deductFromBatch = Math.min(batch.quantity_remaining, remainingToDeduct);

                // Update batch
                await connection.query(
                    `UPDATE obat_batches
                     SET quantity_remaining = quantity_remaining - ?
                     WHERE id = ?`,
                    [deductFromBatch, batch.id]
                );

                // Record movement
                await connection.query(
                    `INSERT INTO stock_movements
                     (obat_id, batch_id, movement_type, quantity, cost_price,
                      reference_type, reference_id, created_by)
                     VALUES (?, ?, 'sale', ?, ?, ?, ?, ?)`,
                    [obatId, batch.id, -deductFromBatch, batch.cost_price,
                     referenceType, referenceId, createdBy]
                );

                deductions.push({
                    batchId: batch.id,
                    quantity: deductFromBatch,
                    costPrice: batch.cost_price
                });

                totalCost += deductFromBatch * parseFloat(batch.cost_price);
                remainingToDeduct -= deductFromBatch;
            }

            if (legacyQuantity > 0) {
                await connection.query(
                    `INSERT INTO stock_movements
                     (obat_id, batch_id, movement_type, quantity, cost_price,
                      reference_type, reference_id, notes, created_by)
                     VALUES (?, NULL, 'sale', ?, ?, ?, ?, 'Legacy stock remainder (batch total below stock)', ?)`,
                    [obatId, -legacyQuantity, legacyCostPrice, referenceType, referenceId, createdBy]
                );

                deductions.push({
                    batchId: null,
                    quantity: legacyQuantity,
                    costPrice: legacyCostPrice,
                    legacy: true
                });

                totalCost += legacyQuantity * parseFloat(legacyCostPrice || 0);
            }

            // Lock and update obat stock total atomically
            const [stockUpdate] = await connection.query(
                `UPDATE obat SET stock = stock - ? WHERE id = ? AND stock >= ?`,
                [quantity, obatId, quantity]
            );

            if (!stockUpdate.affectedRows) {
                throw new Error(`Insufficient stock. Required: ${quantity}`);
            }

            // Verify update actually happened (guards against race condition)
            const [[obatCheck]] = await connection.query(
                `SELECT stock FROM obat WHERE id = ?`, [obatId]
            );
            logger.info(`Stock deducted (FIFO): obat_id=${obatId}, qty=${quantity}, cost=${totalCost}, remaining_stock=${obatCheck?.stock}`);
        }

        await connection.commit();

        // Invalidate obat cache
        cache.delPattern('obat:');

        return {
            success: true,
            totalCost,
            avgCostPerUnit: totalCost / quantity,
            deductions
        };
    } catch (error) {
        await connection.rollback();
        logger.error('Deduct stock FIFO error:', error);
        throw error;
    } finally {
        connection.release();
    }
}

/**
 * Apply an approved stock adjustment inside the caller's transaction.
 * Does NOT commit; the caller commits. Lock order: obat row, then obat_batches.
 */
async function applyAdjustmentInTransaction(connection, { requestId, obatId, batchId, quantityDelta, reasonCategory, actorName }) {
    const obat = await lockObatRow(connection, obatId);
    const stockBefore = Number(obat.stock);
    const delta = Number(quantityDelta);

    if (stockBefore + delta < 0) {
        throw stockLedgerError('Stok tidak cukup untuk penyesuaian ini', 422, 'INSUFFICIENT_STOCK');
    }

    const [batches] = await connection.query(
        `SELECT id, quantity_remaining, cost_price
         FROM obat_batches
         WHERE obat_id = ? AND quantity_remaining > 0
         ORDER BY purchase_date ASC, id ASC
         FOR UPDATE`,
        [obatId]
    );

    const [latestRows] = await connection.query(
        `SELECT cost_price
         FROM obat_batches
         WHERE obat_id = ? AND cost_price > 0
         ORDER BY purchase_date DESC, id DESC
         LIMIT 1`,
        [obatId]
    );

    const unitCost = effectiveUnitCost({
        defaultCostPrice: obat.default_cost_price,
        latestBatchCost: latestRows && latestRows[0] ? latestRows[0].cost_price : 0
    });

    const plan = planAdjustmentAllocation({ quantityDelta: delta, batches, batchId, unitCost });
    const notes = `Penyesuaian #${requestId} (${reasonCategory})`;
    const movementIds = [];

    const insertMovement = async (movementBatchId, quantity, costPrice) => {
        const [result] = await connection.query(
            `INSERT INTO stock_movements
             (obat_id, batch_id, movement_type, quantity, cost_price,
              reference_type, reference_id, notes, created_by)
             VALUES (?, ?, 'adjustment', ?, ?, 'stock_adjustment_request', ?, ?, ?)`,
            [obatId, movementBatchId, quantity, costPrice, requestId, notes, actorName]
        );
        movementIds.push(result.insertId);
    };

    for (const deduction of plan.deductions) {
        const [update] = await connection.query(
            `UPDATE obat_batches
             SET quantity_remaining = quantity_remaining - ?
             WHERE id = ? AND quantity_remaining >= ?`,
            [deduction.quantity, deduction.batchId, deduction.quantity]
        );
        if (!update.affectedRows) {
            throw stockLedgerError('Batch berubah, coba lagi', 409, 'BATCH_CHANGED');
        }
        await insertMovement(deduction.batchId, -deduction.quantity, deduction.costPrice);
    }

    if (plan.legacyQuantity > 0) {
        await insertMovement(null, -plan.legacyQuantity, plan.legacyCostPrice);
    }

    if (plan.newBatchQuantity > 0) {
        const [batchInsert] = await connection.query(
            `INSERT INTO obat_batches
             (obat_id, purchase_date, cost_price, quantity_purchased, quantity_remaining, notes, created_by)
             VALUES (?, CURDATE(), ?, ?, ?, ?, ?)`,
            [obatId, unitCost, plan.newBatchQuantity, plan.newBatchQuantity, `Penyesuaian #${requestId}`, actorName]
        );
        await insertMovement(batchInsert.insertId, plan.newBatchQuantity, unitCost);
    }

    await connection.query('UPDATE obat SET stock = stock + ? WHERE id = ?', [delta, obatId]);

    return { stockBefore, stockAfter: stockBefore + delta, movementIds };
}

module.exports = {
    ADJUSTMENT_REASON_CATEGORIES,
    stockLedgerError,
    assertNoDirectStockEdit,
    effectiveUnitCost,
    planAdjustmentAllocation,
    lockObatRow,
    applyAdjustmentInTransaction,
    recordPurchase,
    deductStockFIFO
};

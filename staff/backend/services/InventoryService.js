/**
 * Inventory Service
 * Handles stock management with FIFO logic
 */

const db = require('../db');
const logger = require('../utils/logger');
const cache = require('../utils/cache');

class InventoryService {
    /**
     * Record a new purchase (add stock)
     */
    static async recordPurchase({
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
    static async deductStockFIFO(obatId, quantity, referenceType, referenceId, createdBy) {
        const connection = await db.getConnection();

        try {
            await connection.beginTransaction();

            // Get oldest batches with remaining stock (FIFO)
            const [batches] = await connection.query(
                `SELECT id, quantity_remaining, cost_price
                 FROM obat_batches
                 WHERE obat_id = ? AND quantity_remaining > 0
                 ORDER BY purchase_date ASC, id ASC`,
                [obatId]
            );

            let totalCost = 0;
            const deductions = [];

            if (batches.length === 0) {
                // FALLBACK: No batches exist (legacy stock), deduct directly from obat.stock
                const [obatData] = await connection.query(
                    `SELECT stock, default_cost_price FROM obat WHERE id = ?`,
                    [obatId]
                );

                if (!obatData[0] || obatData[0].stock < quantity) {
                    throw new Error(`Insufficient stock. Available: ${obatData[0]?.stock || 0}, Required: ${quantity}`);
                }

                const costPrice = obatData[0].default_cost_price || 0;

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
                const totalAvailable = batches.reduce((sum, b) => sum + b.quantity_remaining, 0);
                if (totalAvailable < quantity) {
                    throw new Error(`Insufficient stock. Available: ${totalAvailable}, Required: ${quantity}`);
                }

                let remainingToDeduct = quantity;

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

                // Update obat stock total
                await connection.query(
                    `UPDATE obat SET stock = stock - ? WHERE id = ?`,
                    [quantity, obatId]
                );

                logger.info(`Stock deducted (FIFO): obat_id=${obatId}, qty=${quantity}, cost=${totalCost}`);
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
     * Manual stock adjustment
     */
    static async adjustStock(obatId, adjustment, reason, createdBy) {
        const connection = await db.getConnection();

        try {
            await connection.beginTransaction();

            // Get current average cost for adjustment record
            const [avgCost] = await connection.query(
                `SELECT AVG(cost_price) as avg_cost
                 FROM obat_batches
                 WHERE obat_id = ? AND quantity_remaining > 0`,
                [obatId]
            );

            const costPrice = avgCost[0]?.avg_cost || 0;

            // Record movement
            await connection.query(
                `INSERT INTO stock_movements
                 (obat_id, movement_type, quantity, cost_price,
                  reference_type, notes, created_by)
                 VALUES (?, 'adjustment', ?, ?, 'manual', ?, ?)`,
                [obatId, adjustment, costPrice, reason || null, createdBy]
            );

            // Update obat stock total
            await connection.query(
                `UPDATE obat SET stock = stock + ? WHERE id = ?`,
                [adjustment, obatId]
            );

            // If adding stock, create a batch record
            if (adjustment > 0) {
                const [obat] = await connection.query(
                    `SELECT default_cost_price FROM obat WHERE id = ?`,
                    [obatId]
                );

                await connection.query(
                    `INSERT INTO obat_batches
                     (obat_id, purchase_date, cost_price, quantity_purchased,
                      quantity_remaining, notes, created_by)
                     VALUES (?, CURDATE(), ?, ?, ?, ?, ?)`,
                    [obatId, obat[0]?.default_cost_price || 0, adjustment, adjustment,
                     `Adjustment: ${reason || 'Manual'}`, createdBy]
                );
            }

            await connection.commit();

            // Invalidate obat cache
            cache.delPattern('obat:');

            logger.info(`Stock adjusted: obat_id=${obatId}, adjustment=${adjustment}`);

            return {
                success: true,
                message: 'Stok berhasil disesuaikan'
            };
        } catch (error) {
            await connection.rollback();
            logger.error('Adjust stock error:', error);
            throw error;
        } finally {
            connection.release();
        }
    }

    /**
     * Get batches for an obat
     */
    static async getBatches(obatId, includeEmpty = false) {
        let query = `
            SELECT ob.*, s.name as supplier_name, s.code as supplier_code
            FROM obat_batches ob
            LEFT JOIN suppliers s ON ob.supplier_id = s.id
            WHERE ob.obat_id = ?
        `;

        if (!includeEmpty) {
            query += ` AND ob.quantity_remaining > 0`;
        }

        query += ` ORDER BY ob.purchase_date ASC, ob.id ASC`;

        const [batches] = await db.query(query, [obatId]);
        return batches;
    }

    /**
     * Get stock movements for an obat
     */
    static async getMovements(obatId, limit = 50, offset = 0) {
        const [movements] = await db.query(
            `SELECT sm.*, ob.batch_number
             FROM stock_movements sm
             LEFT JOIN obat_batches ob ON sm.batch_id = ob.id
             WHERE sm.obat_id = ?
             ORDER BY sm.created_at DESC
             LIMIT ? OFFSET ?`,
            [obatId, limit, offset]
        );

        return movements;
    }

    /**
     * Get items expiring within N days
     */
    static async getExpiringItems(days = 60) {
        const [items] = await db.query(
            `SELECT ob.*, o.name as obat_name, o.code as obat_code,
                    s.name as supplier_name,
                    DATEDIFF(ob.expiry_date, CURDATE()) as days_until_expiry
             FROM obat_batches ob
             JOIN obat o ON ob.obat_id = o.id
             LEFT JOIN suppliers s ON ob.supplier_id = s.id
             WHERE ob.expiry_date IS NOT NULL
               AND ob.expiry_date <= DATE_ADD(CURDATE(), INTERVAL ? DAY)
               AND ob.quantity_remaining > 0
             ORDER BY ob.expiry_date ASC`,
            [days]
        );

        return items;
    }

    /**
     * Calculate profit for a period
     */
    static async calculateProfit(startDate, endDate) {
        const [results] = await db.query(
            `SELECT
                o.id as obat_id,
                o.name,
                o.code,
                o.price as selling_price,
                SUM(CASE WHEN sm.movement_type = 'sale' THEN ABS(sm.quantity) ELSE 0 END) as qty_sold,
                SUM(CASE WHEN sm.movement_type = 'sale' THEN ABS(sm.quantity) * o.price ELSE 0 END) as revenue,
                SUM(CASE WHEN sm.movement_type = 'sale' THEN ABS(sm.quantity) * sm.cost_price ELSE 0 END) as cost,
                SUM(CASE WHEN sm.movement_type = 'sale' THEN ABS(sm.quantity) * (o.price - sm.cost_price) ELSE 0 END) as profit
             FROM obat o
             LEFT JOIN stock_movements sm ON o.id = sm.obat_id
             WHERE sm.movement_type = 'sale'
               AND sm.created_at BETWEEN ? AND ?
             GROUP BY o.id
             ORDER BY profit DESC`,
            [startDate, endDate]
        );

        // Calculate totals
        const totals = results.reduce((acc, item) => {
            acc.totalQtySold += parseInt(item.qty_sold) || 0;
            acc.totalRevenue += parseFloat(item.revenue) || 0;
            acc.totalCost += parseFloat(item.cost) || 0;
            acc.totalProfit += parseFloat(item.profit) || 0;
            return acc;
        }, { totalQtySold: 0, totalRevenue: 0, totalCost: 0, totalProfit: 0 });

        totals.profitMargin = totals.totalRevenue > 0
            ? ((totals.totalProfit / totals.totalRevenue) * 100).toFixed(2)
            : 0;

        return {
            items: results,
            totals
        };
    }

    /**
     * Get summary for dashboard
     */
    static async getSummary(startDate, endDate) {
        // Revenue and cost from sales
        const [salesData] = await db.query(
            `SELECT
                SUM(ABS(sm.quantity) * o.price) as revenue,
                SUM(ABS(sm.quantity) * sm.cost_price) as cost
             FROM stock_movements sm
             JOIN obat o ON sm.obat_id = o.id
             WHERE sm.movement_type = 'sale'
               AND sm.created_at BETWEEN ? AND ?`,
            [startDate, endDate]
        );

        // Expiring soon count
        const [expiringCount] = await db.query(
            `SELECT COUNT(*) as count
             FROM obat_batches
             WHERE expiry_date IS NOT NULL
               AND expiry_date <= DATE_ADD(CURDATE(), INTERVAL 60 DAY)
               AND quantity_remaining > 0`
        );

        // Low stock count
        const [lowStockCount] = await db.query(
            `SELECT COUNT(*) as count
             FROM obat
             WHERE stock <= min_stock AND is_active = 1`
        );

        const revenue = parseFloat(salesData[0]?.revenue) || 0;
        const cost = parseFloat(salesData[0]?.cost) || 0;
        const profit = revenue - cost;

        return {
            revenue,
            cost,
            profit,
            profitMargin: revenue > 0 ? ((profit / revenue) * 100).toFixed(2) : 0,
            expiringItemsCount: expiringCount[0]?.count || 0,
            lowStockCount: lowStockCount[0]?.count || 0
        };
    }
}

module.exports = InventoryService;

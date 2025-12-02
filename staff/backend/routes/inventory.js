/**
 * Inventory Routes
 * Handles stock batches, movements, and inventory management
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const logger = require('../utils/logger');
const { verifyToken, requireMenuAccess } = require('../middleware/auth');
const InventoryService = require('../services/InventoryService');

/**
 * POST /api/inventory/purchase
 * Record a new purchase (add stock)
 */
router.post('/purchase', verifyToken, requireMenuAccess('obat_alkes'), async (req, res) => {
    try {
        const {
            obat_id,
            supplier_id,
            batch_number,
            purchase_date,
            expiry_date,
            cost_price,
            quantity,
            invoice_number,
            notes
        } = req.body;

        // Validation
        if (!obat_id) {
            return res.status(400).json({
                success: false,
                message: 'Obat harus dipilih'
            });
        }

        if (!cost_price || cost_price <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Harga beli harus diisi'
            });
        }

        if (!quantity || quantity <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Jumlah harus diisi'
            });
        }

        if (!purchase_date) {
            return res.status(400).json({
                success: false,
                message: 'Tanggal pembelian harus diisi'
            });
        }

        const result = await InventoryService.recordPurchase({
            obatId: obat_id,
            supplierId: supplier_id,
            batchNumber: batch_number,
            purchaseDate: purchase_date,
            expiryDate: expiry_date,
            costPrice: cost_price,
            quantity: parseInt(quantity),
            invoiceNumber: invoice_number,
            notes,
            createdBy: req.user?.name || req.user?.id || 'system'
        });

        res.status(201).json(result);
    } catch (error) {
        logger.error('Record purchase error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Gagal mencatat pembelian'
        });
    }
});

/**
 * GET /api/inventory/batches
 * List all batches with filters
 */
router.get('/batches', verifyToken, requireMenuAccess('obat_alkes'), async (req, res) => {
    try {
        const { obat_id, include_empty, supplier_id } = req.query;

        let query = `
            SELECT ob.*, o.name as obat_name, o.code as obat_code, o.price as selling_price,
                   s.name as supplier_name, s.code as supplier_code,
                   DATEDIFF(ob.expiry_date, CURDATE()) as days_until_expiry
            FROM obat_batches ob
            JOIN obat o ON ob.obat_id = o.id
            LEFT JOIN suppliers s ON ob.supplier_id = s.id
            WHERE 1=1
        `;
        const params = [];

        if (obat_id) {
            query += ` AND ob.obat_id = ?`;
            params.push(obat_id);
        }

        if (include_empty !== 'true') {
            query += ` AND ob.quantity_remaining > 0`;
        }

        if (supplier_id) {
            query += ` AND ob.supplier_id = ?`;
            params.push(supplier_id);
        }

        query += ` ORDER BY ob.purchase_date DESC, ob.id DESC`;

        const [batches] = await db.query(query, params);

        res.json({
            success: true,
            data: batches
        });
    } catch (error) {
        logger.error('Get batches error:', error);
        res.status(500).json({
            success: false,
            message: 'Gagal mengambil data batch'
        });
    }
});

/**
 * GET /api/inventory/batches/:obatId
 * Get batches for specific obat
 */
router.get('/batches/:obatId', verifyToken, requireMenuAccess('obat_alkes'), async (req, res) => {
    try {
        const includeEmpty = req.query.include_empty === 'true';
        const batches = await InventoryService.getBatches(req.params.obatId, includeEmpty);

        res.json({
            success: true,
            data: batches
        });
    } catch (error) {
        logger.error('Get obat batches error:', error);
        res.status(500).json({
            success: false,
            message: 'Gagal mengambil data batch'
        });
    }
});

/**
 * GET /api/inventory/movements/:obatId
 * Get stock movement history for an obat
 */
router.get('/movements/:obatId', verifyToken, requireMenuAccess('obat_alkes'), async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const offset = parseInt(req.query.offset) || 0;

        const movements = await InventoryService.getMovements(req.params.obatId, limit, offset);

        res.json({
            success: true,
            data: movements
        });
    } catch (error) {
        logger.error('Get movements error:', error);
        res.status(500).json({
            success: false,
            message: 'Gagal mengambil riwayat pergerakan stok'
        });
    }
});

/**
 * GET /api/inventory/activity-log
 * Get all stock movements with filters for activity log page
 */
router.get('/activity-log', verifyToken, requireMenuAccess('obat_alkes'), async (req, res) => {
    try {
        const {
            start_date,
            end_date,
            movement_type,
            created_by,
            obat_id
        } = req.query;
        const limit = parseInt(req.query.limit) || 100;
        const offset = parseInt(req.query.offset) || 0;

        let query = `
            SELECT
                sm.id,
                sm.created_at,
                sm.movement_type,
                sm.quantity,
                sm.cost_price,
                sm.reference_type,
                sm.reference_id,
                sm.notes,
                sm.created_by,
                o.id as obat_id,
                o.code as obat_code,
                o.name as obat_name,
                ob.batch_number,
                ob.expiry_date,
                s.name as supplier_name
            FROM stock_movements sm
            JOIN obat o ON sm.obat_id = o.id
            LEFT JOIN obat_batches ob ON sm.batch_id = ob.id
            LEFT JOIN suppliers s ON ob.supplier_id = s.id
            WHERE 1=1
        `;
        const params = [];

        // Date range filter
        if (start_date) {
            query += ` AND DATE(sm.created_at) >= ?`;
            params.push(start_date);
        }
        if (end_date) {
            query += ` AND DATE(sm.created_at) <= ?`;
            params.push(end_date);
        }

        // Movement type filter
        if (movement_type) {
            query += ` AND sm.movement_type = ?`;
            params.push(movement_type);
        }

        // Created by filter
        if (created_by) {
            query += ` AND sm.created_by LIKE ?`;
            params.push(`%${created_by}%`);
        }

        // Obat filter
        if (obat_id) {
            query += ` AND sm.obat_id = ?`;
            params.push(obat_id);
        }

        // Get total count
        const countQuery = query.replace(/SELECT[\s\S]*?FROM/, 'SELECT COUNT(*) as total FROM');
        const [countResult] = await db.query(countQuery, params);
        const total = countResult[0]?.total || 0;

        // Add sorting and pagination
        query += ` ORDER BY sm.created_at DESC LIMIT ? OFFSET ?`;
        params.push(limit, offset);

        const [movements] = await db.query(query, params);

        // Get unique users for filter dropdown
        const [users] = await db.query(`
            SELECT DISTINCT created_by
            FROM stock_movements
            WHERE created_by IS NOT NULL
            ORDER BY created_by
        `);

        res.json({
            success: true,
            data: movements,
            pagination: {
                total,
                limit,
                offset,
                pages: Math.ceil(total / limit)
            },
            filters: {
                users: users.map(u => u.created_by)
            }
        });
    } catch (error) {
        logger.error('Get activity log error:', error);
        res.status(500).json({
            success: false,
            message: 'Gagal mengambil log aktivitas'
        });
    }
});

/**
 * GET /api/inventory/expiring
 * Get items expiring within N days
 */
router.get('/expiring', verifyToken, requireMenuAccess('obat_alkes'), async (req, res) => {
    try {
        const days = parseInt(req.query.days) || 60;
        const items = await InventoryService.getExpiringItems(days);

        res.json({
            success: true,
            data: items
        });
    } catch (error) {
        logger.error('Get expiring items error:', error);
        res.status(500).json({
            success: false,
            message: 'Gagal mengambil data item kadaluarsa'
        });
    }
});

/**
 * POST /api/inventory/adjust
 * Manual stock adjustment
 */
router.post('/adjust', verifyToken, requireMenuAccess('obat_alkes'), async (req, res) => {
    try {
        const { obat_id, adjustment, reason } = req.body;

        if (!obat_id) {
            return res.status(400).json({
                success: false,
                message: 'Obat harus dipilih'
            });
        }

        if (adjustment === undefined || adjustment === 0) {
            return res.status(400).json({
                success: false,
                message: 'Jumlah penyesuaian harus diisi'
            });
        }

        const result = await InventoryService.adjustStock(
            obat_id,
            parseInt(adjustment),
            reason,
            req.user?.name || req.user?.id || 'system'
        );

        res.json(result);
    } catch (error) {
        logger.error('Adjust stock error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Gagal menyesuaikan stok'
        });
    }
});

/**
 * POST /api/inventory/deduct
 * Deduct stock using FIFO (for billing integration)
 */
router.post('/deduct', verifyToken, requireMenuAccess('obat_alkes'), async (req, res) => {
    try {
        const { obat_id, quantity, reference_type, reference_id } = req.body;

        if (!obat_id || !quantity) {
            return res.status(400).json({
                success: false,
                message: 'Obat dan jumlah harus diisi'
            });
        }

        const result = await InventoryService.deductStockFIFO(
            obat_id,
            parseInt(quantity),
            reference_type || 'manual',
            reference_id,
            req.user?.name || req.user?.id || 'system'
        );

        res.json(result);
    } catch (error) {
        logger.error('Deduct stock error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Gagal mengurangi stok'
        });
    }
});

/**
 * GET /api/inventory/profit
 * Get profit analysis for a period
 */
router.get('/profit', verifyToken, requireMenuAccess('obat_alkes'), async (req, res) => {
    try {
        const startDate = req.query.start_date || new Date(new Date().setDate(1)).toISOString().split('T')[0];
        const endDate = req.query.end_date || new Date().toISOString().split('T')[0];

        const result = await InventoryService.calculateProfit(startDate, endDate + ' 23:59:59');

        res.json({
            success: true,
            period: { startDate, endDate },
            ...result
        });
    } catch (error) {
        logger.error('Get profit error:', error);
        res.status(500).json({
            success: false,
            message: 'Gagal menghitung profit'
        });
    }
});

/**
 * GET /api/inventory/summary
 * Get summary for dashboard
 */
router.get('/summary', verifyToken, requireMenuAccess('obat_alkes'), async (req, res) => {
    try {
        const startDate = req.query.start_date || new Date(new Date().setDate(1)).toISOString().split('T')[0];
        const endDate = req.query.end_date || new Date().toISOString().split('T')[0];

        const summary = await InventoryService.getSummary(startDate, endDate + ' 23:59:59');

        res.json({
            success: true,
            period: { startDate, endDate },
            ...summary
        });
    } catch (error) {
        logger.error('Get summary error:', error);
        res.status(500).json({
            success: false,
            message: 'Gagal mengambil ringkasan'
        });
    }
});

module.exports = router;

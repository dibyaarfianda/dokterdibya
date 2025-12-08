'use strict';

/**
 * Obat Sales Routes
 * Medication sales for hospital patients (RSIA Melinda, RSUD Gambiran, RS Bhayangkara)
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const logger = require('../utils/logger');
const { verifyToken } = require('../middleware/auth');
const InventoryService = require('../services/InventoryService');

// Hospital display names
const HOSPITAL_NAMES = {
    'rsia_melinda': 'RSIA MELINDA',
    'rsud_gambiran': 'RSUD GAMBIRAN',
    'rs_bhayangkara': 'RS BHAYANGKARA'
};

/**
 * Generate sale number: OS-YYYYMMDD-XXX
 */
async function generateSaleNumber() {
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
    const prefix = `OS-${dateStr}-`;

    const [[result]] = await db.query(
        `SELECT sale_number FROM obat_sales
         WHERE sale_number LIKE ?
         ORDER BY id DESC LIMIT 1`,
        [`${prefix}%`]
    );

    let nextNum = 1;
    if (result) {
        const lastNum = parseInt(result.sale_number.split('-').pop());
        nextNum = lastNum + 1;
    }

    return `${prefix}${String(nextNum).padStart(3, '0')}`;
}

/**
 * GET /api/obat-sales
 * List all sales with filters
 */
router.get('/', verifyToken, async (req, res, next) => {
    try {
        const { status, hospital, date_from, date_to, search, limit = 50, offset = 0 } = req.query;

        let query = `
            SELECT os.*
            FROM obat_sales os
            WHERE 1=1
        `;
        const params = [];

        if (status) {
            query += ' AND os.status = ?';
            params.push(status);
        }

        if (hospital) {
            query += ' AND os.hospital_source = ?';
            params.push(hospital);
        }

        if (date_from) {
            query += ' AND DATE(os.created_at) >= ?';
            params.push(date_from);
        }

        if (date_to) {
            query += ' AND DATE(os.created_at) <= ?';
            params.push(date_to);
        }

        if (search) {
            query += ' AND (os.sale_number LIKE ? OR os.patient_name LIKE ?)';
            params.push(`%${search}%`, `%${search}%`);
        }

        query += ' ORDER BY os.created_at DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit), parseInt(offset));

        const [sales] = await db.query(query, params);

        // Get items for each sale
        for (const sale of sales) {
            const [items] = await db.query(
                'SELECT * FROM obat_sale_items WHERE sale_id = ?',
                [sale.id]
            );
            sale.items = items;
            sale.hospital_name = HOSPITAL_NAMES[sale.hospital_source] || sale.hospital_source;
        }

        res.json({ success: true, data: sales });
    } catch (error) {
        logger.error('Failed to list obat sales', { error: error.message });
        next(error);
    }
});

/**
 * GET /api/obat-sales/:id
 * Get single sale with items
 */
router.get('/:id', verifyToken, async (req, res, next) => {
    try {
        const [[sale]] = await db.query(
            'SELECT * FROM obat_sales WHERE id = ?',
            [req.params.id]
        );

        if (!sale) {
            return res.status(404).json({ success: false, message: 'Sale not found' });
        }

        const [items] = await db.query(
            'SELECT * FROM obat_sale_items WHERE sale_id = ?',
            [sale.id]
        );
        sale.items = items;
        sale.hospital_name = HOSPITAL_NAMES[sale.hospital_source] || sale.hospital_source;

        res.json({ success: true, data: sale });
    } catch (error) {
        logger.error('Failed to get obat sale', { error: error.message });
        next(error);
    }
});

/**
 * POST /api/obat-sales
 * Create new sale
 */
router.post('/', verifyToken, async (req, res, next) => {
    const connection = await db.getConnection();

    try {
        const { patient_name, patient_age, hospital_source, items } = req.body;

        // Validate required fields
        if (!patient_name || !hospital_source || !items || !items.length) {
            return res.status(400).json({
                success: false,
                message: 'patient_name, hospital_source, dan items wajib diisi'
            });
        }

        // Validate hospital source
        if (!HOSPITAL_NAMES[hospital_source]) {
            return res.status(400).json({
                success: false,
                message: 'hospital_source tidak valid'
            });
        }

        await connection.beginTransaction();

        // Generate sale number
        const saleNumber = await generateSaleNumber();

        // Calculate totals
        let subtotal = 0;
        for (const item of items) {
            subtotal += (item.quantity || 1) * (item.price || 0);
        }

        // Insert sale
        const [saleResult] = await connection.query(
            `INSERT INTO obat_sales
             (sale_number, patient_name, patient_age, hospital_source, subtotal, total, status, created_by)
             VALUES (?, ?, ?, ?, ?, ?, 'draft', ?)`,
            [saleNumber, patient_name, patient_age || null, hospital_source, subtotal, subtotal, req.user.name || req.user.id]
        );

        const saleId = saleResult.insertId;

        // Insert items
        for (const item of items) {
            // Lookup obat for price validation
            const [[obat]] = await connection.query(
                'SELECT id, code, name, price FROM obat WHERE id = ?',
                [item.obat_id]
            );

            if (!obat) {
                await connection.rollback();
                return res.status(400).json({
                    success: false,
                    message: `Obat dengan ID ${item.obat_id} tidak ditemukan`
                });
            }

            const quantity = item.quantity || 1;
            const price = obat.price; // Use database price
            const total = quantity * price;

            await connection.query(
                `INSERT INTO obat_sale_items
                 (sale_id, obat_id, obat_code, obat_name, quantity, price, total)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [saleId, obat.id, obat.code, obat.name, quantity, price, total]
            );
        }

        // Recalculate sale totals
        const [[totals]] = await connection.query(
            'SELECT SUM(total) as subtotal FROM obat_sale_items WHERE sale_id = ?',
            [saleId]
        );

        await connection.query(
            'UPDATE obat_sales SET subtotal = ?, total = ? WHERE id = ?',
            [totals.subtotal || 0, totals.subtotal || 0, saleId]
        );

        await connection.commit();

        // Fetch created sale
        const [[newSale]] = await db.query(
            'SELECT * FROM obat_sales WHERE id = ?',
            [saleId]
        );

        const [newItems] = await db.query(
            'SELECT * FROM obat_sale_items WHERE sale_id = ?',
            [saleId]
        );
        newSale.items = newItems;

        logger.info('Obat sale created', { saleNumber, patient: patient_name });

        res.json({
            success: true,
            message: 'Penjualan berhasil dibuat',
            data: newSale
        });
    } catch (error) {
        await connection.rollback();
        logger.error('Failed to create obat sale', { error: error.message });
        next(error);
    } finally {
        connection.release();
    }
});

/**
 * PUT /api/obat-sales/:id
 * Update draft sale
 */
router.put('/:id', verifyToken, async (req, res, next) => {
    const connection = await db.getConnection();

    try {
        const { items } = req.body;

        // Check sale exists and is draft
        const [[sale]] = await connection.query(
            'SELECT * FROM obat_sales WHERE id = ?',
            [req.params.id]
        );

        if (!sale) {
            return res.status(404).json({ success: false, message: 'Sale not found' });
        }

        if (sale.status !== 'draft') {
            return res.status(400).json({
                success: false,
                message: 'Hanya penjualan draft yang bisa diubah'
            });
        }

        await connection.beginTransaction();

        // Delete existing items
        await connection.query('DELETE FROM obat_sale_items WHERE sale_id = ?', [sale.id]);

        // Insert new items
        for (const item of items) {
            const [[obat]] = await connection.query(
                'SELECT id, code, name, price FROM obat WHERE id = ?',
                [item.obat_id]
            );

            if (!obat) {
                await connection.rollback();
                return res.status(400).json({
                    success: false,
                    message: `Obat dengan ID ${item.obat_id} tidak ditemukan`
                });
            }

            const quantity = item.quantity || 1;
            const price = obat.price;
            const total = quantity * price;

            await connection.query(
                `INSERT INTO obat_sale_items
                 (sale_id, obat_id, obat_code, obat_name, quantity, price, total)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [sale.id, obat.id, obat.code, obat.name, quantity, price, total]
            );
        }

        // Recalculate totals
        const [[totals]] = await connection.query(
            'SELECT SUM(total) as subtotal FROM obat_sale_items WHERE sale_id = ?',
            [sale.id]
        );

        await connection.query(
            'UPDATE obat_sales SET subtotal = ?, total = ?, updated_at = NOW() WHERE id = ?',
            [totals.subtotal || 0, totals.subtotal || 0, sale.id]
        );

        await connection.commit();

        res.json({ success: true, message: 'Penjualan berhasil diupdate' });
    } catch (error) {
        await connection.rollback();
        logger.error('Failed to update obat sale', { error: error.message });
        next(error);
    } finally {
        connection.release();
    }
});

/**
 * DELETE /api/obat-sales/:id
 * Delete draft sale
 */
router.delete('/:id', verifyToken, async (req, res, next) => {
    try {
        const [[sale]] = await db.query(
            'SELECT * FROM obat_sales WHERE id = ?',
            [req.params.id]
        );

        if (!sale) {
            return res.status(404).json({ success: false, message: 'Sale not found' });
        }

        if (sale.status !== 'draft') {
            return res.status(400).json({
                success: false,
                message: 'Hanya penjualan draft yang bisa dihapus'
            });
        }

        // Items deleted via CASCADE
        await db.query('DELETE FROM obat_sales WHERE id = ?', [sale.id]);

        logger.info('Obat sale deleted', { saleNumber: sale.sale_number });

        res.json({ success: true, message: 'Penjualan berhasil dihapus' });
    } catch (error) {
        logger.error('Failed to delete obat sale', { error: error.message });
        next(error);
    }
});

/**
 * POST /api/obat-sales/:id/confirm
 * Confirm sale (any staff can confirm)
 */
router.post('/:id/confirm', verifyToken, async (req, res, next) => {
    try {
        const [[sale]] = await db.query(
            'SELECT * FROM obat_sales WHERE id = ?',
            [req.params.id]
        );

        if (!sale) {
            return res.status(404).json({ success: false, message: 'Sale not found' });
        }

        if (sale.status !== 'draft') {
            return res.status(400).json({
                success: false,
                message: 'Hanya penjualan draft yang bisa dikonfirmasi'
            });
        }

        await db.query(
            `UPDATE obat_sales
             SET status = 'confirmed', confirmed_at = NOW(), confirmed_by = ?
             WHERE id = ?`,
            [req.user.name || req.user.id, sale.id]
        );

        logger.info('Obat sale confirmed', { saleNumber: sale.sale_number, by: req.user.name });

        res.json({ success: true, message: 'Penjualan berhasil dikonfirmasi' });
    } catch (error) {
        logger.error('Failed to confirm obat sale', { error: error.message });
        next(error);
    }
});

/**
 * POST /api/obat-sales/:id/mark-paid
 * Mark as paid + deduct stock using FIFO
 */
router.post('/:id/mark-paid', verifyToken, async (req, res, next) => {
    const connection = await db.getConnection();

    try {
        const [[sale]] = await connection.query(
            'SELECT * FROM obat_sales WHERE id = ?',
            [req.params.id]
        );

        if (!sale) {
            return res.status(404).json({ success: false, message: 'Sale not found' });
        }

        if (sale.status !== 'confirmed') {
            return res.status(400).json({
                success: false,
                message: 'Penjualan harus dikonfirmasi terlebih dahulu'
            });
        }

        await connection.beginTransaction();

        // Update status to paid
        await connection.query(
            `UPDATE obat_sales
             SET status = 'paid', paid_at = NOW(), paid_by = ?
             WHERE id = ?`,
            [req.user.name || req.user.id, sale.id]
        );

        // Get items and deduct stock
        const [items] = await connection.query(
            'SELECT * FROM obat_sale_items WHERE sale_id = ?',
            [sale.id]
        );

        for (const item of items) {
            try {
                await InventoryService.deductStockFIFO(item.obat_id, item.quantity);
                logger.info('Stock deducted', {
                    obatId: item.obat_id,
                    obatName: item.obat_name,
                    quantity: item.quantity,
                    saleNumber: sale.sale_number
                });
            } catch (stockError) {
                logger.warn('Failed to deduct stock (continuing)', {
                    obatId: item.obat_id,
                    error: stockError.message
                });
                // Continue even if stock deduction fails (log warning)
            }
        }

        await connection.commit();

        logger.info('Obat sale marked as paid', { saleNumber: sale.sale_number, by: req.user.name });

        res.json({ success: true, message: 'Pembayaran berhasil dicatat, stok telah dikurangi' });
    } catch (error) {
        await connection.rollback();
        logger.error('Failed to mark obat sale as paid', { error: error.message });
        next(error);
    } finally {
        connection.release();
    }
});

/**
 * POST /api/obat-sales/:id/print-invoice
 * Generate and return invoice PDF
 */
router.post('/:id/print-invoice', verifyToken, async (req, res, next) => {
    try {
        const [[sale]] = await db.query(
            'SELECT * FROM obat_sales WHERE id = ?',
            [req.params.id]
        );

        if (!sale) {
            return res.status(404).json({ success: false, message: 'Sale not found' });
        }

        if (!['confirmed', 'paid'].includes(sale.status)) {
            return res.status(400).json({
                success: false,
                message: 'Invoice hanya bisa dicetak untuk penjualan yang sudah dikonfirmasi'
            });
        }

        // Get items
        const [items] = await db.query(
            'SELECT * FROM obat_sale_items WHERE sale_id = ?',
            [sale.id]
        );
        sale.items = items;

        // Generate PDF
        const pdfGenerator = require('../utils/pdf-generator');
        const result = await pdfGenerator.generateObatSaleInvoice(sale);

        // Update invoice_url
        await db.query(
            'UPDATE obat_sales SET invoice_url = ? WHERE id = ?',
            [result.r2Key, sale.id]
        );

        // Get signed URL
        const r2Storage = require('../services/r2Storage');
        const signedUrl = await r2Storage.getSignedDownloadUrl(result.r2Key, 3600);

        logger.info('Obat sale invoice generated', { saleNumber: sale.sale_number });

        res.json({
            success: true,
            downloadUrl: signedUrl,
            filename: result.filename
        });
    } catch (error) {
        logger.error('Failed to generate obat sale invoice', { error: error.message });
        next(error);
    }
});

module.exports = router;

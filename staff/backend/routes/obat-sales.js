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
 * Confirm sale - deducts stock using FIFO and calculates profit
 * Accepts payment_method: 'cash' | 'bpjs' | 'insurance'
 * - cash: immediately paid
 * - bpjs/insurance: payment_pending (waiting for insurance)
 */
router.post('/:id/confirm', verifyToken, async (req, res, next) => {
    const connection = await db.getConnection();

    try {
        const { payment_method } = req.body;

        // Validate payment_method
        const validMethods = ['cash', 'bpjs', 'insurance'];
        if (!payment_method || !validMethods.includes(payment_method)) {
            return res.status(400).json({
                success: false,
                message: 'Metode pembayaran harus dipilih (cash, bpjs, atau insurance)'
            });
        }

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
                message: 'Hanya penjualan draft yang bisa dikonfirmasi'
            });
        }

        await connection.beginTransaction();

        // Get sale items
        const [items] = await connection.query(
            'SELECT * FROM obat_sale_items WHERE sale_id = ?',
            [sale.id]
        );

        let totalCost = 0;
        const deductionResults = [];

        // Deduct stock for each item using FIFO
        for (const item of items) {
            try {
                const result = await InventoryService.deductStockFIFO(
                    item.obat_id,
                    item.quantity,
                    'obat_sale',      // reference_type
                    sale.id,          // reference_id
                    req.user.name || req.user.id  // created_by
                );

                totalCost += result.totalCost || 0;
                deductionResults.push({
                    obatId: item.obat_id,
                    obatName: item.obat_name,
                    quantity: item.quantity,
                    cost: result.totalCost,
                    success: true
                });

                logger.info('Stock deducted for sale', {
                    saleNumber: sale.sale_number,
                    obatId: item.obat_id,
                    obatName: item.obat_name,
                    quantity: item.quantity,
                    cost: result.totalCost
                });
            } catch (stockError) {
                // Log warning but continue (allow confirmation even if stock insufficient)
                logger.warn('Stock deduction failed', {
                    saleNumber: sale.sale_number,
                    obatId: item.obat_id,
                    error: stockError.message
                });
                deductionResults.push({
                    obatId: item.obat_id,
                    obatName: item.obat_name,
                    quantity: item.quantity,
                    success: false,
                    error: stockError.message
                });
            }
        }

        // Calculate profit (revenue - cost)
        const revenue = parseFloat(sale.total) || 0;
        const profit = revenue - totalCost;

        // Determine status based on payment method
        // cash = immediately paid, bpjs/insurance = payment_pending
        const newStatus = payment_method === 'cash' ? 'paid' : 'payment_pending';
        const isPaid = payment_method === 'cash';

        // Update sale status, payment method, and profit info
        await connection.query(
            `UPDATE obat_sales
             SET status = ?,
                 payment_method = ?,
                 confirmed_at = NOW(),
                 confirmed_by = ?,
                 cost_total = ?,
                 profit = ?${isPaid ? ', paid_at = NOW(), paid_by = ?' : ''}
             WHERE id = ?`,
            isPaid
                ? [newStatus, payment_method, req.user.name || req.user.id, totalCost, profit, req.user.name || req.user.id, sale.id]
                : [newStatus, payment_method, req.user.name || req.user.id, totalCost, profit, sale.id]
        );

        await connection.commit();

        const paymentMethodLabels = { cash: 'Tunai', bpjs: 'BPJS', insurance: 'Asuransi' };
        const statusLabels = { paid: 'Dibayar', payment_pending: 'Menunggu Pembayaran' };

        logger.info('Obat sale confirmed with stock deduction', {
            saleNumber: sale.sale_number,
            paymentMethod: payment_method,
            status: newStatus,
            revenue,
            cost: totalCost,
            profit,
            by: req.user.name
        });

        res.json({
            success: true,
            message: `Penjualan berhasil dikonfirmasi (${paymentMethodLabels[payment_method]}) - ${statusLabels[newStatus]}`,
            data: {
                status: newStatus,
                paymentMethod: payment_method,
                revenue,
                cost: totalCost,
                profit,
                deductions: deductionResults
            }
        });
    } catch (error) {
        await connection.rollback();
        logger.error('Failed to confirm obat sale', { error: error.message });
        next(error);
    } finally {
        connection.release();
    }
});

/**
 * POST /api/obat-sales/:id/mark-paid
 * Mark as paid (stock already deducted at confirmation)
 * Accepts: confirmed OR payment_pending status
 */
router.post('/:id/mark-paid', verifyToken, async (req, res, next) => {
    try {
        const [[sale]] = await db.query(
            'SELECT * FROM obat_sales WHERE id = ?',
            [req.params.id]
        );

        if (!sale) {
            return res.status(404).json({ success: false, message: 'Sale not found' });
        }

        // Allow both 'confirmed' and 'payment_pending' to transition to 'paid'
        if (!['confirmed', 'payment_pending'].includes(sale.status)) {
            return res.status(400).json({
                success: false,
                message: 'Penjualan harus dikonfirmasi atau menunggu pembayaran terlebih dahulu'
            });
        }

        // Update status to paid (stock already deducted at confirmation)
        await db.query(
            `UPDATE obat_sales
             SET status = 'paid', paid_at = NOW(), paid_by = ?
             WHERE id = ?`,
            [req.user.name || req.user.id, sale.id]
        );

        const paymentMethodLabels = { cash: 'Tunai', bpjs: 'BPJS', insurance: 'Asuransi' };
        const methodLabel = sale.payment_method ? paymentMethodLabels[sale.payment_method] : '';

        logger.info('Obat sale marked as paid', {
            saleNumber: sale.sale_number,
            paymentMethod: sale.payment_method,
            previousStatus: sale.status,
            by: req.user.name
        });

        res.json({
            success: true,
            message: methodLabel ? `Pembayaran ${methodLabel} berhasil dicatat` : 'Pembayaran berhasil dicatat'
        });
    } catch (error) {
        logger.error('Failed to mark obat sale as paid', { error: error.message });
        next(error);
    }
});

/**
 * POST /api/obat-sales/:id/set-payment-method
 * Set payment method for legacy confirmed sales and change status to payment_pending
 */
router.post('/:id/set-payment-method', verifyToken, async (req, res, next) => {
    try {
        const { payment_method } = req.body;

        // Validate payment_method (only bpjs or insurance for pending)
        const validMethods = ['bpjs', 'insurance'];
        if (!payment_method || !validMethods.includes(payment_method)) {
            return res.status(400).json({
                success: false,
                message: 'Metode pembayaran harus BPJS atau Asuransi'
            });
        }

        const [[sale]] = await db.query(
            'SELECT * FROM obat_sales WHERE id = ?',
            [req.params.id]
        );

        if (!sale) {
            return res.status(404).json({ success: false, message: 'Sale not found' });
        }

        if (sale.status !== 'confirmed') {
            return res.status(400).json({
                success: false,
                message: 'Hanya penjualan dengan status Confirmed yang bisa diubah'
            });
        }

        // Update payment method and change status to payment_pending
        await db.query(
            `UPDATE obat_sales
             SET payment_method = ?, status = 'payment_pending'
             WHERE id = ?`,
            [payment_method, sale.id]
        );

        const paymentMethodLabels = { bpjs: 'BPJS', insurance: 'Asuransi' };

        logger.info('Obat sale payment method set', {
            saleNumber: sale.sale_number,
            paymentMethod: payment_method,
            by: req.user.name
        });

        res.json({
            success: true,
            message: `Metode pembayaran ${paymentMethodLabels[payment_method]} berhasil disimpan`
        });
    } catch (error) {
        logger.error('Failed to set payment method', { error: error.message });
        next(error);
    }
});

/**
 * POST /api/obat-sales/:id/invoice-base64
 * Generate invoice PDF and return as base64 (for mobile apps)
 */
router.post('/:id/invoice-base64', verifyToken, async (req, res, next) => {
    try {
        const [[sale]] = await db.query(
            'SELECT * FROM obat_sales WHERE id = ?',
            [req.params.id]
        );

        if (!sale) {
            return res.status(404).json({ success: false, message: 'Sale not found' });
        }

        if (!['confirmed', 'payment_pending', 'paid'].includes(sale.status)) {
            return res.status(400).json({
                success: false,
                message: 'Invoice hanya bisa dibuat untuk penjualan yang sudah dikonfirmasi'
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

        // Get the PDF from R2 as buffer
        const r2Storage = require('../services/r2Storage');
        const pdfBuffer = await r2Storage.getFileBuffer(result.r2Key);

        if (!pdfBuffer) {
            return res.status(500).json({
                success: false,
                message: 'Gagal mengambil PDF dari storage'
            });
        }

        // Convert to base64
        const base64 = pdfBuffer.toString('base64');

        logger.info('Obat sale invoice generated as base64', {
            saleNumber: sale.sale_number,
            size: pdfBuffer.length
        });

        res.json({
            success: true,
            filename: result.filename,
            base64: base64,
            mimeType: 'application/pdf'
        });
    } catch (error) {
        logger.error('Failed to generate obat sale invoice base64', { error: error.message });
        next(error);
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

        if (!['confirmed', 'payment_pending', 'paid'].includes(sale.status)) {
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

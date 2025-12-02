// Backend API for Obat (Medications)
// Save as: ~/dibyaklinik-backend/routes/obat.js

const express = require('express');
const router = express.Router();
const db = require('../db'); // Your database connection
const cache = require('../utils/cache');
const { verifyToken, requireMenuAccess } = require('../middleware/auth');
const { validateObat, validateObatUpdate } = require('../middleware/validation');

// ==================== OBAT ENDPOINTS ====================

// GET ALL OBAT (Protected - requires obat_alkes menu access)
router.get('/api/obat', verifyToken, requireMenuAccess('obat_alkes'), async (req, res) => {
    try {
        const { category, active } = req.query;
        
        // Generate cache key
        const cacheKey = `obat:list:${category || 'all'}:${active || 'active-only'}`;
        
        // Try to get from cache
        const cached = cache.get(cacheKey, 'medium');
        if (cached) {
            return res.json(cached);
        }
        
        let query = `
            SELECT o.*, s.id as supplier_id, s.code as supplier_code, s.name as supplier_name
            FROM obat o
            LEFT JOIN suppliers s ON o.default_supplier_id = s.id
            WHERE 1=1
        `;
        const params = [];

        if (category) {
            query += ' AND o.category = ?';
            params.push(category);
        }

        // Default to showing only active items unless explicitly requested
        if (active === 'false') {
            query += ' AND o.is_active = 0';
        } else if (active === 'all') {
            // Show all items (active and inactive)
        } else {
            // Default: show only active items
            query += ' AND o.is_active = 1';
        }

        query += ' ORDER BY o.category, o.name';

        const [rows] = await db.query(query, params);
        
        const response = {
            success: true,
            data: rows,
            count: rows.length
        };
        
        // Cache the result (medium TTL since obat changes less frequently)
        cache.set(cacheKey, response, 'medium');
        
        res.json(response);
    } catch (error) {
        console.error('Error fetching public obat:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch obat',
            error: error.message
        });
    }
});

// GET OBAT BY ID (Protected)
router.get('/api/obat/:id', verifyToken, requireMenuAccess('obat_alkes'), async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM obat WHERE id = ?', [req.params.id]);
        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Obat not found' });
        }
        res.json({ success: true, data: rows[0] });
    } catch (error) {
        console.error('Error fetching obat by ID:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch obat', error: error.message });
    }
});

// ==================== PROTECTED ENDPOINTS (WRITE) ====================
// Note: Add authentication middleware here if needed

// ADD NEW OBAT
router.post('/api/obat', verifyToken, requireMenuAccess('obat_alkes'), validateObat, async (req, res) => {
    try {
        const { code, name, category, price, stock, unit, min_stock } = req.body;
        
        if (!code || !name || !category || price === undefined) {
            return res.status(400).json({ 
                success: false, 
                message: 'Missing required fields: code, name, category, price' 
            });
        }
        
        const [result] = await db.query(
            'INSERT INTO obat (code, name, category, price, stock, unit, min_stock) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [code, name, category, price, stock || 0, unit || 'tablet', min_stock || 10]
        );
        
        // Invalidate obat cache
        cache.delPattern('obat:');
        
        res.status(201).json({ 
            success: true, 
            message: 'Obat added successfully', 
            id: result.insertId 
        });
    } catch (error) {
        console.error('Error adding obat:', error);
        
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ 
                success: false, 
                message: 'Kode obat sudah digunakan' 
            });
        }
        
        res.status(500).json({ 
            success: false, 
            message: 'Failed to add obat', 
            error: error.message 
        });
    }
});

// UPDATE OBAT
router.put('/api/obat/:id', verifyToken, requireMenuAccess('obat_alkes'), validateObatUpdate, async (req, res) => {
    try {
        const { name, category, price, stock, unit, min_stock, is_active, default_supplier_id } = req.body;

        const [result] = await db.query(
            `UPDATE obat SET name = ?, category = ?, price = ?, stock = ?, unit = ?, min_stock = ?, is_active = ?, default_supplier_id = ? WHERE id = ?`,
            [name, category, price, stock, unit, min_stock, is_active, default_supplier_id || null, req.params.id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Obat not found' });
        }

        // Invalidate obat cache
        cache.delPattern('obat:');

        res.json({ success: true, message: 'Obat updated successfully' });
    } catch (error) {
        console.error('Error updating obat:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update obat',
            error: error.message
        });
    }
});

// UPDATE STOCK (for deducting after finalization or manual adjustment)
router.patch('/api/obat/:id/stock', async (req, res) => {
    try {
        const { quantity, adjustment } = req.body;
        
        // Support both quantity (for deduction) and adjustment (for +/- changes)
        if (quantity === undefined && adjustment === undefined) {
            return res.status(400).json({ 
                success: false, 
                message: 'Quantity or adjustment is required' 
            });
        }
        
        // Get current stock
        const [rows] = await db.query('SELECT stock, name FROM obat WHERE id = ?', [req.params.id]);
        
        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Obat not found' });
        }
        
        const currentStock = rows[0].stock;
        let newStock;
        
        if (adjustment !== undefined) {
            // Manual adjustment: add or subtract
            newStock = currentStock + parseInt(adjustment);
        } else {
            // Quantity deduction: subtract quantity
            newStock = currentStock - quantity;
        }
        
        if (newStock < 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'Stok tidak mencukupi',
                currentStock,
                requested: quantity || adjustment
            });
        }
        
        // Update stock
        await db.query('UPDATE obat SET stock = ? WHERE id = ?', [newStock, req.params.id]);
        
        // Invalidate cache
        cache.delPattern('obat:');
        
        res.json({ 
            success: true, 
            message: 'Stock updated successfully',
            obatName: rows[0].name,
            oldStock: currentStock,
            newStock: newStock,
            change: newStock - currentStock
        });
    } catch (error) {
        console.error('Error updating stock:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to update stock', 
            error: error.message 
        });
    }
});

// DELETE OBAT
router.delete('/api/obat/:id', verifyToken, requireMenuAccess('obat_alkes'), async (req, res) => {
    try {
        // Soft delete - set is_active to 0 instead of actually deleting
        const [result] = await db.query('UPDATE obat SET is_active = 0 WHERE id = ? AND is_active = 1', [req.params.id]);
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Obat not found or already deleted' });
        }
        
        // Invalidate obat cache
        cache.delPattern('obat:');
        
        res.json({ success: true, message: 'Obat deleted successfully' });
    } catch (error) {
        console.error('Error deleting obat:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to delete obat', 
            error: error.message 
        });
    }
});

// GET LOW STOCK ITEMS
router.get('/public/obat/low-stock', async (req, res) => {
    try {
        const [rows] = await db.query(
            'SELECT * FROM obat WHERE stock <= min_stock AND is_active = 1 ORDER BY stock ASC'
        );

        res.json({
            success: true,
            data: rows,
            count: rows.length
        });
    } catch (error) {
        console.error('Error fetching low stock:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch low stock items',
            error: error.message
        });
    }
});

// ==================== DOWNLOAD PRICE LIST PDF ====================
const pdfGenerator = require('../utils/pdf-generator');

router.get('/api/obat/download/price-list', verifyToken, requireMenuAccess('obat_alkes'), async (req, res) => {
    try {
        // Fetch all active obat
        const [rows] = await db.query(
            'SELECT * FROM obat WHERE is_active = 1 ORDER BY category, name'
        );

        // Generate PDF
        const pdfBuffer = await pdfGenerator.generateObatPriceList(rows);

        // Send PDF
        const filename = `Daftar_Harga_Obat_${new Date().toISOString().split('T')[0]}.pdf`;
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Length', pdfBuffer.length);
        res.send(pdfBuffer);

    } catch (error) {
        console.error('Error generating obat price list PDF:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to generate PDF',
            error: error.message
        });
    }
});

module.exports = router;


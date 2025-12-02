// API Endpoints for Tindakan
// Add this to your existing server/index.js or create new routes file

const express = require('express');
const router = express.Router();
const db = require('../db'); // Your database connection
const cache = require('../utils/cache');
const { verifyToken } = require('../middleware/auth');
const { validateTindakan } = require('../middleware/validation');

// ==================== GET ALL TINDAKAN ====================
router.get('/api/tindakan', verifyToken, async (req, res) => {
    try {
        const { category, active } = req.query;
        
        let query = 'SELECT * FROM tindakan WHERE 1=1';
        const params = [];
        
        if (category) {
            query += ' AND category = ?';
            params.push(category);
        }
        
        // Default to showing only active items unless explicitly requested
        if (active === 'false') {
            query += ' AND is_active = 0';
        } else if (active === 'all') {
            // Show all items (active and inactive)
        } else {
            // Default: show only active items
            query += ' AND is_active = 1';
        }
        
        query += ' ORDER BY CASE category ' +
                 'WHEN "ADMINISTRATIF" THEN 1 ' +
                 'WHEN "LAYANAN" THEN 2 ' +
                 'WHEN "TINDAKAN MEDIS" THEN 3 ' +
                 'WHEN "KONTRASEPSI" THEN 4 ' +
                 'WHEN "VAKSINASI" THEN 5 ' +
                 'WHEN "LABORATORIUM" THEN 6 ' +
                 'END, name';
        
        const [rows] = await db.query(query, params);
        
        res.json({
            success: true,
            data: rows,
            count: rows.length
        });
    } catch (error) {
        console.error('Error fetching tindakan:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch tindakan',
            error: error.message
        });
    }
});

// ==================== GET ONE TINDAKAN ====================
router.get('/api/tindakan/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const [rows] = await db.query('SELECT * FROM tindakan WHERE id = ?', [id]);
        
        if (rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Tindakan not found'
            });
        }
        
        res.json({
            success: true,
            data: rows[0]
        });
    } catch (error) {
        console.error('Error fetching tindakan:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch tindakan',
            error: error.message
        });
    }
});

// ==================== CREATE TINDAKAN ====================
router.post('/api/tindakan', verifyToken, validateTindakan, async (req, res) => {
    try {
        let { code, name, category, price, created_by } = req.body;
        
        // Validation
        if (!name || !category || !price) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: name, category, price'
            });
        }
        
        // Auto-generate code if not provided
        if (!code) {
            // Get highest code number from all tindakan (including inactive)
            const [maxCode] = await db.query(
                'SELECT code FROM tindakan WHERE code LIKE "S%" ORDER BY CAST(SUBSTRING(code, 2) AS UNSIGNED) DESC LIMIT 1'
            );
            
            let nextNum = 1;
            if (maxCode.length > 0 && maxCode[0].code) {
                const currentNum = parseInt(maxCode[0].code.substring(1));
                nextNum = currentNum + 1;
            }
            
            code = 'S' + String(nextNum).padStart(2, '0');
            
            // Double check the generated code doesn't exist (race condition protection)
            const [existing] = await db.query('SELECT id FROM tindakan WHERE code = ?', [code]);
            if (existing.length > 0) {
                // Try next number
                nextNum++;
                code = 'S' + String(nextNum).padStart(2, '0');
            }
        } else {
            // Check if provided code already exists
            const [existing] = await db.query('SELECT id FROM tindakan WHERE code = ?', [code]);
            if (existing.length > 0) {
                return res.status(409).json({
                    success: false,
                    message: 'Tindakan code already exists'
                });
            }
        }
        
        const [result] = await db.query(
            'INSERT INTO tindakan (code, name, category, price, created_by) VALUES (?, ?, ?, ?, ?)',
            [code, name, category, price, created_by || null]
        );
        
        res.status(201).json({
            success: true,
            message: 'Tindakan created successfully',
            data: {
                id: result.insertId,
                code,
                name,
                category,
                price
            }
        });
    } catch (error) {
        console.error('Error creating tindakan:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create tindakan',
            error: error.message
        });
    }
});

// ==================== UPDATE TINDAKAN ====================
router.put('/api/tindakan/:id', verifyToken, validateTindakan, async (req, res) => {
    try {
        const { id } = req.params;
        const { name, category, price, is_active, updated_by } = req.body;
        
        // Check if tindakan exists
        const [existing] = await db.query('SELECT id FROM tindakan WHERE id = ?', [id]);
        if (existing.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Tindakan not found'
            });
        }
        
        // Build update query dynamically
        const updates = [];
        const params = [];
        
        if (name !== undefined) {
            updates.push('name = ?');
            params.push(name);
        }
        if (category !== undefined) {
            updates.push('category = ?');
            params.push(category);
        }
        if (price !== undefined) {
            updates.push('price = ?');
            params.push(price);
        }
        if (is_active !== undefined) {
            updates.push('is_active = ?');
            params.push(is_active ? 1 : 0);
        }
        if (updated_by !== undefined) {
            updates.push('updated_by = ?');
            params.push(updated_by);
        }
        
        if (updates.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No fields to update'
            });
        }
        
        params.push(id);
        const query = `UPDATE tindakan SET ${updates.join(', ')} WHERE id = ?`;
        
        await db.query(query, params);
        
        res.json({
            success: true,
            message: 'Tindakan updated successfully'
        });
    } catch (error) {
        console.error('Error updating tindakan:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update tindakan',
            error: error.message
        });
    }
});

// ==================== DELETE TINDAKAN ====================
router.delete('/api/tindakan/:id', verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        
        // Check if tindakan exists
        const [existing] = await db.query('SELECT id FROM tindakan WHERE id = ?', [id]);
        if (existing.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Tindakan not found'
            });
        }
        
        // Soft delete (set is_active = false) instead of hard delete
        await db.query('UPDATE tindakan SET is_active = 0 WHERE id = ?', [id]);
        
        // Invalidate tindakan cache
        cache.delPattern('tindakan:');
        
        res.json({
            success: true,
            message: 'Tindakan deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting tindakan:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete tindakan',
            error: error.message
        });
    }
});

// ==================== GET TINDAKAN BY CATEGORY ====================
router.get('/api/tindakan/category/:category', async (req, res) => {
    try {
        const { category } = req.params;
        
        const [rows] = await db.query(
            'SELECT * FROM tindakan WHERE category = ? AND is_active = 1 ORDER BY name',
            [category]
        );
        
        res.json({
            success: true,
            data: rows,
            count: rows.length
        });
    } catch (error) {
        console.error('Error fetching tindakan by category:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch tindakan',
            error: error.message
        });
    }
});

// ==================== GET CATEGORIES ====================
router.get('/api/tindakan/meta/categories', async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT 
                category,
                COUNT(*) as count,
                MIN(price) as min_price,
                MAX(price) as max_price
            FROM tindakan
            WHERE is_active = 1
            GROUP BY category
            ORDER BY CASE category
                WHEN 'ADMINISTRATIF' THEN 1
                WHEN 'LAYANAN' THEN 2
                WHEN 'TINDAKAN MEDIS' THEN 3
                WHEN 'KONTRASEPSI' THEN 4
                WHEN 'VAKSINASI' THEN 5
                WHEN 'LABORATORIUM' THEN 6
            END`
        );
        
        res.json({
            success: true,
            data: rows
        });
    } catch (error) {
        console.error('Error fetching categories:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch categories',
            error: error.message
        });
    }
});

// ==================== DOWNLOAD PRICE LIST PDF ====================
const pdfGenerator = require('../utils/pdf-generator');

router.get('/api/tindakan/download/price-list', verifyToken, async (req, res) => {
    try {
        // Fetch all active tindakan
        const [rows] = await db.query(
            `SELECT * FROM tindakan WHERE is_active = 1
             ORDER BY CASE category
                WHEN 'ADMINISTRATIF' THEN 1
                WHEN 'LAYANAN' THEN 2
                WHEN 'TINDAKAN MEDIS' THEN 3
                WHEN 'KONTRASEPSI' THEN 4
                WHEN 'VAKSINASI' THEN 5
                WHEN 'LABORATORIUM' THEN 6
             END, name`
        );

        // Generate PDF
        const pdfBuffer = await pdfGenerator.generateTindakanPriceList(rows);

        // Send PDF
        const filename = `Daftar_Harga_Tindakan_${new Date().toISOString().split('T')[0]}.pdf`;
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Length', pdfBuffer.length);
        res.send(pdfBuffer);

    } catch (error) {
        console.error('Error generating tindakan price list PDF:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to generate PDF',
            error: error.message
        });
    }
});

module.exports = router;


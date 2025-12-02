const express = require('express');
const router = express.Router();

// Database connection
const db = require('../db');
const { verifyToken } = require('../middleware/auth');

// GET ALL TINDAKAN (Now requires authentication)
router.get('/public/tindakan', verifyToken, async (req, res) => {
    try {
        const { category } = req.query;
        
        let query = 'SELECT id, code, name, category, price FROM tindakan WHERE is_active = 1';
        const params = [];
        
        if (category) {
            query += ' AND category = ?';
            params.push(category);
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
        console.error('Error fetching public tindakan:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch tindakan',
            error: error.message
        });
    }
});

// Health check
router.get('/public/health', (req, res) => {
    res.json({
        success: true,
        message: 'Public API is running',
        timestamp: new Date().toISOString()
    });
});

module.exports = router;

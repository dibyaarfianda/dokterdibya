// routes/visits.js
const express = require('express');
const router = express.Router();
const pool = require('../db');
const { verifyToken, requireSuperadmin } = require('../middleware/auth');

// ==================== VISITS ROUTES ====================

// GET all visits (with optional filters)
router.get('/', verifyToken, async (req, res) => {
    try {
        const { patient_id, start_date, end_date, exclude_dummy } = req.query;
        
        let query = 'SELECT * FROM visits WHERE 1=1';
        const params = [];
        
        if (patient_id) {
            query += ' AND patient_id = ?';
            params.push(patient_id);
        }
        
        if (start_date) {
            query += ' AND visit_date >= ?';
            params.push(start_date);
        }
        
        if (end_date) {
            query += ' AND visit_date <= ?';
            params.push(end_date);
        }
        
        if (exclude_dummy === 'true') {
            query += ' AND is_dummy = 0';
        }
        
        query += ' ORDER BY visit_date DESC';
        
        const [rows] = await pool.query(query, params);
        
        // Parse JSON fields
        const visits = rows.map(row => ({
            ...row,
            services: row.services ? JSON.parse(row.services) : [],
            medications: row.medications ? JSON.parse(row.medications) : []
        }));
        
        res.json({
            success: true,
            data: visits
        });
    } catch (error) {
        console.error('Error fetching visits:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch visits',
            error: error.message
        });
    }
});

// GET single visit by ID
router.get('/:id', verifyToken, async (req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT * FROM visits WHERE id = ?',
            [req.params.id]
        );
        
        if (rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Visit not found'
            });
        }
        
        const visit = {
            ...rows[0],
            services: rows[0].services ? JSON.parse(rows[0].services) : [],
            medications: rows[0].medications ? JSON.parse(rows[0].medications) : []
        };
        
        res.json({
            success: true,
            data: visit
        });
    } catch (error) {
        console.error('Error fetching visit:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch visit',
            error: error.message
        });
    }
});

// ==================== PROTECTED ROUTES (require auth) ====================

// POST new visit
router.post('/', verifyToken, async (req, res) => {
    try {
        const {
            patient_id,
            patient_name,
            visit_date,
            examiner,
            services,
            medications,
            grand_total,
            is_dummy
        } = req.body;
        
        // Validation
        if (!patient_id || !patient_name) {
            return res.status(400).json({
                success: false,
                message: 'patient_id and patient_name are required'
            });
        }
        
        const [result] = await pool.query(
            `INSERT INTO visits 
            (patient_id, patient_name, visit_date, examiner, services, medications, grand_total, is_dummy) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                patient_id,
                patient_name,
                visit_date || new Date(),
                examiner || null,
                JSON.stringify(services || []),
                JSON.stringify(medications || []),
                grand_total || 0,
                is_dummy || false
            ]
        );
        
        res.status(201).json({
            success: true,
            message: 'Visit created successfully',
            data: {
                id: result.insertId,
                patient_id,
                patient_name
            }
        });
    } catch (error) {
        console.error('Error creating visit:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create visit',
            error: error.message
        });
    }
});

// PUT update visit
router.put('/:id', verifyToken, async (req, res) => {
    try {
        const {
            patient_name,
            visit_date,
            examiner,
            services,
            medications,
            grand_total,
            is_dummy
        } = req.body;
        
        const updates = [];
        const params = [];
        
        if (patient_name !== undefined) {
            updates.push('patient_name = ?');
            params.push(patient_name);
        }
        if (visit_date !== undefined) {
            updates.push('visit_date = ?');
            params.push(visit_date);
        }
        if (examiner !== undefined) {
            updates.push('examiner = ?');
            params.push(examiner);
        }
        if (services !== undefined) {
            updates.push('services = ?');
            params.push(JSON.stringify(services));
        }
        if (medications !== undefined) {
            updates.push('medications = ?');
            params.push(JSON.stringify(medications));
        }
        if (grand_total !== undefined) {
            updates.push('grand_total = ?');
            params.push(grand_total);
        }
        if (is_dummy !== undefined) {
            updates.push('is_dummy = ?');
            params.push(is_dummy);
        }
        
        if (updates.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No fields to update'
            });
        }
        
        params.push(req.params.id);
        
        const [result] = await pool.query(
            `UPDATE visits SET ${updates.join(', ')} WHERE id = ?`,
            params
        );
        
        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: 'Visit not found'
            });
        }
        
        res.json({
            success: true,
            message: 'Visit updated successfully'
        });
    } catch (error) {
        console.error('Error updating visit:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update visit',
            error: error.message
        });
    }
});

// DELETE visit (Superadmin/Dokter only)
router.delete('/:id', verifyToken, requireSuperadmin, async (req, res) => {
    try {
        const [result] = await pool.query(
            'DELETE FROM visits WHERE id = ?',
            [req.params.id]
        );
        
        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: 'Visit not found'
            });
        }
        
        res.json({
            success: true,
            message: 'Visit deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting visit:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete visit',
            error: error.message
        });
    }
});

// GET analytics/stats
router.get('/analytics/stats', verifyToken, async (req, res) => {
    try {
        const { start_date, end_date } = req.query;
        
        let dateFilter = '';
        const params = [];
        
        if (start_date && end_date) {
            dateFilter = 'AND visit_date BETWEEN ? AND ?';
            params.push(start_date, end_date);
        }
        
        // Total visits (exclude dummy)
        const [totalVisits] = await pool.query(
            `SELECT COUNT(*) as count FROM visits WHERE is_dummy = 0 ${dateFilter}`,
            params
        );
        
        // Total revenue (exclude dummy)
        const [totalRevenue] = await pool.query(
            `SELECT SUM(grand_total) as total FROM visits WHERE is_dummy = 0 ${dateFilter}`,
            params
        );
        
        // Average bill (exclude dummy)
        const [avgBill] = await pool.query(
            `SELECT AVG(grand_total) as average FROM visits WHERE is_dummy = 0 ${dateFilter}`,
            params
        );
        
        res.json({
            success: true,
            data: {
                total_visits: totalVisits[0].count || 0,
                total_revenue: totalRevenue[0].total || 0,
                average_bill: avgBill[0].average || 0
            }
        });
    } catch (error) {
        console.error('Error fetching analytics:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch analytics',
            error: error.message
        });
    }
});

module.exports = router;


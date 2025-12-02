// routes/medical-exams.js
const express = require('express');
const router = express.Router();
const pool = require('../db');
const { verifyToken } = require('../middleware/auth');

// ==================== MEDICAL EXAMS ROUTES ====================

// GET all medical exams (with optional filters)
router.get('/', verifyToken, async (req, res) => {
    try {
        const { patient_id, visit_id, exam_type, start_date, end_date } = req.query;
        
        let query = 'SELECT * FROM medical_exams WHERE 1=1';
        const params = [];
        
        if (patient_id) {
            query += ' AND patient_id = ?';
            params.push(patient_id);
        }
        
        if (visit_id) {
            query += ' AND visit_id = ?';
            params.push(visit_id);
        }
        
        if (exam_type) {
            query += ' AND exam_type = ?';
            params.push(exam_type);
        }
        
        if (start_date) {
            query += ' AND exam_date >= ?';
            params.push(start_date);
        }
        
        if (end_date) {
            query += ' AND exam_date <= ?';
            params.push(end_date);
        }
        
        query += ' ORDER BY exam_date DESC';
        
        const [rows] = await pool.query(query, params);
        
        // Parse JSON fields
        const exams = rows.map(row => ({
            ...row,
            exam_data: row.exam_data ? JSON.parse(row.exam_data) : {}
        }));
        
        res.json({
            success: true,
            data: exams
        });
    } catch (error) {
        console.error('Error fetching medical exams:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch medical exams',
            error: error.message
        });
    }
});

// GET single medical exam by ID
router.get('/:id', verifyToken, async (req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT * FROM medical_exams WHERE id = ?',
            [req.params.id]
        );
        
        if (rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Medical exam not found'
            });
        }
        
        const exam = {
            ...rows[0],
            exam_data: rows[0].exam_data ? JSON.parse(rows[0].exam_data) : {}
        };
        
        res.json({
            success: true,
            data: exam
        });
    } catch (error) {
        console.error('Error fetching medical exam:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch medical exam',
            error: error.message
        });
    }
});

// GET latest exam for patient by type
router.get('/patient/:patient_id/latest/:exam_type', verifyToken, async (req, res) => {
    try {
        const { patient_id, exam_type } = req.params;
        
        const [rows] = await pool.query(
            `SELECT * FROM medical_exams 
            WHERE patient_id = ? AND exam_type = ? 
            ORDER BY exam_date DESC 
            LIMIT 1`,
            [patient_id, exam_type]
        );
        
        if (rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'No exam found'
            });
        }
        
        const exam = {
            ...rows[0],
            exam_data: rows[0].exam_data ? JSON.parse(rows[0].exam_data) : {}
        };
        
        res.json({
            success: true,
            data: exam
        });
    } catch (error) {
        console.error('Error fetching latest exam:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch latest exam',
            error: error.message
        });
    }
});

// ==================== PROTECTED ROUTES (require auth) ====================

// POST new medical exam
router.post('/', verifyToken, async (req, res) => {
    try {
        const {
            patient_id,
            visit_id,
            exam_type,
            exam_data,
            examiner,
            exam_date
        } = req.body;
        
        // Validation
        if (!patient_id || !exam_type) {
            return res.status(400).json({
                success: false,
                message: 'patient_id and exam_type are required'
            });
        }
        
        // Validate exam_type
        const validTypes = ['anamnesa', 'physical', 'usg', 'lab'];
        if (!validTypes.includes(exam_type)) {
            return res.status(400).json({
                success: false,
                message: `exam_type must be one of: ${validTypes.join(', ')}`
            });
        }
        
        const [result] = await pool.query(
            `INSERT INTO medical_exams 
            (patient_id, visit_id, exam_type, exam_data, examiner, exam_date) 
            VALUES (?, ?, ?, ?, ?, ?)`,
            [
                patient_id,
                visit_id || null,
                exam_type,
                JSON.stringify(exam_data || {}),
                examiner || null,
                exam_date || new Date()
            ]
        );
        
        res.status(201).json({
            success: true,
            message: 'Medical exam created successfully',
            data: {
                id: result.insertId,
                patient_id,
                exam_type
            }
        });
    } catch (error) {
        console.error('Error creating medical exam:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create medical exam',
            error: error.message
        });
    }
});

// PUT update medical exam
router.put('/:id', verifyToken, async (req, res) => {
    try {
        const {
            visit_id,
            exam_data,
            examiner,
            exam_date
        } = req.body;
        
        const updates = [];
        const params = [];
        
        if (visit_id !== undefined) {
            updates.push('visit_id = ?');
            params.push(visit_id);
        }
        if (exam_data !== undefined) {
            updates.push('exam_data = ?');
            params.push(JSON.stringify(exam_data));
        }
        if (examiner !== undefined) {
            updates.push('examiner = ?');
            params.push(examiner);
        }
        if (exam_date !== undefined) {
            updates.push('exam_date = ?');
            params.push(exam_date);
        }
        
        if (updates.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No fields to update'
            });
        }
        
        params.push(req.params.id);
        
        const [result] = await pool.query(
            `UPDATE medical_exams SET ${updates.join(', ')} WHERE id = ?`,
            params
        );
        
        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: 'Medical exam not found'
            });
        }
        
        res.json({
            success: true,
            message: 'Medical exam updated successfully'
        });
    } catch (error) {
        console.error('Error updating medical exam:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update medical exam',
            error: error.message
        });
    }
});

// DELETE medical exam
router.delete('/:id', verifyToken, async (req, res) => {
    try {
        const [result] = await pool.query(
            'DELETE FROM medical_exams WHERE id = ?',
            [req.params.id]
        );
        
        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: 'Medical exam not found'
            });
        }
        
        res.json({
            success: true,
            message: 'Medical exam deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting medical exam:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete medical exam',
            error: error.message
        });
    }
});

// GET all exams for a specific visit
router.get('/visit/:visit_id/all', verifyToken, async (req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT * FROM medical_exams WHERE visit_id = ? ORDER BY exam_date ASC',
            [req.params.visit_id]
        );
        
        const exams = rows.map(row => ({
            ...row,
            exam_data: row.exam_data ? JSON.parse(row.exam_data) : {}
        }));
        
        res.json({
            success: true,
            data: exams
        });
    } catch (error) {
        console.error('Error fetching visit exams:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch visit exams',
            error: error.message
        });
    }
});

module.exports = router;


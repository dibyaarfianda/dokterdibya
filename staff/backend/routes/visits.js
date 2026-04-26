// routes/visits.js
const express = require('express');
const router = express.Router();
const pool = require('../db');
const { verifyToken, requireSuperadmin, requirePermission } = require('../middleware/auth');

// ==================== VISITS ROUTES ====================

// GET daily aggregated visit stats (lightweight endpoint for dashboard charts)
router.get('/stats/daily', verifyToken, requirePermission('visits.view'), async (req, res) => {
    try {
        const { patient_id, start_date, end_date, exclude_dummy } = req.query;

        if (exclude_dummy === 'true') {
            let query = `
                SELECT
                    DATE(scr.created_at) as visit_date,
                    COUNT(*) as count
                FROM sunday_clinic_records scr
                WHERE 1=1
            `;
            const params = [];

            if (patient_id) {
                query += ' AND scr.patient_id = ?';
                params.push(patient_id);
            }

            if (start_date) {
                query += ' AND scr.created_at >= ?';
                params.push(`${start_date} 00:00:00`);
            }

            if (end_date) {
                query += ' AND scr.created_at < DATE_ADD(?, INTERVAL 1 DAY)';
                params.push(end_date);
            }

            query += ' GROUP BY DATE(scr.created_at) ORDER BY visit_date ASC';

            const [rows] = await pool.query(query, params);

            return res.json({
                success: true,
                data: rows
            });
        }

        // Default aggregate from visits table
        let query = `
            SELECT
                DATE(v.visit_date) as visit_date,
                COUNT(*) as count
            FROM visits v
            WHERE 1=1
        `;
        const params = [];

        if (patient_id) {
            query += ' AND v.patient_id = ?';
            params.push(patient_id);
        }

        if (start_date) {
            query += ' AND v.visit_date >= ?';
            params.push(`${start_date} 00:00:00`);
        }

        if (end_date) {
            query += ' AND v.visit_date < DATE_ADD(?, INTERVAL 1 DAY)';
            params.push(end_date);
        }

        query += ' GROUP BY DATE(v.visit_date) ORDER BY visit_date ASC';

        const [rows] = await pool.query(query, params);

        res.json({
            success: true,
            data: rows
        });
    } catch (error) {
        console.error('Error fetching daily visit stats:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch daily visit stats',
            error: error.message
        });
    }
});

// GET all visits (with optional filters)
// When exclude_dummy=true, returns actual clinic visits from sunday_clinic_records
router.get('/', verifyToken, requirePermission('visits.view'), async (req, res) => {
    try {
        const { patient_id, start_date, end_date, exclude_dummy } = req.query;

        // When excluding dummy data, use sunday_clinic_records (actual clinic visits)
        if (exclude_dummy === 'true') {
            let query = `
                SELECT
                    scr.id,
                    scr.patient_id,
                    p.full_name as patient_name,
                    scr.created_at as visit_date,
                    scr.visit_location,
                    scr.mr_id,
                    COALESCE(scb.total, 0) as grand_total,
                    COALESCE(scb.total, 0) as total_amount,
                    (
                        SELECT JSON_ARRAYAGG(JSON_OBJECT(
                            'name', bi.item_name,
                            'quantity', bi.quantity,
                            'price', bi.price,
                            'total', bi.total
                        ))
                        FROM sunday_clinic_billing_items bi
                        WHERE bi.billing_id = scb.id
                        AND bi.item_type = 'obat'
                    ) as medications,
                    (
                        SELECT JSON_ARRAYAGG(JSON_OBJECT(
                            'name', bi.item_name,
                            'quantity', bi.quantity,
                            'price', bi.price,
                            'total', bi.total
                        ))
                        FROM sunday_clinic_billing_items bi
                        WHERE bi.billing_id = scb.id
                        AND bi.item_type = 'tindakan'
                    ) as services,
                    0 as is_dummy
                FROM sunday_clinic_records scr
                LEFT JOIN patients p ON scr.patient_id = p.id
                LEFT JOIN (
                    SELECT b1.*
                    FROM sunday_clinic_billings b1
                    INNER JOIN (
                        SELECT mr_id, MAX(id) AS latest_id
                        FROM sunday_clinic_billings
                        WHERE status IN ('paid', 'confirmed')
                        GROUP BY mr_id
                    ) b2 ON b1.id = b2.latest_id
                ) scb ON scb.mr_id = scr.mr_id
                WHERE 1=1
            `;
            const params = [];

            if (patient_id) {
                query += ' AND scr.patient_id = ?';
                params.push(patient_id);
            }

            if (start_date) {
                query += ' AND DATE(scr.created_at) >= ?';
                params.push(start_date);
            }

            if (end_date) {
                query += ' AND DATE(scr.created_at) <= ?';
                params.push(end_date);
            }

            query += ' ORDER BY scr.created_at DESC';

            const [rows] = await pool.query(query, params);

            return res.json({
                success: true,
                data: rows
            });
        }

        // Default: use visits table (includes intake forms)
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
router.get('/:id', verifyToken, requirePermission('visits.view'), async (req, res) => {
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
router.post('/', verifyToken, requirePermission('visits.create'), async (req, res) => {
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
router.put('/:id', verifyToken, requirePermission('visits.edit'), async (req, res) => {
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

// DELETE visit (requires visits.delete permission)
router.delete('/:id', verifyToken, requirePermission('visits.delete'), async (req, res) => {
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


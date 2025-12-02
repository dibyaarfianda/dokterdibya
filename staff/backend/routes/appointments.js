// routes/appointments.js
const express = require('express');
const router = express.Router();
const pool = require('../db');
const { verifyToken } = require('../middleware/auth');

// ==================== PUBLIC ROUTES ====================

// GET all appointments (with optional filters)
router.get('/', verifyToken, async (req, res) => {
    try {
        const { patient_id, start_date, end_date, status, today_only } = req.query;
        
        let query = 'SELECT * FROM appointments WHERE 1=1';
        const params = [];
        
        if (patient_id) {
            query += ' AND patient_id = ?';
            params.push(patient_id);
        }
        
        if (start_date) {
            query += ' AND appointment_date >= ?';
            params.push(start_date);
        }
        
        if (end_date) {
            query += ' AND appointment_date <= ?';
            params.push(end_date);
        }
        
        if (status) {
            query += ' AND status = ?';
            params.push(status);
        }
        
        if (today_only === 'true') {
            query += ' AND appointment_date = CURDATE()';
        }
        
        query += ' ORDER BY appointment_date ASC, appointment_time ASC';
        
        const [rows] = await pool.query(query, params);
        
        res.json({
            success: true,
            data: rows
        });
    } catch (error) {
        console.error('Error fetching appointments:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch appointments',
            error: error.message
        });
    }
});

// GET appointments by hospital location
router.get('/hospital/:location', verifyToken, async (req, res) => {
    try {
        const { location } = req.params;

        // Get appointments for this hospital, upcoming first
        const [rows] = await pool.query(`
            SELECT
                id, patient_id, patient_name, hospital_location, appointment_date,
                appointment_time, appointment_type, location, notes, complaint,
                detected_category, status, created_at
            FROM appointments
            WHERE hospital_location = ?
            AND appointment_date >= CURDATE()
            ORDER BY appointment_date ASC, appointment_time ASC
        `, [location]);

        res.json({
            success: true,
            appointments: rows
        });
    } catch (error) {
        console.error('Error fetching hospital appointments:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch hospital appointments',
            error: error.message
        });
    }
});

// GET single appointment by ID
router.get('/:id', async (req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT * FROM appointments WHERE id = ?',
            [req.params.id]
        );
        
        if (rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Appointment not found'
            });
        }
        
        res.json({
            success: true,
            data: rows[0]
        });
    } catch (error) {
        console.error('Error fetching appointment:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch appointment',
            error: error.message
        });
    }
});

// GET latest appointment for a specific patient
router.get('/patient/:patient_id/latest', verifyToken, async (req, res) => {
    try {
        const [rows] = await pool.query(
            `SELECT * FROM appointments 
             WHERE patient_id = ? 
             ORDER BY appointment_date DESC, appointment_time DESC 
             LIMIT 1`,
            [req.params.patient_id]
        );
        
        if (rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'No appointments found for this patient'
            });
        }
        
        res.json({
            success: true,
            data: rows[0]
        });
    } catch (error) {
        console.error('Error fetching latest appointment:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch latest appointment',
            error: error.message
        });
    }
});

// ==================== PROTECTED ROUTES (require auth) ====================

// POST new appointment
router.post('/', verifyToken, async (req, res) => {
    try {
        const {
            patient_id,
            patient_name,
            appointment_date,
            appointment_time,
            appointment_type,
            location,
            notes,
            whatsapp_reminder,
            reminder_time,
            created_by
        } = req.body;
        
        // Validation
        if (!patient_id || !patient_name || !appointment_date || !appointment_time) {
            return res.status(400).json({
                success: false,
                message: 'patient_id, patient_name, appointment_date, and appointment_time are required'
            });
        }
        
        // Check for existing appointment at same time
        const [existing] = await pool.query(
            'SELECT id FROM appointments WHERE appointment_date = ? AND appointment_time = ? AND status IN (?, ?)',
            [appointment_date, appointment_time, 'scheduled', 'confirmed']
        );
        
        if (existing.length > 0) {
            return res.status(409).json({
                success: false,
                message: 'Appointment slot already booked'
            });
        }
        
        // Insert appointment
        const [result] = await pool.query(
            `INSERT INTO appointments (
                patient_id, patient_name, appointment_date, appointment_time, 
                appointment_type, location, notes, whatsapp_reminder, 
                reminder_time, created_by, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                patient_id,
                patient_name,
                appointment_date,
                appointment_time,
                appointment_type || 'Konsultasi',
                location || 'Klinik',
                notes || null,
                whatsapp_reminder || false,
                reminder_time || 60,
                created_by || 'System',
                'scheduled'
            ]
        );
        
        // Get created appointment
        const [appointment] = await pool.query(
            'SELECT * FROM appointments WHERE id = ?',
            [result.insertId]
        );
        
        res.status(201).json({
            success: true,
            message: 'Appointment created successfully',
            data: appointment[0]
        });
    } catch (error) {
        console.error('Error creating appointment:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create appointment',
            error: error.message
        });
    }
});

// PATCH update appointment status only
router.patch('/:id/status', verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        // Validate status
        const validStatuses = ['scheduled', 'confirmed', 'completed', 'cancelled', 'no_show'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Status tidak valid'
            });
        }

        // Check if appointment exists
        const [existing] = await pool.query(
            'SELECT * FROM appointments WHERE id = ?',
            [id]
        );

        if (existing.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Appointment tidak ditemukan'
            });
        }

        // Update status
        await pool.query(
            'UPDATE appointments SET status = ?, updated_at = NOW() WHERE id = ?',
            [status, id]
        );

        res.json({
            success: true,
            message: 'Status appointment berhasil diupdate'
        });
    } catch (error) {
        console.error('Error updating appointment status:', error);
        res.status(500).json({
            success: false,
            message: 'Gagal mengupdate status appointment',
            error: error.message
        });
    }
});

// PUT update appointment
router.put('/:id', verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        const {
            appointment_date,
            appointment_time,
            appointment_type,
            location,
            notes,
            status,
            whatsapp_reminder,
            reminder_time
        } = req.body;
        
        // Check if appointment exists
        const [existing] = await pool.query(
            'SELECT * FROM appointments WHERE id = ?',
            [id]
        );
        
        if (existing.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Appointment not found'
            });
        }
        
        // Check for slot conflict if date/time changed
        if (appointment_date || appointment_time) {
            const checkDate = appointment_date || existing[0].appointment_date;
            const checkTime = appointment_time || existing[0].appointment_time;
            
            const [conflicts] = await pool.query(
                'SELECT id FROM appointments WHERE appointment_date = ? AND appointment_time = ? AND id != ? AND status IN (?, ?)',
                [checkDate, checkTime, id, 'scheduled', 'confirmed']
            );
            
            if (conflicts.length > 0) {
                return res.status(409).json({
                    success: false,
                    message: 'Appointment slot already booked'
                });
            }
        }
        
        // Build update query dynamically
        const updates = [];
        const values = [];
        
        if (appointment_date) { updates.push('appointment_date = ?'); values.push(appointment_date); }
        if (appointment_time) { updates.push('appointment_time = ?'); values.push(appointment_time); }
        if (appointment_type) { updates.push('appointment_type = ?'); values.push(appointment_type); }
        if (location !== undefined) { updates.push('location = ?'); values.push(location); }
        if (notes !== undefined) { updates.push('notes = ?'); values.push(notes || null); }
        if (status) { updates.push('status = ?'); values.push(status); }
        if (whatsapp_reminder !== undefined) { updates.push('whatsapp_reminder = ?'); values.push(whatsapp_reminder); }
        if (reminder_time !== undefined) { updates.push('reminder_time = ?'); values.push(reminder_time); }
        
        if (updates.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No fields to update'
            });
        }
        
        values.push(id);
        
        await pool.query(
            `UPDATE appointments SET ${updates.join(', ')} WHERE id = ?`,
            values
        );
        
        // Get updated appointment
        const [appointment] = await pool.query(
            'SELECT * FROM appointments WHERE id = ?',
            [id]
        );
        
        res.json({
            success: true,
            message: 'Appointment updated successfully',
            data: appointment[0]
        });
    } catch (error) {
        console.error('Error updating appointment:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update appointment',
            error: error.message
        });
    }
});

// DELETE appointment
router.delete('/:id', verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        
        // Check if appointment exists
        const [existing] = await pool.query(
            'SELECT * FROM appointments WHERE id = ?',
            [id]
        );
        
        if (existing.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Appointment not found'
            });
        }
        
        // Soft delete by setting status to cancelled
        await pool.query(
            'UPDATE appointments SET status = ? WHERE id = ?',
            ['cancelled', id]
        );
        
        res.json({
            success: true,
            message: 'Appointment cancelled successfully'
        });
    } catch (error) {
        console.error('Error deleting appointment:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete appointment',
            error: error.message
        });
    }
});

// HARD DELETE - Permanently remove appointment from database
router.delete('/:id/permanent', verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        
        // Check if appointment exists
        const [existing] = await pool.query(
            'SELECT * FROM appointments WHERE id = ?',
            [id]
        );
        
        if (existing.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Appointment not found'
            });
        }
        
        // Permanently delete from database
        await pool.query('DELETE FROM appointments WHERE id = ?', [id]);
        
        res.json({
            success: true,
            message: 'Appointment permanently deleted'
        });
    } catch (error) {
        console.error('Error permanently deleting appointment:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to permanently delete appointment',
            error: error.message
        });
    }
});

module.exports = router;


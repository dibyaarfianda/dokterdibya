const express = require('express');
const router = express.Router();
const db = require('../db');
const { verifyToken, requireSuperadmin } = require('../middleware/auth');

/**
 * GET /api/appointment-archive
 * Get archived appointments with optional filters
 */
router.get('/', verifyToken, async (req, res) => {
    try {
        const {
            start_date,
            end_date,
            status,
            patient_id,
            patient_name,
            limit = 100,
            offset = 0
        } = req.query;

        let query = 'SELECT * FROM sunday_appointments_archive WHERE 1=1';
        const params = [];

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

        if (patient_id) {
            query += ' AND patient_id = ?';
            params.push(patient_id);
        }

        if (patient_name) {
            query += ' AND patient_name LIKE ?';
            params.push(`%${patient_name}%`);
        }

        query += ' ORDER BY appointment_date DESC, session ASC, slot_number ASC';
        query += ' LIMIT ? OFFSET ?';
        params.push(parseInt(limit), parseInt(offset));

        const [appointments] = await db.query(query, params);

        // Get total count
        let countQuery = 'SELECT COUNT(*) as total FROM sunday_appointments_archive WHERE 1=1';
        const countParams = [];

        if (start_date) {
            countQuery += ' AND appointment_date >= ?';
            countParams.push(start_date);
        }

        if (end_date) {
            countQuery += ' AND appointment_date <= ?';
            countParams.push(end_date);
        }

        if (status) {
            countQuery += ' AND status = ?';
            countParams.push(status);
        }

        if (patient_id) {
            countQuery += ' AND patient_id = ?';
            countParams.push(patient_id);
        }

        if (patient_name) {
            countQuery += ' AND patient_name LIKE ?';
            countParams.push(`%${patient_name}%`);
        }

        const [countResult] = await db.query(countQuery, countParams);
        const total = countResult[0].total;

        res.json({
            success: true,
            data: appointments,
            total: total,
            limit: parseInt(limit),
            offset: parseInt(offset)
        });

    } catch (error) {
        console.error('Error fetching archived appointments:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch archived appointments',
            error: error.message
        });
    }
});

/**
 * POST /api/appointment-archive/archive-single/:id
 * Archive a single appointment by ID
 */
router.post('/archive-single/:id', verifyToken, async (req, res) => {
    try {
        const appointmentId = req.params.id;
        const { archived_reason = 'Manually archived by staff' } = req.body;

        // Get appointment from main table
        const [appointments] = await db.query(
            'SELECT * FROM sunday_appointments WHERE id = ?',
            [appointmentId]
        );

        if (appointments.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Appointment not found'
            });
        }

        const appointment = appointments[0];

        // Only allow archiving cancelled, completed, or no_show appointments
        if (!['cancelled', 'completed', 'no_show'].includes(appointment.status)) {
            return res.status(400).json({
                success: false,
                message: 'Only cancelled, completed, or no-show appointments can be archived'
            });
        }

        // Insert into archive
        await db.query(
            `INSERT INTO sunday_appointments_archive
            (id, patient_id, patient_name, patient_phone, appointment_date, session,
             slot_number, chief_complaint, status, notes, cancellation_reason,
             cancelled_by, cancelled_at, created_at, updated_at, archived_at, archived_reason)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?)`,
            [
                appointment.id, appointment.patient_id, appointment.patient_name,
                appointment.patient_phone, appointment.appointment_date, appointment.session,
                appointment.slot_number, appointment.chief_complaint, appointment.status,
                appointment.notes, appointment.cancellation_reason, appointment.cancelled_by,
                appointment.cancelled_at, appointment.created_at, appointment.updated_at,
                archived_reason
            ]
        );

        // Delete from main table
        await db.query(
            'DELETE FROM sunday_appointments WHERE id = ?',
            [appointmentId]
        );

        res.json({
            success: true,
            message: 'Appointment archived successfully',
            appointment: appointment
        });

    } catch (error) {
        console.error('Error archiving single appointment:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to archive appointment',
            error: error.message
        });
    }
});

/**
 * POST /api/appointment-archive/archive-old
 * Archive old appointments (cancelled/completed/no-show) older than specified days
 */
router.post('/archive-old', verifyToken, async (req, res) => {
    try {
        const { days_old = 7, status = 'all' } = req.body;

        const [result] = await db.query(
            'CALL archive_old_appointments(?, ?)',
            [parseInt(days_old), status]
        );

        const archived = result[0][0];

        res.json({
            success: true,
            message: `Successfully archived ${archived.archived_appointments} old appointments`,
            archived_count: archived.archived_appointments,
            deleted_count: archived.deleted_from_main_table
        });

    } catch (error) {
        console.error('Error archiving old appointments:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to archive old appointments',
            error: error.message
        });
    }
});

/**
 * POST /api/appointment-archive/restore/:id
 * Restore an archived appointment back to the main table
 */
router.post('/restore/:id', verifyToken, async (req, res) => {
    try {
        const appointmentId = req.params.id;

        // Get archived appointment
        const [archived] = await db.query(
            'SELECT * FROM sunday_appointments_archive WHERE id = ?',
            [appointmentId]
        );

        if (archived.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Archived appointment not found'
            });
        }

        const appointment = archived[0];

        // Check if slot is still available
        const [existing] = await db.query(
            'SELECT id FROM sunday_appointments WHERE appointment_date = ? AND session = ? AND slot_number = ?',
            [appointment.appointment_date, appointment.session, appointment.slot_number]
        );

        if (existing.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Slot is no longer available'
            });
        }

        // Restore to main table
        await db.query(
            `INSERT INTO sunday_appointments
            (id, patient_id, patient_name, patient_phone, appointment_date, session,
             slot_number, chief_complaint, status, notes, cancellation_reason,
             cancelled_by, cancelled_at, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
            [
                appointment.id, appointment.patient_id, appointment.patient_name,
                appointment.patient_phone, appointment.appointment_date, appointment.session,
                appointment.slot_number, appointment.chief_complaint, appointment.status,
                appointment.notes, appointment.cancellation_reason, appointment.cancelled_by,
                appointment.cancelled_at, appointment.created_at
            ]
        );

        // Remove from archive
        await db.query(
            'DELETE FROM sunday_appointments_archive WHERE id = ?',
            [appointmentId]
        );

        res.json({
            success: true,
            message: 'Appointment restored successfully',
            appointment: appointment
        });

    } catch (error) {
        console.error('Error restoring appointment:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to restore appointment',
            error: error.message
        });
    }
});

/**
 * DELETE /api/appointment-archive/:id
 * Permanently delete an archived appointment (Superadmin/Dokter only)
 */
router.delete('/:id', verifyToken, requireSuperadmin, async (req, res) => {
    try {
        const appointmentId = req.params.id;

        const [result] = await db.query(
            'DELETE FROM sunday_appointments_archive WHERE id = ?',
            [appointmentId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: 'Archived appointment not found'
            });
        }

        res.json({
            success: true,
            message: 'Archived appointment permanently deleted'
        });

    } catch (error) {
        console.error('Error deleting archived appointment:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete archived appointment',
            error: error.message
        });
    }
});

/**
 * GET /api/appointment-archive/stats
 * Get statistics about archived appointments
 */
router.get('/stats', verifyToken, async (req, res) => {
    try {
        const [stats] = await db.query(`
            SELECT
                COUNT(*) as total_archived,
                COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_count,
                COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_count,
                COUNT(CASE WHEN status = 'no_show' THEN 1 END) as no_show_count,
                MIN(appointment_date) as oldest_date,
                MAX(appointment_date) as newest_date,
                MIN(archived_at) as first_archived,
                MAX(archived_at) as last_archived
            FROM sunday_appointments_archive
        `);

        res.json({
            success: true,
            stats: stats[0]
        });

    } catch (error) {
        console.error('Error fetching archive stats:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch archive statistics',
            error: error.message
        });
    }
});

module.exports = router;

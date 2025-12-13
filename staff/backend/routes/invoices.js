const express = require('express');
const router = express.Router();
const db = require('../db');
const { verifyToken } = require('../middleware/auth');

/**
 * GET /api/invoices/history
 * Get invoice history with filters
 */
router.get('/history', verifyToken, async (req, res) => {
    try {
        const { start_date, end_date, status, search } = req.query;

        let query = `
            SELECT
                vi.*,
                p.full_name as patient_name
            FROM visit_invoices vi
            LEFT JOIN patients p ON vi.patient_id = p.id
            WHERE 1=1
        `;
        const params = [];

        // Filter by date range
        if (start_date) {
            query += ' AND vi.visit_date >= ?';
            params.push(start_date);
        }
        if (end_date) {
            query += ' AND vi.visit_date <= ?';
            params.push(end_date);
        }

        // Filter by status
        if (status) {
            query += ' AND vi.invoice_status = ?';
            params.push(status);
        }

        // Search by patient name or ID
        if (search) {
            query += ' AND (vi.patient_id LIKE ? OR p.full_name LIKE ?)';
            params.push(`%${search}%`, `%${search}%`);
        }

        // Order by date descending
        query += ' ORDER BY vi.visit_date DESC, vi.created_at DESC LIMIT 500';

        const [invoices] = await db.query(query, params);

        res.json({
            success: true,
            invoices,
            total: invoices.length
        });

    } catch (error) {
        console.error('Error fetching invoice history:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch invoice history',
            error: error.message
        });
    }
});

/**
 * GET /api/invoices/:id
 * Get single invoice by ID
 */
router.get('/:id', verifyToken, async (req, res) => {
    try {
        const { id } = req.params;

        const [invoices] = await db.query(`
            SELECT
                vi.*,
                p.full_name as patient_name,
                p.phone as patient_phone,
                p.whatsapp as patient_whatsapp
            FROM visit_invoices vi
            LEFT JOIN patients p ON vi.patient_id = p.id
            WHERE vi.id = ?
        `, [id]);

        if (invoices.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Invoice not found'
            });
        }

        res.json({
            success: true,
            invoice: invoices[0]
        });

    } catch (error) {
        console.error('Error fetching invoice:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch invoice',
            error: error.message
        });
    }
});

/**
 * PATCH /api/invoices/:id/status
 * Update invoice status
 */
router.patch('/:id/status', verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        if (!['pending', 'paid', 'cancelled'].includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid status'
            });
        }

        await db.query(
            'UPDATE visit_invoices SET invoice_status = ? WHERE id = ?',
            [status, id]
        );

        res.json({
            success: true,
            message: 'Invoice status updated'
        });

    } catch (error) {
        console.error('Error updating invoice status:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update invoice status',
            error: error.message
        });
    }
});

module.exports = router;

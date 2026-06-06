const express = require('express');
const router = express.Router();
const db = require('../db');
const { verifyToken } = require('../middleware/auth');
const r2Storage = require('../services/r2Storage');

/**
 * GET /api/invoices/history
 * Get invoice history from sunday_clinic_billings (PDF stored in R2)
 */
router.get('/history', verifyToken, async (req, res) => {
    try {
        const { start_date, end_date, status, search } = req.query;

        let query = `
            SELECT
                b.id,
                b.mr_id,
                b.patient_id,
                b.status,
                b.total,
                b.invoice_url,
                b.etiket_url,
                b.confirmed_by,
                b.confirmed_at,
                b.printed_at,
                b.printed_by,
                b.created_at,
                p.full_name as patient_name,
                r.created_at as visit_date,
                r.visit_location
            FROM sunday_clinic_billings b
            LEFT JOIN patients p ON p.id = b.patient_id
            LEFT JOIN sunday_clinic_records r ON r.mr_id = b.mr_id AND r.id = (SELECT MIN(id) FROM sunday_clinic_records WHERE mr_id = b.mr_id)
            WHERE b.invoice_url IS NOT NULL
        `;
        const params = [];

        if (start_date) {
            query += ' AND DATE(b.created_at) >= ?';
            params.push(start_date);
        }
        if (end_date) {
            query += ' AND DATE(b.created_at) <= ?';
            params.push(end_date);
        }
        if (status) {
            query += ' AND b.status = ?';
            params.push(status);
        }
        if (search) {
            query += ' AND (b.patient_id LIKE ? OR p.full_name LIKE ? OR b.mr_id LIKE ?)';
            params.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }

        query += ' ORDER BY b.created_at DESC LIMIT 500';

        const [rows] = await db.query(query, params);

        // Generate signed URLs for R2 keys (1 hour expiry)
        const invoices = await Promise.all(rows.map(async (row) => {
            let invoiceSignedUrl = null;
            let etiketSignedUrl = null;
            try {
                if (row.invoice_url) {
                    invoiceSignedUrl = await r2Storage.getSignedDownloadUrl(row.invoice_url, 3600);
                }
                if (row.etiket_url) {
                    etiketSignedUrl = await r2Storage.getSignedDownloadUrl(row.etiket_url, 3600);
                }
            } catch (e) {
                // signed URL generation failed — leave null
            }
            return {
                ...row,
                invoice_signed_url: invoiceSignedUrl,
                etiket_signed_url: etiketSignedUrl,
                invoice_number: row.mr_id,
                total_amount: row.total,
                invoice_status: row.status
            };
        }));

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

module.exports = router;

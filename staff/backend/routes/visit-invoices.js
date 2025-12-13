const express = require('express');
const router = express.Router();
const db = require('../db');
const { verifyToken, requireMenuAccess, JWT_SECRET } = require('../middleware/auth');
const jwt = require('jsonwebtoken');

// POST /api/visit-invoices - store invoice + etiket info after visit
router.post('/', verifyToken, requireMenuAccess('keuangan'), async (req, res) => {
    try {
        const {
            patient_id,
            visit_reference,
            visit_type,
            visit_date,
            invoice_number,
            invoice_url,
            etiket_url,
            total_amount,
            invoice_status = 'pending',
            notes = null
        } = req.body;

        if (!patient_id || !invoice_number || !invoice_url) {
            return res.status(400).json({
                success: false,
                message: 'patient_id, invoice_number, and invoice_url are required'
            });
        }

        const [result] = await db.query(
            `INSERT INTO visit_invoices (
                patient_id, visit_reference, visit_type, visit_date,
                invoice_number, invoice_url, etiket_url, total_amount,
                invoice_status, notes, created_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                patient_id,
                visit_reference || null,
                visit_type || 'Kunjungan Klinik',
                visit_date || null,
                invoice_number,
                invoice_url,
                etiket_url || null,
                total_amount || 0,
                invoice_status,
                notes || null,
                req.user?.id || null
            ]
        );

        const [rows] = await db.query('SELECT * FROM visit_invoices WHERE id = ?', [result.insertId]);

        res.status(201).json({
            success: true,
            data: rows[0]
        });
    } catch (error) {
        console.error('Error saving visit invoice:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to save visit invoice',
            error: error.message
        });
    }
});

// GET /api/visit-invoices/patient/:patientId - patient or staff access
router.get('/patient/:patientId', verifyToken, requireMenuAccess('keuangan'), async (req, res) => {
    try {
        const patientId = req.params.patientId;
        const requesterIsPatient = req.user?.role === 'patient';
        const requesterPatientId = req.user?.id || req.user?.patientId;

        if (requesterIsPatient && requesterPatientId !== patientId) {
            return res.status(403).json({
                success: false,
                message: 'Access to this patient data is forbidden'
            });
        }

        const [rows] = await db.query(
            `SELECT * FROM visit_invoices
             WHERE patient_id = ?
             ORDER BY visit_date DESC, created_at DESC`,
            [patientId]
        );

        res.json({
            success: true,
            count: rows.length,
            data: rows
        });
    } catch (error) {
        console.error('Error fetching visit invoices:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch visit invoices',
            error: error.message
        });
    }
});

// GET /api/visit-invoices/:id - detail view
router.get('/:id', verifyToken, requireMenuAccess('keuangan'), async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM visit_invoices WHERE id = ?', [req.params.id]);

        if (rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Visit invoice not found'
            });
        }

        const invoice = rows[0];

        if (req.user?.role === 'patient' && req.user?.id !== invoice.patient_id) {
            return res.status(403).json({
                success: false,
                message: 'Access denied'
            });
        }

        res.json({
            success: true,
            data: invoice
        });
    } catch (error) {
        console.error('Error fetching visit invoice detail:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch visit invoice detail',
            error: error.message
        });
    }
});

module.exports = router;

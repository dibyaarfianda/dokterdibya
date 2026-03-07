/**
 * Async PDF Queue Routes
 * Submit and poll PDF generation jobs.
 *
 * POST /api/pdf/queue       — enqueue a job
 * GET  /api/pdf/queue/:id   — poll job status
 * GET  /api/pdf/queue       — list recent jobs (admin)
 */

const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const pdfQueue = require('../services/pdfQueue');

/**
 * POST /api/pdf/queue
 * Body: { type: 'invoice'|'etiket'|'resume_medis', billingData, patientData, recordData }
 */
router.post('/', verifyToken, (req, res) => {
    const { type, billingData, patientData, recordData, resumeData } = req.body;

    if (!type || !['invoice', 'etiket', 'resume_medis'].includes(type)) {
        return res.status(400).json({ success: false, message: 'Invalid type. Must be invoice, etiket, or resume_medis.' });
    }

    if (!patientData || !recordData) {
        return res.status(400).json({ success: false, message: 'patientData and recordData are required.' });
    }

    const result = pdfQueue.enqueue(type, {
        billingData: billingData || {},
        patientData,
        recordData,
        resumeData,
    });

    res.status(202).json({ success: true, ...result });
});

/**
 * GET /api/pdf/queue/:id
 * Returns job status and result (if completed).
 */
router.get('/:id', verifyToken, (req, res) => {
    const job = pdfQueue.getJob(req.params.id);
    if (!job) {
        return res.status(404).json({ success: false, message: 'Job not found or expired.' });
    }
    res.json({ success: true, ...job });
});

/**
 * GET /api/pdf/queue
 * Returns queue stats.
 */
router.get('/', verifyToken, (req, res) => {
    res.json({ success: true, stats: pdfQueue.getStats() });
});

module.exports = router;

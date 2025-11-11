/**
 * PDF Routes
 * Generate and download PDF documents
 */

const express = require('express');
const router = express.Router();
const PDFService = require('../utils/pdf');
const PatientService = require('../services/PatientService');
const VisitService = require('../services/VisitService');
const { verifyToken, requirePermission } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { sendSuccess } = require('../utils/response');
const logger = require('../utils/logger');

/**
 * @swagger
 * /api/pdf/receipt/{visitId}:
 *   get:
 *     summary: Generate visit receipt PDF
 *     tags: [PDF]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: visitId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: PDF generated successfully
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 */
router.get('/receipt/:visitId', verifyToken, requirePermission('billing.view'), asyncHandler(async (req, res) => {
    const { visitId } = req.params;
    
    // Get visit details
    const visit = await VisitService.getVisitById(visitId);
    const patient = await PatientService.getPatientById(visit.patient_id);
    
    // Get visit items (if available)
    // TODO: Implement visit items retrieval from billing
    const items = [];
    
    // Generate PDF
    const result = await PDFService.generateVisitReceipt(visit, patient, items);
    
    // Send PDF file
    res.download(result.filepath, result.filename, (err) => {
        if (err) {
            logger.error('Error downloading PDF', { error: err.message });
        }
    });
}));

/**
 * @swagger
 * /api/pdf/medical-report/{patientId}:
 *   get:
 *     summary: Generate patient medical report PDF
 *     tags: [PDF]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: patientId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: PDF generated successfully
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 */
router.get('/medical-report/:patientId', verifyToken, requirePermission('patients.view'), asyncHandler(async (req, res) => {
    const { patientId } = req.params;
    
    // Get patient and visit history
    const patient = await PatientService.getPatientById(patientId);
    const visits = await VisitService.getVisitsByPatientId(patientId);
    
    // Generate PDF
    const result = await PDFService.generateMedicalReport(patient, visits);
    
    // Send PDF file
    res.download(result.filepath, result.filename, (err) => {
        if (err) {
            logger.error('Error downloading PDF', { error: err.message });
        }
    });
}));

/**
 * Cleanup old PDF files
 */
router.post('/cleanup', verifyToken, requirePermission('settings.system'), asyncHandler(async (req, res) => {
    const { daysOld } = req.body;
    const count = await PDFService.cleanupOldFiles(daysOld || 30);
    sendSuccess(res, { deletedCount: count }, `Deleted ${count} old PDF files`);
}));

module.exports = router;

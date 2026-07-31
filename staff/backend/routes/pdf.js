/**
 * PDF Routes
 * Generate and download PDF documents
 */

const express = require('express');
const router = express.Router();
const PDFService = require('../utils/pdf');
const PatientService = require('../services/PatientService');
const VisitService = require('../services/VisitService');
const { verifyToken } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { sendSuccess } = require('../utils/response');
const logger = require('../utils/logger');

router.get('/receipt/:visitId', verifyToken, (req, res) => {
    return res.status(410).json({
        success: false,
        code: 'RECEIPT_ENDPOINT_RETIRED',
        message: 'Legacy visit receipts are retired. Use the current Sunday Clinic invoice endpoints.'
    });
});

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
router.get('/medical-report/:patientId', verifyToken, asyncHandler(async (req, res) => {
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
router.post('/cleanup', verifyToken, asyncHandler(async (req, res) => {
    const { daysOld } = req.body;
    const count = await PDFService.cleanupOldFiles(daysOld || 30);
    sendSuccess(res, { deletedCount: count }, `Deleted ${count} old PDF files`);
}));

module.exports = router;

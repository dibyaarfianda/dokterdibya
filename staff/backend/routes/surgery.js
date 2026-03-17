const express = require('express');
const router = express.Router();
const PDFDocument = require('pdfkit');
const jwt = require('jsonwebtoken');
const surgeryService = require('../services/SurgeryService');
const logger = require('../utils/logger');

// All routes inherit verifyStaffToken from parent router (docboard.js)

/**
 * GET /lookup-rm/:mrId
 * Fetch patient data from SIMRS by medical record number (DRD)
 */
router.get('/lookup-rm/:mrId', async (req, res) => {
  try {
    const data = await surgeryService.lookupByMrId(req.params.mrId);
    if (!data) {
      return res.status(404).json({ success: false, message: 'RM tidak ditemukan' });
    }
    res.json({ success: true, ...data });
  } catch (error) {
    logger.error('Surgery RM lookup error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /search-patient?q=name
 * Search patients by name, returns list with their RM numbers
 */
router.get('/search-patient', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 2) {
      return res.json({ success: true, patients: [] });
    }
    const patients = await surgeryService.searchPatients(q);
    res.json({ success: true, patients });
  } catch (error) {
    logger.error('Surgery patient search error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /operation-types
 */
router.get('/operation-types', async (req, res) => {
  try {
    const types = await surgeryService.getOperationTypes();
    res.json({ success: true, types });
  } catch (error) {
    logger.error('Surgery operation types error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /calendar/:year/:month
 */
router.get('/calendar/:year/:month', async (req, res) => {
  try {
    const { year, month } = req.params;
    const days = await surgeryService.getCalendarMonth(parseInt(year), parseInt(month));
    res.json({ success: true, days });
  } catch (error) {
    logger.error('Surgery calendar error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /upcoming
 */
router.get('/upcoming', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 7;
    const surgeries = await surgeryService.getUpcoming(days);
    res.json({ success: true, surgeries });
  } catch (error) {
    logger.error('Surgery upcoming error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /day/:date
 */
router.get('/day/:date', async (req, res) => {
  try {
    const surgeries = await surgeryService.getDaySurgeries(req.params.date);
    res.json({ success: true, surgeries });
  } catch (error) {
    logger.error('Surgery day error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /external-staff
 */
router.get('/external-staff', async (req, res) => {
  try {
    const staff = await surgeryService.getExternalStaff();
    res.json({ success: true, staff });
  } catch (error) {
    logger.error('External staff list error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /external-staff
 */
router.post('/external-staff', async (req, res) => {
  try {
    const result = await surgeryService.addExternalStaff(req.body);
    res.json({ success: true, staff: result });
  } catch (error) {
    logger.error('External staff add error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * PUT /external-staff/:id
 */
router.put('/external-staff/:id', async (req, res) => {
  try {
    await surgeryService.updateExternalStaff(req.params.id, req.body);
    res.json({ success: true });
  } catch (error) {
    logger.error('External staff update error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * PATCH /:id/post-op-notes
 * Update post-op notes for a surgery (must be in_progress or completed)
 */
router.patch('/:id/post-op-notes', async (req, res) => {
  try {
    const { id } = req.params;
    const { post_op_notes } = req.body;

    if (!post_op_notes) {
      return res.status(400).json({ success: false, message: 'post_op_notes diperlukan' });
    }

    // Check surgery exists and has valid status
    const surgery = await surgeryService.getSurgeryById(id);
    if (!surgery) {
      return res.status(404).json({ success: false, message: 'Jadwal operasi tidak ditemukan' });
    }

    if (surgery.status !== 'in_progress' && surgery.status !== 'completed') {
      return res.status(400).json({
        success: false,
        message: 'Catatan post-op hanya bisa ditambahkan saat operasi sedang berlangsung atau selesai'
      });
    }

    const updated = await surgeryService.updateSurgery(id, { post_op_notes });
    res.json({ success: true, surgery: updated });
  } catch (error) {
    logger.error('Surgery post-op notes update error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /analytics
 * Returns aggregated surgery statistics
 */
router.get('/analytics', async (req, res) => {
  try {
    const { period, location } = req.query;
    const analytics = await surgeryService.getAnalytics(period || '30d', location || null);
    res.json({ success: true, analytics });
  } catch (error) {
    logger.error('Surgery analytics error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /:id  (must be after other GET routes)
 */
router.get('/:id', async (req, res) => {
  try {
    const surgery = await surgeryService.getSurgeryById(req.params.id);
    if (!surgery) {
      return res.status(404).json({ success: false, message: 'Jadwal operasi tidak ditemukan' });
    }
    res.json({ success: true, surgery });
  } catch (error) {
    logger.error('Surgery detail error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /  (create surgery)
 */
router.post('/', async (req, res) => {
  try {
    const { patient_name, diagnosis, operation_type_id, location, surgery_date } = req.body;

    if (!patient_name || !diagnosis || !operation_type_id || !location || !surgery_date) {
      return res.status(400).json({
        success: false,
        message: 'Data wajib: patient_name, diagnosis, operation_type_id, location, surgery_date'
      });
    }

    const surgery = await surgeryService.createSurgery(req.body, req.user?.id);
    res.json({ success: true, surgery });
  } catch (error) {
    logger.error('Surgery create error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * PUT /:id  (update surgery)
 */
router.put('/:id', async (req, res) => {
  try {
    const surgery = await surgeryService.updateSurgery(req.params.id, req.body);
    res.json({ success: true, surgery });
  } catch (error) {
    logger.error('Surgery update error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * PATCH /:id/status
 */
router.patch('/:id/status', async (req, res) => {
  try {
    const { status, reason } = req.body;
    if (!status) {
      return res.status(400).json({ success: false, message: 'Status diperlukan' });
    }
    const surgery = await surgeryService.updateStatus(req.params.id, status, reason);
    res.json({ success: true, surgery });
  } catch (error) {
    logger.error('Surgery status update error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * DELETE /:id
 */
router.delete('/:id', async (req, res) => {
  try {
    await surgeryService.deleteSurgery(req.params.id);
    res.json({ success: true });
  } catch (error) {
    logger.error('Surgery delete error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;

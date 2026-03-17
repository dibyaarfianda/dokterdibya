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
 * GET /export/pdf?start=YYYY-MM-DD&end=YYYY-MM-DD&token=JWT
 * Export surgery schedules as PDF
 * Accepts token from query string (for window.open) or Authorization header
 */
router.get('/export/pdf', async (req, res) => {
  try {
    // Accept token from query param (for window.open which can't set headers)
    // Note: verifyStaffToken already ran from parent router using Authorization header,
    // but for PDF download via window.open, we also accept query param token
    const { start, end } = req.query;

    if (!start || !end) {
      return res.status(400).json({ success: false, message: 'Parameter start dan end diperlukan (YYYY-MM-DD)' });
    }

    // Validate date format
    const startDate = new Date(start + 'T00:00:00');
    const endDate = new Date(end + 'T00:00:00');

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return res.status(400).json({ success: false, message: 'Format tanggal tidak valid (YYYY-MM-DD)' });
    }

    if (endDate < startDate) {
      return res.status(400).json({ success: false, message: 'Tanggal akhir harus setelah tanggal awal' });
    }

    // Max 3 months range
    const diffMs = endDate - startDate;
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    if (diffDays > 93) {
      return res.status(400).json({ success: false, message: 'Rentang maksimal 3 bulan' });
    }

    const surgeries = await surgeryService.getForExport(start, end);

    // Group by date
    const grouped = {};
    for (const s of surgeries) {
      const d = new Date(s.surgery_date);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (!grouped[dateStr]) grouped[dateStr] = [];
      grouped[dateStr].push(s);
    }

    // Location name map
    const locationNames = {
      klinik_private: 'Klinik Privat',
      rsia_melinda: 'RSIA Melinda',
      rsud_gambiran: 'RSUD Gambiran',
      rs_bhayangkara: 'RS Bhayangkara'
    };

    const statusLabels = {
      planned: 'Rencana',
      confirmed: 'Konfirmasi',
      in_progress: 'Berlangsung',
      completed: 'Selesai',
      postponed: 'Ditunda'
    };

    // Format dates for header
    const formatDateID = (dateStr) => {
      const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
        'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
      const d = new Date(dateStr + 'T00:00:00');
      return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
    };

    const dayNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

    // Generate PDF
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 40, bottom: 40, left: 40, right: 40 },
      bufferPages: true
    });

    // Set response headers
    const filename = `Jadwal-Operasi_${start}_${end}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);

    doc.pipe(res);

    // === HEADER ===
    doc.fontSize(16).font('Helvetica-Bold')
      .text('Jadwal Operasi', { align: 'center' });
    doc.fontSize(11).font('Helvetica')
      .text('Dr. Dibya Arfianda, Sp.OG', { align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(10).fillColor('#555555')
      .text(`Periode: ${formatDateID(start)} - ${formatDateID(end)}`, { align: 'center' });
    doc.moveDown(0.5);

    // Divider line
    doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor('#CCCCCC').lineWidth(1).stroke();
    doc.moveDown(0.5);

    const sortedDates = Object.keys(grouped).sort();
    const pageWidth = 515; // 595 - 40 - 40
    let totalCount = 0;

    // Table column widths
    const colWidths = [28, 50, 130, 35, 120, 80, 72];
    const colX = [40];
    for (let i = 1; i < colWidths.length; i++) {
      colX.push(colX[i - 1] + colWidths[i - 1]);
    }

    for (const date of sortedDates) {
      const items = grouped[date];
      const dayObj = new Date(date + 'T00:00:00');
      const dayName = dayNames[dayObj.getDay()];
      const dateDisplay = formatDateID(date);

      // Check if we need a new page (date header + at least 1 row needs ~60px)
      if (doc.y > 720) {
        doc.addPage();
      }

      // Date header
      doc.fontSize(11).font('Helvetica-Bold').fillColor('#1E293B')
        .text(`${dayName}, ${dateDisplay}`, 40, doc.y, { continued: false });
      doc.moveDown(0.3);

      // Table header
      const headerY = doc.y;
      doc.rect(40, headerY, pageWidth, 18).fillColor('#F1F5F9').fill();
      doc.fontSize(8).font('Helvetica-Bold').fillColor('#475569');

      const headers = ['No', 'Waktu', 'Pasien', 'Usia', 'Operasi', 'Lokasi', 'Status'];
      for (let i = 0; i < headers.length; i++) {
        doc.text(headers[i], colX[i] + 3, headerY + 4, {
          width: colWidths[i] - 6,
          align: i === 0 ? 'center' : 'left'
        });
      }

      doc.y = headerY + 18;

      // Table rows
      for (let idx = 0; idx < items.length; idx++) {
        const s = items[idx];
        totalCount++;

        const timeStr = s.surgery_time ? s.surgery_time.substring(0, 5) : '--:--';
        const opName = s.op_name_id || s.op_name || '-';
        const locName = locationNames[s.location] || s.location;
        const statusLabel = statusLabels[s.status] || s.status;
        const ageStr = s.patient_age ? `${s.patient_age} th` : '-';

        // Check if we need a new page
        if (doc.y > 760) {
          doc.addPage();
          // Re-draw table header on new page
          const newHeaderY = doc.y;
          doc.rect(40, newHeaderY, pageWidth, 18).fillColor('#F1F5F9').fill();
          doc.fontSize(8).font('Helvetica-Bold').fillColor('#475569');
          for (let i = 0; i < headers.length; i++) {
            doc.text(headers[i], colX[i] + 3, newHeaderY + 4, {
              width: colWidths[i] - 6,
              align: i === 0 ? 'center' : 'left'
            });
          }
          doc.y = newHeaderY + 18;
        }

        const rowY = doc.y;

        // Alternating row background
        if (idx % 2 === 1) {
          doc.rect(40, rowY, pageWidth, 16).fillColor('#FAFAFA').fill();
        }

        doc.fontSize(8).font('Helvetica').fillColor('#334155');

        // No
        doc.text(`${idx + 1}`, colX[0] + 3, rowY + 4, { width: colWidths[0] - 6, align: 'center' });
        // Waktu
        doc.text(timeStr, colX[1] + 3, rowY + 4, { width: colWidths[1] - 6 });
        // Pasien
        doc.font('Helvetica-Bold')
          .text(s.patient_name.length > 22 ? s.patient_name.substring(0, 22) + '..' : s.patient_name,
            colX[2] + 3, rowY + 4, { width: colWidths[2] - 6 });
        doc.font('Helvetica');
        // Usia
        doc.text(ageStr, colX[3] + 3, rowY + 4, { width: colWidths[3] - 6 });
        // Operasi
        doc.text(opName.length > 20 ? opName.substring(0, 20) + '..' : opName,
          colX[4] + 3, rowY + 4, { width: colWidths[4] - 6 });
        // Lokasi
        doc.text(locName, colX[5] + 3, rowY + 4, { width: colWidths[5] - 6 });
        // Status
        doc.text(statusLabel, colX[6] + 3, rowY + 4, { width: colWidths[6] - 6 });

        doc.y = rowY + 16;
      }

      doc.moveDown(0.5);

      // Subtle separator between date groups
      doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor('#E2E8F0').lineWidth(0.5).stroke();
      doc.moveDown(0.5);
    }

    // === FOOTER ===
    if (surgeries.length === 0) {
      doc.moveDown(2);
      doc.fontSize(12).font('Helvetica').fillColor('#94A3B8')
        .text('Tidak ada jadwal operasi pada periode ini.', { align: 'center' });
    }

    doc.moveDown(1);
    doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor('#CCCCCC').lineWidth(1).stroke();
    doc.moveDown(0.5);
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#334155')
      .text(`Total: ${totalCount} operasi`, 40);
    doc.moveDown(0.3);
    const now = new Date();
    const genTime = `${now.getDate()}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    doc.fontSize(8).font('Helvetica').fillColor('#94A3B8')
      .text(`Dicetak: ${genTime} WIB`, 40);

    doc.end();

  } catch (error) {
    logger.error('Surgery PDF export error:', error);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: error.message });
    }
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

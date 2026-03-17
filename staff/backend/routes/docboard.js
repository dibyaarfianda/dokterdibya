const express = require('express');
const router = express.Router();
const { verifyStaffToken } = require('../middleware/auth');
const { requireRoles } = require('../middleware/auth');
const docboardService = require('../services/DocBoardService');
const surgeryRoutes = require('./surgery');
const logger = require('../utils/logger');

// Allow token from query string for PDF downloads (window.open can't set headers)
router.use((req, res, next) => {
  if (req.query.token && !req.headers['authorization']) {
    req.headers['authorization'] = `Bearer ${req.query.token}`;
  }
  next();
});

// All routes require staff authentication
router.use(verifyStaffToken);

// Mount surgery sub-routes
router.use('/surgery', surgeryRoutes);

/**
 * GET /api/docboard/calendar/:year/:month
 * Calendar grid data for a month
 */
router.get('/calendar/:year/:month', async (req, res) => {
  try {
    const { year, month } = req.params;
    const days = await docboardService.getCalendarMonth(parseInt(year), parseInt(month));
    res.json({ success: true, days });
  } catch (error) {
    logger.error('DocBoard calendar error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/docboard/day/:date
 * Day detail with locations and patients
 */
router.get('/day/:date', async (req, res) => {
  try {
    const data = await docboardService.getDayDetail(req.params.date);
    res.json({ success: true, ...data });
  } catch (error) {
    logger.error('DocBoard day detail error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/docboard/today
 * Shorthand for today's data
 */
router.get('/today', async (req, res) => {
  try {
    const data = await docboardService.getToday();
    res.json({ success: true, ...data });
  } catch (error) {
    logger.error('DocBoard today error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/docboard/patients/:date/:location
 * Patient list for a specific date and location
 */
router.get('/patients/:date/:location', async (req, res) => {
  try {
    const { date, location } = req.params;
    const patients = await docboardService.getPatients(date, location);
    res.json({ success: true, patients });
  } catch (error) {
    logger.error('DocBoard patients error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/docboard/sync/:location
 * Trigger manual sync for a location (dokter/admin only)
 */
router.post('/sync/:location', requireRoles('dokter', 'admin'), async (req, res) => {
  try {
    const { location } = req.params;
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const date = req.body.date || todayStr;

    let result;
    switch (location) {
      case 'klinik_private':
        result = await docboardService.syncInternal(date);
        break;
      case 'rsia_melinda':
      case 'rsud_gambiran':
        result = await docboardService.syncMedify(date, location);
        break;
      case 'rs_bhayangkara':
        // Bhayangkara sync only via Chrome extension push
        return res.json({
          success: false,
          message: 'RS Bhayangkara hanya bisa sync via Chrome Extension'
        });
      default:
        return res.status(400).json({ success: false, message: 'Lokasi tidak valid' });
    }

    // Broadcast sync complete via Socket.IO
    if (global.io) {
      global.io.emit('docboard:sync', { location, date, ...result });
    }

    res.json({ success: true, ...result });
  } catch (error) {
    logger.error(`DocBoard sync ${req.params.location} error:`, error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/docboard/sync/status
 * Sync status for all locations
 */
router.get('/sync/status', async (req, res) => {
  try {
    const statuses = await docboardService.getSyncStatus();
    res.json({ success: true, statuses });
  } catch (error) {
    logger.error('DocBoard sync status error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/docboard/sync/evo-push
 * Receive data from Chrome extension (Evo/Bhayangkara)
 */
router.post('/sync/evo-push', async (req, res) => {
  try {
    const { date, patients } = req.body;
    if (!date || !patients || !Array.isArray(patients)) {
      return res.status(400).json({
        success: false,
        message: 'Data tidak valid. Kirim { date, patients: [...] }'
      });
    }

    const result = await docboardService.syncEvoPush(date, patients);
    res.json({ success: true, ...result });
  } catch (error) {
    logger.error('DocBoard evo push error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/docboard/schedules
 * Practice schedules for all locations
 */
router.get('/schedules', async (req, res) => {
  try {
    const schedules = await docboardService.getSchedules();
    res.json({ success: true, schedules });
  } catch (error) {
    logger.error('DocBoard schedules error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/docboard/notifications
 * Notification history
 */
router.get('/notifications', async (req, res) => {
  try {
    const notifications = await docboardService.getNotifications(req.user?.id);
    res.json({ success: true, notifications });
  } catch (error) {
    logger.error('DocBoard notifications error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/docboard/push/register
 * Register push notification token
 */
router.post('/push/register', async (req, res) => {
  try {
    const { endpoint, keys } = req.body;
    if (!endpoint) {
      return res.status(400).json({ success: false, message: 'Endpoint diperlukan' });
    }

    await docboardService.registerPushToken(
      req.user.id,
      req.body.platform || 'web',
      endpoint,
      keys?.p256dh,
      keys?.auth
    );

    res.json({ success: true });
  } catch (error) {
    logger.error('DocBoard push register error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * DELETE /api/docboard/push/unregister
 * Unregister push notification token
 */
router.delete('/push/unregister', async (req, res) => {
  try {
    const { endpoint } = req.body;
    if (!endpoint) {
      return res.status(400).json({ success: false, message: 'Endpoint diperlukan' });
    }

    await docboardService.unregisterPushToken(endpoint);
    res.json({ success: true });
  } catch (error) {
    logger.error('DocBoard push unregister error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/docboard/ai/briefing
 * AI placeholder - morning briefing
 */
router.post('/ai/briefing', (req, res) => {
  res.status(501).json({
    success: false,
    message: 'AI Briefing - Segera Hadir'
  });
});

/**
 * POST /api/docboard/ai/suggest
 * AI placeholder - suggestions
 */
router.post('/ai/suggest', (req, res) => {
  res.status(501).json({
    success: false,
    message: 'AI Suggest - Segera Hadir'
  });
});

module.exports = router;

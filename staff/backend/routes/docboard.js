const express = require('express');
const router = express.Router();
const { verifyStaffToken } = require('../middleware/auth');
const { requireRoles } = require('../middleware/auth');
const docboardService = require('../services/DocBoardService');
const docboardPush = require('../services/DocBoardPushService');
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
 * PATCH /api/docboard/notifications/read-all
 * Mark all notifications as read (must be before :id route)
 */
router.patch('/notifications/read-all', async (req, res) => {
  try {
    await docboardService.markAllNotificationsRead(req.user?.id);
    res.json({ success: true });
  } catch (error) {
    logger.error('DocBoard mark all notifications read error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/docboard/notifications/unread-count
 * Get unread notification count (must be before :id route)
 */
router.get('/notifications/unread-count', async (req, res) => {
  try {
    const count = await docboardService.getUnreadCount(req.user?.id);
    res.json({ success: true, count });
  } catch (error) {
    logger.error('DocBoard unread count error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * PATCH /api/docboard/notifications/:id/read
 * Mark a single notification as read
 */
router.patch('/notifications/:id/read', async (req, res) => {
  try {
    await docboardService.markNotificationRead(req.params.id);
    res.json({ success: true });
  } catch (error) {
    logger.error('DocBoard mark notification read error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/docboard/push/vapid-key
 * Return public VAPID key for push subscription
 */
router.get('/push/vapid-key', (req, res) => {
  const key = docboardPush.getVapidPublicKey();
  if (!key) {
    return res.status(503).json({ success: false, message: 'Push notifications not configured' });
  }
  res.json({ success: true, vapidKey: key });
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
 * GET /api/docboard/ai/briefing/:date
 * AI morning briefing for a given date
 */
router.get('/ai/briefing/:date', async (req, res) => {
  try {
    const { date } = req.params;
    const refresh = req.query.refresh === 'true';
    const userId = req.user?.id || 'unknown';

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ success: false, message: 'Format tanggal tidak valid (YYYY-MM-DD)' });
    }

    const docboardAI = require('../services/DocBoardAIService');
    const result = await docboardAI.generateBriefing(date, userId, refresh);

    if (!result.success) {
      return res.status(500).json({ success: false, message: result.error || 'Gagal generate briefing' });
    }

    res.json({
      success: true,
      briefing: result.data,
      cached: result.cached || false
    });
  } catch (error) {
    logger.error('DocBoard AI briefing error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
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

/**
 * GET /api/docboard/analytics/clinic
 * Clinic visit analytics from docboard_events
 */
router.get('/analytics/clinic', async (req, res) => {
  try {
    const { period } = req.query;
    const analytics = await docboardService.getClinicAnalytics(period || '30d');
    res.json({ success: true, analytics });
  } catch (error) {
    logger.error('DocBoard clinic analytics error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/docboard/preferences
 */
router.get('/preferences', async (req, res) => {
  try {
    const prefs = await docboardService.getPreferences(req.user?.id);
    res.json({ success: true, preferences: prefs });
  } catch (error) {
    logger.error('DocBoard get preferences error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * PUT /api/docboard/preferences
 */
router.put('/preferences', async (req, res) => {
  try {
    const prefs = await docboardService.updatePreferences(req.user?.id, req.body.preferences || req.body);
    res.json({ success: true, preferences: prefs });
  } catch (error) {
    logger.error('DocBoard update preferences error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// =====================================================
// PHASE 5: Command Center Routes (feature-flagged)
// =====================================================
const commandCenter = require('../services/DocBoardCommandCenter');

// Feature flag middleware
async function requireFlag(flagKey) {
  return async function(req, res, next) {
    const enabled = await commandCenter.isEnabled(flagKey);
    if (!enabled) return res.status(403).json({ success: false, message: 'Feature not enabled: ' + flagKey });
    next();
  };
}

// GET /api/docboard/flags
router.get('/flags', async (req, res) => {
  try {
    const flags = await commandCenter.getFlags();
    res.json({ success: true, flags });
  } catch (error) {
    logger.error('Get flags error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// PUT /api/docboard/flags/:key (dokter only)
router.put('/flags/:key', requireRoles('dokter'), async (req, res) => {
  try {
    await commandCenter.setFlag(req.params.key, req.body.enabled);
    res.json({ success: true });
  } catch (error) {
    logger.error('Set flag error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/docboard/command/dashboard
router.get('/command/dashboard', async (req, res) => {
  try {
    const enabled = await commandCenter.isEnabled('phase5_dashboard');
    if (!enabled) return res.status(403).json({ success: false, message: 'Dashboard not enabled' });
    const data = await commandCenter.getDashboard();
    res.json({ success: true, ...data });
  } catch (error) {
    logger.error('[ERR:DASH_FAIL] Dashboard error:', error.message);
    res.status(500).json({ success: false, error_code: 'DASH_FAIL', message: error.message });
  }
});

// GET /api/docboard/command/conflicts?date=YYYY-MM-DD
router.get('/command/conflicts', async (req, res) => {
  try {
    const enabled = await commandCenter.isEnabled('phase5_conflict_detection');
    if (!enabled) return res.status(403).json({ success: false, message: 'Conflict detection not enabled' });
    const data = await commandCenter.detectConflicts(req.query.date);
    res.json({ success: true, ...data });
  } catch (error) {
    logger.error('[ERR:CONFLICT_FAIL] Conflict detection error:', error.message);
    res.status(500).json({ success: false, error_code: 'CONFLICT_FAIL', message: error.message });
  }
});

// Rules CRUD
router.get('/command/rules', async (req, res) => {
  try {
    const enabled = await commandCenter.isEnabled('phase5_rules_engine');
    if (!enabled) return res.status(403).json({ success: false, message: 'Rules engine not enabled' });
    const rules = await commandCenter.getRules();
    res.json({ success: true, rules });
  } catch (error) {
    logger.error('Get rules error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/command/rules', requireRoles('dokter'), async (req, res) => {
  try {
    const enabled = await commandCenter.isEnabled('phase5_rules_engine');
    if (!enabled) return res.status(403).json({ success: false, message: 'Rules engine not enabled' });
    const rule = await commandCenter.createRule(req.body, req.user?.id);
    res.json({ success: true, rule });
  } catch (error) {
    logger.error('Create rule error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.put('/command/rules/:id', requireRoles('dokter'), async (req, res) => {
  try {
    await commandCenter.updateRule(req.params.id, req.body);
    res.json({ success: true });
  } catch (error) {
    logger.error('Update rule error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.delete('/command/rules/:id', requireRoles('dokter'), async (req, res) => {
  try {
    await commandCenter.deleteRule(req.params.id);
    res.json({ success: true });
  } catch (error) {
    logger.error('Delete rule error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/command/rules/:id/executions', async (req, res) => {
  try {
    const execs = await commandCenter.getRuleExecutions(req.params.id);
    res.json({ success: true, executions: execs });
  } catch (error) {
    logger.error('Get rule executions error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Compliance (with date range validation and pagination)
router.get('/command/compliance', requireRoles('dokter', 'managerial'), async (req, res) => {
  try {
    const enabled = await commandCenter.isEnabled('phase5_compliance');
    if (!enabled) return res.status(403).json({ success: false, message: 'Compliance not enabled' });
    const { start, end, location, page, limit } = req.query;
    if (!start || !end) return res.status(400).json({ success: false, message: 'Parameter start dan end diperlukan (YYYY-MM-DD)' });
    const validation = commandCenter.validateComplianceRange(start, end);
    if (!validation.valid) return res.status(400).json({ success: false, message: validation.message });
    const report = await commandCenter.getComplianceReport(start, end, location, page, limit);
    res.json({ success: true, report });
  } catch (error) {
    const status = error.statusCode || 500;
    const code = status === 400 ? 'COMPLIANCE_VALIDATION' : 'COMPLIANCE_FAIL';
    logger.error('[ERR:' + code + '] Compliance report error:', error.message);
    res.status(status).json({ success: false, error_code: code, message: error.message });
  }
});

// Policy check endpoint (for frontend to verify before action)
router.post('/command/policy-check', async (req, res) => {
  try {
    const enabled = await commandCenter.isEnabled('phase5_policies');
    if (!enabled) return res.json({ success: true, allowed: true, message: 'Policies not enabled - default allow' });
    const { action, resource, resource_id } = req.body;
    const result = await commandCenter.checkPolicy(req.user?.id, req.user?.role, action, resource, resource_id);
    res.json({ success: true, ...result });
  } catch (error) {
    logger.error('Policy check error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Phase 5.1: Cache invalidation (dokter only)
router.post('/flags/invalidate', requireRoles('dokter'), (req, res) => {
  commandCenter.invalidateCache();
  res.json({ success: true, message: 'Flag cache invalidated' });
});

// Phase 5.1: Operational health/metrics (dokter only)
router.get('/command/health', requireRoles('dokter'), async (req, res) => {
  try {
    const health = await commandCenter.getHealth();
    res.json({ success: true, ...health });
  } catch (error) {
    logger.error('Health check error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Phase 5.1+5.2: Cleanup with target selection and audit trail (dokter only)
router.post('/command/cleanup', requireRoles('dokter'), async (req, res) => {
  try {
    const dryRun = req.query.dry_run !== 'false';
    const target = req.query.target || 'all'; // policy_log, rule_executions, all
    const mode = dryRun ? 'dry_run' : 'real';
    const results = {};

    if (target === 'policy_log' || target === 'all') {
      results.policy_log = await commandCenter.cleanupPolicyLog(dryRun);
      await commandCenter.logCleanupAudit(req.user?.id, 'policy_log', mode, results.policy_log);
    }
    if (target === 'rule_executions' || target === 'all') {
      results.rule_executions = await commandCenter.cleanupRuleExecutions(dryRun);
      await commandCenter.logCleanupAudit(req.user?.id, 'rule_executions', mode, results.rule_executions);
    }

    res.json({ success: true, target, mode, results });
  } catch (error) {
    logger.error('Cleanup error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;

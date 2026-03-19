'use strict';
const pool = require('../db');
const logger = require('../utils/logger');

let flagCache = {};
let flagCacheTime = 0;
const FLAG_CACHE_TTL = 60000;
const POLICY_RETENTION_DAYS = parseInt(process.env.DOCBOARD_POLICY_RETENTION_DAYS) || 90;
const RULE_EXEC_RETENTION_DAYS = parseInt(process.env.DOCBOARD_RULE_EXEC_RETENTION_DAYS) || 90;
const COMPLIANCE_MAX_DAYS = 93;
const COMPLIANCE_MAX_ROWS = 500;
const COMPLIANCE_TOTAL_CAP = 2000;
let lastCleanupRun = null;
let lastCleanupResult = null;
let lastRuleExecCleanupRun = null;
let lastRuleExecCleanupResult = null;

class DocBoardCommandCenter {
  async getFlags() {
    const now = Date.now();
    if (now - flagCacheTime < FLAG_CACHE_TTL && Object.keys(flagCache).length > 0) return flagCache;
    try {
      const [rows] = await pool.query('SELECT flag_key, enabled FROM docboard_feature_flags');
      flagCache = {};
      for (const r of rows) flagCache[r.flag_key] = r.enabled === 1;
      flagCacheTime = now;
    } catch { /* table may not exist */ }
    return flagCache;
  }

  async isEnabled(flagKey) { return (await this.getFlags())[flagKey] === true; }

  async setFlag(flagKey, enabled) {
    await pool.query('UPDATE docboard_feature_flags SET enabled = ? WHERE flag_key = ?', [enabled ? 1 : 0, flagKey]);
    flagCache[flagKey] = enabled;
    logger.info('Feature flag ' + flagKey + ' set to ' + enabled);
  }

  invalidateCache() {
    flagCache = {};
    flagCacheTime = 0;
    logger.info('[CommandCenter] Flag cache invalidated');
  }

  getFlagCacheStatus() {
    return {
      cached_keys: Object.keys(flagCache).length,
      cache_age_ms: flagCacheTime > 0 ? Date.now() - flagCacheTime : null,
      ttl_ms: FLAG_CACHE_TTL
    };
  }

  async checkPolicy(userId, role, action, resource, resourceId) {
    const POLICY_MAP = {
      'surgery.delete': ['dokter'],
      'surgery.outcome.write': ['dokter'],
      'surgery.status.complete': ['dokter'],
      'surgery.status.in_progress': ['dokter'],
      'surgery.create': ['dokter', 'admin'],
      'surgery.edit': ['dokter', 'admin'],
      'surgery.status.confirm': ['dokter', 'admin'],
      'surgery.status.cancel': ['dokter', 'admin'],
      'surgery.status.postpone': ['dokter', 'admin'],
      'surgery.checklist': ['dokter', 'admin', 'bidan'],
      'surgery.view': ['dokter', 'admin', 'bidan', 'managerial'],
      'dashboard.view': ['dokter', 'admin', 'managerial'],
      'rules.manage': ['dokter'],
      'compliance.export': ['dokter', 'managerial'],
      'flags.manage': ['dokter']
    };
    const allowed = POLICY_MAP[action] || ['dokter'];
    const decision = allowed.includes(role) ? 'allow' : 'deny';
    try {
      await pool.query(
        'INSERT INTO docboard_policy_log (user_id, action, resource, resource_id, decision, reason) VALUES (?, ?, ?, ?, ?, ?)',
        [userId, action, resource || null, resourceId || null, decision, decision === 'deny' ? 'Role ' + role + ' not in ' + allowed.join(',') : null]
      );
    } catch { /* non-blocking */ }
    return { allowed: decision === 'allow', decision, role, action };
  }

  async getDashboard() {
    const now = new Date();
    const todayStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');

    const [todaySurgeries] = await pool.query(
      "SELECT location, status, COUNT(*) as count FROM surgery_schedules WHERE surgery_date = ? AND status != 'cancelled' GROUP BY location, status", [todayStr]);
    const [todayPatients] = await pool.query(
      'SELECT location, patient_count, completed_count, sync_status, last_synced_at FROM docboard_events WHERE event_date = ? AND is_disabled = 0', [todayStr]);

    const endDate = new Date(now); endDate.setDate(endDate.getDate() + 7);
    const endStr = endDate.getFullYear() + '-' + String(endDate.getMonth() + 1).padStart(2, '0') + '-' + String(endDate.getDate()).padStart(2, '0');
    const [upcoming] = await pool.query(
      "SELECT surgery_date, location, COUNT(*) as count FROM surgery_schedules WHERE surgery_date BETWEEN ? AND ? AND status NOT IN ('cancelled','completed') GROUP BY surgery_date, location ORDER BY surgery_date", [todayStr, endStr]);

    const d30 = new Date(now); d30.setDate(d30.getDate() - 30);
    const d30Str = d30.getFullYear() + '-' + String(d30.getMonth() + 1).padStart(2, '0') + '-' + String(d30.getDate()).padStart(2, '0');
    const [rates] = await pool.query(
      'SELECT status, COUNT(*) as count FROM surgery_schedules WHERE surgery_date BETWEEN ? AND ? GROUP BY status', [d30Str, todayStr]);

    const totalOps = rates.reduce((s, r) => s + r.count, 0);
    const completedOps = (rates.find(r => r.status === 'completed') || {}).count || 0;

    return {
      date: todayStr, last_updated: new Date().toISOString(),
      today: { surgeries: todaySurgeries, patients: todayPatients,
        totalSurgeries: todaySurgeries.reduce((s, r) => s + r.count, 0),
        totalPatients: todayPatients.reduce((s, r) => s + (r.patient_count || 0), 0) },
      upcoming,
      metrics: { totalOps30d: totalOps, completedOps30d: completedOps,
        completionRate30d: totalOps > 0 ? Math.round((completedOps / totalOps) * 100) : 0 }
    };
  }

  async getRules() {
    const [rows] = await pool.query('SELECT * FROM docboard_rules WHERE is_active = 1 ORDER BY name');
    return rows.map(r => ({
      ...r,
      trigger_config: typeof r.trigger_config === 'string' ? JSON.parse(r.trigger_config) : r.trigger_config,
      action_config: typeof r.action_config === 'string' ? JSON.parse(r.action_config) : r.action_config
    }));
  }

  async createRule(data, userId) {
    const [result] = await pool.query(
      'INSERT INTO docboard_rules (name, trigger_type, trigger_config, action_type, action_config, dry_run, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [data.name, data.trigger_type, JSON.stringify(data.trigger_config || {}), data.action_type, JSON.stringify(data.action_config || {}), data.dry_run !== false ? 1 : 0, userId]);
    return { id: result.insertId };
  }

  async updateRule(id, data) {
    const fields = []; const values = [];
    for (const f of ['name', 'trigger_type', 'action_type', 'is_active', 'dry_run']) {
      if (data[f] !== undefined) { fields.push(f + ' = ?'); values.push(data[f]); }
    }
    if (data.trigger_config !== undefined) { fields.push('trigger_config = ?'); values.push(JSON.stringify(data.trigger_config)); }
    if (data.action_config !== undefined) { fields.push('action_config = ?'); values.push(JSON.stringify(data.action_config)); }
    if (fields.length === 0) return;
    values.push(id);
    await pool.query('UPDATE docboard_rules SET ' + fields.join(', ') + ' WHERE id = ?', values);
  }

  async deleteRule(id) { await pool.query('DELETE FROM docboard_rules WHERE id = ?', [id]); }

  async evaluateRules(triggerType, triggerData) {
    const rules = await this.getRules();
    const matching = rules.filter(r => r.trigger_type === triggerType);
    const results = [];
    for (const rule of matching) {
      let matches = true;
      const cfg = rule.trigger_config || {};
      if (cfg.asa_score_gte && (!triggerData.asa_score || triggerData.asa_score < cfg.asa_score_gte)) matches = false;
      if (cfg.location && triggerData.location !== cfg.location) matches = false;
      if (cfg.status && triggerData.status !== cfg.status) matches = false;
      if (!matches) continue;
      const status = rule.dry_run ? 'dry_run' : 'success';
      let actionResult = { rule_name: rule.name, action: rule.action_type };
      if (!rule.dry_run) {
        try { actionResult = await this.executeAction(rule, triggerData); } catch (err) {
          await this.logExecution(rule.id, triggerData, { error: err.message }, 'failed', err.message);
          results.push({ rule_id: rule.id, status: 'failed', error: err.message }); continue;
        }
      }
      await this.logExecution(rule.id, triggerData, actionResult, status);
      results.push({ rule_id: rule.id, rule_name: rule.name, status, action: rule.action_type });
    }
    return results;
  }

  async executeAction(rule, triggerData) {
    const cfg = rule.action_config || {};
    if (rule.action_type === 'send_notification') {
      const push = require('./DocBoardPushService');
      const title = cfg.title || 'DocBoard Alert';
      const msg = cfg.message || 'Rule triggered: ' + rule.name;
      await push.storeGlobalNotification('rule_alert', title, msg, triggerData.location || null, null);
      await push.sendToAllStaff(title, msg, { type: 'rule_alert', url: '/docboard/settings' });
      return { sent: true, title };
    }
    if (rule.action_type === 'log_alert') { logger.warn('[Rules] Alert: ' + rule.name, triggerData); return { logged: true }; }
    return { action: rule.action_type, note: 'unhandled' };
  }

  async logExecution(ruleId, triggerData, actionResult, status, error) {
    try { await pool.query(
      'INSERT INTO docboard_rule_executions (rule_id, trigger_data, action_result, status, error_message) VALUES (?, ?, ?, ?, ?)',
      [ruleId, JSON.stringify(triggerData), JSON.stringify(actionResult), status, error || null]);
    } catch { /* non-blocking */ }
  }

  async getRuleExecutions(ruleId, limit) {
    const [rows] = await pool.query(
      'SELECT * FROM docboard_rule_executions WHERE rule_id = ? ORDER BY created_at DESC LIMIT ?', [ruleId, limit || 50]);
    return rows.map(r => ({
      ...r,
      trigger_data: typeof r.trigger_data === 'string' ? JSON.parse(r.trigger_data) : r.trigger_data,
      action_result: typeof r.action_result === 'string' ? JSON.parse(r.action_result) : r.action_result
    }));
  }

  async detectConflicts(date) {
    const now = new Date();
    const dateStr = date || now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
    const [surgeries] = await pool.query(
      "SELECT s.id, s.patient_name, s.location, s.surgery_time, s.estimated_duration_min, s.status, ot.name_id as op_name FROM surgery_schedules s LEFT JOIN surgery_operation_types ot ON s.operation_type_id = ot.id WHERE s.surgery_date = ? AND s.status NOT IN ('cancelled','completed') ORDER BY s.location, s.surgery_time", [dateStr]);
    const conflicts = [];
    const byLoc = {};
    for (const s of surgeries) { if (!byLoc[s.location]) byLoc[s.location] = []; byLoc[s.location].push(s); }
    for (const [loc, list] of Object.entries(byLoc)) {
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const a = list[i], b = list[j];
          if (!a.surgery_time || !b.surgery_time) continue;
          const ap = String(a.surgery_time).split(':');
          const aStart = parseInt(ap[0]) * 60 + parseInt(ap[1] || 0);
          const aEnd = aStart + (a.estimated_duration_min || 60);
          const bp = String(b.surgery_time).split(':');
          const bStart = parseInt(bp[0]) * 60 + parseInt(bp[1] || 0);
          if (bStart < aEnd) {
            conflicts.push({ type: 'time_overlap', location: loc,
              surgery_a: { id: a.id, patient: a.patient_name, time: a.surgery_time, op: a.op_name },
              surgery_b: { id: b.id, patient: b.patient_name, time: b.surgery_time, op: b.op_name },
              recommendation: 'Jadwal ulang ' + b.patient_name + ' setelah ' + String(a.surgery_time).substring(0, 5) + ' + ' + (a.estimated_duration_min || 60) + 'm',
              confidence: 'high' });
          }
        }
      }
      if (list.length >= 4) {
        conflicts.push({ type: 'high_density', location: loc, count: list.length,
          recommendation: list.length + ' operasi di ' + loc + ' - distribusi ke lokasi lain',
          confidence: 'medium' });
      }
    }
    return { date: dateStr, conflicts, total: conflicts.length };
  }

  validateComplianceRange(startDate, endDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return { valid: false, message: 'Format tanggal tidak valid (YYYY-MM-DD)' };
    }
    const s = new Date(startDate + 'T00:00:00');
    const e = new Date(endDate + 'T00:00:00');
    if (isNaN(s.getTime()) || isNaN(e.getTime())) {
      return { valid: false, message: 'Tanggal tidak valid' };
    }
    if (e < s) {
      return { valid: false, message: 'Tanggal akhir harus setelah tanggal awal' };
    }
    const diffDays = Math.round((e - s) / (1000 * 60 * 60 * 24));
    if (diffDays > COMPLIANCE_MAX_DAYS) {
      return { valid: false, message: 'Rentang maksimal ' + COMPLIANCE_MAX_DAYS + ' hari (diminta ' + diffDays + ' hari)' };
    }
    return { valid: true, diffDays };
  }

  async getComplianceReport(startDate, endDate, location, page, limit) {
    const pageNum = Math.max(1, parseInt(page) || 1);
    const rowLimit = Math.min(COMPLIANCE_MAX_ROWS, Math.max(1, parseInt(limit) || 100));
    const offset = (pageNum - 1) * rowLimit;

    const locFilter = location ? 'AND s.location = ?' : '';
    const params = location ? [startDate, endDate, location] : [startDate, endDate];
    // Count total for pagination
    const [countRows] = await pool.query(
      'SELECT COUNT(*) as total FROM surgery_schedules s WHERE s.surgery_date BETWEEN ? AND ? ' + locFilter, params);
    const totalRows = countRows[0].total;

    // Pre-flight: estimate total payload across all sections
    const [policyCount] = await pool.query(
      'SELECT COUNT(*) as c FROM docboard_policy_log WHERE created_at BETWEEN ? AND ?',
      [startDate + ' 00:00:00', endDate + ' 23:59:59']);
    const [ruleExecCount] = await pool.query(
      'SELECT COUNT(*) as c FROM docboard_rule_executions WHERE created_at BETWEEN ? AND ?',
      [startDate + ' 00:00:00', endDate + ' 23:59:59']);
    const estimatedTotal = totalRows + (policyCount[0].c || 0) + (ruleExecCount[0].c || 0);
    if (estimatedTotal > COMPLIANCE_TOTAL_CAP) {
      const err = new Error('Total data melebihi batas (' + estimatedTotal + ' rows, max ' + COMPLIANCE_TOTAL_CAP + '). Persempit rentang tanggal atau filter lokasi.');
      err.statusCode = 400;
      throw err;
    }

    const [surgeries] = await pool.query(
      'SELECT s.id, s.patient_name, s.surgery_date, s.location, s.status, s.created_by, s.created_at, s.updated_at, ot.name_id as operation, ot.code as op_code, o.complication_grade, o.wound_class FROM surgery_schedules s LEFT JOIN surgery_operation_types ot ON s.operation_type_id = ot.id LEFT JOIN surgery_outcomes o ON o.surgery_id = s.id WHERE s.surgery_date BETWEEN ? AND ? ' + locFilter + ' ORDER BY s.surgery_date, s.surgery_time LIMIT ? OFFSET ?', [...params, rowLimit, offset]);
    const ids = surgeries.map(s => s.id);
    let audit = [];
    if (ids.length > 0) { const [rows] = await pool.query('SELECT surgery_id, action, user_id, changes, created_at FROM surgery_audit_log WHERE surgery_id IN (?) ORDER BY created_at', [ids]); audit = rows; }
    const [policy] = await pool.query(
      'SELECT user_id, action, resource, resource_id, decision, reason, created_at FROM docboard_policy_log WHERE created_at BETWEEN ? AND ? ORDER BY created_at',
      [startDate + ' 00:00:00', endDate + ' 23:59:59']);
    const [ruleExecs] = await pool.query(
      'SELECT re.rule_id, r.name as rule_name, re.status, re.error_message, re.created_at FROM docboard_rule_executions re JOIN docboard_rules r ON re.rule_id = r.id WHERE re.created_at BETWEEN ? AND ? ORDER BY re.created_at',
      [startDate + ' 00:00:00', endDate + ' 23:59:59']);
    return {
      period: { startDate, endDate, location: location || 'all' },
      pagination: { page: pageNum, limit: rowLimit, totalRows, totalPages: Math.ceil(totalRows / rowLimit) },
      generated_at: new Date().toISOString(),
      summary: { totalSurgeries: totalRows, completed: surgeries.filter(s => s.status === 'completed').length, cancelled: surgeries.filter(s => s.status === 'cancelled').length, withOutcomes: surgeries.filter(s => s.complication_grade).length, policyDecisions: policy.length, ruleExecutions: ruleExecs.length },
      surgeries, auditEntries: audit, policyEntries: policy, ruleExecutions: ruleExecs
    };
  }

  // =====================================================
  // POLICY LOG CLEANUP
  // =====================================================

  async cleanupPolicyLog(dryRun) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - POLICY_RETENTION_DAYS);
    const cutoffStr = cutoff.toISOString().slice(0, 19).replace('T', ' ');

    const [countRows] = await pool.query(
      'SELECT COUNT(*) as count FROM docboard_policy_log WHERE created_at < ?', [cutoffStr]);
    const toDelete = countRows[0].count;

    if (dryRun || toDelete === 0) {
      const result = { target: 'policy_log', dry_run: !!dryRun, would_delete: toDelete, retention_days: POLICY_RETENTION_DAYS, cutoff: cutoffStr };
      lastCleanupRun = new Date().toISOString();
      lastCleanupResult = result;
      logger.info('[Cleanup] Policy log ' + (dryRun ? 'dry run' : 'no rows') + ': ' + toDelete + ' rows older than ' + POLICY_RETENTION_DAYS + 'd');
      return result;
    }

    const [deleteResult] = await pool.query(
      'DELETE FROM docboard_policy_log WHERE created_at < ?', [cutoffStr]);
    const result = { target: 'policy_log', dry_run: false, deleted: deleteResult.affectedRows, retention_days: POLICY_RETENTION_DAYS, cutoff: cutoffStr };
    lastCleanupRun = new Date().toISOString();
    lastCleanupResult = result;
    logger.info('[Cleanup] Policy log: deleted ' + deleteResult.affectedRows + ' rows older than ' + POLICY_RETENTION_DAYS + 'd');
    return result;
  }

  // =====================================================
  // RULE EXECUTION LOG CLEANUP
  // =====================================================

  async cleanupRuleExecutions(dryRun) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - RULE_EXEC_RETENTION_DAYS);
    const cutoffStr = cutoff.toISOString().slice(0, 19).replace('T', ' ');

    const [countRows] = await pool.query(
      'SELECT COUNT(*) as count FROM docboard_rule_executions WHERE created_at < ?', [cutoffStr]);
    const toDelete = countRows[0].count;

    if (dryRun || toDelete === 0) {
      const result = { target: 'rule_executions', dry_run: !!dryRun, would_delete: toDelete, retention_days: RULE_EXEC_RETENTION_DAYS, cutoff: cutoffStr };
      lastRuleExecCleanupRun = new Date().toISOString();
      lastRuleExecCleanupResult = result;
      logger.info('[Cleanup] Rule executions ' + (dryRun ? 'dry run' : 'no rows') + ': ' + toDelete + ' rows older than ' + RULE_EXEC_RETENTION_DAYS + 'd');
      return result;
    }

    const [deleteResult] = await pool.query(
      'DELETE FROM docboard_rule_executions WHERE created_at < ?', [cutoffStr]);
    const result = { target: 'rule_executions', dry_run: false, deleted: deleteResult.affectedRows, retention_days: RULE_EXEC_RETENTION_DAYS, cutoff: cutoffStr };
    lastRuleExecCleanupRun = new Date().toISOString();
    lastRuleExecCleanupResult = result;
    logger.info('[Cleanup] Rule executions: deleted ' + deleteResult.affectedRows + ' rows older than ' + RULE_EXEC_RETENTION_DAYS + 'd');
    return result;
  }

  // =====================================================
  // CLEANUP AUDIT TRAIL
  // =====================================================

  async logCleanupAudit(userId, target, mode, result) {
    try {
      await pool.query(
        'INSERT INTO docboard_policy_log (user_id, action, resource, resource_id, decision, reason) VALUES (?, ?, ?, ?, ?, ?)',
        [userId || 'system', 'admin.cleanup', target, null, 'allow',
         JSON.stringify({ mode, deleted: result.deleted || 0, would_delete: result.would_delete || 0 })]
      );
      logger.info('[Audit] Cleanup logged: ' + target + ' ' + mode + ' by ' + (userId || 'system'));
    } catch (err) {
      logger.error('[Audit] Failed to log cleanup:', err.message);
    }
  }

  // =====================================================
  // OPERATIONAL HEALTH / METRICS
  // =====================================================

  async getHealth() {
    const flagStatus = this.getFlagCacheStatus();

    let policyLogCount = 0;
    let ruleExecCount = 0;
    try {
      const [plc] = await pool.query('SELECT COUNT(*) as c FROM docboard_policy_log');
      policyLogCount = plc[0].c;
      const [rec] = await pool.query('SELECT COUNT(*) as c FROM docboard_rule_executions');
      ruleExecCount = rec[0].c;
    } catch { /* tables may not exist */ }

    return {
      timestamp: new Date().toISOString(),
      flag_cache: flagStatus,
      policy_log: { total_rows: policyLogCount, retention_days: POLICY_RETENTION_DAYS },
      rule_executions: { total_rows: ruleExecCount, retention_days: RULE_EXEC_RETENTION_DAYS },
      compliance: { max_days: COMPLIANCE_MAX_DAYS, max_rows_per_page: COMPLIANCE_MAX_ROWS, total_cap: COMPLIANCE_TOTAL_CAP },
      cleanup: {
        policy_log: { last_run: lastCleanupRun, last_result: lastCleanupResult },
        rule_executions: { last_run: lastRuleExecCleanupRun, last_result: lastRuleExecCleanupResult }
      }
    };
  }
}

module.exports = new DocBoardCommandCenter();

import { API_BASE } from '../utils/constants';
import { enqueue, replayQueue, queueCount, syncState } from '../utils/offlineQueue';

function getToken() {
  return localStorage.getItem('docboard_token');
}

export function setToken(token) {
  localStorage.setItem('docboard_token', token);
}

export function clearToken() {
  localStorage.removeItem('docboard_token');
}

export { queueCount, syncState };

async function request(path, options = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...options.headers
  };

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers
  });

  if (res.status === 401) {
    clearToken();
    window.location.href = '/docboard/';
    throw new Error('Unauthorized');
  }

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.message || `Request failed: ${res.status}`);
  }

  return data;
}

/**
 * Mutating request with offline queue fallback.
 * If network fails, queues the operation for later replay.
 */
async function mutate(path, options = {}) {
  try {
    return await request(path, options);
  } catch (err) {
    // Check if this is a real network failure (not a server error)
    if (err.name === 'TypeError' || err.message === 'Failed to fetch') {
      const method = options.method || 'POST';
      const body = options.body ? JSON.parse(options.body) : {};
      await enqueue(method, path, body);
      return { success: true, queued: true, message: 'Disimpan offline, akan sync saat online' };
    }
    throw err;
  }
}

/**
 * Replay queued offline mutations. Call on reconnect.
 */
export async function syncOfflineQueue() {
  return replayQueue(request);
}

// Auto-replay on online event
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    syncOfflineQueue().catch(() => {});
  });
}

export const api = {
  // Calendar
  getCalendar(year, month) {
    return request(`/calendar/${year}/${month}`);
  },

  // Day detail
  getDay(date) {
    return request(`/day/${date}`);
  },

  // Today shorthand
  getToday() {
    return request('/today');
  },

  // Patient list for date+location
  getPatients(date, location) {
    return request(`/patients/${date}/${location}`);
  },

  // Trigger manual sync
  triggerSync(location) {
    return request(`/sync/${location}`, { method: 'POST' });
  },

  // Sync status all locations
  getSyncStatus() {
    return request('/sync/status');
  },

  // Practice schedules
  getSchedules() {
    return request('/schedules');
  },

  // Notifications
  getNotifications() {
    return request('/notifications');
  },

  markNotificationRead(id) {
    return request(`/notifications/${id}/read`, { method: 'PATCH' });
  },

  markAllNotificationsRead() {
    return request('/notifications/read-all', { method: 'PATCH' });
  },

  getUnreadCount() {
    return request('/notifications/unread-count');
  },

  // Push
  getVapidKey() {
    return request('/push/vapid-key');
  },

  registerPush(subscription) {
    return request('/push/register', {
      method: 'POST',
      body: JSON.stringify(subscription)
    });
  },

  unregisterPush(endpoint) {
    return request('/push/unregister', {
      method: 'DELETE',
      body: JSON.stringify({ endpoint })
    });
  },

  // Surgery
  getSurgeryCalendar(year, month) {
    return request(`/surgery/calendar/${year}/${month}`);
  },
  getDaySurgeries(date) {
    return request(`/surgery/day/${date}`);
  },
  getSurgery(id) {
    return request(`/surgery/${id}`);
  },
  createSurgery(data) {
    return mutate('/surgery', { method: 'POST', body: JSON.stringify(data) });
  },
  updateSurgery(id, data) {
    return mutate(`/surgery/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  },
  updateSurgeryStatus(id, status, reason) {
    return mutate(`/surgery/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status, reason }) });
  },
  deleteSurgery(id) {
    return request(`/surgery/${id}`, { method: 'DELETE' });
  },
  getOperationTypes() {
    return request('/surgery/operation-types');
  },
  getUpcomingSurgeries(days = 7) {
    return request(`/surgery/upcoming?days=${days}`);
  },
  getExternalStaff() {
    return request('/surgery/external-staff');
  },
  addExternalStaff(data) {
    return request('/surgery/external-staff', { method: 'POST', body: JSON.stringify(data) });
  },
  lookupRM(mrId) {
    return request(`/surgery/lookup-rm/${encodeURIComponent(mrId)}`);
  },
  searchPatient(query) {
    return request(`/surgery/search-patient?q=${encodeURIComponent(query)}`);
  },
  updatePostOpNotes(id, notes) {
    return request(`/surgery/${id}/post-op-notes`, {
      method: 'PATCH',
      body: JSON.stringify({ post_op_notes: notes })
    });
  },
  getSurgeryAuditLog(id) {
    return request(`/surgery/${id}/audit`);
  },
  getSurgeryAnalytics(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return request(`/surgery/analytics${qs ? '?' + qs : ''}`);
  },

  // PDF Export - returns URL string (not a fetch, used with window.open)
  getExportPDFUrl(startDate, endDate) {
    const token = getToken();
    return `${API_BASE}/surgery/export/pdf?start=${startDate}&end=${endDate}&token=${token}`;
  },

  // AI Briefing
  getBriefing(date, refresh = false) {
    return request(`/ai/briefing/${date}${refresh ? '?refresh=true' : ''}`);
  },

  // Templates
  getTemplates() {
    return request('/surgery/templates');
  },
  createTemplate(name, defaultData) {
    return request('/surgery/templates', { method: 'POST', body: JSON.stringify({ name, default_data: defaultData }) });
  },
  deleteTemplate(id) {
    return request(`/surgery/templates/${id}`, { method: 'DELETE' });
  },

  // Checklist
  getChecklist(surgeryId) {
    return request(`/surgery/${surgeryId}/checklist`);
  },
  updateChecklist(surgeryId, items) {
    return request(`/surgery/${surgeryId}/checklist`, { method: 'PUT', body: JSON.stringify({ items }) });
  },

  // OR Board
  getORBoard(date) {
    return request(`/surgery/or-board${date ? '?date=' + date : ''}`);
  },

  // Outcomes
  getOutcome(surgeryId) {
    return request(`/surgery/${surgeryId}/outcome`);
  },
  saveOutcome(surgeryId, data) {
    return request(`/surgery/${surgeryId}/outcome`, { method: 'PUT', body: JSON.stringify(data) });
  },

  // Outcome analytics
  getOutcomeAnalytics(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return request(`/surgery/analytics/outcomes${qs ? '?' + qs : ''}`);
  },

  // Clinic analytics
  getClinicAnalytics(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return request(`/analytics/clinic${qs ? '?' + qs : ''}`);
  },

  // Preferences
  getPreferences() {
    return request('/preferences');
  },
  updatePreferences(prefs) {
    return request('/preferences', { method: 'PUT', body: JSON.stringify({ preferences: prefs }) });
  },

  // Phase 5: Command Center
  getFeatureFlags() {
    return request('/flags');
  },
  setFeatureFlag(key, enabled) {
    return request('/flags/' + key, { method: 'PUT', body: JSON.stringify({ enabled }) });
  },
  getDashboard() {
    return request('/command/dashboard');
  },
  getConflicts(date) {
    return request('/command/conflicts' + (date ? '?date=' + date : ''));
  },
  getRules() {
    return request('/command/rules');
  },
  createRule(data) {
    return request('/command/rules', { method: 'POST', body: JSON.stringify(data) });
  },
  updateRule(id, data) {
    return request('/command/rules/' + id, { method: 'PUT', body: JSON.stringify(data) });
  },
  deleteRule(id) {
    return request('/command/rules/' + id, { method: 'DELETE' });
  },
  getRuleExecutions(ruleId) {
    return request('/command/rules/' + ruleId + '/executions');
  },
  getComplianceReport(start, end, location) {
    let qs = '?start=' + start + '&end=' + end;
    if (location) qs += '&location=' + location;
    return request('/command/compliance' + qs);
  },
  checkPolicy(action, resource, resourceId) {
    return request('/command/policy-check', { method: 'POST', body: JSON.stringify({ action, resource, resource_id: resourceId }) });
  },
  getMetricsTrend(days) {
    return request('/command/metrics?days=' + (days || 7));
  },
  getComplianceUsageTrend(days) {
    return request('/command/compliance-usage?days=' + (days || 7));
  },
  pruneRuleExecutions(days, dryRun) {
    return request('/command/prune-rules?days=' + (days || '') + '&dry_run=' + (dryRun ? 'true' : 'false'), { method: 'POST' });
  },
  getAlertLog(limit) {
    return request('/command/alerts?limit=' + (limit || 20));
  }
};

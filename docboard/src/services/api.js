import { API_BASE } from '../utils/constants';
import { enqueue, replayQueue, queueCount, syncState } from '../utils/offlineQueue';

const DOCBOARD_SPACE_SCHEDULES_KEY = 'docboard_space_schedules';

function formatDateOffset(offsetDays) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

const defaultSpaceSchedules = [
  {
    id: 'ilmiah-001',
    space: 'ilmiah',
    agenda: 'Pertemuan dengan staff Obgyn',
    category: 'Pertemuan Staff',
    schedule_date: formatDateOffset(1),
    start_time: '13:00',
    end_time: '14:00',
    location: 'Ruang rapat dokter',
    participants: 'Staff Obgyn, bidan koordinator',
    status: 'scheduled',
    notes: 'Bahas agenda ilmiah, review kasus, dan rencana pembahasan klinik.',
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'ilmiah-002',
    space: 'ilmiah',
    agenda: 'Diskusi kasus USG trimester 2',
    category: 'Diskusi Kasus',
    schedule_date: formatDateOffset(4),
    start_time: '12:30',
    end_time: '13:30',
    location: 'Klinik private',
    participants: 'Dokter dan asisten USG',
    status: 'confirmed',
    notes: 'Siapkan daftar kasus yang perlu direview bersama.',
    updatedAt: new Date(Date.now() - 86400000).toISOString(),
  },
  {
    id: 'pribadi-001',
    space: 'pribadi',
    agenda: 'Janji dengan istri',
    category: 'Keluarga',
    schedule_date: formatDateOffset(0),
    start_time: '19:00',
    end_time: '20:30',
    location: 'Rumah',
    participants: 'Istri',
    status: 'scheduled',
    notes: 'Blok waktu pribadi agar tidak tertimpa agenda klinik.',
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'pribadi-002',
    space: 'pribadi',
    agenda: 'Agenda keluarga akhir pekan',
    category: 'Keluarga',
    schedule_date: formatDateOffset(3),
    start_time: '09:00',
    end_time: '11:00',
    location: 'Rumah',
    participants: 'Keluarga',
    status: 'scheduled',
    notes: 'Pastikan tidak berbenturan dengan jadwal operasi atau praktik.',
    updatedAt: new Date(Date.now() - 172800000).toISOString(),
  },
  {
    id: 'tindakan-001',
    space: 'tindakan',
    agenda: 'Kontrol tindakan klinik',
    category: 'Pasang IUD',
    schedule_date: formatDateOffset(2),
    start_time: '10:00',
    end_time: '10:30',
    location: 'Klinik private',
    participants: 'Pasien tindakan',
    status: 'scheduled',
    notes: 'Contoh jadwal tindakan. Ubah atau hapus sesuai kebutuhan.',
    updatedAt: new Date().toISOString(),
  },
];

function loadSpaceSchedules() {
  try {
    const savedSchedules = JSON.parse(localStorage.getItem(DOCBOARD_SPACE_SCHEDULES_KEY) || 'null');
    return Array.isArray(savedSchedules) ? savedSchedules : defaultSpaceSchedules;
  } catch {
    return defaultSpaceSchedules;
  }
}

function saveSpaceSchedules(schedules) {
  localStorage.setItem(DOCBOARD_SPACE_SCHEDULES_KEY, JSON.stringify(schedules));
}

function getToken() {
  return localStorage.getItem('docboard_token');
}

function getTokenPayload() {
  const token = getToken();
  if (!token) return null;
  try {
    return JSON.parse(atob(token.split('.')[1]));
  } catch {
    return null;
  }
}

function getCurrentUserDisplayName() {
  const payload = getTokenPayload();
  return payload?.name || payload?.email || '';
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

function localListSpaceSchedules(space) {
  return loadSpaceSchedules()
    .filter((schedule) => schedule.space === space)
    .sort((first, second) => {
      const firstTime = `${first.schedule_date || '9999-12-31'}T${first.start_time || '00:00'}`;
      const secondTime = `${second.schedule_date || '9999-12-31'}T${second.start_time || '00:00'}`;
      return firstTime.localeCompare(secondTime);
    });
}

function localAddSpaceSchedule(space, data) {
  const schedules = loadSpaceSchedules();
  const schedule = {
    id: `${space}-${Date.now()}`,
    space,
    agenda: data.agenda,
    category: data.category,
    schedule_date: data.schedule_date,
    start_time: data.start_time,
    end_time: data.end_time,
    location: data.location,
    participants: data.participants,
    status: data.status || 'scheduled',
    notes: data.notes,
    creator_name: getCurrentUserDisplayName(),
    creator_display_name: getCurrentUserDisplayName(),
    updatedAt: new Date().toISOString(),
  };

  saveSpaceSchedules([schedule, ...schedules]);
  syncState.value = 'Jadwal tersimpan';
  setTimeout(() => {
    syncState.value = navigator.onLine ? 'Online' : 'Offline';
  }, 1800);

  return schedule;
}

function localUpdateSpaceScheduleStatus(space, id, status) {
  const schedules = loadSpaceSchedules().map((schedule) => (
    schedule.id === id
      ? { ...schedule, status, updatedAt: new Date().toISOString() }
      : schedule
  ));

  saveSpaceSchedules(schedules);
  syncState.value = 'Status jadwal diperbarui';
  setTimeout(() => {
    syncState.value = navigator.onLine ? 'Online' : 'Offline';
  }, 1800);

  return localListSpaceSchedules(space);
}

function localUpdateSpaceSchedule(space, id, data) {
  const schedules = loadSpaceSchedules().map((schedule) => (
    schedule.id === id
      ? {
          ...schedule,
          agenda: data.agenda,
          category: data.category,
          schedule_date: data.schedule_date,
          start_time: data.start_time,
          end_time: data.end_time,
          location: data.location,
          participants: data.participants,
          notes: data.notes,
          updatedAt: new Date().toISOString(),
        }
      : schedule
  ));

  saveSpaceSchedules(schedules);
  syncState.value = 'Jadwal diperbarui';
  setTimeout(() => {
    syncState.value = navigator.onLine ? 'Online' : 'Offline';
  }, 1800);

  return localListSpaceSchedules(space);
}

function localDeleteSpaceSchedule(space, id) {
  const schedules = loadSpaceSchedules().filter((schedule) => schedule.id !== id);

  saveSpaceSchedules(schedules);
  syncState.value = 'Jadwal dihapus';
  setTimeout(() => {
    syncState.value = navigator.onLine ? 'Online' : 'Offline';
  }, 1800);

  return localListSpaceSchedules(space);
}

export async function listSpaceSchedules(space, filters = {}) {
  const params = new URLSearchParams({ space, ...filters });
  try {
    const data = await request(`/space-schedules?${params.toString()}`);
    return data.schedules || [];
  } catch (err) {
    console.warn('Using local DocBoard space schedules fallback:', err.message);
    return localListSpaceSchedules(space);
  }
}

export async function listDaySpaceSchedules(date) {
  try {
    const data = await request(`/space-schedules?date=${encodeURIComponent(date)}`);
    return data.schedules || [];
  } catch (err) {
    console.warn('Using local DocBoard day space schedules fallback:', err.message);
    return loadSpaceSchedules().filter((schedule) => schedule.schedule_date === date);
  }
}

export async function getSpaceScheduleCalendar(year, month) {
  try {
    const data = await request(`/space-schedules/calendar/${year}/${month}`);
    return data.days || {};
  } catch (err) {
    console.warn('Using local DocBoard space calendar fallback:', err.message);
    const days = {};
    loadSpaceSchedules().forEach((schedule) => {
      if (schedule.status === 'cancelled') return;
      const date = schedule.schedule_date;
      if (!days[date]) days[date] = { total: 0, spaces: { ilmiah: 0, tindakan: 0, pribadi: 0 } };
      days[date].total += 1;
      days[date].spaces[schedule.space] = (days[date].spaces[schedule.space] || 0) + 1;
    });
    return days;
  }
}

export async function addSpaceSchedule(space, data) {
  try {
    const result = await mutate('/space-schedules', {
      method: 'POST',
      body: JSON.stringify({ ...data, space })
    });
    if (result.schedule) return result.schedule;
  } catch (err) {
    console.warn('Saving DocBoard space schedule locally:', err.message);
  }
  return localAddSpaceSchedule(space, data);
}

export async function updateSpaceSchedule(space, id, data) {
  try {
    const result = await mutate(`/space-schedules/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
    if (result.schedule) return result.schedule;
  } catch (err) {
    console.warn('Updating DocBoard space schedule locally:', err.message);
  }
  return localUpdateSpaceSchedule(space, id, data).find((schedule) => schedule.id === id) || null;
}

export async function updateSpaceScheduleStatus(space, id, status) {
  try {
    const result = await mutate(`/space-schedules/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status })
    });
    if (result.schedule) return result.schedule;
  } catch (err) {
    console.warn('Updating DocBoard space schedule status locally:', err.message);
  }
  return localUpdateSpaceScheduleStatus(space, id, status).find((schedule) => schedule.id === id) || null;
}

export async function deleteSpaceSchedule(space, id) {
  try {
    await mutate(`/space-schedules/${id}`, { method: 'DELETE' });
    syncState.value = 'Jadwal dihapus';
    setTimeout(() => {
      syncState.value = navigator.onLine ? 'Online' : 'Offline';
    }, 1800);
    return true;
  } catch (err) {
    console.warn('Deleting DocBoard space schedule locally:', err.message);
  }
  localDeleteSpaceSchedule(space, id);
  return true;
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
  getUpcomingSurgeries(days = 7, pastDays = 0) {
    return request(`/surgery/upcoming?days=${days}&pastDays=${pastDays}`);
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

  getOperationData(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return request(`/operation-data${qs ? '?' + qs : ''}`);
  },

  getOperationDataDetail(id) {
    return request(`/operation-data/${id}`);
  },

  getGambiranMonitor(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return request(`/monitor/gambiran${qs ? '?' + qs : ''}`);
  },

  getGambiranAudit(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return request(`/audit/gambiran${qs ? '?' + qs : ''}`);
  },

  getGambiranAuditPathology(id) {
    return request(`/audit/gambiran/${encodeURIComponent(id)}/pathology`);
  },

  getGambiranAuditXlsUrl(params = {}) {
    const token = getToken();
    const qs = new URLSearchParams({ ...params, token }).toString();
    return `${API_BASE}/audit/gambiran/export.xlsx?${qs}`;
  },

  getGambiranAuditPathologyFileUrl(fileUrl) {
    const token = getToken();
    const path = fileUrl.startsWith(API_BASE) ? fileUrl : `${API_BASE}${fileUrl}`;
    const separator = fileUrl.includes('?') ? '&' : '?';
    return `${path}${separator}token=${encodeURIComponent(token)}`;
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

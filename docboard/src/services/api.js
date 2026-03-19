import { API_BASE } from '../utils/constants';

function getToken() {
  return localStorage.getItem('docboard_token');
}

export function setToken(token) {
  localStorage.setItem('docboard_token', token);
}

export function clearToken() {
  localStorage.removeItem('docboard_token');
}

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
    return request('/surgery', { method: 'POST', body: JSON.stringify(data) });
  },
  updateSurgery(id, data) {
    return request(`/surgery/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  },
  updateSurgeryStatus(id, status, reason) {
    return request(`/surgery/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status, reason }) });
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
  }
};

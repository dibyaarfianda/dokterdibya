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

  // Push token registration
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
  }
};

import { signal, computed } from '@preact/signals';
import { docboardSession } from '../../../public/scripts/docboard-session.js';
import { getAccountPermissions } from '../utils/access.js';

const { getToken, setToken, clearToken } = docboardSession;

export const user = signal(null);
export const isLoading = signal(true);
export const accountAccess = signal(null);
export const accessError = signal('');
let accessRequest = null;

export const isLoggedIn = computed(() => !!user.value);
export const userName = computed(() => user.value?.name || '');
export const userRole = computed(() => accountAccess.value?.job_label || '');
export const surgeryPermissions = computed(() => getAccountPermissions(accountAccess.value));

export function hasPermission(permission) {
  return accountAccess.value?.permissions?.includes(permission) === true;
}

export async function refreshAccountAccess() {
  const token = getToken();
  const userId = user.value?.id;
  if (!token || !userId) return null;
  if (accessRequest?.token === token) return accessRequest.promise;

  const request = { token };
  accessRequest = request;
  const isCurrent = () => accessRequest === request && getToken() === token && user.value?.id === userId;
  request.promise = (async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const res = await fetch('/api/access/me', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
        signal: controller.signal,
      });
      if (!isCurrent()) return null;
      if (res.status === 401) {
        logout();
        return null;
      }
      const data = await res.json();
      if (!res.ok || !data.success || !Array.isArray(data.data?.permissions)) {
        throw new Error('Hak akses belum termuat. Coba lagi.');
      }
      if (!isCurrent()) return null;
      accountAccess.value = data.data;
      accessError.value = '';
      return data.data;
    } catch (error) {
      if (isCurrent()) {
        accountAccess.value = null;
        accessError.value = 'Hak akses belum termuat. Coba lagi.';
      }
      return null;
    } finally {
      clearTimeout(timeout);
      if (accessRequest === request) accessRequest = null;
    }
  })();
  return request.promise;
}

export async function initAuth() {
  accountAccess.value = null;
  accessError.value = '';
  const token = getToken();
  user.value = null;
  if (token) {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      // Check expiry
      if (payload.exp && payload.exp * 1000 < Date.now()) {
        clearToken();
        user.value = null;
      } else {
        user.value = payload;
      }
    } catch {
      clearToken();
      user.value = null;
    }
  }
  try {
    await refreshAccountAccess();
  } finally {
    isLoading.value = false;
  }
}

export async function login(email, password) {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });

  const data = await res.json();

  // Backend wraps response in { success, data: { token, user }, message }
  const token = data.token || data.data?.token;

  if (!res.ok || !token) {
    throw new Error(data.message || 'Login gagal');
  }

  setToken(token);
  const payload = JSON.parse(atob(token.split('.')[1]));
  user.value = payload;
  accountAccess.value = null;
  await refreshAccountAccess();
  return payload;
}

export function logout() {
  accessRequest = null;
  accountAccess.value = null;
  accessError.value = '';
  clearToken();
  user.value = null;
}

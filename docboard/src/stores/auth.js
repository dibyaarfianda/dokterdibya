import { signal, computed } from '@preact/signals';
import { setToken, clearToken } from '../services/api';

export const user = signal(null);
export const isLoading = signal(true);

export const isLoggedIn = computed(() => !!user.value);
export const userName = computed(() => user.value?.name || '');
export const userRole = computed(() => user.value?.role || '');

export function initAuth() {
  const token = localStorage.getItem('docboard_token');
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
  isLoading.value = false;
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
  return payload;
}

export function logout() {
  clearToken();
  user.value = null;
}

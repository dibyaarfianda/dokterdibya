/**
 * Staff Mobile App - Main Entry Point
 */

import { api } from './api.js';
import { auth } from './auth.js';
import { router } from './router.js';
import { renderDashboard } from './pages/dashboard.js';
import { renderQueue } from './pages/queue.js';
import { renderPatients } from './pages/patients.js';
import { renderBilling } from './pages/billing.js';
import { renderNotifications } from './pages/notifications.js';

// ===== Global State =====
const state = {
    notifCount: 0,
    queueCount: 0,
    pendingBillings: 0
};

// ===== UI Helpers =====
function showLoading() {
    document.getElementById('loading-overlay').style.display = 'flex';
}

function hideLoading() {
    document.getElementById('loading-overlay').style.display = 'none';
}

function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'times-circle' : 'exclamation-circle'}"></i>
        <span>${message}</span>
    `;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.style.display = 'none');
    document.getElementById(screenId).style.display = 'flex';
}

// ===== Badge Updates =====
async function updateBadges() {
    try {
        // Notification count
        const notifResponse = await api.getNotificationCount();
        if (notifResponse.success) {
            state.notifCount = notifResponse.count || 0;
            const notifBadge = document.getElementById('notif-badge');
            if (state.notifCount > 0) {
                notifBadge.textContent = state.notifCount > 99 ? '99+' : state.notifCount;
                notifBadge.style.display = 'flex';
            } else {
                notifBadge.style.display = 'none';
            }
        }
    } catch (error) {
        console.error('Failed to update badges:', error);
    }
}

// ===== Login Handler =====
async function handleLogin(e) {
    e.preventDefault();

    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const btn = document.getElementById('login-btn');
    const errorEl = document.getElementById('login-error');

    if (!email || !password) {
        errorEl.textContent = 'Email dan password harus diisi';
        return;
    }

    btn.disabled = true;
    btn.querySelector('span').style.display = 'none';
    btn.querySelector('i').style.display = 'inline-block';
    errorEl.textContent = '';

    try {
        const result = await auth.login(email, password);
        if (result.success) {
            showScreen('app-screen');
            router.navigate('dashboard');
            updateBadges();
        } else {
            errorEl.textContent = result.message || 'Login gagal';
        }
    } catch (error) {
        errorEl.textContent = error.message || 'Terjadi kesalahan';
    } finally {
        btn.disabled = false;
        btn.querySelector('span').style.display = 'inline';
        btn.querySelector('i').style.display = 'none';
    }
}

// ===== Logout Handler =====
function handleLogout() {
    if (confirm('Keluar dari aplikasi?')) {
        auth.logout();
        document.getElementById('login-form').reset();
        document.getElementById('login-error').textContent = '';
        showScreen('login-screen');
    }
}

// ===== Refresh Handler =====
async function handleRefresh() {
    const btn = document.getElementById('refresh-btn');
    btn.querySelector('i').classList.add('fa-spin');

    try {
        await router.navigate(router.getCurrentPage());
        await updateBadges();
        showToast('Data diperbarui');
    } catch (error) {
        showToast(error.message, 'error');
    } finally {
        btn.querySelector('i').classList.remove('fa-spin');
    }
}

// ===== Register Routes =====
function registerRoutes() {
    router.register('dashboard', renderDashboard);
    router.register('queue', renderQueue);
    router.register('patients', renderPatients);
    router.register('billing', renderBilling);
    router.register('notifications', renderNotifications);
}

// ===== Setup Event Listeners =====
function setupEventListeners() {
    // Login form
    document.getElementById('login-form').addEventListener('submit', handleLogin);

    // Logout button
    document.getElementById('logout-btn').addEventListener('click', handleLogout);

    // Refresh button
    document.getElementById('refresh-btn').addEventListener('click', handleRefresh);

    // Bottom navigation
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            const page = item.dataset.page;
            if (page) router.navigate(page);
        });
    });

    // Listen for auth logout event
    window.addEventListener('auth:logout', () => {
        showScreen('login-screen');
        showToast('Sesi berakhir, silakan login kembali', 'warning');
    });
}

// ===== Initialize App =====
async function init() {
    console.log('Initializing Staff Mobile App...');

    registerRoutes();
    setupEventListeners();

    // Check if already authenticated
    showLoading();
    const isAuth = await auth.init();
    hideLoading();

    if (isAuth) {
        showScreen('app-screen');
        router.navigate('dashboard');
        updateBadges();

        // Periodic badge updates
        setInterval(updateBadges, 60000); // Every minute
    } else {
        showScreen('login-screen');
    }
}

// ===== Export for page modules =====
export { showLoading, hideLoading, showToast, state, updateBadges };

// ===== Start App =====
document.addEventListener('DOMContentLoaded', init);

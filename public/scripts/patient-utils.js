/**
 * Patient Portal Utilities
 * Shared utility functions for all patient portal pages
 */

// Token key - matches vps-auth-v2.js
const TOKEN_KEY = 'vps_auth_token';

// API Base URL
const API_BASE = window.location.hostname === 'localhost'
    ? 'http://localhost:3000'
    : '';

/**
 * Get authentication token from storage
 * Checks both localStorage and sessionStorage
 */
function getToken() {
    return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
}

/**
 * Check if user is authenticated
 * Redirects to login page if not
 * @returns {boolean}
 */
function checkAuth() {
    const token = getToken();
    if (!token) {
        window.location.href = '/patient-login.html';
        return false;
    }
    return true;
}

/**
 * Logout user - clear token and redirect
 */
function logout() {
    localStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
    window.location.href = '/patient-login.html';
}

/**
 * API request helper with automatic token handling
 * @param {string} endpoint - API endpoint (e.g., '/api/patient/profile')
 * @param {Object} options - Fetch options
 * @returns {Promise<Object|null>}
 */
async function apiRequest(endpoint, options = {}) {
    const token = getToken();

    if (!token) {
        window.location.href = '/patient-login.html';
        return null;
    }

    const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`;

    // Add cache-busting timestamp
    const separator = url.includes('?') ? '&' : '?';
    const cacheBustUrl = `${url}${separator}_t=${Date.now()}`;

    try {
        const response = await fetch(cacheBustUrl, {
            ...options,
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache',
                ...options.headers
            }
        });

        // Handle 401 Unauthorized
        if (response.status === 401) {
            localStorage.removeItem(TOKEN_KEY);
            sessionStorage.removeItem(TOKEN_KEY);
            window.location.href = '/patient-login.html';
            return null;
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('API request error:', error);
        throw error;
    }
}

/**
 * Show toast notification
 * @param {string} message - Message to display
 * @param {string} type - Toast type: 'info', 'success', 'error', 'warning'
 * @param {number} duration - Duration in milliseconds (default 3000)
 */
function showToast(message, type = 'info', duration = 3000) {
    // Remove existing toasts
    const existingToasts = document.querySelectorAll('.toast');
    existingToasts.forEach(t => t.remove());

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;

    // Add icon based on type
    const iconMap = {
        success: 'fa-check-circle',
        error: 'fa-times-circle',
        warning: 'fa-exclamation-circle',
        info: 'fa-info-circle'
    };

    if (iconMap[type]) {
        toast.innerHTML = `<i class="fa ${iconMap[type]}"></i> ${message}`;
    }

    document.body.appendChild(toast);

    // Auto-remove after duration
    setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

/**
 * Format date to Indonesian locale
 * @param {string|Date} dateStr - Date string or Date object
 * @param {Object} options - Intl.DateTimeFormat options
 * @returns {string}
 */
function formatDate(dateStr, options = {}) {
    if (!dateStr) return '-';

    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '-';

    return date.toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        ...options
    });
}

/**
 * Format date with time
 * @param {string|Date} dateStr - Date string or Date object
 * @returns {string}
 */
function formatDateTime(dateStr) {
    if (!dateStr) return '-';

    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '-';

    return date.toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

/**
 * Format time only (HH:mm)
 * @param {string|Date} dateStr - Date string or Date object
 * @returns {string}
 */
function formatTime(dateStr) {
    if (!dateStr) return '-';

    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '-';

    return date.toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit'
    });
}

/**
 * Format relative time (e.g., "2 jam lalu")
 * @param {string|Date} dateStr - Date string or Date object
 * @returns {string}
 */
function formatRelativeTime(dateStr) {
    if (!dateStr) return '-';

    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '-';

    const now = new Date();
    const diffMs = now - date;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    if (diffSec < 60) return 'Baru saja';
    if (diffMin < 60) return `${diffMin} menit lalu`;
    if (diffHour < 24) return `${diffHour} jam lalu`;
    if (diffDay < 7) return `${diffDay} hari lalu`;

    return formatDate(date);
}

/**
 * Format currency to Indonesian Rupiah
 * @param {number} amount - Amount in Rupiah
 * @returns {string}
 */
function formatRupiah(amount) {
    if (amount === null || amount === undefined) return 'Rp 0';

    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(amount);
}

/**
 * Format number with thousands separator
 * @param {number} num - Number to format
 * @returns {string}
 */
function formatNumber(num) {
    if (num === null || num === undefined) return '0';
    return new Intl.NumberFormat('id-ID').format(num);
}

/**
 * Show loading state in a container
 * @param {HTMLElement|string} container - Container element or selector
 * @param {string} message - Loading message
 */
function showLoading(container, message = 'Memuat...') {
    const el = typeof container === 'string'
        ? document.querySelector(container)
        : container;

    if (!el) return;

    el.innerHTML = `
        <div class="loading">
            <i class="fa fa-spinner fa-spin"></i>
            <span>${message}</span>
        </div>
    `;
}

/**
 * Show empty state in a container
 * @param {HTMLElement|string} container - Container element or selector
 * @param {string} icon - Font Awesome icon class
 * @param {string} message - Empty state message
 */
function showEmptyState(container, icon = 'fa-inbox', message = 'Tidak ada data') {
    const el = typeof container === 'string'
        ? document.querySelector(container)
        : container;

    if (!el) return;

    el.innerHTML = `
        <div class="empty-state">
            <i class="fa ${icon}"></i>
            <p>${message}</p>
        </div>
    `;
}

/**
 * Show error state in a container
 * @param {HTMLElement|string} container - Container element or selector
 * @param {string} message - Error message
 * @param {Function} retryFn - Optional retry function
 */
function showErrorState(container, message = 'Terjadi kesalahan', retryFn = null) {
    const el = typeof container === 'string'
        ? document.querySelector(container)
        : container;

    if (!el) return;

    el.innerHTML = `
        <div class="empty-state error-state">
            <i class="fa fa-exclamation-triangle"></i>
            <p>${message}</p>
            ${retryFn ? '<button class="btn-secondary retry-btn">Coba Lagi</button>' : ''}
        </div>
    `;

    if (retryFn) {
        el.querySelector('.retry-btn')?.addEventListener('click', retryFn);
    }
}

/**
 * Confirm dialog with promise
 * @param {string} message - Confirmation message
 * @param {Object} options - Dialog options
 * @returns {Promise<boolean>}
 */
function confirmDialog(message, options = {}) {
    return new Promise((resolve) => {
        const {
            title = 'Konfirmasi',
            confirmText = 'Ya',
            cancelText = 'Batal',
            type = 'warning'
        } = options;

        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `
            <div class="modal-content confirm-modal">
                <div class="modal-header">
                    <h3>${title}</h3>
                </div>
                <div class="modal-body">
                    <p>${message}</p>
                </div>
                <div class="modal-footer">
                    <button class="btn-secondary cancel-btn">${cancelText}</button>
                    <button class="btn-primary ${type === 'danger' ? 'btn-danger' : ''} confirm-btn">${confirmText}</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        // Add show class for animation
        setTimeout(() => overlay.classList.add('show'), 10);

        const close = (result) => {
            overlay.classList.remove('show');
            setTimeout(() => overlay.remove(), 300);
            resolve(result);
        };

        overlay.querySelector('.cancel-btn').addEventListener('click', () => close(false));
        overlay.querySelector('.confirm-btn').addEventListener('click', () => close(true));
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) close(false);
        });
    });
}

/**
 * Debounce function
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in milliseconds
 * @returns {Function}
 */
function debounce(func, wait = 300) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Throttle function
 * @param {Function} func - Function to throttle
 * @param {number} limit - Limit time in milliseconds
 * @returns {Function}
 */
function throttle(func, limit = 300) {
    let inThrottle;
    return function executedFunction(...args) {
        if (!inThrottle) {
            func(...args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

/**
 * Get current user info from token
 * @returns {Promise<Object|null>}
 */
async function getCurrentUser() {
    try {
        const data = await apiRequest('/api/patients/me');
        if (data && data.success) {
            return data.patient || data.data;
        }
        return null;
    } catch (error) {
        console.error('Error getting current user:', error);
        return null;
    }
}

/**
 * Initialize page with auth check
 * @param {Function} onReady - Callback when auth is verified
 */
async function initPage(onReady) {
    if (!checkAuth()) return;

    try {
        const user = await getCurrentUser();
        if (user && onReady) {
            onReady(user);
        }
    } catch (error) {
        console.error('Error initializing page:', error);
        showToast('Gagal memuat data pengguna', 'error');
    }
}

/**
 * Set active navigation item
 * @param {string} navId - ID or href of nav item to activate
 */
function setActiveNav(navId) {
    document.querySelectorAll('.bottom-nav .nav-item').forEach(item => {
        item.classList.remove('active');
        if (item.getAttribute('href') === navId || item.dataset.nav === navId) {
            item.classList.add('active');
        }
    });
}

/**
 * Parse query string parameters
 * @returns {Object}
 */
function getQueryParams() {
    const params = {};
    const searchParams = new URLSearchParams(window.location.search);
    for (const [key, value] of searchParams) {
        params[key] = value;
    }
    return params;
}

/**
 * Escape HTML to prevent XSS
 * @param {string} str - String to escape
 * @returns {string}
 */
function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

/**
 * Truncate text with ellipsis
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string}
 */
function truncateText(text, maxLength = 100) {
    if (!text || text.length <= maxLength) return text || '';
    return text.substring(0, maxLength) + '...';
}

// Export functions for ES modules
export {
    TOKEN_KEY,
    API_BASE,
    getToken,
    checkAuth,
    logout,
    apiRequest,
    showToast,
    formatDate,
    formatDateTime,
    formatTime,
    formatRelativeTime,
    formatRupiah,
    formatNumber,
    showLoading,
    showEmptyState,
    showErrorState,
    confirmDialog,
    debounce,
    throttle,
    getCurrentUser,
    initPage,
    setActiveNav,
    getQueryParams,
    escapeHtml,
    truncateText
};

// Also expose to window for non-module scripts
window.PatientUtils = {
    TOKEN_KEY,
    API_BASE,
    getToken,
    checkAuth,
    logout,
    apiRequest,
    showToast,
    formatDate,
    formatDateTime,
    formatTime,
    formatRelativeTime,
    formatRupiah,
    formatNumber,
    showLoading,
    showEmptyState,
    showErrorState,
    confirmDialog,
    debounce,
    throttle,
    getCurrentUser,
    initPage,
    setActiveNav,
    getQueryParams,
    escapeHtml,
    truncateText
};

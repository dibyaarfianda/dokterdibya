/**
 * API Service Module
 * Centralized API communication for patient registration and authentication
 */

// Determine API base URL
const API_BASE = (() => {
    const hostname = window.location.hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
        return 'http://localhost:3000';
    }
    return window.location.origin;
})();

/**
 * API Service Object
 */
export const apiService = {
    /**
     * Make a GET request
     * @param {string} endpoint - API endpoint (e.g., '/api/patients')
     * @param {Object} options - Additional fetch options
     * @returns {Promise<Object>} Response data
     */
    async get(endpoint, options = {}) {
        try {
            let url;
            if (endpoint.startsWith('http')) {
                url = endpoint;
            } else if (endpoint.startsWith('/api/')) {
                url = `${API_BASE}${endpoint}`;
            } else {
                url = `${API_BASE}/api${endpoint}`;
            }
            const token = sessionStorage.getItem('auth_token') || localStorage.getItem('auth_token');

            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token && { 'Authorization': `Bearer ${token}` }),
                    ...options.headers
                },
                ...options
            });

            if (!response.ok) {
                const error = await response.json().catch(() => ({ message: 'Request failed' }));
                throw new Error(error.message || `HTTP ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error('API GET Error:', error);
            throw error;
        }
    },

    /**
     * Make a POST request
     * @param {string} endpoint - API endpoint (e.g., '/api/auth/register')
     * @param {Object} data - Request body data
     * @param {Object} options - Additional fetch options
     * @returns {Promise<Object>} Response data
     */
    async post(endpoint, data = {}, options = {}) {
        try {
            let url;
            if (endpoint.startsWith('http')) {
                url = endpoint;
            } else if (endpoint.startsWith('/api/')) {
                url = `${API_BASE}${endpoint}`;
            } else {
                url = `${API_BASE}/api${endpoint}`;
            }
            const token = sessionStorage.getItem('auth_token') || localStorage.getItem('auth_token');

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token && { 'Authorization': `Bearer ${token}` }),
                    ...options.headers
                },
                body: JSON.stringify(data),
                ...options
            });

            const responseData = await response.json().catch(() => ({
                success: false,
                message: 'Invalid response format'
            }));

            if (!response.ok) {
                return {
                    success: false,
                    message: responseData.message || `HTTP ${response.status}`,
                    ...responseData
                };
            }

            return {
                success: true,
                ...responseData
            };
        } catch (error) {
            console.error('API POST Error:', error);
            return {
                success: false,
                message: error.message || 'Network error occurred'
            };
        }
    },

    /**
     * Make a PUT request
     * @param {string} endpoint - API endpoint
     * @param {Object} data - Request body data
     * @param {Object} options - Additional fetch options
     * @returns {Promise<Object>} Response data
     */
    async put(endpoint, data = {}, options = {}) {
        try {
            let url;
            if (endpoint.startsWith('http')) {
                url = endpoint;
            } else if (endpoint.startsWith('/api/')) {
                url = `${API_BASE}${endpoint}`;
            } else {
                url = `${API_BASE}/api${endpoint}`;
            }
            const token = sessionStorage.getItem('auth_token') || localStorage.getItem('auth_token');

            const response = await fetch(url, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token && { 'Authorization': `Bearer ${token}` }),
                    ...options.headers
                },
                body: JSON.stringify(data),
                ...options
            });

            const responseData = await response.json().catch(() => ({
                success: false,
                message: 'Invalid response format'
            }));

            if (!response.ok) {
                return {
                    success: false,
                    message: responseData.message || `HTTP ${response.status}`,
                    ...responseData
                };
            }

            return {
                success: true,
                ...responseData
            };
        } catch (error) {
            console.error('API PUT Error:', error);
            return {
                success: false,
                message: error.message || 'Network error occurred'
            };
        }
    },

    /**
     * Make a DELETE request
     * @param {string} endpoint - API endpoint
     * @param {Object} options - Additional fetch options
     * @returns {Promise<Object>} Response data
     */
    async delete(endpoint, options = {}) {
        try {
            let url;
            if (endpoint.startsWith('http')) {
                url = endpoint;
            } else if (endpoint.startsWith('/api/')) {
                url = `${API_BASE}${endpoint}`;
            } else {
                url = `${API_BASE}/api${endpoint}`;
            }
            const token = sessionStorage.getItem('auth_token') || localStorage.getItem('auth_token');

            const response = await fetch(url, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token && { 'Authorization': `Bearer ${token}` }),
                    ...options.headers
                },
                ...options
            });

            const responseData = await response.json().catch(() => ({
                success: false,
                message: 'Invalid response format'
            }));

            if (!response.ok) {
                return {
                    success: false,
                    message: responseData.message || `HTTP ${response.status}`,
                    ...responseData
                };
            }

            return {
                success: true,
                ...responseData
            };
        } catch (error) {
            console.error('API DELETE Error:', error);
            return {
                success: false,
                message: error.message || 'Network error occurred'
            };
        }
    },

    /**
     * Get API base URL
     * @returns {string} API base URL
     */
    getBaseUrl() {
        return API_BASE;
    }
};

// Export as default as well for convenience
export default apiService;

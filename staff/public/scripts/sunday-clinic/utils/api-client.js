/**
 * API Client for Sunday Clinic
 * Centralized API calls with error handling
 */

import { API_ENDPOINTS } from './constants.js';

class APIClient {
    constructor() {
        this.baseURL = '';
        this.token = localStorage.getItem('token');
    }

    /**
     * Make authenticated API request
     */
    async request(endpoint, options = {}) {
        const url = `${this.baseURL}${endpoint}`;
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.token}`,
            ...options.headers
        };

        try {
            const response = await fetch(url, {
                ...options,
                headers
            });

            if (!response.ok) {
                const error = await response.json().catch(() => ({ message: response.statusText }));
                throw new Error(error.message || `HTTP ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error('API Request failed:', error);
            throw error;
        }
    }

    /**
     * GET request
     */
    async get(endpoint) {
        return this.request(endpoint, { method: 'GET' });
    }

    /**
     * POST request
     */
    async post(endpoint, data) {
        return this.request(endpoint, {
            method: 'POST',
            body: JSON.stringify(data)
        });
    }

    /**
     * PUT request
     */
    async put(endpoint, data) {
        return this.request(endpoint, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
    }

    /**
     * DELETE request
     */
    async delete(endpoint) {
        return this.request(endpoint, { method: 'DELETE' });
    }

    // ===== Sunday Clinic Specific Methods =====

    /**
     * Get record by MR ID
     */
    async getRecord(mrId) {
        return this.get(`${API_ENDPOINTS.RECORDS}/${mrId}`);
    }

    /**
     * Get directory (all records)
     */
    async getDirectory(search = '') {
        const query = search ? `?search=${encodeURIComponent(search)}` : '';
        return this.get(`${API_ENDPOINTS.DIRECTORY}${query}`);
    }

    /**
     * Get billing for MR ID
     */
    async getBilling(mrId) {
        return this.get(`${API_ENDPOINTS.BILLING}/${mrId}`);
    }

    /**
     * Save billing
     */
    async saveBilling(mrId, billingData) {
        return this.post(`${API_ENDPOINTS.BILLING}/${mrId}`, billingData);
    }

    /**
     * Update obat items in billing
     */
    async updateBillingObat(mrId, items) {
        return this.post(`${API_ENDPOINTS.BILLING}/${mrId}/obat`, { items });
    }

    /**
     * Confirm billing (doctor action)
     */
    async confirmBilling(mrId) {
        return this.post(`${API_ENDPOINTS.BILLING}/${mrId}/confirm`);
    }

    /**
     * Print invoice (cashier action)
     */
    async printInvoice(mrId) {
        return this.post(`${API_ENDPOINTS.BILLING}/${mrId}/print`);
    }

    /**
     * Get category statistics
     */
    async getCategoryStatistics() {
        return this.get(API_ENDPOINTS.STATISTICS);
    }

    /**
     * Get patient intake data
     */
    async getPatientIntake(patientId) {
        return this.get(`/api/patient-intake/patient/${patientId}/latest`);
    }
}

// Export singleton instance
export default new APIClient();

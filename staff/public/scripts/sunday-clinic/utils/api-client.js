/**
 * API Client for Sunday Clinic
 * Centralized API calls with error handling
 */

import { API_ENDPOINTS } from './constants.js';

class APIClient {
    constructor() {
        this.baseURL = '';
    }

    /**
     * Get current token (always read fresh from storage)
     */
    getToken() {
        return localStorage.getItem('vps_auth_token') || sessionStorage.getItem('vps_auth_token');
    }

    /**
     * Set authentication token
     */
    setToken(token) {
        localStorage.setItem('vps_auth_token', token);
    }

    /**
     * Make authenticated API request
     */
    async request(endpoint, options = {}) {
        const url = `${this.baseURL}${endpoint}`;
        const token = this.getToken();
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
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

    /**
     * Save a specific section of the medical record
     */
    async saveSection(mrId, section, data) {
        return this.post(`${API_ENDPOINTS.RECORDS}/${mrId}/${section}`, data);
    }

    /**
     * Save entire medical record (all sections)
     */
    async saveRecord(mrId, recordData) {
        return this.put(`${API_ENDPOINTS.RECORDS}/${mrId}`, recordData);
    }

    /**
     * Get patients for directory
     */
    async getPatients(searchTerm = '') {
        const query = searchTerm ? `?search=${encodeURIComponent(searchTerm)}` : '';
        return this.get(`/api/sunday-clinic/patients${query}`);
    }

    /**
     * Get patient visits
     */
    async getPatientVisits(patientId) {
        return this.get(`/api/sunday-clinic/patients/${patientId}/visits`);
    }

    /**
     * Create new Sunday Clinic record
     */
    async createRecord(patientId, category) {
        return this.post(API_ENDPOINTS.RECORDS, { patient_id: patientId, category });
    }
}

// Export singleton instance
export default new APIClient();

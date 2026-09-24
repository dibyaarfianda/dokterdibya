/**
 * API Client for Sunday Clinic
 * Centralized API calls with error handling
 */

import { API_ENDPOINTS } from './constants.js';
import { TOKEN_KEY } from '../../vps-auth-v2.js';
import stateManager from './state-manager.js';

const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const pointerPart = value => value.replace(/~/g, '~0').replace(/\//g, '~1');

function sectionChanges(before, incoming, prefix = '') {
    const changes = [];
    for (const [key, after] of Object.entries(incoming)) {
        if (after === undefined) continue;
        const path = `${prefix}/${pointerPart(key)}`;
        const existed = hasOwn(before, key);
        const prior = before[key];
        if (existed && isObject(prior) && isObject(after)) {
            changes.push(...sectionChanges(prior, after, path));
        } else if (!existed || JSON.stringify(prior) !== JSON.stringify(after)) {
            changes.push({ path, before: existed ? prior : null, after,
                ...(!existed ? { beforeExists: false } : {}) });
        }
    }
    return changes;
}

class APIClient {
    constructor() {
        this.baseURL = '';
    }

    /**
     * Get current token (always read fresh from storage)
     */
    getToken() {
        return window.getToken ? window.getToken() : '';
    }

    /**
     * Set authentication token
     */
    setToken(token) {
        localStorage.setItem(TOKEN_KEY, token);
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
                const requestError = new Error(error.message || `HTTP ${response.status}`);
                requestError.status = response.status;
                requestError.code = error.code;
                throw requestError;
            }
            const payload = await response.json();
            if (payload && typeof payload === 'object') payload.etag = response.headers?.get('ETag') || null;
            return payload;
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
    async saveSection(mrId, section, data, options = {}) {
        const current = stateManager.get('medicalRecords')?.byType?.[section] || null;
        const baseData = current?.data || {};
        const saveRevision = stateManager.get('dirtyRevision') || 0;
        const changes = sectionChanges(baseData, data);
        if (current?.id && !changes.length) {
            stateManager.markClean(saveRevision);
            return { success: true, data: current, version: current.version };
        }
        if (current?.id && (!Number.isInteger(Number(current.version)) || Number(current.version) < 1)) {
            const error = new Error('Section version is unavailable. Reload before saving.');
            error.status = 428;
            throw error;
        }
        const response = current?.id
            ? await this.request(`/api/medical-records/${current.id}`, {
                method: 'PATCH',
                headers: { ...(options.headers || {}), 'If-Match': current.etag || `"${current.version}"` },
                body: JSON.stringify({ mrId, patientId: current.patientId, recordType: section, changes })
            })
            : await this.request('/api/medical-records', {
                method: 'POST', headers: options.headers || {},
                body: JSON.stringify({ mrId, type: section, data })
            });

        if (response?.success && response.data) {
            const row = response.data;
            const next = { ...current, id: row.id, mrId: row.mr_id || mrId,
                patientId: row.patient_id || current?.patientId,
                version: response.version, etag: response.etag || `"${response.version}"`,
                data: row.record_data };
            const medicalRecords = stateManager.get('medicalRecords') || { byType: {} };
            stateManager.set('medicalRecords', {
                ...medicalRecords,
                byType: { ...(medicalRecords.byType || {}), [section]: next }
            });
            stateManager.replaceSectionData(section, row.record_data);
            stateManager.markClean(saveRevision);
        }

        return response;
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

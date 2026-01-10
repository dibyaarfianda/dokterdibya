/**
 * API Client for Staff Mobile App
 */

const API_BASE = 'https://dokterdibya.com';

class ApiClient {
    constructor() {
        this.token = localStorage.getItem('staff_token');
    }

    setToken(token) {
        this.token = token;
        if (token) {
            localStorage.setItem('staff_token', token);
        } else {
            localStorage.removeItem('staff_token');
        }
    }

    getToken() {
        return this.token || localStorage.getItem('staff_token');
    }

    async request(endpoint, options = {}) {
        const url = `${API_BASE}${endpoint}`;
        const headers = {
            'Content-Type': 'application/json',
            ...options.headers
        };

        if (this.getToken()) {
            headers['Authorization'] = `Bearer ${this.getToken()}`;
        }

        try {
            const response = await fetch(url, {
                ...options,
                headers
            });

            const data = await response.json();

            if (response.status === 401) {
                // Token expired or invalid
                this.setToken(null);
                window.dispatchEvent(new CustomEvent('auth:logout'));
                throw new Error('Session expired. Please login again.');
            }

            if (!response.ok) {
                throw new Error(data.message || 'Request failed');
            }

            return data;
        } catch (error) {
            if (error.name === 'TypeError' && error.message.includes('fetch')) {
                throw new Error('Network error. Please check your connection.');
            }
            throw error;
        }
    }

    get(endpoint) {
        return this.request(endpoint, { method: 'GET' });
    }

    post(endpoint, body) {
        return this.request(endpoint, {
            method: 'POST',
            body: JSON.stringify(body)
        });
    }

    put(endpoint, body) {
        return this.request(endpoint, {
            method: 'PUT',
            body: JSON.stringify(body)
        });
    }

    delete(endpoint) {
        return this.request(endpoint, { method: 'DELETE' });
    }

    // ===== Auth =====
    async login(email, password) {
        const data = await this.post('/api/staff/login', { email, password });
        if (data.success && data.token) {
            this.setToken(data.token);
        }
        return data;
    }

    async getMe() {
        return this.get('/api/staff/me');
    }

    logout() {
        this.setToken(null);
    }

    // ===== Dashboard =====
    async getDashboardStats() {
        return this.get('/api/dashboard');
    }

    // ===== Queue / Appointments =====
    async getTodayQueue() {
        return this.get('/api/sunday-clinic/queue/today');
    }

    async updateAppointmentStatus(id, status) {
        return this.put(`/api/sunday-appointments/${id}/status`, { status });
    }

    async getAppointments(params = {}) {
        const query = new URLSearchParams(params).toString();
        return this.get(`/api/sunday-appointments/list?${query}`);
    }

    // ===== Patients =====
    async searchPatients(query) {
        return this.get(`/api/patients/search/advanced?query=${encodeURIComponent(query)}`);
    }

    async getPatient(id) {
        return this.get(`/api/patients/${id}`);
    }

    async getPatientVisits(patientId) {
        return this.get(`/api/sunday-clinic/patient-visits/${patientId}`);
    }

    // ===== Billing =====
    async getPendingBillings() {
        return this.get('/api/sunday-clinic/billing/pending');
    }

    async getBilling(mrId) {
        return this.get(`/api/sunday-clinic/billing/${mrId}`);
    }

    async confirmBilling(mrId) {
        return this.post(`/api/sunday-clinic/billing/${mrId}/confirm`, {});
    }

    async markBillingPaid(mrId, paymentMethod = 'cash') {
        return this.post(`/api/sunday-clinic/billing/${mrId}/mark-paid`, { payment_method: paymentMethod });
    }

    // ===== Notifications =====
    async getNotifications() {
        return this.get('/api/notifications');
    }

    async getNotificationCount() {
        return this.get('/api/notifications/count');
    }

    async markNotificationRead(id) {
        return this.post(`/api/notifications/${id}/read`, {});
    }

    async markAllNotificationsRead() {
        return this.post('/api/notifications/read-all', {});
    }

    // ===== Staff Announcements =====
    async getStaffAnnouncements() {
        return this.get('/api/staff-announcements');
    }

    async markAnnouncementRead(id) {
        return this.post(`/api/staff-announcements/${id}/read`, {});
    }
}

// Export singleton instance
export const api = new ApiClient();
export default api;

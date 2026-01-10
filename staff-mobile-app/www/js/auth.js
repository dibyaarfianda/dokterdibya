/**
 * Authentication Module
 */

import { api } from './api.js';

class Auth {
    constructor() {
        this.user = null;
        this.isAuthenticated = false;
    }

    async init() {
        const token = api.getToken();
        if (token) {
            try {
                const response = await api.getMe();
                if (response.success && response.user) {
                    this.user = response.user;
                    this.isAuthenticated = true;
                    return true;
                }
            } catch (error) {
                console.error('Auth init error:', error);
                this.logout();
            }
        }
        return false;
    }

    async login(email, password) {
        const response = await api.login(email, password);
        if (response.success) {
            this.user = response.user;
            this.isAuthenticated = true;
            return { success: true, user: this.user };
        }
        return { success: false, message: response.message || 'Login gagal' };
    }

    logout() {
        api.logout();
        this.user = null;
        this.isAuthenticated = false;
        localStorage.removeItem('staff_user');
    }

    getUser() {
        return this.user;
    }

    getUserName() {
        return this.user?.name || 'Staff';
    }

    getUserRole() {
        return this.user?.role || '';
    }

    hasRole(...roles) {
        return roles.includes(this.user?.role);
    }

    isDokter() {
        return this.user?.role === 'dokter';
    }

    isAdmin() {
        return this.user?.role === 'admin' || this.user?.role === 'dokter';
    }
}

export const auth = new Auth();
export default auth;

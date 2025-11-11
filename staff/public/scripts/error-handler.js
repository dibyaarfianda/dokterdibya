/**
 * Frontend Error Handler
 * Centralized error handling for frontend JavaScript
 */

class ErrorHandler {
    constructor() {
        this.isDevelopment = window.location.hostname === 'localhost' || 
                             window.location.hostname === '127.0.0.1';
    }

    /**
     * Log error (only in development)
     */
    log(message, ...args) {
        if (this.isDevelopment) {
            console.log(`[LOG] ${message}`, ...args);
        }
    }

    /**
     * Log warning
     */
    warn(message, ...args) {
        if (this.isDevelopment) {
            console.warn(`[WARN] ${message}`, ...args);
        }
    }

    /**
     * Log error with stack trace
     */
    error(message, error = null) {
        if (this.isDevelopment) {
            console.error(`[ERROR] ${message}`, error);
        }
        
        // Send to error tracking service in production
        if (!this.isDevelopment && error) {
            this.reportError(message, error);
        }
    }

    /**
     * Handle API errors
     */
    handleApiError(error, context = '') {
        let userMessage = 'Terjadi kesalahan. Silakan coba lagi.';
        
        if (error.response) {
            // Server responded with error status
            const status = error.response.status;
            const data = error.response.data;
            
            switch (status) {
                case 400:
                    userMessage = data.message || 'Data tidak valid.';
                    break;
                case 401:
                    userMessage = 'Sesi Anda telah berakhir. Silakan login kembali.';
                    // Redirect to login
                    setTimeout(() => {
                        window.location.href = '/login.html';
                    }, 2000);
                    break;
                case 403:
                    userMessage = 'Anda tidak memiliki akses untuk operasi ini.';
                    break;
                case 404:
                    userMessage = 'Data tidak ditemukan.';
                    break;
                case 429:
                    userMessage = 'Terlalu banyak permintaan. Silakan tunggu sebentar.';
                    break;
                case 500:
                case 502:
                case 503:
                    userMessage = 'Server sedang mengalami gangguan. Silakan coba lagi nanti.';
                    break;
                default:
                    userMessage = data.message || 'Terjadi kesalahan pada server.';
            }
            
            this.error(`${context} API Error [${status}]:`, data);
        } else if (error.request) {
            // Request made but no response
            userMessage = 'Tidak dapat terhubung ke server. Periksa koneksi internet Anda.';
            this.error(`${context} Network Error:`, error);
        } else {
            // Something else happened
            userMessage = error.message || 'Terjadi kesalahan tidak terduga.';
            this.error(`${context} Error:`, error);
        }
        
        // Show error to user
        this.showToast(userMessage, 'error');
        
        return userMessage;
    }

    /**
     * Show toast notification
     */
    showToast(message, type = 'info') {
        // Use existing toast system if available
        if (typeof window.showToast === 'function') {
            window.showToast(message, type);
        } else {
            // Fallback to alert
            alert(message);
        }
    }

    /**
     * Report error to tracking service (implement in production)
     */
    reportError(message, error) {
        // TODO: Implement error tracking service integration
        // Example: Send to Sentry, Rollbar, or custom logging service
        try {
            const errorData = {
                message,
                error: error.message,
                stack: error.stack,
                url: window.location.href,
                userAgent: navigator.userAgent,
                timestamp: new Date().toISOString()
            };
            
            // Send to your error tracking endpoint
            // fetch('/api/error-log', {
            //     method: 'POST',
            //     headers: { 'Content-Type': 'application/json' },
            //     body: JSON.stringify(errorData)
            // });
            
            this.log('Error reported:', errorData);
        } catch (e) {
            // Silent fail
        }
    }

    /**
     * Wrap async function with error handling
     */
    async wrap(fn, context = '') {
        try {
            return await fn();
        } catch (error) {
            this.handleApiError(error, context);
            throw error;
        }
    }
}

// Create global instance
window.errorHandler = new ErrorHandler();

// Global error handler for unhandled errors
window.addEventListener('error', (event) => {
    window.errorHandler.error('Unhandled error:', event.error);
});

// Global handler for unhandled promise rejections
window.addEventListener('unhandledrejection', (event) => {
    window.errorHandler.error('Unhandled promise rejection:', event.reason);
});

// Export for use in modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ErrorHandler;
}

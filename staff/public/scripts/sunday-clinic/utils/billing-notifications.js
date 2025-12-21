/**
 * Realtime Billing Notifications
 * Broadcasts billing events to connected users
 */

class BillingNotifications {
    constructor() {
        this.listeners = new Set();
        this.socket = null;
        this.initializeSocket();
    }

    /**
     * Initialize Socket.IO connection
     * Uses existing window.socket from realtime-sync.js instead of creating our own
     */
    initializeSocket() {
        console.log('[BillingNotifications] Initializing Socket.IO...');

        // Use existing socket from realtime-sync.js
        // DO NOT create our own socket - wait for realtime-sync to initialize it
        if (window.socket) {
            this.socket = window.socket;
            console.log('[BillingNotifications] ✅ Using existing socket from realtime-sync');
            this.setupEventListeners();
        } else {
            console.log('[BillingNotifications] Socket not ready yet - waiting for realtime-sync');
            // Poll for socket availability
            const checkSocket = setInterval(() => {
                if (window.socket) {
                    clearInterval(checkSocket);
                    this.socket = window.socket;
                    console.log('[BillingNotifications] ✅ Socket now available from realtime-sync');
                    this.setupEventListeners();
                }
            }, 500);
            // Stop checking after 10 seconds
            setTimeout(() => clearInterval(checkSocket), 10000);
        }
    }

    /**
     * Setup event listeners for billing events
     */
    setupEventListeners() {
        if (!this.socket) return;

        // Listen for billing_confirmed events from server
        this.socket.on('billing_confirmed', (data) => {
            console.log('[BillingNotifications] 📨 Socket.IO received billing_confirmed:', data);
            this.broadcast(data);
        });

        // Listen for revision_requested events from server
        this.socket.on('revision_requested', (data) => {
            console.log('[BillingNotifications] 📨 Socket.IO received revision_requested:', data);
            this.broadcast(data);
        });

        console.log('[BillingNotifications] Event listeners registered');
    }

    /**
     * Register a listener for billing events
     */
    addListener(callback) {
        this.listeners.add(callback);
        return () => this.listeners.delete(callback);
    }

    /**
     * Broadcast billing confirmed event
     */
    broadcastBillingConfirmed(mrId, patientName, doctorName) {
        const event = {
            type: 'billing_confirmed',
            mrId,
            patientName,
            doctorName,
            timestamp: new Date().toISOString()
        };

        this.broadcast(event);
    }

    /**
     * Broadcast revision request to dokter (only sends event, doesn't show dialog)
     */
    broadcastRevisionRequest(mrId, patientName, message, requestedBy, revisionId) {
        const event = {
            type: 'revision_requested',
            mrId,
            patientName,
            message,
            requestedBy,
            revisionId,
            timestamp: new Date().toISOString()
        };

        // Just broadcast - dialog will be shown by receiver via Socket.IO event
        this.broadcast(event);
        console.log('[BillingNotifications] Broadcasted revision_requested:', event);
    }

    /**
     * Broadcast to all listeners
     */
    broadcast(event) {
        this.listeners.forEach(listener => {
            try {
                listener(event);
            } catch (error) {
                console.error('Error broadcasting event:', error);
            }
        });
    }

    /**
     * Show notification modal on client
     */
    static showClientNotification(message, type = 'info') {
        // Create modal overlay
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.7);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
            animation: fadeIn 0.3s ease-in;
        `;

        // Create modal box
        const modal = document.createElement('div');
        modal.style.cssText = `
            background: white;
            padding: 40px;
            border-radius: 12px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            max-width: 500px;
            text-align: center;
            animation: slideIn 0.3s ease-out;
        `;

        const iconColor = type === 'success' ? '#10b981' : type === 'warning' ? '#f59e0b' : '#3b82f6';
        const icon = type === 'success' ? '✓' : type === 'warning' ? '⚠' : 'ℹ';

        modal.innerHTML = `
            <div style="
                width: 80px;
                height: 80px;
                border-radius: 50%;
                background: ${iconColor};
                color: white;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 48px;
                margin: 0 auto 20px;
            ">${icon}</div>
            <h2 style="
                font-size: 24px;
                font-weight: 600;
                color: #1e293b;
                margin-bottom: 16px;
            ">Notifikasi</h2>
            <p style="
                font-size: 16px;
                color: #64748b;
                line-height: 1.6;
                margin-bottom: 24px;
            ">${message}</p>
            <button id="notification-close-btn" style="
                background: ${iconColor};
                color: white;
                border: none;
                padding: 12px 32px;
                border-radius: 8px;
                font-size: 16px;
                font-weight: 500;
                cursor: pointer;
                transition: all 0.2s;
            ">OK</button>
        `;

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        // Add animations
        const style = document.createElement('style');
        style.textContent = `
            @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }
            @keyframes slideIn {
                from { transform: translateY(-50px); opacity: 0; }
                to { transform: translateY(0); opacity: 1; }
            }
        `;
        document.head.appendChild(style);

        // Close handler with guard against multiple calls
        const closeBtn = modal.querySelector('#notification-close-btn');
        let isClosed = false;
        const close = () => {
            if (isClosed) return; // Prevent duplicate removal
            isClosed = true;
            overlay.style.animation = 'fadeOut 0.3s ease-out';
            setTimeout(() => {
                if (overlay.parentNode) {
                    overlay.parentNode.removeChild(overlay);
                }
                if (style.parentNode) {
                    style.parentNode.removeChild(style);
                }
            }, 300);
        };

        closeBtn.addEventListener('click', close);
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) close();
        });

        // Auto-close after 3 seconds
        setTimeout(close, 3000);
    }

    /**
     * Simple event emitter functionality
     */
    on(eventType, callback) {
        if (eventType === 'billing_confirmed' || eventType === 'revision_requested') {
            this.addListener((event) => {
                if (event.type === eventType) {
                    callback(event);
                }
            });
        }
    }
}

// Export the class
export default BillingNotifications;

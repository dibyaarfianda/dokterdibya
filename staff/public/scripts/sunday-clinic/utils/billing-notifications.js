/**
 * Realtime Billing Notifications
 * Broadcasts billing events to connected users
 */

class BillingNotifications {
    constructor() {
        this.listeners = new Set();
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
     * Broadcast revision request to dokter
     */
    broadcastRevisionRequest(mrId, patientName, message, requestedBy) {
        const event = {
            type: 'revision_requested',
            mrId,
            patientName,
            message,
            requestedBy,
            timestamp: new Date().toISOString()
        };

        this.broadcast(event);
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

        // Close handler
        const closeBtn = modal.querySelector('#notification-close-btn');
        const close = () => {
            overlay.style.animation = 'fadeOut 0.3s ease-out';
            setTimeout(() => {
                document.body.removeChild(overlay);
                document.head.removeChild(style);
            }, 300);
        };

        closeBtn.addEventListener('click', close);
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) close();
        });

        // Auto-close after 10 seconds
        setTimeout(close, 10000);
    }
}

// Singleton instance
const billingNotifications = new BillingNotifications();

// Client-side integration
if (typeof window !== 'undefined') {
    window.billingNotifications = BillingNotifications;

    // Setup event listener for realtime notifications
    if (window.realtimeSync) {
        window.realtimeSync.on('billing_confirmed', (data) => {
            const userRole = window.currentStaffIdentity?.role || '';
            const isDokter = userRole === 'dokter' || userRole === 'superadmin';

            if (!isDokter) {
                BillingNotifications.showClientNotification(
                    `Dokter telah selesai memeriksa ${data.patientName}. Tagihan terkonfirmasi.`,
                    'success'
                );

                // Reload billing if on billing page
                if (window.location.hash.includes('billing')) {
                    setTimeout(() => {
                        if (window.handleSectionChange) {
                            window.handleSectionChange('billing', { pushHistory: false });
                        }
                    }, 2000);
                }
            }
        });

        window.realtimeSync.on('revision_requested', (data) => {
            const userRole = window.currentStaffIdentity?.role || '';
            const isDokter = userRole === 'dokter' || userRole === 'superadmin';

            if (isDokter) {
                const message = `Usulan revisi untuk ${data.patientName} dari ${data.requestedBy}:\n\n"${data.message}"`;
                
                setTimeout(() => {
                    if (confirm(message + '\n\nSetujui usulan ini?')) {
                        fetch(`/api/sunday-clinic/billing/revisions/${data.revisionId}/approve`, {
                            method: 'POST',
                            headers: {
                                'Authorization': `Bearer ${window.getToken()}`,
                                'Content-Type': 'application/json'
                            }
                        })
                        .then(res => res.json())
                        .then(result => {
                            if (result.success) {
                                alert('Usulan disetujui. Silakan lakukan perubahan dan konfirmasi ulang.');
                                if (window.handleSectionChange) {
                                    window.handleSectionChange('billing', { pushHistory: false });
                                }
                            }
                        });
                    }
                }, 1000);
            }
        });
    }
}

module.exports = billingNotifications;

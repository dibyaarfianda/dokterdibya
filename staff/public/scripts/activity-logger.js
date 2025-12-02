/**
 * Centralized Activity Logger
 * Tracks staff actions for audit and monitoring
 */

import { auth, getIdToken } from './vps-auth-v2.js';

const API_BASE = ['localhost', '127.0.0.1'].includes(window.location.hostname)
    ? 'http://localhost:3001'
    : window.location.origin.replace(/\/$/, '');

// Action types for consistency
export const ACTIONS = {
    // Authentication
    LOGIN: 'Login',
    LOGOUT: 'Logout',

    // Patient operations
    VIEW_PATIENT: 'View Patient',
    ADD_PATIENT: 'Add Patient',
    UPDATE_PATIENT: 'Update Patient',
    DELETE_PATIENT: 'Delete Patient',

    // Medical records
    CREATE_MR: 'Create Medical Record',
    UPDATE_MR: 'Update Medical Record',
    VIEW_MR: 'View Medical Record',
    PRINT_RESUME: 'Print Resume Medis',
    SEND_RESUME: 'Send Resume to Patient',

    // Appointments
    CREATE_APPOINTMENT: 'Create Appointment',
    UPDATE_APPOINTMENT: 'Update Appointment',
    CANCEL_APPOINTMENT: 'Cancel Appointment',

    // Billing/Cashier
    CREATE_INVOICE: 'Create Invoice',
    FINALIZE_VISIT: 'Finalize Visit',
    PROCESS_PAYMENT: 'Process Payment',

    // Inventory
    ADD_STOCK: 'Add Stock',
    UPDATE_STOCK: 'Update Stock',
    DELETE_STOCK: 'Delete Stock',

    // Admin
    UPDATE_ROLE: 'Update User Role',
    UPDATE_VISIBILITY: 'Update Role Visibility',

    // Import/Export
    IMPORT_DATA: 'Import Data',
    EXPORT_DATA: 'Export Data'
};

/**
 * Log an activity to the backend
 * @param {string} action - The action type (use ACTIONS constants)
 * @param {string} details - Additional details about the action
 * @param {object} metadata - Optional metadata (patient_id, mr_id, etc.)
 */
export async function logActivity(action, details, metadata = {}) {
    try {
        const user = auth.currentUser;
        if (!user) {
            console.warn('[ActivityLogger] No user logged in, skipping log');
            return;
        }

        const token = await getIdToken();

        // Build details string with metadata
        let fullDetails = details;
        if (Object.keys(metadata).length > 0) {
            fullDetails += ` | ${JSON.stringify(metadata)}`;
        }

        const response = await fetch(`${API_BASE}/api/logs`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                user_id: user.id,
                user_name: user.name || user.email || 'Unknown',
                action: action,
                details: fullDetails
            })
        });

        if (!response.ok) {
            console.warn('[ActivityLogger] Failed to log activity:', response.status);
        }
    } catch (err) {
        console.error('[ActivityLogger] Error logging activity:', err);
        // Don't throw - logging should never break the app
    }
}

/**
 * Quick log helpers
 */
export const ActivityLog = {
    login: () => logActivity(ACTIONS.LOGIN, 'User logged in'),
    logout: () => logActivity(ACTIONS.LOGOUT, 'User logged out'),

    viewPatient: (patientId, patientName) =>
        logActivity(ACTIONS.VIEW_PATIENT, `Viewed: ${patientName}`, { patient_id: patientId }),

    addPatient: (patientId, patientName) =>
        logActivity(ACTIONS.ADD_PATIENT, `Added: ${patientName}`, { patient_id: patientId }),

    updatePatient: (patientId, patientName) =>
        logActivity(ACTIONS.UPDATE_PATIENT, `Updated: ${patientName}`, { patient_id: patientId }),

    createMR: (mrId, patientName) =>
        logActivity(ACTIONS.CREATE_MR, `Created MR for: ${patientName}`, { mr_id: mrId }),

    updateMR: (mrId, section) =>
        logActivity(ACTIONS.UPDATE_MR, `Updated section: ${section}`, { mr_id: mrId }),

    printResume: (mrId, patientName) =>
        logActivity(ACTIONS.PRINT_RESUME, `Printed for: ${patientName}`, { mr_id: mrId }),

    sendResume: (patientId, method) =>
        logActivity(ACTIONS.SEND_RESUME, `Sent via: ${method}`, { patient_id: patientId }),

    finalizeVisit: (patientName, amount) =>
        logActivity(ACTIONS.FINALIZE_VISIT, `Finalized: ${patientName} - Rp ${amount}`)
};

// Auto-log on page visibility change (detect tab close/switch)
if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden' && auth.currentUser) {
            // User switched tabs or closing - could log session pause
        }
    });
}

// Make available globally for non-module scripts
if (typeof window !== 'undefined') {
    window.ActivityLog = ActivityLog;
    window.logActivity = logActivity;
    window.ACTIVITY_ACTIONS = ACTIONS;
}

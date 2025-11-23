/**
 * State Manager for Sunday Clinic
 * Global state management with pub/sub pattern
 */

import { computeDerived } from './derived-state.js';

class StateManager {
    constructor() {
        this.state = {
            currentMrId: null,
            currentCategory: null,
            recordData: null,
            patientData: null,
            appointmentData: null,
            intakeData: null,
            billingData: null,
            medicalRecords: null,
            derived: null,  // Computed derived state from all data
            isDirty: false,  // Track unsaved changes
            activeSection: 'identity',
            loading: false,
            error: null
        };

        this.listeners = {};
    }

    /**
     * Get current state
     */
    getState() {
        return { ...this.state };
    }

    /**
     * Get specific state value
     */
    get(key) {
        return this.state[key];
    }

    /**
     * Update state
     */
    setState(updates) {
        const oldState = { ...this.state };
        this.state = { ...this.state, ...updates };

        // Notify listeners
        Object.keys(updates).forEach(key => {
            if (this.listeners[key]) {
                this.listeners[key].forEach(callback => {
                    callback(this.state[key], oldState[key]);
                });
            }
        });

        // Notify global listeners
        if (this.listeners['*']) {
            this.listeners['*'].forEach(callback => {
                callback(this.state, oldState);
            });
        }
    }

    /**
     * Subscribe to state changes
     */
    subscribe(key, callback) {
        if (!this.listeners[key]) {
            this.listeners[key] = [];
        }
        this.listeners[key].push(callback);

        // Return unsubscribe function
        return () => {
            this.listeners[key] = this.listeners[key].filter(cb => cb !== callback);
        };
    }

    /**
     * Load record data
     */
    async loadRecord(recordData) {
        this.setState({
            loading: true,
            error: null
        });

        try {
            const mrId = recordData.record.mrId || recordData.record.mr_id;

            // Compute derived state EXACTLY like backup
            const derived = computeDerived({
                record: recordData.record,
                patient: recordData.patient,
                appointment: recordData.appointment,
                intake: recordData.intake,
                medicalRecords: recordData.medicalRecords
            }, mrId);

            this.setState({
                currentMrId: mrId,
                currentCategory: recordData.record.mrCategory || recordData.record.mr_category || 'obstetri',
                recordData: recordData.record,
                patientData: recordData.patient,
                appointmentData: recordData.appointment,
                intakeData: recordData.intake,
                medicalRecords: recordData.medicalRecords,
                derived: derived,  // ADD DERIVED STATE
                loading: false,
                isDirty: false
            });

            console.log('[StateManager] Derived state computed:', derived);

            return true;
        } catch (error) {
            this.setState({
                loading: false,
                error: error.message
            });
            return false;
        }
    }

    /**
     * Mark state as dirty (unsaved changes)
     */
    markDirty() {
        this.setState({ isDirty: true });
    }

    /**
     * Mark state as clean (all saved)
     */
    markClean() {
        this.setState({ isDirty: false });
    }

    /**
     * Set active section
     */
    setActiveSection(section) {
        this.setState({ activeSection: section });
    }

    /**
     * Clear all state
     */
    clear() {
        this.state = {
            currentMrId: null,
            currentCategory: null,
            recordData: null,
            patientData: null,
            appointmentData: null,
            intakeData: null,
            billingData: null,
            medicalRecords: null,
            isDirty: false,
            activeSection: 'identity',
            loading: false,
            error: null
        };
    }

    /**
     * Check if there are unsaved changes
     */
    hasUnsavedChanges() {
        return this.state.isDirty;
    }
}

// Export singleton instance
export default new StateManager();

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
            // Validate data structure
            if (!recordData) {
                throw new Error('Record data is null or undefined');
            }

            if (!recordData.record) {
                console.error('[StateManager] Invalid record data structure:', recordData);
                throw new Error('Invalid record data structure: missing "record" property');
            }

            const mrId = recordData.record.mrId || recordData.record.mr_id;

            if (!mrId) {
                throw new Error('MR ID not found in record data');
            }

            // Extract data from medical records for all section types
            let anamnesaData = {};
            let pemeriksaanObstetriData = {};
            let pemeriksaanGinekologiData = {};
            let usgData = {};
            let diagnosisData = {};
            let planningData = {};
            let physicalExamData = {};

            if (recordData.medicalRecords && recordData.medicalRecords.byType) {
                const byType = recordData.medicalRecords.byType;

                if (byType.anamnesa?.data) {
                    anamnesaData = byType.anamnesa.data;
                }
                if (byType.pemeriksaan_obstetri?.data) {
                    pemeriksaanObstetriData = byType.pemeriksaan_obstetri.data;
                }
                if (byType.pemeriksaan_ginekologi?.data) {
                    pemeriksaanGinekologiData = byType.pemeriksaan_ginekologi.data;
                }
                if (byType.usg?.data) {
                    usgData = byType.usg.data;
                }
                if (byType.diagnosis?.data) {
                    diagnosisData = byType.diagnosis.data;
                }
                if (byType.planning?.data) {
                    planningData = byType.planning.data;
                }
                if (byType.physical_exam?.data) {
                    physicalExamData = byType.physical_exam.data;
                }
            }

            // Merge data into record - each visit starts fresh if no data for this mr_id
            const enrichedRecord = {
                ...recordData.record,
                anamnesa: anamnesaData,
                pemeriksaan_obstetri: pemeriksaanObstetriData,
                pemeriksaan_ginekologi: pemeriksaanGinekologiData,
                usg: usgData,
                diagnosis: diagnosisData,
                planning: planningData,
                physical_exam: physicalExamData
            };

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
                recordData: enrichedRecord,
                patientData: recordData.patient,
                appointmentData: recordData.appointment,
                intakeData: recordData.intake,
                medicalRecords: recordData.medicalRecords,
                derived: derived,  // ADD DERIVED STATE
                loading: false,
                isDirty: false
            });

            console.log('[StateManager] Record loaded successfully. MR ID:', mrId);
            console.log('[StateManager] Derived state computed:', derived);

            return true;
        } catch (error) {
            console.error('[StateManager] Failed to load record:', error);
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

    /**
     * Update section data within recordData
     * Used by components to update local state after saving
     */
    updateSectionData(sectionName, data) {
        if (!this.state.recordData) {
            console.warn('[StateManager] Cannot update section data: recordData is null');
            return;
        }

        const updatedRecordData = {
            ...this.state.recordData,
            [sectionName]: {
                ...(this.state.recordData[sectionName] || {}),
                ...data
            }
        };

        this.setState({
            recordData: updatedRecordData
        });

        console.log(`[StateManager] Section data updated: ${sectionName}`, data);
    }
}

// Export singleton instance
export default new StateManager();

'use strict';

const db = require('../db');

const REQUIRED_SCHEMA = Object.freeze({
    booking_settings: ['id', 'day_of_week'],
    clinic_queue_settings: ['id', 'doctor_arrived'],
    sunday_appointments: ['id', 'status', 'confirmation_token', 'confirmed_at', 'confirmation_popup_enabled_at'],
    sunday_clinic_billings: ['id', 'paid_at', 'paid_by', 'pending_changes', 'change_requests', 'last_modified_by', 'last_modified_at'],
    sunday_clinic_billing_items: ['id', 'billing_id'],
    sunday_clinic_billing_audit_logs: ['id', 'billing_id'],
    sunday_clinic_additional_billings: ['id', 'parent_billing_id'],
    sunday_clinic_additional_billing_items: ['id', 'additional_billing_id'],
    sunday_clinic_additional_billing_audit_logs: ['id', 'additional_billing_id'],
    sunday_clinic_prescription_templates: ['id', 'items'],
    sunday_clinic_medify_sync_jobs: ['id', 'job_id', 'payload_json']
});

let validationPromise = null;

function collectMissingSchema(rows) {
    const available = new Map();
    for (const row of rows || []) {
        const tableName = row.TABLE_NAME || row.table_name;
        const columnName = row.COLUMN_NAME || row.column_name;
        if (!available.has(tableName)) available.set(tableName, new Set());
        available.get(tableName).add(columnName);
    }

    const missing = [];
    for (const [tableName, columns] of Object.entries(REQUIRED_SCHEMA)) {
        const presentColumns = available.get(tableName);
        if (!presentColumns) {
            missing.push(`${tableName}.*`);
            continue;
        }
        for (const columnName of columns) {
            if (!presentColumns.has(columnName)) missing.push(`${tableName}.${columnName}`);
        }
    }
    return missing;
}

async function validateSundayClinicSchema() {
    if (validationPromise) return validationPromise;

    const tableNames = Object.keys(REQUIRED_SCHEMA);
    validationPromise = (async () => {
        const placeholders = tableNames.map(() => '?').join(', ');
        const [rows] = await db.query(
            `SELECT TABLE_NAME, COLUMN_NAME
             FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME IN (${placeholders})`,
            tableNames
        );
        const missing = collectMissingSchema(rows);
        if (missing.length > 0) {
            const error = new Error(
                `Sunday Clinic schema is incomplete. Run staff/backend/migrations/20260719_staff_wave4_sunday_clinic_schema.sql. Missing: ${missing.join(', ')}`
            );
            error.code = 'SUNDAY_CLINIC_SCHEMA_MISSING';
            error.missing = missing;
            throw error;
        }
        return true;
    })();

    return validationPromise;
}

function sundayClinicSchemaGuard(req, res, next) {
    validateSundayClinicSchema()
        .then(() => next())
        .catch((error) => {
            res.status(503).json({
                success: false,
                code: error.code || 'SUNDAY_CLINIC_SCHEMA_VALIDATION_FAILED',
                message: error.message
            });
        });
}

function resetSundayClinicSchemaValidationForTests() {
    validationPromise = null;
}

module.exports = {
    REQUIRED_SCHEMA,
    collectMissingSchema,
    validateSundayClinicSchema,
    sundayClinicSchemaGuard,
    resetSundayClinicSchemaValidationForTests
};

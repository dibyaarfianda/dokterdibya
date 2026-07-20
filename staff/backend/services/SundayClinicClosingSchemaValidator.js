'use strict';

const db = require('../db');
const { AppError } = require('../middleware/errorHandler');

const CLOSING_MIGRATION_NAME = '20260720_create_sunday_clinic_closings.sql';

const CLOSING_REQUIRED_SCHEMA = Object.freeze({
    sunday_clinic_closings: [
        'id',
        'clinic_date',
        'main_total',
        'additional_total',
        'grand_total',
        'patient_count',
        'transaction_count',
        'summary_json',
        'breakdown_json',
        'source_fingerprint',
        'closed_by_user_id',
        'closed_by_name',
        'closed_by_role',
        'closed_at'
    ],
    sunday_clinic_closing_entries: [
        'id',
        'closing_id',
        'source_type',
        'source_id',
        'mr_id',
        'patient_id',
        'patient_name',
        'reference_number',
        'total',
        'item_snapshot',
        'source_snapshot'
    ],
    sunday_clinic_billing_revisions: [
        'id',
        'mr_id',
        'status',
        'message',
        'requested_by',
        'created_at'
    ]
});

let validationPromise = null;

function collectMissingClosingSchema(rows) {
    const available = new Map();
    for (const row of rows || []) {
        const tableName = row.TABLE_NAME || row.table_name;
        const columnName = row.COLUMN_NAME || row.column_name;
        if (!available.has(tableName)) available.set(tableName, new Set());
        available.get(tableName).add(columnName);
    }

    const missing = [];
    for (const [tableName, requiredColumns] of Object.entries(CLOSING_REQUIRED_SCHEMA)) {
        const presentColumns = available.get(tableName);
        if (!presentColumns) {
            missing.push(`${tableName}.*`);
            continue;
        }
        for (const columnName of requiredColumns) {
            if (!presentColumns.has(columnName)) missing.push(`${tableName}.${columnName}`);
        }
    }
    return missing;
}

async function validateSundayClinicClosingSchema() {
    if (validationPromise) return validationPromise;

    validationPromise = (async () => {
        const tableNames = Object.keys(CLOSING_REQUIRED_SCHEMA);
        const placeholders = tableNames.map(() => '?').join(', ');
        const [rows] = await db.query(
            `SELECT TABLE_NAME, COLUMN_NAME
             FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME IN (${placeholders})`,
            tableNames
        );
        const missing = collectMissingClosingSchema(rows);
        if (missing.length > 0) {
            const error = new AppError(
                `Sunday Clinic closing schema is incomplete. Run staff/backend/migrations/${CLOSING_MIGRATION_NAME} and add_billing_revisions.sql. Missing: ${missing.join(', ')}`,
                503,
                true,
                'SUNDAY_CLINIC_CLOSING_SCHEMA_MISSING'
            );
            error.missing = missing;
            throw error;
        }
        return true;
    })();

    return validationPromise;
}

function sundayClinicClosingSchemaGuard(req, res, next) {
    validateSundayClinicClosingSchema()
        .then(() => next())
        .catch(next);
}

function resetSundayClinicClosingSchemaValidationForTests() {
    validationPromise = null;
}

module.exports = {
    CLOSING_MIGRATION_NAME,
    CLOSING_REQUIRED_SCHEMA,
    collectMissingClosingSchema,
    validateSundayClinicClosingSchema,
    sundayClinicClosingSchemaGuard,
    resetSundayClinicClosingSchemaValidationForTests
};

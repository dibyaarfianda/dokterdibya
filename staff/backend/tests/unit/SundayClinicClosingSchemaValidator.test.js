'use strict';

jest.mock('../../db', () => ({ query: jest.fn() }));

const db = require('../../db');
const {
    CLOSING_MIGRATION_NAME,
    CLOSING_REQUIRED_SCHEMA,
    collectMissingClosingSchema,
    validateSundayClinicClosingSchema,
    resetSundayClinicClosingSchemaValidationForTests
} = require('../../services/SundayClinicClosingSchemaValidator');

function rowsFor(requirements) {
    return Object.entries(requirements).flatMap(([tableName, columns]) =>
        columns.map((columnName) => ({ TABLE_NAME: tableName, COLUMN_NAME: columnName }))
    );
}

describe('SundayClinicClosingSchemaValidator', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        resetSundayClinicClosingSchemaValidationForTests();
    });

    test('reports exact missing tables and columns', () => {
        expect(collectMissingClosingSchema([
            { TABLE_NAME: 'sunday_clinic_closings', COLUMN_NAME: 'id' }
        ])).toEqual(expect.arrayContaining([
            'sunday_clinic_closings.clinic_date',
            'sunday_clinic_closing_entries.*'
        ]));
    });

    test('validates once and caches success', async () => {
        db.query.mockResolvedValue([rowsFor(CLOSING_REQUIRED_SCHEMA)]);
        await expect(validateSundayClinicClosingSchema()).resolves.toBe(true);
        await expect(validateSundayClinicClosingSchema()).resolves.toBe(true);
        expect(db.query).toHaveBeenCalledTimes(1);
    });

    test('missing migration fails only the closing scope with explicit migration name', async () => {
        db.query.mockResolvedValue([[]]);
        await expect(validateSundayClinicClosingSchema()).rejects.toMatchObject({
            code: 'SUNDAY_CLINIC_CLOSING_SCHEMA_MISSING',
            statusCode: 503
        });
        await expect(validateSundayClinicClosingSchema()).rejects.toThrow(CLOSING_MIGRATION_NAME);
    });
});

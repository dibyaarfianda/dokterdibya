'use strict';

jest.mock('../../db', () => ({
    query: jest.fn()
}));

const db = require('../../db');
const {
    MIGRATION_NAME,
    OPERATIONAL_SCHEMA_SCOPES,
    collectMissing,
    validateOperationalSchemaScope,
    validateAllOperationalSchemas,
    resetOperationalSchemaValidationForTests
} = require('../../services/OperationalSchemaValidator');

function rowsFor(requirements) {
    return Object.entries(requirements).flatMap(([tableName, columns]) =>
        columns.map((columnName) => ({ TABLE_NAME: tableName, COLUMN_NAME: columnName }))
    );
}

describe('OperationalSchemaValidator', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        resetOperationalSchemaValidationForTests();
    });

    test('collectMissing reports exact table and column paths', () => {
        const missing = collectMissing(
            { example_table: ['id', 'required_value'] },
            [{ TABLE_NAME: 'example_table', COLUMN_NAME: 'id' }]
        );

        expect(missing).toEqual(['example_table.required_value']);
    });

    test('scope validation is cached after the first schema query', async () => {
        const requirements = OPERATIONAL_SCHEMA_SCOPES.contractionTimer;
        db.query.mockResolvedValue([rowsFor(requirements)]);

        await expect(validateOperationalSchemaScope('contractionTimer')).resolves.toBe(true);
        await expect(validateOperationalSchemaScope('contractionTimer')).resolves.toBe(true);

        expect(db.query).toHaveBeenCalledTimes(1);
    });

    test('missing schema fails explicitly with the migration name', async () => {
        db.query.mockResolvedValue([[]]);

        await expect(validateOperationalSchemaScope('docboard')).rejects.toMatchObject({
            code: 'OPERATIONAL_SCHEMA_MISSING',
            statusCode: 503,
            scope: 'docboard'
        });
        await expect(validateOperationalSchemaScope('docboard')).rejects.toThrow(MIGRATION_NAME);
    });

    test('global validation checks all scopes in one query', async () => {
        const requirements = Object.values(OPERATIONAL_SCHEMA_SCOPES).reduce((merged, scope) => {
            for (const [tableName, columns] of Object.entries(scope)) {
                merged[tableName] = Array.from(new Set([...(merged[tableName] || []), ...columns]));
            }
            return merged;
        }, {});
        db.query.mockResolvedValue([rowsFor(requirements)]);

        await expect(validateAllOperationalSchemas()).resolves.toBe(true);
        await expect(validateOperationalSchemaScope('supportChat')).resolves.toBe(true);
        expect(db.query).toHaveBeenCalledTimes(1);
    });
});

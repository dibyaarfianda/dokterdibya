'use strict';

jest.mock('../../db', () => ({ query: jest.fn() }));

const schemaRows = [
    ['usg_bulk_upload_bot_config', ['id', 'enabled', 'sources_json', 'updated_by', 'updated_at']],
    ['usg_bulk_upload_jobs', ['id', 'status', 'hospital', 'upload_date', 'zip_url', 'zip_filename', 'dry_run', 'force_rerun', 'preview_json', 'result_json', 'error_message', 'requested_by', 'created_at', 'updated_at']]
].flatMap(([table, columns]) => columns.map(column => ({ TABLE_NAME: table, COLUMN_NAME: column })));

describe('USG bulk upload bot migration boundary', () => {
    beforeEach(() => {
        jest.resetModules();
    });

    test('validates migrated columns without creating tables at request time', async () => {
        const db = require('../../db');
        const { ensureBotTables } = require('../../services/UsgBulkUploadService');
        db.query.mockImplementation(async sql => [sql.includes('INFORMATION_SCHEMA.COLUMNS') ? schemaRows : [{ id: 1 }]]);

        await expect(ensureBotTables()).resolves.toBeUndefined();
        expect(db.query.mock.calls[0][0]).toMatch(/INFORMATION_SCHEMA\.COLUMNS/);
        expect(db.query.mock.calls.every(([sql]) => !/CREATE\s+TABLE|ALTER\s+TABLE/i.test(sql))).toBe(true);
    });

    test('fails closed with the required migration when a column is missing', async () => {
        const db = require('../../db');
        const { ensureBotTables } = require('../../services/UsgBulkUploadService');
        db.query.mockImplementation(async sql => [sql.includes('INFORMATION_SCHEMA.COLUMNS')
            ? schemaRows.filter(row => row.COLUMN_NAME !== 'zip_url')
            : [{ id: 1 }]]);

        await expect(ensureBotTables()).rejects.toMatchObject({
            code: 'USG_BULK_UPLOAD_SCHEMA_MISSING',
            statusCode: 503
        });
        expect(db.query.mock.calls.some(([sql]) => /CREATE\s+TABLE/i.test(sql))).toBe(false);
    });
});

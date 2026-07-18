'use strict';

const fs = require('fs');
const path = require('path');

jest.mock('../../db', () => ({ query: jest.fn() }));

const db = require('../../db');
const { groupsForPath } = require('../../routes/sunday-clinic/route-groups');
const { createRouteSlice } = require('../../routes/sunday-clinic/route-slice');
const {
    collectMissingSchema,
    validateSundayClinicSchema,
    resetSundayClinicSchemaValidationForTests
} = require('../../services/SundayClinicSchemaValidator');

const backendRoot = path.resolve(__dirname, '../..');

describe('Wave 4 Sunday Clinic backend boundaries', () => {
    beforeEach(() => {
        db.query.mockReset();
        resetSundayClinicSchemaValidationForTests();
    });

    test('every controller route belongs to exactly one modular router', () => {
        const source = fs.readFileSync(path.join(backendRoot, 'routes/sunday-clinic-controller.js'), 'utf8');
        const routes = [...source.matchAll(/router\.(?:get|post|put|patch|delete)\(\s*['"]([^'"]+)['"]/g)]
            .map((match) => match[1]);

        expect(routes.length).toBeGreaterThan(40);
        for (const routePath of routes) {
            expect({ routePath, groups: groupsForPath(routePath) }).toEqual({
                routePath,
                groups: [expect.any(String)]
            });
        }
    });

    test('route slicing preserves layer identity and declaration order', () => {
        const first = { route: { path: '/queue/today' } };
        const ignored = { route: { path: '/billing/pending' } };
        const second = { route: { path: '/queue/public' } };
        const slice = createRouteSlice({ stack: [first, ignored, second] }, (routePath) => routePath.startsWith('/queue/'));

        expect(slice.stack).toEqual([first, second]);
    });

    test('active route and queue service contain no runtime schema mutation', () => {
        const files = [
            'routes/sunday-clinic-controller.js',
            'routes/sunday-appointments.js',
            'routes/booking-settings.js',
            'services/sundayClinicMedifySyncQueue.js',
            'services/appointmentScheduler.js'
        ];
        for (const relativePath of files) {
            const source = fs.readFileSync(path.join(backendRoot, relativePath), 'utf8');
            expect(source).not.toMatch(/CREATE\s+TABLE|ALTER\s+TABLE/i);
        }
    });

    test('schema validation reports the additive migration explicitly', async () => {
        db.query.mockResolvedValue([[
            { TABLE_NAME: 'clinic_queue_settings', COLUMN_NAME: 'id' }
        ]]);

        await expect(validateSundayClinicSchema()).rejects.toMatchObject({
            code: 'SUNDAY_CLINIC_SCHEMA_MISSING'
        });
        await expect(validateSundayClinicSchema()).rejects.toThrow('20260719_staff_wave4_sunday_clinic_schema.sql');
    });

    test('schema collector accepts all declared table and column requirements', () => {
        const { REQUIRED_SCHEMA } = require('../../services/SundayClinicSchemaValidator');
        const rows = Object.entries(REQUIRED_SCHEMA).flatMap(([tableName, columns]) => (
            columns.map((columnName) => ({ TABLE_NAME: tableName, COLUMN_NAME: columnName }))
        ));
        expect(collectMissingSchema(rows)).toEqual([]);
    });
});

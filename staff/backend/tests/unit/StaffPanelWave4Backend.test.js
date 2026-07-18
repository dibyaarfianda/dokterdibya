'use strict';

const fs = require('fs');
const path = require('path');

jest.mock('../../db', () => ({ query: jest.fn() }));

const db = require('../../db');
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

    test('Sunday Clinic routes are physically owned by domain routers and services', () => {
        const domains = ['queue', 'records', 'billing', 'prescription', 'resume-export', 'visit-walk-in'];
        let routeCount = 0;

        for (const domain of domains) {
            const routeSource = fs.readFileSync(path.join(backendRoot, `routes/sunday-clinic/${domain}.js`), 'utf8');
            const serviceSource = fs.readFileSync(path.join(backendRoot, `services/sunday-clinic/${domain}.js`), 'utf8');
            routeCount += [...routeSource.matchAll(/router\.(?:get|post|put|patch|delete)\(/g)].length;

            expect(routeSource).toContain(`services/sunday-clinic/${domain}`);
            expect(serviceSource).toContain('module.exports = {');
        }

        expect(routeCount).toBeGreaterThan(40);
    });

    test('active route and queue service contain no runtime schema mutation', () => {
        const files = [
            'services/sunday-clinic/shared.js',
            'services/sunday-clinic/queue.js',
            'services/sunday-clinic/records.js',
            'services/sunday-clinic/billing.js',
            'services/sunday-clinic/prescription.js',
            'services/sunday-clinic/resume-export.js',
            'services/sunday-clinic/visit-walk-in.js',
            'routes/sunday-appointments.js',
            'routes/booking-settings.js',
            'services/sundayClinicMedifySyncQueue.js',
            'services/appointmentScheduler.js'
        ];
        for (const relativePath of files) {
            const source = fs.readFileSync(path.join(backendRoot, relativePath), 'utf8');
            expect(source).not.toMatch(/CREATE\s+TABLE|ALTER\s+TABLE/i);
        }
        expect(fs.readFileSync(path.join(backendRoot, 'routes/sunday-appointments.js'), 'utf8'))
            .not.toContain('validateSundayClinicSchema()');
        expect(fs.readFileSync(path.join(backendRoot, 'routes/booking-settings.js'), 'utf8'))
            .not.toContain('validateSundayClinicSchema()');
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

    test('orphaned new-patient compatibility loader exits before issuing a request', () => {
        const source = fs.readFileSync(path.resolve(backendRoot, '../public/index-adminlte.html'), 'utf8');
        const loaderStart = source.indexOf('async function loadNewPatients(page = 1)');
        const guard = source.indexOf("if (!tbody) return;", loaderStart);
        const request = source.indexOf("fetch(`/api/patients?view=basic", loaderStart);

        expect(source).not.toContain("console.warn('new-patients-tbody element not found')");
        expect(source).not.toContain('loadNewPatients(1);');
        expect(guard).toBeGreaterThan(loaderStart);
        expect(request).toBeGreaterThan(guard);
    });
});

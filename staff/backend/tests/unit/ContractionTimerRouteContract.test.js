const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '../../../..');
const readRepoFile = (...segments) => fs.readFileSync(path.join(repoRoot, ...segments), 'utf8');

describe('Contraction timer route contract', () => {
    test('server registers contraction timer as a patient API route', () => {
        const server = readRepoFile('staff', 'backend', 'server.js');

        expect(server).toContain("require('./routes/contraction-timer')");
        expect(server).toContain("'/api/contraction-timer'");
        expect(server).toContain("app.use('/api/contraction-timer', contractionTimerRoutes)");
        expect(server).toContain("fullPath.startsWith('/api/contraction-timer')");
    });

    test('route validates migrated session/event schema and uses no-cache patient auth', () => {
        const route = readRepoFile('staff', 'backend', 'routes', 'contraction-timer.js');
        const migration = readRepoFile(
            'staff',
            'backend',
            'migrations',
            '20260719_staff_wave6_operational_schema.sql'
        );

        expect(route).toContain("require('../services/ContractionAssessmentService')");
        expect(route).toContain("validateOperationalSchemaScope('contractionTimer')");
        expect(route).not.toMatch(/CREATE\s+TABLE|ALTER\s+TABLE/i);
        expect(migration).toContain('CREATE TABLE IF NOT EXISTS contraction_sessions');
        expect(migration).toContain('CREATE TABLE IF NOT EXISTS contraction_events');
        expect(migration).toContain('assessment_final');
        expect(migration).toContain('rest_hydration_result');
        expect(route).toContain('router.use(setNoCacheHeaders)');
        expect(route).toContain('router.use(verifyPatientToken)');
    });
});

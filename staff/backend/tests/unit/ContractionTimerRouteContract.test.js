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

    test('route creates session and event tables and uses no-cache patient auth', () => {
        const route = readRepoFile('staff', 'backend', 'routes', 'contraction-timer.js');

        expect(route).toContain("require('../services/ContractionAssessmentService')");
        expect(route).toContain('CREATE TABLE IF NOT EXISTS contraction_sessions');
        expect(route).toContain('CREATE TABLE IF NOT EXISTS contraction_events');
        expect(route).toContain('assessment_final');
        expect(route).toContain('rest_hydration_result');
        expect(route).toContain('router.use(setNoCacheHeaders)');
        expect(route).toContain('router.use(verifyPatientToken)');
    });
});

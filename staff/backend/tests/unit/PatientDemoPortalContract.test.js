const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '../../../..');
const file = (...segments) => path.join(repoRoot, ...segments);
const read = (...segments) => fs.readFileSync(file(...segments), 'utf8');

describe('patient demo portal isolation contract', () => {
    test('ships isolated backend components and schema', () => {
        const requiredFiles = [
            ['staff', 'backend', 'routes', 'patient-demo.js'],
            ['staff', 'backend', 'services', 'PatientDemoService.js'],
            ['staff', 'backend', 'middleware', 'patientDemoGuard.js'],
            ['staff', 'backend', 'data', 'patient-demo-baseline.json'],
            ['staff', 'backend', 'migrations', '20260814_create_patient_demo_tables.sql']
        ];

        for (const segments of requiredFiles) {
            expect(fs.existsSync(file(...segments))).toBe(true);
        }

        const migration = read('staff', 'backend', 'migrations', '20260814_create_patient_demo_tables.sql');
        expect(migration).toContain('patient_demo_sessions');
        expect(migration).toContain('patient_demo_state');
        expect(migration).toContain('patient_demo_audit');
        expect(migration).not.toMatch(/INSERT\s+INTO\s+(patients|users|sunday_clinic_records|sunday_appointments|billings)/i);
    });

    test('mounts demo routes and guard before production patient routes', () => {
        const server = read('staff', 'backend', 'server.js');
        const guardIndex = server.indexOf("app.use('/api', patientDemoGuard)");
        const productionIndex = server.indexOf("app.use('/api/patients', patientsAuthRoutes)");

        expect(server).toContain("app.use('/api/patient-demo', patientDemoRoutes)");
        expect(guardIndex).toBeGreaterThan(-1);
        expect(productionIndex).toBeGreaterThan(guardIndex);
    });

    test('demo entry uses one-time code and session storage without JWT in the URL', () => {
        const login = read('public', 'patient-demo-login.html');
        const session = read('public', 'scripts', 'patient-session.js');

        expect(login).toContain('/api/patient-demo/exchange');
        expect(login).toContain('PatientSession.setToken');
        expect(session).toContain('global.sessionStorage');
        expect(login).toContain('history.replaceState');
        expect(login).not.toMatch(/[?&](token|jwt)=/i);
    });

    test('patient shell renders a permanent dummy banner', () => {
        const session = read('public', 'scripts', 'patient-session.js');

        expect(session).toContain('MODE DUMMY');
        expect(session).toContain('tidak menggunakan data pasien nyata');
        expect(session).toContain('patient_demo_mode');
    });

    test('staff panel exposes doctor-only controls and both cache families are bumped', () => {
        const staff = read('staff', 'public', 'index-adminlte.html');
        const staffSw = read('staff', 'public', 'sw.js');
        const patientMenu = read('public', 'patient-menu.html');
        const patientSw = read('public', 'sw.js');
        const manager = read('staff', 'public', 'scripts', 'patient-demo-manager.js');

        expect(staff).toContain('Portal Pasien Dummy');
        expect(staff).toContain('Buka Portal Dummy');
        expect(staff).toContain('Reset Data Dummy');
        expect(manager).toContain('ROLE_IDS.DOKTER');
        expect(staff).toContain('v389');
        expect(staffSw).toContain('v389');
        expect(patientMenu).toContain('20260814demo1');
        expect(patientSw).toContain('20260814demo1');
    });

    test('guard explicitly blocks external and unknown demo mutations', () => {
        const guard = read('staff', 'backend', 'middleware', 'patientDemoGuard.js');

        for (const marker of ['payment', 'fcm', 'upload', 'community-chat', 'support-chat', 'UNKNOWN_DEMO_MUTATION']) {
            expect(guard).toContain(marker);
        }
    });
});

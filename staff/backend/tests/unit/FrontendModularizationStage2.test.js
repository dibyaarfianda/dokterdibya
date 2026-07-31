const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '../../../..');
const read = (...parts) => fs.readFileSync(path.join(repoRoot, ...parts), 'utf8').replace(/\r\n/g, '\n');

describe('frontend modularization stage 2', () => {
    test('patient menu composes session, routing, navigation, layout, and lazy feature modules', () => {
        const html = read('public', 'patient-menu.html');
        const shell = read('public', 'scripts', 'patient-menu-shell.js');
        const featureLoader = read('public', 'scripts', 'patient-shell', 'feature-loader.js');

        expect(shell).toContain("from './patient-shell/session-bootstrap.js'");
        expect(shell).toContain("from './patient-shell/router.js'");
        expect(shell).toContain("from './patient-shell/navigation.js'");
        expect(shell).toContain("from './patient-shell/layout.js'");
        expect(shell).toContain("from './patient-shell/feature-loader.js'");
        expect(shell).not.toContain("function getToken()");
        expect(shell).toContain('bindPatientNavigation(shellActionHandlers)');
        expect(featureLoader).toContain("import('../profile-photo-cropper.js')");
        expect(html).not.toContain('<script src="/scripts/profile-photo-cropper.js');
        expect(html).not.toMatch(/\son(?:click|change|input|submit|keydown)=/i);
    });

    test('patient session bootstrap owns canonical user and token access', () => {
        const session = read('public', 'scripts', 'patient-shell', 'session-bootstrap.js');
        const shell = read('public', 'scripts', 'patient-menu-shell.js');

        expect(session).toContain('return requirePatientSession().getToken()');
        expect(session).toContain('return requirePatientSession().getUser()');
        expect(session).toContain('return requirePatientSession().setUser(');
        expect(shell).toContain('getPatientUser()');
        expect(shell).not.toContain("JSON.parse(localStorage.getItem('patient_user')");
    });

    test('patient photo cropper is no longer part of initial page loading', () => {
        const html = read('public', 'patient-menu.html');

        expect(html).not.toContain('<script src="/scripts/profile-photo-cropper.js');
    });

    test('landing page starts through a dedicated module bootstrap', () => {
        const html = read('public', 'sisiwanita', 'index.html');
        const bootstrap = read('public', 'scripts', 'landing', 'bootstrap.js');
        const featureLoader = read('public', 'scripts', 'landing', 'feature-loader.js');

        expect(html).toMatch(/<script type="module" src="\/scripts\/landing\/bootstrap\.js\?v=[^"' ]+"><\/script>/);
        expect(bootstrap).toContain("import('./feature-loader.js')");
        expect(featureLoader).toContain('export async function loadLandingFeature');
    });

    test('landing page preserves native responsive scrolling', () => {
        const html = read('public', 'sisiwanita', 'index.html');

        expect(html).not.toMatch(/addEventListener\('wheel',\s*function\(e\)\s*\{\s*e\.preventDefault\(\)/);
        expect(html).not.toContain('targetY += e.deltaY * wheelForce');
        expect(html).toContain('Preserve native wheel, trackpad, touch, keyboard, and assistive scrolling.');
    });

    test('staff shell supports delegated compatibility actions while globals migrate', () => {
        const html = read('staff', 'public', 'index-adminlte.html');
        const actions = read('staff', 'public', 'scripts', 'shell', 'actions.js');

        expect(html).toContain('data-staff-call="showHospitalAppointmentsPage"');
        expect(html).not.toContain("onclick=\"showHospitalAppointmentsPage('rsia_melinda');");
        expect(actions).toContain("event.target.closest('[data-staff-call]')");
        expect(actions).toContain('JSON.parse(target.dataset.staffArgs ||');
    });
});

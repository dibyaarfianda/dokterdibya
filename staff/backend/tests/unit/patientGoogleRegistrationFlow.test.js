const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '../../../..');
const readRepoFile = (...segments) => fs.readFileSync(path.join(repoRoot, ...segments), 'utf8').replace(/\r\n/g, '\n');

describe('patient Google registration flow contract', () => {
    test('Google auth responses include profile completion fields', () => {
        const route = readRepoFile('staff', 'backend', 'routes', 'patients-auth.js');

        expect(route).toContain('function formatDateOnlyLocal(value)');
        expect(route).toContain('birth_date: formatDateOnlyLocal(patient.birth_date)');
        expect(route).toContain('profile_completed: patient.profile_completed || 0');
        expect(route).toContain('google_id: patient.google_id || googleId');
    });

    test('patient web login keeps registration-first Google entry and shell versions coherent', () => {
        const loginPage = readRepoFile('public', 'patient-login.html');
        const mobileCallback = readRepoFile('public', 'mobile-google-callback.html');
        const rootSw = readRepoFile('public', 'sw.js');
        const sisiwanitaSw = readRepoFile('public', 'sisiwanita-sw.js');
        const mobileDisabled = readRepoFile('public', 'mobile-app-disabled.html');
        const patientMenu = readRepoFile('public', 'patient-menu.html');
        const manifest = readRepoFile('public', 'patient-portal.webmanifest');
        const shellVersionMatch = rootSw.match(/const CACHE_VERSION = '([^']+)';/);

        expect(loginPage).toContain('<section class="portal-card login-card" id="page-register">');
        expect(loginPage).toContain("const requestedMode = 'register';");
        expect(loginPage).toContain("let pendingGoogleAction = 'register';");
        expect(loginPage).toContain("setAuthMode('register');");
        expect(loginPage).toContain('id="btn-google-register" onclick="registerWithGoogle()"');
        expect(loginPage).toContain('<span>Daftar dengan Google</span>');
        expect(mobileCallback).toContain('/patient-login.html?mode=register');
        expect(mobileDisabled).toContain('patient-login.html?mode=register');
        expect(mobileDisabled).not.toContain('autoGoogle=1');
        expect(shellVersionMatch).not.toBeNull();
        const [, shellVersion] = shellVersionMatch;
        expect(sisiwanitaSw).toContain(`const CACHE_VERSION = '${shellVersion}';`);
        expect(patientMenu).toContain(`/patient-portal.webmanifest?v=${shellVersion}`);
        expect(patientMenu).toContain(`/sw.js?v=${shellVersion}`);
        expect(manifest).toContain(`/patient-menu.html?source=pwa&v=${shellVersion}`);
    });
});

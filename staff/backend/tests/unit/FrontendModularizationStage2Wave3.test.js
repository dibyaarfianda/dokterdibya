const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '../../../..');
const absolute = (...parts) => path.join(repoRoot, ...parts);
const read = (...parts) => fs.readFileSync(absolute(...parts), 'utf8').replace(/\r\n/g, '\n');

describe('frontend modularization stage 2 wave 3', () => {
    test('patient install behavior is owned by a focused controller', () => {
        const modulePath = absolute('public', 'scripts', 'patient-shell', 'pwa-install-controller.js');
        expect(fs.existsSync(modulePath)).toBe(true);

        const shell = read('public', 'scripts', 'patient-menu-shell.js');
        const module = read('public', 'scripts', 'patient-shell', 'pwa-install-controller.js');

        expect(shell).toContain("from './patient-shell/pwa-install-controller.js'");
        expect(shell).toContain('createPatientPwaInstallController({');
        expect(shell).not.toContain('function configurePatientInstallPrompt(');
        expect(shell).not.toContain("window.addEventListener('beforeinstallprompt'");
        expect(module).toContain("window.addEventListener('beforeinstallprompt'");
        expect(module).toContain("window.addEventListener('appinstalled'");
        expect(module).toContain('getProfile');
        expect(module).toContain('getToken');
        expect(Buffer.byteLength(shell)).toBeLessThan(184000);
    });

    test('patient worker precaches the install controller', () => {
        const worker = read('public', 'sw.js');
        expect(worker).toContain("'/scripts/patient-shell/pwa-install-controller.js'");
    });

    test('landing install prompt is a modular feature with delegated controls', () => {
        const modulePath = absolute('public', 'scripts', 'landing', 'install-prompt.js');
        expect(fs.existsSync(modulePath)).toBe(true);

        const html = read('public', 'sisiwanita', 'index.html');
        const bootstrap = read('public', 'scripts', 'landing', 'bootstrap.js');
        const featureLoader = read('public', 'scripts', 'landing', 'feature-loader.js');
        const module = read('public', 'scripts', 'landing', 'install-prompt.js');

        expect(featureLoader).toContain("installPrompt: () => import('./install-prompt.js')");
        expect(bootstrap).toContain("loadLandingFeature('installPrompt')");
        expect(bootstrap).toContain('module.init?.()');
        expect((html.match(/data-landing-feature="installPrompt"/g) || []).length).toBeGreaterThanOrEqual(5);
        expect(html).not.toMatch(/onclick="(?:installPatientPWA|showIosInstallPrompt|dismissIosInstallPrompt)\(/);
        expect(html).not.toContain('function configureInstallPrompt(');
        expect(html).not.toContain("window.addEventListener('beforeinstallprompt'");
        expect(module).toContain("window.addEventListener('beforeinstallprompt'");
        expect(module).toContain('Object.assign(window, {');
    });

    test('dashboard new patients is a lazy controller with shared request handling', () => {
        const modulePath = absolute('staff', 'public', 'scripts', 'pages', 'dashboard-new-patients.js');
        expect(fs.existsSync(modulePath)).toBe(true);

        const html = read('staff', 'public', 'index-adminlte.html');
        const main = read('staff', 'public', 'scripts', 'main.js');
        const module = read('staff', 'public', 'scripts', 'pages', 'dashboard-new-patients.js');
        const featureLoader = read('staff', 'public', 'scripts', 'shell', 'feature-loader.js');
        const bootstrap = read('staff', 'public', 'scripts', 'shell', 'bootstrap.js');

        expect(main).not.toContain('async function loadDashboardNewPatients(');
        expect(main).toContain("ensureStaffFeature?.('dashboardNewPatients')");
        expect(html).not.toContain('onclick="loadDashboardNewPatients(');
        expect(html).toContain('data-action="dashboard-new-patients-prev"');
        expect(html).toContain('data-action="dashboard-new-patients-next"');
        expect(featureLoader).toContain('dashboardNewPatients: async () =>');
        expect(bootstrap).toContain("installLazyFeatureShim('loadDashboardNewPatients', 'dashboardNewPatients');");
        expect(module).toContain("import { createPageRequestScope } from '../staff-api.js';");
        expect(module).toContain("import { escapeHtml } from '../safe-render.js';");
        expect(module).toContain('data-action="view-dashboard-patient"');
        expect(module).toContain("document.addEventListener('page:changed'");
        expect(Buffer.byteLength(main)).toBeLessThan(250000);
    });

    test('cache versions stay synchronized for wave 3', () => {
        const patientWorker = read('public', 'sw.js');
        const patientManifest = JSON.parse(read('public', 'patient-portal.webmanifest'));
        const landing = read('public', 'sisiwanita', 'index.html');
        const patientVersion = patientWorker.match(/const CACHE_VERSION = '([^']+)'/)?.[1];

        expect(patientVersion).toBeTruthy();
        expect(patientManifest.start_url).toContain(`v=${patientVersion}`);
        expect(landing).toContain(`/scripts/landing/bootstrap.js?v=${patientVersion}`);

        const staffHtml = read('staff', 'public', 'index-adminlte.html');
        const staffWorker = read('staff', 'public', 'sw.js');
        const staffVersion = staffHtml.match(/window\.STAFF_CACHE_VERSION = '([^']+)'/)?.[1];
        expect(staffWorker).toContain(`const STAFF_PWA_VERSION = '${staffVersion}'`);
    });
});

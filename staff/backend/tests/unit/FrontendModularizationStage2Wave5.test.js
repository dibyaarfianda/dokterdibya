const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '../../../..');
const absolute = (...parts) => path.join(repoRoot, ...parts);
const read = (...parts) => fs.readFileSync(absolute(...parts), 'utf8').replace(/\r\n/g, '\n');

describe('frontend modularization stage 2 wave 5', () => {
    test('patient topbar notifications are owned by a focused controller', () => {
        const modulePath = absolute('public', 'scripts', 'patient-shell', 'features', 'notification-controller.js');
        expect(fs.existsSync(modulePath)).toBe(true);

        const shell = read('public', 'scripts', 'patient-menu-shell.js');
        const module = read('public', 'scripts', 'patient-shell', 'features', 'notification-controller.js');
        const worker = read('public', 'sw.js');

        expect(shell).toContain("from './patient-shell/features/notification-controller.js'");
        expect(shell).toContain('createPatientNotificationController({');
        expect(shell).not.toContain('function renderNotificationsModal(');
        expect(shell).not.toContain('async function fetchTopbarNotifications(');
        expect(module).toContain("fetch('/api/patient-notifications?_t='");
        expect(module).toContain('escapeHtml');
        expect(module).toContain('requireRealPatient');
        expect(worker).toContain("'/scripts/patient-shell/features/notification-controller.js'");
        expect(Buffer.byteLength(shell)).toBeLessThan(176000);
    });

    test('landing announcement interaction guard is modular', () => {
        const modulePath = absolute('public', 'scripts', 'landing', 'announcement-guard.js');
        expect(fs.existsSync(modulePath)).toBe(true);

        const html = read('public', 'sisiwanita', 'index.html');
        const bootstrap = read('public', 'scripts', 'landing', 'bootstrap.js');
        const loader = read('public', 'scripts', 'landing', 'feature-loader.js');
        const module = read('public', 'scripts', 'landing', 'announcement-guard.js');
        const worker = read('public', 'sw.js');

        expect(loader).toContain("announcementGuard: () => import('./announcement-guard.js')");
        expect(bootstrap).toContain("loadLandingFeature('announcementGuard')");
        expect(html).not.toContain('function stripUpdateTerkiniLinks(');
        expect(html).not.toContain('function initUpdateTerkiniNoLinksMode(');
        expect(module).toContain('new MutationObserver(');
        expect(module).toContain("container.addEventListener('click'");
        expect(worker).toContain("'/scripts/landing/announcement-guard.js'");
        expect(Buffer.byteLength(html)).toBeLessThan(333000);
    });

    test('staff cost estimator is a lazy safe controller with delegated actions', () => {
        const modulePath = absolute('staff', 'public', 'scripts', 'pages', 'estimasi-biaya-page.js');
        expect(fs.existsSync(modulePath)).toBe(true);

        const main = read('staff', 'public', 'scripts', 'main.js');
        const fragment = read('staff', 'public', 'fragments', 'pages', 'estimasi-biaya-page.html');
        const module = read('staff', 'public', 'scripts', 'pages', 'estimasi-biaya-page.js');
        const loader = read('staff', 'public', 'scripts', 'shell', 'feature-loader.js');
        const bootstrap = read('staff', 'public', 'scripts', 'shell', 'bootstrap.js');

        expect(main).not.toContain('function createDefaultEstimasiBiayaConfig(');
        expect(main).not.toContain('async function ensureEstimasiBiayaData(');
        expect(main).not.toContain('function updateEstimasiBiaya(');
        expect(main).toContain("'nav-estimasi-biaya':                   () => window.showEstimasiBiayaPage?.()");
        expect(fragment).not.toMatch(/\son(?:click|change|input)=/i);
        expect(fragment).toContain('data-action="reload-estimasi-biaya"');
        expect(fragment).toContain('data-action="save-estimasi-biaya"');
        expect(loader).toContain('estimasiBiaya: async () =>');
        expect(bootstrap).toContain("installLazyFeatureShim('showEstimasiBiayaPage', 'estimasiBiaya', 'estimasi-biaya');");
        expect(module).toContain("import { createPageRequestScope } from '../staff-api.js';");
        expect(module).toContain("import { escapeHtml } from '../safe-render.js';");
        expect(module).toContain("event.detail?.page !== 'estimasi-biaya'");
        expect(module).toContain("document.addEventListener('change'");
        expect(module).toContain('Object.assign(window, {');
        expect(Buffer.byteLength(main)).toBeLessThan(225000);
    });

    test('wave 5 cache versions stay synchronized', () => {
        const patientWorker = read('public', 'sw.js');
        const patientManifest = JSON.parse(read('public', 'patient-portal.webmanifest'));
        const patientVersion = patientWorker.match(/const CACHE_VERSION = '([^']+)'/)?.[1];
        expect(patientManifest.start_url).toContain(`v=${patientVersion}`);

        const staffHtml = read('staff', 'public', 'index-adminlte.html');
        const staffWorker = read('staff', 'public', 'sw.js');
        const staffVersion = staffHtml.match(/window\.STAFF_CACHE_VERSION = '([^']+)'/)?.[1];
        expect(staffWorker).toContain(`const STAFF_PWA_VERSION = '${staffVersion}'`);
    });
});

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '../../../..');
const absolute = (...parts) => path.join(repoRoot, ...parts);
const read = (...parts) => fs.readFileSync(absolute(...parts), 'utf8').replace(/\r\n/g, '\n');

describe('frontend modularization stage 2 wave 4', () => {
    test('patient bug reporting is owned by a focused controller', () => {
        const modulePath = absolute('public', 'scripts', 'patient-shell', 'features', 'bug-report-controller.js');
        expect(fs.existsSync(modulePath)).toBe(true);

        const shell = read('public', 'scripts', 'patient-menu-shell.js');
        const module = read('public', 'scripts', 'patient-shell', 'features', 'bug-report-controller.js');
        const worker = read('public', 'sw.js');

        expect(shell).toContain("from './patient-shell/features/bug-report-controller.js'");
        expect(shell).toContain('createBugReportController({');
        expect(shell).not.toContain('function buildBugReportMessage(');
        expect(shell).not.toContain('async function submitBugReport(');
        expect(module).toContain("fetch('/api/patient-feedback'");
        expect(module).toContain("category: 'bug'");
        expect(module).toContain('getProfile');
        expect(module).toContain('requireRealPatient');
        expect(worker).toContain("'/scripts/patient-shell/features/bug-report-controller.js'");
        expect(Buffer.byteLength(shell)).toBeLessThan(179000);
    });

    test('landing pull refresh and link transitions are modular', () => {
        const modulePath = absolute('public', 'scripts', 'landing', 'navigation-interactions.js');
        expect(fs.existsSync(modulePath)).toBe(true);

        const html = read('public', 'sisiwanita', 'index.html');
        const bootstrap = read('public', 'scripts', 'landing', 'bootstrap.js');
        const loader = read('public', 'scripts', 'landing', 'feature-loader.js');
        const module = read('public', 'scripts', 'landing', 'navigation-interactions.js');
        const worker = read('public', 'sw.js');

        expect(loader).toContain("navigationInteractions: () => import('./navigation-interactions.js')");
        expect(bootstrap).toContain("loadLandingFeature('navigationInteractions')");
        expect(html).not.toContain('let touchStartY = 0;');
        expect(html).not.toContain("link.dataset.animating = '1'");
        expect(module).toContain("document.addEventListener('touchstart'");
        expect(module).toContain("document.addEventListener('click'");
        expect(module).toContain("link.dataset.animating = '1'");
        expect(worker).toContain("'/scripts/landing/navigation-interactions.js'");
        expect(Buffer.byteLength(html)).toBeLessThan(335000);
    });

    test('staff activity is a lazy fragment and safe controller', () => {
        const fragmentPath = absolute('staff', 'public', 'fragments', 'pages', 'staff-activity-page.html');
        const modulePath = absolute('staff', 'public', 'scripts', 'pages', 'staff-activity-page.js');
        expect(fs.existsSync(fragmentPath)).toBe(true);
        expect(fs.existsSync(modulePath)).toBe(true);

        const html = read('staff', 'public', 'index-adminlte.html');
        const main = read('staff', 'public', 'scripts', 'main.js');
        const fragment = read('staff', 'public', 'fragments', 'pages', 'staff-activity-page.html');
        const module = read('staff', 'public', 'scripts', 'pages', 'staff-activity-page.js');
        const descriptors = read('staff', 'public', 'scripts', 'shell', 'page-descriptors.js');
        const loader = read('staff', 'public', 'scripts', 'shell', 'feature-loader.js');
        const bootstrap = read('staff', 'public', 'scripts', 'shell', 'bootstrap.js');

        expect(html).toMatch(/id="staff-activity-page"[^>]*data-page-fragment="\/staff\/public\/fragments\/pages\/staff-activity-page\.html"/);
        expect(html).not.toContain('id="staff-activity-body"');
        expect(fragment).toContain('id="staff-activity-body"');
        expect(fragment).toContain('data-action="refresh-staff-activity"');
        expect(fragment).not.toMatch(/\sonclick=/i);
        expect(main).not.toContain('function showStaffActivityPage(');
        expect(main).not.toContain('async function loadStaffActivityLogs(');
        expect(main).toContain("'nav-staff-activity':                   () => window.showStaffActivityPage?.()");
        expect(descriptors).toContain("['staff-activity', 'staff-activity-page', 'nav-staff-activity', 'Aktivitas Staff']");
        expect(loader).toContain('staffActivity: async () =>');
        expect(bootstrap).toContain("installLazyFeatureShim('showStaffActivityPage', 'staffActivity', 'staff-activity');");
        expect(bootstrap).toContain("installLazyFeatureShim('loadStaffActivityLogs', 'staffActivity', 'staff-activity');");
        expect(module).toContain("import { createPageRequestScope } from '../staff-api.js';");
        expect(module).toContain("import { escapeHtml } from '../safe-render.js';");
        expect(module).toContain("event.detail?.page !== 'staff-activity'");
        expect(module).toContain('Object.assign(window, {');
        expect(Buffer.byteLength(main)).toBeLessThan(244000);
        expect(Buffer.byteLength(html)).toBeLessThan(310000);
    });

    test('wave 4 cache versions stay synchronized', () => {
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

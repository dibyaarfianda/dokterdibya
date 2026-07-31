const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '../../../..');
const absolute = (...parts) => path.join(repoRoot, ...parts);
const read = (...parts) => fs.readFileSync(absolute(...parts), 'utf8').replace(/\r\n/g, '\n');

describe('frontend modularization stage 2 wave 6', () => {
    test('patient exit and back guard is a focused controller', () => {
        const modulePath = absolute('public', 'scripts', 'patient-shell', 'exit-controller.js');
        expect(fs.existsSync(modulePath)).toBe(true);
        const shell = read('public', 'scripts', 'patient-menu-shell.js');
        const module = read('public', 'scripts', 'patient-shell', 'exit-controller.js');
        const worker = read('public', 'sw.js');
        expect(shell).toContain("from './patient-shell/exit-controller.js'");
        expect(shell).toContain('createPatientExitController({');
        expect(shell).not.toContain('function installHomeBackExitGuard(');
        expect(shell).not.toContain('function requestPwaClose(');
        expect(module).toContain("window.addEventListener('popstate'");
        expect(module).toContain("window.location.replace('/app-closed.html')");
        expect(worker).toContain("'/scripts/patient-shell/exit-controller.js'");
        expect(Buffer.byteLength(shell)).toBeLessThan(172000);
    });

    test('landing footer effects are modular and event driven', () => {
        const modulePath = absolute('public', 'scripts', 'landing', 'footer-effects.js');
        expect(fs.existsSync(modulePath)).toBe(true);
        const html = read('public', 'sisiwanita', 'index.html');
        const bootstrap = read('public', 'scripts', 'landing', 'bootstrap.js');
        const loader = read('public', 'scripts', 'landing', 'feature-loader.js');
        const module = read('public', 'scripts', 'landing', 'footer-effects.js');
        const worker = read('public', 'sw.js');
        expect(loader).toContain("footerEffects: () => import('./footer-effects.js')");
        expect(bootstrap).toContain("loadLandingFeature('footerEffects')");
        expect(html).not.toContain('function updateFooterParallax(');
        expect(module).toContain("window.addEventListener('scroll'");
        expect(module).toContain('new IntersectionObserver(');
        expect(module).not.toContain('setInterval(');
        expect(worker).toContain("'/scripts/landing/footer-effects.js'");
    });

    test('staff sidebar badge polling is owned by a shared-api module', () => {
        const modulePath = absolute('staff', 'public', 'scripts', 'shell', 'notification-badges.js');
        expect(fs.existsSync(modulePath)).toBe(true);
        const main = read('staff', 'public', 'scripts', 'main.js');
        const module = read('staff', 'public', 'scripts', 'shell', 'notification-badges.js');
        const loader = read('staff', 'public', 'scripts', 'shell', 'feature-loader.js');
        const bootstrap = read('staff', 'public', 'scripts', 'shell', 'bootstrap.js');
        expect(main).not.toContain('async function loadNotificationBadges(');
        expect(main).not.toContain('function scheduleNotificationBadges(');
        expect(main).toContain('window.scheduleNotificationBadges?.();');
        expect(loader).toContain('notificationBadges: async () => {');
        expect(loader).toContain('notification-badges.js?v=${version}');
        expect(bootstrap).toContain("installLazyFeatureShim('markBadgeRead', 'notificationBadges');");
        expect(module).toContain("import { staffApiRequest } from '../staff-api.js';");
        expect(module).toContain("staffApiRequest('/api/notifications/badge-counts'");
        expect(module).toContain('Object.assign(window, {');
        expect(Buffer.byteLength(main)).toBeLessThan(218000);
    });

    test('wave 6 cache versions stay synchronized', () => {
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

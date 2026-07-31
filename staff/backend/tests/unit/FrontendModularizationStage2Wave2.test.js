const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '../../../..');
const absolute = (...parts) => path.join(repoRoot, ...parts);
const read = (...parts) => fs.readFileSync(absolute(...parts), 'utf8').replace(/\r\n/g, '\n');

describe('frontend modularization stage 2 wave 2', () => {
    test('patient shell delegates guest session, routes, sheets, and My Corner to focused modules', () => {
        const expectedModules = [
            ['public', 'scripts', 'patient-shell', 'guest-session.js'],
            ['public', 'scripts', 'patient-shell', 'routes.js'],
            ['public', 'scripts', 'patient-shell', 'sheet-controller.js'],
            ['public', 'scripts', 'patient-shell', 'features', 'my-corner-controller.js']
        ];
        expectedModules.forEach(parts => expect(fs.existsSync(absolute(...parts))).toBe(true));

        const shell = read('public', 'scripts', 'patient-menu-shell.js');
        expect(shell).toContain("from './patient-shell/guest-session.js'");
        expect(shell).toContain("from './patient-shell/routes.js'");
        expect(shell).toContain("from './patient-shell/sheet-controller.js'");
        expect(shell).toContain("from './patient-shell/features/my-corner-controller.js'");
        expect(shell).not.toContain('const menuData = {');
        expect(shell).not.toContain('function startGuestSession(');
        expect(shell).not.toContain('function openSheet(');
        expect(shell).not.toContain('function applyMyCorner(');
        expect(Buffer.byteLength(shell)).toBeLessThan(195000);
    });

    test('patient feature code is loaded on demand and the orphan crop editor is removed', () => {
        const html = read('public', 'patient-menu.html');
        const shell = read('public', 'scripts', 'patient-menu-shell.js');
        const featureLoader = read('public', 'scripts', 'patient-shell', 'feature-loader.js');

        expect(featureLoader).toContain("myCorner: () => import('../patient-my-corner.js')");
        expect(featureLoader).toContain("patientTracking: () => import('../../js/patient-tracker.js')");
        expect(html).not.toContain('<script src="/scripts/patient-my-corner.js');
        expect(html).not.toContain('<script src="/js/patient-tracker.js');
        expect(html).not.toContain('id="crop-editor-overlay"');
        expect(html).not.toContain('#crop-editor-overlay');
        expect(html).not.toContain('function openCropEditor(');
        expect(shell).not.toContain('onclick="selectBirthDateWheelValue');
        expect(shell).toContain('data-shell-action="select-birth-date-wheel-value"');
    });

    test('patient service worker precaches the complete modular shell graph', () => {
        const worker = read('public', 'sw.js');
        [
            '/scripts/patient-menu-shell.js',
            '/scripts/patient-shell/session-bootstrap.js',
            '/scripts/patient-shell/guest-session.js',
            '/scripts/patient-shell/router.js',
            '/scripts/patient-shell/routes.js',
            '/scripts/patient-shell/navigation.js',
            '/scripts/patient-shell/layout.js',
            '/scripts/patient-shell/sheet-controller.js',
            '/scripts/patient-shell/feature-loader.js',
            '/scripts/patient-shell/features/my-corner-controller.js',
            '/scripts/patient-my-corner.js',
            '/js/patient-tracker.js'
        ].forEach(asset => expect(worker).toContain(`'${asset}'`));
    });

    test('landing promo preview is a lazy feature with keyboard-safe delegated actions', () => {
        expect(fs.existsSync(absolute('public', 'scripts', 'landing', 'promo-preview.js'))).toBe(true);
        const html = read('public', 'sisiwanita', 'index.html');
        const bootstrap = read('public', 'scripts', 'landing', 'bootstrap.js');
        const featureLoader = read('public', 'scripts', 'landing', 'feature-loader.js');

        expect(featureLoader).toContain("promoPreview: () => import('./promo-preview.js')");
        expect(bootstrap).toContain("[data-landing-feature][data-landing-action]");
        expect(bootstrap).toContain("loadLandingFeature(target.dataset.landingFeature)");
        expect(bootstrap).toContain("event.key !== 'Enter' && event.key !== ' '");
        expect((html.match(/data-promo-src=/g) || [])).toHaveLength(12);
        expect((html.match(/data-landing-feature="promoPreview"/g) || [])).toHaveLength(15);
        expect(html).not.toContain('onclick="return openQueuePromoModal');
        expect(html).not.toContain('onclick="closeQueuePromoModal()');
        expect(html).not.toContain('function openQueuePromoModal(');
        expect(html).not.toContain('window.openQueuePromoModal =');
    });

    test('staff troubleshooting is a lazy fragment with one controller owner', () => {
        const fragmentPath = absolute('staff', 'public', 'fragments', 'pages', 'troubleshooting-page.html');
        const modulePath = absolute('staff', 'public', 'scripts', 'pages', 'troubleshooting-page.js');
        expect(fs.existsSync(fragmentPath)).toBe(true);
        expect(fs.existsSync(modulePath)).toBe(true);

        const html = read('staff', 'public', 'index-adminlte.html');
        const main = read('staff', 'public', 'scripts', 'main.js');
        const fragment = read('staff', 'public', 'fragments', 'pages', 'troubleshooting-page.html');
        const module = read('staff', 'public', 'scripts', 'pages', 'troubleshooting-page.js');
        const descriptors = read('staff', 'public', 'scripts', 'shell', 'page-descriptors.js');
        const featureLoader = read('staff', 'public', 'scripts', 'shell', 'feature-loader.js');
        const bootstrap = read('staff', 'public', 'scripts', 'shell', 'bootstrap.js');

        expect(html).toMatch(/id="troubleshooting-page"[^>]*data-page-fragment="\/staff\/public\/fragments\/pages\/troubleshooting-page\.html"/);
        expect(html).not.toContain('id="troubleshooting-reports-body"');
        expect(fragment).toContain('id="troubleshooting-reports-body"');
        expect(fragment).toContain('data-action="refresh-troubleshooting"');
        expect(fragment).not.toMatch(/\sonclick=/i);
        expect(main).not.toContain('function showTroubleshootingPage(');
        expect(main).not.toContain('function loadTroubleshootingReports(');
        expect(main).toContain("'nav-troubleshooting':                  () => window.showTroubleshootingPage");
        expect(descriptors).toContain("['troubleshooting', 'troubleshooting-page', 'nav-troubleshooting', 'Troubleshooting']");
        expect(featureLoader).toContain('troubleshooting: async () =>');
        expect(featureLoader).toContain("import(`../pages/troubleshooting-page.js?v=${version}`)");
        expect(bootstrap).toContain("installLazyFeatureShim('showTroubleshootingPage', 'troubleshooting', 'troubleshooting');");
        expect(bootstrap).toContain("installLazyFeatureShim('loadTroubleshootingReports', 'troubleshooting', 'troubleshooting');");
        expect(module).toContain("import { createPageRequestScope } from '../staff-api.js';");
        expect(module).toContain("import { escapeHtml } from '../safe-render.js';");
        expect(module).toContain("document.addEventListener('page:changed'");
        expect(module).toContain("event.detail?.page !== 'troubleshooting'");
        expect(module).toContain("Object.assign(window, {");
        expect(Buffer.byteLength(main)).toBeLessThan(256000);
        expect(Buffer.byteLength(html)).toBeLessThan(317000);
    });

    test('staff cache versions stay synchronized after the modular shell change', () => {
        const html = read('staff', 'public', 'index-adminlte.html');
        const worker = read('staff', 'public', 'sw.js');
        const shellVersion = html.match(/window\.STAFF_CACHE_VERSION = '([^']+)'/)?.[1];
        const workerVersion = worker.match(/const STAFF_PWA_VERSION = '([^']+)'/)?.[1];

        expect(shellVersion).toBeTruthy();
        expect(workerVersion).toBe(shellVersion);
        expect(shellVersion).not.toBe('v362');
    });
});

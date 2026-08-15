const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '../../../..');
const read = (...segments) => fs
    .readFileSync(path.join(repoRoot, ...segments), 'utf8')
    .replace(/\r\n/g, '\n');

describe('staff PWA mobile baseline restoration', () => {
    test('recognizes real mobile browsers and installed PWAs without enabling desktop mobile mode', () => {
        const shell = read('staff', 'public', 'index-adminlte.html');

        expect(shell).toContain("const isMobileUserAgent = /(?:Android|Mobi|iPad|iPhone|iPod)/i.test(navigator.userAgent);");
        expect(shell).toContain("const hasTouchInput = navigator.maxTouchPoints > 0 || 'ontouchstart' in window;");
        expect(shell).toContain('const isTouchMobileDevice = isMobileUserAgent && hasTouchInput;');
        expect(shell).toContain("const isMobileViewport = window.matchMedia('(max-width: 991.98px)').matches;");
        expect(shell).toContain('const mobileBrowserMode = isTouchMobileDevice && isMobileViewport;');
        expect(shell).toContain('const allowsMobilePwaMode = isTouchMobileDevice || !isDesktopFinePointer || isAndroidWebView;');
        expect(shell).toContain('const mobileFromUrl = mobileRequestedFromUrl && allowsMobilePwaMode;');
        expect(shell).toContain('const standaloneMobileMode = isStandalonePWA && allowsMobilePwaMode;');
        expect(shell).toMatch(/const isMobileApp = mobileBrowserMode \|\|\s+mobileFromUrl \|\|/);
        expect(shell).toContain('window.syncStaffPwaMode = syncStaffPwaMode;');
        expect(shell).toContain("window.addEventListener('pageshow', syncStaffPwaMode);");
        expect(shell).toContain("document.addEventListener('staff:fragment-loaded', syncStaffPwaMode);");
        expect(shell).toContain("} else if (isDesktopFinePointer && !isMobileUserAgent) {");
    });

    test('reapplies mobile mode after lazy staff fragments load', () => {
        const pageRegistry = read('staff', 'public', 'scripts', 'shell', 'page-registry.js');
        const main = read('staff', 'public', 'scripts', 'main.js');

        expect(pageRegistry).toContain("new EventCtor('staff:fragment-loaded', { detail })");
        expect(pageRegistry).toContain("this.eventTarget?.dispatchEvent?.(event);");
        expect(main).toContain('window.syncStaffPwaMode?.();');
        expect(main).toContain('queueSundayClinicPwaViewportSync();');
    });

    test('restores the July mobile clinical toolbar while keeping it hidden on desktop', () => {
        const fragment = read('staff', 'public', 'fragments', 'pages', 'sunday-clinic-page.html');
        const sharedCss = read('staff', 'public', 'styles', 'sunday-clinic.css');
        const pwaCss = read('staff', 'public', 'styles', 'sunday-clinic-pwa.css');

        expect(fragment).toContain('class="sc-pwa-mobile-title"');
        expect(fragment).toContain('id="sc-open-directory"');
        expect(fragment).toContain('id="btn-header-search"');
        expect(fragment).toContain('id="btn-toggle-patient-sidebar"');
        expect(fragment).toContain('class="btn btn-outline-info btn-sm sc-pwa-mobile-only"');
        expect(fragment).toContain('window.openImportModal && window.openImportModal()');
        expect(fragment).toContain('class="btn btn-outline-success btn-sm sc-pwa-mobile-only"');
        expect(fragment).toContain('window.openBulkImportModal && window.openBulkImportModal()');

        expect(sharedCss).toContain('.sc-pwa-mobile-only,');
        expect(sharedCss).toContain('.sc-pwa-mobile-title {');
        expect(sharedCss).toContain('display: none !important;');
        expect(pwaCss).toContain('body.mobile-app-mode.sunday-clinic-embedded-active .sc-pwa-mobile-only');
        expect(pwaCss).toContain('body.mobile-app-mode.sunday-clinic-embedded-active .sc-pwa-mobile-title');
        expect(pwaCss).toContain('display: inline-flex !important;');
        expect(pwaCss).toContain('flex-wrap: nowrap !important;');
        expect(pwaCss).toContain('body.mobile-app-mode.sunday-clinic-embedded-active.android-pwa-compact .sc-staff-section-nav');
        expect(pwaCss).toContain('flex-wrap: wrap !important;');
    });

    test('ships one cache version for the restored mobile shell and service worker', () => {
        const shell = read('staff', 'public', 'index-adminlte.html');
        const worker = read('staff', 'public', 'sw.js');
        const version = shell.match(/window\.STAFF_CACHE_VERSION = '([^']+)'/)?.[1];

        expect(version).toBeTruthy();
        expect(worker).toContain(`const STAFF_PWA_VERSION = '${version}';`);
        expect(shell).toContain(`styles/mobile-responsive.css?v=${version}`);
    });
});

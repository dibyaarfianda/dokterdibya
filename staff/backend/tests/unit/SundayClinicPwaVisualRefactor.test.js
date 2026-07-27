const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '../../../..');
const readRepoFile = (...segments) => fs.readFileSync(path.join(repoRoot, ...segments), 'utf8').replace(/\r\n/g, '\n');

describe('Sunday Clinic PWA visual refactor', () => {
    test('wave 1 loads a dedicated scoped PWA stylesheet after the shared stylesheet', () => {
        const main = readRepoFile('staff', 'public', 'scripts', 'main.js');
        const sharedCss = readRepoFile('staff', 'public', 'styles', 'sunday-clinic.css');
        const pwaPath = path.join(repoRoot, 'staff', 'public', 'styles', 'sunday-clinic-pwa.css');

        expect(fs.existsSync(pwaPath)).toBe(true);
        const pwaCss = fs.readFileSync(pwaPath, 'utf8').replace(/\r\n/g, '\n');
        expect(main).toContain("const SUNDAY_CLINIC_PWA_STYLESHEET_ID = 'sunday-clinic-pwa-stylesheet';");
        expect(main.indexOf('/styles/sunday-clinic.css?v=')).toBeLessThan(main.indexOf('/styles/sunday-clinic-pwa.css?v='));
        expect(sharedCss).not.toContain('body.mobile-app-mode');
        expect(pwaCss).not.toContain('Compact 10 final pass');
        expect(pwaCss).not.toMatch(/body\.mobile-app-mode\s+\.(?:btn|table|form-control)/);
    });

    test('wave 1 exposes one very compact clinical token set and safe shell targets', () => {
        const pwaCss = readRepoFile('staff', 'public', 'styles', 'sunday-clinic-pwa.css');

        expect((pwaCss.match(/--sc-pwa-font-body:/g) || []).length).toBe(1);
        expect(pwaCss).toContain('--sc-pwa-font-meta: var(--sc-pwa-platform-font-meta, 10px);');
        expect(pwaCss).toContain('--sc-pwa-font-body: var(--sc-pwa-platform-font-body, 11px);');
        expect(pwaCss).toContain('--sc-pwa-font-label: var(--sc-pwa-platform-font-label, 11px);');
        expect(pwaCss).toContain('--sc-pwa-font-control: var(--sc-pwa-platform-font-control, 14px);');
        expect(pwaCss).toContain('--sc-pwa-font-button: var(--sc-pwa-platform-font-button, 11px);');
        expect(pwaCss).toContain('--sc-pwa-font-heading: var(--sc-pwa-platform-font-heading, 13px);');
        expect(pwaCss).toContain('--sc-pwa-font-title: var(--sc-pwa-platform-font-title, 15px);');
        expect(pwaCss).toContain('--sc-pwa-touch-target: var(--sc-pwa-platform-touch-target, 40px);');
        expect(pwaCss).toContain('--sc-pwa-gutter: var(--sc-pwa-platform-gutter, 8px);');
        expect(pwaCss).toContain('--sc-pwa-viewport-height: 100%;');
        expect(pwaCss).toContain('--sc-pwa-bottom-nav-height: var(--sc-pwa-platform-bottom-nav-height, 60px);');
        expect(pwaCss).toContain('min-height: var(--sc-pwa-touch-target) !important;');
        expect(pwaCss).toContain('font-size: var(--sc-pwa-font-button) !important;');
        expect(pwaCss).not.toMatch(/font-size:\s*(?:8|9|12)px/);
        expect(pwaCss).not.toMatch(/Compact\s*(?:10|override|mode|rules?)/i);
        expect(pwaCss).toContain('#btn-queue-vis-toggle,');
        expect(pwaCss).toContain('#btn-doctor-toggle {');
        expect(pwaCss).toContain('width: 100% !important; /* Fixed navigation must not widen the document. */');
        expect(pwaCss).toContain('width: auto !important; /* Exclude the vertical scrollbar from shell sizing. */');
    });

    test('wave 1 viewport synchronization is idempotent and cleaned up with page lifecycle', () => {
        const main = readRepoFile('staff', 'public', 'scripts', 'main.js');

        expect(main).toContain('function syncSundayClinicPwaViewport()');
        expect(main).toContain("style.setProperty('--sc-pwa-viewport-height', viewportHeight + 'px');");
        expect(main).toContain("style.setProperty('--sc-pwa-bottom-nav-height', navHeight + 'px');");
        expect(main).toContain('function activateSundayClinicPwaLayout()');
        expect(main).toContain('function deactivateSundayClinicPwaLayout()');
        expect(main).toContain('if (sundayClinicPwaLayoutActive) return;');
        expect(main).toContain("contentWrapper.style.removeProperty('padding-top');");
        expect(main).toContain("contentWrapper.style.setProperty('padding-top', previousPadding.value, previousPadding.priority);");
        expect(main).toContain("window.visualViewport.addEventListener('resize', queueSundayClinicPwaViewportSync");
        expect(main).toContain("window.visualViewport.removeEventListener('resize', queueSundayClinicPwaViewportSync");
        expect(main).toContain('activateSundayClinicPwaLayout();');
        expect(main).toContain('deactivateSundayClinicPwaLayout();');
    });

    test('desktop web never receives the embedded Sunday Clinic PWA scope', () => {
        const main = readRepoFile('staff', 'public', 'scripts', 'main.js');
        const shell = readRepoFile('staff', 'public', 'index-adminlte.html');
        const tapFeedback = readRepoFile('staff', 'public', 'scripts', 'tap-feedback.js');

        expect(main).toContain("window.matchMedia('(max-width: 991.98px)')");
        expect(main).toContain('function reconcileSundayClinicPwaMode()');
        expect(main).toContain('pwaLink.disabled = !shouldEnablePwa;');
        expect(main).toContain("sundayClinicPwaMediaQuery.addEventListener('change', reconcileSundayClinicPwaMode);");
        expect(main).toContain("sundayClinicPwaMediaQuery.removeEventListener('change', reconcileSundayClinicPwaMode);");
        expect(main).toContain("document.body.classList.add('sunday-clinic-embedded-active');");
        expect(shell).toContain("const mobileRequestedFromUrl = urlParams.get('mobile') === '1';");
        expect(shell).toContain('const mobileFromUrl = mobileRequestedFromUrl && !isDesktopFinePointer;');
        expect(shell).toContain("sessionStorage.removeItem('mobileAppMode');");
        expect(shell).toContain("localStorage.removeItem('mobileAppMode');");
        expect(shell).toContain('id="mobile-responsive-stylesheet"');
        expect(shell).toContain('mobileResponsiveStylesheet.disabled = !isMobileApp;');
        expect(tapFeedback).not.toContain("window.location.search.includes('mobile=1')");
    });

    test('wave 2 normalizes clinical typography, controls, cards, and responsive grids', () => {
        const pwaCss = readRepoFile('staff', 'public', 'styles', 'sunday-clinic-pwa.css');

        expect(pwaCss).toContain('/* Wave 2: canonical clinical content rules. */');
        expect(pwaCss).toContain('font-size: var(--sc-pwa-font-control) !important;');
        expect(pwaCss).toContain('min-height: var(--sc-pwa-touch-target) !important;');
        expect(pwaCss).toContain('min-height: 72px !important;');
        expect(pwaCss).toContain('padding: var(--sc-pwa-space-2) !important;');
        expect(pwaCss).toContain('grid-template-columns: repeat(2, minmax(0, 1fr)) !important;');
        expect(pwaCss).toContain('flex: 0 0 100% !important;');
        expect(pwaCss).toContain('#sunday-clinic-content textarea.form-control,');
        expect(pwaCss).toContain('#sunday-clinic-content .btn[class*="btn-"],');
        expect(pwaCss).toContain('#sunday-clinic-content .trimester-content .d-flex.gap-3 {');
        expect(pwaCss).not.toContain('word-break: break-all');
    });

    test('wave 2 keeps billing and icon actions readable on narrow screens', () => {
        const pwaCss = readRepoFile('staff', 'public', 'styles', 'sunday-clinic-pwa.css');
        const billing = readRepoFile('staff', 'public', 'scripts', 'sunday-clinic', 'components', 'shared', 'billing.js');

        expect(pwaCss).toContain(':is(.sc-billing-table, #billing-items-table, .additional-billing-table) td {');
        expect(pwaCss).toContain('grid-template-columns: minmax(80px, 0.4fr) minmax(0, 1fr) !important;');
        expect(pwaCss).toContain('#additional-billing-panel .additional-billing-actions .btn {');
        expect(billing).toContain('aria-label="Ubah draft"');
        expect(billing).toContain('aria-label="Konfirmasi tagihan"');
        expect(billing).toContain('aria-label="Cetak invoice"');
    });

    test('wave 3 uses one pixel-viewport modal sheet contract', () => {
        const pwaCss = readRepoFile('staff', 'public', 'styles', 'sunday-clinic-pwa.css');
        const wave3 = pwaCss.slice(pwaCss.indexOf('/* Wave 3: canonical modal, overlay, sidebar, and chat rules. */'));

        expect(wave3).not.toBe('');
        expect(wave3).toContain('max-height: calc(var(--sc-pwa-viewport-height) - 12px) !important;');
        expect(wave3).toContain('position: sticky !important;');
        expect(wave3).toContain('overflow-y: auto !important;');
        expect(wave3).toContain('font-size: var(--sc-pwa-font-control) !important;');
        expect(wave3).toContain('min-height: var(--sc-pwa-touch-target) !important;');
        expect(wave3).toContain('.modal .modal-header:not([class*="bg-"]) {');
        expect(wave3).toContain('.modal .modal-header:not([class*="bg-"]) .modal-title,');
        expect(wave3).toContain('color: #212529 !important;');
        expect(wave3).toContain('.modal .input-group > .form-control {');
        expect(wave3).toContain('width: 1% !important;');
        expect(wave3).toContain('#tindakan-modal-body {');
        expect(wave3).toContain('overflow-x: hidden !important;');
        expect(wave3).toContain('#terapi-modal tbody td::before {');
        expect(wave3).toContain('content: attr(data-label) !important;');
        expect(wave3).toContain('.modal :is(.custom-control, .form-check, .custom-control-label, .form-check-label) {');
        expect(wave3).toContain('@media (max-width: 390px)');
        expect(wave3).not.toMatch(/\d+(?:\.\d+)?vh/);
    });

    test('wave 3 aligns directory, history sidebar, and chat to the same visual scale', () => {
        const pwaCss = readRepoFile('staff', 'public', 'styles', 'sunday-clinic-pwa.css');
        const chatPopup = readRepoFile('staff', 'public', 'scripts', 'chat-popup.js');
        const wave3 = pwaCss.slice(pwaCss.indexOf('/* Wave 3: canonical modal, overlay, sidebar, and chat rules. */'));

        expect(wave3).toContain('.sc-directory {');
        expect(wave3).toContain('.patient-history-sidebar {');
        expect(wave3).toContain('#chat-close-btn,');
        expect(wave3).toContain('#chat-send-btn {');
        expect(wave3).toContain('font-size: var(--sc-pwa-font-body) !important;');
        expect(wave3).toContain('bottom: calc(var(--sc-pwa-bottom-nav-height) + 6px) !important;');
        expect(chatPopup).toContain("var isSundayClinic = document.body.classList.contains('sunday-clinic-embedded-active');");
        expect(chatPopup).toContain('var clinicInsetPx = isSundayClinic ? 6 : 0;');
        expect(chatPopup).toContain('var clinicFrame = getSundayClinicChatFrame(');
        expect(chatPopup).toContain("var clinicRadius = document.body.classList.contains('sunday-clinic-embedded-active') ? '8px' : '0';");
    });

    test('wave 3 replaces fixed inline form sizing with shared semantic hooks', () => {
        const sharedCss = readRepoFile('staff', 'public', 'styles', 'sunday-clinic.css');
        const pwaCss = readRepoFile('staff', 'public', 'styles', 'sunday-clinic-pwa.css');
        const sources = [
            ['utils', 'planning-helpers.js'],
            ['utils', 'medical-import.js'],
            ['sections', 'usg.js'],
            ['components', 'gyn_repro', 'usg-gyn_repro.js'],
            ['components', 'gyn_special', 'usg-gyn_special.js'],
            ['components', 'obstetri', 'anamnesa-obstetri.js']
        ].map((segments) => readRepoFile('staff', 'public', 'scripts', 'sunday-clinic', ...segments)).join('\n');

        expect(sharedCss).toContain('.sc-form-limit-md {');
        expect(sharedCss).toContain('.sc-medication-instruction {');
        expect(pwaCss).toContain('body.mobile-app-mode.sunday-clinic-embedded-active #sunday-clinic-content .sc-form-limit-md,');
        expect(sources).not.toMatch(/style="(?:max-width:\s*(?:120|150|300)px|width:\s*(?:60|80|150\.923076|180)px|height:\s*71px)/);
        expect(sources).toContain('<td data-label="Nama Obat">');
    });

    test('all rendered clinical modules receive idempotent compact semantic primitives', () => {
        const app = readRepoFile('staff', 'public', 'scripts', 'sunday-clinic', 'main.js');

        expect(app).toContain('applySundayClinicPwaPrimitives(container)');
        expect(app).toContain("element.classList.add('sc-pwa-card')");
        expect(app).toContain("element.classList.add('sc-pwa-form-grid')");
        expect(app).toContain("element.classList.add('sc-pwa-action-row')");
        expect(app).toContain("button.classList.add('sc-pwa-icon-button')");
        expect(app).toContain("const COMPONENT_VERSION = '3.0.18';");
    });

    test('Android phone PWA uses a compact two-row navigation without changing iOS defaults', () => {
        const html = readRepoFile('staff', 'public', 'index-adminlte.html');
        const main = readRepoFile('staff', 'public', 'scripts', 'main.js');
        const pwaCss = readRepoFile('staff', 'public', 'styles', 'sunday-clinic-pwa.css');
        const sw = readRepoFile('staff', 'public', 'sw.js');

        expect(html).toContain("const isAndroidPlatform = /Android/i.test(navigator.userAgent);");
        expect(html).toContain("document.documentElement.classList.add('android-pwa-compact');");
        expect(html).toContain("document.body.classList.add('android-pwa-compact');");
        expect(pwaCss).toContain('@media (max-width: 480px) {');
        expect(pwaCss).toContain('body.mobile-app-mode.sunday-clinic-embedded-active.android-pwa-compact {');
        expect(pwaCss).toContain('--sc-pwa-platform-font-body: 10px;');
        expect(pwaCss).toContain('--sc-pwa-platform-font-control: 12px;');
        expect(pwaCss).toContain('--sc-pwa-platform-touch-target: 36px;');
        expect(pwaCss).toContain('--sc-pwa-platform-bottom-nav-height: 92px;');
        expect(pwaCss).toContain('flex-wrap: wrap !important;');
        expect(pwaCss).toContain('flex: 0 0 20% !important;');
        expect(pwaCss).toContain('max-width: 20% !important;');
        expect(pwaCss).toContain('height: 44px !important;');
        expect(pwaCss).toContain('min-height: 92px !important;');
        expect(pwaCss).toContain('max-height: none !important;');
        expect(pwaCss).toContain('font-size: var(--sc-pwa-font-meta) !important;');
        expect(pwaCss).toContain('overflow-wrap: normal !important;');
        expect(pwaCss).not.toContain('flex: 0 0 60px !important;');
        expect(pwaCss).not.toContain('flex-wrap: nowrap !important;\n        gap: 0 !important;');
        expect(pwaCss).toContain('height: 40px !important;');
        expect(pwaCss).toContain('padding-top: 42px !important;');
        expect(main).toContain("const minimumNavHeight = document.body.classList.contains('android-pwa-compact') ? 92 : 52;");
        expect(pwaCss).toContain('-webkit-text-size-adjust: 100% !important;');
        expect(pwaCss).toContain('--sc-pwa-font-body: var(--sc-pwa-platform-font-body, 11px);');
        expect(pwaCss).not.toMatch(/(?:iPhone|iPad|ios).*android-pwa-compact/i);
        expect(html).toContain("window.STAFF_CACHE_VERSION = 'v359';");
        expect(sw).toContain("const STAFF_PWA_VERSION = 'v359';");
    });

    test('Sunday Clinic PWA removes the profile slot so header controls cannot be clipped', () => {
        const html = readRepoFile('staff', 'public', 'index-adminlte.html');
        const pwaCss = readRepoFile('staff', 'public', 'styles', 'sunday-clinic-pwa.css');
        const sw = readRepoFile('staff', 'public', 'sw.js');

        expect(pwaCss).toContain('body.mobile-app-mode.sunday-clinic-embedded-active .main-header .user-menu {');
        expect(pwaCss).toContain('display: none !important;');
        expect(pwaCss).toContain('body.mobile-app-mode.sunday-clinic-embedded-active .main-header .navbar-nav.ml-auto {');
        expect(pwaCss).toContain('max-width: 100% !important;');
        expect(pwaCss).not.toMatch(/body\.mobile-app-mode(?!\.sunday-clinic-embedded-active)[^{]*\.user-menu\s*\{/);
        expect(html).toContain("window.STAFF_CACHE_VERSION = 'v359';");
        expect(sw).toContain("const STAFF_PWA_VERSION = 'v359';");
    });
});

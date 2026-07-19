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

    test('wave 1 exposes one balanced clinical token set and safe shell targets', () => {
        const pwaCss = readRepoFile('staff', 'public', 'styles', 'sunday-clinic-pwa.css');

        expect((pwaCss.match(/--sc-pwa-font-body:/g) || []).length).toBe(1);
        expect(pwaCss).toContain('--sc-pwa-font-body: 13px;');
        expect(pwaCss).toContain('--sc-pwa-font-control: 16px;');
        expect(pwaCss).toContain('--sc-pwa-font-button: 13px;');
        expect(pwaCss).toContain('--sc-pwa-touch-target: 44px;');
        expect(pwaCss).toContain('--sc-pwa-gutter: 12px;');
        expect(pwaCss).toContain('--sc-pwa-viewport-height: 100%;');
        expect(pwaCss).toContain('--sc-pwa-bottom-nav-height: 68px;');
        expect(pwaCss).toContain('min-height: var(--sc-pwa-touch-target) !important;');
        expect(pwaCss).toContain('font-size: var(--sc-pwa-font-button) !important;');
        expect(pwaCss).toContain('font-size: 11px !important;');
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
        expect(main).toContain("window.visualViewport.addEventListener('resize', queueSundayClinicPwaViewportSync");
        expect(main).toContain("window.visualViewport.removeEventListener('resize', queueSundayClinicPwaViewportSync");
        expect(main).toContain('activateSundayClinicPwaLayout();');
        expect(main).toContain('deactivateSundayClinicPwaLayout();');
    });

    test('wave 2 normalizes clinical typography, controls, cards, and responsive grids', () => {
        const pwaCss = readRepoFile('staff', 'public', 'styles', 'sunday-clinic-pwa.css');

        expect(pwaCss).toContain('/* Wave 2: canonical clinical content rules. */');
        expect(pwaCss).toContain('font-size: var(--sc-pwa-font-control) !important;');
        expect(pwaCss).toContain('min-height: var(--sc-pwa-touch-target) !important;');
        expect(pwaCss).toContain('min-height: 88px !important;');
        expect(pwaCss).toContain('padding: var(--sc-pwa-space-3) !important;');
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

        expect(pwaCss).toContain('#additional-billing-panel .additional-billing-table td {');
        expect(pwaCss).toContain('grid-template-columns: minmax(96px, 0.42fr) minmax(0, 1fr) !important;');
        expect(pwaCss).toContain('#additional-billing-panel .additional-billing-actions .btn {');
        expect(billing).toContain('aria-label="Ubah draft"');
        expect(billing).toContain('aria-label="Konfirmasi tagihan"');
        expect(billing).toContain('aria-label="Cetak invoice"');
    });

    test('wave 3 uses one pixel-viewport modal sheet contract', () => {
        const pwaCss = readRepoFile('staff', 'public', 'styles', 'sunday-clinic-pwa.css');
        const wave3 = pwaCss.slice(pwaCss.indexOf('/* Wave 3: canonical modal, overlay, sidebar, and chat rules. */'));

        expect(wave3).not.toBe('');
        expect(wave3).toContain('max-height: calc(var(--sc-pwa-viewport-height) - 16px) !important;');
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
        expect(wave3).toContain('bottom: calc(var(--sc-pwa-bottom-nav-height) + 8px) !important;');
        expect(chatPopup).toContain("var clinicInsetPx = document.body.classList.contains('sunday-clinic-embedded-active') ? 8 : 0;");
        expect(chatPopup).toContain("var clinicRadius = document.body.classList.contains('sunday-clinic-embedded-active') ? '12px' : '0';");
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
        expect(pwaCss).toContain('body.mobile-app-mode.sunday-clinic-embedded-active .sc-form-limit-md,');
        expect(sources).not.toMatch(/style="(?:max-width:\s*(?:120|150|300)px|width:\s*(?:60|80|150\.923076|180)px|height:\s*71px)/);
        expect(sources).toContain('<td data-label="Nama Obat">');
    });
});

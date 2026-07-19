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
});

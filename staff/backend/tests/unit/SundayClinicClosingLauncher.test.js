const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '../../../..');
const readRepoFile = (...segments) => {
    const filePath = path.join(repoRoot, ...segments);
    return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n') : '';
};

function extractElementById(html, id) {
    const match = html.match(new RegExp(`<([a-z][\\w-]*)\\b[^>]*\\bid=["']${id}["'][^>]*>`, 'i'));
    return match?.[0] || '';
}

describe('Sunday Clinic closing launcher from Klinik Privat', () => {
    const html = readRepoFile('staff', 'public', 'index-adminlte.html');
    const main = readRepoFile('staff', 'public', 'scripts', 'main.js');
    const closing = readRepoFile(
        'staff',
        'public',
        'scripts',
        'sunday-clinic',
        'components',
        'shared',
        'closing.js'
    );
    const actionRouter = readRepoFile('staff', 'public', 'scripts', 'shell', 'actions.js');

    const clinicPageStart = html.indexOf('id="klinik-private-page"');
    const clinicPageEnd = html.indexOf('id="antrian-online-page"', clinicPageStart);
    const clinicPage = clinicPageStart >= 0 && clinicPageEnd > clinicPageStart
        ? html.slice(clinicPageStart, clinicPageEnd)
        : '';

    test('places a default-hidden Closing Hari Minggu launcher directly on Klinik Privat', () => {
        expect(clinicPage).toContain('id="klinik-private-closing-btn"');
        expect(clinicPage).toContain('Closing Hari Minggu');

        const launcher = extractElementById(clinicPage, 'klinik-private-closing-btn');
        expect(launcher).toMatch(/\bd-none\b/);

        // The generic .dokter-only menu reveal accepts legacy role/is_superadmin values.
        // This fixed financial control must instead be revealed by its strict role_id gate.
        expect(launcher).not.toMatch(/\bdokter-only\b/);
    });

    test('wires launcher visibility to the fixed doctor role id contract', () => {
        expect(main).toContain("import { ROLE_IDS, isSuperadminUser } from './role-constants.js'");
        expect(main).toContain('Number(user?.role_id) === ROLE_IDS.DOKTER');
        expect(main).toContain("document.querySelectorAll('.sunday-clinic-closing-doctor-only')");

        const pageLauncher = extractElementById(clinicPage, 'klinik-private-closing-btn');
        const navLauncher = extractElementById(html, 'nav-sunday-clinic-closing');
        [pageLauncher, navLauncher].forEach(launcher => {
            expect(launcher).toMatch(/\bsunday-clinic-closing-doctor-only\b/);
            expect(launcher).toMatch(/\bd-none\b/);
            expect(launcher).not.toMatch(/\bdokter-only\b/);
        });
    });

    test('opens the closing flow without requiring a patient MR', () => {
        const launcher = extractElementById(clinicPage, 'klinik-private-closing-btn');
        expect(launcher).not.toMatch(/(?:data-mr\s*=|[?&]mr=)/i);
        expect(launcher).toContain('data-shell-action="show-sunday-clinic-closing"');
        expect(actionRouter).toContain("'show-sunday-clinic-closing': function()");
        expect(actionRouter).toContain("callGlobal('showSundayClinicClosingPage')");
        expect(main).toContain('function showSundayClinicClosingPage()');
        expect(main).toContain('showSundayClinicPage({ closingOnly: true })');
        expect(main).toContain('if (!normalizedMrId && !closingOnly)');
        expect(main).toContain('window.showSundayClinicClosingPage = showSundayClinicClosingPage;');
        expect(closing).toContain('export function openSundayClinicClosing()');
    });

    test('keeps the existing Klinik Privat sidebar/PWA path and does not resurrect a Sunday Clinic nav item', () => {
        expect(html).toContain('id="nav-klinik-private"');
        expect(html).toContain('data-shell-action="show-klinik-private"');
        expect(html).toContain('id="nav-sunday-clinic-closing"');
        expect(extractElementById(html, 'nav-sunday-clinic-closing')).toMatch(/\bd-none\b/);
        expect(html).not.toContain('id="nav-sunday-clinic"');
        expect(html).not.toContain('href="/staff/public/sunday-clinic.html"');
    });
});

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '../../../..');
const readRepoFile = (...segments) => fs.readFileSync(path.join(repoRoot, ...segments), 'utf8');

describe('staff panel stabilization sources', () => {
    test('uses one v253 cache version source for staff assets', () => {
        const html = readRepoFile('staff', 'public', 'index-adminlte.html');

        expect(html).toContain("window.STAFF_CACHE_VERSION = 'v253';");
        expect(html).toContain('const CACHE_VERSION = window.STAFF_CACHE_VERSION;');
        expect(html).toContain('window.__assetVersion = window.STAFF_CACHE_VERSION;');
        expect(html).toContain('styles/mobile-responsive.css?v=v253');
        expect(html).not.toMatch(/CACHE_VERSION\s*=\s*'v241'/);
        expect(html).not.toMatch(/__assetVersion\s*=\s*'v250'/);
    });

    test('service worker v253 precache does not include missing chat panel css', () => {
        const sw = readRepoFile('staff', 'public', 'sw.js');

        expect(sw).toContain("const STAFF_PWA_VERSION = 'v253';");
        expect(sw).not.toContain('/staff/public/styles/chat-slide-panel.css');
    });

    test('patient photo_url schema accepts long Google avatar URLs', () => {
        const baseMigration = readRepoFile('staff', 'backend', 'migrations', 'add-patient-auth.sql');
        const longUrlMigration = readRepoFile(
            'staff',
            'backend',
            'migrations',
            '20260613_expand_patient_photo_url.sql'
        );

        expect(baseMigration).toMatch(/photo_url\s+TEXT\b/i);
        expect(baseMigration).not.toMatch(/photo_url\s+VARCHAR\(500\)/i);
        expect(longUrlMigration).toMatch(/ALTER\s+TABLE\s+patients/i);
        expect(longUrlMigration).toMatch(/MODIFY\s+COLUMN\s+photo_url\s+TEXT\s+NULL/i);
    });

    test('staff sidebar exposes patient engagement menus', () => {
        const html = readRepoFile('staff', 'public', 'index-adminlte.html');
        const mainJs = readRepoFile('staff', 'public', 'scripts', 'main.js');

        expect(html).toContain('id="nav-voting"');
        expect(html).toContain('showVotingPage(); return false;');
        expect(html).toContain('<p>Voting Pasien</p>');

        expect(html).toContain('id="nav-birth-class"');
        expect(html).toContain('showBirthClassPage(); return false;');
        expect(html).toContain('<p>Kelas Dr. Dibya</p>');

        expect(html).toContain('id="nav-birth-congrats"');
        expect(html).toContain('showBirthCongratsPage(); return false;');
        expect(html).toContain('<p>Ucapan Kelahiran</p>');

        expect(html).toContain('id="nav-birth-testimonials"');
        expect(html).toContain('showBirthTestimonialsPage(); return false;');
        expect(html).toContain('<p>Testimoni Pasien</p>');

        expect(mainJs).toContain("'klinik_privat': ['nav-klinik-private', 'nav-sunday-clinic', 'nav-voting', 'nav-birth-class']");
        expect(mainJs).toContain("'ucapan_kelahiran': ['nav-birth-congrats', 'nav-birth-testimonials']");
    });

    test('staff panel embeds Sunday Clinic inside index-adminlte shell', () => {
        const html = readRepoFile('staff', 'public', 'index-adminlte.html');
        const mainJs = readRepoFile('staff', 'public', 'scripts', 'main.js');
        const sundayClinicEntry = readRepoFile('staff', 'public', 'scripts', 'sunday-clinic.js');

        expect(html).toContain('id="nav-sunday-clinic"');
        expect(html).toContain('onclick="showSundayClinicPage(); return false;"');
        expect(html).toContain('id="sunday-clinic-page"');
        expect(html).toContain('id="sunday-clinic-root"');
        expect(html).toContain('id="sunday-clinic-content"');
        expect(html).toContain('id="import-warning-container"');
        expect(html).toContain('id="btn-import-apply-text"');
        expect(html).toContain('/staff/public/scripts/sunday-clinic/utils/planning-helpers.js?v=20260619staff1');
        expect(html).toContain('/staff/public/scripts/sunday-clinic/components/shared/payment-modal.js?v=20260619staff1');

        expect(mainJs).toContain("pages.sundayClinic = grab('sunday-clinic-page');");
        expect(mainJs).toContain("importWithVersion('./sunday-clinic.js')");
        expect(mainJs).toContain("window.showSundayClinicPage = showSundayClinicPage;");
        expect(mainJs).toContain('/staff/public/index-adminlte.html?page=sunday-clinic&mr=');

        expect(sundayClinicEntry).toContain('window.__sundayClinicEmbedded = appState.embedded;');
        expect(sundayClinicEntry).toContain('window.initSundayClinicPage = initSundayClinicPage;');
        expect(sundayClinicEntry).toContain("nextUrl.pathname = '/staff/public/index-adminlte.html';");
    });
});

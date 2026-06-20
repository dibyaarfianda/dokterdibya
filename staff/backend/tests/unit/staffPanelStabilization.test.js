const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '../../../..');
const readRepoFile = (...segments) => fs.readFileSync(path.join(repoRoot, ...segments), 'utf8');

describe('staff panel stabilization sources', () => {
    test('uses one v261 cache version source for staff assets', () => {
        const html = readRepoFile('staff', 'public', 'index-adminlte.html');

        expect(html).toContain("window.STAFF_CACHE_VERSION = 'v261';");
        expect(html).toContain('const CACHE_VERSION = window.STAFF_CACHE_VERSION;');
        expect(html).toContain('window.__assetVersion = window.STAFF_CACHE_VERSION;');
        expect(html).toContain('styles/mobile-responsive.css?v=v261');
        expect(html).not.toMatch(/CACHE_VERSION\s*=\s*'v241'/);
        expect(html).not.toMatch(/__assetVersion\s*=\s*'v250'/);
    });

    test('service worker v261 precache does not include missing chat panel css', () => {
        const sw = readRepoFile('staff', 'public', 'sw.js');

        expect(sw).toContain("const STAFF_PWA_VERSION = 'v261';");
        expect(sw).not.toContain('/staff/public/styles/chat-slide-panel.css');
    });

    test('staff PWA mobile typography uses Compact 12 with explicit allowlisted exceptions', () => {
        const mobileCss = readRepoFile('staff', 'public', 'styles', 'mobile-responsive.css').replace(/\r\n/g, '\n');
        const sundayClinicCss = readRepoFile('staff', 'public', 'styles', 'sunday-clinic.css').replace(/\r\n/g, '\n');

        expect(mobileCss).toContain('body.mobile-app-mode {\n    font-size: 12px !important;');
        expect(mobileCss).toContain('body.mobile-app-mode input,\nbody.mobile-app-mode textarea,\nbody.mobile-app-mode select {\n    font-size: 12px !important;');
        expect(mobileCss).toContain('body.mobile-app-mode .btn {\n    min-height: 28px;\n    font-size: 12px !important;');
        expect(mobileCss).toContain('body.mobile-app-mode .btn-sm {\n    min-height: 24px;\n    font-size: 11px !important;');
        expect(mobileCss).toContain('body.mobile-app-mode .table td,\nbody.mobile-app-mode .table th {\n    padding: 4px 6px !important;\n    font-size: 11px !important;');
        expect(mobileCss).toContain('body.mobile-app-mode #mobile-action-bar button,\n    body.mobile-app-mode #mobile-action-bar button span {\n        font-size: 10px !important;');
        expect(mobileCss).toContain('body.mobile-app-mode #mobile-action-bar button .icon-wrapper,\n    body.mobile-app-mode #mobile-action-bar button .icon-wrapper i,');
        expect(mobileCss).toContain('body.mobile-app-mode .info-box-icon,\n    body.mobile-app-mode .info-box-icon i {\n        font-size: 20px !important;');
        expect(mobileCss).toContain('body.mobile-app-mode #chat-toggle-btn i,\n    body.mobile-app-mode .chat-toggle-btn i {\n        font-size: 24px !important;');

        expect(sundayClinicCss).not.toMatch(/body\.mobile-app-mode\s+\*\s*\{\s*font-size:\s*9px\s*!important;/);
        expect(sundayClinicCss).not.toMatch(/#sunday-clinic-content\s+\*,\s*body\.mobile-app-mode\s+#sunday-clinic-content\s+\*::placeholder\s*\{\s*font-size:\s*inherit\s*!important;/);
        expect(sundayClinicCss).toContain('body.mobile-app-mode #sunday-clinic-content {\n    font-size: 12px !important;');
        expect(sundayClinicCss).toContain('body.mobile-app-mode #sunday-clinic-content input,');
        expect(sundayClinicCss).toContain('body.mobile-app-mode #sunday-clinic-content textarea::placeholder {\n    font-size: 12px !important;');
        expect(sundayClinicCss).toContain('body.mobile-app-mode #sunday-clinic-content .table td,\nbody.mobile-app-mode #sunday-clinic-content .table th {\n    font-size: 11px !important;');
        expect(sundayClinicCss).toContain('body.mobile-app-mode #sunday-clinic-content .billing-dense-table td,');
        expect(sundayClinicCss).toContain('body.mobile-app-mode .fa,\nbody.mobile-app-mode .fas,\nbody.mobile-app-mode .far,\nbody.mobile-app-mode .fab,');
        expect(sundayClinicCss).toContain('body.mobile-app-mode #patientSearchModal .form-control-lg {\n    font-size: 14px !important;');
        expect(sundayClinicCss).toContain('body.mobile-app-mode .clinic-header-title,\nbody.mobile-app-mode .current-patient-info .patient-name,');
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

        expect(mainJs).toContain("'klinik_privat': ['nav-klinik-private', 'nav-voting', 'nav-birth-class']");
        expect(mainJs).toContain("'ucapan_kelahiran': ['nav-birth-congrats', 'nav-birth-testimonials']");
    });

    test('staff panel embeds Sunday Clinic inside index-adminlte shell through Klinik Privat landing', () => {
        const html = readRepoFile('staff', 'public', 'index-adminlte.html');
        const mainJs = readRepoFile('staff', 'public', 'scripts', 'main.js');
        const sundayClinicEntry = readRepoFile('staff', 'public', 'scripts', 'sunday-clinic.js');
        const sundayClinicCss = readRepoFile('staff', 'public', 'styles', 'sunday-clinic.css');
        const medicalImport = readRepoFile('staff', 'public', 'scripts', 'sunday-clinic', 'utils', 'medical-import.js');
        const patientSidebar = readRepoFile('staff', 'public', 'scripts', 'sunday-clinic', 'components', 'patient-history-sidebar.js');

        expect(html).not.toContain('id="nav-sunday-clinic"');
        expect(html).not.toContain('href="/staff/public/sunday-clinic.html"');
        expect(html).toContain('id="sunday-clinic-page"');
        expect(html).toContain('id="sunday-clinic-root"');
        expect(html).toContain('id="sunday-clinic-content"');
        expect(html).toContain('class="btn btn-outline-secondary btn-sm mobile-back-btn"');
        expect(html).toContain('window.backToSundayClinicLanding && window.backToSundayClinicLanding()');
        expect(html).toContain('body.mobile-app-mode .mobile-back-btn');
        expect(html).toContain('id="import-warning-container"');
        expect(html).toContain('id="btn-import-apply-text"');
        expect(html).toContain('/staff/public/scripts/sunday-clinic/utils/planning-helpers.js?v=20260619staff1');
        expect(html).toContain('/staff/public/scripts/sunday-clinic/components/shared/payment-modal.js?v=20260619staff1');

        expect(mainJs).toContain("pages.sundayClinic = grab('sunday-clinic-page');");
        expect(mainJs).toContain("importWithVersion('./sunday-clinic.js')");
        expect(mainJs).toContain("window.showSundayClinicPage = showSundayClinicPage;");
        expect(mainJs).toContain("window.backToSundayClinicLanding = backToSundayClinicLanding;");
        expect(mainJs).toContain("if (!normalizedMrId) {\n        backToSundayClinicLanding();");
        expect(mainJs).toContain("'nav-sunday-clinic':                    () => showKlinikPrivatePage()");
        expect(mainJs).toContain("ensureSundayClinicModule().catch(error => {");
        expect(mainJs).toContain('/staff/public/index-adminlte.html?page=sunday-clinic&mr=');

        const klinikPrivate = readRepoFile('staff', 'public', 'scripts', 'klinik-private.js');
        expect(klinikPrivate).toContain("typeof window.showSundayClinicPage === 'function'");
        expect(klinikPrivate).toContain("window.history.pushState({}, '', targetUrl);");
        expect(klinikPrivate).toContain("await window.showSundayClinicPage({");

        expect(sundayClinicEntry).toContain('window.__sundayClinicEmbedded = appState.embedded;');
        expect(sundayClinicEntry).toContain('window.initSundayClinicPage = initSundayClinicPage;');
        expect(sundayClinicEntry).toContain("nextUrl.pathname = '/staff/public/index-adminlte.html';");

        expect(medicalImport).toContain('/staff/public/index-adminlte.html?page=sunday-clinic&mr=');
        expect(medicalImport).not.toContain('/staff/public/sunday-clinic.html?mr=');
        expect(patientSidebar).toContain('/staff/public/index-adminlte.html?page=sunday-clinic&mr=');
        expect(patientSidebar).not.toContain('/staff/public/sunday-clinic.html?mr=');
        expect(sundayClinicCss).toContain('body.mobile-app-mode.sunday-clinic-embedded-active #mobile-action-bar');
        expect(sundayClinicCss).toContain('position: fixed !important;');
        expect(sundayClinicCss).toContain('overflow-x: auto !important;');
        expect(sundayClinicCss).toContain('scroll-snap-type: x proximity !important;');
    });

    test('staff panel exposes Gajian payroll menu and script', () => {
        const html = readRepoFile('staff', 'public', 'index-adminlte.html');
        const mainJs = readRepoFile('staff', 'public', 'scripts', 'main.js');
        const roleVisibility = readRepoFile('staff', 'backend', 'routes', 'role-visibility.js');
        const server = readRepoFile('staff', 'backend', 'server.js');

        expect(html).toContain('id="nav-staff-payroll"');
        expect(html).toContain('showStaffPayrollPage(); return false;');
        expect(html).toContain('<p>Gajian</p>');
        expect(html).toContain('id="content-staff-payroll"');
        expect(html).toContain('./scripts/staff-payroll.js?v=v256');
        expect(html).toContain('window.showStaffPayrollPage = showStaffPayrollPage;');

        expect(mainJs).toContain("pages.staffPayroll = grab('content-staff-payroll');");
        expect(mainJs).toContain("'staff_payroll': ['nav-staff-payroll']");
        expect(mainJs).toContain("'nav-staff-payroll':                    () => showStaffPayrollPage()");

        expect(roleVisibility).toContain("{ key: 'staff_payroll', label: 'Gajian'");
        expect(server).toContain("const staffPayrollRoutes = require('./routes/staff-payroll');");
        expect(server).toContain("app.use('/api/staff-payroll', staffPayrollRoutes);");
    });

    test('Sunday Clinic patient history sidebar is hidden outside Sunday Clinic', () => {
        const html = readRepoFile('staff', 'public', 'index-adminlte.html');
        const mainJs = readRepoFile('staff', 'public', 'scripts', 'main.js');

        expect(html).toContain('.patient-history-sidebar {\n            display: none !important;');
        expect(html).toContain('body.sunday-clinic-embedded-active .patient-history-sidebar {\n            display: flex !important;');
        expect(mainJs).toContain("document.body.classList.remove('patient-sidebar-open');");
        expect(mainJs).toContain("patientSidebar.classList.remove('open');");
        expect(mainJs).toContain("patientSidebarToggle.classList.remove('active');");
    });

    test('staff mobile tap feedback uses COMM tap sound parameters', () => {
        const html = readRepoFile('staff', 'public', 'index-adminlte.html');
        const sundayClinicHtml = readRepoFile('staff', 'public', 'sunday-clinic.html');
        const tapFeedback = readRepoFile('staff', 'public', 'scripts', 'tap-feedback.js');

        expect(html).toContain('/staff/public/scripts/tap-feedback.js?v=v261');
        expect(sundayClinicHtml).toContain('/staff/public/scripts/tap-feedback.js?v=v261');
        expect(tapFeedback).toContain("osc.type = 'sine';");
        expect(tapFeedback).toContain('osc.frequency.setValueAtTime(800, ac.currentTime);');
        expect(tapFeedback).toContain('osc.frequency.exponentialRampToValueAtTime(400, ac.currentTime + 0.06);');
        expect(tapFeedback).toContain('gain.gain.setValueAtTime(0.12, ac.currentTime);');
        expect(tapFeedback).toContain('gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.06);');
        expect(tapFeedback).toContain('osc.stop(ac.currentTime + 0.06);');
        expect(tapFeedback).toContain('navigator.vibrate(10);');
    });
});

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '../../../..');
const readRepoFile = (...segments) => fs.readFileSync(path.join(repoRoot, ...segments), 'utf8');
const readNormalizedFile = (...segments) => readRepoFile(...segments).replace(/\r\n/g, '\n');

describe('staff panel stabilization sources', () => {
    test('staff assets share one current cache version source', () => {
        const html = readNormalizedFile('staff', 'public', 'index-adminlte.html');
        const sw = readNormalizedFile('staff', 'public', 'sw.js');
        const htmlVersionMatch = html.match(/window\.STAFF_CACHE_VERSION = '([^']+)'/);

        expect(htmlVersionMatch).not.toBeNull();

        const staffVersion = htmlVersionMatch[1];
        expect(html).toContain('const CACHE_VERSION = window.STAFF_CACHE_VERSION;');
        expect(html).toContain('window.__assetVersion = window.STAFF_CACHE_VERSION;');
        expect(html).toMatch(/styles\/mobile-responsive\.css\?v=[^"' ]+/);
        expect(sw).toContain(`const STAFF_PWA_VERSION = '${staffVersion}';`);
        expect(html).not.toMatch(/CACHE_VERSION\s*=\s*'v241'/);
        expect(html).not.toMatch(/__assetVersion\s*=\s*'v250'/);
    });

    test('service worker precache does not include missing chat panel css', () => {
        const sw = readNormalizedFile('staff', 'public', 'sw.js');

        expect(sw).not.toContain('/staff/public/styles/chat-slide-panel.css');
    });

    test('patient table metadata uses an ASCII-safe separator before DRD links', () => {
        const html = readNormalizedFile('staff', 'public', 'index-adminlte.html');

        expect(html).toContain('const nameMeta = patient.mr_id');
        expect(html).toContain('${patient.id} - <a href="${mrIdUrl}"');
        expect(html).toContain("visitHistoryBadge ? ` - ${visitHistoryBadge}`");
        expect(html).not.toContain('ï¿½');
        expect(html).not.toContain('�');
    });

    test('staff PWA mobile typography uses Compact 10 with explicit allowlisted exceptions', () => {
        const mobileCss = readNormalizedFile('staff', 'public', 'styles', 'mobile-responsive.css');
        const sundayClinicCss = readNormalizedFile('staff', 'public', 'styles', 'sunday-clinic.css');

        expect(mobileCss).toContain('Compact 10 text scale with component-specific icon exceptions.');
        expect(mobileCss).toContain('body.mobile-app-mode {\n        font-size: 10px !important;');
        expect(mobileCss).toContain('body.mobile-app-mode input,\n    body.mobile-app-mode textarea,\n    body.mobile-app-mode select,\n    body.mobile-app-mode .form-control,');
        expect(mobileCss).toContain('body.mobile-app-mode .table,\n    body.mobile-app-mode .table td,\n    body.mobile-app-mode .table th {\n        font-size: 9px !important;');
        expect(mobileCss).toContain('body.mobile-app-mode #mobile-action-bar button,\n    body.mobile-app-mode #mobile-action-bar button span {\n        font-size: 8px !important;');
        expect(mobileCss).toContain('body.mobile-app-mode #mobile-action-bar button .icon-wrapper,\n    body.mobile-app-mode #mobile-action-bar button .icon-wrapper i,');
        expect(mobileCss).toContain('body.mobile-app-mode .info-box-icon,\n    body.mobile-app-mode .info-box-icon i {\n        font-size: 20px !important;');
        expect(mobileCss).toContain('body.mobile-app-mode #chat-toggle-btn i,\n    body.mobile-app-mode .chat-toggle-btn i {\n        font-size: 24px !important;');
        expect(mobileCss).toContain('body.mobile-app-mode .table-action,\n    body.mobile-app-mode .table-action i {\n        font-size: 8px !important;');

        expect(sundayClinicCss).not.toMatch(/body\.mobile-app-mode\s+\*\s*\{\s*font-size:\s*9px\s*!important;/);
        expect(sundayClinicCss).not.toMatch(/#sunday-clinic-content\s+\*,\s*body\.mobile-app-mode\s+#sunday-clinic-content\s+\*::placeholder\s*\{\s*font-size:\s*inherit\s*!important;/);
        expect(sundayClinicCss).toContain('Compact 10 final pass for Sunday Clinic PWA/mobile.');
        expect(sundayClinicCss).toContain('body.mobile-app-mode #sunday-clinic-content,');
        expect(sundayClinicCss).toContain('body.mobile-app-mode .list-group-item {\n    font-size: 10px !important;');
        expect(sundayClinicCss).toContain('body.mobile-app-mode textarea#planning-rencana,');
        expect(sundayClinicCss).toContain('body.mobile-app-mode ::-webkit-input-placeholder {\n    font-size: 10px !important;');
        expect(sundayClinicCss).toContain('body.mobile-app-mode #sunday-clinic-content .table td,\nbody.mobile-app-mode #sunday-clinic-content .table th,');
        expect(sundayClinicCss).toContain('body.mobile-app-mode .identity-table .identity-value {\n    font-size: 9px !important;');
        expect(sundayClinicCss).toContain('body.mobile-app-mode #sunday-clinic-content .billing-dense-table td,');
        expect(sundayClinicCss).toContain('body.mobile-app-mode #sunday-clinic-content .table-action i {\n    font-size: 8px !important;');
        expect(sundayClinicCss).toContain('body.mobile-app-mode .fa,\nbody.mobile-app-mode .fas,\nbody.mobile-app-mode .far,\nbody.mobile-app-mode .fab,');
        expect(sundayClinicCss).toContain('body.mobile-app-mode #patientSearchModal .form-control-lg {\n    font-size: 12px !important;');
        expect(sundayClinicCss).toContain('body.mobile-app-mode .clinic-header-title,\nbody.mobile-app-mode .current-patient-info .patient-name,');
    });

    test('staff PWA mobile width normalization keeps outer pages full-width', () => {
        const mobileCss = readNormalizedFile('staff', 'public', 'styles', 'mobile-responsive.css');
        const sundayClinicCss = readNormalizedFile('staff', 'public', 'styles', 'sunday-clinic.css');

        expect(mobileCss).toContain('STAFF PWA WIDTH NORMALIZATION');
        expect(mobileCss).toContain('body.mobile-app-mode .wrapper,\n    body.mobile-app-mode #main-app,\n    body.mobile-app-mode .content-wrapper,\n    body.mobile-app-mode .content,\n    body.mobile-app-mode section.content,\n    body.mobile-app-mode .container-fluid {');
        expect(mobileCss).toContain('padding-left: 0 !important;\n        padding-right: 0 !important;');
        expect(mobileCss).toContain('body.mobile-app-mode .content-wrapper .card {\n        width: 100% !important;');

        expect(sundayClinicCss).not.toMatch(/body\.mobile-app-mode\s+\*\s*\{\s*max-width:\s*100vw\s*!important;/);
        expect(sundayClinicCss).not.toContain('body.mobile-app-mode .content-wrapper {\n    padding-left: 8px !important;\n    padding-right: 8px !important;');
        expect(sundayClinicCss).toContain('body.mobile-app-mode #sunday-clinic-page,\nbody.mobile-app-mode #sunday-clinic-content,');
        expect(sundayClinicCss).toContain('body.mobile-app-mode #sunday-clinic-page .card,\nbody.mobile-app-mode #sunday-clinic-content .card,');
        expect(sundayClinicCss).toContain('body.mobile-app-mode .content-wrapper {\n    padding-left: 0 !important;\n    padding-right: 0 !important;');
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

    test('staff panel canonicalizes Sunday Clinic to the embedded staff route', () => {
        const html = readRepoFile('staff', 'public', 'index-adminlte.html');
        const mainJs = readNormalizedFile('staff', 'public', 'scripts', 'main.js');
        const sundayClinicEntry = readNormalizedFile('staff', 'public', 'scripts', 'sunday-clinic.js');
        const sundayClinicCss = readRepoFile('staff', 'public', 'styles', 'sunday-clinic.css');
        const medicalImport = readRepoFile('staff', 'public', 'scripts', 'sunday-clinic', 'utils', 'medical-import.js');
        const patientSidebar = readRepoFile('staff', 'public', 'scripts', 'sunday-clinic', 'components', 'patient-history-sidebar.js');
        const klinikPrivate = readRepoFile('staff', 'public', 'scripts', 'klinik-private.js');

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
        expect(html).toMatch(/\/staff\/public\/scripts\/sunday-clinic\/utils\/planning-helpers\.js\?v=[^"' ]+/);
        expect(html).toMatch(/\/staff\/public\/scripts\/sunday-clinic\/components\/shared\/payment-modal\.js\?v=[^"' ]+/);

        expect(mainJs).toContain("pages.sundayClinic = grab('sunday-clinic-page');");
        expect(mainJs).toContain("importWithVersion('./sunday-clinic.js')");
        expect(mainJs).toContain("window.showSundayClinicPage = showSundayClinicPage;");
        expect(mainJs).toContain("window.backToSundayClinicLanding = backToSundayClinicLanding;");
        expect(mainJs).toContain("window.buildSundayClinicAppUrl = buildSundayClinicAppUrl;");
        expect(mainJs).toContain("if (!normalizedMrId) {\n        backToSundayClinicLanding();");
        expect(mainJs).toContain("'nav-sunday-clinic':                    () => showKlinikPrivatePage()");
        expect(mainJs).toContain("ensureSundayClinicModule().catch(error => {");
        expect(mainJs).toContain('/staff/public/index-adminlte.html?page=sunday-clinic&mr=');
        expect(mainJs).not.toContain('/staff/public/sunday-clinic.html?mr=');

        expect(klinikPrivate).toContain("typeof window.showSundayClinicPage === 'function'");
        expect(klinikPrivate).toContain("window.history.pushState({}, '', targetUrl);");
        expect(klinikPrivate).toContain("await window.showSundayClinicPage({");

        expect(sundayClinicEntry).toContain('window.__sundayClinicEmbedded = appState.embedded;');
        expect(sundayClinicEntry).toContain('appState.embedded = true;');
        expect(sundayClinicEntry).toContain('window.initSundayClinicPage = initSundayClinicPage;');
        expect(sundayClinicEntry).toContain("nextUrl.pathname = '/staff/public/index-adminlte.html';");
        expect(sundayClinicEntry).not.toContain('/staff/public/sunday-clinic.html');
        expect(sundayClinicEntry).not.toContain("else if (!document.getElementById('sunday-clinic-page')) {");

        expect(medicalImport).toContain('/staff/public/index-adminlte.html?page=sunday-clinic&mr=');
        expect(medicalImport).not.toContain('/staff/public/sunday-clinic.html?mr=');
        expect(patientSidebar).toContain('/staff/public/index-adminlte.html?page=sunday-clinic&mr=');
        expect(patientSidebar).not.toContain('/staff/public/sunday-clinic.html?mr=');
        expect(sundayClinicCss).toContain('body.mobile-app-mode.sunday-clinic-embedded-active #mobile-action-bar');
        expect(sundayClinicCss).toContain('position: fixed !important;');
        expect(sundayClinicCss).toContain('overflow-x: auto !important;');
        expect(sundayClinicCss).toContain('scroll-snap-type: x proximity !important;');
    });

    test('standalone Sunday Clinic page is redirect-only compatibility shell', () => {
        const standaloneHtml = readRepoFile('staff', 'public', 'sunday-clinic.html');

        expect(standaloneHtml).toContain('window.location.replace');
        expect(standaloneHtml).toContain('/staff/public/index-adminlte.html');
        expect(standaloneHtml).not.toContain('adminlte.min.css');
        expect(standaloneHtml).not.toContain('id="sunday-clinic-content"');
        expect(standaloneHtml).not.toContain('/staff/public/scripts/sunday-clinic.js');
    });

    test('server redirects legacy Sunday Clinic URLs instead of serving a standalone app shell', () => {
        const server = readRepoFile('staff', 'backend', 'server.js');

        expect(server).toContain('function buildEmbeddedSundayClinicUrl(req)');
        expect(server).toContain("app.get('/staff/public/sunday-clinic.html', (req, res) => {");
        expect(server).toContain('res.redirect(307, buildEmbeddedSundayClinicUrl(req));');
        expect(server).toContain("app.get(/^\\/sunday-clinic\\/[\\w-]+(?:\\/.*)?$/, (req, res) => {");
        expect(server).not.toContain('res.sendFile(sundayClinicPagePath);');
    });

    test('Klinik Privat embedded mobile polish stays scoped to Staff PWA mode', () => {
        const sundayClinicCss = readNormalizedFile('staff', 'public', 'styles', 'sunday-clinic.css');
        const html = readNormalizedFile('staff', 'public', 'index-adminlte.html');
        const sw = readNormalizedFile('staff', 'public', 'sw.js');
        const htmlVersionMatch = html.match(/window\.STAFF_CACHE_VERSION = '([^']+)'/);

        expect(htmlVersionMatch).not.toBeNull();

        expect(sundayClinicCss).toContain('Klinik Privat mobile embedded polish.');
        expect(sundayClinicCss).toContain('body.mobile-app-mode.sunday-clinic-embedded-active #sunday-clinic-page > .card:first-child > .card-header');
        expect(sundayClinicCss).toContain('body.mobile-app-mode.sunday-clinic-embedded-active #staff-name-display');
        expect(sundayClinicCss).toContain('body.mobile-app-mode.sunday-clinic-embedded-active .sc-staff-section-nav .nav-item');
        expect(sundayClinicCss).toContain('body.mobile-app-mode.sunday-clinic-embedded-active #sunday-clinic-content textarea.form-control');
        expect(sundayClinicCss).toContain('body.mobile-app-mode.sunday-clinic-embedded-active #save-pemeriksaan-obstetri');
        expect(sundayClinicCss).toContain('body.mobile-app-mode.sunday-clinic-embedded-active button[onclick*="openBulkImportModal"]');
        expect(sw).toContain(`const STAFF_PWA_VERSION = '${htmlVersionMatch[1]}';`);
    });

    test('staff shell owns hospital exam launcher without inline duplicate Sunday Clinic implementation', () => {
        const html = readRepoFile('staff', 'public', 'index-adminlte.html');
        const mainJs = readRepoFile('staff', 'public', 'scripts', 'main.js');

        expect(html).not.toContain('window.startHospitalExam = async function');
        expect(mainJs).toContain('function startHospitalExam(appointmentId, patientId, patientName) {');
        expect(mainJs).toContain('window.startHospitalExam = startHospitalExam;');
    });

    test('Klinik Privat tablet browser top-gap fix stays scoped to active page', () => {
        const html = readRepoFile('staff', 'public', 'index-adminlte.html').replace(/\r\n/g, '\n');
        const mainJs = readRepoFile('staff', 'public', 'scripts', 'main.js').replace(/\r\n/g, '\n');

        expect(mainJs).toContain("document.body.classList.remove('klinik-private-active');");
        expect(mainJs).toContain("document.body.classList.add('klinik-private-active');\n    pages.klinikPrivate?.classList.remove('d-none');");

        expect(html).toContain('@media (min-width: 992px) and (max-width: 1366px) and (hover: none),');
        expect(html).toContain('(min-width: 992px) and (max-width: 1366px) and (pointer: coarse)');
        expect(html).toContain('body.klinik-private-active .wrapper,\n            body.klinik-private-active .main-header,\n            body.klinik-private-active .main-sidebar,\n            body.klinik-private-active .content-wrapper,');
        expect(html).toContain('body.klinik-private-active section.content,\n            body.klinik-private-active .container-fluid,\n            body.klinik-private-active #klinik-private-page');
        expect(html).toContain('margin-top: 0 !important;\n                padding-top: 0 !important;\n                top: 0 !important;');
    });

    test('browser zoom 80 applies only to desktop fine-pointer staff shell browsers', () => {
        const html = readRepoFile('staff', 'public', 'index-adminlte.html').replace(/\r\n/g, '\n');

        expect(html).toContain('tablet touch browsers must stay true 100%.');
        expect(html).toContain("const isDesktopFinePointer = window.matchMedia\n                ? window.matchMedia('(hover: hover) and (pointer: fine)').matches");
        expect(html).toContain("!/(Mobi|Android|iPad|iPhone|iPod)/i.test(navigator.userAgent);");
        expect(html).toContain('} else if (isDesktopFinePointer) {\n                applyBrowserZoomClass();\n            }');
    });

    test('staff queue and doctor arrival toggles use concise clinic labels', () => {
        const html = readRepoFile('staff', 'public', 'index-adminlte.html').replace(/\r\n/g, '\n');

        expect(html).toContain('<span id="lbl-doctor-toggle">Belum dimulai</span>');
        expect(html).toContain("if (lbl) lbl.textContent = 'Antrian';");
        expect(html).toContain("if (lbl) lbl.textContent = 'Dokter hadir';");
        expect(html).toContain("if (lbl) lbl.textContent = 'Belum dimulai';");
        expect(html).toContain("isArrived ? 'Status: Dokter hadir' : 'Status: Belum dimulai'");
        expect(html).not.toContain('Antrian: ON');
        expect(html).not.toContain('Antrian: OFF');
        expect(html).not.toContain('dr. Dibya datang');
        expect(html).not.toContain('dr. Dibya belum datang');
    });

    test('Kantor Saya sidebar menu uses concise title', () => {
        const html = readRepoFile('staff', 'public', 'index-adminlte.html');

        expect(html).toContain('<p>Kantor Saya</p>');
        expect(html).not.toContain('Kantor Saya / Workspace');
        expect(html).not.toContain('Kantor Saya / Workdesk');
    });

    test('staff navbar notification bell stays hidden', () => {
        const html = readRepoFile('staff', 'public', 'index-adminlte.html').replace(/\r\n/g, '\n');

        expect(html).toContain('#notification-dropdown {\n            display: none !important;\n        }');
        expect(html).toContain('id="notification-dropdown"');
        expect(html).toContain('class="far fa-bell"');
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

    test('staff panel exposes Briefing menu and script', () => {
        const html = readRepoFile('staff', 'public', 'index-adminlte.html');
        const mainJs = readRepoFile('staff', 'public', 'scripts', 'main.js');
        const staffBriefingJs = readRepoFile('staff', 'public', 'scripts', 'staff-briefing.js');
        const staffBriefingRoute = readRepoFile('staff', 'backend', 'routes', 'staff-briefing.js');
        const roleVisibility = readRepoFile('staff', 'backend', 'routes', 'role-visibility.js');
        const server = readRepoFile('staff', 'backend', 'server.js');

        expect(html).toContain('id="nav-staff-briefing"');
        expect(html).toContain('showStaffBriefingPage(); return false;');
        expect(html).toContain('<p>Briefing</p>');
        expect(html).toContain('id="content-staff-briefing"');
        expect(html).toContain('./scripts/staff-briefing.js?v=20260531a');
        expect(html).toContain('window.showStaffBriefingPage = showStaffBriefingPage;');

        expect(mainJs).toContain("pages.staffBriefing = grab('content-staff-briefing');");
        expect(mainJs).toContain("'staff_briefing': ['nav-staff-briefing']");
        expect(mainJs).toContain("'nav-staff-briefing':                   () => showStaffBriefingPage()");

        expect(staffBriefingJs).toContain("if (d.can_start !== true) {");
        expect(staffBriefingJs).toContain("btn.innerHTML = '<i class=\"fas fa-lock mr-1\"></i> Hanya dokter';");
        expect(staffBriefingJs).toContain("alert('Hanya dokter yang dapat memulai briefing.');");
        expect(staffBriefingRoute).toContain('can_start: canStartBriefing(req.user)');
        expect(staffBriefingRoute).toContain("router.post('/today/start', verifyToken, verifyStaffToken, requireSuperadmin");

        expect(roleVisibility).toContain("{ key: 'staff_briefing', label: 'Briefing Poli Minggu'");
        expect(server).toContain("const staffBriefingRoutes = require('./routes/staff-briefing');");
        expect(server).toContain("app.use('/api/staff-briefing', staffBriefingRoutes);");
    });

    test('staff points include one point per duty day', () => {
        const route = readRepoFile('staff', 'backend', 'routes', 'staff-points.js');
        const script = readRepoFile('staff', 'public', 'scripts', 'staff-points.js');
        const html = readRepoFile('staff', 'public', 'index-adminlte.html');

        expect(route).toContain('Formula v2: total_points = SUM(rating) + duty days');
        expect(route).toContain('const ratingPoints = rating ? Number(rating.total_points) : 0;');
        expect(route).toContain('const dutyCount = Number(dutyMap.get(sid) || 0);');
        expect(route).toContain('total_points: ratingPoints + dutyCount');
        expect(route).toContain('duty_points: dutyCount');

        expect(html).toContain('<th class="text-right">Point Bertugas</th>');
        expect(script).toContain("'<td class=\"text-right\">' + fmtNum(r.duty_points || r.duty_count) + '</td>'");
        expect(script).toContain("colspan=\"8\"");
    });

    test('Sunday Clinic patient history sidebar is hidden outside Sunday Clinic', () => {
        const html = readNormalizedFile('staff', 'public', 'index-adminlte.html');
        const mainJs = readRepoFile('staff', 'public', 'scripts', 'main.js');

        expect(html).toMatch(/\.patient-history-sidebar\s*\{\s*display:\s*none\s*!important;/);
        expect(html).toMatch(/body\.sunday-clinic-embedded-active\s+\.patient-history-sidebar\s*\{\s*display:\s*flex\s*!important;/);
        expect(mainJs).toContain("document.body.classList.remove('patient-sidebar-open');");
        expect(mainJs).toContain("patientSidebar.classList.remove('open');");
        expect(mainJs).toContain("patientSidebarToggle.classList.remove('active');");
    });

    test('staff mobile tap feedback uses COMM tap sound parameters', () => {
        const html = readRepoFile('staff', 'public', 'index-adminlte.html');
        const tapFeedback = readRepoFile('staff', 'public', 'scripts', 'tap-feedback.js');

        expect(html).toContain('/staff/public/scripts/tap-feedback.js?v=v266');
        expect(tapFeedback).toContain("osc.type = 'sine';");
        expect(tapFeedback).toContain('osc.frequency.setValueAtTime(800, ac.currentTime);');
        expect(tapFeedback).toContain('osc.frequency.exponentialRampToValueAtTime(400, ac.currentTime + 0.06);');
        expect(tapFeedback).toContain('gain.gain.setValueAtTime(0.12, ac.currentTime);');
        expect(tapFeedback).toContain('gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.06);');
        expect(tapFeedback).toContain('osc.stop(ac.currentTime + 0.06);');
        expect(tapFeedback).toContain('navigator.vibrate(10);');
    });
});

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

    test('Kelola Pasien inline route preserves reload state and releases Kantor Saya scroll lock', () => {
        const html = readNormalizedFile('staff', 'public', 'index-adminlte.html');
        const mainJs = readNormalizedFile('staff', 'public', 'scripts', 'main.js');

        expect(html).toContain('data-shell-action="show-manage-patients"');
        expect(html).toContain('window.showManagePatientsPage = async function()');
        expect(html).toContain("sessionStorage.setItem('lastStaffNavId', 'nav-kelola-pasien');");
        expect(html).toContain("document.documentElement.classList.remove('kantor-saya-active');");
        expect(html).toContain("document.body.classList.remove('kantor-saya-active');");
        expect(html).toContain("document.documentElement.style.overflowY = 'auto';");
        expect(html).toContain("document.body.style.overflowY = 'auto';");
        expect(mainJs).toContain("'nav-kelola-pasien':");
        expect(mainJs).toContain("() => showKelolaPasienPage()");
    });

    test('dashboard daily greeting uses safe display names instead of email identities', () => {
        const mainJs = readNormalizedFile('staff', 'public', 'scripts', 'main.js');
        const aiRoute = readNormalizedFile('staff', 'backend', 'routes', 'ai.js');

        expect(mainJs).toContain('function resolveDashboardDisplayName(user)');
        expect(mainJs).toContain('function greetingContainsIdentityLeak(greeting, rejectedValues = [])');
        expect(mainJs).toContain('const rejectedIdentityTokens = [user?.email, window.currentUserName].filter(isEmailLike);');
        expect(mainJs).toContain('const params = new URLSearchParams({ displayName: safeDisplayName });');
        expect(mainJs).toContain('updateDailyGreeting(user);');
        expect(mainJs).not.toContain('updateDailyGreeting(user.id);');

        expect(aiRoute).toContain('function sanitizeDisplayName(value)');
        expect(aiRoute).toContain('const userName = sanitizeDisplayName(req.query.displayName)');
        expect(aiRoute).not.toContain('const userName = req.user.name || req.user.email;');
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

    test('Sunday Clinic PWA overrides the compact staff shell with balanced clinical typography', () => {
        const mobileCss = readNormalizedFile('staff', 'public', 'styles', 'mobile-responsive.css');
        const sundayClinicCss = readNormalizedFile('staff', 'public', 'styles', 'sunday-clinic-pwa.css');

        expect(mobileCss).toContain('Compact 10 text scale with component-specific icon exceptions.');
        expect(mobileCss).toContain('body.mobile-app-mode {\n        font-size: 10px !important;');
        expect(mobileCss).toContain('body.mobile-app-mode input,\n    body.mobile-app-mode textarea,\n    body.mobile-app-mode select,\n    body.mobile-app-mode .form-control,');
        expect(mobileCss).toContain('body.mobile-app-mode .table,\n    body.mobile-app-mode .table td,\n    body.mobile-app-mode .table th {\n        font-size: 9px !important;');
        expect(mobileCss).toContain('body.mobile-app-mode #mobile-action-bar button,\n    body.mobile-app-mode #mobile-action-bar button span {\n        font-size: 8px !important;');
        expect(mobileCss).toContain('body.mobile-app-mode #mobile-action-bar button .icon-wrapper,\n    body.mobile-app-mode #mobile-action-bar button .icon-wrapper i,');
        expect(mobileCss).toContain('body.mobile-app-mode .info-box-icon,\n    body.mobile-app-mode .info-box-icon i {\n        font-size: 20px !important;');
        expect(mobileCss).toContain('body.mobile-app-mode #chat-toggle-btn i,\n    body.mobile-app-mode .chat-toggle-btn i {\n        font-size: 24px !important;');
        expect(mobileCss).toContain('body.mobile-app-mode .table-action,\n    body.mobile-app-mode .table-action i {\n        font-size: 8px !important;');

        expect(sundayClinicCss).not.toContain('Compact 10 final pass for Sunday Clinic PWA/mobile.');
        expect(sundayClinicCss).toContain('--sc-pwa-font-body: 13px;');
        expect(sundayClinicCss).toContain('--sc-pwa-font-control: 16px;');
        expect(sundayClinicCss).toContain('--sc-pwa-font-button: 13px;');
        expect(sundayClinicCss).toContain('--sc-pwa-touch-target: 44px;');
        expect(sundayClinicCss).toContain('body.mobile-app-mode.sunday-clinic-embedded-active');
    });

    test('staff PWA mobile width normalization keeps outer pages full-width', () => {
        const mobileCss = readNormalizedFile('staff', 'public', 'styles', 'mobile-responsive.css');
        const sundayClinicCss = readNormalizedFile('staff', 'public', 'styles', 'sunday-clinic-pwa.css');

        expect(mobileCss).toContain('STAFF PWA WIDTH NORMALIZATION');
        expect(mobileCss).toContain('body.mobile-app-mode .wrapper,\n    body.mobile-app-mode #main-app,\n    body.mobile-app-mode .content-wrapper,\n    body.mobile-app-mode .content,\n    body.mobile-app-mode section.content,\n    body.mobile-app-mode .container-fluid {');
        expect(mobileCss).toContain('padding-left: 0 !important;\n        padding-right: 0 !important;');
        expect(mobileCss).toContain('body.mobile-app-mode .content-wrapper .card {\n        width: 100% !important;');

        expect(sundayClinicCss).not.toMatch(/body\.mobile-app-mode\s+\*\s*\{\s*max-width:\s*100vw\s*!important;/);
        expect(sundayClinicCss).not.toContain('body.mobile-app-mode .content-wrapper {\n    padding-left: 8px !important;\n    padding-right: 8px !important;');
        expect(sundayClinicCss).toContain('body.mobile-app-mode.sunday-clinic-embedded-active #sunday-clinic-page,');
        expect(sundayClinicCss).toContain('body.mobile-app-mode.sunday-clinic-embedded-active #sunday-clinic-page .card,');
        expect(sundayClinicCss).toContain('body.mobile-app-mode.sunday-clinic-embedded-active .content-wrapper {');
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
        const sundayClinicFragment = readRepoFile('staff', 'public', 'fragments', 'pages', 'sunday-clinic-page.html');
        const featureLoader = readRepoFile('staff', 'public', 'scripts', 'shell', 'feature-loader.js');
        const mainJs = readNormalizedFile('staff', 'public', 'scripts', 'main.js');
        const sundayClinicEntry = readNormalizedFile('staff', 'public', 'scripts', 'sunday-clinic.js');
        const sundayClinicCss = readRepoFile('staff', 'public', 'styles', 'sunday-clinic-pwa.css');
        const medicalImport = readRepoFile('staff', 'public', 'scripts', 'sunday-clinic', 'utils', 'medical-import.js');
        const patientSidebar = readRepoFile('staff', 'public', 'scripts', 'sunday-clinic', 'components', 'patient-history-sidebar.js');
        const klinikPrivate = readRepoFile('staff', 'public', 'scripts', 'klinik-private.js');

        expect(html).not.toContain('id="nav-sunday-clinic"');
        expect(html).not.toContain('href="/staff/public/sunday-clinic.html"');
        expect(html).toContain('id="sunday-clinic-page"');
        expect(sundayClinicFragment).toContain('id="sunday-clinic-root"');
        expect(sundayClinicFragment).toContain('id="sunday-clinic-content"');
        expect(sundayClinicFragment).toContain('class="btn btn-outline-secondary btn-sm mobile-back-btn"');
        expect(sundayClinicFragment).toContain('window.backToSundayClinicLanding && window.backToSundayClinicLanding()');
        expect(html).toContain('id="import-warning-container"');
        expect(html).toContain('id="btn-import-apply-text"');
        expect(featureLoader).toContain("loadScript('/staff/public/scripts/sunday-clinic/utils/planning-helpers.js')");
        expect(featureLoader).toContain("loadScript('/staff/public/scripts/sunday-clinic/components/shared/payment-modal.js')");

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

    test('Sunday Clinic queue sidebar escapes appointment metadata before innerHTML rendering', () => {
        const patientSidebar = readRepoFile('staff', 'public', 'scripts', 'sunday-clinic', 'components', 'patient-history-sidebar.js');

        expect(patientSidebar).toContain('const safeSlotLabel = this.escapeHtml(slotLabel);');
        expect(patientSidebar).toContain('const safeChiefComplaint = this.escapeHtml(chiefComplaint);');
        expect(patientSidebar).toContain('<div class="queue-meta">${safeSlotLabel} • ${safeChiefComplaint}</div>');
        expect(patientSidebar).not.toContain('<div class="queue-meta">${apt.slot_time || apt.session_label} • ${chiefComplaint}</div>');
    });

    test('standalone Sunday Clinic page is redirect-only compatibility shell', () => {
        const standaloneHtml = readRepoFile('staff', 'public', 'sunday-clinic.html');

        expect(standaloneHtml).toContain('window.location.replace');
        expect(standaloneHtml).toContain('/staff/public/index-adminlte.html');
        expect(standaloneHtml).not.toContain('adminlte.min.css');
        expect(standaloneHtml).not.toContain('id="sunday-clinic-content"');
        expect(standaloneHtml).not.toContain('/staff/public/scripts/sunday-clinic.js');
    });

    test('Sunday Clinic Periksa Pasien button recovers from stalled queue-status requests', () => {
        const sundayClinicMain = readNormalizedFile('staff', 'public', 'scripts', 'sunday-clinic', 'main.js');

        expect(sundayClinicMain).toContain('const QUEUE_STATUS_TIMEOUT_MS = 12000;');
        expect(sundayClinicMain).toContain('function resetStartExaminationButton(btn)');
        expect(sundayClinicMain).toContain('let timeoutId = null;');
        expect(sundayClinicMain).toContain("if (typeof AbortController !== 'undefined') {");
        expect(sundayClinicMain).toContain('controller = new AbortController();');
        expect(sundayClinicMain).toContain('requestOptions.signal = controller.signal;');
        expect(sundayClinicMain).toContain('const timeoutPromise = new Promise((_, reject) => {');
        expect(sundayClinicMain).toContain('if (controller) controller.abort();');
        expect(sundayClinicMain).toContain('error.name = \'TimeoutError\';');
        expect(sundayClinicMain).toContain('const res = await Promise.race([');
        expect(sundayClinicMain).toContain('clearTimeout(timeoutId);');
        expect(sundayClinicMain).toContain('resetStartExaminationButton(btn);');
        expect(sundayClinicMain).not.toContain('const controller = new AbortController();');
    });

    test('Sunday Clinic queue patient switches reset stale Periksa Pasien button state', () => {
        const sundayClinicMain = readNormalizedFile('staff', 'public', 'scripts', 'sunday-clinic', 'main.js');

        expect(sundayClinicMain).toContain('this.resetExaminationActionState();');
        expect(sundayClinicMain).toContain('resetExaminationActionState()');
        expect(sundayClinicMain).toContain("bar.style.display = 'none';");
        expect(sundayClinicMain).toContain('if (canStart) {');
        expect(sundayClinicMain).toContain('resetStartExaminationButton(btn);');
        expect(sundayClinicMain).toContain("btn.style.display = '';");
        expect(sundayClinicMain).toContain("btn.style.display = 'none';");
    });

    test('Sunday Clinic record API includes live examination state', () => {
        const sharedService = readNormalizedFile('staff', 'backend', 'services', 'sunday-clinic', 'shared.js');

        expect(sharedService).toContain('queue_status: row.queue_status');
        expect(sharedService).toContain('exam_started_at: row.exam_started_at');
    });

    test('Sunday Clinic billing confirmation refreshes the active billing view for every role', () => {
        const sundayClinicMain = readNormalizedFile('staff', 'public', 'scripts', 'sunday-clinic', 'main.js');

        expect(sundayClinicMain).toContain('const handleBillingUpdated = (data) => {');
        expect(sundayClinicMain).toContain('handleBillingUpdated(data);');
        expect(sundayClinicMain).toContain('stateManager.getState().activeSection !== SECTIONS.BILLING');
        expect(sundayClinicMain).toContain('this.render(SECTIONS.BILLING)');
    });

    test('Sunday Clinic shared prescription templates expose CRUD API and staff UI controls', () => {
        const sundayClinicRoute = readNormalizedFile('staff', 'backend', 'routes', 'sunday-clinic', 'prescription.js');
        const sundayClinicService = readNormalizedFile('staff', 'backend', 'services', 'sunday-clinic', 'prescription.js');
        const planningHelpers = readNormalizedFile('staff', 'public', 'scripts', 'sunday-clinic', 'utils', 'planning-helpers.js');
        const planComponent = readNormalizedFile('staff', 'public', 'scripts', 'sunday-clinic', 'components', 'shared', 'plan.js');
        const staffHtml = readNormalizedFile('staff', 'public', 'index-adminlte.html');
        const migration = readNormalizedFile('staff', 'backend', 'migrations', '20260719_staff_wave4_sunday_clinic_schema.sql');

        expect(migration).toContain('CREATE TABLE IF NOT EXISTS sunday_clinic_prescription_templates');
        expect(migration).toContain('items JSON NOT NULL');
        expect(sundayClinicService).not.toContain('CREATE TABLE IF NOT EXISTS sunday_clinic_prescription_templates');
        expect(sundayClinicRoute).toContain("router.get('/prescription-templates', verifyToken");
        expect(sundayClinicRoute).toContain("router.post('/prescription-templates', verifyToken");
        expect(sundayClinicRoute).toContain("router.put('/prescription-templates/:id', verifyToken");
        expect(sundayClinicRoute).toContain("router.delete('/prescription-templates/:id', verifyToken");
        expect(sundayClinicService).toContain('normalizePrescriptionTemplateItems');
        expect(sundayClinicService).toContain('is_active = 0');

        expect(planComponent).toContain('window.openPrescriptionTemplateModal');
        expect(planComponent).toContain('Template Obat');
        expect(staffHtml).toContain('id="prescription-template-modal"');
        expect(staffHtml).toContain('id="prescription-template-list"');
        expect(staffHtml).toContain('Simpan Template');

        expect(planningHelpers).toContain('async function openPrescriptionTemplateModal()');
        expect(planningHelpers).toContain('async function saveCurrentPrescriptionAsTemplate()');
        expect(planningHelpers).toContain('async function applyPrescriptionTemplate(templateId)');
        expect(planningHelpers).toContain('function editPrescriptionTemplate(templateId)');
        expect(planningHelpers).toContain('async function deletePrescriptionTemplate(templateId)');
        expect(planningHelpers).toContain('/api/sunday-clinic/prescription-templates');
        expect(planningHelpers).toContain('saveStructuredTerapi(template.items)');
        expect(planningHelpers).toContain('window.openPrescriptionTemplateModal = openPrescriptionTemplateModal;');
    });

    test('server redirects legacy Sunday Clinic URLs instead of serving a standalone app shell', () => {
        const server = readRepoFile('staff', 'backend', 'server.js');

        expect(server).toContain('function buildEmbeddedSundayClinicUrl(req)');
        expect(server).toContain("app.get('/staff/public/sunday-clinic.html', (req, res) => {");
        expect(server).toContain('res.redirect(307, buildEmbeddedSundayClinicUrl(req));');
        expect(server).toContain("app.get(/^\\/sunday-clinic\\/[\\w-]+(?:\\/.*)?$/, (req, res) => {");
        expect(server).not.toContain('res.sendFile(sundayClinicPagePath);');
    });

    test('observability routes are mounted before global not-found handler', () => {
        const server = readNormalizedFile('staff', 'backend', 'server.js');
        const systemRoutes = readNormalizedFile('staff', 'backend', 'routes', 'system.js');

        const notFoundIndex = server.indexOf('app.use(notFoundHandler);');
        const pdfQueueIndex = server.indexOf("app.use('/api/pdf/queue', pdfQueueRoutes);");
        const sloIndex = server.indexOf("app.use('/api/slo', sloRoutes);");
        const systemRoutesIndex = server.indexOf('app.use(createSystemRoutes({');

        expect(notFoundIndex).toBeGreaterThan(-1);
        expect(pdfQueueIndex).toBeGreaterThan(-1);
        expect(sloIndex).toBeGreaterThan(-1);
        expect(systemRoutesIndex).toBeGreaterThan(-1);
        expect(systemRoutes).toContain("router.post('/api/metrics/reset', verifyToken, requireSuperadmin");
        expect(systemRoutes).toContain("router.get('/api/metrics'");
        expect(systemRoutes).toContain("router.get('/api/health'");
        expect(pdfQueueIndex).toBeLessThan(notFoundIndex);
        expect(sloIndex).toBeLessThan(notFoundIndex);
        expect(systemRoutesIndex).toBeLessThan(notFoundIndex);
    });

    test('public healthcheck remains minimal while detailed pool signals stay protected in metrics', () => {
        const systemRoutes = readNormalizedFile('staff', 'backend', 'routes', 'system.js');

        expect(systemRoutes).toContain("router.get('/api/metrics', verifyToken, requireSuperadmin");
        expect(systemRoutes).toContain('metrics.db = getDbStats();');
        expect(systemRoutes).not.toContain('activeConnectionCount:');
        expect(systemRoutes).not.toContain('longHeldConnectionCount:');
        expect(systemRoutes).not.toContain('system: metrics.system');
    });

    test('notifications route is mounted once to avoid duplicate route handling', () => {
        const server = readNormalizedFile('staff', 'backend', 'server.js');
        const notificationMounts = server.match(/^app\.use\('\/api\/notifications',\s*\w+\);/gm) || [];

        expect(notificationMounts).toEqual(["app.use('/api/notifications', notificationRoutes);"]);
    });

    test('database pool wait queue is bounded by environment configuration', () => {
        const db = readNormalizedFile('staff', 'backend', 'db.js');

        expect(db).toContain('const dbQueueLimit =');
        expect(db).toContain('process.env.DB_QUEUE_LIMIT');
        expect(db).toContain('queueLimit: dbQueueLimit');
        expect(db).not.toContain('queueLimit: 0');
    });

    test('Sunday Clinic route delegates reusable pure helpers to a service module', () => {
        const route = readNormalizedFile('staff', 'backend', 'services', 'sunday-clinic', 'shared.js');
        const helpers = readNormalizedFile('staff', 'backend', 'services', 'SundayClinicRouteHelpers.js');

        expect(route).toContain("require('../SundayClinicRouteHelpers')");
        expect(route).not.toContain('function normalizeMrId(value)');
        expect(route).not.toContain('function convertLooseDateToIso(dateStr)');
        expect(route).not.toContain('function buildMedifyIdentityPrefill(identity)');
        expect(route).not.toContain('function normalizePhone(phone)');
        expect(helpers).toContain('function normalizeMrId(value)');
        expect(helpers).toContain('function buildMedifyIdentityPrefill(identity)');
        expect(helpers).toContain('module.exports = {');
    });

    test('medical file upload routes require authentication for mutating actions', () => {
        const labResults = readNormalizedFile('staff', 'backend', 'routes', 'lab-results.js');
        const usgPhotos = readNormalizedFile('staff', 'backend', 'routes', 'usg-photos.js');

        expect(labResults).toContain("const { verifyToken } = require('../middleware/auth');");
        expect(labResults).toContain("router.post('/upload', verifyToken, upload.array('files', 10)");
        expect(labResults).toContain("router.post('/interpret', verifyToken");
        expect(labResults).toContain("router.delete('/:key(*)', verifyToken");

        expect(usgPhotos).toContain("const { verifyToken } = require('../middleware/auth');");
        expect(usgPhotos).toContain("router.post('/upload', verifyToken, upload.array('files', 20)");
        expect(usgPhotos).toContain("router.delete('/:key(*)', verifyToken");
    });

    test('public medical exam bundle does not expose provider API keys', () => {
        const medicalExam = readNormalizedFile('staff', 'public', 'scripts', 'medical-exam.js');

        expect(medicalExam).not.toMatch(/sk-proj-/);
        expect(medicalExam).not.toMatch(/AIzaSy/);
        expect(medicalExam).toContain('Analisis AI langsung dari browser dinonaktifkan');
    });

    test('gallery memory page uses the current patient profile contract', () => {
        const gallery = readNormalizedFile('public', 'gallery-kenangan.html');

        expect(gallery).toContain('/api/patients/profile?_t=');
        expect(gallery).toContain('getPatientProfileFromResponse');
        expect(gallery).not.toContain('/api/patients-auth/me');
    });

    test('Klinik Privat embedded mobile polish stays scoped to Staff PWA mode', () => {
        const sundayClinicCss = readNormalizedFile('staff', 'public', 'styles', 'sunday-clinic-pwa.css');
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
        const shellCss = readRepoFile('staff', 'public', 'styles', 'staff-shell.css').replace(/\r\n/g, '\n');
        const mainJs = readRepoFile('staff', 'public', 'scripts', 'main.js').replace(/\r\n/g, '\n');

        expect(mainJs).toContain("document.body.classList.remove('klinik-private-active');");
        expect(mainJs).toContain("document.body.classList.add('klinik-private-active');\n    pages.klinikPrivate?.classList.remove('d-none');");

        expect(shellCss).toContain('@media (min-width: 992px) and (max-width: 1366px) and (hover: none),');
        expect(shellCss).toContain('(min-width: 992px) and (max-width: 1366px) and (pointer: coarse)');
        expect(shellCss).toContain('body.klinik-private-active .wrapper,\n            body.klinik-private-active .main-header,\n            body.klinik-private-active .main-sidebar,\n            body.klinik-private-active .content-wrapper,');
        expect(shellCss).toContain('body.klinik-private-active section.content,\n            body.klinik-private-active .container-fluid,\n            body.klinik-private-active #klinik-private-page');
        expect(shellCss).toContain('margin-top: 0 !important;\n                padding-top: 0 !important;\n                top: 0 !important;');
    });

    test('browser zoom 80 applies only to desktop fine-pointer staff shell browsers', () => {
        const html = readRepoFile('staff', 'public', 'index-adminlte.html').replace(/\r\n/g, '\n');
        const shellCss = readRepoFile('staff', 'public', 'styles', 'staff-shell.css').replace(/\r\n/g, '\n');

        expect(shellCss).toContain('tablet touch browsers must stay true 100%.');
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

    test('staff panel exposes dedicated Antrian Online page under Klinik', () => {
        const html = readRepoFile('staff', 'public', 'index-adminlte.html');
        const mainJs = readRepoFile('staff', 'public', 'scripts', 'main.js');
        const shellActions = readRepoFile('staff', 'public', 'scripts', 'shell', 'actions.js');

        expect(html.indexOf('<li class="nav-header">KLINIK</li>')).toBeLessThan(html.indexOf('id="nav-antrian-online"'));
        expect(html.indexOf('id="nav-antrian-online"')).toBeLessThan(html.indexOf('<!-- PASIEN -->'));
        expect(html).toContain('data-shell-action="show-antrian-online"');
        expect(html).toContain('<p>Antrian Online</p>');
        expect(html).toContain('id="antrian-online-page"');
        expect(html).toContain('id="antrian-online-root"');

        expect(mainJs).toContain("pages.antrianOnline = grab('antrian-online-page');");
        expect(mainJs).toContain("'nav-antrian-online':");
        expect(mainJs).toContain('function showAntrianOnlinePage()');
        expect(mainJs).toContain("importWithVersion('./antrian-online.js')");
        expect(mainJs).toContain('window.showAntrianOnlinePage = showAntrianOnlinePage;');

        expect(shellActions).toContain("'show-antrian-online': function()");
        expect(shellActions).toContain("callGlobal('showAntrianOnlinePage')");
    });

    test('Kantor Saya sidebar menu uses concise title', () => {
        const html = readRepoFile('staff', 'public', 'index-adminlte.html');

        expect(html).toContain('<p>Kantor Saya</p>');
        expect(html).not.toContain('Kantor Saya / Workspace');
        expect(html).not.toContain('Kantor Saya / Workdesk');
    });

    test('staff navbar notification bell stays hidden', () => {
        const html = readRepoFile('staff', 'public', 'index-adminlte.html').replace(/\r\n/g, '\n');
        const shellCss = readRepoFile('staff', 'public', 'styles', 'staff-shell.css').replace(/\r\n/g, '\n');

        expect(shellCss).toContain('#notification-dropdown {\n            display: none !important;\n        }');
        expect(html).toContain('id="notification-dropdown"');
        expect(html).toContain('class="far fa-bell"');
    });

    test('staff polling surfaces back off under load and pause when hidden', () => {
        const chatPopup = readRepoFile('staff', 'public', 'scripts', 'chat-popup.js');
        const dashboard = readRepoFile('staff', 'public', 'scripts', 'dashboard.js');
        const antrianOnline = readRepoFile('staff', 'public', 'scripts', 'antrian-online.js');
        const pollingCoordinator = readRepoFile('staff', 'public', 'scripts', 'shell', 'polling-coordinator.js');
        const html = readRepoFile('staff', 'public', 'index-adminlte.html');

        expect(chatPopup).toContain('const CHAT_HISTORY_POLL_INTERVAL_MS = 15000;');
        expect(chatPopup).toContain('const CHAT_HISTORY_ERROR_BACKOFF_MS = 30000;');
        expect(chatPopup).toContain('boundSocket && boundSocket.connected');
        expect(chatPopup).toContain("register('global-chat-history'");

        expect(dashboard).toContain('const LIVE_QUEUE_POLL_INTERVAL_MS = 45000;');
        expect(dashboard).toContain('const LIVE_QUEUE_ERROR_BACKOFF_MS = 60000;');
        expect(dashboard).toContain("page: 'dashboard'");

        expect(antrianOnline).toContain('const ONLINE_QUEUE_POLL_INTERVAL_MS = 45000;');
        expect(antrianOnline).toContain('const ONLINE_QUEUE_ERROR_BACKOFF_MS = 60000;');
        expect(antrianOnline).toContain("page: 'antrian-online'");

        expect(pollingCoordinator).toContain("visibilityState !== 'hidden'");
        expect(pollingCoordinator).toContain('nextDelay = job.backoff');
        expect(pollingCoordinator).toContain('job.controller.abort()');

        expect(html).toContain('let notificationCountInFlight = false;');
        expect(html).toContain('let notificationCountBackoffUntil = 0;');
        expect(html).toContain('const NOTIFICATION_COUNT_ERROR_BACKOFF_MS = 60000;');
    });

    test('mobile chat reply coalesces scrolling without moving the iOS visual viewport', () => {
        const chatPopup = readRepoFile('staff', 'public', 'scripts', 'chat-popup.js');

        expect(chatPopup).not.toContain('scrollIntoView(');
        expect(chatPopup).toContain('var chatScrollFrameId = null;');
        expect(chatPopup).toContain('var chatScrollSettleTimerId = null;');
        expect(chatPopup).toContain('if (isHistoryLoading) return;');
        expect(chatPopup).not.toContain('window.setTimeout(scrollChatToLatest, 4200);');
    });

    test('mobile chat close action does not rely on WebView inline handlers', () => {
        const chatPopup = readRepoFile('staff', 'public', 'scripts', 'chat-popup.js');

        expect(chatPopup).toContain("closeBtn.removeAttribute('onclick');");
        expect(chatPopup).toContain("closeBtn.addEventListener('pointerdown', handleCloseButtonClick);");
        expect(chatPopup).toContain("closeBtn.addEventListener('click', handleCloseButtonClick);");
        expect(chatPopup).toContain('window.closeChatPopup();');
        expect(chatPopup).not.toContain('.chat-close-btn:hover { background: rgba(255,255,255,.3); transform: rotate(90deg); }');
    });

    test('closing mobile chat restores the FAB frame and releases the page overlay', () => {
        const chatPopup = readRepoFile('staff', 'public', 'scripts', 'chat-popup.js');

        expect(chatPopup).toContain('function restoreChatFabAfterClose(cont, btn)');
        expect(chatPopup).toContain('document.activeElement.blur();');
        expect(chatPopup).toContain('ensureFAB();');
        expect((chatPopup.match(/restoreChatFabAfterClose\(cont, /g) || []).length).toBeGreaterThanOrEqual(4);
        expect(chatPopup).toContain('if (!isChatOpen) return;');
    });

    test('mobile additional billing uses readable cards and a dedicated empty state', () => {
        const billing = readRepoFile('staff', 'public', 'scripts', 'sunday-clinic', 'components', 'shared', 'billing.js');
        const sundayClinicCss = readRepoFile('staff', 'public', 'styles', 'sunday-clinic-pwa.css');

        expect(billing).toContain('class="table table-sm table-bordered mb-0 additional-billing-table"');
        expect(billing).toContain('data-label="Referensi"');
        expect(billing).toContain('class="additional-billing-empty"');
        expect(sundayClinicCss).toContain('#additional-billing-panel .additional-billing-table thead');
        expect(sundayClinicCss).toContain('grid-template-columns: 88px minmax(0, 1fr) !important;');
        expect(sundayClinicCss).toContain('#additional-billing-panel .additional-billing-empty');
    });

    test('mobile chat FAB follows the active embedded navigation without a double offset', () => {
        const chatPopup = readRepoFile('staff', 'public', 'scripts', 'chat-popup.js');
        const sundayClinicCss = readRepoFile('staff', 'public', 'styles', 'sunday-clinic-pwa.css');

        expect(chatPopup).toContain("document.querySelector('body.sunday-clinic-embedded-active .sc-staff-section-nav')");
        expect(chatPopup).toContain('function isVisibleBottomNav(nav)');
        expect(chatPopup).toContain('var visibleNavHeight = Math.round(viewportBottom - navRect.top);');
        expect(chatPopup).toContain('Math.min(140, Math.max(56, visibleNavHeight))');
        expect(chatPopup).toContain("var fabBottom = (navPx2 + 8) + 'px';");
        expect(sundayClinicCss).toContain('body.mobile-app-mode.sunday-clinic-embedded-active #chat-toggle-btn');
        expect(sundayClinicCss).toContain('bottom: auto !important;');
        expect(sundayClinicCss).not.toMatch(/#chat-toggle-btn,[\s\S]{0,160}bottom:\s*calc\(84px/);
    });

    test('staff panel exposes Gajian payroll menu and script', () => {
        const html = readRepoFile('staff', 'public', 'index-adminlte.html');
        const payrollFragment = readRepoFile('staff', 'public', 'fragments', 'pages', 'content-staff-payroll.html');
        const featureLoader = readRepoFile('staff', 'public', 'scripts', 'shell', 'feature-loader.js');
        const mainJs = readRepoFile('staff', 'public', 'scripts', 'main.js');
        const roleVisibility = readRepoFile('staff', 'backend', 'routes', 'role-visibility.js');
        const server = readRepoFile('staff', 'backend', 'server.js');

        expect(html).toContain('id="nav-staff-payroll"');
        expect(html).toContain('showStaffPayrollPage(); return false;');
        expect(html).toContain('<p>Gajian</p>');
        expect(html).toContain('id="content-staff-payroll"');
        expect(payrollFragment).toContain('id="staff-payroll-tbody"');
        const staffVersion = html.match(/window\.STAFF_CACHE_VERSION = '([^']+)'/)?.[1];
        expect(staffVersion).toBeTruthy();
        expect(featureLoader).toContain("staffPayroll: () => loadScript('/staff/public/scripts/staff-payroll.js')");
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
        const briefingFragment = readRepoFile('staff', 'public', 'fragments', 'pages', 'content-staff-briefing.html');
        const featureLoader = readRepoFile('staff', 'public', 'scripts', 'shell', 'feature-loader.js');
        const mainJs = readRepoFile('staff', 'public', 'scripts', 'main.js');
        const staffBriefingJs = readRepoFile('staff', 'public', 'scripts', 'staff-briefing.js');
        const staffBriefingRoute = readRepoFile('staff', 'backend', 'routes', 'staff-briefing.js');
        const roleVisibility = readRepoFile('staff', 'backend', 'routes', 'role-visibility.js');
        const server = readRepoFile('staff', 'backend', 'server.js');

        expect(html).toContain('id="nav-staff-briefing"');
        expect(html).toContain('showStaffBriefingPage(); return false;');
        expect(html).toContain('<p>Briefing</p>');
        expect(html).toContain('id="content-staff-briefing"');
        expect(briefingFragment).toContain('id="staff-briefing-checklist"');
        const staffVersion = html.match(/window\.STAFF_CACHE_VERSION = '([^']+)'/)?.[1];
        expect(staffVersion).toBeTruthy();
        expect(featureLoader).toContain("staffBriefing: () => loadScript('/staff/public/scripts/staff-briefing.js')");
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
        const pointsFragment = readRepoFile('staff', 'public', 'fragments', 'pages', 'content-staff-points.html');

        expect(route).toContain('Formula v2: total_points = SUM(rating) + duty days');
        expect(route).toContain('const ratingPoints = rating ? Number(rating.total_points) : 0;');
        expect(route).toContain('const dutyCount = Number(dutyMap.get(sid) || 0);');
        expect(route).toContain('total_points: ratingPoints + dutyCount');
        expect(route).toContain('duty_points: dutyCount');

        expect(pointsFragment).toContain('<th class="text-right">Point Bertugas</th>');
        expect(script).toContain("'<td class=\"text-right\">' + fmtNum(r.duty_points || r.duty_count) + '</td>'");
        expect(script).toContain("colspan=\"8\"");
    });

    test('Sunday Clinic patient history sidebar is hidden outside Sunday Clinic', () => {
        const html = readNormalizedFile('staff', 'public', 'index-adminlte.html');
        const shellCss = readNormalizedFile('staff', 'public', 'styles', 'staff-shell.css');
        const mainJs = readRepoFile('staff', 'public', 'scripts', 'main.js');

        expect(shellCss).toMatch(/\.patient-history-sidebar\s*\{\s*display:\s*none\s*!important;/);
        expect(shellCss).toMatch(/body\.sunday-clinic-embedded-active\s+\.patient-history-sidebar\s*\{\s*display:\s*flex\s*!important;/);
        expect(mainJs).toContain("document.body.classList.remove('patient-sidebar-open');");
        expect(mainJs).toContain("patientSidebar.classList.remove('open');");
        expect(mainJs).toContain("patientSidebarToggle.classList.remove('active');");
    });

    test('Sunday Clinic live updates cover same-account devices, reconnects, and fallback polling', () => {
        const mainJs = readNormalizedFile('staff', 'public', 'scripts', 'sunday-clinic', 'main.js');
        const billingNotifications = readNormalizedFile('staff', 'public', 'scripts', 'sunday-clinic', 'utils', 'billing-notifications.js');
        const paymentModal = readNormalizedFile('staff', 'public', 'scripts', 'sunday-clinic', 'components', 'shared', 'payment-modal.js');
        const billingRoutes = readNormalizedFile('staff', 'backend', 'routes', 'sunday-clinic', 'billing.js');

        expect(mainJs).not.toContain("String(event.user_id) === String(currentUserId)");
        expect(mainJs).toContain("register('sunday-clinic-active-record'");
        expect(mainJs).toContain('stateManager.hasUnsavedChanges()');
        expect(mainJs).toContain('pendingRealtimeRefresh = true');
        expect(mainJs).toContain("this.billingNotifications.on('billing_updated'");

        expect(billingNotifications).toContain("window.addEventListener('realtime:socket-ready'");
        expect(billingNotifications).toContain("window.addEventListener('realtime:socket-connected'");
        expect(billingNotifications).toContain("this.socket.off('billing_updated'");
        expect(billingNotifications).toContain("this.socket.on('billing_updated'");
        expect(billingNotifications).toContain("this.socket.on('billing_paid'");

        expect(paymentModal).not.toContain("window.socket.off('payment_received')");
        expect(paymentModal).toContain("this.paymentSocket.off('payment_received', this.paymentSocketHandlers.paymentReceived)");

        expect(billingRoutes).toContain('broadcastSuccessfulBillingMutation');
        expect(billingRoutes).toContain("type: 'billing_updated'");
        expect(billingRoutes).toContain("router.post('/billing/:mrId', verifyToken, broadcastSuccessfulBillingMutation");
        expect(billingRoutes).toContain("router.delete('/billing/:mrId/items/:itemType', verifyToken, broadcastSuccessfulBillingMutation");
    });

    test('Sunday Clinic PWA queue dropdown keeps the full patient list touch-scrollable', () => {
        const sundayClinicCss = readNormalizedFile('staff', 'public', 'styles', 'sunday-clinic-pwa.css');

        expect(sundayClinicCss).toContain('body.mobile-app-mode.sunday-clinic-embedded-active #header-queue-dropdown.show');
        expect(sundayClinicCss).toContain('display: flex !important;');
        expect(sundayClinicCss).toContain('body.mobile-app-mode.sunday-clinic-embedded-active #header-queue-list');
        expect(sundayClinicCss).toContain('min-height: 0 !important;');
        expect(sundayClinicCss).toContain('overflow-y: scroll !important;');
        expect(sundayClinicCss).toContain('-webkit-overflow-scrolling: touch !important;');
        expect(sundayClinicCss).toContain('touch-action: pan-y !important;');
    });

    test('staff mobile tap feedback uses COMM tap sound parameters', () => {
        const html = readRepoFile('staff', 'public', 'index-adminlte.html');
        const tapFeedback = readRepoFile('staff', 'public', 'scripts', 'tap-feedback.js');

        const staffVersion = html.match(/window\.STAFF_CACHE_VERSION = '([^']+)'/)?.[1];
        expect(staffVersion).toBeTruthy();
        expect(html).toContain(`/staff/public/scripts/tap-feedback.js?v=${staffVersion}`);
        expect(tapFeedback).toContain("osc.type = 'sine';");
        expect(tapFeedback).toContain('osc.frequency.setValueAtTime(800, ac.currentTime);');
        expect(tapFeedback).toContain('osc.frequency.exponentialRampToValueAtTime(400, ac.currentTime + 0.06);');
        expect(tapFeedback).toContain('gain.gain.setValueAtTime(0.12, ac.currentTime);');
        expect(tapFeedback).toContain('gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.06);');
        expect(tapFeedback).toContain('osc.stop(ac.currentTime + 0.06);');
        expect(tapFeedback).toContain('navigator.vibrate(10);');
    });
});

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '../../../..');
const readRepoFile = (...segments) => fs.readFileSync(path.join(repoRoot, ...segments), 'utf8');
const readNormalizedFile = (...segments) => readRepoFile(...segments).replace(/\r\n/g, '\n');

describe('staff shell refactor phase 1', () => {
    test('bootstrap startup moves from inline module script to dedicated shell bootstrap module', () => {
        const html = readNormalizedFile('staff', 'public', 'index-adminlte.html');
        const bootstrap = readNormalizedFile('staff', 'public', 'scripts', 'shell', 'bootstrap.js');

        expect(html).toMatch(/<script type="module" src="(?:\/staff\/public\/)?scripts\/shell\/bootstrap\.js\?v=[^"' ]+"><\/script>/);
        expect(html).not.toContain("const { auth, getIdToken, initAuth: initAuthLib } = await import('./scripts/vps-auth-v2.js?v=' + v);");
        expect(bootstrap).toContain("import('../vps-auth-v2.js')");
        expect(bootstrap).toContain("import('./credentials.js')");
        expect(bootstrap).not.toMatch(/import\([^\n]+\?v=/);
        expect(bootstrap).toContain('const { auth, getIdToken, initAuth: initAuthLib } = authClient;');
        expect(bootstrap).toContain('const user = await verifyStaffCredentials({ auth, serverVerifiedUser });');
        expect(bootstrap).toContain('initializeApp(user);');

        const verifyIndex = bootstrap.indexOf('const user = await verifyStaffCredentials({ auth, serverVerifiedUser });');
        const initializeIndex = bootstrap.indexOf('initializeApp(user);');
        expect(verifyIndex).toBeGreaterThan(-1);
        expect(initializeIndex).toBeGreaterThan(-1);
        expect(verifyIndex).toBeLessThan(initializeIndex);
    });

    test('core shell controls use delegated data-shell-action hooks instead of inline onclick', () => {
        const html = readNormalizedFile('staff', 'public', 'index-adminlte.html');
        const actions = readNormalizedFile('staff', 'public', 'scripts', 'shell', 'actions.js');

        expect(html).toMatch(/id="navbar-profile-btn"[^>]*data-shell-action="open-profile-settings"/);
        expect(html).toMatch(/id="navbar-logout-btn"[^>]*data-shell-action="logout"/);
        expect(html).toMatch(/id="nav-dashboard"[\s\S]*?data-shell-action="show-dashboard"/);
        expect(html).toMatch(/id="nav-kantor-saya"[\s\S]*?data-shell-action="show-kantor-saya"/);
        expect(html).toMatch(/id="nav-klinik-private"[\s\S]*?data-shell-action="show-klinik-private"/);
        expect(html).toMatch(/id="nav-kelola-pasien"[\s\S]*?data-shell-action="show-manage-patients"/);
        expect(html).toMatch(/id="nav-tanya-dokter"[\s\S]*?data-shell-action="show-tanya-dokter"/);
        expect(html).toMatch(/id="mobile-btn-dashboard"[^>]*data-shell-action="mobile-nav"[^>]*data-mobile-nav="dashboard"/);
        expect(html).toMatch(/id="mobile-btn-more"[^>]*data-shell-action="open-mobile-menu"/);
        expect(html).not.toContain('id="navbar-profile-btn" onclick=');
        expect(html).not.toContain('id="mobile-btn-dashboard" class="active" onclick=');

        expect(actions).toContain('const shellActionHandlers = {');
        expect(actions).toContain("'show-dashboard'");
        expect(actions).toContain("'open-mobile-menu'");
        expect(actions).toContain("document.addEventListener('click'");
        expect(actions).toContain('window.openMobileMenu = openMobileMenu;');
    });

    test('appointment debug wiring is extracted from the staff shell html', () => {
        const html = readNormalizedFile('staff', 'public', 'index-adminlte.html');
        const appointmentDebug = readNormalizedFile('staff', 'public', 'scripts', 'shell', 'appointment-debug.js');
        const featureLoader = readNormalizedFile('staff', 'public', 'scripts', 'shell', 'feature-loader.js');

        expect(html).not.toMatch(/<script[^>]+src="scripts\/shell\/appointment-debug\.js/);
        expect(featureLoader).toContain("appointmentDebug: () => loadScript('/staff/public/scripts/shell/appointment-debug.js')");
        expect(html).not.toContain('window.debugAppointments_DISABLED = function()');
        expect(html).not.toContain('window.debugAppointments is now available globally');
        expect(appointmentDebug).toContain('function installAppointmentDebug()');
        expect(appointmentDebug).toContain("new URLSearchParams(window.location.search).get('debugAppointments') === '1'");
        expect(appointmentDebug).toContain('window.debugAppointments = debugAppointments;');
    });

    test('main staff module imports small shell helpers instead of owning them inline', () => {
        const main = readNormalizedFile('staff', 'public', 'scripts', 'main.js');
        const helpers = readNormalizedFile('staff', 'public', 'scripts', 'shell', 'module-helpers.js');

        expect(main).toContain("import { getAuthToken, importWithVersion, grab } from './shell/module-helpers.js';");
        expect(main).not.toMatch(/module-helpers\.js\?v=/);
        expect(main).not.toContain('function getAuthToken()');
        expect(main).not.toContain('function importWithVersion(path)');
        expect(main).not.toContain('function grab(id)');
        expect(helpers).toContain('export function getAuthToken()');
        expect(helpers).toContain('export function createCanonicalImporter');
        expect(helpers).not.toContain('specifier = `${path}${separator}v=${version}`');
        expect(helpers).toContain('export function grab(id)');
    });

    test('module helper resolves dynamic imports from the staff scripts root', () => {
        const main = readNormalizedFile('staff', 'public', 'scripts', 'main.js');
        const helpers = readNormalizedFile('staff', 'public', 'scripts', 'shell', 'module-helpers.js');

        expect(helpers).toContain("const importBaseUrl = options.importBaseUrl || new URL('../', import.meta.url);");
        expect(helpers).toContain('const specifier = new URL(path, importBaseUrl).href;');
        expect(main).toContain("importWithVersion('./sunday-clinic.js')");
    });

    test('patient and guest activity launchers are globally callable from sidebar and Kantor Saya widgets', () => {
        const html = readNormalizedFile('staff', 'public', 'index-adminlte.html');
        const kantorSaya = readNormalizedFile('staff', 'public', 'scripts', 'kantor-saya.js');

        expect(html).toMatch(/id="nav-patient-activity"[\s\S]*?onclick="showPatientActivityPage\(\); return false;"/);
        expect(html).toMatch(/id="nav-guest-activity"[\s\S]*?onclick="showGuestActivityPage\(\); return false;"/);
        expect(html).toContain('window.showPatientActivityPage = async function()');
        expect(html).toContain('window.showGuestActivityPage = function()');
        expect(html).toContain('window.loadPatientActivity = async function(page = 0)');
        expect(html).toContain('window.loadGuestActivity = async function(page = 0)');
        expect(html).toContain('window.formatDateLocal = window.formatDateLocal || function(date)');
        expect(html).toContain('window.updateStaffPageRoute = function(page, navId)');
        expect(html).toContain("['mr', 'section', 'patient', 'appointment', 'location'].forEach(param => url.searchParams.delete(param));");
        expect(html).toContain("window.updateStaffPageRoute('patient-activity', 'nav-patient-activity');");
        expect(html).toContain("window.updateStaffPageRoute('guest-activity', 'nav-guest-activity');");
        expect(html.indexOf('window.formatDateLocal = window.formatDateLocal || function(date)'))
            .toBeLessThan(html.indexOf('window.showPatientActivityPage = async function()'));
        expect(html.indexOf('window.formatDateLocal = window.formatDateLocal || function(date)'))
            .toBeLessThan(html.indexOf('window.showGuestActivityPage = function()'));
        expect(kantorSaya).toContain("actionName: 'showPatientActivityPage'");
        expect(kantorSaya).toContain("actionName: 'showGuestActivityPage'");
    });

    test('activity pages replace stale Sunday Clinic route state so refresh stays on activity page', () => {
        const main = readNormalizedFile('staff', 'public', 'scripts', 'main.js');

        expect(main).toContain("const pageParam = params.get('page');");
        expect(main).toContain("if (mobileAction !== 'sunday-clinic' && typeof window.updateStaffPageRoute === 'function') {");
        expect(main).toContain('window.updateStaffPageRoute(null, navId || null);');
        expect(main).toContain("'patient-activity': () => window.showPatientActivityPage && window.showPatientActivityPage()");
        expect(main).toContain("'guest-activity': () => window.showGuestActivityPage && window.showGuestActivityPage()");
        expect(main).toContain("'nav-patient-activity':                 () => window.showPatientActivityPage && window.showPatientActivityPage()");
        expect(main).toContain("'nav-guest-activity':                   () => window.showGuestActivityPage && window.showGuestActivityPage()");
    });

    test('profile settings uses the shared auth token helper instead of hardcoded storage keys', () => {
        const profileSettings = readNormalizedFile('staff', 'public', 'profile-settings.html');

        expect(profileSettings).toContain("import { auth, getIdToken } from './scripts/vps-auth-v2.js';");
        expect(profileSettings).toContain('async function getToken()');
        expect(profileSettings).toContain('return await getIdToken();');
        expect(profileSettings).not.toContain("localStorage.getItem('vps_auth_token')");
        expect(profileSettings).not.toContain("sessionStorage.getItem('vps_auth_token')");
    });

    test('patient search and detail diagnostics are gated away from production console logs', () => {
        const html = readNormalizedFile('staff', 'public', 'index-adminlte.html');
        const patientSearchDetail = readNormalizedFile('staff', 'public', 'scripts', 'shell', 'patient-search-detail.js');
        const featureLoader = readNormalizedFile('staff', 'public', 'scripts', 'shell', 'feature-loader.js');

        expect(html).not.toMatch(/<script[^>]+src="scripts\/shell\/patient-search-detail\.js/);
        expect(featureLoader).toContain("patientSearchDetail: () => loadScript('/staff/public/scripts/shell/patient-search-detail.js')");
        expect(html).toContain('window.installPatientViewButtons({');
        expect(html).not.toContain("console.log('[SEARCH DEBUG] Search params:', { name, id, mr_id, email, phone, whatsapp, husband });");
        expect(html).not.toContain("console.log('[SEARCH DEBUG] API Response:', data);");
        expect(html).not.toContain("console.log('[SEARCH DEBUG] Results:', data.data.map(p => ({ id: p.id, name: p.full_name })));");
        expect(html).not.toContain("console.log('Patient data received:', data);");
        expect(html).not.toContain("console.log('Intake data:', intake);");
        expect(patientSearchDetail).toContain('window.staffDebugLog = window.staffDebugLog || function staffDebugLog(scope, ...args)');
        expect(patientSearchDetail).toContain("new URLSearchParams(window.location.search).get('debugStaff') === '1'");
        expect(patientSearchDetail).toContain('window.installPatientViewButtons = function installPatientViewButtons(options = {})');
    });

    test('QRCode dependency is local and imported canonically by the shell bootstrap', () => {
        const html = readNormalizedFile('staff', 'public', 'index-adminlte.html');
        const featureLoader = readNormalizedFile('staff', 'public', 'scripts', 'shell', 'feature-loader.js');
        const qrCodeLoader = readNormalizedFile('staff', 'public', 'scripts', 'shell', 'qrcode-loader.js');
        const qrCodeBundle = readNormalizedFile('staff', 'public', 'scripts', 'vendor', 'qrcode.esm.js');

        expect(html).not.toContain('https://cdn.jsdelivr.net/npm/qrcode@1.5.4/build/qrcode.min.js');
        expect(html).not.toMatch(/<script type="module" src="scripts\/shell\/qrcode-loader\.js/);
        expect(featureLoader).toContain("await import('./qrcode-loader.js')");
        expect(qrCodeLoader).toContain("import QRCode from '../vendor/qrcode.esm.js';");
        expect(qrCodeLoader).toContain('window.QRCode = QRCode;');
        expect(qrCodeBundle).toContain('export');
        expect(qrCodeBundle).not.toContain('from"/');
    });
});

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');

function read(...parts) {
    return fs.readFileSync(path.join(repoRoot, ...parts), 'utf8').replace(/\r\n/g, '\n');
}

describe('staff panel wave 2 lazy shell contracts', () => {
    test('bootstrap uses PageRegistry and does not initialize patients at startup', () => {
        const bootstrap = read('staff', 'public', 'scripts', 'shell', 'bootstrap.js');
        const descriptors = read('staff', 'public', 'scripts', 'shell', 'page-descriptors.js');
        const patientPage = read('staff', 'public', 'scripts', 'pages', 'patient-page.js');

        expect(bootstrap).toContain("import('./page-registry.js')");
        expect(bootstrap).toContain("import('./page-descriptors.js')");
        expect(bootstrap).not.toContain("import('../patients.js')");
        expect(descriptors).toContain("fragment: '/staff/public/fragments/pages/patient-page.html'");
        expect(patientPage).toContain("import('../patients.js')");
        expect(bootstrap).not.toMatch(/runIdle\([\s\S]{0,500}import\('\.\.\/patients\.js'\)/);
    });

    test('patient page is represented by a lazy fragment placeholder', () => {
        const html = read('staff', 'public', 'index-adminlte.html');
        const fragment = read('staff', 'public', 'fragments', 'pages', 'patient-page.html');

        expect(html).toMatch(/id="patient-page"[^>]+data-page-fragment="\/staff\/public\/fragments\/pages\/patient-page\.html"/);
        expect(html).not.toContain('id="patient-list"');
        expect(fragment).toContain('id="patient-list"');
        expect(fragment).toContain('id="patient-search-input"');
    });

    test('heavy feature assets are absent from the initial shell', () => {
        const html = read('staff', 'public', 'index-adminlte.html');
        const forbiddenStartupAssets = [
            'jquery.dataTables.min.js',
            'dataTables.bootstrap4.min.js',
            'apexcharts',
            'marked.min.js',
            'purify.min.js',
            'js.xendit.co',
            'planning-helpers.js',
            'payment-modal.js',
            'tanya-dokter.js',
            'support-chat-staff.js',
            'staff-points.js',
            'staff-briefing.js',
            'staff-payroll.js'
        ];

        forbiddenStartupAssets.forEach(asset => {
            expect(html).not.toMatch(new RegExp(`<script[^>]+src=["'][^"']*${asset.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i'));
        });
    });

    test('PageRegistry exposes the approved descriptor and lifecycle contract', () => {
        const registry = read('staff', 'public', 'scripts', 'shell', 'page-registry.js');

        for (const field of ['key', 'containerId', 'navId', 'title', 'fragment', 'load', 'activate', 'deactivate']) {
            expect(registry).toContain(field);
        }
        expect(registry).toContain("new EventCtor('page:changed'");
        expect(registry).toContain('previousPage');
    });

    test('feature loader owns lazy third-party and staff feature dependencies', () => {
        const loader = read('staff', 'public', 'scripts', 'shell', 'feature-loader.js');

        for (const asset of [
            'dataTables',
            'apexCharts',
            'markdown',
            'qrcode',
            'xendit',
            'sundayClinic',
            'supportChat',
            'tanyaDokter',
            'staffPoints',
            'staffBriefing',
            'staffPayroll',
            'patientTools',
            'financeAnalysis',
            'registrationCodes',
            'notifications'
        ]) {
            expect(loader).toContain(asset);
        }
    });

    test('finance initialization skips removed legacy analytics containers', () => {
        const financeModule = read('staff', 'public', 'scripts', 'pages', 'finance-analysis-page.js');

        expect(financeModule).toContain('const hasLegacyAnalyticsContainers = [');
        expect(financeModule).toMatch(/if \(hasLegacyAnalyticsContainers\) \{\s*await loadAnalytics\(\);\s*\}/);
        expect(financeModule).toMatch(/if \(document\.getElementById\('monthly-revenue-chart'\)\) \{\s*renderMonthlyRevenueChart/);
        expect(financeModule).toMatch(/if \(document\.getElementById\('top-drugs-table'\)\) \{\s*renderTopDrugsTable/);
    });

    test('large staff features are extracted from the shell and loaded on demand', () => {
        const html = read('staff', 'public', 'index-adminlte.html');
        const bootstrap = read('staff', 'public', 'scripts', 'shell', 'bootstrap.js');
        const patientTools = read('staff', 'public', 'scripts', 'legacy', 'patient-tools.js');
        const finance = read('staff', 'public', 'scripts', 'pages', 'finance-analysis-page.js');
        const registration = read('staff', 'public', 'scripts', 'shell', 'registration-codes.js');
        const notifications = read('staff', 'public', 'scripts', 'shell', 'notifications.js');

        expect(Buffer.byteLength(html, 'utf8')).toBeLessThan(400000);
        for (const marker of [
            'window.showManagePatientsPage = async function()',
            "import { getIdToken } from './scripts/vps-auth-v2.js';",
            'window.profileCompletionData = {',
            'let notificationPollInterval = null;'
        ]) {
            expect(html).not.toContain(marker);
        }
        expect(patientTools).toContain('window.showManagePatientsPage = async function()');
        expect(finance).toContain('window.initFinanceAnalysisPage = initFinanceAnalysisPage;');
        expect(registration).toContain('window.openGenerateCodeModal = openGenerateCodeModal;');
        expect(notifications).toContain('window.initStaffNotificationSystem = initNotificationSystem;');
        expect(bootstrap).toContain("installLazyFeatureShim(globalName, 'patientTools')");
        expect(bootstrap).toContain("installLazyFeatureShim(globalName, 'registrationCodes')");
        expect(bootstrap).toContain("installLazyFeatureShim(globalName, 'notifications')");
        expect(bootstrap).not.toContain("ensureFeature('notifications')");
    });

    test('inventory purchase actions load patient tools before inline handlers run', () => {
        const html = read('staff', 'public', 'index-adminlte.html');
        const bootstrap = read('staff', 'public', 'scripts', 'shell', 'bootstrap.js');
        const patientTools = read('staff', 'public', 'scripts', 'legacy', 'patient-tools.js');
        const patientToolsShims = bootstrap.match(
            /\[\s*'showManagePatientsPage'[\s\S]*?\]\.forEach\(globalName => installLazyFeatureShim\(globalName, 'patientTools'\)\);/
        )?.[0] || '';

        expect(html).toContain('onclick="submitPurchaseStock()"');
        expect(patientTools).toContain('window.openPurchaseModal = async function');
        expect(patientTools).toContain('window.submitPurchaseStock = async function');
        expect(patientToolsShims).toContain("'openPurchaseModal'");
        expect(patientToolsShims).toContain("'submitPurchaseStock'");
    });

    test('PageRegistry loads once and emits activate/deactivate lifecycle in order', async () => {
        const registryPath = path.join(repoRoot, 'staff', 'public', 'scripts', 'shell', 'page-registry.js');
        delete require.cache[require.resolve(registryPath)];
        const { PageRegistry } = require(registryPath);
        const containers = {
            dashboard: { dataset: {}, innerHTML: '' },
            patients: { dataset: {}, innerHTML: '' }
        };
        const events = [];
        const calls = [];
        const fakeDocument = {
            getElementById: id => containers[id] || null,
            dispatchEvent: event => events.push(event)
        };
        const fakeFetch = jest.fn(async () => ({ ok: true, text: async () => '<p>patient fragment</p>' }));
        const registry = new PageRegistry({ document: fakeDocument, eventTarget: fakeDocument, fetch: fakeFetch });

        registry.registerAll([
            { key: 'dashboard', containerId: 'dashboard', navId: 'nav-dashboard', title: 'Dashboard', fragment: null, load: null, activate: () => calls.push('dashboard:activate'), deactivate: () => calls.push('dashboard:deactivate') },
            { key: 'patients', containerId: 'patients', navId: 'nav-patient', title: 'Patients', fragment: '/patients.html', load: () => calls.push('patients:load'), activate: () => calls.push('patients:activate'), deactivate: () => calls.push('patients:deactivate') }
        ]);

        await registry.activate('dashboard');
        await Promise.all([registry.activate('patients'), registry.ensureLoaded('patients')]);
        await registry.activate('patients');

        expect(fakeFetch).toHaveBeenCalledTimes(1);
        expect(containers.patients.innerHTML).toBe('<p>patient fragment</p>');
        expect(calls).toEqual(['dashboard:activate', 'dashboard:deactivate', 'patients:load', 'patients:activate', 'patients:activate']);
        expect(events.map(event => ({ type: event.type, detail: event.detail }))).toEqual([
            { type: 'page:changed', detail: { page: 'dashboard', previousPage: null } },
            { type: 'staff:fragment-loaded', detail: { page: 'patients', containerId: 'patients' } },
            { type: 'page:changed', detail: { page: 'patients', previousPage: 'dashboard' } },
            { type: 'page:changed', detail: { page: 'patients', previousPage: 'patients' } }
        ]);
    });
});

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

        for (const asset of ['dataTables', 'apexCharts', 'markdown', 'qrcode', 'xendit', 'sundayClinic', 'supportChat', 'tanyaDokter', 'staffPoints', 'staffBriefing', 'staffPayroll']) {
            expect(loader).toContain(asset);
        }
    });

    test('finance initialization skips removed legacy analytics containers', () => {
        const html = read('staff', 'public', 'index-adminlte.html');

        expect(html).toContain('const hasLegacyAnalyticsContainers = [');
        expect(html).toMatch(/if \(hasLegacyAnalyticsContainers\) \{\s*await loadAnalytics\(\);\s*\}/);
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
        expect(events.map(event => event.detail)).toEqual([
            { page: 'dashboard', previousPage: null },
            { page: 'patients', previousPage: 'dashboard' },
            { page: 'patients', previousPage: 'patients' }
        ]);
    });
});

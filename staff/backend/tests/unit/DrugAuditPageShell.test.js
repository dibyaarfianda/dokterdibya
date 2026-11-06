const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '../../../..');

function read(...parts) {
    return fs.readFileSync(path.join(repoRoot, ...parts), 'utf8').replace(/\r\n/g, '\n');
}

const html = () => read('staff', 'public', 'index-adminlte.html');
const fragment = () => read('staff', 'public', 'fragments', 'pages', 'content-drug-audit.html');
const moduleSource = () => read('staff', 'public', 'scripts', 'pages', 'drug-audit-page.js');

describe('Audit Obat page shell', () => {
    test('nav item lives inside the doctor-only Private group', () => {
        const source = html();
        const group = source.slice(source.indexOf('id="nav-private"'), source.indexOf('<!-- MONITORING -->'));
        expect(group).toMatch(/<li[^>]*id="nav-drug-audit"/);
        expect(group).toMatch(/<li[^>]*class="[^"]*doctor-role-only[^"]*"[^>]*id="nav-drug-audit"/);
        expect(group).toContain('data-staff-call="showDrugAuditPage"');
    });

    test('container, descriptor, loader and navigation are wired', () => {
        const source = html();
        expect(source).toMatch(/id="content-drug-audit"[^>]+data-page-fragment="\/staff\/public\/fragments\/pages\/content-drug-audit\.html"/);
        const hide = source.slice(source.indexOf('function _scHideAllStaffPages()'), source.indexOf('async function showStaffPointsPage()'));
        expect(hide).toContain("'content-drug-audit'");
        const descriptors = read('staff', 'public', 'scripts', 'shell', 'page-descriptors.js');
        expect(descriptors).toContain("['drug-audit', 'content-drug-audit', 'nav-drug-audit', 'Audit Obat']");
        const loader = read('staff', 'public', 'scripts', 'shell', 'feature-loader.js');
        expect(loader).toContain('drugAudit');
        expect(loader).toContain('../pages/drug-audit-page.js?v=');
        const main = read('staff', 'public', 'scripts', 'main.js');
        expect(main).toContain("'nav-drug-audit'");
        expect(main).toContain("grab('content-drug-audit')");
        expect(main).toContain('window.showDrugAuditPage = showDrugAuditPage');
    });

    test('every onclick handler is exported', () => {
        const mod = moduleSource();
        const names = new Set();
        for (const source of [fragment(), mod]) {
            for (const attr of source.match(/onclick="[^"]*"/g) || []) {
                for (const m of attr.matchAll(/window\.([A-Za-z]+)\(/g)) names.add(m[1]);
            }
        }
        expect(names.size).toBeGreaterThan(0);
        for (const name of names) {
            expect(mod).toContain(`window.${name} =`);
        }
    });

    test('module follows token, date and layout rules', () => {
        const mod = moduleSource();
        expect(mod).toContain('getAuthToken()');
        expect(mod).not.toContain('localStorage.getItem(');
        expect(mod).not.toContain('toISOString');
        expect(mod).not.toContain('Setujui semua');
        expect(mod).not.toContain('approve-all');
        const styles = (fragment().match(/<style[\s\S]*?<\/style>/g) || []).join('\n');
        expect(styles).not.toMatch(/\d+vh\b/);
    });

    test('menu source and navigation permission exist', () => {
        const { MENU_ACTIVITY_SOURCES } = require('../../config/menu-activity-sources');
        const { STAFF_NAVIGATION_MAP } = require('../../config/accessControlRegistry');
        expect(MENU_ACTIVITY_SOURCES['nav-drug-audit']).toBeDefined();
        expect(STAFF_NAVIGATION_MAP['nav-drug-audit']).toBe('drug_audit.view');
    });

    test('deleted obat requests get a fallback label', () => {
        expect(moduleSource()).toContain('Obat terhapus (#');
    });

    test('bulk approve confirms and guards against double runs', () => {
        const mod = moduleSource();
        expect(mod).toContain('penyesuaian terpilih (total');
        expect(mod).toContain('drug-audit-bulk-approve');
        expect(fragment()).toContain('id="drug-audit-bulk-approve"');
        const start = mod.indexOf('async function approveSelectedDrugAuditRequests');
        const end = mod.indexOf('function renderReconRow');
        expect(mod.slice(start, end)).toMatch(/\bfinally\b/);
    });
});

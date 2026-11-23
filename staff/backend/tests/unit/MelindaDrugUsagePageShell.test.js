'use strict';

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '../../../..');
const read = (...parts) => fs.readFileSync(path.join(repoRoot, ...parts), 'utf8').replace(/\r\n/g, '\n');
const html = () => read('staff', 'public', 'index-adminlte.html');
const fragment = () => read('staff', 'public', 'fragments', 'pages', 'melinda-drug-usage-page.html');
const moduleSource = () => read('staff', 'public', 'scripts', 'pages', 'melinda-drug-usage-page.js');

describe('Pengeluaran Obat RS page shell', () => {
    test('the doctor-only sidebar item follows MEDIFY Sync', () => {
        const source = html();
        const block = source.slice(source.indexOf('id="nav-medify-sync"'), source.indexOf('</ul>', source.indexOf('id="nav-medify-sync"')));
        expect(block).toMatch(/<li class="nav-item dokter-only d-none" id="nav-melinda-drug-usage">/);
        expect(block).toContain('data-staff-call="showMelindaDrugUsagePage"');
        expect(block).toContain('<p>Pengeluaran Obat RS</p>');
    });

    test('container, descriptor, loader, shim and resume entry are wired', () => {
        expect(html()).toMatch(/<div id="melinda-drug-usage-page" class="d-none" data-page-fragment="\/staff\/public\/fragments\/pages\/melinda-drug-usage-page\.html"><\/div>/);
        expect(read('staff', 'public', 'scripts', 'shell', 'page-descriptors.js'))
            .toContain("['melinda-drug-usage', 'melinda-drug-usage-page', 'nav-melinda-drug-usage', 'Pengeluaran Obat RS']");
        const loader = read('staff', 'public', 'scripts', 'shell', 'feature-loader.js');
        expect(loader).toMatch(/melindaDrugUsage: async \(\) => \{/);
        expect(loader).toContain('../pages/melinda-drug-usage-page.js?v=');
        const bootstrap = read('staff', 'public', 'scripts', 'shell', 'bootstrap.js');
        expect(bootstrap).toContain("installLazyFeatureShim(globalName, 'melindaDrugUsage', 'melinda-drug-usage')");
        for (const name of ['showMelindaDrugUsagePage', 'melindaDrugUsageLoad', 'melindaDrugUsageExport']) {
            expect(bootstrap).toContain(`'${name}'`);
        }
        expect(read('staff', 'public', 'scripts', 'main.js')).toMatch(/'nav-melinda-drug-usage':\s+\(\) => window\.showMelindaDrugUsagePage\?\.\(\)/);
    });

    test('every onclick and onchange handler is exported to window', () => {
        const mod = moduleSource();
        const exportsBlock = mod.slice(mod.indexOf('Object.assign(window, {'));
        const names = new Set();
        for (const attr of fragment().match(/on(?:click|change)="[^"]*"/g) || []) {
            for (const match of attr.matchAll(/window\.([A-Za-z]+)\(/g)) names.add(match[1]);
        }
        expect(names).toEqual(new Set(['melindaDrugUsageLoad', 'melindaDrugUsageExport']));
        for (const name of names) expect(exportsBlock).toMatch(new RegExp(`\\b${name}\\b`));
    });

    test('follows the token, date, escaping and layout rules', () => {
        const mod = moduleSource();
        expect(mod).toContain("from '../staff-api.js'");
        expect(mod).toContain("from '../safe-render.js'");
        expect(mod).toContain('getIdToken');
        expect(mod).toContain('escapeHtml(item.item_name)');
        expect(mod).not.toContain('localStorage.getItem(');
        expect(mod).not.toContain('toISOString');
        const styles = (fragment().match(/<style[\s\S]*?<\/style>/g) || []).join('\n');
        expect(styles).not.toMatch(/\d+vh\b/);
        expect(styles).toContain('#melinda-drug-usage-page');
    });

    test('labels values as report values and offers every depot', () => {
        expect(fragment()).toContain('Nilai Laporan berasal dari Medify dan belum tentu sama dengan nilai kwitansi');
        for (const depot of ['depo-rawat-jalan', 'depo-rawat-inap', 'depo-ruang-bayi', 'depo-vk', 'depo-ok', 'depo-aster', 'depo-icu', 'depo-hcu']) {
            expect(fragment()).toContain(`value="${depot}"`);
        }
    });

    test('staff asset versions are bumped together', () => {
        expect(html()).toContain("window.STAFF_CACHE_VERSION = 'v509'");
        expect(read('staff', 'public', 'sw.js')).toContain("const STAFF_PWA_VERSION = 'v509'");
    });
});

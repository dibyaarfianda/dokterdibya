'use strict';

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');

function resolve(...parts) {
    return path.join(repoRoot, ...parts);
}

function read(...parts) {
    return fs.readFileSync(resolve(...parts), 'utf8').replace(/\r\n/g, '\n');
}

const pageContracts = [
    ['birth-congrats', 'birth-congrats-page'],
    ['birth-testimonials', 'birth-testimonials-page'],
    ['invoice-history', 'invoice-history-page'],
    ['artikel-kesehatan', 'artikel-kesehatan-page'],
    ['ruang-cerita', 'ruang-cerita-page']
];

describe('staff panel wave 7 lazy content contracts', () => {
    test('five low-frequency pages are lazy fragments instead of shell markup', () => {
        const html = read('staff', 'public', 'index-adminlte.html');
        const descriptors = read('staff', 'public', 'scripts', 'shell', 'page-descriptors.js');

        for (const [key, containerId] of pageContracts) {
            const fragmentPath = resolve('staff', 'public', 'fragments', 'pages', `${containerId}.html`);
            expect(fs.existsSync(fragmentPath)).toBe(true);
            expect(html).toMatch(new RegExp(
                `id="${containerId}"[^>]+data-page-fragment="/staff/public/fragments/pages/${containerId}\\.html"`
            ));
            expect(descriptors).toContain(`['${key}', '${containerId}'`);
        }

        expect(html).not.toContain('id="birthCongratsForm"');
        expect(html).not.toContain('id="invoice-history-tbody"');
        expect(html).not.toContain('id="articles-admin-tbody"');
        expect(html).not.toContain('id="patient-stories-admin-tbody"');
    });

    test('three feature modules are lazy and retain compatibility shims', () => {
        const loader = read('staff', 'public', 'scripts', 'shell', 'feature-loader.js');
        const bootstrap = read('staff', 'public', 'scripts', 'shell', 'bootstrap.js');

        for (const feature of ['birthContent', 'invoiceHistory', 'contentModeration']) {
            expect(loader).toContain(feature);
        }
        for (const handler of [
            'showBirthCongratsPage',
            'showBirthTestimonialsPage',
            'showInvoiceHistoryPage',
            'showArtikelKesehatanPage',
            'showRuangCeritaPage'
        ]) {
            expect(bootstrap).toContain(handler);
        }
        expect(bootstrap).not.toContain("ensureFeature('birthContent')");
        expect(bootstrap).not.toContain("ensureFeature('invoiceHistory')");
        expect(bootstrap).not.toContain("ensureFeature('contentModeration')");
    });

    test('extracted modules use shared API, cancellation, safe rendering, and delegated actions', () => {
        const birth = read('staff', 'public', 'scripts', 'pages', 'birth-content-page.js');
        const invoice = read('staff', 'public', 'scripts', 'pages', 'invoice-history-page.js');
        const moderation = read('staff', 'public', 'scripts', 'pages', 'content-moderation-page.js');
        const fragments = pageContracts.map(([, containerId]) =>
            read('staff', 'public', 'fragments', 'pages', `${containerId}.html`)
        );
        const modules = [birth, invoice, moderation];

        modules.forEach(source => {
            expect(source).toContain('createPageRequestScope');
            expect(source).not.toMatch(/\bfetch\s*\(/);
            expect(source).not.toMatch(/\son(?:click|change|keydown)=/);
            expect(source).toContain("addEventListener('page:changed'");
        });

        const combined = modules.join('\n');
        expect(combined).toContain('escapeHtml');
        expect(combined).toContain('sanitizeUrl');
        expect(combined).toContain('DOMPurify.sanitize');
        expect(combined).toContain('data-action=');

        expect(birth).toContain('const formData = new FormData()');
        expect(birth).toContain("formData.append('photo', photo)");
        expect(birth).not.toMatch(/formData[\s\S]{0,300}Content-Type/);
        expect(invoice).toContain("new Set(['date', 'patient', 'total', 'status'])");
        expect(invoice).toContain("event.target?.dataset.action === 'invoice-filter'");
        expect(moderation).toContain("event.target?.dataset.action === 'article-filter'");
        expect(moderation).toContain("event.target?.dataset.action === 'story-filter'");
        expect(fragments.join('\n')).not.toMatch(/\son(?:click|change|keydown)=/);
    });

    test('legacy implementations leave main.js and startup budgets shrink', () => {
        const main = read('staff', 'public', 'scripts', 'main.js');
        const html = read('staff', 'public', 'index-adminlte.html');

        for (const implementation of [
            'function loadBirthCongratsList(',
            'function loadInvoiceHistory(',
            'function loadArticlesAdmin(',
            'function loadPatientStoriesAdmin(',
            'function initArticleMarkdownPreview('
        ]) {
            expect(main).not.toContain(implementation);
        }
        expect(main).toContain('window.activateRegisteredStaffPage');
        expect(Buffer.byteLength(main, 'utf8')).toBeLessThanOrEqual(270000);
        expect(Buffer.byteLength(html, 'utf8')).toBeLessThanOrEqual(330000);
    });

    test('shell and service worker advance together to v360', () => {
        const html = read('staff', 'public', 'index-adminlte.html');
        const sw = read('staff', 'public', 'sw.js');

        const version = html.match(/window\.STAFF_CACHE_VERSION = '([^']+)'/)?.[1];
        expect(version).toBeTruthy();
        expect(sw).toContain(`const STAFF_PWA_VERSION = '${version}'`);
    });
});

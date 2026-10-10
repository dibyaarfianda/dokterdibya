'use strict';

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const pageHtml = fs.readFileSync(
    path.resolve(__dirname, '../../../public/fragments/pages/kelola-access-page.html'),
    'utf8'
);
const scriptSource = fs.readFileSync(
    path.resolve(__dirname, '../../../public/scripts/kelola-access.js'),
    'utf8'
).replace('export async function initKelolaAccess()', 'async function initKelolaAccess()');

describe('Kelola Akses template editor behavior', () => {
    let browser;
    let page;

    beforeAll(async () => {
        browser = await puppeteer.launch({
            headless: true,
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined
        });
    });

    afterAll(async () => {
        await browser?.close();
    });

    beforeEach(async () => {
        page = await browser.newPage();
        await page.setContent(pageHtml, { waitUntil: 'domcontentloaded' });
        await page.evaluate(() => {
            window.__requests = [];
            window.__templateVersion = 3;
            window.__confirmApply = false;
            window.getAuthToken = () => 'test-token';
            window.alert = () => {};
            window.Swal = {
                fire: async options => ({
                    isConfirmed: options?.showCancelButton ? window.__confirmApply : true
                })
            };
            const catalog = () => ({
                permissions: [
                    {
                        name: 'patients.view', display_name: 'Lihat pasien', category: 'Pasien',
                        description: 'Lihat pasien', action: 'view', mandatory_for_staff: true
                    },
                    {
                        name: 'appointments.view', display_name: 'Lihat janji', category: 'Klinik dan Jadwal',
                        description: 'Lihat janji', action: 'view', mandatory_for_staff: false
                    }
                ],
                templates: [{
                    key: 'staff', label: 'Staff', description: 'Operasional harian.',
                    permissions: ['patients.view'], template_version: window.__templateVersion,
                    is_customized: true
                }],
                job_labels: [{ name: 'staff', label: 'Staff' }]
            });
            const user = {
                id: 'STAFF0001', name: 'Staff Satu', email: 'staff@example.test', job_label: 'Staff',
                template_key: 'staff', status: 'active', is_active: true, is_doctor_protected: false,
                access_version: 2, permission_count: 1, permissions: ['patients.view'], audits: []
            };
            window.fetch = async (url, options = {}) => {
                const pathname = String(url).replace('/api/access-control', '');
                window.__requests.push({ pathname, method: options.method || 'GET', body: options.body || null });
                let data;
                if (pathname === '/catalog') data = catalog();
                else if (pathname === '/users') data = [user];
                else if (pathname === '/users/STAFF0001') data = user;
                else if (pathname === '/templates/staff' && options.method === 'PUT') {
                    window.__templateVersion += 1;
                    data = { template: { ...catalog().templates[0] }, affected_count: 0, affected_user_ids: [] };
                } else if (pathname === '/templates/staff/apply' && options.method === 'POST') {
                    window.__templateVersion += 1;
                    data = { template: { ...catalog().templates[0] }, affected_count: 1, affected_user_ids: ['STAFF0001'] };
                } else data = {};
                return { ok: true, status: 200, json: async () => ({ success: true, data }) };
            };
        });
        await page.addScriptTag({ content: scriptSource });
        await page.evaluate(() => window.initKelolaAccess());
    });

    afterEach(async () => {
        await page.close();
    });

    test('switches to templates, locks mandatory permissions, saves only, and confirms before apply-all', async () => {
        await page.click('[data-access-view="templates"]');
        expect(await page.$eval('#access-template-editor', element => element.classList.contains('d-none'))).toBe(false);
        expect(await page.$eval('#access-template-version', element => element.textContent)).toBe('Versi 3');
        expect(await page.$eval(
            '#access-template-permission-matrix-body [data-permission="patients.view"]',
            input => ({ checked: input.checked, disabled: input.disabled })
        )).toEqual({ checked: true, disabled: true });

        await page.click('#access-template-save');
        await page.waitForFunction(() => window.__requests.some(request => (
            request.pathname === '/templates/staff' && request.method === 'PUT'
        )));
        const saved = await page.evaluate(() => window.__requests.find(request => (
            request.pathname === '/templates/staff' && request.method === 'PUT'
        )));
        expect(JSON.parse(saved.body)).toEqual({ permissions: ['patients.view'], template_version: 3 });

        await page.click('#access-template-apply-all');
        await new Promise(resolve => setTimeout(resolve, 50));
        expect(await page.evaluate(() => window.__requests.some(request => request.pathname.endsWith('/apply')))).toBe(false);

        await page.evaluate(() => { window.__confirmApply = true; });
        await page.click('#access-template-apply-all');
        await page.waitForFunction(() => window.__requests.some(request => (
            request.pathname === '/templates/staff/apply' && request.method === 'POST'
        )));
        const applied = await page.evaluate(() => window.__requests.find(request => request.pathname === '/templates/staff/apply'));
        expect(JSON.parse(applied.body)).toEqual({ permissions: ['patients.view'], template_version: 4 });
    });
});

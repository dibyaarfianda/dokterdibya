// Isolated UI integration test: never calls a production API.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const puppeteer = require('puppeteer');
const { normalizeDraft, buildPreview } = require('../../services/EstimasiBiayaDraft');
const root = path.resolve(__dirname, '../../../..');
const output = path.join(root, 'tmp/estimate-qa');
fs.mkdirSync(output, { recursive: true });
const app = express(); app.use(express.json());
const meds = [{ id: 7, name: 'SECRET MEDICINE', price: 1500, unit: 'tablet', is_active: 1 }];
const services = [{ id: 9, name: 'Konsultasi', price: 100000, category: 'LAYANAN', is_active: 1 }];
const templates = [{ id: 1, name: 'SECRET TEMPLATE', items: [{ obatId: 7, name: 'SECRET MEDICINE', quantity: 30, unit: 'tablet', caraPakai: 'SECRET DIRECTIONS' }] }];
let saved = normalizeDraft(), failPreview = false, failSave = false, saveDelay = 0;
app.get('/staff/public/scripts/vps-auth-v2.js', (req, res) => res.type('js').send('export async function getIdToken(){return "test-only";}'));
app.get('/api/obat', (req, res) => res.json({ success: true, data: meds }));
app.get('/api/tindakan', (req, res) => res.json({ success: true, data: services }));
app.get('/api/sunday-clinic/prescription-templates', (req, res) => res.json({ success: true, data: templates }));
app.get('/api/estimasi-biaya/draft', (req, res) => res.json({ success: true, draft: saved }));
app.put('/api/estimasi-biaya/draft', async (req, res) => {
    if (failSave) return res.status(500).json({ success: false });
    if (saveDelay) await new Promise(resolve => setTimeout(resolve, saveDelay));
    saved = normalizeDraft(req.body); saved.updated_at = new Date().toISOString();
    res.json({ success: true, draft: saved, message: 'Draft tersimpan.' });
});
app.post('/api/estimasi-biaya/preview', (req, res) => {
    if (failPreview) return res.status(500).json({ success: false });
    res.json({ success: true, preview: buildPreview(req.body, { medications: meds, services, templates }) });
});
app.get('/qa', (req, res) => res.send('<!doctype html><html><head><link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/admin-lte@3.2/dist/css/adminlte.min.css"></head><body><main id="estimasi-biaya-page" style="padding:24px">' +
    fs.readFileSync(path.join(root, 'staff/public/fragments/pages/estimasi-biaya-page.html'), 'utf8') +
    '</main><script>window.activateRegisteredStaffPage=async()=>{};</script><script type="module">import {showEstimasiBiayaPage} from "/staff/public/scripts/pages/estimasi-biaya-page.js";showEstimasiBiayaPage();</script></body></html>'));
app.use('/staff/public', express.static(path.join(root, 'staff/public')));
app.use(express.static(path.join(root, 'public')));
(async () => {
    const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    const executablePath = process.env.CHROME_PATH || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p => fs.existsSync(p));
    const browser = await puppeteer.launch({ headless: true, executablePath }).catch(error => { server.close(); throw error; });
    const failures = [], requests = [];
    try {
        const page = await browser.newPage(); await page.setViewport({ width: 1400, height: 1000 });
        page.on('dialog', dialog => dialog.accept());
        page.on('pageerror', e => failures.push(e.message));
        page.on('request', req => { if (req.url().includes('/api/')) requests.push(req.url()); });
        await page.goto('http://127.0.0.1:' + server.address().port + '/qa', { waitUntil: 'networkidle0' });
        await page.waitForSelector('[data-field="template"]');
        assert.equal(await page.$eval('[data-field="template"]', n => n.value), '');
        await page.click('[data-action="estimate-preview"]');
        const frame = await (await page.$('#estimate-patient-frame')).contentFrame();
        await frame.waitForSelector('#estimate-help-done');
        await (await page.$('#estimate-patient-frame')).screenshot({ path: path.join(output, 'guide.png') });
        await frame.click('#estimate-help-done');
        assert.match(await frame.$eval('#estimate-app', n => n.textContent), /Data Dummy — bukan tarif klinik/);
        assert.equal(await frame.$eval('#estimate-total', n => n.textContent), 'Rp 840.000');
        const contrast = await frame.$eval('.estimate-grand', panel => {
            const rgb = value => value.match(/[\d.]+/g).slice(0,3).map(Number);
            const luminance = c => c.map(v => { const s=v/255; return s<=.04045?s/12.92:Math.pow((s+.055)/1.055,2.4); }).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0);
            const background = luminance(rgb(getComputedStyle(panel).backgroundColor));
            return ['p','strong'].map(selector => {const foreground=luminance(rgb(getComputedStyle(panel.querySelector(selector)).color));return (Math.max(foreground,background)+.05)/(Math.min(foreground,background)+.05);});
        });
        assert.ok(contrast.every(ratio => ratio >= 4.5), 'Total caption and amount need readable contrast: ' + contrast);

        await (await page.$('#estimate-patient-frame')).screenshot({ path: path.join(output, 'dummy-phone.png') });
        // Shared portal typography and header geometry, compared at identical width.
        const reference = await browser.newPage(); await reference.setViewport({ width: 390, height: 780 });
        await reference.goto('http://127.0.0.1:' + server.address().port + '/patient-tool-template.html', { waitUntil: 'networkidle0' });
        const styles = () => ['body', '.topbar', '.brand-title', '.bottom-nav'].map(s => {
            const n = document.querySelector(s), c = getComputedStyle(n);
            return [s, c.fontFamily, c.fontSize, c.backgroundColor, c.borderRadius];
        });
        assert.deepEqual(await frame.evaluate(styles), await reference.evaluate(styles));
        await reference.close();
        await page.click('[data-action="estimate-settings"]');
        await page.select('[data-field="template"][data-key="t1"]', '1');
        assert.equal(await page.$eval('[data-field="med-qty"]', n => n.value), '30');
        await page.type('[data-field="alias"]', 'Paket A');
        await page.click('[data-action="estimate-add-service"][data-key="t1"]');
        await page.select('[data-field="service-id"]', '9');
        await page.click('[data-action="save-estimasi-biaya"]');
        await page.waitForFunction(() => document.getElementById('estimasi-config-status').textContent === 'Draft tersimpan.');
        await page.click('[data-action="estimate-preview"]');
        await frame.waitForFunction(() => document.getElementById('estimate-app').textContent.includes('Paket A'));
        assert.doesNotMatch(await frame.$eval('body', n => n.innerHTML), /SECRET/);
        await frame.select('[data-estimate="trimester"]', 't1');
        assert.equal(await frame.$eval('#estimate-total', n => n.textContent), 'Rp 145.000');
        async function change(selector, value) {
            await frame.$eval(selector, (n, v) => { n.value = v; n.dispatchEvent(new Event('change', { bubbles: true })); }, value);
        }
        await change('[data-estimate="repeat"]', '2');
        assert.equal(await frame.$eval('#estimate-total', n => n.textContent), 'Rp 190.000');
        await change('[data-estimate="repeat"]', '0');
        assert.equal(await frame.$eval('#estimate-total', n => n.textContent), 'Rp 100.000');
        await change('[data-estimate="service"]', '0');
        assert.equal(await frame.$eval('#estimate-total', n => n.textContent), 'Rp 0');
        await frame.click('[data-estimate="help"]');
        await frame.focus('#shell-modal-close'); await page.keyboard.press('Escape');
        assert.equal(await frame.$eval('#shell-modal', n => n.classList.contains('active')), false);
        await page.click('[data-action="estimate-desktop"]');
        await (await page.$('#estimate-patient-frame')).screenshot({ path: path.join(output, 'draft-desktop.png') });
        await page.click('[data-action="estimate-settings"]');
        await page.$eval('[data-field="med-unit"][data-key="t1"]', n => { n.value = 'strip'; n.dispatchEvent(new Event('input', { bubbles: true })); });
        await page.click('[data-action="estimate-preview"]');
        await frame.waitForSelector('.estimate-warning');
        await frame.select('[data-estimate="trimester"]', 't1');
        assert.match(await frame.$eval('.estimate-summary', n => n.textContent), /Subtotal layananRp 100.000/);
        assert.equal(await frame.$eval('#estimate-total', n => n.textContent), 'Belum lengkap');
        await page.click('[data-action="estimate-settings"]');
        await page.$eval('[data-field="med-unit"][data-key="t1"]', n => { n.value = 'tablet'; n.dispatchEvent(new Event('input', { bubbles: true })); });
        await page.$eval('[data-field="repeat"][data-key="t1"]', n => { n.value = '3'; n.dispatchEvent(new Event('input', { bubbles: true })); });
        saveDelay = 400;
        await page.click('[data-action="save-estimasi-biaya"]');
        await page.click('[data-action="reload-estimasi-biaya"]');
        await page.waitForFunction(() => document.getElementById('estimasi-config-status').textContent === 'Draft tersimpan.');
        assert.equal(await page.$eval('[data-field="repeat"][data-key="t1"]', n => n.value), '3', 'reload cannot overwrite an in-flight save');
        saveDelay = 0;
        failSave = true;
        await page.click('[data-action="save-estimasi-biaya"]');
        await page.waitForFunction(() => document.getElementById('estimasi-config-status').textContent.includes('gagal disimpan'));
        failSave = false; failPreview = true;
        await page.click('[data-action="estimate-preview"]');
        await frame.waitForFunction(() => document.getElementById('estimate-app').textContent.includes('Harga gagal'));
        assert.equal(await frame.$('#estimate-total'), null);
        failPreview = false;
        await page.reload({ waitUntil: 'networkidle0' });
        await page.waitForSelector('[data-field="alias"]');
        assert.equal(await page.$eval('[data-field="alias"]', n => n.value), 'Paket A');
        assert.equal(await page.$eval('[data-field="med-qty"]', n => n.value), '30');
        assert.equal(requests.some(url => /patient-notifications|patients\/profile|portal-settings/.test(url)), false);
        assert.deepEqual(failures, []);
        console.log('PASS: dummy, template snapshot, 30-unit quantity, aliases, independent repeats including zero, isolated patient shell, portal style parity, guide Escape, save/reload, save/network failure; screenshots:', output);
    } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });

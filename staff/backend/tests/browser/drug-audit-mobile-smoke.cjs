const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const puppeteer = require('puppeteer');

const publicRoot = path.resolve(__dirname, '../../../public');
const fragment = fs.readFileSync(path.join(publicRoot, 'fragments/pages/content-drug-audit.html'), 'utf8');
const approved = [];
const requests = [
  { id: 41, obat_id: 7, quantity_delta: -3, reason_category: 'rusak', reason_note: 'botol pecah <b>x</b>', status: 'pending', stock_at_request: 10, requested_by_name: 'Staf Uji', requested_at: '2026-11-06T03:00:00.000Z', code: 'OB123456', name: 'Asam Folat', unit: 'pcs', current_stock: 9, value: -3000, is_stale: true },
  { id: 42, obat_id: 8, quantity_delta: 4, reason_category: 'opname', reason_note: 'hitung ulang', status: 'pending', stock_at_request: 5, requested_by_name: 'Staf Uji', requested_at: '2026-11-06T04:00:00.000Z', code: 'OB777', name: 'Vitamin C', unit: 'pcs', current_stock: 5, value: 4400, is_stale: false }
];

const app = express();
app.use(express.json());
app.get('/qa', (req, res) => res.send(`<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@4.6.2/dist/css/bootstrap.min.css">
<body><div id="content-drug-audit">${fragment}</div>
<script src="https://cdn.jsdelivr.net/npm/jquery@3.6.0/dist/jquery.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/bootstrap@4.6.2/dist/js/bootstrap.bundle.min.js"></script>
<script>window.getAuthToken=()=>'fixture';</script>
<script type="module">await import('/staff/public/scripts/pages/drug-audit-page.js?v=qa'); window.__moduleReady = true;</script></body>`));
app.get('/api/drug-audit/adjustment-requests', (req, res) => res.json({ success: true, data: requests.filter(r => !approved.includes(r.id)), pagination: { total: 2, limit: 100, offset: 0 } }));
app.post('/api/drug-audit/adjustment-requests/:id/approve', (req, res) => { approved.push(Number(req.params.id)); res.json({ success: true, data: { id: Number(req.params.id), status: 'approved' } }); });
app.get('/api/drug-audit/reconciliation', (req, res) => res.json({ success: true, data: { baseline: null, summary: { total: 3, match: 2, batch_mismatch: 1, movement_mismatch: 0 }, rows: [{ obat_id: 2, code: 'OB2', name: 'Paracetamol', unit: 'tablet', stock: 3, batch_total: 0, expected_stock: null, status: 'batch_mismatch' }] } }));
app.use('/staff/public', express.static(publicRoot));

(async () => {
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'], executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 375, height: 812, isMobile: true, hasTouch: true });
    const dialogs = [];
    page.on('dialog', d => { dialogs.push(d.message()); d.accept(); });
    await page.goto(`http://127.0.0.1:${server.address().port}/qa`);
    await page.waitForFunction(() => window.__moduleReady === true, { timeout: 15000 });
    await page.evaluate(() => window.initDrugAuditPage());
    await page.waitForFunction(() => document.querySelectorAll('.drug-audit-card').length === 2, { timeout: 5000 });
    assert.equal(await page.$$eval('.drug-audit-card', c => c.filter(e => e.offsetParent !== null).length), 2);
    const text = await page.$eval('#drug-audit-list', e => e.textContent);
    assert.match(text, /Menunggu > 7 hari/);
    assert.match(text, /-3 pcs/);
    assert.match(text, /\+4 pcs/);
    assert.match(text, /Stok saat diajukan: 10 · sekarang: 9/);
    assert.match(text, /-Rp 3\.000/);
    assert.match(text, /botol pecah <b>x<\/b>/, 'server text must be escaped, not parsed as HTML');
    assert.equal(await page.$('.drug-audit-card b'), null);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= 375), 'no horizontal scroll on pending tab');
    console.log('PASS: 2 cards, stale badge, signed delta, escaping, no horizontal scroll');

    await page.$$eval('.drug-audit-select', boxes => boxes.forEach(b => b.click()));
    await page.waitForFunction(() => document.getElementById('drug-audit-bulk-summary').textContent.includes('2 dipilih'));
    assert.match(await page.$eval('#drug-audit-bulk-summary', e => e.textContent), /2 dipilih · total Rp 1\.400/);
    console.log('PASS: selecting 2 cards shows "2 dipilih"');

    await page.evaluate(() => [...document.querySelectorAll('.drug-audit-card button')].find(b => b.textContent.trim() === 'Tolak').click());
    await page.waitForFunction(() => document.getElementById('drug-audit-reject-modal').classList.contains('show'), { timeout: 5000 });
    await page.evaluate(() => window.submitDrugAuditReject());
    assert.match(await page.$eval('#drug-audit-reject-error', e => e.textContent), /Catatan penolakan wajib diisi/);
    console.log('PASS: Tolak opens modal; empty note rejected client-side');
    await new Promise(r => setTimeout(r, 800)); // let the Bootstrap fade-in finish before hiding
    await page.evaluate(() => $('#drug-audit-reject-modal').modal('hide'));
    await page.waitForFunction(() => !document.getElementById('drug-audit-reject-modal').classList.contains('show'));

    await page.evaluate(() => window.approveSelectedDrugAuditRequests());
    await page.waitForFunction(() => document.getElementById('drug-audit-message').textContent.includes('2 pengajuan disetujui'), { timeout: 5000 });
    assert.deepEqual(approved, [41, 42]);
    assert.ok(dialogs.some(m => m === 'Setujui 2 penyesuaian terpilih (total Rp 1.400)?'), 'bulk approve must ask for confirmation');
    assert.equal(await page.$eval('#drug-audit-bulk-approve', e => e.disabled), false);
    console.log('PASS: bulk approve runs sequentially and reloads');

    await page.evaluate(() => $('#drug-audit-tab-reconciliation-link').tab('show'));
    await page.waitForFunction(() => document.getElementById('drug-audit-recon').textContent.includes('Paracetamol'), { timeout: 5000 });
    const banner = await page.$eval('#drug-audit-baseline-banner', e => ({ shown: e.offsetParent !== null, text: e.textContent }));
    assert.ok(banner.shown);
    assert.match(banner.text, /Belum ada baseline\./);
    assert.match(await page.$eval('#drug-audit-tab-reconciliation', e => e.textContent), /Selisih batch/);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= 375), 'no horizontal scroll on reconciliation tab');
    console.log('PASS: Rekonsiliasi tab shows banner and Selisih batch');
    console.log('drug-audit mobile smoke OK');
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });

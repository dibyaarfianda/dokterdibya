const assert = require('node:assert/strict');
const path = require('node:path');
const express = require('express');
const puppeteer = require('puppeteer');

const app = express();
app.use(express.json());
let questions = 0;
let proposals = 0;
app.get('/api/assistant-daf/status', (req, res) => res.json({ manual_share_ready: true, private_ai_ready: true }));
app.post('/api/assistant-daf/passkey/lock', (req, res) => res.json({ success: true }));
app.get('/api/assistant-daf/passkey/state', (req, res) => res.json({ unlocked: true, registered: true }));
app.get('/api/assistant-daf/drafts', (req, res) => res.json({ drafts: [] }));
app.post('/api/assistant-daf/ai/discuss', (req, res) => {
  questions++;
  assert.equal(req.body.text, 'SC 03/10/2026 jam 07.30 Melinda');
  res.json({ success: true, answer: 'Periksa identitas pasien sebelum membuat jadwal.' });
});
app.post('/api/assistant-daf/drafts', (req, res) => {
  proposals++;
  assert.equal(req.body.text, 'SC 03/10/2026 jam 07.30 Melinda');
  res.json({ success: true });
});
app.get('/assistant-daf/docboard-session.js', (req, res) => res.sendFile(path.resolve(__dirname, '../../../../public/scripts/docboard-session.js')));
app.use('/assistant-daf', express.static(path.resolve(__dirname, '../../../../assistant-daf/public')));

(async () => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  let browser;
  try {
    browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/assistant-daf/`);
    await page.waitForFunction(() => document.querySelector('#connection').textContent === 'Passkey aktif');
    await page.click('[data-tab="discussion"]');
    await page.type('#ai-question', 'SC 03/10/2026 jam 07.30 Melinda');
    await page.click('#ai-send');
    await page.waitForFunction(() => document.querySelector('#ai-answer').textContent.includes('Periksa identitas'));
    assert.equal(questions, 1);
    assert.equal(proposals, 0);
    await page.click('#ai-propose');
    await page.waitForFunction(() => document.querySelector('#notice').textContent.includes('Perlu Ditinjau'));
    assert.equal(proposals, 1);
    assert.equal(await page.$eval('#ai-question', (element) => element.value), '');
    assert.deepEqual(errors, []);
    console.log('PASS AI answer is advice only; proposal uses doctor text and enters review separately');
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });

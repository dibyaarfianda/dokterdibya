// Local, memory-only fixture for exercising the production Planning UI in the in-app browser.
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const app = express();
const publicRoot = path.resolve(__dirname, '../../../public');
app.use(express.json());
let billing, planning, writes;
function reset() {
    billing = { status: 'draft', billing_data: { notes: 'Fixture only' }, items: [
        { id: 11, item_type: 'obat', item_code: 'QA1', item_name: 'Obat Fixture A', quantity: 10,
            item_data: { obatId: 1, unit: 'tablet', caraPakai: '1x1', latinSig: 's.d.d. I' } },
        { id: 12, item_type: 'obat', item_code: 'QA2', item_name: 'Obat Fixture B', quantity: 10,
            item_data: { obatId: 2, unit: 'kapsul', caraPakai: '1x1', latinSig: 's.d.d. I' } },
        { id: 13, item_type: 'tindakan', item_code: 'QA3', item_name: 'Tindakan Fixture', quantity: 1, item_data: {} }
    ] };
    planning = { tindakan: 'Tindakan manual', terapi: 'Terapi manual', rencana: 'Rencana manual' };
    writes = [];
}
reset();
app.get('/qa', (req, res) => {
    reset();
    const category = ['obstetri', 'gyn_repro', 'gyn_special'].includes(req.query.category) ? req.query.category : 'obstetri';
    res.type('html').send(`<!doctype html><html lang="id"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Uji Simpan Planning - data fixture lokal</title>
<link rel="stylesheet" href="/staff/public/styles/sunday-clinic.css">
<link rel="stylesheet" href="/staff/public/styles/sunday-clinic-pwa.css">
<style>body{font:15px Arial;padding:20px;color:#243746;max-width:1000px;margin:auto}input,textarea{padding:8px;margin:4px 0;box-sizing:border-box;width:100%}.row{display:flex;gap:12px}.row>div{flex:1}.terapi-item,.sc-card{padding:14px;border:1px solid #ddd;margin-bottom:10px}button{padding:10px;cursor:pointer}#notice{padding:15px;background:#edf6f2;white-space:pre-wrap}#loading-overlay{position:fixed;inset:0;display:none;background:#ffffffd9;align-items:center;justify-content:center}label{display:block}small{font-size:13px}#planning-tindakan-quick-select,.sc-docboard-plan-actions,#btn-input-tindakan,#btn-reset-tindakan,#btn-input-terapi,#btn-template-obat,#btn-reset-terapi,[data-previous-planning]{display:none}</style>
<h2>Planning — ${category}</h2><p>Data fixture lokal. Tidak terhubung ke rekam medis produksi.</p>
<div id="sunday-clinic-content"></div><div id="notice" role="status">Siap diuji</div>
<details><summary>Bukti penyimpanan fixture</summary><pre id="evidence"></pre></details>
<div id="loading-overlay"><span class="loading-message"></span></div>
<script>window.getToken=()=> 'fixture';window.routeMrSlug='TEST001';</script>
<script src="/staff/public/scripts/prescription-sig.js"></script>
<script src="/staff/public/scripts/sunday-clinic/utils/planning-helpers.js"></script>
<script type="module">
import plan from '/staff/public/scripts/sunday-clinic/components/shared/plan.js';
import state from '/staff/public/scripts/sunday-clinic/utils/state-manager.js';
import app from '/qa-main.js';
const snapshot=await (await fetch('/qa/status')).json();
state.setState({currentMrId:'TEST001',activeSection:'plan',recordData:{record:{mrId:'TEST001',mr_category:'${category}',visit_location:'klinik_private'},planning:snapshot.planning}});
document.body.classList.toggle('mobile-app-mode',new URLSearchParams(location.search).has('mobile'));
document.getElementById('sunday-clinic-content').innerHTML=await plan.render(state.getState());
app.requireAccountPermission=async()=>true;app.scheduleMetadataRefresh=()=>{};
async function notice(type,message){document.getElementById('notice').textContent=type+': '+message;document.getElementById('evidence').textContent=JSON.stringify(await (await fetch('/qa/status')).json(),null,2);}
app.showSuccess=message=>notice('success',message);app.showError=message=>notice('error',message);window.showToast=notice;
document.getElementById('save-plan').addEventListener('click',()=>app.savePlanningObstetri());
window.__qa={plan,state,app};
try{await plan.afterRender(state.getState());}catch(e){console.warn('afterRender',e);}
await window.renderTerapiItemsList();
await window.renderTindakanItemsList();
</script></html>`);
});
app.get('/qa-main.js', (req, res) => {
    const source = fs.readFileSync(path.join(publicRoot, 'scripts/sunday-clinic/main.js'), 'utf8');
    res.type('js').send(`import apiClient from '/staff/public/scripts/sunday-clinic/utils/api-client.js';
import stateManager from '/staff/public/scripts/sunday-clinic/utils/state-manager.js';
import { SECTIONS } from '/staff/public/scripts/sunday-clinic/utils/constants.js';
import { computeKontrolDate } from '/staff/public/scripts/sunday-clinic/utils/kontrol-schedule.js';
${source.slice(source.indexOf('class SundayClinicApp {'), source.indexOf('// Export singleton instance'))}
export default new SundayClinicApp();`);
});
app.get('/staff/public/scripts/vps-auth-v2.js', (req, res) => res.type('js').send("export const TOKEN_KEY='fixture';export const auth={};export const hasPermission=()=>true;export const getIdToken=async()=>'fixture';"));
app.get('/qa/status', (req, res) => res.json({ billing, planning, writes }));
app.get('/api/sunday-clinic/billing/TEST001', (req, res) => res.json({ success: true, data: billing }));
app.post('/api/sunday-clinic/billing/TEST001', (req, res) => {
    writes.push({ type: 'billing', body: req.body });
    billing = { ...billing, items: req.body.items.map((item, index) => ({ ...item, id: 21 + index })) };
    res.json({ success: true, data: { billingId: 1, mrId: 'TEST001' } });
});
app.post('/api/medical-records', (req, res) => {
    writes.push({ type: 'planning', body: req.body });
    planning = req.body.data;
    res.json({ success: true, version: 1, data: { id: 1, mr_id: 'TEST001', patient_id: 'fixture', record_data: planning } });
});
app.patch('/api/medical-records/1', (req, res) => {
    writes.push({ type: 'planning', body: req.body });
    for (const change of req.body.changes) planning[change.path.slice(1)] = change.after;
    res.json({ success: true, version: 2, data: { id: 1, mr_id: 'TEST001', patient_id: 'fixture', record_data: planning } });
});
app.use('/staff/public', express.static(publicRoot));
app.use('/api', (req, res) => res.status(404).json({ success: false, message: 'Fixture route unavailable' }));
const server = app.listen(4178, '127.0.0.1', () => {
    console.log('Planning fixture: http://127.0.0.1:4178/qa');
    if (process.argv.includes('--kontrol-test')) {
        runKontrolScenario().then(
            () => { console.log('PASS kontrol scenario'); server.close(); process.exit(0); },
            (error) => { console.error('FAIL kontrol scenario:', error.message); server.close(); process.exit(1); }
        );
    }
});

// `node planning-save-all-fixture.cjs --kontrol-test` drives the "Kontrol berikutnya" picker headlessly.
async function runKontrolScenario() {
    const assert = require('node:assert/strict');
    const puppeteer = require('puppeteer');
    const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'],
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined });
    try {
        const page = await browser.newPage();
        page.on('pageerror', (error) => console.log('pageerror:', error.message));
        await page.goto('http://127.0.0.1:4178/qa', { waitUntil: 'networkidle0' });
        await page.waitForSelector('#save-plan');
        await page.waitForSelector('#planning-kontrol', { timeout: 5000 });
        const status = async () => (await fetch('http://127.0.0.1:4178/qa/status')).json();
        const summary = () => page.$eval('#planning-kontrol-summary', (el) => el.textContent.trim());
        const save = async () => {
            await page.evaluate(() => { document.getElementById('notice').textContent = ''; });
            await page.click('#save-plan');
            await page.waitForFunction(() => /^(success|error)/.test(document.getElementById('notice').textContent), { timeout: 10000 });
            const notice = await page.$eval('#notice', (el) => el.textContent);
            assert.match(notice, /^success/, notice);
        };

        await page.$eval('#planning-datetime', (el) => {
            el.value = '2026-11-07T09:00';
            el.dispatchEvent(new Event('input', { bubbles: true }));
        });
        assert.equal(await summary(), '', 'summary empty before a choice');
        assert.equal(await page.$eval('#planning-kontrol-date-manual', (el) => el.hidden), true);

        await page.click('label[data-kontrol-interval="2_minggu"]');
        assert.match(await summary(), /^Kontrol ≈ .*21 November 2026$/);
        assert.equal(await page.$eval('#planning-kontrol-interval', (el) => el.value), '2_minggu');
        await save();
        let state = await status();
        const first = state.writes.filter((w) => w.type === 'planning')[0].body;
        assert.equal(first.data.kontrol_interval, '2_minggu');
        assert.equal(first.data.kontrol_date, '2026-11-21');

        // Saved form is not reported as unsaved (symmetric kontrol keys on both sides).
        const unsaved = await page.evaluate(async () => {
            const { hasUnsavedPlanning } = await import('/staff/public/scripts/sunday-clinic/utils/docboard-planning.js');
            return hasUnsavedPlanning(window.__qa.app.getPlanningFormData(), window.__qa.app.getPersistedPlanningData());
        });
        assert.equal(unsaved, false, 'freshly saved planning must not be unsaved');

        // Re-render with the saved data: the 2_minggu button comes back active.
        await page.evaluate(async (planning) => {
            const { plan, state } = window.__qa;
            state.setState({ recordData: { ...state.getState().recordData, planning } });
            document.getElementById('sunday-clinic-content').innerHTML = await plan.render(state.getState());
            await plan.afterRender(state.getState());
            document.getElementById('save-plan').addEventListener('click', () => window.__qa.app.savePlanningObstetri());
            await window.renderTerapiItemsList();
            await window.renderTindakanItemsList();
        }, state.planning);
        assert.equal(await page.$eval('label[data-kontrol-interval="2_minggu"]', (el) => el.classList.contains('active')), true);
        assert.equal(await page.$eval('#planning-kontrol-interval', (el) => el.value), '2_minggu');
        assert.match(await summary(), /21 November 2026$/);

        await page.click('label[data-kontrol-interval="tanggal"]');
        assert.equal(await page.$eval('#planning-kontrol-date-manual', (el) => el.hidden), false);
        await page.$eval('#planning-kontrol-date-manual', (el) => {
            el.value = '2026-12-01';
            el.dispatchEvent(new Event('input', { bubbles: true }));
        });
        assert.match(await summary(), /1 Desember 2026$/);
        await save();
        state = await status();
        assert.equal(state.planning.kontrol_interval, 'tanggal');
        assert.equal(state.planning.kontrol_date, '2026-12-01');

        await page.click('label[data-kontrol-interval="tidak_perlu"]');
        assert.equal(await summary(), '');
        assert.equal(await page.$eval('#planning-kontrol-date-manual', (el) => el.hidden), true);
        await save();
        state = await status();
        assert.equal(state.planning.kontrol_interval, 'tidak_perlu');
        assert.equal(state.planning.kontrol_date, '');
    } finally {
        await browser.close();
    }
}

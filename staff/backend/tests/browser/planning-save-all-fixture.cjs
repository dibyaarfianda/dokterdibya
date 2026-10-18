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
await window.renderTerapiItemsList();
await window.renderTindakanItemsList();
</script></html>`);
});
app.get('/qa-main.js', (req, res) => {
    const source = fs.readFileSync(path.join(publicRoot, 'scripts/sunday-clinic/main.js'), 'utf8');
    res.type('js').send(`import apiClient from '/staff/public/scripts/sunday-clinic/utils/api-client.js';
import stateManager from '/staff/public/scripts/sunday-clinic/utils/state-manager.js';
import { SECTIONS } from '/staff/public/scripts/sunday-clinic/utils/constants.js';
${source.slice(source.indexOf('class SundayClinicApp {'), source.indexOf('// Export singleton instance'))}
export default new SundayClinicApp();`);
});
app.get('/staff/public/scripts/vps-auth-v2.js', (req, res) => res.type('js').send("export const TOKEN_KEY='fixture';"));
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
app.listen(4178, '127.0.0.1', () => console.log('Planning fixture: http://127.0.0.1:4178/qa'));

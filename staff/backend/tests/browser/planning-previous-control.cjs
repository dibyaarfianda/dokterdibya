const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const express = require('express');
const puppeteer = require('puppeteer');

const publicRoot = path.resolve(__dirname, '../../../public');
const app = express();
const active = { mrId: 'DRD0104', patientId: 'qa-patient', mr_category: 'obstetri',
    visit_location: 'klinik_private', createdAt: '2026-10-05T10:00:00+07:00' };
const previous = { mr_id: 'DRD0103', mr_category: 'gyn_special', visit_location: 'klinik_private',
    visit_date: '2026-10-04T09:00:00+07:00' };
let scenario = 'normal';
let releaseRecord = null;
const requests = [];
const errors = [];
app.get('/qa', (req, res) => res.send(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/admin-lte@3.2.0/dist/css/adminlte.min.css">
<link rel="stylesheet" href="/staff/public/styles/sunday-clinic.css">
<link rel="stylesheet" href="/staff/public/styles/sunday-clinic-pwa.css">
<style>body{padding:16px}#sunday-clinic-content{max-width:1100px;margin:auto}</style>
<body class="sunday-clinic-embedded-active"><div id="sunday-clinic-content"></div>
<script>window.getToken=()=> 'fixture';window.getAuthToken=window.getToken;</script>
<script type="module">
import plan from '/staff/public/scripts/sunday-clinic/components/shared/plan.js';
import manager from '/staff/public/scripts/sunday-clinic/utils/state-manager.js';
window.plan=plan;window.manager=manager;
window.mount=async(record, mobile=false)=>{
    const state={currentMrId:record.mrId,activeSection:'plan',recordData:{...record,planning:{terapi:'Manual aktif',rencana:'Rencana aktif'}},patientData:{id:record.patientId},medicalRecords:null};
    manager.setState(state);document.body.classList.toggle('mobile-app-mode',mobile);
    const root=document.getElementById('sunday-clinic-content');root.innerHTML=await plan.render(state);
    root.querySelectorAll('.sc-card').forEach(el=>el.classList.add('sc-pwa-card'));
    window.historyLoaded=plan.afterRender ? Promise.resolve(plan.afterRender(state)) : Promise.resolve();
};
</script>`));
// Isolate automatic sign-in; the real API client and HTTP requests remain in use.
app.get('/staff/public/scripts/vps-auth-v2.js', (req, res) => res.type('application/javascript').send("export const TOKEN_KEY='fixture-auth';"));
app.use('/api', (req, res, next) => {
    requests.push({ method: req.method, path: req.path, cache: req.headers['cache-control'] });
    if (req.headers.authorization !== 'Bearer fixture') return res.status(401).end();
    next();
});
app.get('/api/sunday-clinic/patient-visits/:patientId', (req, res) => {
    if (scenario === 'visits-error') return res.status(503).json({ message: 'unavailable' });
    if (scenario === 'missing-current') return res.json({success:true,data:[previous]});
    res.json({ success: true, data: scenario === 'new-patient' ? [] : [
        {mr_id: 'DRD0106', visit_location: 'klinik_private', visit_date: '2026-10-06T10:00:00+07:00'},
        {mr_id: 'DRD0105', visit_location: 'rsia_melinda', visit_date: '2026-10-05T09:30:00+07:00'},
        {...previous, mr_id: active.mrId, visit_date: active.createdAt},
        previous,
        {...previous, mr_id: 'DRD0102', visit_date: '2026-10-03T09:00:00+07:00'}
    ] });
});
app.get('/api/sunday-clinic/records/:mrId', async (req, res) => {
    if (scenario === 'slow') await new Promise(resolve => { releaseRecord = resolve; });
    if (scenario === 'record-error') return res.status(503).json({ message: 'unavailable' });
    res.json({ success: true, data: {
        record: {...active, mrId: previous.mr_id, mr_category: previous.mr_category},
        medicalRecords: { byType: { planning: { id: 11, version: 2, data: scenario === 'empty' ? {} :
            scenario === 'legacy' ? {obat:['Vitamin lama','Suplemen lama'],instruksi:['Instruksi lama']} :
            scenario === 'long-text' ? {terapi:'Terapi panjang '.repeat(300),rencana:'InstruksiPanjang'.repeat(300)} :
            {terapi:'Terapi manual lama\nTeks <script> tidak dieksekusi',rencana:'Kontrol sesuai catatan sebelumnya'} } } }
    } });
});
app.get('/api/sunday-clinic/billing/:mrId', (req, res) => {
    if (scenario === 'billing-error') return res.status(503).json({ message: 'unavailable' });
    res.json({success:true, data: scenario === 'empty' || scenario === 'legacy' ? null : {items:[
        {item_type:'obat',item_name:'Obat sebelumnya',quantity:12,item_data:{caraPakai:'2x1 sesudah makan'}},
        {item_type:'tindakan',item_name:'Tindakan tidak ditampilkan',quantity:1,item_data:{}}
    ]}});
});
app.use('/staff/public', express.static(publicRoot));

(async () => {
    const server = await new Promise(resolve => { const s = app.listen(0,'127.0.0.1',()=>resolve(s)); });
    const browser = await puppeteer.launch({headless:true, executablePath:process.env.CHROME_PATH ||
        (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : undefined)});
    const out = process.env.PLANNING_QA_OUTPUT || path.join(os.tmpdir(), 'dokterdibya-planning-qa');
    fs.mkdirSync(out, {recursive:true});
    try {
        const page = await browser.newPage();
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(`http://127.0.0.1:${server.address().port}/qa`);
        await page.waitForFunction(()=>typeof window.mount === 'function');
        async function mount(category='obstetri', mobile=false, wait=true, record=active) {
            await page.evaluate(async ({record, category, mobile}) => {
                await window.mount({...record,mr_category:category},mobile);
            }, {record,category,mobile});
            assert.equal(await page.$$eval('.sc-planning-history', els=>els.length), record.visit_location === 'klinik_private' ? 2 : 0,
                'Planning must always render both previous-control panels');
            if (wait) await page.evaluate(()=>window.historyLoaded);
        }
        async function panel(kind) { return page.$eval(`[data-planning-history="${kind}"]`, el=>el.textContent); }
        for (const category of ['obstetri','gyn_repro','gyn_special']) {
            for (const {width,mobile} of [{width:1440,mobile:false},{width:992,mobile:false},
                {width:991,mobile:false},{width:390,mobile:true},{width:430,mobile:true},{width:1200,mobile:true}]) {
                await page.setViewport({width,height:900});
                await mount(category,mobile);
                assert.match(await panel('terapi'), /Obat sebelumnya[\s\S]*12[\s\S]*2x1 sesudah makan/);
                assert.match(await panel('terapi'), /Terapi manual lama/);
                assert.match(await panel('terapi'), /04 Okt 2026[\s\S]*DRD0103/);
                assert.match(await panel('rencana'), /Kontrol sesuai catatan sebelumnya/);
                assert.doesNotMatch(await panel('terapi'), /Tindakan tidak ditampilkan/);
                assert.equal(await page.$('[data-planning-history] script'), null);
                const geometry = await page.evaluate(() => {
                    const rect=el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,bottom:r.bottom};};
                    return ['terapi','rencana'].map(kind=>({field:rect(document.getElementById('planning-'+kind)),
                        panel:rect(document.querySelector('[data-planning-history="'+kind+'"]')),
                        overflow:document.documentElement.scrollWidth>innerWidth}));
                });
                for (const {field,panel,overflow} of geometry) {
                    assert.equal(overflow,false,`No horizontal overflow at ${width}`);
                    if (width>=992 && !mobile) {
                        assert.ok(panel.x>=field.x+field.width-1,'Desktop reference belongs beside textarea');
                        assert.ok(Math.abs(field.width/panel.width-2)<0.12,'Desktop columns use 2:1 widths');
                    } else {
                        assert.ok(panel.y>=field.bottom-1,'Mobile reference belongs below textarea');
                        assert.ok(Math.abs(panel.width-field.width)<2,'Mobile reference uses textarea width');
                    }
                }
                assert.equal(await page.$eval('#planning-terapi',el=>el.value),'Manual aktif');
                assert.equal(await page.$eval('#planning-rencana',el=>el.value),'Rencana aktif');
                if (category==='obstetri' && [1440,390].includes(width)) {
                    await page.screenshot({path:path.join(out,`${mobile?'mobile':'desktop'}.png`),fullPage:true});
                }
            }
        }
        console.log('PASS: all three templates, desktop 2:1 and mobile/PWA below textarea');
        for (const mode of ['new-patient','empty','legacy','visits-error','billing-error','record-error']) {
            scenario=mode;await mount();
            if (mode==='new-patient') assert.match(await panel('terapi'),/Belum ada kontrol sebelumnya/);
            if (mode==='empty') {
                assert.match(await panel('terapi'),/Tidak ada terapi/);
                assert.match(await panel('rencana'),/Tidak ada rencana/);
            }
            if (mode==='legacy') {
                assert.match(await panel('terapi'),/Vitamin lama[\s\S]*Suplemen lama/);
                assert.match(await panel('rencana'),/Instruksi lama/);
            }
            if (mode==='visits-error') assert.match(await panel('rencana'),/Gagal memuat/);
            if (mode==='billing-error') {
                assert.match(await panel('terapi'),/Terapi manual lama/);
                assert.match(await panel('terapi'),/Gagal memuat daftar obat/);
                assert.match(await panel('rencana'),/Kontrol sesuai catatan sebelumnya/);
            }
            if (mode==='record-error') {
                assert.match(await panel('terapi'),/Obat sebelumnya/);
                assert.match(await panel('rencana'),/Gagal memuat/);
            }
        }
        console.log('PASS: empty, first control, legacy arrays and independent failures');
        scenario='long-text';await page.setViewport({width:390,height:844});await mount('gyn_special',true);
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
        assert.ok((await panel('rencana')).includes('InstruksiPanjang'.repeat(300)), 'Long history remains fully readable');
        scenario='slow';await mount('obstetri',false,false);
        await page.$eval('#planning-terapi',el=>{el.value='Edit manual dipertahankan';});
        while (!releaseRecord) await new Promise(resolve=>setTimeout(resolve,5));
        releaseRecord();await page.evaluate(()=>window.historyLoaded);
        assert.equal(await page.$eval('#planning-terapi',el=>el.value),'Edit manual dipertahankan');
        releaseRecord=null;await mount('obstetri',false,false);
        while (!releaseRecord) await new Promise(resolve=>setTimeout(resolve,5));
        await page.evaluate(()=>window.manager.setState({activeSection:'diagnosis'}));
        releaseRecord();await page.evaluate(()=>window.historyLoaded);
        assert.doesNotMatch(await panel('terapi'),/Obat sebelumnya/,'Do not update an inactive section');
        // Replace the entire form, then complete the old response.
        releaseRecord=null;await mount('obstetri',false,false);
        while (!releaseRecord) await new Promise(resolve=>setTimeout(resolve,5));
        const oldRequest=releaseRecord;
        scenario='new-patient';await mount('gyn_repro',false,true,{...active,mrId:'DRD0200',patientId:'another-patient'});
        oldRequest();await new Promise(resolve=>setTimeout(resolve,80));
        assert.match(await panel('terapi'),/Belum ada kontrol sebelumnya/);
        assert.doesNotMatch(await panel('terapi'),/Obat sebelumnya/);
        scenario='normal';await mount('obstetri',false,true,{...active,visit_location:'rsia_melinda'});
        assert.equal(await page.$$eval('.sc-planning-history',els=>els.length),0);
        assert.ok(requests.every(req=>req.method==='GET'),'History never writes clinical data');
        assert.ok(requests.every(req=>req.cache==='no-cache'),'History requests must be fresh');
        assert.ok(!requests.some(req=>/DRD010[256]/.test(req.path)),'Never read other-location, future or older visits');
        assert.deepEqual(errors,[]);
        console.log('PASS: manual edits, stale responses, private-only scope and read-only fresh requests');
        console.log(`Screenshots: ${out}`);
    } finally {
        await browser.close();await new Promise(resolve=>server.close(resolve));
    }
})().catch(error=>{console.error(error.stack);process.exitCode=1;});

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
let currentBilling = {status:'draft',items:[]};
let activeBillingMode = 'normal';
let releaseActiveBilling = null;
let prescriptionError = false;
let delayPrescription = false;
let releasePrescription = null;
const requests = [];
const errors = [];
app.use(express.json());
app.get('/qa', (req, res) => res.send(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/admin-lte@3.2.0/dist/css/adminlte.min.css">
<link rel="stylesheet" href="/staff/public/styles/sunday-clinic.css">
<link rel="stylesheet" href="/staff/public/styles/sunday-clinic-pwa.css">
<style>body{padding:16px}#sunday-clinic-content{max-width:1100px;margin:auto}</style>
<body class="sunday-clinic-embedded-active"><div id="sunday-clinic-content"></div>
<script>window.getToken=()=> 'fixture';window.getAuthToken=window.getToken;</script>
<script src="/staff/public/scripts/sunday-clinic/utils/planning-helpers.js"></script>
<script type="module">
import plan from '/staff/public/scripts/sunday-clinic/components/shared/plan.js';
import manager from '/staff/public/scripts/sunday-clinic/utils/state-manager.js';
window.plan=plan;window.manager=manager;
document.getElementById('sunday-clinic-content').addEventListener('input',()=>manager.markDirty());
window.mount=async(record, mobile=false)=>{
    const state={currentMrId:record.mrId,activeSection:'plan',recordData:{...record,planning:{terapi:'Manual aktif',rencana:'Rencana aktif'}},patientData:{id:record.patientId},medicalRecords:null};
    manager.setState({...state,isDirty:false});window.routeMrSlug=record.mrId;document.body.classList.toggle('mobile-app-mode',mobile);
    const root=document.getElementById('sunday-clinic-content');root.innerHTML=await plan.render(state);
    root.querySelectorAll('.sc-card').forEach(el=>el.classList.add('sc-pwa-card'));
    window.historyLoaded=plan.afterRender ? Promise.resolve(plan.afterRender(state)) : Promise.resolve();
};
</script>`));
// Isolate automatic sign-in; the real API client and HTTP requests remain in use.
app.get('/staff/public/scripts/vps-auth-v2.js', (req, res) => res.type('application/javascript').send("export const TOKEN_KEY='fixture-auth';"));
app.use('/api', (req, res, next) => {
    requests.push({ method: req.method, path: req.path, cache: req.headers['cache-control'],body:req.body });
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
app.get('/api/sunday-clinic/billing/:mrId', async (req, res) => {
    if(req.params.mrId===active.mrId) {
        if(activeBillingMode==='slow') await new Promise(resolve=>{releaseActiveBilling=resolve;});
        if(activeBillingMode==='error') return res.status(503).json({message:'Gagal memuat resep aktif'});
        return res.json({success:true,data:currentBilling});
    }
    if (scenario === 'billing-error') return res.status(503).json({ message: 'unavailable' });
    res.json({success:true, data: scenario === 'empty' || scenario === 'legacy' ? null : {items:[
        {id:10,item_type:'obat',item_code:'QA7',item_name:'Obat sebelumnya',quantity:12,
            item_data:{obatId:7,...(scenario==='invalid-prescription' ? {} : {unit:'kapsul'}),caraPakai:'2x1 sesudah makan',latinSig:'b.i.d. p.c.'}},
        ...(scenario==='reuse' ? [{id:12,item_type:'obat',item_code:'QA8',item_name:'Obat kedua',quantity:30,
            item_data:JSON.stringify({obatId:8,unit:'tablet',caraPakai:'1x1 malam',latinSig:'q.d. nocte'})}] : []),
        {item_type:'tindakan',item_name:'Tindakan tidak ditampilkan',quantity:1,item_data:{}}
    ]}});
});
app.post('/api/sunday-clinic/billing/:mrId/obat',async(req,res)=>{
    if(delayPrescription) await new Promise(resolve=>{releasePrescription=resolve;});
    if(prescriptionError) return res.status(409).json({message:'Tagihan tidak dapat diubah'});
    assert.equal(req.params.mrId,active.mrId,'Prescription must target the active DRD, never its source');
    for(const item of req.body.items) currentBilling.items.push({id:100+currentBilling.items.length,item_type:'obat',
        item_name:item.name,quantity:item.quantity,item_data:{obatId:item.obatId,unit:item.unit,caraPakai:item.caraPakai,latinSig:item.latinSig}});
    if(activeBillingMode==='error-after-post') activeBillingMode='error';
    res.json({success:true,data:{mrId:req.params.mrId,billingId:1}});
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

        // A missing reuse action or wrong payload must fail these tests. All writes target this fixture server.
        scenario='reuse';await page.setViewport({width:390,height:844});await mount('gyn_repro',true);
        await page.evaluate(()=>window.renderTindakanItemsList());
        assert.match(await page.$eval('#tindakan-items-container',el=>el.textContent),/Belum ada tindakan/,
            'Existing tindakan list still loads normally');
        assert.equal(await page.$$eval('[data-use-previous-planning]',els=>els.length),2,
            'Both history panels provide an explicit reuse action');
        const therapyButton='[data-use-previous-planning="terapi"]';
        const planButton='[data-use-previous-planning="rencana"]';
        await page.click(therapyButton);
        await page.waitForFunction(()=>document.querySelector('[data-planning-history="terapi"] [data-planning-history-feedback]')?.textContent.includes('dipakai'));
        const writes=()=>requests.filter(req=>req.method==='POST');
        assert.equal(writes().length,1);
        assert.deepEqual(writes()[0].body.items,[
            {obatId:7,name:'Obat sebelumnya',quantity:12,unit:'kapsul',caraPakai:'2x1 sesudah makan',latinSig:'b.i.d. p.c.'},
            {obatId:8,name:'Obat kedua',quantity:30,unit:'tablet',caraPakai:'1x1 malam',latinSig:'q.d. nocte'}
        ]);
        const expectedManual='Manual aktif\nTerapi manual lama\nTeks <script> tidak dieksekusi';
        assert.equal(await page.$eval('#planning-terapi',el=>el.value),expectedManual);
        assert.match(await page.$eval('#terapi-items-container',el=>el.textContent),/Obat kedua/,
            'Reused prescription is visible in the editable active therapy list');
        assert.equal(await page.evaluate(()=>window.manager.getState().isDirty),true);
        await page.click(therapyButton);
        assert.equal(writes().length,1,'Repeat clicks do not double the prescription');
        assert.equal(await page.$eval('#planning-terapi',el=>el.value),expectedManual);
        await page.click(planButton);await page.click(planButton);
        assert.equal(await page.$eval('#planning-rencana',el=>el.value),'Rencana aktif\nKontrol sesuai catatan sebelumnya');
        assert.equal(writes().length,1,'Using a plan only changes its editable draft');
        await page.screenshot({path:path.join(out,'reuse-mobile.png'),fullPage:true});
        await page.setViewport({width:1440,height:900});await mount('obstetri');
        await page.screenshot({path:path.join(out,'reuse-desktop.png'),fullPage:true});

        // Reopening the form must not duplicate an existing drug or replace its edited dose/directions.
        currentBilling.items[0].quantity=5;currentBilling.items[0].item_data.caraPakai='Edit dokter';
        await mount('gyn_special',true);await page.click(therapyButton);
        await page.waitForFunction(()=>document.querySelector('[data-planning-history="terapi"] [data-planning-history-feedback]')?.textContent.includes('dipakai'));
        assert.equal(writes().length,1,'Current billing prevents duplicate drugs after remount');
        assert.equal(currentBilling.items[0].quantity,5);
        assert.equal(currentBilling.items[0].item_data.caraPakai,'Edit dokter');

        // Names still prevent duplicates for legacy active items without an obatId.
        currentBilling={status:'draft',items:[{id:50,item_type:'obat',item_name:'Obat sebelumnya',quantity:3,
            item_data:{unit:'kapsul',caraPakai:'Cara pakai aktif'}},
            {id:51,item_type:'obat',item_name:'Obat aktif lain',quantity:6,item_data:{}}]};
        await mount('obstetri');await page.evaluate(()=>window.renderTerapiItemsList());
        await page.$eval('#terapi-quantity-50',el=>{el.value='99';});
        await page.$eval('#terapi-cara-pakai-50',el=>{el.value='Edit cara pakai belum disimpan';});
        delayPrescription=true;await page.click(therapyButton);
        while(!releasePrescription) await new Promise(resolve=>setTimeout(resolve,5));
        await page.$eval(therapyButton,el=>el.click());
        await page.$eval('#planning-terapi',el=>{el.value='Edit selama resep diproses';});
        delayPrescription=false;releasePrescription();releasePrescription=null;
        await page.waitForFunction(()=>document.querySelector('[data-planning-history="terapi"] [data-planning-history-feedback]')?.textContent.includes('dipakai'));
        assert.equal(writes().length,2,'A click during prescription saving cannot issue another POST');
        assert.deepEqual(writes()[1].body.items,[{obatId:8,name:'Obat kedua',quantity:30,unit:'tablet',caraPakai:'1x1 malam',latinSig:'q.d. nocte'}]);
        assert.equal(currentBilling.items[0].quantity,3,'Existing prescription stays intact');
        assert.equal(currentBilling.items[1].item_name,'Obat aktif lain');
        assert.equal(await page.$eval('#terapi-quantity-50',el=>el.value),'99','List refresh preserves unsaved quantity edits');
        assert.equal(await page.$eval('#terapi-cara-pakai-50',el=>el.value),'Edit cara pakai belum disimpan');
        assert.equal(await page.$eval('#planning-terapi',el=>el.value),'Edit selama resep diproses\nTerapi manual lama\nTeks <script> tidak dieksekusi');

        currentBilling={status:'draft',items:[]};prescriptionError=true;await mount();await page.click(therapyButton);
        await page.waitForFunction(()=>document.querySelector('[data-planning-history="terapi"] [data-planning-history-feedback]')?.textContent.includes('Tagihan tidak dapat diubah'));
        assert.equal(await page.$eval('#planning-terapi',el=>el.value),'Manual aktif','Failed prescription does not apply manual therapy');
        assert.equal(await page.$eval(therapyButton,el=>el.disabled),false,'Failed action can be retried');
        prescriptionError=false;activeBillingMode='error';await page.click(therapyButton);
        await page.waitForFunction(()=>document.querySelector('[data-planning-history="terapi"] [data-planning-history-feedback]')?.textContent.includes('Gagal memuat resep aktif'));
        assert.equal(writes().length,3,'Do not prescribe if the active billing cannot be read');

        // Duplicate clicks while checking billing and navigation before a late response cannot issue a write.
        activeBillingMode='slow';await mount('obstetri',false);await page.click(therapyButton);
        while(!releaseActiveBilling) await new Promise(resolve=>setTimeout(resolve,5));
        await page.$eval(therapyButton,el=>el.click());
        scenario='new-patient';await mount('gyn_repro',true,true,{...active,mrId:'DRD0200',patientId:'another-patient'});
        activeBillingMode='normal';releaseActiveBilling();releaseActiveBilling=null;
        await new Promise(resolve=>setTimeout(resolve,80));
        assert.equal(writes().length,3,'Late action for a replaced form is cancelled before writing');
        assert.equal(await page.$eval('#planning-terapi',el=>el.value),'Manual aktif');
        for(const mode of ['empty','new-patient','billing-error','record-error']) {
            scenario=mode;await mount();
            const therapyEnabled=await page.$eval(therapyButton,el=>!el.disabled);
            assert.equal(therapyEnabled,false,'Incomplete or empty therapy cannot be reused');
            assert.equal(await page.$eval(planButton,el=>!el.disabled),mode==='billing-error',
                'A complete nonempty plan can be reused independently of billing failure');
        }
        scenario='legacy';await mount();await page.click(therapyButton);
        assert.equal(await page.$eval('#planning-terapi',el=>el.value),'Manual aktif\nVitamin lama\nSuplemen lama');
        assert.equal(writes().length,3,'Manual-only therapy does not create structured prescription items');
        scenario='invalid-prescription';await mount();await page.click(therapyButton);
        await page.waitForFunction(()=>document.querySelector('[data-planning-history="terapi"] [data-planning-history-feedback]')?.textContent.includes('Data obat sebelumnya tidak lengkap'));
        assert.equal(writes().length,3,'Do not invent a missing medication unit');
        assert.equal(await page.$eval('#planning-terapi',el=>el.value),'Manual aktif');
        scenario='reuse';currentBilling={status:'draft',items:[]};activeBillingMode='error-after-post';
        await mount();await page.click(therapyButton);
        await page.waitForFunction(()=>document.querySelector('[data-planning-history="terapi"] [data-planning-history-feedback]')?.textContent.includes('Terapi dipakai, tetapi daftar obat belum termuat'));
        assert.equal(currentBilling.items.length,2,'A list refresh failure does not undo a saved prescription');
        assert.equal(await page.$eval(therapyButton,el=>el.disabled),true,'Saved prescription cannot be double-added after refresh failure');
        assert.equal(writes().length,4);
        assert.ok(writes().every(req=>req.path===`/sunday-clinic/billing/${active.mrId}/obat`));
        assert.deepEqual(errors,[]);
        console.log('PASS: explicit reuse, exact prescription payload, preserved edits, repeat-click safety, errors and stale actions');
        console.log(`Screenshots: ${out}`);
    } finally {
        await browser.close();await new Promise(resolve=>server.close(resolve));
    }
})().catch(error=>{console.error(error.stack);process.exitCode=1;});

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const puppeteer = require('puppeteer');
const root = path.resolve(__dirname, '../../../..');
assert.ok(fs.existsSync(path.join(root,'staff/public/scripts/pages/template-resep-page.js')), 'Dedicated template editor must exist');
const app = express(); app.use(express.json());
const meds = [{id:7,name:'Obat Aktif',unit:'pcs',is_active:1},{id:8,name:'Obat Nonaktif',unit:'tablet',is_active:0}];
let templates = [{id:1,name:'Template Awal',updated_at:'2026-09-22T01:00:00Z',items:[{obatId:7,name:'Nama tersimpan',quantity:30,unit:'tablet',caraPakai:'',latinSig:''},{obatId:8,name:'Obat Nonaktif',quantity:1,unit:'tablet',caraPakai:'',latinSig:''},{obatId:999,name:'Obat Hilang',quantity:2,unit:'botol',caraPakai:'manual',latinSig:'manual'}]}];
let failSave=false, nextId=2, writes=[];
app.get('/staff/public/scripts/vps-auth-v2.js',(req,res)=>res.type('js').send('export async function getIdToken(){return "test";}'));
app.get('/api/obat',(req,res)=>res.json({success:true,data:meds}));
app.get('/api/sunday-clinic/prescription-templates',(req,res)=>res.json({success:true,data:templates}));
app.post('/api/sunday-clinic/prescription-templates',(req,res)=>{if(failSave)return res.status(500).json({message:'Gagal'}); const data={...req.body,id:nextId++}; templates.push(data);writes.push(data);res.status(201).json({success:true,data});});
app.put('/api/sunday-clinic/prescription-templates/:id',(req,res)=>{if(failSave)return res.status(500).json({message:'Gagal'});const data={...req.body,id:Number(req.params.id)}; templates=templates.map(t=>t.id===data.id?data:t);writes.push(data);res.json({success:true,data});});
app.delete('/api/sunday-clinic/prescription-templates/:id',(req,res)=>{templates=templates.filter(t=>t.id!==Number(req.params.id));res.json({success:true});});
app.get('/qa',(req,res)=>res.send('<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/admin-lte@3.2/dist/css/adminlte.min.css"></head><body><a id="bell" href="#" data-toggle="dropdown">Notifikasi</a><a id="leave" href="/away">Keluar</a><main id="template-resep-page" style="padding:16px">'+fs.readFileSync(path.join(root,'staff/public/fragments/pages/template-resep-page.html'),'utf8')+'</main><script>window.currentStaffUser={role_id:1};window.activateRegisteredStaffPage=async()=>{};</script><script type="module">import {showTemplateResepPage} from "/staff/public/scripts/pages/template-resep-page.js";showTemplateResepPage();</script></body></html>'));
app.use('/staff/public',express.static(path.join(root,'staff/public')));
(async()=>{ const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));}); const browser=await puppeteer.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'}); try {
 const page=await browser.newPage();const errors=[],api=[];let accept=true;page.on('dialog',d=>accept?d.accept():d.dismiss());page.on('pageerror',e=>{errors.push(e.message);console.error('PAGE',e.message);});page.on('requestfailed',r=>console.error('REQUEST',r.url(),r.failure()?.errorText));page.on('request',r=>{if(r.url().includes('/api/'))api.push(r.url());});await page.setViewport({width:1400,height:1000});await page.goto('http://127.0.0.1:'+server.address().port+'/qa',{waitUntil:'domcontentloaded',timeout:60000});await page.waitForSelector('[data-rx-action="edit"]');
 await page.click('[data-rx-action="edit"]');assert.equal(await page.$eval('[data-rx-field="quantity"]',n=>n.value),'30');assert.equal(await page.$eval('[data-rx-field="caraPakai"]',n=>n.value),'');const warnings=await page.$eval('#rx-items',n=>n.textContent);assert.match(warnings,/berbeda/);assert.match(warnings,/nonaktif/i);assert.match(warnings,/tidak ditemukan/i);
 await page.$eval('#rx-name',n=>{n.value='Template Diedit';n.dispatchEvent(new Event('input',{bubbles:true}));});await page.click('#bell');assert.equal(await page.$eval('#rx-editor',n=>n.hidden),false,'Notification toggle must retain dirty editor');accept=false;await page.click('#leave');assert.match(page.url(),/qa#?$/);accept=true;
 failSave=true;await page.click('[data-rx-action="save"]');await page.waitForFunction(()=>document.querySelector('#rx-status').textContent.includes('gagal'));assert.equal(await page.$eval('#rx-name',n=>n.value),'Template Diedit');failSave=false;
 await page.click('[data-rx-action="save"]');await page.waitForFunction(()=>document.querySelector('#rx-status').textContent.includes('tersimpan'));assert.equal(writes[0].items[0].quantity,30);assert.equal(writes[0].items[0].caraPakai,'');assert.equal(writes[0].items[0].name,'Nama tersimpan');
 await page.click('[data-rx-action="duplicate"]');await page.click('[data-rx-action="save"]');await page.waitForFunction(()=>document.querySelector('#rx-status').textContent.includes('tersimpan'));assert.equal(templates.length,2);
 await page.type('#rx-search','Obat Hilang');assert.equal(await page.$$eval('[data-rx-action="edit"]',ns=>ns.length),2);
 await page.click('[data-rx-action="new"]');await page.type('#rx-name','Template Baru');await page.select('#rx-master','7');await page.click('[data-rx-action="add"]');await page.$eval('[data-rx-field="quantity"]',n=>{n.value='45';n.dispatchEvent(new Event('input',{bubbles:true}));});await page.type('[data-rx-field="caraPakai"]','2x1 setelah makan');await page.click('[data-rx-action="save"]');await page.waitForFunction(()=>document.querySelector('#rx-status').textContent.includes('tersimpan'));assert.equal(writes.at(-1).items[0].latinSig,'b.d.d I p.c');assert.equal(writes.at(-1).items[0].quantity,45);
 await page.$eval('#rx-search',n=>{n.value='';n.dispatchEvent(new Event('input',{bubbles:true}));});await page.click('[data-rx-action="deactivate"]');await page.waitForFunction(()=>document.querySelector('#rx-status').textContent.includes('dinonaktifkan'));assert.equal(templates.length,2);
 await page.click('[data-rx-action="reload"]');await page.waitForFunction(()=>document.querySelector('#rx-status').textContent.includes('dimuat'));await page.click('[data-rx-action="edit"]');
 // Legacy edit roundtrip must preserve custom units and fractional quantities.
 await page.evaluate(() => {
  const host=document.createElement('div');host.innerHTML='<div id="batch-cara-pakai-body"></div>';document.body.appendChild(host);
  window.$=()=>({modal(){}});window.staffRoleConstants={ROLE_IDS:{DOKTER:1}};
 });
 await page.addScriptTag({url:'/staff/public/scripts/sunday-clinic/utils/planning-helpers.js'});
 const legacy = await page.evaluate(() => {
  showBatchCaraPakaiModal([{id:7,name:'Uji',quantity:1.5,unit:'pcs',caraPakai:''}]);
  return collectCurrentPrescriptionItems()[0];
 });
 assert.equal(legacy.unit,'pcs');assert.equal(legacy.quantity,1.5);assert.equal(legacy.caraPakai,'');
 await page.evaluate(()=>document.querySelector('#batch-cara-pakai-body').parentElement.remove());
 const out=path.join(root,'tmp/template-resep');fs.mkdirSync(out,{recursive:true});await page.screenshot({path:path.join(out,'desktop.png'),fullPage:true});await page.setViewport({width:390,height:844});await page.screenshot({path:path.join(out,'mobile.png'),fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));assert.deepEqual(errors,[]);assert.ok(api.every(u=>u.includes('/api/obat')||u.includes('/api/sunday-clinic/prescription-templates')));console.log('PASS template editor CRUD, duplicate, warnings, quantity45, blank sig, shared sig, dirty guard, failure preservation, reload, mobile, no patient APIs');
 } finally {await browser.close();server.close();}})().catch(e=>{console.error(e);process.exitCode=1;});

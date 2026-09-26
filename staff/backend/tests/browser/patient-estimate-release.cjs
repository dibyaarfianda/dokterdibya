// Portal navigation and estimate UI with synthetic patient profile; --live-auth reads only real published estimate API.
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),puppeteer=require('puppeteer');
const {buildPreview}=require('../../services/EstimasiBiayaDraft');
const publicRoot=path.resolve(__dirname,'../../../../public'),origin='https://sisiwanita.id';
const authIndex=process.argv.indexOf('--live-auth'),liveAuth=authIndex>=0?JSON.parse(fs.readFileSync(process.argv[authIndex+1],'utf8')):null;
const live=!!liveAuth||process.argv.includes('--live');
const liveAnnouncements=!!liveAuth&&process.argv.includes('--live-announcements');
const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.webp':'image/webp'};
const fixture={...buildPreview({aliases:{7:'Suplemen contoh'},trimesters:Object.fromEntries(['t1','t2','t3'].map(k=>[k,{template_id:8,repeats:1,medications:[{obat_id:7,name:'SECRET DRUG',quantity:30,unit:'pcs'}],services:[{tindakan_id:9,quantity:1,repeats:1}]}]))},{medications:[{id:7,name:'SECRET DRUG',price:1500,unit:'pcs',is_active:1}],templates:[{id:8}],services:[{id:9,name:'USG',price:100000,category:'LAYANAN',is_active:1},{id:1,price:15000,is_active:1},{id:3,price:25000,is_active:1},{id:59,price:25000,is_active:1}]}),is_published:true};
(async()=>{
 const browser=await puppeteer.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try{
 const page=await browser.newPage();await page.setBypassServiceWorker(true);await page.setViewport({width:390,height:844});
 const errors=[],mutations=[];let fail=false;
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept('Bunda Uji'));
 await page.evaluateOnNewDocument(token=>document.addEventListener('DOMContentLoaded',()=>{
  if(window.PatientSession&&!window.PatientSession.getToken()){
   window.PatientSession.setToken(token,{persistent:true});window.PatientSession.setUser({id:'QA-ESTIMATE',full_name:'Pasien Uji',intake_completed:true},{persistent:true});
  }
 },{once:true}),liveAuth?.token||'synthetic-only');
 await page.setRequestInterception(true);page.on('request',async req=>{
  const u=new URL(req.url());
  if(u.pathname.startsWith('/api/')){
   if(req.method()!=='GET')mutations.push(u.pathname);
   if(liveAnnouncements&&req.method()==='GET'&&['/api/announcements/active','/api/patient-notifications/with-announcements'].includes(u.pathname))return req.continue();
   if(u.pathname==='/api/patient/estimasi-biaya'){
    if(fail)return req.respond({status:503,contentType:'application/json',body:'{}'});
    if(liveAuth)return req.continue();
    return req.respond({status:200,contentType:'application/json',body:JSON.stringify({success:true,preview:fixture})});
   }
   let data={success:true,data:[],notifications:[],announcements:[],sessions:[],bookings:[],count:0};
   if(u.pathname==='/api/patients/profile')data={user:{id:'QA-ESTIMATE',full_name:'Pasien Uji',intake_completed:true}};
   if(u.pathname==='/api/patients/portal-settings')data={success:true,settings:{nickname:'Bunda Uji',notification_sound:'soft'}};
   return req.respond({status:200,contentType:'application/json',body:JSON.stringify(data)});
  }
  if(!live&&u.origin===origin){const file=path.resolve(publicRoot,'.'+decodeURIComponent(u.pathname));
   if(file.startsWith(publicRoot+path.sep)&&fs.existsSync(file)&&fs.statSync(file).isFile())return req.respond({status:200,contentType:mime[path.extname(file)]||'application/octet-stream',body:fs.readFileSync(file)});
   return req.respond({status:404,body:''});
  }return req.continue();
 });
 await page.goto(origin+'/patient-menu.html',{waitUntil:'networkidle2'});
 await page.waitForFunction(()=>document.body.classList.contains('home-sections-unlocked'));
 assert.equal(await page.$eval('.tap-card[data-shell-sheet="aplikasi"] .application-new-badge',n=>n.textContent),'NEW');
 assert.equal(await page.$eval('.bottom-nav [data-shell-sheet="aplikasi"] .application-new-badge',n=>n.textContent),'NEW');
 assert.equal(await page.$$eval('[data-ruang-baca-badge]',ns=>ns.length),0);
 assert.ok(await page.$$eval('[data-application-new-badge]',ns=>ns.every(n=>getComputedStyle(n).display!=='none'&&n.getBoundingClientRect().width>0)));
 const out=path.resolve(publicRoot,'../tmp/estimate-release');fs.mkdirSync(out,{recursive:true});
 if(liveAnnouncements){
  await page.waitForFunction(()=>Array.from(document.querySelectorAll('.announcement-mini-btn')).some(n=>n.textContent.includes('Aplikasi Baru: Estimasi Biaya Kontrol Kehamilan')));
  await page.evaluate(()=>Array.from(document.querySelectorAll('.announcement-mini-btn')).find(n=>n.textContent.includes('Aplikasi Baru: Estimasi Biaya Kontrol Kehamilan')).click());
  await page.waitForFunction(()=>document.querySelector('#topbar-modal-body')?.textContent.includes('Sudah punya buku'));
  assert.ok(await page.$eval('#topbar-modal-body',n=>n.textContent.includes('trimester 2 atau 3')));
  await page.screenshot({path:path.join(out,'live-announcement.png')});
  await page.click('[data-shell-action="close-topbar-modal"]');
 }
 await page.$eval('.tap-card[data-shell-sheet="aplikasi"]',n=>n.scrollIntoView({block:'center'}));
 await page.waitForFunction(()=>document.body.classList.contains('home-actions-settled')&&getComputedStyle(document.querySelector('.tap-card[data-shell-sheet="aplikasi"]')).opacity==='1');
 await page.$eval('.tap-card[data-shell-sheet="aplikasi"]',n=>n.scrollIntoView({block:'center',behavior:'instant'}));
 await page.screenshot({path:path.join(out,live?'live-home.png':'local-home.png')});
 await page.click('.bottom-nav [data-shell-sheet="edukasi"]');
 assert.equal(await page.$$eval('#sheet-menu .feature-new-badge',ns=>ns.length),0);
 await page.click('#sheet-overlay',{offset:{x:10,y:10}});
 await page.click('.bottom-nav [data-shell-sheet="aplikasi"]');
 await page.waitForSelector('#sheet-menu a[href="/estimasi-biaya-kehamilan.html"]');
 assert.deepEqual(await page.$$eval('#sheet-menu .feature-new-badge',ns=>ns.map(n=>[n.closest('a').getAttribute('href'),n.textContent])),[['/estimasi-biaya-kehamilan.html','NEW']]);
 await page.screenshot({path:path.join(out,live?'live-applications.png':'local-applications.png')});
 await Promise.all([page.waitForNavigation({waitUntil:'networkidle2'}),page.click('#sheet-menu a[href="/estimasi-biaya-kehamilan.html"]')]);
 await page.waitForSelector('#estimate-help-done');assert.equal(await page.$eval('#shell-modal-title',n=>n.textContent),'Cara Menggunakan');
 await page.focus('#shell-modal-close');await page.keyboard.press('Escape');
 await page.waitForFunction(()=>!document.getElementById('shell-modal').classList.contains('active'));
 assert.equal(await page.$eval('[data-tool-nav="aplikasi"] .application-new-badge',n=>n.textContent),'NEW');
 assert.equal(await page.$$eval('[data-ruang-baca-badge]',ns=>ns.length),0);
 assert.ok(await page.$eval('.estimate-banner',n=>!n.textContent.includes('Pratinjau')));
 assert.equal(await page.$eval('[data-estimate="trimester"]',n=>n.value),'t1');
 assert.ok(await page.$$eval('input[type="number"]',ns=>ns.length>0&&ns.every(n=>n.value==='0')));
 assert.equal(await page.$eval('#estimate-total',n=>n.textContent),'Rp 0');
 await page.select('[data-estimate="trimester"]','all');
 const change=(sel,value)=>page.$eval(sel,(n,v)=>{n.value=v;n.dispatchEvent(new Event('change',{bubbles:true}));},value);
 for(const [i,k] of ['t1','t2','t3'].entries()){
  await change('[data-estimate="repeat"][data-key="'+k+'"]',liveAuth?[3,3,1][i]:1);
  await change('[data-estimate="visits"][data-key="'+k+'"]',liveAuth?[3,3,5][i]:1);
 }
 const keys=await page.$$eval('[data-estimate="service"]',ns=>ns.map(n=>n.dataset.key));
 for(const [i,k] of keys.entries())await change('[data-estimate="service"][data-key="'+k+'"]',liveAuth?[1,2,2,1,1,2][i]:1);
 assert.equal(await page.$eval('#estimate-total',n=>n.textContent),liveAuth?'Rp 4.061.500':'Rp 505.000');
 assert.equal(await page.$eval('#estimate-app',n=>(n.innerText.match(/Rp\s/g)||[]).length),1);
 assert.equal(await page.$$eval('#estimate-app [id="estimate-total"]',ns=>ns.length),1);
 assert.equal(await page.$$eval('#estimate-app strong',ns=>ns.filter(n=>n.textContent.includes('Rp ')).length),1);
 await page.select('[data-estimate="book"]','owned');
 assert.equal(await page.$$eval('#estimate-app strong',ns=>ns.filter(n=>n.textContent.includes('Rp ')).length),1);
 assert.equal(await page.$eval('#estimate-total',n=>n.textContent),liveAuth?'Rp 4.036.500':'Rp 480.000');
 for(const k of ['t1','t2','t3']){
  await page.select('[data-estimate="trimester"]',k);
  assert.ok(await page.$('.estimate-book'));
  assert.equal(await page.$eval('[data-estimate="book"]',n=>n.value),'owned');
  assert.equal(await page.$$eval('#estimate-app strong',ns=>ns.filter(n=>n.textContent.includes('Rp ')).length),1);
  await page.select('[data-estimate="book"]','obstetri');
  assert.equal(await page.$$eval('#estimate-app [id="estimate-total"]',ns=>ns.length),1);
 assert.equal(await page.$$eval('#estimate-app strong',ns=>ns.filter(n=>n.textContent.includes('Rp ')).length),1);
  await page.select('[data-estimate="book"]','owned');
 }
 await page.$eval('.estimate-book',n=>n.scrollIntoView({block:'center',behavior:'instant'}));
 await page.screenshot({path:path.join(out,live?'live-owned-book-t3.png':'local-owned-book-t3.png')});
 await page.select('[data-estimate="trimester"]','all');
 await page.select('[data-estimate="book"]','obstetri');
 assert.doesNotMatch(await page.$eval('#estimate-app',n=>n.innerHTML),/SECRET|template_name|obat_id|caraPakai/);
 await page.$eval('.estimate-book',n=>n.scrollIntoView({block:'center'}));await page.screenshot({path:path.join(out,live?'live-phone.png':'local-phone.png')});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.setViewport({width:1280,height:900});await page.screenshot({path:path.join(out,live?'live-desktop.png':'local-desktop.png')});
 await page.reload({waitUntil:'networkidle2'});await page.waitForSelector('#estimate-total');
 assert.ok(await page.$eval('#shell-modal',n=>!n.classList.contains('active')).catch(()=>true));
 await page.click('[data-estimate="help"]');assert.ok(await page.$eval('#shell-modal',n=>n.classList.contains('active')));await page.focus('#shell-modal-close');await page.keyboard.press('Escape');
 await page.click('[data-tool-nav="aplikasi"]');assert.equal(await page.$$eval('#sheet-menu a[href="/estimasi-biaya-kehamilan.html"]',ns=>ns.length),1);
 fail=true;await page.reload({waitUntil:'networkidle2'});await page.waitForFunction(()=>document.querySelector('#estimate-app button')?.textContent==='Coba lagi');assert.equal(await page.$('#estimate-total'),null);
 fail=false;await page.click('#estimate-app button');await page.waitForSelector('#estimate-total');assert.equal(await page.$eval('#estimate-total',n=>n.textContent),'Rp 0');
 assert.deepEqual(errors,[]);assert.ok(mutations.every(p=>/guest-events|portal-settings|analytics|track/.test(p)),JSON.stringify(mutations));
 console.log('PASS '+(live?'LIVE':'LOCAL')+': Home Aplikasi -> estimate; authenticated published contract; zero defaults; all-trimester meds/services/admin/one book; first/reopened help and Escape; reload; network failure/retry; mobile/desktop; no clinical writes.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

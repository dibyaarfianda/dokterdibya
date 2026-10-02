const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const puppeteer = require('puppeteer');

const publicRoot = path.resolve(__dirname, '../../../public');
const html = fs.readFileSync(path.join(publicRoot, 'index-adminlte.html'), 'utf8');
const main = fs.readFileSync(path.join(publicRoot, 'scripts/main.js'), 'utf8');
const showPage = main.slice(main.indexOf('function showBookingSettingsPage()'), main.indexOf('function showBirthClassPage()'));
const bookingHtml = html.slice(html.indexOf('<!-- BOOKING SETTINGS PAGE'), html.indexOf('<!-- KELAS DR. DIBYA PAGE'));
const version = /STAFF_PWA_VERSION = '(v\d+)'/.exec(fs.readFileSync(path.join(publicRoot, 'sw.js'), 'utf8'))[1];
const app = express();
let failModule = false;
const requests = [];
app.get('/qa', (req, res) => res.send(`<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><style>.d-none{display:none}</style>${bookingHtml}<script>
window.getAuthToken=()=> 'fixture'; window.currentStaffUser={role_id:1};
const pages={bookingSettings:document.getElementById('booking-settings-page')};
function hideAllPages(){} function setTitleAndActive(){}
</script><script type="module">
import * as roles from '/staff/public/scripts/role-constants.js';window.staffRoleConstants=roles;
import {importWithVersion,showBookingSettingsLoadError} from '/staff/public/scripts/shell/module-helpers.js';
${showPage} window.showBookingSettingsPage=showBookingSettingsPage;
</script><script src="/staff/public/scripts/shell/actions.js?v=${version}"></script>`));
app.get('/api/booking-settings', (req, res) => res.json({success:true, settings:[{id:1,session_number:1,session_name:'Sesi QA',day_of_week:0,start_time:'09:00',end_time:'10:00',slot_duration:15,max_slots:4,is_active:1,break_start_time:null,break_duration_minutes:null}]}));
app.get('/api/booking-settings/bookings', (req, res) => res.json({success:true, bookings:[]}));
app.use('/staff/public', (req, res, next) => {
  requests.push(req.originalUrl);
  if (failModule && req.path.endsWith('/kelola-booking-settings.js')) return res.status(404).end();
  if (req.query.v && req.query.v !== version) return res.status(404).end();
  next();
}, express.static(publicRoot));

(async () => {
  const server = await new Promise(resolve => {const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  const browser = await puppeteer.launch({headless:true,executablePath:process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  try {
    const page = await browser.newPage();
    await page.setViewport({width:390,height:844,isMobile:true,hasTouch:true});
    const url = `http://127.0.0.1:${server.address().port}/qa`;
    await page.goto(url);
    await page.waitForFunction(() => typeof window.showBookingSettingsPage === 'function');
    await page.evaluate(() => {window.showBookingSettingsPage();});
    await page.waitForFunction(() => document.querySelector('#booking-settings-container').textContent.includes('Sesi QA'), {timeout:4000});
    assert.match(await page.$eval('#bookings-container', el => el.textContent), /Tidak ada booking aktif/);
    console.log('PASS: active-release module renders sessions and bookings on mobile');
    for (const roleId of [1,24,22,null]) {
      await page.evaluate(roleId => {window.currentStaffUser=roleId?{role_id:roleId}:null;window.openMobileMenu();}, roleId);
      const labels = await page.$$eval('#dynamic-mobile-menu a', links=>links.map(el=>el.textContent.trim()));
      assert.equal(labels.includes('Booking Setting'), roleId===1, `Booking menu visibility for role ${roleId}`);
      if (roleId===1) {
        await page.evaluate(() => {window.showBookingSettingsPage=()=>{window.bookingMenuOpened=true;};});
        await page.evaluate(() => [...document.querySelectorAll('#dynamic-mobile-menu a')].find(el=>el.textContent.trim()==='Booking Setting').click());
        assert.equal(await page.evaluate(()=>window.bookingMenuOpened), true);
        assert.equal(await page.$('#dynamic-mobile-menu'), null);
      } else await page.evaluate(()=>window.closeMobileMenu());
    }
    console.log('PASS: only doctor sees Booking Setting and its click opens the page');
    failModule = true;
    const failure = await browser.newPage();
    await failure.goto(url);
    await failure.waitForFunction(() => typeof window.showBookingSettingsPage === 'function');
    await failure.evaluate(() => {window.showBookingSettingsPage();});
    await failure.waitForFunction(() => document.querySelector('#booking-settings-container').textContent.includes('Gagal'), {timeout:4000});
    assert.match(await failure.$eval('#bookings-container', el=>el.textContent), /Gagal/);
    assert.equal(await failure.$('#booking-settings-container .fa-spinner'), null);
    console.log('PASS: failed module displays recovery instead of endless loading in both panels');
  } finally {
    await browser.close();
    await new Promise(resolve=>server.close(resolve));
  }
})().catch(error=>{console.error(error.message);process.exitCode=1;});

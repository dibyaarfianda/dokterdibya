/* Real iframe and production Staff Panel auth bridge; synthetic APIs only.
   --live checks deployed assets and the real Nginx redirect boundary. */
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const live = process.argv.includes('--live');
const root = path.resolve(__dirname, '../../../..');
const origin = 'https://dokterdibya.com';
const token = 'synthetic.' + Buffer.from(JSON.stringify({ id: 'QA-STAFF', role: 'dokter', user_type: 'staff', name: 'Staf Uji' })).toString('base64url') + '.test';
const room = { id: 1, slug: 'lobby', name: 'Lobby', color: '#258353', member_count: 2 };
const fixture = { id: 1, room_id: 1, sender_id: 'QA-PATIENT', sender_type: 'patient', sender_nickname: 'Bunda Uji', message: 'Pesan uji iframe staf', created_at: '2026-09-23T15:00:00+07:00' };

(async () => {
    const main = live ? await (await fetch(origin + '/staff/public/scripts/main.js?_embedQA=' + Date.now())).text() : fs.readFileSync(path.join(root, 'staff/public/scripts/main.js'), 'utf8');
    const bridge = main.slice(main.indexOf('function sendCommunityChatStaffToken('), main.indexOf('function setTitleAndActive('));
    const launch = main.slice(main.indexOf('function showCommunityChatPage('), main.indexOf('function openCommunityChatPopup('));
    const patientDetail = main.slice(main.indexOf('async function showPatientDetail('), main.indexOf('async function showNewVisitModal('));
    assert.ok(patientDetail);
    assert.ok(bridge && launch, 'Use the actual Staff Panel launch and auth bridge');
    const browser = await puppeteer.launch({ headless: true, executablePath: process.env.BROWSER_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
    try {
        for (const legacy of [false, true]) {
            const context = await browser.createBrowserContext();
            const page = await context.newPage();
            const errors = [], requests = [];
            await page.setViewport({ width: 1280, height: 800 });
            await page.setBypassServiceWorker(true);
            page.on('pageerror', error => errors.push(error.message));
            await page.setRequestInterception(true);
            page.on('request', req => {
                const url = new URL(req.url());
                if (url.pathname === '/staff/community-embed-test') {
                    const preloaded = legacy ? ' src="/community-chat.html?embed=staff"' : '';
                    const html = '<!doctype html><div id="community-chat-page"><iframe id="staff-community-chat-frame" style="width:100%;height:700px"' + preloaded + '></iframe></div><script src="https://cdn.jsdelivr.net/npm/jquery@3.6.0/dist/jquery.min.js"></script><script src="https://cdn.jsdelivr.net/npm/bootstrap@4.6.2/dist/js/bootstrap.bundle.min.js"></script><script>' +
                        'const pages={communityChat:document.getElementById("community-chat-page")};' +
                        'const getAuthToken=()=> ' + JSON.stringify(token) + ';' +
                        'function hideAllPages(){} function setTitleAndActive(){} function bindCommunityChatViewportSync(){} function syncCommunityChatFrameHeight(){}' +
                        'function isSuperadminUser(){return false;} function buildSundayClinicAppUrl(id){return "/staff/public/sunday-clinic.html?mr="+id;}' +
                        bridge + launch + patientDetail + 'showCommunityChatPage();</script>';
                    return req.respond({ contentType: 'text/html', body: html });
                }
                if (url.pathname.startsWith('/api/')) {
                    requests.push({ path: url.pathname, auth: req.headers().authorization });
                    let data = { success: true };
                    if (url.pathname === '/api/admin/web-patients/QA-PATIENT') data.data = {
                        patient: { id: 'QA-PATIENT', full_name: 'Pasien Uji Lengkap', email: 'qa@example.test', phone: '080000000', status: 'active' },
                        intake: { payload: { full_name: 'Pasien Uji Lengkap', address: 'Alamat Uji' }, status: 'verified' }
                    };
                    if (url.pathname === '/api/sunday-clinic/patient-visits/QA-PATIENT') data.data = [{ mr_id: 'DRD-QA', visit_date: '2026-09-23', visit_location: 'klinik_private', mr_category: 'obstetri', status: 'finalized' }];
                    if (url.pathname.includes('/profiles/')) data.profile = { display_name: 'Staf Profil Uji', user_type: 'staff', nickname: 'Staf Uji', bio: 'Bio uji' };
                    if (url.pathname.endsWith('/me/profile')) data.profile = { nickname: 'Staf Uji' };
                    if (url.pathname.endsWith('/rooms')) Object.assign(data, { rooms: [room], permissions: { can_create_room: true } });
                    if (url.pathname.endsWith('/messages')) Object.assign(data, { room, messages: [fixture, { ...fixture, id: 2, sender_id: 'QA-OTHER-STAFF', sender_type: 'staff', sender_nickname: 'Staf Lain' }] });
                    if (url.pathname.endsWith('/members')) Object.assign(data, { members: [{ user_id: fixture.sender_id, user_type: 'patient', display_name: 'Bunda Uji' }], summary: { total_members: 1 } });
                    return req.respond({ contentType: 'application/json', body: JSON.stringify(data) });
                }
                if (url.pathname.includes('socket.io') && url.pathname.endsWith('.js')) return req.respond({ contentType: 'application/javascript', body: 'window.io=()=>({on(){},emit(){},disconnect(){}});' });
                if (url.origin === 'https://cdn.jsdelivr.net') return req.continue();
                if (url.origin !== origin && url.origin !== 'https://sisiwanita.id') return req.abort();
                if (!live) {
                    const file = path.resolve(root, 'public', '.' + url.pathname);
                    if (!file.startsWith(path.join(root, 'public') + path.sep) || !fs.existsSync(file)) return req.respond({ status: 404, body: '' });
                    const type = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' }[path.extname(file)] || 'application/octet-stream';
                    return req.respond({ contentType: type, body: fs.readFileSync(file) });
                }
                req.continue();
            });
            await page.goto(origin + '/staff/community-embed-test', { waitUntil: 'networkidle2' });
            const frame = await (await page.$('#staff-community-chat-frame')).contentFrame();
            assert.equal(new URL(frame.url()).origin, origin, 'Embedded chat must stay on Staff Panel origin for its auth bridge');
            await frame.waitForSelector('.msg-row', { timeout: 7000 });
            assert.match(await frame.$eval('#messages', el => el.textContent), /Pesan uji iframe staf/);
            assert.equal(await frame.$eval('body', el => el.classList.contains('embed-staff')), true);
            assert.equal(requests.find(req => req.path.endsWith('/rooms')).auth, 'Bearer ' + token);
            await frame.type('#message-input', '@Bunda');
            await frame.waitForSelector('#mention-list button');
            assert.match(await frame.$eval('#mention-list', el => el.textContent), /Bunda Uji/);
            await frame.click('.msg-user');
            await page.waitForSelector('#patientDetailModal.show', { timeout: 4000 });
            const details = await page.$eval('#patientDetailModal', el => el.textContent);
            for (const text of ['Pasien Uji Lengkap', 'Alamat Uji', 'DRD-QA']) assert.ok(details.includes(text), 'Detail contains ' + text);
            assert.ok(frame.url().includes('/community-chat.html'), 'Patient details must not navigate the chat to login');
            assert.equal(requests.find(req => req.path === '/api/admin/web-patients/QA-PATIENT').auth, 'Bearer ' + token);
            await page.evaluate(() => window.$('#patientDetailModal').modal('hide'));
            await frame.click('.msg-row[data-id="2"] .msg-user');
            await frame.waitForFunction(() => document.getElementById('name')?.textContent === 'Staf Profil Uji', { timeout: 7000 });
            assert.equal(new URL(frame.url()).origin, origin, 'Staff profile keeps the staff origin');
            assert.equal(requests.find(req => req.path === '/api/community-chat/profiles/staff/QA-OTHER-STAFF').auth, 'Bearer ' + token);
            await frame.click('.back-btn');
            await frame.waitForSelector('.msg-row', { timeout: 7000 });
            assert.ok(frame.url().includes('embed=staff'), 'Return to embedded chat retains staff session');
            assert.deepEqual(errors, []);
            console.log(JSON.stringify({ assets: live ? 'deployed' : 'local', mode: legacy ? 'legacy embed URL' : 'Staff Panel launcher', result: 'PASS same-origin iframe, staff auth, room/messages rendered, mention picker, full patient details with staff session' }));
            await context.close();
        }
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

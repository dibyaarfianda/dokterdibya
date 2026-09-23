/* Synthetic API/browser regression: no real patients or push recipients.
   Run with --live to verify served production assets using the same isolated fixtures. */
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const puppeteer = require('puppeteer');
const live = process.argv.includes('--live');
const root = path.resolve(__dirname, '../../../../public');
const origin = 'https://sisiwanita.id';
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.json': 'application/json' };
const user = { id: 'QA-P1', user_type: 'patient', role: 'patient', full_name: 'Synthetic Patient', email: 'private@example.test', intake_completed: true };
const token = 'synthetic.' + Buffer.from(JSON.stringify(user)).toString('base64url') + '.test';
const rooms = [{ id: 1, slug: 'lobby', name: 'Lobby', color: '#258353', member_count: 3 }, { id: 2, slug: 'other', name: 'Other', color: '#258353' }];
const member = { user_id: 'QA-P2', user_type: 'patient', display_name: 'Bunda Anggrek' };
const makeMessage = (id, extra = {}) => ({ id, room_id: 1, sender_id: 'QA-P2', sender_type: 'patient', sender_nickname: 'Bunda Anggrek', message: 'Pesan pengujian ' + id, created_at: '2026-09-23T10:00:00+07:00', ...extra });
const socketScript = 'window.__chatHandlers = {}; window.__emitted = []; window.io = () => ({ on(name, fn) { (window.__chatHandlers[name] ||= []).push(fn); }, emit(name, payload) { window.__emitted.push({ name, payload }); }, disconnect() {} });';
(async () => {
    const browser = await puppeteer.launch({ headless: true, executablePath: process.env.BROWSER_PATH || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : puppeteer.executablePath()) });
    try {
        for (const width of [390, 1280]) {
            const context = await browser.createBrowserContext();
            const page = await context.newPage();
            const errors = [], sent = [], reads = [], authHeaders = [];
            let messages = Array.from({ length: 45 }, (_, i) => makeMessage(i + 1));
            let unread = 105, failUnread = false, latestContext = false, failContext = false;
            await page.setViewport({ width, height: 844 });
            await page.setBypassServiceWorker(true);
            await page.evaluateOnNewDocument((token, user) => {
                localStorage.setItem('vps_auth_token', token);
                localStorage.setItem('patient_user', JSON.stringify(user));
                localStorage.setItem('patient_portal_nickname:' + user.id, 'Mama Uji');
            }, token, user);
            page.on('pageerror', error => errors.push(error.message));
            page.on('dialog', async dialog => dialog.accept('Mama Uji'));
            await page.setRequestInterception(true);
            page.on('request', req => {
                const url = new URL(req.url());
                if (url.pathname.includes('socket.io') && url.pathname.endsWith('.js')) return req.respond({ contentType: 'application/javascript', body: socketScript });
                if (url.pathname.startsWith('/api/')) {
                    if (url.pathname === '/api/community-chat/rooms') authHeaders.push(req.headers().authorization);
                    let data = { success: true, data: [], notifications: [], announcements: [], sessions: [], bookings: [], count: 0 };
                    if (url.pathname === '/api/patients/profile') data = { user };
                    if (url.pathname === '/api/patients/portal-settings') data = { success: true, settings: { nickname: 'Mama Uji' } };
                    if (url.pathname.endsWith('/me/profile')) data = { success: true, profile: { nickname: 'Mama Uji' } };
                    if (url.pathname === '/api/community-chat/rooms') data = { success: true, rooms, permissions: { can_create_room: true } };
                    if (url.pathname.endsWith('/members')) data = { success: true, members: [member, { ...member, user_id: 'QA-P3' }], summary: { total_members: 2 } };
                    if (url.pathname.endsWith('/messages')) {
                        if (req.method() === 'POST') {
                            const body = JSON.parse(req.postData()); sent.push(body);
                            const message = makeMessage(100 + sent.length, { message: body.message, mentions: body.mentions, sender_id: 'QA-P1', sender_nickname: 'Mama Uji',
                                reply: body.reply_to_message_id ? { id: body.reply_to_message_id, sender: 'Bunda Anggrek', text: 'Pesan asli' } : null });
                            messages.push(message);
                            data = { success: true, message };
                        } else data = { success: true, room: rooms.find(room => url.pathname.includes('/' + room.slug + '/')) || rooms[0], messages };
                    }
                    if (url.pathname.endsWith('/context')) {
                        if (failContext) return req.respond({ status: 404, contentType: 'application/json', body: JSON.stringify({ success: false, message: 'Pesan sudah dihapus' }) });
                        data = { success: true, messages: latestContext ? messages.slice(-20) : [makeMessage(1), makeMessage(2)], latest_message_id: latestContext ? messages.at(-1).id : 101 };
                    }
                    if (url.pathname.endsWith('/read')) { reads.push({ path: url.pathname, ...JSON.parse(req.postData()) }); data = { success: true }; }
                    if (url.pathname === '/api/community-chat/unread') {
                        if (failUnread) return req.respond({ status: 503, contentType: 'application/json', body: '{}' });
                        data = { success: true, total: unread, rooms: [] };
                    }
                    return req.respond({ contentType: 'application/json', body: JSON.stringify(data) });
                }
                if (!live && url.origin === origin) {
                    const file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
                    if (!file.startsWith(root + path.sep)) return req.abort();
                    if (fs.existsSync(file) && fs.statSync(file).isFile()) return req.respond({ contentType: mime[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file) });
                    return req.respond({ status: 404, body: '' });
                }
                // External fonts are immaterial to behavior and must not make the smoke flaky.
                if (url.origin !== origin) return req.abort();
                req.continue();
            });
            await page.goto(origin + '/community-chat.html', { waitUntil: 'networkidle2' });
            await page.waitForSelector('.msg-row');
            assert.equal(await page.$$eval('.msg-row', nodes => nodes.length), 45);
            await page.type('#message-input', '@Bunda');
            await page.waitForSelector('#mention-list button');
            await page.keyboard.press('ArrowDown');
            await page.keyboard.press('Enter');
            assert.equal(sent.length, 0, 'Enter chooses mention rather than sending');
            await page.type('#message-input', 'halo');
            await page.click('.msg-row:last-child .msg-quote-action');
            await page.click('#send-btn');
            await page.waitForFunction(() => document.querySelectorAll('.msg-mention').length === 1);
            assert.equal(sent.length, 1);
            assert.equal(sent[0].mentions[0].user_id, 'QA-P3');
            assert.equal(sent[0].reply_to_message_id, 45);
            assert.equal(sent[0].message, '@Bunda Anggrek halo');
            await page.evaluate(() => {
                const payload = { room: 'lobby', user_id: 'QA-P2', user_type: 'patient', user_name: 'Bunda Anggrek' };
                window.__chatHandlers['community:typing'].forEach(fn => fn(payload));
            });
            assert.match(await page.$eval('#typing-indicator', node => node.textContent), /^Bunda Anggrek sedang/);
            assert.ok(!(await page.$eval('#typing-indicator', node => node.textContent)).includes('@'));
            await page.evaluate(() => { document.getElementById('messages').scrollTop = 0; });
            const before = await page.$eval('#messages', node => node.scrollTop);
            await page.evaluate(message => {
                window.__chatHandlers['community:message:new'].forEach(fn => { fn({ room: 'lobby', message }); fn({ room: 'lobby', message }); });
            }, makeMessage(200));
            await page.waitForFunction(() => !document.getElementById('chat-new-messages').hidden);
            assert.equal(await page.$eval('#messages', node => node.scrollTop), before);
            assert.equal(await page.$$eval('.msg-row[data-id="200"]', nodes => nodes.length), 1);
            assert.ok(!reads.some(read => read.message_id === 200), 'reading history must not acknowledge new messages');
            await page.click('#chat-new-messages');
            await page.waitForFunction(() => { const el = document.getElementById('messages'); return el.scrollHeight - el.clientHeight - el.scrollTop < 72; });
            await page.evaluate(() => window.dispatchEvent(new Event('focus')));
            await new Promise(resolve => setTimeout(resolve, 350));
            assert.ok(reads.some(read => read.message_id === 200));
            messages.push(makeMessage(201));
            await page.evaluate(message => window.__chatHandlers['community:message:new'].forEach(fn => fn({ room: 'lobby', message })), makeMessage(202));
            await page.waitForSelector('.msg-row[data-id="202"]');
            await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
            await page.waitForSelector('.msg-row[data-id="201"]', { timeout: 1200 });
            // Trigger actual touch handlers, preserving vertical scroll and quote target.
            await page.evaluate(() => {
                const node = document.querySelector('.msg-row:last-child .msg');
                const fire = (type, x, y) => node.dispatchEvent(new TouchEvent(type, {
                    touches: type === 'touchend' ? [] : [new Touch({ identifier: 1, target: node, clientX: x, clientY: y })], bubbles: true
                }));
                fire('touchstart', 180, 300); fire('touchmove', 120, 301); fire('touchend', 120, 301);
            });
            assert.equal(await page.$eval('#quote-preview', el => el.classList.contains('show')), true);
            await page.setViewport({ width, height: 490 });
            await page.waitForFunction(() => document.querySelector('#send-btn').getBoundingClientRect().bottom <= window.innerHeight + 2);
            await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
            assert.equal(await page.$eval('.msg', node => getComputedStyle(node).transitionDuration), '0s');
            await page.goto(origin + '/community-chat.html?room=lobby&message=1', { waitUntil: 'networkidle2' });
            await page.waitForSelector('.chat-highlight[data-id="1"]');
            assert.equal(await page.$eval('#chat-new-messages', el => el.hidden), false);
            latestContext = true;
            await page.goto(origin + '/community-chat.html?room=lobby&message=101', { waitUntil: 'networkidle2' });
            await page.waitForSelector('.chat-highlight[data-id="101"]');
            await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
            await new Promise(resolve => setTimeout(resolve, 250));
            const ids = await page.$$eval('.msg-row', nodes => nodes.map(node => Number(node.dataset.id)));
            assert.deepEqual(ids, [...ids].sort((a, b) => a - b), 'Context poll must preserve chronology');
            failContext = true;
            await page.click('.msg-quote[data-message-id]');
            await new Promise(resolve => setTimeout(resolve, 250));
            await page.evaluate(message => window.__chatHandlers['community:message:new'].forEach(fn => fn({ room: 'lobby', message })), makeMessage(300));
            await page.waitForSelector('.msg-row[data-id="300"]');
            await page.setViewport({ width, height: 844 });
            await page.goto(origin + '/patient-menu.html', { waitUntil: 'networkidle2' });
            await page.waitForFunction(() => document.getElementById('community-chat-badge')?.textContent === '99+');
            assert.equal(await page.$eval('#community-chat-badge', el => getComputedStyle(el).backgroundColor), 'rgb(35, 134, 83)');
            failUnread = true;
            await page.evaluate(() => window.dispatchEvent(new Event('focus')));
            await new Promise(resolve => setTimeout(resolve, 250));
            assert.equal(await page.$eval('#community-chat-badge', el => el.textContent), '99+');
            failUnread = false; unread = 0;
            await page.evaluate(() => window.dispatchEvent(new Event('focus')));
            await page.waitForFunction(() => document.getElementById('community-chat-badge').hidden);
            unread = 2;
            await page.evaluate(() => window.__chatHandlers['community:rooms:changed'].forEach(fn => fn({})));
            await page.waitForFunction(() => document.getElementById('community-chat-badge').textContent === '2');
            const staffToken = 'synthetic.' + Buffer.from(JSON.stringify({ id: 'QA-S1', user_type: 'staff', role: 'dokter', name: 'Staf Uji' })).toString('base64url') + '.test';
            await page.evaluate(async value => {
                const { docboardSession } = await import('/scripts/docboard-session.js?v=20260923chat1');
                docboardSession.setToken(value);
            }, staffToken);
            await page.goto(origin + '/community-chat.html?staffBridge=1&room=lobby', { waitUntil: 'networkidle2' });
            await page.waitForFunction(() => document.getElementById('status-badge').textContent === 'Admin');
            assert.equal(authHeaders.at(-1), 'Bearer ' + staffToken, 'Staff push selects DocBoard session, never the concurrent patient account');
            assert.deepEqual(errors, []);
            console.log(JSON.stringify({ assets: live ? 'deployed' : 'local', width, sent: sent.length, reads: reads.length, result: 'PASS mentions, quote, nickname, stable scroll, touch, viewport, reduced motion, deep link, green badge and retry' }));
            await context.close();
        }
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

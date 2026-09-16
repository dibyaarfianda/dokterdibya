/* Real browser smoke using synthetic API responses; never accesses patient APIs.
   node staff/backend/tests/browser/portal-nickname-smoke.cjs [--live]
   --live loads deployed assets; default loads local public files at the same origin. */
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const puppeteer = require('puppeteer');
const live = process.argv.includes('--live');
const root = path.resolve(__dirname, '../../../../public');
const origin = 'https://sisiwanita.id';
const mime = { '.html':'text/html', '.js':'application/javascript', '.css':'text/css', '.json':'application/json', '.png':'image/png', '.svg':'image/svg+xml', '.webp':'image/webp' };
(async () => {
    const browser = await puppeteer.launch({ headless: true, executablePath: process.env.BROWSER_PATH || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : puppeteer.executablePath()) });
    try {
        for (const demo of [false, true]) {
            const context = await browser.createBrowserContext();
            const page = await context.newPage();
            await page.setBypassServiceWorker(true);
            await page.setViewport({ width: 390, height: 844 });
            let prompts = 0, puts = 0, profileFailed = false;
            const errors = [];
            const profile = { id: 'QA-NICKNAME-P1', full_name: 'Synthetic Patient', intake_completed: true };
            page.on('pageerror', e => errors.push(e.message));
            page.on('dialog', async dialog => { if (dialog.type() === 'prompt') { prompts++; await dialog.accept('Bunda QA'); } else await dialog.accept(); });
            await page.evaluateOnNewDocument((demo, profile) => {
                document.addEventListener('DOMContentLoaded', () => {
                    if (window.PatientSession && !window.PatientSession.getUser()) {
                        window.PatientSession.setToken('synthetic-browser-test', { persistent: true, demoMode: demo });
                        window.PatientSession.setUser(profile, { persistent: true });
                        window.PatientSession.setDemoMode(demo);
                    }
                }, { once: true });
            }, demo, profile);
            await page.setRequestInterception(true);
            page.on('request', async req => {
                const url = new URL(req.url());
                if (url.pathname.startsWith('/api/')) {
                    let data = { success: true, data: [], notifications: [], announcements: [], sessions: [], bookings: [], count: 0 };
                    if (url.pathname === '/api/patients/profile') {
                        if (profileFailed) return req.respond({ status: 503, contentType: 'application/json', body: '{}' });
                        data = { user: profile };
                    }
                    if (url.pathname === '/api/patients/portal-settings') {
                        if (req.method() === 'PUT') { puts++; data = { success: true, settings: JSON.parse(req.postData()) }; }
                        else data = { success: true, settings: { nickname: null, notification_sound: 'soft' } };
                    }
                    return req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
                }
                if (!live && url.origin === origin) {
                    const file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
                    if (!file.startsWith(root + path.sep)) return req.abort();
                    if (fs.existsSync(file) && fs.statSync(file).isFile()) return req.respond({ status: 200, contentType: mime[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file) });
                    return req.respond({ status: 404, body: '' });
                }
                return req.continue();
            });
            await page.goto(origin + '/patient-menu.html', { waitUntil: 'networkidle2' });
            await page.waitForFunction(() => document.getElementById('hero-title')?.textContent.includes('Bunda'));
            assert.equal(prompts, 1);
            await page.goto(origin + '/kick-counter.html', { waitUntil: 'networkidle2' });
            await page.evaluate(() => window.PatientToolShell.openSettingsModal());
            await page.waitForFunction(() => document.getElementById('portal-nickname')?.value === 'Bunda QA');
            await page.evaluate(() => {
                document.getElementById('portal-nickname').value = 'Mama QA';
                document.getElementById('portal-notification-sound').value = 'bell';
                document.querySelector('[data-shell-action="save-portal-settings"]').click();
            });
            await page.waitForFunction(() => localStorage.getItem('patient_portal_nickname:QA-NICKNAME-P1') === 'Mama QA');
            await page.goto(origin + '/patient-menu.html', { waitUntil: 'networkidle2' });
            await page.waitForFunction(() => document.getElementById('hero-title')?.textContent.startsWith('Mama,'));
            await page.reload({ waitUntil: 'networkidle2' });
            await page.waitForFunction(() => document.getElementById('hero-title')?.textContent.startsWith('Mama,'));
            assert.equal(prompts, 1);
            profileFailed = true;
            await page.reload({ waitUntil: 'networkidle2' });
            await page.waitForFunction(() => document.getElementById('hero-title')?.textContent.startsWith('Mama,'));
            assert.equal(prompts, 1);
            assert.equal(puts, demo ? 0 : 2);
            assert.deepEqual(errors, []);
            console.log(JSON.stringify({ assets: live ? 'deployed' : 'local', demo, prompts, puts, result: 'PASS Home -> tool settings edit -> Home -> refresh -> profile failure', pageErrors: errors }));
            await context.close();
        }
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

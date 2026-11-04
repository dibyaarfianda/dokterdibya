const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const repoRoot = path.resolve(__dirname, '../../../..');
const html = fs.readFileSync(path.join(repoRoot, 'staff/public/index-adminlte.html'), 'utf8');
const sidebar = html.match(/<aside class="main-sidebar[\s\S]*?<\/aside>/)?.[0];
const shellCss = fs.readFileSync(path.join(repoRoot, 'staff/public/styles/staff-shell.css'), 'utf8');
const moduleSource = fs.readFileSync(path.join(repoRoot, 'staff/public/scripts/shell/menu-new-badges.js'), 'utf8')
    .replace(/^import .*;\r?\n/gm, '')
    .replace(/^export /gm, '');

describe('global sidebar "new" red dots', () => {
    let browser;
    let page;

    beforeAll(async () => {
        browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    });

    afterAll(async () => {
        await browser?.close();
    });

    beforeEach(async () => {
        page = await browser.newPage();
        await page.setViewport({ width: 1440, height: 900 });
        await page.setContent(`<body class="sidebar-mini">${sidebar}
            <div id="mobile-action-bar"><button id="mobile-btn-more"><span class="icon-wrapper"><span class="staff-new-dot" data-menu-dot="more" hidden></span></span></button></div>
        </body>`);
        await page.addStyleTag({ content: '.d-none,[hidden]{display:none!important}' });
        await page.addStyleTag({ content: shellCss });
        await page.evaluate(() => {
            document.querySelectorAll('.d-none').forEach(el => el.classList.remove('d-none'));
            window.__requests = [];
            window.__badges = { 'nav-tanya-dokter': true, 'nav-staff-payroll': true, 'nav-dashboard': false, 'nav-voting': true };
            window.staffApiRequest = async (url, options = {}) => {
                window.__requests.push({ url, method: options.method || 'GET', body: options.body || null });
                if (url.startsWith('/api/staff-menu-badges/seen')) return { success: true };
                return { success: true, badges: { ...window.__badges } };
            };
            window.currentStaffUser = { id: 'staff-1' };
            window.__jobs = new Map();
            window.staffPollingCoordinator = {
                register: (key, options) => window.__jobs.set(key, options),
                trigger: key => window.__jobs.get(key)?.run({})
            };
            window.staffMobileQuickMenu = { moreItems: () => [{ navId: 'nav-voting' }] };
        });
        await page.addScriptTag({ content: `(function(){ const staffApiRequest = (...a) => window.staffApiRequest(...a);\n${moduleSource}\n})();` });
    });

    afterEach(async () => {
        await page?.close();
    });

    const dotVisible = id => page.evaluate(key => {
        const dot = document.querySelector(`#${key} > .nav-link > .staff-new-dot`);
        return Boolean(dot) && !dot.hidden && getComputedStyle(dot).display !== 'none';
    }, id);

    test('every sidebar menu gets a dot slot; new menus light up after refresh', async () => {
        const counts = await page.evaluate(async () => {
            window.staffMenuNewBadges.init();
            await window.__jobs.get('staff-menu-new-dots').run({});
            const items = [...document.querySelectorAll('.nav-sidebar li.nav-item[id]')];
            return {
                items: items.length,
                withDot: items.filter(item => item.querySelector(':scope > .nav-link > .staff-new-dot')).length
            };
        });
        expect(counts.items).toBeGreaterThan(40);
        expect(counts.withDot).toBe(counts.items);
        expect(await dotVisible('nav-tanya-dokter')).toBe(true);
        expect(await dotVisible('nav-dashboard')).toBe(false);
        // Treeview parent mirrors its child.
        expect(await dotVisible('nav-private')).toBe(true);
        // Old numeric badges are gone from the sidebar.
        expect(await page.$('#badge-tanya-dokter, #support-chat-badge, #badge-klinik-private, [data-conversation-badge]')).toBeNull();
    });

    test('opening a page hides its dot and records it as seen for this staff', async () => {
        await page.evaluate(async () => {
            window.staffMenuNewBadges.init();
            await window.__jobs.get('staff-menu-new-dots').run({});
            document.querySelector('#nav-tanya-dokter > .nav-link').classList.add('active');
        });
        await page.waitForFunction(() => window.__requests.some(r => r.url === '/api/staff-menu-badges/seen'));
        expect(await dotVisible('nav-tanya-dokter')).toBe(false);
        const seen = await page.evaluate(() => window.__requests.filter(r => r.method === 'POST').map(r => JSON.parse(r.body).navKey));
        expect(seen).toEqual(['nav-tanya-dokter']);

        // Server still reports "new" on the next poll while the page is open: stays hidden.
        await page.evaluate(async () => { await window.__jobs.get('staff-menu-new-dots').run({}); });
        expect(await dotVisible('nav-tanya-dokter')).toBe(false);
    });

    test('the mobile "Lainnya" button shows a dot when a hidden menu has one', async () => {
        const hidden = await page.evaluate(async () => {
            window.staffMenuNewBadges.init();
            await window.__jobs.get('staff-menu-new-dots').run({});
            return document.querySelector('[data-menu-dot="more"]').hidden;
        });
        expect(hidden).toBe(false);
    });
});

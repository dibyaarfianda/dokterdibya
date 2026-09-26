const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const repoRoot = path.resolve(__dirname, '../../../..');
const html = fs.readFileSync(path.join(repoRoot, 'staff/public/index-adminlte.html'), 'utf8');
const sidebar = html.match(/<aside class="main-sidebar[\s\S]*?<\/aside>/)?.[0];
const scriptPath = path.join(repoRoot, 'staff/public/scripts/shell/compact-sidebar.js');
const shellCss = fs.readFileSync(path.join(repoRoot, 'staff/public/styles/staff-shell.css'), 'utf8');

describe('compact desktop staff sidebar', () => {
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
        await page.setContent(`<body class="sidebar-mini">${sidebar}</body>`);
        await page.addStyleTag({ content: '.d-none,[hidden]{display:none!important}' });
        await page.addStyleTag({ content: shellCss });
        await page.evaluate(() => {
            window.staffRoleConstants = {
                ROLE_IDS: { DOKTER: 1 },
                isSuperadminUser: user => Number(user?.role_id) === 1
            };
        });
        if (fs.existsSync(scriptPath)) {
            await page.addScriptTag({ path: scriptPath });
        }
    });

    afterEach(async () => {
        await page?.close();
    });

    test('doctor shortcuts retain original menu nodes and all menu paths', async () => {
        const result = await page.evaluate(() => {
            const nav = document.querySelector('.nav-sidebar');
            const originalIds = [...nav.querySelectorAll('.nav-item[id]')].map(item => item.id);
            const initialized = window.staffCompactSidebar?.init({ role_id: 1 });
            return {
                initialized: Boolean(initialized),
                originalIds,
                currentIds: [...nav.querySelectorAll('.nav-item[id]')].map(item => item.id),
                shortcuts: [...document.querySelectorAll('#staff-compact-shortcuts > .nav-item')].map(item => item.id),
                groups: [...document.querySelectorAll('.staff-compact-group')].map(item => item.dataset.group),
                badgeStillOnOriginalLink: Boolean(document.querySelector('#nav-klinik-private #badge-klinik-private')),
                actionStillOnOriginalLink: document.querySelector('#nav-kelola-pasien .nav-link')?.dataset.shellAction
            };
        });
        expect(result.initialized).toBe(true);
        expect(result.shortcuts).toEqual([
            'nav-dashboard', 'nav-klinik-private', 'nav-antrian-online', 'nav-kelola-pasien', 'nav-tanya-dokter'
        ]);
        expect(result.groups).toEqual([
            'klinik', 'pasien', 'percakapan', 'konten', 'operasional', 'keuangan', 'monitoring', 'sistem'
        ]);
        expect(result.currentIds.sort()).toEqual(result.originalIds.sort());
        expect(result.badgeStillOnOriginalLink).toBe(true);
        expect(result.actionStillOnOriginalLink).toBe('show-manage-patients');
    });

    test('non-doctor search never reveals denied items and finds allowed group menus', async () => {
        const result = await page.evaluate(() => {
            document.querySelectorAll('.dokter-only,.doctor-role-only').forEach(item => item.classList.add('d-none'));
            document.getElementById('nav-klinik-private').style.display = 'none';
            window.staffCompactSidebar?.init({ role_id: 25 });
            window.staffCompactSidebar?.refresh();
            const shortcuts = [...document.querySelectorAll('#staff-compact-shortcuts > .nav-item')]
                .filter(item => getComputedStyle(item).display !== 'none').map(item => item.id);
            const search = document.getElementById('staff-compact-search');
            search.value = 'Tanya Dokter';
            search.dispatchEvent(new Event('input', { bubbles: true }));
            const deniedSearchVisible = [...document.querySelectorAll('.staff-compact-group')]
                .some(group => getComputedStyle(group).display !== 'none');
            search.value = 'Upload USG';
            search.dispatchEvent(new Event('input', { bubbles: true }));
            const upload = document.getElementById('nav-bulk-upload-usg');
            return {
                shortcuts,
                deniedSearchVisible,
                uploadGroupOpen: upload.closest('.staff-compact-group')?.classList.contains('menu-open'),
                uploadVisible: getComputedStyle(upload).display !== 'none',
                doctorGroupHidden: getComputedStyle(document.querySelector('[data-group="monitoring"]')).display === 'none'
            };
        });
        expect(result.shortcuts).toEqual([
            'nav-dashboard', 'nav-kantor-saya', 'nav-antrian-online', 'nav-kelola-pasien', 'nav-pasien-baru'
        ]);
        expect(result.deniedSearchVisible).toBe(false);
        expect(result.uploadGroupOpen).toBe(true);
        expect(result.uploadVisible).toBe(true);
        expect(result.doctorGroupHidden).toBe(true);
    });

    test('groups open for active pages, preserve badges, and collapse to an icon rail', async () => {
        const result = await page.evaluate(() => {
            document.querySelectorAll('.dokter-only').forEach(item => item.classList.remove('d-none'));
            window.staffCompactSidebar?.init({ role_id: 1 });
            const chat = document.getElementById('nav-support-chat');
            chat.querySelector('.nav-link').classList.add('active');
            const badge = document.getElementById('support-chat-badge');
            badge.classList.remove('d-none');
            badge.textContent = '2';
            window.staffCompactSidebar?.refresh();
            const group = chat.closest('.staff-compact-group');
            const open = group.classList.contains('menu-open');
            const groupBadge = group.querySelector('.staff-compact-group-badge')?.textContent;
            document.getElementById('staff-compact-collapse').click();
            const groupButtonBox = group.querySelector('.staff-compact-group-button').getBoundingClientRect();
            const groupBadgeBox = group.querySelector('.staff-compact-group-badge').getBoundingClientRect();
            return {
                open,
                groupBadge,
                collapsed: document.body.classList.contains('sidebar-collapse'),
                searchControl: Boolean(document.getElementById('staff-compact-search-toggle')),
                badgeWithinIcon: groupBadgeBox.left >= groupButtonBox.left &&
                    groupBadgeBox.right <= groupButtonBox.right
            };
        });
        expect(result.open).toBe(true);
        expect(result.groupBadge).toBe('2');
        expect(result.collapsed).toBe(true);
        expect(result.searchControl).toBe(true);
        expect(result.badgeWithinIcon).toBe(true);
    });

    test('phone layout retains the original sidebar structure', async () => {
        await page.setViewport({ width: 390, height: 844 });
        const result = await page.evaluate(() => {
            const nav = document.querySelector('.nav-sidebar');
            const before = [...nav.children].map(item => item.id || item.textContent.trim());
            window.staffCompactSidebar?.init({ role_id: 25 });
            return {
                before,
                after: [...nav.children].map(item => item.id || item.textContent.trim()),
                searchAdded: Boolean(document.getElementById('staff-compact-search'))
            };
        });
        expect(result.after).toEqual(result.before);
        expect(result.searchAdded).toBe(false);
    });

    test('desktop search, closed groups, and collapsed rail remain readable', async () => {
        await page.evaluate(() => {
            document.querySelectorAll('.dokter-only').forEach(item => item.classList.remove('d-none'));
            window.staffCompactSidebar?.init({ role_id: 1 });
        });
        const result = await page.evaluate(() => {
            const group = document.querySelector('[data-group="percakapan"]');
            const button = group.querySelector('.staff-compact-group-button');
            const before = getComputedStyle(group.querySelector('.nav-treeview')).display;
            button.click();
            const after = getComputedStyle(group.querySelector('.nav-treeview')).display;
            const search = document.getElementById('staff-compact-search');
            search.value = 'Chat Komunitas';
            search.dispatchEvent(new Event('input', { bubbles: true }));
            const unrelated = getComputedStyle(document.getElementById('nav-support-chat')).display;
            const matching = getComputedStyle(document.getElementById('nav-community-chat')).display;
            document.getElementById('staff-compact-collapse').click();
            return {
                before, after, unrelated, matching,
                width: Math.round(document.querySelector('.main-sidebar').getBoundingClientRect().width),
                searchToggleVisible: getComputedStyle(document.getElementById('staff-compact-search-toggle')).display !== 'none'
            };
        });
        expect(result.before).toBe('none');
        expect(result.after).not.toBe('none');
        expect(result.unrelated).toBe('none');
        expect(result.matching).not.toBe('none');
        expect(result.width).toBeGreaterThanOrEqual(70);
        expect(result.width).toBeLessThanOrEqual(76);
        expect(result.searchToggleVisible).toBe(true);
    });

    test('search also finds the nested Gajian menu inside Private', async () => {
        const result = await page.evaluate(() => {
            document.querySelectorAll('.dokter-only,.doctor-role-only').forEach(item => item.classList.remove('d-none'));
            window.staffCompactSidebar?.init({ role_id: 1 });
            const search = document.getElementById('staff-compact-search');
            search.value = 'Gajian';
            search.dispatchEvent(new Event('input', { bubbles: true }));
            const finance = document.querySelector('[data-group="keuangan"]');
            const privateItem = document.getElementById('nav-private');
            const payroll = document.getElementById('nav-staff-payroll');
            return {
                financeOpen: finance.classList.contains('menu-open'),
                privateVisible: getComputedStyle(privateItem).display !== 'none',
                privateOpen: privateItem.classList.contains('menu-open'),
                payrollVisible: getComputedStyle(payroll).display !== 'none',
                emptyHidden: document.getElementById('staff-compact-empty').hidden
            };
        });
        expect(result).toEqual({
            financeOpen: true,
            privateVisible: true,
            privateOpen: true,
            payrollVisible: true,
            emptyHidden: true
        });
    });

    test('production shell loads the feature with the current cache version', () => {
        const version = html.match(/window\.STAFF_CACHE_VERSION = '([^']+)'/)?.[1];
        const sw = fs.readFileSync(path.join(repoRoot, 'staff/public/sw.js'), 'utf8');
        expect(html).toContain(`scripts/shell/compact-sidebar.js?v=${version}`);
        expect(sw).toContain("'/staff/public/scripts/shell/compact-sidebar.js'");
    });
});

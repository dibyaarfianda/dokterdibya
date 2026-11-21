const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const puppeteer = require('puppeteer');

const root = path.resolve(__dirname, '../../../..');
const baseline = {
    // Account-mode Staff now has a deliberate zero-grant shell in both viewports.
    // Team Chat launcher is now a keyboard-accessible button with dialog state.
    // 2026-11-22: sidebar red dots replace numeric badges, welcome card removed, Inbox Pasien,
    // Pembayaran di Muka, Audit Obat, Laboratorium, pregnancy review panel, advanced search
    // date range; patient menu: zoom lock, shared queue view, Pesan, Saldo, no app badge.
    'staff/public/index-adminlte.html': 'dc9a14742e9b4ac4cdd242e7ce83f3c2c452ebf429e978e37a645bc33454bccf',
    'public/patient-menu.html': 'b263818b5c03a86f510ad5b661c4af58dadd2beb166c3b923f4180676471aba0'
};

function maskedStructuralHash(html) {
    // Scripts are nonvisual; compare the approved prechange visible hierarchy.
    const masked = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '<style></style>');
    const tags = (masked.match(/<\/?[a-z][^>]*>/gi) || [])
        .map(tag => tag.replace(/\?v=[^\s>]+/g, '?v=VERSION').replace(/\s+/g, ' '));
    return crypto.createHash('sha256').update(tags.join('')).digest('hex');
}

test.each(Object.entries(baseline))('%s desktop/PWA shell keeps the approved structural snapshot', (file, expected) => {
    const html = fs.readFileSync(path.join(root, file), 'utf8');
    expect(maskedStructuralHash(html)).toBe(expected);
});

test.each(Object.keys(baseline))('%s renders the same masked element hierarchy at desktop and PWA viewports', async file => {
    const browser = await puppeteer.launch({ headless: true });
    try {
        const html = fs.readFileSync(path.join(root, file), 'utf8');
        const snapshots = [];
        for (const viewport of [{ width: 1366, height: 768, isMobile: false }, { width: 390, height: 844, isMobile: true }]) {
            const page = await browser.newPage();
            await page.setJavaScriptEnabled(false);
            await page.setRequestInterception(true);
            page.on('request', request => request.abort());
            await page.setViewport(viewport);
            await page.setContent(html, { waitUntil: 'domcontentloaded' });
            snapshots.push(await page.evaluate(() => Array.from(document.querySelectorAll('body *'))
                .map(element => [element.tagName, element.id, element.className instanceof SVGAnimatedString ? element.className.baseVal : element.className]
                    .join('|'))));
            await page.close();
        }
        expect(snapshots[0].length).toBeGreaterThan(100);
        expect(snapshots[1]).toEqual(snapshots[0]);
    } finally {
        await browser.close();
    }
}, 30000);

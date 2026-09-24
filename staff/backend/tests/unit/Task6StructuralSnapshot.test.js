const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const puppeteer = require('puppeteer');

const root = path.resolve(__dirname, '../../../..');
const baseline = {
    'staff/public/index-adminlte.html': '916aac1920848a8425979cb49fcfa2b3493f089ea9eec29b184154c68cb58542',
    'public/patient-menu.html': '002e188c06b967981ad5d942307062d7282ccf77e87aa5aa3503b9cf696ccde3'
};

function maskedStructuralHash(html) {
    // Dynamic script/style bodies and cache versions are masked; element structure and attributes remain.
    const masked = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '<script></script>')
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

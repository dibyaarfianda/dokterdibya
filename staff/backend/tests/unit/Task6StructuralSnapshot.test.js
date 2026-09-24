const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const puppeteer = require('puppeteer');

const root = path.resolve(__dirname, '../../../..');
const baseline = {
    'staff/public/index-adminlte.html': 'b4781f1b58765d9e6fe1d5e735e90764dfa278a9d7e02fad48777de159dae0a1',
    'public/patient-menu.html': 'da9c28107e03efa0947adcfdda6acb081e7ed298ef7c266c41354957f1a846a3'
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

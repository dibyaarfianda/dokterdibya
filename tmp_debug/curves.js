const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto('https://clearpath-template.framer.website/', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2500);

    // Find all SVG elements on the page, looking for path data that might be the curves.
    const svgs = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('svg')).slice(0, 20).map((s, i) => {
            const box = s.getBoundingClientRect();
            const paths = Array.from(s.querySelectorAll('path')).slice(0, 6).map(p => ({
                d: p.getAttribute('d') && p.getAttribute('d').slice(0, 120),
                stroke: p.getAttribute('stroke'),
                fill: p.getAttribute('fill'),
                strokeWidth: p.getAttribute('stroke-width'),
            }));
            return {
                i,
                w: box.width.toFixed(0),
                h: box.height.toFixed(0),
                top: box.top.toFixed(0),
                viewBox: s.getAttribute('viewBox'),
                paths,
            };
        });
    });
    console.log(JSON.stringify(svgs, null, 2));
    await browser.close();
})();

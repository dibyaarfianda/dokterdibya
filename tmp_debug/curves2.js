const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto('https://clearpath-template.framer.website/', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2500);

    const results = [];
    for (let scrollY = 0; scrollY <= 2000; scrollY += 250) {
        await page.evaluate((y) => window.scrollTo(0, y), scrollY);
        await page.waitForTimeout(400);
        const state = await page.evaluate(() => {
            const paths = Array.from(document.querySelectorAll('svg path')).slice(0, 6);
            return paths.map(p => {
                const svg = p.closest('svg');
                const cs = getComputedStyle(p);
                return {
                    d: (p.getAttribute('d') || '').slice(0, 80),
                    dashArray: cs.strokeDasharray,
                    dashOffset: cs.strokeDashoffset,
                    totalLen: typeof p.getTotalLength === 'function' ? p.getTotalLength().toFixed(0) : null,
                    svgTransform: svg ? getComputedStyle(svg).transform : '',
                    pTransform: cs.transform,
                    svgTop: svg ? svg.getBoundingClientRect().top.toFixed(0) : null,
                };
            });
        });
        results.push({ scrollY, state });
    }

    console.log(JSON.stringify(results, null, 2));
    await browser.close();
})();

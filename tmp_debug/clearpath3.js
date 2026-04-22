const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

    await page.goto('https://clearpath-template.framer.website/', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);

    const result = await page.evaluate(() => {
        const all = document.querySelectorAll('*');
        const matches = [];
        for (const el of all) {
            const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
            if (!t) continue;
            if (t.length > 200) continue;
            if (/A Path That Shapes Your Future\.?$/i.test(t)) {
                const cs = getComputedStyle(el);
                matches.push({
                    tag: el.tagName,
                    text: t.slice(0, 120),
                    depth: (function(){ let d = 0; let p = el; while(p){ d++; p = p.parentElement; } return d; })(),
                    fontFamily: cs.fontFamily,
                    fontSize: cs.fontSize,
                    fontWeight: cs.fontWeight,
                    fontStyle: cs.fontStyle,
                    lineHeight: cs.lineHeight,
                    letterSpacing: cs.letterSpacing,
                    color: cs.color,
                });
            }
        }
        return matches;
    });

    console.log(JSON.stringify(result, null, 2));

    await browser.close();
})();

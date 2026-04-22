const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

    await page.goto('https://clearpath-template.framer.website/', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2500);

    // Find the hero heading that contains "Path That Shapes"
    const info = await page.evaluate(() => {
        function findByText(text) {
            const all = document.querySelectorAll('h1, h2, h3, div, span, p');
            for (const el of all) {
                const direct = Array.from(el.childNodes).filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim();
                if (direct && direct.replace(/\s+/g, ' ').includes(text)) return el;
                if (el.textContent && el.textContent.replace(/\s+/g, ' ').includes(text) && el.children.length <= 4) return el;
            }
            return null;
        }
        const el = findByText('Shapes Your Future') || findByText('Path That Shapes');
        if (!el) return { error: 'not found' };

        function info(x) {
            const cs = getComputedStyle(x);
            return {
                tag: x.tagName,
                text: (x.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120),
                fontFamily: cs.fontFamily,
                fontSize: cs.fontSize,
                fontWeight: cs.fontWeight,
                fontStyle: cs.fontStyle,
                lineHeight: cs.lineHeight,
                letterSpacing: cs.letterSpacing,
                color: cs.color,
            };
        }

        const result = { parent: info(el), children: [] };
        for (const c of el.children) {
            result.children.push(info(c));
            for (const cc of c.children) {
                result.children.push({ nested: info(cc) });
            }
        }
        return result;
    });

    console.log(JSON.stringify(info, null, 2));

    await browser.close();
})();

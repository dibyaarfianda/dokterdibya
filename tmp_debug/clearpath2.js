const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

    await page.goto('https://clearpath-template.framer.website/', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2500);

    const info = await page.evaluate(() => {
        // Find element whose DIRECT text content contains the target phrase.
        function walk(root, results) {
            root.childNodes.forEach(n => {
                if (n.nodeType === 3) {
                    const t = n.textContent.trim();
                    if (t && /Shapes Your Future|Path That Shapes/i.test(t)) {
                        results.push({ parent: n.parentElement, text: t });
                    }
                } else if (n.nodeType === 1) {
                    walk(n, results);
                }
            });
        }
        const results = [];
        walk(document.body, results);

        function info(x) {
            if (!x) return null;
            const cs = getComputedStyle(x);
            return {
                tag: x.tagName,
                classes: x.className && typeof x.className === 'string' ? x.className.slice(0, 80) : null,
                fontFamily: cs.fontFamily,
                fontSize: cs.fontSize,
                fontWeight: cs.fontWeight,
                fontStyle: cs.fontStyle,
                lineHeight: cs.lineHeight,
                letterSpacing: cs.letterSpacing,
                color: cs.color,
                textDecoration: cs.textDecoration,
            };
        }

        return results.map(r => ({
            text: r.text.slice(0, 80),
            el: info(r.parent),
            grandParent: info(r.parent ? r.parent.parentElement : null),
        }));
    });

    console.log(JSON.stringify(info, null, 2));

    await browser.close();
})();

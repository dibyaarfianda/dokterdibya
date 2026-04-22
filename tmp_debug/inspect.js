const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch();
    const context = await browser.newContext({
        viewport: { width: 420, height: 900 },
        deviceScaleFactor: 2,
    });
    const page = await context.newPage();

    await page.goto('http://localhost:8765/patient-menu-trial.html?preview=1', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // Find the patient features section
    await page.evaluate(() => {
        const section = document.querySelector('.patient-features-section');
        if (section) section.scrollIntoView({ block: 'start' });
    });
    await page.waitForTimeout(600);

    // Scroll down a bit so row 1 is collapsing
    for (let i = 0; i < 5; i++) {
        await page.evaluate(() => window.scrollBy(0, 40));
        await page.waitForTimeout(200);
        await page.screenshot({ path: `c:/dokterdibya/tmp_debug/step_${i}.png`, fullPage: false });
    }

    // Inspect computed styles on all patient-features rows
    const info = await page.evaluate(() => {
        const rows = document.querySelectorAll('.patient-features-section .proces-row');
        return Array.from(rows).map((r, idx) => {
            const cs = getComputedStyle(r);
            const desc = r.querySelector('.proces-desc');
            const dcs = desc ? getComputedStyle(desc) : null;
            const rect = r.getBoundingClientRect();
            return {
                idx,
                top: rect.top.toFixed(1),
                bottom: rect.bottom.toFixed(1),
                height: rect.height.toFixed(1),
                bgColor: cs.backgroundColor,
                borderTop: cs.borderTopWidth + ' ' + cs.borderTopStyle + ' ' + cs.borderTopColor,
                borderBottom: cs.borderBottomWidth + ' ' + cs.borderBottomStyle + ' ' + cs.borderBottomColor,
                boxShadow: cs.boxShadow,
                outline: cs.outlineWidth + ' ' + cs.outlineStyle + ' ' + cs.outlineColor,
                descOpacity: dcs ? dcs.opacity : null,
                descMaxHeight: dcs ? dcs.maxHeight : null,
            };
        });
    });
    console.log(JSON.stringify(info, null, 2));

    await browser.close();
})();

const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch();
    const context = await browser.newContext({
        viewport: { width: 420, height: 900 },
        deviceScaleFactor: 2,
    });
    const page = await context.newPage();

    await page.goto('http://localhost:8765/patient-menu-trial.html?preview=1', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    // Scroll to patient features section
    await page.evaluate(() => {
        const section = document.querySelector('.patient-features-section');
        if (section) section.scrollIntoView({ block: 'start' });
    });
    await page.waitForTimeout(500);

    // Take snapshots at various scroll positions; focus on row 2's collapse range
    const snapshots = [];
    for (let extra = 0; extra <= 1200; extra += 20) {
        await page.evaluate((y) => window.scrollBy(0, y), 20);
        await page.waitForTimeout(80);

        const state = await page.evaluate(() => {
            const rows = document.querySelectorAll('.patient-features-section .proces-row');
            return {
                scrollY: window.scrollY,
                rows: Array.from(rows).map(r => {
                    const desc = r.querySelector('.proces-desc');
                    return {
                        top: r.getBoundingClientRect().top.toFixed(0),
                        h: r.getBoundingClientRect().height.toFixed(0),
                        op: desc ? getComputedStyle(desc).opacity : null,
                        mh: desc ? getComputedStyle(desc).maxHeight : null,
                    };
                })
            };
        });
        snapshots.push(state);
    }

    // Print a compact table
    console.log('scrollY | row 0 (top/h/op/mh) | row 1 | row 2 | row 3 | row 4');
    snapshots.forEach(s => {
        const parts = s.rows.map(r => `${r.top}/${r.h}/${r.op}/${r.mh}`).join(' | ');
        console.log(`${s.scrollY} | ${parts}`);
    });

    await browser.close();
})();

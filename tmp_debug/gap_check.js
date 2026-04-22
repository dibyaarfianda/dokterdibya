const { chromium } = require('playwright');
(async () => {
    const b = await chromium.launch();
    const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, isMobile: true });
    const p = await ctx.newPage();
    await p.goto('http://localhost:8765/patient-menu-trial.html?preview=1', { waitUntil: 'networkidle' });
    await p.waitForTimeout(2500);
    for (let y = 0; y <= 1200; y += 150) {
        await p.evaluate((yy) => window.scrollTo(0, yy), y);
        await p.waitForTimeout(300);
        await p.screenshot({ path: `c:/dokterdibya/tmp_debug/gap_${y}.png`, fullPage: false });
    }
    await b.close();
})();

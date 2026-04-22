const { chromium } = require('playwright');
(async () => {
    const b = await chromium.launch();
    const ctx = await b.newContext({ viewport: { width: 420, height: 900 }, deviceScaleFactor: 2 });
    const p = await ctx.newPage();
    await p.goto('http://localhost:8765/patient-menu-trial.html?preview=1');
    await p.waitForTimeout(2000);
    await p.screenshot({ path: 'c:/dokterdibya/tmp_debug/curve_mobile.png' });

    const ctx2 = await b.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
    const p2 = await ctx2.newPage();
    await p2.goto('http://localhost:8765/patient-menu-trial.html?preview=1');
    await p2.waitForTimeout(2000);
    await p2.screenshot({ path: 'c:/dokterdibya/tmp_debug/curve_desktop.png' });
    await b.close();
})();

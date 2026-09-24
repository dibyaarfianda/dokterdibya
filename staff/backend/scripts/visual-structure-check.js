const puppeteer = require('puppeteer');
const sharp = require('sharp');

const FIXTURE_ORIGIN = 'https://structural-snapshot.invalid';
const MASK_CSS = `
  *, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }
  #live-clock, #current-time, .live-time, .notification-count,
  [data-visual-dynamic], [data-live-timestamp] { visibility: hidden !important; }
`;

async function renderMaskedShell({ file, viewport, readFile, extraCss = '' }) {
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    try {
        const page = await browser.newPage();
        await page.setViewport(viewport);
        await page.setJavaScriptEnabled(false);
        await page.setRequestInterception(true);
        page.on('request', request => {
            const url = new URL(request.url());
            if (url.origin !== FIXTURE_ORIGIN) return request.abort();
            const requestedPath = decodeURIComponent(url.pathname).replace(/^\//, '');
            const asset = requestedPath.startsWith('staff/public/') || requestedPath.startsWith('public/')
                ? requestedPath : `public/${requestedPath}`;
            if (!asset || asset.includes('..')) return request.abort();
            let body;
            try { body = readFile(asset); }
            catch (_) { return request.respond({ status: 404, body: '' }); }
            const contentType = asset.endsWith('.html') ? 'text/html' : asset.endsWith('.css') ? 'text/css'
                : asset.endsWith('.png') ? 'image/png' : asset.endsWith('.jpg') || asset.endsWith('.jpeg') ? 'image/jpeg'
                    : asset.endsWith('.svg') ? 'image/svg+xml' : 'application/octet-stream';
            return request.respond({ status: 200, contentType, body });
        });
        await page.goto(`${FIXTURE_ORIGIN}/${file}`, { waitUntil: 'networkidle0' });
        await page.addStyleTag({ content: MASK_CSS + extraCss });
        return await page.screenshot({ type: 'png', captureBeyondViewport: false });
    } finally {
        await browser.close();
    }
}

async function pixelDifferenceRatio(before, after) {
    const left = await sharp(before).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const right = await sharp(after).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    if (left.info.width !== right.info.width || left.info.height !== right.info.height) return 1;
    let changed = 0;
    const pixels = left.info.width * left.info.height;
    for (let i = 0; i < left.data.length; i += 4) {
        if (Math.abs(left.data[i] - right.data[i]) > 24
            || Math.abs(left.data[i + 1] - right.data[i + 1]) > 24
            || Math.abs(left.data[i + 2] - right.data[i + 2]) > 24) changed++;
    }
    return changed / pixels;
}

module.exports = { renderMaskedShell, pixelDifferenceRatio };

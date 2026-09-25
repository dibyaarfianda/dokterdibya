const puppeteer = require('puppeteer');
const sharp = require('sharp');
const { createHash } = require('crypto');

const FIXTURE_ORIGIN = 'https://structural-snapshot.invalid';
const MASK_CSS = `
  *, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }
  #live-clock, #current-time, .live-time, .notification-count,
  [data-visual-dynamic], [data-live-timestamp] { visibility: hidden !important; }
`;

async function renderMaskedShell({ file, viewport, readFile, extraCss = '', onDiagnostics }) {
    const browser = await puppeteer.launch({ headless: true });
    try {
        const page = await browser.newPage();
        const missingRequiredAssets = [];
        const requiredAssetHashes = {};
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
            catch (_) {
                if (asset.endsWith('.html') || asset.endsWith('.css')) missingRequiredAssets.push(asset);
                return request.respond({ status: 404, body: '' });
            }
            if (asset.endsWith('.html') || asset.endsWith('.css')) {
                requiredAssetHashes[asset] = createHash('sha256').update(body).digest('hex');
            }
            const contentType = asset.endsWith('.html') ? 'text/html' : asset.endsWith('.css') ? 'text/css'
                : asset.endsWith('.png') ? 'image/png' : asset.endsWith('.jpg') || asset.endsWith('.jpeg') ? 'image/jpeg'
                    : asset.endsWith('.svg') ? 'image/svg+xml' : 'application/octet-stream';
            return request.respond({ status: 200, contentType, body });
        });
        await page.goto(`${FIXTURE_ORIGIN}/${file}`, { waitUntil: 'networkidle0' });
        await page.addStyleTag({ content: MASK_CSS + extraCss });
        await page.evaluate(async () => {
            await document.fonts.ready;
            await Promise.all(Array.from(document.images)
                .filter(image => image.complete && image.naturalWidth > 0)
                .map(image => image.decode().catch(() => {})));
            // Autofocus in the real shell can otherwise make identical pages
            // capture different vertical regions on slower CI runners.
            document.activeElement?.blur();
            document.documentElement.style.scrollBehavior = 'auto';
            window.scrollTo(0, 0);
        });
        if (missingRequiredAssets.length) {
            throw new Error(`Missing required visual fixture assets: ${missingRequiredAssets.join(', ')}`);
        }
        if (onDiagnostics) {
            const layout = await page.evaluate(() => {
                const rect = element => {
                    const box = element?.getBoundingClientRect();
                    return box ? { x: box.x, y: box.y, width: box.width, height: box.height } : null;
                };
                const bodyStyle = getComputedStyle(document.body);
                return {
                    body: { backgroundColor: bodyStyle.backgroundColor, fontFamily: bodyStyle.fontFamily,
                        scrollWidth: document.body.scrollWidth, scrollHeight: document.body.scrollHeight },
                    scrollY: window.scrollY,
                    htmlBackgroundColor: getComputedStyle(document.documentElement).backgroundColor,
                    sidebar: rect(document.querySelector('.main-sidebar')),
                    content: rect(document.querySelector('.content-wrapper')),
                    devicePixelRatio: window.devicePixelRatio
                };
            });
            await onDiagnostics({ ...layout, requiredAssetFailures: missingRequiredAssets,
                requiredAssetHashes });
        }
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

async function pixelDifferenceGrid(before, after, columns = 4, rows = 4) {
    const left = await sharp(before).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const right = await sharp(after).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    if (left.info.width !== right.info.width || left.info.height !== right.info.height) {
        return Array.from({ length: rows }, () => Array(columns).fill(1));
    }
    const changed = Array.from({ length: rows }, () => Array(columns).fill(0));
    const totals = Array.from({ length: rows }, () => Array(columns).fill(0));
    const { width, height } = left.info;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const row = Math.floor(y * rows / height);
            const column = Math.floor(x * columns / width);
            const i = (y * width + x) * 4;
            totals[row][column]++;
            if (Math.abs(left.data[i] - right.data[i]) > 24
                || Math.abs(left.data[i + 1] - right.data[i + 1]) > 24
                || Math.abs(left.data[i + 2] - right.data[i + 2]) > 24) changed[row][column]++;
        }
    }
    return changed.map((row, y) => row.map((count, x) => count / totals[y][x]));
}

module.exports = { renderMaskedShell, pixelDifferenceRatio, pixelDifferenceGrid };

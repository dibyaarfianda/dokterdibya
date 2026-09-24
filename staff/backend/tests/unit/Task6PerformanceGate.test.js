const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const http = require('http');
const express = require('express');

const scriptPath = path.resolve(__dirname, '../../scripts/perf-budget-check.js');

test('performance gate is importable without running CI and rejects request, failure, and activation breaches', () => {
    const { pageBudgetViolations } = require(scriptPath);
    const fixture = { warm: { requestCount: 40, failedRequests: 0 }, cachedActivationP95: 1000,
        firstPartyJsKB: 100, largestImageKB: 50 };
    expect(pageBudgetViolations(fixture)).toEqual([]);
    expect(pageBudgetViolations({ ...fixture, warm: { requestCount: 41, failedRequests: 1 }, cachedActivationP95: 1001 })
        .map(item => item.label)).toEqual(['Warm requests', 'Warm failed requests', 'Cached activation p95 (ms)']);
    expect(pageBudgetViolations({ ...fixture, warm: { requestCount: undefined, failedRequests: 0 } })
        .map(item => item.label)).toContain('Warm requests');
});

test('performance workflow installs pinned backend dependencies and browser before running gate', () => {
    const workflow = fs.readFileSync(path.resolve(__dirname, '../../../../.github/workflows/staff-performance-budget.yml'), 'utf8');
    const lock = require('../../package-lock.json');
    expect(lock.packages['node_modules/puppeteer'].version).toMatch(/^24\./);
    const install = workflow.indexOf('run: npm ci');
    const browser = workflow.indexOf('run: ./node_modules/.bin/puppeteer browsers install chrome');
    const gate = workflow.indexOf('run: node scripts/perf-budget-check.js');
    expect(install).toBeGreaterThan(0);
    expect(browser).toBeGreaterThan(install);
    expect(gate).toBeGreaterThan(browser);
    expect(workflow).toMatch(/STAFF_PERF_TOKEN:\s*\$\{\{ secrets\.STAFF_PERF_TOKEN \}\}/);
    expect(workflow).not.toMatch(/--token\b|--password\b/);
});

test('performance command fails closed without CI credential before making a request', () => {
    const child = spawnSync(process.execPath, [scriptPath, '--base-url', 'https://example.test'], {
        env: { ...process.env, STAFF_PERF_TOKEN: '' }, encoding: 'utf8', timeout: 10000
    });
    expect(child.status).toBe(1);
    expect(child.stderr).toContain('STAFF_PERF_TOKEN environment variable is required');
    expect(child.stdout).not.toContain('https://example.test');
});

test('performance script has no literal token key or persistent credential write', () => {
    const source = fs.readFileSync(scriptPath, 'utf8');
    expect(source).not.toContain('vps_auth_token');
    expect(source).not.toMatch(/(?:localStorage|sessionStorage)\.setItem\s*\(/);
});

test('performance browser credential follows the page key without storage persistence', async () => {
    const token = 'synthetic-ci-token';
    const probes = [];
    const html = `<!doctype html><script>
        const beforeKey = localStorage.getItem('SYNTHETIC_CI_AUTH');
        window.TOKEN_KEY = 'SYNTHETIC_CI_AUTH';
        window.getAuthToken = () => localStorage.getItem(window.TOKEN_KEY)
            || sessionStorage.getItem(window.TOKEN_KEY);
        window.activateRegisteredStaffPage = async () => document.body;
        fetch('/probe', {
            method: 'POST',
            headers: { Authorization: 'Bearer ' + (window.getAuthToken() || '') },
            body: JSON.stringify({ beforeKeyEmpty: beforeKey === null,
                unrelatedEmpty: localStorage.getItem('SYNTHETIC_OTHER_KEY') === null,
                localCount: localStorage.length, sessionCount: sessionStorage.length })
        });
    </script>`;
    const server = http.createServer((req, res) => {
        if (req.url === '/probe') {
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', () => {
                probes.push({ authorized: req.headers.authorization === `Bearer ${token}`, ...JSON.parse(body) });
                res.writeHead(probes.at(-1).authorized ? 200 : 401).end();
            });
            return;
        }
        res.writeHead(200, { 'Content-Type': 'text/html' }).end(html);
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
        const { inspectPage } = require(scriptPath);
        await inspectPage(`http://127.0.0.1:${server.address().port}/staff/public/index-adminlte.html`, token);
        expect(probes).toHaveLength(2);
        expect(probes).toEqual([
            { authorized: true, beforeKeyEmpty: true, unrelatedEmpty: true, localCount: 0, sessionCount: 0 },
            { authorized: true, beforeKeyEmpty: true, unrelatedEmpty: true, localCount: 0, sessionCount: 0 }
        ]);
    } finally {
        await new Promise(resolve => server.close(resolve));
    }
}, 30000);

test('warm gate ignores a cold request aborted by reload and cached script bodies', async () => {
    let visits = 0;
    const sockets = new Set();
    const server = http.createServer((req, res) => {
        if (req.url === '/slow-cold') return;
        if (req.url === '/cached.js') {
            res.writeHead(200, { 'Content-Type': 'application/javascript', 'Cache-Control': 'public, max-age=3600, immutable' });
            res.end(`window.cachedAsset = true; /* ${'x'.repeat(120000)} */`);
            return;
        }
        if (req.url === '/staff/public/index-adminlte.html') {
            visits++;
            res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' });
            res.end(`<!doctype html><link rel="icon" href="data:,\"><script src="/cached.js"></script><script>
                window.activateRegisteredStaffPage = async () => document.body;
                if (${visits} === 1) fetch('/slow-cold').catch(() => {});
            </script>`);
            return;
        }
        res.writeHead(200).end();
    });
    server.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
        const { inspectPage } = require(scriptPath);
        const result = await inspectPage(`http://127.0.0.1:${server.address().port}/staff/public/index-adminlte.html`, null);
        expect(result.warm.failedRequests).toBe(0);
        expect(result.cold.failedRequests).toBeGreaterThanOrEqual(1);
        expect(result.warm.requestCount).toBe(1); // only the network-backed HTML document
        expect(result.firstPartyJsKB).toBe(0); // cached decoded JavaScript is not network transfer
        expect(result.warm.cacheHitCount).toBeGreaterThanOrEqual(1);
        expect(result.warm.networkTransferBytes).toBeGreaterThan(0);
    } finally {
        sockets.forEach(socket => socket.destroy());
        await new Promise(resolve => server.close(resolve));
    }
}, 30000);

test('genuine warm HTTP failures remain failures after cache filtering', async () => {
    let visits = 0;
    const server = http.createServer((req, res) => {
        if (req.url === '/missing') return res.writeHead(503).end('unavailable');
        visits++;
        res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' });
        res.end(`<!doctype html><script>
            window.activateRegisteredStaffPage = async () => document.body;
            if (${visits} > 1) fetch('/missing').catch(() => {});
        </script>`);
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
        const { inspectPage } = require(scriptPath);
        const result = await inspectPage(`http://127.0.0.1:${server.address().port}/staff/public/index-adminlte.html`, null);
        expect(result.warm.failedRequests).toBe(1);
        expect(result.warm.requestCount).toBeGreaterThanOrEqual(2);
    } finally {
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
    }
}, 30000);

test('genuine warm network disconnect remains a gate failure', async () => {
    let visits = 0;
    const server = http.createServer((req, res) => {
        if (req.url === '/disconnect') return req.socket.destroy();
        visits++;
        res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' });
        res.end(`<!doctype html><link rel="icon" href="data:,"><script>
            window.activateRegisteredStaffPage = async () => document.body;
            if (${visits} > 1) fetch('/disconnect').catch(() => {});
        </script>`);
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
        const { inspectPage } = require(scriptPath);
        const result = await inspectPage(`http://127.0.0.1:${server.address().port}/staff/public/index-adminlte.html`, null);
        expect(result.warm.failedRequests).toBe(1);
        expect(result.warm.requestCount).toBeGreaterThanOrEqual(2);
    } finally {
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
    }
}, 30000);

test('closed-chat avatar markup defers photo transfer and retains 36px visible size', async () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../../../public/scripts/chat-popup.js'), 'utf8');
    const template = source.match(/messageHTML \+= `(<div class="chat-avatar" title="[^`]+?<\/div>)`;/)?.[1];
    expect(template).toBeTruthy();
    const avatar = new Function('photoUrl', 'userName', 'escapeHtml', 'getInitials', 'avatarBg', `return \`${template}\`;`)(
        '/synthetic-avatar.png', 'Synthetic Staff', value => value, () => 'SS', '#000'
    );
    let photoRequests = 0;
    const server = http.createServer((req, res) => {
        if (req.url === '/synthetic-avatar.png') {
            photoRequests++;
            res.writeHead(200, { 'Content-Type': 'image/png' });
            res.end(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/S0cAAAAASUVORK5CYII=', 'base64'));
            return;
        }
        res.writeHead(200, { 'Content-Type': 'text/html' }).end(`<!doctype html><div id="closed" style="display:none">${avatar}</div>`);
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const puppeteer = require('puppeteer');
    const browser = await puppeteer.launch({ headless: true });
    try {
        const page = await browser.newPage();
        await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'networkidle2' });
        expect(photoRequests).toBe(0);
        await page.evaluate(() => { document.getElementById('closed').style.display = 'block'; });
        await page.waitForFunction(() => document.querySelector('.chat-avatar img')?.complete);
        expect(photoRequests).toBe(1);
        expect(await page.evaluate(() => {
            const img = document.querySelector('.chat-avatar img');
            return { width: img.width, height: img.height, loading: img.loading, decoding: img.decoding };
        })).toEqual({ width: 36, height: 36, loading: 'lazy', decoding: 'async' });
    } finally {
        await browser.close();
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
    }
}, 30000);

test('service-worker-served decoded JavaScript is not counted as warm network transfer', async () => {
    const server = http.createServer((req, res) => {
        if (req.url === '/sw.js') {
            res.writeHead(200, { 'Content-Type': 'application/javascript', 'Cache-Control': 'no-store' });
            res.end(`self.addEventListener('install', event => event.waitUntil(
                new Promise(resolve => setTimeout(resolve, 1200)).then(() => caches.open('synthetic-static'))
                    .then(cache => cache.add('/sw-cached.js')).then(() => self.skipWaiting())
            ));
            self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
            self.addEventListener('fetch', event => {
                if (new URL(event.request.url).pathname === '/sw-cached.js') event.respondWith(caches.match('/sw-cached.js'));
            });`);
            return;
        }
        if (req.url === '/sw-cached.js') {
            res.writeHead(200, { 'Content-Type': 'application/javascript', 'Cache-Control': 'no-store' });
            res.end(`window.swCached = true; /* ${'x'.repeat(120000)} */`);
            return;
        }
        res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' });
        res.end(`<!doctype html><link rel="icon" href="data:,"><script src="/sw-cached.js"></script><script>
            window.activateRegisteredStaffPage = async () => document.body;
            navigator.serviceWorker.register('/sw.js');
        </script>`);
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
        const { inspectPage } = require(scriptPath);
        const result = await inspectPage(`http://127.0.0.1:${server.address().port}/staff/public/index-adminlte.html`, null);
        expect(result.warm.serviceWorkerHitCount).toBeGreaterThanOrEqual(1);
        expect(result.firstPartyJsKB).toBe(0);
    } finally {
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
    }
}, 30000);

test('real staff worker precache makes the first controlled shell reload network-bounded', async () => {
    const workerSource = fs.readFileSync(path.resolve(__dirname, '../../../public/sw.js'), 'utf8');
    const server = http.createServer((req, res) => {
        const pathname = new URL(req.url, 'http://127.0.0.1').pathname;
        if (pathname === '/staff/public/sw.js') {
            res.writeHead(200, { 'Content-Type': 'application/javascript', 'Cache-Control': 'no-store' }).end(workerSource);
            return;
        }
        if (pathname === '/staff/public/index-adminlte.html') {
            res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' });
            res.end(`<!doctype html><link rel="icon" href="data:,">
                <script type="module" src="/staff/public/scripts/shell/bootstrap.js?v=v414"></script>
                <script>window.activateRegisteredStaffPage = async () => document.body;
                    navigator.serviceWorker.register('/staff/public/sw.js', { scope: '/staff/public/' });</script>`);
            return;
        }
        if (pathname.startsWith('/staff/public/scripts/') && pathname.endsWith('.js')) {
            res.writeHead(200, { 'Content-Type': 'application/javascript', 'Cache-Control': 'no-store' })
                .end(pathname.endsWith('/shell/bootstrap.js')
                    ? "import './credentials.js'; window.syntheticStaffScript = true;"
                    : 'window.syntheticStaffScript = true;');
            return;
        }
        if (pathname.startsWith('/staff/public/styles/')) return res.writeHead(200, { 'Content-Type': 'text/css' }).end('body{}');
        if (pathname.startsWith('/staff/public/sounds/')) return res.writeHead(200, { 'Content-Type': 'audio/mpeg' }).end('sound');
        res.writeHead(404).end();
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
        const { inspectPage } = require(scriptPath);
        const result = await inspectPage(`http://127.0.0.1:${server.address().port}/staff/public/index-adminlte.html`, null);
        expect(result.warm.serviceWorkerHitCount).toBeGreaterThanOrEqual(2);
        expect(result.warm.requestCount).toBeLessThanOrEqual(2);
        expect(result.warm.failedRequests).toBe(0);
    } finally {
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
    }
}, 30000);

test('API gate scores application Server-Timing and retains WAN wall time separately', async () => {
    const server = http.createServer((_req, res) => {
        setTimeout(() => res.writeHead(200, { 'Content-Type': 'application/json', 'Server-Timing': 'app;dur=7.5' }).end('{}'), 20);
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
        const { benchEndpoint } = require(scriptPath);
        expect(typeof benchEndpoint).toBe('function');
        const result = await benchEndpoint(`http://127.0.0.1:${server.address().port}`, '/api/patients', 'synthetic');
        expect(result.p95).toBe(7.5);
        expect(result.wallP95).toBeGreaterThanOrEqual(20);
    } finally {
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
    }
}, 30000);

test.each([undefined, 'app;dur=NaN', 'other;dur=5'])('API gate fails closed on missing or invalid application timing: %s', async timing => {
    const server = http.createServer((_req, res) => {
        if (timing) res.setHeader('Server-Timing', timing);
        res.writeHead(200, { 'Content-Type': 'application/json' }).end('{}');
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
        const { benchEndpoint } = require(scriptPath);
        expect(typeof benchEndpoint).toBe('function');
        await expect(benchEndpoint(`http://127.0.0.1:${server.address().port}`, '/api/patients', 'synthetic'))
            .rejects.toThrow(/Server-Timing/);
    } finally {
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
    }
});

test('server emits finite application timing without request identifiers', async () => {
    const { appTiming } = require('../../middleware/serverTiming');
    const app = express();
    app.use(appTiming);
    app.get('/api/example/:id', async (_req, res) => {
        await new Promise(resolve => setTimeout(resolve, 8));
        res.json({ ok: true });
    });
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    try {
        const response = await new Promise((resolve, reject) => {
            http.get(`http://127.0.0.1:${server.address().port}/api/example/SYNTHETIC-PATIENT-ID`, res => {
                res.resume();
                res.on('end', () => resolve(res));
            }).on('error', reject);
        });
        expect(response.statusCode).toBe(200);
        expect(response.headers['server-timing']).toMatch(/^app;dur=\d+(?:\.\d+)?$/);
        expect(Number(response.headers['server-timing'].split('=')[1])).toBeGreaterThanOrEqual(8);
        expect(response.headers['server-timing']).not.toContain('SYNTHETIC-PATIENT-ID');
    } finally {
        await new Promise(resolve => server.close(resolve));
    }
});

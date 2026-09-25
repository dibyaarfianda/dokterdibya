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

test('performance workflow pins Ubuntu 24.04 and uses sandboxed system Chrome without downloading an unused browser', () => {
    const workflow = fs.readFileSync(path.resolve(__dirname, '../../../../.github/workflows/staff-performance-budget.yml'), 'utf8');
    const lock = require('../../package-lock.json');
    expect(workflow).toMatch(/^    runs-on: ubuntu-24\.04$/m);
    expect(lock.packages['node_modules/puppeteer'].version).toMatch(/^24\./);
    const install = workflow.indexOf('run: npm ci');
    const browser = workflow.indexOf('test -x /opt/google/chrome/chrome');
    const version = workflow.indexOf('/opt/google/chrome/chrome --version');
    const gate = workflow.indexOf('run: node scripts/perf-budget-check.js');
    expect(install).toBeGreaterThan(0);
    expect(browser).toBeGreaterThan(install);
    expect(version).toBeGreaterThan(browser);
    expect(gate).toBeGreaterThan(browser);
    expect(workflow).toContain("PUPPETEER_SKIP_DOWNLOAD: 'true'");
    expect(workflow).not.toContain('puppeteer browsers install chrome');
    expect(workflow).not.toContain('--no-sandbox');
    expect(workflow).toContain('id-token: write');
    expect(workflow).not.toContain('secrets.STAFF_PERF_TOKEN');
    expect(workflow).not.toMatch(/--token\b|--password\b/);
});

test('performance command fails closed without GitHub OIDC runner identity before making a request', () => {
    const child = spawnSync(process.execPath, [scriptPath, '--base-url', 'https://dokterdibya.com'], {
        env: { ...process.env, GITHUB_ACTIONS: '', ACTIONS_ID_TOKEN_REQUEST_URL: '',
            ACTIONS_ID_TOKEN_REQUEST_TOKEN: '', STAFF_PERF_TOKEN: '' }, encoding: 'utf8', timeout: 10000
    });
    expect(child.status).toBe(1);
    expect(child.stderr).toContain('GitHub Actions OIDC identity is required');
    expect(child.stdout).toBe('');
});

test('OIDC acquisition accepts only GitHub runner endpoint and never logs the runner credential', async () => {
    const { requestGithubActionsIdToken } = require(scriptPath);
    const seen = [];
    const syntheticToken = 'synthetic.' + 'x'.repeat(110) + '.signature';
    const fetch = async (url, headers) => {
        seen.push({ url, headers });
        return { status: 200, body: { value: syntheticToken } };
    };
    const env = {
        GITHUB_ACTIONS: 'true',
        ACTIONS_ID_TOKEN_REQUEST_URL: 'https://pipelines.actions.githubusercontent.com/token?existing=1',
        ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'synthetic-runner-credential'
    };
    expect(await requestGithubActionsIdToken({ env, fetch })).toBe(syntheticToken);
    expect(seen).toEqual([{
        url: 'https://pipelines.actions.githubusercontent.com/token?existing=1&audience=dokterdibya-staff-performance',
        headers: { Authorization: 'Bearer synthetic-runner-credential', Accept: 'application/json' }
    }]);
    await expect(requestGithubActionsIdToken({ env: { ...env,
        ACTIONS_ID_TOKEN_REQUEST_URL: 'https://attacker.example/token' }, fetch }))
        .rejects.toThrow('GitHub Actions OIDC identity is required');
    expect(seen).toHaveLength(1);
});

test('production gate reads only aggregate CI endpoint and never fetches clinical payloads', async () => {
    const seen = [];
    const observedAt = Date.now();
    const window = { windowSeconds: 300,
        windowStartedAtMs: observedAt - 60000, windowEndedAtMs: observedAt };
    const response = {
        status: 200, body: {
            success: true,
            data: {
                requests: { ...window, total: 100, serverErrors: 0 },
                latency: { ...window, p95Ms: 90, p99Ms: 120, sampleCount: 100 },
                api: {
                    patients: { ...window, count: 10, p95Ms: 80 },
                    dashboardStats: { ...window, count: 10, p95Ms: 40 },
                    notificationsCount: { ...window, count: 10, p95Ms: 20 }
                },
                socketAuth: { ...window, attempts: 100, accepted: 100, rejected: 0,
                    anonymousQuarantined: 0,
                    expiredAfterConnect: 0,
                    rejectedByCode: { AUTH_MISSING: 0, AUTH_INVALID: 0, AUTH_EXPIRED: 0, FORBIDDEN: 0 } },
                rum: { cachedActivation: { count: 10, p75: 300, p95: 450 },
                    LCP: { count: 10, p75: 400, p95: 600 } }
            }
        }
    };
    const { runPerformanceGate } = require(scriptPath);
    const result = await runPerformanceGate({
            baseUrl: 'https://dokterdibya.com',
            getOidcToken: async () => 'synthetic-oidc',
            fetchAggregate: async (url, headers) => {
                seen.push({ url, authorization: headers.Authorization });
                return response;
            },
            startFixture: async () => ({ url: 'http://[::1]:31337/staff/public/index-adminlte.html',
                token: 'synthetic-fixture-only', assertClean: () => {}, close: async () => {} }),
            inspectPageImpl: async (pageUrl, token) => {
                expect(pageUrl).toBe('http://[::1]:31337/staff/public/index-adminlte.html');
                expect(token).toBe('synthetic-fixture-only');
                return ({
                cold: { requestCount: 30, failedRequests: 0 },
                warm: { requestCount: 20, failedRequests: 0 },
                cachedActivationP95: 500, firstPartyJsKB: 100, largestImageKB: 50
                });
            }, log: () => {}
        });
    expect(result.violations).toBe(0);
    expect(seen).toEqual([{
        url: 'https://dokterdibya.com/api/ci/performance-summary',
        authorization: 'Bearer synthetic-oidc'
    }]);
});

test('production gate rejects an untrusted metric origin before acquiring OIDC', async () => {
    const { runPerformanceGate } = require(scriptPath);
    let acquired = false;
    await expect(runPerformanceGate({
        baseUrl: 'http://127.0.0.1:1234',
        getOidcToken: async () => { acquired = true; return 'synthetic-oidc'; }
    })).rejects.toThrow('Production performance origin is required');
    expect(acquired).toBe(false);
});

test('performance browser refuses any synthetic login outside the local fixture', async () => {
    const { inspectPage } = require(scriptPath);
    await expect(inspectPage('https://dokterdibya.com/staff/public/index-adminlte.html', 'synthetic-perf-fixture'))
        .rejects.toThrow('Local Staff fixture required');
});

test('performance browser uses sandboxed system Chrome only on a Linux GitHub runner', async () => {
    const puppeteer = require('puppeteer');
    const { inspectPage } = require(scriptPath);
    const previousGithubActions = process.env.GITHUB_ACTIONS;
    const previousRunnerOs = process.env.RUNNER_OS;
    const launch = jest.spyOn(puppeteer, 'launch').mockImplementation(async options => {
        const linuxGithubRunner = process.env.GITHUB_ACTIONS === 'true' && process.env.RUNNER_OS === 'Linux';
        if (options.args?.includes('--no-sandbox')) throw new Error('Chrome sandbox unexpectedly disabled');
        if (linuxGithubRunner && options.channel !== 'chrome') {
            throw new Error('No usable sandbox');
        }
        if (!linuxGithubRunner && options.channel) {
            throw new Error('Local Chrome selection unexpectedly changed');
        }
        throw new Error('Browser launch accepted');
    });
    try {
        process.env.GITHUB_ACTIONS = 'true';
        process.env.RUNNER_OS = 'Linux';
        await expect(inspectPage('http://127.0.0.1:31337/staff/public/index-adminlte.html', null))
            .rejects.toThrow('Browser launch accepted');
        process.env.GITHUB_ACTIONS = 'false';
        await expect(inspectPage('http://127.0.0.1:31337/staff/public/index-adminlte.html', null))
            .rejects.toThrow('Browser launch accepted');
    } finally {
        launch.mockRestore();
        if (previousGithubActions === undefined) delete process.env.GITHUB_ACTIONS;
        else process.env.GITHUB_ACTIONS = previousGithubActions;
        if (previousRunnerOs === undefined) delete process.env.RUNNER_OS;
        else process.env.RUNNER_OS = previousRunnerOs;
    }
});

test('fixture browser blocks outbound API requests before any synthetic credential can leave loopback', async () => {
    const server = http.createServer((_req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/html' }).end(`<!doctype html><script>
            window.activateRegisteredStaffPage = async () => document.body;
            fetch('https://example.test/api/clinical', {
                headers: { Authorization: 'Bearer synthetic-fixture-only' }
            }).catch(() => {});
        </script>`);
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
        const { inspectPage } = require(scriptPath);
        await expect(inspectPage(`http://127.0.0.1:${server.address().port}/staff/public/index-adminlte.html`,
            'synthetic-fixture-only')).rejects.toThrow('Staff fixture blocked');
    } finally {
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
    }
}, 30000);

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

test('intentional warm chat poll cancellation is not a failed network request', async () => {
    let visits = 0;
    const server = http.createServer((req, res) => {
        if (req.url.startsWith('/api/chat/messages?limit=100&_t=')) return;
        visits++;
        res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' });
        res.end(`<!doctype html><link rel="icon" href="data:,"><script>
            window.activateRegisteredStaffPage = async () => document.body;
            if (${visits} > 1) {
                const controller = new AbortController();
                fetch('/api/chat/messages?limit=100&_t=synthetic', { signal: controller.signal }).catch(() => {});
                setTimeout(() => controller.abort(), 750);
            }
        </script>`);
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
        const { inspectPage } = require(scriptPath);
        const result = await inspectPage(`http://127.0.0.1:${server.address().port}/staff/public/index-adminlte.html`, null);
        expect(result.warm.requestCount).toBeGreaterThanOrEqual(2);
        expect(result.warm.failedRequests).toBe(0);
    } finally {
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
    }
}, 30000);

test.each(['/disconnect', '/api/chat/messages?limit=100&_t=synthetic'])(
    'genuine warm network disconnect on %s remains a gate failure', async endpoint => {
        let visits = 0;
        const server = http.createServer((req, res) => {
            if (req.url === endpoint) return req.socket.destroy();
            visits++;
            res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' });
            res.end(`<!doctype html><link rel="icon" href="data:,"><script>
                window.activateRegisteredStaffPage = async () => document.body;
                if (${visits} > 1) fetch('${endpoint}').catch(() => {});
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

test.each([
    ['HTTP 503', (req, res, done) => setTimeout(() => { res.writeHead(503).end('unavailable'); done(); }, 1800)],
    ['disconnect', (req, _res, done) => setTimeout(() => { req.socket.destroy(); done(); }, 1800)]
])('warm %s finishing after networkidle2 is still a gate failure', async (_label, finishLate) => {
    let visits = 0;
    let lateCompleted = 0;
    const server = http.createServer((req, res) => {
        if (req.url === '/late') {
            finishLate(req, res, () => { lateCompleted++; });
            return;
        }
        visits++;
        res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' });
        res.end(`<!doctype html><link rel="icon" href="data:,"><script>
            window.activateRegisteredStaffPage = async () => document.body;
            if (${visits} > 1) fetch('/late').catch(() => {});
        </script>`);
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
        const { inspectPage } = require(scriptPath);
        const result = await inspectPage(`http://127.0.0.1:${server.address().port}/staff/public/index-adminlte.html`, null);
        expect(lateCompleted).toBeGreaterThanOrEqual(1);
        expect(result.warm.failedRequests).toBeGreaterThanOrEqual(1);
        expect(result.warm.requestCount).toBeGreaterThanOrEqual(2);
    } finally {
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
    }
}, 30000);

test('warm ordinary request left pending at the settlement deadline fails closed', async () => {
    let visits = 0;
    const server = http.createServer((req, res) => {
        if (req.url === '/stuck') return;
        visits++;
        res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' });
        res.end(`<!doctype html><link rel="icon" href="data:,"><script>
            window.activateRegisteredStaffPage = async () => document.body;
            if (${visits} > 1) fetch('/stuck').catch(() => {});
        </script>`);
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
        const { inspectPage } = require(scriptPath);
        await expect(inspectPage(`http://127.0.0.1:${server.address().port}/staff/public/index-adminlte.html`, null))
            .rejects.toThrow('Warm network requests did not settle before timeout');
    } finally {
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
    }
}, 30000);

test('open Socket.IO polling request does not falsely fail the warm gate', async () => {
    let visits = 0;
    const server = http.createServer((req, res) => {
        if (req.url.startsWith('/socket.io/?transport=polling')) return;
        visits++;
        res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' });
        res.end(`<!doctype html><link rel="icon" href="data:,"><script>
            window.activateRegisteredStaffPage = async () => document.body;
            if (${visits} > 1) fetch('/socket.io/?transport=polling&EIO=4').catch(() => {});
        </script>`);
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
        const { inspectPage } = require(scriptPath);
        const result = await inspectPage(`http://127.0.0.1:${server.address().port}/staff/public/index-adminlte.html`, null);
        expect(result.warm.failedRequests).toBe(0);
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

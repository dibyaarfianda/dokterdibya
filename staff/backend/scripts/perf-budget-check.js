#!/usr/bin/env node
/**
 * Strict performance budget guardrail.
 *
 * Usage:
 *   STAFF_PERF_TOKEN=<secret> node perf-budget-check.js --base-url https://example.test
 *     [--page-url https://example.test/staff/public/index-adminlte.html] [--allow-unreachable]
 */

const http = require('http');
const https = require('https');
const puppeteer = require('puppeteer');

const WARMUP_RUNS = 3;
const MEASURED_RUNS = 20;

const BUDGETS = {
    api: {
        '/api/patients': { p95: 100 },
        '/api/dashboard-stats': { p95: 50 },
        '/api/notifications/count': { p95: 30 },
        '/api/rum/summary': { p95: 50 }
    },
    page: {
        maxJsSizeKB: 500,
        maxImageSizeKB: 300,
        maxRequestCount: 40,
        maxCachedActivationP95Ms: 1000
    }
};

function argumentValue(args, name, fallback = null) {
    const index = args.indexOf(name);
    return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function fetchUrl(requestUrl, headers = {}) {
    return new Promise((resolve, reject) => {
        const parsed = new URL(requestUrl);
        const transport = parsed.protocol === 'https:' ? https : http;
        const request = transport.get({
            hostname: parsed.hostname,
            port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
            path: parsed.pathname + parsed.search,
            headers,
            timeout: 15000
        }, (response) => {
            let data = '';
            response.on('data', chunk => { data += chunk; });
            response.on('end', () => {
                let body = data;
                try { body = JSON.parse(data); } catch (_) {}
                resolve({ status: response.statusCode, body, headers: response.headers });
            });
        });
        request.on('timeout', () => request.destroy(new Error('Request timed out')));
        request.on('error', reject);
    });
}

function assertSuccess(response, label) {
    if (response.status < 200 || response.status >= 300) {
        throw new Error(`${label} returned HTTP ${response.status}`);
    }
    return response;
}

function percentile(values, requestedPercentile) {
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.max(0, Math.ceil((requestedPercentile / 100) * sorted.length) - 1);
    return sorted[index];
}

function pageBudgetViolations(page) {
    const checks = [
        ['Warm requests', page.warm.requestCount, BUDGETS.page.maxRequestCount],
        ['Warm failed requests', page.warm.failedRequests, 0],
        ['Cached activation p95 (ms)', page.cachedActivationP95, BUDGETS.page.maxCachedActivationP95Ms],
        ['First-party JavaScript (KB)', page.firstPartyJsKB, BUDGETS.page.maxJsSizeKB],
        ['Largest image (KB)', page.largestImageKB, BUDGETS.page.maxImageSizeKB]
    ];
    return checks.filter(([, value, budget]) => !Number.isFinite(value) || value > budget)
        .map(([label, value, budget]) => ({ label, value, budget }));
}

async function benchEndpoint(baseUrl, endpoint, token) {
    const headers = { Authorization: `Bearer ${token}` };
    const appDuration = response => {
        const header = response.headers?.['server-timing'];
        const match = typeof header === 'string' && header.match(/(?:^|,)\s*app;dur=(\d+(?:\.\d+)?)(?=\s*(?:,|$))/);
        const duration = match ? Number(match[1]) : NaN;
        if (!Number.isFinite(duration) || duration < 0) throw new Error(`${endpoint} missing or invalid Server-Timing app duration`);
        return duration;
    };
    for (let index = 0; index < WARMUP_RUNS; index++) {
        const response = await fetchUrl(`${baseUrl}${endpoint}?_t=${Date.now()}-${index}`, headers);
        appDuration(assertSuccess(response, endpoint));
    }

    const timings = [];
    const wallTimings = [];
    for (let index = 0; index < MEASURED_RUNS; index++) {
        const startedAt = Date.now();
        const response = await fetchUrl(`${baseUrl}${endpoint}?_t=${Date.now()}-${index}`, headers);
        assertSuccess(response, endpoint);
        wallTimings.push(Date.now() - startedAt);
        timings.push(appDuration(response));
    }

    return {
        p50: percentile(timings, 50),
        p95: percentile(timings, 95),
        avg: Math.round(timings.reduce((sum, value) => sum + value, 0) / timings.length),
        min: Math.min(...timings),
        max: Math.max(...timings),
        wallP95: percentile(wallTimings, 95)
    };
}

async function installEphemeralStaffAuth(page, token, targetOrigin) {
    await page.evaluateOnNewDocument((authToken, allowedOrigin) => {
        if (window !== window.top || window.location.origin !== allowedOrigin || typeof Storage === 'undefined') return;
        const originalGetItem = Storage.prototype.getItem;
        Storage.prototype.getItem = function (key) {
            if (typeof window.TOKEN_KEY === 'string' && key === window.TOKEN_KEY) return authToken;
            return originalGetItem.call(this, key);
        };
    }, token, targetOrigin);
}

async function inspectPage(pageUrl, token) {
    const browser = await puppeteer.launch({ headless: true });
    try {
        const page = await browser.newPage();
        const targetOrigin = new URL(pageUrl).origin;
        if (token) {
            await installEphemeralStaffAuth(page, token, targetOrigin);
        }

        const client = await page.createCDPSession();
        await client.send('Network.enable');
        let phase = 'cold';
        const phases = {
            cold: { requestCount: 0, failedRequests: 0, firstPartyJsBytes: 0, largestImageBytes: 0, networkTransferBytes: 0, cacheHitCount: 0, serviceWorkerHitCount: 0 },
            warm: { requestCount: 0, failedRequests: 0, firstPartyJsBytes: 0, largestImageBytes: 0, networkTransferBytes: 0, cacheHitCount: 0, serviceWorkerHitCount: 0 }
        };
        const requests = new Map();
        client.on('Network.requestWillBeSent', event => {
            if (!phase || event.request.url.startsWith('data:')) return;
            if (event.redirectResponse && requests.has(event.requestId)) {
                const redirected = requests.get(event.requestId);
                phases[redirected.phase].requestCount++;
                if (event.redirectResponse.status >= 400) phases[redirected.phase].failedRequests++;
            }
            requests.set(event.requestId, { phase, url: event.request.url, type: event.type, cached: false, serviceWorker: false, status: null });
        });
        client.on('Network.requestServedFromCache', event => {
            const request = requests.get(event.requestId);
            if (request) request.cached = true;
        });
        client.on('Network.responseReceived', event => {
            const request = requests.get(event.requestId);
            if (!request) return;
            request.type = event.type;
            request.status = event.response.status;
            request.cached ||= Boolean(event.response.fromDiskCache || event.response.fromPrefetchCache);
            request.serviceWorker = Boolean(event.response.fromServiceWorker);
        });
        client.on('Network.loadingFinished', event => {
            const request = requests.get(event.requestId);
            if (!request) return;
            requests.delete(event.requestId);
            const data = phases[request.phase];
            const size = Math.max(0, Number(event.encodedDataLength) || 0);
            // A 304 can use a cached body yet still make a real conditional request.
            const networkBacked = !request.serviceWorker && (!request.cached || size > 0);
            if (request.serviceWorker) data.serviceWorkerHitCount++;
            else if (!networkBacked) data.cacheHitCount++;
            if (networkBacked) {
                data.requestCount++;
                data.networkTransferBytes += size;
                if (request.type === 'Script' && new URL(request.url).origin === targetOrigin) data.firstPartyJsBytes += size;
                if (request.type === 'Image') data.largestImageBytes = Math.max(data.largestImageBytes, size);
            }
            if (request.status >= 400) data.failedRequests++;
        });
        client.on('Network.loadingFailed', event => {
            const request = requests.get(event.requestId);
            if (!request) return;
            requests.delete(event.requestId);
            const data = phases[request.phase];
            if (!request.cached && !request.serviceWorker) data.requestCount++;
            data.failedRequests++;
        });

        await page.setCacheEnabled(false);
        for (const measuredPhase of ['cold', 'warm']) {
            if (measuredPhase === 'warm') {
                await page.evaluate(async () => {
                    if (!('serviceWorker' in navigator) || !await navigator.serviceWorker.getRegistration()) return;
                    await Promise.race([
                        navigator.serviceWorker.ready,
                        new Promise((_, reject) => setTimeout(() => reject(new Error('Staff service worker activation timed out')), 10000))
                    ]);
                    if (!navigator.serviceWorker.controller) {
                        await Promise.race([
                            new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true })),
                            new Promise((_, reject) => setTimeout(() => reject(new Error('Staff service worker control timed out')), 10000))
                        ]);
                    }
                });
            }
            phase = measuredPhase;
            if (measuredPhase === 'warm') await page.setCacheEnabled(true);
            const response = measuredPhase === 'cold'
                ? await page.goto(pageUrl, { waitUntil: 'networkidle2', timeout: 30000 })
                : await page.reload({ waitUntil: 'networkidle2', timeout: 30000 });
            if (!response || !response.ok()) {
                throw new Error(`${measuredPhase} staff page returned HTTP ${response?.status() || 'unknown'}`);
            }
        }
        // networkidle2 permits two in-flight requests. Keep observing until
        // every warm navigation request except an expected Socket.IO poll has
        // a terminal CDP event; a stuck ordinary request fails the gate.
        const pendingWarm = () => [...requests.values()].some(request => {
            if (request.phase !== 'warm') return false;
            const url = new URL(request.url);
            return !(url.origin === targetOrigin && /^\/socket\.io\/?$/.test(url.pathname)
                && url.searchParams.get('transport') === 'polling');
        });
        if (pendingWarm()) {
            await new Promise((resolve, reject) => {
                const interval = setInterval(() => {
                    if (!pendingWarm()) {
                        clearInterval(interval);
                        clearTimeout(timeout);
                        resolve();
                    }
                }, 25);
                const timeout = setTimeout(() => {
                    clearInterval(interval);
                    reject(new Error('Warm network requests did not settle before timeout'));
                }, 5000);
            });
        }
        for (const request of requests.values()) {
            if (!request.cached && !request.serviceWorker) phases[request.phase].requestCount++;
        }
        phase = null;
        await client.detach();

        // The registered dashboard is already present after shell startup; repeat its cached activation.
        const cachedActivation = [];
        for (let index = 0; index < 5; index++) {
            const duration = await page.evaluate(async () => {
                if (typeof window.activateRegisteredStaffPage !== 'function') throw new Error('Staff navigation unavailable');
                const started = performance.now();
                const container = await window.activateRegisteredStaffPage('dashboard');
                if (!container) throw new Error('Staff navigation did not commit');
                return performance.now() - started;
            });
            cachedActivation.push(duration);
        }

        return {
            cold: phases.cold,
            warm: phases.warm,
            cachedActivationP95: percentile(cachedActivation, 95),
            firstPartyJsKB: Math.round(phases.warm.firstPartyJsBytes / 1024),
            largestImageKB: Math.round(phases.warm.largestImageBytes / 1024)
        };
    } finally {
        await browser.close();
    }
}

async function main() {
    const args = process.argv.slice(2);
    const baseUrl = argumentValue(args, '--base-url', 'http://localhost:3000').replace(/\/$/, '');
    const pageUrl = argumentValue(args, '--page-url', `${baseUrl}/staff/public/index-adminlte.html`);
    const token = process.env.STAFF_PERF_TOKEN;
    const allowUnreachable = args.includes('--allow-unreachable');
    let violations = 0;

    if (!token || args.includes('--token')) {
        console.error('[CONFIG] STAFF_PERF_TOKEN environment variable is required; --token is not accepted.');
        process.exit(1);
    }

    async function runRequired(label, operation) {
        try {
            return await operation();
        } catch (error) {
            if (allowUnreachable && /timed out|ECONN|ENOTFOUND|socket hang up/i.test(error.message)) {
                console.warn(`[WARN] ${label} unreachable: ${error.message}`);
                return null;
            }
            console.error(`[FAIL] ${label}: ${error.message}`);
            violations++;
            return null;
        }
    }

    console.log(`Performance budgets for ${baseUrl}`);

    for (const [endpoint, budget] of Object.entries(BUDGETS.api)) {
        const result = await runRequired(endpoint, () => benchEndpoint(baseUrl, endpoint, token));
        if (!result) continue;
        const pass = result.p95 <= budget.p95;
        console.log(`[${pass ? 'PASS' : 'FAIL'}] ${endpoint} app p95=${result.p95}ms budget=${budget.p95}ms (wall p95=${result.wallP95}ms)`);
        if (!pass) violations++;
    }

    const headers = { Authorization: `Bearer ${token}` };
    const metrics = await runRequired('/api/metrics', async () => {
        const response = await fetchUrl(`${baseUrl}/api/metrics`, headers);
        return assertSuccess(response, '/api/metrics').body;
    });
    if (metrics) {
        const serverErrors = metrics.errors?.byType?.server || 0;
        const totalRequests = metrics.requests?.total || 1;
        const serverErrorRate = (serverErrors / totalRequests) * 100;
        const errorPass = serverErrorRate < 5;
        const p99Pass = (metrics.performance?.p99Ms || 0) < 500;
        console.log(`[${errorPass ? 'PASS' : 'FAIL'}] Server 5xx rate=${serverErrorRate.toFixed(2)}%`);
        console.log(`[${p99Pass ? 'PASS' : 'FAIL'}] Global p99=${metrics.performance?.p99Ms || 0}ms`);
        if (!errorPass) violations++;
        if (!p99Pass) violations++;
    }

    const slo = await runRequired('/api/slo', async () => {
        const response = await fetchUrl(`${baseUrl}/api/slo`, headers);
        return assertSuccess(response, '/api/slo').body;
    });
    if (slo?.slos) {
        for (const item of Object.values(slo.slos)) {
            console.log(`[${item.pass ? 'PASS' : 'FAIL'}] ${item.name}: ${item.value}`);
            if (!item.pass) violations++;
        }
    }

    const page = await runRequired(pageUrl, () => inspectPage(pageUrl, token));
    if (page) {
        console.log(`[INFO] Cold staff load: requests=${page.cold.requestCount} failed=${page.cold.failedRequests}`);
        const checks = [
            ['Warm requests', page.warm.requestCount, BUDGETS.page.maxRequestCount],
            ['Warm failed requests', page.warm.failedRequests, 0],
            ['Cached activation p95 (ms)', page.cachedActivationP95, BUDGETS.page.maxCachedActivationP95Ms],
            ['First-party JavaScript (KB)', page.firstPartyJsKB, BUDGETS.page.maxJsSizeKB],
            ['Largest image (KB)', page.largestImageKB, BUDGETS.page.maxImageSizeKB]
        ];
        const failed = pageBudgetViolations(page);
        for (const [label, value, budget] of checks) {
            const pass = !failed.some(item => item.label === label);
            console.log(`[${pass ? 'PASS' : 'FAIL'}] ${label}=${value} budget=${budget}`);
            if (!pass) violations++;
        }
    }

    console.log(`Result: ${violations === 0 ? 'ALL PASS' : `${violations} VIOLATION(S)`}`);
    process.exit(violations > 0 ? 1 : 0);
}

if (require.main === module) {
    main().catch((error) => {
        console.error('Fatal performance-check error:', error);
        process.exit(1);
    });
}

module.exports = { inspectPage, pageBudgetViolations, percentile, installEphemeralStaffAuth, benchEndpoint };

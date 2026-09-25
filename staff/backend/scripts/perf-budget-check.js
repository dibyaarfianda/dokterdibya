#!/usr/bin/env node
/**
 * Strict performance budget guardrail.
 *
 * Usage:
 *   node perf-budget-check.js
 * Requires GitHub Actions OIDC. Never accepts a staff or patient credential.
 */

const http = require('http');
const https = require('https');
const puppeteer = require('puppeteer');
const { AUDIENCE } = require('../services/githubActionsOidc');
const { startStaffPerformanceFixture } = require('./staff-performance-fixture');

const WARMUP_RUNS = 3;
const MEASURED_RUNS = 20;

const BUDGETS = {
    api: {
        '/api/patients': { p95: 100 },
        '/api/dashboard-stats': { p95: 50 },
        '/api/notifications/count': { p95: 30 }
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

async function installEphemeralStaffAuth(page, token, targetOrigin, cacheVersion = null) {
    await page.evaluateOnNewDocument((authToken, allowedOrigin, currentCacheVersion) => {
        if (window !== window.top || window.location.origin !== allowedOrigin || typeof Storage === 'undefined') return;
        const originalGetItem = Storage.prototype.getItem;
        Storage.prototype.getItem = function (key) {
            if (typeof window.TOKEN_KEY === 'string' && key === window.TOKEN_KEY) return authToken;
            if (key === 'cache_version' && currentCacheVersion) return currentCacheVersion;
            return originalGetItem.call(this, key);
        };
    }, token, targetOrigin, cacheVersion);
}

async function inspectPage(pageUrl, token, { cacheVersion = null } = {}) {
    const parsedPage = new URL(pageUrl);
    if (token && (parsedPage.protocol !== 'http:'
        || !['localhost', '127.0.0.1', '[::1]'].includes(parsedPage.hostname)
        || parsedPage.username || parsedPage.password)) {
        throw new Error('Local Staff fixture required');
    }
    const browser = await puppeteer.launch({
        headless: true,
        channel: process.env.GITHUB_ACTIONS === 'true' && process.env.RUNNER_OS === 'Linux'
            ? 'chrome' : undefined
    });
    try {
        const page = await browser.newPage();
        const targetOrigin = new URL(pageUrl).origin;
        let blockedExternal = 0;
        if (token) {
            await installEphemeralStaffAuth(page, token, targetOrigin, cacheVersion);
            await page.setRequestInterception(true);
            const staticOrigins = new Set([
                'https://cdn.jsdelivr.net', 'https://cdn.socket.io', 'https://cdn.datatables.net',
                'https://fonts.googleapis.com', 'https://fonts.gstatic.com'
            ]);
            page.on('request', request => {
                const url = new URL(request.url());
                const local = url.origin === targetOrigin;
                const publicStatic = staticOrigins.has(url.origin) && request.method() === 'GET'
                    && !request.headers().authorization;
                if (local || publicStatic || url.protocol === 'data:') request.continue();
                else {
                    blockedExternal++;
                    request.abort('blockedbyclient');
                }
            });
        }

        const client = await page.createCDPSession();
        await client.send('Network.enable');
        let phase = 'cold';
        const phases = {
            cold: { requestCount: 0, failedRequests: 0, firstPartyJsBytes: 0, largestImageBytes: 0, networkTransferBytes: 0, cacheHitCount: 0, serviceWorkerHitCount: 0, failures: [] },
            warm: { requestCount: 0, failedRequests: 0, firstPartyJsBytes: 0, largestImageBytes: 0, networkTransferBytes: 0, cacheHitCount: 0, serviceWorkerHitCount: 0, failures: [] }
        };
        const documentResponses = { cold: null, warm: null };
        let coldLoaderId = null;
        const requests = new Map();
        client.on('Network.requestWillBeSent', event => {
            if (!phase || event.request.url.startsWith('data:')) return;
            if (event.redirectResponse && requests.has(event.requestId)) {
                const redirected = requests.get(event.requestId);
                phases[redirected.phase].requestCount++;
                if (event.redirectResponse.status >= 400) phases[redirected.phase].failedRequests++;
            }
            if (phase === 'cold' && event.type === 'Document') coldLoaderId = event.loaderId;
            // Unload beacons from the cold document can begin during warm navigation.
            const requestPhase = phase === 'warm' && event.loaderId === coldLoaderId
                && event.type !== 'Document' ? 'cold' : phase;
            requests.set(event.requestId, { phase: requestPhase, url: event.request.url, type: event.type,
                method: event.request.method, cached: false, serviceWorker: false, status: null });
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
            if (event.type === 'Document' && event.response.url === pageUrl) {
                documentResponses[request.phase] = event.response.status;
            }
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
            if (request.status >= 400) {
                data.failedRequests++;
                if (token) data.failures.push(`${request.status}:${new URL(request.url).origin}${new URL(request.url).pathname}`);
            }
        });
        client.on('Network.loadingFailed', event => {
            const request = requests.get(event.requestId);
            if (!request) return;
            requests.delete(event.requestId);
            const data = phases[request.phase];
            if (!request.cached && !request.serviceWorker) data.requestCount++;
            const requestUrl = new URL(request.url);
            // The chat fallback poll is canceled when Socket.IO connects. CDP
            // reports that client-side AbortController action as ERR_ABORTED.
            if (event.canceled === true && event.errorText === 'net::ERR_ABORTED'
                && request.method === 'GET' && requestUrl.origin === targetOrigin
                && requestUrl.pathname === '/api/chat/messages'
                && requestUrl.searchParams.get('limit') === '100'
                && requestUrl.searchParams.has('_t')) return;
            data.failedRequests++;
            if (token) data.failures.push(`network:${requestUrl.origin}${requestUrl.pathname}:${event.errorText}`);
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
            const response = await page.goto(pageUrl, { waitUntil: 'networkidle2', timeout: 30000 });
            if (!(response?.ok() || (response === null && documentResponses[measuredPhase] === 200))) {
                throw new Error(`${measuredPhase} staff page returned HTTP ${response?.status() || documentResponses[measuredPhase] || 'unknown'}`);
            }
        }
        // Include startup work deferred through requestIdleCallback in the warm-load budget.
        await new Promise(resolve => setTimeout(resolve, 2500));
        // networkidle2 permits two in-flight requests. Keep observing until
        // every warm navigation request except an expected Socket.IO poll has
        // a terminal CDP event; a stuck ordinary request fails the gate.
        const pendingWarm = () => [...requests.values()].some(request => {
            if (request.phase !== 'warm') return false;
            const url = new URL(request.url);
            if (request.method === 'POST' && url.origin === targetOrigin
                && url.pathname === '/api/logs' && request.status === 200) return false;
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
                    const pending = [...requests.values()].filter(request => request.phase === 'warm')
                        .map(request => `${request.type}:${new URL(request.url).origin}${new URL(request.url).pathname}:${request.status}`).slice(0, 5).join(', ');
                    reject(new Error(`Warm network requests did not settle before timeout (${pending})`));
                }, 5000);
            });
        }
        for (const request of requests.values()) {
            if (!request.cached && !request.serviceWorker) phases[request.phase].requestCount++;
        }
        phase = null;
        await client.detach();
        if (blockedExternal) throw new Error(`Staff fixture blocked ${blockedExternal} external request(s)`);

        // Warm both registered pages once, then time real cached menu transitions.
        await page.evaluate(async () => {
            if (typeof window.activateRegisteredStaffPage !== 'function') throw new Error('Staff navigation unavailable');
            const first = await window.activateRegisteredStaffPage('patients');
            const second = await window.activateRegisteredStaffPage('dashboard');
            if (!first || !second) throw new Error('Staff menu preload did not commit');
        });
        const cachedActivation = [];
        for (let index = 0; index < 5; index++) {
            const key = index % 2 === 0 ? 'patients' : 'dashboard';
            const duration = await page.evaluate(async selectedKey => {
                if (typeof window.activateRegisteredStaffPage !== 'function') throw new Error('Staff navigation unavailable');
                const started = performance.now();
                const container = await window.activateRegisteredStaffPage(selectedKey);
                if (!container || container.classList.contains('d-none')) {
                    throw new Error('Staff menu switch did not commit');
                }
                return performance.now() - started;
            }, key);
            cachedActivation.push(duration);
        }

        return {
            cold: phases.cold,
            warm: phases.warm,
            cachedActivationP95: percentile(cachedActivation, 95),
            menuSwitches: cachedActivation.length,
            firstPartyJsKB: Math.round(phases.warm.firstPartyJsBytes / 1024),
            largestImageKB: Math.round(phases.warm.largestImageBytes / 1024)
        };
    } finally {
        await browser.close();
    }
}

async function requestGithubActionsIdToken({ env = process.env, fetch = fetchUrl } = {}) {
    let requestUrl;
    try { requestUrl = new URL(env.ACTIONS_ID_TOKEN_REQUEST_URL); } catch (_) {}
    if (env.GITHUB_ACTIONS !== 'true' || !requestUrl || requestUrl.protocol !== 'https:'
        || !/(^|\.)actions\.githubusercontent\.com$/.test(requestUrl.hostname)
        || requestUrl.username || requestUrl.password || requestUrl.hash
        || !env.ACTIONS_ID_TOKEN_REQUEST_TOKEN) {
        throw new Error('GitHub Actions OIDC identity is required');
    }
    requestUrl.searchParams.set('audience', AUDIENCE);
    const response = await fetch(requestUrl.toString(), {
        Authorization: `Bearer ${env.ACTIONS_ID_TOKEN_REQUEST_TOKEN}`,
        Accept: 'application/json'
    });
    if (response.status !== 200 || typeof response.body?.value !== 'string'
        || response.body.value.length < 100 || response.body.value.length > 16000) {
        throw new Error('GitHub Actions OIDC identity is required');
    }
    return response.body.value;
}

async function runPerformanceGate({ baseUrl, getOidcToken = requestGithubActionsIdToken,
    fetchAggregate = fetchUrl, inspectPageImpl = inspectPage,
    startFixture = startStaffPerformanceFixture, log = console.log }) {
    if (baseUrl !== 'https://dokterdibya.com') {
        throw new Error('Production performance origin is required');
    }
    // Acquire the short-lived identity before any network or output. It is only
    // sent to the aggregate endpoint, never installed in the browser.
    const token = await getOidcToken();
    const aggregate = assertSuccess(await fetchAggregate(`${baseUrl}/api/ci/performance-summary`, {
        Authorization: `Bearer ${token}`
    }), '/api/ci/performance-summary').body;
    if (aggregate?.success !== true || !aggregate.data) throw new Error('CI performance summary unavailable');
    const data = aggregate.data;
    let violations = 0;
    const check = (label, value, budget, minimumCount = null) => {
        const pass = Number.isFinite(value) && value <= budget
            && (minimumCount === null || minimumCount >= 5);
        log(`[${pass ? 'PASS' : 'FAIL'}] ${label}=${value} budget=${budget}`);
        if (!pass) violations++;
    };

    const checkedAt = Date.now();
    const checkWindow = (label, window) => {
        const start = window?.windowStartedAtMs;
        const end = window?.windowEndedAtMs;
        const pass = window?.windowSeconds === 300 && Number.isFinite(start)
            && Number.isFinite(end) && start <= end
            && start >= checkedAt - 305000 && end >= checkedAt - 300000
            && end <= checkedAt + 5000;
        log(`[${pass ? 'PASS' : 'FAIL'}] ${label} observation window=${window?.windowSeconds} seconds`);
        if (!pass) violations++;
    };

    const requests = data.requests?.total;
    const serverErrors = data.requests?.serverErrors;
    checkWindow('Production HTTP', data.requests);
    check('Production 5xx rate (%)', Number.isFinite(requests) && requests > 0 && Number.isFinite(serverErrors)
        ? serverErrors / requests * 100 : NaN, 1);
    checkWindow('Production global latency', data.latency);
    const globalSamples = data.latency?.sampleCount;
    const enoughGlobalSamples = Number.isSafeInteger(globalSamples) && globalSamples >= 100;
    log(`[${enoughGlobalSamples ? 'PASS' : 'FAIL'}] Production global sample count=${globalSamples} minimum=100`);
    if (!enoughGlobalSamples) violations++;
    check('Production p99 (ms)', data.latency?.p99Ms, 500);
    for (const [key, budget] of [
        ['patients', BUDGETS.api['/api/patients'].p95],
        ['dashboardStats', BUDGETS.api['/api/dashboard-stats'].p95],
        ['notificationsCount', BUDGETS.api['/api/notifications/count'].p95]
    ]) {
        checkWindow(`Production ${key}`, data.api?.[key]);
        check(`Production ${key} p95 (ms)`, data.api?.[key]?.p95Ms, budget, data.api?.[key]?.count);
    }

    const socketAuth = data.socketAuth;
    checkWindow('Production Socket auth', socketAuth);
    const authCounts = [socketAuth?.attempts, socketAuth?.accepted, socketAuth?.rejected,
        socketAuth?.rejectedByCode?.AUTH_MISSING, socketAuth?.rejectedByCode?.AUTH_INVALID,
        socketAuth?.rejectedByCode?.AUTH_EXPIRED, socketAuth?.rejectedByCode?.FORBIDDEN];
    const authCountsValid = authCounts.every(value => Number.isSafeInteger(value) && value >= 0)
        && socketAuth.attempts > 0 && socketAuth.accepted + socketAuth.rejected === socketAuth.attempts
        && authCounts.slice(3).reduce((sum, value) => sum + value, 0) === socketAuth.rejected
        && Number.isSafeInteger(socketAuth.anonymousQuarantined)
        && socketAuth.anonymousQuarantined === 0
        && Number.isSafeInteger(socketAuth.expiredAfterConnect) && socketAuth.expiredAfterConnect >= 0;
    check('Production Socket auth rejection rate (%)', authCountsValid
        ? socketAuth.rejected / socketAuth.attempts * 100 : NaN, 2);

    const fixture = await startFixture();
    let page;
    try {
        const fixtureUrl = new URL(fixture.url);
        if (fixtureUrl.protocol !== 'http:' || fixtureUrl.hostname !== '[::1]'
            || fixtureUrl.pathname !== '/staff/public/index-adminlte.html'
            || fixtureUrl.username || fixtureUrl.password) {
            throw new Error('Local Staff fixture required');
        }
        page = await inspectPageImpl(fixture.url, fixture.token, { cacheVersion: fixture.cacheVersion });
        fixture.assertClean();
    } finally {
        await fixture.close();
    }
    log(`[INFO] Cold staff load: requests=${page.cold.requestCount} failed=${page.cold.failedRequests}`);
    for (const failed of pageBudgetViolations(page)) {
        log(`[FAIL] ${failed.label}=${failed.value} budget=${failed.budget}`);
        violations++;
    }
    log(`Result: ${violations === 0 ? 'ALL PASS' : `${violations} VIOLATION(S)`}`);
    return { violations, page };
}

async function main() {
    const args = process.argv.slice(2);
    if (args.some(arg => ['--token', '--password', '--allow-unreachable', '--page-url'].includes(arg))) {
        throw new Error('GitHub Actions OIDC identity is required');
    }
    const baseUrl = argumentValue(args, '--base-url', 'https://dokterdibya.com').replace(/\/$/, '');
    if (baseUrl !== 'https://dokterdibya.com') throw new Error('Production performance origin is required');
    const result = await runPerformanceGate({ baseUrl });
    process.exit(result.violations > 0 ? 1 : 0);
}

if (require.main === module) {
    main().catch((error) => {
        console.error('Fatal performance-check error:', error);
        process.exit(1);
    });
}

module.exports = { inspectPage, pageBudgetViolations, percentile, installEphemeralStaffAuth,
    benchEndpoint, requestGithubActionsIdToken, runPerformanceGate };

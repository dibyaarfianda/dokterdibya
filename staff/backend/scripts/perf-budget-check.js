#!/usr/bin/env node
/**
 * Strict performance budget guardrail.
 *
 * Usage:
 *   node perf-budget-check.js --base-url https://example.test --token JWT
 *     [--page-url https://example.test/] [--allow-unreachable]
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
        maxRequestCount: 40
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
                resolve({ status: response.statusCode, body });
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

async function benchEndpoint(baseUrl, endpoint, token) {
    const headers = { Authorization: `Bearer ${token}` };
    for (let index = 0; index < WARMUP_RUNS; index++) {
        const response = await fetchUrl(`${baseUrl}${endpoint}?_t=${Date.now()}-${index}`, headers);
        assertSuccess(response, endpoint);
    }

    const timings = [];
    for (let index = 0; index < MEASURED_RUNS; index++) {
        const startedAt = Date.now();
        const response = await fetchUrl(`${baseUrl}${endpoint}?_t=${Date.now()}-${index}`, headers);
        assertSuccess(response, endpoint);
        timings.push(Date.now() - startedAt);
    }

    return {
        p50: percentile(timings, 50),
        p95: percentile(timings, 95),
        avg: Math.round(timings.reduce((sum, value) => sum + value, 0) / timings.length),
        min: Math.min(...timings),
        max: Math.max(...timings)
    };
}

async function inspectPage(pageUrl, token) {
    const browser = await puppeteer.launch({ headless: true });
    try {
        const page = await browser.newPage();
        if (token) {
            await page.evaluateOnNewDocument((authToken) => {
                try { localStorage.setItem('vps_auth_token', authToken); } catch (_) {}
            }, token);
        }

        const targetOrigin = new URL(pageUrl).origin;
        let requestCount = 0;
        let firstPartyJsBytes = 0;
        let largestImageBytes = 0;
        const responseReads = [];

        page.on('request', (request) => {
            if (!request.url().startsWith('data:')) requestCount++;
        });
        page.on('response', (response) => {
            const task = (async () => {
                const request = response.request();
                const resourceType = request.resourceType();
                if (!['script', 'image'].includes(resourceType)) return;

                let size = Number(response.headers()['content-length'] || 0);
                if (!size) {
                    try { size = (await response.buffer()).length; } catch (_) { size = 0; }
                }

                if (resourceType === 'script' && new URL(response.url()).origin === targetOrigin) {
                    firstPartyJsBytes += size;
                }
                if (resourceType === 'image') {
                    largestImageBytes = Math.max(largestImageBytes, size);
                }
            })();
            responseReads.push(task);
        });

        const response = await page.goto(pageUrl, { waitUntil: 'networkidle2', timeout: 30000 });
        if (!response || !response.ok()) {
            throw new Error(`Page returned HTTP ${response?.status() || 'unknown'}`);
        }
        await Promise.allSettled(responseReads);

        return {
            requestCount,
            firstPartyJsKB: Math.round(firstPartyJsBytes / 1024),
            largestImageKB: Math.round(largestImageBytes / 1024)
        };
    } finally {
        await browser.close();
    }
}

async function main() {
    const args = process.argv.slice(2);
    const baseUrl = argumentValue(args, '--base-url', 'http://localhost:3000').replace(/\/$/, '');
    const pageUrl = argumentValue(args, '--page-url', `${baseUrl}/`);
    const token = argumentValue(args, '--token');
    const allowUnreachable = args.includes('--allow-unreachable');
    let violations = 0;

    if (!token) {
        console.error('[CONFIG] --token is required because API, metrics, and SLO checks are protected.');
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
        console.log(`[${pass ? 'PASS' : 'FAIL'}] ${endpoint} p95=${result.p95}ms budget=${budget.p95}ms`);
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
        const checks = [
            ['Initial requests', page.requestCount, BUDGETS.page.maxRequestCount],
            ['First-party JavaScript (KB)', page.firstPartyJsKB, BUDGETS.page.maxJsSizeKB],
            ['Largest image (KB)', page.largestImageKB, BUDGETS.page.maxImageSizeKB]
        ];
        for (const [label, value, budget] of checks) {
            const pass = value <= budget;
            console.log(`[${pass ? 'PASS' : 'FAIL'}] ${label}=${value} budget=${budget}`);
            if (!pass) violations++;
        }
    }

    console.log(`Result: ${violations === 0 ? 'ALL PASS' : `${violations} VIOLATION(S)`}`);
    process.exit(violations > 0 ? 1 : 0);
}

main().catch((error) => {
    console.error('Fatal performance-check error:', error);
    process.exit(1);
});

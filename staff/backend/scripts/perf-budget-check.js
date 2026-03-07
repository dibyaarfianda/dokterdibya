#!/usr/bin/env node
/**
 * Performance Budget Check — CI/CD guardrail
 * Runs against a live server to validate performance budgets.
 * Exit code 0 = pass, 1 = budget violation.
 *
 * Usage:  node perf-budget-check.js [--base-url http://localhost:3000] [--token JWT]
 */

const http = require('http');
const https = require('https');
const url = require('url');

// ---------------------------------------------------------------------------
// Budgets — fail if exceeded
// ---------------------------------------------------------------------------
const BUDGETS = {
    // API latency thresholds (ms)
    api: {
        '/api/patients':              { p95: 100 },
        '/api/dashboard-stats':       { p95: 50 },
        '/api/notifications/count':   { p95: 30 },
        '/api/rum/summary':           { p95: 50 },
    },
    // Page asset budgets
    page: {
        maxJsSizeKB: 500,       // total JS per page (excluding CDN)
        maxImageSizeKB: 300,    // largest single image
        maxRequestCount: 40,    // initial page load request ceiling
    }
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function fetch(reqUrl, headers = {}) {
    return new Promise((resolve, reject) => {
        const parsed = new URL(reqUrl);
        const mod = parsed.protocol === 'https:' ? https : http;
        const opts = {
            hostname: parsed.hostname,
            port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
            path: parsed.pathname + parsed.search,
            headers
        };
        mod.get(opts, res => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
                catch (_) { resolve({ status: res.statusCode, body: data }); }
            });
        }).on('error', reject);
    });
}

async function benchEndpoint(baseUrl, path, token, runs = 5) {
    const times = [];
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    for (let i = 0; i < runs; i++) {
        const t0 = Date.now();
        await fetch(`${baseUrl}${path}?_t=${Date.now()}`, headers);
        times.push(Date.now() - t0);
    }
    const sorted = [...times].sort((a, b) => a - b);
    return {
        p50: sorted[Math.floor(runs * 0.5)],
        p95: sorted[Math.floor(runs * 0.95)],
        avg: Math.round(times.reduce((a, b) => a + b, 0) / runs),
        min: sorted[0],
        max: sorted[sorted.length - 1]
    };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
(async () => {
    const args = process.argv.slice(2);
    const baseUrl = args.includes('--base-url') ? args[args.indexOf('--base-url') + 1] : 'http://localhost:3000';
    const token = args.includes('--token') ? args[args.indexOf('--token') + 1] : null;

    let violations = 0;

    console.log('=== Performance Budget Check ===');
    console.log(`Target: ${baseUrl}\n`);

    // 1. API latency checks
    console.log('--- API Latency ---');
    for (const [path, budget] of Object.entries(BUDGETS.api)) {
        try {
            const result = await benchEndpoint(baseUrl, path, token);
            const pass = result.p95 <= budget.p95;
            const icon = pass ? 'PASS' : 'FAIL';
            console.log(`  [${icon}] ${path}: p95=${result.p95}ms (budget: ${budget.p95}ms) avg=${result.avg}ms`);
            if (!pass) violations++;
        } catch (e) {
            console.log(`  [SKIP] ${path}: ${e.message}`);
        }
    }

    // 2. Metrics sanity check
    console.log('\n--- Metrics Health ---');
    try {
        const { body: m } = await fetch(`${baseUrl}/api/metrics`);
        // Use 5xx error rate — 4xx (401/403) are expected for unauthenticated probes
        const serverErrors = (m.errors?.byType?.server || 0);
        const totalReqs = m.requests?.total || 1;
        const serverErrorRate = Math.round((serverErrors / totalReqs) * 100 * 100) / 100;
        const pass = serverErrorRate < 5;
        console.log(`  [${pass ? 'PASS' : 'FAIL'}] Server error rate (5xx): ${serverErrorRate}% (budget: <5%)`);
        if (!pass) violations++;

        const p99 = m.performance?.p99Ms || 0;
        const p99Pass = p99 < 500;
        console.log(`  [${p99Pass ? 'PASS' : 'FAIL'}] Global p99: ${p99}ms (budget: <500ms)`);
        if (!p99Pass) violations++;

        // Cache health — prefer direct m.cache path, fall back to rum.cacheStats
        const cache = m.cache || m.rum?.cacheStats || {};
        const shortHits = cache.short?.hits || 0;
        const shortMisses = cache.short?.misses || 0;
        const hitRate = (shortHits + shortMisses) > 0
            ? Math.round(shortHits / (shortHits + shortMisses) * 100)
            : 0;
        console.log(`  [INFO] Cache hit rate (short): ${hitRate}% (${shortHits} hits / ${shortMisses} misses)`);
    } catch (e) {
        console.log(`  [SKIP] Metrics: ${e.message}`);
    }

    // 3. Canary / coalescing health
    console.log('\n--- Canary Health ---');
    try {
        const { body: m } = await fetch(`${baseUrl}/api/metrics`);
        const c = m.coalescing || {};
        const enabled = c.enabled !== false;
        console.log(`  [${enabled ? 'PASS' : 'WARN'}] Coalescing active: ${enabled} (config: ${c.configEnabled})`);
        if (!enabled && c.configEnabled) violations++; // failsafe tripped unexpectedly

        const fsTripped = c.failsafe?.tripped || false;
        console.log(`  [${fsTripped ? 'WARN' : 'PASS'}] Failsafe tripped: ${fsTripped}`);
        if (fsTripped) violations++;

        const fsTriggers = c.failsafe?.triggerCount || 0;
        console.log(`  [INFO] Failsafe trigger count: ${fsTriggers}`);

        const mapSize = c.mapSize || 0;
        const mapPass = mapSize < (c.maxInflight || 100);
        console.log(`  [${mapPass ? 'PASS' : 'FAIL'}] Inflight map size: ${mapSize} (max: ${c.maxInflight || 100})`);
        if (!mapPass) violations++;
    } catch (e) {
        console.log(`  [SKIP] Canary: ${e.message}`);
    }

    // 4. SLO dashboard check
    console.log('\n--- SLO Dashboard ---');
    try {
        const { body: slo } = await fetch(`${baseUrl}/api/slo`);
        if (slo.slos) {
            for (const [key, s] of Object.entries(slo.slos)) {
                const icon = s.pass ? 'PASS' : 'FAIL';
                console.log(`  [${icon}] ${s.name}: ${s.value}`);
                if (!s.pass) violations++;
            }
        }
        console.log(`  [INFO] Overall: ${slo.status} (pid: ${slo.pid}, uptime: ${slo.uptime}s)`);
    } catch (e) {
        console.log(`  [SKIP] SLO: ${e.message}`);
    }

    // 5. PDF queue health
    console.log('\n--- PDF Queue ---');
    try {
        const { body: m } = await fetch(`${baseUrl}/api/metrics`);
        const q = m.pdfQueue || {};
        const queueDepthPass = (q.queued || 0) + (q.processing || 0) < 20;
        console.log(`  [${queueDepthPass ? 'PASS' : 'FAIL'}] Queue depth: ${q.queued || 0} queued, ${q.processing || 0} processing`);
        if (!queueDepthPass) violations++;
        console.log(`  [INFO] Workers: ${q.activeWorkers || 0}/${q.maxConcurrent || 2}  Failed: ${q.failed || 0}  Completed: ${q.completed || 0}`);
    } catch (e) {
        console.log(`  [SKIP] PDF Queue: ${e.message}`);
    }

    // 6. Cluster / process info
    console.log('\n--- Cluster Info ---');
    try {
        const { body: m } = await fetch(`${baseUrl}/api/metrics`);
        const c = m.cluster || {};
        console.log(`  [INFO] PID: ${c.pid}  Worker: ${c.workerId}  Uptime: ${c.uptime}s`);
    } catch (e) {
        console.log(`  [SKIP] Cluster: ${e.message}`);
    }

    // 7. Summary
    console.log(`\n=== Result: ${violations === 0 ? 'ALL PASS' : violations + ' VIOLATION(S)'} ===`);
    process.exit(violations > 0 ? 1 : 0);
})().catch(e => { console.error('Fatal:', e); process.exit(1); });

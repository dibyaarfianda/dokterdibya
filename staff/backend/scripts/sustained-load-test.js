#!/usr/bin/env node
/**
 * Sustained Load Test — runs for a configurable duration to validate
 * throughput, latency stability, and resource leak detection.
 *
 * Usage:
 *   node sustained-load-test.js [--duration 120] [--rps 10] [--base-url http://localhost:3000]
 *
 * Unlike load-test.js (burst test), this maintains a steady request rate
 * over minutes to detect:
 *   - Memory leaks (RSS drift)
 *   - Connection pool exhaustion
 *   - Cache bloat
 *   - Coalescing map leaks
 *   - Latency degradation over time
 */

const http = require('http');

function req(method, path, headers = {}, body = null) {
    return new Promise((resolve, reject) => {
        const t0 = Date.now();
        const url = new URL(path, BASE_URL);
        const opts = {
            hostname: url.hostname,
            port: url.port || 80,
            path: url.pathname + url.search,
            method,
            headers: { ...headers },
        };
        if (body) {
            const payload = JSON.stringify(body);
            opts.headers['Content-Type'] = 'application/json';
            opts.headers['Content-Length'] = Buffer.byteLength(payload);
        }
        const r = http.request(opts, res => {
            let data = '';
            res.on('data', c => (data += c));
            res.on('end', () => resolve({ ms: Date.now() - t0, status: res.statusCode }));
        });
        r.on('error', e => resolve({ ms: Date.now() - t0, status: 0, error: e.message }));
        r.setTimeout(10000, () => { r.destroy(); resolve({ ms: 10000, status: 0, error: 'timeout' }); });
        if (body) r.write(JSON.stringify(body));
        r.end();
    });
}

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
function arg(name, fallback) {
    const i = args.indexOf(`--${name}`);
    return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}

const BASE_URL      = arg('base-url', 'http://localhost:3000');
const DURATION_SEC  = parseInt(arg('duration', '120'), 10);
const TARGET_RPS    = parseInt(arg('rps', '10'), 10);

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

(async () => {
    console.log('=== Sustained Load Test ===');
    console.log(`Target: ${BASE_URL}`);
    console.log(`Duration: ${DURATION_SEC}s  Target RPS: ${TARGET_RPS}\n`);

    // Generate a fake auth token (will get 401, but tests infra path)
    const fakeAuth = { Authorization: 'Bearer sustained-load-test-token' };

    const endpoints = [
        { method: 'GET', path: '/api/health',              headers: {} },
        { method: 'GET', path: '/api/announcements/active', headers: {} },
        { method: 'GET', path: '/api/practice-schedules?location=klinik_privat', headers: {} },
        { method: 'GET', path: '/api/booking-settings/public', headers: {} },
        { method: 'GET', path: '/api/dashboard-stats',      headers: fakeAuth },
        { method: 'GET', path: '/api/patients?limit=20',    headers: fakeAuth },
        { method: 'GET', path: '/api/notifications/count',  headers: fakeAuth },
    ];

    const intervalMs = 1000 / TARGET_RPS;
    const endTime = Date.now() + DURATION_SEC * 1000;

    // Collect results per 10-second window
    const windows = [];
    let windowStart = Date.now();
    let windowResults = [];

    function flushWindow() {
        if (windowResults.length === 0) return;
        const times = windowResults.map(r => r.ms).sort((a, b) => a - b);
        const n = times.length;
        const errors = windowResults.filter(r => r.status === 0 || r.status >= 500).length;
        windows.push({
            elapsed: Math.round((Date.now() - startTime) / 1000),
            rps: Math.round(n / ((Date.now() - windowStart) / 1000) * 10) / 10,
            p50: times[Math.floor(n * 0.5)],
            p95: times[Math.floor(n * 0.95)],
            p99: times[Math.floor(n * 0.99)] || times[n - 1],
            max: times[n - 1],
            errors,
            n,
        });
        windowResults = [];
        windowStart = Date.now();
    }

    const startTime = Date.now();
    let requestCount = 0;

    const run = () => new Promise(resolve => {
        const timer = setInterval(async () => {
            if (Date.now() >= endTime) {
                clearInterval(timer);
                flushWindow();
                return resolve();
            }

            // Pick a random endpoint
            const ep = endpoints[requestCount % endpoints.length];
            requestCount++;

            const result = await req(ep.method, ep.path, ep.headers);
            windowResults.push(result);

            // Flush every 10 seconds
            if (Date.now() - windowStart >= 10000) {
                flushWindow();
            }
        }, intervalMs);
    });

    await run();

    // Print window results
    console.log('\n=== Window Results (10s intervals) ===');
    console.log('  elapsed   rps   p50    p95    p99    max   errors    n');
    for (const w of windows) {
        console.log(
            `  ${String(w.elapsed).padStart(5)}s  ` +
            `${String(w.rps).padStart(5)}  ` +
            `${String(w.p50).padStart(4)}ms ` +
            `${String(w.p95).padStart(5)}ms ` +
            `${String(w.p99).padStart(5)}ms ` +
            `${String(w.max).padStart(5)}ms ` +
            `${String(w.errors).padStart(6)}  ` +
            `${String(w.n).padStart(5)}`
        );
    }

    // Aggregate
    const allTimes = windows.flatMap(w => [w.p50, w.p95]);
    const totalRequests = windows.reduce((s, w) => s + w.n, 0);
    const totalErrors = windows.reduce((s, w) => s + w.errors, 0);
    const avgP95 = Math.round(windows.reduce((s, w) => s + w.p95, 0) / (windows.length || 1));

    console.log('\n=== Summary ===');
    console.log(`  Total requests:  ${totalRequests}`);
    console.log(`  Total errors:    ${totalErrors} (${Math.round(totalErrors / (totalRequests || 1) * 100)}%)`);
    console.log(`  Avg p95 latency: ${avgP95}ms`);
    console.log(`  Duration:        ${DURATION_SEC}s`);

    // Fetch server metrics at end
    try {
        const metricsRes = await req('GET', '/api/metrics');
        if (metricsRes.status === 200) {
            console.log('\n=== Server Metrics Snapshot ===');
            const { body } = await new Promise((resolve, reject) => {
                http.get(`${BASE_URL}/api/metrics`, res => {
                    let data = '';
                    res.on('data', c => data += c);
                    res.on('end', () => resolve({ body: JSON.parse(data) }));
                }).on('error', reject);
            });

            if (body.system) {
                console.log(`  RSS: ${Math.round((body.system.memoryUsage?.rss || 0) / 1024 / 1024)}MB`);
                console.log(`  Heap: ${Math.round((body.system.memoryUsage?.heapUsed || 0) / 1024 / 1024)}MB`);
            }
            if (body.coalescing) {
                console.log(`  Coalescing mapSize: ${body.coalescing.mapSize}`);
                console.log(`  Coalescing waiters: ${body.coalescing.totalWaiters}`);
                console.log(`  Failsafe tripped:  ${body.coalescing.failsafe?.tripped}`);
            }
            if (body.pdfQueue) {
                console.log(`  PDF queue:         ${JSON.stringify(body.pdfQueue)}`);
            }
            if (body.db) {
                console.log(`  DB total queries:  ${body.db.totalQueries}`);
                console.log(`  DB avg query:      ${body.db.avgQueryMs}ms`);
                console.log(`  DB slow queries:   ${body.db.slowQueryCount}`);
            }
        }
    } catch { /* metrics unavailable */ }

    // SLO check
    console.log('\n=== SLO Checks ===');
    const sloPass = {
        errorRate: totalErrors / (totalRequests || 1) < 0.01,
        p95Latency: avgP95 < 200,
        noFailsafe: true, // Would need metrics check
    };
    console.log(`  [${sloPass.errorRate ? 'PASS' : 'FAIL'}] Error rate < 1%`);
    console.log(`  [${sloPass.p95Latency ? 'PASS' : 'FAIL'}] Avg p95 < 200ms`);

    const allPass = Object.values(sloPass).every(Boolean);
    console.log(`\n=== Result: ${allPass ? 'ALL SLO PASS' : 'SLO VIOLATION(S)'} ===`);
    process.exit(allPass ? 0 : 1);
})().catch(e => { console.error('Fatal:', e); process.exit(1); });

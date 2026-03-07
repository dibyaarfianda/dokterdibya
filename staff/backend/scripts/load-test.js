#!/usr/bin/env node
/**
 * Realistic mixed-traffic load test
 * Simulates concurrent staff + patient usage patterns
 */
const http = require('http');

function req(method, path, headers = {}, body = null) {
    return new Promise((resolve, reject) => {
        const t0 = Date.now();
        const opts = { hostname: 'localhost', port: 3000, path, method, headers: { ...headers } };
        if (body) {
            const payload = JSON.stringify(body);
            opts.headers['Content-Type'] = 'application/json';
            opts.headers['Content-Length'] = Buffer.byteLength(payload);
        }
        const r = http.request(opts, res => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => resolve({ ms: Date.now() - t0, status: res.statusCode }));
        });
        r.on('error', reject);
        if (body) r.write(JSON.stringify(body));
        r.end();
    });
}

(async () => {
    const jwt = require('jsonwebtoken');
    const db = require('../db');

    const [users] = await db.query("SELECT new_id, email, role FROM users WHERE user_type='staff' AND is_active=1 LIMIT 3");
    if (!users.length) { console.log('No users'); process.exit(1); }

    const tokens = users.map(u => jwt.sign(
        { id: u.new_id, email: u.email, role: u.role || 'admin', role_id: 2 },
        process.env.JWT_SECRET, { expiresIn: '1h' }
    ));
    const mkAuth = (i) => ({ Authorization: 'Bearer ' + tokens[i % tokens.length] });

    console.log('=== Mixed Traffic Load Test ===\n');

    // Warmup
    await req('GET', '/api/dashboard-stats', mkAuth(0));
    await req('GET', '/api/patients?limit=20', mkAuth(0));

    const results = {};
    function record(name, ms) {
        if (!results[name]) results[name] = [];
        results[name].push(ms);
    }

    const ROUNDS = 3;
    const CONCURRENT = 5;

    for (let round = 0; round < ROUNDS; round++) {
        console.log(`Round ${round + 1}/${ROUNDS}...`);

        // Simulate concurrent staff dashboard load
        const staffDash = Array.from({ length: CONCURRENT }, (_, i) => Promise.all([
            req('GET', '/api/dashboard-stats', mkAuth(i)).then(r => record('dashboard-stats', r.ms)),
            req('GET', '/api/notifications/count', mkAuth(i)).then(r => record('notif-count', r.ms)),
            req('POST', '/api/notifications/badge-counts', mkAuth(i), { lastSeen: {} }).then(r => record('badge-counts', r.ms)),
            req('GET', '/api/patients?limit=20', mkAuth(i)).then(r => record('patients-list', r.ms)),
        ]));

        // Simulate concurrent patient portal traffic
        const patientTraffic = Array.from({ length: 3 }, () => Promise.all([
            req('GET', '/api/announcements/active').then(r => record('announcements', r.ms)),
            req('GET', '/api/practice-schedules?location=klinik_privat').then(r => record('schedules', r.ms)),
            req('GET', '/api/booking-settings/public').then(r => record('booking-pub', r.ms)),
        ]));

        // RUM beacons
        const rumBeacons = Array.from({ length: 3 }, () =>
            req('POST', '/api/rum', {}, {
                page: 'dashboard', role: 'admin', ts: Date.now(),
                metrics: { LCP: 800 + Math.random() * 400, INP: 20 + Math.random() * 30 },
                apiCalls: [{ endpoint: '/api/patients', duration: 5 + Math.random() * 20, status: 200 }]
            }).then(r => record('rum-beacon', r.ms))
        );

        await Promise.all([...staffDash, ...patientTraffic, ...rumBeacons]);
    }

    // Print results
    console.log('\n=== Results ===');
    for (const [name, times] of Object.entries(results)) {
        const sorted = [...times].sort((a, b) => a - b);
        const n = sorted.length;
        const p50 = sorted[Math.floor(n * 0.5)];
        const p95 = sorted[Math.floor(n * 0.95)];
        const avg = Math.round(times.reduce((a, b) => a + b, 0) / n);
        console.log(`  ${name.padEnd(20)} p50=${String(p50).padStart(4)}ms  p95=${String(p95).padStart(4)}ms  avg=${String(avg).padStart(4)}ms  n=${n}`);
    }

    // DB stats
    const { getDbStats } = require('../middleware/dbMonitor');
    const db2 = getDbStats();
    console.log(`\n=== DB Stats ===`);
    console.log(`  Total queries: ${db2.totalQueries}`);
    console.log(`  Avg query: ${db2.avgQueryMs}ms`);
    console.log(`  Slow queries (>200ms): ${db2.slowQueryCount}`);

    // Cache stats
    const cache = require('../utils/cache');
    const cs = cache.stats();
    console.log(`\n=== Cache Stats ===`);
    for (const [tier, s] of Object.entries(cs)) {
        console.log(`  ${tier}: hits=${s.hits} misses=${s.misses} keys=${s.keys}`);
    }

    // Coalescing stats
    const { getCoalesceStats } = require('../middleware/rateLimiter');
    const coal = getCoalesceStats();
    console.log(`\n=== Coalescing Stats ===`);
    console.log(`  Enabled: ${coal.enabled} (config: ${coal.configEnabled})`);
    console.log(`  TTL: ${coal.ttlMs}ms  Max inflight: ${coal.maxInflight}`);
    console.log(`  Waiters coalesced: ${coal.totalWaiters}`);
    console.log(`  Bypassed (no auth): ${coal.totalBypassed}`);
    console.log(`  Failsafe: tripped=${coal.failsafe.tripped} triggers=${coal.failsafe.triggerCount} bypassed=${coal.failsafe.failsafeBypass}`);

    // PDF queue stats
    const pdfQueue = require('../services/pdfQueue');
    const pq = pdfQueue.getStats();
    console.log(`\n=== PDF Queue Stats ===`);
    console.log(`  Queued: ${pq.queued}  Processing: ${pq.processing}  Completed: ${pq.completed}  Failed: ${pq.failed}`);
    console.log(`  Workers: ${pq.activeWorkers}/${pq.maxConcurrent}`);

    // Process info
    const mem = process.memoryUsage();
    console.log(`\n=== Process Stats ===`);
    console.log(`  PID: ${process.pid}`);
    console.log(`  RSS: ${Math.round(mem.rss / 1024 / 1024)}MB`);
    console.log(`  Heap: ${Math.round(mem.heapUsed / 1024 / 1024)}/${Math.round(mem.heapTotal / 1024 / 1024)}MB`);
    console.log(`  Uptime: ${Math.floor(process.uptime())}s`);

    process.exit(0);
})().catch(e => { console.error('FAILED:', e); process.exit(1); });

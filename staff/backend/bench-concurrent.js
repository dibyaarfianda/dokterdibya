#!/usr/bin/env node
/**
 * Concurrent benchmark for GET /api/patients
 *
 * Tests realistic concurrency scenarios to avoid false positives
 * from warm single-user runs.
 *
 * Usage:
 *   node bench-concurrent.js              # full suite
 *   node bench-concurrent.js --quick      # quick check (limit=10, concurrency=5 only)
 *
 * Prerequisites:
 *   - Server must be running on localhost:3000
 *   - .env must be loaded (for JWT_SECRET and DB)
 *
 * Metrics captured per scenario:
 *   p50 / p95 / p99 latency (ms)
 *   Total DB queries (from /api/metrics)
 *   Total time for all requests
 */

require('dotenv').config();
const http = require('http');
const jwt = require('jsonwebtoken');
const db = require('./db');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const LIMITS = [10, 50, 200];
const CONCURRENCIES = [5, 10, 20];
const ROUNDS_PER_SCENARIO = 5;  // each VU fires this many sequential requests

const QUICK_LIMITS = [10];
const QUICK_CONCURRENCIES = [5];

// ---------------------------------------------------------------------------
// HTTP helper
// ---------------------------------------------------------------------------

function request(method, path, headers = {}) {
    return new Promise((resolve, reject) => {
        const t0 = Date.now();
        const opts = {
            hostname: 'localhost',
            port: 3000,
            path,
            method,
            headers,
            timeout: 30000,
        };
        const req = http.request(opts, (res) => {
            let body = '';
            res.on('data', (chunk) => (body += chunk));
            res.on('end', () => {
                resolve({
                    ms: Date.now() - t0,
                    status: res.statusCode,
                    body,
                    headers: res.headers,
                });
            });
        });
        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });
        req.end();
    });
}

// ---------------------------------------------------------------------------
// Stats helpers
// ---------------------------------------------------------------------------

function percentile(sorted, p) {
    const idx = Math.ceil(sorted.length * p) - 1;
    return sorted[Math.max(0, idx)];
}

function computeStats(times) {
    const sorted = [...times].sort((a, b) => a - b);
    return {
        n: sorted.length,
        min: sorted[0],
        p50: percentile(sorted, 0.5),
        p95: percentile(sorted, 0.95),
        p99: percentile(sorted, 0.99),
        max: sorted[sorted.length - 1],
        avg: Math.round(times.reduce((a, b) => a + b, 0) / times.length),
    };
}

// ---------------------------------------------------------------------------
// Metric snapshot helper
// ---------------------------------------------------------------------------

async function getMetricsSnapshot() {
    try {
        const res = await request('GET', '/api/metrics');
        const data = JSON.parse(res.body);
        return {
            totalQueries: data.db?.totalQueries || 0,
            avgQueryMs: data.db?.avgQueryMs || 0,
            slowQueryCount: data.db?.slowQueryCount || 0,
            cacheHits: (data.cache?.short?.hits || 0) + (data.cache?.medium?.hits || 0),
            cacheMisses: (data.cache?.short?.misses || 0) + (data.cache?.medium?.misses || 0),
        };
    } catch {
        return null;
    }
}

// ---------------------------------------------------------------------------
// Functional parity check — validates response schema and key field population
// ---------------------------------------------------------------------------

const REQUIRED_TOP_KEYS = ['success', 'data', 'count'];
const REQUIRED_PATIENT_KEYS = ['id', 'full_name', 'resume_status', 'is_obstetri', 'has_delivered'];

function validateResponse(body, limit) {
    const issues = [];
    try {
        const data = JSON.parse(body);
        for (const k of REQUIRED_TOP_KEYS) {
            if (!(k in data)) issues.push(`missing top-level key: ${k}`);
        }
        if (!data.success) issues.push(`success=false`);
        if (!Array.isArray(data.data)) {
            issues.push('data is not an array');
            return issues;
        }
        if (data.data.length > limit) issues.push(`returned ${data.data.length} rows, expected <= ${limit}`);
        if (data.pagination) {
            for (const pk of ['total', 'page', 'totalPages', 'limit']) {
                if (!(pk in data.pagination)) issues.push(`missing pagination.${pk}`);
            }
        }
        // Spot-check first patient
        if (data.data.length > 0) {
            const p = data.data[0];
            for (const k of REQUIRED_PATIENT_KEYS) {
                if (!(k in p)) issues.push(`patient[0] missing key: ${k}`);
            }
        }
    } catch (e) {
        issues.push(`JSON parse error: ${e.message}`);
    }
    return issues;
}

// ---------------------------------------------------------------------------
// Virtual User simulation
// ---------------------------------------------------------------------------

async function virtualUser(token, limit, rounds) {
    const times = [];
    const errors = [];
    const schemaIssues = [];
    const auth = { Authorization: `Bearer ${token}`, 'Cache-Control': 'no-cache' };

    for (let i = 0; i < rounds; i++) {
        try {
            // Each round: one fresh (no-cache) patients list request
            const page = Math.floor(Math.random() * 3) + 1;
            const res = await request(
                'GET',
                `/api/patients?limit=${limit}&page=${page}&_=${Date.now()}`,
                auth
            );
            times.push(res.ms);
            if (res.status !== 200) {
                errors.push({ status: res.status, page });
            } else {
                // Validate on first round only (avoid overhead)
                if (i === 0) {
                    const issues = validateResponse(res.body, limit);
                    if (issues.length > 0) schemaIssues.push(...issues);
                }
            }
        } catch (err) {
            errors.push({ error: err.message });
        }
    }
    return { times, errors, schemaIssues };
}

// ---------------------------------------------------------------------------
// Run one scenario
// ---------------------------------------------------------------------------

async function runScenario(tokens, limit, concurrency, rounds) {
    const before = await getMetricsSnapshot();

    const t0 = Date.now();
    const vuPromises = Array.from({ length: concurrency }, (_, i) =>
        virtualUser(tokens[i % tokens.length], limit, rounds)
    );
    const vuResults = await Promise.all(vuPromises);
    const wallTime = Date.now() - t0;

    const after = await getMetricsSnapshot();

    // Aggregate
    const allTimes = vuResults.flatMap((r) => r.times);
    const allErrors = vuResults.flatMap((r) => r.errors);
    const allSchemaIssues = vuResults.flatMap((r) => r.schemaIssues);
    const stats = computeStats(allTimes);

    const totalRequests = concurrency * rounds;
    const dbQueriesDelta =
        before && after ? after.totalQueries - before.totalQueries : null;
    const queriesPerRequest =
        dbQueriesDelta !== null ? (dbQueriesDelta / totalRequests).toFixed(1) : '?';

    return {
        limit,
        concurrency,
        rounds,
        totalRequests,
        wallTime,
        stats,
        errors: allErrors.length,
        schemaIssues: allSchemaIssues,
        dbQueriesDelta,
        queriesPerRequest,
    };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

(async () => {
    const quick = process.argv.includes('--quick');
    const limits = quick ? QUICK_LIMITS : LIMITS;
    const concurrencies = quick ? QUICK_CONCURRENCIES : CONCURRENCIES;

    // Generate tokens for concurrent users
    const [users] = await db.query(
        "SELECT new_id, email, role FROM users WHERE user_type='staff' AND is_active=1 LIMIT 20"
    );
    if (!users.length) {
        console.error('No active staff users found');
        process.exit(1);
    }

    const tokens = users.map((u) =>
        jwt.sign(
            { id: u.new_id, email: u.email, role: u.role || 'admin', role_id: 2 },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        )
    );

    // Warmup
    console.log('Warming up...');
    const auth = { Authorization: `Bearer ${tokens[0]}` };
    await request('GET', '/api/patients?limit=10', auth);
    await request('GET', '/api/patients?limit=10', auth);

    // Reset metrics
    await request('POST', '/api/metrics/reset');

    console.log(`\n${'='.repeat(90)}`);
    console.log(
        `  Concurrent Benchmark — GET /api/patients`
    );
    console.log(
        `  ${limits.length * concurrencies.length} scenarios × ${ROUNDS_PER_SCENARIO} rounds/VU`
    );
    console.log(`${'='.repeat(90)}\n`);

    // Header
    console.log(
        [
            'limit'.padStart(6),
            'VUs'.padStart(4),
            'reqs'.padStart(5),
            'p50'.padStart(6),
            'p95'.padStart(6),
            'p99'.padStart(6),
            'avg'.padStart(6),
            'max'.padStart(6),
            'wall'.padStart(7),
            'q/req'.padStart(6),
            'errs'.padStart(5),
        ].join(' | ')
    );
    console.log('-'.repeat(90));

    const results = [];

    for (const limit of limits) {
        for (const concurrency of concurrencies) {
            const r = await runScenario(tokens, limit, concurrency, ROUNDS_PER_SCENARIO);
            results.push(r);

            console.log(
                [
                    String(r.limit).padStart(6),
                    String(r.concurrency).padStart(4),
                    String(r.totalRequests).padStart(5),
                    `${r.stats.p50}ms`.padStart(6),
                    `${r.stats.p95}ms`.padStart(6),
                    `${r.stats.p99}ms`.padStart(6),
                    `${r.stats.avg}ms`.padStart(6),
                    `${r.stats.max}ms`.padStart(6),
                    `${r.wallTime}ms`.padStart(7),
                    String(r.queriesPerRequest).padStart(6),
                    String(r.errors).padStart(5),
                ].join(' | ')
            );

            // Brief pause between scenarios to let DB settle
            await new Promise((r) => setTimeout(r, 500));
        }
    }

    // Schema parity report
    const allSchemaIssues = results.flatMap((r) => r.schemaIssues);
    if (allSchemaIssues.length > 0) {
        console.log(`\n--- SCHEMA PARITY ISSUES (${allSchemaIssues.length}) ---`);
        [...new Set(allSchemaIssues)].forEach((issue) => console.log(`  - ${issue}`));
    } else {
        console.log('\n--- Schema Parity: PASS ---');
    }

    // Final DB stats
    const finalMetrics = await getMetricsSnapshot();
    if (finalMetrics) {
        console.log(`\n--- DB Summary ---`);
        console.log(`  Total queries: ${finalMetrics.totalQueries}`);
        console.log(`  Avg query: ${finalMetrics.avgQueryMs}ms`);
        console.log(`  Slow queries (>200ms): ${finalMetrics.slowQueryCount}`);
        console.log(
            `  Cache: ${finalMetrics.cacheHits} hits / ${finalMetrics.cacheMisses} misses`
        );
    }

    // Enrichment failure stats
    let enrichmentStats = null;
    try {
        const mRes = await request('GET', '/api/metrics');
        const mData = JSON.parse(mRes.body);
        enrichmentStats = mData.enrichment || null;
        if (enrichmentStats && enrichmentStats.total > 0) {
            console.log(`\n--- ENRICHMENT FAILURES ---`);
            for (const [k, v] of Object.entries(enrichmentStats)) {
                if (v > 0) console.log(`  ${k}: ${v}`);
            }
        } else {
            console.log('\n--- Enrichment Failures: 0 (PASS) ---');
        }
    } catch { /* metrics not available */ }

    // Output as JSON for comparison tooling
    const totalErrors = results.reduce((s, r) => s + r.errors, 0);
    const totalRequests = results.reduce((s, r) => s + r.totalRequests, 0);
    const errorRate = totalRequests > 0 ? (totalErrors / totalRequests * 100).toFixed(2) : '0';

    const output = {
        timestamp: new Date().toISOString(),
        mode: quick ? 'quick' : 'full',
        roundsPerVU: ROUNDS_PER_SCENARIO,
        results: results.map((r) => ({
            limit: r.limit,
            concurrency: r.concurrency,
            p50: r.stats.p50,
            p95: r.stats.p95,
            p99: r.stats.p99,
            avg: r.stats.avg,
            max: r.stats.max,
            wallTime: r.wallTime,
            queriesPerRequest: r.queriesPerRequest,
            errors: r.errors,
        })),
        dbSummary: finalMetrics,
        enrichmentStats,
        schemaParity: allSchemaIssues.length === 0,
        schemaIssues: [...new Set(allSchemaIssues)],
        errorRate: `${errorRate}%`,
    };

    console.log(`\n--- JSON (for before/after comparison) ---`);
    console.log(JSON.stringify(output, null, 2));

    process.exit(0);
})().catch((e) => {
    console.error('FATAL:', e);
    process.exit(1);
});

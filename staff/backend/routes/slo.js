/**
 * SLO (Service Level Objectives) Dashboard Route
 *
 * GET /api/slo — returns current SLO status with pass/fail indicators.
 *
 * SLOs defined:
 *   1. API availability  — 5xx rate < 1%
 *   2. Latency budget    — p95 < 200ms, p99 < 500ms
 *   3. Coalescing health — failsafe not tripped, map size < threshold
 *   4. DB health         — avg query < 50ms, slow queries < 5
 *   5. PDF queue health  — no stuck jobs, queue depth < 20
 *   6. Memory stability  — RSS < 512MB
 */

const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
    const { getMetrics } = require('../middleware/metrics');
    const { getRumSummary, getCacheStats } = require('./rum');
    const { getDbStats } = require('../middleware/dbMonitor');
    const { getCoalesceStats } = require('../middleware/rateLimiter');
    const pdfQueue = require('../services/pdfQueue');

    const metrics = getMetrics();
    const db = getDbStats();
    const coal = getCoalesceStats();
    const pdf = pdfQueue.getStats();
    const mem = process.memoryUsage();

    // Compute SLOs
    const serverErrors = metrics.errors?.byType?.server || 0;
    const totalReqs = metrics.requests?.total || 1;
    const errorRate = serverErrors / totalReqs;

    const p95 = metrics.performance?.p95Ms || 0;
    const p99 = metrics.performance?.p99Ms || 0;

    const slos = {
        availability: {
            name: 'API Availability (5xx < 1%)',
            value: `${(errorRate * 100).toFixed(2)}%`,
            pass: errorRate < 0.01,
            detail: { serverErrors, totalReqs },
        },
        latencyP95: {
            name: 'Latency p95 < 200ms',
            value: `${p95}ms`,
            pass: p95 < 200,
        },
        latencyP99: {
            name: 'Latency p99 < 500ms',
            value: `${p99}ms`,
            pass: p99 < 500,
        },
        coalescingHealth: {
            name: 'Coalescing healthy',
            value: coal.failsafe.tripped ? 'FAILSAFE TRIPPED' : 'OK',
            pass: !coal.failsafe.tripped && coal.mapSize < (coal.maxInflight || 100),
            detail: {
                enabled: coal.enabled,
                mapSize: coal.mapSize,
                failsafeTrips: coal.failsafe.triggerCount,
            },
        },
        dbHealth: {
            name: 'DB avg query < 50ms',
            value: `${db.avgQueryMs || 0}ms`,
            pass: (db.avgQueryMs || 0) < 50 && (db.slowQueryCount || 0) < 5,
            detail: {
                totalQueries: db.totalQueries,
                slowQueries: db.slowQueryCount,
            },
        },
        pdfQueueHealth: {
            name: 'PDF queue depth < 20',
            value: `queued=${pdf.queued} processing=${pdf.processing}`,
            pass: (pdf.queued + pdf.processing) < 20 && pdf.failed < 5,
            detail: pdf,
        },
        memoryStability: {
            name: 'Memory RSS < 512MB',
            value: `${Math.round(mem.rss / 1024 / 1024)}MB`,
            pass: mem.rss < 512 * 1024 * 1024,
            detail: {
                heapUsed: `${Math.round(mem.heapUsed / 1024 / 1024)}MB`,
                heapTotal: `${Math.round(mem.heapTotal / 1024 / 1024)}MB`,
            },
        },
    };

    const allPass = Object.values(slos).every(s => s.pass);

    res.json({
        status: allPass ? 'healthy' : 'degraded',
        timestamp: new Date().toISOString(),
        uptime: Math.floor(process.uptime()),
        pid: process.pid,
        slos,
    });
});

module.exports = router;

/**
 * Real User Monitoring (RUM) Route
 * Ingests frontend performance metrics and provides aggregated summaries.
 */

const express = require('express');
const router = express.Router();
const cache = require('../utils/cache');

// ---------------------------------------------------------------------------
// In-memory storage — keyed by metric name (e.g. "LCP", "api_/api/patients")
// Each entry: { samples: number[], byPage: { [page]: number[] } }
// ---------------------------------------------------------------------------

const MAX_SAMPLES = 500;
const metricStore = {};

function ensureBucket(name) {
    if (!metricStore[name]) {
        metricStore[name] = { samples: [], byPage: {} };
    }
    return metricStore[name];
}

function cappedPush(arr, value, max) {
    arr.push(value);
    if (arr.length > max) arr.splice(0, arr.length - max);
}

function recordMetric(name, value, page) {
    const bucket = ensureBucket(name);
    cappedPush(bucket.samples, value, MAX_SAMPLES);
    if (page) {
        if (!bucket.byPage[page]) bucket.byPage[page] = [];
        cappedPush(bucket.byPage[page], value, MAX_SAMPLES);
    }
}

// ---------------------------------------------------------------------------
// Percentile helpers
// ---------------------------------------------------------------------------

function calculatePercentile(arr, p) {
    if (arr.length === 0) return null;
    const sorted = [...arr].sort((a, b) => a - b);
    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, idx)];
}

function pcts(arr) {
    return {
        p50: calculatePercentile(arr, 50),
        p75: calculatePercentile(arr, 75),
        p95: calculatePercentile(arr, 95),
        count: arr.length
    };
}

// ---------------------------------------------------------------------------
// Summary builder
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Cost tracking — lightweight counters for observability
// ---------------------------------------------------------------------------

const costCounters = {
    totalPayloadBytes: 0,
    r2AccessCount: 0,
    socketEventsEmitted: 0,
    beaconsReceived: 0,
};

function trackCost(key, value = 1) {
    if (key in costCounters) costCounters[key] += value;
}

function getCostSummary() {
    return {
        ...costCounters,
        totalPayloadKB: Math.round(costCounters.totalPayloadBytes / 1024),
    };
}

function getRumSummary() {
    const webVitals = {};
    for (const vital of ['LCP', 'INP', 'CLS', 'FCP', 'domContentLoaded', 'load', 'firstPaint', 'firstContentfulPaint']) {
        const bucket = metricStore[vital];
        if (!bucket || bucket.samples.length === 0) continue;
        const byPage = {};
        for (const [page, samples] of Object.entries(bucket.byPage)) {
            byPage[page] = pcts(samples);
        }
        webVitals[vital] = { overall: pcts(bucket.samples), byPage };
    }

    const apiTimings = {};
    for (const [name, bucket] of Object.entries(metricStore)) {
        if (!name.startsWith('api:') || bucket.samples.length === 0) continue;
        apiTimings[name.slice(4)] = pcts(bucket.samples);
    }

    let cacheStats = null;
    try { cacheStats = cache.stats(); } catch (_) {}

    return { timestamp: new Date().toISOString(), webVitals, apiTimings, cacheStats };
}

function getCacheStats() {
    try { return cache.stats(); } catch (_) { return null; }
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/**
 * POST /api/rum
 * Accepts the payload sent by rum.js client:
 *   { page, role, ts, metrics: { lcp, inp, cls, ... }, apiCalls: [{ endpoint, duration, status }] }
 */
router.post('/', (req, res) => {
    const body = req.body || {};
    const page = typeof body.page === 'string' ? body.page.slice(0, 50) : null;
    let accepted = 0;

    // Record web vitals & page load metrics
    if (body.metrics && typeof body.metrics === 'object') {
        for (const [key, value] of Object.entries(body.metrics)) {
            if (typeof value !== 'number' || !isFinite(value)) continue;
            const name = key.toUpperCase() === key ? key : key; // preserve case
            recordMetric(name, value, page);
            accepted++;
        }
    }

    // Record API call timings
    if (Array.isArray(body.apiCalls)) {
        for (const call of body.apiCalls.slice(0, 50)) {
            if (!call || typeof call.duration !== 'number') continue;
            const ep = typeof call.endpoint === 'string' ? call.endpoint.slice(0, 100) : '/unknown';
            recordMetric('api:' + ep, call.duration, page);
            accepted++;
        }
    }

    // Track cost metrics
    costCounters.beaconsReceived++;
    const bodySize = JSON.stringify(body).length;
    trackCost('totalPayloadBytes', bodySize);

    return res.json({ success: true, accepted });
});

/**
 * GET /api/rum/summary
 */
router.get('/summary', (req, res) => {
    return res.json({ success: true, data: getRumSummary() });
});

module.exports = router;
module.exports.getRumSummary = getRumSummary;
module.exports.getCacheStats = getCacheStats;
module.exports.getCostSummary = getCostSummary;
module.exports.trackCost = trackCost;

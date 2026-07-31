/**
 * Real User Monitoring (RUM) Route
 * Ingests frontend performance metrics and provides aggregated summaries.
 */

const express = require('express');
const router = express.Router();
const cache = require('../utils/cache');
const { verifyToken, requireSuperadmin } = require('../middleware/auth');

// ---------------------------------------------------------------------------
// In-memory storage — keyed by metric name (e.g. "LCP", "api_/api/patients")
// Each entry: { samples: number[], byPage: { [page]: number[] } }
// ---------------------------------------------------------------------------

const MAX_SAMPLES = 500;
const MAX_API_CALLS = 50;
const MAX_ERRORS = 20;
const MAX_API_BUCKETS = 200;
const MAX_PAGE_BUCKETS = 100;
const ALLOWED_METRICS = new Set([
    'LCP',
    'INP',
    'CLS',
    'FCP',
    'domContentLoaded',
    'load',
    'firstPaint',
    'firstContentfulPaint'
]);
const metricStore = {};
const clientErrorStore = {};

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
    if (name.startsWith('api:') && !metricStore[name]) {
        const apiBucketCount = Object.keys(metricStore).filter(key => key.startsWith('api:')).length;
        if (apiBucketCount >= MAX_API_BUCKETS) name = 'api:/other';
    }
    const bucket = ensureBucket(name);
    cappedPush(bucket.samples, value, MAX_SAMPLES);
    if (page) {
        let pageKey = page;
        if (!bucket.byPage[pageKey] && Object.keys(bucket.byPage).length >= MAX_PAGE_BUCKETS) {
            pageKey = '/other';
        }
        if (!bucket.byPage[pageKey]) bucket.byPage[pageKey] = [];
        cappedPush(bucket.byPage[pageKey], value, MAX_SAMPLES);
    }
}

function normalizeApiPath(endpoint) {
    if (typeof endpoint !== 'string' || !endpoint.trim()) return '/unknown';

    try {
        const parsed = new URL(endpoint, 'https://dokterdibya.local');
        return parsed.pathname
            .replace(/\/\d+(?=\/|$)/g, '/:id')
            .replace(/\/[A-Za-z]{2,}\d+(?=\/|$)/g, '/:id')
            .replace(/\/[0-9a-fA-F-]{8,}(?=\/|$)/g, '/:id')
            .slice(0, 100);
    } catch (_) {
        return endpoint.split('?')[0].slice(0, 100) || '/unknown';
    }
}

function sanitizeClientErrorText(value) {
    return String(value || 'Unknown client error')
        .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, '[email]')
        .replace(/https?:\/\/[^\s)]+/g, '[url]')
        .replace(/\b(?:DRD|P)\d{4,}\b/gi, '[record]')
        .replace(/\b\d{6,}\b/g, '[number]')
        .slice(0, 180);
}

function recordClientError(raw, page) {
    if (!raw || typeof raw !== 'object') return false;
    const fingerprint = /^[a-z0-9_-]{1,64}$/i.test(String(raw.fingerprint || ''))
        ? String(raw.fingerprint)
        : 'unknown';
    const type = String(raw.type || 'error').replace(/[^a-z0-9_-]/gi, '').slice(0, 40) || 'error';
    const key = `${type}:${fingerprint}`;
    const existing = clientErrorStore[key] || {
        type,
        fingerprint,
        message: sanitizeClientErrorText(raw.message),
        count: 0,
        pages: {},
        lastSeen: null
    };
    existing.count += 1;
    existing.lastSeen = new Date().toISOString();
    if (page) existing.pages[page] = (existing.pages[page] || 0) + 1;
    clientErrorStore[key] = existing;

    const keys = Object.keys(clientErrorStore);
    if (keys.length > 200) {
        keys.sort((a, b) => String(clientErrorStore[a].lastSeen).localeCompare(String(clientErrorStore[b].lastSeen)));
        keys.slice(0, keys.length - 200).forEach(oldKey => delete clientErrorStore[oldKey]);
    }
    return true;
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

    const clientErrors = Object.values(clientErrorStore)
        .sort((a, b) => b.count - a.count)
        .slice(0, 30);

    return { timestamp: new Date().toISOString(), webVitals, apiTimings, clientErrors, cacheStats };
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
    const page = typeof body.page === 'string'
        ? body.page.replace(/[^a-z0-9/_-]/gi, '').slice(0, 50) || null
        : null;
    let accepted = 0;

    // Record web vitals & page load metrics
    if (body.metrics && typeof body.metrics === 'object') {
        const metricEntries = Object.entries(body.metrics);
        const unknownMetric = metricEntries.find(([key]) => !ALLOWED_METRICS.has(key));
        if (unknownMetric) {
            return res.status(400).json({
                success: false,
                code: 'RUM_UNKNOWN_METRIC',
                message: `Unsupported metric: ${String(unknownMetric[0]).slice(0, 40)}`
            });
        }
        for (const [key, value] of metricEntries) {
            if (typeof value !== 'number' || !isFinite(value)) continue;
            recordMetric(key, value, page);
            accepted++;
        }
    }

    // Record API call timings
    if (Array.isArray(body.apiCalls)) {
        for (const call of body.apiCalls.slice(0, MAX_API_CALLS)) {
            if (!call || typeof call.duration !== 'number' || !Number.isFinite(call.duration)) continue;
            const ep = normalizeApiPath(call.endpoint);
            recordMetric('api:' + ep, call.duration, page);
            accepted++;
        }
    }

    if (Array.isArray(body.errors)) {
        for (const clientError of body.errors.slice(0, MAX_ERRORS)) {
            if (recordClientError(clientError, page)) accepted++;
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
router.get('/summary', verifyToken, requireSuperadmin, (req, res) => {
    res.set('Cache-Control', 'no-store');
    return res.json({ success: true, data: getRumSummary() });
});

module.exports = router;
module.exports.getRumSummary = getRumSummary;
module.exports.getCacheStats = getCacheStats;
module.exports.getCostSummary = getCostSummary;
module.exports.trackCost = trackCost;
module.exports.normalizeApiPath = normalizeApiPath;

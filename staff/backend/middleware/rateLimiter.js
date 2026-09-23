/**
 * Smart Rate Limiter — endpoint-tiered, IP-keyed
 * Provides different limits for auth, expensive, and standard endpoints.
 * Also provides request coalescing with canary controls and auto-failsafe.
 *
 * Config via env vars (all optional, defaults preserve current behavior):
 *   COALESCE_ENABLED=true        — master on/off switch
 *   COALESCE_TTL_MS=200          — dedup window in ms
 *   COALESCE_MAX_INFLIGHT=100    — failsafe threshold for inflight map size
 *   COALESCE_COOLDOWN_MS=30000   — how long failsafe stays tripped before retry
 */

const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const logger = require('../utils/logger');

// ---------------------------------------------------------------------------
// Canary configuration — all readable from env, hot-reloadable on restart
// ---------------------------------------------------------------------------

const config = {
    enabled:      (process.env.COALESCE_ENABLED || 'true') === 'true',
    ttlMs:        parseInt(process.env.COALESCE_TTL_MS, 10)        || 200,
    maxInflight:  parseInt(process.env.COALESCE_MAX_INFLIGHT, 10)  || 100,
    cooldownMs:   parseInt(process.env.COALESCE_COOLDOWN_MS, 10)   || 30000,
};

// ---------------------------------------------------------------------------
// Failsafe state — auto-disables coalescing if inflight map stays overloaded
// ---------------------------------------------------------------------------

const failsafe = {
    tripped:        false,    // currently in failsafe mode?
    triggerCount:   0,        // total times failsafe has triggered
    lastTriggerTs:  null,     // ISO timestamp of last trigger
    recoveryTimer:  null,     // setTimeout handle for cooldown recovery
};

/**
 * Trip the failsafe — disable coalescing temporarily.
 * Called when inflight map exceeds threshold for a sustained check.
 */
function tripFailsafe() {
    if (failsafe.tripped) return; // already tripped
    failsafe.tripped = true;
    failsafe.triggerCount++;
    failsafe.lastTriggerTs = new Date().toISOString();
    logger.warn('Coalescing failsafe TRIGGERED — coalescing disabled', {
        inflightSize: inflightRequests.size,
        threshold: config.maxInflight,
        cooldownMs: config.cooldownMs
    });

    // Schedule recovery attempt after cooldown
    clearTimeout(failsafe.recoveryTimer);
    failsafe.recoveryTimer = setTimeout(() => {
        // Re-enable only if map has drained below threshold
        if (inflightRequests.size < config.maxInflight) {
            failsafe.tripped = false;
            logger.info('Coalescing failsafe RECOVERED — coalescing re-enabled', {
                inflightSize: inflightRequests.size
            });
        } else {
            // Still overloaded — re-trip
            failsafe.tripped = false; // reset so tripFailsafe() logs again
            tripFailsafe();
        }
    }, config.cooldownMs);
}

// ---------------------------------------------------------------------------
// Observability counters
// ---------------------------------------------------------------------------

const counters = {
    coalesceMapSize: 0,         // current inflight entries
    coalescedWaiters: 0,        // total requests that piggybacked
    coalesceBypass: 0,          // total requests that skipped coalescing
    failsafeBypass: 0,          // total requests bypassed due to failsafe
    limiterRejects: {           // rejections by tier
        auth: 0,
        expensive: 0,
        standard: 0
    }
};

function getCoalesceStats() {
    return {
        enabled: config.enabled && !failsafe.tripped,
        configEnabled: config.enabled,
        ttlMs: config.ttlMs,
        maxInflight: config.maxInflight,
        cooldownMs: config.cooldownMs,
        mapSize: counters.coalesceMapSize,
        totalWaiters: counters.coalescedWaiters,
        totalBypassed: counters.coalesceBypass,
        failsafe: {
            tripped: failsafe.tripped,
            triggerCount: failsafe.triggerCount,
            lastTriggerTs: failsafe.lastTriggerTs,
            failsafeBypass: counters.failsafeBypass,
        },
        limiterRejects: { ...counters.limiterRejects }
    };
}

// ---------------------------------------------------------------------------
// Tier definitions — all keyed by IP (auth middleware hasn't run yet)
// ---------------------------------------------------------------------------

/** Auth endpoints — strict to prevent brute force */
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,   // 15 min
    max: 30,                     // 30 attempts per window
    message: { success: false, message: 'Terlalu banyak percobaan login. Coba lagi 15 menit.' },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    keyGenerator: (req) => req.ip,
    handler: (req, res, next, options) => {
        counters.limiterRejects.auth++;
        res.status(options.statusCode).json(options.message);
    }
});

/** Expensive endpoints — AI, PDF generation, bulk upload */
const expensiveLimiter = rateLimit({
    windowMs: 60 * 1000,        // 1 min
    max: 10,                     // 10 per minute per IP
    message: { success: false, message: 'Rate limit tercapai. Tunggu sebentar.' },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.ip,
    handler: (req, res, next, options) => {
        counters.limiterRejects.expensive++;
        res.status(options.statusCode).json(options.message);
    }
});

/** Standard API — generous but bounded */
const standardLimiter = rateLimit({
    windowMs: 60 * 1000,        // 1 min
    max: 200,                    // 200 per minute per IP
    message: { success: false, message: 'Terlalu banyak request. Coba lagi nanti.' },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.ip,
    handler: (req, res, next, options) => {
        counters.limiterRejects.standard++;
        res.status(options.statusCode).json(options.message);
    }
});

// ---------------------------------------------------------------------------
// Request coalescing — deduplicate identical in-flight requests
// ---------------------------------------------------------------------------

const inflightRequests = new Map();

/**
 * Hash the auth token to avoid storing raw JWTs in memory.
 * SHA-256 is collision-safe and produces a fixed 64-char key component.
 */
function hashIdentity(authHeader) {
    return crypto.createHash('sha256').update(authHeader).digest('hex');
}

/**
 * Coalescing middleware for GET endpoints.
 * Keys by URL + hashed Bearer token to prevent cross-user response mixing.
 * Skips coalescing if: disabled by config, failsafe tripped, no auth header.
 * Fail-open: requests always continue normally when coalescing is off.
 */
function coalesce(req, res, next) {
    if (req.method !== 'GET') return next();
    // Authentication endpoints and cookie/conditional requests must execute independently.
    const path = req.originalUrl.split('?')[0];
    if (/(?:^|\/)(?:auth|login|logout|register|refresh|token|password|verify|me)(?:\/|$)/i.test(path) ||
        req.headers.cookie || req.headers.range || req.headers['if-none-match'] || req.headers['if-modified-since']) return next();

    // Check master switch and failsafe
    if (!config.enabled || failsafe.tripped) {
        if (failsafe.tripped) counters.failsafeBypass++;
        else counters.coalesceBypass++;
        return next();
    }

    // SAFETY: Use a hash of the Authorization header as identity key.
    // req.user is NOT populated yet (auth middleware runs inside route handlers).
    // Without a stable identity, skip coalescing to prevent cross-user data leaks.
    const authHeader = req.headers['authorization'] || '';
    if (!authHeader) {
        counters.coalesceBypass++;
        return next();
    }

    const key = `${req.originalUrl}|${hashIdentity(JSON.stringify([authHeader, req.headers.accept, req.headers['accept-language']]))}`;
    const pending = inflightRequests.get(key);

    if (pending && (Date.now() - pending.ts < config.ttlMs)) {
        // Piggyback — wait for the in-flight request's result
        counters.coalescedWaiters++;
        const waiter = { res, next };
        pending.waiters.push(waiter);
        res.on('close', () => {
            const index = pending.waiters.indexOf(waiter);
            if (index !== -1) pending.waiters.splice(index, 1);
        });
        return;
    }

    // First request — register it
    const entry = { ts: Date.now(), waiters: [] };
    inflightRequests.set(key, entry);
    counters.coalesceMapSize = inflightRequests.size;

    // Check failsafe threshold
    if (inflightRequests.size >= config.maxInflight) {
        tripFailsafe();
    }

    let settled = false;
    let cleanupTimer;
    function settle(snapshot) {
        if (settled) return;
        settled = true;
        clearTimeout(cleanupTimer);
        if (inflightRequests.get(key) === entry) inflightRequests.delete(key);
        counters.coalesceMapSize = inflightRequests.size;
        for (const waiter of entry.waiters.splice(0)) {
            if (waiter.res.destroyed || waiter.res.writableEnded) continue;
            if (!snapshot) {
                // Errors, streams and auth responses run each waiter's own route/auth stack.
                waiter.next();
                continue;
            }
            waiter.res.status(snapshot.status);
            for (const [name, value] of Object.entries(snapshot.headers)) waiter.res.set(name, value);
            waiter.res.json(snapshot.body);
        }
    }

    // Only successful JSON reads are shareable. Preserve their HTTP contract.
    const originalJson = res.json.bind(res);
    res.json = function (body) {
        let snapshot = null;
        if (res.statusCode >= 200 && res.statusCode < 300 &&
            !res.getHeader('set-cookie') && !res.getHeader('www-authenticate') && body?.success !== false) {
            const headers = {};
            for (const name of ['cache-control', 'content-type', 'content-language', 'etag', 'last-modified', 'expires', 'pragma', 'vary']) {
                const value = res.getHeader(name);
                if (value !== undefined) headers[name] = value;
            }
            try { snapshot = { status: res.statusCode, headers, body: JSON.parse(JSON.stringify(body)) }; } catch (_) {}
        }
        settle(snapshot);
        return originalJson(body);
    };

    res.on('finish', () => settle(null));
    res.on('close', () => settle(null));
    cleanupTimer = setTimeout(() => settle(null), 5000);
    cleanupTimer.unref?.();

    next();
}

// Expose internals for testing only
coalesce._internals = { inflightRequests, config, failsafe, hashIdentity, counters, tripFailsafe };

module.exports = {
    authLimiter,
    expensiveLimiter,
    standardLimiter,
    coalesce,
    getCoalesceStats
};

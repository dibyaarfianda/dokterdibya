/**
 * Database Query Monitor
 * Tracks slow queries, query volume, and provides diagnostics endpoint.
 * Non-invasive: wraps the existing db.query without changing caller code.
 */

const logger = require('../utils/logger');

// ---------------------------------------------------------------------------
// Storage — circular buffers for slow queries and volume counters
// ---------------------------------------------------------------------------

const MAX_SLOW_QUERIES = 50;
const SLOW_THRESHOLD_MS = 200;
const DEFAULT_CHECKOUT_WARNING_MS = 10000;

const state = {
    totalQueries: 0,
    totalDurationMs: 0,
    slowQueries: [],        // { sql, durationMs, ts }
    queriesPerMinute: [],   // rolling 60-element array (last 60 minutes)
    currentMinuteCount: 0,
    lastMinuteTs: Math.floor(Date.now() / 60000),
    totalConnectionCheckouts: 0,
    totalConnectionReleases: 0,
    longHeldConnectionCount: 0,
    activeConnections: new Map(),
    nextCheckoutId: 1,
};

function parsePositiveInt(value, fallback) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

// Roll the per-minute counter
function rollMinute() {
    const nowMinute = Math.floor(Date.now() / 60000);
    if (nowMinute !== state.lastMinuteTs) {
        state.queriesPerMinute.push(state.currentMinuteCount);
        if (state.queriesPerMinute.length > 60) state.queriesPerMinute.shift();
        state.currentMinuteCount = 0;
        state.lastMinuteTs = nowMinute;
    }
}

// ---------------------------------------------------------------------------
// Wrapper — monkey-patches db.query to capture timing
// ---------------------------------------------------------------------------

function captureCheckoutStack() {
    const stack = new Error('DB connection checkout').stack || '';
    return stack
        .split('\n')
        .slice(2, 9)
        .map(line => line.trim())
        .join('\n');
}

function summarizeActiveConnections() {
    const now = Date.now();
    return Array.from(state.activeConnections.values()).map(entry => ({
        checkoutId: entry.checkoutId,
        threadId: entry.threadId,
        ageMs: now - entry.startedAt,
        warned: entry.warned,
        stack: entry.stack
    }));
}

function wrapConnectionCheckout(pool, options) {
    if (!pool || typeof pool.getConnection !== 'function' || pool.__dbMonitorGetConnectionWrapped) {
        return;
    }

    const originalGetConnection = pool.getConnection.bind(pool);
    const checkoutWarningMs = parsePositiveInt(
        options.checkoutWarningMs || process.env.DB_CONNECTION_CHECKOUT_WARN_MS,
        DEFAULT_CHECKOUT_WARNING_MS
    );

    pool.getConnection = async function (...args) {
        const connection = await originalGetConnection(...args);
        const checkoutId = state.nextCheckoutId++;
        const entry = {
            checkoutId,
            threadId: connection.threadId || connection.connection?.threadId || null,
            startedAt: Date.now(),
            stack: captureCheckoutStack(),
            warned: false,
            timer: null
        };

        state.totalConnectionCheckouts++;
        state.activeConnections.set(checkoutId, entry);

        entry.timer = setTimeout(() => {
            if (!state.activeConnections.has(checkoutId)) return;

            entry.warned = true;
            state.longHeldConnectionCount++;
            logger.warn('Long-held DB connection checkout', {
                checkoutId,
                threadId: entry.threadId,
                heldMs: Date.now() - entry.startedAt,
                activeConnectionCount: state.activeConnections.size,
                stack: entry.stack
            });
        }, checkoutWarningMs);

        if (!connection.__dbMonitorOriginalRelease) {
            connection.__dbMonitorOriginalRelease = connection.release.bind(connection);
        }

        let released = false;
        connection.release = function monitoredRelease(...releaseArgs) {
            if (!released) {
                released = true;
                clearTimeout(entry.timer);
                state.activeConnections.delete(checkoutId);
                state.totalConnectionReleases++;
            }
            return connection.__dbMonitorOriginalRelease(...releaseArgs);
        };

        return connection;
    };

    pool.__dbMonitorGetConnectionWrapped = true;
}

function wrapDbPool(pool, options = {}) {
    if (!pool || typeof pool.query !== 'function') {
        return pool;
    }

    if (pool.__dbMonitorQueryWrapped) {
        wrapConnectionCheckout(pool, options);
        return pool;
    }

    const originalQuery = pool.query.bind(pool);
    pool.query = async function (...args) {
        const t0 = Date.now();
        try {
            const result = await originalQuery(...args);
            const duration = Date.now() - t0;

            state.totalQueries++;
            state.totalDurationMs += duration;
            state.currentMinuteCount++;
            rollMinute();

            if (duration >= SLOW_THRESHOLD_MS) {
                const sql = typeof args[0] === 'string'
                    ? args[0].replace(/\s+/g, ' ').slice(0, 200)
                    : '(prepared)';
                state.slowQueries.push({
                    sql,
                    durationMs: duration,
                    ts: new Date().toISOString()
                });
                if (state.slowQueries.length > MAX_SLOW_QUERIES) {
                    state.slowQueries.shift();
                }
                logger.warn('Slow DB query', { durationMs: duration, sql });
            }

            return result;
        } catch (err) {
            const duration = Date.now() - t0;
            state.totalQueries++;
            state.totalDurationMs += duration;
            state.currentMinuteCount++;
            rollMinute();
            if (String(err && err.message || '').includes('Queue limit reached')) {
                logger.error('Database pool queue limit reached', {
                    activeConnectionCount: state.activeConnections.size,
                    activeConnections: summarizeActiveConnections().slice(0, 10)
                });
            }
            throw err;
        }
    };

    pool.__dbMonitorQueryWrapped = true;
    wrapConnectionCheckout(pool, options);

    return pool;
}

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------

function getDbStats() {
    rollMinute();
    const recentWindowStart = Date.now() - (15 * 60 * 1000);
    const slowQueriesLast15m = state.slowQueries.filter((entry) => {
        const timestamp = Date.parse(entry.ts);
        return Number.isFinite(timestamp) && timestamp >= recentWindowStart;
    }).length;
    const avgMs = state.totalQueries > 0
        ? Math.round(state.totalDurationMs / state.totalQueries)
        : 0;
    const qpmArr = state.queriesPerMinute.length > 0
        ? state.queriesPerMinute
        : [state.currentMinuteCount];
    const avgQpm = Math.round(qpmArr.reduce((a, b) => a + b, 0) / qpmArr.length);

    return {
        totalQueries: state.totalQueries,
        avgQueryMs: avgMs,
        avgQueriesPerMinute: avgQpm,
        currentMinuteQueries: state.currentMinuteCount,
        slowQueryCount: state.slowQueries.length,
        slowQueriesLast15m,
        recentSlowQueries: state.slowQueries.slice(-10),
        queriesPerMinuteHistory: qpmArr,
        totalConnectionCheckouts: state.totalConnectionCheckouts,
        totalConnectionReleases: state.totalConnectionReleases,
        activeConnectionCount: state.activeConnections.size,
        longHeldConnectionCount: state.longHeldConnectionCount,
        activeConnections: summarizeActiveConnections().slice(0, 10)
    };
}

function __resetDbMonitorForTests() {
    for (const entry of state.activeConnections.values()) {
        clearTimeout(entry.timer);
    }
    state.totalQueries = 0;
    state.totalDurationMs = 0;
    state.slowQueries = [];
    state.queriesPerMinute = [];
    state.currentMinuteCount = 0;
    state.lastMinuteTs = Math.floor(Date.now() / 60000);
    state.totalConnectionCheckouts = 0;
    state.totalConnectionReleases = 0;
    state.longHeldConnectionCount = 0;
    state.activeConnections.clear();
    state.nextCheckoutId = 1;
}

module.exports = { wrapDbPool, getDbStats, __resetDbMonitorForTests };

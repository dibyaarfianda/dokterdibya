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

const state = {
    totalQueries: 0,
    totalDurationMs: 0,
    slowQueries: [],        // { sql, durationMs, ts }
    queriesPerMinute: [],   // rolling 60-element array (last 60 minutes)
    currentMinuteCount: 0,
    lastMinuteTs: Math.floor(Date.now() / 60000),
};

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

function wrapDbPool(pool) {
    if (!pool || typeof pool.query !== 'function') {
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
            throw err;
        }
    };

    return pool;
}

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------

function getDbStats() {
    rollMinute();
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
        recentSlowQueries: state.slowQueries.slice(-10),
        queriesPerMinuteHistory: qpmArr
    };
}

module.exports = { wrapDbPool, getDbStats };

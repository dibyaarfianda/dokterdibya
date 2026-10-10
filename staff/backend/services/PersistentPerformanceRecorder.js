'use strict';

const fs = require('fs');
const path = require('path');
const { monitorEventLoopDelay } = require('perf_hooks');
const logger = require('../utils/logger');

const DEFAULT_INTERVAL_MS = 60_000;
const DEFAULT_FILE_PATH = path.resolve(__dirname, '../logs/performance-snapshots.log');

function finiteNumber(value) {
    return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function integer(value) {
    return Math.max(0, Math.floor(finiteNumber(value)));
}

function nanosecondsToMilliseconds(value) {
    const numeric = finiteNumber(value);
    // monitorEventLoopDelay uses a very large sentinel for min before its first sample.
    if (numeric <= 0 || numeric > 1e15) return 0;
    return Math.round((numeric / 1e6) * 1000) / 1000;
}

function safePercentile(histogram, percentile) {
    try {
        return nanosecondsToMilliseconds(histogram.percentile(percentile));
    } catch (_) {
        return 0;
    }
}

function buildPerformanceSnapshot({
    processRef = process,
    eventLoopHistogram,
    getDbStats = () => ({}),
    getSocketStats = () => ({}),
    now = () => new Date()
}) {
    const memory = processRef.memoryUsage();
    const resources = processRef.resourceUsage();
    const db = getDbStats() || {};
    const sockets = getSocketStats() || {};

    return {
        schemaVersion: 1,
        recordedAt: now().toISOString(),
        process: {
            pid: integer(processRef.pid),
            uptimeSeconds: integer(processRef.uptime()),
            rssBytes: integer(memory.rss),
            heapTotalBytes: integer(memory.heapTotal),
            heapUsedBytes: integer(memory.heapUsed),
            externalBytes: integer(memory.external),
            arrayBuffersBytes: integer(memory.arrayBuffers),
            userCpuMicros: integer(resources.userCPUTime),
            systemCpuMicros: integer(resources.systemCPUTime),
            maxRssKb: integer(resources.maxRSS)
        },
        eventLoop: {
            minMs: nanosecondsToMilliseconds(eventLoopHistogram.min),
            maxMs: nanosecondsToMilliseconds(eventLoopHistogram.max),
            meanMs: nanosecondsToMilliseconds(eventLoopHistogram.mean),
            stddevMs: nanosecondsToMilliseconds(eventLoopHistogram.stddev),
            p50Ms: safePercentile(eventLoopHistogram, 50),
            p95Ms: safePercentile(eventLoopHistogram, 95),
            p99Ms: safePercentile(eventLoopHistogram, 99)
        },
        // Keep this allowlist numeric. Never persist SQL, routes, socket IDs,
        // user IDs, IP addresses, tokens, or request payloads in this file.
        database: {
            totalQueries: integer(db.totalQueries),
            avgQueryMs: finiteNumber(db.avgQueryMs),
            currentMinuteQueries: integer(db.currentMinuteQueries),
            slowQueriesLast15m: integer(db.slowQueriesLast15m),
            activeConnectionCount: integer(db.activeConnectionCount),
            waitingConnectionCount: integer(db.waitingConnectionCount),
            maxWaitingConnectionCount: integer(db.maxWaitingConnectionCount),
            avgConnectionWaitMs: finiteNumber(db.avgConnectionWaitMs),
            p95ConnectionWaitMs: finiteNumber(db.p95ConnectionWaitMs),
            maxConnectionWaitMs: finiteNumber(db.maxConnectionWaitMs),
            longHeldConnectionCount: integer(db.longHeldConnectionCount),
            poolAllConnections: integer(db.poolAllConnections),
            poolFreeConnections: integer(db.poolFreeConnections),
            poolQueuedRequests: integer(db.poolQueuedRequests)
        },
        sockets: {
            socketEventsEmitted: integer(sockets.socketEventsEmitted),
            activeSocketConnections: integer(sockets.activeSocketConnections),
            activeEngineClients: integer(sockets.activeEngineClients),
            pollingConnections: integer(sockets.pollingConnections),
            websocketConnections: integer(sockets.websocketConnections),
            registeredUserSockets: integer(sockets.registeredUserSockets),
            pendingDisconnectUsers: integer(sockets.pendingDisconnectUsers)
        }
    };
}

function createPersistentPerformanceRecorder({
    filePath = process.env.PERFORMANCE_SNAPSHOT_FILE || DEFAULT_FILE_PATH,
    intervalMs = Number.parseInt(process.env.PERFORMANCE_SNAPSHOT_INTERVAL_MS || DEFAULT_INTERVAL_MS, 10),
    processRef = process,
    eventLoopHistogram = monitorEventLoopDelay({ resolution: 20 }),
    getDbStats = () => ({}),
    getSocketStats = () => ({}),
    now = () => new Date()
} = {}) {
    if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
        throw new Error('Positive performance snapshot interval required');
    }

    let timer = null;
    let pendingWrite = Promise.resolve();
    const directoryReady = fs.promises.mkdir(path.dirname(filePath), { recursive: true });

    function record() {
        const snapshot = buildPerformanceSnapshot({
            processRef,
            eventLoopHistogram,
            getDbStats,
            getSocketStats,
            now
        });
        eventLoopHistogram.reset();
        const line = `${JSON.stringify(snapshot)}\n`;

        pendingWrite = pendingWrite
            .then(() => directoryReady)
            .then(() => fs.promises.appendFile(filePath, line, { encoding: 'utf8', mode: 0o640 }))
            .catch(error => {
                logger.error('Performance snapshot persistence failed', {
                    code: error && error.code ? error.code : 'UNKNOWN'
                });
            });
        return pendingWrite;
    }

    function start() {
        if (timer) return;
        eventLoopHistogram.enable();
        void record();
        timer = setInterval(() => void record(), intervalMs);
        timer.unref?.();
    }

    async function stop() {
        if (timer) {
            clearInterval(timer);
            timer = null;
        }
        eventLoopHistogram.disable();
        await pendingWrite;
    }

    return { start, stop, record };
}

module.exports = {
    buildPerformanceSnapshot,
    createPersistentPerformanceRecorder,
    DEFAULT_FILE_PATH,
    DEFAULT_INTERVAL_MS
};

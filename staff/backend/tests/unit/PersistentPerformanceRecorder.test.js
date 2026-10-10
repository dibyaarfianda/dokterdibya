const fs = require('fs');
const os = require('os');
const path = require('path');

const {
    buildPerformanceSnapshot,
    createPersistentPerformanceRecorder
} = require('../../services/PersistentPerformanceRecorder');

function fakeProcess() {
    return {
        pid: 4321,
        uptime: () => 125.9,
        memoryUsage: () => ({
            rss: 128 * 1024 * 1024,
            heapTotal: 64 * 1024 * 1024,
            heapUsed: 32 * 1024 * 1024,
            external: 4 * 1024 * 1024,
            arrayBuffers: 2 * 1024 * 1024
        }),
        resourceUsage: () => ({
            userCPUTime: 123456,
            systemCPUTime: 65432,
            maxRSS: 140000
        })
    };
}

function fakeHistogram() {
    return {
        min: 1_000_000,
        max: 25_000_000,
        mean: 4_000_000,
        stddev: 2_000_000,
        percentile: percentile => ({ 50: 3_000_000, 95: 8_000_000, 99: 12_000_000 }[percentile]),
        enable: jest.fn(),
        disable: jest.fn(),
        reset: jest.fn()
    };
}

function providers() {
    return {
        processRef: fakeProcess(),
        eventLoopHistogram: fakeHistogram(),
        now: () => new Date('2026-10-10T15:00:00.000Z'),
        getDbStats: () => ({
            totalQueries: 90,
            avgQueryMs: 12,
            currentMinuteQueries: 7,
            slowQueriesLast15m: 2,
            activeConnectionCount: 3,
            waitingConnectionCount: 1,
            maxWaitingConnectionCount: 4,
            avgConnectionWaitMs: 6,
            p95ConnectionWaitMs: 11,
            maxConnectionWaitMs: 13,
            longHeldConnectionCount: 1,
            poolAllConnections: 8,
            poolFreeConnections: 5,
            poolQueuedRequests: 1,
            recentSlowQueries: [{ sql: 'SELECT secret_patient_data' }]
        }),
        getSocketStats: () => ({
            socketEventsEmitted: 19,
            activeSocketConnections: 6,
            activeEngineClients: 6,
            pollingConnections: 6,
            websocketConnections: 0,
            registeredUserSockets: 5,
            pendingDisconnectUsers: 1,
            socketIds: ['must-not-be-persisted']
        })
    };
}

describe('persistent performance snapshots', () => {
    test('builds a numeric privacy-safe snapshot for process, event loop, database, and polling sockets', () => {
        const snapshot = buildPerformanceSnapshot(providers());

        expect(snapshot).toEqual({
            schemaVersion: 1,
            recordedAt: '2026-10-10T15:00:00.000Z',
            process: {
                pid: 4321,
                uptimeSeconds: 125,
                rssBytes: 134217728,
                heapTotalBytes: 67108864,
                heapUsedBytes: 33554432,
                externalBytes: 4194304,
                arrayBuffersBytes: 2097152,
                userCpuMicros: 123456,
                systemCpuMicros: 65432,
                maxRssKb: 140000
            },
            eventLoop: {
                minMs: 1,
                maxMs: 25,
                meanMs: 4,
                stddevMs: 2,
                p50Ms: 3,
                p95Ms: 8,
                p99Ms: 12
            },
            database: {
                totalQueries: 90,
                avgQueryMs: 12,
                currentMinuteQueries: 7,
                slowQueriesLast15m: 2,
                activeConnectionCount: 3,
                waitingConnectionCount: 1,
                maxWaitingConnectionCount: 4,
                avgConnectionWaitMs: 6,
                p95ConnectionWaitMs: 11,
                maxConnectionWaitMs: 13,
                longHeldConnectionCount: 1,
                poolAllConnections: 8,
                poolFreeConnections: 5,
                poolQueuedRequests: 1
            },
            sockets: {
                socketEventsEmitted: 19,
                activeSocketConnections: 6,
                activeEngineClients: 6,
                pollingConnections: 6,
                websocketConnections: 0,
                registeredUserSockets: 5,
                pendingDisconnectUsers: 1
            }
        });
        expect(JSON.stringify(snapshot)).not.toContain('secret_patient_data');
        expect(JSON.stringify(snapshot)).not.toContain('must-not-be-persisted');
    });

    test('writes an immediate snapshot and continues appending snapshots to disk', async () => {
        const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'dibya-performance-'));
        const filePath = path.join(directory, 'performance-snapshots.log');
        const recorder = createPersistentPerformanceRecorder({
            ...providers(),
            filePath,
            intervalMs: 15
        });

        try {
            recorder.start();
            const deadline = Date.now() + 1000;
            let lines = [];
            while (Date.now() < deadline) {
                await new Promise(resolve => setTimeout(resolve, 15));
                const contents = await fs.promises.readFile(filePath, 'utf8').catch(() => '');
                lines = contents.trim().split('\n').filter(Boolean);
                if (lines.length >= 2) break;
            }
            await recorder.stop();

            expect(lines.length).toBeGreaterThanOrEqual(2);
            for (const line of lines) {
                expect(JSON.parse(line)).toMatchObject({
                    schemaVersion: 1,
                    process: { pid: 4321 },
                    sockets: { pollingConnections: 6 }
                });
            }
        } finally {
            await recorder.stop();
            await fs.promises.rm(directory, { recursive: true, force: true });
        }
    });
});

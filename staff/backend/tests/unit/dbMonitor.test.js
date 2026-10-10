jest.mock('../../utils/logger', () => ({
    warn: jest.fn(),
    error: jest.fn()
}));

const logger = require('../../utils/logger');
const {
    wrapDbPool,
    getDbStats,
    __resetDbMonitorForTests
} = require('../../middleware/dbMonitor');

describe('dbMonitor connection checkout tracking', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        jest.clearAllMocks();
        __resetDbMonitorForTests();
    });

    afterEach(() => {
        jest.useRealTimers();
        __resetDbMonitorForTests();
    });

    test('tracks active getConnection checkouts until release', async () => {
        const release = jest.fn();
        const connection = { threadId: 42, release };
        const pool = {
            query: jest.fn().mockResolvedValue([[]]),
            getConnection: jest.fn().mockResolvedValue(connection)
        };

        wrapDbPool(pool, { checkoutWarningMs: 1000 });
        const checkedOut = await pool.getConnection();

        expect(getDbStats().activeConnectionCount).toBe(1);

        checkedOut.release();

        expect(release).toHaveBeenCalled();
        expect(getDbStats().activeConnectionCount).toBe(0);
    });

    test('logs long-held connection checkout evidence', async () => {
        const connection = { threadId: 77, release: jest.fn() };
        const pool = {
            query: jest.fn().mockResolvedValue([[]]),
            getConnection: jest.fn().mockResolvedValue(connection)
        };

        wrapDbPool(pool, { checkoutWarningMs: 1000 });
        await pool.getConnection();
        jest.advanceTimersByTime(1001);

        expect(logger.warn).toHaveBeenCalledWith(
            'Long-held DB connection checkout',
            expect.objectContaining({
                threadId: 77,
                activeConnectionCount: 1
            })
        );
        expect(getDbStats().longHeldConnectionCount).toBe(1);
    });

    test('reports slow-query health over a rolling 15-minute window', async () => {
        const pool = {
            query: jest.fn().mockImplementation(async () => {
                jest.advanceTimersByTime(250);
                return [[]];
            })
        };

        wrapDbPool(pool);
        await pool.query('SELECT SLEEP(0.25)');

        expect(getDbStats()).toMatchObject({
            slowQueryCount: 1,
            slowQueriesLast15m: 1
        });

        jest.advanceTimersByTime((15 * 60 * 1000) + 1);
        expect(getDbStats()).toMatchObject({
            slowQueryCount: 1,
            slowQueriesLast15m: 0
        });
    });

    test('tracks connection acquisition wait and live pool queue pressure', async () => {
        let resolveConnection;
        const connection = { threadId: 88, release: jest.fn() };
        const pool = {
            pool: {
                _allConnections: { length: 9 },
                _freeConnections: { length: 2 },
                _connectionQueue: { length: 5 }
            },
            query: jest.fn().mockResolvedValue([[]]),
            getConnection: jest.fn(() => new Promise(resolve => {
                resolveConnection = resolve;
            }))
        };

        wrapDbPool(pool, { checkoutWarningMs: 1000 });
        const pending = pool.getConnection();
        jest.advanceTimersByTime(37);

        expect(getDbStats()).toMatchObject({
            waitingConnectionCount: 1,
            maxWaitingConnectionCount: 1,
            poolAllConnections: 9,
            poolFreeConnections: 2,
            poolQueuedRequests: 5
        });

        resolveConnection(connection);
        const checkedOut = await pending;

        expect(getDbStats()).toMatchObject({
            waitingConnectionCount: 0,
            avgConnectionWaitMs: 37,
            p95ConnectionWaitMs: 37,
            maxConnectionWaitMs: 37
        });
        checkedOut.release();
    });

    test('keeps lifetime average accurate after the percentile sample buffer rolls over', async () => {
        let resolveConnection;
        const pool = {
            query: jest.fn().mockResolvedValue([[]]),
            getConnection: jest.fn(() => new Promise(resolve => {
                resolveConnection = resolve;
            }))
        };
        wrapDbPool(pool, { checkoutWarningMs: 20000 });

        for (let index = 0; index < 101; index++) {
            const pending = pool.getConnection();
            if (index === 0) jest.advanceTimersByTime(10000);
            resolveConnection({ threadId: index + 1, release: jest.fn() });
            const connection = await pending;
            connection.release();
        }

        expect(getDbStats()).toMatchObject({
            avgConnectionWaitMs: 99,
            p95ConnectionWaitMs: 0,
            maxConnectionWaitMs: 10000
        });
    });
});

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
});

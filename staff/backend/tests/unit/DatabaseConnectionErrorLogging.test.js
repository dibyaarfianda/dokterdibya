describe('database connection error logging', () => {
    beforeEach(() => {
        jest.resetModules();
        jest.clearAllMocks();
    });

    test('records safe diagnostic fields for pool connection errors', async () => {
        const poolHandlers = {};
        const connectionHandlers = {};
        const mockLogger = {
            info: jest.fn(),
            error: jest.fn()
        };
        const mockConnection = {
            on: jest.fn((event, handler) => {
                connectionHandlers[event] = handler;
            }),
            release: jest.fn(),
            destroy: jest.fn()
        };
        const mockPool = {
            on: jest.fn((event, handler) => {
                poolHandlers[event] = handler;
            }),
            getConnection: jest.fn().mockResolvedValue(mockConnection)
        };

        jest.doMock('mysql2/promise', () => ({
            createPool: jest.fn(() => mockPool)
        }));
        jest.doMock('../../utils/logger', () => mockLogger);
        jest.doMock('../../middleware/dbMonitor', () => ({
            wrapDbPool: jest.fn()
        }));

        require('../../db');
        await Promise.resolve();

        poolHandlers.connection(mockConnection);
        connectionHandlers.error({
            code: 'ECONNRESET',
            errno: 104,
            sqlState: 'HY000',
            fatal: true,
            message: 'socket reset'
        });

        expect(mockLogger.error).toHaveBeenCalledWith('Database connection error', {
            code: 'ECONNRESET',
            errno: 104,
            sqlState: 'HY000',
            fatal: true
        });
        expect(mockConnection.destroy).toHaveBeenCalledTimes(1);
    });
});

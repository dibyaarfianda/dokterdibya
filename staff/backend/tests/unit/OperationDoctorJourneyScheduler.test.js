jest.mock('node-cron', () => ({ schedule: jest.fn() }));
jest.mock('../../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const mockProcessPending = jest.fn(async () => ({ scanned: 2, completed: 2, failed: 0 }));
jest.mock('../../services/OperationDoctorJourneyService', () => jest.fn().mockImplementation(() => ({ processPending: mockProcessPending })));

const cron = require('node-cron');
const scheduler = require('../../services/OperationDoctorJourneyScheduler');

describe('OperationDoctorJourneyScheduler', () => {
    test('runs daily at 04:30 WIB with a 50-row, concurrency-2 batch', async () => {
        scheduler.initScheduler();
        expect(scheduler.CRON_EXPRESSION).toBe('30 4 * * *');
        expect(scheduler.TIMEZONE).toBe('Asia/Jakarta');
        expect(cron.schedule).toHaveBeenCalledWith(
            '30 4 * * *',
            expect.any(Function),
            { timezone: 'Asia/Jakarta' }
        );

        await scheduler.runOnce();
        expect(mockProcessPending).toHaveBeenCalledWith({ limit: 50, concurrency: 2 });
    });
});

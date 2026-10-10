jest.mock('node-cron', () => ({ schedule: jest.fn() }));
jest.mock('../../db', () => ({ query: jest.fn().mockResolvedValue([[]]) }));
jest.mock('../../utils/logger', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
}));
jest.mock('../../services/SundayClinicSchemaValidator', () => ({
    validateSundayClinicSchema: jest.fn().mockResolvedValue(undefined)
}));

const cron = require('node-cron');
const { initSchedulers } = require('../../services/appointmentScheduler');

test('attendance confirmation jobs run every practice day in Asia/Jakarta', () => {
    initSchedulers();

    const registeredSchedules = cron.schedule.mock.calls.map(([expression, _callback, options]) => ({
        expression,
        timezone: options?.timezone
    }));

    expect(registeredSchedules).toEqual(expect.arrayContaining([
        { expression: '0 18 * * *', timezone: 'Asia/Jakarta' },
        { expression: '0 7 * * *', timezone: 'Asia/Jakarta' },
        { expression: '0 9 * * *', timezone: 'Asia/Jakarta' }
    ]));
});

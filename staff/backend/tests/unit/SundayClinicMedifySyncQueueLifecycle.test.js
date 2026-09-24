'use strict';

jest.mock('../../db', () => ({ query: jest.fn(), getConnection: jest.fn() }));
jest.mock('../../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../../services/SundayClinicSchemaValidator', () => ({
    validateSundayClinicSchema: jest.fn().mockResolvedValue(undefined)
}));

describe('Sunday clinic Medify sync worker lifecycle', () => {
    let queue;

    beforeEach(() => {
        jest.resetModules();
        jest.useFakeTimers();
        queue = require('../../services/sundayClinicMedifySyncQueue');
    });

    afterEach(() => {
        queue.stopWorker?.();
        jest.clearAllTimers();
        jest.useRealTimers();
    });

    test('importing the queue does not start background work', () => {
        expect(jest.getTimerCount()).toBe(0);
    });

    test('starting twice creates one worker and stopping clears its timers', () => {
        queue.startWorker();
        queue.startWorker();
        expect(jest.getTimerCount()).toBe(2);

        queue.stopWorker();
        expect(jest.getTimerCount()).toBe(0);

        queue.startWorker();
        expect(jest.getTimerCount()).toBe(2);
    });

    test('enqueueing a job does not implicitly start the worker', async () => {
        const result = await queue.enqueueDiagnosis({ visitLocation: 'klinik_private' });

        expect(result).toEqual({ queued: false, reason: 'unsupported_location' });
        expect(jest.getTimerCount()).toBe(0);
    });
});

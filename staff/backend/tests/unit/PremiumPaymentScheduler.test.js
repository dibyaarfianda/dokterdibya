'use strict';

jest.mock('node-cron', () => ({ schedule: jest.fn() }));
jest.mock('../../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));

const cron = require('node-cron');
const scheduler = require('../../services/PremiumPaymentScheduler');

describe('premium payment reconciliation scheduler', () => {
    test('registers one job every 30 minutes in Jakarta time', () => {
        scheduler.initScheduler();
        scheduler.initScheduler();
        expect(cron.schedule).toHaveBeenCalledTimes(1);
        expect(cron.schedule.mock.calls[0][0]).toBe('*/30 * * * *');
        expect(cron.schedule.mock.calls[0][2]).toEqual({ timezone: 'Asia/Jakarta' });
    });

    test('runs the reconciliation and returns its summary', async () => {
        const service = { reconcilePendingOrders: jest.fn().mockResolvedValue({ checked: 2, activated: 1, expired: 0, errors: 0 }) };
        await expect(scheduler.runOnce({ service })).resolves.toEqual({ checked: 2, activated: 1, expired: 0, errors: 0 });
    });

    test('never runs two reconciliations at the same time', async () => {
        let release;
        const service = { reconcilePendingOrders: jest.fn(() => new Promise(resolve => { release = resolve; })) };
        const first = scheduler.runOnce({ service });
        const second = await scheduler.runOnce({ service });
        expect(second).toEqual({ skipped: true });
        expect(service.reconcilePendingOrders).toHaveBeenCalledTimes(1);
        release({ checked: 0, activated: 0, expired: 0, errors: 0 });
        await first;
    });

    test('allows the next run after a failed one', async () => {
        const failing = { reconcilePendingOrders: jest.fn().mockRejectedValue(new Error('db down')) };
        await expect(scheduler.runOnce({ service: failing })).rejects.toThrow('db down');
        const ok = { reconcilePendingOrders: jest.fn().mockResolvedValue({ checked: 0, activated: 0, expired: 0, errors: 0 }) };
        await expect(scheduler.runOnce({ service: ok })).resolves.toMatchObject({ checked: 0 });
    });
});

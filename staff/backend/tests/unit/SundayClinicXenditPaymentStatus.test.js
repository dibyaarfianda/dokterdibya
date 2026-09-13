'use strict';

describe('Xendit v3 status mapping for billing cancellation', () => {
    const originalSecret = process.env.XENDIT_SECRET_KEY;
    afterEach(() => {
        if (originalSecret === undefined) delete process.env.XENDIT_SECRET_KEY;
        else process.env.XENDIT_SECRET_KEY = originalSecret;
        jest.resetModules();
        jest.dontMock('axios');
    });

    test.each([
        ['EXPIRED', 'expired', null],
        ['VOIDED', 'expired', null],
        ['SUCCEEDED', 'paid', '2026-09-13T09:00:00Z']
    ])('%s has normalized status %s and a paid timestamp only on success', async (providerStatus, expectedStatus, expectedPaidAt) => {
        process.env.XENDIT_SECRET_KEY = 'synthetic-test-secret';
        const get = jest.fn(async () => ({ data: {
            status: providerStatus, amount: 50000, updated: '2026-09-13T09:00:00Z'
        } }));
        jest.doMock('axios', () => ({ create: () => ({ get }) }));
        const payment = require('../../utils/xendit-payment');
        const result = await payment.getPaymentStatus('pr_synthetic', 'qris');
        expect(result.status).toBe(expectedStatus);
        expect(result.paid_at).toBe(expectedPaidAt);
        expect(get).toHaveBeenCalledWith('/payment_requests/pr_synthetic');
    });
});

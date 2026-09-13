'use strict';
jest.mock('axios', () => ({ create: jest.fn() }));
jest.mock('../../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
const axios = require('axios');

test.each([false, true])('QRIS keeps the precommitted callback reference (v3=%s)', async v3 => {
    jest.resetModules();
    process.env.XENDIT_SECRET_KEY = 'synthetic-test-only';
    process.env.XENDIT_USE_V3_PAYMENT_REQUESTS = String(v3);
    const client = { post: jest.fn().mockResolvedValue({ data: { id: 'pr_test', status: 'PENDING', amount: 100 } }) };
    require('axios').create.mockReturnValue(client);
    const result = await require('../../utils/xendit-payment').createQRISPayment({ amount: 100, mrId: 'TEST', referenceId: 'DD-durable-test' });
    expect(client.post.mock.calls[0][1]).toMatchObject({ reference_id: 'DD-durable-test' });
    expect(result.reference_id).toBe('DD-durable-test');
});

test('VA keeps the precommitted external ID for callback matching', async () => {
    jest.resetModules();
    process.env.XENDIT_SECRET_KEY = 'synthetic-test-only';
    const client = { post: jest.fn().mockResolvedValue({ data: { id: 'va_test', status: 'ACTIVE' } }) };
    require('axios').create.mockReturnValue(client);
    await require('../../utils/xendit-payment').createVAPayment({ amount: 100, mrId: 'TEST', bankCode: 'BNI', customerName: 'Test', referenceId: 'DD-durable-test' });
    expect(client.post.mock.calls[0][1]).toMatchObject({ external_id: 'DD-durable-test' });
});

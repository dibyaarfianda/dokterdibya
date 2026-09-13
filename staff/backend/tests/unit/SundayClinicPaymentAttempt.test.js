'use strict';

jest.mock('../../db', () => ({ getConnection: jest.fn() }));
const db = require('../../db');
const { reservePaymentAttempt } = require('../../routes/billing-payment');

describe('payment attempt reservation', () => {
    let connection;
    let billing;
    beforeEach(() => {
        billing = { id: 44, mr_id: 'DRD0044', patient_id: 'TEST44', status: 'confirmed', total: '250000' };
        connection = {
            beginTransaction: jest.fn(), commit: jest.fn(), rollback: jest.fn(), release: jest.fn(),
            query: jest.fn(async sql => {
                if (sql.includes('FROM sunday_clinic_billings')) return [[billing]];
                if (sql.includes('FROM tagihan_payments')) return [[]];
                if (sql.includes('INSERT INTO tagihan_payments')) return [{ insertId: 88 }];
                return [{ affectedRows: 1 }];
            })
        };
        db.getConnection.mockResolvedValue(connection);
    });
    test('durably records a pending attempt before a provider can be contacted', async () => {
        expect(typeof reservePaymentAttempt).toBe('function');
        const result = await reservePaymentAttempt({ billingId: 44, patientId: 'TEST44', method: 'qris', actor: 'Test' });
        expect(result).toMatchObject({ insertId: 88 });
        expect(connection.commit).toHaveBeenCalledTimes(1);
        expect(connection.query.mock.calls[0][0]).toContain('FOR UPDATE');
        expect(connection.query.mock.calls.find(([sql]) => sql.includes('INSERT INTO tagihan_payments'))[1])
            .toEqual([44, 'DRD0044', 'TEST44', 'qris', 250000, 'Test', expect.stringMatching(/^DD-/)]);
        expect(result.referenceId).toEqual(expect.stringMatching(/^DD-/));
    });
    test('cannot reserve against an invoice cancelled after its initial read', async () => {
        expect(typeof reservePaymentAttempt).toBe('function');
        billing.status = 'cancelled';
        await expect(reservePaymentAttempt({ billingId: 44, method: 'qris' })).rejects.toMatchObject({ statusCode: 409 });
        expect(connection.query.mock.calls.some(([sql]) => sql.includes('INSERT INTO'))).toBe(false);
        expect(connection.rollback).toHaveBeenCalledTimes(1);
    });
    test('keeps ownership checks inside the reservation transaction', async () => {
        expect(typeof reservePaymentAttempt).toBe('function');
        await expect(reservePaymentAttempt({ billingId: 44, patientId: 'ANOTHER', method: 'qris' })).rejects.toMatchObject({ statusCode: 404 });
        expect(connection.commit).not.toHaveBeenCalled();
    });
});

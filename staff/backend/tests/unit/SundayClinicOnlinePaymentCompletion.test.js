'use strict';

jest.mock('../../db', () => ({
    query: jest.fn(),
    getConnection: jest.fn()
}));
jest.mock('../../utils/logger', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
}));
jest.mock('../../utils/response', () => ({
    sendSuccess: jest.fn(),
    sendError: jest.fn()
}));
jest.mock('../../middleware/auth', () => ({
    verifyToken: (req, res, next) => next()
}));
jest.mock('../../utils/xendit-payment', () => ({}));
jest.mock('../../realtime-sync', () => ({ broadcast: jest.fn() }));
jest.mock('../../services/InventoryService', () => ({ deductStockFIFO: jest.fn() }));
jest.mock('../../services/SundayClinicClosingService', () => ({
    assertSundayClinicAccountingDateOpen: jest.fn()
}), { virtual: true });

const db = require('../../db');
const realtimeSync = require('../../realtime-sync');
const { handlePaymentSuccess } = require('../../routes/billing-payment');

function normalizedSql(sql) {
    return String(sql).replace(/\s+/g, ' ').trim();
}

describe('Sunday Clinic online payment completion', () => {
    let connection;

    beforeEach(() => {
        jest.clearAllMocks();
        connection = {
            beginTransaction: jest.fn().mockResolvedValue(),
            commit: jest.fn().mockResolvedValue(),
            rollback: jest.fn().mockResolvedValue(),
            release: jest.fn(),
            query: jest.fn(async sql => {
                const query = normalizedSql(sql);
                if (query.startsWith('UPDATE tagihan_payments')) return [{ affectedRows: 0 }];
                if (query.startsWith('SELECT id, status FROM sunday_clinic_billings')) {
                    return [[{ id: 44, status: 'confirmed' }]];
                }
                if (query.startsWith('SELECT bi.item_code')) return [[]];
                return [{ affectedRows: 1 }];
            })
        };
        db.getConnection.mockResolvedValue(connection);
    });

    test('completes a captured payment even when its payment row was already marked paid', async () => {
        const paidAt = '2026-07-19T06:10:00.000Z';

        await handlePaymentSuccess({
            id: 91,
            billing_id: 44,
            mr_id: 'DRD0044',
            payment_method: 'credit_card',
            amount: 250000
        }, { paid_at: paidAt });

        const billingUpdate = connection.query.mock.calls.find(([sql]) => {
            const query = normalizedSql(sql);
            return query.startsWith('UPDATE sunday_clinic_billings') && query.includes("status = 'paid'");
        });

        expect(billingUpdate).toBeDefined();
        expect(billingUpdate[1]).toEqual([
            new Date(paidAt),
            'Xendit',
            'Xendit',
            44
        ]);
        expect(connection.commit).toHaveBeenCalledTimes(1);
        expect(connection.rollback).not.toHaveBeenCalled();
        expect(realtimeSync.broadcast).toHaveBeenCalledWith(expect.objectContaining({
            type: 'payment_received',
            mrId: 'DRD0044',
            paymentId: 91
        }));
    });

    test('repairs missing billing metadata safely when the billing is already paid', async () => {
        connection.query.mockImplementation(async sql => {
            const query = normalizedSql(sql);
            if (query.startsWith('UPDATE tagihan_payments')) return [{ affectedRows: 1 }];
            if (query.startsWith('SELECT id, status FROM sunday_clinic_billings')) {
                return [[{ id: 44, status: 'paid' }]];
            }
            return [{ affectedRows: 1 }];
        });

        await handlePaymentSuccess({
            id: 92,
            billing_id: 44,
            mr_id: 'DRD0044',
            payment_method: 'qris',
            amount: 250000
        }, {
            paid_at: '2026-07-19T06:15:00.000Z',
            confirmed_by: 'Dokter Dibya'
        });

        const metadataRepair = connection.query.mock.calls.find(([sql]) => {
            const query = normalizedSql(sql);
            return query.startsWith('UPDATE sunday_clinic_billings') && query.includes('COALESCE(paid_at');
        });

        expect(metadataRepair).toBeDefined();
        expect(metadataRepair[1][1]).toBe('Dokter Dibya');
        expect(connection.commit).toHaveBeenCalledTimes(1);
        expect(realtimeSync.broadcast).not.toHaveBeenCalled();
    });
});

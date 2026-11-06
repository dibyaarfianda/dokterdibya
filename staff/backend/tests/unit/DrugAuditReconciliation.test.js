const { createFakeConnection, createFakePool } = require('../helpers/fakeConnection');

let mockConnection;

jest.mock('../../db', () => ({
    getConnection: (...args) => require('../helpers/fakeConnection').createFakePool(mockConnection).getConnection(...args),
    query: (...args) => mockConnection.query(...args)
}));

const {
    classifyReconciliationRow,
    getReconciliation
} = require('../../services/DrugAuditReconciliationService');

function row(id, stock, batchTotal) {
    return { id, code: 'OBT' + id, name: 'Obat ' + id, unit: 'tablet', is_active: 1, stock, batch_total: batchTotal };
}

function setup(rows) {
    const fake = createFakeConnection([
        [/START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY/, [[]]],
        [/LEFT JOIN obat_batches/, [rows]]
    ]);
    mockConnection = fake.connection;
    return fake;
}

describe('DrugAuditReconciliation', () => {
    test('classification prefers movement mismatch', () => {
        expect(classifyReconciliationRow({ stock: 10, batchTotal: 10, expectedStock: null })).toBe('match');
        expect(classifyReconciliationRow({ stock: 10, batchTotal: 8, expectedStock: null })).toBe('batch_mismatch');
        expect(classifyReconciliationRow({ stock: 10, batchTotal: 10, expectedStock: 9 })).toBe('movement_mismatch');
        expect(classifyReconciliationRow({ stock: 10, batchTotal: 8, expectedStock: 9 })).toBe('movement_mismatch');
    });

    test('reads inside one consistent snapshot', async () => {
        const { connection, calls } = setup([row(1, 5, '5')]);
        await getReconciliation();
        expect(calls[0].sql).toMatch(/START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY/);
        expect(calls[1].sql).toMatch(/LEFT JOIN obat_batches/);
        expect(connection.beginTransaction).not.toHaveBeenCalled();
        expect(connection.commit).toHaveBeenCalledTimes(1);
        expect(connection.release).toHaveBeenCalledTimes(1);
    });

    test('obat without batch rows reconcile against zero', async () => {
        setup([row(1, 0, null), row(2, 3, null)]);
        const result = await getReconciliation();
        expect(result.baseline).toBeNull();
        expect(result.rows[0]).toMatchObject({ obat_id: 1, batch_total: 0, expected_stock: null, status: 'match' });
        expect(result.rows[1]).toMatchObject({ obat_id: 2, batch_total: 0, status: 'batch_mismatch' });
    });

    test('onlyMismatch filters rows but not the summary', async () => {
        setup([row(1, 5, '5'), row(2, 4, '4'), row(3, 9, '7')]);
        const result = await getReconciliation({ onlyMismatch: true });
        expect(result.rows).toHaveLength(1);
        expect(result.rows[0].obat_id).toBe(3);
        expect(result.summary).toEqual({ total: 3, match: 2, batch_mismatch: 1, movement_mismatch: 0 });
    });

    test('rolls back and releases on error', async () => {
        const fake = createFakeConnection([
            [/START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY/, [[]]]
        ]);
        mockConnection = fake.connection;
        await expect(getReconciliation()).rejects.toThrow('Unexpected SQL');
        expect(fake.connection.rollback).toHaveBeenCalledTimes(1);
        expect(fake.connection.release).toHaveBeenCalledTimes(1);
    });
});

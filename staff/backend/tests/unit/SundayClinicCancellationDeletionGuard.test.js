'use strict';

const mockConnection = {
    beginTransaction: jest.fn(), commit: jest.fn(), rollback: jest.fn(), release: jest.fn(),
    query: jest.fn()
};
const mockDb = { getConnection: jest.fn(async () => mockConnection), query: jest.fn() };
jest.mock('../../services/sunday-clinic/shared', () => ({
    db: mockDb, logger: { info: jest.fn(), error: jest.fn() }
}));
jest.mock('../../services/sunday-clinic/queue', () => ({ updateQueueStatus: jest.fn() }));
jest.mock('../../db', () => mockDb);

const { deleteRecordsByMrId } = require('../../services/sunday-clinic/records');
const { deletePatientWithRelationsOnConnection, deletePatientByEmail } = require('../../services/patientDeletion');
let mainStatus = 'cancelled';
let additionalStatus = null;

function response() {
    return { statusCode: 200, status(code) { this.statusCode = code; return this; }, json: jest.fn() };
}

beforeEach(() => {
    jest.clearAllMocks();
    mainStatus = 'cancelled';
    additionalStatus = null;
    mockDb.query.mockResolvedValue([[{ mr_id: 'DRD0007', patient_id: 'P7', status: 'draft' }]]);
    mockConnection.query.mockImplementation(async sql => {
        if (sql.includes('FROM sunday_clinic_billings') && sql.includes('FOR UPDATE')) {
            return [[{ id: 7, status: mainStatus }]];
        }
        if (sql.includes('FROM sunday_clinic_additional_billings') && sql.includes('FOR UPDATE')) {
            return [additionalStatus ? [{ id: 8, status: additionalStatus }] : []];
        }
        if (sql.includes('FROM patients p')) return [[{ id: 'P7', full_name: 'Patient' }]];
        if (sql.includes('information_schema.COLUMNS')) return [[]];
        return [{ affectedRows: 1 }];
    });
});

test('draft MR with cancelled billing cannot be deleted even with force', async () => {
    const res = response();
    const next = jest.fn();
    await deleteRecordsByMrId({ params: { mrId: 'DRD0007' }, query: { force: 'true' }, user: { id: 1, name: 'Dokter' } }, res, next);
    expect(res.statusCode).toBe(409);
    expect(mockConnection.rollback).toHaveBeenCalledTimes(1);
    expect(mockConnection.commit).not.toHaveBeenCalled();
    expect(mockConnection.query.mock.calls.some(([sql]) => sql.startsWith('DELETE FROM'))).toBe(false);
});

test('patient relation deletion stops before any destructive statement when invoice is cancelled', async () => {
    await expect(deletePatientWithRelationsOnConnection(mockConnection, 'P7'))
        .rejects.toMatchObject({ statusCode: 409 });
    expect(mockConnection.query.mock.calls.some(([sql]) => sql.startsWith('DELETE FROM'))).toBe(false);
});

test('cancelled additional invoice also blocks MR deletion when parent was paid', async () => {
    mainStatus = 'paid';
    additionalStatus = 'cancelled';
    const res = response();
    await deleteRecordsByMrId({ params: { mrId: 'DRD0007' }, query: { force: 'true' }, user: { id: 1, name: 'Dokter' } }, res, jest.fn());
    expect(res.statusCode).toBe(409);
    expect(mockConnection.query.mock.calls.some(([sql]) => sql.startsWith('DELETE FROM'))).toBe(false);
});

test('email cleanup rejects cancelled financial evidence before deleting user', async () => {
    await expect(deletePatientByEmail('patient@example.test')).rejects.toMatchObject({ statusCode: 409 });
    expect(mockConnection.rollback).toHaveBeenCalledTimes(1);
    expect(mockConnection.query.mock.calls.some(([sql]) => sql.startsWith('DELETE FROM'))).toBe(false);
});

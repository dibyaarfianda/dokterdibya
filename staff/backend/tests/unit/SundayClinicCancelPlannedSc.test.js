jest.mock('../../db', () => ({ query: jest.fn(), getConnection: jest.fn() }));

const db = require('../../db');
const surgery = require('../../services/SurgeryService');
const { createRuntimeAccessResolver } = require('../../security/accountModeAccess');

const schedule = { id: 91, surgery_date: '2027-01-05', surgery_time: '16:00:00',
    location: 'rsia_melinda', status: 'planned', op_code: 'SC', op_name_id: 'Operasi Caesar' };
const reason = 'Pasien memilih persalinan di fasilitas lain';
function connection(rows = [schedule], visits = [{ patient_id: 'P1' }]) {
    const c = { query: jest.fn(), beginTransaction: jest.fn(), commit: jest.fn(), rollback: jest.fn(), release: jest.fn() };
    c.query.mockResolvedValueOnce([visits]).mockResolvedValueOnce([rows])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([{ insertId: 77 }])
        .mockResolvedValueOnce([[{ id: 91, status: 'cancelled', cancellation_reason: reason }]]);
    db.getConnection.mockResolvedValue(c);
    return c;
}

beforeEach(() => jest.resetAllMocks());

test('cancels only the linked SC schedule, records its reason and actor, and verifies the saved status atomically', async () => {
    const c = connection();
    const result = await surgery.cancelPlannedScByMrId('DRD200', '91', reason, 'staff-1', '2026-10-18');
    expect(result).toMatchObject({ id: 91, status: 'cancelled', already_cancelled: false });
    expect(c.beginTransaction).toHaveBeenCalledTimes(1);
    expect(c.query.mock.calls[0][1]).toEqual(['DRD200']);
    expect(c.query.mock.calls[0][0]).toContain('FOR UPDATE');
    const [lookupSql, lookupValues] = c.query.mock.calls[1];
    expect(lookupSql).toContain('s.id = ?');
    expect(lookupSql).toContain('conflict.patient_id <> ?');
    expect(lookupSql).toContain('linked.patient_id = ?');
    expect(lookupSql).toContain('FOR UPDATE');
    expect(lookupValues).toEqual(['2026-10-18', 'P1', 'P1', 'P1', 91]);
    expect(c.query.mock.calls[2][1]).toEqual([reason, 91]);
    expect(c.query.mock.calls[2][0]).toMatch(/status IN \('planned', 'confirmed'\)/);
    const audit = c.query.mock.calls[3];
    expect(audit[0]).toContain('INSERT INTO surgery_audit_log');
    expect(audit[1].slice(0, 3)).toEqual([91, 'status_changed', 'staff-1']);
    expect(JSON.parse(audit[1][3])).toMatchObject({ status: 'cancelled', previous_status: 'planned', reason, source: 'planning', mr_id: 'DRD200' });
    expect(c.commit).toHaveBeenCalledTimes(1);
    expect(c.rollback).not.toHaveBeenCalled();
    expect(c.release).toHaveBeenCalledTimes(1);
    expect(c.query.mock.calls.some(([sql]) => /DELETE FROM|UPDATE medical_records/i.test(sql))).toBe(false);
});

test('a retry of the same cancelled schedule does not write or duplicate its audit', async () => {
    const c = connection([{ ...schedule, status: 'cancelled' }]);
    await expect(surgery.cancelPlannedScByMrId('DRD200', '91', reason, 'staff-1', '2026-10-18'))
        .resolves.toMatchObject({ status: 'cancelled', already_cancelled: true });
    expect(c.query).toHaveBeenCalledTimes(2);
    expect(c.commit).toHaveBeenCalledTimes(1);
});

test.each([
    ['unknown DRD', [], [], 404],
    ['ambiguous patient', [], [{ patient_id: 'P1' }, { patient_id: 'P2' }], 409],
    ['other patient or unlinked schedule', [], [{ patient_id: 'P1' }], 409],
    ['completed surgery', [{ ...schedule, status: 'completed' }], [{ patient_id: 'P1' }], 409],
    ['non-SC operation', [{ ...schedule, op_code: 'HSC', op_name_id: 'Histeroskopi' }], [{ patient_id: 'P1' }], 409],
    ['past surgery', [{ ...schedule, surgery_date: '2026-10-17' }], [{ patient_id: 'P1' }], 409]
])('rejects %s without writing', async (_label, rows, visits, statusCode) => {
    const c = connection(rows, visits);
    await expect(surgery.cancelPlannedScByMrId('DRD200', '91', reason, 'staff-1', '2026-10-18')).rejects.toMatchObject({ statusCode });
    expect(c.query.mock.calls.some(([sql]) => /^(?:UPDATE|INSERT|DELETE)/.test(sql.trim()))).toBe(false);
    expect(c.rollback).toHaveBeenCalledTimes(1);
    expect(c.commit).not.toHaveBeenCalled();
    expect(c.release).toHaveBeenCalledTimes(1);
});

test.each(['', '0', '-1', '91bad', '9007199254740993'])('rejects invalid schedule id %s before acquiring a connection', async id => {
    await expect(surgery.cancelPlannedScByMrId('DRD200', id, reason, 'staff-1')).rejects.toMatchObject({ statusCode: 400 });
    expect(db.getConnection).not.toHaveBeenCalled();
});

test.each(['', '   ', 'x'.repeat(1001)])('requires a bounded cancellation reason', async invalidReason => {
    await expect(surgery.cancelPlannedScByMrId('DRD200', 91, invalidReason, 'staff-1')).rejects.toMatchObject({ statusCode: 400 });
    expect(db.getConnection).not.toHaveBeenCalled();
});

test('audit failure rolls back cancellation rather than reporting a partial success', async () => {
    const c = connection();
    c.query.mockReset().mockResolvedValueOnce([[{ patient_id: 'P1' }]])
        .mockResolvedValueOnce([[schedule]]).mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockRejectedValueOnce(new Error('Audit unavailable'));
    await expect(surgery.cancelPlannedScByMrId('DRD200', 91, reason, 'staff-1', '2026-10-18')).rejects.toThrow('Audit unavailable');
    expect(c.rollback).toHaveBeenCalledTimes(1);
    expect(c.commit).not.toHaveBeenCalled();
    expect(c.release).toHaveBeenCalledTimes(1);
});

test('a failed saved-field readback rolls the whole transaction back', async () => {
    const c = connection();
    c.query.mockReset().mockResolvedValueOnce([[{ patient_id: 'P1' }]])
        .mockResolvedValueOnce([[schedule]]).mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([{ insertId: 77 }]).mockResolvedValueOnce([[{ id: 91, status: 'planned' }]]);
    await expect(surgery.cancelPlannedScByMrId('DRD200', 91, reason, 'staff-1', '2026-10-18')).rejects.toThrow();
    expect(c.rollback).toHaveBeenCalledTimes(1);
    expect(c.commit).not.toHaveBeenCalled();
});

test('the Planning cancellation endpoint is governed by DocBoard scheduling permission', () => {
    expect(createRuntimeAccessResolver()('POST', '/api/sunday-clinic/records/DRD200/planned-sc/91/cancel'))
        .toMatchObject({ permission: 'docboard.write' });
});

test('DocBoard day schedules exclude cancelled operations, consistent with its calendar and upcoming list', async () => {
    db.query.mockResolvedValue([[]]);
    expect(await surgery.getDaySurgeries('2027-01-05')).toEqual([]);
    expect(db.query.mock.calls[0][0]).toMatch(/s.status\s*(?:<>|!=)\s*'cancelled'/);
});

test('a cached DocBoard status action cannot reactivate a cancelled schedule', async () => {
    db.query.mockResolvedValueOnce([{ affectedRows: 0 }]);
    await expect(surgery.updateStatus(91, 'confirmed', null, 'staff-1')).rejects.toMatchObject({ statusCode: 409 });
    expect(db.query).toHaveBeenCalledTimes(1);
    expect(db.query.mock.calls[0][0]).toContain("status <> 'cancelled'");
});

test('an old full edit payload cannot reactivate a cancelled schedule either', async () => {
    db.query.mockResolvedValueOnce([{ affectedRows: 0 }]);
    await expect(surgery.updateSurgery(91, { status: 'planned' }, 'staff-1')).rejects.toMatchObject({ statusCode: 409 });
    expect(db.query).toHaveBeenCalledTimes(1);
    expect(db.query.mock.calls[0][0]).toContain("status <> 'cancelled'");
});

test('production returns a clear validation error instead of an uncertain generic server failure', async () => {
    const { errorHandler } = require('../../middleware/errorHandler');
    const error = await surgery.cancelPlannedScByMrId('DRD200', 91, '', 'staff-1').catch(err => err);
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
    errorHandler(error, { path: '/fixture', method: 'POST', user: { id: 'staff-1' } }, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('Alasan pembatalan') }));
});

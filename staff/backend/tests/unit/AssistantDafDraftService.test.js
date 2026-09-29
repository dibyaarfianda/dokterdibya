const crypto = require('crypto');
const AssistantDafDraftService = require('../../services/AssistantDafDraftService');

describe('Asisten DAF proposal persistence', () => {
  test('stores shared text only as authenticated ciphertext', async () => {
    const calls = [];
    const connection = { beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release: () => {}, query: async (...args) => { calls.push(args); return [{ affectedRows: 1 }]; } };
    const db = { getConnection: async () => connection };
    const service = new AssistantDafDraftService({ db, key: crypto.randomBytes(32) });
    const result = await service.createManualDraft('owner-1', 'SC 03/10/2026 jam 07.30 di Melinda');
    expect(result.status).toBe('pending');
    expect(result.proposal.schedule_date).toBe('2026-10-03');
    expect(JSON.stringify(calls)).not.toContain('SC 03/10/2026');
  });

  test('rejects source input above the size cap', async () => {
    const service = new AssistantDafDraftService({ db: { query: jest.fn() }, key: crypto.randomBytes(32) });
    await expect(service.createManualDraft('owner-1', 'x'.repeat(10001))).rejects.toThrow('PESAN_TERLALU_PANJANG');
  });

  test('confirms a procedure with the database patient name and one transaction', async () => {
    const queries = [];
    const connection = {
      beginTransaction: jest.fn(), commit: jest.fn(), rollback: jest.fn(), release: jest.fn(),
      query: jest.fn(async (sql, params) => {
        queries.push({ sql, params });
        if (sql.includes('FROM assistant_daf_drafts')) return [[{ id: 'draft-1' }]];
        if (sql.includes('FROM patient_external_ids')) return [[{ id: 'P1', full_name: 'Nama Terverifikasi' }]];
        if (sql.includes('SELECT id FROM docboard_space_schedules')) return [[]];
        if (sql.includes('FROM surgery_schedules')) return [[]];
        if (sql.includes('INSERT INTO docboard_space_schedules')) return [{ insertId: 41 }];
        if (sql.includes('SELECT * FROM docboard_space_schedules')) return [[{ id: 41, user_id: 'owner-1', space: 'tindakan', agenda: 'SC', category: 'SC', schedule_date: '2026-10-03', start_time: '07:30', location: 'Melinda', status: 'scheduled' }]];
        return [{ affectedRows: 1 }];
      })
    };
    const service = new AssistantDafDraftService({ db: { getConnection: async () => connection }, key: crypto.randomBytes(32) });
    const result = await service.confirmDraft('owner-1', 'draft-1', {
      action: 'create', space: 'tindakan', agenda: 'SC', category: 'SC',
      schedule_date: '2026-10-03', start_time: '07:30', location: 'Melinda',
      patient_ref_type: 'hospital_mr', patient_ref_value: 'RM-1', patient_facility: 'rsia_melinda', patient_name: 'Nama Palsu'
    });
    expect(result.schedule_id).toBe('41');
    const insert = queries.find(({ sql }) => sql.includes('INSERT INTO docboard_space_schedules'));
    expect(insert.params).toContain('Nama Terverifikasi');
    expect(insert.params).not.toContain('Nama Palsu');
    expect(connection.commit).toHaveBeenCalledTimes(1);
    expect(connection.rollback).not.toHaveBeenCalled();
  });

  test('stops a duplicate procedure before writing and rolls back', async () => {
    const connection = {
      beginTransaction: jest.fn(), commit: jest.fn(), rollback: jest.fn(), release: jest.fn(),
      query: jest.fn(async (sql) => {
        if (sql.includes('FROM assistant_daf_drafts')) return [[{ id: 'draft-2' }]];
        if (sql.includes('FROM patient_external_ids')) return [[{ id: 'P1', full_name: 'Sri' }]];
        if (sql.includes('SELECT id FROM docboard_space_schedules')) return [[{ id: 41 }]];
        throw new Error('unexpected write');
      })
    };
    const service = new AssistantDafDraftService({ db: { getConnection: async () => connection }, key: crypto.randomBytes(32) });
    await expect(service.confirmDraft('owner-1', 'draft-2', {
      action: 'create', space: 'tindakan', agenda: 'SC', category: 'SC',
      schedule_date: '2026-10-03', start_time: '07:30', location: 'Melinda',
      patient_ref_type: 'hospital_mr', patient_ref_value: 'RM-1', patient_facility: 'rsia_melinda'
    })).rejects.toMatchObject({ message: 'JADWAL_DUPLIKAT_PERLU_DITINJAU', statusCode: 409 });
    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.commit).not.toHaveBeenCalled();
  });
});

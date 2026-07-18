jest.mock('../../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const MorbidCaseService = require('../../services/MorbidCaseService');

function candidate(overrides = {}) {
  return {
    id: 8445,
    facility: 'gambiran',
    source_key: 'gambiran:pendaftaran:19517',
    case_id: 'med0000711382',
    simrs_operasi_id: '19517',
    mr_id: '539745',
    patient_name: 'NIKA NURSANTI',
    diagnosis: 'O14.1 - Severe pre-eclampsia',
    doctor_key: 'latifa',
    operation_date: '2026-07-12',
    r2_key: 'operation-data/nika.json',
    r2_bucket: 'test-bucket',
    ...overrides,
  };
}

function catalog(overrides = {}) {
  return {
    id: 9,
    operation_data_id: 8445,
    facility: 'gambiran',
    case_id: 'med0000711382',
    mr_id: '539745',
    patient_name: 'NIKA NURSANTI',
    status: 'ready',
    snapshot_r2_key: 'morbid-cases/gambiran/med0000711382/snapshot-v1.json',
    snapshot_r2_bucket: 'test-bucket',
    ...overrides,
  };
}

describe('MorbidCaseService', () => {
  test('creates a snapshot and preserves partial section warnings', async () => {
    const db = { query: jest.fn(async (sql) => {
      if (sql.includes('FROM operation_data_index') && sql.includes('WHERE id = ?')) return [[candidate()]];
      if (sql.includes('SELECT id FROM docboard_morbid_cases')) return [[]];
      if (sql.includes('INSERT INTO docboard_morbid_cases')) return [{ insertId: 9 }];
      if (sql.includes('SELECT mc.*')) return [[catalog({ status: 'ready_with_warnings', cppt_count: 2 })]];
      return [{ affectedRows: 1 }];
    }) };
    const r2 = {
      R2_BUCKET_NAME: 'test-bucket',
      uploadJson: jest.fn(async () => ({ success: true })),
      getJson: jest.fn(async (key) => key.includes('operation-data') ? { report: { narasiOperasi: 'Lengkap' } } : {
        penunjang: { files: [] },
      }),
    };
    const fetchImpl = jest.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ success: true, snapshot: {
        counts: { cppt: 2, penunjang_results: 1, penunjang_files: 1, operations: 1, prescriptions: 3 },
        operations: [{ operation_id: '19517', report: {} }],
        warnings: ['resume unavailable'],
        penunjang: { files: [{ id: 10 }] },
      } }),
    }));
    const service = new MorbidCaseService({ db, r2, fetchImpl, apiKey: 'key', commBaseUrl: 'http://comm.test', bucket: 'test-bucket' });

    const result = await service.create(8445, 'UDZAQUCQWZ');

    expect(fetchImpl).toHaveBeenCalledWith(
      'http://comm.test/api/internal/morbid-case/med0000711382?operationId=19517',
      expect.objectContaining({ headers: expect.objectContaining({ 'X-API-Key': 'key' }) })
    );
    expect(r2.uploadJson).toHaveBeenCalledWith(
      'morbid-cases/gambiran/med0000711382/snapshot-v1.json',
      expect.objectContaining({ counts: expect.objectContaining({ cppt: 2 }) }),
      'test-bucket'
    );
    const update = db.query.mock.calls.find(([sql]) => sql.includes('penunjang_result_count'));
    expect(update[1]).toEqual(expect.arrayContaining(['ready_with_warnings', 2, 1, 1, 1, 3, 9]));
    expect(result.morbid_case.status).toBe('ready_with_warnings');
  });

  test('returns an existing case instead of creating a duplicate', async () => {
    const db = { query: jest.fn()
      .mockResolvedValueOnce([[candidate()]])
      .mockResolvedValueOnce([[{ id: 9 }]])
      .mockResolvedValueOnce([[catalog()]]) };
    const r2 = { R2_BUCKET_NAME: 'test', getJson: jest.fn(async () => ({ penunjang: { files: [] } })) };
    const service = new MorbidCaseService({ db, r2, apiKey: 'key' });
    const result = await service.create(8445, 'user');
    expect(result.already_exists).toBe(true);
    expect(db.query.mock.calls.some(([sql]) => sql.includes('INSERT INTO docboard_morbid_cases'))).toBe(false);
  });

  test('file proxy rejects IDs that are not present in the saved snapshot', async () => {
    const db = { query: jest.fn(async () => [[catalog()]]) };
    const r2 = { R2_BUCKET_NAME: 'test', getJson: jest.fn(async () => ({ penunjang: { files: [{ id: 10 }] } })) };
    const service = new MorbidCaseService({ db, r2, apiKey: 'key', fetchImpl: jest.fn() });
    await expect(service.fetchFile(9, 99)).rejects.toMatchObject({ status: 404 });
    expect(service.fetchImpl).not.toHaveBeenCalled();
  });

  test('snapshot sanitizer removes credential-like fields recursively', () => {
    expect(MorbidCaseService.cleanSnapshotForStorage({
      cppt: [{ plan: 'Rawat', token: 'secret' }],
      resume: { fields: { _token: 'secret', ringkasan: 'Pulang' } },
    })).toEqual({ cppt: [{ plan: 'Rawat' }], resume: { fields: { ringkasan: 'Pulang' } } });
  });

  test('runs on-demand AI analysis, stores it separately, and records model metadata', async () => {
    const readyCatalog = catalog({
      analysis_status: 'not_analyzed', analysis_r2_key: null, analysis_r2_bucket: null,
    });
    const db = { query: jest.fn(async (sql) => {
      if (sql.includes('SELECT mc.*')) return [[readyCatalog]];
      return [{ affectedRows: 1 }];
    }) };
    const snapshot = { cppt: [{ assessment: 'Risiko tinggi' }], penunjang: { files: [] } };
    const r2 = {
      R2_BUCKET_NAME: 'test-bucket',
      getJson: jest.fn(async () => snapshot),
      uploadJson: jest.fn(async () => ({ success: true })),
    };
    const analysis = { model: 'gpt-5.6-sol', reasoning_effort: 'high', critical_points: [{ title: 'Risiko' }] };
    const aiService = { analyze: jest.fn(async () => analysis) };
    const service = new MorbidCaseService({ db, r2, apiKey: 'key', aiService, bucket: 'test-bucket' });

    const result = await service.analyze(9, 'user-1');

    expect(aiService.analyze).toHaveBeenCalledWith(snapshot, expect.objectContaining({ id: 9 }), 'user-1');
    expect(r2.uploadJson).toHaveBeenCalledWith('morbid-cases/gambiran/med0000711382/analysis-v1.json', analysis, 'test-bucket');
    expect(db.query.mock.calls.some(([sql]) => sql.includes("analysis_status = 'analyzing'"))).toBe(true);
    const readyUpdate = db.query.mock.calls.find(([sql]) => sql.includes("analysis_status = 'ready'"));
    expect(readyUpdate[1]).toEqual(expect.arrayContaining(['gpt-5.6-sol', 'high', 9]));
    expect(result.morbid_case.id).toBe(9);
  });

  test('starts long AI work in the background and returns analyzing immediately', async () => {
    const readyCatalog = catalog({ analysis_status: 'not_analyzed', analysis_r2_key: null });
    const db = { query: jest.fn(async (sql) => sql.includes('SELECT mc.*') ? [[readyCatalog]] : [{ affectedRows: 1 }]) };
    const snapshot = { cppt: [], penunjang: { files: [] } };
    const r2 = { R2_BUCKET_NAME: 'test-bucket', getJson: jest.fn(async () => snapshot), uploadJson: jest.fn(async () => ({ success: true })) };
    let resolveAnalysis;
    const aiService = { analyze: jest.fn(() => new Promise(resolve => { resolveAnalysis = resolve; })) };
    const service = new MorbidCaseService({ db, r2, aiService, bucket: 'test-bucket' });

    const result = await service.startAnalysis(9, 'user-1');

    expect(result.analysis_started).toBe(true);
    expect(result.morbid_case.analysis_status).toBe('analyzing');
    expect(result.analysis_progress).toEqual(expect.objectContaining({
      stage: 'model_reasoning',
      label: expect.stringContaining('GPT-5.6 Sol High'),
      percent: null,
      determinate: false,
    }));
    expect(service.activeAnalyses.has('9')).toBe(true);
    const running = service.activeAnalyses.get('9');
    expect(running.startedAt).toEqual(expect.any(Number));
    expect(running.promise).toEqual(expect.any(Promise));
    resolveAnalysis({ model: 'gpt-5.6-sol', reasoning_effort: 'high' });
    await running.promise;
    expect(r2.uploadJson).toHaveBeenCalled();
    expect(service.activeAnalyses.has('9')).toBe(false);
  });

  test('marks an orphaned analyzing state as failed after a backend restart', async () => {
    const interruptedCatalog = catalog({ analysis_status: 'analyzing', analysis_r2_key: null });
    const db = { query: jest.fn(async (sql) => sql.includes('SELECT mc.*') ? [[interruptedCatalog]] : [{ affectedRows: 1 }]) };
    const snapshot = { cppt: [], penunjang: { files: [] } };
    const r2 = { R2_BUCKET_NAME: 'test-bucket', getJson: jest.fn(async () => snapshot) };
    const service = new MorbidCaseService({ db, r2, bucket: 'test-bucket' });

    const result = await service.getDetail(9);

    expect(result.morbid_case.analysis_status).toBe('failed');
    expect(result.morbid_case.analysis_last_error).toContain('backend dimulai ulang');
    expect(result.analysis_progress).toBeNull();
    expect(db.query.mock.calls.some(([sql]) => sql.includes("analysis_status = 'failed'"))).toBe(true);
  });
});

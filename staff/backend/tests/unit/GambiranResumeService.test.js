jest.mock('../../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const GambiranResumeService = require('../../services/GambiranResumeService');

function response(body, status = 200, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: name => headers[String(name).toLowerCase()] || null },
    text: async () => JSON.stringify(body),
    arrayBuffer: async () => Buffer.from(body),
  };
}

describe('GambiranResumeService', () => {
  test('requests the RM-only COMM archive endpoint and removes credentials', async () => {
    const fetchImpl = jest.fn(async () => response({ success: true, snapshot: {
      patient: { medical_record_number: '00-00-12-34-56', name: 'PASIEN UJI', token: 'secret' },
      encounters: [{ case_id: 'med-test' }],
    } }));
    const service = new GambiranResumeService({ db: {}, r2: { R2_BUCKET_NAME: 'test' }, fetchImpl, apiKey: 'key', commBaseUrl: 'http://comm.test' });

    const snapshot = await service.requestSnapshot({ digits: '123456', display: '00-00-12-34-56' });

    expect(fetchImpl).toHaveBeenCalledWith(
      'http://comm.test/api/internal/gambiran/patients/123456/archive',
      expect.objectContaining({ headers: expect.objectContaining({ 'X-API-Key': 'key' }) })
    );
    expect(snapshot.patient).toEqual({ medical_record_number: '00-00-12-34-56', name: 'PASIEN UJI' });
  });

  test('creates immutable versions and rejects a second active job for the same RM', async () => {
    const catalog = { id: 17, facility: 'gambiran', mr_digits: '123456', mr_display: '00-00-12-34-56', archive_version: 3, status: 'queued' };
    const db = { query: jest.fn(async sql => {
      if (sql.includes("status IN ('queued','collecting','rendering')")) return [[]];
      if (sql.includes('MAX(archive_version)')) return [[{ next_version: 3 }]];
      if (sql.includes('INSERT INTO docboard_gambiran_resumes')) return [{ insertId: 17 }];
      if (sql.includes('SELECT * FROM docboard_gambiran_resumes')) return [[catalog]];
      throw new Error(`Unexpected SQL: ${sql}`);
    }) };
    const service = new GambiranResumeService({ db, r2: { R2_BUCKET_NAME: 'test' }, apiKey: 'key', bucket: 'test' });
    const created = await service.create('00-00-12-34-56', 'user-1');
    expect(created.record).toEqual(expect.objectContaining({ id: 17, archive_version: 3, status: 'queued' }));
    expect(db.query.mock.calls.find(([sql]) => sql.includes('INSERT INTO'))[1]).toEqual(['123456', '00-00-12-34-56', 3, 'test', 'user-1']);

    const conflictDb = { query: jest.fn(async () => [[{ id: 18, status: 'collecting' }]]) };
    const conflictService = new GambiranResumeService({ db: conflictDb, r2: { R2_BUCKET_NAME: 'test' } });
    await expect(conflictService.create('123456', 'user-1')).rejects.toMatchObject({ status: 409, archive_id: 18 });
  });

  test('collects top-level and hidden encounter files without duplicates', () => {
    const files = GambiranResumeService.collectFiles({
      files: [{ id: 'one', case_id: 'med-1', filename: 'hasil.pdf' }],
      encounters: [{
        case_id: 'med-1',
        penunjang: { files: [{ id: 'one', filename: 'hasil.pdf' }, { id: 'two', filename: 'foto.png' }] },
        anesthesia: { files: [{ id: 'three', filename: 'anestesi.pdf' }] },
      }],
    });
    expect(files.map(file => file.id)).toEqual(['one', 'two', 'three']);
    expect(files[2]).toEqual(expect.objectContaining({ case_id: 'med-1', category: 'anestesi' }));
  });

  test('deduplicates alternate COMM representations of the same clinical file', () => {
    const files = GambiranResumeService.collectFiles({
      penunjang: { files: [{
        id: 'hash-source', case_id: 'med-1', category: 'penunjang',
        filename: 'HASIL_LAB_PK-D-Dimer__03-08-2026', occurred_at: '2026-08-03 15:14:44',
        download_path: '/api/internal/gambiran/patients/123/files/hash-source?caseId=med-1',
      }] },
      encounters: [{
        case_id: 'med-1',
        penunjang: { files: [{
          id: 'numeric-source', category: 'labpk',
          filename: 'HASIL_LAB_PK-D-Dimer__03-08-2026', occurred_at: '2026-08-03 15:14:44',
        }] },
      }],
    });

    expect(files).toHaveLength(1);
    expect(files[0]).toEqual(expect.objectContaining({ id: 'hash-source', case_id: 'med-1' }));
  });

  test('falls back to a checksum-verified prior archive when COMM fetch fails', async () => {
    const service = new GambiranResumeService({ db: {}, r2: { R2_BUCKET_NAME: 'private' }, bucket: 'private' });
    const fetchError = new Error('fetch failed');
    const prior = {
      downloaded: { buffer: Buffer.from('prior-pdf'), mimeType: 'application/pdf', filename: 'hasil.pdf' },
      provenance: { resume_id: 12, archive_version: 4, file_id: 55, sha256: 'abc' },
    };
    service.archiveFile = jest.fn().mockRejectedValue(fetchError);
    service.loadPreviousFile = jest.fn().mockResolvedValue(prior);
    service.archiveDownloadedFile = jest.fn().mockResolvedValue({ id: 99, filename: 'hasil.pdf' });

    const result = await service.archiveFileWithFallback(
      17, 'gambiran-resumes/123456/17', { digits: '123456' },
      { id: 'source-1', case_id: 'med-1', category: 'penunjang', filename: 'hasil.pdf' }, 0
    );

    expect(service.loadPreviousFile).toHaveBeenCalledWith(17, { digits: '123456' }, expect.objectContaining({ id: 'source-1' }));
    expect(service.archiveDownloadedFile).toHaveBeenCalledWith(
      17, 'gambiran-resumes/123456/17', expect.any(Object), 0, prior.downloaded
    );
    expect(result).toEqual(expect.objectContaining({
      id: 99,
      reused_from: prior.provenance,
      recovered_error: 'fetch failed',
    }));
  });

  test('loads only an exact prior source and verifies its stored checksum', async () => {
    const buffer = Buffer.from('verified-prior-pdf');
    const sha256 = require('crypto').createHash('sha256').update(buffer).digest('hex');
    const db = { query: jest.fn(async () => [[{
      id: 55, resume_id: 12, archive_version: 4, r2_bucket: 'private',
      filename: 'hasil.pdf', mime_type: 'application/pdf', sha256,
      original_r2_key: 'gambiran-resumes/123456/12/originals/hasil.pdf',
    }]]) };
    const r2 = { R2_BUCKET_NAME: 'private', getFileBuffer: jest.fn(async () => buffer) };
    const service = new GambiranResumeService({ db, r2, bucket: 'private' });

    const result = await service.loadPreviousFile(17, { digits: '123456' }, {
      id: 'source-1', case_id: 'med-1', category: 'penunjang',
      filename: 'hasil.pdf', occurred_at: '2026-08-03 15:14:44',
    });

    expect(db.query.mock.calls[0][1]).toEqual([
      '123456', 17, 'source-1', 'med-1', 'penunjang', '2026-08-03 15:14:44',
    ]);
    expect(r2.getFileBuffer).toHaveBeenCalledWith('gambiran-resumes/123456/12/originals/hasil.pdf', 'private');
    expect(result).toEqual(expect.objectContaining({
      downloaded: expect.objectContaining({ buffer, mimeType: 'application/pdf', filename: 'hasil.pdf' }),
      provenance: expect.objectContaining({ resume_id: 12, archive_version: 4, file_id: 55, sha256 }),
    }));
  });

  test('rejects a prior archive object when its checksum no longer matches', async () => {
    const db = { query: jest.fn(async () => [[{
      id: 55, resume_id: 12, archive_version: 4, r2_bucket: 'private',
      filename: 'hasil.pdf', mime_type: 'application/pdf', sha256: '0'.repeat(64),
      original_r2_key: 'gambiran-resumes/123456/12/originals/hasil.pdf',
    }]]) };
    const r2 = { R2_BUCKET_NAME: 'private', getFileBuffer: jest.fn(async () => Buffer.from('changed')) };
    const service = new GambiranResumeService({ db, r2, bucket: 'private' });

    await expect(service.loadPreviousFile(17, { digits: '123456' }, {
      id: 'source-1', case_id: 'med-1', category: 'penunjang', occurred_at: '2026-08-03 15:14:44',
    })).resolves.toBeNull();
  });

  test('runs the asynchronous archive lifecycle and writes all four immutable artifacts', async () => {
    const catalog = {
      id: 17, facility: 'gambiran', mr_digits: '123456', mr_display: '00-00-12-34-56', archive_version: 1,
      status: 'queued', r2_bucket: 'private', warnings_json: '[]',
    };
    const db = { query: jest.fn(async (sql, values = []) => {
      if (sql.startsWith('SELECT * FROM docboard_gambiran_resumes')) return [[{ ...catalog }]];
      if (sql.includes("SET status = 'collecting'")) { catalog.status = 'collecting'; catalog.started_at = new Date(); return [{ affectedRows: 1 }]; }
      if (sql.includes("SET status = 'rendering'")) { catalog.status = 'rendering'; return [{ affectedRows: 1 }]; }
      if (sql.includes('SET patient_name = ?')) {
        Object.assign(catalog, {
          patient_name: values[0], status: values[1], first_visit_at: values[2], last_visit_at: values[3],
          case_count: values[4], event_count: values[5], file_count: values[6], jpg_count: values[7],
          warnings_json: values[8], snapshot_r2_key: values[9], manifest_r2_key: values[10],
          resume_txt_r2_key: values[11], resume_docx_r2_key: values[12], completed_at: new Date(),
        });
        return [{ affectedRows: 1 }];
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    }) };
    const objects = new Map();
    const r2 = {
      R2_BUCKET_NAME: 'private',
      uploadBuffer: jest.fn(async (key, buffer) => { objects.set(key, Buffer.from(buffer)); return { key }; }),
      getJson: jest.fn(async key => JSON.parse(objects.get(key).toString('utf8'))),
    };
    const fetchImpl = jest.fn(async () => response({ success: true, snapshot: {
      patient: { medical_record_number: '123456', name: 'PASIEN SINTETIS' },
      encounters: [{ case_id: 'med-test-1', admission_at: '2026-08-01 08:00:00' }],
      timeline: [{ id: 'event-1', case_id: 'med-test-1', category: 'admission', occurred_at: '2026-08-01 08:00:00', title: 'Masuk' }],
      warnings: [],
    } }));
    const service = new GambiranResumeService({ db, r2, fetchImpl, apiKey: 'key', commBaseUrl: 'http://comm.test', bucket: 'private' });

    const result = await service.process(17, { digits: '123456', display: '00-00-12-34-56' });

    expect(result.resume.status).toBe('ready');
    expect(result.resume.case_count).toBe(1);
    expect(result.resume.event_count).toBe(1);
    expect([...objects.keys()].sort()).toEqual([
      'gambiran-resumes/123456/17/manifest.json',
      'gambiran-resumes/123456/17/resume.docx',
      'gambiran-resumes/123456/17/resume.txt',
      'gambiran-resumes/123456/17/snapshot.json',
    ]);
    expect(objects.get('gambiran-resumes/123456/17/resume.txt').toString('utf8')).toContain('PASIEN SINTETIS');
  });

  test('returns scoped 15-minute signed URLs and never trusts another archive file id', async () => {
    const db = { query: jest.fn(async sql => {
      if (sql.includes('docboard_gambiran_resumes')) return [[{ id: 17, r2_bucket: 'private', status: 'ready', warnings_json: '[]' }]];
      if (sql.includes('docboard_gambiran_resume_files')) return [[{
        id: 22, resume_id: 17, filename: 'hasil.pdf', mime_type: 'application/pdf', original_r2_key: 'gambiran-resumes/x/original.pdf', jpg_keys_json: '["gambiran-resumes/x/page.jpg"]',
      }]];
      return [[]];
    }) };
    const r2 = { R2_BUCKET_NAME: 'test', getSignedDownloadUrl: jest.fn(async () => 'https://signed.example/file') };
    const service = new GambiranResumeService({ db, r2, bucket: 'private' });
    const result = await service.getFileDownload(17, 22, 'jpg', 1);
    expect(result).toEqual(expect.objectContaining({ download_url: 'https://signed.example/file', expires_in: 900 }));
    expect(r2.getSignedDownloadUrl).toHaveBeenCalledWith('gambiran-resumes/x/page.jpg', 900, 'private', expect.objectContaining({ contentType: 'image/jpeg' }));
  });
});

const dbPool = require('../db');
const r2Storage = require('./r2Storage');
const MorbidCaseAIService = require('./MorbidCaseAIService');

const TARGET_DOCTORS = ['dibya', 'tri_aji', 'latifa'];

function trim(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function normalizeDate(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  }
  const match = trim(value).match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : trim(value);
}

function mapCatalogRow(row) {
  if (!row) return null;
  return {
    ...row,
    operation_date: normalizeDate(row.operation_date),
    operation_time: row.operation_time ? String(row.operation_time).slice(0, 8) : null,
    cppt_count: Number(row.cppt_count || 0),
    penunjang_result_count: Number(row.penunjang_result_count || 0),
    penunjang_file_count: Number(row.penunjang_file_count || 0),
    operation_count: Number(row.operation_count || 0),
    prescription_count: Number(row.prescription_count || 0),
  };
}

function defaultCommBaseUrl() {
  return (process.env.COMM_SERVICE_BASE_URL || process.env.COMM_BASE_URL || 'http://127.0.0.1:3002').replace(/\/+$/, '');
}

function cleanSnapshotForStorage(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return snapshot;
  const clone = JSON.parse(JSON.stringify(snapshot));
  const stripKeys = (value) => {
    if (Array.isArray(value)) return value.map(stripKeys);
    if (!value || typeof value !== 'object') return value;
    const output = {};
    for (const [key, child] of Object.entries(value)) {
      if (/^(?:_token|csrf(?:_token)?|token|password|cookie|authorization)$/i.test(key)) continue;
      output[key] = stripKeys(child);
    }
    return output;
  };
  return stripKeys(clone);
}

class MorbidCaseService {
  constructor({
    db = dbPool,
    r2 = r2Storage,
    fetchImpl = global.fetch,
    commBaseUrl = defaultCommBaseUrl(),
    apiKey = process.env.COMM_INTERNAL_API_KEY || process.env.COMM_API_KEY || '',
    bucket = process.env.MORBID_CASE_R2_BUCKET_NAME || process.env.OPERATION_DATA_R2_BUCKET_NAME || r2Storage.R2_BUCKET_NAME,
    aiService = new MorbidCaseAIService(),
  } = {}) {
    this.db = db;
    this.r2 = r2;
    this.fetchImpl = fetchImpl;
    this.commBaseUrl = commBaseUrl.replace(/\/+$/, '');
    this.apiKey = apiKey;
    this.bucket = bucket;
    this.aiService = aiService;
  }

  async list(params = {}) {
    const search = trim(params.search);
    const page = Math.max(1, parseInt(params.page, 10) || 1);
    const limit = Math.min(Math.max(parseInt(params.limit, 10) || 30, 1), 100);
    const offset = (page - 1) * limit;
    const where = [];
    const values = [];
    if (search) {
      where.push(`(LOWER(mc.patient_name) LIKE ? OR mc.mr_id LIKE ? OR LOWER(mc.case_id) LIKE ? OR LOWER(COALESCE(mc.diagnosis, '')) LIKE ?)`);
      const pattern = `%${search.toLowerCase()}%`;
      values.push(pattern, `%${search}%`, pattern, pattern);
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const [[countRow]] = await this.db.query(`SELECT COUNT(*) AS total FROM docboard_morbid_cases mc ${clause}`, values);
    const [rows] = await this.db.query(
      `SELECT mc.*, odi.operation_date, odi.operation_time, odi.operation_name, odi.doctor_name
         FROM docboard_morbid_cases mc
         LEFT JOIN operation_data_index odi ON odi.id = mc.operation_data_id
         ${clause}
        ORDER BY COALESCE(mc.collected_at, mc.created_at) DESC, mc.id DESC
        LIMIT ? OFFSET ?`,
      [...values, limit, offset]
    );
    return {
      rows: rows.map(mapCatalogRow),
      pagination: { page, limit, total: Number(countRow.total || 0), has_more: offset + rows.length < Number(countRow.total || 0) },
    };
  }

  async listCandidates(params = {}) {
    const search = trim(params.search);
    const limit = Math.min(Math.max(parseInt(params.limit, 10) || 20, 1), 50);
    const values = [...TARGET_DOCTORS];
    let searchClause = '';
    if (search) {
      const pattern = `%${search.toLowerCase()}%`;
      searchClause = `AND (LOWER(odi.patient_name) LIKE ? OR odi.mr_id LIKE ? OR LOWER(odi.case_id) LIKE ? OR LOWER(COALESCE(odi.diagnosis, '')) LIKE ?)`;
      values.push(pattern, `%${search}%`, pattern, pattern);
    }
    values.push(limit);
    const [rows] = await this.db.query(
      `SELECT odi.id, odi.case_id, odi.simrs_operasi_id, odi.mr_id, odi.patient_name, odi.patient_age,
              odi.operation_date, odi.operation_time, odi.operation_name, odi.diagnosis,
              odi.doctor_name, odi.doctor_key, mc.id AS morbid_case_id
         FROM operation_data_index odi
         LEFT JOIN docboard_morbid_cases mc ON mc.facility = odi.facility AND mc.case_id = odi.case_id
        WHERE odi.facility = 'gambiran'
          AND odi.doctor_key IN (?, ?, ?)
          AND odi.case_id IS NOT NULL
          AND odi.source_key = CONCAT('gambiran:pendaftaran:', odi.simrs_operasi_id)
          ${searchClause}
        ORDER BY odi.operation_date DESC, odi.operation_time DESC, odi.id DESC
        LIMIT ?`,
      values
    );
    return rows.map(mapCatalogRow);
  }

  async getCandidate(operationDataId) {
    const [rows] = await this.db.query(
      `SELECT * FROM operation_data_index
        WHERE id = ?
          AND facility = 'gambiran'
          AND doctor_key IN ('dibya','tri_aji','latifa')
          AND case_id IS NOT NULL
          AND source_key = CONCAT('gambiran:pendaftaran:', simrs_operasi_id)
        LIMIT 1`,
      [operationDataId]
    );
    return rows[0] || null;
  }

  async getCatalog(id) {
    const [rows] = await this.db.query(
      `SELECT mc.*, odi.operation_date, odi.operation_time, odi.operation_name, odi.doctor_name,
              odi.simrs_operasi_id, odi.r2_key AS operation_r2_key, odi.r2_bucket AS operation_r2_bucket
         FROM docboard_morbid_cases mc
         LEFT JOIN operation_data_index odi ON odi.id = mc.operation_data_id
        WHERE mc.id = ? LIMIT 1`,
      [id]
    );
    return mapCatalogRow(rows[0]);
  }

  async findByCase(facility, caseId) {
    const [rows] = await this.db.query(
      `SELECT id FROM docboard_morbid_cases WHERE facility = ? AND case_id = ? LIMIT 1`,
      [facility, caseId]
    );
    return rows[0] || null;
  }

  async requestSnapshot(record) {
    if (!this.apiKey) throw new Error('COMM internal API key belum dikonfigurasi');
    if (typeof this.fetchImpl !== 'function') throw new Error('Fetch API tidak tersedia');
    const params = new URLSearchParams();
    if (record.simrs_operasi_id) params.set('operationId', record.simrs_operasi_id);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 180000);
    try {
      const response = await this.fetchImpl(
        `${this.commBaseUrl}/api/internal/morbid-case/${encodeURIComponent(record.case_id)}?${params.toString()}`,
        { headers: { Accept: 'application/json', 'X-API-Key': this.apiKey }, signal: controller.signal }
      );
      const text = await response.text();
      let body = {};
      try { body = text ? JSON.parse(text) : {}; } catch { body = {}; }
      if (!response.ok || !body.success || !body.snapshot) {
        const error = new Error(body.error || body.message || `COMM Morbid Case gagal (${response.status})`);
        error.status = response.status;
        throw error;
      }
      return cleanSnapshotForStorage(body.snapshot);
    } finally {
      clearTimeout(timeout);
    }
  }

  async operationArchive(record) {
    if (!record.r2_key) return null;
    try {
      return await this.r2.getJson(record.r2_key, record.r2_bucket || process.env.OPERATION_DATA_R2_BUCKET_NAME);
    } catch {
      return null;
    }
  }

  async collect(catalogId, record) {
    try {
      const [snapshot, operationArchive] = await Promise.all([
        this.requestSnapshot(record),
        this.operationArchive(record),
      ]);
      snapshot.selected_operation = {
        id: record.id,
        source_key: record.source_key,
        simrs_operasi_id: record.simrs_operasi_id,
        operation_date: normalizeDate(record.operation_date),
        operation_time: record.operation_time ? String(record.operation_time).slice(0, 8) : null,
        operation_name: record.operation_name,
        diagnosis: record.diagnosis,
        doctor_name: record.doctor_name,
        doctor_key: record.doctor_key,
      };
      snapshot.operation_archive = operationArchive;
      if ((!snapshot.operations || snapshot.operations.length === 0) && operationArchive?.report) {
        snapshot.operations = [{ operation_id: record.simrs_operasi_id, report: operationArchive.report, source: 'operation_archive' }];
        snapshot.counts.operations = 1;
        snapshot.section_status.operations = 'ok';
      }
      const snapshotKey = `morbid-cases/gambiran/${record.case_id}/snapshot-v1.json`;
      await this.r2.uploadJson(snapshotKey, snapshot, this.bucket);
      const counts = snapshot.counts || {};
      const status = (snapshot.warnings || []).length ? 'ready_with_warnings' : 'ready';
      await this.db.query(
        `UPDATE docboard_morbid_cases
            SET status = ?, snapshot_r2_key = ?, snapshot_r2_bucket = ?, snapshot_version = 1,
                cppt_count = ?, penunjang_result_count = ?, penunjang_file_count = ?,
                operation_count = ?, prescription_count = ?, collected_at = NOW(), last_error = NULL,
                analysis_status = CASE
                  WHEN analysis_status IN ('ready', 'analyzing') THEN 'stale'
                  ELSE analysis_status
                END
          WHERE id = ?`,
        [status, snapshotKey, this.bucket, counts.cppt || 0, counts.penunjang_results || 0,
          counts.penunjang_files || 0, counts.operations || 0, counts.prescriptions || 0, catalogId]
      );
      return this.getDetail(catalogId);
    } catch (error) {
      await this.db.query(
        `UPDATE docboard_morbid_cases SET status = 'error', last_error = ? WHERE id = ?`,
        [trim(error.message).slice(0, 2000), catalogId]
      );
      throw error;
    }
  }

  async create(operationDataId, createdBy) {
    const record = await this.getCandidate(operationDataId);
    if (!record) {
      const error = new Error('Kandidat Morbid Case Gambiran tidak ditemukan');
      error.status = 404;
      throw error;
    }
    const existing = await this.findByCase(record.facility, record.case_id);
    if (existing) return { ...(await this.getDetail(existing.id)), already_exists: true };
    const snapshotKey = `morbid-cases/gambiran/${record.case_id}/snapshot-v1.json`;
    const [result] = await this.db.query(
      `INSERT INTO docboard_morbid_cases
         (operation_data_id, facility, case_id, mr_id, patient_name, diagnosis, status,
          snapshot_version, snapshot_r2_key, snapshot_r2_bucket, created_by)
       VALUES (?, ?, ?, ?, ?, ?, 'collecting', 1, ?, ?, ?)`,
      [record.id, record.facility, record.case_id, record.mr_id, record.patient_name,
        record.diagnosis, snapshotKey, this.bucket, createdBy || null]
    );
    return this.collect(result.insertId, record);
  }

  async refresh(id) {
    const catalog = await this.getCatalog(id);
    if (!catalog) {
      const error = new Error('Morbid Case tidak ditemukan');
      error.status = 404;
      throw error;
    }
    const record = await this.getCandidate(catalog.operation_data_id);
    if (!record) {
      const error = new Error('Sumber operasi Morbid Case tidak ditemukan');
      error.status = 404;
      throw error;
    }
    await this.db.query(`UPDATE docboard_morbid_cases SET status = 'collecting', last_error = NULL WHERE id = ?`, [id]);
    return this.collect(id, record);
  }

  async analyze(id, requestedBy) {
    const detail = await this.getDetail(id);
    const catalog = detail.morbid_case;
    if (!detail.snapshot || !['ready', 'ready_with_warnings'].includes(catalog.status)) {
      const error = new Error('Snapshot Morbid Case belum siap untuk dianalisis');
      error.status = 409;
      throw error;
    }

    const analysisKey = `morbid-cases/${catalog.facility}/${catalog.case_id}/analysis-v1.json`;
    await this.db.query(
      `UPDATE docboard_morbid_cases
          SET analysis_status = 'analyzing', analysis_last_error = NULL
        WHERE id = ?`,
      [id]
    );

    try {
      const analysis = await this.aiService.analyze(detail.snapshot, catalog, requestedBy);
      await this.r2.uploadJson(analysisKey, analysis, catalog.snapshot_r2_bucket || this.bucket);
      await this.db.query(
        `UPDATE docboard_morbid_cases
            SET analysis_status = 'ready', analysis_r2_key = ?, analysis_r2_bucket = ?,
                analysis_version = 1, analysis_model = ?, analysis_reasoning_effort = ?,
                analyzed_at = NOW(), analysis_last_error = NULL
          WHERE id = ?`,
        [analysisKey, catalog.snapshot_r2_bucket || this.bucket, analysis.model,
          analysis.reasoning_effort, id]
      );
      return this.getDetail(id);
    } catch (error) {
      await this.db.query(
        `UPDATE docboard_morbid_cases
            SET analysis_status = 'failed', analysis_last_error = ?
          WHERE id = ?`,
        [trim(error.message).slice(0, 2000), id]
      );
      throw error;
    }
  }

  async getDetail(id) {
    const catalog = await this.getCatalog(id);
    if (!catalog) {
      const error = new Error('Morbid Case tidak ditemukan');
      error.status = 404;
      throw error;
    }
    let snapshot = null;
    if (catalog.status !== 'collecting') {
      try {
        snapshot = await this.r2.getJson(catalog.snapshot_r2_key, catalog.snapshot_r2_bucket || this.bucket);
      } catch (error) {
        if (catalog.status !== 'error') {
          const missing = new Error(`Snapshot Morbid Case tidak dapat dibaca: ${error.message}`);
          missing.status = 503;
          throw missing;
        }
      }
    }
    let analysis = null;
    let analysisLoadError = null;
    if (catalog.analysis_r2_key) {
      try {
        analysis = await this.r2.getJson(catalog.analysis_r2_key, catalog.analysis_r2_bucket || this.bucket);
      } catch (error) {
        analysisLoadError = `Analisis AI tidak dapat dibaca: ${error.message}`;
      }
    }
    if (snapshot?.penunjang?.files) {
      snapshot.penunjang.files = snapshot.penunjang.files.map(file => ({
        ...file,
        url: file.id ? `/api/docboard/morbid-cases/${catalog.id}/files/${encodeURIComponent(file.id)}` : null,
      }));
    }
    return { morbid_case: catalog, snapshot, analysis, analysis_load_error: analysisLoadError };
  }

  async fetchFile(id, fileId) {
    const detail = await this.getDetail(id);
    const file = (detail.snapshot?.penunjang?.files || []).find(item => String(item.id) === String(fileId));
    if (!file) {
      const error = new Error('File tidak tercantum pada snapshot Morbid Case');
      error.status = 404;
      throw error;
    }
    const response = await this.fetchImpl(
      `${this.commBaseUrl}/api/internal/morbid-case/${encodeURIComponent(detail.morbid_case.case_id)}/files/${encodeURIComponent(fileId)}`,
      { headers: { Accept: 'application/pdf,application/octet-stream,*/*', 'X-API-Key': this.apiKey } }
    );
    if (!response.ok) {
      const error = new Error(`COMM file Morbid Case gagal (${response.status})`);
      error.status = response.status;
      throw error;
    }
    return {
      buffer: Buffer.from(await response.arrayBuffer()),
      contentType: response.headers?.get?.('content-type') || 'application/pdf',
      filename: `hasil-${detail.morbid_case.case_id}-${fileId}.pdf`,
    };
  }
}

MorbidCaseService.cleanSnapshotForStorage = cleanSnapshotForStorage;
module.exports = MorbidCaseService;

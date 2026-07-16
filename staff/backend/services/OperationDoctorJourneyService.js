const dbPool = require('../db');

function trim(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function parseJson(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function mysqlDate(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function doctorFromColumns(row, prefix) {
  const name = row[`${prefix}_doctor_name`];
  if (!name) return null;
  return {
    name,
    key: row[`${prefix}_doctor_key`] || null,
    source: row[`${prefix}_doctor_source`] || null,
  };
}

function mapCachedRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    operation_data_id: row.operation_data_id,
    facility: row.facility,
    simrs_operasi_id: row.simrs_operasi_id,
    transfer_status: row.transfer_status || 'unknown',
    confidence: row.confidence || 'unknown',
    origin_doctor: doctorFromColumns(row, 'origin'),
    last_cppt_doctor: doctorFromColumns(row, 'last_cppt'),
    procedure_doctor: doctorFromColumns(row, 'procedure'),
    final_doctor: doctorFromColumns(row, 'final'),
    transition_count: Number(row.transition_count || 0),
    timeline: parseJson(row.timeline_json, []),
    consultants: parseJson(row.consultants_json, []),
    source_hash: row.source_hash || null,
    checked_at: row.checked_at || null,
    error_message: row.error_message || null,
    analysis_status: row.error_message ? 'failed' : 'ready',
  };
}

function doctorField(doctor, key) {
  return doctor && doctor[key] ? trim(doctor[key]) : null;
}

function defaultCommBaseUrl() {
  return (process.env.COMM_SERVICE_BASE_URL || process.env.COMM_BASE_URL || 'http://127.0.0.1:3002').replace(/\/+$/, '');
}

class OperationDoctorJourneyService {
  constructor({
    db = dbPool,
    commBaseUrl = defaultCommBaseUrl(),
    apiKey = process.env.COMM_INTERNAL_API_KEY || process.env.COMM_API_KEY || '',
    fetchImpl = global.fetch,
  } = {}) {
    this.db = db;
    this.commBaseUrl = commBaseUrl.replace(/\/+$/, '');
    this.apiKey = apiKey;
    this.fetchImpl = fetchImpl;
  }

  async getAuditRecord(id) {
    const [rows] = await this.db.query(
      `SELECT id, facility, source_key, case_id, simrs_operasi_id, mr_id, patient_name,
              operation_date, operation_time, operation_name, doctor_name, doctor_key
         FROM operation_data_index
        WHERE id = ?
          AND facility = 'gambiran'
          AND doctor_key IN ('dibya','tri_aji','latifa')
          AND source_key = CONCAT('gambiran:pendaftaran:', simrs_operasi_id)
        LIMIT 1`,
      [id]
    );
    return rows[0] || null;
  }

  async getCached(facility, operationId) {
    const [rows] = await this.db.query(
      `SELECT * FROM operation_doctor_journeys
        WHERE facility = ? AND simrs_operasi_id = ?
        LIMIT 1`,
      [facility, operationId]
    );
    return mapCachedRow(rows[0]);
  }

  async getForAuditRow(id) {
    const record = await this.getAuditRecord(id);
    if (!record) {
      const error = new Error('Data operasi Gambiran tidak ditemukan');
      error.status = 404;
      throw error;
    }
    const journey = record.simrs_operasi_id
      ? await this.getCached(record.facility, record.simrs_operasi_id)
      : null;
    return {
      record,
      doctor_journey: journey,
      analysis_status: journey?.analysis_status || 'not_analyzed',
    };
  }

  async requestFromComm(operationId) {
    if (!this.apiKey) {
      const error = new Error('COMM_API_KEY tidak dikonfigurasi');
      error.status = 503;
      throw error;
    }
    if (typeof this.fetchImpl !== 'function') throw new Error('Fetch API is not available');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);
    try {
      const response = await this.fetchImpl(
        `${this.commBaseUrl}/api/internal/operation-doctor-journey/${encodeURIComponent(operationId)}`,
        {
          method: 'GET',
          headers: { Accept: 'application/json', 'X-API-Key': this.apiKey },
          signal: controller.signal,
        }
      );
      const text = await response.text();
      let body = {};
      try {
        body = text ? JSON.parse(text) : {};
      } catch {
        body = {};
      }
      if (!response.ok || !body.success || !body.doctor_journey) {
        const error = new Error(body.error || body.message || `COMM doctor journey failed (${response.status})`);
        error.status = response.status;
        throw error;
      }
      return body.doctor_journey;
    } finally {
      clearTimeout(timeout);
    }
  }

  validateJourney(record, journey) {
    if (trim(journey.facility) !== record.facility) throw new Error('Facility hasil journey tidak cocok');
    if (trim(journey.simrs_operasi_id) !== trim(record.simrs_operasi_id)) throw new Error('ID operasi hasil journey tidak cocok');
    if (trim(journey.case_id).toLowerCase() !== trim(record.case_id).toLowerCase()) {
      throw new Error('caseId hasil journey tidak cocok dengan operasi kanonis');
    }
    const responseMr = trim(journey.patient?.mr_id).replace(/^0+/, '');
    const recordMr = trim(record.mr_id).replace(/^0+/, '');
    if (responseMr && recordMr && responseMr !== recordMr) throw new Error('Nomor rekam medis hasil journey tidak cocok');
    if (!['yes', 'no', 'unknown'].includes(journey.transfer_status)) throw new Error('Status perpindahan tidak valid');
    if (!['verified', 'supported', 'unknown'].includes(journey.confidence)) throw new Error('Keyakinan journey tidak valid');
  }

  async saveSuccess(record, journey) {
    const checkedAt = mysqlDate(journey.checked_at);
    await this.db.query(
      `INSERT INTO operation_doctor_journeys
         (operation_data_id, facility, simrs_operasi_id, transfer_status, confidence,
          origin_doctor_name, origin_doctor_key, origin_doctor_source,
          last_cppt_doctor_name, last_cppt_doctor_key, last_cppt_doctor_source,
          procedure_doctor_name, procedure_doctor_key, procedure_doctor_source,
          final_doctor_name, final_doctor_key, final_doctor_source,
          transition_count, timeline_json, consultants_json, source_hash, checked_at, error_message)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
       ON DUPLICATE KEY UPDATE
          operation_data_id = VALUES(operation_data_id),
          transfer_status = VALUES(transfer_status), confidence = VALUES(confidence),
          origin_doctor_name = VALUES(origin_doctor_name), origin_doctor_key = VALUES(origin_doctor_key), origin_doctor_source = VALUES(origin_doctor_source),
          last_cppt_doctor_name = VALUES(last_cppt_doctor_name), last_cppt_doctor_key = VALUES(last_cppt_doctor_key), last_cppt_doctor_source = VALUES(last_cppt_doctor_source),
          procedure_doctor_name = VALUES(procedure_doctor_name), procedure_doctor_key = VALUES(procedure_doctor_key), procedure_doctor_source = VALUES(procedure_doctor_source),
          final_doctor_name = VALUES(final_doctor_name), final_doctor_key = VALUES(final_doctor_key), final_doctor_source = VALUES(final_doctor_source),
          transition_count = VALUES(transition_count), timeline_json = VALUES(timeline_json), consultants_json = VALUES(consultants_json),
          source_hash = VALUES(source_hash), checked_at = VALUES(checked_at), error_message = NULL`,
      [
        record.id, record.facility, record.simrs_operasi_id, journey.transfer_status, journey.confidence,
        doctorField(journey.origin_doctor, 'name'), doctorField(journey.origin_doctor, 'key'), doctorField(journey.origin_doctor, 'source'),
        doctorField(journey.last_cppt_doctor, 'name'), doctorField(journey.last_cppt_doctor, 'key'), doctorField(journey.last_cppt_doctor, 'source'),
        doctorField(journey.procedure_doctor, 'name'), doctorField(journey.procedure_doctor, 'key'), doctorField(journey.procedure_doctor, 'source'),
        doctorField(journey.final_doctor, 'name'), doctorField(journey.final_doctor, 'key'), doctorField(journey.final_doctor, 'source'),
        Math.max(0, Number(journey.transition_count) || 0),
        JSON.stringify(Array.isArray(journey.timeline) ? journey.timeline : []),
        JSON.stringify(Array.isArray(journey.consultants) ? journey.consultants : []),
        trim(journey.source_hash) || null,
        checkedAt,
      ]
    );
    return this.getCached(record.facility, record.simrs_operasi_id);
  }

  async saveFailure(record, error) {
    const message = trim(error.message || error).slice(0, 1000) || 'Analisis journey gagal';
    await this.db.query(
      `INSERT INTO operation_doctor_journeys
         (operation_data_id, facility, simrs_operasi_id, transfer_status, confidence,
          transition_count, timeline_json, consultants_json, checked_at, error_message)
       VALUES (?, ?, ?, 'unknown', 'unknown', 0, '[]', '[]', NOW(), ?)
       ON DUPLICATE KEY UPDATE
          operation_data_id = VALUES(operation_data_id), checked_at = NOW(), error_message = VALUES(error_message)`,
      [record.id, record.facility, record.simrs_operasi_id, message]
    );
  }

  async refreshRecord(record) {
    if (!record.simrs_operasi_id) throw new Error('ID pendaftaran operasi tidak tersedia');
    try {
      const journey = await this.requestFromComm(record.simrs_operasi_id);
      this.validateJourney(record, journey);
      return await this.saveSuccess(record, journey);
    } catch (error) {
      await this.saveFailure(record, error);
      throw error;
    }
  }

  async refreshForAuditRow(id) {
    const record = await this.getAuditRecord(id);
    if (!record) {
      const error = new Error('Data operasi Gambiran tidak ditemukan');
      error.status = 404;
      throw error;
    }
    const journey = await this.refreshRecord(record);
    return { record, doctor_journey: journey, analysis_status: 'ready' };
  }

  async listPending({ limit = 50, failedBefore = null } = {}) {
    const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 50);
    const params = [];
    let failureClause = 'journey.error_message IS NOT NULL';
    if (failedBefore) {
      failureClause = '(journey.error_message IS NOT NULL AND journey.checked_at < ?)';
      params.push(mysqlDate(failedBefore));
    }
    params.push(safeLimit);
    const [rows] = await this.db.query(
      `SELECT operation.id, operation.facility, operation.source_key, operation.case_id,
              operation.simrs_operasi_id, operation.mr_id, operation.patient_name,
              operation.operation_date, operation.operation_time, operation.operation_name,
              operation.doctor_name, operation.doctor_key
         FROM operation_data_index operation
         LEFT JOIN operation_doctor_journeys journey
           ON journey.facility = operation.facility
          AND journey.simrs_operasi_id = operation.simrs_operasi_id
        WHERE operation.facility = 'gambiran'
          AND operation.doctor_key IN ('dibya','tri_aji','latifa')
          AND operation.simrs_operasi_id IS NOT NULL
          AND operation.simrs_operasi_id <> ''
          AND operation.source_key = CONCAT('gambiran:pendaftaran:', operation.simrs_operasi_id)
          AND (journey.id IS NULL OR ${failureClause})
        ORDER BY operation.operation_date DESC, operation.id DESC
        LIMIT ?`,
      params
    );
    return rows;
  }

  async refreshRows(rows, concurrency = 2) {
    const results = [];
    let next = 0;
    const worker = async () => {
      while (next < rows.length) {
        const row = rows[next++];
        try {
          const journey = await this.refreshRecord(row);
          results.push({ id: row.id, operation_id: row.simrs_operasi_id, success: true, status: journey.transfer_status });
        } catch (error) {
          results.push({ id: row.id, operation_id: row.simrs_operasi_id, success: false, error: trim(error.message).slice(0, 180) });
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(Math.max(concurrency, 1), rows.length || 1) }, worker));
    return results;
  }

  async processPending({ limit = 50, concurrency = 2, failedBefore = null } = {}) {
    const rows = await this.listPending({ limit, failedBefore });
    const results = await this.refreshRows(rows, concurrency);
    return {
      scanned: rows.length,
      completed: results.filter(item => item.success).length,
      failed: results.filter(item => !item.success).length,
      results,
    };
  }

  async backfill({ batchSize = 50, concurrency = 2, onBatch = null } = {}) {
    const startedAt = new Date();
    const total = { scanned: 0, completed: 0, failed: 0, batches: 0 };
    while (true) {
      const batch = await this.processPending({ limit: batchSize, concurrency, failedBefore: startedAt });
      if (batch.scanned === 0) break;
      total.scanned += batch.scanned;
      total.completed += batch.completed;
      total.failed += batch.failed;
      total.batches += 1;
      if (typeof onBatch === 'function') onBatch({ ...total, last_batch: batch });
    }
    return total;
  }
}

OperationDoctorJourneyService.mapCachedRow = mapCachedRow;

module.exports = OperationDoctorJourneyService;

const db = require('../db');
const r2Storage = require('./r2Storage');
const { parseSearchTerms, escapeLikeTerm } = require('../utils/searchTerms');

const FACILITIES = ['melinda', 'gambiran', 'bhayangkara'];
const TARGET_DOCTORS = [
  { key: 'dibya', pattern: /dibya/i },
  { key: 'tri_aji', pattern: /tri\s*aji/i },
  { key: 'latifa', pattern: /latifa/i },
];
const TARGET_DOCTOR_FACILITY_KEYS = {
  melinda: ['dibya'],
  gambiran: ['dibya', 'tri_aji', 'latifa'],
  bhayangkara: ['dibya'],
};
const LOCATION_MAP = {
  melinda: 'rsia_melinda',
  gambiran: 'rsud_gambiran',
  bhayangkara: 'rs_bhayangkara',
  rsia_melinda: 'rsia_melinda',
  rsud_gambiran: 'rsud_gambiran',
  rs_bhayangkara: 'rs_bhayangkara',
};

function trim(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

function nullable(value) {
  const clean = trim(value);
  return clean || null;
}

function normalizeFacility(value) {
  const key = trim(value).toLowerCase();
  if (key === 'rsia_melinda') return 'melinda';
  if (key === 'rsud_gambiran') return 'gambiran';
  if (key === 'rs_bhayangkara') return 'bhayangkara';
  return FACILITIES.includes(key) ? key : key;
}

function normalizeDate(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  }
  const raw = trim(value);
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const year = parseInt(iso[1], 10);
    const fullYear = year < 100 ? 2000 + year : year;
    return `${fullYear}-${iso[2]}-${iso[3]}`;
  }
  const local = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (local) return `${local[3]}-${String(local[2]).padStart(2, '0')}-${String(local[1]).padStart(2, '0')}`;
  const localShortYear = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2})(?:\D|$)/);
  if (localShortYear) {
    const year = parseInt(localShortYear[3], 10);
    const fullYear = year >= 70 ? 1900 + year : 2000 + year;
    return `${fullYear}-${String(localShortYear[2]).padStart(2, '0')}-${String(localShortYear[1]).padStart(2, '0')}`;
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function normalizeTime(value) {
  const raw = trim(value);
  if (!raw) return null;
  const match = raw.match(/(\d{1,2}):(\d{2})(?::\d{2})?/);
  if (!match) return null;
  return `${String(match[1]).padStart(2, '0')}:${match[2]}:00`;
}

function mapRecordDates(row) {
  return {
    ...row,
    operation_date: normalizeDate(row.operation_date),
  };
}

function mysqlDateTime(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
}

function safeLimit(value, fallback = 50) {
  const parsed = parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, 100);
}

function dateToInt(dateStr) {
  return parseInt(String(dateStr).replace(/-/g, ''), 10) || 0;
}

function firstValue(...values) {
  for (const value of values) {
    const clean = nullable(value);
    if (clean) return clean;
  }
  return null;
}

function assertCanonicalGambiranOperation(item) {
  if (item.facility !== 'gambiran' || !item.simrsOperasiId) return;
  const expectedSource = `gambiran:pendaftaran:${item.simrsOperasiId}`;
  if (item.sourceKey !== expectedSource) {
    throw new Error(`Gambiran operation ${item.simrsOperasiId} must use canonical registration source`);
  }
}

function classifyDoctor(value, facility) {
  const clean = nullable(value);
  if (!clean) return null;
  const allowedKeys = new Set(TARGET_DOCTOR_FACILITY_KEYS[facility] || ['dibya']);
  const doctor = TARGET_DOCTORS.find(item => allowedKeys.has(item.key) && item.pattern.test(clean));
  if (!doctor) return null;
  return { doctorName: clean, doctorKey: doctor.key };
}

function deriveDoctorMetadata(raw = {}, payload = {}) {
  if (raw.doctor_key || raw.doctorKey) {
    return {
      doctorName: nullable(raw.doctor_name || raw.doctorName),
      doctorKey: nullable(raw.doctor_key || raw.doctorKey),
      doctorSource: nullable(raw.doctor_source || raw.doctorSource),
    };
  }

  const facility = normalizeFacility(raw.facility || payload.facility || payload.operation?.facility || payload.location);
  const sources = [
    ['operator', firstValue(
      raw.operator_name,
      raw.dokter_operator,
      raw.operator,
      payload.registration?.operator_name,
      payload.registration?.dokter_operator,
      payload.report?.operator_name,
      payload.report?.dokter_operator,
      payload.report?.operator
    )],
    ['dpjp', firstValue(
      raw.dpjp_name,
      raw.dokter_dpjp,
      raw.dpjp,
      payload.patient?.raw?.dpjp,
      payload.patient?.dpjp,
      payload.patient?.dpjp_name,
      payload.registration?.dpjp_name,
      payload.registration?.dokter_dpjp,
      payload.report?.dpjp,
      payload.report?.dpjp_name,
      payload.report?.dokter_dpjp
    )],
    ['doctor', firstValue(
      raw.doctor_name,
      raw.doctorName,
      payload.operation?.doctor_name,
      payload.operation?.doctorName,
      payload.doctor?.name,
      payload.doctor?.doctor_name
    )],
  ];

  for (const [source, value] of sources) {
    const classified = classifyDoctor(value, facility);
    if (classified) {
      return {
        ...classified,
        doctorSource: source,
      };
    }
  }

  return { doctorName: null, doctorKey: null, doctorSource: null };
}

function deriveMedicalRecordNumber(raw = {}, payload = {}) {
  return firstValue(
    raw.mr_id,
    raw.mrId,
    raw.no_rm,
    raw.noRm,
    raw.medicalRecordNo,
    payload.patient?.mr_id,
    payload.patient?.mrId,
    payload.patient?.no_rm,
    payload.patient?.medicalRecordNo,
    payload.patient?.simrs_patient_id,
    payload.patient?.raw?.mr_id,
    payload.patient?.raw?.no_rm,
    payload.patient?.raw?.medicalRecordNo,
    payload.registration?.mr_id,
    payload.registration?.mrId,
    payload.registration?.no_rm,
    payload.registration?.medicalRecordNo,
    payload.registration?.patient_id,
    payload.report?.noRm,
    payload.report?.no_rm,
    payload.report?.medicalRecordNo
  );
}

function derivePatientAge(raw = {}, payload = {}) {
  return firstValue(
    raw.patient_age,
    raw.patientAge,
    raw.usia,
    raw.age,
    payload.patient?.age,
    payload.patient?.patient_age,
    payload.patient?.patientAge,
    payload.patient?.usia,
    payload.operation?.patient_age,
    payload.operation?.patientAge,
    payload.registration?.patient_age,
    payload.registration?.patientAge,
    payload.report?.patient_age,
    payload.report?.patientAge,
    payload.report?.usia
  );
}

class OperationDataService {
  normalizeIndexItem(raw) {
    const facility = normalizeFacility(raw.facility || raw.location);
    const sourceKey = trim(raw.source_key || raw.sourceKey || raw.operation_key || raw.id);
    const patientName = trim(raw.patient_name || raw.patientName || raw.nama_pasien || raw.namaPasien);
    const operationDate = normalizeDate(raw.operation_date || raw.operationDate || raw.tanggalOperasi || raw.date);
    const r2Key = trim(raw.r2_key || raw.r2Key);

    if (!facility || !sourceKey || !patientName || !r2Key) {
      throw new Error('facility, source_key, patient_name, and r2_key are required');
    }

    return {
      facility,
      sourceKey,
      caseId: nullable(raw.case_id || raw.caseId),
      simrsOperasiId: nullable(raw.simrs_operasi_id || raw.simrsOperasiId || raw.operasiId),
      mrId: nullable(raw.mr_id || raw.mrId || raw.no_rm || raw.medicalRecordNo),
      patientName,
      patientAge: nullable(raw.patient_age || raw.patientAge || raw.usia || raw.age),
      operationDate,
      operationTime: normalizeTime(raw.operation_time || raw.operationTime || raw.waktuMulai),
      operationName: nullable(raw.operation_name || raw.operationName || raw.tindakanOperasi),
      diagnosis: nullable(raw.diagnosis || raw.diagnosaAwal || raw.diagnosaAkhir),
      status: nullable(raw.status || raw.statusPasien),
      doctorName: nullable(raw.doctor_name || raw.doctorName),
      doctorKey: nullable(raw.doctor_key || raw.doctorKey),
      doctorSource: nullable(raw.doctor_source || raw.doctorSource),
      r2Key,
      r2Bucket: nullable(raw.r2_bucket || raw.r2Bucket || raw.bucket_name || raw.bucketName || raw.bucket),
      surgeryId: raw.surgery_id || raw.surgeryId || null,
      fetchedAt: mysqlDateTime(raw.fetched_at || raw.fetchedAt),
    };
  }

  async upsertIndex(items) {
    if (!Array.isArray(items)) throw new Error('items must be an array');
    let saved = 0;
    const errors = [];

    for (const raw of items) {
      try {
        const item = this.normalizeIndexItem(raw || {});
        assertCanonicalGambiranOperation(item);
        await db.query(
          `INSERT INTO operation_data_index
             (facility, source_key, case_id, simrs_operasi_id, mr_id, patient_name,
              patient_age, operation_date, operation_time, operation_name, diagnosis, status,
              doctor_name, doctor_key, doctor_source, r2_key, r2_bucket, surgery_id, fetched_at, last_synced_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
           ON DUPLICATE KEY UPDATE
              source_key = VALUES(source_key),
              case_id = VALUES(case_id),
              simrs_operasi_id = VALUES(simrs_operasi_id),
              mr_id = VALUES(mr_id),
              patient_name = VALUES(patient_name),
              patient_age = VALUES(patient_age),
              operation_date = VALUES(operation_date),
              operation_time = VALUES(operation_time),
              operation_name = VALUES(operation_name),
              diagnosis = VALUES(diagnosis),
              status = VALUES(status),
              doctor_name = VALUES(doctor_name),
              doctor_key = VALUES(doctor_key),
              doctor_source = VALUES(doctor_source),
              r2_key = VALUES(r2_key),
              r2_bucket = VALUES(r2_bucket),
              surgery_id = VALUES(surgery_id),
              fetched_at = VALUES(fetched_at),
              last_synced_at = NOW()`,
          [
            item.facility, item.sourceKey, item.caseId, item.simrsOperasiId, item.mrId,
            item.patientName, item.patientAge, item.operationDate, item.operationTime, item.operationName,
            item.diagnosis, item.status, item.doctorName, item.doctorKey, item.doctorSource,
            item.r2Key, item.r2Bucket, item.surgeryId, item.fetchedAt,
          ]
        );
        saved++;
      } catch (error) {
        errors.push({ source_key: raw?.source_key || raw?.sourceKey || null, message: error.message });
      }
    }

    return { received: items.length, saved, errors };
  }

  async archiveRecords(records) {
    if (!Array.isArray(records)) throw new Error('records must be an array');

    const bucket = process.env.OPERATION_DATA_R2_BUCKET_NAME || r2Storage.R2_BUCKET_NAME;
    const indexItems = [];
    const archiveErrors = [];

    for (const raw of records) {
      const indexRaw = raw?.index_item || raw?.indexItem || raw?.index || raw?.operation || raw;
      const payload = raw?.payload || raw?.detail || raw?.data || raw;

      try {
        const item = this.normalizeIndexItem(indexRaw || {});
        await r2Storage.uploadJson(item.r2Key, payload, bucket);
        const doctor = deriveDoctorMetadata(indexRaw || {}, payload || {});
        const mrId = item.mrId || deriveMedicalRecordNumber(indexRaw || {}, payload || {});
        const patientAge = item.patientAge || derivePatientAge(indexRaw || {}, payload || {});
        indexItems.push({
          ...indexRaw,
          mr_id: mrId,
          patient_age: patientAge,
          doctor_name: item.doctorName || doctor.doctorName,
          doctor_key: item.doctorKey || doctor.doctorKey,
          doctor_source: item.doctorSource || doctor.doctorSource,
          r2_key: item.r2Key,
          r2_bucket: bucket,
        });
      } catch (error) {
        archiveErrors.push({
          source_key: indexRaw?.source_key || indexRaw?.sourceKey || null,
          message: error.message,
        });
      }
    }

    const indexResult = indexItems.length > 0
      ? await this.upsertIndex(indexItems)
      : { received: 0, saved: 0, errors: [] };

    return {
      received: records.length,
      archived: indexItems.length,
      bucket,
      index: indexResult,
      errors: archiveErrors,
    };
  }

  async listRowsMissingPatientAge({ facility = 'gambiran', start, end, limit = 100 } = {}) {
    const normalizedFacility = normalizeFacility(facility);
    const rowLimit = safeLimit(limit, 100);
    const where = [
      'facility = ?',
      "mr_id IS NOT NULL",
      "mr_id <> ''",
      "(patient_age IS NULL OR patient_age = '')",
    ];
    const values = [normalizedFacility];

    if (start) {
      where.push('operation_date >= ?');
      values.push(normalizeDate(start));
    }
    if (end) {
      where.push('operation_date <= ?');
      values.push(normalizeDate(end));
    }

    const [rows] = await db.query(
      `SELECT id, facility, source_key, mr_id, patient_name, operation_date
         FROM operation_data_index
        WHERE ${where.join(' AND ')}
        ORDER BY operation_date DESC, id DESC
        LIMIT ?`,
      [...values, rowLimit]
    );

    return rows.map(mapRecordDates);
  }

  async updatePatientAges(items) {
    if (!Array.isArray(items)) throw new Error('items must be an array');
    let updated = 0;
    const errors = [];

    for (const raw of items) {
      const sourceKey = trim(raw?.source_key || raw?.sourceKey);
      const patientAge = nullable(raw?.patient_age || raw?.patientAge || raw?.age || raw?.usia);
      if (!sourceKey || !patientAge) {
        errors.push({ source_key: sourceKey || null, message: 'source_key and patient_age are required' });
        continue;
      }

      try {
        const [result] = await db.query(
          `UPDATE operation_data_index
              SET patient_age = ?
            WHERE source_key = ?`,
          [patientAge, sourceKey]
        );
        updated += result?.affectedRows || 0;
      } catch (error) {
        errors.push({ source_key: sourceKey, message: error.message });
      }
    }

    return { received: items.length, updated, errors };
  }

  async backfillMedicalRecordNumbersFromPayload({ facility = 'gambiran', limit = 100 } = {}) {
    const normalizedFacility = normalizeFacility(facility);
    const rowLimit = safeLimit(limit, 100);
    const [rows] = await db.query(
      `SELECT id, facility, r2_key, r2_bucket
         FROM operation_data_index
        WHERE facility = ?
          AND r2_key IS NOT NULL
          AND (mr_id IS NULL OR mr_id = '')
        ORDER BY operation_date DESC, id DESC
        LIMIT ?`,
      [normalizedFacility, rowLimit]
    );

    let updated = 0;
    let skipped = 0;
    const errors = [];

    for (const row of rows) {
      try {
        const payload = await r2Storage.getJson(row.r2_key, row.r2_bucket || process.env.OPERATION_DATA_R2_BUCKET_NAME);
        const mrId = deriveMedicalRecordNumber({ facility: row.facility }, payload || {});
        if (!mrId) {
          skipped++;
          continue;
        }

        await db.query(
          `UPDATE operation_data_index
              SET mr_id = ?
            WHERE id = ?`,
          [mrId, row.id]
        );
        updated++;
      } catch (error) {
        errors.push({ id: row.id, message: error.message });
      }
    }

    return {
      scanned: rows.length,
      updated,
      skipped,
      errors,
    };
  }

  async backfillDoctorMetadataFromPayload({ facility = 'gambiran', limit = 100 } = {}) {
    const normalizedFacility = normalizeFacility(facility);
    const rowLimit = safeLimit(limit, 100);
    const [rows] = await db.query(
      `SELECT id, facility, r2_key, r2_bucket
         FROM operation_data_index
        WHERE facility = ?
          AND r2_key IS NOT NULL
          AND (doctor_key IS NULL OR doctor_key = '')
        ORDER BY operation_date DESC, id DESC
        LIMIT ?`,
      [normalizedFacility, rowLimit]
    );

    let updated = 0;
    let skipped = 0;
    const errors = [];

    for (const row of rows) {
      try {
        const payload = await r2Storage.getJson(row.r2_key, row.r2_bucket || process.env.OPERATION_DATA_R2_BUCKET_NAME);
        const doctor = deriveDoctorMetadata({ facility: row.facility }, payload || {});
        if (!doctor.doctorKey) {
          skipped++;
          continue;
        }

        await db.query(
          `UPDATE operation_data_index
              SET doctor_name = ?,
                  doctor_key = ?,
                  doctor_source = ?
            WHERE id = ?`,
          [doctor.doctorName, doctor.doctorKey, doctor.doctorSource, row.id]
        );
        updated++;
      } catch (error) {
        errors.push({ id: row.id, message: error.message });
      }
    }

    return {
      scanned: rows.length,
      updated,
      skipped,
      errors,
    };
  }

  async list(params = {}) {
    const page = Math.max(1, parseInt(params.page, 10) || 1);
    const limit = safeLimit(params.limit);
    const offset = (page - 1) * limit;
    const where = [];
    const values = [];

    if (params.facility && params.facility !== 'all') {
      where.push('facility = ?');
      values.push(normalizeFacility(params.facility));
    }
    if (params.start) {
      where.push('operation_date >= ?');
      values.push(normalizeDate(params.start));
    }
    if (params.end) {
      where.push('operation_date <= ?');
      values.push(normalizeDate(params.end));
    }
    const searchTerms = parseSearchTerms(params.q);
    if (searchTerms.length > 0) {
      const searchableColumns = ['patient_name', 'mr_id', 'operation_name', 'diagnosis'];
      const termClauses = searchTerms.map(() => (
        `(${searchableColumns.map(column => `LOWER(COALESCE(${column}, '')) LIKE ?`).join(' OR ')})`
      ));
      where.push(`(${termClauses.join(' OR ')})`);
      searchTerms.forEach((term) => {
        const q = escapeLikeTerm(term);
        searchableColumns.forEach(() => values.push(q));
      });
    }

    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const [[countRow]] = await db.query(`SELECT COUNT(*) AS total FROM operation_data_index ${clause}`, values);
    const [rows] = await db.query(
      `SELECT id, facility, source_key, case_id, simrs_operasi_id, mr_id, patient_name,
              patient_age, operation_date, operation_time, operation_name, diagnosis, status,
              doctor_name, doctor_key, doctor_source, r2_key, r2_bucket, fetched_at, last_synced_at, created_at, updated_at
         FROM operation_data_index
         ${clause}
         ORDER BY operation_date DESC, operation_time DESC, id DESC
         LIMIT ? OFFSET ?`,
      [...values, limit, offset]
    );

    return {
      rows: rows.map(mapRecordDates),
      pagination: { page, limit, total: countRow.total, has_more: offset + rows.length < countRow.total },
    };
  }

  async detail(id) {
    const [rows] = await db.query(
      `SELECT * FROM operation_data_index WHERE id = ?`,
      [id]
    );
    if (!rows.length) return null;
    const record = mapRecordDates(rows[0]);
    const payload = await r2Storage.getJson(record.r2_key, record.r2_bucket || process.env.OPERATION_DATA_R2_BUCKET_NAME);
    return { record, payload };
  }

  buildMonthlyJobs(startDate, endDate, facilities) {
    const jobs = [];
    let cursor = new Date(`${endDate}T00:00:00+07:00`);
    const start = new Date(`${startDate}T00:00:00+07:00`);

    while (cursor >= start) {
      const periodEnd = normalizeDate(cursor);
      const periodStartDate = new Date(cursor);
      periodStartDate.setDate(1);
      if (periodStartDate < start) periodStartDate.setTime(start.getTime());
      const periodStart = normalizeDate(periodStartDate);

      for (const facility of facilities) {
        jobs.push({
          facility,
          periodStart,
          periodEnd,
          priority: dateToInt(periodEnd),
        });
      }

      cursor = new Date(`${periodStart}T00:00:00+07:00`);
      cursor.setDate(cursor.getDate() - 1);
    }

    return jobs;
  }

  async createBackfillRun({ startDate = '2020-01-01', endDate, facilities = FACILITIES, createdBy = 'operation-data-fetcher' }) {
    const normalizedStart = normalizeDate(startDate);
    const normalizedEnd = normalizeDate(endDate || new Date());
    const normalizedFacilities = facilities.map(normalizeFacility).filter(f => FACILITIES.includes(f));
    const jobs = this.buildMonthlyJobs(normalizedStart, normalizedEnd, normalizedFacilities);

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      const [runResult] = await conn.query(
        `INSERT INTO operation_data_backfill_runs
           (start_date, end_date, status, total_jobs, created_by)
         VALUES (?, ?, 'pending', ?, ?)`,
        [normalizedStart, normalizedEnd, jobs.length, createdBy]
      );
      const runId = runResult.insertId;

      for (const job of jobs) {
        await conn.query(
          `INSERT INTO operation_data_backfill_jobs
             (run_id, facility, period_start, period_end, priority)
           VALUES (?, ?, ?, ?, ?)`,
          [runId, job.facility, job.periodStart, job.periodEnd, job.priority]
        );
      }

      await conn.commit();
      return { run_id: runId, total_jobs: jobs.length, start_date: normalizedStart, end_date: normalizedEnd };
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }

  async claimBackfillJobs(limit = 1) {
    const claimLimit = Math.min(Math.max(parseInt(limit, 10) || 1, 1), 5);
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      const [jobs] = await conn.query(
        `SELECT *
           FROM operation_data_backfill_jobs
          WHERE status IN ('pending','retrying')
            AND attempts < max_attempts
          ORDER BY priority DESC, id ASC
          LIMIT ?
          FOR UPDATE`,
        [claimLimit]
      );

      for (const job of jobs) {
        await conn.query(
          `UPDATE operation_data_backfill_jobs
              SET status = 'running', attempts = attempts + 1, started_at = NOW(), error_message = NULL
            WHERE id = ?`,
          [job.id]
        );
        await conn.query(`UPDATE operation_data_backfill_runs SET status = 'running' WHERE id = ? AND status = 'pending'`, [job.run_id]);
        job.status = 'running';
        job.attempts += 1;
      }

      await conn.commit();
      return jobs;
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }

  async completeBackfillJob(id, summary = {}) {
    await db.query(
      `UPDATE operation_data_backfill_jobs
          SET status = 'completed',
              items_found = ?,
              items_saved = ?,
              summary_json = ?,
              completed_at = NOW()
        WHERE id = ?`,
      [summary.items_found || 0, summary.items_saved || 0, JSON.stringify(summary), id]
    );
    await this.refreshRunStatusByJob(id);
  }

  async failBackfillJob(id, errorMessage, summary = {}) {
    const [[job]] = await db.query(`SELECT attempts, max_attempts FROM operation_data_backfill_jobs WHERE id = ?`, [id]);
    const nextStatus = job && job.attempts < job.max_attempts ? 'retrying' : 'failed';
    await db.query(
      `UPDATE operation_data_backfill_jobs
          SET status = ?,
              error_message = ?,
              summary_json = ?,
              completed_at = NOW()
        WHERE id = ?`,
      [nextStatus, String(errorMessage || '').slice(0, 2000), JSON.stringify(summary), id]
    );
    await this.refreshRunStatusByJob(id);
  }

  async refreshRunStatusByJob(jobId) {
    const [[row]] = await db.query(`SELECT run_id FROM operation_data_backfill_jobs WHERE id = ?`, [jobId]);
    if (!row) return;
    const [[counts]] = await db.query(
      `SELECT
          SUM(status = 'completed') AS completed,
          SUM(status = 'failed') AS failed,
          COUNT(*) AS total,
          SUM(status IN ('pending','running','retrying')) AS open_count
         FROM operation_data_backfill_jobs
        WHERE run_id = ?`,
      [row.run_id]
    );
    const status = counts.open_count === 0
      ? (counts.failed > 0 ? 'failed' : 'completed')
      : 'running';
    await db.query(
      `UPDATE operation_data_backfill_runs
          SET status = ?, completed_jobs = ?, failed_jobs = ?
        WHERE id = ?`,
      [status, counts.completed || 0, counts.failed || 0, row.run_id]
    );
  }

  async backfillStatus(limit = 10) {
    const [runs] = await db.query(
      `SELECT * FROM operation_data_backfill_runs ORDER BY created_at DESC LIMIT ?`,
      [Math.min(parseInt(limit, 10) || 10, 50)]
    );
    return runs;
  }
}

OperationDataService.LOCATION_MAP = LOCATION_MAP;
OperationDataService.assertCanonicalGambiranOperation = assertCanonicalGambiranOperation;

module.exports = new OperationDataService();

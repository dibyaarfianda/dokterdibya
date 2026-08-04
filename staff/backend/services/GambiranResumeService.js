const crypto = require('crypto');
const path = require('path');
const dbPool = require('../db');
const r2Storage = require('./r2Storage');
const logger = require('../utils/logger');
const { convertToJpegs, isPdf, isImage } = require('./GambiranResumeMedia');
const {
  normalizeMedicalRecordNumber,
  cleanForStorage,
  normalizeTimestamp,
  buildTimeline,
  buildResumeText,
  buildDocxFromTemplate,
} = require('./GambiranResumeArtifacts');

const ACTIVE_STATUSES = ['queued', 'collecting', 'rendering'];
const DEFAULT_TEMPLATE_PATH = path.join(__dirname, '../templates/gambiran-resume-legal-memorandum.docx');

function trim(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function defaultCommBaseUrl() {
  return (process.env.COMM_SERVICE_BASE_URL || process.env.COMM_BASE_URL || 'http://127.0.0.1:3002').replace(/\/+$/, '');
}

function parseJson(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function toMysqlDateTime(value) {
  const normalized = normalizeTimestamp(value);
  if (!normalized) return null;
  return new Date(normalized.epoch + (7 * 60 * 60 * 1000)).toISOString().slice(0, 19).replace('T', ' ');
}

function safeSegment(value, fallback = 'item') {
  const clean = trim(value).replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100);
  return clean || fallback;
}

function sanitizeFilename(value, fallback = 'dokumen.bin') {
  const base = path.basename(trim(value) || fallback);
  const ext = path.extname(base).replace(/[^.a-zA-Z0-9]/g, '').slice(0, 12);
  const name = path.basename(base, path.extname(base)).replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120) || 'dokumen';
  return `${name}${ext || ''}`;
}

function extensionForMime(mimeType) {
  const normalized = trim(mimeType).toLowerCase();
  return ({
    'application/pdf': '.pdf', 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp',
    'image/gif': '.gif', 'image/bmp': '.bmp', 'image/tiff': '.tiff',
  })[normalized] || '';
}

function filenameFromDisposition(headerValue) {
  const value = trim(headerValue);
  const utf = value.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf) {
    try { return decodeURIComponent(utf[1]); } catch { return utf[1]; }
  }
  return value.match(/filename="?([^";]+)"?/i)?.[1] || '';
}

function mapCatalog(row) {
  if (!row) return null;
  return {
    ...row,
    id: Number(row.id),
    archive_version: Number(row.archive_version || 0),
    case_count: Number(row.case_count || 0),
    event_count: Number(row.event_count || 0),
    file_count: Number(row.file_count || 0),
    jpg_count: Number(row.jpg_count || 0),
    warnings: parseJson(row.warnings_json, []),
  };
}

function patientName(snapshot) {
  const encounters = Array.isArray(snapshot?.encounters) ? snapshot.encounters : Array.isArray(snapshot?.cases) ? snapshot.cases : [];
  return trim(snapshot?.patient?.name || snapshot?.identity?.name || snapshot?.patient_name || encounters[0]?.patient?.name || encounters[0]?.patient_name) || null;
}

function encounterList(snapshot) {
  return Array.isArray(snapshot?.encounters) ? snapshot.encounters : Array.isArray(snapshot?.cases) ? snapshot.cases : [];
}

function collectFiles(snapshot) {
  const found = [];
  const add = (items, defaults = {}) => {
    if (!Array.isArray(items)) return;
    items.forEach((item, index) => {
      if (!item || typeof item !== 'object') return;
      found.push({
        ...cleanForStorage(item),
        id: trim(item.id || item.file_id || item.uuid || item.document_id) || `${defaults.case_id || 'patient'}-${defaults.category || 'file'}-${index + 1}`,
        case_id: trim(item.case_id || defaults.case_id) || null,
        category: trim(item.category || item.type || item.file_type || defaults.category) || 'dokumen',
        filename: trim(item.filename || item.file_name || item.name || item.title) || `dokumen-${index + 1}`,
        mime_type: trim(item.mime_type || item.mimeType || item.content_type) || 'application/octet-stream',
        download_path: trim(item.download_path || item.downloadPath || item.internal_path || item.url) || null,
        occurred_at: item.occurred_at || item.created_at || item.date || defaults.occurred_at || null,
      });
    });
  };
  add(snapshot?.files, { category: 'dokumen' });
  add(snapshot?.attachments, { category: 'lampiran' });
  add(snapshot?.clinical_documents, { category: 'erm' });
  add(snapshot?.penunjang?.files, { category: 'penunjang' });
  add(snapshot?.radiology?.files, { category: 'radiologi' });
  add(snapshot?.operations?.flatMap(operation => operation?.files || []), { category: 'operasi' });
  add(snapshot?.anesthesia?.files, { category: 'anestesi' });
  for (const encounter of encounterList(snapshot)) {
    const context = { case_id: trim(encounter.case_id || encounter.id), occurred_at: encounter.admission_at || encounter.date };
    add(encounter.files, { ...context, category: 'dokumen' });
    add(encounter.attachments, { ...context, category: 'lampiran' });
    add(encounter.clinical_documents, { ...context, category: 'erm' });
    add(encounter.penunjang?.files, { ...context, category: 'penunjang' });
    add(encounter.radiology?.files, { ...context, category: 'radiologi' });
    add(encounter.operations?.flatMap(operation => operation?.files || []), { ...context, category: 'operasi' });
    add(encounter.anesthesia?.files, { ...context, category: 'anestesi' });
  }
  const unique = new Map();
  for (const file of found) {
    const key = `${file.case_id || ''}:${file.id}:${file.download_path || file.filename}`;
    if (!unique.has(key)) unique.set(key, file);
  }
  return [...unique.values()];
}

class GambiranResumeService {
  constructor({
    db = dbPool,
    r2 = r2Storage,
    fetchImpl = global.fetch,
    commBaseUrl = defaultCommBaseUrl(),
    apiKey = process.env.COMM_INTERNAL_API_KEY || process.env.COMM_API_KEY || '',
    bucket = process.env.GAMBIRAN_RESUME_R2_BUCKET_NAME || r2Storage.R2_BUCKET_NAME,
    templatePath = DEFAULT_TEMPLATE_PATH,
    maxFileBytes = Number(process.env.GAMBIRAN_RESUME_MAX_FILE_BYTES || 100 * 1024 * 1024),
  } = {}) {
    this.db = db;
    this.r2 = r2;
    this.fetchImpl = fetchImpl;
    this.commBaseUrl = trim(commBaseUrl).replace(/\/+$/, '');
    this.apiKey = apiKey;
    this.bucket = bucket;
    this.templatePath = templatePath;
    this.maxFileBytes = maxFileBytes;
    this.activeJobs = new Map();
  }

  async list(params = {}) {
    const page = Math.max(1, parseInt(params.page, 10) || 1);
    const limit = Math.min(Math.max(parseInt(params.limit, 10) || 30, 1), 100);
    const offset = (page - 1) * limit;
    const where = [`facility = 'gambiran'`];
    const values = [];
    if (trim(params.search)) {
      const mr = normalizeMedicalRecordNumber(params.search);
      where.push('mr_digits = ?');
      values.push(mr.digits);
    }
    if (trim(params.status)) {
      const allowed = [...ACTIVE_STATUSES, 'ready', 'ready_with_warnings', 'failed'];
      if (!allowed.includes(params.status)) {
        const error = new Error('Status arsip tidak valid');
        error.status = 400;
        throw error;
      }
      where.push('status = ?');
      values.push(params.status);
    }
    const clause = `WHERE ${where.join(' AND ')}`;
    const [[count]] = await this.db.query(`SELECT COUNT(*) AS total FROM docboard_gambiran_resumes ${clause}`, values);
    const [rows] = await this.db.query(
      `SELECT * FROM docboard_gambiran_resumes ${clause}
        ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
      [...values, limit, offset]
    );
    const total = Number(count.total || 0);
    const mapped = rows.map(mapCatalog);
    for (const row of mapped) {
      if (ACTIVE_STATUSES.includes(row.status) && !this.activeJobs.has(String(row.id))) {
        const interrupted = 'Proses arsip terputus karena backend dimulai ulang. Silakan buat versi baru.';
        await this.db.query(
          `UPDATE docboard_gambiran_resumes SET status = 'failed', last_error = ?, completed_at = NOW() WHERE id = ? AND status IN ('queued','collecting','rendering')`,
          [interrupted, row.id]
        );
        row.status = 'failed';
        row.last_error = interrupted;
      }
    }
    return { rows: mapped, pagination: { page, limit, total, has_more: offset + rows.length < total } };
  }

  async getCatalog(id) {
    const [rows] = await this.db.query('SELECT * FROM docboard_gambiran_resumes WHERE id = ? LIMIT 1', [id]);
    return mapCatalog(rows[0]);
  }

  async create(medicalRecordNumber, createdBy) {
    const mr = normalizeMedicalRecordNumber(medicalRecordNumber);
    const [active] = await this.db.query(
      `SELECT id, status FROM docboard_gambiran_resumes
        WHERE facility = 'gambiran' AND mr_digits = ? AND status IN ('queued','collecting','rendering')
        ORDER BY id DESC LIMIT 1`,
      [mr.digits]
    );
    if (active[0]) {
      const error = new Error('Pembuatan resume untuk Nomor RM ini masih berjalan');
      error.status = 409;
      error.archive_id = Number(active[0].id);
      throw error;
    }
    const [[versionRow]] = await this.db.query(
      `SELECT COALESCE(MAX(archive_version), 0) + 1 AS next_version
         FROM docboard_gambiran_resumes WHERE facility = 'gambiran' AND mr_digits = ?`,
      [mr.digits]
    );
    const version = Number(versionRow.next_version || 1);
    try {
      const [result] = await this.db.query(
        `INSERT INTO docboard_gambiran_resumes
          (facility, mr_digits, mr_display, archive_version, status, r2_bucket, created_by)
         VALUES ('gambiran', ?, ?, ?, 'queued', ?, ?)`,
        [mr.digits, mr.display, version, this.bucket, createdBy || null]
      );
      return { record: await this.getCatalog(result.insertId), medicalRecord: mr };
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') {
        const conflict = new Error('Versi resume bersamaan terdeteksi; silakan coba lagi');
        conflict.status = 409;
        throw conflict;
      }
      throw error;
    }
  }

  start(id, medicalRecord) {
    const key = String(id);
    if (this.activeJobs.has(key)) return this.activeJobs.get(key);
    const tracker = { startedAt: Date.now(), promise: null };
    tracker.promise = this.process(id, medicalRecord)
      .catch(error => {
        logger.error('Gambiran resume background job failed', { archiveId: id, message: error.message });
        return null;
      })
      .finally(() => this.activeJobs.delete(key));
    this.activeJobs.set(key, tracker);
    return tracker;
  }

  async requestSnapshot(mr) {
    if (!this.apiKey) throw new Error('COMM internal API key belum dikonfigurasi');
    if (typeof this.fetchImpl !== 'function') throw new Error('Fetch API tidak tersedia');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10 * 60 * 1000);
    try {
      const response = await this.fetchImpl(
        `${this.commBaseUrl}/api/internal/gambiran/patients/${encodeURIComponent(mr.digits)}/archive`,
        { headers: { Accept: 'application/json', 'X-API-Key': this.apiKey }, signal: controller.signal }
      );
      const text = await response.text();
      let body = {};
      try { body = text ? JSON.parse(text) : {}; } catch { body = {}; }
      if (!response.ok || !body.success || !body.snapshot) {
        const error = new Error(body.message || body.error || `COMM resume Gambiran gagal (${response.status})`);
        error.status = response.status === 404 ? 502 : response.status;
        throw error;
      }
      const snapshot = cleanForStorage(body.snapshot);
      const returnedMr = snapshot?.patient?.medical_record_number || snapshot?.patient?.mr_id || snapshot?.mr_id;
      if (returnedMr) {
        const normalizedReturned = normalizeMedicalRecordNumber(returnedMr);
        if (normalizedReturned.digits !== mr.digits) {
          const mismatch = new Error('Nomor RM pada respons COMM tidak cocok dengan permintaan');
          mismatch.status = 409;
          throw mismatch;
        }
      }
      return snapshot;
    } finally {
      clearTimeout(timeout);
    }
  }

  async fetchCommFile(mr, file) {
    let internalPath = trim(file.download_path);
    if (internalPath && /^https?:\/\//i.test(internalPath)) {
      const parsed = new URL(internalPath);
      internalPath = `${parsed.pathname}${parsed.search}`;
    }
    if (internalPath && !internalPath.startsWith('/api/internal/')) {
      throw new Error('Path lampiran COMM tidak diizinkan');
    }
    if (!internalPath) {
      internalPath = `/api/internal/gambiran/patients/${encodeURIComponent(mr.digits)}/files/${encodeURIComponent(file.id)}`;
      if (file.case_id) internalPath += `?caseId=${encodeURIComponent(file.case_id)}`;
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5 * 60 * 1000);
    try {
      const response = await this.fetchImpl(`${this.commBaseUrl}${internalPath}`, {
        headers: { Accept: '*/*', 'X-API-Key': this.apiKey }, signal: controller.signal,
      });
      if (!response.ok) {
        const error = new Error(`Lampiran COMM gagal (${response.status})`);
        error.status = response.status;
        throw error;
      }
      const declaredSize = Number(response.headers?.get?.('content-length') || 0);
      if (declaredSize > this.maxFileBytes) throw new Error('Lampiran melebihi batas ukuran arsip');
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length > this.maxFileBytes) throw new Error('Lampiran melebihi batas ukuran arsip');
      const mimeType = trim(response.headers?.get?.('content-type')).split(';')[0] || file.mime_type || 'application/octet-stream';
      let filename = sanitizeFilename(filenameFromDisposition(response.headers?.get?.('content-disposition')) || file.filename);
      if (!path.extname(filename) && extensionForMime(mimeType)) filename += extensionForMime(mimeType);
      return {
        buffer,
        mimeType,
        filename,
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  async archiveFile(id, baseKey, mr, file, index) {
    const downloaded = await this.fetchCommFile(mr, file);
    const checksum = crypto.createHash('sha256').update(downloaded.buffer).digest('hex');
    const caseFolder = safeSegment(file.case_id, 'patient');
    const prefix = `${String(index + 1).padStart(4, '0')}-${safeSegment(path.basename(downloaded.filename, path.extname(downloaded.filename)), 'dokumen')}`;
    const originalKey = `${baseKey}/originals/${caseFolder}/${prefix}${path.extname(downloaded.filename) || '.bin'}`;
    await this.r2.uploadBuffer(originalKey, downloaded.buffer, downloaded.mimeType, this.bucket, {
      contentDisposition: `attachment; filename="${downloaded.filename.replace(/"/g, '')}"`,
    });
    const jpgKeys = [];
    const conversionWarnings = [];
    try {
      const supported = isPdf(downloaded.buffer, downloaded.mimeType, downloaded.filename)
        || isImage(downloaded.mimeType, downloaded.filename);
      await convertToJpegs(downloaded.buffer, downloaded.mimeType, downloaded.filename, {
        isolatePdf: true,
        onPage: async item => {
          const jpgKey = `${baseKey}/jpg/${caseFolder}/${prefix}-p${String(item.page).padStart(4, '0')}.jpg`;
          try {
            await this.r2.uploadBuffer(jpgKey, item.buffer, 'image/jpeg', this.bucket);
            jpgKeys.push(jpgKey);
          } catch (error) {
            conversionWarnings.push(`Upload JPG halaman ${item.page} untuk ${downloaded.filename} gagal: ${error.message}`);
          }
        },
      });
      if (!supported) {
        conversionWarnings.push(`Format ${downloaded.filename} disimpan asli tanpa turunan JPG`);
      }
    } catch (error) {
      conversionWarnings.push(`Konversi JPG ${downloaded.filename} gagal: ${error.message}`);
    }
    const occurredAt = toMysqlDateTime(file.occurred_at);
    const [result] = await this.db.query(
      `INSERT INTO docboard_gambiran_resume_files
        (resume_id, source_file_id, case_id, category, occurred_at, filename, mime_type,
         byte_size, sha256, original_r2_key, jpg_keys_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, trim(file.id).slice(0, 255) || null, trim(file.case_id).slice(0, 64) || null,
        trim(file.category).slice(0, 64) || 'dokumen', occurredAt, downloaded.filename,
        downloaded.mimeType, downloaded.buffer.length, checksum, originalKey, JSON.stringify(jpgKeys)]
    );
    return {
      id: Number(result.insertId), source_file_id: file.id, case_id: file.case_id, category: file.category,
      occurred_at: occurredAt, filename: downloaded.filename, mime_type: downloaded.mimeType,
      byte_size: downloaded.buffer.length, sha256: checksum, original_r2_key: originalKey, jpg_keys: jpgKeys,
      conversion_warnings: conversionWarnings,
    };
  }

  async process(id, mr) {
    try {
      await this.db.query(
        `UPDATE docboard_gambiran_resumes SET status = 'collecting', started_at = NOW(), last_error = NULL WHERE id = ?`,
        [id]
      );
      const snapshot = await this.requestSnapshot(mr);
      const timeline = buildTimeline(snapshot);
      const sourceWarnings = Array.isArray(snapshot.warnings) ? snapshot.warnings.map(trim).filter(Boolean) : [];
      const warnings = [...sourceWarnings];
      const baseKey = `gambiran-resumes/${mr.digits}/${id}`;
      const archivedFiles = [];
      const files = collectFiles(snapshot);
      for (let index = 0; index < files.length; index += 1) {
        try {
          const archived = await this.archiveFile(id, baseKey, mr, files[index], index);
          archivedFiles.push(archived);
          warnings.push(...archived.conversion_warnings);
        } catch (error) {
          warnings.push(`Lampiran ${files[index].filename || files[index].id} gagal diarsipkan: ${error.message}`);
        }
      }

      await this.db.query(`UPDATE docboard_gambiran_resumes SET status = 'rendering' WHERE id = ?`, [id]);
      const generatedAt = new Date().toISOString();
      const resumeText = buildResumeText({ snapshot, medicalRecord: mr, timeline, warnings, files: archivedFiles, generatedAt });
      const docx = buildDocxFromTemplate(this.templatePath, resumeText);
      const snapshotKey = `${baseKey}/snapshot.json`;
      const manifestKey = `${baseKey}/manifest.json`;
      const txtKey = `${baseKey}/resume.txt`;
      const docxKey = `${baseKey}/resume.docx`;
      const caseIds = [...new Set(encounterList(snapshot).map(item => trim(item.case_id || item.id)).filter(Boolean))];
      const manifest = {
        schema_version: 1,
        archive_id: Number(id),
        facility: 'gambiran',
        medical_record_number: mr.display,
        medify_search_number: mr.digits,
        generated_at: generatedAt,
        case_ids: caseIds,
        counts: { cases: caseIds.length, events: timeline.length, files: archivedFiles.length, jpg: archivedFiles.reduce((sum, file) => sum + file.jpg_keys.length, 0) },
        warnings,
        artifacts: { snapshot: snapshotKey, manifest: manifestKey, resume_txt: txtKey, resume_docx: docxKey },
        files: archivedFiles,
      };
      await Promise.all([
        this.r2.uploadBuffer(snapshotKey, Buffer.from(JSON.stringify({ ...snapshot, normalized_timeline: timeline }, null, 2), 'utf8'), 'application/json; charset=utf-8', this.bucket),
        this.r2.uploadBuffer(txtKey, Buffer.from(resumeText, 'utf8'), 'text/plain; charset=utf-8', this.bucket, { contentDisposition: `attachment; filename="${mr.digits}-resume.txt"` }),
        this.r2.uploadBuffer(docxKey, docx, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', this.bucket, { contentDisposition: `attachment; filename="${mr.digits}-resume.docx"` }),
      ]);
      await this.r2.uploadBuffer(manifestKey, Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'), 'application/json; charset=utf-8', this.bucket);

      const dated = timeline.map(item => item.occurred_at).filter(Boolean).sort();
      const jpgCount = archivedFiles.reduce((sum, file) => sum + file.jpg_keys.length, 0);
      const status = warnings.length ? 'ready_with_warnings' : 'ready';
      await this.db.query(
        `UPDATE docboard_gambiran_resumes
            SET patient_name = ?, status = ?, first_visit_at = ?, last_visit_at = ?, case_count = ?,
                event_count = ?, file_count = ?, jpg_count = ?, warnings_json = ?, snapshot_r2_key = ?,
                manifest_r2_key = ?, resume_txt_r2_key = ?, resume_docx_r2_key = ?, completed_at = NOW(), last_error = NULL
          WHERE id = ?`,
        [patientName(snapshot), status, toMysqlDateTime(dated[0]), toMysqlDateTime(dated[dated.length - 1]),
          caseIds.length, timeline.length, archivedFiles.length, jpgCount, JSON.stringify(warnings), snapshotKey,
          manifestKey, txtKey, docxKey, id]
      );
      return this.getDetail(id);
    } catch (error) {
      await this.db.query(
        `UPDATE docboard_gambiran_resumes SET status = 'failed', last_error = ?, completed_at = NOW() WHERE id = ?`,
        [trim(error.message).slice(0, 2000), id]
      );
      throw error;
    }
  }

  async getDetail(id) {
    const record = await this.getCatalog(id);
    if (!record) {
      const error = new Error('Resume Gambiran tidak ditemukan');
      error.status = 404;
      throw error;
    }
    if (ACTIVE_STATUSES.includes(record.status) && !this.activeJobs.has(String(record.id))) {
      const interrupted = 'Proses arsip terputus karena backend dimulai ulang. Silakan buat versi baru.';
      await this.db.query(
        `UPDATE docboard_gambiran_resumes SET status = 'failed', last_error = ?, completed_at = NOW() WHERE id = ? AND status IN ('queued','collecting','rendering')`,
        [interrupted, record.id]
      );
      record.status = 'failed';
      record.last_error = interrupted;
    }
    let snapshot = null;
    let manifest = null;
    if (record.snapshot_r2_key && ['ready', 'ready_with_warnings'].includes(record.status)) {
      [snapshot, manifest] = await Promise.all([
        this.r2.getJson(record.snapshot_r2_key, record.r2_bucket || this.bucket),
        this.r2.getJson(record.manifest_r2_key, record.r2_bucket || this.bucket),
      ]);
    }
    return {
      resume: record,
      snapshot,
      manifest,
      progress: ACTIVE_STATUSES.includes(record.status) ? {
        status: record.status,
        started_at: record.started_at,
        elapsed_seconds: record.started_at ? Math.max(0, Math.floor((Date.now() - new Date(record.started_at).getTime()) / 1000)) : 0,
      } : null,
    };
  }

  async listFiles(id, params = {}) {
    const record = await this.getCatalog(id);
    if (!record) {
      const error = new Error('Resume Gambiran tidak ditemukan');
      error.status = 404;
      throw error;
    }
    const page = Math.max(1, parseInt(params.page, 10) || 1);
    const limit = Math.min(Math.max(parseInt(params.limit, 10) || 40, 1), 100);
    const offset = (page - 1) * limit;
    const where = ['resume_id = ?'];
    const values = [id];
    if (trim(params.category)) { where.push('category = ?'); values.push(params.category); }
    const clause = `WHERE ${where.join(' AND ')}`;
    const [[count]] = await this.db.query(`SELECT COUNT(*) AS total FROM docboard_gambiran_resume_files ${clause}`, values);
    const [rows] = await this.db.query(
      `SELECT * FROM docboard_gambiran_resume_files ${clause}
        ORDER BY occurred_at IS NULL, occurred_at, id LIMIT ? OFFSET ?`,
      [...values, limit, offset]
    );
    const total = Number(count.total || 0);
    return {
      rows: rows.map(row => ({ ...row, id: Number(row.id), byte_size: Number(row.byte_size || 0), jpg_keys: parseJson(row.jpg_keys_json, []) })),
      pagination: { page, limit, total, has_more: offset + rows.length < total },
    };
  }

  async getFileDownload(id, fileId, variant = 'original', page = 1) {
    const record = await this.getCatalog(id);
    if (!record) {
      const error = new Error('Resume Gambiran tidak ditemukan');
      error.status = 404;
      throw error;
    }
    const [rows] = await this.db.query(
      'SELECT * FROM docboard_gambiran_resume_files WHERE id = ? AND resume_id = ? LIMIT 1',
      [fileId, id]
    );
    const file = rows[0];
    if (!file) {
      const error = new Error('Berkas resume tidak ditemukan');
      error.status = 404;
      throw error;
    }
    let key = file.original_r2_key;
    let filename = file.filename;
    let contentType = file.mime_type;
    if (variant === 'jpg') {
      const jpgKeys = parseJson(file.jpg_keys_json, []);
      key = jpgKeys[Math.max(1, parseInt(page, 10) || 1) - 1];
      if (!key) {
        const error = new Error('Halaman JPG tidak ditemukan');
        error.status = 404;
        throw error;
      }
      filename = `${path.basename(file.filename, path.extname(file.filename))}-p${page}.jpg`;
      contentType = 'image/jpeg';
    }
    return {
      download_url: await this.r2.getSignedDownloadUrl(key, 900, record.r2_bucket || this.bucket, {
        contentType,
        contentDisposition: `${variant === 'jpg' ? 'inline' : 'attachment'}; filename="${sanitizeFilename(filename)}"`,
      }),
      expires_in: 900,
      filename: sanitizeFilename(filename),
    };
  }

  async getArtifactDownload(id, kind) {
    const record = await this.getCatalog(id);
    if (!record) {
      const error = new Error('Resume Gambiran tidak ditemukan');
      error.status = 404;
      throw error;
    }
    const artifacts = {
      txt: [record.resume_txt_r2_key, 'text/plain; charset=utf-8', `${record.mr_digits}-resume.txt`],
      docx: [record.resume_docx_r2_key, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', `${record.mr_digits}-resume.docx`],
      snapshot: [record.snapshot_r2_key, 'application/json', `${record.mr_digits}-snapshot.json`],
      manifest: [record.manifest_r2_key, 'application/json', `${record.mr_digits}-manifest.json`],
    };
    const artifact = artifacts[kind];
    if (!artifact?.[0]) {
      const error = new Error('Artefak resume belum tersedia');
      error.status = 404;
      throw error;
    }
    return {
      download_url: await this.r2.getSignedDownloadUrl(artifact[0], 900, record.r2_bucket || this.bucket, {
        contentType: artifact[1], contentDisposition: `attachment; filename="${artifact[2]}"`,
      }),
      expires_in: 900,
      filename: artifact[2],
    };
  }
}

GambiranResumeService.collectFiles = collectFiles;
GambiranResumeService.mapCatalog = mapCatalog;
module.exports = GambiranResumeService;

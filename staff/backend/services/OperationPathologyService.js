const dbPool = require('../db');
const logger = require('../utils/logger');

const PATHOLOGY_PATTERNS = [
    /\bhpa\b/i,
    /\bhasil[\s_-]*pa\b/i,
    /patologi\s*anatomi/i,
    /histopatologi/i,
    /\banatomi\b/i,
];

function trim(value) {
    if (value === undefined || value === null) return '';
    return String(value).trim();
}

function isPathologyText(value) {
    const clean = trim(value);
    return Boolean(clean && PATHOLOGY_PATTERNS.some(pattern => pattern.test(clean)));
}

function isPathologyResult(item = {}) {
    return isPathologyText(item.name)
        || isPathologyText(item.title)
        || isPathologyText(item.category)
        || isPathologyText(item.type);
}

function isPathologyFile(file = {}) {
    return isPathologyText(file.title)
        || isPathologyText(file.name)
        || isPathologyText(file.filePath)
        || isPathologyText(file.type);
}

function normalizeDate(value) {
    if (!value) return null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
    }
    const match = trim(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return match ? `${match[1]}-${match[2]}-${match[3]}` : trim(value);
}

function mapRecord(row) {
    if (!row) return null;
    return {
        ...row,
        operation_date: normalizeDate(row.operation_date),
        operation_time: row.operation_time ? String(row.operation_time).slice(0, 8) : null,
    };
}

function pathologyFileUrl(caseId, fileId) {
    return `/api/docboard/audit/gambiran/pathology-files/${encodeURIComponent(caseId)}/${encodeURIComponent(fileId)}`;
}

function defaultCommBaseUrl() {
    return (
        process.env.COMM_SERVICE_BASE_URL ||
        process.env.COMM_BASE_URL ||
        'http://127.0.0.1:3002'
    ).replace(/\/+$/, '');
}

class OperationPathologyService {
    constructor({ db = dbPool, commBaseUrl = defaultCommBaseUrl(), fetchImpl = global.fetch } = {}) {
        this.db = db;
        this.commBaseUrl = commBaseUrl.replace(/\/+$/, '');
        this.fetchImpl = fetchImpl;
    }

    async getAuditRecord(id) {
        const [rows] = await this.db.query(
            `SELECT id, facility, source_key, case_id, simrs_operasi_id, mr_id, patient_name,
                    patient_age, operation_date, operation_time, operation_name, diagnosis, status,
                    doctor_name, doctor_key, doctor_source
               FROM operation_data_index
              WHERE id = ?
                AND facility = 'gambiran'
                AND doctor_key IN ('dibya','tri_aji','latifa')
              LIMIT 1`,
            [id]
        );
        return mapRecord(rows[0]);
    }

    async requestPenunjang(path) {
        if (typeof this.fetchImpl !== 'function') {
            throw new Error('Fetch API is not available');
        }

        const url = `${this.commBaseUrl}${path}`;
        const response = await this.fetchImpl(url, {
            method: 'GET',
            headers: { Accept: 'application/json' },
        });
        const rawText = await response.text();
        let parsed;
        try {
            parsed = rawText ? JSON.parse(rawText) : {};
        } catch {
            parsed = { raw: rawText };
        }

        if (!response.ok || parsed.error) {
            const error = new Error(parsed.error || parsed.message || `COMM penunjang request failed (${response.status})`);
            error.status = response.status;
            error.response = parsed;
            throw error;
        }

        return parsed;
    }

    async fetchPenunjang(caseId) {
        const encodedCaseId = encodeURIComponent(caseId);
        const cachePath = `/api/simrs/penunjang-cache/${encodedCaseId}?facility=gambiran`;
        const livePath = `/api/simrs/penunjang/${encodedCaseId}?facility=gambiran`;

        try {
            return await this.requestPenunjang(cachePath);
        } catch (cacheError) {
            if (cacheError.status && cacheError.status !== 404) {
                logger.warn('Operation pathology cache lookup failed, falling back to live COMM', {
                    caseId,
                    status: cacheError.status,
                    message: cacheError.message,
                });
            }
            return this.requestPenunjang(livePath);
        }
    }

    async fetchPathologyFile(caseId, fileId) {
        if (typeof this.fetchImpl !== 'function') {
            throw new Error('Fetch API is not available');
        }

        const url = `${this.commBaseUrl}/api/simrs/penunjang-file/${encodeURIComponent(caseId)}/${encodeURIComponent(fileId)}?facility=gambiran`;
        const response = await this.fetchImpl(url, {
            method: 'GET',
            headers: { Accept: 'application/pdf,application/octet-stream,*/*' },
        });

        if (!response.ok) {
            const error = new Error(`COMM PA file request failed (${response.status})`);
            error.status = response.status;
            throw error;
        }

        const arrayBuffer = await response.arrayBuffer();
        return {
            buffer: Buffer.from(arrayBuffer),
            contentType: response.headers?.get?.('content-type') || 'application/pdf',
            filename: response.headers?.get?.('x-filename') || `pa-${caseId}-${fileId}.pdf`,
        };
    }

    summarize(results, files) {
        return {
            total: results.length,
            done: results.filter(item => item.isDone || /selesai/i.test(trim(item.value))).length,
            pending: results.filter(item => !(item.isDone || /selesai/i.test(trim(item.value)))).length,
            files: files.length,
        };
    }

    async getForAuditRow(id) {
        const record = await this.getAuditRecord(id);
        if (!record) {
            const error = new Error('Data audit tidak ditemukan');
            error.status = 404;
            throw error;
        }

        if (!record.case_id) {
            return {
                record,
                results: [],
                files: [],
                summary: this.summarize([], []),
                message: 'Case ID operasi belum tersedia',
            };
        }

        try {
            const data = await this.fetchPenunjang(record.case_id);
            const results = (data.results || []).filter(isPathologyResult);
            const files = (data.files || [])
                .filter(isPathologyFile)
                .map(file => ({
                    ...file,
                    url: file.id ? pathologyFileUrl(record.case_id, file.id) : null,
                }));

            return {
                record,
                caseId: data.caseId || record.case_id,
                facility: data.facility || 'gambiran',
                results,
                files,
                summary: this.summarize(results, files),
                fetchedAt: new Date().toISOString(),
            };
        } catch (error) {
            logger.warn('Operation pathology lookup unavailable', {
                auditId: id,
                caseId: record.case_id,
                message: error.message,
            });
            return {
                record,
                caseId: record.case_id,
                facility: 'gambiran',
                results: [],
                files: [],
                summary: this.summarize([], []),
                fetchedAt: new Date().toISOString(),
                message: 'Hasil penunjang belum tersedia di cache dan live SIMRS sedang tidak dapat diakses.',
            };
        }
    }
}

OperationPathologyService.isPathologyResult = isPathologyResult;
OperationPathologyService.isPathologyFile = isPathologyFile;
OperationPathologyService.pathologyFileUrl = pathologyFileUrl;

module.exports = OperationPathologyService;

const db = require('../db');
const r2Storage = require('./r2Storage');

const DEFAULT_ROOMS = ['Kirana', 'Joyoboyo', 'Tegowangi'];
const DEFAULT_WINDOW_HOURS = 24;
const DEFAULT_COMM_CACHE_BUCKET = 'medscomm-medis';

function clean(value) {
    if (value === undefined || value === null) return '';
    return String(value).trim();
}

function normalizeKey(value) {
    return clean(value).toLowerCase().replace(/\s+/g, ' ');
}

function normalizeDateOnly(value) {
    if (!value) return '';
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
    }
    const raw = clean(value);
    const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
    const local = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
    if (local) return `${local[3]}-${String(local[2]).padStart(2, '0')}-${String(local[1]).padStart(2, '0')}`;
    return raw;
}

function parseDateTime(value) {
    if (!value) return null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
    const raw = clean(value);
    const direct = new Date(raw);
    if (!Number.isNaN(direct.getTime())) return direct;

    const local = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:[ T,]+(\d{1,2}):(\d{2}))?/);
    if (local) {
        const iso = `${local[3]}-${String(local[2]).padStart(2, '0')}-${String(local[1]).padStart(2, '0')}T${String(local[4] || '00').padStart(2, '0')}:${String(local[5] || '00').padStart(2, '0')}:00+07:00`;
        const parsed = new Date(iso);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    return null;
}

function normalizeMonitorDate(value) {
    const match = clean(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return '';
    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10);
    const day = parseInt(match[3], 10);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (
        date.getUTCFullYear() !== year
        || date.getUTCMonth() !== month - 1
        || date.getUTCDate() !== day
    ) {
        return '';
    }
    return `${match[1]}-${match[2]}-${match[3]}`;
}

function addDaysToDateString(value, days) {
    const date = normalizeMonitorDate(value);
    if (!date) return '';
    const [year, month, day] = date.split('-').map(Number);
    const next = new Date(Date.UTC(year, month - 1, day + days));
    return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`;
}

function jakartaDayBoundary(value) {
    return `${value}T00:00:00.000+07:00`;
}

function combineEntryDateTime(entry = {}) {
    const candidates = [
        entry.created_at,
        entry.createdAt,
        entry.timestamp,
        entry.datetime,
        entry.date && entry.time ? `${entry.date} ${entry.time}` : null,
        entry.tanggal && entry.jam ? `${entry.tanggal} ${entry.jam}` : null,
        entry.date,
        entry.tanggal,
    ];
    for (const candidate of candidates) {
        const parsed = parseDateTime(candidate);
        if (parsed) return parsed;
    }
    return null;
}

function isoFromDate(date) {
    return date && !Number.isNaN(date.getTime()) ? date.toISOString() : null;
}

function classifyDoctor(author) {
    const value = normalizeKey(author);
    if (!value) return null;
    if (value.includes('dibya')) return { key: 'dibya', name: clean(author) };
    if (value.includes('latifa')) return { key: 'latifa', name: clean(author) };
    if (/\baji\b/.test(value) || value.includes('tri aji')) return { key: 'tri_aji', name: clean(author) };
    return null;
}

function firstText(...values) {
    for (const value of values) {
        if (Array.isArray(value)) {
            const joined = value.map(clean).filter(Boolean).join('\n');
            if (joined) return joined;
            continue;
        }
        if (value && typeof value === 'object') {
            const nested = firstText(value.raw, value.text, value.diagnosis, value.rencana, value.tindakan, value.instruksi, value.obat);
            if (nested) return nested;
            continue;
        }
        const text = clean(value);
        if (text) return text;
    }
    return '';
}

function flattenPlan(plan = {}) {
    if (!plan || typeof plan !== 'object') return clean(plan);
    return firstText(
        plan.raw,
        plan.planning,
        plan.rencana,
        plan.tindakan,
        plan.instruksi,
        plan.obat
    );
}

function extractCpptEntries(payload) {
    if (!payload) return [];
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload.entries)) return payload.entries;
    if (Array.isArray(payload.data)) return payload.data;
    if (Array.isArray(payload.cppt)) return payload.cppt;
    if (payload.result && Array.isArray(payload.result.entries)) return payload.result.entries;
    return [];
}

function normalizeCpptEntry(entry = {}) {
    const doctor = classifyDoctor(entry.author || entry.created_by || entry.creator || entry.doctor || entry.doctor_name);
    if (!doctor) return null;

    const structured = entry.structured || entry.cpptData || entry.data || {};
    const diagnosis = firstText(
        entry.assessment,
        entry.cpptAssessment,
        entry.diagnosis,
        structured.assessment?.diagnosis
    );
    const planning = firstText(
        entry.plan,
        entry.planning,
        entry.instruksiDokter,
        flattenPlan(structured.plan)
    );
    if (!diagnosis && !planning) return null;

    const created = combineEntryDateTime(entry);
    return {
        doctor_key: doctor.key,
        doctor_name: doctor.name,
        created_at: entry.created_at || entry.createdAt || isoFromDate(created),
        diagnosis,
        planning,
        sortTime: created ? created.getTime() : 0,
    };
}

function latestTargetDoctorCppt(payload) {
    return extractCpptEntries(payload)
        .map(normalizeCpptEntry)
        .filter(Boolean)
        .sort((first, second) => second.sortTime - first.sortTime)[0] || null;
}

function operationFromCache(payload) {
    const report = payload?.report || payload?.operation_report || payload?.raw_report || payload?.operation || payload || {};
    const operationName = firstText(report.tindakanOperasi, report.operationName, report.namaOperasi, report.operation_name);
    if (!operationName) return null;
    return {
        operation_name: operationName,
        operation_date: normalizeDateOnly(firstText(report.tanggalOperasi, report.operationDate, report.operation_date)),
        operation_time: firstText(report.waktuMulai, report.operationTime, report.operation_time),
        status: firstText(report.status, payload?.status) || null,
    };
}

function operationFromIndex(row) {
    if (!row) return null;
    return {
        operation_name: row.operation_name || null,
        operation_date: normalizeDateOnly(row.operation_date),
        operation_time: row.operation_time || null,
        status: row.status || null,
    };
}

function normalizeRooms(value) {
    const raw = Array.isArray(value) ? value : clean(value).split(',');
    const rooms = raw.map(clean).filter(Boolean);
    return rooms.length ? rooms : DEFAULT_ROOMS;
}

function extractRoom(patient) {
    const ward = clean(patient.ward || patient.room || patient.ruangan || patient.ruang || patient.location);
    if (ward.includes(' - ')) return ward.split(' - ')[0].trim();
    return ward;
}

function extractBed(patient) {
    return clean(patient.bed || patient.bedNo || patient.bed_no || patient.roomBed?.bed || patient.kelas);
}

function isMissingR2Object(error) {
    const message = clean(error?.message).toLowerCase();
    return error?.name === 'NoSuchKey' || error?.Code === 'NoSuchKey' || message.includes('no such key') || message.includes('missing ');
}

function isAccessDeniedR2Object(error) {
    const message = clean(error?.message).toLowerCase();
    return error?.name === 'AccessDenied' || error?.Code === 'AccessDenied' || message.includes('access denied');
}

class DocBoardGambiranMonitorService {
    constructor(deps = {}) {
        this.r2 = deps.r2 || r2Storage;
        this.db = deps.db || db;
        this.now = deps.now || (() => new Date());
        this.fetch = deps.fetch || globalThis.fetch;
        this.commBaseUrl = clean(deps.commBaseUrl || process.env.COMM_INTERNAL_BASE_URL || 'http://127.0.0.1:3002').replace(/\/+$/, '');
        this.cacheBucket = deps.cacheBucket
            || process.env.DOCBOARD_GAMBIRAN_MONITOR_R2_BUCKET
            || process.env.COMM_R2_BUCKET_NAME
            || DEFAULT_COMM_CACHE_BUCKET;
    }

    async safeGetJson(key, bucketName = this.cacheBucket) {
        try {
            return await this.r2.getJson(key, bucketName);
        } catch (error) {
            if (isMissingR2Object(error) || isAccessDeniedR2Object(error)) return null;
            throw error;
        }
    }

    async fetchCommJson(path) {
        if (!this.fetch || !this.commBaseUrl) return null;
        const url = `${this.commBaseUrl}${path}`;
        try {
            const response = await this.fetch(url);
            if (!response.ok) return null;
            return response.json();
        } catch {
            return null;
        }
    }

    async getActivePatientsPayload(monitorDate = '') {
        const r2Payload = await this.safeGetJson('active-patients/gambiran.json');
        if (r2Payload) return r2Payload;

        const dateParam = monitorDate ? `&date=${encodeURIComponent(monitorDate)}` : '';
        const payload = await this.fetchCommJson(`/api/simrs/patients/active-cached?facility=gambiran&monitor=1${dateParam}`);
        if (!payload) return null;
        const results = Array.isArray(payload.results)
            ? payload.results.filter(patient => normalizeKey(patient.facility || 'gambiran') === 'gambiran')
            : [];
        return { ...payload, results };
    }

    async getCaseCache(dataType, caseId) {
        const r2Payload = await this.safeGetJson(`${dataType}/gambiran/${caseId}.json`);
        if (r2Payload) return r2Payload;
        return this.fetchCommJson(`/api/simrs/${dataType}-cache/${encodeURIComponent(caseId)}?facility=gambiran`);
    }

    async getOperationIndex(caseIds) {
        if (!caseIds.length) return new Map();
        const [rows] = await this.db.query(
            `SELECT case_id, operation_name, operation_date, operation_time, status
               FROM operation_data_index
              WHERE facility = 'gambiran'
                AND case_id IN (?)
              ORDER BY operation_date DESC, operation_time DESC, id DESC`,
            [caseIds]
        );
        const map = new Map();
        for (const row of rows || []) {
            const key = clean(row.case_id).toLowerCase();
            if (key && !map.has(key)) map.set(key, row);
        }
        return map;
    }

    async getGambiranMonitor(params = {}) {
        const windowHours = Math.max(1, Math.min(parseInt(params.windowHours, 10) || DEFAULT_WINDOW_HOURS, 168));
        const rooms = normalizeRooms(params.rooms);
        const roomKeys = new Set(rooms.map(normalizeKey));
        const generatedAt = this.now();
        const monitorDate = normalizeMonitorDate(params.date);
        const nextMonitorDate = monitorDate ? addDaysToDateString(monitorDate, 1) : '';
        const windowStart = monitorDate
            ? parseDateTime(jakartaDayBoundary(monitorDate))
            : new Date(generatedAt.getTime() - (windowHours * 60 * 60 * 1000));
        const windowEnd = monitorDate
            ? parseDateTime(jakartaDayBoundary(nextMonitorDate))
            : new Date(generatedAt.getTime() + 60000);
        const warnings = [];

        const activePayload = await this.getActivePatientsPayload(monitorDate) || {};
        const activePatients = Array.isArray(activePayload)
            ? activePayload
            : (Array.isArray(activePayload.results)
                ? activePayload.results
                : (Array.isArray(activePayload.patients) ? activePayload.patients : []));

        let missingAdmissionAt = 0;
        const candidates = [];
        for (const patient of activePatients) {
            const room = extractRoom(patient);
            if (!roomKeys.has(normalizeKey(room))) continue;

            const admissionAt = clean(patient.admission_at || patient.admissionAt);
            if (!admissionAt) {
                missingAdmissionAt++;
                continue;
            }
            const admissionDate = parseDateTime(admissionAt);
            if (!admissionDate || admissionDate.getTime() < windowStart.getTime() || admissionDate.getTime() >= windowEnd.getTime()) continue;

            const caseId = clean(patient.caseId || patient.case_id || patient.kasusId || patient.kasus_id);
            if (!caseId) continue;
            candidates.push({ patient, room, admissionAt, caseId });
        }

        if (missingAdmissionAt > 0) {
            warnings.push('Cache pasien aktif belum memuat admission_at untuk sebagian pasien; refresh cache COMM diperlukan.');
        }

        const operationIndex = await this.getOperationIndex(candidates.map(item => item.caseId));
        const rows = [];
        for (const item of candidates) {
            const caseKey = item.caseId.toLowerCase();
            const [cpptPayload, operationPayload] = await Promise.all([
                this.getCaseCache('cppt', item.caseId),
                this.getCaseCache('operasi', item.caseId),
            ]);
            const indexOperation = operationFromIndex(operationIndex.get(caseKey));
            const cachedOperation = operationFromCache(operationPayload);
            const patient = item.patient;
            rows.push({
                case_id: item.caseId,
                mr_id: clean(patient.medicalRecordNo || patient.mr_id || patient.no_rm || patient.rm),
                patient_name: clean(patient.patientName || patient.patient_name || patient.name || patient.nama),
                room: item.room,
                bed: extractBed(patient),
                admission_at: item.admissionAt,
                cppt: latestTargetDoctorCppt(cpptPayload),
                operation: indexOperation || cachedOperation,
            });
        }

        rows.sort((first, second) => clean(second.admission_at).localeCompare(clean(first.admission_at)));

        return {
            generated_at: generatedAt.toISOString(),
            window_hours: windowHours,
            date: monitorDate || null,
            window_start: monitorDate ? jakartaDayBoundary(monitorDate) : windowStart.toISOString(),
            window_end: monitorDate ? jakartaDayBoundary(nextMonitorDate) : windowEnd.toISOString(),
            rooms,
            cached_at: activePayload.cachedAt || activePayload.cached_at || null,
            patients: rows,
            warnings,
        };
    }
}

const instance = new DocBoardGambiranMonitorService();

module.exports = instance;
module.exports.DocBoardGambiranMonitorService = DocBoardGambiranMonitorService;
module.exports._private = {
    classifyDoctor,
    latestTargetDoctorCppt,
    parseDateTime,
};

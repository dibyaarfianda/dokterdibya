const db = require('../db');
const { matchesAnyTerm, parseSearchTerms } = require('../utils/searchTerms');

const TARGET_DOCTOR_KEYS = ['dibya', 'tri_aji', 'latifa'];

function trim(value) {
    if (value === undefined || value === null) return '';
    return String(value).trim();
}

function normalizeDate(value) {
    if (!value) return null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
    }
    const raw = trim(value);
    const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) return `${match[1]}-${match[2]}-${match[3]}`;
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return null;
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function addDays(dateStr, days) {
    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    date.setUTCDate(date.getUTCDate() + days);
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function normalizeText(value) {
    return trim(value).toLowerCase().replace(/\s+/g, ' ');
}

function patientKey(row) {
    const mr = trim(row.mr_id);
    if (mr) return `mr:${mr.toLowerCase()}`;
    return `name:${normalizeText(row.patient_name)}`;
}

function daysBetween(firstDate, secondDate) {
    const first = Date.parse(`${firstDate}T00:00:00Z`);
    const second = Date.parse(`${secondDate}T00:00:00Z`);
    if (!Number.isFinite(first) || !Number.isFinite(second)) return null;
    return Math.round((second - first) / 86400000);
}

function mapRow(row) {
    return {
        ...row,
        operation_date: normalizeDate(row.operation_date),
        operation_time: row.operation_time ? String(row.operation_time).slice(0, 8) : null,
    };
}

function repeatSummary(row) {
    if (!row) return null;
    return {
        id: row.id,
        source_key: row.source_key,
        patient_name: row.patient_name,
        mr_id: row.mr_id,
        patient_age: row.patient_age,
        operation_date: row.operation_date,
        operation_time: row.operation_time,
        operation_name: row.operation_name,
        doctor_name: row.doctor_name,
        doctor_key: row.doctor_key,
        doctor_source: row.doctor_source,
    };
}

class OperationAuditService {
    constructor(pool = db) {
        this.db = pool;
    }

    normalizeParams(params = {}) {
        const today = normalizeDate(new Date());
        const defaultStart = addDays(today, -30);
        const start = normalizeDate(params.start) || defaultStart;
        const end = normalizeDate(params.end) || today;
        const page = Math.max(1, parseInt(params.page, 10) || 1);
        const limit = Math.min(Math.max(parseInt(params.limit, 10) || 50, 1), 100);
        const doctor = TARGET_DOCTOR_KEYS.includes(trim(params.doctor)) ? trim(params.doctor) : 'all';
        const repeat = ['yes', 'no'].includes(trim(params.repeat)) ? trim(params.repeat) : 'all';

        return {
            start,
            end,
            repeatEnd: addDays(end, 30),
            page,
            limit,
            doctor,
            operationTerms: parseSearchTerms(params.operation),
            repeat,
        };
    }

    decorateRepeats(rows) {
        const byPatient = new Map();
        rows.forEach((row) => {
            const key = patientKey(row);
            if (!byPatient.has(key)) byPatient.set(key, []);
            byPatient.get(key).push(row);
        });

        byPatient.forEach((items) => {
            items.sort((left, right) => {
                const dateCompare = String(left.operation_date || '').localeCompare(String(right.operation_date || ''));
                if (dateCompare !== 0) return dateCompare;
                return String(left.operation_time || '').localeCompare(String(right.operation_time || ''));
            });
        });

        return rows.map((row) => {
            const candidates = byPatient.get(patientKey(row)) || [];
            const repeatAfter = candidates.find((candidate) => {
                if (String(candidate.id) === String(row.id)) return false;
                const delta = daysBetween(row.operation_date, candidate.operation_date);
                return delta !== null && delta > 0 && delta <= 30;
            });

            return {
                ...row,
                repeat_within_30d: Boolean(repeatAfter),
                repeat_after: repeatSummary(repeatAfter),
            };
        });
    }

    summarize(rows) {
        const byDoctorMap = new Map();
        const byOperationMap = new Map();

        rows.forEach((row) => {
            const doctorKey = row.doctor_key || 'unknown';
            const doctorName = row.doctor_name || doctorKey;
            const doctorEntry = byDoctorMap.get(doctorKey) || { doctor_key: doctorKey, doctor_name: doctorName, count: 0 };
            doctorEntry.count += 1;
            byDoctorMap.set(doctorKey, doctorEntry);

            const operationName = row.operation_name || 'Operasi';
            byOperationMap.set(operationName, (byOperationMap.get(operationName) || 0) + 1);
        });

        return {
            total: rows.length,
            repeat_count: rows.filter(row => row.repeat_within_30d).length,
            by_doctor: Array.from(byDoctorMap.values()).sort((left, right) => right.count - left.count),
            by_operation: Array.from(byOperationMap.entries())
                .map(([operation_name, count]) => ({ operation_name, count }))
                .sort((left, right) => right.count - left.count)
                .slice(0, 20),
        };
    }

    async getGambiranAudit(params = {}) {
        const normalized = this.normalizeParams(params);
        const [rows] = await this.db.query(
            `SELECT id, facility, source_key, case_id, simrs_operasi_id, mr_id, patient_name,
                    patient_age, operation_date, operation_time, operation_name, diagnosis, status,
                    doctor_name, doctor_key, doctor_source, fetched_at, last_synced_at
               FROM operation_data_index
              WHERE facility = 'gambiran'
                AND doctor_key IN ('dibya','tri_aji','latifa')
                AND operation_date BETWEEN ? AND ?
              ORDER BY operation_date DESC, operation_time DESC, id DESC`,
            [normalized.start, normalized.repeatEnd]
        );

        const allRows = this.decorateRepeats(rows.map(mapRow));
        let baseRows = allRows.filter(row => row.operation_date >= normalized.start && row.operation_date <= normalized.end);

        if (normalized.doctor !== 'all') {
            baseRows = baseRows.filter(row => row.doctor_key === normalized.doctor);
        }
        if (normalized.operationTerms.length > 0) {
            baseRows = baseRows.filter(row => matchesAnyTerm(row.operation_name, normalized.operationTerms));
        }
        if (normalized.repeat === 'yes') {
            baseRows = baseRows.filter(row => row.repeat_within_30d);
        } else if (normalized.repeat === 'no') {
            baseRows = baseRows.filter(row => !row.repeat_within_30d);
        }

        const summary = this.summarize(baseRows);
        const offset = (normalized.page - 1) * normalized.limit;
        const pageRows = baseRows.slice(offset, offset + normalized.limit);

        return {
            summary,
            data: pageRows,
            pagination: {
                page: normalized.page,
                limit: normalized.limit,
                total: baseRows.length,
                has_more: offset + pageRows.length < baseRows.length,
            },
            filters: {
                start: normalized.start,
                end: normalized.end,
                doctor: normalized.doctor,
                operation: normalized.operation,
                repeat: normalized.repeat,
            },
        };
    }
}

module.exports = OperationAuditService;
module.exports.TARGET_DOCTOR_KEYS = TARGET_DOCTOR_KEYS;

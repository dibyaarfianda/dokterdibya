const db = require('../db');
const { matchesAnyTerm, parseSearchTerms } = require('../utils/searchTerms');
const ExcelJS = require('exceljs');

const TARGET_DOCTOR_KEYS = ['dibya', 'tri_aji', 'latifa'];
const DOCTOR_LABELS = {
    dibya: 'dr. Dibya',
    tri_aji: 'dr. Tri Aji',
    latifa: 'dr. Latifa',
};

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

function parseAgeYears(value) {
    const match = trim(value).match(/(\d+)/);
    return match ? parseInt(match[1], 10) : null;
}

function parseOptionalInt(value) {
    const raw = trim(value);
    if (!raw) return null;
    const parsed = parseInt(raw, 10);
    return Number.isInteger(parsed) ? parsed : null;
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
    const hasJourney = Boolean(row.journey_id);
    const doctorJourney = hasJourney ? {
        id: row.journey_id,
        transfer_status: row.journey_transfer_status || 'unknown',
        confidence: row.journey_confidence || 'unknown',
        origin_doctor: row.journey_origin_doctor_name ? {
            name: row.journey_origin_doctor_name,
            key: row.journey_origin_doctor_key || null,
            source: row.journey_origin_doctor_source || null,
        } : null,
        last_cppt_doctor: row.journey_last_cppt_doctor_name ? {
            name: row.journey_last_cppt_doctor_name,
            key: row.journey_last_cppt_doctor_key || null,
            source: row.journey_last_cppt_doctor_source || null,
        } : null,
        procedure_doctor: row.journey_procedure_doctor_name ? {
            name: row.journey_procedure_doctor_name,
            key: row.journey_procedure_doctor_key || null,
            source: row.journey_procedure_doctor_source || null,
        } : null,
        final_doctor: row.journey_final_doctor_name ? {
            name: row.journey_final_doctor_name,
            key: row.journey_final_doctor_key || null,
            source: row.journey_final_doctor_source || null,
        } : null,
        transition_count: Number(row.journey_transition_count || 0),
        checked_at: row.journey_checked_at || null,
        error_message: row.journey_error_message || null,
        analysis_status: row.journey_error_message ? 'failed' : 'ready',
    } : null;
    return {
        ...row,
        operation_date: normalizeDate(row.operation_date),
        operation_time: row.operation_time ? String(row.operation_time).slice(0, 8) : null,
        doctor_journey: doctorJourney,
        doctor_journey_status: doctorJourney?.analysis_status || 'not_analyzed',
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

function formatDoctorLabel(key, name) {
    return DOCTOR_LABELS[key] || name || key || '-';
}

function formatRepeatValue(row) {
    return row.repeat_within_30d ? 'Ya' : 'Tidak';
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
        const transfer = ['yes', 'no', 'unknown'].includes(trim(params.transfer)) ? trim(params.transfer) : 'all';
        const doctorSource = ['operator', 'dpjp', 'doctor'].includes(trim(params.doctorSource || params.doctor_source))
            ? trim(params.doctorSource || params.doctor_source)
            : 'all';
        const sort = [
            'date_desc',
            'date_asc',
            'patient_asc',
            'doctor_asc',
            'operation_asc',
            'repeat_desc',
        ].includes(trim(params.sort)) ? trim(params.sort) : 'date_desc';

        return {
            start,
            end,
            repeatEnd: addDays(end, 30),
            page,
            limit,
            doctor,
            operationTerms: parseSearchTerms(params.operation),
            operation: trim(params.operation),
            patientTerms: parseSearchTerms(params.patient),
            patient: trim(params.patient),
            mr: trim(params.mr || params.mr_id),
            diagnosisTerms: parseSearchTerms(params.diagnosis),
            diagnosis: trim(params.diagnosis),
            status: trim(params.status),
            doctorSource,
            ageMin: parseOptionalInt(params.ageMin || params.age_min),
            ageMax: parseOptionalInt(params.ageMax || params.age_max),
            sort,
            repeat,
            transfer,
            procedureDoctorTerms: parseSearchTerms(params.procedureDoctor || params.procedure_doctor),
            procedureDoctor: trim(params.procedureDoctor || params.procedure_doctor),
            finalDoctorTerms: parseSearchTerms(params.finalDoctor || params.final_doctor),
            finalDoctor: trim(params.finalDoctor || params.final_doctor),
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
            transfer_count: rows.filter(row => row.doctor_journey?.transfer_status === 'yes').length,
            no_transfer_count: rows.filter(row => row.doctor_journey?.transfer_status === 'no').length,
            unknown_transfer_count: rows.filter(row => !row.doctor_journey || row.doctor_journey.transfer_status === 'unknown').length,
            analyzed_count: rows.filter(row => row.doctor_journey_status === 'ready').length,
            failed_analysis_count: rows.filter(row => row.doctor_journey_status === 'failed').length,
            by_doctor: Array.from(byDoctorMap.values()).sort((left, right) => right.count - left.count),
            by_operation: Array.from(byOperationMap.entries())
                .map(([operation_name, count]) => ({ operation_name, count }))
                .sort((left, right) => right.count - left.count)
                .slice(0, 20),
        };
    }

    sortRows(rows, sort) {
        const sorted = [...rows];
        const byDate = (left, right) => {
            const dateCompare = String(left.operation_date || '').localeCompare(String(right.operation_date || ''));
            if (dateCompare !== 0) return dateCompare;
            const timeCompare = String(left.operation_time || '').localeCompare(String(right.operation_time || ''));
            if (timeCompare !== 0) return timeCompare;
            return Number(left.id || 0) - Number(right.id || 0);
        };

        sorted.sort((left, right) => {
            if (sort === 'date_asc') return byDate(left, right);
            if (sort === 'patient_asc') return normalizeText(left.patient_name).localeCompare(normalizeText(right.patient_name)) || byDate(left, right);
            if (sort === 'doctor_asc') return normalizeText(formatDoctorLabel(left.doctor_key, left.doctor_name)).localeCompare(normalizeText(formatDoctorLabel(right.doctor_key, right.doctor_name))) || byDate(left, right);
            if (sort === 'operation_asc') return normalizeText(left.operation_name).localeCompare(normalizeText(right.operation_name)) || byDate(left, right);
            if (sort === 'repeat_desc') return Number(right.repeat_within_30d) - Number(left.repeat_within_30d) || byDate(right, left);
            return 0;
        });

        return sorted;
    }

    applyFilters(rows, normalized) {
        let baseRows = rows.filter(row => row.operation_date >= normalized.start && row.operation_date <= normalized.end);

        if (normalized.doctor !== 'all') {
            baseRows = baseRows.filter(row => row.doctor_key === normalized.doctor);
        }
        if (normalized.operationTerms.length > 0) {
            baseRows = baseRows.filter(row => matchesAnyTerm(row.operation_name, normalized.operationTerms));
        }
        if (normalized.patientTerms.length > 0) {
            baseRows = baseRows.filter(row => matchesAnyTerm(row.patient_name, normalized.patientTerms));
        }
        if (normalized.mr) {
            baseRows = baseRows.filter(row => normalizeText(row.mr_id).includes(normalizeText(normalized.mr)));
        }
        if (normalized.diagnosisTerms.length > 0) {
            baseRows = baseRows.filter(row => matchesAnyTerm(row.diagnosis, normalized.diagnosisTerms));
        }
        if (normalized.status) {
            baseRows = baseRows.filter(row => normalizeText(row.status).includes(normalizeText(normalized.status)));
        }
        if (normalized.doctorSource !== 'all') {
            baseRows = baseRows.filter(row => row.doctor_source === normalized.doctorSource);
        }
        if (normalized.ageMin !== null || normalized.ageMax !== null) {
            baseRows = baseRows.filter((row) => {
                const age = parseAgeYears(row.patient_age);
                if (age === null) return false;
                if (normalized.ageMin !== null && age < normalized.ageMin) return false;
                if (normalized.ageMax !== null && age > normalized.ageMax) return false;
                return true;
            });
        }
        if (normalized.repeat === 'yes') {
            baseRows = baseRows.filter(row => row.repeat_within_30d);
        } else if (normalized.repeat === 'no') {
            baseRows = baseRows.filter(row => !row.repeat_within_30d);
        }
        if (normalized.transfer !== 'all') {
            baseRows = baseRows.filter(row => (row.doctor_journey?.transfer_status || 'unknown') === normalized.transfer);
        }
        if (normalized.procedureDoctorTerms.length > 0) {
            baseRows = baseRows.filter(row => matchesAnyTerm(row.doctor_journey?.procedure_doctor?.name, normalized.procedureDoctorTerms));
        }
        if (normalized.finalDoctorTerms.length > 0) {
            baseRows = baseRows.filter(row => matchesAnyTerm(row.doctor_journey?.final_doctor?.name, normalized.finalDoctorTerms));
        }

        return this.sortRows(baseRows, normalized.sort);
    }

    async buildGambiranAuditRows(params = {}) {
        const normalized = this.normalizeParams(params);
        const [rows] = await this.db.query(
            `SELECT operation.id, operation.facility, operation.source_key, operation.case_id,
                    operation.simrs_operasi_id, operation.mr_id, operation.patient_name,
                    operation.patient_age, operation.operation_date, operation.operation_time,
                    operation.operation_name, operation.diagnosis, operation.status,
                    operation.doctor_name, operation.doctor_key, operation.doctor_source,
                    operation.fetched_at, operation.last_synced_at,
                    journey.id AS journey_id,
                    journey.transfer_status AS journey_transfer_status,
                    journey.confidence AS journey_confidence,
                    journey.origin_doctor_name AS journey_origin_doctor_name,
                    journey.origin_doctor_key AS journey_origin_doctor_key,
                    journey.origin_doctor_source AS journey_origin_doctor_source,
                    journey.last_cppt_doctor_name AS journey_last_cppt_doctor_name,
                    journey.last_cppt_doctor_key AS journey_last_cppt_doctor_key,
                    journey.last_cppt_doctor_source AS journey_last_cppt_doctor_source,
                    journey.procedure_doctor_name AS journey_procedure_doctor_name,
                    journey.procedure_doctor_key AS journey_procedure_doctor_key,
                    journey.procedure_doctor_source AS journey_procedure_doctor_source,
                    journey.final_doctor_name AS journey_final_doctor_name,
                    journey.final_doctor_key AS journey_final_doctor_key,
                    journey.final_doctor_source AS journey_final_doctor_source,
                    journey.transition_count AS journey_transition_count,
                    journey.checked_at AS journey_checked_at,
                    journey.error_message AS journey_error_message
               FROM operation_data_index operation
               LEFT JOIN operation_doctor_journeys journey
                 ON journey.facility = operation.facility
                AND journey.simrs_operasi_id = operation.simrs_operasi_id
              WHERE operation.facility = 'gambiran'
                AND operation.doctor_key IN ('dibya','tri_aji','latifa')
                AND operation.source_key = CONCAT('gambiran:pendaftaran:', operation.simrs_operasi_id)
                AND operation.operation_date BETWEEN ? AND ?
              ORDER BY operation.operation_date DESC, operation.operation_time DESC, operation.id DESC`,
            [normalized.start, normalized.repeatEnd]
        );

        const allRows = this.decorateRepeats(rows.map(mapRow));
        const baseRows = this.applyFilters(allRows, normalized);
        const summary = this.summarize(baseRows);

        return { normalized, summary, rows: baseRows };
    }

    async getGambiranAudit(params = {}) {
        const { normalized, summary, rows: baseRows } = await this.buildGambiranAuditRows(params);

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
                patient: normalized.patient,
                mr: normalized.mr,
                diagnosis: normalized.diagnosis,
                status: normalized.status,
                doctorSource: normalized.doctorSource,
                ageMin: normalized.ageMin,
                ageMax: normalized.ageMax,
                sort: normalized.sort,
                repeat: normalized.repeat,
                transfer: normalized.transfer,
                procedureDoctor: normalized.procedureDoctor,
                finalDoctor: normalized.finalDoctor,
            },
        };
    }

    async buildGambiranAuditWorkbook(params = {}) {
        const { normalized, summary, rows } = await this.buildGambiranAuditRows(params);
        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'DokterDibya DocBoard';
        workbook.created = new Date();

        const title = 'Audit Operasi Gambiran';
        const summarySheet = workbook.addWorksheet('Ringkasan');
        summarySheet.columns = [
            { header: 'Item', key: 'item', width: 26 },
            { header: 'Nilai', key: 'value', width: 48 },
        ];
        summarySheet.addRows([
            { item: 'Judul', value: title },
            { item: 'Periode', value: `${normalized.start} s/d ${normalized.end}` },
            { item: 'Dokter', value: normalized.doctor === 'all' ? 'Semua Dokter' : formatDoctorLabel(normalized.doctor) },
            { item: 'Jenis Operasi', value: normalized.operation || 'Semua' },
            { item: 'Pasien', value: normalized.patient || 'Semua' },
            { item: 'No. Rekam Medis', value: normalized.mr || 'Semua' },
            { item: 'Diagnosis', value: normalized.diagnosis || 'Semua' },
            { item: 'Status', value: normalized.status || 'Semua' },
            { item: 'Sumber Dokter', value: normalized.doctorSource === 'all' ? 'Semua' : normalized.doctorSource },
            { item: 'Umur', value: `${normalized.ageMin ?? '-'} s/d ${normalized.ageMax ?? '-'}` },
            { item: 'Operasi Ulang 30 Hari', value: normalized.repeat === 'all' ? 'Semua' : (normalized.repeat === 'yes' ? 'Ya' : 'Tidak') },
            { item: 'Pindah Dokter', value: normalized.transfer === 'all' ? 'Semua' : normalized.transfer },
            { item: 'Operator Tindakan', value: normalized.procedureDoctor || 'Semua' },
            { item: 'Dokter Akhir', value: normalized.finalDoctor || 'Semua' },
            { item: 'Total Data', value: summary.total },
            { item: 'Total Ulang 30 Hari', value: summary.repeat_count },
            { item: 'Total Pindah Dokter', value: summary.transfer_count },
        ]);
        this.styleWorksheet(summarySheet);

        const doctorSheet = workbook.addWorksheet('Per Dokter');
        doctorSheet.columns = [
            { header: 'Dokter', key: 'doctor', width: 34 },
            { header: 'Jumlah', key: 'count', width: 14 },
        ];
        doctorSheet.addRows(summary.by_doctor.map(item => ({
            doctor: formatDoctorLabel(item.doctor_key, item.doctor_name),
            count: item.count,
        })));
        this.styleWorksheet(doctorSheet);

        const operationSheet = workbook.addWorksheet('Per Operasi');
        operationSheet.columns = [
            { header: 'Jenis Operasi', key: 'operation', width: 46 },
            { header: 'Jumlah', key: 'count', width: 14 },
        ];
        operationSheet.addRows(summary.by_operation.map(item => ({
            operation: item.operation_name,
            count: item.count,
        })));
        this.styleWorksheet(operationSheet);

        const dataSheet = workbook.addWorksheet('Data Audit');
        dataSheet.columns = [
            { header: 'Tanggal Operasi', key: 'operation_date', width: 16 },
            { header: 'Jam', key: 'operation_time', width: 10 },
            { header: 'Nama Pasien', key: 'patient_name', width: 30 },
            { header: 'No. Rekam Medis', key: 'mr_id', width: 18 },
            { header: 'Umur', key: 'patient_age', width: 12 },
            { header: 'Dokter', key: 'doctor', width: 28 },
            { header: 'Sumber Dokter', key: 'doctor_source', width: 15 },
            { header: 'Dokter Awal', key: 'origin_doctor', width: 30 },
            { header: 'Pindah Dokter', key: 'transfer', width: 18 },
            { header: 'CPPT Terakhir', key: 'last_cppt_doctor', width: 30 },
            { header: 'Operator Tindakan', key: 'procedure_doctor', width: 30 },
            { header: 'Dokter Akhir', key: 'final_doctor', width: 30 },
            { header: 'Keyakinan', key: 'journey_confidence', width: 16 },
            { header: 'Status Analisis', key: 'journey_status', width: 20 },
            { header: 'Jenis Operasi', key: 'operation_name', width: 38 },
            { header: 'Diagnosis', key: 'diagnosis', width: 38 },
            { header: 'Status', key: 'status', width: 16 },
            { header: 'Operasi Ulang 30 Hari', key: 'repeat', width: 22 },
            { header: 'Tanggal Operasi Berikutnya', key: 'repeat_date', width: 24 },
            { header: 'Operasi Berikutnya', key: 'repeat_operation', width: 38 },
            { header: 'Source Key', key: 'source_key', width: 30 },
        ];
        dataSheet.addRows(rows.map(row => ({
            operation_date: row.operation_date,
            operation_time: row.operation_time ? String(row.operation_time).slice(0, 5) : '',
            patient_name: row.patient_name || '',
            mr_id: row.mr_id || '',
            patient_age: row.patient_age || '',
            doctor: formatDoctorLabel(row.doctor_key, row.doctor_name),
            doctor_source: row.doctor_source || '',
            origin_doctor: row.doctor_journey?.origin_doctor?.name || '',
            transfer: row.doctor_journey?.transfer_status === 'yes'
                ? 'Ya'
                : (row.doctor_journey?.transfer_status === 'no' ? 'Tidak' : 'Belum pasti'),
            last_cppt_doctor: row.doctor_journey?.last_cppt_doctor?.name || '',
            procedure_doctor: row.doctor_journey?.procedure_doctor?.name || '',
            final_doctor: row.doctor_journey?.final_doctor?.name || '',
            journey_confidence: row.doctor_journey?.confidence === 'verified'
                ? 'Terverifikasi'
                : (row.doctor_journey?.confidence === 'supported' ? 'Didukung' : 'Belum pasti'),
            journey_status: row.doctor_journey_status === 'ready'
                ? 'Selesai'
                : (row.doctor_journey_status === 'failed' ? 'Gagal' : 'Belum dianalisis'),
            operation_name: row.operation_name || '',
            diagnosis: row.diagnosis || '',
            status: row.status || '',
            repeat: formatRepeatValue(row),
            repeat_date: row.repeat_after?.operation_date || '',
            repeat_operation: row.repeat_after?.operation_name || '',
            source_key: row.source_key || '',
        })));
        this.styleWorksheet(dataSheet, { freezeHeader: true });

        const buffer = await workbook.xlsx.writeBuffer();
        return {
            buffer: Buffer.from(buffer),
            filename: `audit-gambiran-${normalized.start}-${normalized.end}.xlsx`,
            rowCount: rows.length,
        };
    }

    styleWorksheet(worksheet, options = {}) {
        const header = worksheet.getRow(1);
        header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } };
        header.alignment = { vertical: 'middle', wrapText: true };
        worksheet.eachRow((row, rowNumber) => {
            row.eachCell((cell) => {
                cell.border = {
                    top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                    left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                    bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                    right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                };
                cell.alignment = { vertical: 'top', wrapText: true };
            });
            if (rowNumber > 1 && rowNumber % 2 === 0) {
                row.eachCell((cell) => {
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } };
                });
            }
        });
        if (options.freezeHeader) {
            worksheet.views = [{ state: 'frozen', ySplit: 1 }];
            worksheet.autoFilter = {
                from: { row: 1, column: 1 },
                to: { row: 1, column: worksheet.columnCount },
            };
        }
    }
}

module.exports = OperationAuditService;
module.exports.TARGET_DOCTOR_KEYS = TARGET_DOCTOR_KEYS;

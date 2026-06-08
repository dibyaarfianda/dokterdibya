const crypto = require('crypto');
const logger = require('../utils/logger');

const SOURCE_SYSTEM = 'COMM';
const MANUAL_CREATED_BY = 'COMM manual';

const LOCATION_MAP = {
    melinda: 'rsia_melinda',
    rsia_melinda: 'rsia_melinda',
    gambiran: 'rsud_gambiran',
    rsud_gambiran: 'rsud_gambiran',
    bhayangkara: 'rs_bhayangkara',
    rs_bhayangkara: 'rs_bhayangkara',
    klinik_private: 'klinik_private'
};

function normalizeString(value) {
    if (value === undefined || value === null) return '';
    return String(value).trim();
}

function nullableString(value) {
    const normalized = normalizeString(value);
    return normalized || null;
}

function normalizeDate(value) {
    const raw = normalizeString(value);
    if (!raw) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

    const local = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (local) {
        return `${local[3]}-${String(local[2]).padStart(2, '0')}-${String(local[1]).padStart(2, '0')}`;
    }

    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return '';
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function normalizeTime(value) {
    const raw = normalizeString(value);
    if (!raw) return null;
    const match = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (!match) return null;
    return `${String(match[1]).padStart(2, '0')}:${match[2]}:00`;
}

function normalizeLocation(value) {
    const key = normalizeString(value).toLowerCase();
    return LOCATION_MAP[key] || '';
}

function cleanLike(value) {
    return normalizeString(value).replace(/[\\%_]/g, '\\$&');
}

function compactSourcePart(value) {
    return normalizeString(value)
        .replace(/\s+/g, '_')
        .replace(/[:|]/g, '-')
        .slice(0, 80);
}

function buildIdempotencyKey(sourceKey) {
    const digest = crypto.createHash('sha1').update(sourceKey).digest('hex');
    return `COMM_MANUAL:${digest.slice(0, 52)}`;
}

class CommScheduleIntentService {
    constructor({ db, surgeryService, pushService } = {}) {
        this.db = db || require('../db');
        this.surgeryService = surgeryService || require('./SurgeryService');
        this.pushService = pushService || require('./DocBoardPushService');
    }

    normalizeIntent(payload = {}) {
        const facility = normalizeLocation(payload.facility || payload.location);
        const scheduleDate = normalizeDate(payload.schedule_date || payload.operation_date);
        const scheduleTime = normalizeTime(payload.schedule_time || payload.operation_time);
        const operationName = normalizeString(payload.operation_name || payload.tindakan);
        const caseId = normalizeString(payload.case_id || payload.caseId);
        const hospitalMrId = normalizeString(payload.hospital_mr_id || payload.no_rm || payload.noRm || payload.mr_id);

        return {
            facility,
            caseId,
            patientName: normalizeString(payload.patient_name || payload.patientName),
            hospitalMrId,
            patientBirthDate: normalizeDate(payload.patient_birth_date || payload.birth_date),
            scheduleDate,
            scheduleTime,
            operationName,
            diagnosis: normalizeString(payload.diagnosis),
            simrsOperasiId: nullableString(payload.simrs_operasi_id || payload.operasi_id || payload.operasiId),
            notes: nullableString(payload.notes),
            sourceKey: this.buildSourceKey({
                facility,
                caseId,
                scheduleDate,
                scheduleTime,
                operationName
            })
        };
    }

    buildSourceKey(item) {
        return [
            'COMM_MANUAL',
            item.facility || 'unknown',
            compactSourcePart(item.caseId),
            item.scheduleDate || 'no-date',
            item.scheduleTime ? item.scheduleTime.substring(0, 5) : 'no-time',
            compactSourcePart(item.operationName)
        ].join(':');
    }

    validateIntent(item) {
        const missing = [];
        if (!item.facility) missing.push('facility');
        if (!item.caseId) missing.push('case_id');
        if (!item.patientName) missing.push('patient_name');
        if (!item.hospitalMrId) missing.push('hospital_mr_id');
        if (!item.scheduleDate) missing.push('schedule_date');
        if (!item.operationName) missing.push('operation_name');

        if (missing.length) {
            throw new Error(`Missing required fields: ${missing.join(', ')}`);
        }
    }

    async findExistingBySourceKey(sourceKey) {
        const [rows] = await this.db.query(
            `SELECT surgery_id FROM surgery_external_refs
              WHERE source_system = ? AND source_key = ?
              LIMIT 1`,
            [SOURCE_SYSTEM, sourceKey]
        );
        return rows[0] || null;
    }

    async resolvePatientId(item) {
        const [mapped] = await this.db.query(
            `SELECT patient_id FROM patient_external_ids
              WHERE source_system = ? AND facility = ? AND hospital_mr_id = ?
              LIMIT 1`,
            [SOURCE_SYSTEM, item.facility, item.hospitalMrId]
        );

        if (mapped.length) return mapped[0].patient_id;
        if (!item.patientBirthDate) return null;

        const [patients] = await this.db.query(
            `SELECT id, full_name, birth_date
               FROM patients
              WHERE LOWER(full_name) = LOWER(?) AND DATE(birth_date) = ?
              LIMIT 2`,
            [item.patientName, item.patientBirthDate]
        );

        if (patients.length !== 1) return null;

        const patientId = patients[0].id;
        await this.db.query(
            `INSERT INTO patient_external_ids
               (patient_id, facility, hospital_mr_id, patient_name, birth_date, source_system)
             VALUES (?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
               patient_id = VALUES(patient_id),
               patient_name = VALUES(patient_name),
               birth_date = VALUES(birth_date),
               updated_at = CURRENT_TIMESTAMP`,
            [patientId, item.facility, item.hospitalMrId, item.patientName, item.patientBirthDate, SOURCE_SYSTEM]
        );

        return patientId;
    }

    async resolveOperationType(operationName) {
        const name = normalizeString(operationName);
        const [exactRows] = await this.db.query(
            `SELECT id, code, name, name_id
               FROM surgery_operation_types
              WHERE is_active = 1
                AND (LOWER(code) = LOWER(?) OR LOWER(name) = LOWER(?) OR LOWER(name_id) = LOWER(?))
              ORDER BY sort_order ASC, id ASC
              LIMIT 1`,
            [name, name, name]
        );

        if (exactRows.length) {
            return { operationTypeId: exactRows[0].id, operationTypeOther: null };
        }

        const [fuzzyRows] = await this.db.query(
            `SELECT id, code, name, name_id
               FROM surgery_operation_types
              WHERE is_active = 1
                AND (LOWER(code) LIKE LOWER(?) OR LOWER(name) LIKE LOWER(?) OR LOWER(name_id) LIKE LOWER(?))
              ORDER BY sort_order ASC, id ASC
              LIMIT 1`,
            [`%${cleanLike(name)}%`, `%${cleanLike(name)}%`, `%${cleanLike(name)}%`]
        );

        if (fuzzyRows.length) {
            return { operationTypeId: fuzzyRows[0].id, operationTypeOther: null };
        }

        const [fallbackRows] = await this.db.query(
            `SELECT id FROM surgery_operation_types
              WHERE is_active = 1 AND code = 'OTHER-OP'
              LIMIT 1`
        );

        if (fallbackRows.length) {
            return { operationTypeId: fallbackRows[0].id, operationTypeOther: name };
        }

        const [firstRows] = await this.db.query(
            `SELECT id FROM surgery_operation_types
              WHERE is_active = 1
              ORDER BY sort_order ASC, id ASC
              LIMIT 1`
        );

        if (!firstRows.length) {
            throw new Error('No active surgery operation types available');
        }

        return { operationTypeId: firstRows[0].id, operationTypeOther: name };
    }

    async upsertExternalRef(surgeryId, item) {
        await this.db.query(
            `INSERT INTO surgery_external_refs
               (surgery_id, source_system, facility, source_key, case_id, simrs_operasi_id, mr_id, sent_fields, last_synced_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
             ON DUPLICATE KEY UPDATE
               surgery_id = VALUES(surgery_id),
               case_id = VALUES(case_id),
               simrs_operasi_id = VALUES(simrs_operasi_id),
               mr_id = VALUES(mr_id),
               sent_fields = VALUES(sent_fields),
               last_synced_at = NOW()`,
            [
                surgeryId,
                SOURCE_SYSTEM,
                item.facility,
                item.sourceKey,
                item.caseId,
                item.simrsOperasiId,
                item.hospitalMrId,
                JSON.stringify({
                    manual_schedule_intent: true,
                    hospital_mr_id: true,
                    schedule_date: true,
                    schedule_time: Boolean(item.scheduleTime),
                    operation_name: true
                })
            ]
        );
    }

    async createFromIntent(payload, userId = MANUAL_CREATED_BY) {
        const item = this.normalizeIntent(payload);
        this.validateIntent(item);

        const existing = await this.findExistingBySourceKey(item.sourceKey);
        if (existing) {
            const surgery = await this.surgeryService.getSurgeryById(existing.surgery_id);
            return { action: 'existing', source_key: item.sourceKey, surgery };
        }

        const patientId = await this.resolvePatientId(item);
        const operationType = await this.resolveOperationType(item.operationName);

        const surgery = await this.surgeryService.createSurgery({
            patient_name: item.patientName,
            patient_age: null,
            patient_id: patientId,
            mr_id: null,
            diagnosis: item.diagnosis || item.operationName,
            operation_type_id: operationType.operationTypeId,
            operation_type_other: operationType.operationTypeOther,
            location: item.facility,
            surgery_date: item.scheduleDate,
            surgery_time: item.scheduleTime,
            special_notes: item.notes,
            idempotency_key: buildIdempotencyKey(item.sourceKey)
        }, userId);

        await this.upsertExternalRef(surgery.id, item);

        Promise.resolve(this.pushService.sendNewBookingNotification(surgery)).catch((error) => {
            logger.error('COMM schedule intent push notification failed:', error.message);
        });

        logger.info('COMM schedule intent created surgery', {
            surgeryId: surgery.id,
            sourceKey: item.sourceKey,
            facility: item.facility
        });

        return { action: 'created', source_key: item.sourceKey, surgery };
    }
}

module.exports = CommScheduleIntentService;

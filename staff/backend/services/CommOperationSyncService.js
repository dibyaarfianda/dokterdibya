const db = require('../db');
const logger = require('../utils/logger');

const SOURCE_SYSTEM = 'COMM';

const LOCATION_MAP = {
    melinda: 'rsia_melinda',
    rsia_melinda: 'rsia_melinda',
    gambiran: 'rsud_gambiran',
    rsud_gambiran: 'rsud_gambiran',
    bhayangkara: 'rs_bhayangkara',
    rs_bhayangkara: 'rs_bhayangkara',
    klinik_private: 'klinik_private'
};

const STATUS_MAP = {
    scheduled: 'planned',
    planned: 'planned',
    booked: 'planned',
    confirmed: 'confirmed',
    done: 'completed',
    completed: 'completed',
    cancelled: 'cancelled',
    canceled: 'cancelled',
    postponed: 'postponed',
    delayed: 'postponed'
};

function normalizeString(value) {
    if (value === undefined || value === null) return '';
    return String(value).trim();
}

function normalizeNullableString(value) {
    const normalized = normalizeString(value);
    return normalized || null;
}

function normalizeDate(value) {
    const raw = normalizeString(value);
    if (!raw) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
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

function normalizeStatus(value) {
    const key = normalizeString(value).toLowerCase();
    return STATUS_MAP[key] || null;
}

function getSentFields(item) {
    const sent = {};
    [
        'source_key',
        'case_id',
        'simrs_operasi_id',
        'mr_id',
        'patient_name',
        'diagnosis',
        'operation_name',
        'operation_date',
        'operation_time',
        'location',
        'raw_status',
        'notes'
    ].forEach((key) => {
        if (item[key] !== undefined && item[key] !== null && String(item[key]).trim() !== '') {
            sent[key] = true;
        }
    });
    return sent;
}

function cleanLike(value) {
    return normalizeString(value).replace(/[\\%_]/g, '\\$&');
}

class CommOperationSyncService {
    constructor(pool = db) {
        this.db = pool;
    }

    async getFallbackOperationTypeId() {
        const [rows] = await this.db.query(
            `SELECT id FROM surgery_operation_types
             WHERE is_active = 1
             ORDER BY sort_order ASC, id ASC
             LIMIT 1`
        );

        if (!rows.length) {
            throw new Error('No active surgery operation types available');
        }

        return rows[0].id;
    }

    async resolveOperationType(operationName) {
        const fallbackId = await this.getFallbackOperationTypeId();
        const name = normalizeString(operationName);
        if (!name) {
            return { operationTypeId: fallbackId, operationTypeOther: null, hasOperationName: false };
        }

        const [exactRows] = await this.db.query(
            `SELECT id, name, name_id, code
               FROM surgery_operation_types
              WHERE is_active = 1
                AND (LOWER(name) = LOWER(?) OR LOWER(name_id) = LOWER(?) OR LOWER(code) = LOWER(?))
              LIMIT 1`,
            [name, name, name]
        );

        if (exactRows.length) {
            return { operationTypeId: exactRows[0].id, operationTypeOther: null, hasOperationName: true };
        }

        const [fuzzyRows] = await this.db.query(
            `SELECT id, name, name_id, code
               FROM surgery_operation_types
              WHERE is_active = 1
                AND (LOWER(name) LIKE LOWER(?) OR LOWER(name_id) LIKE LOWER(?) OR LOWER(code) LIKE LOWER(?))
              ORDER BY sort_order ASC, id ASC
              LIMIT 1`,
            [`%${cleanLike(name)}%`, `%${cleanLike(name)}%`, `%${cleanLike(name)}%`]
        );

        if (fuzzyRows.length) {
            return { operationTypeId: fuzzyRows[0].id, operationTypeOther: null, hasOperationName: true };
        }

        return { operationTypeId: fallbackId, operationTypeOther: name, hasOperationName: true };
    }

    normalizeItem(item, batch) {
        const location = normalizeLocation(item.location || batch.facility);
        const operationDate = normalizeDate(item.operation_date);
        const patientName = normalizeString(item.patient_name);
        const sourceKey = normalizeString(item.source_key);

        return {
            sourceKey,
            caseId: normalizeNullableString(item.case_id),
            simrsOperasiId: normalizeNullableString(item.simrs_operasi_id),
            mrId: normalizeNullableString(item.mr_id),
            patientName,
            diagnosis: normalizeString(item.diagnosis),
            operationName: normalizeString(item.operation_name),
            operationDate,
            operationTime: normalizeTime(item.operation_time),
            location,
            status: normalizeStatus(item.raw_status),
            notes: normalizeNullableString(item.notes),
            sentFields: getSentFields(item)
        };
    }

    validateItem(item) {
        const missing = [];
        if (!item.sourceKey) missing.push('source_key');
        if (!item.patientName) missing.push('patient_name');
        if (!item.operationDate) missing.push('operation_date');
        if (!item.location && !item.facility) missing.push('location');
        return missing;
    }

    async findMatch(item) {
        const matches = [];

        const addRows = async (strength, query, params) => {
            const [rows] = await this.db.query(query, params);
            rows.forEach((row) => {
                if (!matches.some((entry) => String(entry.surgery_id) === String(row.surgery_id))) {
                    matches.push({ ...row, strength });
                }
            });
        };

        await addRows(
            'source_key',
            `SELECT surgery_id FROM surgery_external_refs
              WHERE source_system = ? AND source_key = ?`,
            [SOURCE_SYSTEM, item.sourceKey]
        );

        if (!matches.length && item.simrsOperasiId) {
            await addRows(
                'simrs_operasi_id',
                `SELECT surgery_id FROM surgery_external_refs
                  WHERE source_system = ? AND facility = ? AND simrs_operasi_id = ?`,
                [SOURCE_SYSTEM, item.location, item.simrsOperasiId]
            );
        }

        if (!matches.length && item.caseId) {
            await addRows(
                'case_date',
                `SELECT r.surgery_id
                   FROM surgery_external_refs r
                   JOIN surgery_schedules s ON s.id = r.surgery_id
                  WHERE r.source_system = ?
                    AND r.facility = ?
                    AND r.case_id = ?
                    AND s.surgery_date = ?`,
                [SOURCE_SYSTEM, item.location, item.caseId, item.operationDate]
            );
        }

        if (!matches.length && item.mrId && item.operationName) {
            await addRows(
                'mr_date_operation',
                `SELECT s.id AS surgery_id
                   FROM surgery_schedules s
                  WHERE s.mr_id = ?
                    AND s.surgery_date = ?
                    AND s.location = ?
                    AND (LOWER(s.operation_type_other) = LOWER(?) OR LOWER(s.patient_name) = LOWER(?))`,
                [item.mrId, item.operationDate, item.location, item.operationName, item.patientName]
            );
        }

        return matches;
    }

    async createSurgery(item, operationType) {
        const [result] = await this.db.query(
            `INSERT INTO surgery_schedules
               (patient_name, patient_age, patient_id, mr_id, diagnosis,
                operation_type_id, operation_type_other, location, surgery_date, surgery_time,
                special_notes, status, created_by)
             VALUES (?, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                item.patientName,
                item.mrId,
                item.diagnosis || '',
                operationType.operationTypeId,
                operationType.operationTypeOther,
                item.location,
                item.operationDate,
                item.operationTime,
                item.notes,
                item.status || 'planned',
                'COMM cron'
            ]
        );

        await this.logAudit(result.insertId, 'comm_sync_created', 'COMM cron', {
            source_key: item.sourceKey,
            sent_fields: item.sentFields
        });

        return result.insertId;
    }

    async updateSurgery(surgeryId, item, operationType, matchStrength) {
        const fields = [];
        const values = [];
        const changes = {};
        const strongMatch = matchStrength === 'source_key' || matchStrength === 'simrs_operasi_id';

        const addField = (column, value, changeKey = column) => {
            fields.push(`${column} = ?`);
            values.push(value);
            changes[changeKey] = value;
        };

        if (item.sentFields.patient_name) addField('patient_name', item.patientName);
        if (item.sentFields.mr_id) addField('mr_id', item.mrId);
        if (item.sentFields.diagnosis) addField('diagnosis', item.diagnosis);
        if (item.sentFields.operation_name) {
            addField('operation_type_id', operationType.operationTypeId);
            addField('operation_type_other', operationType.operationTypeOther);
        }
        if (item.sentFields.notes) addField('special_notes', item.notes);

        if (strongMatch) {
            if (item.sentFields.location) addField('location', item.location);
            if (item.sentFields.operation_date) addField('surgery_date', item.operationDate);
            if (item.sentFields.operation_time) addField('surgery_time', item.operationTime);
            if (item.sentFields.raw_status && item.status) addField('status', item.status);
        }

        if (!fields.length) return false;

        values.push(surgeryId);
        await this.db.query(`UPDATE surgery_schedules SET ${fields.join(', ')} WHERE id = ?`, values);
        await this.logAudit(surgeryId, 'comm_sync_updated', 'COMM cron', {
            source_key: item.sourceKey,
            match_strength: matchStrength,
            changes
        });
        return true;
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
                item.location,
                item.sourceKey,
                item.caseId,
                item.simrsOperasiId,
                item.mrId,
                JSON.stringify(item.sentFields)
            ]
        );
    }

    async logAudit(surgeryId, action, userId, changes) {
        try {
            await this.db.query(
                `INSERT INTO surgery_audit_log (surgery_id, action, user_id, changes)
                 VALUES (?, ?, ?, ?)`,
                [surgeryId, action, userId, JSON.stringify(changes || {})]
            );
        } catch (error) {
            logger.warn('COMM operation sync audit skipped', { surgeryId, action, error: error.message });
        }
    }

    async writeSyncRun(batch, stats, itemResults) {
        const syncDate = normalizeDate(batch.sync_date) || normalizeDate(new Date());
        const facility = normalizeLocation(batch.facility) || normalizeString(batch.facility) || 'unknown';
        const generatedAt = batch.generated_at ? new Date(batch.generated_at) : null;

        const [result] = await this.db.query(
            `INSERT INTO comm_operation_sync_runs
               (sync_date, facility, source, generated_at, items_received,
                created_count, updated_count, skipped_count, conflict_count, error_count, summary_json)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                syncDate,
                facility,
                normalizeString(batch.source) || SOURCE_SYSTEM,
                generatedAt && !Number.isNaN(generatedAt.getTime()) ? generatedAt : null,
                stats.received,
                stats.created,
                stats.updated,
                stats.skipped,
                stats.conflicts,
                stats.errors,
                JSON.stringify({ items: itemResults.slice(0, 200) })
            ]
        );

        return result.insertId;
    }

    async syncBatch(batch) {
        if (!batch || typeof batch !== 'object') {
            throw new Error('Invalid operation sync payload');
        }

        if (!Array.isArray(batch.items)) {
            throw new Error('items must be an array');
        }

        const stats = { received: batch.items.length, created: 0, updated: 0, skipped: 0, conflicts: 0, errors: 0 };
        const itemResults = [];

        for (const rawItem of batch.items) {
            const item = this.normalizeItem(rawItem || {}, batch);
            const missing = this.validateItem(item);
            if (missing.length) {
                stats.skipped++;
                itemResults.push({ source_key: item.sourceKey || null, action: 'skipped', reason: `missing:${missing.join(',')}` });
                continue;
            }

            try {
                const operationType = await this.resolveOperationType(item.operationName);
                const matches = await this.findMatch(item);

                if (matches.length > 1) {
                    stats.conflicts++;
                    itemResults.push({ source_key: item.sourceKey, action: 'conflict', matches: matches.map((m) => m.surgery_id) });
                    continue;
                }

                if (matches.length === 1) {
                    const match = matches[0];
                    const changed = await this.updateSurgery(match.surgery_id, item, operationType, match.strength);
                    await this.upsertExternalRef(match.surgery_id, item);
                    stats.updated++;
                    itemResults.push({ source_key: item.sourceKey, action: changed ? 'updated' : 'linked', surgery_id: match.surgery_id });
                    continue;
                }

                const surgeryId = await this.createSurgery(item, operationType);
                await this.upsertExternalRef(surgeryId, item);
                stats.created++;
                itemResults.push({ source_key: item.sourceKey, action: 'created', surgery_id: surgeryId });
            } catch (error) {
                stats.errors++;
                itemResults.push({ source_key: item.sourceKey, action: 'error', message: error.message });
                logger.error('COMM operation sync item error:', { sourceKey: item.sourceKey, error: error.message });
            }
        }

        const runId = await this.writeSyncRun(batch, stats, itemResults);
        return { run_id: runId, stats, items: itemResults };
    }
}

module.exports = new CommOperationSyncService();

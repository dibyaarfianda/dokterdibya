const crypto = require('crypto');

const SENSITIVE_SNAPSHOT_KEY = /(password|pass_hash|password_hash|hash|salt|token|secret|credential|auth_key|p256dh|google_id)/i;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9_]+$/;
const DIRECT_REFERENCE_COLUMNS = [
    { table: 'registration_codes', column: 'used_by_patient_id' },
    { table: 'community_chat_rooms', column: 'direct_patient_id' }
];
const TRANSFER_EXCLUDED_TABLES = new Set([
    'patients',
    'patient_merge_quarantine',
    'patient_mr_history',
    'patient_password_reset_tokens'
]);

class PatientMergeError extends Error {
    constructor(message, statusCode = 400, code = 'PATIENT_MERGE_ERROR', details = null) {
        super(message);
        this.name = 'PatientMergeError';
        this.statusCode = statusCode;
        this.code = code;
        this.details = details;
    }
}

function normalizePatientId(value) {
    return String(value || '').trim();
}

function normalizeMergeRequest(targetPatientId, sourcePatientIds) {
    const target = normalizePatientId(targetPatientId);
    if (!target) {
        throw new PatientMergeError('Akun pasien tujuan wajib dipilih.');
    }

    if (!Array.isArray(sourcePatientIds)) {
        throw new PatientMergeError('Daftar pasien sumber wajib berupa array.');
    }

    const sources = [...new Set(sourcePatientIds.map(normalizePatientId).filter(Boolean))]
        .sort((left, right) => left.localeCompare(right, 'id', { numeric: true, sensitivity: 'base' }));

    if (sources.length === 0) {
        throw new PatientMergeError('Pilih minimal satu pasien sumber.');
    }
    if (sources.includes(target)) {
        throw new PatientMergeError('Pasien tujuan tidak boleh dipilih sebagai pasien sumber.');
    }

    return {
        targetPatientId: target,
        sourcePatientIds: sources
    };
}

function drdSortKey(value) {
    const text = String(value || '').trim();
    const match = /^DRD0*(\d+)$/i.exec(text);
    return {
        isDrd: Boolean(match),
        number: match ? Number.parseInt(match[1], 10) : Number.POSITIVE_INFINITY,
        text
    };
}

function sortDrdRecordsAscending(records) {
    return [...(records || [])].sort((left, right) => {
        const leftKey = drdSortKey(left?.mr_id);
        const rightKey = drdSortKey(right?.mr_id);
        if (leftKey.isDrd !== rightKey.isDrd) return leftKey.isDrd ? -1 : 1;
        if (leftKey.number !== rightKey.number) return leftKey.number - rightKey.number;
        return leftKey.text.localeCompare(rightKey.text, 'id', { numeric: true, sensitivity: 'base' });
    });
}

function sanitizeSnapshot(value) {
    if (Array.isArray(value)) return value.map(sanitizeSnapshot);
    if (!value || typeof value !== 'object') return value;

    return Object.entries(value).reduce((result, [key, item]) => {
        if (SENSITIVE_SNAPSHOT_KEY.test(key)) return result;
        result[key] = item && typeof item === 'object' ? sanitizeSnapshot(item) : item;
        return result;
    }, {});
}

function placeholders(values) {
    return values.map(() => '?').join(', ');
}

function quoteIdentifier(identifier) {
    if (!IDENTIFIER_PATTERN.test(identifier)) {
        throw new PatientMergeError(`Identifier database tidak aman: ${identifier}`, 500, 'UNSAFE_IDENTIFIER');
    }
    return `\`${identifier}\``;
}

function affectedRows(result) {
    return Number(result?.affectedRows || 0);
}

class PatientMergeService {
    constructor(db) {
        if (!db || typeof db.query !== 'function') {
            throw new Error('PatientMergeService requires a database pool');
        }
        this.db = db;
    }

    async getCandidates(search = '', limit = 50) {
        const normalizedSearch = String(search || '').trim();
        const safeLimit = Math.min(Math.max(Number.parseInt(limit, 10) || 50, 1), 100);
        const params = [];
        let searchSql = '';
        if (normalizedSearch) {
            searchSql = 'AND (p.full_name LIKE ? OR p.id LIKE ? OR p.whatsapp LIKE ? OR p.phone LIKE ?)';
            const term = `%${normalizedSearch}%`;
            params.push(term, term, term, term);
        }
        params.push(safeLimit);

        const [rows] = await this.db.query(
            `SELECT p.id, p.full_name, p.whatsapp, p.phone, p.birth_date, p.status,
                    CASE WHEN u.new_id IS NULL THEN 0 ELSE 1 END AS has_account,
                    pmq.status AS merge_status,
                    COUNT(DISTINCT scr.mr_id) AS drd_count
             FROM patients p
             LEFT JOIN users u ON u.new_id = p.id AND u.user_type = 'patient'
             LEFT JOIN patient_merge_quarantine pmq ON pmq.source_patient_id = p.id
             LEFT JOIN sunday_clinic_records scr ON scr.patient_id = p.id
             WHERE (pmq.status IS NULL OR pmq.status <> 'deleted')
             ${searchSql}
             GROUP BY p.id, p.full_name, p.whatsapp, p.phone, p.birth_date, p.status,
                      u.new_id, pmq.status
             ORDER BY p.full_name ASC, p.id ASC
             LIMIT ?`,
            params
        );

        return rows.map(row => ({
            ...row,
            drd_count: Number(row.drd_count || 0),
            has_account: Number(row.has_account || 0) === 1,
            is_quarantined: row.merge_status === 'quarantined'
        }));
    }

    async preview(targetPatientId, sourcePatientIds, connection = null, lockPatients = false) {
        const normalized = normalizeMergeRequest(targetPatientId, sourcePatientIds);
        const conn = connection || this.db;
        const allPatientIds = [normalized.targetPatientId, ...normalized.sourcePatientIds];
        const lockSql = lockPatients ? ' FOR UPDATE' : '';

        const [patientRows] = await conn.query(
            `SELECT p.*,
                    CASE WHEN u.new_id IS NULL THEN 0 ELSE 1 END AS has_account,
                    pmq.status AS merge_status
             FROM patients p
             LEFT JOIN users u ON u.new_id = p.id AND u.user_type = 'patient'
             LEFT JOIN patient_merge_quarantine pmq ON pmq.source_patient_id = p.id
             WHERE p.id IN (${placeholders(allPatientIds)})
             ORDER BY p.id ASC${lockSql}`,
            allPatientIds
        );

        const foundById = new Map(patientRows.map(patient => [String(patient.id), patient]));
        const missingIds = allPatientIds.filter(patientId => !foundById.has(patientId));
        if (missingIds.length > 0) {
            throw new PatientMergeError(
                `Pasien tidak ditemukan: ${missingIds.join(', ')}`,
                404,
                'PATIENT_NOT_FOUND',
                { missing_patient_ids: missingIds }
            );
        }

        const target = foundById.get(normalized.targetPatientId);
        if (target.status !== 'active') {
            throw new PatientMergeError('Pasien tujuan harus berstatus aktif.', 409, 'TARGET_NOT_ACTIVE');
        }
        if (target.merge_status === 'quarantined' || target.merge_status === 'deleted') {
            throw new PatientMergeError('Pasien tujuan sedang dikarantina atau sudah pernah dihapus melalui merge.', 409, 'TARGET_UNAVAILABLE');
        }

        const sources = normalized.sourcePatientIds.map(sourceId => foundById.get(sourceId));
        const unavailableSources = sources.filter(source => source.merge_status === 'deleted');
        if (unavailableSources.length > 0) {
            throw new PatientMergeError(
                `Pasien sumber sudah pernah dihapus melalui merge: ${unavailableSources.map(item => item.id).join(', ')}`,
                409,
                'SOURCE_ALREADY_MERGED'
            );
        }

        const [drdRows] = await conn.query(
            `SELECT scr.patient_id, scr.mr_id, scr.mr_category, scr.visit_location,
                    scr.status, scr.created_at AS visit_date
             FROM sunday_clinic_records scr
             WHERE scr.patient_id IN (${placeholders(allPatientIds)})`,
            allPatientIds
        );

        const sourceIdSet = new Set(normalized.sourcePatientIds);
        const sourceDrds = sortDrdRecordsAscending(drdRows.filter(row => sourceIdSet.has(String(row.patient_id))));
        const resultingDrds = sortDrdRecordsAscending(drdRows);
        const drdCountsBySource = normalized.sourcePatientIds.reduce((result, sourceId) => {
            result[sourceId] = new Set(sourceDrds
                .filter(row => String(row.patient_id) === sourceId)
                .map(row => String(row.mr_id || ''))
                .filter(Boolean)).size;
            return result;
        }, {});

        return {
            target: sanitizeSnapshot(target),
            sources: sanitizeSnapshot(sources),
            source_drds: sourceDrds,
            resulting_drds: resultingDrds,
            drd_counts_by_source: drdCountsBySource,
            source_count: sources.length,
            source_drd_count: new Set(sourceDrds.map(row => String(row.mr_id || '')).filter(Boolean)).size,
            resulting_drd_count: new Set(resultingDrds.map(row => String(row.mr_id || '')).filter(Boolean)).size
        };
    }

    async getTransferTableMetadata(connection) {
        const [rows] = await connection.query(
            `SELECT c.TABLE_NAME AS table_name,
                    MAX(CASE WHEN s.NON_UNIQUE = 0 THEN 1 ELSE 0 END) AS patient_id_is_unique,
                    MAX(CASE WHEN name_col.COLUMN_NAME IS NULL THEN 0 ELSE 1 END) AS has_patient_name
             FROM information_schema.COLUMNS c
             LEFT JOIN information_schema.STATISTICS s
               ON s.TABLE_SCHEMA = c.TABLE_SCHEMA
              AND s.TABLE_NAME = c.TABLE_NAME
              AND s.COLUMN_NAME = c.COLUMN_NAME
             LEFT JOIN information_schema.COLUMNS name_col
               ON name_col.TABLE_SCHEMA = c.TABLE_SCHEMA
              AND name_col.TABLE_NAME = c.TABLE_NAME
              AND name_col.COLUMN_NAME = 'patient_name'
             WHERE c.TABLE_SCHEMA = DATABASE()
               AND c.COLUMN_NAME = 'patient_id'
               AND c.DATA_TYPE IN ('char', 'varchar', 'tinytext', 'text', 'mediumtext', 'longtext')
             GROUP BY c.TABLE_NAME
             ORDER BY c.TABLE_NAME ASC`
        );

        return rows
            .map(row => ({
                tableName: String(row.table_name),
                hasUniquePatientKey: Number(row.patient_id_is_unique || 0) === 1,
                hasPatientName: Number(row.has_patient_name || 0) === 1
            }))
            .filter(row => !TRANSFER_EXCLUDED_TABLES.has(row.tableName));
    }

    async tableExists(connection, tableName) {
        const [rows] = await connection.query(
            `SELECT 1 AS present
             FROM information_schema.TABLES
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
             LIMIT 1`,
            [tableName]
        );
        return rows.length > 0;
    }

    async columnExists(connection, tableName, columnName) {
        const [rows] = await connection.query(
            `SELECT 1 AS present
             FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
             LIMIT 1`,
            [tableName, columnName]
        );
        return rows.length > 0;
    }

    async transferDirectPatientTables(connection, targetPatientId, sourcePatientIds, targetName) {
        const tableMetadata = await this.getTransferTableMetadata(connection);
        const summary = {};

        for (const metadata of tableMetadata) {
            const table = quoteIdentifier(metadata.tableName);
            let moved = 0;
            let conflictsDiscarded = 0;

            if (metadata.hasUniquePatientKey) {
                for (const sourcePatientId of sourcePatientIds) {
                    const setName = metadata.hasPatientName ? ', patient_name = ?' : '';
                    const params = metadata.hasPatientName
                        ? [targetPatientId, targetName, sourcePatientId]
                        : [targetPatientId, sourcePatientId];
                    const [updateResult] = await connection.query(
                        `UPDATE IGNORE ${table} SET patient_id = ?${setName} WHERE patient_id = ?`,
                        params
                    );
                    moved += affectedRows(updateResult);

                    const [deleteResult] = await connection.query(
                        `DELETE FROM ${table} WHERE patient_id = ?`,
                        [sourcePatientId]
                    );
                    conflictsDiscarded += affectedRows(deleteResult);
                }
            } else {
                const setName = metadata.hasPatientName ? ', patient_name = ?' : '';
                const params = metadata.hasPatientName
                    ? [targetPatientId, targetName, ...sourcePatientIds]
                    : [targetPatientId, ...sourcePatientIds];
                const [updateResult] = await connection.query(
                    `UPDATE ${table}
                     SET patient_id = ?${setName}
                     WHERE patient_id IN (${placeholders(sourcePatientIds)})`,
                    params
                );
                moved = affectedRows(updateResult);
            }

            summary[metadata.tableName] = {
                moved,
                conflicts_discarded: conflictsDiscarded
            };
        }

        return { summary, tableMetadata };
    }

    async transferSecondaryPatientReferences(connection, targetPatientId, sourcePatientIds) {
        const summary = {};

        for (const reference of DIRECT_REFERENCE_COLUMNS) {
            if (!await this.tableExists(connection, reference.table)) continue;
            if (!await this.columnExists(connection, reference.table, reference.column)) continue;

            const table = quoteIdentifier(reference.table);
            const column = quoteIdentifier(reference.column);
            const [result] = await connection.query(
                `UPDATE ${table}
                 SET ${column} = ?
                 WHERE ${column} IN (${placeholders(sourcePatientIds)})`,
                [targetPatientId, ...sourcePatientIds]
            );
            summary[`${reference.table}.${reference.column}`] = affectedRows(result);
        }

        if (await this.tableExists(connection, 'patient_merge_quarantine')) {
            const [result] = await connection.query(
                `UPDATE patient_merge_quarantine
                 SET target_patient_id = ?, updated_at = NOW()
                 WHERE target_patient_id IN (${placeholders(sourcePatientIds)})
                   AND source_patient_id NOT IN (${placeholders(sourcePatientIds)})`,
                [targetPatientId, ...sourcePatientIds, ...sourcePatientIds]
            );
            summary['patient_merge_quarantine.target_patient_id'] = affectedRows(result);
        }

        const communityRules = [{
            table: 'community_chat_profiles',
            idColumn: 'user_id',
            typeColumn: 'user_type',
            typeValue: 'patient',
            unique: true
        }, {
            table: 'community_chat_room_members',
            idColumn: 'user_id',
            typeColumn: 'user_type',
            typeValue: 'patient',
            unique: true
        }, {
            table: 'community_chat_messages',
            idColumn: 'sender_id',
            typeColumn: 'sender_type',
            typeValue: 'patient',
            unique: false,
            nameColumn: 'sender_name'
        }, {
            table: 'community_chat_rooms',
            idColumn: 'created_by',
            typeColumn: 'created_by_type',
            typeValue: 'patient',
            unique: false
        }];

        const [targetRows] = await connection.query(
            'SELECT full_name FROM patients WHERE id = ? LIMIT 1',
            [targetPatientId]
        );
        const targetName = String(targetRows[0]?.full_name || targetPatientId);

        for (const rule of communityRules) {
            if (!await this.tableExists(connection, rule.table)) continue;
            if (!await this.columnExists(connection, rule.table, rule.idColumn)) continue;
            const table = quoteIdentifier(rule.table);
            const idColumn = quoteIdentifier(rule.idColumn);
            const typeColumn = quoteIdentifier(rule.typeColumn);
            const nameAssignment = rule.nameColumn ? `, ${quoteIdentifier(rule.nameColumn)} = ?` : '';
            let moved = 0;
            let conflictsDiscarded = 0;

            for (const sourcePatientId of sourcePatientIds) {
                const params = rule.nameColumn
                    ? [targetPatientId, targetName, sourcePatientId, rule.typeValue]
                    : [targetPatientId, sourcePatientId, rule.typeValue];
                const [updateResult] = await connection.query(
                    `UPDATE${rule.unique ? ' IGNORE' : ''} ${table}
                     SET ${idColumn} = ?${nameAssignment}
                     WHERE ${idColumn} = ? AND ${typeColumn} = ?`,
                    params
                );
                moved += affectedRows(updateResult);

                if (rule.unique) {
                    const [deleteResult] = await connection.query(
                        `DELETE FROM ${table}
                         WHERE ${idColumn} = ? AND ${typeColumn} = ?`,
                        [sourcePatientId, rule.typeValue]
                    );
                    conflictsDiscarded += affectedRows(deleteResult);
                }
            }
            summary[`${rule.table}.${rule.idColumn}`] = { moved, conflicts_discarded: conflictsDiscarded };
        }

        return summary;
    }

    async verifyNoRemainingReferences(connection, sourcePatientIds, tableMetadata) {
        const remaining = [];

        for (const metadata of tableMetadata) {
            const table = quoteIdentifier(metadata.tableName);
            const [rows] = await connection.query(
                `SELECT COUNT(*) AS total
                 FROM ${table}
                 WHERE patient_id IN (${placeholders(sourcePatientIds)})`,
                sourcePatientIds
            );
            if (Number(rows[0]?.total || 0) > 0) {
                remaining.push({ table: metadata.tableName, column: 'patient_id', count: Number(rows[0].total) });
            }
        }

        for (const reference of DIRECT_REFERENCE_COLUMNS) {
            if (!await this.tableExists(connection, reference.table)) continue;
            if (!await this.columnExists(connection, reference.table, reference.column)) continue;
            const table = quoteIdentifier(reference.table);
            const column = quoteIdentifier(reference.column);
            const [rows] = await connection.query(
                `SELECT COUNT(*) AS total
                 FROM ${table}
                 WHERE ${column} IN (${placeholders(sourcePatientIds)})`,
                sourcePatientIds
            );
            if (Number(rows[0]?.total || 0) > 0) {
                remaining.push({ table: reference.table, column: reference.column, count: Number(rows[0].total) });
            }
        }

        const communityReferences = [{ table: 'community_chat_profiles', column: 'user_id', typeColumn: 'user_type' },
            { table: 'community_chat_room_members', column: 'user_id', typeColumn: 'user_type' },
            { table: 'community_chat_messages', column: 'sender_id', typeColumn: 'sender_type' },
            { table: 'community_chat_rooms', column: 'created_by', typeColumn: 'created_by_type' }];
        for (const reference of communityReferences) {
            if (!await this.tableExists(connection, reference.table)) continue;
            if (!await this.columnExists(connection, reference.table, reference.column)) continue;
            const table = quoteIdentifier(reference.table);
            const column = quoteIdentifier(reference.column);
            const typeColumn = quoteIdentifier(reference.typeColumn);
            const [rows] = await connection.query(
                `SELECT COUNT(*) AS total
                 FROM ${table}
                 WHERE ${column} IN (${placeholders(sourcePatientIds)})
                   AND ${typeColumn} = 'patient'`,
                sourcePatientIds
            );
            if (Number(rows[0]?.total || 0) > 0) {
                remaining.push({ table: reference.table, column: reference.column, count: Number(rows[0].total) });
            }
        }

        // Differently named references are only treated as patient ownership when
        // the database declares a real FK to patients(id). This avoids coercing
        // unrelated fields such as numeric patient_feedback.patient_id or
        // billings.patient_record_id into the varchar portal patient identifier.
        const [foreignKeyColumns] = await connection.query(
            `SELECT TABLE_NAME AS table_name, COLUMN_NAME AS column_name
             FROM information_schema.KEY_COLUMN_USAGE
             WHERE TABLE_SCHEMA = DATABASE()
               AND REFERENCED_TABLE_SCHEMA = DATABASE()
               AND REFERENCED_TABLE_NAME = 'patients'
               AND REFERENCED_COLUMN_NAME = 'id'
             ORDER BY TABLE_NAME, COLUMN_NAME`
        );
        for (const candidate of foreignKeyColumns) {
            const tableName = String(candidate.table_name);
            const columnName = String(candidate.column_name);
            if (columnName === 'patient_id') continue;
            if (tableName === 'patient_merge_quarantine') continue;
            const table = quoteIdentifier(tableName);
            const column = quoteIdentifier(columnName);
            const [rows] = await connection.query(
                `SELECT COUNT(*) AS total
                 FROM ${table}
                 WHERE ${column} IN (${placeholders(sourcePatientIds)})`,
                sourcePatientIds
            );
            if (Number(rows[0]?.total || 0) > 0) {
                remaining.push({ table: tableName, column: columnName, count: Number(rows[0].total) });
            }
        }

        if (remaining.length > 0) {
            throw new PatientMergeError(
                'Merge dibatalkan karena masih ada relasi pasien sumber yang belum aman dipindahkan.',
                409,
                'UNMOVED_PATIENT_REFERENCES',
                { remaining_references: remaining }
            );
        }
    }

    async rebuildPatientMrHistory(connection, targetPatientId, sourcePatientIds) {
        if (!await this.tableExists(connection, 'patient_mr_history')) return 0;

        await connection.query(
            `DELETE FROM patient_mr_history
             WHERE patient_id = ? OR patient_id IN (${placeholders(sourcePatientIds)})`,
            [targetPatientId, ...sourcePatientIds]
        );

        const [records] = await connection.query(
            `SELECT mr_id, mr_category, created_at, last_activity_at
             FROM sunday_clinic_records
             WHERE patient_id = ? AND mr_category IS NOT NULL`,
            [targetPatientId]
        );
        const grouped = new Map();
        records.forEach(record => {
            const category = String(record.mr_category || '').trim();
            if (!category) return;
            if (!grouped.has(category)) grouped.set(category, []);
            grouped.get(category).push(record);
        });

        let inserted = 0;
        for (const [category, categoryRecords] of grouped.entries()) {
            const sorted = sortDrdRecordsAscending(categoryRecords);
            const dates = categoryRecords
                .flatMap(record => [record.created_at, record.last_activity_at])
                .filter(Boolean)
                .map(value => new Date(value))
                .filter(value => !Number.isNaN(value.getTime()))
                .sort((left, right) => left - right);
            const firstDate = dates[0] || new Date();
            const lastDate = dates[dates.length - 1] || firstDate;

            await connection.query(
                `INSERT INTO patient_mr_history
                 (patient_id, mr_id, mr_category, first_visit_date, last_visit_date, visit_count)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [targetPatientId, sorted[0].mr_id, category, firstDate, lastDate, categoryRecords.length]
            );
            inserted += 1;
        }

        return inserted;
    }

    async refreshPatientAggregates(connection, targetPatientId) {
        const [rows] = await connection.query(
            `SELECT COUNT(*) AS visit_count,
                    MAX(COALESCE(finalized_at, last_activity_at, created_at)) AS last_visit
             FROM sunday_clinic_records
             WHERE patient_id = ?`,
            [targetPatientId]
        );
        const aggregate = rows[0] || {};
        await connection.query(
            `UPDATE patients
             SET visit_count = ?, last_visit = ?, updated_at = NOW()
             WHERE id = ?`,
            [Number(aggregate.visit_count || 0), aggregate.last_visit || null, targetPatientId]
        );
    }

    async mergePatients({ targetPatientId, sourcePatientIds, actor = {} }) {
        const normalized = normalizeMergeRequest(targetPatientId, sourcePatientIds);
        if (typeof this.db.getConnection !== 'function') {
            throw new PatientMergeError('Database pool tidak mendukung transaksi merge.', 500, 'MERGE_TRANSACTION_UNAVAILABLE');
        }
        const connection = await this.db.getConnection();
        const mergeBatchId = crypto.randomUUID();

        try {
            await connection.beginTransaction();
            const preview = await this.preview(
                normalized.targetPatientId,
                normalized.sourcePatientIds,
                connection,
                true
            );
            const targetName = String(preview.target.full_name || preview.target.id);

            const [userRows] = await connection.query(
                `SELECT * FROM users
                 WHERE new_id IN (${placeholders(normalized.sourcePatientIds)})
                 ORDER BY new_id ASC`,
                normalized.sourcePatientIds
            );
            const usersByPatientId = new Map(userRows.map(user => [String(user.new_id), sanitizeSnapshot(user)]));

            for (const source of preview.sources) {
                const sourceDrds = preview.source_drds.filter(row => String(row.patient_id) === String(source.id));
                await connection.query(
                    `INSERT INTO patient_merge_quarantine
                     (source_patient_id, target_patient_id, normalized_name, reason, status,
                      patient_snapshot, user_snapshot, created_by, merge_batch_id, drd_snapshot,
                      transfer_summary, completed_at)
                     VALUES (?, ?, ?, ?, 'quarantined', ?, ?, ?, ?, ?, NULL, NULL)
                     ON DUPLICATE KEY UPDATE
                        target_patient_id = VALUES(target_patient_id),
                        normalized_name = VALUES(normalized_name),
                        reason = VALUES(reason),
                        status = 'quarantined',
                        patient_snapshot = VALUES(patient_snapshot),
                        user_snapshot = VALUES(user_snapshot),
                        created_by = VALUES(created_by),
                        merge_batch_id = VALUES(merge_batch_id),
                        drd_snapshot = VALUES(drd_snapshot),
                        transfer_summary = NULL,
                        completed_at = NULL,
                        updated_at = NOW()`,
                    [
                        source.id,
                        normalized.targetPatientId,
                        String(source.full_name || '').trim().toLowerCase(),
                        `Merged permanently into ${normalized.targetPatientId}`,
                        JSON.stringify(sanitizeSnapshot(source)),
                        JSON.stringify(usersByPatientId.get(String(source.id)) || null),
                        String(actor.name || actor.id || 'unknown'),
                        mergeBatchId,
                        JSON.stringify(sortDrdRecordsAscending(sourceDrds))
                    ]
                );
            }

            await connection.query(
                `DELETE FROM patient_password_reset_tokens
                 WHERE patient_id IN (${placeholders(normalized.sourcePatientIds)})`,
                normalized.sourcePatientIds
            );

            const transfer = await this.transferDirectPatientTables(
                connection,
                normalized.targetPatientId,
                normalized.sourcePatientIds,
                targetName
            );
            const secondarySummary = await this.transferSecondaryPatientReferences(
                connection,
                normalized.targetPatientId,
                normalized.sourcePatientIds
            );
            const historyRows = await this.rebuildPatientMrHistory(
                connection,
                normalized.targetPatientId,
                normalized.sourcePatientIds
            );
            await this.refreshPatientAggregates(connection, normalized.targetPatientId);
            await this.verifyNoRemainingReferences(
                connection,
                normalized.sourcePatientIds,
                transfer.tableMetadata
            );

            const [deletedUsers] = await connection.query(
                `DELETE FROM users
                 WHERE new_id IN (${placeholders(normalized.sourcePatientIds)})
                   AND user_type = 'patient'`,
                normalized.sourcePatientIds
            );
            const [deletedPatients] = await connection.query(
                `DELETE FROM patients
                 WHERE id IN (${placeholders(normalized.sourcePatientIds)})`,
                normalized.sourcePatientIds
            );

            if (affectedRows(deletedPatients) !== normalized.sourcePatientIds.length) {
                throw new PatientMergeError(
                    'Merge dibatalkan karena tidak semua pasien sumber berhasil dihapus.',
                    409,
                    'SOURCE_DELETE_MISMATCH'
                );
            }

            const transferSummary = {
                tables: transfer.summary,
                secondary_references: secondarySummary,
                patient_mr_history_rows: historyRows,
                deleted_users: affectedRows(deletedUsers),
                deleted_patients: affectedRows(deletedPatients)
            };
            await connection.query(
                `UPDATE patient_merge_quarantine
                 SET status = 'deleted', transfer_summary = ?, completed_at = NOW(), updated_at = NOW()
                 WHERE merge_batch_id = ?`,
                [JSON.stringify(transferSummary), mergeBatchId]
            );

            await connection.commit();
            return {
                success: true,
                merge_batch_id: mergeBatchId,
                target: preview.target,
                deleted_sources: preview.sources.map(source => ({ id: source.id, full_name: source.full_name })),
                moved_drds: preview.source_drds,
                resulting_drds: preview.resulting_drds.map(record => ({
                    ...record,
                    patient_id: normalized.targetPatientId
                })),
                transfer_summary: transferSummary
            };
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }
}

module.exports = {
    PatientMergeService,
    PatientMergeError,
    normalizeMergeRequest,
    sortDrdRecordsAscending,
    sanitizeSnapshot
};

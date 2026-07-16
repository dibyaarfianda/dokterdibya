const ARCHIVE_TABLE_SQL = `CREATE TABLE IF NOT EXISTS operation_data_index_duplicate_archive (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  original_id BIGINT UNSIGNED NOT NULL,
  canonical_id BIGINT UNSIGNED NOT NULL,
  facility VARCHAR(64) NOT NULL,
  simrs_operasi_id VARCHAR(100) NOT NULL,
  source_key VARCHAR(255) NOT NULL,
  reason VARCHAR(100) NOT NULL,
  row_json LONGTEXT NOT NULL,
  archived_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_operation_duplicate_original (original_id),
  KEY idx_operation_duplicate_canonical (canonical_id),
  KEY idx_operation_duplicate_identity (facility, simrs_operasi_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;

const JOURNEY_TABLE_SQL = `CREATE TABLE IF NOT EXISTS operation_doctor_journeys (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  operation_data_id BIGINT UNSIGNED NOT NULL,
  facility VARCHAR(64) NOT NULL,
  simrs_operasi_id VARCHAR(100) NOT NULL,
  transfer_status ENUM('yes','no','unknown') NOT NULL DEFAULT 'unknown',
  confidence ENUM('verified','supported','unknown') NOT NULL DEFAULT 'unknown',
  origin_doctor_name VARCHAR(255) NULL,
  origin_doctor_key VARCHAR(191) NULL,
  origin_doctor_source VARCHAR(64) NULL,
  last_cppt_doctor_name VARCHAR(255) NULL,
  last_cppt_doctor_key VARCHAR(191) NULL,
  last_cppt_doctor_source VARCHAR(64) NULL,
  procedure_doctor_name VARCHAR(255) NULL,
  procedure_doctor_key VARCHAR(191) NULL,
  procedure_doctor_source VARCHAR(64) NULL,
  final_doctor_name VARCHAR(255) NULL,
  final_doctor_key VARCHAR(191) NULL,
  final_doctor_source VARCHAR(64) NULL,
  transition_count INT UNSIGNED NOT NULL DEFAULT 0,
  timeline_json LONGTEXT NULL,
  consultants_json LONGTEXT NULL,
  source_hash CHAR(64) NULL,
  checked_at DATETIME NULL,
  error_message TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_operation_doctor_journey (facility, simrs_operasi_id),
  KEY idx_operation_doctor_journey_pending (error_message(64), checked_at),
  KEY idx_operation_doctor_journey_transfer (transfer_status, confidence),
  CONSTRAINT fk_operation_doctor_journey_operation
    FOREIGN KEY (operation_data_id) REFERENCES operation_data_index(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;

function canonicalSourceKey(facility, operationId) {
  return `${String(facility || '').trim()}:pendaftaran:${String(operationId || '').trim()}`;
}

function normalizeComparable(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function dateOnly(value) {
  if (!value) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  }
  return String(value).slice(0, 10);
}

function distinctNonEmpty(rows, selector) {
  return new Set(rows.map(selector).filter(Boolean));
}

function validateDuplicateGroup(rows) {
  if (!Array.isArray(rows) || rows.length < 2) throw new Error('Duplicate group must contain at least two rows');
  const facility = String(rows[0].facility || '').trim();
  const operationId = String(rows[0].simrs_operasi_id || '').trim();
  const canonicalKey = canonicalSourceKey(facility, operationId);
  const canonicalRows = rows.filter(row => String(row.source_key || '').trim() === canonicalKey);
  if (canonicalRows.length !== 1) {
    throw new Error(`Ambiguous canonical operation ${facility}/${operationId}: expected one ${canonicalKey}, found ${canonicalRows.length}`);
  }

  const mrValues = distinctNonEmpty(rows, row => normalizeComparable(row.mr_id));
  const patientValues = distinctNonEmpty(rows, row => normalizeComparable(row.patient_name));
  const dateValues = distinctNonEmpty(rows, row => dateOnly(row.operation_date));
  const hasMissingMr = rows.some(row => !normalizeComparable(row.mr_id));
  const patientIdentityMismatch = patientValues.size > 1 && (mrValues.size === 0 || hasMissingMr);
  if (mrValues.size > 1 || patientIdentityMismatch || dateValues.size > 1) {
    throw new Error(`Integrity mismatch for duplicate operation ${facility}/${operationId}`);
  }

  const canonical = canonicalRows[0];
  return {
    facility,
    operationId,
    canonical,
    duplicates: rows.filter(row => String(row.id) !== String(canonical.id)),
  };
}

async function ensureTables(pool) {
  await pool.query(ARCHIVE_TABLE_SQL);
  await pool.query(JOURNEY_TABLE_SQL);
}

async function loadDuplicateGroups(pool) {
  const [groups] = await pool.query(
    `SELECT facility, simrs_operasi_id, COUNT(*) AS row_count
       FROM operation_data_index
     WHERE facility = 'gambiran'
       AND simrs_operasi_id IS NOT NULL
        AND simrs_operasi_id <> ''
      GROUP BY facility, simrs_operasi_id
     HAVING COUNT(*) > 1
      ORDER BY facility, simrs_operasi_id`
  );

  const validated = [];
  for (const group of groups) {
    const [rows] = await pool.query(
      `SELECT * FROM operation_data_index
        WHERE facility = ? AND simrs_operasi_id = ?
        ORDER BY id`,
      [group.facility, group.simrs_operasi_id]
    );
    validated.push(validateDuplicateGroup(rows));
  }
  return validated;
}

async function archiveAndDeleteDuplicates(pool, groups) {
  if (groups.length === 0) return 0;
  const connection = typeof pool.getConnection === 'function' ? await pool.getConnection() : pool;
  let removed = 0;
  try {
    if (typeof connection.beginTransaction === 'function') await connection.beginTransaction();
    for (const group of groups) {
      for (const row of group.duplicates) {
        await connection.query(
          `INSERT IGNORE INTO operation_data_index_duplicate_archive
             (original_id, canonical_id, facility, simrs_operasi_id, source_key, reason, row_json)
           VALUES (?, ?, ?, ?, ?, 'noncanonical_duplicate', ?)`,
          [row.id, group.canonical.id, group.facility, group.operationId, row.source_key, JSON.stringify(row)]
        );
        const [result] = await connection.query(
          `DELETE FROM operation_data_index WHERE id = ? AND id <> ?`,
          [row.id, group.canonical.id]
        );
        removed += result.affectedRows || 0;
      }
    }
    if (typeof connection.commit === 'function') await connection.commit();
  } catch (error) {
    if (typeof connection.rollback === 'function') await connection.rollback();
    throw error;
  } finally {
    if (connection !== pool && typeof connection.release === 'function') connection.release();
  }
  return removed;
}

async function ensureCanonicalUniqueIndex(pool) {
  const [remaining] = await pool.query(
    `SELECT COUNT(*) AS duplicate_groups FROM (
       SELECT facility, simrs_operasi_id
         FROM operation_data_index
        WHERE facility = 'gambiran'
          AND simrs_operasi_id IS NOT NULL AND simrs_operasi_id <> ''
        GROUP BY facility, simrs_operasi_id
       HAVING COUNT(*) > 1
     ) duplicates`
  );
  if (Number(remaining[0]?.duplicate_groups || 0) !== 0) {
    throw new Error('Duplicate operation identities remain after archival');
  }

  const [columns] = await pool.query(
    `SELECT COLUMN_NAME
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'operation_data_index'
        AND COLUMN_NAME = 'gambiran_canonical_identity'`
  );
  if (columns.length === 0) {
    await pool.query(
      `ALTER TABLE operation_data_index
       ADD COLUMN gambiran_canonical_identity VARCHAR(180)
       GENERATED ALWAYS AS (
         CASE
           WHEN facility = 'gambiran' AND simrs_operasi_id IS NOT NULL AND simrs_operasi_id <> ''
           THEN CONCAT(facility, ':', simrs_operasi_id)
           ELSE NULL
         END
       ) PERSISTENT`
    );
  }

  const [indexes] = await pool.query(
    `SELECT INDEX_NAME
       FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'operation_data_index'
        AND INDEX_NAME = 'uq_operation_data_gambiran_operasi'`
  );
  if (indexes.length === 0) {
    await pool.query(
      `ALTER TABLE operation_data_index
       ADD UNIQUE KEY uq_operation_data_gambiran_operasi (gambiran_canonical_identity)`
    );
  }
}

async function migrate(pool) {
  await ensureTables(pool);
  const groups = await loadDuplicateGroups(pool);
  const duplicateRows = groups.reduce((sum, group) => sum + group.duplicates.length, 0);
  const removed = await archiveAndDeleteDuplicates(pool, groups);
  await ensureCanonicalUniqueIndex(pool);
  return { duplicate_groups: groups.length, duplicate_rows: duplicateRows, removed };
}

async function main() {
  const pool = require('../db');
  try {
    const result = await migrate(pool);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`Operation doctor journey migration failed: ${error.message}\n`);
    process.exit(1);
  });
}

module.exports = {
  archiveAndDeleteDuplicates,
  canonicalSourceKey,
  ensureCanonicalUniqueIndex,
  loadDuplicateGroups,
  migrate,
  validateDuplicateGroup,
};

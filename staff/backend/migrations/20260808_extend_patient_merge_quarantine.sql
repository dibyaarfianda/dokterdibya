-- Extend the existing patient merge quarantine table into the permanent
-- audit trail used by the staff patient merge feature.

CREATE TABLE IF NOT EXISTS patient_merge_quarantine (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    source_patient_id VARCHAR(10) NOT NULL,
    target_patient_id VARCHAR(10) NOT NULL,
    normalized_name VARCHAR(255) NOT NULL,
    reason VARCHAR(255) NOT NULL,
    status ENUM('quarantined','restored','deleted') NOT NULL DEFAULT 'quarantined',
    patient_snapshot LONGTEXT NULL,
    user_snapshot LONGTEXT NULL,
    backup_dir VARCHAR(500) NULL,
    merge_batch_id CHAR(36) NULL,
    drd_snapshot LONGTEXT NULL,
    transfer_summary LONGTEXT NULL,
    completed_at DATETIME NULL,
    created_by VARCHAR(100) NOT NULL DEFAULT 'copilot-cli',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_source_patient (source_patient_id),
    KEY idx_target_patient (target_patient_id),
    KEY idx_status (status),
    KEY idx_merge_batch (merge_batch_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE patient_merge_quarantine
    ADD COLUMN IF NOT EXISTS merge_batch_id CHAR(36) NULL AFTER backup_dir,
    ADD COLUMN IF NOT EXISTS drd_snapshot LONGTEXT NULL AFTER merge_batch_id,
    ADD COLUMN IF NOT EXISTS transfer_summary LONGTEXT NULL AFTER drd_snapshot,
    ADD COLUMN IF NOT EXISTS completed_at DATETIME NULL AFTER transfer_summary;

SET @has_merge_batch_index = (
    SELECT COUNT(*)
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'patient_merge_quarantine'
      AND INDEX_NAME = 'idx_merge_batch'
);
SET @merge_batch_index_sql = IF(
    @has_merge_batch_index = 0,
    'ALTER TABLE patient_merge_quarantine ADD INDEX idx_merge_batch (merge_batch_id)',
    'SELECT 1'
);
PREPARE merge_batch_index_stmt FROM @merge_batch_index_sql;
EXECUTE merge_batch_index_stmt;
DEALLOCATE PREPARE merge_batch_index_stmt;

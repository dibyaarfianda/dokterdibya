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
    created_by VARCHAR(100) NOT NULL DEFAULT 'copilot-cli',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_source_patient (source_patient_id),
    KEY idx_target_patient (target_patient_id),
    KEY idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

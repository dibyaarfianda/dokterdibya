-- COMM Operation Sync Migration
-- Tracks operation schedules imported from COMM without storing fields COMM did not send.

CREATE TABLE IF NOT EXISTS surgery_external_refs (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    surgery_id BIGINT UNSIGNED NOT NULL,
    source_system VARCHAR(32) NOT NULL DEFAULT 'COMM',
    facility VARCHAR(64) NOT NULL,
    source_key VARCHAR(255) NOT NULL,
    case_id VARCHAR(100) NULL,
    simrs_operasi_id VARCHAR(100) NULL,
    mr_id VARCHAR(50) NULL,
    sent_fields JSON NULL,
    last_synced_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_surgery_ext_source_key (source_system, source_key),
    UNIQUE KEY uq_surgery_ext_simrs_operasi (source_system, facility, simrs_operasi_id),
    INDEX idx_surgery_ext_surgery (surgery_id),
    INDEX idx_surgery_ext_case (source_system, facility, case_id),
    INDEX idx_surgery_ext_mr (source_system, facility, mr_id),
    CONSTRAINT fk_surgery_external_refs_surgery
        FOREIGN KEY (surgery_id) REFERENCES surgery_schedules(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS comm_operation_sync_runs (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    sync_date DATE NOT NULL,
    facility VARCHAR(64) NOT NULL,
    source VARCHAR(32) NOT NULL DEFAULT 'COMM',
    generated_at DATETIME NULL,
    received_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    items_received INT NOT NULL DEFAULT 0,
    created_count INT NOT NULL DEFAULT 0,
    updated_count INT NOT NULL DEFAULT 0,
    skipped_count INT NOT NULL DEFAULT 0,
    conflict_count INT NOT NULL DEFAULT 0,
    error_count INT NOT NULL DEFAULT 0,
    summary_json JSON NULL,
    INDEX idx_comm_operation_sync_date (sync_date, facility),
    INDEX idx_comm_operation_sync_received (received_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

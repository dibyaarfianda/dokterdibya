-- Additive, immutable Sunday Clinic accounting close snapshots.
-- A close is unique per clinical service date and can only be created by the
-- doctor-only API. There are intentionally no update/delete application paths.

CREATE TABLE IF NOT EXISTS sunday_clinic_closings (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    clinic_date DATE NOT NULL,
    main_total DECIMAL(14, 2) NOT NULL DEFAULT 0,
    additional_total DECIMAL(14, 2) NOT NULL DEFAULT 0,
    grand_total DECIMAL(14, 2) NOT NULL DEFAULT 0,
    patient_count INT UNSIGNED NOT NULL DEFAULT 0,
    transaction_count INT UNSIGNED NOT NULL DEFAULT 0,
    summary_json JSON NOT NULL,
    breakdown_json JSON NOT NULL,
    source_fingerprint CHAR(64) NOT NULL,
    closed_by_user_id VARCHAR(64) NOT NULL,
    closed_by_name VARCHAR(255) NOT NULL,
    closed_by_role VARCHAR(100) NOT NULL,
    closed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_sunday_clinic_closing_clinic_date (clinic_date),
    KEY idx_sunday_clinic_closing_closed_at (closed_at),
    KEY idx_sunday_clinic_closing_actor (closed_by_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sunday_clinic_closing_entries (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    closing_id BIGINT UNSIGNED NOT NULL,
    source_type ENUM('main', 'additional') NOT NULL,
    source_id BIGINT UNSIGNED NOT NULL,
    parent_billing_id BIGINT UNSIGNED NULL,
    mr_id VARCHAR(50) NOT NULL,
    patient_id VARCHAR(50) NOT NULL,
    patient_name VARCHAR(255) NOT NULL,
    reference_number VARCHAR(80) NOT NULL,
    payment_method VARCHAR(50) NULL,
    paid_at DATETIME NULL,
    paid_by VARCHAR(255) NULL,
    total DECIMAL(14, 2) NOT NULL DEFAULT 0,
    item_snapshot JSON NOT NULL,
    source_snapshot JSON NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_sunday_clinic_closing_source (closing_id, source_type, source_id),
    KEY idx_sunday_clinic_closing_entry_mr (mr_id),
    KEY idx_sunday_clinic_closing_entry_patient (patient_id),
    CONSTRAINT fk_sunday_clinic_closing_entry_header
        FOREIGN KEY (closing_id) REFERENCES sunday_clinic_closings(id)
        ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Closing preview and reconciliation scan paid/open sources by status and paid_at.
SET @idx_exists := (
    SELECT COUNT(1)
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'sunday_clinic_billings'
      AND index_name = 'idx_scb_status_paid_at'
);
SET @sql := IF(
    @idx_exists = 0,
    'ALTER TABLE sunday_clinic_billings ADD INDEX idx_scb_status_paid_at (status, paid_at)',
    'SELECT "idx_scb_status_paid_at already exists"'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_exists := (
    SELECT COUNT(1)
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'sunday_clinic_additional_billings'
      AND index_name = 'idx_scab_status_paid_at'
);
SET @sql := IF(
    @idx_exists = 0,
    'ALTER TABLE sunday_clinic_additional_billings ADD INDEX idx_scab_status_paid_at (status, paid_at)',
    'SELECT "idx_scab_status_paid_at already exists"'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

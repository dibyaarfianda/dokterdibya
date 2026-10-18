-- Additive structured clinic laboratory reports. No legacy clinical backfill.
CREATE TABLE IF NOT EXISTS lab_reports (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    visit_id BIGINT UNSIGNED NOT NULL,
    patient_id VARCHAR(10) NOT NULL,
    mr_id VARCHAR(20) NOT NULL,
    client_request_id CHAR(36) NOT NULL,
    client_payload_hash CHAR(64) NOT NULL,
    status ENUM('draft','published','deleted') NOT NULL DEFAULT 'draft',
    version INT UNSIGNED NOT NULL DEFAULT 1,
    published_version INT UNSIGNED NULL,
    lab_number VARCHAR(40) NULL,
    report_data LONGTEXT NOT NULL,
    published_data LONGTEXT NULL,
    pdf_key VARCHAR(500) NULL,
    created_by VARCHAR(50) NOT NULL,
    updated_by VARCHAR(50) NOT NULL,
    published_by VARCHAR(50) NULL,
    published_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_lab_number (lab_number),
    UNIQUE KEY uq_lab_create_request (client_request_id),
    KEY idx_lab_patient (patient_id, status, updated_at),
    KEY idx_lab_visit (visit_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS lab_report_revisions (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    report_id BIGINT UNSIGNED NOT NULL,
    version INT UNSIGNED NOT NULL,
    action VARCHAR(20) NOT NULL,
    snapshot LONGTEXT NOT NULL,
    actor_id VARCHAR(50) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_lab_revision (report_id, version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS lab_report_sequences (
    date_key CHAR(8) NOT NULL PRIMARY KEY,
    last_number INT UNSIGNED NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
-- MariaDB production supports IF NOT EXISTS on additive columns/indexes.
ALTER TABLE patient_documents ADD COLUMN IF NOT EXISTS lab_report_id BIGINT UNSIGNED NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_patient_doc_lab_report ON patient_documents (lab_report_id);

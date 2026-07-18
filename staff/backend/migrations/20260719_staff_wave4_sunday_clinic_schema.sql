-- Additive Sunday Clinic schema migration for staff-panel Wave 4.
-- Safe to run repeatedly. No columns or data are removed.

CREATE TABLE IF NOT EXISTS sunday_clinic_billings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    mr_id VARCHAR(50) NOT NULL UNIQUE,
    patient_id VARCHAR(10) NOT NULL,
    subtotal DECIMAL(12, 2) NOT NULL DEFAULT 0,
    total DECIMAL(12, 2) NOT NULL DEFAULT 0,
    status ENUM('draft', 'confirmed', 'paid') NOT NULL DEFAULT 'draft',
    billing_data JSON,
    confirmed_at TIMESTAMP NULL,
    confirmed_by VARCHAR(255),
    paid_at TIMESTAMP NULL,
    paid_by VARCHAR(255),
    printed_at TIMESTAMP NULL,
    printed_by VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_mr_id (mr_id),
    INDEX idx_patient_id (patient_id),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE sunday_clinic_billings
    ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP NULL,
    ADD COLUMN IF NOT EXISTS paid_by VARCHAR(255) NULL,
    ADD COLUMN IF NOT EXISTS pending_changes BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS change_requests JSON NULL,
    ADD COLUMN IF NOT EXISTS last_modified_by VARCHAR(255) NULL,
    ADD COLUMN IF NOT EXISTS last_modified_at TIMESTAMP NULL;

CREATE TABLE IF NOT EXISTS sunday_clinic_billing_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    billing_id INT NOT NULL,
    item_type ENUM('tindakan', 'obat', 'admin') NOT NULL,
    item_code VARCHAR(50),
    item_name VARCHAR(255) NOT NULL,
    quantity INT NOT NULL DEFAULT 1,
    price DECIMAL(12, 2) NOT NULL DEFAULT 0,
    total DECIMAL(12, 2) NOT NULL DEFAULT 0,
    item_data JSON,
    INDEX idx_billing_id (billing_id),
    FOREIGN KEY (billing_id) REFERENCES sunday_clinic_billings(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sunday_clinic_billing_audit_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    billing_id INT NOT NULL,
    mr_id VARCHAR(50) NOT NULL,
    action VARCHAR(50) NOT NULL,
    actor_user_id VARCHAR(64) NULL,
    actor_name VARCHAR(255) NOT NULL,
    actor_role VARCHAR(100) NULL,
    summary TEXT NULL,
    before_snapshot JSON NULL,
    after_snapshot JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_billing_id (billing_id),
    INDEX idx_mr_id (mr_id),
    INDEX idx_action (action),
    INDEX idx_created_at (created_at),
    FOREIGN KEY (billing_id) REFERENCES sunday_clinic_billings(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sunday_clinic_additional_billings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    parent_billing_id INT NOT NULL,
    mr_id VARCHAR(50) NOT NULL,
    patient_id VARCHAR(10) NOT NULL,
    sequence_number INT UNSIGNED NOT NULL,
    reference_number VARCHAR(80) NOT NULL,
    subtotal DECIMAL(12, 2) NOT NULL DEFAULT 0,
    total DECIMAL(12, 2) NOT NULL DEFAULT 0,
    status ENUM('draft', 'confirmed', 'paid') NOT NULL DEFAULT 'draft',
    payment_method ENUM('cash', 'debit', 'transfer') NULL,
    payment_notes TEXT NULL,
    confirmed_at TIMESTAMP NULL,
    confirmed_by VARCHAR(255) NULL,
    paid_at TIMESTAMP NULL,
    paid_by VARCHAR(255) NULL,
    invoice_printed_at TIMESTAMP NULL,
    invoice_printed_by VARCHAR(255) NULL,
    invoice_url VARCHAR(500) NULL,
    etiket_printed_at TIMESTAMP NULL,
    etiket_printed_by VARCHAR(255) NULL,
    etiket_url VARCHAR(500) NULL,
    created_by VARCHAR(255) NULL,
    last_modified_by VARCHAR(255) NULL,
    last_modified_at TIMESTAMP NULL,
    metadata JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_sunday_clinic_additional_parent_sequence (parent_billing_id, sequence_number),
    UNIQUE KEY uq_sunday_clinic_additional_reference (reference_number),
    INDEX idx_sunday_clinic_additional_mr_id (mr_id),
    INDEX idx_sunday_clinic_additional_status (status),
    INDEX idx_sunday_clinic_additional_patient_id (patient_id),
    CONSTRAINT fk_sunday_clinic_additional_parent
        FOREIGN KEY (parent_billing_id) REFERENCES sunday_clinic_billings(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sunday_clinic_additional_billing_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    additional_billing_id INT NOT NULL,
    item_type ENUM('obat', 'admin') NOT NULL,
    item_code VARCHAR(50) NULL,
    item_name VARCHAR(255) NOT NULL,
    quantity INT NOT NULL DEFAULT 1,
    price DECIMAL(12, 2) NOT NULL DEFAULT 0,
    total DECIMAL(12, 2) NOT NULL DEFAULT 0,
    item_data JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_sunday_clinic_additional_item_billing (additional_billing_id),
    CONSTRAINT fk_sunday_clinic_additional_item_billing
        FOREIGN KEY (additional_billing_id) REFERENCES sunday_clinic_additional_billings(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sunday_clinic_additional_billing_audit_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    additional_billing_id INT NOT NULL,
    mr_id VARCHAR(50) NOT NULL,
    action VARCHAR(50) NOT NULL,
    actor_user_id VARCHAR(64) NULL,
    actor_name VARCHAR(255) NOT NULL,
    actor_role VARCHAR(100) NULL,
    summary TEXT NULL,
    before_snapshot JSON NULL,
    after_snapshot JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_sunday_clinic_additional_audit_billing (additional_billing_id),
    INDEX idx_sunday_clinic_additional_audit_mr_id (mr_id),
    INDEX idx_sunday_clinic_additional_audit_action (action),
    INDEX idx_sunday_clinic_additional_audit_created_at (created_at),
    CONSTRAINT fk_sunday_clinic_additional_audit_billing
        FOREIGN KEY (additional_billing_id) REFERENCES sunday_clinic_additional_billings(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sunday_clinic_prescription_templates (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    items JSON NOT NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_by VARCHAR(255) NULL,
    updated_by VARCHAR(255) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_active_name (is_active, name),
    INDEX idx_updated_at (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sunday_clinic_medify_sync_jobs (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    job_id VARCHAR(32) NOT NULL UNIQUE,
    mr_id VARCHAR(50) NOT NULL,
    patient_id VARCHAR(20) NOT NULL,
    visit_location VARCHAR(50) NOT NULL,
    job_type ENUM('diagnosis','terapi') NOT NULL,
    status ENUM('queued','processing','retrying','completed','failed','skipped') NOT NULL DEFAULT 'queued',
    attempt_count INT NOT NULL DEFAULT 0,
    next_retry_at DATETIME NULL,
    payload_json JSON NOT NULL,
    result_json JSON NULL,
    error_message TEXT NULL,
    last_error_at DATETIME NULL,
    created_by VARCHAR(255) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    completed_at DATETIME NULL,
    INDEX idx_status_retry (status, next_retry_at),
    INDEX idx_mr (mr_id),
    INDEX idx_patient (patient_id),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE clinic_queue_settings
    ADD COLUMN IF NOT EXISTS doctor_arrived TINYINT(1) NOT NULL DEFAULT 0 AFTER is_queue_visible;

ALTER TABLE booking_settings
    ADD COLUMN IF NOT EXISTS day_of_week TINYINT NOT NULL DEFAULT 0 AFTER session_name;

ALTER TABLE sunday_appointments
    ADD COLUMN IF NOT EXISTS confirmation_token VARCHAR(64) NULL UNIQUE AFTER status,
    ADD COLUMN IF NOT EXISTS confirmed_at DATETIME NULL AFTER confirmation_token,
    ADD COLUMN IF NOT EXISTS confirmation_popup_enabled_at DATETIME NULL AFTER confirmed_at;

ALTER TABLE sunday_appointments
    MODIFY COLUMN status ENUM('pending','pending_confirmation','confirmed','completed','cancelled','no_show') NOT NULL DEFAULT 'pending';

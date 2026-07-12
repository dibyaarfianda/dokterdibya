-- Migration: Create immutable, post-payment Sunday Clinic additional billings
-- Date: 2026-07-12

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

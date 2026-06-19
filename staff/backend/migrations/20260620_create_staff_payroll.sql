-- Migration: staff payroll batches and items for Gajian
-- Payroll cycle is 4 practice dates. Finalized batches reduce finance analysis by payroll_date.

CREATE TABLE IF NOT EXISTS staff_payroll_batches (
    id INT NOT NULL AUTO_INCREMENT,
    cycle_label VARCHAR(100) NOT NULL,
    cycle_start_date DATE NOT NULL,
    cycle_end_date DATE NOT NULL,
    payroll_date DATE NOT NULL,
    practice_dates_json LONGTEXT NOT NULL,
    status ENUM('draft', 'finalized') NOT NULL DEFAULT 'draft',
    total_amount INT NOT NULL DEFAULT 0,
    notes TEXT NULL,
    created_by VARCHAR(64) NULL,
    finalized_by VARCHAR(64) NULL,
    finalized_at DATETIME NULL,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uniq_staff_payroll_cycle_dates (cycle_start_date, cycle_end_date, practice_dates_json(255)),
    KEY idx_staff_payroll_status_date (status, payroll_date),
    KEY idx_staff_payroll_date (payroll_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS staff_payroll_items (
    id INT NOT NULL AUTO_INCREMENT,
    batch_id INT NOT NULL,
    staff_id VARCHAR(64) NOT NULL,
    staff_name VARCHAR(255) NOT NULL,
    role_name VARCHAR(50) NULL,
    role_display VARCHAR(100) NULL,
    attendance_dates_json LONGTEXT NOT NULL,
    attendance_count INT NOT NULL DEFAULT 0,
    base_amount INT NOT NULL DEFAULT 0,
    additional_count INT NOT NULL DEFAULT 0,
    additional_amount INT NOT NULL DEFAULT 0,
    adjustment_amount INT NOT NULL DEFAULT 0,
    total_amount INT NOT NULL DEFAULT 0,
    notes TEXT NULL,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uniq_staff_payroll_item (batch_id, staff_id),
    KEY idx_staff_payroll_item_staff (staff_id),
    CONSTRAINT fk_staff_payroll_items_batch
        FOREIGN KEY (batch_id) REFERENCES staff_payroll_batches(id)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO role_visibility (role_name, menu_key, is_visible) VALUES
    ('dokter',      'staff_payroll', 1),
    ('admin',       'staff_payroll', 0),
    ('managerial',  'staff_payroll', 0),
    ('bidan',       'staff_payroll', 0),
    ('front_office','staff_payroll', 0)
ON DUPLICATE KEY UPDATE is_visible = VALUES(is_visible);

-- Bayar di muka, Tahap 3: editable prepay packages (replace the four fixed products)
-- and patient requests to withdraw live saldo to a bank account.
-- Run AFTER 20261121_checkup_prepay_tahap2.sql (it links to patient_credit_refunds).
-- Tables are created here ONLY, never at runtime (see StaffPanelWave6StartupSchema.test.js).
-- No data is seeded here; copy the four legacy products with scripts/migrate-prepay-packages.js.
-- Safe to run more than once. Run on deploy: mysql -u root dibyaklinik < this file.

-- A package = a named set of tindakan/obat whose live price is the amount a patient prepays.
-- Kehamilan packages may carry an inclusive completed-week range; both null means any week.
CREATE TABLE IF NOT EXISTS checkup_prepay_packages (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(40) NOT NULL,                    -- stable slug for URLs/orders; legacy four keep their codes, new ones are pkg_<id>
    name VARCHAR(120) NOT NULL,
    description VARCHAR(255) NULL,
    category VARCHAR(20) NOT NULL,                -- a booking category code (constants/consultationCategories.js)
    week_min TINYINT UNSIGNED NULL,
    week_max TINYINT UNSIGNED NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    sort_order INT NOT NULL DEFAULT 0,
    created_by VARCHAR(64) NULL,
    updated_by VARCHAR(64) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_prepay_packages_code (code),
    KEY idx_prepay_packages_list (is_active, category, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS checkup_prepay_package_items (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    package_id INT UNSIGNED NOT NULL,
    item_type ENUM('tindakan','obat') NOT NULL,
    ref_id INT NOT NULL,                          -- tindakan.id or obat.id depending on item_type
    quantity SMALLINT UNSIGNED NOT NULL,
    sort_order INT NOT NULL DEFAULT 0,
    UNIQUE KEY uq_prepay_package_items (package_id, item_type, ref_id),
    CONSTRAINT fk_prepay_package_items_package FOREIGN KEY (package_id)
        REFERENCES checkup_prepay_packages (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- A patient asks to withdraw live saldo to a bank account; staff transfer it and mark it done
-- (done links to the patient_credit_refunds row that moves the ledger).
CREATE TABLE IF NOT EXISTS patient_credit_refund_requests (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    patient_id VARCHAR(50) NOT NULL,
    amount_idr INT UNSIGNED NOT NULL,
    bank_name VARCHAR(60) NOT NULL,
    account_number VARCHAR(40) NOT NULL,
    account_holder VARCHAR(120) NOT NULL,
    status ENUM('pending','done','rejected','cancelled') NOT NULL DEFAULT 'pending',
    request_key VARCHAR(80) NOT NULL,             -- client retry key; same key returns the saved request
    refund_id BIGINT UNSIGNED NULL,
    decision_note VARCHAR(500) NULL,
    decided_by VARCHAR(64) NULL,
    decided_at TIMESTAMP NULL DEFAULT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_refund_requests_key (request_key),
    KEY idx_refund_requests_status (status, created_at),
    KEY idx_refund_requests_patient (patient_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

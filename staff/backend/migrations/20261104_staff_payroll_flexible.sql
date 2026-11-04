-- Flexible staff payroll:
-- * cycle size follows active booking practice days (4 weeks x days/week), no
--   longer fixed at 4 dates (handled in code, practice_dates_json already flexible)
-- * configurable rates (default 150rb first attendance, 100rb each additional),
--   snapshotted per batch so changing rates never alters existing batches
-- * per-staff task allowance (tunjangan), paid only when the staff attended

CREATE TABLE IF NOT EXISTS staff_payroll_settings (
    id TINYINT UNSIGNED NOT NULL,
    base_amount INT UNSIGNED NOT NULL DEFAULT 150000,
    additional_rate INT UNSIGNED NOT NULL DEFAULT 100000,
    updated_by VARCHAR(64) NULL,
    updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO staff_payroll_settings (id, base_amount, additional_rate)
VALUES (1, 150000, 100000);

CREATE TABLE IF NOT EXISTS staff_payroll_allowances (
    staff_id VARCHAR(64) NOT NULL,
    label VARCHAR(100) NOT NULL,
    amount INT UNSIGNED NOT NULL DEFAULT 0,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    updated_by VARCHAR(64) NULL,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (staff_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE staff_payroll_batches
    ADD COLUMN IF NOT EXISTS base_rate INT UNSIGNED NULL AFTER practice_dates_json,
    ADD COLUMN IF NOT EXISTS additional_rate INT UNSIGNED NULL AFTER base_rate;

ALTER TABLE staff_payroll_items
    ADD COLUMN IF NOT EXISTS allowance_label VARCHAR(100) NULL AFTER additional_amount,
    ADD COLUMN IF NOT EXISTS allowance_amount INT NOT NULL DEFAULT 0 AFTER allowance_label;

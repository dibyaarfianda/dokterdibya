-- Monthly driver payroll for the doctor-only Private > Gajian module.
-- Salary is Rp1,500,000/month. Sundays are excluded from working days.

CREATE TABLE IF NOT EXISTS staff_driver_payrolls (
    id INT NOT NULL AUTO_INCREMENT,
    payroll_month DATE NOT NULL,
    calendar_days TINYINT UNSIGNED NOT NULL,
    sunday_count TINYINT UNSIGNED NOT NULL,
    working_days TINYINT UNSIGNED NOT NULL,
    monthly_salary INT UNSIGNED NOT NULL DEFAULT 1500000,
    absence_days TINYINT UNSIGNED NOT NULL DEFAULT 0,
    daily_deduction INT UNSIGNED NOT NULL,
    deduction_amount INT UNSIGNED NOT NULL DEFAULT 0,
    total_amount INT UNSIGNED NOT NULL,
    status ENUM('draft', 'finalized') NOT NULL DEFAULT 'draft',
    created_by VARCHAR(64) NULL,
    finalized_by VARCHAR(64) NULL,
    finalized_at DATETIME NULL,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uniq_staff_driver_payroll_month (payroll_month),
    KEY idx_staff_driver_payroll_status_month (status, payroll_month)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

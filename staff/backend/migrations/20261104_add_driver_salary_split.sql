-- Split driver salary into the fixed part paid by RSIA Melinda and the
-- configurable monthly bonus paid by dokterdibya.
-- monthly_salary stays the total (fixed_salary + doctor_bonus).
-- Historical Rp1,500,000 rows map to 1,000,000 + 500,000 via the defaults.

ALTER TABLE staff_driver_payrolls
    ADD COLUMN IF NOT EXISTS fixed_salary INT UNSIGNED NOT NULL DEFAULT 1000000 AFTER working_days,
    ADD COLUMN IF NOT EXISTS doctor_bonus INT UNSIGNED NOT NULL DEFAULT 500000 AFTER fixed_salary;

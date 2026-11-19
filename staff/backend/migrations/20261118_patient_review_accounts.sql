-- Review (test) accounts for payment-gateway reviewers such as Duitku.
-- Patient login is Google-only; these accounts get an email+password login that works only
-- while expires_at is in the future and revoked_at is NULL. The password hash lives here,
-- never in patients.password or users.password_hash.
-- Tables are created here ONLY, never at runtime (see StaffPanelWave6StartupSchema.test.js).
-- Safe to run more than once. Run on deploy: mysql -u root dibyaklinik < this file.

CREATE TABLE IF NOT EXISTS patient_review_accounts (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    patient_id VARCHAR(50) NOT NULL,
    password_hash VARCHAR(100) NOT NULL,          -- bcrypt
    label VARCHAR(120) NULL,                      -- e.g. "Duitku review"
    expires_at DATETIME NOT NULL,
    revoked_at DATETIME NULL,
    last_login_at DATETIME NULL,
    login_count INT UNSIGNED NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_review_accounts_patient (patient_id),
    KEY idx_review_accounts_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

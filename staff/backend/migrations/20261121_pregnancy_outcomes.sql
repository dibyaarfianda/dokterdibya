-- Pregnancy outcomes (keguguran / lahir mati): staff marks a pregnancy ended so its HPL stops showing.
-- Soft delete via voided_at/voided_by (kept for audit); only rows with voided_at IS NULL count.
-- patient_id matches patients.id (varchar(10) utf8mb4_unicode_ci).
-- Run on deploy: mysql -u root dibyaklinik < staff/backend/migrations/20261121_pregnancy_outcomes.sql
-- Until it exists, pregnancy lists fall back to birth records only (one warning logged).
CREATE TABLE IF NOT EXISTS pregnancy_outcomes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    patient_id VARCHAR(10) NOT NULL,
    outcome_type ENUM('keguguran','lahir_mati') NOT NULL,
    event_date DATE NOT NULL,
    note VARCHAR(500) NULL,
    recorded_by VARCHAR(64) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    voided_at DATETIME NULL,
    voided_by VARCHAR(64) NULL,
    KEY idx_po_patient_active (patient_id, voided_at, event_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

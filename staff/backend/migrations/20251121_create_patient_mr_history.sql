-- Create patient_mr_history table for Smart Triage System
-- This table tracks all MR IDs per patient across different categories
-- Usage: mysql -u root -p dibyaklinik < 20251121_create_patient_mr_history.sql

USE dibyaklinik;

-- Create patient MR history table
CREATE TABLE IF NOT EXISTS patient_mr_history (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    patient_id VARCHAR(10) NOT NULL,
    mr_id VARCHAR(20) NOT NULL,
    mr_category VARCHAR(20) NOT NULL,
    first_visit_date DATE NOT NULL,
    last_visit_date DATE NOT NULL,
    visit_count INT UNSIGNED NOT NULL DEFAULT 1,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    notes TEXT DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    UNIQUE KEY uq_patient_category (patient_id, mr_category),
    UNIQUE KEY uq_mr_id (mr_id),
    KEY idx_patient_id (patient_id),
    KEY idx_mr_category (mr_category),
    KEY idx_last_visit (last_visit_date),

    CONSTRAINT fk_pmh_patient FOREIGN KEY (patient_id)
        REFERENCES patients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Tracks patient MR IDs across different categories for smart triage';

-- Migrate existing sunday_clinic_records to patient_mr_history
-- This populates the history table with existing MR records
INSERT INTO patient_mr_history (
    patient_id,
    mr_id,
    mr_category,
    first_visit_date,
    last_visit_date,
    visit_count,
    created_at,
    updated_at
)
SELECT
    patient_id,
    mr_id,
    COALESCE(mr_category, 'obstetri') as mr_category,
    DATE(MIN(created_at)) as first_visit_date,
    DATE(MAX(last_activity_at)) as last_visit_date,
    COUNT(*) as visit_count,
    MIN(created_at) as created_at,
    MAX(updated_at) as updated_at
FROM sunday_clinic_records
WHERE patient_id IS NOT NULL
GROUP BY patient_id, mr_id, mr_category
ON DUPLICATE KEY UPDATE
    last_visit_date = VALUES(last_visit_date),
    visit_count = VALUES(visit_count),
    updated_at = VALUES(updated_at);

-- Add index to sunday_clinic_records for faster lookups
ALTER TABLE sunday_clinic_records
    ADD INDEX IF NOT EXISTS idx_patient_category (patient_id, mr_category);

SELECT 'Patient MR History table created and migrated successfully!' AS status;
SELECT COUNT(*) as total_mr_records FROM patient_mr_history;

-- Rollback script for patient_mr_history table
-- Usage: mysql -u root -p dibyaklinik < rollback_patient_mr_history.sql

USE dibyaklinik;

-- Drop the patient_mr_history table
DROP TABLE IF EXISTS patient_mr_history;

-- Remove added index from sunday_clinic_records
ALTER TABLE sunday_clinic_records
    DROP INDEX IF EXISTS idx_patient_category;

SELECT 'Patient MR History rollback completed!' AS status;

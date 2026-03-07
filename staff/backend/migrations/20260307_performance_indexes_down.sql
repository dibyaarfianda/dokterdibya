-- Performance Indexes Migration (DOWN / ROLLBACK)
-- Date: 2026-03-07
-- Reverses all changes from the UP migration.

-- 1. Drop patients sort index
ALTER TABLE patients DROP INDEX idx_patients_last_visit;

-- 2. Drop SCR composite index
ALTER TABLE sunday_clinic_records DROP INDEX idx_scr_patient_activity;

-- 3. Revert medical_records.patient_id collation to utf8mb4_general_ci
ALTER TABLE medical_records MODIFY COLUMN patient_id VARCHAR(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL;

-- 4. Revert medical_records.mr_id collation to utf8mb4_general_ci
ALTER TABLE medical_records MODIFY COLUMN mr_id VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;

-- 5. Drop patient_documents composite index
ALTER TABLE patient_documents DROP INDEX idx_pd_mr_type_status;

-- 6. Drop sunday_appointments composite index
ALTER TABLE sunday_appointments DROP INDEX idx_sa_patient_status_date;

-- 7. Drop medical_records composite index
ALTER TABLE medical_records DROP INDEX idx_mr_patient_type_created;

-- 8. Drop birth_congratulations index
ALTER TABLE birth_congratulations DROP INDEX idx_birth_patient;

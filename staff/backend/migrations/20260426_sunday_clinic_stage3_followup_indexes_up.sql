-- Sunday Clinic Stage 3 Follow-up Index Tuning (UP)
-- Date: 2026-04-26
-- Purpose: Accelerate check-existing lookup by patient + date range.

USE dibyaklinik;

SET @idx_exists := (
    SELECT COUNT(1)
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'sunday_clinic_records'
      AND index_name = 'idx_scr_patient_created_id'
);
SET @sql := IF(
    @idx_exists = 0,
    'ALTER TABLE sunday_clinic_records ADD INDEX idx_scr_patient_created_id (patient_id, created_at DESC, id DESC)',
    'SELECT "idx_scr_patient_created_id already exists"'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

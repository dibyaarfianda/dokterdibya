-- Sunday Clinic Stage 3 Follow-up Index Tuning (DOWN)
-- Date: 2026-04-26
-- Purpose: Roll back follow-up index if needed.

USE dibyaklinik;

SET @idx_exists := (
    SELECT COUNT(1)
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'sunday_clinic_records'
      AND index_name = 'idx_scr_patient_created_id'
);
SET @sql := IF(
    @idx_exists = 1,
    'ALTER TABLE sunday_clinic_records DROP INDEX idx_scr_patient_created_id',
    'SELECT "idx_scr_patient_created_id already absent"'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

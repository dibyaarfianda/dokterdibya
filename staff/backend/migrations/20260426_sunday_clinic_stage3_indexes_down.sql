-- Sunday Clinic Stage 3 Index Tuning (DOWN)
-- Date: 2026-04-26
-- Purpose: Roll back stage-3 indexes if needed.

USE dibyaklinik;

SET @idx_exists := (
    SELECT COUNT(1)
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'sunday_clinic_records'
      AND index_name = 'idx_scr_appointment_created_id'
);
SET @sql := IF(
    @idx_exists = 1,
    'ALTER TABLE sunday_clinic_records DROP INDEX idx_scr_appointment_created_id',
    'SELECT "idx_scr_appointment_created_id already absent"'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_exists := (
    SELECT COUNT(1)
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'sunday_clinic_records'
      AND index_name = 'idx_scr_patient_app_created_id'
);
SET @sql := IF(
    @idx_exists = 1,
    'ALTER TABLE sunday_clinic_records DROP INDEX idx_scr_patient_app_created_id',
    'SELECT "idx_scr_patient_app_created_id already absent"'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_exists := (
    SELECT COUNT(1)
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'sunday_clinic_records'
      AND index_name = 'idx_scr_updated_created'
);
SET @sql := IF(
    @idx_exists = 1,
    'ALTER TABLE sunday_clinic_records DROP INDEX idx_scr_updated_created',
    'SELECT "idx_scr_updated_created already absent"'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_exists := (
    SELECT COUNT(1)
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'sunday_appointments'
      AND index_name = 'idx_sa_date_status_session_slot'
);
SET @sql := IF(
    @idx_exists = 1,
    'ALTER TABLE sunday_appointments DROP INDEX idx_sa_date_status_session_slot',
    'SELECT "idx_sa_date_status_session_slot already absent"'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

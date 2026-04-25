-- Sunday Clinic Stage 3 Index Tuning (UP)
-- Date: 2026-04-26
-- Purpose: Remove filesort hotspots for stage-2 optimized Sunday Clinic queries.

USE dibyaklinik;

-- 1) Latest record by appointment lookup (queue/today subquery scrx)
SET @idx_exists := (
    SELECT COUNT(1)
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'sunday_clinic_records'
      AND index_name = 'idx_scr_appointment_created_id'
);
SET @sql := IF(
    @idx_exists = 0,
    'ALTER TABLE sunday_clinic_records ADD INDEX idx_scr_appointment_created_id (appointment_id, created_at DESC, id DESC)',
    'SELECT "idx_scr_appointment_created_id already exists"'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2) Patient/day latest lookup with appointment NULL fallback (queue/today subquery scry)
SET @idx_exists := (
    SELECT COUNT(1)
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'sunday_clinic_records'
      AND index_name = 'idx_scr_patient_app_created_id'
);
SET @sql := IF(
    @idx_exists = 0,
    'ALTER TABLE sunday_clinic_records ADD INDEX idx_scr_patient_app_created_id (patient_id, appointment_id, created_at DESC, id DESC)',
    'SELECT "idx_scr_patient_app_created_id already exists"'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 3) Directory default sort optimization (ORDER BY updated_at DESC, created_at DESC)
SET @idx_exists := (
    SELECT COUNT(1)
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'sunday_clinic_records'
      AND index_name = 'idx_scr_updated_created'
);
SET @sql := IF(
    @idx_exists = 0,
    'ALTER TABLE sunday_clinic_records ADD INDEX idx_scr_updated_created (updated_at DESC, created_at DESC)',
    'SELECT "idx_scr_updated_created already exists"'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 4) Queue base filter + order optimization on appointments
SET @idx_exists := (
    SELECT COUNT(1)
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'sunday_appointments'
      AND index_name = 'idx_sa_date_status_session_slot'
);
SET @sql := IF(
    @idx_exists = 0,
    'ALTER TABLE sunday_appointments ADD INDEX idx_sa_date_status_session_slot (appointment_date, status, session, slot_number)',
    'SELECT "idx_sa_date_status_session_slot already exists"'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Booking Session Templates v2 (additive)
-- Purpose: allow session templates per practice day without rewriting existing appointments.
-- Safe rollout:
--   1. Run this migration before enabling BOOKING_SESSION_V2_ENABLED.
--   2. Keep sunday_appointments.session unchanged for backward compatibility.

USE dibyaklinik;

SET @legacy_day_column_exists := (
    SELECT COUNT(1)
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'booking_settings'
      AND column_name = 'day_of_week'
);
SET @sql := IF(
    @legacy_day_column_exists = 0,
    'ALTER TABLE booking_settings ADD COLUMN day_of_week TINYINT NOT NULL DEFAULT 0 AFTER session_name',
    'SELECT "booking_settings.day_of_week already exists"'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS booking_session_templates (
    id INT AUTO_INCREMENT PRIMARY KEY,
    session_number INT NOT NULL,
    session_name VARCHAR(100) NOT NULL,
    day_of_week TINYINT NOT NULL DEFAULT 0,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    slot_duration INT NOT NULL DEFAULT 15,
    max_slots INT NOT NULL DEFAULT 10,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    legacy_booking_setting_id INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_booking_session_templates_day_session (day_of_week, session_number),
    INDEX idx_booking_session_templates_active_day (is_active, day_of_week, session_number),
    INDEX idx_booking_session_templates_legacy (legacy_booking_setting_id)
);

SET @column_exists := (
    SELECT COUNT(1)
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'sunday_appointments'
      AND column_name = 'booking_session_template_id'
);
SET @sql := IF(
    @column_exists = 0,
    'ALTER TABLE sunday_appointments ADD COLUMN booking_session_template_id INT NULL AFTER session',
    'SELECT "sunday_appointments.booking_session_template_id already exists"'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_exists := (
    SELECT COUNT(1)
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'sunday_appointments'
      AND index_name = 'idx_sa_booking_session_template'
);
SET @sql := IF(
    @idx_exists = 0,
    'ALTER TABLE sunday_appointments ADD INDEX idx_sa_booking_session_template (booking_session_template_id)',
    'SELECT "idx_sa_booking_session_template already exists"'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

INSERT IGNORE INTO booking_session_templates
    (session_number, session_name, day_of_week, start_time, end_time, slot_duration, max_slots, is_active, legacy_booking_setting_id)
SELECT
    bs.session_number,
    bs.session_name,
    COALESCE(bs.day_of_week, 0),
    bs.start_time,
    bs.end_time,
    bs.slot_duration,
    bs.max_slots,
    bs.is_active,
    bs.id
FROM booking_settings bs
LEFT JOIN booking_session_templates bst
    ON bst.legacy_booking_setting_id = bs.id
WHERE bst.id IS NULL;

-- Nullable defaults preserve all existing session times. Apply before deploying the new backend.
ALTER TABLE booking_settings
    ADD COLUMN IF NOT EXISTS break_start_time TIME NULL DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS break_duration_minutes SMALLINT UNSIGNED NULL DEFAULT NULL;

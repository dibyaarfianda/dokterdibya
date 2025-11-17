-- Add cancellation metadata for Sunday appointments
-- Run with: mysql -u root -p dibyaklinik < 20251117_add_cancellation_fields.sql

USE dibyaklinik;

ALTER TABLE sunday_appointments
    ADD COLUMN cancellation_reason TEXT NULL AFTER notes,
    ADD COLUMN cancelled_by ENUM('patient', 'staff', 'system') NULL AFTER cancellation_reason,
    ADD COLUMN cancelled_at DATETIME NULL AFTER cancelled_by;

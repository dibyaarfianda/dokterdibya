-- Migration: Add exam status tracking for live queue feature
-- Date: 2026-05-16
-- Purpose: Track when staff starts examining a patient (for live queue status)
--          and add clinic queue settings (visibility toggle)

USE dibyaklinik;

-- 1. Add exam_started_at column to sunday_clinic_records
ALTER TABLE sunday_clinic_records
    ADD COLUMN IF NOT EXISTS exam_started_at DATETIME NULL DEFAULT NULL AFTER status;

ALTER TABLE sunday_clinic_records
    ADD INDEX IF NOT EXISTS idx_scr_exam_started (exam_started_at);

-- 2. Create clinic_queue_settings table for staff visibility toggle
CREATE TABLE IF NOT EXISTS clinic_queue_settings (
    id INT NOT NULL DEFAULT 1,
    is_queue_visible TINYINT(1) NOT NULL DEFAULT 0,
    queue_label VARCHAR(100) NOT NULL DEFAULT 'Antrian Klinik Privat Dr. Dibya',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by VARCHAR(50) NULL,
    PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Controls whether live queue is visible on patient portal';

-- Insert default row (id=1 is the singleton config row)
INSERT INTO clinic_queue_settings (id, is_queue_visible)
VALUES (1, 0)
ON DUPLICATE KEY UPDATE id = 1;

SELECT 'Migration 20260516_queue_exam_status completed successfully!' AS status;
SELECT is_queue_visible, queue_label, updated_at FROM clinic_queue_settings WHERE id = 1;

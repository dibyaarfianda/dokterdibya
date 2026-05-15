-- Migration: Add queue_status enum to sunday_clinic_records
-- Run after: 20260516_queue_exam_status.sql (which added exam_started_at and clinic_queue_settings)
-- Date: 2026-05-16

ALTER TABLE sunday_clinic_records
    ADD COLUMN IF NOT EXISTS queue_status
        ENUM('menunggu','anamnesa','diperiksa','selesai_periksa','lunas')
        NOT NULL DEFAULT 'menunggu'
        AFTER exam_started_at;

-- Index for fast status filtering on public queue
ALTER TABLE sunday_clinic_records
    ADD INDEX IF NOT EXISTS idx_scr_queue_status (queue_status);

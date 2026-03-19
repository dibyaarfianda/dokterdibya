-- DocBoard Phase 4 Migration
-- Idempotency key for offline queue replay

ALTER TABLE surgery_schedules
  ADD COLUMN idempotency_key VARCHAR(64) NULL COMMENT 'Client-generated UUID for offline dedup' AFTER created_by,
  ADD UNIQUE KEY uq_idempotency (idempotency_key);

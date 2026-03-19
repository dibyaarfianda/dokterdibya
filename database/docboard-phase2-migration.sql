-- DocBoard Phase 2 Migration
-- Slice A: Anesthesia fields on surgery_schedules
-- Slice B: Surgery audit log table

-- =====================================================
-- SLICE A: Add anesthesia columns to surgery_schedules
-- =====================================================

ALTER TABLE surgery_schedules
  ADD COLUMN anesthesia_type VARCHAR(100) NULL COMMENT 'GA, Spinal, Epidural, Combined, Local, Sedation' AFTER estimated_duration_min,
  ADD COLUMN asa_score TINYINT UNSIGNED NULL COMMENT 'ASA Physical Status 1-5' AFTER anesthesia_type,
  ADD COLUMN npo_status VARCHAR(100) NULL COMMENT 'NPO since time or status text' AFTER asa_score;

-- =====================================================
-- SLICE B: Surgery audit log
-- =====================================================

CREATE TABLE IF NOT EXISTS surgery_audit_log (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    surgery_id BIGINT UNSIGNED NOT NULL,
    action VARCHAR(50) NOT NULL COMMENT 'created, updated, status_changed',
    user_id VARCHAR(50) NULL,
    changes JSON NULL COMMENT 'Summary of what changed',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_surgery_id (surgery_id),
    INDEX idx_created_at (created_at),
    FOREIGN KEY (surgery_id) REFERENCES surgery_schedules(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

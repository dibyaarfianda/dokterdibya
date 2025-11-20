-- Migration: Add MR Category System for Sunday Clinic
-- Purpose: Implement category-based MR ID naming (MROBS, MRGPR, MRGPS)
-- Date: 2025-11-20
-- Usage: mysql -u root -p dibyaklinik < 20251120_add_mr_category_system.sql

USE dibyaklinik;

-- Step 1: Add new columns to sunday_clinic_records table
ALTER TABLE sunday_clinic_records
ADD COLUMN mr_category ENUM('obstetri', 'gyn_repro', 'gyn_special') NULL AFTER mr_id,
ADD COLUMN mr_sequence INT UNSIGNED NULL AFTER mr_category,
ADD INDEX idx_mr_category (mr_category),
ADD INDEX idx_mr_sequence (mr_sequence),
ADD INDEX idx_category_sequence (mr_category, mr_sequence);

-- Step 2: Create MR ID counter table
CREATE TABLE IF NOT EXISTS sunday_clinic_mr_counters (
    category ENUM('obstetri', 'gyn_repro', 'gyn_special') NOT NULL,
    current_sequence INT UNSIGNED NOT NULL DEFAULT 0,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Step 3: Initialize counters (start from 0, will increment to 1 on first use)
INSERT INTO sunday_clinic_mr_counters (category, current_sequence) VALUES
('obstetri', 0),
('gyn_repro', 0),
('gyn_special', 0)
ON DUPLICATE KEY UPDATE current_sequence = current_sequence;

-- Step 4: Add comment to explain the new system
ALTER TABLE sunday_clinic_records
COMMENT = 'Sunday Clinic medical records with category-based MR IDs (MROBS/MRGPR/MRGPS)';

ALTER TABLE sunday_clinic_mr_counters
COMMENT = 'Sequence counters for category-based MR ID generation';

-- Step 5: Show current state
SELECT 'Migration completed successfully!' as status;
SELECT * FROM sunday_clinic_mr_counters;

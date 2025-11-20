-- Add MR Category System to Sunday Clinic
-- This adds category-based MR ID generation (MROBS, MRGPR, MRGPS)
-- Usage: mysql -u root -p dibyaklinik < 20251121_add_mr_category_system.sql

USE dibyaklinik;

-- Create MR counters table for category-based MR IDs
CREATE TABLE IF NOT EXISTS sunday_clinic_mr_counters (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    category VARCHAR(20) NOT NULL,
    current_sequence INT UNSIGNED NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_category (category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Initialize counters for each category
INSERT INTO sunday_clinic_mr_counters (category, current_sequence)
VALUES
    ('obstetri', 0),
    ('gyn_repro', 0),
    ('gyn_special', 0)
ON DUPLICATE KEY UPDATE category = category;

-- Add category and sequence columns to sunday_clinic_records if they don't exist
ALTER TABLE sunday_clinic_records
    ADD COLUMN IF NOT EXISTS mr_category VARCHAR(20) DEFAULT 'obstetri' AFTER mr_id,
    ADD COLUMN IF NOT EXISTS mr_sequence INT UNSIGNED DEFAULT NULL AFTER mr_category;

-- Add indexes for performance
ALTER TABLE sunday_clinic_records
    ADD INDEX IF NOT EXISTS idx_mr_category (mr_category),
    ADD INDEX IF NOT EXISTS idx_mr_sequence (mr_sequence);

-- Update existing records to have category 'obstetri' if NULL
UPDATE sunday_clinic_records
SET mr_category = 'obstetri'
WHERE mr_category IS NULL;

SELECT 'Sunday Clinic MR Category System migration completed successfully!' AS status;

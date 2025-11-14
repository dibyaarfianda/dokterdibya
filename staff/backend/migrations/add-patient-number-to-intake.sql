-- Migration: Add patient_number as unique identifier for intake submissions
-- Purpose: Use 6-digit random patient number instead of phone for duplicate detection
-- Date: 2025-11-15

-- Add patient_number column (6 digits)
ALTER TABLE patient_intake_submissions
ADD COLUMN patient_number VARCHAR(6) NULL AFTER patient_id,
ADD UNIQUE INDEX idx_patient_number (patient_number);

-- Add comment
ALTER TABLE patient_intake_submissions 
MODIFY COLUMN patient_number VARCHAR(6) 
COMMENT '6-digit unique patient identifier for intake form';

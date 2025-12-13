-- Migration: Add patient upload capability to patient_documents
-- Purpose: Allow patients to upload their own previous USG and lab results
-- Date: 2025-11-29

USE dibyaklinik;

-- Add source column to distinguish clinic vs patient uploads
ALTER TABLE patient_documents
ADD COLUMN IF NOT EXISTS source ENUM('clinic', 'patient') NOT NULL DEFAULT 'clinic' AFTER status;

-- Add original_date column for patient to specify when the document was originally created
ALTER TABLE patient_documents
ADD COLUMN IF NOT EXISTS original_date DATE NULL AFTER source;

-- Add uploaded_by_patient column to track if patient uploaded it
ALTER TABLE patient_documents
ADD COLUMN IF NOT EXISTS uploaded_by_patient TINYINT(1) NOT NULL DEFAULT 0 AFTER original_date;

-- Add index for source queries
ALTER TABLE patient_documents
ADD INDEX IF NOT EXISTS idx_patient_docs_source (source);

-- Update document_type ENUM to include patient upload types
ALTER TABLE patient_documents
MODIFY COLUMN document_type ENUM(
    'resume_medis',      -- AI-generated medical summary PDF
    'usg_2d',            -- 2D ultrasound image
    'usg_4d',            -- 4D ultrasound image/video
    'usg_photo',         -- Generic USG photo
    'lab_result',        -- Laboratory result
    'lab_interpretation', -- AI interpretation of lab results
    'prescription',      -- Resep obat
    'referral',          -- Surat rujukan
    'certificate',       -- Surat keterangan
    'patient_usg',       -- Patient-uploaded USG (historical)
    'patient_lab',       -- Patient-uploaded lab result (historical)
    'patient_other',     -- Patient-uploaded other document
    'other'              -- Other documents
) NOT NULL;

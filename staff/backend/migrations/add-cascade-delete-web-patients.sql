-- Migration: Add CASCADE DELETE rules for web_patients
-- Date: 2025-11-13
-- Purpose: When a web_patient is deleted, automatically delete related records

-- Step 1: Create trigger to delete medical_records when web_patient is deleted
DELIMITER $$

DROP TRIGGER IF EXISTS before_web_patient_delete$$

CREATE TRIGGER before_web_patient_delete
BEFORE DELETE ON web_patients
FOR EACH ROW
BEGIN
    -- Delete medical records associated with this patient's medical_record_id
    DELETE FROM medical_records WHERE patient_id = OLD.medical_record_id COLLATE utf8mb4_general_ci;
END$$

DELIMITER ;

-- Step 2: Verify trigger was created
SELECT 
    TRIGGER_NAME,
    EVENT_MANIPULATION,
    EVENT_OBJECT_TABLE,
    ACTION_TIMING
FROM information_schema.TRIGGERS
WHERE TRIGGER_SCHEMA = 'dibyaklinik'
AND TRIGGER_NAME = 'before_web_patient_delete';

-- Note: This trigger will:
-- 1. Delete all medical_records entries for this patient (cascade delete)
-- 2. Execute BEFORE the patient is deleted from web_patients table
-- 3. Email is automatically removed when patient record is deleted (UNIQUE constraint handles it)

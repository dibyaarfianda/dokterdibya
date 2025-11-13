-- Migration: Change web_patients.id from INT to VARCHAR(10) with 5-digit format
-- This aligns web_patients with patients table structure

-- Step 1: Add new column for new ID format
ALTER TABLE web_patients ADD COLUMN medical_record_id VARCHAR(10) NULL AFTER id;

-- Step 2: Generate 5-digit IDs for existing web_patients
-- Start from max patients ID + 1
SET @max_id = (SELECT COALESCE(MAX(CAST(id AS UNSIGNED)), 0) FROM patients);

UPDATE web_patients 
SET medical_record_id = LPAD(@max_id := @max_id + 1, 5, '0')
WHERE medical_record_id IS NULL
ORDER BY id;

-- Step 3: Add unique index
ALTER TABLE web_patients ADD UNIQUE KEY idx_medical_record_id (medical_record_id);

-- Step 4: Make it NOT NULL
ALTER TABLE web_patients MODIFY COLUMN medical_record_id VARCHAR(10) NOT NULL;

-- Note: We keep the old 'id' column for now to maintain FK relationships
-- The 'medical_record_id' will be used for cross-referencing with patients table
-- Later we can fully migrate if needed

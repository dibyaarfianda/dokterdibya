-- Migration: Merge web_patients into patients table
-- Date: 2025-11-13
-- Purpose: Unify patient tables - no more distinction between web and staff patients

-- Step 1: Modify patients table to accommodate web_patients data
ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS profile_completed TINYINT(1) DEFAULT 1 AFTER status,
  MODIFY COLUMN id VARCHAR(10) NOT NULL;

-- Step 2: Ensure email and google_id are indexed properly
ALTER TABLE patients
  ADD UNIQUE KEY IF NOT EXISTS idx_email (email),
  ADD UNIQUE KEY IF NOT EXISTS idx_google_id (google_id);

-- Step 3: Migrate data from web_patients to patients
-- Insert web patients into patients table
INSERT INTO patients (
  id,
  full_name,
  email,
  phone,
  whatsapp,
  birth_date,
  age,
  password,
  google_id,
  photo_url,
  registration_date,
  status,
  profile_completed,
  created_at,
  updated_at
)
SELECT 
  medical_record_id as id,
  fullname as full_name,
  email,
  phone,
  phone as whatsapp,  -- Use phone as whatsapp
  birth_date,
  age,
  password,
  google_id,
  photo_url,
  registration_date,
  status,
  profile_completed,
  created_at,
  updated_at
FROM web_patients
WHERE medical_record_id NOT IN (SELECT id FROM patients)
ON DUPLICATE KEY UPDATE
  full_name = VALUES(full_name),
  email = VALUES(email),
  phone = VALUES(phone),
  whatsapp = VALUES(whatsapp),
  birth_date = VALUES(birth_date),
  age = VALUES(age),
  password = VALUES(password),
  google_id = VALUES(google_id),
  photo_url = VALUES(photo_url),
  updated_at = NOW();

-- Step 4: Show migration results
SELECT 
  'Migration Complete' as status,
  (SELECT COUNT(*) FROM patients) as total_patients,
  (SELECT COUNT(*) FROM patients WHERE profile_completed = 1) as completed_profiles,
  (SELECT COUNT(*) FROM patients WHERE password IS NOT NULL) as patients_with_login;

-- Step 5: Backup web_patients to archive table before dropping
CREATE TABLE IF NOT EXISTS web_patients_archive LIKE web_patients;
INSERT INTO web_patients_archive SELECT * FROM web_patients;

-- Step 6: Drop the old trigger
DROP TRIGGER IF EXISTS before_web_patient_delete;

-- Note: After verifying everything works, you can drop web_patients table with:
-- DROP TABLE web_patients;
-- But keep it for now for safety

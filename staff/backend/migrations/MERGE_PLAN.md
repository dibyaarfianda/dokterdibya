# Backend Code Changes untuk Unified Patients Table

## Files yang Perlu Diupdate:

### 1. `/backend/routes/patients-auth.js`
**Changes needed:**
- Replace all `web_patients` → `patients`
- Replace column `fullname` → `full_name` 
- Replace column `medical_record_id` → `id` (as primary key)
- Update `generateUniqueMedicalRecordId()` to return format compatible with existing id
- Remove references to checking both tables

**Key Changes:**
```sql
-- OLD:
SELECT id FROM web_patients WHERE email = ?
INSERT INTO web_patients (medical_record_id, fullname, email, phone, password) VALUES (?, ?, ?, ?, ?)

-- NEW:
SELECT id FROM patients WHERE email = ?
INSERT INTO patients (id, full_name, email, phone, password) VALUES (?, ?, ?, ?, ?)
```

**JWT Token Changes:**
- Token payload should include `id` (not separate medical_record_id and id)
- Token includes: `{ id: patient.id, email, full_name, role: 'patient' }`

### 2. `/backend/routes/patients.js` (staff patient management)
**Verify:**
- Already uses `patients` table ✓
- Uses `id` as VARCHAR(10) ✓
- Uses `full_name` column ✓
- No changes needed if already using patients table

### 3. `/backend/routes/medical-records.js`
**Check:**
- Uses `patient_id` to reference patients
- Should work with unified table as long as patient IDs are consistent

### 4. Frontend Changes:

#### `/public/js/complete-profile-v3.js`
**Token structure:**
- Currently expects: `medicalRecordId` in token
- Should use: `id` instead

#### `/staff/public/scripts/medical-record.js`
- Uses `/api/patients/{id}` endpoint
- Should work without changes

### 5. Database Cleanup (after verification):
```sql
-- After everything works:
DROP TABLE web_patients;
DROP TABLE web_patients_archive;
```

## Migration Steps:

1. ✓ Add profile_completed column to patients table
2. ✓ Migrate data from web_patients to patients  
3. ✓ Create backup (web_patients_archive)
4. → Update patients-auth.js
5. → Update frontend token handling
6. → Test registration flow
7. → Test login flow
8. → Test complete profile flow
9. → Test medical records
10. → Drop web_patients table

## Column Mapping:

| web_patients | patients | Notes |
|---|---|---|
| id (INT AUTO_INCREMENT) | - | No longer used |
| medical_record_id (VARCHAR) | id (VARCHAR PRIMARY KEY) | Main identifier |
| fullname | full_name | Renamed |
| email | email | Same |
| phone | phone, whatsapp | phone copied to both |
| birth_date | birth_date | Same |
| age | age | Same |
| password | password | Same |
| google_id | google_id | Same |
| photo_url | photo_url | Same |
| registration_date | registration_date | Same |
| status | status | Same |
| profile_completed | profile_completed | Added to patients |
| created_at | created_at | Same |
| updated_at | updated_at | Same |

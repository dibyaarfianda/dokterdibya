# Web Patient Sync Implementation

## Overview
This document explains the automatic synchronization system between `web_patients` table (JWT-authenticated web registrations) and `patients` table (main patient database used across the system).

## Problem
- Web patients who register through the patient portal (`/login.html`) are stored in `web_patients` table
- Regular patient management functions (like delete from Data Pasien page) only work with `patients` table
- This caused "Pasien tidak ditemukan" (Patient not found) errors when trying to manage web patients from the main patient list

## Solution

### 1. Automatic Sync on Profile Completion
When a web patient completes their profile (mandatory step after registration), the system automatically:
- Generates a new patient ID in format `P###` (P001, P002, etc.)
- Inserts the patient data into the `patients` table
- Maps fields appropriately between tables

**File Modified:** `/var/www/dokterdibya/staff/backend/routes/patients-auth.js`
- Endpoint: `POST /api/patients/complete-profile`
- Triggers sync after updating `web_patients.profile_completed = 1`

### 2. Manual Sync for Existing Patients
A superadmin-only endpoint to sync all existing completed web patients to the patients table.

**File Modified:** `/var/www/dokterdibya/staff/backend/routes/auth.js`
- Endpoint: `POST /api/admin/sync-web-patients`
- Role: Superadmin only
- Function: Syncs all `web_patients` where `profile_completed = 1`

**UI Button Added:** `/var/www/dokterdibya/staff/public/index-adminlte.html`
- Location: Kelola Pasien Web page header
- Button: "Sinkronisasi ke Data Pasien"
- Shows results: synced count, skipped count, errors

## Field Mapping

| web_patients | patients | Notes |
|--------------|----------|-------|
| id (auto_increment) | - | Not used in patients table |
| fullname | full_name | Field name differs |
| email | email | Direct mapping |
| phone | whatsapp | Phone is used for both whatsapp and phone fields |
| phone | phone | Same value as whatsapp |
| birth_date | birth_date | Direct mapping |
| age | age | Direct mapping |
| google_id | google_id | Direct mapping (NULL for email registrations) |
| photo_url | photo_url | Direct mapping |
| password | password | Direct mapping |
| registration_date | registration_date | Direct mapping |
| status | status | Direct mapping (default: 'active') |
| - | id | Generated as P### format |
| - | is_pregnant | Default: 0 |
| - | visit_count | Default: 0 |
| - | allergy | Default: NULL |
| - | medical_history | Default: NULL |

## Patient ID Generation Logic

```javascript
// Get the highest existing P### ID
SELECT id FROM patients 
WHERE id REGEXP '^P[0-9]+$' 
ORDER BY CAST(SUBSTRING(id, 2) AS UNSIGNED) DESC 
LIMIT 1

// Extract number, increment, and format
nextNumber = parseInt(maxId.substring(1)) + 1
newPatientId = 'P' + String(nextNumber).padStart(3, '0')
// Examples: P001, P002, P003, ..., P999, P1000
```

## Duplicate Prevention
The sync process checks if a patient already exists in the `patients` table by:
- Matching email OR phone number
- Skips insertion if found
- Prevents duplicate entries

## Error Handling
- Sync errors are logged but don't fail the profile completion
- Manual sync endpoint returns detailed results including errors
- Continues processing remaining patients even if one fails

## Testing

### Test New Registration
1. Register a new patient at `/login.html`
2. Complete profile at `/complete-profile.html`
3. Check both tables:
```sql
SELECT id, fullname, email, phone FROM web_patients WHERE email = 'test@example.com';
SELECT id, full_name, email, whatsapp FROM patients WHERE email = 'test@example.com';
```

### Test Manual Sync
1. Login as superadmin to staff panel
2. Go to "Kelola Pasien Web" menu
3. Click "Sinkronisasi ke Data Pasien" button
4. Check results in the alert message

### Verify Delete Works
1. Go to "Data Pasien" page in staff panel
2. Find a web-registered patient (check by email)
3. Try to delete - should work now without "Pasien tidak ditemukan" error

## Database Tables

### web_patients Structure
```sql
CREATE TABLE web_patients (
    id INT AUTO_INCREMENT PRIMARY KEY,
    fullname VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(20),
    birth_date DATE,
    age INT,
    password VARCHAR(255),
    google_id VARCHAR(255) UNIQUE,
    photo_url VARCHAR(500),
    registration_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status ENUM('active', 'inactive', 'suspended') DEFAULT 'active',
    profile_completed TINYINT(1) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

### patients Structure
```sql
CREATE TABLE patients (
    id VARCHAR(10) PRIMARY KEY,
    full_name VARCHAR(255) NOT NULL,
    whatsapp VARCHAR(20),
    email VARCHAR(255) UNIQUE,
    phone VARCHAR(20),
    birth_date DATE,
    age INT,
    is_pregnant TINYINT(1) DEFAULT 0,
    allergy TEXT,
    medical_history TEXT,
    last_visit TIMESTAMP,
    visit_count INT DEFAULT 0,
    google_id VARCHAR(255) UNIQUE,
    photo_url VARCHAR(500),
    password VARCHAR(255),
    registration_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status ENUM('active', 'inactive', 'suspended') DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

## Benefits
1. **Unified Patient Database:** All patients (staff-created and web-registered) are in the same `patients` table
2. **Consistent Management:** All patient management functions work for web patients
3. **Automatic Sync:** No manual intervention needed for new registrations
4. **Safe Operations:** Duplicate prevention and error handling
5. **Audit Trail:** All sync operations are logged in backend console

## Future Improvements
1. Add sync status field to `web_patients` to track if synced
2. Create database trigger for automatic sync on profile completion
3. Add reverse sync for updates (if patient info changes in either table)
4. Create unified view that combines both tables automatically
5. Add sync history/audit table

## Related Files
- `/var/www/dokterdibya/staff/backend/routes/patients-auth.js` - Web patient endpoints
- `/var/www/dokterdibya/staff/backend/routes/auth.js` - Admin endpoints including sync
- `/var/www/dokterdibya/staff/public/index-adminlte.html` - Admin UI with sync button
- `/var/www/dokterdibya/public/complete-profile.html` - Profile completion form

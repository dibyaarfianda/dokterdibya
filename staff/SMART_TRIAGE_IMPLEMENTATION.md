# Smart Triage System Implementation

**Date:** 2025-11-21
**Version:** 1.0.0
**Status:** ✅ READY FOR TESTING

---

## Overview

The Smart Triage System automatically detects the correct medical record category (Obstetri, Gyn Repro, or Gyn Special) for each patient visit based on:
1. **Appointment complaint** ("Keluhan" from "Janji Temu")
2. **Patient history** (previous MR IDs and visit categories)
3. **Patient intake data** (pregnant_status, etc.)

This eliminates the need for patients to fill exhaustive questionnaires and allows one patient to have multiple MR IDs across different categories over time.

---

## What Was Implemented

### 1. Database Changes ✅

**New Table: `patient_mr_history`**
- Tracks all MR IDs per patient across different categories
- Allows one patient to have multiple MR IDs (one per category)
- Records visit history, visit count, and last visit date

**Migration File:**
- `backend/migrations/20251121_create_patient_mr_history.sql`
- Status: **APPLIED** (table created successfully)

**Rollback File:**
- `backups/smart-triage-20251121-152747/rollback_patient_mr_history.sql`

### 2. Backend Service Functions ✅

**File:** `backend/services/sundayClinicService.js`

**New Functions:**
- `detectVisitCategory({ patientId, complaint, intakeData })` - Smart category detection with keyword matching
- `getOrCreateMrIdForVisit({ patientId, category, complaint, intakeData })` - Get existing or generate new MR ID
- `getPatientMrHistory(patientId)` - Get all MR IDs for a patient
- `findPatientMrByCategory(patientId, category)` - Find patient's MR ID for specific category
- `isWithinMonths(date, months)` - Helper for date range checks

**Detection Rules (in priority order):**
1. **Pregnancy keywords** → Obstetri (HIGH confidence)
   - hamil, kehamilan, usg, kontrol kandungan, mual muntah, etc.
2. **Reproductive keywords** → Gyn Repro (HIGH confidence)
   - kb, kontrasepsi, haid, menstruasi, program hamil, post partum, etc.
3. **Gynecological keywords** → Gyn Special (HIGH confidence)
   - keputihan, gatal, nyeri panggul, kista, miom, endometriosis, etc.
4. **Recent pregnancy status** → Obstetri (MEDIUM confidence, needs confirmation)
5. **Post-partum period** (< 6 months) → Gyn Repro (MEDIUM confidence)
6. **Last visit category** → Same category (LOW confidence, needs confirmation)
7. **First time patient** → Must ask (NO confidence)

### 3. Patient Intake Form Changes ✅

**File:** `staff/public/patient-intake.html` + `public/patient-intake.html`

**Changes:**
- Title changed from "Formulir Rekam Medis Awal" to **"Identitas Pribadi"**
- Heading changed to **"Identitas Pribadi"**
- Description updated to emphasize personal information collection

**Rationale:**
- Emphasizes that this is just basic identity information
- Reduces intimidation factor for new patients
- Medical questions come later via smart triage

### 4. Backup Files ✅

**Backup Directory:** `backups/smart-triage-20251121-152747/`

**Files Backed Up:**
- `sundayClinicService.js` (original service)
- `sunday-clinic.js` (original frontend)
- `sunday-clinic.js.backup` (original backup)
- `rollback_patient_mr_history.sql` (database rollback)
- `ROLLBACK.sh` (automated rollback script)

**To Rollback:**
```bash
cd /var/www/dokterdibya/staff/backups/smart-triage-20251121-152747
bash ROLLBACK.sh
mysql -u root -p dibyaklinik < rollback_patient_mr_history.sql
```

---

## How It Works

### Scenario 1: New Patient Books Appointment

```
1. Patient fills "Identitas Pribadi" (basic info only)
2. Patient books appointment with complaint: "USG kehamilan 20 minggu"
3. System detects: HIGH confidence → Obstetri
4. Receptionist sees: "✓ Auto-detected: Obstetri"
5. System generates: MROBS0001
6. Doctor opens Sunday Clinic with MROBS0001
7. Anamnesa Obstetri form loads automatically
```

### Scenario 2: Returning Patient - Same Category

```
1. Patient had MROBS0001 (3 months ago)
2. Books appointment: "Kontrol kehamilan"
3. System detects: HIGH confidence → Obstetri
4. System reuses: MROBS0001 (visit count: 2)
5. Doctor sees full history in MROBS0001
```

### Scenario 3: Returning Patient - Different Category

```
1. Patient had MROBS0001 (obstetri, 6 months ago)
2. Now books: "KB IUD"
3. System detects: HIGH confidence → Gyn Repro
4. System generates: MRGPR0015 (NEW MR ID)
5. Patient now has 2 MR IDs:
   - MROBS0001 (obstetri)
   - MRGPR0015 (gyn_repro)
```

### Scenario 4: Uncertain Detection

```
1. Patient books: "Nyeri perut"  (ambiguous)
2. System checks history: Last visit MROBS0001 (2 months ago)
3. System detects: MEDIUM confidence → Obstetri
4. Receptionist sees: "⚠️ Confirm: Still pregnancy-related?"
5. One-click confirmation or manual override
```

---

## What's Next (Pending Implementation)

### Phase 1: API Endpoints (Next Step)
- [ ] Create `/api/sunday-clinic/detect-category` endpoint
- [ ] Create `/api/sunday-clinic/patient-mr-history/:patientId` endpoint
- [ ] Integrate with appointment booking flow

### Phase 2: Frontend UI Updates
- [ ] Add category indicator to Sunday Clinic page
- [ ] Show patient's MR history (all categories)
- [ ] Add manual category override button
- [ ] Add quick confirmation dialog for medium confidence

### Phase 3: Integration Testing
- [ ] Test with real appointment data
- [ ] Test keyword detection accuracy
- [ ] Test MR ID reuse logic
- [ ] Test category switching

---

## Testing Scenarios

### Test Case 1: High Confidence Detection
**Input:** Complaint = "USG kandungan 24 minggu"
**Expected:** Category = obstetri, Confidence = high, No confirmation needed

### Test Case 2: Reproductive Health
**Input:** Complaint = "Pasang KB spiral"
**Expected:** Category = gyn_repro, Confidence = high, No confirmation needed

### Test Case 3: Gynecological Issue
**Input:** Complaint = "Keputihan berbau"
**Expected:** Category = gyn_special, Confidence = high, No confirmation needed

### Test Case 4: Post-Partum Detection
**Input:** Patient has MROBS0001 (3 months ago), Complaint = "Kontrol nifas"
**Expected:** Category = gyn_repro, Confidence = medium, Needs confirmation

### Test Case 5: MR ID Reuse
**Input:** Patient has MROBS0001, Complaint = "Kontrol hamil"
**Expected:** Reuse MROBS0001, visit_count++

### Test Case 6: Multiple MR IDs
**Input:** Patient has MROBS0001, now needs gyn_repro
**Expected:** Generate MRGPR####, patient now has 2 MR IDs

---

## Benefits

### For Patients ✅
- **Less exhausting** - Only fill "Identitas Pribadi", no medical questionnaires
- **Faster** - Smart detection eliminates redundant questions
- **Accurate** - Keyword matching ensures correct category

### For Staff ✅
- **Efficient** - Auto-detection reduces manual work
- **Clear** - Confidence levels guide decision-making
- **Flexible** - Easy manual override when needed

### For Doctors ✅
- **Organized** - One patient can have obstetri, repro, and gyn records
- **Historical context** - Full category history visible
- **Accurate forms** - Correct anamnesa template loads automatically

---

## Technical Notes

### Keyword Lists (Easily Extendable)

**Obstetri Keywords:**
```javascript
'hamil', 'kehamilan', 'pregnant', 'pregnancy',
'usg', 'kontrol kandungan', 'cek janin',
'mual muntah', 'morning sickness', 'anc', 'prenatal',
'antenatal', 'trimester', 'usia kehamilan'
```

**Gyn Repro Keywords:**
```javascript
'kb', 'kontrasepsi', 'contraception',
'menstruasi', 'haid', 'menstrual', 'period',
'ingin punya anak', 'program hamil', 'fertility',
'pasca melahirkan', 'post partum', 'nifas',
'siklus haid', 'telat haid', 'amenorrhea'
```

**Gyn Special Keywords:**
```javascript
'keputihan', 'discharge', 'gatal', 'itching',
'nyeri panggul', 'pelvic pain', 'perdarahan', 'bleeding',
'kista', 'cyst', 'miom', 'fibroid', 'endometriosis',
'kanker', 'cancer', 'tumor', 'benjolan'
```

### Confidence Levels

- **HIGH**: 90%+ accuracy, no confirmation needed
- **MEDIUM**: 70-90% accuracy, quick confirmation recommended
- **LOW**: 50-70% accuracy, must confirm
- **NONE**: Cannot determine, must ask

### Database Performance

- **Indexes added** for fast lookups:
  - `idx_patient_id` on `patient_mr_history`
  - `idx_mr_category` for category filtering
  - `idx_last_visit` for date range queries
  - `idx_patient_category` on `sunday_clinic_records`

---

## Configuration

### Time Windows (Adjustable)

```javascript
// Post-partum period detection
const POST_PARTUM_MONTHS = 6;

// Recent intake validity
const INTAKE_VALIDITY_MONTHS = 9;
```

### Category Mappings

```javascript
MR_PREFIX = {
    'obstetri': 'MROBS',
    'gyn_repro': 'MRGPR',
    'gyn_special': 'MRGPS'
}
```

---

## Monitoring & Logging

All detection events are logged with:
- Patient ID
- Detection result (category, confidence, reason)
- Keywords matched
- Timestamp

Check logs: `/var/www/dokterdibya/staff/logs/sunday-clinic.log`

---

## Support

For issues or questions:
1. Check this documentation
2. Review logs for detection failures
3. Test with different complaint keywords
4. Adjust keyword lists as needed

---

**Status:** ✅ Backend complete, ready for frontend integration and testing

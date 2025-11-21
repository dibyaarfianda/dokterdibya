# Patient Intake Form - Final Specification

## Date: 2025-11-21

## Complete Flow Overview

### Patient Side

1. **Visits:** https://dokterdibya.com/patient-intake.html
2. **Answers 3 simple questions** (max):
   - Q1: Apakah Anda hamil? → Ya / Tidak
   - Q2: Apakah ingin konsultasi sebelum kehamilan atau program hamil? → Ya / Tidak
   - Q3: Ada gangguan menstruasi dalam jumlah, durasi, nyeri? → Ya / Tidak
3. **Fills Identity & Social information**
4. **Fills category-specific questionnaire** (if applicable)
5. **Clicks Submit**
6. **Sees "Thank you" confirmation**

### Backend Processing (Automatic)

1. **Receives intake data**
2. **Saves to database** (`patient_intake_submissions`)
3. **Determines category** (obstetri / gyn_repro / gyn_special)
4. **AUTO-CALLS GPT-4o mini** to generate anamnesa summary
5. **Saves AI summary** to database
6. **Returns success** to patient

### Staff Side (Later)

1. **Opens Sunday Clinic** medical record
2. **Sees Anamnesa textarea** already filled with AI-generated summary
3. **Reviews and edits** as needed
4. **Continues with examination**

## Question Flow

```
Q1: Apakah Anda hamil?
├─ Ya → obstetri → Full pregnancy questionnaire
└─ Tidak → Q2

Q2: Apakah ingin konsultasi sebelum kehamilan atau program hamil?
├─ Ya → gyn_repro → Reproductive + fertility questionnaire
└─ Tidak → Q3

Q3: Ada gangguan menstruasi dalam jumlah, durasi, nyeri?
├─ Ya → gyn_special → Detailed gynecology questionnaire
└─ Tidak → gyn_special → Minimal questionnaire (just identity)
```

## Category Assignment

| Q1 | Q2 | Q3 | Category | Questionnaire Level | MR Prefix |
|----|----|----|----------|---------------------|-----------|
| Ya | - | - | obstetri | Full | MROBS |
| Tidak | Ya | - | gyn_repro | Full | MRGPR |
| Tidak | Tidak | Ya | gyn_special | Full | MRGPS |
| Tidak | Tidak | Tidak | gyn_special | Minimal | MRGPS |

## GPT-4o Mini Integration

### Purpose

**Automatically generate anamnesa summary from structured intake data**

### When It Runs

**Immediately after patient clicks "Submit"** on intake form (background process)

### What It Does

1. Reads patient's intake form data
2. Extracts relevant information for the category
3. Writes a narrative anamnesa summary in Indonesian medical language
4. Saves to database

### What It Doesn't Do

- ❌ No patient interaction
- ❌ No free-text processing (all data is structured)
- ❌ No button clicking by staff
- ❌ No waiting for staff to request

### Input Example (Gyn Repro)

```json
{
  "category": "gyn_repro",
  "full_name": "Siti Aminah",
  "age": 28,
  "repro_goals": ["promil"],
  "menarche_age": 13,
  "cycle_length": 28,
  "cycle_regular": "teratur",
  "lmp": "2025-10-20",
  "trying_duration": "12 bulan",
  "previous_contraception": "KB pil 3 tahun",
  "contraception_notes": "Stop 1 tahun lalu"
}
```

### Output Example

```
Pasien Ny. Siti Aminah, 28 tahun, datang dengan tujuan konsultasi program hamil.

RIWAYAT MENSTRUASI:
- Menarche usia 13 tahun
- Siklus haid teratur 28 hari
- HPHT: 20 Oktober 2025

RIWAYAT REPRODUKSI:
- Sudah mencoba hamil selama 12 bulan tanpa hasil
- Riwayat kontrasepsi: KB pil selama 3 tahun, dihentikan 1 tahun yang lalu
- Belum pernah hamil sebelumnya (G0P0A0)

TUJUAN KONSULTASI:
Program hamil dan evaluasi kesuburan
```

## Files Changed

### 1. Patient Intake HTML
**File:** `/var/www/dokterdibya/public/patient-intake.html`

**Changes:**
- Simplified question text to "Ya / Tidak" answers
- Removed free-text complaint textarea
- Kept all structured questionnaires intact

### 2. Patient Intake JavaScript
**File:** `/var/www/dokterdibya/public/scripts/patient-intake.js`

**Changes:**
- Updated category routing logic
- Removed admin followup functionality
- Both "yes" and "no" to Q3 route to `gyn_special`
- Cleaned up unused code

### 3. OpenAI Service (Already Exists)
**File:** `/var/www/dokterdibya/staff/backend/services/openaiService.js`

**Status:** ✅ Already implemented
**Function:** `generateAnamnesaSummary(intakeData, category)`

### 4. Backend Routes (Needs Update)
**File:** `/var/www/dokterdibya/staff/backend/routes/patient-intake.js`

**To Do:** Add auto-GPT call on intake submission

## Implementation Checklist

### ✅ Completed

- [x] Simplified questions in HTML
- [x] Updated routing logic in JavaScript
- [x] Removed free-text complaint field
- [x] Updated documentation
- [x] GPT service already exists

### 🔄 Pending

- [ ] Add database column `ai_anamnesa_summary` to `patient_intake_submissions`
- [ ] Update intake submission endpoint to auto-call GPT
- [ ] Update Sunday Clinic record loading to show AI summary
- [ ] Test with real patient data
- [ ] Monitor GPT generation success rate

## Database Schema Update Needed

```sql
-- Add columns for AI-generated anamnesa
ALTER TABLE patient_intake_submissions
ADD COLUMN ai_anamnesa_summary TEXT NULL
  COMMENT 'Auto-generated anamnesa summary from GPT-4o mini'
  AFTER payload;

ADD COLUMN ai_generated_at DATETIME NULL
  COMMENT 'Timestamp when AI summary was generated'
  AFTER ai_anamnesa_summary;

ADD COLUMN ai_generation_error TEXT NULL
  COMMENT 'Error message if AI generation failed'
  AFTER ai_generated_at;
```

## Backend Implementation Needed

### Step 1: Modify Intake Submission Endpoint

```javascript
// File: /var/www/dokterdibya/staff/backend/routes/patient-intake.js

router.post('/submit', async (req, res) => {
    try {
        // Save intake data
        const [result] = await db.query(
            'INSERT INTO patient_intake_submissions (patient_id, payload, status) VALUES (?, ?, ?)',
            [req.body.patient_id, JSON.stringify(req.body), 'verified']
        );

        const intakeId = result.insertId;

        // Determine category
        const category = determineCategoryFromPayload(req.body);

        // AUTO-GENERATE anamnesa (async, don't wait)
        if (['obstetri', 'gyn_repro', 'gyn_special'].includes(category)) {
            generateAndSaveAnamnesa(intakeId, category, req.body);
        }

        // Return immediately
        res.json({ success: true, intakeId });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

async function generateAndSaveAnamnesa(intakeId, category, payload) {
    try {
        const { generateAnamnesaSummary } = require('../services/openaiService');

        const summary = await generateAnamnesaSummary(payload, category);

        await db.query(
            'UPDATE patient_intake_submissions SET ai_anamnesa_summary = ?, ai_generated_at = NOW() WHERE id = ?',
            [summary, intakeId]
        );

        logger.info('Auto-anamnesa generated', { intakeId, category });
    } catch (error) {
        await db.query(
            'UPDATE patient_intake_submissions SET ai_generation_error = ? WHERE id = ?',
            [error.message, intakeId]
        );

        logger.error('Auto-anamnesa failed', { intakeId, error: error.message });
    }
}
```

### Step 2: Load AI Summary in Sunday Clinic

```javascript
// When staff opens medical record, load AI-generated summary

async function loadPatientIntake(patientId) {
    const [rows] = await db.query(
        `SELECT payload, ai_anamnesa_summary
         FROM patient_intake_submissions
         WHERE patient_id = ?
         ORDER BY created_at DESC
         LIMIT 1`,
        [patientId]
    );

    return {
        intakeData: rows[0]?.payload,
        aiSummary: rows[0]?.ai_anamnesa_summary || ''
    };
}

// Pre-populate anamnesa textarea
document.querySelector('[name="anamnesa_summary"]').value = aiSummary;
```

## Testing Plan

### 1. Test Categories

Create test patients for each category:
- ✅ Anobs (obstetri) - already exists
- ✅ Anpro (gyn_repro) - already exists
- ✅ Anspi (gyn_special) - already exists

### 2. Test Scenarios

**Scenario A: Full Questionnaire**
1. Patient answers Q3 = "Ya" (has menstrual issues)
2. Fills detailed gyn_special questionnaire
3. Submits form
4. GPT generates detailed anamnesa
5. Staff sees comprehensive summary

**Scenario B: Minimal Questionnaire**
1. Patient answers Q3 = "Tidak" (no menstrual issues)
2. Fills only identity information
3. Submits form
4. GPT generates basic anamnesa (limited data)
5. Staff sees minimal summary, adds more during consultation

**Scenario C: GPT Failure**
1. Patient submits form
2. GPT API fails (simulated)
3. Patient still sees success
4. Staff sees empty anamnesa
5. Staff fills manually

## Benefits Summary

### For Patients
- ✅ Simple questions (just Ya/Tidak)
- ✅ Fast submission (no waiting for GPT)
- ✅ Appropriate questionnaire for their situation

### For Staff
- ✅ Anamnesa pre-written (saves 5-10 min/patient)
- ✅ Consistent formatting
- ✅ Just review and edit
- ✅ Can focus on examination

### For System
- ✅ Scalable (handles 100s of patients)
- ✅ Low cost (~Rp 5/patient)
- ✅ Better data quality
- ✅ Automated workflow

## Next Steps

1. **Add database columns** (ai_anamnesa_summary, ai_generated_at)
2. **Update backend endpoint** to auto-call GPT
3. **Update Sunday Clinic loading** to show AI summary
4. **Test with real data**
5. **Monitor performance** (success rate, timing)
6. **Adjust GPT prompts** based on doctor feedback

---

**Status:** Ready for backend implementation
**Priority:** High
**Estimated Time:** 2-4 hours
**Risk:** Low (fallback to manual entry)

---

**Created:** 2025-11-21
**Author:** Claude Code Assistant
**Version:** 2.0 - Final Specification with Auto-GPT

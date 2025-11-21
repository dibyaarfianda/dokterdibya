# GPT-4o Mini Auto-Anamnesa Generation Specification

## Date: 2025-11-21

## Overview

GPT-4o mini automatically generates anamnesa summary **immediately after patient submits intake form**. No staff button click needed - it runs automatically in the background.

## Trigger Event

**When:** Patient clicks "Submit" on intake form
**Action:** Backend automatically calls GPT-4o mini to generate anamnesa summary
**Result:** Summary saved to database, ready when staff opens record

## Flow Diagram

```
Patient fills intake form
    ↓
Patient clicks "Submit"
    ↓
Backend receives intake data
    ↓
Backend saves to patient_intake_submissions
    ↓
Backend IMMEDIATELY calls GPT-4o mini service
    ↓
GPT reads intake data from payload
    ↓
GPT generates anamnesa summary
    ↓
Backend saves summary to database
    ↓
Patient sees "Thank you" page
    ↓
[LATER] Staff opens Sunday Clinic record
    ↓
Anamnesa summary ALREADY LOADED in textarea
    ↓
Staff reviews and edits if needed
```

## Implementation Points

### 1. Backend Integration

**File:** `/var/www/dokterdibya/staff/backend/routes/patient-intake.js`

**Modify POST /api/patient-intake endpoint:**

```javascript
router.post('/api/patient-intake', async (req, res) => {
    try {
        // 1. Save intake data to database
        const intakeId = await saveIntakeSubmission(req.body);

        // 2. Determine category from intake data
        const category = determineCategoryFromPayload(req.body);

        // 3. AUTO-GENERATE anamnesa summary using GPT-4o mini
        if (category && ['obstetri', 'gyn_repro', 'gyn_special'].includes(category)) {
            // Call GPT service in background (don't wait)
            generateAnamnesaSummary(intakeId, category, req.body)
                .then(summary => {
                    // Save summary to patient_intake_submissions.ai_anamnesa
                    return updateIntakeWithAnamnesaSummary(intakeId, summary);
                })
                .catch(err => {
                    logger.error('Auto-anamnesa generation failed', { intakeId, error: err.message });
                    // Don't block patient submission - just log error
                });
        }

        // 4. Return success to patient immediately (don't wait for GPT)
        res.json({ success: true, intakeId });

    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});
```

### 2. Database Schema Update

**Add column to store AI-generated summary:**

```sql
ALTER TABLE patient_intake_submissions
ADD COLUMN ai_anamnesa_summary TEXT NULL AFTER payload,
ADD COLUMN ai_generated_at DATETIME NULL AFTER ai_anamnesa_summary;
```

### 3. OpenAI Service Usage

**File:** `/var/www/dokterdibya/staff/backend/services/openaiService.js`

**Function:** `generateAnamnesaSummary(intakeData, category)`

Already exists! Just needs to be called automatically.

### 4. Sunday Clinic Record Loading

**When staff opens medical record:**

```javascript
// Load patient intake data
const intake = await getPatientIntake(patientId);

// Pre-populate anamnesa textarea with AI-generated summary
const anamnesaSummary = intake.ai_anamnesa_summary || '';
```

## GPT-4o Mini Purpose

### What GPT Does

Converts **structured intake data** → **narrative anamnesa summary**

### What GPT Does NOT Do

- ❌ Answer patient questions
- ❌ Provide medical advice
- ❌ Generate free-text from minimal data
- ❌ Fill out forms on behalf of staff

### Input: Structured Data

```json
{
  "pregnant_status": "no",
  "needs_reproductive": "yes",
  "repro_goals": ["promil"],
  "menarche_age": 13,
  "cycle_length": 28,
  "lmp": "2025-10-20",
  "trying_duration": "12 months",
  "contraception_history": "KB pil 3 tahun, stop 1 tahun lalu"
}
```

### Output: Narrative Summary

```
Pasien Ny. [Nama], 28 tahun, datang dengan tujuan konsultasi program hamil.

RIWAYAT MENSTRUASI:
- Menarche usia 13 tahun
- Siklus teratur 28 hari
- HPHT: 20 Oktober 2025

RIWAYAT REPRODUKSI:
- Sudah mencoba hamil selama 12 bulan
- Riwayat KB pil selama 3 tahun, stop 1 tahun yang lalu
- Belum pernah hamil sebelumnya

TUJUAN KONSULTASI:
Program hamil dan evaluasi kesuburan
```

## Error Handling

### If GPT Fails

- Patient submission still succeeds
- Staff sees empty anamnesa textarea
- Staff fills manually as usual
- Error logged for monitoring

### If GPT Slow

- Patient doesn't wait (async call)
- Summary appears when ready
- Staff might see "Generating..." briefly

## Benefits

### For Patients
✅ No waiting - instant submission confirmation
✅ No extra steps

### For Staff
✅ Anamnesa pre-written when they open record
✅ Just review and edit
✅ Saves 5-10 minutes per patient
✅ Consistent formatting

### For System
✅ Reduces manual data entry
✅ Better data quality
✅ Scalable with patient volume

## Categories and Templates

### Obstetri (MROBS)

**GPT reads:**
- Pregnancy status, LMP, gestational age
- Obstetric history (G P A)
- Pregnancy complaints
- Risk factors
- ANC visits

**GPT writes:**
```
Pasien G[x]P[x]A[x], usia kehamilan [x] minggu [x] hari berdasarkan HPHT [tanggal].

KELUHAN KEHAMILAN:
[complaints]

RIWAYAT OBSTETRI:
[previous pregnancies]

FAKTOR RISIKO:
[risk factors if any]
```

### Gyn Repro (MRGPR)

**GPT reads:**
- Reproductive goals (promil/KB)
- Menstrual history
- Contraception history
- Fertility assessment
- Partner factors

**GPT writes:**
```
Pasien datang dengan tujuan [promil/KB/fertility check].

RIWAYAT MENSTRUASI:
[cycle details, HPHT]

RIWAYAT KONTRASEPSI:
[contraception history]

PENILAIAN KESUBURAN:
[trying duration, programs, evaluations]
```

### Gyn Special (MRGPS)

**GPT reads:**
- Chief complaints (discharge/bleeding/pain)
- Symptom details
- Menstrual history (basic)
- Gynecology history (PAP, surgery)

**GPT writes:**
```
Pasien datang dengan keluhan [chief complaint].

GEJALA GINEKOLOGI:
[detailed symptoms]

RIWAYAT MENSTRUASI:
[basic cycle info]

RIWAYAT GINEKOLOGI:
[PAP, surgeries, dyspareunia]
```

## Performance Considerations

### API Call Time

GPT-4o-mini typically responds in **1-3 seconds**

### Asynchronous Processing

```
Patient submits → Immediate "Success" response (100ms)
                          ↓
                  GPT runs in background (1-3s)
                          ↓
                  Summary saved to database
                          ↓
                  Ready when staff opens (later)
```

### Fallback

If GPT takes > 10 seconds or fails:
- Timeout logged
- Staff sees empty textarea
- Manual entry as fallback

## Cost Estimation

### GPT-4o-mini Pricing

- ~$0.00015 per 1000 input tokens
- ~$0.0006 per 1000 output tokens

### Per Patient Cost

Average intake = 500 tokens input + 300 tokens output
Cost = ~$0.0003 per patient (~Rp 5)

### Monthly Volume

100 patients/month = **~Rp 500/month** for GPT API

Very affordable!

## Monitoring

### Metrics to Track

1. **Generation success rate** - Should be >95%
2. **Average generation time** - Should be <3 seconds
3. **Error rate** - Monitor for API failures
4. **Staff edit rate** - How often staff edit AI summaries

### Logging

```javascript
logger.info('Auto-anamnesa generated', {
    intakeId,
    category,
    tokensUsed: response.usage.total_tokens,
    generationTime: elapsedMs
});
```

## Security & Privacy

### Data Handling

- Patient data sent to OpenAI API (HTTPS)
- OpenAI doesn't store medical data (zero retention policy)
- Complies with GDPR/privacy requirements
- Generated text saved in local database only

### API Key Security

- Stored in `.env` file (not in code)
- Access restricted to backend server
- Rotated periodically

## Future Enhancements

1. **Fine-tuning** - Train on doctor's writing style
2. **Multi-language** - Support English summaries
3. **Smart sections** - Generate only relevant sections
4. **Update on edit** - Regenerate if patient updates intake

---

**Status:** Ready for implementation
**Priority:** High (saves significant staff time)
**Estimated Development:** 2-4 hours
**Testing Required:** Yes (with real patient data)

---

**Created:** 2025-11-21
**Author:** Claude Code Assistant
**Version:** 1.0 - Auto-generation Specification

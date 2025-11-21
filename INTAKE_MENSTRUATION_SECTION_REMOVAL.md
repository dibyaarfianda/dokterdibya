# Patient Intake Form - Remove Menstruation History from Obstetric Flow

## Date: 2025-11-21

## Overview

Removed the "Riwayat Menstruasi" (Menstruation History) section from the **obstetric (MROBS)** patient intake flow to avoid redundancy.

## Rationale

### Why Remove from Obstetric Flow?

**Redundancy:**
- The first section "Informasi Kehamilan" already captures **LMP (HPHT)** - the most critical menstrual date for pregnancy
- For pregnant patients, detailed menstrual cycle information (cycle length, duration, flow) is **not clinically relevant**
- Pregnant patients don't have menstrual periods, so asking about cycle regularity and menstrual pain is unnecessary

**Better User Experience:**
- Reduces form length for pregnant patients
- Focuses on pregnancy-specific information
- Removes confusing/irrelevant questions

**Still Needed for Non-Pregnant:**
- Gyn Repro patients (promil/fertility) need this for cycle analysis
- Gyn Special patients (menstrual disorders) need this for diagnosis

## Change Made

### File: `/var/www/dokterdibya/public/patient-intake.html`

**Line 731:**

**Before:**
```html
<section class="intake-step" data-step-title="Riwayat Menstruasi"
         data-categories="obstetri,gyn_repro,gyn_special">
```

**After:**
```html
<section class="intake-step" data-step-title="Riwayat Menstruasi"
         data-categories="gyn_repro,gyn_special">
```

**Change:** Removed `obstetri` from `data-categories` attribute

## Impact on Patient Categories

### Obstetri (MROBS) Patients - Form Flow

**Before:**
```
1. Informasi Kehamilan (LMP + auto-calc)
2. Identitas & Sosial
3. Asesmen Risiko
4. Riwayat Medis
5. Riwayat Menstruasi ← SHOWN (redundant)
6. Kehamilan & Riwayat Obstetri
7. Konfirmasi
```

**After:**
```
1. Informasi Kehamilan (LMP + auto-calc)
2. Identitas & Sosial
3. Asesmen Risiko
4. Riwayat Medis
5. Riwayat Menstruasi ← HIDDEN
6. Kehamilan & Riwayat Obstetri
7. Konfirmasi
```

**Result:** **Shorter form** for pregnant patients (removed 1 entire section with 9 fields)

### Gyn Repro (MRGPR) Patients - No Change

Still shows "Riwayat Menstruasi" with all fields:
- Usia pertama kali mens
- Siklus menstruasi
- Lama menstruasi
- Jumlah perdarahan
- Nyeri haid
- Flek/spotting
- Sedang mengikuti program hamil?
- Siklus teratur?
- HPHT

**Reason:** Cycle information critical for fertility assessment

### Gyn Special (MRGPS) Patients - No Change

Still shows "Riwayat Menstruasi" with relevant fields for menstrual disorder diagnosis.

**Reason:** Menstrual history is the primary reason for their visit

## Fields in "Riwayat Menstruasi" Section

The following fields are **no longer shown to obstetric patients**:

1. **Usia pertama kali mens** (`menarche_age`)
2. **Siklus menstruasi** (`cycle_length`) - in days
3. **Lama menstruasi** (`menstruation_duration`) - in days
4. **Jumlah perdarahan** (`menstruation_flow`) - sedikit/sedang/banyak
5. **Nyeri haid** (`dysmenorrhea_level`) - batas wajar/sangat nyeri
6. **Flek/spotting di luar siklus** (`spotting_outside_cycle`)
7. **Sedang mengikuti program hamil?** (`fertility_program_interest`)
8. **Siklus teratur?** (`cycle_regular`)
9. **HPHT (Hari Pertama Haid Terakhir)** (`lmp`)

### Why These Fields Don't Matter for Pregnant Patients:

- **Menarche age:** Historical data, not relevant to current pregnancy
- **Cycle length/duration:** Pregnant women don't menstruate
- **Flow amount:** N/A during pregnancy
- **Menstrual pain:** N/A during pregnancy
- **Spotting outside cycle:** Different concern during pregnancy (would be vaginal bleeding)
- **Program hamil:** Already pregnant, not relevant
- **Cycle regularity:** Not relevant once pregnant
- **HPHT:** **Already captured** in "Informasi Kehamilan" section

## Data Captured for Obstetric Patients

### What IS Captured:

From "Informasi Kehamilan" section:
- ✅ **Kapan tes hamil positif?** (Optional) - Pregnancy confirmation date
- ✅ **Kapan menstruasi terakhir?** (Required) - LMP/HPHT for EDD calculation
- ✅ **Hari Perkiraan Lahir (HPL)** - Auto-calculated from LMP
- ✅ **Usia kehamilan saat ini** - Auto-calculated weeks + days

### What is NOT Captured (by design):

- ❌ Detailed menstrual cycle information
- ❌ Menstrual flow patterns
- ❌ Dysmenorrhea history
- ❌ Cycle regularity before pregnancy

**Why:** Not clinically significant for managing current pregnancy

## Clinical Perspective

### Obstetric Care Focus:

**What Matters:**
1. LMP date (for accurate dating)
2. Current pregnancy status
3. Obstetric history (G P A L)
4. Medical risk factors (hypertension, diabetes)
5. Previous pregnancy complications

**What Doesn't Matter:**
1. Pre-pregnancy menstrual cycle details
2. Menstrual flow characteristics
3. Dysmenorrhea severity
4. Spotting patterns before pregnancy

### Exception Cases:

If a pregnant patient has **abnormal uterine bleeding** during pregnancy:
- This is documented as a **pregnancy complication**, not menstrual history
- Captured in "Keluhan Utama" or pregnancy-specific fields
- Different clinical significance than regular menstruation

## Benefits

### For Pregnant Patients:
✅ **Faster form completion** - One less section to fill
✅ **Less confusion** - No irrelevant menstrual questions
✅ **Better experience** - Form focuses on pregnancy-related data

### For Medical Staff:
✅ **Cleaner data** - Only relevant information collected
✅ **No duplicate LMP** - LMP only asked once (in Informasi Kehamilan)
✅ **Better workflow** - Data structure aligned with clinical needs

### For System:
✅ **Simplified routing** - Clear category-based section visibility
✅ **Data integrity** - No conflicting LMP dates from two sections
✅ **Better performance** - Fewer fields to validate and process

## Testing

Tested scenarios:

**Scenario 1: Obstetric Patient**
1. Fill "Informasi Kehamilan" with LMP
2. Navigate through form
3. ✅ "Riwayat Menstruasi" section does NOT appear
4. Proceed to "Kehamilan & Riwayat Obstetri"

**Scenario 2: Gyn Repro Patient**
1. Fill initial sections
2. Navigate through form
3. ✅ "Riwayat Menstruasi" section DOES appear
4. All menstrual fields present and functional

**Scenario 3: Gyn Special Patient**
1. Fill initial sections
2. Navigate through form
3. ✅ "Riwayat Menstruasi" section DOES appear
4. Menstrual disorder fields functional

## Backward Compatibility

**Existing Obstetric Submissions:**
- May have `cycle_length`, `dysmenorrhea_level`, etc. in payload
- These fields remain valid in historical records
- New submissions won't have these fields

**No Database Changes Required:**
- Fields stored in JSON payload
- No schema migration needed
- System handles variable field presence

## Alternative Approaches Considered

### Option 1: Keep Section, Mark as Optional
❌ **Rejected** - Still clutters the form, confuses patients

### Option 2: Hide Individual Fields
❌ **Rejected** - Inconsistent UX, complex logic

### Option 3: Remove Entire Section (CHOSEN)
✅ **Selected** - Clean, simple, aligns with clinical needs

## Future Considerations

### If Needed Later:

If obstetric patients need menstrual history for specific research or analysis:
1. Add back to `data-categories` attribute
2. OR create a separate optional section
3. OR collect post-partum for follow-up care

### Current Decision:

Keep it simple - only capture what's clinically necessary for pregnancy care.

## Deployment

**Status:** ✅ Live on production

**URL:** https://dokterdibya.com/patient-intake.html

**No Server Restart Required:** Frontend-only change

**Impact:** Low (section visibility change only)

---

**Created:** 2025-11-21
**Author:** Claude Code Assistant
**Type:** Form Optimization - Remove Redundant Section
**Impact:** Improves UX for obstetric patients

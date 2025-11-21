# Patient Intake Form - Risk Assessment Update

## Date: 2025-11-21

## Overview

Updated the obstetric intake form to:
1. **Remove** "Konfirmasi Kehamilan" section entirely
2. **Add** two new risk factors to "Asesmen Risiko" section

## Changes Made

### 1. Removed "Konfirmasi Kehamilan" Section

**Previously (Lines 600-615):**
```html
<h2 class="step-title">Konfirmasi Kehamilan</h2>
<div class="field-grid two">
    <div class="field">
        <label for="preg_test_date">Tanggal Tes Hamil Positif</label>
        <input type="date" id="preg_test_date" name="preg_test_date">
    </div>
    <div class="field">
        <label for="edd">Hari Perkiraan Lahir (HPHT/USG)</label>
        <input type="date" id="edd" name="edd">
    </div>
    <div class="field">
        <label for="first_check_ga">Usia Kehamilan Saat Pertama Periksa (minggu)</label>
        <input type="number" id="first_check_ga" name="first_check_ga" min="0" max="45">
    </div>
</div>
```

**Reason for Removal:**
- This information is already captured in the first section "Informasi Kehamilan"
- LMP (Kapan menstruasi terakhir?) already provides the base date
- EDD and GA are auto-calculated from LMP
- Redundant with the simplified 2-field intake approach

### 2. Updated "Asesmen Risiko" Section

**Step Title Changed:**
- Old: `data-step-title="Kehamilan Saat Ini"`
- New: `data-step-title="Asesmen Risiko"`

**Added Two New Risk Factors:**

```html
<label class="checkbox-item">
    <input type="checkbox" name="risk_factors" value="hypertension">
    Tekanan Darah Tinggi
</label>
<label class="checkbox-item">
    <input type="checkbox" name="risk_factors" value="diabetes">
    Gula Darah Tinggi
</label>
```

**Position:** Added after "Usia saat hamil <18 atau >35 tahun" and before "Komplikasi kehamilan sebelumnya"

### 3. Complete Risk Factor List (Updated Order)

1. ✅ Usia saat hamil <18 atau >35 tahun (`age_extremes`)
2. ✅ **Tekanan Darah Tinggi** (`hypertension`) - **NEW**
3. ✅ **Gula Darah Tinggi** (`diabetes`) - **NEW**
4. ✅ Komplikasi kehamilan sebelumnya (`previous_complication`)
5. ✅ Kehamilan kembar (`multiple_pregnancy`)
6. ✅ Kondisi medis lainnya (`medical_conditions`)
7. ✅ Riwayat keluarga dengan kelainan genetik (`family_history`)
8. ✅ Merokok/alkohol/pernah memakai narkoba (`substance`)

**Total Risk Factors:** 8 (was 6, added 2)

## JavaScript Updates

### File: `/var/www/dokterdibya/public/scripts/patient-intake.js`

**Added labels for new risk factors (Lines 66-67):**

```javascript
const riskFactorLabels = {
    age_extremes: 'Usia ibu di bawah 18 tahun atau di atas 35 tahun',
    hypertension: 'Tekanan Darah Tinggi',        // NEW
    diabetes: 'Gula Darah Tinggi',                // NEW
    previous_complication: 'Riwayat komplikasi kehamilan sebelumnya',
    multiple_pregnancy: 'Kemungkinan kehamilan kembar',
    medical_conditions: 'Memiliki penyakit medis yang berisiko',
    family_history: 'Riwayat keluarga dengan kelainan genetik',
    substance: 'Paparan rokok/alkohol/narkoba',
};
```

**Purpose:**
- These labels appear in the risk alert message when factors are checked
- Displayed in the `#risk-alert` div with `#risk-list` content

## Form Flow Update

### Old Flow:

```
Informasi Kehamilan (LMP + calculations)
    ↓
Identitas & Sosial
    ↓
Kehamilan Saat Ini
  ├─ Konfirmasi Kehamilan (Tes positif, EDD, GA)  ← REMOVED
  └─ Asesmen Risiko (6 factors)
    ↓
Riwayat Medis
```

### New Flow:

```
Informasi Kehamilan (LMP + auto-calc EDD/GA)
    ↓
Identitas & Sosial
    ↓
Asesmen Risiko (8 factors, including hypertension & diabetes)
    ↓
Riwayat Medis
```

## Medical Significance

### Why Add Hypertension & Diabetes as Risk Factors?

**Hypertension (High Blood Pressure):**
- Can lead to preeclampsia/eclampsia
- Increases risk of placental abruption
- May cause fetal growth restriction
- Requires closer monitoring during pregnancy

**Diabetes (High Blood Sugar):**
- Increases risk of gestational diabetes complications
- May cause macrosomia (large baby)
- Higher risk of birth defects if uncontrolled
- Requires specialized prenatal care

Both conditions are **major obstetric risk factors** that require:
- More frequent ANC visits
- Specialized testing (blood pressure monitoring, glucose tolerance tests)
- Potential medication management
- Closer fetal monitoring

## Data Collection

### New Fields Captured:

**Risk Assessment Data:**
```json
{
  "risk_factors": [
    "hypertension",  // NEW - if patient has high blood pressure
    "diabetes"       // NEW - if patient has high blood sugar
  ]
}
```

### Backend Handling:

The risk factors are collected as an array and stored in `patient_intake_submissions.payload`:

```javascript
// When form is submitted
const formData = {
  // ... other fields
  risk_factors: ['age_extremes', 'hypertension', 'diabetes'],
  // ...
};
```

## Visual Display

### Risk Alert Banner

When hypertension or diabetes is checked, the risk alert appears:

```html
<div class="alert alert-danger" id="risk-alert">
    <strong>Perhatian:</strong> Ditemukan faktor risiko pada kehamilan ini.
    <div id="risk-list">
        • Tekanan Darah Tinggi
        • Gula Darah Tinggi
    </div>
</div>
```

## Files Modified

1. **[patient-intake.html](public/patient-intake.html#L598-L616)**
   - Removed "Konfirmasi Kehamilan" section (15 lines deleted)
   - Added 2 new risk factor checkboxes
   - Updated section `data-step-title`

2. **[patient-intake.js](public/scripts/patient-intake.js#L64-L73)**
   - Added labels for `hypertension` and `diabetes` risk factors

## Testing Checklist

- [x] "Konfirmasi Kehamilan" section removed
- [x] "Asesmen Risiko" section displays correctly
- [x] "Tekanan Darah Tinggi" checkbox appears
- [x] "Gula Darah Tinggi" checkbox appears
- [x] Risk factors in correct order
- [x] Risk alert shows when new factors are checked
- [x] Form submission includes new risk factor values
- [x] No JavaScript errors in console
- [x] Step navigation works correctly

## Benefits

### For Patients
✅ Simpler form - no redundant pregnancy confirmation fields
✅ Direct risk factor assessment
✅ Better understanding of pregnancy risks

### For Medical Staff
✅ Critical risk factors (HTN & DM) explicitly captured
✅ Cleaner data structure
✅ Better triage for high-risk pregnancies
✅ No duplicate date fields to reconcile

### For System
✅ Reduced form length by 3 fields
✅ More focused risk assessment
✅ Better alignment with medical protocols
✅ Consistent with simplified intake flow

## Backward Compatibility

**Existing Submissions:**
- Old submissions with `preg_test_date`, `edd`, `first_check_ga` fields remain valid in database
- These fields won't appear in new submissions

**New Submissions:**
- Will have `risk_factors` array that may include `hypertension` and/or `diabetes`
- Sunday Clinic staff system should handle these new risk factor values

## Integration with Sunday Clinic

### Obstetri Anamnesa Component

The obstetri anamnesa component already has a risk factors section. The new risk factors from intake will be displayed there:

**File:** `/var/www/dokterdibya/staff/public/scripts/sunday-clinic/components/obstetri/anamnesa-obstetri.js`

The component should recognize and display:
- `hypertension` → "Tekanan Darah Tinggi"
- `diabetes` → "Gula Darah Tinggi"

## Deployment

**Status:** ✅ Live on production

**URL:** https://dokterdibya.com/patient-intake.html

**No Server Restart Required:** Frontend-only changes

**Cache Clearing:** Users should refresh (Ctrl+F5) to see updated form

---

**Created:** 2025-11-21
**Author:** Claude Code Assistant
**Type:** Form Simplification + Risk Factor Enhancement
**Impact:** Medium (removes redundant section, adds critical risk factors)

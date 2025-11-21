# Patient Intake Form - Question Flow Update

## Date: 2025-11-21

## Overview

Updated the patient intake form question flow to be simpler and more logical, with all non-obstetric patients potentially going to gyn_special category where staff can use GPT-4 mini to help complete anamnesa.

## New Question Flow

### Question 1: Apakah Anda hamil?
- **Ya** → Go directly to **Identitas & Sosial** page (Category: `obstetri`)
- **Tidak** → Show Question 2 below

### Question 2: Apakah ingin konsultasi sebelum kehamilan atau program hamil?
*(Only appears if Q1 = Tidak)*
- **Ya** → Go to **Identitas & Sosial** then gyn_repro questions + fertility questions (Category: `gyn_repro`)
- **Tidak** → Show Question 3 below

### Question 3: Ada gangguan menstruasi dalam jumlah, durasi, nyeri?
*(Only appears if Q1 = Tidak AND Q2 = Tidak)*
- **Ya** → Go to **Identitas & Sosial** then gyn_special questions (Category: `gyn_special`)
- **Tidak** → Show free-text complaint area (Category: `gyn_special`)

### Free-Text Complaint Area
*(Only appears if Q1 = Tidak AND Q2 = Tidak AND Q3 = Tidak)*

- **Field:** Textarea with placeholder "Silakan tuliskan keluhan anda disini"
- **Required:** No (optional)
- **Category:** `gyn_special`
- **Purpose:** Patient can write general complaints in free text
- **Note:** "Staf kami akan membantu melengkapi anamnesa Anda nanti."
- **GPT Integration:** Staff will use GPT-4 mini to auto-generate anamnesa from this free text

## Key Changes

### 1. Simplified Question Text

**Before:**
- "Apakah Anda sedang hamil?" with "Ya, saya sedang hamil" / "Tidak / belum hamil"
- "Apakah ingin konsultasi, tindakan atau cek organ kandungan?" with long answers
- "Apakah ada masalah kandungan?" with long answers

**After:**
- "Apakah Anda hamil?" with simple "Ya" / "Tidak"
- "Apakah ingin konsultasi sebelum kehamilan atau program hamil?" with simple "Ya" / "Tidak"
- "Ada gangguan menstruasi dalam jumlah, durasi, nyeri?" with simple "Ya" / "Tidak"

### 2. Category Routing Logic

**File:** `/var/www/dokterdibya/public/scripts/patient-intake.js`

**Function:** `deriveCategoryFromRouting()`

```javascript
// OLD: has_gyn_issue = 'no' → admin_followup category
if (issueValue === 'no') {
    if (adminFollowupNote && adminFollowupNote.value.trim().length > 0) {
        return 'admin_followup';
    }
    return null;
}

// NEW: has_gyn_issue = 'no' → gyn_special category (same as 'yes')
if (issueValue === 'no') {
    // Patient still goes to gyn_special but with free-text complaint only
    // Staff will help with anamnesa later using GPT-4 mini
    return 'gyn_special';
}
```

### 3. Free-Text Field Purpose Change

**Before:**
- Field Name: "Mohon ketikkan tujuan Anda untuk bertemu dr. Dibya"
- Placeholder: "Contoh: ingin diskusi rencana operasi, konsultasi PMS, atau pertanyaan lainnya"
- Hint: "Tim admin akan meninjau dan menghubungi Anda untuk menyiapkan langkah berikutnya."
- Category: `admin_followup`
- Required: Yes

**After:**
- Field Name: "Silakan tuliskan keluhan anda disini"
- Placeholder: "Silakan tuliskan keluhan anda disini"
- Hint: "Staf kami akan membantu melengkapi anamnesa Anda nanti."
- Category: `gyn_special`
- Required: No (optional)

### 4. No More `admin_followup` Category

All patients now route to one of three categories:
- `obstetri` - Pregnant patients
- `gyn_repro` - Pre-pregnancy consultation / fertility program
- `gyn_special` - Menstrual issues OR general gynecology complaints

The `admin_followup` category is no longer used in the routing flow.

## Files Modified

### 1. `/var/www/dokterdibya/public/patient-intake.html`

**Lines 437-483:** Updated question text and labels

- Changed "Apakah Anda sedang hamil?" → "Apakah Anda hamil?"
- Changed "Apakah ingin konsultasi, tindakan atau cek organ kandungan?" → "Apakah ingin konsultasi sebelum kehamilan atau program hamil?"
- Changed "Apakah ada masalah kandungan?" → "Ada gangguan menstruasi dalam jumlah, durasi, nyeri?"
- Updated free-text area label and hint

### 2. `/var/www/dokterdibya/public/scripts/patient-intake.js`

**Lines 375-400:** `deriveCategoryFromRouting()` function
- Changed logic so `has_gyn_issue = 'no'` returns `'gyn_special'` instead of `'admin_followup'`

**Lines 133-143:** `toggleAdminNoteVisibility()` function
- Made textarea optional (not required) since patients may not have specific complaints to write

**Lines 440-443:** `updateRoutingVisibility()` function
- Added comment explaining that free-text area is for gyn_special patients

## GPT-4 Mini Integration

### Current Status

**GPT Service:** Already implemented in `/var/www/dokterdibya/staff/backend/services/openaiService.js`

**API Endpoint:** `POST /api/sunday-clinic/generate-anamnesa/:mrId`

**Categories Supported:**
- obstetri
- gyn_repro
- gyn_special

### How It Works

1. Patient fills intake form with minimal or free-text complaint
2. Data stored in `patient_intake_submissions.payload`
3. Staff opens Sunday Clinic record for this patient
4. Staff clicks "Generate AI Summary" button (to be implemented in UI)
5. Backend calls GPT-4 mini with category-specific prompt
6. AI generates anamnesa summary from intake data
7. Summary auto-fills in Anamnesa textarea
8. Staff reviews and edits as needed

### Next Steps for Full Implementation

To complete the GPT integration for the new flow:

1. **Add "Generate AI Summary" button** in gyn_special anamnesa component
2. **Handle free-text complaints** in GPT prompt builder
3. **Update prompts** to handle minimal data scenarios better

## Category Distribution

### Expected Patient Flow

**Obstetri (~40%):**
- Pregnant patients
- Full pregnancy questionnaire

**Gyn Repro (~30%):**
- Pre-pregnancy consultation
- Fertility programs (promil)
- Contraception consultation
- Detailed reproductive history

**Gyn Special (~30%):**
- **Subtype A:** Patients with menstrual issues (detailed questionnaire)
- **Subtype B:** General complaints (free-text only, GPT-assisted anamnesa)

## Testing Checklist

- [x] Question 1 "Ya" → obstetri category
- [x] Question 1 "Tidak" → Shows Question 2
- [x] Question 2 "Ya" → gyn_repro category
- [x] Question 2 "Tidak" → Shows Question 3
- [x] Question 3 "Ya" → gyn_special category with questionnaire
- [x] Question 3 "Tidak" → gyn_special category with free-text area
- [x] Free-text area is optional (not required)
- [x] Free-text patients get gyn_special category
- [x] No patients route to admin_followup anymore

## Benefits

1. **Simpler Questions:** Shorter, clearer question text
2. **Streamlined Flow:** Three questions maximum before identity page
3. **Flexible Intake:** Patients can write free-form complaints if no specific issue
4. **GPT Integration:** Staff can use AI to quickly generate anamnesa from any complaint
5. **Fewer Steps:** No separate "admin review" category - all patients go to appropriate medical category

## Backward Compatibility

Existing intake submissions with `category: 'admin_followup'` will still work but new submissions will not create this category.

## Deployment

**Status:** ✅ Changes deployed to production

**Files Changed:**
- `/var/www/dokterdibya/public/patient-intake.html`
- `/var/www/dokterdibya/public/scripts/patient-intake.js`

**No Server Restart Required:** Frontend-only changes

**URL:** https://dokterdibya.com/patient-intake.html

---

**Created:** 2025-11-21
**Author:** Claude Code Assistant
**Version:** 2.0 - Simplified Question Flow

# Sunday Clinic - Medical Record Templates & GPT Integration

## Overview

Sunday Clinic now has **3 complete medical record templates**, each tailored to specific patient categories with automatic MR ID generation:

1. **MROBS** - Obstetri (Kehamilan)
2. **MRGPR** - Ginekologi Reproduksi
3. **MRGPS** - Ginekologi Khusus

## MR ID System

### Category-Based MR IDs

| Category | MR Prefix | Example | Description |
|----------|-----------|---------|-------------|
| Obstetri | `MROBS` | MROBS0001, MROBS0002 | Pregnancy/maternity cases |
| Gyn Repro | `MRGPR` | MRGPR0001, MRGPR0002 | Reproductive gynecology |
| Gyn Special | `MRGPS` | MRGPS0001, MRGPS0002 | Special gynecology cases |

### Counter System

- Each category has its **own independent counter** in database table `sunday_clinic_mr_counters`
- Counters **never decrement** (even when records are deleted) - follows medical record best practices
- MR IDs are **never reused** - gaps in sequence indicate deleted records

### Category Determination

MR category is automatically assigned based on patient intake form:

```javascript
// From patient_intake_submissions.payload:
- pregnant_status === 'pregnant' → obstetri (MROBS)
- needs_reproductive === 'yes' → gyn_repro (MRGPR)
- has_gyn_issue === 'yes' → gyn_special (MRGPS)
```

## Template Structures

### 1. MROBS (Obstetri) Template

**Sections:**
1. **Identitas Pasien** - Patient identity info
2. **Anamnesa** - Focused on pregnancy history
   - Keluhan kehamilan (pregnancy complaints)
   - HPHT (last menstrual period)
   - Usia gestasi (gestational age)
   - Riwayat obstetri (G P A - Gravida, Para, Abortus)
   - Riwayat ANC sebelumnya
3. **Pemeriksaan Fisik** - Physical examination
4. **USG** - Obstetric ultrasound
   - Biometri janin (fetal biometry)
   - Cairan ketuban (amniotic fluid)
   - Plasenta (placenta assessment)
5. **Penunjang** - Lab/supporting tests
6. **Diagnosis** - Medical diagnosis
7. **Plan** - Treatment plan
8. **Tagihan** - Billing

**File:** `/staff/public/scripts/sunday-clinic/components/obstetri/anamnesa-obstetri.js`

---

### 2. MRGPR (Ginekologi Reproduksi) Template

**Sections:**
1. **Identitas Pasien**
2. **Anamnesa** - Focused on reproductive goals
   - **Tujuan konsultasi** (promil, KB, fertility check, pre-marital)
   - **Riwayat menstruasi** (menarche, cycle length, regularity, HPHT)
   - **Riwayat kontrasepsi** (contraception history)
   - **Penilaian kesuburan** (fertility assessment)
     - PCOS history
     - HSG/transvaginal USG history
     - Program hamil sebelumnya
     - Partner factors (smoking, alcohol, sperm analysis)
   - Riwayat kehamilan (G P A)
   - General medical history
3. **Pemeriksaan Fisik**
4. **USG Ginekologi** - Reproductive ultrasound (see image template)
   - Technical info (transabdominal/transvaginal)
   - **Rahim/Uterus:**
     - Posisi (anteverted/retroverted/anteflexed/retroflexed)
     - Ukuran (L × W × D cm, volume calculation)
     - Mioma (submukosa/intramural/subserosa)
     - Adenomyosis
   - **Endometrium:**
     - Ketebalan (thickness in mm)
     - Morfologi (trilaminar/echogenic/irregular/polyp)
   - **Ovarium (Kanan/Kiri):**
     - Ukuran (L × W × D cm)
     - Folikel (jumlah, ukuran min-max mm)
     - Penampakan PCO
     - Massa/kista (simple/complex/solid/mixed)
     - Internal echo, septa, dinding
   - Additional findings (free fluid, cervical assessment)
5. **Penunjang**
6. **Diagnosis**
7. **Plan**
8. **Tagihan**

**Files:**
- Anamnesa: `/staff/public/scripts/sunday-clinic/components/gyn-repro/anamnesa-gyn-repro.js`
- USG: `/staff/public/scripts/sunday-clinic/components/gyn-repro/usg-gyn-repro.js`

---

### 3. MRGPS (Ginekologi Khusus) Template

**Sections:**
1. **Identitas Pasien**
2. **Anamnesa** - Focused on gynecological complaints
   - **Keluhan utama:**
     - Keputihan/vaginal discharge
     - Perdarahan abnormal
     - Nyeri panggul/perut bawah
     - Benjolan/pembesaran perut bawah
     - Dyspareunia (nyeri saat berhubungan)
     - Keluhan berkemih/buang air besar
   - **Gejala ginekologi** (detailed symptom assessment)
   - Riwayat menstruasi (basic)
   - **Riwayat ginekologi:**
     - PAP smear history
     - Dyspareunia details
     - Riwayat operasi ginekologi
   - General medical history
3. **Pemeriksaan Fisik**
4. **USG Ginekologi** - Same as MRGPR but focused on pathology
5. **Penunjang**
6. **Diagnosis**
7. **Plan**
8. **Tagihan**

**Files:**
- Anamnesa: `/staff/public/scripts/sunday-clinic/components/gyn-special/anamnesa-gyn-special.js`
- USG: `/staff/public/scripts/sunday-clinic/components/gyn-special/usg-gyn-special.js`

---

## GPT-4o-mini Integration

### Purpose

Automatically generate anamnesa summaries from patient intake forms using AI to save doctor time and ensure consistency.

### Implementation

#### Backend Service

**File:** `/staff/backend/services/openaiService.js`

The service generates category-specific summaries:

```javascript
// For MROBS (Obstetri)
- Focus: pregnancy status, HPHT, gestational age, complaints, obstetric history (G P A)

// For MRGPR (Gyn Repro)
- Focus: reproductive goals (promil/KB), menstrual history, contraception, fertility assessment

// For MRGPS (Gyn Special)
- Focus: chief complaints, gynecological symptoms (discharge/bleeding/pain), gyn history
```

#### API Endpoint

**POST** `/api/sunday-clinic/generate-anamnesa/:mrId`

**Authentication:** Required (Bearer token)

**Request:**
```bash
POST /api/sunday-clinic/generate-anamnesa/MRGPR0001
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "summary": "Pasien datang dengan keluhan...",
    "category": "gyn_repro",
    "generatedAt": "2025-11-21T03:30:00.000Z"
  }
}
```

#### Configuration Required

Add to `/staff/backend/.env`:

```bash
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxx
```

Get API key from: https://platform.openai.com/api-keys

### Frontend Integration (To Be Implemented)

Add button in anamnesa section:

```html
<button class="btn btn-info" onclick="generateAISummary()">
  <i class="fas fa-robot"></i> Generate AI Summary
</button>
```

```javascript
async function generateAISummary() {
  try {
    const mrId = getCurrentMrId();
    const response = await fetch(`/api/sunday-clinic/generate-anamnesa/${mrId}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${getAuthToken()}`,
        'Content-Type': 'application/json'
      }
    });

    const result = await response.json();
    if (result.success) {
      // Insert summary into anamnesa textarea
      document.querySelector('[name="anamnesa_summary"]').value = result.data.summary;
      showSuccess('AI summary generated successfully');
    }
  } catch (error) {
    showError('Failed to generate AI summary');
  }
}
```

---

## Database Schema

### Tables

#### `sunday_clinic_records`
```sql
CREATE TABLE sunday_clinic_records (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    mr_id VARCHAR(20) NOT NULL,          -- MROBS0001, MRGPR0001, MRGPS0001
    mr_category VARCHAR(20),             -- obstetri, gyn_repro, gyn_special
    mr_sequence INT UNSIGNED,            -- Sequence number within category
    patient_id VARCHAR(10) NOT NULL,
    appointment_id INT DEFAULT NULL,
    folder_path VARCHAR(255) NOT NULL,
    status ENUM('draft','finalized','amended') DEFAULT 'draft',
    created_by BIGINT UNSIGNED,
    finalized_by BIGINT UNSIGNED,
    finalized_at DATETIME,
    last_activity_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_sunday_clinic_mr (mr_id),
    KEY idx_sunday_clinic_patient (patient_id),
    KEY idx_mr_category (mr_category),
    KEY idx_mr_sequence (mr_sequence)
);
```

#### `sunday_clinic_mr_counters`
```sql
CREATE TABLE sunday_clinic_mr_counters (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    category VARCHAR(20) NOT NULL,       -- obstetri, gyn_repro, gyn_special
    current_sequence INT UNSIGNED NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_category (category)
);
```

**Current Counter Values:**
- obstetri: 0
- gyn_repro: 0
- gyn_special: 1 (MRGPS0001 was created then deleted)

---

## Testing Checklist

### 1. Test MROBS Template
- [ ] Create new obstetri patient from intake form (pregnant_status = 'pregnant')
- [ ] Verify MR ID generated: MROBS0001
- [ ] Fill out anamnesa with pregnancy-specific fields
- [ ] Complete USG obstetri with fetal biometry
- [ ] Save and verify data persistence

### 2. Test MRGPR Template
- [ ] Create new gyn repro patient (needs_reproductive = 'yes')
- [ ] Verify MR ID generated: MRGPR0001
- [ ] Fill out anamnesa with reproductive goals
- [ ] Complete USG ginekologi with follicle monitoring
- [ ] Save and verify data persistence

### 3. Test MRGPS Template
- [ ] Create new gyn special patient (has_gyn_issue = 'yes')
- [ ] Verify MR ID generated: MRGPS0002 (counter continues from deleted record)
- [ ] Fill out anamnesa with gynecological complaints
- [ ] Complete USG ginekologi with pathology findings
- [ ] Save and verify data persistence

### 4. Test GPT Integration
- [ ] Add OPENAI_API_KEY to .env file
- [ ] Restart sunday-clinic PM2 process: `pm2 restart sunday-clinic`
- [ ] Create test patient with complete intake data
- [ ] Call `/api/sunday-clinic/generate-anamnesa/:mrId` endpoint
- [ ] Verify AI-generated summary is relevant and accurate
- [ ] Test for all 3 categories

---

## Deployment Steps

### 1. Add OpenAI API Key

```bash
# Edit .env file
nano /var/www/dokterdibya/staff/backend/.env

# Add line:
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxx

# Save and exit (Ctrl+X, Y, Enter)
```

### 2. Restart Backend Server

```bash
pm2 restart sunday-clinic
pm2 logs sunday-clinic --lines 50
```

### 3. Verify Setup

```bash
# Check server is running
pm2 status sunday-clinic

# Test API endpoint
curl -X POST https://dokterdibya.com/api/sunday-clinic/generate-anamnesa/MROBS0001 \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json"
```

---

## File Structure

```
/var/www/dokterdibya/staff/
├── backend/
│   ├── routes/
│   │   └── sunday-clinic.js              # Added GPT endpoint
│   ├── services/
│   │   ├── sundayClinicService.js
│   │   └── openaiService.js              # NEW: GPT integration
│   └── migrations/
│       └── 20251121_add_mr_category_system.sql
│
└── public/scripts/sunday-clinic/
    ├── components/
    │   ├── obstetri/
    │   │   ├── anamnesa-obstetri.js      # MROBS anamnesa
    │   │   └── usg-obstetri.js           # MROBS USG
    │   ├── gyn-repro/
    │   │   ├── anamnesa-gyn-repro.js     # MRGPR anamnesa
    │   │   └── usg-gyn-repro.js          # MRGPR USG (fertility focus)
    │   ├── gyn-special/
    │   │   ├── anamnesa-gyn-special.js   # MRGPS anamnesa
    │   │   └── usg-gyn-special.js        # MRGPS USG (pathology focus)
    │   └── shared/
    │       ├── identity-section.js
    │       ├── physical-exam.js
    │       ├── penunjang.js
    │       ├── diagnosis.js
    │       ├── plan.js
    │       └── billing.js
    └── utils/
        ├── constants.js                   # MR_PREFIX, CATEGORY_LABELS
        └── api-client.js

```

---

## API Reference

### Generate AI Anamnesa Summary

**Endpoint:** `POST /api/sunday-clinic/generate-anamnesa/:mrId`

**Authentication:** Required

**Parameters:**
- `mrId` (path) - Medical Record ID (MROBS0001, MRGPR0001, MRGPS0001)

**Success Response:**
```json
{
  "success": true,
  "data": {
    "summary": "Pasien Ny. X, 28 tahun, datang untuk konsultasi promil...",
    "category": "gyn_repro",
    "generatedAt": "2025-11-21T03:30:00.000Z"
  }
}
```

**Error Responses:**

400 Bad Request:
```json
{
  "success": false,
  "message": "MR ID tidak valid"
}
```

404 Not Found:
```json
{
  "success": false,
  "message": "Rekam medis Sunday Clinic tidak ditemukan"
}
```

500 Internal Server Error:
```json
{
  "success": false,
  "message": "OpenAI API tidak dikonfigurasi. Hubungi administrator."
}
```

---

## Notes

- All 3 templates share the same **shared components** (Identity, Physical Exam, Penunjang, Diagnosis, Plan, Billing)
- Only **Anamnesa** and **USG** sections are customized per category
- USG Ginekologi template matches the provided image specifications for MRGPR and MRGPS
- GPT-4o-mini model is used for cost efficiency (cheaper than GPT-4)
- AI summaries are **suggestions** - doctors should review and edit as needed
- Counter system ensures MR IDs are never reused (medical best practice)

---

## Future Enhancements

1. Add frontend UI button for "Generate AI Summary" in anamnesa section
2. Add loading spinner during AI generation
3. Allow doctors to regenerate summary with different prompts
4. Store AI-generated summaries in database for audit trail
5. Add cost tracking for OpenAI API usage
6. Implement caching for repeated requests
7. Add ability to fine-tune prompts per doctor preference

---

Generated: 2025-11-21
By: Claude Code Assistant

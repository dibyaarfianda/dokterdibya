# Patient Intake Form - Question Flow Diagram

## Visual Flow Chart

```
┌──────────────────────────────────────────┐
│  START: Form Riwayat Antenatal          │
│  Tujuan Kunjungan                        │
└────────────────┬─────────────────────────┘
                 │
                 ▼
┌────────────────────────────────────────────┐
│  Q1: Apakah Anda hamil? *                  │
│  ○ Ya    ○ Tidak                           │
└────┬───────────────────────┬───────────────┘
     │                       │
     │ Ya                    │ Tidak
     │                       │
     ▼                       ▼
┌─────────────────┐  ┌────────────────────────────────────────┐
│  CATEGORY:      │  │  Q2: Apakah ingin konsultasi sebelum   │
│  obstetri       │  │      kehamilan atau program hamil?    │
│                 │  │  ○ Ya    ○ Tidak                       │
│  NEXT PAGE:     │  └────┬───────────────────┬───────────────┘
│  Identitas &    │       │                   │
│  Sosial         │       │ Ya                │ Tidak
│                 │       │                   │
└─────────────────┘       ▼                   ▼
                   ┌─────────────────┐  ┌────────────────────────────────────┐
                   │  CATEGORY:      │  │  Q3: Ada gangguan menstruasi       │
                   │  gyn_repro      │  │      dalam jumlah, durasi, nyeri?  │
                   │                 │  │  ○ Ya    ○ Tidak                   │
                   │  NEXT PAGE:     │  └────┬───────────────────┬───────────┘
                   │  Identitas &    │       │                   │
                   │  Sosial         │       │ Ya                │ Tidak
                   │                 │       │                   │
                   │  THEN:          │       ▼                   ▼
                   │  Gyn Repro +    │  ┌─────────────────┐  ┌────────────────────┐
                   │  Fertility      │  │  CATEGORY:      │  │  CATEGORY:         │
                   │  Questions      │  │  gyn_special    │  │  gyn_special       │
                   └─────────────────┘  │                 │  │                    │
                                        │  NEXT PAGE:     │  │  SHOW:             │
                                        │  Identitas &    │  │  Free-text area    │
                                        │  Sosial         │  │                    │
                                        │                 │  │  "Silakan tuliskan │
                                        │  THEN:          │  │  keluhan anda      │
                                        │  Gyn Special    │  │  disini"           │
                                        │  Questions      │  │                    │
                                        └─────────────────┘  │  (Optional)        │
                                                             │                    │
                                                             │  NEXT PAGE:        │
                                                             │  Identitas & Sosial│
                                                             │                    │
                                                             │  NOTE:             │
                                                             │  "Staf akan bantu  │
                                                             │  anamnesa nanti"   │
                                                             └────────────────────┘
```

## Category Routing Summary

| Q1: Hamil? | Q2: Program Hamil? | Q3: Gangguan Haid? | Category    | Questionnaire Type              |
|------------|--------------------|--------------------|-------------|---------------------------------|
| **Ya**     | -                  | -                  | obstetri    | Full pregnancy questionnaire    |
| Tidak      | **Ya**             | -                  | gyn_repro   | Reproductive + fertility forms  |
| Tidak      | Tidak              | **Ya**             | gyn_special | Gynecology complaint forms      |
| Tidak      | Tidak              | Tidak              | gyn_special | Free-text only (GPT-assisted)   |

## Data Flow

### 1. Obstetri Patients (Q1 = Ya)

```
Patient Selects: "Ya, hamil"
    ↓
Category: obstetri
    ↓
Next Page: Identitas & Sosial
    ↓
Then Show Sections:
  - Kehamilan Saat Ini
  - Riwayat Obstetri (G P A L)
  - Riwayat Kehamilan Sebelumnya
  - Faktor Risiko
  - Riwayat Medis
    ↓
Sunday Clinic Record: MROBS####
```

### 2. Gyn Repro Patients (Q1 = Tidak, Q2 = Ya)

```
Patient Selects: "Tidak hamil" → "Ya, program hamil"
    ↓
Category: gyn_repro
    ↓
Next Page: Identitas & Sosial
    ↓
Then Show Sections:
  - Tujuan Reproduksi (promil/KB)
  - Riwayat Menstruasi
  - Riwayat Kontrasepsi
  - Penilaian Kesuburan
  - Fertility Program (if applicable)
  - Riwayat Medis
    ↓
Sunday Clinic Record: MRGPR####
```

### 3. Gyn Special with Issues (Q1 = Tidak, Q2 = Tidak, Q3 = Ya)

```
Patient Selects: "Tidak hamil" → "Tidak program hamil" → "Ya, ada gangguan haid"
    ↓
Category: gyn_special
    ↓
Next Page: Identitas & Sosial
    ↓
Then Show Sections:
  - Keluhan Utama Ginekologi
  - Gejala Ginekologi (discharge/bleeding/pain)
  - Riwayat Menstruasi (basic)
  - Riwayat Ginekologi (PAP smear, surgery)
  - Riwayat Medis
    ↓
Sunday Clinic Record: MRGPS####
```

### 4. Gyn Special with Free-Text (Q1 = Tidak, Q2 = Tidak, Q3 = Tidak)

```
Patient Selects: "Tidak hamil" → "Tidak program hamil" → "Tidak ada gangguan haid"
    ↓
Show: Free-text complaint area
Patient Writes: "Saya ingin konsultasi tentang..."
    ↓
Category: gyn_special
    ↓
Next Page: Identitas & Sosial
    ↓
Then Show Sections:
  - Basic identity only
  - No detailed questionnaire
    ↓
Sunday Clinic Record: MRGPS####
    ↓
Staff Uses: GPT-4 mini to generate anamnesa from free-text
```

## GPT-4 Mini Integration Points

### When Patient Has Detailed Questionnaire

**Input:** Structured form data from intake
**Process:** GPT builds anamnesa from specific fields
**Output:** Detailed anamnesa summary

**Example:**
```
Input: {
  chief_complaints: ["keputihan", "nyeri_haid"],
  discharge_details: "Keputihan berbau, warna kuning",
  pain_details: "Nyeri saat haid sangat kuat",
  cycle_length: "28 hari",
  ...
}

Output GPT:
"Pasien Ny. X, 28 tahun, datang dengan keluhan keputihan berbau
warna kuning sejak 2 minggu yang lalu. Pasien juga mengeluh
nyeri haid yang sangat kuat. Siklus haid teratur 28 hari..."
```

### When Patient Has Free-Text Only

**Input:** Free-form complaint text
**Process:** GPT extracts key information and structures it
**Output:** Organized anamnesa summary

**Example:**
```
Input: {
  admin_followup_note: "Saya mau konsultasi soal siklus haid saya
  yang tidak teratur. Kadang 2 bulan sekali, kadang sebulan 2 kali.
  Saya juga merasa sering lelah."
}

Output GPT:
"Pasien datang dengan keluhan siklus menstruasi tidak teratur,
dimana terkadang haid datang 2 bulan sekali, terkadang sebulan
2 kali. Pasien juga mengeluh sering merasa lelah.
Perlu evaluasi lebih lanjut untuk gangguan menstruasi dan
kemungkinan anemia."
```

## Benefits of New Flow

### For Patients:
✅ Simpler questions (just "Ya" or "Tidak")
✅ Fewer clicks to get to identity page
✅ Option to write free-form complaints
✅ No need to fit into predefined categories

### For Staff:
✅ All patients categorized correctly (obstetri, gyn_repro, gyn_special)
✅ GPT-4 mini helps complete anamnesa from any input
✅ No "admin review" bottleneck
✅ Better integration with Sunday Clinic MR system

### For System:
✅ Clear 3-way categorization
✅ Consistent MR ID assignment (MROBS/MRGPR/MRGPS)
✅ GPT integration reduces manual data entry
✅ Better data quality for medical records

---

**Last Updated:** 2025-11-21
**Flow Version:** 2.0

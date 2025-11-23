# SUNDAY CLINIC OLD IMPLEMENTATION - COMPLETE ANALYSIS

## DATA FLOW ARCHITECTURE

### 1. IDENTITY SECTION (Identitas)

**DATA SOURCES:**
```
state.data {
  record: {},
  patient: {},
  appointment: {},
  intake: {},
  medicalRecords: {}
}
↓
computeDerived(state.data)
↓
state.derived {
  - ALL normalized and merged data from record, patient, intake, appointment
  - patientName, patientId, age, phone, emergencyContact
  - address, maritalStatus, husbandName, husbandAge, husbandJob
  - occupation, education, insurance
  - edd, lmp, gestationalAge, gravida, para, abortus, living
  - riskFlags, riskFactorCodes, highRisk
  - cycle (menarcheAge, cycleLength, regular)
  - contraception (previous, failure, failureType)
  - intakeCreatedAt, intakeReviewedAt, intakeReviewedBy, intakeStatus
}
```

**INTAKE MAPPING:**
- `payload.full_name` → `derived.patientName` (title cased)
- `payload.phone` → `derived.phone`
- `payload.patient_emergency_contact` → `derived.emergencyContact`
- `payload.address` → `derived.address` (normalized)
- `payload.marital_status` → `derived.maritalStatus` (formatted)
- `payload.husband_name` → `derived.husbandName` (title cased)
- `payload.husband_age` → `derived.husbandAge`
- `payload.husband_job` → `derived.husbandJob` (normalized)
- `payload.occupation` → `derived.occupation` (normalized)
- `payload.education` → `derived.education` (normalized)
- `payload.insurance` → `derived.insurance` (normalized)
- `summary.lmp` or `payload.lmp_date` → `derived.lmp`
- `summary.edd` or `metadata.edd.value` → `derived.edd`
- `metadata.obstetricTotals.gravida` or `payload.gravida_count` → `derived.gravida`
- `metadata.obstetricTotals.para` or `payload.para_count` → `derived.para`
- `metadata.obstetricTotals.abortus` or `payload.abortus_count` → `derived.abortus`
- `metadata.obstetricTotals.living` or `payload.living_children_count` → `derived.living`
- `summary.riskFlags` → `derived.riskFlags`
- `summary.highRisk` → `derived.highRisk`

**DISPLAY FORMAT:**
- Two-column grid layout
- Left: "Data Utama" (primary info) - 14 rows showing patient demographics
- Right: "Informasi Intake" (intake info) - 5 rows showing intake status
- Bottom: "Kategori Pasien (Manual Override)" - radio buttons for category selection
  - Options: "Obstetri (Kehamilan)", "Ginekologi Spesialis", "Otomatis (dari form)"

**SAVE BEHAVIOR:**
- Manual category selection triggers save button visibility
- Saves to medical records with type='identitas'
- Payload: `{ manual_patient_category: 'obstetric' | 'gyn_special' | '' }`
- Uses `getMedicalRecordContext('identitas')` to load saved category

**ROUTING RULES:**
- Manual category override can force anamnesa template selection
- If no manual category: uses intake form routing (`payload.pregnant_status`, `payload.needs_reproductive`, `payload.has_gyn_issue`)
- Warning shown if patient has intake form but override is selected

---

### 2. ANAMNESA SECTION

**DATA SOURCES:**
```
state.derived (from intake) + getMedicalRecordContext('anamnesa')
```

**INTAKE MAPPING (Priority: saved data > intake data):**
- `keluhan_utama`: `savedData.keluhan_utama` || `derived.appointment.chiefComplaint` || `payload.current_symptoms` || `payload.reason`
- `riwayat_kehamilan_saat_ini`: `savedData.riwayat_kehamilan_saat_ini` || `payload.current_pregnancy_history` || `payload.obstetric_history`
- `hpht`: `savedData.hpht` || `derived.lmp`
- `hpl`: `savedData.hpl` || `derived.edd`
- `detail_riwayat_penyakit`: `savedData.detail_riwayat_penyakit` || `payload.past_medical_history` || `payload.other_conditions` || `payload.past_conditions_detail`
- `riwayat_keluarga`: `savedData.riwayat_keluarga` || `payload.family_medical_history` || `payload.family_history_detail`
- `alergi_obat`: `savedData.alergi_obat` || `payload.drug_allergies` || `payload.allergy_drugs`
- `alergi_makanan`: `savedData.alergi_makanan` || `payload.food_allergies` || `payload.allergy_food`
- `alergi_lingkungan`: `savedData.alergi_lingkungan` || `payload.other_allergies` || `payload.allergy_env`
- `gravida`: `savedData.gravida` ?? `derived.gravida`
- `para`: `savedData.para` ?? `derived.para`
- `abortus`: `savedData.abortus` ?? `derived.abortus`
- `anak_hidup`: `savedData.anak_hidup` ?? `derived.living`
- `usia_menarche`: `savedData.usia_menarche` ?? `derived.cycle.menarcheAge`
- `lama_siklus`: `savedData.lama_siklus` ?? `derived.cycle.cycleLength`
- `siklus_teratur`: `savedData.siklus_teratur` ?? (derived.cycle.regular ? 'Ya' : 'Tidak')
- `metode_kb_terakhir`: `savedData.metode_kb_terakhir` ?? `derived.contraception.previous`
- `kegagalan_kb`: `savedData.kegagalan_kb` ?? (derived.contraception.failure ? 'Ya' : 'Tidak')
- `jenis_kb_gagal`: `savedData.jenis_kb_gagal` ?? `derived.contraception.failureType`

**DISPLAY FORMAT:**
- Shows metadata header: `renderRecordMeta(context, 'anamnesa')` - timestamp, doctor name
- Two-column grid layout
- Left: "Keluhan & Kehamilan Saat Ini" - 4 fields
- Right: "Riwayat Medis" - 5 fields (allergies, medical history)
- Additional sections with GPPAL and menstruation data
- All fields are editable textareas/inputs
- "Update" button appears when any field changes

**SAVE BEHAVIOR:**
- Change detection on all `.anamnesa-field` elements
- Shows "Update" button when dirty
- Saves to medical records with type='anamnesa'
- Includes `doctorName` and `doctorId` from `currentStaffIdentity`
- Uses GMT+7 timestamp

---

### 3. PEMERIKSAAN FISIK SECTION

**DATA SOURCES:**
- Uses `getMedicalRecordContext('physical_exam')` to load saved data
- Capitalizes patient data using `capitalizePatientData()`

**FIELDS:**
- Vital Signs (4 fields): Tekanan Darah (default: 120/80), Nadi (88), Suhu (36.8), Respirasi (18)
- Examination Findings (5 textareas):
  - Kepala & Leher (default: "Anemia/Icterus/Cyanosis/Dyspneu (-)")
  - Thorax (default: "Simetris. Vesiculer/vesicular. Rhonki/Wheezing (-)\nS1 S2 tunggal, murmur (-), gallop (-)")
  - Abdomen (default: "BU (+), Soepel\nGravida tampak sesuai usia kehamilan / Massa abdomen")
  - Ekstremitas (default: "Akral hangat, kering. CRT < 2 detik")
  - Pemeriksaan Obstetri (default: "TFU:\nDJJ:\nVT: (tidak dilakukan)")

**SAVE BUTTON BEHAVIOR:**
- Event listener attached via `setTimeout` after render
- Calls `savePhysicalExam()` function
- Button text: "Simpan Pemeriksaan Fisik" with save icon

**DATABASE ROUTING:**
- POST to `/api/medical-records`
- Payload structure:
  ```javascript
  {
    patientId: state.derived.patientId,
    type: 'physical_exam',
    data: {
      tekanan_darah, nadi, suhu, respirasi,
      kepala_leher, thorax, abdomen, ekstremitas, pemeriksaan_obstetri
    },
    timestamp: getGMT7Timestamp(),
    doctorName: currentStaffIdentity.name,
    doctorId: currentStaffIdentity.id
  }
  ```
- After save: calls `fetchRecord(routeMrSlug)` to reload record
- Shows success message: "Pemeriksaan Fisik berhasil disimpan!"

**DISPLAY:**
- Shows metadata header: `renderRecordMeta(context, 'physical_exam')` - timestamp, doctor name
- All fields are editable inputs/textareas with saved data pre-filled

---

### 4. USG SECTION

**SAVE BEHAVIOR:**
- Function: `saveUSGExam()`
- Detects active trimester from `.trimester-selector .btn.active input`
- Collects different data based on trimester (first/second/third/screening)
- Checks for existing record via `getMedicalRecordContext('usg')`

**CREATE vs UPDATE:**
- If `existingRecordId` exists: PUT to `/api/medical-records/${existingRecordId}`
- If new: POST to `/api/medical-records` with full payload
- Both include timestamp via `getGMT7Timestamp()` for new records
- NO doctorName/doctorId added to USG records (different from other sections!)

**DISPLAY AFTER SAVE:**
- Calls `fetchRecord(routeMrSlug)` to reload entire record
- Shows success message: "Data USG berhasil diperbarui!" or "Data USG berhasil disimpan!"
- Hides edit form: `#usg-edit-form` set to `display: none`
- Re-enables save button for future edits

**BUTTON STATE:**
- Disabled during save with spinner: '<i class="fas fa-spinner fa-spin"></i> Menyimpan...'
- Re-enabled after: '<i class="fas fa-save"></i> Simpan'

---

### 5. TAGIHAN (BILLING) SECTION

**EXACT WORKFLOW:**

1. **Initial Render:**
   - Shows loading spinner
   - Calls `loadBilling()` to fetch existing billing from API
   - Checks for draft terapi in sessionStorage via `getDraftTerapi()`

2. **Auto-Generation:**
   - If no billing exists: calls `generateBillingItemsFromPlanning()`
   - If items found: auto-saves to database with POST to `/api/sunday-clinic/billing/${routeMrSlug}`
   - Then reloads billing data

3. **Draft Terapi Handling:**
   - Merges draft terapi items with billing items
   - Sets `billing.hasDraftItems = true`
   - Draft items displayed with blue highlight (`.table-info`)
   - Shows "Belum disimpan" icon and "Akan dihitung" for prices

4. **Display Format:**
   - READ-ONLY table with columns: Item, Qty, Harga, Total
   - Saved items show actual prices and totals
   - Draft items show quantity + unit but prices as "Akan dihitung"
   - Status badge: "Draft" (warning) or "Dikonfirmasi" (success) or "Menunggu Konfirmasi Dokter" (warning with icon)

5. **Action Buttons (Role-based):**
   - **Doctor + Draft status:** "Konfirmasi Tagihan" button
   - **Non-doctor + Draft status:** Info message "Tagihan menunggu konfirmasi dokter"
   - **Confirmed status:** "Cetak Etiket" and "Cetak Invoice" buttons
   - **Pending changes:** Shows change request warnings

6. **Confirmation Flow:**
   - Doctor clicks "Konfirmasi Tagihan"
   - Saves `confirmed_by` and `confirmed_at` to database
   - Changes status from 'draft' to 'confirmed'
   - Unlocks print buttons

7. **Real-time Updates:**
   - Starts polling via `startChangeNotificationPolling()`
   - Monitors for changes from other users/sessions

**API ENDPOINTS:**
- Load: GET `/api/sunday-clinic/billing/${routeMrSlug}`
- Save: POST `/api/sunday-clinic/billing/${routeMrSlug}` with `{ items, status }`
- Confirm: PUT `/api/sunday-clinic/billing/${routeMrSlug}/confirm`

---

### 6. PLANNING SECTION

**WORKFLOW (already analyzed):**
- Tindakan/Terapi modals save to billing database automatically
- Items flow: Planning → Billing API → Tagihan display
- Uses sessionStorage for draft terapi before final save

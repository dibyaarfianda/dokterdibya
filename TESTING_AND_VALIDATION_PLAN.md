# Sunday Clinic 3-Template System - Testing & Validation Plan

## Document Information
- **Date Created:** 2025-11-20
- **Version:** 1.0
- **Status:** Ready for Execution
- **Purpose:** Comprehensive testing checklist for validating the 3-template system before production deployment

---

## 📋 Table of Contents

1. [Pre-Testing Setup](#pre-testing-setup)
2. [Unit Testing](#unit-testing)
3. [Component Integration Testing](#component-integration-testing)
4. [End-to-End Testing](#end-to-end-testing)
5. [Category-Specific Testing](#category-specific-testing)
6. [Data Migration Testing](#data-migration-testing)
7. [Performance Testing](#performance-testing)
8. [Browser Compatibility Testing](#browser-compatibility-testing)
9. [Security Testing](#security-testing)
10. [User Acceptance Testing](#user-acceptance-testing)
11. [Test Results Documentation](#test-results-documentation)

---

## 🔧 Pre-Testing Setup

### Environment Preparation

- [ ] **Staging Environment Setup**
  - [ ] Clone production database to staging
  - [ ] Run database migration: `20251120_add_mr_category_system.sql`
  - [ ] Deploy all 16 component files to staging
  - [ ] Deploy new `sunday-clinic.js` to staging
  - [ ] Update `sunday-clinic.html` with sidebar changes
  - [ ] Verify backend API endpoints are accessible

- [ ] **Test Data Preparation**
  - [ ] Create test patient for Obstetri category
  - [ ] Create test patient for Gyn Repro category
  - [ ] Create test patient for Gyn Special category
  - [ ] Create at least 5 existing MR records (pre-migration format)
  - [ ] Prepare test data for all form fields

- [ ] **Testing Tools Setup**
  - [ ] Browser DevTools configured
  - [ ] Network monitoring enabled
  - [ ] Console error tracking enabled
  - [ ] Performance profiler ready
  - [ ] Screenshot/recording tools ready

---

## 🧪 Unit Testing

### 1. Core Infrastructure Components

#### StateManager (`utils/state-manager.js`)

**Test Case 1.1: State Initialization**
- [ ] Initialize StateManager
- [ ] Verify default state object created
- [ ] Verify currentMrId is null
- [ ] Verify currentCategory is null
- [ ] Verify observers array is empty

**Test Case 1.2: Load Record Data**
```javascript
const testRecord = {
    mr_id: 'MROBS0001',
    mr_category: 'obstetri',
    patient: { full_name: 'Test Patient' },
    anamnesa: { chiefComplaints: { complaints: 'Test complaint' } }
};
stateManager.loadRecord(testRecord);
```
- [ ] State populated correctly
- [ ] currentMrId set to 'MROBS0001'
- [ ] currentCategory set to 'obstetri'
- [ ] Patient data accessible

**Test Case 1.3: State Updates & Observers**
- [ ] Subscribe observer function
- [ ] Update state value
- [ ] Verify observer notified
- [ ] Unsubscribe observer
- [ ] Update state again
- [ ] Verify observer NOT notified

#### APIClient (`utils/api-client.js`)

**Test Case 2.1: Token Management**
- [ ] Set token using `setToken('test-token')`
- [ ] Verify localStorage contains 'staffToken'
- [ ] Verify APIClient.token set correctly
- [ ] Clear token
- [ ] Verify token removed from localStorage

**Test Case 2.2: GET Requests**
```javascript
await apiClient.get('/api/staff/sunday-clinic/directory');
```
- [ ] Request includes Authorization header
- [ ] Request includes Content-Type header
- [ ] Response parsed as JSON
- [ ] Error handling works for 404
- [ ] Error handling works for 401
- [ ] Error handling works for 500

**Test Case 2.3: POST Requests**
```javascript
await apiClient.post('/api/staff/sunday-clinic/records/MROBS0001/anamnesa', {
    chiefComplaints: { complaints: 'Test' }
});
```
- [ ] Request body stringified correctly
- [ ] Request includes Authorization header
- [ ] Response parsed correctly
- [ ] Error handling works

**Test Case 2.4: Specialized Methods**
- [ ] `getRecord(mrId)` - Returns record data
- [ ] `getDirectory(search)` - Returns patient list
- [ ] `saveSection(mrId, section, data)` - Saves section
- [ ] `saveRecord(mrId, recordData)` - Saves entire record
- [ ] `getPatients(searchTerm)` - Returns patients
- [ ] `createRecord(patientId, category)` - Creates new MR

### 2. Shared Components Testing

#### Physical Exam (`components/shared/physical-exam.js`)

**Test Case 3.1: Component Rendering**
- [ ] Call `render(state)` with mock state
- [ ] Verify HTML structure generated
- [ ] Verify all sections present:
  - [ ] Vital Signs (TD, HR, RR, Temperature)
  - [ ] Anthropometry (TB, BB, BMI)
  - [ ] General Examination
  - [ ] Breast Examination
  - [ ] Genital Examination (external/internal)
  - [ ] Additional Notes
- [ ] Verify input fields have correct IDs
- [ ] Verify event listeners attached

**Test Case 3.2: Auto-Calculations**
```javascript
// Set TB = 160 cm, BB = 64 kg
document.getElementById('pe-tb').value = '160';
document.getElementById('pe-bb').value = '64';
// Trigger calculation
```
- [ ] BMI calculated correctly: 25.0
- [ ] BMI displayed in format: "25.0 kg/m²"
- [ ] BMI category shown: "Overweight" (25-29.9)

**Test Case 3.3: Data Collection**
- [ ] Fill all form fields with test data
- [ ] Call `save(state)`
- [ ] Verify collected data structure:
  ```javascript
  {
      vital_signs: { td_systolic: 120, td_diastolic: 80, ... },
      anthropometry: { tb: 160, bb: 64, bmi: 25.0 },
      general_examination: { ... },
      breast_examination: { ... },
      genital_examination: { ... },
      additional_notes: "Test notes"
  }
  ```
- [ ] Verify numeric fields converted to numbers
- [ ] Verify empty fields handled correctly

#### Diagnosis (`components/shared/diagnosis.js`)

**Test Case 4.1: Dynamic List - Add Diagnosis**
- [ ] Initial state: 1 diagnosis row
- [ ] Click "Tambah Diagnosis" button
- [ ] Verify 2nd row appears
- [ ] Verify 2nd row has unique IDs
- [ ] Add 3rd diagnosis
- [ ] Verify 3 total rows

**Test Case 4.2: Dynamic List - Remove Diagnosis**
- [ ] Add 3 diagnoses
- [ ] Click remove on 2nd diagnosis
- [ ] Verify 2nd row removed
- [ ] Verify 1st and 3rd rows remain
- [ ] Verify cannot remove last remaining row

**Test Case 4.3: ICD-10 Code Validation** (If implemented)
- [ ] Enter valid ICD-10 code (e.g., "O80")
- [ ] Verify acceptance
- [ ] Enter invalid code (e.g., "INVALID")
- [ ] Verify validation error

**Test Case 4.4: Data Collection**
- [ ] Add 3 diagnoses with different data
- [ ] Call `save(state)`
- [ ] Verify array structure:
  ```javascript
  {
      diagnoses: [
          { diagnosis: 'G1P0A0', icd10_code: 'O09.9', notes: 'Test 1' },
          { diagnosis: 'Anemia', icd10_code: 'D50.9', notes: 'Test 2' },
          { diagnosis: 'UTI', icd10_code: 'N39.0', notes: 'Test 3' }
      ]
  }
  ```

#### Plan (`components/shared/plan.js`)

**Test Case 5.1: Medication List - Add/Remove**
- [ ] Add medication using "Tambah Obat" button
- [ ] Verify new row appears with correct fields (name, dose, frequency, duration, notes)
- [ ] Add 3 medications
- [ ] Remove 2nd medication
- [ ] Verify 1st and 3rd remain

**Test Case 5.2: Laboratory/Penunjang Tests**
- [ ] Check lab test checkboxes
- [ ] Verify selected tests tracked
- [ ] Uncheck test
- [ ] Verify test removed from selection

**Test Case 5.3: Data Collection**
- [ ] Fill management recommendations
- [ ] Add 2 medications
- [ ] Select 3 lab tests
- [ ] Enter next visit date
- [ ] Enter additional notes
- [ ] Call `save(state)`
- [ ] Verify complete data structure collected

#### Billing (`components/shared/billing.js`)

**Test Case 6.1: Billing Item Management**
- [ ] Add billing item using "Tambah Item" button
- [ ] Verify fields: description, quantity, unit_price, total
- [ ] Add item with quantity=2, price=50000
- [ ] Verify total calculated: 100000

**Test Case 6.2: Auto-Calculate Totals**
```javascript
// Add 3 items:
// Item 1: 2 × 50000 = 100000
// Item 2: 1 × 75000 = 75000
// Item 3: 3 × 20000 = 60000
```
- [ ] Verify subtotal: 235000
- [ ] Verify discount field appears
- [ ] Enter discount: 10000
- [ ] Verify grand total: 225000
- [ ] Change item quantity
- [ ] Verify totals recalculate

**Test Case 6.3: Payment Methods**
- [ ] Select "Cash" payment method
- [ ] Verify payment_method value set
- [ ] Select "Transfer" payment method
- [ ] Verify bank details field appears
- [ ] Select "Insurance" payment method
- [ ] Verify insurance field appears

**Test Case 6.4: Data Collection**
- [ ] Add 3 billing items
- [ ] Set discount
- [ ] Select payment method
- [ ] Call `save(state)`
- [ ] Verify structure:
  ```javascript
  {
      items: [
          { description: 'Item 1', quantity: 2, unit_price: 50000, total: 100000 },
          // ... more items
      ],
      subtotal: 235000,
      discount: 10000,
      grand_total: 225000,
      payment_method: 'cash',
      payment_status: 'pending'
  }
  ```

### 3. Category-Specific Components Testing

#### Obstetri Anamnesa (`components/obstetri/anamnesa-obstetri.js`)

**Test Case 7.1: Pregnancy-Specific Fields**
- [ ] HPHT (Last Menstrual Period) date input
- [ ] EDD (Estimated Due Date) auto-calculation
- [ ] Enter HPHT: 2025-04-01
- [ ] Verify EDD calculated: 2026-01-06 (280 days later)
- [ ] Verify EDD formula: HPHT + 280 days

**Test Case 7.2: Gravidity/Parity (GTPAL)**
- [ ] Input G (Gravida): 3
- [ ] Input T (Term): 2
- [ ] Input P (Preterm): 0
- [ ] Input A (Abortion): 1
- [ ] Input L (Living): 2
- [ ] Verify all values captured correctly

**Test Case 7.3: Pregnancy Complaints**
- [ ] Select multiple pregnancy complaints (nausea, vomiting, edema)
- [ ] Verify checkboxes toggle correctly
- [ ] Verify selected values collected in save()

**Test Case 7.4: Obstetric History**
- [ ] Add previous pregnancy using "Tambah Kehamilan" button
- [ ] Fill pregnancy data (year, GA, method, outcome, weight, complications)
- [ ] Add 2nd pregnancy
- [ ] Remove 1st pregnancy
- [ ] Verify dynamic list works correctly

#### Gyn Repro Anamnesa (`components/gyn-repro/anamnesa-gyn-repro.js`)

**Test Case 8.1: Fertility-Specific Fields**
- [ ] Trying to conceive duration (months)
- [ ] Input value: 24 months
- [ ] Verify captured correctly

**Test Case 8.2: Menstrual History (Detailed)**
- [ ] Menarche age input
- [ ] Cycle regularity (regular/irregular)
- [ ] Cycle duration (days)
- [ ] Menstrual flow (light/normal/heavy)
- [ ] Dysmenorrhea severity (none/mild/moderate/severe)
- [ ] Verify all fields render and capture

**Test Case 8.3: Contraceptive History**
- [ ] Select contraceptive method (Pills, IUD, Condom, etc.)
- [ ] Enter duration of use
- [ ] Enter discontinuation date (if applicable)
- [ ] Verify side effects field appears
- [ ] Enter side effects notes
- [ ] Verify data collected correctly

**Test Case 8.4: Previous Infertility Treatments**
- [ ] Add treatment using "Tambah Treatment" button
- [ ] Fill fields (treatment type, date, location, outcome)
- [ ] Add multiple treatments
- [ ] Verify dynamic list functionality

#### Gyn Special Anamnesa (`components/gyn-special/anamnesa-gyn-special.js`)

**Test Case 9.1: Chief Complaints (Pathology-Specific)**
- [ ] Discharge checkbox
- [ ] Abnormal bleeding checkbox
- [ ] Pelvic pain checkbox
- [ ] Lower abdomen mass checkbox
- [ ] Dyspareunia checkbox
- [ ] Verify multiple selection possible

**Test Case 9.2: Vaginal Discharge Assessment**
- [ ] Discharge frequency (occasional/frequent/constant)
- [ ] Discharge color (clear/white/yellow/green/brown/bloody)
- [ ] Discharge characteristics (watery/thick/cottage-cheese-like/frothy/foul-smelling)
- [ ] Verify multi-select works for characteristics
- [ ] Verify data collected as arrays

**Test Case 9.3: Pelvic Pain Assessment**
- [ ] Pain location checkboxes (lower abdomen, pelvis, back, etc.)
- [ ] Pain characteristics (cramping, sharp, dull, burning, radiating)
- [ ] Pain intensity slider (0-10)
- [ ] Pain timing (during menstruation, during intercourse, constant, intermittent, cyclical)
- [ ] Verify slider updates display value
- [ ] Verify all multi-selects work

**Test Case 9.4: Abnormal Bleeding Patterns**
- [ ] Menorrhagia (heavy menstrual bleeding)
- [ ] Metrorrhagia (irregular bleeding)
- [ ] Postcoital bleeding
- [ ] Postmenopausal bleeding
- [ ] Intermenstrual spotting
- [ ] Prolonged menstrual bleeding
- [ ] For each selected, verify duration and amount fields appear
- [ ] Verify conditional rendering works

**Test Case 9.5: PAP Smear History**
- [ ] Last PAP smear date input
- [ ] PAP smear result selection (Normal, ASCUS, LSIL, HSIL, Carcinoma)
- [ ] Follow-up needed checkbox
- [ ] Verify conditional fields appear

### 4. USG Components Testing

#### Obstetri USG (`components/obstetri/usg-obstetri.js`)

**Test Case 10.1: Fetal Biometry Auto-Calculations**
```javascript
// Input biometry measurements:
BPD = 85 mm
HC = 310 mm
AC = 290 mm
FL = 65 mm
```
- [ ] Verify GA (Gestational Age) calculated for each parameter
- [ ] Verify average GA calculated
- [ ] Verify EFW (Estimated Fetal Weight) calculated using Hadlock formula
- [ ] Expected EFW ≈ 2500-2700 grams (verify formula correct)

**Test Case 10.2: Hadlock Formula Verification**
```javascript
// Hadlock Formula:
// log10(EFW) = 1.326 - 0.00326(AC×FL) + 0.0107(HC) + 0.0438(AC) + 0.158(FL)
```
- [ ] Manual calculation matches component calculation
- [ ] EFW displayed in grams with proper formatting

**Test Case 10.3: Amniotic Fluid Assessment**
- [ ] AFI (Amniotic Fluid Index) input
- [ ] AFI category auto-determined:
  - [ ] < 5: Oligohydramnios
  - [ ] 5-8: Borderline
  - [ ] 8-25: Normal
  - [ ] > 25: Polyhydramnios

**Test Case 10.4: Doppler Studies**
- [ ] Umbilical artery PI/RI inputs
- [ ] MCA (Middle Cerebral Artery) PSV input
- [ ] CPR (Cerebroplacental Ratio) auto-calculation
- [ ] CPR = MCA PSV / Umbilical Artery PSV
- [ ] Verify CPR < 1.0 flagged as abnormal

**Test Case 10.5: Placenta Assessment**
- [ ] Placenta location (anterior/posterior/fundal/low-lying)
- [ ] Placenta grade (0/I/II/III)
- [ ] Distance from internal os (if low-lying)
- [ ] Verify all fields captured

#### Gyn Repro USG (`components/gyn-repro/usg-gyn-repro.js`)

**Test Case 11.1: Ovarian Follicle Tracking**
- [ ] Add follicle using "Tambah Folikel" button
- [ ] Enter follicle data (ovary side, diameter, count)
- [ ] Add multiple follicles
- [ ] Verify dynamic list works
- [ ] Remove follicle
- [ ] Verify removal works

**Test Case 11.2: Endometrial Assessment**
- [ ] Endometrial thickness measurement (mm)
- [ ] Endometrial pattern (trilaminar/non-trilaminar/irregular)
- [ ] Echo texture (homogeneous/heterogeneous)
- [ ] Verify all captured

**Test Case 11.3: Ovarian Assessment**
- [ ] Right ovary dimensions (length × width × height)
- [ ] Right ovary volume auto-calculation: V = 0.523 × L × W × H
- [ ] Left ovary dimensions
- [ ] Left ovary volume auto-calculation
- [ ] Verify volume formula correct

**Test Case 11.4: AFC (Antral Follicle Count)**
- [ ] Right ovary AFC input
- [ ] Left ovary AFC input
- [ ] Total AFC auto-sum
- [ ] Verify calculation correct

#### Gyn Special USG (`components/gyn-special/usg-gyn-special.js`)

**Test Case 12.1: Pathology Detection**
- [ ] Fibroid/myoma checkbox
- [ ] Ovarian cyst checkbox
- [ ] Endometrial pathology checkbox
- [ ] Adenomyosis checkbox
- [ ] Verify conditional detail fields appear for each

**Test Case 12.2: Fibroid/Myoma Details**
- [ ] Select "Fibroid/myoma detected"
- [ ] Add myoma using "Tambah Myoma" button
- [ ] Enter myoma data (location, size, type)
- [ ] Add multiple myomas
- [ ] Remove myoma
- [ ] Verify dynamic list functionality

**Test Case 12.3: Ovarian Cyst Details**
- [ ] Select "Ovarian cyst detected"
- [ ] Side (right/left/bilateral)
- [ ] Size (cm)
- [ ] Type (simple/complex/hemorrhagic/dermoid/endometrioma)
- [ ] Septations (present/absent)
- [ ] Verify all captured

**Test Case 12.4: Endometrial Pathology**
- [ ] Endometrial thickness (if thickened)
- [ ] Echogenicity (hyperechoic/hypoechoic/heterogeneous)
- [ ] Polyp suspected checkbox
- [ ] Hyperplasia suspected checkbox
- [ ] Verify conditional rendering

---

## 🔄 Component Integration Testing

### 13. Component Loading System

**Test Case 13.1: Obstetri Category Loading**
- [ ] Create/load Obstetri patient (MROBS####)
- [ ] Verify components loaded:
  - [ ] `anamnesa-obstetri.js` (category-specific)
  - [ ] `usg-obstetri.js` (category-specific)
  - [ ] `physical-exam.js` (shared)
  - [ ] `penunjang.js` (shared)
  - [ ] `diagnosis.js` (shared)
  - [ ] `plan.js` (shared)
  - [ ] `billing.js` (shared)
- [ ] Verify correct badge shown: "OBSTETRI" (blue)

**Test Case 13.2: Gyn Repro Category Loading**
- [ ] Create/load Gyn Repro patient (MRGPR####)
- [ ] Verify components loaded:
  - [ ] `anamnesa-gyn-repro.js`
  - [ ] `usg-gyn-repro.js`
  - [ ] All shared components
- [ ] Verify badge: "GYN REPRO" (green)

**Test Case 13.3: Gyn Special Category Loading**
- [ ] Create/load Gyn Special patient (MRGPS####)
- [ ] Verify components loaded:
  - [ ] `anamnesa-gyn-special.js`
  - [ ] `usg-gyn-special.js`
  - [ ] All shared components
- [ ] Verify badge: "GYN SPECIAL" (info/teal)

**Test Case 13.4: Component Loading Error Handling**
- [ ] Simulate component load failure (rename component file temporarily)
- [ ] Verify placeholder component shown
- [ ] Verify error logged to console
- [ ] Verify other components still load
- [ ] Verify app doesn't crash

### 14. State Management Integration

**Test Case 14.1: State Persistence Across Navigation**
- [ ] Load patient record
- [ ] Navigate to Anamnesa section
- [ ] Fill Anamnesa form (don't save)
- [ ] Navigate to Physical Exam section
- [ ] Navigate back to Anamnesa
- [ ] Verify Anamnesa form data still present (if state manager caches)
- [ ] If not cached, verify form reloads from server data

**Test Case 14.2: Save All Sections**
- [ ] Load patient record
- [ ] Fill data in multiple sections:
  - [ ] Anamnesa
  - [ ] Physical Exam
  - [ ] USG
  - [ ] Diagnosis
- [ ] Click "Save All" (if implemented) or save each section
- [ ] Verify all sections saved successfully
- [ ] Reload page
- [ ] Verify all saved data persists

**Test Case 14.3: State Observer Notifications**
- [ ] Subscribe observer to state changes
- [ ] Load patient record
- [ ] Verify observer notified with new state
- [ ] Update section data
- [ ] Verify observer notified again

### 15. API Integration

**Test Case 15.1: Load Patient Record**
```javascript
GET /api/staff/sunday-clinic/records/MROBS0001
```
- [ ] API call successful (200 OK)
- [ ] Response includes all sections:
  - [ ] record (mr_id, mr_category, timestamps)
  - [ ] patient (full_name, dob, contact)
  - [ ] appointment (date, time, type)
  - [ ] intake (payload with patient intake data)
  - [ ] anamnesa (category-specific data)
  - [ ] physical_exam
  - [ ] usg
  - [ ] penunjang
  - [ ] diagnosis
  - [ ] plan
  - [ ] billing
- [ ] Components render with API data

**Test Case 15.2: Save Section Data**
```javascript
POST /api/staff/sunday-clinic/records/MROBS0001/anamnesa
Body: { chiefComplaints: {...}, pregnancyHistory: {...} }
```
- [ ] API call successful (200 OK)
- [ ] Response confirms data saved
- [ ] Data persists in database
- [ ] Reload page and verify data still present

**Test Case 15.3: Error Handling**
- [ ] Simulate 401 Unauthorized
- [ ] Verify redirect to login page
- [ ] Simulate 404 Not Found
- [ ] Verify error message displayed to user
- [ ] Simulate 500 Internal Server Error
- [ ] Verify graceful error handling, retry option shown

---

## 🎯 End-to-End Testing

### 16. Complete Workflows

**Test Case 16.1: New Obstetri Patient - Complete Flow**
1. [ ] Login as staff member
2. [ ] Open patient directory (Ctrl+K)
3. [ ] Search for patient by name
4. [ ] Select patient from list
5. [ ] Verify patient intake data loaded from DB
6. [ ] Click "Create New Record" button
7. [ ] Select category: "Obstetri"
8. [ ] Verify new MR ID generated: MROBS#### format
9. [ ] Verify redirect to new medical record
10. [ ] Fill Identitas/Intake section (pre-filled from intake)
11. [ ] Navigate to Anamnesa section
12. [ ] Fill pregnancy-specific anamnesa:
    - [ ] HPHT date
    - [ ] Verify EDD calculated
    - [ ] GTPAL values
    - [ ] Pregnancy complaints
    - [ ] Add obstetric history items
13. [ ] Click Save
14. [ ] Verify success notification
15. [ ] Navigate to Physical Exam
16. [ ] Fill vital signs and anthropometry
17. [ ] Verify BMI calculated
18. [ ] Fill examination findings
19. [ ] Click Save
20. [ ] Navigate to USG
21. [ ] Fill fetal biometry
22. [ ] Verify GA calculated for each parameter
23. [ ] Verify EFW calculated
24. [ ] Fill amniotic fluid, placenta, Doppler data
25. [ ] Click Save
26. [ ] Navigate to Penunjang
27. [ ] Select lab tests needed
28. [ ] Enter findings (if available)
29. [ ] Click Save
30. [ ] Navigate to Diagnosis
31. [ ] Add multiple diagnoses with ICD-10 codes
32. [ ] Click Save
33. [ ] Navigate to Plan
34. [ ] Enter management recommendations
35. [ ] Add medications
36. [ ] Select lab tests to order
37. [ ] Enter next visit date
38. [ ] Click Save
39. [ ] Navigate to Billing
40. [ ] Add billing items
41. [ ] Verify totals calculated
42. [ ] Select payment method
43. [ ] Click "Confirm Billing" (doctor action)
44. [ ] Verify billing status changes to "Confirmed"
45. [ ] Click "Print Invoice" (cashier action)
46. [ ] Verify invoice PDF generated or print dialog opens
47. [ ] Close record
48. [ ] Return to directory
49. [ ] Search for same patient
50. [ ] Verify new MROBS#### record appears in visit history
51. [ ] Open record again
52. [ ] Verify all saved data loads correctly

**Test Case 16.2: New Gyn Repro Patient - Complete Flow**
1. [ ] Follow similar steps as 16.1
2. [ ] Verify MR ID format: MRGPR####
3. [ ] Fill fertility-specific anamnesa:
    - [ ] Trying to conceive duration
    - [ ] Detailed menstrual history
    - [ ] Contraceptive history
    - [ ] Previous infertility treatments
4. [ ] Fill Gyn Repro USG:
    - [ ] Follicle tracking (add multiple follicles)
    - [ ] Endometrial assessment
    - [ ] Ovarian dimensions and volume (verify auto-calc)
    - [ ] AFC (verify auto-sum)
5. [ ] Complete all other sections
6. [ ] Verify end-to-end flow completes successfully

**Test Case 16.3: New Gyn Special Patient - Complete Flow**
1. [ ] Follow similar steps as 16.1
2. [ ] Verify MR ID format: MRGPS####
3. [ ] Fill pathology-specific anamnesa:
    - [ ] Chief complaints (discharge, bleeding, pain, mass)
    - [ ] Vaginal discharge assessment (frequency, color, characteristics)
    - [ ] Pelvic pain assessment (location, characteristics, intensity, timing)
    - [ ] Abnormal bleeding patterns
    - [ ] PAP smear history
4. [ ] Fill Gyn Special USG:
    - [ ] Pathology detection checkboxes
    - [ ] Fibroid/myoma details (add multiple)
    - [ ] Ovarian cyst details
    - [ ] Endometrial pathology
5. [ ] Complete all other sections
6. [ ] Verify end-to-end flow completes successfully

**Test Case 16.4: Edit Existing Record**
1. [ ] Open existing MR record (any category)
2. [ ] Navigate to any section
3. [ ] Modify existing data
4. [ ] Click Save
5. [ ] Verify success notification
6. [ ] Reload page
7. [ ] Verify modified data persists
8. [ ] Verify unmodified sections unchanged

### 17. Navigation & UX Testing

**Test Case 17.1: Sidebar Navigation**
- [ ] Click each section link in sidebar
- [ ] Verify content area scrolls to correct section
- [ ] Verify active state indicator moves
- [ ] Verify smooth scroll animation works

**Test Case 17.2: Keyboard Shortcuts**
- [ ] Press Ctrl+K (or Cmd+K on Mac)
- [ ] Verify directory modal opens
- [ ] Press Escape
- [ ] Verify directory modal closes
- [ ] Add more shortcuts if implemented

**Test Case 17.3: Loading States**
- [ ] Open patient record
- [ ] Verify loading spinner shown while fetching
- [ ] Verify loading spinner disappears when loaded
- [ ] Simulate slow network
- [ ] Verify loading state persists appropriately

**Test Case 17.4: Error States**
- [ ] Simulate API error
- [ ] Verify user-friendly error message shown
- [ ] Verify retry button appears
- [ ] Click retry
- [ ] Verify API call retried

---

## 🔀 Category-Specific Testing

### 18. Obstetri-Specific Validations

**Test Case 18.1: Pregnancy Date Calculations**
- [ ] Test HPHT → EDD calculation with multiple dates
  - [ ] HPHT: 2025-01-01 → EDD: 2025-10-08
  - [ ] HPHT: 2025-06-15 → EDD: 2026-03-22
  - [ ] HPHT: 2024-12-25 → EDD: 2025-10-01
- [ ] Verify Naegele's Rule: HPHT + 280 days

**Test Case 18.2: Gestational Age Calculations**
- [ ] Input biometry: BPD = 85mm
- [ ] Verify GA from BPD calculated
- [ ] Input HC = 310mm, verify GA from HC
- [ ] Input AC = 290mm, verify GA from AC
- [ ] Input FL = 65mm, verify GA from FL
- [ ] Verify average GA calculated correctly
- [ ] Verify GA displayed in weeks + days format (e.g., "34w 2d")

**Test Case 18.3: Estimated Fetal Weight (EFW)**
- [ ] Test with multiple biometry sets
- [ ] Verify Hadlock formula implementation:
  ```
  log10(EFW) = 1.326 - 0.00326(AC×FL) + 0.0107(HC) + 0.0438(AC) + 0.158(FL)
  ```
- [ ] Compare with online EFW calculators
- [ ] Verify accuracy within ±5%

**Test Case 18.4: CPR (Cerebroplacental Ratio)**
- [ ] Input MCA PSV: 40 cm/s
- [ ] Input Umbilical Artery PSV: 50 cm/s
- [ ] Verify CPR = 40/50 = 0.8
- [ ] Verify CPR < 1.0 flagged as abnormal (placental insufficiency)
- [ ] Test with CPR > 1.0, verify normal status

### 19. Gyn Repro-Specific Validations

**Test Case 19.1: Ovarian Volume Calculations**
- [ ] Input right ovary: L=30mm, W=20mm, H=15mm
- [ ] Verify volume = 0.523 × 30 × 20 × 15 = 4,707 mm³ = 4.7 cm³
- [ ] Test with left ovary dimensions
- [ ] Verify formula matches medical standard

**Test Case 19.2: AFC (Antral Follicle Count)**
- [ ] Input right ovary AFC: 8
- [ ] Input left ovary AFC: 7
- [ ] Verify total AFC = 15
- [ ] Verify auto-sum updates when values change

**Test Case 19.3: Follicle Tracking**
- [ ] Add follicle: Right ovary, 18mm diameter
- [ ] Add follicle: Right ovary, 15mm diameter
- [ ] Add follicle: Left ovary, 20mm diameter (dominant)
- [ ] Verify list displays correctly
- [ ] Verify data collected as array

### 20. Gyn Special-Specific Validations

**Test Case 20.1: Pain Intensity Slider**
- [ ] Move slider to position 0
- [ ] Verify display shows "0 (No pain)"
- [ ] Move slider to position 5
- [ ] Verify display shows "5 (Moderate pain)"
- [ ] Move slider to position 10
- [ ] Verify display shows "10 (Severe pain)"

**Test Case 20.2: Multi-Select Validations**
- [ ] Discharge characteristics: Select multiple (thick, foul-smelling)
- [ ] Verify both selected
- [ ] Pain location: Select multiple (lower abdomen, pelvis, back)
- [ ] Verify all selected
- [ ] Verify data collected as arrays

**Test Case 20.3: Conditional Field Rendering**
- [ ] Select "Abnormal bleeding" complaint
- [ ] Select "Menorrhagia"
- [ ] Verify duration and amount fields appear
- [ ] Unselect "Menorrhagia"
- [ ] Verify fields disappear
- [ ] Test all bleeding pattern conditionals

---

## 📊 Data Migration Testing

### 21. Existing Records Migration

**Test Case 21.1: Pre-Migration Backup**
- [ ] Create full database backup
- [ ] Verify backup file created
- [ ] Verify backup file size reasonable (contains data)
- [ ] Store backup in safe location
- [ ] Document backup timestamp and location

**Test Case 21.2: Migration Script Execution**
- [ ] Run migration script on staging database
- [ ] Monitor console output for errors
- [ ] Verify script completes without crashes
- [ ] Check migration log for any warnings

**Test Case 21.3: Data Integrity Verification**
- [ ] Count records before migration
- [ ] Count records after migration
- [ ] Verify counts match (no data loss)
- [ ] Sample 10 random records
- [ ] For each record, verify:
  - [ ] MR ID still valid and unchanged
  - [ ] Patient data intact
  - [ ] All sections present
  - [ ] No data corruption
  - [ ] JSON structure valid

**Test Case 21.4: Category Assignment**
- [ ] Verify all existing records assigned a category
- [ ] Check category distribution:
  - [ ] How many marked as 'obstetri'
  - [ ] How many marked as 'gyn_repro'
  - [ ] How many marked as 'gyn_special'
- [ ] Verify no records with NULL category
- [ ] Sample records from each category
- [ ] Verify category assignment logic correct

**Test Case 21.5: MR ID Sequence Sync**
- [ ] Query current max MROBS sequence number
- [ ] Query current max MRGPR sequence number
- [ ] Query current max MRGPS sequence number
- [ ] Create new Obstetri record
- [ ] Verify new MR ID = max + 1
- [ ] Repeat for other categories

**Test Case 21.6: Backward Compatibility**
- [ ] Open migrated record in old system (if available)
- [ ] Verify data still readable
- [ ] Verify no errors in old system
- [ ] (If old system deprecated, skip this test)

### 22. New vs. Migrated Records

**Test Case 22.1: Migrated Record Editing**
- [ ] Open migrated Obstetri record
- [ ] Edit Anamnesa section
- [ ] Save changes
- [ ] Verify save successful
- [ ] Reload record
- [ ] Verify changes persisted

**Test Case 22.2: Mixed Record Types**
- [ ] Create 1 new Obstetri record
- [ ] Open 1 migrated Obstetri record
- [ ] Open both side-by-side (if possible)
- [ ] Verify both display correctly
- [ ] Verify no visual differences in UI
- [ ] Verify both behave identically

---

## ⚡ Performance Testing

### 23. Load Time Measurements

**Test Case 23.1: Initial Page Load**
- [ ] Clear browser cache
- [ ] Open sunday-clinic.html
- [ ] Measure time to DOMContentLoaded
- [ ] Target: < 2 seconds
- [ ] Measure time to fully interactive
- [ ] Target: < 3 seconds

**Test Case 23.2: Component Loading Time**
- [ ] Open patient record
- [ ] Measure time to load all 7 components (Obstetri)
- [ ] Target: < 1 second
- [ ] Measure time to first render
- [ ] Target: < 500ms

**Test Case 23.3: Large Dataset Performance**
- [ ] Create record with:
  - [ ] 10 previous pregnancies (obstetric history)
  - [ ] 20 billing items
  - [ ] 5 diagnoses
  - [ ] 10 medications
- [ ] Measure save time
- [ ] Target: < 2 seconds
- [ ] Measure load time
- [ ] Target: < 2 seconds

**Test Case 23.4: Auto-Calculation Performance**
- [ ] Rapid input of biometry values
- [ ] Verify calculations update without lag
- [ ] Target: < 100ms per calculation
- [ ] Test with 50 rapid input changes
- [ ] Verify no browser freeze

**Test Case 23.5: Memory Usage**
- [ ] Open browser DevTools → Performance Monitor
- [ ] Record baseline memory usage
- [ ] Open patient record
- [ ] Navigate through all sections
- [ ] Monitor memory usage
- [ ] Close record
- [ ] Verify memory released (no significant leak)
- [ ] Repeat 10 times
- [ ] Verify memory stable (no accumulation)

### 24. Network Performance

**Test Case 24.1: API Call Frequency**
- [ ] Open record
- [ ] Navigate through all sections
- [ ] Count total API calls
- [ ] Verify no unnecessary duplicate calls
- [ ] Verify data cached appropriately

**Test Case 24.2: Payload Size**
- [ ] Inspect API response for patient record
- [ ] Verify payload size reasonable (< 500KB typical)
- [ ] Check for unnecessary data
- [ ] Verify images/files handled separately (not in JSON)

**Test Case 24.3: Slow Network Simulation**
- [ ] Enable Chrome DevTools → Network → Slow 3G
- [ ] Open patient record
- [ ] Verify loading state shown
- [ ] Verify eventual successful load
- [ ] Verify timeout handling (if network very slow)

---

## 🌐 Browser Compatibility Testing

### 25. Cross-Browser Testing

**Test Case 25.1: Chrome/Chromium**
- [ ] Test on latest Chrome version
- [ ] Verify all functionality works
- [ ] Verify UI renders correctly
- [ ] Check console for errors

**Test Case 25.2: Firefox**
- [ ] Test on latest Firefox version
- [ ] Verify all functionality works
- [ ] Verify UI renders correctly (especially CSS Grid/Flexbox)
- [ ] Check console for errors

**Test Case 25.3: Safari**
- [ ] Test on latest Safari version (macOS)
- [ ] Verify all functionality works
- [ ] Verify date inputs work (Safari handles differently)
- [ ] Verify ES6 modules load correctly
- [ ] Check console for errors

**Test Case 25.4: Edge**
- [ ] Test on latest Edge version
- [ ] Verify all functionality works
- [ ] Verify UI renders correctly
- [ ] Check console for errors

**Test Case 25.5: Mobile Browsers**
- [ ] Test on mobile Chrome (Android)
- [ ] Test on mobile Safari (iOS)
- [ ] Verify touch interactions work
- [ ] Verify responsive layout adapts
- [ ] Verify virtual keyboard doesn't break layout

### 26. Responsive Design Testing

**Test Case 26.1: Desktop (1920×1080)**
- [ ] Verify layout uses full width appropriately
- [ ] Verify sidebar visible
- [ ] Verify content area not too wide (comfortable reading)

**Test Case 26.2: Laptop (1366×768)**
- [ ] Verify layout adapts
- [ ] Verify no horizontal scrolling
- [ ] Verify all content accessible

**Test Case 26.3: Tablet (768×1024)**
- [ ] Verify layout adapts
- [ ] Verify sidebar behavior (collapse/drawer?)
- [ ] Verify touch targets adequate size (44×44 px minimum)

**Test Case 26.4: Mobile (375×667 - iPhone SE)**
- [ ] Verify layout stacks vertically
- [ ] Verify sidebar becomes drawer/hamburger menu
- [ ] Verify all features accessible
- [ ] Verify forms usable on small screen

---

## 🔒 Security Testing

### 27. Authentication & Authorization

**Test Case 27.1: Token Expiration**
- [ ] Login and obtain token
- [ ] Wait for token to expire (or manually expire in DB)
- [ ] Attempt to load patient record
- [ ] Verify redirected to login page
- [ ] Verify 401 error handled gracefully

**Test Case 27.2: Invalid Token**
- [ ] Manually set invalid token in localStorage
- [ ] Attempt to load patient record
- [ ] Verify redirected to login page
- [ ] Verify error message shown

**Test Case 27.3: Missing Token**
- [ ] Clear localStorage
- [ ] Attempt to access sunday-clinic.html directly
- [ ] Verify redirected to login page
- [ ] Verify no sensitive data exposed

**Test Case 27.4: CORS & CSP**
- [ ] Verify API calls only to same origin or whitelisted domains
- [ ] Verify no CORS errors in console
- [ ] Verify Content Security Policy headers present (if configured)

### 28. Data Security

**Test Case 28.1: SQL Injection (Backend)**
- [ ] Attempt to inject SQL in search field: `' OR '1'='1`
- [ ] Verify query properly parameterized
- [ ] Verify no SQL injection possible
- [ ] (This tests backend, but verify frontend doesn't help)

**Test Case 28.2: XSS (Cross-Site Scripting)**
- [ ] Enter malicious script in text field: `<script>alert('XSS')</script>`
- [ ] Save data
- [ ] Reload page
- [ ] Verify script not executed
- [ ] Verify data properly escaped/sanitized

**Test Case 28.3: Sensitive Data in Console**
- [ ] Open browser console
- [ ] Navigate through app
- [ ] Verify no sensitive patient data logged
- [ ] Verify no tokens logged in plaintext

**Test Case 28.4: Sensitive Data in URLs**
- [ ] Navigate through app
- [ ] Verify no patient data in URL query params
- [ ] Verify tokens not in URLs
- [ ] Verify MR IDs acceptable in URLs (not considered highly sensitive)

---

## 👥 User Acceptance Testing (UAT)

### 29. Medical Staff Testing

**Test Case 29.1: Doctor Workflow**
- [ ] Doctor logs in
- [ ] Doctor selects patient from directory
- [ ] Doctor creates new MR record (correct category)
- [ ] Doctor fills Anamnesa, Physical Exam, USG
- [ ] Doctor enters Diagnosis
- [ ] Doctor creates Plan (medications, lab tests)
- [ ] Doctor confirms billing
- [ ] Doctor completes record
- [ ] **Feedback:** Doctor finds workflow intuitive? Any pain points?

**Test Case 29.2: Nurse Workflow**
- [ ] Nurse logs in
- [ ] Nurse assists with data entry (if applicable)
- [ ] Nurse reviews completed records
- [ ] **Feedback:** Nurse finds interface clear? Any missing features?

**Test Case 29.3: Cashier Workflow**
- [ ] Cashier logs in
- [ ] Cashier views billing section
- [ ] Cashier prints invoice
- [ ] Cashier processes payment
- [ ] **Feedback:** Billing interface easy to use? Calculation correct?

**Test Case 29.4: Real-World Scenarios**
- [ ] Conduct UAT with actual medical staff
- [ ] Use real (or realistic) patient scenarios
- [ ] Observe staff using system
- [ ] Collect feedback on:
  - [ ] Ease of use
  - [ ] Speed of data entry
  - [ ] Clarity of interface
  - [ ] Missing features
  - [ ] Any confusion or errors
- [ ] Document all feedback
- [ ] Prioritize issues for fixing

### 30. Usability Testing

**Test Case 30.1: First-Time User**
- [ ] User with no prior training attempts to use system
- [ ] Observe: Can they figure out how to:
  - [ ] Search for patient
  - [ ] Create new record
  - [ ] Fill sections
  - [ ] Save data
  - [ ] Print invoice
- [ ] Document time taken for each task
- [ ] Document any confusion or errors
- [ ] Identify areas needing better UI/instructions

**Test Case 30.2: Error Recovery**
- [ ] Simulate common errors:
  - [ ] Network disconnection during save
  - [ ] Accidental navigation away from unsaved form
  - [ ] Entering invalid data
- [ ] Verify user can recover from errors
- [ ] Verify error messages are helpful
- [ ] Verify no data loss

---

## 📝 Test Results Documentation

### 31. Test Execution Tracking

**Test Execution Template:**

```markdown
### Test Case: [ID and Name]
- **Tester:** [Name]
- **Date:** [YYYY-MM-DD]
- **Environment:** [Staging/Production]
- **Browser:** [Chrome 120 / Firefox 121 / etc.]
- **Result:** [PASS / FAIL / BLOCKED]
- **Notes:** [Any observations]
- **Screenshots:** [Attach if needed]
- **Issues Found:** [List any bugs discovered]
```

**Example:**

```markdown
### Test Case: 10.1 - Fetal Biometry Auto-Calculations
- **Tester:** Dr. Jane Smith
- **Date:** 2025-11-21
- **Environment:** Staging
- **Browser:** Chrome 120.0.6099.129
- **Result:** FAIL
- **Notes:** EFW calculation incorrect for BPD < 50mm
- **Issues Found:**
  - Bug #1: EFW returns NaN when BPD < 50mm
  - Expected: Graceful handling of edge cases
  - Actual: NaN displayed to user
  - Priority: High
  - Assigned to: Development team
```

### 32. Bug Tracking

**Bug Report Template:**

```markdown
### Bug #[Number]: [Title]
- **Severity:** [Critical / High / Medium / Low]
- **Priority:** [P1 / P2 / P3 / P4]
- **Component:** [Which component/module]
- **Found in:** [Test case ID]
- **Description:** [Clear description of the bug]
- **Steps to Reproduce:**
  1. [Step 1]
  2. [Step 2]
  3. [Step 3]
- **Expected Behavior:** [What should happen]
- **Actual Behavior:** [What actually happens]
- **Environment:** [Browser, OS, etc.]
- **Screenshots:** [Attach if applicable]
- **Workaround:** [If any temporary workaround exists]
- **Status:** [New / In Progress / Fixed / Verified / Closed]
```

### 33. Test Summary Report

**Report Template:**

```markdown
# Sunday Clinic 3-Template System - Test Summary Report

## Report Date: [YYYY-MM-DD]
## Testing Period: [Start Date] to [End Date]
## Version Tested: [Version number]

### Executive Summary
[Brief overview of testing outcomes]

### Test Coverage
- **Total Test Cases:** [Number]
- **Test Cases Executed:** [Number]
- **Test Cases Passed:** [Number]
- **Test Cases Failed:** [Number]
- **Test Cases Blocked:** [Number]
- **Pass Rate:** [Percentage]

### Test Results by Category
| Category | Total | Passed | Failed | Blocked | Pass % |
|----------|-------|--------|--------|---------|--------|
| Unit Tests | [#] | [#] | [#] | [#] | [#%] |
| Integration Tests | [#] | [#] | [#] | [#] | [#%] |
| E2E Tests | [#] | [#] | [#] | [#] | [#%] |
| Performance Tests | [#] | [#] | [#] | [#] | [#%] |
| Security Tests | [#] | [#] | [#] | [#] | [#%] |
| UAT | [#] | [#] | [#] | [#] | [#%] |

### Defects Summary
- **Critical Defects:** [Number] - [Status]
- **High Priority:** [Number] - [Status]
- **Medium Priority:** [Number] - [Status]
- **Low Priority:** [Number] - [Status]

### Top Issues Found
1. [Issue 1 description]
2. [Issue 2 description]
3. [Issue 3 description]

### Recommendations
- [ ] [Recommendation 1]
- [ ] [Recommendation 2]
- [ ] [Recommendation 3]

### Go/No-Go Recommendation
**Recommendation:** [GO / NO-GO]
**Rationale:** [Explanation]

### Sign-off
- **QA Lead:** [Name] - [Date]
- **Project Manager:** [Name] - [Date]
- **Technical Lead:** [Name] - [Date]
```

---

## 🎯 Test Completion Criteria

### Minimum Criteria for "GO" Decision:

1. **Functionality:**
   - [ ] All P1 (Priority 1) test cases passed
   - [ ] 95%+ of all test cases passed
   - [ ] No critical bugs remain unfixed
   - [ ] All high-priority bugs documented and have workarounds

2. **Performance:**
   - [ ] Page load time < 3 seconds
   - [ ] Component load time < 1 second
   - [ ] API response time < 1 second (95th percentile)
   - [ ] No memory leaks detected

3. **Security:**
   - [ ] Authentication working correctly
   - [ ] No XSS vulnerabilities
   - [ ] No SQL injection vulnerabilities (backend)
   - [ ] Sensitive data properly protected

4. **Usability:**
   - [ ] Medical staff successfully completed UAT
   - [ ] No major usability issues reported
   - [ ] Staff comfortable using new system

5. **Data Integrity:**
   - [ ] Data migration successful (if applicable)
   - [ ] No data loss detected
   - [ ] All migrated records accessible

6. **Documentation:**
   - [ ] Deployment guide complete
   - [ ] User guide complete (if needed)
   - [ ] Known issues documented
   - [ ] Rollback plan tested

---

## 📞 Support & Contact

### Testing Support Team:
- **QA Lead:** [Name] - [Email]
- **Technical Lead:** [Name] - [Email]
- **Project Manager:** [Name] - [Email]

### Reporting Issues:
- **Bug Tracker:** [URL or system name]
- **Email:** [support email]
- **Slack/Chat:** [channel name]

---

## 📅 Testing Schedule

**Recommended Timeline:**

| Phase | Duration | Dates |
|-------|----------|-------|
| Unit Testing | 2 days | [Start] - [End] |
| Integration Testing | 2 days | [Start] - [End] |
| E2E Testing | 2 days | [Start] - [End] |
| Performance Testing | 1 day | [Start] - [End] |
| Security Testing | 1 day | [Start] - [End] |
| UAT | 3 days | [Start] - [End] |
| Bug Fixes & Retesting | 3 days | [Start] - [End] |
| Final Sign-off | 1 day | [Date] |
| **TOTAL** | **15 days** | |

---

## ✅ Conclusion

This comprehensive testing plan covers all aspects of the Sunday Clinic 3-Template System. Following this plan will ensure a smooth, bug-free deployment that meets medical staff needs and maintains data integrity.

**Remember:**
- Test early, test often
- Document everything
- Communicate issues promptly
- Prioritize patient data safety above all

**Good luck with testing!** 🚀

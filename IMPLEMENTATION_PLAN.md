# IMPLEMENTATION PLAN - Exact Copy from Backup

## PHASE 1: CORE INFRASTRUCTURE (DO THIS FIRST)

### 1. Add computeDerived() to state-manager.js
- Port entire computeDerived() function (lines 1143-1249 from backup)
- Add all normalization helpers: formatValueForKey, titleCaseWords, calculateGestationalAge, mapRiskCodesToLabels
- Call computeDerived() after loadRecord() to create state.derived
- Store derived in state so all components can access it

### 2. Add currentStaffIdentity to sunday-clinic.js
- Create global: `window.currentStaffIdentity = { id: null, name: null }`
- Port resolveStaffIdentity() function
- Fetch and set on DOMContentLoaded

### 3. Export helpers.js functions globally
- Change helpers.js functions to be available via window or import
- Components need: getMedicalRecordContext, getGMT7Timestamp, renderRecordMeta, capitalizePatientData

## PHASE 2: FIX EACH SECTION (IN ORDER)

### 1. Identity Section
- NO CHANGES - already read-only display

### 2. Anamnesa Section
- Use getMedicalRecordContext('anamnesa') instead of direct state access
- Use capitalizePatientData() on saved data
- Use renderRecordMeta() for timestamp/doctor display
- Fix save to use getGMT7Timestamp() and currentStaffIdentity

### 3. Physical Exam Section
- Use getMedicalRecordContext('physical_exam')
- Use capitalizePatientData()
- Use renderRecordMeta()
- Fix save function
- After save: call fetchRecord() to reload

### 4. USG Section
- Use getMedicalRecordContext('usg')
- Create/Update logic based on existingRecordId
- NO doctorName/doctorId (different from other sections!)
- After save: fetchRecord(), hide form, re-enable button

### 5. Diagnosis Section
- Same pattern as physical exam

### 6. Planning Section
- ALREADY DONE (buttons working)
- Just ensure fetchRecord() after save

### 7. Billing Section
- Port loadBilling() function
- Port generateBillingItemsFromPlanning() function
- Implement draft terapi merge logic
- Implement auto-generation if no billing exists
- Add role-based button display
- Add confirmation flow
- Add polling for real-time updates

## PHASE 3: RELOAD MECHANISM

### fetchRecord() equivalent
- After ANY save: must reload entire record
- Call SundayClinicApp.init(mrId, currentSection) to refresh
- OR create dedicated fetchRecord() function that:
  1. Fetches from API
  2. Updates stateManager
  3. Recomputes derived
  4. Re-renders current section

## CRITICAL RULES

1. **NEVER make up functionality** - copy EXACTLY from backup
2. **ALWAYS reload after save** - call fetchRecord(routeMrSlug) or equivalent
3. **ALWAYS use helpers** - getMedicalRecordContext, getGMT7Timestamp, etc.
4. **ALWAYS add doctor info** - except USG section
5. **ALWAYS use state.derived** - not state.recordData directly

## WHAT ORDER TO IMPLEMENT

1. ✅ helpers.js (DONE)
2. ⏳ Add computeDerived to state-manager
3. ⏳ Add currentStaffIdentity
4. ⏳ Fix Physical Exam save + reload
5. ⏳ Fix USG save + reload
6. ⏳ Fix Billing completely
7. ⏳ Fix all other sections

---

**WAITING FOR USER APPROVAL BEFORE IMPLEMENTING**

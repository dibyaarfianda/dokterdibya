# Unified DRD Medical Record System

**Date:** 2025-11-21
**Version:** 2.0.0 (Unified)
**Status:** ✅ IMPLEMENTED

---

## Major Change: Category-Based → Unified MR IDs

### Old System (Category-Based)
```
Patient 1 - Obstetri:    MROBS0001
Patient 2 - Gyn Repro:   MRGPR0001
Patient 3 - Gyn Special: MRGPS0001
Patient 1 - Gyn Repro:   MRGPR0002  ← New MR ID!
```

**Problems:**
- ❌ Confusing for patients (why do I have MROBS0001 and MRGPR0002?)
- ❌ Complex prefix management
- ❌ Staff must remember 3 different sequences

---

### New System (Unified DRD)
```
Patient 1 - Obstetri:    DRD0001  (category: obstetri)
Patient 2 - Gyn Repro:   DRD0002  (category: gyn_repro)
Patient 3 - Gyn Special: DRD0003  (category: gyn_special)
Patient 1 - Gyn Repro:   DRD0004  (category: gyn_repro)
```

**Benefits:**
- ✅ **Simple**: One unified numbering system
- ✅ **Clear**: DRD = Dr. Dibya Medical Record
- ✅ **Scalable**: Easy to add new categories
- ✅ **Patient-friendly**: One MR ID format across all visits
- ✅ **Smart Triage Still Works**: Category tracked in database, routes to correct form

---

## How It Works

### 1. MR ID Generation

**Single Counter:**
```sql
SELECT * FROM sunday_clinic_mr_counters WHERE category = 'unified';
-- Result: current_sequence = 42

-- Next MR ID = DRD0043
```

**Category Tracking:**
```sql
SELECT * FROM patient_mr_history WHERE patient_id = 'P00001';
-- Results:
-- | mr_id   | mr_category | visit_count |
-- |---------|-------------|-------------|
-- | DRD0001 | obstetri    | 3           |
-- | DRD0045 | gyn_repro   | 1           |
```

### 2. Smart Triage Flow

```
1. Patient books appointment: "USG kehamilan"
   ↓
2. Smart triage detects: HIGH confidence → obstetri
   ↓
3. Check patient history:
   - Has DRD0001 (obstetri) ✅ → Reuse DRD0001
   ↓
4. Doctor opens DRD0001
   - System sees mr_category = obstetri
   - Loads Anamnesa Obstetri form automatically
```

### 3. Multiple Categories

```
Visit 1 (2024-01): "Kontrol hamil" → DRD0001 (obstetri)
Visit 2 (2024-06): "KB IUD"        → DRD0156 (gyn_repro)
Visit 3 (2024-11): "Keputihan"     → DRD0298 (gyn_special)

Patient now has 3 MR IDs:
- DRD0001 → obstetri records
- DRD0156 → reproductive records
- DRD0298 → gynecology records
```

---

## Database Structure

### MR Counter (Unified)
```sql
sunday_clinic_mr_counters
  category = 'unified'
  current_sequence = 156
```

### Patient MR History
```sql
patient_mr_history
  patient_id    = 'P00001'
  mr_id         = 'DRD0001'
  mr_category   = 'obstetri'
  visit_count   = 5
  last_visit    = '2024-11-21'
```

### Sunday Clinic Records
```sql
sunday_clinic_records
  mr_id       = 'DRD0001'
  mr_category = 'obstetri'
  patient_id  = 'P00001'
  folder_path = 'sunday-clinic/drd0001'
```

---

## Code Changes

### Service Function
```javascript
// Old: generateCategoryBasedMrId(category)
// New: Still same function name, but uses unified counter

const { mrId, category, sequence } = await generateCategoryBasedMrId('obstetri');
// Returns: { mrId: 'DRD0157', category: 'obstetri', sequence: 157 }
```

### Constants
```javascript
// Old
const MR_PREFIX = {
    'obstetri': 'MROBS',
    'gyn_repro': 'MRGPR',
    'gyn_special': 'MRGPS'
};

// New
const MR_PREFIX = 'DRD';  // Single unified prefix
```

---

## Migration Path

### Existing Records
Old MR IDs (MROBS####, MRGPR####, MRGPS####) remain unchanged.
New records use DRD#### format going forward.

### Transition
```sql
-- Old records
MROBS0001, MROBS0002, MRGPR0001...

-- New records (after today)
DRD0001, DRD0002, DRD0003...

-- Both formats coexist peacefully
```

---

## Display Examples

### Patient Dashboard
```
Patient: Jane Doe (P00123)
Medical Records:
├── DRD0001 (Obstetri)      - 5 visits
├── DRD0156 (Reproduksi)    - 2 visits
└── DRD0298 (Ginekologi)    - 1 visit
```

### Sunday Clinic Header
```
┌──────────────────────────────────────┐
│ Medical Record: DRD0001              │
│ Category: Obstetri (Kehamilan)       │
│ Patient: Jane Doe (P00123)           │
│ Visit #5                             │
└──────────────────────────────────────┘
```

### Staff View
```
Recent Records:
- DRD0298 | Jane Doe  | Gyn Special | Today
- DRD0297 | Mary Sue  | Obstetri    | Today
- DRD0296 | Anna Lee  | Gyn Repro   | Yesterday
```

---

## Benefits Summary

| Aspect | Old (MROBS/MRGPR/MRGPS) | New (DRD) |
|--------|------------------------|-----------|
| **Patient Confusion** | High (why 2 IDs?) | Low (one format) |
| **Staff Training** | Complex (3 prefixes) | Simple (1 prefix) |
| **Scalability** | Hard (add new prefix) | Easy (same prefix) |
| **Professionalism** | Clinical codes | Branded (Dr. Dibya) |
| **Smart Triage** | Works | Works (better!) |
| **History Tracking** | Separate sequences | Unified timeline |

---

## Technical Notes

### Sequence Management
- **Thread-safe**: Uses `UPDATE ... WHERE category = 'unified'` with database lock
- **No gaps**: Sequential numbering guaranteed
- **Rollover**: Can handle millions of records (0001-9999, then 10000+)

### Category Still Matters
Even with unified MR IDs, category is crucial for:
1. **Smart triage routing**
2. **Form template selection** (Anamnesa Obstetri vs Gyn Special)
3. **Report generation** (filter by category)
4. **Analytics** (visit patterns by category)

### Backward Compatibility
- Old MROBS/MRGPR/MRGPS records still accessible
- Can query both old and new formats
- Reports include both formats

---

## Future Enhancements

### Possible Extensions
1. **Year-based**: DRD2025-0001, DRD2026-0001
2. **Facility-based**: DRD-KL-0001 (Klinik), DRD-RS-0001 (Rumah Sakit)
3. **QR codes**: Each MR ID gets a QR code for easy scanning

### Analytics Potential
```sql
-- Total records by category
SELECT mr_category, COUNT(*)
FROM patient_mr_history
GROUP BY mr_category;

-- Patient journey analysis
SELECT patient_id,
       GROUP_CONCAT(mr_category ORDER BY first_visit_date) as journey
FROM patient_mr_history
GROUP BY patient_id;
```

---

## Rollback

If needed to revert to category-based system:
```bash
cd /var/www/dokterdibya/staff/backups/smart-triage-20251121-152747
bash ROLLBACK.sh
```

Then restore old constants in `sundayClinicService.js`.

---

**Status:** ✅ Live and working with unified DRD#### system!

# Phase 1: MR Category System Implementation

## Date: 2025-11-20

## Overview

Phase 1 implements the foundation for the 3-template Sunday Clinic system by introducing **category-based MR ID naming** and the database infrastructure to support different medical record templates.

---

## 🎯 What Was Implemented

### 1. **Database Schema Changes**

#### New Table: `sunday_clinic_mr_counters`
```sql
CREATE TABLE sunday_clinic_mr_counters (
    category ENUM('obstetri', 'gyn_repro', 'gyn_special') NOT NULL,
    current_sequence INT UNSIGNED NOT NULL DEFAULT 0,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (category)
);
```

**Purpose:** Maintains separate sequence counters for each MR category to generate unique IDs.

#### Updated Table: `sunday_clinic_records`
Added two new columns:
- `mr_category` ENUM('obstetri', 'gyn_repro', 'gyn_special') - The medical record category
- `mr_sequence` INT UNSIGNED - The sequence number within that category

Added indexes for efficient querying:
- `idx_mr_category` - Fast filtering by category
- `idx_mr_sequence` - Fast sorting by sequence
- `idx_category_sequence` - Compound index for category + sequence queries

---

### 2. **MR ID Naming Convention**

#### Old Format (Legacy):
```
MR0001, MR0002, MR0003, ...
```

#### New Format (Category-Based):
```
MROBS0001  → Obstetri patient
MRGPR0002  → Gyn Repro patient
MRGPS0003  → Gyn Special patient
```

#### Prefix Mapping:
| Category | Prefix | Full Name | Use Case |
|----------|--------|-----------|----------|
| `obstetri` | `MROBS` | Obstetri | Pregnant patients, antenatal care |
| `gyn_repro` | `MRGPR` | Gynecology Reproductive | Fertility, KB, pre-marital, cycle planning |
| `gyn_special` | `MRGPS` | Gynecology Special | Gynecological issues, symptoms, surgeries |

---

### 3. **Backend Service Updates**

#### File: `staff/backend/services/sundayClinicService.js`

**New Functions:**

1. **`generateCategoryBasedMrId(category, connection)`**
   - Generates MR ID with category prefix
   - Thread-safe counter increment
   - Returns `{ mrId, category, sequence }`

2. **`determineMrCategory(intakeData)`**
   - Auto-detects category from patient intake data
   - Checks multiple data sources for category
   - Falls back to 'obstetri' if cannot determine

3. **`getCategoryStatistics()`**
   - Returns statistics per category (total, finalized, draft counts)
   - Returns current counter values

**Updated Functions:**

4. **`createSundayClinicRecord()`**
   - Now accepts `category` parameter
   - Auto-detects category from `intakeData` if not provided
   - Generates category-based MR ID
   - Stores `mr_category` and `mr_sequence` in database

**Constants Exported:**
```javascript
MR_PREFIX = {
    'obstetri': 'MROBS',
    'gyn_repro': 'MRGPR',
    'gyn_special': 'MRGPS'
}

VALID_CATEGORIES = ['obstetri', 'gyn_repro', 'gyn_special']
```

---

### 4. **API Endpoints**

#### New Endpoint: `GET /sunday-clinic/statistics/categories`
Returns category statistics and counters.

**Response:**
```json
{
    "success": true,
    "data": {
        "recordStats": [
            {
                "mr_category": "obstetri",
                "total_records": 15,
                "finalized_count": 12,
                "draft_count": 3,
                "highest_sequence": 15
            },
            {
                "mr_category": "gyn_repro",
                "total_records": 8,
                "finalized_count": 6,
                "draft_count": 2,
                "highest_sequence": 8
            }
        ],
        "counters": [
            { "category": "obstetri", "current_sequence": 15 },
            { "category": "gyn_repro", "current_sequence": 8 },
            { "category": "gyn_special", "current_sequence": 3 }
        ]
    }
}
```

---

### 5. **Data Migration Script**

#### File: `staff/backend/scripts/migrate-existing-sunday-clinic-records.js`

**Purpose:** Migrate existing records to the new category system.

**What It Does:**
1. **Backfills category data:**
   - Reads patient intake data for each record
   - Determines category using `determineMrCategory()`
   - Updates `mr_category` and `mr_sequence` columns
   - Defaults to 'obstetri' if no intake data found

2. **Synchronizes counters:**
   - Sets counter values to match highest sequence per category
   - Ensures next MR ID will be correct

3. **Optional MR ID regeneration:**
   - Can regenerate legacy IDs (MR0001) to new format (MROBS0001)
   - Commented out by default - uncomment if needed

**Usage:**
```bash
node staff/backend/scripts/migrate-existing-sunday-clinic-records.js
```

**Output:**
```
🚀 Starting Sunday Clinic MR Category Migration

Step 1: Backfilling category and sequence data...

Progress: 10/25 records updated
Progress: 20/25 records updated

========== MIGRATION SUMMARY ==========
Total records processed: 25
✅ Successfully updated: 25
⏭️  Skipped: 0
❌ Errors: 0
========================================

✅ Sequence counters synchronized successfully!

========== CATEGORY STATISTICS ==========

OBSTETRI:
  Total records: 18
  First ID: MR0001 (seq: 1)
  Last ID: MR0023 (seq: 23)

GYN_REPRO:
  Total records: 5
  First ID: MR0005 (seq: 5)
  Last ID: MR0025 (seq: 25)

GYN_SPECIAL:
  Total records: 2
  First ID: MR0010 (seq: 10)
  Last ID: MR0024 (seq: 24)

=========================================

✅ Migration completed successfully!
```

---

## 🚀 How to Deploy Phase 1

### Step 1: Run Database Migration
```bash
mysql -u root -p dibyaklinik < staff/backend/migrations/20251120_add_mr_category_system.sql
```

**Expected Output:**
```
Query OK, 0 rows affected
Query OK, 0 rows affected
...
+---------------+------------------+---------------------+
| category      | current_sequence | last_updated        |
+---------------+------------------+---------------------+
| obstetri      |                0 | 2025-11-20 10:00:00 |
| gyn_repro     |                0 | 2025-11-20 10:00:00 |
| gyn_special   |                0 | 2025-11-20 10:00:00 |
+---------------+------------------+---------------------+
```

### Step 2: Restart Backend Server
```bash
pm2 restart staff-backend
```

### Step 3: Migrate Existing Records (If Any)
```bash
node staff/backend/scripts/migrate-existing-sunday-clinic-records.js
```

### Step 4: Verify Installation
```bash
# Check database structure
mysql -u root -p dibyaklinik -e "DESCRIBE sunday_clinic_records;"
mysql -u root -p dibyaklinik -e "SELECT * FROM sunday_clinic_mr_counters;"

# Test API endpoint
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3000/sunday-clinic/statistics/categories
```

---

## 📊 How Category Auto-Detection Works

The system automatically determines the MR category from patient intake data:

```javascript
// Priority 1: Explicit category in intake data
intake.summary.intakeCategory           // 'obstetri', 'gyn_repro', or 'gyn_special'
intake.metadata.intakeCategory
intake.payload.metadata.intakeCategory
intake.payload.intake_category

// Priority 2: Pregnant status detection
if (pregnant_status === 'yes') → 'obstetri'
if (pregnant_status === 'no') → check further questions

// Priority 3: Routing questions
needs_reproductive === 'yes' → 'gyn_repro'
has_gyn_issue === 'yes' → 'gyn_special'

// Fallback: Default to obstetri
```

---

## 🔧 Developer Usage Examples

### Creating a New Sunday Clinic Record

**Option 1: Let the system auto-detect category**
```javascript
const { createSundayClinicRecord } = require('./services/sundayClinicService');

// Fetch intake data
const [intakeRows] = await db.query(
    'SELECT * FROM patient_intake_submissions WHERE patient_id = ?',
    [patientId]
);
const intakeData = intakeRows[0];

// Create record - category auto-detected
const { record, created } = await createSundayClinicRecord({
    appointmentId: 123,
    patientId: '00042',
    intakeData: intakeData,  // Category auto-detected from this
    createdBy: 1
});

console.log(record.mr_id);       // "MROBS0001"
console.log(record.mr_category); // "obstetri"
console.log(record.mr_sequence); // 1
```

**Option 2: Explicitly specify category**
```javascript
const { record } = await createSundayClinicRecord({
    appointmentId: 124,
    patientId: '00043',
    category: 'gyn_repro',  // Explicit category
    createdBy: 1
});

console.log(record.mr_id);       // "MRGPR0001"
console.log(record.mr_category); // "gyn_repro"
```

### Generating MR ID Only

```javascript
const { generateCategoryBasedMrId } = require('./services/sundayClinicService');

const { mrId, category, sequence } = await generateCategoryBasedMrId('obstetri');
console.log(mrId);      // "MROBS0016"
console.log(sequence);  // 16
```

### Getting Category Statistics

```javascript
const { getCategoryStatistics } = require('./services/sundayClinicService');

const stats = await getCategoryStatistics();
console.log(stats.recordStats);  // Array of stats per category
console.log(stats.counters);     // Current counter values
```

---

## 🗂️ Files Changed/Created

### Created Files:
1. `staff/backend/migrations/20251120_add_mr_category_system.sql`
2. `staff/backend/scripts/migrate-existing-sunday-clinic-records.js`
3. `PHASE1_MR_CATEGORY_SYSTEM.md` (this file)

### Modified Files:
1. `staff/backend/services/sundayClinicService.js` (major update)
2. `staff/backend/routes/sunday-clinic.js` (added statistics endpoint)

---

## ✅ Testing Checklist

- [ ] Database migration runs successfully
- [ ] Counters table created with 3 categories
- [ ] New columns added to sunday_clinic_records
- [ ] Backend restarts without errors
- [ ] Can create new record with category 'obstetri'
- [ ] Can create new record with category 'gyn_repro'
- [ ] Can create new record with category 'gyn_special'
- [ ] MR IDs generated correctly (MROBS0001, MRGPR0001, MRGPS0001)
- [ ] Sequences increment per category independently
- [ ] Category auto-detection works from intake data
- [ ] Statistics API endpoint returns correct data
- [ ] Migration script backfills existing records correctly
- [ ] Counters synchronized to highest sequence

---

## 🎯 Next Steps: Phase 2

Phase 2 will implement the **component architecture** to split the monolithic sunday-clinic.js into reusable components:

- `components/shared/identity-section.js`
- `components/shared/physical-exam.js`
- `components/shared/penunjang.js` (renamed from Laboratorium)
- `components/shared/diagnosis.js`
- `components/shared/plan.js`
- `components/shared/billing.js`
- `components/obstetri/anamnesa-obstetri.js`
- `components/obstetri/usg-obstetri.js`
- `components/gyn-repro/anamnesa-gyn-repro.js`
- `components/gyn-repro/usg-gyn-repro.js`
- `components/gyn-special/anamnesa-gyn-special.js`
- `components/gyn-special/usg-gyn-special.js`

---

## 📝 Notes

1. **Backward Compatibility:** The legacy `generateSundayClinicMrId()` function is kept but marked as deprecated.

2. **Thread Safety:** MR ID generation uses database row locking to prevent duplicate IDs in concurrent requests.

3. **Category Validation:** Only accepts 3 valid categories. Invalid categories throw an error.

4. **Logging:** All category determinations and MR ID generations are logged for audit purposes.

5. **Default Behavior:** If category cannot be determined, system defaults to 'obstetri' to prevent errors.

---

## 🆘 Troubleshooting

### Issue: Counter not found error
**Solution:** Run the migration SQL file to create the counters table.

### Issue: Category detection returns null
**Solution:** Ensure patient has intake data in `patient_intake_submissions` table with `intake_category` field populated.

### Issue: Duplicate MR IDs generated
**Solution:** Check that counters are synchronized. Run the migration script's counter sync step.

### Issue: Old format IDs still being created
**Solution:** Ensure you're using the new `createSundayClinicRecord()` with category parameter or intakeData.

---

## 📞 Support

For issues or questions about Phase 1 implementation, check:
1. Application logs: `pm2 logs staff-backend`
2. Database counter values: `SELECT * FROM sunday_clinic_mr_counters;`
3. Category statistics endpoint: `/sunday-clinic/statistics/categories`

---

**Phase 1 Status:** ✅ **COMPLETED**
**Date Completed:** 2025-11-20
**Ready for Phase 2:** ✅ YES

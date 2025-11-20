# Sunday Clinic 3-Template System - Deployment Guide

## 📋 Document Information
- **Created:** 2025-11-20
- **Version:** 1.0
- **Status:** Ready for Deployment
- **Branch:** `claude/claude-md-mi7nfvo5y0ih4m3f-01JvECKzpa2zuqwuF3yN3dJH`

---

## 🎯 Overview

This guide covers the complete deployment of the Sunday Clinic 3-template system, which transforms the monolithic single-template medical record system into a modular, category-based architecture supporting three distinct patient categories:

- **Obstetri** (MROBS####) - Pregnant patients
- **Gyn Repro** (MRGPR####) - Reproductive health/fertility
- **Gyn Special** (MRGPS####) - Gynecological pathology

---

## 📊 Project Summary

### Code Changes:

| Component | Before | After | Change |
|-----------|--------|-------|--------|
| **Database Tables** | 1 table | 2 tables | +1 table (counters) |
| **Database Columns** | N/A | +2 columns | mr_category, mr_sequence |
| **Frontend Components** | 1 file (6,447 lines) | 16 files (7,080 lines) | Modular |
| **Main Application** | 6,447 lines | 647 lines | **-90%** |
| **Total Frontend Files** | 1 | 18 | +17 files |

### Architecture Changes:

**Before:**
```
sunday-clinic.js (6,447 lines)
└── Monolithic: All logic + rendering for one template
```

**After:**
```
sunday-clinic.js (647 lines - integration layer)
├── sunday-clinic/
│   ├── main.js (component loader)
│   ├── utils/
│   │   ├── constants.js
│   │   ├── api-client.js
│   │   └── state-manager.js
│   └── components/
│       ├── obstetri/ (3 files)
│       ├── gyn-repro/ (3 files)
│       ├── gyn-special/ (3 files)
│       └── shared/ (6 files)
```

---

## 🗂️ Files Created/Modified

### Phase 1: Database (2 files)

1. **`staff/backend/migrations/20251120_add_mr_category_system.sql`**
   - Adds `mr_category` and `mr_sequence` columns
   - Creates `sunday_clinic_mr_counters` table
   - Creates indexes for performance

2. **`staff/backend/services/sundayClinicService.js`**
   - Enhanced with category-based MR ID generation
   - Auto-detection of patient category
   - Thread-safe counter increment

### Phase 2: Components (16 files)

**Core Infrastructure (4 files):**
1. `staff/public/scripts/sunday-clinic/utils/constants.js` (80 lines)
2. `staff/public/scripts/sunday-clinic/utils/api-client.js` (190 lines)
3. `staff/public/scripts/sunday-clinic/utils/state-manager.js` (150 lines)
4. `staff/public/scripts/sunday-clinic/main.js` (300 lines)

**USG Components (3 files):**
5. `staff/public/scripts/sunday-clinic/components/obstetri/usg-obstetri.js` (650 lines)
6. `staff/public/scripts/sunday-clinic/components/gyn-repro/usg-gyn-repro.js` (550 lines)
7. `staff/public/scripts/sunday-clinic/components/gyn-special/usg-gyn-special.js` (550 lines)

**Anamnesa Components (3 files):**
8. `staff/public/scripts/sunday-clinic/components/obstetri/anamnesa-obstetri.js` (668 lines)
9. `staff/public/scripts/sunday-clinic/components/gyn-repro/anamnesa-gyn-repro.js` (612 lines)
10. `staff/public/scripts/sunday-clinic/components/gyn-special/anamnesa-gyn-special.js` (596 lines)

**Shared Components (6 files):**
11. `staff/public/scripts/sunday-clinic/components/shared/identity-section.js` (364 lines)
12. `staff/public/scripts/sunday-clinic/components/shared/physical-exam.js` (486 lines)
13. `staff/public/scripts/sunday-clinic/components/shared/penunjang.js` (422 lines)
14. `staff/public/scripts/sunday-clinic/components/shared/diagnosis.js` (378 lines)
15. `staff/public/scripts/sunday-clinic/components/shared/plan.js` (471 lines)
16. `staff/public/scripts/sunday-clinic/components/shared/billing.js` (653 lines)

### Phase 3: Integration (2 files)

17. **`staff/public/scripts/sunday-clinic.js`** (647 lines)
    - Replaced monolithic file
    - Integration layer for component system
    - Old file backed up as `sunday-clinic.js.backup`

18. **`staff/public/sunday-clinic.html`**
    - Updated sidebar label: "Laboratorium" → "Penunjang"

### Documentation (6 files)

19. `PHASE1_MR_CATEGORY_SYSTEM.md`
20. `PHASE1_IMPLEMENTATION_SUMMARY.md`
21. `PHASE2_COMPONENT_ARCHITECTURE_PROGRESS.md`
22. `PHASE2_PART2_SUMMARY.md`
23. `PHASE3_INTEGRATION_PLAN.md`
24. `DEPLOYMENT_GUIDE.md` (this file)

---

## 🚀 Deployment Steps

### Pre-Deployment Checklist

- [ ] Review all changes in the branch
- [ ] Backup production database
- [ ] Backup production frontend files
- [ ] Inform medical staff of planned downtime (if any)
- [ ] Prepare rollback plan
- [ ] Test on staging environment first

---

### Step 1: Database Migration (Phase 1)

**Estimated Time:** 5-10 minutes
**Downtime Required:** Yes (brief)

```bash
# 1. Connect to production database
mysql -u root -p dokterdibya_db

# 2. Backup existing data
mysqldump dokterdibya_db sunday_clinic_records > backup_sunday_clinic_$(date +%Y%m%d).sql

# 3. Run migration
source staff/backend/migrations/20251120_add_mr_category_system.sql

# 4. Verify migration
DESCRIBE sunday_clinic_records;
SELECT * FROM sunday_clinic_mr_counters;

# Expected output:
# +----------------+------------------+
# | category       | current_sequence |
# +----------------+------------------+
# | obstetri       | 0                |
# | gyn_repro      | 0                |
# | gyn_special    | 0                |
# +----------------+------------------+
```

**Verification:**
```sql
-- Check new columns exist
SHOW COLUMNS FROM sunday_clinic_records LIKE 'mr_%';

-- Should show:
-- mr_category (ENUM)
-- mr_sequence (INT)

-- Check indexes
SHOW INDEX FROM sunday_clinic_records WHERE Key_name LIKE 'idx_%';
```

**Rollback (if needed):**
```sql
ALTER TABLE sunday_clinic_records
  DROP COLUMN mr_category,
  DROP COLUMN mr_sequence;

DROP TABLE sunday_clinic_mr_counters;
```

---

### Step 2: Backend Code Deployment

**Estimated Time:** 5 minutes
**Downtime Required:** No

```bash
# 1. Navigate to project directory
cd /path/to/dokterdibya

# 2. Pull changes
git fetch origin
git checkout claude/claude-md-mi7nfvo5y0ih4m3f-01JvECKzpa2zuqwuF3yN3dJH

# 3. Copy updated backend files to production
cp staff/backend/services/sundayClinicService.js /path/to/production/staff/backend/services/

# 4. Restart backend service
pm2 restart staff-backend
# or
systemctl restart dokterdibya-staff

# 5. Verify service is running
pm2 status
# or
systemctl status dokterdibya-staff
```

**Verification:**
```bash
# Test category-based MR ID generation
curl -X POST http://localhost:3000/api/staff/sunday-clinic/test-mr-generation \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"category": "obstetri"}'

# Expected: {"success": true, "mrId": "MROBS0001", ...}
```

---

### Step 3: Frontend Component Deployment

**Estimated Time:** 10 minutes
**Downtime Required:** No (but cache clear required)

```bash
# 1. Backup old frontend
cp -r staff/public/scripts/sunday-clinic staff/public/scripts/sunday-clinic.backup.$(date +%Y%m%d)
cp staff/public/scripts/sunday-clinic.js staff/public/scripts/sunday-clinic.js.old

# 2. Deploy new component files
# Copy entire sunday-clinic folder
cp -r staff/public/scripts/sunday-clinic /path/to/production/staff/public/scripts/

# 3. Deploy new main application file
cp staff/public/scripts/sunday-clinic.js /path/to/production/staff/public/scripts/

# 4. Deploy updated HTML
cp staff/public/sunday-clinic.html /path/to/production/staff/public/

# 5. Clear browser caches (add versioning to HTML)
# Option A: Add version query parameter
sed -i 's/sunday-clinic.js/sunday-clinic.js?v=2.0/' /path/to/production/staff/public/sunday-clinic.html

# Option B: Hard refresh instruction for users
# Inform staff: Press Ctrl+Shift+R or Cmd+Shift+R
```

**File Permissions:**
```bash
# Ensure proper permissions
chmod 644 /path/to/production/staff/public/scripts/sunday-clinic.js
chmod 644 /path/to/production/staff/public/scripts/sunday-clinic/*.js
chmod 644 /path/to/production/staff/public/scripts/sunday-clinic/components/*/*.js
```

---

### Step 4: Data Migration (Existing Records)

**Estimated Time:** 30 minutes - 2 hours (depending on record count)
**Downtime Required:** No

⚠️ **IMPORTANT:** This step is only needed if you have existing Sunday Clinic records.

**Migration Script Location:**
`staff/backend/scripts/migrate-existing-sunday-clinic-records.js`

```bash
# 1. Navigate to backend directory
cd staff/backend

# 2. Run migration script
node scripts/migrate-existing-sunday-clinic-records.js

# The script will:
# - Load all existing records
# - Detect category from patient intake data
# - Set mr_category field
# - Update counter table
# - Preserve all existing data
```

**Manual Migration (if script fails):**
```sql
-- For records with known categories from intake
UPDATE sunday_clinic_records scr
INNER JOIN patient_intake pi ON scr.patient_id = pi.patient_id
SET scr.mr_category = CASE
  WHEN pi.summary->>'$.intakeCategory' = 'obstetri' THEN 'obstetri'
  WHEN pi.summary->>'$.intakeCategory' = 'gyn_repro' THEN 'gyn_repro'
  WHEN pi.summary->>'$.intakeCategory' = 'gyn_special' THEN 'gyn_special'
  ELSE 'obstetri' -- default
END
WHERE scr.mr_category IS NULL;

-- Update counters based on existing records
INSERT INTO sunday_clinic_mr_counters (category, current_sequence)
SELECT 'obstetri', COUNT(*) FROM sunday_clinic_records WHERE mr_category = 'obstetri'
ON DUPLICATE KEY UPDATE current_sequence = VALUES(current_sequence);

-- Repeat for gyn_repro and gyn_special
```

---

### Step 5: Testing & Verification

**Estimated Time:** 30 minutes
**Downtime Required:** No

#### 5.1 Smoke Tests

```bash
# Test 1: Application loads
curl -I https://your-domain.com/staff/public/sunday-clinic.html

# Test 2: API endpoints respond
curl https://your-domain.com/api/staff/sunday-clinic/directory \
  -H "Authorization: Bearer YOUR_TOKEN"

# Test 3: Component files accessible
curl -I https://your-domain.com/staff/public/scripts/sunday-clinic/main.js
```

#### 5.2 Functional Tests

**Test Patient Selection:**
1. Open Sunday Clinic in browser
2. Click "Pilih Pasien" button
3. Verify patient directory loads
4. Search for a patient
5. Select patient → verify visits load
6. Click "Buka" on a visit → verify MR loads

**Test Category Detection:**
1. Load Obstetri patient → verify badge shows "Obstetri" (blue)
2. Load Gyn Repro patient → verify badge shows "Gyn Repro" (green)
3. Load Gyn Special patient → verify badge shows "Gyn Special" (info)

**Test Component Loading:**
1. Navigate to each section (Identitas, Anamnesa, Pemeriksaan Fisik, USG, Penunjang, Diagnosis, Planning, Tagihan)
2. Verify each section loads without errors
3. Check browser console for errors (F12)

**Test Data Saving:**
1. Edit a section (e.g., add vital signs in Pemeriksaan Fisik)
2. Click Save
3. Reload page
4. Verify data persists

**Test Auto-Calculations:**
1. **BMI:** Enter height and weight → verify BMI calculates
2. **EDD (Obstetri):** Enter LMP → verify EDD calculates
3. **Billing Total:** Add items → verify totals calculate

**Test Dynamic Lists:**
1. Add medication in Plan → verify row adds
2. Remove medication → verify row removes
3. Add diagnosis → verify list updates
4. Add billing item → verify calculation updates

#### 5.3 Browser Compatibility

Test on:
- [ ] Chrome (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Edge (latest)

#### 5.4 Performance Tests

```bash
# Measure page load time
curl -w "@curl-format.txt" -o /dev/null -s https://your-domain.com/staff/public/sunday-clinic.html

# Check component file sizes
ls -lh staff/public/scripts/sunday-clinic/components/*/*.js
```

Expected load time: < 2 seconds

---

### Step 6: User Training

**Required Training Topics:**

1. **New UI Features:**
   - Category badges (color-coded)
   - "Penunjang" replaces "Laboratorium"
   - No functional changes to workflow

2. **MR ID Format:**
   - MROBS#### for pregnant patients
   - MRGPR#### for fertility patients
   - MRGPS#### for gynecology patients
   - Automatic based on patient intake

3. **Keyboard Shortcuts:**
   - Ctrl/Cmd + K: Open patient directory
   - Escape: Close directory

4. **What Hasn't Changed:**
   - Patient registration process
   - Section navigation
   - Data entry workflow
   - Billing process
   - Print functionality

---

## 🔄 Rollback Procedure

**If issues occur during/after deployment:**

### Rollback Step 1: Frontend (Fastest)

```bash
# 1. Restore old sunday-clinic.js
cp staff/public/scripts/sunday-clinic.js.backup /path/to/production/staff/public/scripts/sunday-clinic.js

# 2. Remove new component directory (optional)
mv /path/to/production/staff/public/scripts/sunday-clinic \
   /path/to/production/staff/public/scripts/sunday-clinic.new

# 3. Restore old component directory if exists
mv /path/to/production/staff/public/scripts/sunday-clinic.backup.YYYYMMDD \
   /path/to/production/staff/public/scripts/sunday-clinic

# 4. Clear browser caches
# Instruct users: Ctrl+Shift+R or Cmd+Shift+R

# 5. Verify old system works
```

**Estimated Rollback Time:** 2 minutes

### Rollback Step 2: Backend (If Needed)

```bash
# Restore old sundayClinicService.js
git checkout main -- staff/backend/services/sundayClinicService.js
cp staff/backend/services/sundayClinicService.js /path/to/production/staff/backend/services/

# Restart service
pm2 restart staff-backend
```

### Rollback Step 3: Database (Last Resort)

⚠️ **WARNING:** Only if absolutely necessary. Will lose new MR ID assignments.

```sql
-- Remove new columns
ALTER TABLE sunday_clinic_records
  DROP COLUMN mr_category,
  DROP COLUMN mr_sequence;

-- Drop counter table
DROP TABLE sunday_clinic_mr_counters;

-- Restore from backup if data corruption
mysql -u root -p dokterdibya_db < backup_sunday_clinic_YYYYMMDD.sql
```

---

## 🐛 Troubleshooting

### Issue 1: Components Not Loading

**Symptoms:**
- Blank page
- Console error: "Failed to load module"
- 404 errors for component files

**Solution:**
```bash
# Check file paths
ls -la /path/to/production/staff/public/scripts/sunday-clinic/
ls -la /path/to/production/staff/public/scripts/sunday-clinic/components/

# Check file permissions
chmod 644 /path/to/production/staff/public/scripts/sunday-clinic/*.js
chmod 644 /path/to/production/staff/public/scripts/sunday-clinic/components/*/*.js

# Verify web server config (nginx/apache)
# Ensure ES6 modules are served with correct MIME type
# Add to nginx config:
location ~ \.js$ {
    add_header Content-Type application/javascript;
}
```

### Issue 2: Authentication Errors

**Symptoms:**
- Redirected to login immediately
- Console error: "No auth token found"
- 401 Unauthorized errors

**Solution:**
```javascript
// Check localStorage key
console.log(localStorage.getItem('staffToken'));

// If null, token key mismatch
// Update api-client.js line 11:
this.token = localStorage.getItem('staffToken'); // was 'token'
```

### Issue 3: MR ID Generation Fails

**Symptoms:**
- Error creating new records
- Duplicate MR IDs
- NULL mr_category

**Solution:**
```sql
-- Check counter table
SELECT * FROM sunday_clinic_mr_counters;

-- Reset if needed
TRUNCATE sunday_clinic_mr_counters;
INSERT INTO sunday_clinic_mr_counters VALUES
  ('obstetri', 0),
  ('gyn_repro', 0),
  ('gyn_special', 0);

-- Check for locks
SHOW PROCESSLIST;
KILL <process_id>; -- if locked
```

### Issue 4: Slow Performance

**Symptoms:**
- Components take long to load
- Page feels sluggish

**Solution:**
```bash
# Enable gzip compression (nginx)
gzip on;
gzip_types application/javascript;

# Enable browser caching
location ~* \.js$ {
    expires 7d;
    add_header Cache-Control "public, immutable";
}

# Check database indexes
mysql> SHOW INDEX FROM sunday_clinic_records;

# Add missing indexes if needed
CREATE INDEX idx_mr_category ON sunday_clinic_records(mr_category);
```

### Issue 5: Data Not Saving

**Symptoms:**
- Changes don't persist
- Console error on save
- 500 Internal Server Error

**Solution:**
```bash
# Check backend logs
pm2 logs staff-backend

# Verify API endpoint exists
curl -X POST https://your-domain.com/api/staff/sunday-clinic/records/TEST123/anamnesa \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"test": "data"}'

# If 404, check backend routes
grep "sunday-clinic" staff/backend/routes/*.js
```

---

## 📊 Monitoring & Metrics

### Health Checks

**Daily:**
- [ ] Check application loads without errors
- [ ] Verify new MR IDs generate correctly
- [ ] Check database counter increments properly

**Weekly:**
- [ ] Review error logs for component loading issues
- [ ] Check MR ID distribution across categories
- [ ] Verify data integrity (no NULL categories)

**Monthly:**
- [ ] Performance metrics review
- [ ] User feedback collection
- [ ] Code quality review

### Key Metrics to Monitor

```sql
-- MR ID distribution by category
SELECT
    mr_category,
    COUNT(*) as count,
    MAX(mr_sequence) as max_sequence
FROM sunday_clinic_records
GROUP BY mr_category;

-- Records without category (should be 0)
SELECT COUNT(*)
FROM sunday_clinic_records
WHERE mr_category IS NULL;

-- Recent MR creations
SELECT mr_id, mr_category, created_at
FROM sunday_clinic_records
ORDER BY created_at DESC
LIMIT 10;
```

### Performance Benchmarks

| Metric | Target | Alert If |
|--------|--------|----------|
| Page Load Time | < 2s | > 5s |
| Component Load | < 500ms | > 2s |
| API Response | < 300ms | > 1s |
| Database Query | < 100ms | > 500ms |

---

## 📚 Additional Resources

### Documentation Files:
- `PHASE1_MR_CATEGORY_SYSTEM.md` - Database architecture details
- `PHASE2_COMPONENT_ARCHITECTURE_PROGRESS.md` - Component structure
- `PHASE3_INTEGRATION_PLAN.md` - Integration details

### Code References:
- Main application: `staff/public/scripts/sunday-clinic.js`
- Component loader: `staff/public/scripts/sunday-clinic/main.js`
- API client: `staff/public/scripts/sunday-clinic/utils/api-client.js`
- State manager: `staff/public/scripts/sunday-clinic/utils/state-manager.js`

### Backup Files:
- Old application: `staff/public/scripts/sunday-clinic.js.backup`
- Database backup: `backup_sunday_clinic_YYYYMMDD.sql`

---

## ✅ Post-Deployment Checklist

- [ ] Database migration successful
- [ ] Backend service restarted
- [ ] Frontend files deployed
- [ ] Browser caches cleared
- [ ] Smoke tests passed
- [ ] Functional tests passed
- [ ] Browser compatibility verified
- [ ] User training completed
- [ ] Documentation updated
- [ ] Monitoring enabled
- [ ] Backup verified
- [ ] Rollback procedure tested (in staging)
- [ ] Medical staff notified of changes
- [ ] Support team briefed
- [ ] Success metrics baselined

---

## 🎉 Success Criteria

Deployment is successful if:

1. ✅ New patients get correct category-based MR IDs (MROBS/MRGPR/MRGPS)
2. ✅ Existing records remain accessible
3. ✅ All 3 templates load correctly based on category
4. ✅ Data saves and loads without errors
5. ✅ No increase in error rates
6. ✅ Page load time < 2 seconds
7. ✅ Medical staff can use system without issues
8. ✅ No critical bugs reported in first 24 hours

---

## 📞 Support

**For Issues During Deployment:**
- Check troubleshooting section above
- Review error logs: `pm2 logs staff-backend`
- Check browser console (F12)
- Verify file permissions and paths

**Emergency Rollback:**
- Execute rollback procedure immediately
- Document issue for post-mortem
- Contact development team

---

**Deployment Version:** 1.0
**Branch:** `claude/claude-md-mi7nfvo5y0ih4m3f-01JvECKzpa2zuqwuF3yN3dJH`
**Deployment Date:** _____________
**Deployed By:** _____________
**Status:** ⬜ Success  ⬜ Rollback  ⬜ Partial

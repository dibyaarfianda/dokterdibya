# Performance Migration Rollout Guide

## Overview

Two migrations to apply:
1. `20260307_performance_indexes_up.sql` — Collation fixes + composite indexes
2. `20260307_index_cleanup_and_gaps_up.sql` — Drop redundant indexes + fill gaps

## Pre-flight Checks

```bash
# 1. Check current table sizes (small tables = fast ALTER)
mysql -u root dibyaklinik -e "
SELECT TABLE_NAME, TABLE_ROWS, DATA_LENGTH/1024/1024 as data_mb
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = 'dibyaklinik'
AND TABLE_NAME IN ('patients','sunday_clinic_records','medical_records','patient_documents','sunday_appointments','birth_congratulations','appointments')
ORDER BY TABLE_ROWS DESC;"

# 2. Verify no active long-running queries
mysql -u root dibyaklinik -e "SHOW PROCESSLIST;"

# 3. Backup (required)
mysqldump -u root dibyaklinik patients sunday_clinic_records medical_records patient_documents sunday_appointments birth_congratulations > /tmp/perf_migration_backup.sql
```

## Rollout (apply during low-traffic window)

### Step 1: Apply collation + index migration

```bash
mysql -u root dibyaklinik < /var/www/dokterdibya/staff/backend/migrations/20260307_performance_indexes_up.sql
```

**Expected duration:** ~5-15 seconds (tables are small: <1000 rows each).

**What this does:**
- Aligns `medical_records.patient_id` and `medical_records.mr_id` to `utf8mb4_unicode_ci`
- Adds composite indexes for main query sort + subquery lookups
- Adds `birth_congratulations.patient_id` index

**Verify:**
```bash
# Check collation is aligned
mysql -u root dibyaklinik -e "
SELECT COLUMN_NAME, COLLATION_NAME
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA='dibyaklinik' AND TABLE_NAME='medical_records'
AND COLUMN_NAME IN ('patient_id','mr_id');"

# Expected: both utf8mb4_unicode_ci

# Check indexes exist
mysql -u root dibyaklinik -e "SHOW INDEX FROM medical_records WHERE Key_name LIKE 'idx_mr_%';"
mysql -u root dibyaklinik -e "SHOW INDEX FROM sunday_clinic_records WHERE Key_name LIKE 'idx_scr_%';"
mysql -u root dibyaklinik -e "SHOW INDEX FROM birth_congratulations WHERE Key_name LIKE 'idx_birth_%';"
```

### Step 2: Verify application works

```bash
# Quick smoke test
curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:3000/api/patients?limit=10" | jq '.success, .count'
# Expected: true, 10
```

### Step 3: Apply index cleanup (optional, can defer)

```bash
mysql -u root dibyaklinik < /var/www/dokterdibya/staff/backend/migrations/20260307_index_cleanup_and_gaps_up.sql
```

**What this does:**
- Drops 13 redundant single-column indexes (reduces write amplification)
- Adds `idx_scr_visit_location` and `idx_appt_hospital_patient`

### Step 4: Run concurrent benchmark

```bash
cd /var/www/dokterdibya/staff/backend
node bench-concurrent.js --quick   # fast check
node bench-concurrent.js           # full suite
```

## Rollback

### Emergency: revert collation + indexes
```bash
mysql -u root dibyaklinik < /var/www/dokterdibya/staff/backend/migrations/20260307_performance_indexes_down.sql
```

### Emergency: revert index cleanup
```bash
mysql -u root dibyaklinik < /var/www/dokterdibya/staff/backend/migrations/20260307_index_cleanup_and_gaps_down.sql
```

### Full rollback (both)
```bash
mysql -u root dibyaklinik < /var/www/dokterdibya/staff/backend/migrations/20260307_index_cleanup_and_gaps_down.sql
mysql -u root dibyaklinik < /var/www/dokterdibya/staff/backend/migrations/20260307_performance_indexes_down.sql
```

## Risk Assessment

| Change | Risk | Lock duration | Rollback |
|--------|------|---------------|----------|
| Collation MODIFY COLUMN | Low | <1s per column (small table) | Revert MODIFY |
| ADD INDEX | Low | <1s (small table) | DROP INDEX |
| DROP INDEX | Very low | Instant (metadata only) | Re-ADD INDEX |

All tables have <1000 rows. ALTER TABLE completes in under a second.
MariaDB 10.11 uses instant ALTER for most index operations.

## Deployment Order

1. Apply migrations on DB
2. Deploy patients.js code (COLLATE casts removed)
3. Restart backend: `pm2 restart dibyaklinik-backend`
4. Run benchmark
5. Monitor `/api/metrics` for 30 minutes

**CRITICAL:** Migration must be applied BEFORE deploying the new patients.js code.
The obstetri JOIN in batch enrichment depends on aligned collations.

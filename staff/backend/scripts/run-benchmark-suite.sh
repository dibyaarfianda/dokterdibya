#!/bin/bash
# =============================================================================
# Performance Benchmark Suite — Before/After Protocol
# Run on VPS: /var/www/dokterdibya/staff/backend/scripts/run-benchmark-suite.sh
#
# Captures before.json → applies migration → captures after.json → compares.
# =============================================================================

set -euo pipefail
cd /var/www/dokterdibya/staff/backend

RESULTS_DIR="./benchmark-results"
mkdir -p "$RESULTS_DIR"
TS=$(date +%Y%m%d_%H%M%S)

echo "=== Performance Benchmark Suite ==="
echo "Timestamp: $TS"
echo ""

# ---------------------------------------------------------------------------
# Phase 1: BEFORE baseline (current production code + schema)
# ---------------------------------------------------------------------------
echo "--- Phase 1: BEFORE baseline ---"

# Check server is running
if ! curl -sf http://localhost:3000/api/health > /dev/null 2>&1; then
    echo "ERROR: Server not running on localhost:3000"
    exit 1
fi

echo "Server is healthy. Running BEFORE benchmark..."
node bench-concurrent.js 2>&1 | tee "$RESULTS_DIR/before_${TS}.log"

# Extract JSON block from output
sed -n '/^{$/,/^}$/p' "$RESULTS_DIR/before_${TS}.log" > "$RESULTS_DIR/before_${TS}.json" 2>/dev/null || true

echo ""
echo "BEFORE baseline saved to $RESULTS_DIR/before_${TS}.json"
echo ""

# ---------------------------------------------------------------------------
# Phase 2: Pre-flight checks
# ---------------------------------------------------------------------------
echo "--- Phase 2: Pre-flight checks ---"

echo "Table sizes:"
mysql -u root dibyaklinik -e "
SELECT TABLE_NAME, TABLE_ROWS, ROUND(DATA_LENGTH/1024/1024, 2) as data_mb
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = 'dibyaklinik'
AND TABLE_NAME IN ('patients','sunday_clinic_records','medical_records','patient_documents','sunday_appointments','birth_congratulations','appointments')
ORDER BY TABLE_ROWS DESC;" 2>/dev/null || echo "(skipped - no mysql access)"

echo ""
echo "Current collation on medical_records:"
mysql -u root dibyaklinik -e "
SELECT COLUMN_NAME, COLLATION_NAME
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA='dibyaklinik' AND TABLE_NAME='medical_records'
AND COLUMN_NAME IN ('patient_id','mr_id');" 2>/dev/null || echo "(skipped)"

echo ""
read -p "Apply migration now? (y/N) " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted. BEFORE results are saved."
    exit 0
fi

# ---------------------------------------------------------------------------
# Phase 3: Apply migration
# ---------------------------------------------------------------------------
echo "--- Phase 3: Apply migration ---"

echo "Backing up affected tables..."
mysqldump -u root dibyaklinik patients sunday_clinic_records medical_records patient_documents sunday_appointments birth_congratulations > "/tmp/perf_migration_backup_${TS}.sql" 2>/dev/null || echo "(backup skipped)"

echo "Applying collation + index migration..."
mysql -u root dibyaklinik < migrations/20260307_performance_indexes_up.sql
echo "  Done."

echo ""
echo "Post-migration verification:"
mysql -u root dibyaklinik -e "
SELECT COLUMN_NAME, COLLATION_NAME
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA='dibyaklinik' AND TABLE_NAME='medical_records'
AND COLUMN_NAME IN ('patient_id','mr_id');"

echo ""
echo "Verifying new indexes exist:"
mysql -u root dibyaklinik -e "
SELECT TABLE_NAME, INDEX_NAME, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) as columns
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA='dibyaklinik'
AND INDEX_NAME IN ('idx_patients_last_visit','idx_scr_patient_activity','idx_mr_patient_type_created','idx_pd_mr_type_status','idx_sa_patient_status_date','idx_birth_patient')
GROUP BY TABLE_NAME, INDEX_NAME
ORDER BY TABLE_NAME;"

# ---------------------------------------------------------------------------
# Phase 4: Restart server with new code
# ---------------------------------------------------------------------------
echo ""
echo "--- Phase 4: Restart server ---"
pm2 restart dibyaklinik-backend --wait-ready
sleep 3

# Smoke test
echo "Smoke test..."
STATUS=$(curl -sf -o /dev/null -w "%{http_code}" http://localhost:3000/api/health)
if [ "$STATUS" != "200" ]; then
    echo "FAIL: Health check returned $STATUS"
    echo "Rolling back migration..."
    mysql -u root dibyaklinik < migrations/20260307_performance_indexes_down.sql
    pm2 restart dibyaklinik-backend
    exit 1
fi
echo "  Health check: OK ($STATUS)"

# Quick endpoint test
PATIENTS_STATUS=$(curl -sf -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $(node -e "
    require('dotenv').config();
    const jwt = require('jsonwebtoken');
    const token = jwt.sign({id:'test',role:'admin',role_id:2}, process.env.JWT_SECRET, {expiresIn:'5m'});
    process.stdout.write(token);
")" "http://localhost:3000/api/patients?limit=10&_=$(date +%s)")
echo "  Patients endpoint: $PATIENTS_STATUS"

if [ "$PATIENTS_STATUS" != "200" ]; then
    echo "FAIL: Patients endpoint returned $PATIENTS_STATUS"
    echo "Rolling back..."
    mysql -u root dibyaklinik < migrations/20260307_performance_indexes_down.sql
    pm2 restart dibyaklinik-backend
    exit 1
fi

# ---------------------------------------------------------------------------
# Phase 5: AFTER benchmark
# ---------------------------------------------------------------------------
echo ""
echo "--- Phase 5: AFTER benchmark ---"
node bench-concurrent.js 2>&1 | tee "$RESULTS_DIR/after_${TS}.log"

sed -n '/^{$/,/^}$/p' "$RESULTS_DIR/after_${TS}.log" > "$RESULTS_DIR/after_${TS}.json" 2>/dev/null || true

echo ""
echo "AFTER results saved to $RESULTS_DIR/after_${TS}.json"

# ---------------------------------------------------------------------------
# Phase 6: Comparison
# ---------------------------------------------------------------------------
echo ""
echo "=== COMPARISON ==="
echo ""

if command -v jq &> /dev/null && [ -s "$RESULTS_DIR/before_${TS}.json" ] && [ -s "$RESULTS_DIR/after_${TS}.json" ]; then
    jq -s '
    .[0].results as $before |
    .[1].results as $after |
    {
        comparison: [range($before | length)] | map({
            scenario: "\($before[.].limit)x\($before[.].concurrency)",
            before_p95: $before[.].p95,
            after_p95: $after[.].p95,
            p95_change: "\((($after[.].p95 - $before[.].p95) / (if $before[.].p95 == 0 then 1 else $before[.].p95 end) * 100) | round)%",
            before_qpr: $before[.].queriesPerRequest,
            after_qpr: $after[.].queriesPerRequest,
            before_errs: $before[.].errors,
            after_errs: $after[.].errors,
        }),
        schema_parity: .[1].schemaParity,
        error_rate: .[1].errorRate,
        enrichment_failures: .[1].enrichmentStats.total,
    }' "$RESULTS_DIR/before_${TS}.json" "$RESULTS_DIR/after_${TS}.json"
else
    echo "(Install jq for automatic comparison, or compare JSON files manually)"
    echo "Before: $RESULTS_DIR/before_${TS}.json"
    echo "After:  $RESULTS_DIR/after_${TS}.json"
fi

echo ""
echo "=== DONE ==="
echo "Rollback if needed:"
echo "  mysql -u root dibyaklinik < migrations/20260307_performance_indexes_down.sql"
echo "  pm2 restart dibyaklinik-backend"

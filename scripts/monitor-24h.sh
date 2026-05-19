#!/bin/bash
#
# 24-hour production monitor for Dibya Klinik backend.
#
# Usage:
#   ./monitor-24h.sh [duration_hours] [interval_seconds] [output_dir]
#
# Examples:
#   ./monitor-24h.sh
#   ./monitor-24h.sh 24 300 /var/www/dokterdibya/reports/monitoring
#

set -u

DURATION_HOURS="${1:-24}"
INTERVAL_SECONDS="${2:-300}"
OUTPUT_DIR="${3:-/var/www/dokterdibya/reports/monitoring}"

if ! [[ "$DURATION_HOURS" =~ ^[0-9]+$ ]] || ! [[ "$INTERVAL_SECONDS" =~ ^[0-9]+$ ]]; then
    echo "Error: duration_hours and interval_seconds must be integers"
    exit 1
fi

if [ "$DURATION_HOURS" -lt 1 ]; then
    echo "Error: duration_hours must be >= 1"
    exit 1
fi

if [ "$INTERVAL_SECONDS" -lt 10 ]; then
    echo "Error: interval_seconds must be >= 10"
    exit 1
fi

mkdir -p "$OUTPUT_DIR"

RUN_ID="$(date +%Y%m%d_%H%M%S)"
START_TS="$(date +%s)"
END_TS=$((START_TS + (DURATION_HOURS * 3600)))

CSV_FILE="$OUTPUT_DIR/monitor_${RUN_ID}.csv"
LOG_FILE="$OUTPUT_DIR/monitor_${RUN_ID}.log"
SUMMARY_FILE="$OUTPUT_DIR/monitor_${RUN_ID}_summary.txt"
PID_FILE="$OUTPUT_DIR/monitor_${RUN_ID}.pid"

ln -sfn "$CSV_FILE" "$OUTPUT_DIR/latest_monitor.csv"
ln -sfn "$LOG_FILE" "$OUTPUT_DIR/latest_monitor.log"
ln -sfn "$SUMMARY_FILE" "$OUTPUT_DIR/latest_monitor_summary.txt"
ln -sfn "$PID_FILE" "$OUTPUT_DIR/latest_monitor.pid"

echo "$$" > "$PID_FILE"

cat > "$CSV_FILE" <<'EOF'
timestamp,health_http,health_status,db_latency_ms,metrics_http,p95_ms,p99_ms,error_rate,total_requests,db_avg_query_ms,db_slow_query_count,pm2_pid,pm2_restarts,pm2_memory_mb,pm2_cpu_percent
EOF

log_line() {
    local line="$1"
    echo "$line" | tee -a "$LOG_FILE" >/dev/null
}

safe_json_value() {
    local json_input="$1"
    local js_expr="$2"

    JSON_INPUT="$json_input" JS_EXPR="$js_expr" node -e '
const input = process.env.JSON_INPUT || "{}";
const expr = process.env.JS_EXPR || "null";
let parsed = {};
try { parsed = JSON.parse(input); } catch (e) { parsed = {}; }
let value = "";
try {
  const fn = new Function("obj", `return (${expr});`);
  const out = fn(parsed);
  if (out === null || out === undefined || Number.isNaN(out)) {
    value = "";
  } else {
    value = String(out);
  }
} catch (e) {
  value = "";
}
process.stdout.write(value);
' 2>/dev/null
}

collect_pm2_snapshot() {
    local pm2_json pm2_pid pm2_restarts pm2_memory_bytes pm2_cpu

    pm2_json="$(pm2 jlist 2>/dev/null || echo '[]')"

    pm2_pid="$(safe_json_value "$pm2_json" "(obj.find(x => x.name === 'dibyaklinik-backend') || {}).pid")"
    pm2_restarts="$(safe_json_value "$pm2_json" "((obj.find(x => x.name === 'dibyaklinik-backend') || {}).pm2_env || {}).restart_time")"
    pm2_memory_bytes="$(safe_json_value "$pm2_json" "((obj.find(x => x.name === 'dibyaklinik-backend') || {}).monit || {}).memory")"
    pm2_cpu="$(safe_json_value "$pm2_json" "((obj.find(x => x.name === 'dibyaklinik-backend') || {}).monit || {}).cpu")"

    if [ -z "$pm2_memory_bytes" ]; then
        pm2_memory_bytes=0
    fi

    local pm2_memory_mb
    pm2_memory_mb=$(awk -v bytes="$pm2_memory_bytes" 'BEGIN { printf "%.2f", bytes/1024/1024 }')

    echo "${pm2_pid:-0},${pm2_restarts:-0},${pm2_memory_mb},${pm2_cpu:-0}"
}

log_line "[START] monitor run_id=$RUN_ID duration=${DURATION_HOURS}h interval=${INTERVAL_SECONDS}s"
log_line "[START] csv=$CSV_FILE"
log_line "[START] log=$LOG_FILE"

while [ "$(date +%s)" -lt "$END_TS" ]; do
    now_human="$(date '+%Y-%m-%d %H:%M:%S')"

    health_payload_file="$(mktemp)"
    metrics_payload_file="$(mktemp)"

    health_http="$(curl -sS --max-time 10 -o "$health_payload_file" -w '%{http_code}' http://127.0.0.1:3000/api/health || echo '000')"
    metrics_http="$(curl -sS --max-time 10 -o "$metrics_payload_file" -w '%{http_code}' http://127.0.0.1:3000/api/metrics || echo '000')"

    health_json="$(cat "$health_payload_file" 2>/dev/null || echo '{}')"
    metrics_json="$(cat "$metrics_payload_file" 2>/dev/null || echo '{}')"

    rm -f "$health_payload_file" "$metrics_payload_file"

    health_status="$(safe_json_value "$health_json" 'obj.status')"
    db_latency_ms="$(safe_json_value "$health_json" 'obj.database && obj.database.latencyMs')"

    p95_ms="$(safe_json_value "$metrics_json" 'obj.performance && obj.performance.p95Ms')"
    p99_ms="$(safe_json_value "$metrics_json" 'obj.performance && obj.performance.p99Ms')"
    error_rate="$(safe_json_value "$metrics_json" 'obj.errors && obj.errors.errorRate')"
    total_requests="$(safe_json_value "$metrics_json" 'obj.requests && obj.requests.total')"
    db_avg_query_ms="$(safe_json_value "$metrics_json" 'obj.db && obj.db.avgQueryMs')"
    db_slow_query_count="$(safe_json_value "$metrics_json" 'obj.db && obj.db.slowQueryCount')"

    pm2_values="$(collect_pm2_snapshot)"

    # shellcheck disable=SC2086
    echo "$now_human,${health_http:-000},${health_status:-unknown},${db_latency_ms:-},${metrics_http:-000},${p95_ms:-},${p99_ms:-},${error_rate:-},${total_requests:-},${db_avg_query_ms:-},${db_slow_query_count:-},$pm2_values" >> "$CSV_FILE"

    log_line "[SAMPLE] ts=$now_human health_http=${health_http:-000} metrics_http=${metrics_http:-000} p95=${p95_ms:-NA} restart=$(echo "$pm2_values" | cut -d',' -f2)"

    sleep "$INTERVAL_SECONDS"
done

awk -F',' '
NR==1 {next}
{
    total++
    if ($2 != "200") health_bad++
    if ($5 != "200") metrics_bad++
    if ($6 != "") { p95_sum += $6; if ($6 > p95_max) p95_max = $6; p95_count++ }
    if ($13 != "") {
        if (first_restart == "") first_restart = $13
        last_restart = $13
    }
}
END {
    restart_delta = (last_restart == "" || first_restart == "") ? 0 : (last_restart - first_restart)
    avg_p95 = (p95_count > 0) ? p95_sum / p95_count : 0
    printf("samples=%d\n", total)
    printf("health_non_200=%d\n", health_bad+0)
    printf("metrics_non_200=%d\n", metrics_bad+0)
    printf("avg_p95_ms=%.2f\n", avg_p95)
    printf("max_p95_ms=%.2f\n", p95_max+0)
    printf("restart_delta=%d\n", restart_delta)
}
' "$CSV_FILE" > "$SUMMARY_FILE"

log_line "[END] completed run_id=$RUN_ID"
log_line "[END] summary=$SUMMARY_FILE"

cat "$SUMMARY_FILE"

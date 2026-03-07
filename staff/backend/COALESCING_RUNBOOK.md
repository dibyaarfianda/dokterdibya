# Coalescing & Rate Limiting — On-Call Runbook

## What is coalescing?

Request coalescing deduplicates identical in-flight GET requests from the same user. When multiple polls arrive within a 200ms window for the same endpoint + token, only one hits the database — the rest piggyback on its response. This reduces DB load from notification/dashboard polling.

## Configuration (env vars in .env)

| Variable | Default | Description |
|----------|---------|-------------|
| `COALESCE_ENABLED` | `true` | Master on/off switch |
| `COALESCE_TTL_MS` | `200` | Dedup window in milliseconds |
| `COALESCE_MAX_INFLIGHT` | `100` | Inflight map size that triggers failsafe |
| `COALESCE_COOLDOWN_MS` | `30000` | How long failsafe stays active before auto-recovery |

Changes require `pm2 restart dibyaklinik-backend`.

## Canary rollout steps

1. **Monitor baseline** — Check `/api/metrics` for `coalescing` section. Note current `totalWaiters`, `totalBypassed`.
2. **Reduce scope** — Set `COALESCE_TTL_MS=100` to tighten the dedup window. Restart. Monitor for 30 min.
3. **Full rollout** — Restore `COALESCE_TTL_MS=200` (default). Monitor for 24 hours.
4. **Emergency off** — Set `COALESCE_ENABLED=false`. Restart. All requests bypass coalescing. No UX impact.

## Auto-failsafe

If the inflight map exceeds `COALESCE_MAX_INFLIGHT` (100 entries), coalescing auto-disables:
- A structured warning is logged
- All requests pass through normally (fail-open)
- After `COALESCE_COOLDOWN_MS` (30s), the system checks if the map has drained
- If drained: coalescing re-enables automatically
- If still overloaded: failsafe re-trips for another cooldown cycle

## Metrics endpoint

`GET /api/metrics` includes:

```json
{
  "coalescing": {
    "enabled": true,
    "configEnabled": true,
    "ttlMs": 200,
    "maxInflight": 100,
    "cooldownMs": 30000,
    "mapSize": 0,
    "totalWaiters": 42,
    "totalBypassed": 15,
    "failsafe": {
      "tripped": false,
      "triggerCount": 0,
      "lastTriggerTs": null,
      "failsafeBypass": 0
    },
    "limiterRejects": {
      "auth": 0,
      "expensive": 0,
      "standard": 0
    }
  }
}
```

## Alert thresholds

| Metric | Threshold | Severity | What to do |
|--------|-----------|----------|------------|
| `coalescing.failsafe.tripped` = true | — | WARNING | Check inflight map size. If sustained, check for handler hangs or connection leaks. |
| `coalescing.mapSize` > 50 sustained | 1 min | WARNING | Possible stuck requests. Check `pm2 logs` for slow query warnings. |
| `coalescing.mapSize` > 100 | — | CRITICAL | Failsafe will auto-trigger. Investigate immediately. |
| `limiterRejects.auth` > 10/min | — | ALERT | Brute-force login attempt. Check source IPs in access log. |
| `limiterRejects.standard` > 20/min | — | WARNING | Possible polling bug or DDoS. Check if a frontend timer is too aggressive. |
| `failsafe.triggerCount` increasing | — | WARNING | Repeated overloads. Consider raising `COALESCE_MAX_INFLIGHT` or investigating root cause. |
| p95 latency > 2x normal | 5 min | ALERT | Check DB slow queries (`metrics.db`), cache misses (`metrics.cache`), and whether failsafe is cycling. |

## First actions for on-call

### Failsafe keeps triggering
1. Check `pm2 logs dibyaklinik-backend | grep "failsafe"` for timestamps
2. Check `curl localhost:3000/api/metrics | jq .coalescing` for current state
3. If map won't drain: check for stuck handlers → `pm2 restart dibyaklinik-backend`
4. If persists after restart: set `COALESCE_ENABLED=false` in `.env`, restart

### High limiter rejects
1. Check which tier: `curl localhost:3000/api/metrics | jq .coalescing.limiterRejects`
2. Auth rejects: check nginx access log for repeated POST to `/api/auth/`
3. Standard rejects: check if a frontend polling interval is too short

### p95 latency spike
1. Check DB: `curl localhost:3000/api/metrics | jq .db`
2. Check cache: `curl localhost:3000/api/metrics | jq .cache`
3. Check if coalescing failsafe is cycling (frequent enable/disable)
4. If DB slow queries > 5: check MySQL processlist → `mysql -u root dibyaklinik -e "SHOW PROCESSLIST"`

## Rollback

To completely remove coalescing impact:
```bash
# In /var/www/dokterdibya/staff/backend/.env
COALESCE_ENABLED=false

# Restart
pm2 restart dibyaklinik-backend
```

All requests will bypass coalescing. No other behavior changes.

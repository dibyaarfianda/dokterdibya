# Private clinic hospital monitor operations

Apply `database/clinic-hospital-monitor-migration.sql` after an established database backup. This only adds `clinic_monitor_lock` and `clinic_monitor_records`; it never mutates patients, DRDs, visits or clinical records. The existing `patient_external_ids` migration must already exist. The singleton lock row must be present (`id=1`) or mutations fail closed.

Configuration uses existing database/R2/COMM API credentials, plus:

- `CLINIC_MONITOR_OWNER_ID`: same exact premium owner ID as COMM (deployment discovery identified ID 3; independently verify on deployment).
- `CLINIC_MONITOR_NOTIFICATIONS_ENABLED`: default absent/false; explicitly `true` only after all acceptance conditions.
- `CLINIC_MONITOR_TELEGRAM_BOT_TOKEN`: configure privately on server; never paste into chat/logs.
- `CLINIC_MONITOR_TELEGRAM_BOT_USERNAME`: bot username without `@`.
- `CLINIC_MONITOR_TELEGRAM_WEBHOOK_SECRET`: independent random secret configured for Telegram webhook header.
- `CLINIC_MONITOR_COMM_URL`: established HTTPS COMM base URL, without credentials/query/hash.

Telegram webhook: POST `/api/clinic-monitor/telegram/webhook`, authenticated only by `X-Telegram-Bot-Api-Secret-Token`. Pairing via owner-authenticated COMM creates a ten-minute single-use token and requires a private chat. Do not register or send messages until the owner has configured their bot. Webhook registration is an operational setup step, not automatically performed during application startup.

Review actual full-source coverage and case identifiers before marking each source verified. Never treat an empty response or successful HTTP as proof. The local command, run from `staff/backend`, is:

```
node scripts/clinic-monitor-verify-source.js gambiran IGD operator reviewed-evidence-reference
```

Repeat only for individually reviewed capabilities (three facilities times IGD/RI). This is not an HTTP endpoint and observation bodies cannot self-verify. Keep evidence references free of PHI. Outages remain visible as source status errors even after prior verification. Source verification alone does not enable messages: configuration, private pairing and the explicit enable flag must all pass. Activation sends one summary; existing episode events are not replayed as new admissions.

Archive jobs are leased for 15 minutes, at most two per claim. Each returned job includes `job_token`. Send it as `X-Clinic-Monitor-Job-Token` on binary uploads and `job_token` in archive result JSON. Old/reclaimed workers receive `409 ARCHIVE_LEASE_EXPIRED`. Exact retries of a completed result with its token return the prior result. Binary upload route accepts `application/octet-stream` up to 100 MiB; configure reverse-proxy body limits accordingly and disable request access logging for this upload path because metadata query parameters can contain original filenames. Application logging strips monitor queries. Inline originals remain available up to 6 MiB total. Oversized/unavailable originals must remain explicitly partial, never transformed or truncated.

Original bytes are private under `hospital-archives/<opaque-scope>/objects/<sha256>`, deduplicated within patient/facility. Each catalog version has a gzip JSON snapshot/manifest and original file descriptors/checksums. Signed downloads last five minutes and force attachment disposition. R2 puts have a 90-second abort signal and occur outside database locks. Database commit revalidates the lease/identity after upload. Failed commits can leave private unreferenced objects; no automatic deletion risks deleting permanent evidence. Existing COMM 30-day cleanup must not include `hospital-archives/`.

Partial/error archives recheck at discharge +24h, +72h and +7d, with a minimum one-minute delay when those deadlines have passed. Thereafter they remain partial/error until owner manual retry through POST `/clinic-monitor/archive-jobs/:episodeId/retry`. Missing census membership never confirms discharge.

Durability is per-entity MySQL JSON records, serialized using an InnoDB singleton row. Each transaction reads the monitor metadata catalog and writes changed entities only; no document bytes are loaded into MySQL. This intentionally favors correctness at the initial clinic cohort size, but metadata memory/read cost grows with accumulated archive versions. Measure catalog size/latency before expanding to a substantially larger population; partition/index entity reads before that growth becomes material.

Telegram has no sendMessage idempotency key. Persistent unique events/outbox prevent routine replay, and leases prevent concurrent sends. A process crash after Telegram accepts a message but before MySQL records acknowledgement can still deliver that message again after lease expiry (at-least-once external delivery); exactly-once external delivery is not claimed.

# Private clinic hospital monitor operations

Apply `database/clinic-hospital-monitor-migration.sql` after an established database backup. This only adds `clinic_monitor_lock` and `clinic_monitor_records`; it never mutates patients, DRDs, visits or clinical records. The existing `patient_external_ids` migration must already exist. The singleton lock row must be present (`id=1`) or mutations fail closed.

Configuration uses existing database/R2/COMM API credentials, plus:

- `CLINIC_MONITOR_OWNER_ID`: same exact premium owner ID as COMM (deployment discovery identified ID 3; independently verify on deployment).
- `CLINIC_MONITOR_NOTIFICATIONS_ENABLED`: default absent/false; explicitly `true` only after all acceptance conditions.
- `CLINIC_MONITOR_TELEGRAM_BOT_TOKEN`: configure privately on server; never paste into chat/logs.
- `CLINIC_MONITOR_TELEGRAM_BOT_USERNAME`: bot username without `@`.
- `CLINIC_MONITOR_TELEGRAM_WEBHOOK_SECRET`: independent random secret configured for Telegram webhook header.
- `CLINIC_MONITOR_COMM_URL`: established HTTPS COMM base URL, without credentials/query/hash.
- `CLINIC_MONITOR_SKIPPED_FACILITIES`: optional comma separated subset of `gambiran,melinda,bhayangkara` deliberately left out. A skipped hospital stops blocking activation through its two unverified sources, and is also never monitored or notified. Skipping every hospital keeps activation closed through `no_active_hospitals`.

`staff/backend/.env.example` carries this block with empty values; copy it rather than inventing names.

Telegram webhook: POST `/api/clinic-monitor/telegram/webhook`, authenticated only by `X-Telegram-Bot-Api-Secret-Token`. Pairing via owner-authenticated COMM creates a ten-minute single-use token and requires a private chat. Do not register or send messages until the owner has configured their bot. Webhook registration is an operational setup step, not automatically performed during application startup. Register it explicitly from `staff/backend`, passing this deployment's public base URL:

```
node scripts/clinic-monitor-webhook.js set https://dokterdibya.com
node scripts/clinic-monitor-webhook.js info
node scripts/clinic-monitor-webhook.js delete
```

Registration restricts Telegram to `message` updates and drops pending updates, so an expired pairing token cannot be redeemed from a backlog. The command refuses a non-HTTPS base or one carrying credentials, query or hash, and never prints the bot token or secret. Deleting the webhook stops pairing and all alerts until it is registered again.

Read activation state on the server without going through COMM:

```
node scripts/clinic-monitor-status.js
```

It prints configuration, per-source verification, the exact remaining blockers, and tallies of episodes, events by type and unmatched patients by reason. Only counts and reason labels: names, birth dates, wards and hospital MR numbers are never printed, so the output holds no PHI. `Monitor schema not ready` means the migration above has not been applied.

Read the tallies, not just the blockers. An empty blocker list means the configuration is complete; it does not mean patients are reaching Telegram. A source can report `ok` for days while every patient it returns fails identity matching, which shows up as a growing `unmatched patients by reason` tally with no new events. `missing_exact_identity` there means the name matched a clinic patient but the birth dates differ, and neither owner confirmation nor an external ID mapping can override that, by design: the underlying record has to be corrected before the next census can match it.

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

## Activation checklist

Work in this order and stop at the first step that fails. Nothing here sends a patient alert until the last step.

1. Back up the database, apply `database/clinic-hospital-monitor-migration.sql`, then confirm `clinic_monitor_lock` holds row `id=1`.
2. Set the `CLINIC_MONITOR_*` variables on the server, leaving `CLINIC_MONITOR_NOTIFICATIONS_ENABLED=false`, and restart the backend.
3. Run `node scripts/clinic-monitor-status.js`; expect `telegram configured=true` and one unverified blocker per monitored source (six when no hospital is skipped).
4. Register the webhook with `node scripts/clinic-monitor-webhook.js set <public https base>`, then confirm with `info`.
5. Pair privately from COMM specialist mode; `/start` in the bot must answer that Telegram is connected but alerts are not active yet. Status now drops `telegram_not_connected`.
6. Confirm COMM actually collects each hospital and unit, review real all-DPJP coverage and case identifiers, then record each verification with `clinic-monitor-verify-source.js`. Successful HTTP or an empty list is not verification.
7. Re-run the status command; only when it reports no blockers, set `CLINIC_MONITOR_NOTIFICATIONS_ENABLED=true` and restart.
8. Expect exactly one baseline summary message. Existing episodes are not replayed as admissions.

To pause alerts, set `CLINIC_MONITOR_NOTIFICATIONS_ENABLED=false` and restart. Episodes and archives keep accruing and no new outbox entries are queued while paused, but entries queued before the pause are only held, not dropped: re-enabling delivers them immediately, so a long pause can surface an admission alert well after the event. Clear `clinic_monitor_records` rows with key prefix `outbox:` before re-enabling if stale alerts are unwanted. Re-enabling does not resend the baseline summary, because `activation:baseline` persists.

# DOKTERDIBYA System Hardening and Seamless Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` task by task. Every production behavior change follows `superpowers:test-driven-development`. Security tasks also follow `codex-security:fix-finding`.

**Goal:** Secure realtime and clinical-record boundaries, remove invisible latency and state loss, and harden dependencies and operations without changing desktop or PWA visuals or workflow.

**Architecture:** Deliver four independently releasable waves. Authentication and authorization are enforced at shared server boundaries; medical mutations use one transactional/versioned service; performance work preserves response and UI contracts; operational work is fail-closed. Each wave is reviewed, committed, pushed to `main`, deployed with the established VPS flow, and verified before the next wave starts.

**Tech Stack:** Node.js 22 production baseline, Express, Socket.IO polling-only, MySQL, Jest/Supertest, vanilla browser JavaScript/PWA service worker, Android Kotlin clients, GitHub Actions, PM2/Nginx.

**Spec:** User-approved plan in the task conversation dated 2026-09-24.

## Global Constraints

- Preserve all desktop and PWA layout, copy, menu order, and user workflow; internal loading/auth/cache/error behavior may change.
- Keep Socket.IO polling-only (`transports: ['polling']`, `allowUpgrades: false`).
- Never trust client-supplied identity, role, patient ID, or room ownership when the verified principal can supply it.
- No synthetic writes to production patient records. Destructive success paths use a staging clone; production success is verified only on the first legitimate clinical action.
- Section reset is granted only to `dokter` and `bidan`; full-visit deletion remains superadmin-only with its existing accounting guard.
- Preserve intentional empty strings and `null` values in medical data.
- Do not use blanket `npm audit fix`; dependency upgrades are batched and compatibility-tested.
- Never log tokens, patient names, MR/DRD identifiers, query payloads, or clinical payloads.
- No `Co-Authored-By` commit trailers.
- Root/controller owns merges, pushes, database migration application, production maintenance, deployment, and live verification. Subagents must not push, deploy, or touch live systems.
- Each wave must pass its release gate before the next wave begins.

## Review Focus

- Anonymous, expired, patient, and forged-role sockets must not obtain staff/support/clinical data while legitimate public HTTP fallbacks continue.
- Concurrent medical edits must not lose disjoint fields or silently overwrite the same field; reset must be exactly visit-scoped and atomic.
- Cache-version changes must preserve authentication, drafts, filters, and active context in both storage backends.
- Cursor pagination must remain stable across equal/null sort values, filters, and malformed or incompatible cursors.
- Backup, restore, metrics, CI, and dependency failures must fail closed rather than report success.

---

## Wave 1 — Realtime Trust Boundary

### Task 1: Server-side Socket.IO authentication, authorization, and room scoping

**Primary files:** `staff/backend/server.js`, `staff/backend/realtime-sync.js`, `staff/backend/routes/support-chat.js`, `staff/backend/routes/community-chat.js`, focused Jest tests.

**Produces:** A reusable handshake principal resolver; server-owned `staff`, `patient:<id>`, `support:<id>`, and `community:<slug>` rooms; stable `AUTH_MISSING`, `AUTH_INVALID`, `AUTH_EXPIRED`, and `FORBIDDEN` failures; quarantined anonymous sockets with no domain events.

- [ ] Add behavior tests that fail on the current code for anonymous access, forged identity/role, cross-patient delivery, unauthorized support join, client-originated announcements, malformed activity payloads, and expired-token disconnect.
- [ ] Prove the tests fail for the expected boundary violations.
- [ ] Implement optional handshake parsing followed by strict per-event enforcement and server-derived identity; anonymous sockets remain connected only in a no-domain-event quarantine until client migration is complete.
- [ ] Replace global staff/patient/support broadcasts with server-owned room emissions, including server-generated events outside `server.js`.
- [ ] Validate support session ownership/rollout access against the same database policy as HTTP; retain canonical community access checks.
- [ ] Remove the client `announcement:new` authority; only the persisted HTTP route may emit.
- [ ] Run focused realtime/auth/boundary tests and the established staff smoke suite.
- [ ] Commit the reviewed server boundary.

### Task 2: Realtime clients, request coalescing, and strict-auth cutover readiness

**Primary files:** staff/public realtime/support clients, patient/public Socket.IO clients, Android SocketManagers, `staff/backend/middleware/rateLimiter.js`, cache-version sources, focused tests.

**Consumes:** Task 1 handshake/error/room contract.

**Produces:** All legitimate clients send their existing JWT in `auth.token`; public queue/announcement pages use sanitized HTTP fallback where no JWT exists; coalesced responses preserve status/headers/body and never coalesce auth failures or mutations.

- [ ] Add failing tests for token-bearing staff/patient/Android connection options, cache-compatible fallbacks, and concurrent 401/500 response preservation.
- [ ] Prove the tests fail against the current clients/coalescer.
- [ ] Update every checked-in Socket.IO client; do not alter markup or visual flow. Disable the older Android socket path if it is not packaged.
- [ ] Preserve the public queue through its 30-second HTTP path and support chat through authenticated socket plus existing HTTP fallback.
- [ ] Make request coalescing replay the original status, safe headers, and body; restrict it to safe idempotent successful reads.
- [ ] Bump all required cache versions together and test stale-client fallback.
- [ ] Run focused tests, static check, staff smoke, and Android compile/test where the affected module is buildable locally.
- [ ] Commit the reviewed client/coalescing change.

**Wave 1 release gate (controller):** Fast-forward into local `main`, push, deploy client-compatible server mode, verify served assets, then during a maximum 15-minute maintenance window enable strict authentication. Rollback may disable strict rejection only to anonymous quarantine; it must never restore unscoped broadcasts or trusted payload identity.

---

## Wave 2 — Clinical Record Integrity

### Task 3: Versioned transactional medical-record service and secure APIs

**Primary files:** `staff/backend/routes/medical-records.js`, a focused service module, additive migrations, focused unit/integration tests.

**Produces:** `medical_records.version`; immutable revisions/tombstones; `POST` create with mandatory MR, version and ETag responses; `PATCH /api/medical-records/:id`; `POST /api/medical-records/:mrId/sections/:recordType/reset`; permission `medical_records.reset_section` for dokter+bidan.

- [ ] Add failing tests for role matrix, missing/wrong MR-patient scope, null-MR collateral, rollback on document failure, no emit before commit, concurrent first create, disjoint stale merge, overlapping conflict, deliberate clear, and missing rows.
- [ ] Prove baseline failures match the current overbroad/nontransactional behavior.
- [ ] Add only additive schema: integer version, immutable revision/tombstone records, reset permission and role grants. Do not drop or rewrite legacy rows.
- [ ] Implement one transactional service with visit-row then medical-row lock order. All audit/realtime effects occur after commit.
- [ ] `PATCH` accepts `If-Match` plus `{changes:[{path,before,after}]}`; stale disjoint paths merge, overlapping paths return `409`, missing precondition `428`, stale unmergeable base `412`.
- [ ] Reset accepts only `usg` or `resume_medis`, requires exact MR/patient/ETag, deletes matching document metadata atomically, and returns the existing `{success,message,deletedCount}` compatibility shape plus version metadata.
- [ ] Direct delete-by-ID returns `410`. The legacy by-type route becomes a permissioned exact-scope adapter with no null/patient-wide fallback.
- [ ] Preserve the separate superadmin full-visit delete unchanged.
- [ ] Run migration syntax/contract tests, focused clinical tests, and staff smoke.
- [ ] Commit the reviewed service/API/migration change.

### Task 4: Clinical callers and legacy-record reconciliation tooling

**Primary files:** Sunday Clinic USG/resume modules, legacy medical record client, COMM/Medify writer adapters, one dry-run/apply reconciliation script, focused tests.

**Consumes:** Task 3 API/service/version contract.

**Produces:** All active callers supply canonical MR and version; safe deterministic report/apply handling for the audited 3 non-conflicting and 21 conflicting null-MR records; no routine visit mutation touches null-MR legacy rows.

- [ ] Add failing caller-contract tests for MR, ETag/version, patch changes, reset scope, conflict draft preservation, and cached legacy adapter behavior.
- [ ] Update active USG, resume, generic medical, penunjang, COMM, and Medify callers without visual changes.
- [ ] Implement reconciliation tooling with mandatory dry-run, backup/checksum precondition, deterministic candidate manifest, and explicit apply confirmation. Backfill only non-conflicting candidates; snapshot conflicting rows immutably while leaving source rows untouched; ignore legacy `complete` rows.
- [ ] Add tests using fixtures matching the audited 3/21 categories; do not embed production patient identifiers.
- [ ] Run focused clinical suites, full integration suite, static check, and staff smoke.
- [ ] Commit the reviewed caller/reconciliation change.

**Wave 2 release gate (controller):** Take and verify a database backup, run reconciliation dry-run and compare only sanitized counts/hashes, deploy additive migration and code during a maximum 15-minute maintenance window, then verify permission/version/read-only paths. Destructive success is proven on a staging clone and later observed on the first legitimate production reset/save; until observed it is reported as pending, not claimed complete.

---

## Wave 3 — Invisible Performance and State Preservation

### Task 5: Stable bounded patient queries and cache correctness

**Primary files:** `staff/backend/services/PatientListService.js`, `staff/backend/routes/patients.js`, cache/coalescing helpers, focused tests.

**Produces:** Default limit 50, maximum 100, stable cursor bound to sort/filter, constant total count, `pagination.nextCursor`, and unique-patient advanced search before enrichment.

- [ ] Add failing service/route tests for cursor-before-ordering, null/equal sort keys, filter/sort mismatch, malformed cursor, unchanged totals, maximum limit, advanced-search deduplication, and enrichment failure not cached as success.
- [ ] Fix the basic service first; then migrate legacy route ordering/predicate construction to the same stable keyset semantics.
- [ ] Preserve the current response envelope and always return pagination with effective limit.
- [ ] Update internal all-record consumers to iterate cursors rather than request an unbounded list.
- [ ] Run focused query/coalescing tests, integration tests, and query-budget tests.
- [ ] Commit the reviewed backend performance change.

### Task 6: Nonvisual startup, navigation, polling, service-worker, and performance gates

**Primary files:** staff cache/bootstrap/page registry, patient menu shell, `public/sw.js`, performance script/workflow, focused browser/static tests.

**Produces:** Namespaced cache cleanup; parallel safe bootstrap; generation-guarded staff navigation; hidden-tab polling pause/resume; app-scoped atomic cache update; authenticated performance CI against the Staff Panel.

- [ ] Add failing behavior tests for storage preservation in both stores, out-of-order navigation, bootstrap dependency order, overlapping/hidden polling, cache isolation, atomic update, correct Staff URL, and missing-secret failure.
- [ ] Replace broad storage clears with an explicit cache-key registry while preserving auth, drafts, filters, and active context.
- [ ] Parallelize only independent patient reads after authentication/intake gates; keep nickname and birth-state dependencies intact.
- [ ] Add a navigation generation token at the staff UI commit point; coalesce same-page loads without changing markup.
- [ ] Add visibility and in-flight guards to polling; refresh once on return.
- [ ] Version static assets atomically, keep HTML/API no-store, delete only this app's caches, fix the service-worker message condition, and keep all three version sources synchronized.
- [ ] Pass performance credentials without command-line exposure; hard-fail missing CI secret; explicitly test cold, warm, and cached menu activation at the Staff route.
- [ ] Enforce warm load <=40 requests with zero failures and cached activation p95 <=1 second in the fixed fixture. Record sanitized RUM for later p75/p95 comparison without patient identifiers.
- [ ] Run visual snapshots with dynamic regions masked; require no structural desktop/PWA difference.
- [ ] Commit the reviewed frontend/performance change.

**Wave 3 release gate (controller):** Push/deploy atomically, verify live cache versions/assets and both desktop/PWA behavior, collect production RUM through one staffed session, and require p75 improvement >=25% with p95 regression <=5% before Wave 4.

---

## Wave 4 — Dependencies, CI, Restore, and Observability

### Task 7: Batched production dependency remediation

**Primary files:** root and backend manifests/locks plus compatibility tests.

**Produces:** Audited patched dependency graph without blind automated fixes.

- [ ] Capture `npm audit --omit=dev --json` and exact registry metadata before editing.
- [ ] Batch A: `adm-zip >=0.6.1`, `multer >=2.3.0`, `sharp 0.35.4`, and compatible Express/qs and Socket.IO parser patches; add/run ZIP, upload, image and socket tests.
- [ ] Batch B: first published stable versions satisfying `mysql2 >3.23.0` and `nodemailer >9.1.0`; if a fixed release is unavailable, leave the package unchanged, document the advisory, and keep the wave blocked rather than invent a version.
- [ ] Batch C: `firebase-admin 14.4.0` and `puppeteer 25.12.0`; remove unused Firebase Database compat only if static/runtime evidence proves messaging-only use; run push and Medify/PDF canaries.
- [ ] Run audit after each batch and the complete backend suite after the final batch.
- [ ] Commit each reviewed dependency batch separately.

### Task 8: Fail-closed operations, CI coverage, observability, and runbook

**Primary files:** restore/benchmark scripts, metrics/request-context/logger, CI workflows, deployment runbook, focused tests.

**Produces:** Reliable restore/backup exits, query-safe contextual logs, correct error counters, full CI gates, and current production documentation.

- [ ] Add failing executable tests for corrupt gzip, failed dump/import, checksum mismatch, benchmark backup failure, metric error counts, query redaction, request context, missing CI secret, and full workflow coverage.
- [ ] Restore uses `set -Eeuo pipefail`, validated absolute backup paths, `gzip -t`, checksum, explicit import status, and a staging restore drill. Benchmark/migration aborts before mutation when backup fails.
- [ ] Mount request context before logging, sanitize URLs/endpoint keys, count only real errors, label worker/restart, rotate logs, and keep sensitive data out of all telemetry.
- [ ] Expand CI to run static, staff smoke, all unit/integration suites, DocBoard build/test, production audit, browser smoke, and open-handle checks; no job may silently skip because a secret is absent.
- [ ] Update the runbook with current branch/database/PM2/VPS, backup/restore, four-wave rollback triggers, and live verification commands.
- [ ] Run shell/script tests, focused observability tests, static check, DocBoard build/test, full Jest suite, and audit.
- [ ] Commit the reviewed operations/CI/runbook change.

**Wave 4 release gate (controller):** Deploy dependency batches and operational changes in their reviewed order, verify health/database/PM2/served assets and integration canaries, run the staging restore drill, and monitor one staffed session. Roll back on two health failures, release-attributable PM2 restart, 5xx >1% for five minutes, auth errors >2% of sessions, any cross-user event, or any unauthorized clinical mutation.

---

## Final Acceptance

- Run static check, staff smoke, all unit and integration suites, DocBoard build/test, Android affected-module test/build, browser cold/warm/navigation budget, dependency audit, and a clean whole-branch security/code review.
- Confirm local branch, `origin/main`, production commit, PM2 app, health/database, and served asset versions agree after every wave.
- Record any unobserved legitimate production clinical success path as pending evidence; do not substitute HTTP 200, synthetic data, or local preview.

# Task 5 independent review — `bd2f54c0..91329d19`

Reviewed the approved Wave 3 plan, Task 5 brief, investigation, implementation report, full changed source and focused tests in the isolated worktree. No implementation code, production system, patient data, or remote endpoint was changed or accessed. The focused service, route, frontend-iterator, and query-budget suites passed (4 suites / 23 tests); `git diff --check` found no patch whitespace error. These are not real MariaDB or deployed-behavior results.

## Spec compliance

**FAIL.** The default legacy list does not apply its visibility, search, or cursor predicates to the outer patient rows. This breaks the required bounded all-record cursor traversal and makes the count and data envelopes disagree. The implementation correctly caps both views at 100, leaves total unseeked, binds cursor to filters/sort/limit, uses an ID tie-breaker, and returns a terminal cursor for the paths tested; those successes do not cover the default branch below.

### [P1] Default legacy `LEFT JOIN` absorbs outer filters and cursor seek

Location: `staff/backend/routes/patients.js:476-507,509-513,573-578`; helper `:80-81`.

The default query ends with `LEFT JOIN (...) latest_anamnesa ON p.id = latest_anamnesa.patient_id` at line 506. `appendVisiblePatientCondition(query)` at line 507 uses its default `hasOuterWhere=true` and appends `AND p.status = 'active' AND NOT EXISTS (...)`, **not** `WHERE ...`. The search clause and new cursor seek are also appended as `AND`, so they are conditions of the final LEFT JOIN rather than filters on `patients p`. A LEFT JOIN cannot remove unmatched outer patient rows: inactive/quarantined or search-mismatched patients remain in `data`, while the separately constructed count query correctly filters them. On an unfiltered list with more than 100 patients, a cursor request returns the same first page rather than seeking; `loadAllPatientPages` then detects the repeated cursor and fails, so the converted unfiltered tables/selectors cannot load the full collection. [High confidence] SQL clause placement is explicit in source. The visibility/search placement existed in the base commit, but Task 5's new default-branch cursor and all-record consumers make it a release-blocking defect in the required legacy predicate migration.

Concrete fix: construct an outer `WHERE` in the default branch (`appendVisiblePatientCondition(query, 'p', false)` or equivalent) before search and seek, then retain the static `ORDER BY ... LIMIT ?` and unseeked count. New RED test: use a real MariaDB fixture or SQL-aware route probe with >100 synthetic patients, an inactive/quarantined row and a search mismatch; prove page 2 differs from page 1 with no duplicate/missing IDs, only visible/search-matching rows are returned, and `pagination.total` equals the filtered set. The current cursor route tests cover only `no_visit` and `hospital`, both of which already have an outer `WHERE`.

## Code quality, security, and performance

**FAIL.** The new cursor expansion sends decodable patient names and IDs through request URLs, while existing access/performance/error logging still records the full URL. The touched advanced-search SQL uses bound parameters in correct SELECT-before-WHERE order and keeps MR/date filters co-referential to one visit; it selects one patient before `LIMIT` and fails closed on enrichment errors. The shared frontend loader does not return a partial array after a later-page failure. These checks do not neutralize the following privacy issue.

### [P2] Patient-name/ID cursor and search terms are retained in HTTP logs

Location: `staff/backend/services/PatientListCursor.js:25-29`, `staff/public/scripts/patient-list-pages.js:14-18`, `staff/backend/utils/requestAudit.js:7-23`, `staff/backend/middleware/requestLogger.js:39-46,101-118`.

For name sort, `encodeCursor` base64url-encodes the raw `full_name` and patient `id`; the all-record loader sends that token as a GET `cursor` query parameter. `safeAuditPath` does not recognize `GET /api/patients`, so `requestAuditUrl` returns `req.originalUrl`. Morgan's access log and the slow/error log paths therefore retain the full query string, including any `search` value and the decodable cursor. A synthetic local probe confirmed that a cursor containing `SYNTHETIC_PATIENT_NAME` decodes to that value, remains in `requestAuditUrl`, and has no safe audit path. This violates the approved plan's no patient-name/ID/query-payload logging rule. The prior route also accepted search queries and older cursors, but Task 5 deliberately expands cursor traffic to every converted all-record caller and must close this boundary before release. [High confidence] This follows directly from the encoder and logger code; no real name or ID was used.

Concrete fix: redact `/api/patients` query data at the logging boundary before access/performance/error logging (and verify external access logs at release), or make the cursor cryptographically opaque *and* redact raw search queries. Preserve a fixed route template and status/duration metrics without raw query values. New RED test: issue synthetic GETs with `search` and a name-sort cursor, then assert no logger output contains the sentinel name, patient ID, or raw token while normal status/duration telemetry remains.

## Review disposition

The report is intentionally not force-added or committed because findings remain. Staging MariaDB execution-plan and real browser traversal checks remain necessary after fixes; neither local green tests nor this review establish production performance or clinical correctness. No push or deployment was performed.

## Round 1 re-review — `91329d19..fc0a483f`

Reviewed the complete fix diff and current source/tests against the two findings above and the full Task 5 contract. Both findings are **ADDRESSED**; no new Critical or Important breakage was found.

- **Legacy outer-WHERE/cursor — ADDRESSED.** `staff/backend/routes/patients.js:506-507` now asks `appendVisiblePatientCondition` to create an outer `WHERE` after the final `LEFT JOIN`; subsequent search and seek `AND` predicates therefore filter patient rows. Parameter order remains location/hospital (when present), search, seek tuple, limit, then optional offset, matching SQL placeholder order in each branch. The count query remains unseeked and uses the same visibility/search filters. A new SQL-aware route test covers 103 synthetic visible rows, inactive/quarantined exclusions, page-two uniqueness, constant total, and search matching on the previously untested default branch. The already-tested `no_visit` and hospital branches retain their outer `WHERE` and stable sort tuple.
- **Cursor/log privacy — ADDRESSED.** `PatientListCursor.js:20-55` derives a domain-separated 32-byte key from the already mandatory `JWT_SECRET` with no fallback, uses a fresh 96-bit random IV per token, AES-256-GCM with fixed AAD and 128-bit tag, and rejects altered, malformed, old-version, or wrong-scope tokens. The process does not hold cursor state; a synthetic two-Node-process probe with the same secret decoded a cursor produced by the first process. `middleware/auth.js` already fails startup when `JWT_SECRET` is missing, and PM2 workers inherit the same environment. `utils/requestAudit.js:10-20,41-51` maps the list and advanced-search GET paths to fixed audit templates before access, metrics, performance and error loggers run. `server.js:238-243` uses the same audit URL for the native-app blocker. The tests assert query/name/ID/cursor sentinels are absent while route, status, and duration remain observable.

Focused verification from `staff/backend`: 6 suites / 31 tests passed (Task 5 service, route, iterator, audit privacy, request logger, and query-budget tests); `git diff --check 91329d19..fc0a483f` passed. Additional synthetic probes confirmed distinct tokens for identical input (fresh IV), wrong-key rejection, missing-secret failure, and v1-token rejection. The full Task 5 code scope was rechecked for bounded 50/100 limits, scope-bound cursor, null/equal-key seek, terminal `nextCursor`, one-row-per-patient advanced search with co-referential MR/date projection, enrichment fail-closed behavior, and the nine all-record conversions without partial publication. No real MariaDB staging, browser, Nginx access-log, or production check was possible or attempted; those remain controller release gates, not local code-review failures. A deliberate JWT secret rotation invalidates outstanding cursors with 400 and requires clients to restart pagination.

SPEC COMPLIANCE: **PASS** for the complete local Task 5 code scope after Round 1.

CODE QUALITY: **PASS** for the complete local Task 5 code scope after Round 1.

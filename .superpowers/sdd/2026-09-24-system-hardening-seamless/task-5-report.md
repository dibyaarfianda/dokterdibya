# Task 5 — bounded patient lists and cache correctness

## Boundary and result

Implemented only Task 5 in the isolated DOKTERDIBYA worktree on `codex/system-hardening-seamless`. `GET /api/patients` basic and legacy views now default to 50, cap at 100, use filter/sort/version-bound cursors and a stable ID tie-breaker (including null/equal sort keys), count before seek, and always return pagination with a terminal `nextCursor: null`. The legacy filtered latest-visit and anamnesa joins choose one deterministic row per patient. Advanced search selects one patient row in SQL before page limit and enrichment, caps the limit, preserves its existing envelope, and fails rather than silently caching incomplete enrichment. Its MR and visit-date filters remain co-referential to the same visit, and projected MR/email values match their filters.

The nine named first-party all-record loads across seven frontend files now use a shared cursor iterator with bounded 100-row pages. It publishes the combined result only after every page succeeds; existing table/selector structure is unchanged. Existing explicitly bounded 10-row searches were left alone. Cache diagnostics now expose a hash rather than raw patient search terms. No Task 6, dependency, visual/layout, migration, production, or patient-data changes were made.

## RED → GREEN evidence

Commands used `NODE_PATH=D:/DAF-PROJECT/DOKTERDIBYA/staff/backend/node_modules` and `node D:/DAF-PROJECT/DOKTERDIBYA/staff/backend/node_modules/jest/bin/jest.js --runInBand --forceExit --coverage=false` from `staff/backend` because local `npm` and this worktree's dependencies are unavailable.

- `tests/unit/PatientListService.test.js`: initial RED 5/5 for unbounded default/limit, permissive/mismatched cursor, seek-tainted count, null/equal keys, and terminal cursor; then GREEN 5/5. Additional explicit-empty-cursor assertion was RED 1/1 (`TypeError` instead of 400), then GREEN.
- `tests/integration/patients-wave4.test.js`: route/advanced additions were RED 5/8 initially (legacy bound/malformed/filter seek/enrichment behavior), then GREEN 8/8. Advanced-search duplicate-page and swallowed-enrichment assertions were separately RED 2/2, then GREEN 2/2. Same-visit MR/date projection assertion was RED 1/1 and is GREEN 1/1. The first-commit focused route suite had 12/12.
- `tests/unit/PatientListPages.test.js`: RED 2/2 for absent iterator and unconverted callers; GREEN 3/3, including a synthetic 101-row collection over two pages, later-page failure, repeated cursor rejection, and static inventory of all named files.

## Verification

- Focused Task 5 service, route, and frontend-iterator gate at the first commit: 3 suites / 20 tests passed. Later review-round results are appended below.
- Full `tests/integration`: 20 suites / 226 tests passed after the same-visit projection correction.
- Staff smoke (`StaffPanelWave1Hardening`, `StaffPanelWave2LazyShell`, `StaffApiClient`, `observabilityAuth`): 4 suites / 30 tests passed.
- `node scripts/staff-static-check.js`: passed, cache v412. `node --check` for all 11 changed implementation JavaScript files and `git diff --check`: passed; Git emitted only pre-existing LF/CRLF checkout warnings.
- Query-budget evidence: `PatientListService` test asserts count plus one page query and `LIMIT limit+1`, with no per-row medical query; route tests assert seek is only in the page query and before `ORDER BY`. The live `perf-budget-check.js` requires a target URL/token and browser, so it was not run against production or staging. A no-argument local attempt stopped before network access because this isolated worktree lacks `puppeteer`.

## Self-review and release limits

At the first commit, the cursor carried version/scope/sort keys/page, including a decodable patient name and ID on name sort. This privacy weakness and the default legacy outer-WHERE bug were found by independent review and corrected below. Scope includes effective limit and filters; count never includes seek; `nextCursor` is emitted only with a sentinel row; SQL projections do not multiply advanced-search patients; enrichment error leaves no successful cache entry; and the iterator does not expose a partial list. Current cache `short` tier retains its existing 300-second server TTL while response advertises client `max-age=60`; no cache-tier/global TTL change was authorized or needed for this task. Existing legacy page-number offset remains for callers explicitly using `page`, while cursor requests use keyset seek.

No real MariaDB/staging or browser against a running server was available locally. Validate actual SQL execution plans, collation/null ordering, and representative staff list behavior on the restored MariaDB staging clone before release. This task was not pushed or deployed by explicit controller instruction.

## Review round 1 correction — local only

The independent review found two release-blocking gaps in commit `91329d19`: default legacy `LEFT JOIN` absorbed visibility/search/seek into its final `ON` clause; and base64url cursors plus request logs exposed patient search/name/ID. Both findings were verified in the actual source before editing.

- P1 RED: `tests/integration/patients-wave4.test.js -t 'legacy default outer'` failed because a SQL-aware route double, modelling 103 visible rows plus inactive/quarantined rows, observed those rows in page one. GREEN after making the default branch append an outer `WHERE`: page one has 100 visible IDs, cursor page two has the remaining 3 without duplicates, `total` stays 103, and search finds only its 102 matching rows. The count query remains unseeked and the stable keyset predicate stays before `ORDER BY`.
- P2 RED: `PatientListService.test.js -t 'cursor is stateless'` exposed the synthetic name/ID by base64url decoding; `patientListAuditPrivacy.test.js -t 'patient list access'` showed raw search/cursor in `requestAuditUrl`. GREEN with a stateless AES-256-GCM v2 cursor authenticated and encrypted using a domain-separated key derived from the already-required `JWT_SECRET`; tampering or wrong scope is rejected. GET list audit paths are fixed templates. Access, metrics, slow/error logs keep fixed path and status/duration telemetry without query, cursor, user ID, or error payload. A separately verified native-app blocker log was RED for raw URL and GREEN with the same safe audit helper. Advanced-search query logging was likewise RED and then GREEN behind its fixed path.
- A pre-existing `requestLogger.test.js` expectation for raw `{url}` became RED when the privacy boundary returned `{path}`; the test was updated to assert duration/status and no query sentinel. Final focused review gate: 5 suites / 28 tests passed.
- After P1/P2, the full integration directory passed 21 suites / 230 tests, staff smoke passed 4 suites / 30, staff static and eight changed-JS syntax checks passed. A repository-wide Jest run remained baseline-red: 12 failed and 170 passed suites; 13 failed and 1,353 passed tests. The failures match prior unrelated baseline families (including `GambiranResumeArtifacts`, `SundayClinicClosingPaymentGuard`, staff visual/modularization contracts, and intermittent `sloAuth`); none is a changed Task 5 focused or full-integration test.

The cursor no longer discloses its sort keys by decoding, but the search query itself is still present in client URLs. Application access/performance/error/metrics logging now redacts those GET paths; external reverse-proxy access logging must be checked separately at the release gate. JWT secret rotation invalidates outstanding cursors, yielding a safe 400; no per-process cursor state or new schema/configuration is introduced. MariaDB staging and real browser traversal remain required before deployment. No push, deployment, production access, or real patient data was used.

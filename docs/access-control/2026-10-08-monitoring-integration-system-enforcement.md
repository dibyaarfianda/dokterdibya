# Monitoring, integration, and system account access evidence

Date: 2026-10-08 (Asia/Jakarta)

## Delivered behavior

- Account-mode Staff requests for analytics, dashboards, clinic monitoring, clinical AI, Assistant DAF, DocBoard, logs, medical import, patient-access operations, patient activity, patient demo, USG Reader, Medify integration, and system operations are authorized by the exact route permission before the handler runs.
- Read, write, sync, export, reset, and maintenance actions use separate grants. Access administration, doctor-account mutation, and emergency `system.reset` remain protected and cannot be delegated.
- Layout A is enabled after the complete Staff route inventory passed. The Medify navigation item is visible to protected doctors and accounts with `integrations.view`; sync and credential controls use `integrations.sync` and `integrations.write` respectively.
- Protected doctors keep full access. Active zero-grant Staff retain profile and Staff popup chat while direct monitoring/integration requests and operational Socket.IO events are denied.
- Task 11 changes no schema and does not switch any production account to account mode.

## Validation

- The focused and cross-group enforcement gate passed 14 suites and 315 tests. The integration gate passed 24 suites and 248 tests; the Staff smoke gate passed 4 suites and 36 tests.
- The final complete non-baseline run passed 229 suites and 2,081 tests. Eleven unrelated baseline suites remained excluded: eight stale size/snapshot/workflow contracts and three Assistant DAF suites whose environment lacks `@simplewebauthn/server`.
- JavaScript syntax checks passed for all changed scripts. Final Staff static validation passed with HTML 322,256 bytes, inline JavaScript 41,182 characters, and cache version `v431`; `git diff --check` passed.
- Live UI verification found an existing inline style that still hid Medify navigation. A regression test first failed, then the style was removed and cache version advanced to `v431`. The focused asset/sidebar/system rerun passed 4 suites and 95 tests.
- No patient, billing, integration, monitoring, or clinical record was created or changed. The only retained production write was the explicitly authorized Staff chat gate message.

## Production release

- Implementation commits `285cd774b458a9edd4ebe28d6c430d92880a4d84` and `7f7ef19ad414b94cae91792e1d0d8bab42c38343` were pushed to the feature branch and `main`, then deployed to the detached production checkout.
- Immutable Staff release `v431` contains 238 files and 8,981,364 bytes. Its manifest SHA-256 is `258d634aaa8fe0b41e3f3e3fc190522031c26cda770bae48625b0a95f3ddc214`. Both production origins served exact immutable `v430` and `v431` assets while current assets resolved to `v431`.
- `dibyaklinik-backend` remained online after controlled reload with restart count 17, zero unstable restarts, `wait_ready=true`, and a 330-second drain timeout. The local upstream and both production origins returned healthy database-connected responses.
- Production remained at 215 catalog permissions, 14 access policies, 1,282 grants, zero account-mode accounts, zero invitations, 12 active Staff, and two inactive Staff after the test fixture was restored. The root-only parity report records 12 migrated non-doctor accounts, two protected doctors, and zero unexplained differences.
- An authenticated protected-doctor Chromium session loaded `v431`, opened Layout A with 188 visible permission controls and a working Save button, opened the now-visible MEDIFY Sync page, retained the doctor badge and protected-account notice, and kept the chat button visible.
- Two authenticated polling-only clients loaded 100 chat messages plus presence. A temporarily activated pre-existing inactive Staff fixture was switched to account mode with zero grants, then its active flag, policy, access version, grants, and timestamps were restored exactly. Chat message `1309` was received exactly once by each client with the role badge intact; refreshed credentials reconnected over polling.
- The zero-grant fixture received `403 ACCESS_DENIED` from both monitoring and Medify endpoints. Two patient/billing Socket.IO emissions produced `ACCESS_DENIED`, and no patient or billing event reached either client.
- The exact five-minute Nginx release window contained 232 requests and zero 5xx responses. A first dense probe burst correctly reached the health endpoint's 200-request-per-minute limit and returned only `429` responses after the limit; the repeated two-origin gate used 350 ms spacing and passed 205 of 205 probes with zero failures.

## Rollback

- Application rollback restores commit `285cd774b458a9edd4ebe28d6c430d92880a4d84`, reloads `dibyaklinik-backend`, and restores current Staff assets to retained immutable release `v430`.
- Task 11 has no schema migration and production still has zero account-mode users, so rollback requires no access-policy or grant mutation.
- Immutable `v430` and `v431`, the Task 1 authorization backup, the Task 5 pre-migration backup, the root-only parity report, the chat-gate receipt, and the release-gate logs remain retained.

# Communication and content account access evidence

Date: 2026-10-08 (Asia/Jakarta)

## Delivered behavior

- Account-mode Staff requests for Tanya Dokter, announcements, Staff announcements, articles, patient stories, support chat, community chat, voting, birth classes, feedback, and notifications are authorized by the exact route permission before the handler runs.
- View, write, delete, publish, finalize, and moderation actions use separate grants where the catalog defines them. A delegated Tanya Dokter write/finalize grant intentionally supersedes the legacy assigned-doctor restriction, and patient notifications use the acting account name.
- Matching Staff controls are hidden or disabled when an account lacks the action permission. Legacy-mode behavior remains unchanged, and protected doctors retain full access.
- Community chat uses its own view/write/delete/moderate grants. The Staff popup chat, its payloads, role styling, presence, lazy loader, and `staff` room remain outside the permission matrix.

## Validation

- The Task 9 focused suite passed 33 tests, including exact mapping samples and dynamic allow/deny coverage for every mapped communication/content route.
- The related authorization, realtime, community-chat, and frontend gate passed 13 suites and 189 tests. The integration gate passed 24 suites and 248 tests; the Staff smoke gate passed 4 suites and 36 tests.
- The full unit run passed 204 suites and 1,809 tests. The only additional failure was the existing Socket.IO fixture timing once during the full run; its isolated rerun passed 3/3. The remaining eleven failures are the same stale size/snapshot/workflow contracts and three Assistant DAF suites missing `@simplewebauthn/server` recorded in Task 8.
- JavaScript syntax checks, Staff static validation, cache-version validation, structural snapshots, size gates, and `git diff --check` passed.
- No production patient, question, article, announcement, voting, class, feedback, billing, or clinical record was created or modified during verification. The only production write was the explicitly authorized Staff chat gate message.

## Production release

- Implementation commit `f27f65e562dab08e044de9bce4246fef06f225cb` was pushed to the feature branch and `main`, then fast-forwarded on the VPS from `8749c2c7447929b5962d1eca166aa7ce7e9bdb17`.
- Immutable Staff release `v428` contains 238 files and has manifest SHA-256 `6d35dfe025d9b2314aa53781477ec0fa3b7526c34de0a5f4bbf7ab28dc99f929`. Both production domains served exact immutable `v427` and `v428` assets, while current assets resolved to `v428`.
- `dibyaklinik-backend` remained online after its expected reload with restart count 13, zero unstable restarts, `wait_ready=true`, and a 330-second drain timeout. Both origins returned healthy database-connected responses; unauthenticated `/api/access/me` and `/api/auth/me` returned `401`.
- Production remains at 215 catalog permissions, 14 access policies, 1,282 grants, zero account-mode accounts, zero invitations, and 12 active Staff. The root-only Task 9 parity report records 12 migrated non-doctor accounts, two protected doctors, and zero unexplained differences.
- An authenticated protected-doctor Chromium session loaded `v428`; all affected pages opened, all ten read endpoints returned `200`, and expected write controls were available without page errors or HTTP 5xx responses. A legacy announcement content asset returned one non-API `403`; the application endpoints and release gate remained healthy.
- Two authenticated polling-only Staff clients each loaded 100 chat messages plus presence and retained the existing role/alignment styling. Chat gate message `1307` persisted once and rendered once in each client. Credential refresh established a new polling socket; no WebSocket request or clinical event was observed.
- The exact first five-minute Nginx release window contained 186 requests, zero 5xx responses, and a 0% server-error rate.

## Rollback

- Application rollback restores commit `8749c2c7447929b5962d1eca166aa7ce7e9bdb17`, reloads `dibyaklinik-backend`, and restores current Staff assets to retained immutable release `v427`.
- Task 9 has no schema migration. Production has zero account-mode users, so rollback requires no access-policy or grant mutation.
- Immutable `v427` and `v428`, the Task 1 authorization backup, the Task 5 pre-migration backup, and the root-only Task 9 parity report remain available.

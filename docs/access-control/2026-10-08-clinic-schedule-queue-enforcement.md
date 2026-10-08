# Clinic, schedule, and online-queue account access evidence

Date: 2026-10-08 (Asia/Jakarta)

## Delivered behavior

- Account-mode Staff requests for appointments, booking settings, practice schedules, hospital appointments, Sunday appointments, Sunday Clinic operations, and the online queue are authorized by exact route permissions before the route handler runs.
- Confirmation, cancellation, queue-patient resolution, clinic-record creation, synchronization, and bulk actions use their dedicated `write`, `delete`, `sync`, or `create` permissions. Legacy-mode Staff behavior remains unchanged, and protected doctors retain full access.
- The Staff UI hides or blocks matching account-mode create, update, delete, confirmation, synchronization, and clinic actions in Appointments, Kelola Jadwal, Pengaturan Booking, Antrian Online, and Klinik Privat.
- Permission changes are applied through the shared access snapshot. Realtime queue and appointment events remain in their permission rooms, while the matrix-exempt Staff chat and presence channel is unchanged.

## Validation

- The Task 8 focused suite passed 31 tests, including dynamic allow/deny checks for more than 51 mapped clinic, schedule, booking, and queue routes.
- The related authorization, realtime, and frontend gate passed 23 suites and 267 tests. Targeted regressions passed 3 suites and 49 tests after updating the affected middleware mocks.
- The integration gate passed 24 suites and 248 tests; the Staff smoke gate passed 4 suites and 36 tests.
- The full unit run passed 204 suites and 1,777 tests. The eleven excluded baseline suites are the same stale size/snapshot/workflow contracts and three Assistant DAF suites missing `@simplewebauthn/server` from the shared installation recorded in Task 6.
- JavaScript syntax checks, Staff static validation, cache-version validation, and `git diff --check` passed.
- No production patient, appointment, queue, billing, or clinical record was created or modified during verification.

## Production release

- Implementation commit `6fcd84bc1dc0ecf034227c1abef3c42a1a925cee` was pushed to the feature branch and `main`, then fast-forwarded on the VPS from `865c8917f5c5d3fa55dc7a7389366d9666da4863`.
- Immutable Staff release `v427` contains 238 files and has manifest SHA-256 `d0092d462a0b6cbe5a54fe16ae4fccbb2d5231ea4b334ad0658596dcc08571ca`. Both production domains served exact immutable `v426` and `v427` assets, while current assets resolved to `v427`.
- `dibyaklinik-backend` reloaded from the PM2 ecosystem file and remained online with `wait_ready=true`, a 330-second drain timeout, one expected restart, and zero unstable restarts.
- Both origins returned healthy database-connected responses. Unauthenticated `/api/access/me` and `/api/auth/me` returned `401` on both origins.
- Production remained at 14 Staff, 12 active Staff, 14 access policies, 1,282 grants, zero account-mode accounts, and zero invitations. The root-only parity report retained 215 catalog permissions, 12 migrated non-doctor accounts, two protected doctors, and zero unexplained differences.
- An authenticated protected-doctor Chrome session loaded `v427`; all five affected pages loaded their live content and expected write controls without page errors or HTTP 5xx responses. The same session loaded 100 chat messages over polling.
- Two authenticated polling-only Staff clients loaded chat history and presence. One explicit automated chat-gate message was persisted as message `1306` and received and rendered exactly once by each client; credential refresh created a new polling socket. The gate observed no patient, record, billing, queue, appointment, or document event.
- The first five-minute Nginx window contained 481 requests and zero 5xx responses but failed the strict coverage check because its first observation arrived 6.764 seconds after cutover. A controlled verification reload on the same commit and assets then completed 198 health probes without a failed probe; the exact five-minute gate observed 336 requests, zero 5xx responses, and a 0% server-error rate.

## Rollback

- Application rollback restores commit `865c8917f5c5d3fa55dc7a7389366d9666da4863`, reloads the PM2 ecosystem process, and restores current Staff assets to retained immutable release `v426`.
- Task 8 has no schema migration. Production has zero account-mode users, so rollback requires no access-policy or grant mutation.
- Immutable `v426` and `v427`, the Task 1 authorization backup, the Task 5 pre-migration backup, and the root-only Task 8 parity report remain available.

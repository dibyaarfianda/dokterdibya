# Patient and medical-record account access evidence

Date: 2026-10-08 (Asia/Jakarta)

## Delivered behavior

- Account-mode Staff requests for patient, patient-document, registration-code, visit, anamnesis, physical-exam, laboratory, USG, and medical-record routes are authorized by the exact route permission before the route handler runs.
- Nested `/api/sunday-clinic` and `/api/v1` routers are included in the runtime inventory. The shared Sunday Clinic section-write route resolves its permission from the requested section, so anamnesis, physical examination, USG, supporting examination, diagnosis, planning, and medical resume writes do not share a broad write grant.
- Legacy-mode Staff behavior remains unchanged. Protected doctors retain full access. Later rollout groups continue to use their existing guards until their dedicated task is released.
- Sensitive patient and record actions now accept an already-authorized account-mode grant: merge, bulk delete, reset, export, finalization, patient-document sharing/deletion, patient intake deletion, and surgery outcome mutation.
- The Staff UI hides or disables matching account-mode actions for patient maintenance, registration codes, medical-record sections, reset, export, finalization, document delivery, and WhatsApp sharing. Permission-change events reapply these controls to active sessions.
- The `visit:complete` realtime publisher now requires `medical_records.finalize`; patient and record receivers remain in their permission rooms. The matrix-exempt Staff chat and presence channel is unchanged.

## Validation

- The Task 7 focused suite passed 62 tests, including dynamic allow/deny checks for all 177 mapped Task 7 HTTP routes.
- The related authorization/realtime/frontend gate passed 23 suites and 339 tests.
- The Staff asset/browser gate passed 11 suites and 254 tests.
- Targeted regression coverage passed 4 suites and 83 tests after updating the affected behavior contracts.
- The complete non-baseline backend run passed 225 suites and 1,962 tests. The eleven excluded baseline suites are the same eight stale size/snapshot/workflow contracts and three Assistant DAF suites missing `@simplewebauthn/server` from the shared installation recorded in Task 6.
- JavaScript syntax checks, Staff static validation, cache-version validation, and `git diff --check` passed.
- No production patient or clinical record was created or modified during verification.

## Production release

- Implementation commit `21253324cdf8b91b24a975487db2e3c3754e5f4d` was pushed to the feature branch and `main`, then fast-forwarded on the VPS from `f2c5e0828b14078d9d681670a2c63f90a9e007d8`.
- Immutable Staff release `v426` contains 238 files. Its stored manifest was rebuilt and matched byte-for-byte; the retained `v425` manifest also matched its source commit. Both production domains served exact immutable `v425` and `v426` assets, while current assets resolved to `v426`.
- `dibyaklinik-backend` reloaded from the PM2 ecosystem file and remained online with `wait_ready=true`, a 330-second drain timeout, one expected restart, and zero unstable restarts. The PM2 error log was not modified after cutover.
- Both origins returned healthy database-connected responses. Unauthenticated `/api/access/me` and `/api/auth/me` returned `401` on both origins.
- Production remained at 14 Staff, 14 access policies, 1,282 grants, zero account-mode accounts, and zero invitations. The root-only parity report retained 215 catalog permissions, 12 migrated non-doctor accounts, two protected doctors, and zero unexplained differences.
- An authenticated live Chrome session loaded `v426`, the protected-doctor patient permissions, patient merge/bulk-delete controls, the live chat history, and a 640 by 428 pixel chat popup over polling with no critical browser errors.
- Two authenticated polling-only Staff clients loaded identity, effective access, chat history, and presence. One explicit automated chat-gate message was persisted as message `1305` and received exactly once by each client; its role identifier was present. Reconnect with a refreshed credential succeeded. The gate emitted no patient, record, or billing event.
- The five-minute Nginx gate observed 253 requests, zero 5xx responses, and a 0% server-error rate.

## Rollback

- Application rollback restores commit `f2c5e0828b14078d9d681670a2c63f90a9e007d8`, reloads the PM2 ecosystem process, and restores current Staff assets to retained immutable release `v425`.
- Task 7 has no schema migration. Production has zero account-mode users, so rollback requires no access-policy or grant mutation.
- Immutable `v425` and `v426`, the Task 1 authorization backup, the Task 5 pre-migration backup, and the root-only Task 7 parity report remain available.

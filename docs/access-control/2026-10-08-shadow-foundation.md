# Shadow-mode access foundation evidence

Date: 2026-10-08 (Asia/Jakarta)

## Release boundary

- Legacy `role_permissions` plus direct user grants remain the authoritative access decision.
- `AccessControlService` computes legacy and per-account results and logs sanitized differences.
- Doctor and superadmin accounts receive the full permission catalog in both modes.
- Existing Staff users are inserted into `user_access_policies` in `legacy` mode with access version 1.
- `verifyActiveStaff` is active on Staff login/identity verification paths. Global route enforcement remains scheduled for the deny-by-default phase.
- No Staff UI, navigation rule, Socket.IO room, chat event, or visible access has changed in this release.

## Migration validation

- Migration: `staff/backend/migrations/20261008_account_access_foundation.sql`
- Committed migration SHA-256: `fccad5a99e209aeb7e09baac283324ee0f39ac9439e3b3bc24b6557078a7d0fd`
- Applied twice to a temporary restored database to prove idempotence.
- Verified three new tables, fourteen initial Staff policy rows, two immutable audit triggers, and rejection of an audit update.
- Temporary validation database was dropped after the checks.
- The migration does not remove or modify the legacy authorization tables.

## Test evidence

- Foundation TDD: 10 tests passed after the expected red baseline.
- Focused auth/menu/medical-record/realtime/socket/chat/shell gate: 14 suites, 282 tests passed.
- Remaining backend suite after excluding twelve known baseline-only failures: 218 suites, 1,836 tests passed.
- The complete unfiltered run executed 230 suites. Twelve unrelated baseline suites failed: nine stale static/snapshot contracts and three Assistant DAF suites whose shared dependency installation lacks `@simplewebauthn/server`. None imports or covers the changed access-control files.
- Syntax checks passed for the service, middleware, and authentication route.

## Rollback

The verified root-only authorization backup from Task 1 remains at `/root/dokterdibya-access-backup-20261008T094607Z`. Rollback for this additive release is to return the application to the previous commit while retaining the new unused tables. No legacy authorization data needs to be restored unless an independent data change is detected.

## Production verification

- Implementation commit `03ebddd8e331f333a18a20250bde5a8211eb4f6b` and checksum correction `f8fb45e70823d41a82f2353c4bf3fbe2421862a1` were pushed to `main` and deployed.
- Production contains all three foundation tables, fourteen Staff policy rows, two audit immutability triggers, and zero account-mode users.
- Legacy counts remain unchanged: 283 role grants, 110 menu visibility rows, and zero direct user grants.
- PM2 reported `dibyaklinik-backend` online after restart and the public health route returned healthy.
- An active protected doctor identity returned `legacy` mode, access version 1, doctor protection, and all 87 catalog permissions through `/api/auth/me`.
- `/api/staff/verify` and read-only chat history succeeded. No chat message or clinical record was written.
- Current and immutable `v423` realtime, popup, and lazy-loader assets had matching hashes on both `dokterdibya.com` and `www.dokterdibya.com`.

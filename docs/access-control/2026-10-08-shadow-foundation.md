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
- Candidate SHA-256: `66ca769dbd6a7cc37e369b0172cd2806f42bdcad8ea34cad4b1321563fe4ea35`
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

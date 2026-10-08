# Account-mode default-deny evidence

Date: 2026-10-08 (Asia/Jakarta)

## Delivered behavior

- Every authenticated Staff API request now reloads canonical account state before routing. Inactive Staff receives `403 ACCOUNT_INACTIVE`.
- Protected doctors and users in `legacy` mode retain their established behavior. No existing production account was moved to account mode in this task.
- An account-mode request must match the Staff route registry. Unmapped routes return `403 ACCESS_DENIED`; named profile, activation, access-self, and Staff-chat exemptions remain available.
- Mapped routes require the account's effective permission from `user_permission_grants`, so direct API calls and hidden UI actions share the same server-side decision.
- `GET /api/access/me` is the canonical current-access endpoint. `/api/auth/me` now returns the same effective permissions and server-derived navigation for account-mode users.
- The Staff shell hydrates access before application startup. An active zero-grant account sees “Akses belum diberikan”, profile, logout, and the global chat popup without loading clinical modules.
- Private `access:changed` events refresh access immediately. Deactivation signs the session out; permission changes reapply navigation without disconnecting active Staff chat.

## Validation

- TDD baseline failed the new account-mode contracts before implementation.
- Focused auth, account-mode, realtime, and shell gate: 10 suites and 139 tests passed.
- Asset/browser gate: 11 suites and 207 tests passed.
- Relevant regression gate: 3 suites and 17 tests passed.
- Complete non-baseline backend run: 224 suites and 1,900 tests passed.
- Eleven unrelated baseline suites remain: eight stale size/snapshot/workflow contracts and three Assistant DAF suites whose shared installation lacks `@simplewebauthn/server`. This task fixed the previously stale Staff performance fixture, reducing the baseline-only count from twelve to eleven.
- JavaScript syntax checks, Staff static validation, and `git diff --check` passed.

## Production release

- Implementation commit `db26e831720c9c6bf7a38b980e9f5c81e0502169` was pushed to `main` and fast-forwarded on the VPS from `46cfcec5c5a45f6c5c757c2758404417f8b141cf`.
- Staff asset release `v425` was staged before checkout with a verified 238-file manifest. Current and immutable `v424`/`v425` authentication, realtime, and bootstrap assets matched on both production domains; the new account-access module matched the `v425` manifest and current asset bytes.
- `dibyaklinik-backend` reloaded from the PM2 ecosystem file and remained online in cluster mode with `wait_ready=true`, a 330-second drain timeout, and zero unstable restarts.
- Both production origins returned healthy database-connected responses. `/api/access/me` and `/api/auth/me` returned `401` without authentication rather than bypassing or returning an unmapped route.
- Production remains at 14 Staff, 14 policies, 1,282 grants, zero invitations, and zero account-mode users. The dry-run parity report retained 215 catalog permissions and zero unexplained differences.
- Two authenticated production Staff sessions completed polling-only handshakes, received authoritative presence lists, and read `/api/auth/me`, `/api/access/me`, and chat history. No chat message or clinical record was written.
- The first status-only observation contained 231 requests and zero 5xx, but correctly failed closed because its final sample was 8.1 seconds before the five-minute boundary. A controlled PM2 reload with continuous read-only health probes then passed the full five-minute gate with 192 requests, zero 5xx, and 0% error rate.
- The PM2 error log had no entry newer than the release, and its retained entries predated this deployment.

## Rollback

- Application rollback restores commit `46cfcec5c5a45f6c5c757c2758404417f8b141cf`, reloads the PM2 ecosystem process, and selects current asset `v424` while retaining immutable `v424` and `v425` snapshots.
- All existing production accounts remain in `legacy` mode, so rollback requires no grant mutation. The Task 1 authorization backup and Task 5 pre-migration backup remain retained.

# DOKTERDIBYA Granular Per-Account Access Implementation Plan

> **Execution:** Use `superpowers:executing-plans`, `superpowers:test-driven-development`, and `superpowers:verification-before-completion`. Implement inline, one task at a time. Every task must pass its gate, commit, push, deploy, and receive production verification before the next task starts.

**Goal:** Replace runtime role permissions and role visibility with one per-account permission matrix while protecting doctor access and preserving the Staff chat popup.

**Architecture:** `permissions` is the catalog and `user_permission_grants` is the only non-doctor runtime assignment. `user_access_policies` controls reversible legacy/account cutover and optimistic `access_version`. HTTP, `/auth/me`, navigation, and Socket.IO share `AccessControlService`. Doctors keep protected full access. Active Staff keep profile and chat access outside the matrix.

**Tech stack:** Node.js 22, Express, MySQL/MariaDB, Socket.IO polling-only, Jest/Supertest, vanilla Staff Panel JavaScript, immutable Staff asset releases, PM2/Nginx.

**Spec:** User-approved “Sistem Akses Granular Per Akun” plan in the task conversation dated 2026-10-08.

## Global Constraints

- Follow the approved plan exactly. Record a ruling before any necessary interpretation.
- No synthetic clinical writes in production.
- Keep Socket.IO polling-only, `window.__realtimeSyncState`, chat event names/payloads, presence, singleton behavior, and lazy loader stable.
- The `staff` room remains the chat/presence room; clinical and operational events use permission rooms.
- Access management, doctor mutation, and emergency recovery remain doctor-only.
- New accounts start with zero module permissions and may use only activation, profile, chat, and the no-access shell until grants are saved.
- Old authorization tables and verified backups remain available for rollback.
- Never log invitation tokens, passwords, patient identifiers, or clinical payloads.
- No `Co-Authored-By` commit trailers.
- Production starts at commit `756054572d191ddc52dcf9acc9bc7af647afb76e` with Staff assets `v423`; reverify before each deployment.

## Shared Interfaces

- `AccessControlService.getEffectiveAccess(userId)` returns account mode, access version, doctor protection, and a permission-name set.
- `verifyActiveStaff` reloads active state from the database for every protected HTTP request.
- `requireAccountPermission(...names)` is the shared runtime permission middleware and returns `403 ACCESS_DENIED`.
- `GET /api/access/me` and `/api/auth/me` use the same service output.
- `user_access_policies(user_id, mode, access_version, created_at, updated_at)`.
- `staff_access_invitations` stores only a SHA-256 token hash, 24-hour expiry, used/cancelled timestamps, actor, and target.
- `user_permission_audits` stores actor, target, version, before/after JSON, action, and timestamp.
- Access-control APIs use `409 ACCESS_VERSION_CONFLICT`, `403 ACCOUNT_INACTIVE`, and `410 INVITATION_EXPIRED` where specified.

## Task 1: Baseline, root-only backup, and restore drill

**Produces:** Sanitized baseline evidence, a root-only production dump with SHA-256 checksum, successful temporary-database restore evidence, and baseline auth/menu/realtime/chat results.

- [x] Record repository, production commit, PM2 state, health, Staff asset version, and old authorization schema/counts without exposing secrets or patient data.
- [x] Dump `users`, `roles`, `user_roles`, `permissions`, `role_permissions`, `role_visibility`, and `user_permission_grants` to a timestamped 0700/0600 root-only directory.
- [x] Write and verify SHA-256; restore into a temporary database; compare table row counts and schema presence; drop only the verified temporary database.
- [x] Run auth, role/menu, realtime, socket credential, Staff shell, and chat popup baseline suites.
- [x] Commit/push/deploy the baseline evidence and verify production remains healthy with `v423` current/versioned assets.

## Task 2: Shadow-mode access foundation

**Produces:** Additive schema, `AccessControlService`, `verifyActiveStaff`, shared permission evaluation, and shadow-difference logging while legacy decisions remain authoritative.

- [x] RED tests for schema contract, doctor full access, inactive JWT denial, account grant resolution, legacy resolution, and sanitized shadow differences.
- [x] Add migrations and services without changing user-visible access.
- [x] Use the service in HTTP helpers and `/auth/me` shadow computation; keep legacy decision official.
- [x] Run focused and full backend suites plus chat gate; commit/push/deploy/apply migration/verify.

## Task 3: Permission catalog, endpoint registry, and parity migration

**Produces:** Complete module/action catalog, route registry with named exemptions, migrated per-account grants, and a zero-unexplained-difference parity report.

- [x] RED tests that every Staff route is mapped or explicitly exempt and every UI menu/action resolves to catalog permissions.
- [x] Define `view`, `write`, `delete`, and named special actions for all Staff modules.
- [x] Add an idempotent migration/backfill that copies each non-doctor account’s effective legacy access into `user_permission_grants`.
- [x] Produce sanitized parity tooling and require zero unexplained differences before release.
- [x] Run full mapping/parity/chat gates; commit/push/deploy/apply migration/verify.

## Task 4: Realtime permission rooms with chat preservation

**Produces:** Permission-derived socket rooms, private access-version room, clinical-event room routing, and unchanged `staff` chat/presence behavior.

- [x] RED tests for two polling-only Staff clients, exactly-once chat, history, presence, reconnect, credential refresh, and zero-permission clinical isolation.
- [x] Join active Staff to `staff` plus `user:<id>` and current permission rooms derived by `AccessControlService`.
- [x] Move patient, record, billing, queue, and operational broadcasts from `staff` to named permission rooms.
- [x] Notify all active sessions through the private user room when access changes and refresh room membership without reconnecting chat.
- [x] Run full realtime/security/chat gate; commit/push/deploy/verify.

## Task 5: Kelola Akses UI and invitation lifecycle

**Produces:** Layout A account list/matrix, create/resend/deactivate controls, one-time email activation, audit history, and doctor-only access management.

- [x] RED API/UI tests for catalog/users/detail/save/status/invite/resend/validate/accept and all specified failure codes.
- [x] Implement doctor-only access-control APIs with optimistic versioning and doctor-account protection.
- [x] Store invitation hashes only, expire at 24 hours, place raw token in URL fragment, require strong password, and keep failed-email accounts pending with resend.
- [x] Replace Kelola Roles content with Kelola Akses layout A; role is an editable job label only.
- [x] Keep rollout flag disabled in production until Task 11; run UI/API/invitation/chat gates; commit/push/deploy/apply migration/verify.

## Task 6: Deny-by-default for new account-mode Staff

**Produces:** Account-mode default-deny boundary and a profile/chat/no-access shell for zero-grant Staff.

- [x] RED tests for unmapped endpoint denial, explicit exemptions, zero-grant shell, direct API denial, inactive account denial, and doctor bypass.
- [x] Enforce the registry for account-mode users while legacy users remain reversible.
- [x] Update frontend access hydration and navigation to use `/api/access/me` without changing chat availability.
- [x] Run auth/menu/direct-call/chat gates; commit/push/deploy/verify.

## Task 7: Enforce Pasien and Rekam Medis

**Produces:** View/write/delete/special enforcement for patient and medical-record HTTP/UI/realtime paths.

- [x] RED allow/deny tests for every mapped route and action, including export, reset, finalization, merge, and bulk delete.
- [x] Replace applicable role/menu guards with account permissions and hide/disable matching UI actions.
- [x] Verify no patient/record event leaks to zero-grant Staff.
- [x] Run clinical authorization, mapping, frontend, realtime, and chat gates; commit/push/deploy/verify without synthetic clinical writes.

## Task 8: Enforce Klinik, Jadwal, and Antrian Online

**Produces:** View/write/delete/special enforcement for clinic, schedule, booking, and online-queue paths.

- [ ] RED allow/deny tests for all mapped HTTP/UI/realtime actions, including confirmation, cancellation, synchronization, and bulk actions.
- [ ] Apply shared permission guards and UI visibility/action checks.
- [ ] Run focused, mapping, realtime, and chat gates; commit/push/deploy/verify without synthetic clinical writes.

## Task 9: Enforce Tanya Dokter, communications, and content

**Produces:** View/write/delete/publish enforcement for Tanya Dokter, announcements, articles, support/community communication, and content tools while Staff chat remains matrix-exempt.

- [ ] RED allow/deny tests for all mapped actions and explicit Staff-chat exemption.
- [ ] Apply guards and UI checks without changing chat payloads or rendering.
- [ ] Run communication/content, mapping, realtime, and chat gates; commit/push/deploy/verify.

## Task 10: Enforce Obat, tindakan, finance, and team

**Produces:** View/write/delete/special enforcement for medicine/equipment, procedures, billing/payment, payroll, points, briefing, and team operations.

- [ ] RED allow/deny tests for payment, export, reset, finalization, and bulk actions.
- [ ] Apply guards and UI checks; keep protected accounting safeguards intact.
- [ ] Verify billing/team events do not leak to zero-grant Staff.
- [ ] Run focused, mapping, realtime, and chat gates; commit/push/deploy/verify.

## Task 11: Enforce monitoring, integration, and system modules

**Produces:** View/write/delete/special enforcement for monitoring, external integrations, operational tools, and all remaining Staff routes; rollout flag becomes eligible.

- [ ] RED allow/deny tests for sync, reset, export, maintenance, and other sensitive actions.
- [ ] Eliminate all unmapped Staff routes except named profile/chat/activation/health exemptions.
- [ ] Enable Kelola Akses UI after the complete route and frontend inventory is green.
- [ ] Run full unit/integration/static/staff/realtime/chat suites; commit/push/deploy/verify.

## Task 12: Reversible cutover of existing accounts

**Produces:** Production account-mode cutover in order `front_office`, `admin`, `managerial`, `bidan`, with per-group rollback evidence.

- [ ] Add dry-run/apply/rollback tooling with sanitized counts and access-version audits.
- [ ] For each non-empty group: verify parity, switch to account mode, monitor unexpected 403/realtime/chat indicators, and prove rollback to legacy without changing grants.
- [ ] Stop on unexplained access failure, increased unexpected 403, or chat regression.
- [ ] Commit/push/deploy tooling first, then perform and verify each production group cutover.

## Task 13: Disable legacy runtime and remove old UI

**Produces:** Per-account-only runtime, retired legacy writes, compatibility read adapters for one asset cycle, preserved old tables/backups, and final verified release.

- [ ] RED tests proving no runtime authorization reads `role_visibility` or `role_permissions`, legacy writes return 410, and read adapters reflect account grants.
- [ ] Remove old role-permission/menu-visibility UI and runtime calls; keep role only as label/badge.
- [ ] Preserve all old tables, backup/checksum, restore procedure, and rollback documentation.
- [ ] Run complete backend/frontend/realtime/chat/invitation/cutover/rollback suites and final whole-branch review.
- [ ] Commit/push/deploy final release; verify PM2, health, migrations, current/versioned assets, live UI, parity, account-mode users, and chat without production clinical writes.

## Final Acceptance

- Every Staff endpoint is mapped or named exempt; CI fails new unmapped routes.
- Doctor remains full-access and protected; access management is doctor-only.
- Existing Staff effective access is preserved through migration and staged cutover.
- New Staff starts with zero module permissions; profile and chat remain available.
- Permission changes apply immediately to all active sessions using `access_version` notification.
- The old runtime/UI is disabled while old tables and verified backups remain retained.
- Production evidence includes PM2, health, database migrations, immutable current/versioned assets, UI, parity, rollback, and chat gates.

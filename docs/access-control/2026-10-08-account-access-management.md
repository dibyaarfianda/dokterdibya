# Per-account access management and invitation evidence

Date: 2026-10-08 (Asia/Jakarta)

## Delivered behavior

- Doctor-only APIs now expose the permission catalog, Staff account list/detail, optimistic permission saves, activation/deactivation, invitation creation/resend, and current-account access.
- Layout A is present as a left-hand account list and right-hand permission matrix with Read, Read/Edit, Delete, and Special Action columns. The rollout flag remains `false`, so production continues to display the existing Roles page until the complete enforcement inventory is ready in Task 11.
- Job labels are display-only values in `user_access_policies`. New accounts store `users.role = 'staff'`, no legacy `role_id`, account mode, and zero grants, so a job label cannot inherit legacy authorization.
- Doctor accounts, access management, doctor mutation, and emergency reset remain non-delegable.
- Permission/status writes require the current `access_version`, write before/after audit data, increment the version, and refresh every active socket session.

## Invitation boundary

- Invitation tokens use 32 random bytes and only their SHA-256 hashes are stored.
- The raw token is delivered only in the fragment of `/staff/public/activate-access.html`; the activation page immediately removes the fragment and sends the token only in a JSON request body.
- Invitations expire after 24 hours and reject invalid, cancelled, expired, or already-used tokens with stable codes.
- Acceptance requires at least 12 characters with lower case, upper case, digit, and symbol, then stores a bcrypt cost-12 hash.
- A failed email leaves the new account inactive and pending. Resend cancels outstanding tokens before creating a new one.
- New display-only `role='staff'` tokens remain valid Staff socket identities. Database-backed access resolution keeps zero-grant active accounts in polling chat/private rooms and out of every clinical permission room.

## Validation and review

- Focused access, auth, realtime, presence, chat, navigation, and polling gate: 8 suites and 128 tests passed.
- Immutable asset, service-worker, dependency-graph, navigation, and access gate: 9 suites and 297 tests passed.
- Complete backend run: 222 suites and 1,915 tests passed. The same twelve baseline suites remain unrelated: nine stale size/snapshot/workflow contracts and three Assistant DAF suites missing `@simplewebauthn/server` from the shared dependency installation.
- JavaScript syntax checks and `git diff --check` passed.
- Independent correctness/security review identified and then verified fixes for the public activation path and display-only Staff socket identity. The final review reported no remaining Critical or Important finding.
- A disposable MariaDB clone accepted the job-label migration and populated all 14 policies before production deployment.

## Production release

- Implementation commits `fa8fa4e8` and `97ee6bbd` were pushed to `main` and deployed at `/var/www/dokterdibya`.
- Staff asset release `v424` was staged immutably before checkout. Its 237-file manifest was verified, and current plus immutable `v423`/`v424` assets matched on both production domains. The new activation, matrix fragment, and matrix module matched their `v424` release hashes.
- The additive migration added `job_label` and `job_role_id`, populated 14 of 14 policies, and left counts unchanged at 14 Staff, 14 policies, 1,282 grants, and zero invitations. No account was moved to account mode.
- The production dry-run parity report retained 215 catalog permissions, 12 migrated non-doctor users, two protected doctors, 24 explained legacy surface conflicts, and zero unexplained differences.
- Public API probes returned `403 ACCESS_DENIED` for an invalid token, `400 WEAK_PASSWORD` before token lookup, and `401` for unauthenticated management/current-access reads. Staff, grant, and invitation counts were unchanged after probing.
- `dibyaklinik-backend` remained online in cluster mode. Health reported a connected database, and the PM2 error log had no entry newer than 2026-10-07.
- Two authenticated production Staff sessions completed polling-only handshakes and received authoritative presence lists. Chat history and access hydration succeeded read-only; zero chat or clinical records were written.
- Browser inspection confirmed the live activation page renders correctly and displays the invalid-link state without a token in the address bar.

## Backup and rollback

- The root-only pre-migration backup is `/root/backups/granular-access-task5-20261008T112835Z/access-control-pre-migration.sql.gz` with SHA-256 `6905df0bd08333599acb77faed49d2b52c8f65b685e1e1f966515c82381022ec`.
- Application rollback checks out the prior release and reloads the PM2 ecosystem process. All existing accounts remain in legacy mode, so the new grants and nullable job-label columns remain dormant.
- Keep immutable releases `v423` and `v424`, the Task 1 authorization backup, and the Task 5 pre-migration backup. No legacy table was removed.

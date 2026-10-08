# Legacy authorization runtime retirement evidence

Date: 2026-10-09 (Asia/Jakarta)

## Delivered behavior

- `user_permission_grants` is now the only runtime assignment source for every active non-doctor Staff account. A stored `legacy` policy value is retained for rollback metadata but no longer changes the current authorization decision.
- Protected doctor accounts continue to receive the full permission catalog. Role data is retained only as a job label and Staff chat badge.
- The shared HTTP boundary, permission middleware, menu compatibility middleware, `/api/access/me`, `/api/auth/me`, navigation, and Socket.IO all use the account decision. Direct role and menu guards can be delegated by the mapped account permission, except access administration, doctor-account changes, and emergency reset.
- Legacy role and visibility write endpoints return `410 LEGACY_ACCESS_DISABLED`. Legacy read endpoints remain read-only adapters over account grants for one Staff asset cycle.
- The old Roles/Users and role-visibility UI was removed. `Kelola Akses` Layout A is the only access-management UI, and Staff cache/release version is `v432`.
- `role_permissions`, `role_visibility`, `user_roles`, and every earlier backup remain intact. Offline parity and rollback tooling may still read them; production authorization runtime does not.

## Validation before release

- The Task 13 RED gate failed for the expected old-table reads, writable legacy endpoints, rollout-mode bypass, and old UI. The final focused retirement/foundation/default-deny gate passed 25 tests.
- The complete non-baseline regression gate passed 230 suites and 2,091 tests. The explicit integration gate passed 24 suites and 248 tests, and the Staff smoke gate passed four suites and 36 tests.
- Staff static validation passed with a 317,564-byte shell, 41,182 characters of inline JavaScript, and cache `v432`. Syntax checks passed for 14 changed JavaScript files, and `git diff --check` passed.
- A runtime-source scan found no `role_permissions` or `role_visibility` reference in services, middleware, routes, the security boundary, or `server.js`. Remaining references are confined to migrations, offline backfill/parity tooling, and test contracts.

## Backup and restore proof

- Before deployment, the ten authorization tables were dumped to `/root/backups/granular-access-task13-20261008T174935Z/legacy-runtime-pre.sql.gz` in a root-only `0700` directory with `0600` dump, checksum, and receipt files.
- SHA-256: `6711eaf723c2fd9224ee8a75ddbfcc847a95c134e186309264c6d65a3265a434`.
- The dump restored into a disposable database with exact row-count parity, then the disposable database was dropped. At backup time the preserved legacy tables contained 283 `role_permissions` and 110 `role_visibility` rows; the account system contained 1,175 grants, 14 policies, zero invitations, and 65 audit rows.

## Deployment and live verification

- Commit `600a8a472722223e5e2405e70d9ecaf26d4205a1` was pushed to the feature branch and `main`, then deployed to the detached production checkout.
- Immutable release `v432` contains 236 files and manifest SHA-256 `422fd13fab44999e81ac799ce7c92f0f7b7c8f22602295517b700c47f8a49c81`. Both Staff origins serve current `v432` and matching immutable `v431`/`v432` JavaScript. Retired current role-management assets return 404.
- PM2 is online with `wait_ready=true`, a 330-second drain timeout, restart count 26 after the final controlled reload, and zero unstable restarts. The local upstream and both production origins report healthy, database-connected responses.
- Production remains at 12 account-mode non-doctor Staff and two protected doctors with retained rollback mode. All 1,175 grants, 283 legacy role grants, and 110 legacy visibility rows remain unchanged. Final parity reports 215 catalog permissions, 12 migrated Staff, two protected doctors, one audited override, and zero unexplained differences.
- A protected doctor received all 215 permissions and `200` from identity, access catalog, role-read, visibility-read, and self-permission adapters. Four retired writes returned `410 LEGACY_ACCESS_DISABLED` without changing legacy tables or grants.
- A managerial account with two grants received `200` for access identity, auth identity, chat history, and its self-permission adapter, while direct access to the protected catalog and patient list returned `403 ACCESS_DENIED`.
- Two polling-only Staff clients loaded 100 chat messages and presence. Chat message `1311` reached each client exactly once with its role badge preserved; credential refresh reconnected successfully. Two unauthorized clinical emissions returned `ACCESS_DENIED`, and no patient or billing event reached either client.
- The authenticated protected-doctor UI loaded `v432`, showed Layout A with 14 accounts, and exposed 188 permission controls for a selected non-doctor account with exactly two selected grants. The Save control and global chat button remained visible; old role modals and labels were absent; the browser console had no error.
- No synthetic patient, medical-record, billing, invitation, or permission write was made in production. The only intentional live write was the approved Staff chat gate message.

- The final five-minute Nginx gate contained 354 requests, zero server errors, and a 0% 5xx rate. Its dedicated health probe completed 198 successes and zero failures. The final status-only snapshot contained no 403 response, and both public health endpoints still returned 200.

## Rollback

- Application rollback checks out `7db3a83449b8ee01a09413068d8747062f5df929`, reloads PM2 from `ecosystem.config.js`, and verifies health plus immutable `v431`. The first guarded cutover exercised this rollback automatically after a transient one-shot asset mismatch; production returned healthy before the successful retry.
- To restore role-based decisions, keep that older release active, then use the Task 12 cutover CLI in reverse order: rollback `bidan`, followed by `managerial`. The command changes only policy mode/version and audits; the 1,175 account grants remain available for re-cutover.
- For database recovery, verify the Task 13 checksum, restore the root-only dump, reload the older application release, and repeat health, identity, parity, and chat gates. Task 1, Task 5, and Task 12 verified backups remain retained as earlier recovery points.

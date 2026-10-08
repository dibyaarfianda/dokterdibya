# Reversible production account cutover evidence

Date: 2026-10-09 (Asia/Jakarta)

## Delivered behavior

- Existing non-doctor Staff were cut over in the approved order: empty `front_office`, empty `admin`, 11 `managerial`, then one `bidan` account. The two protected doctor accounts remain in `legacy` mode with full protected access.
- The cutover command supports dry-run, apply, and rollback. It validates the selected role against a fresh parity report, locks the target policy rows, increments `access_version`, writes immutable audits, and rejects stale parity snapshots, protected doctor targets, grant changes, and out-of-order operations.
- The latest immutable `permissions_updated` audit is the source of truth for an intentionally edited account. This preserves manual per-account choices while unaudited grant drift still fails parity.
- `front_office` and `admin` contained no accounts and produced zero-account dry-run reports without audit writes.

## Validation

- TDD covered CLI argument validation, forward/reverse ordering, dry-run, apply, rollback, immutable audit writes, grant fingerprints, protected doctors, stale parity reports, and empty roles. The focused gate passed 14 tests.
- The complete non-baseline gate passed 229 suites and 2,086 tests. The explicit integration gate passed 22 suites and 242 tests, and the Staff smoke gate passed four suites and 36 tests. JavaScript syntax and `git diff --check` passed.
- An initial production dry-run stopped with 111 differences. Five immutable `permissions_updated` audits on one account explained those current choices. After parity learned that audited override, the report recorded one audited override and zero unexplained differences. No grant was replaced or expanded.
- Final parity: 215 catalog permissions, 12 migrated non-doctor accounts, two protected doctors, 1,175 current grants, and zero missing, unexpected, or unexplained grants. Managerial has 1,092 grants across 11 accounts; bidan has 83 grants.

## Production cutover and rollback proof

- Tooling commits `1bcbb9efa88ff1d4877d6cd6f0ba159d279ec2ca`, `89dbc40f27be266f0fbcc73908e0a8c4549d7b9e`, and `f4941d48597f32042c8e3d19e46165be53cec2ec` were pushed to the feature branch and `main`, then deployed to the detached production checkout.
- A root-only pre-cutover dump at `/root/backups/granular-access-task12-20261008T170642Z/account-cutover-pre.sql.gz` has SHA-256 `bd8caaa1797519341cbf51aa705cccbfa3cede8939445759a2cc7e64790c5b82`. Its ten authorization tables restored into a disposable database with exact row counts; the dump, checksum, and restore receipt remain mode `0600`.
- Managerial apply, rollback, and reapply each retained grant fingerprint `3b3598512bab729cdb39ceae0d620586b3565ef8d02d97d609d0ccf1e1cc6c4d`. Bidan apply, rollback, and reapply each retained fingerprint `6c2c4c78f0e12bda06b19569c949d84ae240d233d5af375d8b7880aaaea0def0`.
- The final state has 12 account-mode non-doctor Staff and two legacy-mode protected doctors. The 36 transition audits consist of 24 `account_cutover` and 12 `account_cutover_rollback` rows. All 1,175 grants remained unchanged throughout the transition.
- The legacy tables remain intact at 283 `role_permissions` rows and 110 `role_visibility` rows. No invitation exists, active/inactive Staff counts remain 12/2, and no clinical or billing record was written.

## Live verification

- PM2 remained online with `wait_ready=true`, a 330-second drain timeout, restart count 23 after the six controlled transition reloads, and zero unstable restarts. The local upstream and both production origins returned healthy, database-connected responses.
- Account-mode read gates returned `200` for `/api/access/me`, `/api/auth/me`, and Staff chat history. The intentionally limited managerial account returned exactly its two current grants. Doctor-only access administration returned `403 ACCESS_DENIED`; a protected doctor retained all 215 permissions and `200` access to the catalog.
- Two polling-only clients loaded 100 chat messages and presence. Chat message `1310` reached each client exactly once with the role badge preserved; a refreshed credential reconnected. Two unauthorized patient/billing emissions returned `ACCESS_DENIED`, and neither clinical event reached either client.
- The authenticated protected-doctor UI loaded Layout A with 14 accounts, 73 matrix rows, 188 visible permission controls, a visible Save button, protected-doctor messaging, and the Staff chat button. No browser error occurred after the final cutover.
- Current and immutable `v430`/`v431` realtime and access-management assets matched on both Staff origins. The final five-minute Nginx window contained 379 requests and zero 5xx responses; its 198 health probes all succeeded. The window contained no 403 response.

## Rollback

- Runtime rollback uses the same deployed CLI in reverse order: rollback `bidan`, then `managerial`, reload `dibyaklinik-backend`, and repeat identity/chat/health gates. The production rollback drill proved this path before both groups were reapplied.
- If policy/audit recovery is required, restore the verified root-only Task 12 dump. The older Task 1 and Task 5 backups remain retained. Grant restoration is unnecessary for ordinary mode rollback because the tool never mutates `user_permission_grants`.

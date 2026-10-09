# Manager account access restoration evidence

Date: 2026-10-09 (Asia/Jakarta)

Confidence: High. The conclusion is based on the immutable migration and permission-update audits, the live assignment tables, authenticated production API checks, and a two-client production chat gate.

## Restored behavior

- One active managerial account had been intentionally reduced from its migration baseline of 109 grants to two grants. The account is identified in operational evidence only by subject hash `a8453dc96a1f`.
- Its exact `catalog_migration_grants` snapshot was restored. The assignment moved from two grants at access version 9 to 109 grants at access version 10.
- All eleven managerial accounts now have the same 109-grant fingerprint as the pre-edit manager baseline.
- The account status and job label were not changed. Protected doctor accounts were not changed.
- `role_permissions` and `role_visibility` remain retained rollback data and were not reactivated or modified.

## Audit and rollback

- The restore wrote one immutable `permissions_updated` audit with a two-grant before-state and a 109-grant after-state.
- The standard editor intentionally hides internal compatibility grants and derives navigation grants. An unchanged editor save would normalize two legacy navigation differences, so this recovery used one locked, version-checked transaction to restore the historical snapshot exactly. Runtime authorization still reads only `user_permission_grants`.
- A root-only snapshot and receipt are stored at `/root/backups/manager-access-restore-20261009T113837Z` with directory mode `0700` and file mode `0600`.
- `before.json` SHA-256 is `5eaff42014ef538e5b9c17a29b4a13b15934702b38b91c545afb76f020d203aa`; checksum verification passed after the restore.
- The same directory contains `rollback.cjs`. Running `NODE_PATH=/var/www/dokterdibya/staff/backend/node_modules node rollback.cjs` performs a read-only dry-run. The verified dry-run found access version 10, 109 current grants, the original two-grant snapshot, no protected-account target, no stale version, and reported `ready: true`.
- An authorized reversal uses the same command with `--apply`. It locks and rechecks the account version, active status, doctor protection, job label, and current 109-grant fingerprint; restores the two original grants; increments `access_version`; writes a compensating immutable audit; reloads PM2 to refresh sessions; and requires healthy backend, two effective grants, working Staff chat, and `403 ACCESS_DENIED` from the patient list before it writes `rollback-receipt.json`.
- `SHA256SUMS` covers both `before.json` and `rollback.cjs`; the complete checksum set passed. The rollback dry-run receipt is retained as `rollback-dry-run.json` with mode `0600`.

## Production verification

- The effective access endpoint returned all 109 grants. `/api/auth/me`, Staff chat history, and a read-only patient-list request each returned `200` for the restored account.
- The management detail endpoint returned 94 editable grants; the remaining 15 internal grants are intentionally hidden from the matrix while still participating in effective access.
- Production contains 1,282 account grants and 66 access audits. The retained legacy tables remain unchanged at 283 role-permission rows and 110 visibility rows.
- PM2 was reloaded once so existing sessions reconnect against access version 10. The backend remained online with zero unstable restarts, and both local and public health checks reported a connected database.
- Two authenticated production clients connected using polling only, loaded chat history and presence, and received chat gate message `1312` exactly once each. The Manager role badge identifier was preserved, a refreshed credential connected successfully, and zero WebSocket requests occurred.
- The verification emitted no patient, medical-record, billing, or other clinical event. The only production content write was the planned Staff chat gate message.

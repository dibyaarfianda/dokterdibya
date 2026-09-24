# Legacy medical-record reconciliation (Wave 2 release gate)

This tool is not a deploy step. Use it only in the approved maintenance window, after the additive `20260924_medical_record_versions.sql` migration, a full verified backup, and a successful restored-MariaDB staging drill. A local deterministic test pass does not prove InnoDB behavior. Do not run it on production until the controller opens the Wave 2 gate.

From `staff/backend`, with database environment configured and an output directory **outside every Git repository/worktree**:

```sh
npm run reconcile:legacy-medical-records -- \
  --backup /secure/backup/dibyaklinik.sql.gz \
  --backup-sha256 EXPECTED_BACKUP_SHA256 \
  --manifest /secure/private/legacy-manifest.json \
  --receipt /secure/public/legacy-dry-run-receipt.json
```

Dry-run is the default. It verifies the backup checksum, nonempty file and gzip integrity before opening a database connection. It hard-stops unless the runtime set matches the audited counts and hashes (3 safe, 21 conflicts, 834 ignored `complete`, 3,800 documents). It writes an atomic canonical private manifest with mode `0600`; if that mode cannot be enforced, it stops. It prints and optionally writes only the sanitized public receipt. Do not paste or commit the private manifest, patient identifiers, document paths, or SQL row output. Retain the private file and its printed `manifestSha256` securely for apply.

After independently reviewing the sanitized receipt against `legacy-manifest-audit-task-4.md`, apply with the *exact same* backup and private manifest:

```sh
npm run reconcile:legacy-medical-records -- \
  --apply \
  --backup /secure/backup/dibyaklinik.sql.gz \
  --backup-sha256 EXPECTED_BACKUP_SHA256 \
  --manifest /secure/private/legacy-manifest.json \
  --confirm-manifest-sha256 EXACT_DRY_RUN_MANIFEST_SHA256 \
  --confirm APPLY_LEGACY_MEDICAL_RECORDS \
  --receipt /secure/public/legacy-apply-receipt.json
```

Apply takes a nonblocking named advisory lock and one `REPEATABLE READ` transaction. It locks selected visit rows by PK, then source/target medical rows by PK, then document rows; it rechecks the locked preconditions. The three safe rows receive only canonical MR/version metadata changes plus immutable `legacy_backfill` revisions. The 21 conflicts receive immutable `legacy_conflict_snapshot` revisions without medical-row changes. `complete` rows, document metadata and R2 objects are never intentionally changed. Every mismatch rolls back. A rerun of the same confirmed manifest verifies the post-state and revisions without reapplying; a different manifest aborts. The public receipt contains no raw identifiers.

After staging apply, verify the revision receipt (3 backfills, 21 conflict snapshots), complete/document hashes, exact medical-row changes, append-only guards, and a legitimate versioned save/reset on the restored clone. Production execution and deployed behavior require separate recorded evidence; do not infer them from this runbook or synthetic tests.

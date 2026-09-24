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

Apply takes a nonblocking named advisory lock and one `REPEATABLE READ` transaction. After checking both tables use InnoDB, its **first transactional reads** scan and lock the full `sunday_clinic_records` PRIMARY-index population, then the full `medical_records` PRIMARY-index population, both `FOR UPDATE`. Only then does it establish the consistent read view, recompute the complete nearest-visit/source classification and audited hashes, lock/recheck selected rows and full document metadata, and mutate. The full scans are intended to hold next-key/supremum-gap locks against inserted closer visits or null-MR medical rows until commit/rollback; verify that behavior on the restored MariaDB version before any production run. The maintenance procedure must quiesce PM2 and all other clinical writers for the short transaction; the advisory lock alone does not exclude ordinary application writes. The three safe rows receive only canonical MR/version metadata changes plus immutable `legacy_backfill` revisions. The 21 conflicts receive immutable `legacy_conflict_snapshot` revisions without medical-row changes. `complete` rows, document metadata and R2 objects are never intentionally changed. Every mismatch rolls back. A rerun of the same confirmed manifest verifies the post-state and revisions without reapplying; a different manifest aborts. The public receipt contains no raw identifiers.

Before the release gate, use two connections against the restored MariaDB staging clone with synthetic, removable fixtures and a pause hook/breakpoint immediately before the first population lock. On connection B, insert (separately) a closer same-patient Sunday visit and a new null-MR non-`complete` medical row before connection A acquires the relevant lock; resume A and require a drift abort with zero revisions/backfills. Then pause A after the corresponding full locking scan, attempt each insert from B with a short lock-wait timeout, and verify B blocks/times out until A commits or rolls back. Repeat for an occupied `(mr_id, record_type)` target, document metadata drift, CAS failure, exact visit-before-medical-before-document lock order, same-manifest rerun, complete/document invariants, and backup restore. Record `EXPLAIN`/index and engine evidence on this exact MariaDB version. Do not infer any of this from the deterministic local double.

After staging apply, verify the revision receipt (3 backfills, 21 conflict snapshots), complete/document hashes, exact medical-row changes, append-only guards, and a legitimate versioned save/reset on the restored clone. Production execution and deployed behavior require separate recorded evidence; do not infer them from this runbook or synthetic tests.

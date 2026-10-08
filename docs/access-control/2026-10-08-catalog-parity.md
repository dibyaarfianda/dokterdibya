# Per-account permission catalog and parity evidence

Date: 2026-10-08 (Asia/Jakarta)

## Route and navigation inventory

- The static registry inventories 794 route declarations from the active backend route tree.
- 533 declarations resolve to a named permission.
- 261 declarations resolve to a named exception: 152 patient, 47 public, 31 integration-key, 8 activation, 5 identity, 5 legacy adapter, 3 Staff chat, 3 payment webhook, 2 profile, 2 emergency recovery, 2 telemetry, and 1 CI OIDC route.
- CI executes the inventory test. A new literal route declaration without a permission or named exception fails the suite.
- All legacy menu keys and all Staff shell navigation IDs resolve to the same catalog.

## Catalog model

- The catalog contains 215 permissions: the existing 87 names, new module and sensitive-action permissions, and 19 internal navigation permissions.
- Sensitive actions include payment, export, reset, synchronization, finalization, merge, bulk delete, and publish.
- Access management, doctor-account protection, Assistant DAF ownership, patient access recovery, and emergency system recovery remain protected.
- Navigation permissions are internal dependencies. They preserve legacy menu visibility independently from HTTP authorization and will not be presented as ordinary action checkboxes.

## Restored-database migration drill

The root-only Task 1 dump was restored to an isolated temporary database. The foundation migration was applied, then the catalog/backfill tool was run as dry-run, apply, and a second apply.

- Dry-run identified 1,282 required non-doctor grants.
- Both apply reports were byte-identical.
- Result: 215 catalog rows, 1,282 account grants, 178 internal navigation grants, and 24 immutable migration audit rows.
- Twelve non-doctor accounts were migrated; two protected doctor accounts were skipped and received zero grants.
- All policies remained in `legacy` mode.
- Missing grants: 0. Unexpected grants: 0. Unexplained differences: 0.
- The temporary database and its temporary application-user grant were removed after verification.

## Resolved legacy surface conflicts

The old system contained 24 account-level conflicts across four role/menu combinations. A single module permission could not preserve both the old menu and endpoint result. Internal navigation grants model both results exactly:

- One bidan: Bulk USG menu visible while the corresponding create permission was absent.
- One bidan: Obat/Alkes menu hidden while the view permission was present.
- Eleven managerial accounts: Kelola Pasien menu hidden while the view permission was present.
- Eleven managerial accounts: Keuangan menu hidden while the finance-analysis view permission was present.

The backfill preserves each menu result in `navigation.*` and each API result in its module permission. This removes the future runtime dependency on `role_visibility` without silently expanding or revoking either surface.

## Evidence retention and rollback

Sanitized dry-run and parity reports are stored with mode `0600` under `/root/dokterdibya-access-backup-20261008T094607Z`. They contain role-level counts and hashes only. The verified authorization dump and checksum remain unchanged. During shadow mode, application rollback only requires restoring the previous commit; additive catalog rows, per-account grants, and immutable audits can remain dormant because all accounts still use `legacy` mode.

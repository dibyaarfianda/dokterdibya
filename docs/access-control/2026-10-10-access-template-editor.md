# Access Template Editor Release Evidence

Date: 2026-10-10 (Asia/Jakarta)

## Delivered behavior

- `Kelola Akses > Template Jabatan` exposes five fixed templates: Owner, Koordinator, Farmasi, Staff, and Observer.
- `Simpan Template` persists the selected template for future use without changing grants on existing accounts.
- `Terapkan ke Semua Akun` requires an explicit confirmation and applies the saved template atomically only to eligible non-doctor Staff accounts assigned to that template.
- New invitations resolve their grants from the latest persisted template before activation.
- Runtime authorization remains account-scoped in `user_permission_grants`; the template tables are reusable definitions, not an alternate authorization source.
- Mandatory DRD permissions remain checked and locked, and doctor/superadmin access remains protected.

## Validation evidence

The regression tests were written and observed failing against the baseline before implementation. The final focused gate passed 7 suites and 125 tests:

- `StaffCompactSidebar.test.js`
- `staffPanelStabilization.test.js`
- `StaffPwaMobileBaselineRestore.test.js`
- `AccessTemplateEditorBrowser.test.js`
- `AccessControlManagement.test.js`
- `AccessTemplateEditor.test.js`
- `Task6StructuralSnapshot.test.js`

The Staff static checker passed with a 318,799-byte HTML shell, 41,591-character inline script, and synchronized cache version `v441`. JavaScript syntax checks also passed.

The complete backend run executed 250 suites / 2,188 tests. It passed 243 suites / 2,181 tests and retained these seven unrelated baseline failures; none touches this release's access-control, Staff fragment, or template service paths:

1. `Task6PerformanceGate`: synthetic cold run recorded zero aborted requests.
2. `WebHardeningPlan`: existing patient PWA manifest version mismatch.
3. `FrontendModularizationStage2Wave3`: existing patient landing cache mismatch.
4. `FrontendModularizationStage2Wave6`: existing patient shell size is 172,743 bytes against a 172,000-byte threshold.
5. `Task6PatientBootstrap`: existing `showPendingPatientPopup` expectation.
6. `docboardUsers`: existing stale cache-version expectation.
7. `Wave3WorkflowCoverage`: existing workflow YAML indentation-regex mismatch.

The complete feature diff was reviewed against the approved specification. No Critical or Important discrepancy remained.

## Database migration and backup

- Migration: `staff/backend/migrations/20261010_access_template_editor.sql`.
- The migration was first applied twice to a disposable MariaDB schema to prove idempotence. It created three tables, five templates, and two immutable-audit triggers; a test update against the audit table was rejected.
- Production backup: `/root/backups/access-template-editor-20261010T163730Z/access-control-pre.sql.gz`.
- Backup SHA-256: `f2a47e5707a023600d7d0595767208ae08b9d86fc88b4c01870123fa6ff839c0`.
- The backup was restored into a disposable schema and exact row-count parity was verified before production migration.
- Production migration result: five templates, zero customized templates, zero template permission rows, zero template audit rows, and 12 explicit non-doctor account-template memberships.
- Existing runtime permissions were not changed by migration: `user_permission_grants` stayed at 871 rows and `user_permission_audits` stayed at 105 rows.

## Deployment evidence

- Runtime source commit: `23111621a448d48f06d5dd9201cb52d97c578381`.
- Immutable Staff release: `v441`.
- Release manifest SHA-256: `6d8602d9b8bbebdf4a1a3929c1065806954bd3e1902af08d3501b8d9ec925064`.
- Production checkout was fast-forwarded and is clean for tracked files.
- PM2 process `dibyaklinik-backend` is online after the controlled reload, with restart count 10 and zero unstable restarts.
- Both `https://dokterdibya.com` and `https://www.dokterdibya.com` report healthy application and connected database status.
- Both origins serve the current `v441` Staff script bytes. The immutable `v440` and `v441` copies remain distinct and validated; current matches `v441` exactly.
- Staff HTML and service worker are served with `no-store` and both expose `v441`.
- The current access-control fragment on both origins contains the Template Jabatan editor and apply-all control.
- Unauthenticated catalog requests return HTTP 401 on both origins.
- A fresh five-minute Nginx status window passed with 188 observations, zero 5xx responses, and a 0% server-error rate. Two older status logs containing incomplete legacy lines were retained, not deleted, in the root-only backup `/var/backups/dokterdibya/access-template-nginx-status-20261010T164500Z` before the clean observation window.

## Live UI verification

An authenticated doctor session opened `Sistem > Kelola Akses > Template Jabatan` in the production browser without saving or applying any permission changes. The visible production UI showed:

- both `Akun Staff` and `Template Jabatan` views;
- five template options;
- template version 1;
- 188 visible permission checkboxes, including 23 disabled mandatory controls;
- `Simpan Template` and `Terapkan ke Semua Akun` actions; and
- no browser console errors.

## Rollback boundary

If rollback is required, restore the previous application revision through the established fast-forward/rollback process, keep immutable Staff releases `v440` and `v441`, reload PM2, and re-run both-origin asset and health verification. The additive template tables may remain unused safely. Restore the verified database backup only if a data rollback is explicitly required; it predates the migration and is protected root-only.

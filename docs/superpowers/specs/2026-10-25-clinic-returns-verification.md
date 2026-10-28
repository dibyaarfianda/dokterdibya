# Clinic returns verification — 2026-10-25

- Scope: Retur / Pengembalian below additional billing; paid main/additional invoices, medicine FIFO/legacy stock restoration, cash/transfer recording, immutable source documents, net totals and negative current-day closing entries.
- Focused validation: 40 suites / 290 tests passed. Syntax, Staff static checks and git diff whitespace checks passed.
- Isolated MariaDB QA using production table structures: migration, concurrent duplicate requests, stock batches and legacy stock, over-return rejection, foreign invoice rejection, audit-failure rollback, additional-invoice refunds, net totals, closing snapshot and readback after closing all passed. No clinical writes; disposable QA database removed. Reusable check: `node staff/backend/scripts/verify-clinic-returns-isolated.js` on the VPS (requires local root MySQL socket).
- Codex internal-browser simulation: original Rp100,000, medicine return 3 x Rp10,000, then cash return Rp20,000 => net Rp50,000. Both history rows rendered below Tagihan Tambahan.
- Full suite initially: 271 / 293 suites passed; 2483 / 2577 assertions passed. Two affected test fixtures were updated for the new routes/return source and pass in the focused rerun. Remaining failures below are outside this feature.

## Reproduced on unchanged HEAD 49ee7f937

- MedifyClinicalCutover.test.js
- Task6PatientBootstrap.test.js
- FrontendModularizationStage2Wave6.test.js
- Wave3WorkflowCoverage.test.js
- PublicPolls.test.js
- staffPanelStabilization.test.js
- AccessControlCatalogRegistry.test.js
- WebHardeningPlan.test.js
- Task6ServiceWorker.test.js
- StaffAssetDependencyGraph.test.js
- FrontendModularizationStage2Wave3.test.js

## Missing local Chromium runtime

- Task6PerformanceGate.test.js
- StaffAssetModulePropagation.test.js
- StaffCompactSidebar.test.js
- StaffPerformanceFixture.test.js
- visualStructureFixture.test.js
- Task6StructuralSnapshot.test.js
- Task6VisualBaseline.test.js
- PatientBirthDateWheelNavigation.test.js
- AccessTemplateEditorBrowser.test.js

Browser UI checks for this feature used the required Codex internal browser.

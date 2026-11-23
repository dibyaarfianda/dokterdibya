# Pengeluaran Obat RS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Copy the Medify Melinda drug usage report into the clinic DB every night and show it on a doctor-only Staff Panel page.

**Architecture:** A cron CLI uses the existing `MedifyHttpSession` to fetch one xlsx per depot per month, validates it, and replaces that month and depot in one transaction. The page and Excel export read only the clinic DB.

**Tech Stack:** Node/Express, MariaDB, ExcelJS, AdminLTE staff shell, Jest on the VPS.

**Spec:** `docs/superpowers/specs/2026-11-23-melinda-drug-usage-sync-design.md`

## Global Constraints

- Only `GET /farmasi/{depot}/laporan/pengeluaran-obat` may be called after login.
- Depots: `depo-rawat-jalan`, `depo-rawat-inap`, `depo-ruang-bayi`, `depo-vk`, `depo-ok`, `depo-aster`, `depo-icu`, `depo-hcu`.
- One request at a time, 4000 ms apart. Stop after a response over 30000 ms or on any error.
- Tables come only from the migration. No patient fields anywhere.
- Page copy says "Nilai Laporan", never receipt value. Permission: `integrations.view`.
- Dates use local components, never `toISOString`. Staff assets go to `v509`.

## Review Focus

- Medify session expires and returns an HTML login page with status 200: reject it, keep stored data.
- Medify changes the sheet layout or a total stops matching: reject it, keep stored data.
- A depot with no usage (zero rows, zero total) is valid and clears that month and depot.
- A drug without a code, or the same name twice in one report: key by normalized name and sum.
- The run starts on day 1 to 5, or twice at once: refresh the previous month, and the second run exits.

---

### Task 1: Report parser

**Files:** Create `staff/backend/services/MelindaDrugUsageReport.js`, test `staff/backend/tests/unit/MelindaDrugUsageReport.test.js`.

**Interfaces (produces):** `DEPOTS` (`[{ code, name }]`), `classifyItem(name) -> 'obat'|'alkes'`, `parseDrugUsageReport(buffer) -> Promise<{ items, totals }>`, `DrugUsageReportError`. Item: `{ itemKey, code, name, itemType, qty, value, inacbgQty, inacbgValue, hari23Qty, hari23Value, dukQty, dukValue }`.

- [ ] Write tests: valid sheet, comma-formatted numbers, missing code, duplicate name summed, empty depot, HTML buffer rejected, changed header rejected, missing total rejected, quantity mismatch rejected, value within rounding accepted, value beyond it rejected, keyword classification.
- [ ] Run them and confirm failure. Implement with ExcelJS. Value tolerance is `max(10, ceil(lines * 0.5))`.
- [ ] Run them and confirm they pass. Commit.

### Task 2: Migration, fetch and sync job

**Files:** Create `staff/backend/migrations/20261126_melinda_drug_usage.sql`, `staff/backend/services/MelindaDrugUsageSync.js`, `staff/backend/scripts/melinda-drug-usage-sync.js`, test `staff/backend/tests/unit/MelindaDrugUsageSync.test.js`. Modify `staff/backend/services/medifyHttpService.js`.

**Interfaces:** `session.fetchDrugUsageReport(depot, fromDmy, toDmy) -> { status, buffer, contentType, ms }`; `periodsForNight(date)`, `periodsBetween(from, to)`, `monthRange(period, today)`, `createMelindaDrugUsageSync({ pool, createSession, parse, sleep, now }) -> { run({ periods }) }`.

- [ ] Write tests: night periods on day 5 and 6, January rollover, current month capped to today, 4000 ms spacing, stop on invalid report with earlier data kept, stop after slow response, lock already held, replace in one transaction.
- [ ] Run them and confirm failure. Implement. CLI flags: `--from YYYY-MM --to YYYY-MM`; exit 1 unless the run succeeded.
- [ ] Run them and confirm they pass. Commit.

### Task 3: Read API and Excel export

**Files:** Create `staff/backend/services/MelindaDrugUsageQuery.js`, `staff/backend/routes/melinda-drug-usage.js`, test `staff/backend/tests/unit/MelindaDrugUsageRoutes.test.js`. Modify `staff/backend/server.js`, `config/accessControlRegistry.js`, `config/menu-activity-sources.js`.

**Interfaces:** `GET /api/melinda-drug-usage?period&depot&type` returns `{ success, data: { periods, filters, totals, items, freshness } }`. `GET /api/melinda-drug-usage/export` with the same query returns xlsx.

- [ ] Write tests: invalid filter gets 400, all-depot rows are aggregated, freshness warning for a failed or 36-hour-old run, workbook headers use "Nilai Laporan", the route requires `integrations.view`.
- [ ] Run them and confirm failure. Implement. Run and confirm pass. Commit.

### Task 4: Staff page

**Files:** Create `staff/public/fragments/pages/melinda-drug-usage-page.html`, `staff/public/scripts/pages/melinda-drug-usage-page.js`, test `staff/backend/tests/unit/MelindaDrugUsagePageShell.test.js`. Modify `index-adminlte.html`, `sw.js`, `scripts/main.js`, `scripts/shell/{page-descriptors,feature-loader,bootstrap}.js`.

**Interfaces:** `window.showMelindaDrugUsagePage`, `melindaDrugUsageLoad`, `melindaDrugUsageExport`.

- [ ] Write the shell test: sidebar `nav-melinda-drug-usage` after MEDIFY Sync, container, descriptor, loader, shim, resume entry, escaping, no `vh`, no `toISOString`, version `v509`.
- [ ] Run it and confirm failure. Implement. Run and confirm pass. Check in the browser harness. Commit.

### Task 5: Release

- [ ] Run the related suites and compare the full suite against `main`.
- [ ] Open and merge the PR. Stage `v509`, run the migration, fast-forward production, reload the backend.
- [ ] Backfill `--from 2026-10 --to 2026-11`, compare totals with Rp121.100.930, add the 02:00 WIB cron, verify the page live.

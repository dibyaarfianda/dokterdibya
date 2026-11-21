# Withdrawal "Sedang ditransfer" Status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `processing` status to withdrawal requests so a patient cannot cancel while staff are transferring.

**Architecture:** One new ENUM value plus two columns on `patient_credit_refund_requests`; the hold helper in `PatientCreditLedger` counts `pending` and `processing`; `PatientRefundRequestService` gains `startRequest` and accepts `processing` in complete/reject; one new staff route; the staff Pencairan tab and the portal Saldo Saya page show the new state.

**Tech Stack:** Node/Express + mysql2, jest (run on the VPS), vanilla JS pages.

**Spec:** `docs/superpowers/specs/2026-11-21-withdrawal-processing-status-design.md`

## Global Constraints

- Statuses: `pending`, `processing`, `done`, `rejected`, `cancelled`. Open = `pending` or `processing`.
- Lock order everywhere: `lockLiveBalances(patient)` → request row FOR UPDATE → writes.
- Account numbers never in logs, activity log or broadcasts (use `maskAccount`).
- Messages (verbatim):
  - patient cancel while processing: `Pengajuan ini sedang ditransfer oleh klinik dan tidak dapat dibatalkan. Hubungi klinik bila ada yang perlu diubah.`
  - start when already processing: `Pengajuan ini sudah mulai ditransfer oleh <name>.` (`<name>` = `processing_by`, or `staf lain` when empty)
  - start when cancelled: `Pasien sudah membatalkan pengajuan ini. Jangan transfer.`
- Route: `POST /api/staff-prepay/refund-requests/:id/start`, permission `billing.reset` (explicit override in the access registry).
- Versions: staff `v498` → `v499`, patient `20261122paket1` → `20261122paket2`, `saldo-saya.js?v=20261121saldo1` → `?v=20261122saldo2`.

## Review Focus

1. Patient cancels at the same moment staff press "Mulai transfer": exactly one wins; the other gets a clear 409, never both.
2. Mark-paid of a bill while a request is `processing`: the held amount is not spent.
3. Two staff press "Mulai transfer": the second is refused and told who started.
4. A cached v498 staff page presses "Sudah ditransfer" on a `pending` request: still records the refund once.
5. Running the migration twice on production MySQL leaves the column definitions unchanged.

---

### Task 1: Backend status, route and tests

**Files:**
- Create: `staff/backend/migrations/20261122_refund_request_processing.sql`
- Modify: `staff/backend/services/PatientCreditLedger.js` (`getPendingRefundRequests`)
- Modify: `staff/backend/services/PatientRefundRequestService.js`
- Modify: `staff/backend/routes/staff-prepay.js`, `staff/backend/config/accessControlRegistry.js`
- Modify: `staff/backend/scripts/verify-checkup-prepay-usage-isolated.js`
- Test: `staff/backend/tests/unit/PatientRefundRequestService.test.js`, `StaffPrepayRoutes.test.js`, `CheckupPrepayContract.test.js`

**Interfaces:**
- Produces: `startRequest({ id, actor }) -> { id, status: 'processing', processing_by, processing_at }`; staff list rows gain `processing_by`, `processing_at`; patient rows gain `processing_at`.

- [ ] **Step 1: Write the failing tests**
  - migration contract: file contains `ENUM('pending','done','rejected','cancelled','processing')` (appended at the end: existing rows keep their index and MySQL needs no table copy; ruling made during implementation), `ADD COLUMN IF NOT EXISTS processing_by VARCHAR(64)`, `ADD COLUMN IF NOT EXISTS processing_at TIMESTAMP NULL`, no INSERT.
  - `getPendingRefundHold` counts `processing` rows; SQL ends `status IN ('pending','processing') ORDER BY id FOR UPDATE`.
  - `startRequest`: pending → processing with `processing_by` 'Kasir', saldo lock before request lock, activity log masked; second start → 409 with `sudah mulai ditransfer oleh Kasir`; cancelled → 409 `Jangan transfer`; done/rejected → 409 `sudah ditutup`; 404 for unknown id.
  - `cancelRequest` on processing → 409 with the processing message, status unchanged, hold unchanged.
  - `completeRequest` on processing → done, one refund; on pending still works.
  - `rejectRequest` on processing → rejected, hold released.
  - `createRequest` while one is processing → 409.
  - `listForStaff` puts pending and processing (oldest first) before closed.
  - route `/refund-requests/:id/start` needs billing.reset, passes the actor, 404 on a malformed id; registry override maps it to billing.reset.

- [ ] **Step 2: Run them on the VPS and watch them fail**
  Run: `vps-jest3.sh PatientRefundRequestService StaffPrepayRoutes CheckupPrepayContract`
  Expected: the new tests FAIL (no `startRequest`, no route, no migration).

- [ ] **Step 3: Implement**
  - Migration: `MODIFY COLUMN status ENUM('pending','done','rejected','cancelled','processing') NOT NULL DEFAULT 'pending'`, then `ADD COLUMN IF NOT EXISTS` for both columns after `status`.
  - Ledger: `status IN ('pending','processing')`.
  - Service: `closeRequest` takes the allowed from-statuses (cancel: pending only; done/rejected: pending or processing); `startRequest` as specified; REQUEST_COLUMNS add the two columns; staff list open-first SQL.
  - Route + registry override.
  - QA script: apply the new migration; check 14: start → cancel refused → hold kept → complete from processing.

- [ ] **Step 4: Run the tests and watch them pass**
  Expected: PASS, no new failures in the touched suites.

- [ ] **Step 5: Commit**

### Task 2: Staff tab, patient page and versions

**Files:**
- Modify: `staff/public/scripts/pages/prepay-page.js`
- Modify: `public/scripts/saldo-saya.js`, `public/saldo-saya.html`
- Modify: the 19 version files (same set as commit a03b5d711)
- Test: `PrepayPageShell.test.js`, `SaldoSayaPage.test.js`, `SaldoSayaPageBehavior.test.js`

- [ ] **Step 1: Write the failing tests**
  - staff module contains `Mulai transfer`, `/start`, exports `prepayStartRefundRequest`; processing badge text `Sedang ditransfer`.
  - Saldo Saya labels `Menunggu`, `Sedang ditransfer`; behaviour: a processing request shows the note and NO Batalkan button; a pending request keeps Batalkan.
- [ ] **Step 2: Run them and watch them fail**
- [ ] **Step 3: Implement** (staff: pending → "Mulai transfer" + "Tolak", processing → "Sudah ditransfer" + "Tolak", buttons disabled while a call runs; patient: labels, note, cancel only for pending), then bump versions.
- [ ] **Step 4: Run the touched suites plus the version-consistency suites; watch them pass**
- [ ] **Step 5: Browser check** in the local harness: staff tab both states; Saldo Saya both states at 375 px.
- [ ] **Step 6: Commit**

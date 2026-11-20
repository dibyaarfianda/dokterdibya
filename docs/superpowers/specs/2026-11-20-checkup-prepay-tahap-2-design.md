# Bayar di muka, Tahap 2: staff visibility and automatic saldo deduction

Status: design, approved approach 1 (2026-11-20). Not built.
Builds on: `2026-11-18-checkup-prepay-duitku-review-design.md` (Tahap 1, live in sandbox since 2026-11-20).

## Why

Tahap 1 lets a patient prepay the estimated cost of one Klinik Privat visit through Duitku (VA/QRIS). The money becomes saldo in `patient_credit_ledger`. Two things are missing before the clinic can take real money (`CHECKUP_PREPAY_LIVE=true`):

1. **Staff cannot see it.** The VA number and the paid status appear only on the patient page (`/bayar-estimasi.html`). The panel has no menu, no notification and no saldo view. Boss asked: how will staff know a VA payment succeeded, and where does it appear in the clinic pages?
2. **Saldo is never used.** The cashier still collects the full bill, so a prepaying patient would pay twice.

Payment confirmation itself is already automatic: Duitku calls back, `PremiumPaymentService.applyPaidOrder` marks the order paid and credits the ledger. Staff never need to match a VA number by hand; they need to be told and to see it.

## Decisions (Boss)

- **Any category, any bill (rule A).** All of a patient's `live` saldo, whatever its category, may pay any Klinik Privat main bill of that patient. The category stays on each ledger row as a report label only. This replaces the Tahap 1 idea of matching categories, for deduction only.
- **Automatic deduction.** The saldo is taken when the cashier marks the bill paid. There is no "do not use saldo" option.
- **Closing on the visit date (A).** A bill stays counted in full on its visit (accounting) date, as today. Closing adds the part paid from saldo so the cashier knows how much cash or transfer to expect. Prepay receipts, Duitku fees, unused saldo and saldo refunds are shown on the new staff page, not in Klinik Privat closing.
- **Returns go back to saldo.** A retur on a main bill paid with saldo puts the money back into the patient's saldo, up to the part that came from saldo. Only anything above that part is paid out in cash or transfer, as today.
  - The split is my reading of the decision; see section 6.
- **No WhatsApp, no Xendit.** The clinic uses neither. Notifications stay inside the staff panel. Xendit code is not changed.
- **Approach 1** (below): the ledger is the only record of saldo use; the bill tables are not changed.

## Goals

1. Staff see every prepay order (paid, pending, expired) with patient, product, amount, Duitku fee, method and VA number, and every patient's saldo with its history.
2. Staff with billing access are told in the panel when a prepay order is paid (red dot on the new menu plus a toast).
3. On a confirmed Klinik Privat main bill, the cashier sees the saldo that will be deducted and the amount still to collect. Marking it paid deducts that saldo in the same database transaction as the paid status.
4. Closing shows, per day, how much of the paid bills came from saldo.
5. Staff record saldo refunds (after handing the money over), like billing returns. A retur on a bill paid with saldo credits the saldo back.
6. Boss edits the estimate mapping (which tindakan make up each product) in the panel instead of the CLI.

## Non-goals

- Any Xendit change. If "Bayar Online" is ever used, the patient pays the full bill through Xendit and the saldo stays untouched, so nothing is charged twice. *(my call: no guard needed)*
- WhatsApp or push notifications.
- Deduction from additional bills (`sunday_clinic_additional_billings`). Only main bills. *(my call, to keep scope small; leftover saldo stays for the next visit)*
- Changes to the patient bill page (`patient-billing.html`). The patient sees the saldo drop on `/bayar-estimasi.html` and on the printed invoice. *(my call)*
- Automatic money transfer for refunds. Refunds are manual; the system only records them.
- Turning on `CHECKUP_PREPAY_LIVE`. That is a separate go-live step (see the end).

## Anti-goals (failure even if it "works")

- Sandbox saldo reducing a real bill.
- The cashier collecting a different amount from what the server deducted.
- An already closed day changing its numbers (`POST_CLOSE_SOURCE_CHANGED`).
- A bill whose `total` no longer equals the sum of its items (closing `BILLING_TOTAL_MISMATCH`).
- Saldo going negative, or the same saldo paying two bills.

## Constraints found in the code

- `sunday_clinic_billings` has no discount, deposit or amount-paid field. `total = subtotal = SUM(items)` and every writer recomputes it. Saves replace all items.
- The cash/transfer method of a main bill is never stored. `mark-paid` ignores `payment_method` except in the audit text. The cashier UI does not send it.
- **A paid main bill is terminal.** It cannot be edited (`postBillingByMrId` returns 400), cancelled (`billing-cancellation.js` only cancels `draft`/`confirmed`), or moved back by revisions or change approval (both skip `paid`). So one bill uses saldo at most once and the use never has to be undone, except by deletion (below).
- Deletion: `records.js deleteRecordsByMrId` (superadmin, `?force=true` for finalized records) and `patientDeletion.js` hard-delete bills.
- `mark-paid` (`services/sunday-clinic/billing.js` `postBillingByMrIdMarkPaid`):
  - holds `GET_LOCK('sunday_mark_paid_<billingId>')`;
  - takes the bill row `FOR UPDATE` in `lockConnection`;
  - deducts stock FIFO on separate connections (idempotent on retry);
  - then `UPDATE ... status='paid'` and commits.
  - The route already blocks closed accounting dates (`requireOpenAccountingDate`).
  - After the commit it runs: audit, record finalize, the `billing_paid` broadcast, queue `lunas`, and the activity log.
- Closing (`SundayClinicClosingService.js`):
  - builds `sources`/`transactions` per bill;
  - `summary.grand_total = main + additional - returns`;
  - fingerprints the sources with SHA-256. Adding a key to old sources would change closed days, so new keys are added only when non-zero.
- The invoice PDF is regenerated on every print (`postBillingByMrIdPrintInvoice` → `pdfGenerator.generateInvoice(billing, patient, meta)`).
- `patient_credit_ledger`:
  - signed `amount_idr`, `gateway_mode`;
  - `UNIQUE (source_type, source_id, entry_type)`;
  - `source_id VARCHAR(64)`;
  - index `(patient_id, category, created_at)`.
  - New tables only through migrations (`StaffPanelWave6StartupSchema.test.js`).

## Approaches considered

1. **Ledger only, bills unchanged (chosen).** Mark-paid writes `usage` rows into `patient_credit_ledger` inside its transaction. Cashier view, invoice and closing read the usage rows through one shared helper; the amount due is computed as `total - used`.
   - Pros: no bill schema change, totals keep meaning "sum of items", closed days keep their fingerprint.
   - Cons: every reader of "amount due" must use the helper.
2. **New columns on the bill** (`prepaid_amount`, `amount_due`).
   - Pros: readers get the number directly.
   - Cons: every total-recomputing writer must keep them in sync, and drift between bill and ledger becomes possible. Higher closing risk.
3. **Negative bill item.** Rejected:
   - the `item_type` ENUM has no such value;
   - the PDF drops unknown types;
   - the closing total check would break;
   - full-replace saves would erase it.

## Design

### 1. Ledger rules (`services/PatientCreditLedger.js`)

| entry_type | sign | source_type | source_id | written by |
|---|---|---|---|---|
| `prepay` (exists) | + | `payment_order` | order id | Duitku fulfiller |
| `usage` | − | `sunday_clinic_billing` | `<billingId>:<category>` | mark-paid |
| `return_credit` | + | `sunday_clinic_return` | `<returnId>:<category>` | billing retur |
| `refund` | − | `credit_refund` | `<refundId>:<category>` | staff refund |

**Only `gateway_mode = 'live'` rows are ever read for deduction or refund.** Sandbox rows stay visible on the staff page with a "Uji (sandbox)" label.

New functions:

- **`lockLiveBalances(connection, patientId)`**
  - `SELECT ... FROM patient_credit_ledger WHERE patient_id = ? AND gateway_mode = 'live' FOR UPDATE`;
  - returns the balance per category plus the oldest positive `created_at` per category.
  - Both mark-paid and refund call it first, so two concurrent uses of one patient's saldo serialize.
  - A concurrent Duitku credit only adds money and needs no lock.
- **`planUsage(balances, amountIdr, preferredCategory)`** (pure). Allocation order:
  1. the bill's own category (`sunday_clinic_records.mr_category`) first;
  2. then other categories by oldest credit.
  - Takes `min(totalLive, amountIdr)` and returns `[{category, amount_idr}]`.
  - *(my call: keeps reports sensible without limiting rule A)*
- **`recordUsage(connection, {billingId, patientId, plan, actor})`** inserts one row per category. `ER_DUP_ENTRY` means it was already recorded, so the function returns the existing rows.
- **`getUsageForBillings(executor, billingIds)`** returns `Map<billingId, {used_idr, rows}>` for readers.

### 2. Shared coverage helper (`services/CheckupPrepayCoverage.js`)

`forBilling(executor, billing)` returns:

```
{ mode: 'none' | 'preview' | 'used',
  live_balance_idr, deduct_idr, remaining_due_idr, used: [{category, amount_idr}] }
```

- `confirmed` bill: `preview`, computed from the current live balance without locking.
- `paid` bill: `used`, from the usage rows.
- Anything else, or no saldo: `none`.

The cashier view, invoice and closing all use this helper, and nothing else computes "amount due".

### 3. Cashier flow

- **`GET /api/sunday-clinic/billing/:mrId`** adds `billing.prepay` from the helper.
- **Billing panel** (`staff/public/scripts/sunday-clinic/components/shared/billing.js`):
  - for `confirmed` with `preview`, a box: "Saldo di muka Rp X → dipotong Rp Y · Sisa dibayar Rp Z", and the button reads "Tandai Lunas (sisa Rp Z)";
  - for `paid` with `used`, the box shows "Dibayar dari saldo Rp Y · Dibayar tunai/transfer Rp Z".
- **Mark-paid request:** the button sends `{ expected_prepay_idr: Y }`.
- **`postBillingByMrIdMarkPaid`**, inside `lockConnection`, in this order:
  1. Right after the existing bill row `FOR UPDATE` and the status checks, and **before the stock pre-check and stock deduction**: `lockLiveBalances`, then `planUsage(..., billingLocked.total, mr_category)`.
     - Stock is deducted and committed on separate connections (`InventoryService.deductStockFIFO`). A 409 after that step would leave stock movements behind for a bill that stays `confirmed`, so the check must come first.
     - The ledger lock is held until the commit either way.
  2. If the planned amount ≠ `expected_prepay_idr`, return 409 "Saldo pasien berubah. Muat ulang tagihan." If the field is missing while the plan is > 0, also return 409, since the page is an old cached version. *(my call)*
  3. The existing stock pre-check and deduction run unchanged.
  4. `recordUsage` with the plan from step 1, then the existing paid `UPDATE`, then commit. A rollback undoes both.
- **After the commit:**
  - the audit summary mentions the saldo amount;
  - the response returns `prepay`;
  - the success toast says "Rp Y dari saldo, sisa Rp Z diterima".
- A bill with no live saldo behaves exactly as today. The extra field is ignored when it is 0 or missing and the plan is 0.

### 4. Invoice PDF

`generateInvoice` receives `meta.prepay`:

- paid bills print "Dibayar dari saldo di muka −Rp Y" and "Dibayar tunai/transfer Rp Z" under GRAND TOTAL;
- confirmed bills print "Perkiraan potongan saldo Rp Y (dipotong saat pelunasan)".

The layout is the builder's call.

### 5. Closing

- **Load** the usage rows for the day's main bill ids in `loadFinancialSources`, with `FOR UPDATE` when its caller asks for it. It has three callers: `getClosingPreview`, `createClosing` and `reconcileClosingDetail`. Loading on only one path would give different fingerprints, so every day with saldo would fail with `CLOSING_PREVIEW_STALE` or `POST_CLOSE_SOURCE_CHANGED`.
- **Build** in `buildClosingPreview`, which stays free of database reads:
  - **Per source:** add `saldo_amount` to a source **only when > 0**, so old days keep their fingerprint.
    - On a main bill it is the amount paid from saldo.
    - On a return it is the amount credited back to saldo (section 6).
  - **Summary,** each key only when > 0:
    - `summary.saldo_paid_total`;
    - `summary.saldo_returned_total`;
    - `summary.cash_expected_total = grand_total - saldo_paid_total + saldo_returned_total`.
  - **Why the formula holds:** `grand_total` already subtracts all returns. Adding back the part that went to saldo leaves exactly the money that moved through the drawer or a transfer.
    - A Rp365.000 bill paid fully from saldo, with a Rp20.000 return to saldo the same day, gives 345.000 − 365.000 + 20.000 = 0.
    - The same return on a later day gives −20.000 + 20.000 = 0 that day.
- **Store:** `insertClosingEntries` also saves `saldo_amount` in a new nullable column (section 10), so closed days keep the per-source split. The summary totals survive through `summary_json`.

The closing UI shows "Dibayar dari saldo di muka", "Retur ke saldo" and "Perkiraan tunai/transfer" when present. `grand_total` and the breakdown per category do not change.

### 6. Returns on bills paid with saldo

- **Where:** `services/sunday-clinic/billing-returns.js`, inside its existing transaction and invoice lock.
- **Computing the saldo part** when the return's invoice is a main bill with usage rows:
  - `saldo_left = used_total - SUM(saldo_amount of earlier returns on this bill)`;
  - `saldo_amount = min(amount, saldo_left)`;
  - `cash_amount = amount - saldo_amount`.
  - The existing cap (all returns ≤ `invoice.total`) stays.
- **Payment method:**
  - `cash_amount = 0`: the method is not asked, and the return row stores `payment_method = 'saldo'`;
  - `cash_amount > 0`: the cashier picks tunai or transfer for that part, as today.
- **Writes:** one return row with `saldo_amount`, plus `return_credit` ledger rows.
  - Categories come back in reverse of the usage allocation, using the bill's usage per category minus earlier return credits.
  - `gateway_mode = 'live'`.
- **Locking:** `lockLiveBalances` is taken before the ledger insert, so returns serialize with usage and refunds for the same patient.
- **Retur form** (`components/shared/billing.js` retur dialog), before saving:
  - shows "Rp X kembali ke saldo pasien" and, if any, "Rp Y diserahkan tunai/transfer";
  - the alert text follows the same split.
- **Obat returns** still restock exactly as today. Only the money destination changes.
- **Bills without usage rows** behave exactly as today.

*(my call: "kembali ke saldo" covers only the part that was paid from saldo. Cash someone paid at the counter is still returned in cash or transfer, so saldo never grows beyond what Duitku collected.)*

### 7. Deletion guards

- `deleteRecordsByMrId` refuses when the record's bill has usage rows ("Tagihan ini dibayar dengan saldo di muka; tidak dapat dihapus."). This mirrors `assertNoCancelledBillingEvidence`.
- `patientDeletion` refuses when the patient has any `live` ledger row. Sandbox rows are deleted with the patient.
- *(my call: blocking is safer than reversing money silently)*

### 8. Staff page "Pembayaran di Muka"

- **Sidebar:** `nav-prepay`, under OPERASIONAL next to Estimasi Biaya. Visible with `billing.view`; doctor and superadmin see everything as today. Also added to the compact sidebar `FINANCE_IDS`.
- **Lazy fragment:** `fragments/pages/prepay-page.html`, using the module-driven pattern of `invoice-history-page.js` / `estimasi-biaya-page.js` (`activateRegisteredStaffPage`, lazy shim, resume map). Every `onclick` is exported to `window`.
- **Tab Pembayaran:**
  - `checkup_prepay` orders, newest first;
  - filters: status (default paid), mode (default live, sandbox toggle), date range;
  - columns: waktu bayar, pasien (opens `window.showPatientDetail(patientId)`), produk, nominal, biaya Duitku (`fee_idr`), metode + VA number, status, order ref.
- **Tab Saldo:**
  - patients with a non-zero live balance (sandbox toggle), split per category;
  - a row opens the ledger history: prepay, usage (DRD auto-linked), refund.
  - The "Catat Refund" button is shown with `billing.reset`.
- **Refund form:**
  - fields: amount (1 ≤ amount ≤ live balance), method `tunai`/`transfer`, reason (required, ≤ 2000 characters);
  - a `request_key` (`crypto.randomUUID()`, kept in sessionStorage for a safe retry);
  - the warning "Catat setelah uang diserahkan; sistem tidak mengirim uang".
  - The server locks the balances, splits the amount across categories with the same order as usage, and inserts `patient_credit_refunds` plus the ledger rows in one transaction. Retries with the same key return the saved refund.
- **Tab Harga Estimasi** (doctor only):
  - per product, the tindakan list (LAYANAN / TINDAKAN MEDIS, admin #1 added automatically and not selectable), with quantity 1–10;
  - a live priced total, and Save.
  - Uses the existing `CheckupEstimateService.normalizeMapping` and `saveMapping`, and clears the 60 s public cache.
  - Like the CLI, a product priced under Rp10.000 is saved but marked "Belum siap". The editor warns that its card then disappears from the home page. *(my call: same behaviour as the CLI)*
  - The CLI keeps working.

**API:** one router file `routes/staff-prepay.js`, mounted at `/api/staff-prepay`. Paths avoid the words `payment`/`paid`, which the access registry treats as payment actions.

| Method and path | Permission |
|---|---|
| `GET /orders` | `billing.view` |
| `GET /balances` | `billing.view` |
| `GET /patients/:patientId/ledger` | `billing.view` |
| `POST /refunds` | `billing.reset` (same as returns) |
| `GET /estimate-mapping` | `checkup_prepay.manage_estimate` (new, protected) |
| `PUT /estimate-mapping` | `checkup_prepay.manage_estimate` (new, protected) |

**Registry:** entries go in `accessControlRegistry.js`: `SOURCE_POLICIES`, and `STAFF_NAVIGATION_MAP 'nav-prepay': 'billing.view'`.

**The estimate editor gets one new permission**, `checkup_prepay.manage_estimate`. It is the only new permission. *(my call)*
- **Why:** `requireDoctorRole` admits any account that holds the delegated permission of the route. Drug Audit stays doctor-only only because its permissions are protected and non-delegable. These prices are what patients pay through Duitku, so delegated billing staff must not be able to change them.
- **Shape:**
  - protected;
  - `legacySources: [{kind:'doctor'}]`;
  - listed in `NON_DELEGABLE_ACCOUNT_PERMISSIONS` (`middleware/auth.js`) and in `AccessControlManagementService`;
  - its row is created by the migration, because a doctor's effective permissions come from the `permissions` table.
- The other routes reuse `billing.view` and `billing.reset`.

### 9. Notification

- In `PremiumPaymentService.applyPaidOrder`, after `commit()` for `checkup_prepay` orders, call an injected `onPrepayPaid(order, grant)`. It is fire-and-forget: errors are logged and never affect the callback.
- The default wiring broadcasts `{type:'checkup_prepay_paid', patientName, product, amount_idr, payment_method, gateway_mode}` through `realtimeSync`.
- `realtimePermissions.js` maps that type to `billing.view`.
- **Staff shell:**
  - a toast "Pembayaran di muka diterima: <nama> Rp X (VA BNI)", with "(uji)" for sandbox;
  - `menu-new-badges.js` adds the event to `SOCKET_EVENTS`.
- **Red dot:** `menu-activity-sources.js` `'nav-prepay'` reads `payment_orders` with `order_type='checkup_prepay' AND status='paid'`, column `paid_at`. `updated_at` would fire on every reconcile.

### 10. Data changes (one migration, `20261121_checkup_prepay_tahap2.sql`)

- `CREATE TABLE IF NOT EXISTS patient_credit_refunds`:
  - columns: `id`, `patient_id`, `amount_idr`, `method ENUM('tunai','transfer')`, `reason TEXT`, `request_key VARCHAR(80) UNIQUE`, `request_hash`, `created_by`, `created_by_name`, `created_at`;
  - utf8mb4_unicode_ci.
- `ALTER TABLE patient_credit_ledger ADD INDEX IF NOT EXISTS idx_credit_ledger_live (patient_id, gateway_mode)`.
- `ALTER TABLE sunday_clinic_closing_entries ADD COLUMN IF NOT EXISTS saldo_amount` (nullable, same numeric type as `total`).
- `ALTER TABLE sunday_clinic_billing_returns`:
  - `ADD COLUMN IF NOT EXISTS saldo_amount DECIMAL(12,2) NULL`;
  - `MODIFY payment_method ENUM('cash','transfer','saldo') NOT NULL`.
- `INSERT IGNORE INTO permissions (name, display_name, category, description)` for `checkup_prepay.manage_estimate`, following the pattern of `20260927_nita_anamnesa_permission.sql`.
- No change to bill tables or `payment_orders`.

## Tests (jest on the VPS, compared with a base-copy baseline)

- **`PatientCreditLedger`:**
  - `planUsage`: preferred category first, oldest next, capped by total and bill;
  - sandbox rows ignored;
  - duplicate `recordUsage` is idempotent;
  - refund cannot exceed the balance.
- **Mark-paid:**
  - no saldo → unchanged;
  - saldo < bill;
  - saldo ≥ bill (Rp0 due);
  - expected mismatch → 409, and nothing written: no stock movement and no usage row;
  - missing expected with saldo → 409;
  - rollback leaves no usage row;
  - sandbox-only saldo → no usage.
- **Closing:**
  - a day without saldo has an identical fingerprint before and after the change (fixture from an existing test);
  - a day with saldo shows `saldo_paid_total` and `cash_expected_total`;
  - a return to saldo on the same day, and on a later day, keeps `cash_expected_total` equal to the real drawer money.
- **Returns:**
  - fully saldo-paid bill → everything goes to saldo, `payment_method = 'saldo'`, no method asked;
  - partly saldo-paid bill → split;
  - a second return after the saldo part is used up → cash or transfer only;
  - `return_credit` goes back into the categories that were used;
  - a bill without usage behaves as before (existing `SundayClinicReturns` tests unchanged).
- **Deletion guards** for record and patient.
- **Staff routes:**
  - permission matrix (`AccessControlCatalogRegistry`, `Task10FinanceTeamAccess`);
  - refund idempotency;
  - doctor-only mapping;
  - `nav-prepay` has a menu source (`StaffMenuBadges`).
- **`PremiumPaymentService`:** the `onPrepayPaid` hook runs after the commit only, and a throwing hook does not break the callback.
- **Page shell test** in the style of `DrugAuditPageShell.test.js`:
  - fragment, descriptor, loader;
  - window exports;
  - no `vh`, `getAuthToken` / `getIdToken` only, no `toISOString` for dates.
- **Isolated QA script** `scripts/verify-checkup-prepay-usage-isolated.js`, copying the pattern of `verify-clinic-returns-isolated.js`: a scratch `codex_prepay_qa_*` database with real schemas, then mark-paid with saldo, then closing preview and refund, then the database is dropped. Run on the VPS.

## Deploy

1. Run the migration twice (to show it is idempotent), then `DESCRIBE` both tables.
2. Stage the staff asset release `vNNN` before pulling: next unused version, `stage-staff-assets.js` then `verify-staff-asset-release.js`.
3. Bump `STAFF_CACHE_VERSION` (every occurrence in `index-adminlte.html`) and `STAFF_PWA_VERSION` together.
4. Fast-forward through a git bundle, `pm2 reload` the backend, and check `/api/health`.
5. **Live check without real money, read-only.** No test bill is created in production: it would land in a real clinic day and block that day's closing. *(my call)*
   - The staff page lists the existing sandbox orders labelled "uji".
   - A node one-off on the VPS runs `CheckupPrepayCoverage.forBilling` for the review patient with an in-memory confirmed bill. It must return `mode: 'none'`, because only sandbox saldo exists.
   - An existing paid bill of a patient without saldo returns `prepay.mode: 'none'`.
   - A past closed day still reconciles without `POST_CLOSE_SOURCE_CHANGED`.
   - The write paths (mark-paid with saldo, closing, refund) are proven by the isolated QA database script, not on production data.

## Go-live (separate, Boss decides; not part of this build)

1. Duitku approves the merchant.
2. Production merchant code and key go into `.env` (by Boss), with `DUITKU_PRODUCTION=true`, and the callback URL is set in the production project.
3. `CHECKUP_PREPAY_LIVE=true`, then `pm2 reload --update-env`.
4. Boss makes one small real payment, then: staff toast, red dot, saldo on the staff page, mark-paid on a test bill, closing line, refund.

## Left to the builder

- exact UI layout and wording beyond the strings above;
- the closing UI placement;
- the PDF layout;
- query shapes;
- module file names other than those named here.

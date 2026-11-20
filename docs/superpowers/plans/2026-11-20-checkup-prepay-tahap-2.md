# Bayar di muka Tahap 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Staff see prepay orders and saldo in the panel, and a patient's `live` saldo pays their Klinik Privat main bill automatically when the cashier marks it paid. Closing, returns, refunds and the estimate editor follow from that.

**Architecture:**
- `patient_credit_ledger` is the only record of saldo movement: prepay +, usage −, return_credit +, refund −. Bill tables are not changed.
- One coverage helper gives every reader (cashier panel, invoice PDF) the amount paid from saldo. Closing reads the usage rows directly.
- A new staff page, `/api/staff-prepay`, lists orders, balances and ledgers, records refunds and edits the estimate mapping.
- A realtime event plus the red-dot registry tell staff about new payments.

**Tech Stack:**
- Node/Express;
- mysql2 (MySQL/MariaDB, `dibyaklinik`);
- jest (run on the VPS);
- staff panel as ES modules on AdminLTE;
- pdfkit (`utils/pdf-generator.js`).

**Spec:** `docs/superpowers/specs/2026-11-20-checkup-prepay-tahap-2-design.md` (approved by Boss 2026-11-20). Read it alongside this plan.

## Global Constraints

- Only ledger rows with `gateway_mode = 'live'` are read for deduction, refund, return credit and the cashier view. Sandbox rows appear only on the staff page, labelled "Uji (sandbox)".
- Ledger amounts are whole rupiah (`INT`). The amount taken from a bill is `Math.min(totalLiveBalance, Math.floor(Number(billing.total)))`.
- New tables and columns come only from `staff/backend/migrations/20261121_checkup_prepay_tahap2.sql`, never from runtime `CREATE` or `ALTER` (`StaffPanelWave6StartupSchema.test.js`).
- Commits have **no** `Co-Authored-By` line (CLAUDE.md).
- Staff frontend rules:
  - use `staffApiRequest` / `getAuthToken()`, never a hardcoded token key;
  - no CSS `vh`;
  - no `toISOString()` for date-only values;
  - every function used in an `onclick` is exported to `window`;
  - use `escapeHtml` for every server string;
  - AdminLTE overrides use `!important`.
- Role names and ids come from `constants/roles.js`, never literals.
- Xendit code and every WhatsApp path stay untouched.
- Copy that the spec fixes:
  - "Saldo di muka Rp X → dipotong Rp Y · Sisa dibayar Rp Z"
  - "Tandai Lunas (sisa Rp Z)"
  - "Dibayar dari saldo Rp Y · Dibayar tunai/transfer Rp Z"
  - "Saldo pasien berubah. Muat ulang tagihan."
  - "Dibayar dari saldo di muka", "Retur ke saldo", "Perkiraan tunai/transfer"
  - "Perkiraan potongan saldo Rp Y (dipotong saat pelunasan)"
  - "Rp X kembali ke saldo pasien"
  - "Catat setelah uang diserahkan; sistem tidak mengirim uang"
  - "Tagihan ini dibayar dengan saldo di muka; tidak dapat dihapus."
  - "Pembayaran di muka diterima: <nama> Rp X (<metode>)", with " (uji)" for sandbox
- **Jest runs only on the VPS.**
  - Ship a `git archive` of the branch to `/tmp/<id>` and symlink `/var/www/dokterdibya/staff/backend/node_modules`.
  - Run `JWT_SECRET=test node node_modules/jest/bin/jest.js --coverage=false --runInBand --forceExit <pattern>` from `staff/backend`.
  - Compare failures with a copy of `origin/main`. Known pre-existing failures: Wave6 exit guard, and AccessControlCatalogRegistry community-chat-notifications / staff-menu-badges.
- Patient pages are not changed, so no patient `CACHE_VERSION` bump. The staff asset version is bumped once, in Task 11.

## Review Focus

1. **A bill total with cents** (`100000.50`) and saldo ≥ total: usage is `100000`, the remaining due is `0.50`, and nothing throws. Test in Task 3.
2. **A retur on an additional invoice** when the main bill was paid with saldo: the saldo part is 0, a method is required, and no `return_credit` is written. Test in Task 6.
3. **A confirmed bill with total 0** and a patient with saldo: the plan is empty, mark-paid needs no `expected_prepay_idr`, and no usage rows are written. Test in Task 3.
4. **A deleted or missing patient name** in the notification and on the staff lists: falls back to the `patient_id`, with no crash. Tests in Task 8 and Task 9.
5. **An estimate mapping that points to a now-inactive tindakan:** `PUT` saves it and the response marks that product not ready. Test in Task 9.

---

### Task 1: Migration and ledger core

**Files:**
- Create: `staff/backend/migrations/20261121_checkup_prepay_tahap2.sql`
- Modify: `staff/backend/services/PatientCreditLedger.js`
- Test: `staff/backend/tests/unit/PatientCreditLedgerTahap2.test.js`
- Modify: `staff/backend/tests/unit/CheckupPrepayContract.test.js` (migration assertions)

**Interfaces:**
- Produces (all exported from `PatientCreditLedger.js`):
  - **Constants:** `SOURCE_BILLING = 'sunday_clinic_billing'`, `SOURCE_RETURN = 'sunday_clinic_return'`, `SOURCE_REFUND = 'credit_refund'`.
  - **`getLiveBalances(executor, patientId, { forUpdate = false } = {})`** → `Promise<Array<{category, balance_idr, oldest_at: Date|null}>>`.
    - Covers live rows only. `oldest_at` is the earliest `created_at` of a positive row in that category.
    - Categories with balance 0 are dropped.
    - `forUpdate` appends `FOR UPDATE`.
  - **`lockLiveBalances(connection, patientId)`** = `getLiveBalances(connection, patientId, { forUpdate: true })`.
  - **`planUsage(balances, amountIdr, preferredCategory = null)`** → `Array<{category, amount_idr}>`. Pure function.
    - Order: `preferredCategory` first, then by `oldest_at` ascending, then by category name.
    - Takes `min(sum, amountIdr)`. An `amountIdr` ≤ 0 gives `[]`.
  - **`recordUsage(connection, { billingId, patientId, plan, actor })`** → `Promise<number>` (total used).
    - Inserts one row per plan entry: `entry_type 'usage'`, `amount_idr = -amount`, `gateway_mode 'live'`, `source_type SOURCE_BILLING`, `source_id = `${billingId}:${category}``, `created_by = actor`.
    - On `ER_DUP_ENTRY` it returns the already-recorded total.
  - **`getUsageForBillings(executor, billingIds, { forUpdate = false } = {})`** → `Promise<Map<string billingId, {used_idr, rows:[{id, category, amount_idr}]}>>`.
    - Reads live usage rows, `SUBSTRING_INDEX(source_id, ':', 1) IN (?)`.
    - `used_idr` is positive. `rows` are in id order.
  - **`planReturnCredit(usageRows, priorCredits, amountIdr)`** → `Array<{category, amount_idr}>`. Pure function.
    - Walks the usage rows in reverse id order. For each category the room is (used − already credited).
  - **`recordReturnCredit(connection, { returnId, patientId, plan, actor })`** inserts `entry_type 'return_credit'`, positive amounts, `source_type SOURCE_RETURN`, `source_id `${returnId}:${category}``, live.
  - **`recordRefundRows(connection, { refundId, patientId, plan, actor })`** inserts `entry_type 'refund'`, negative amounts, `source_type SOURCE_REFUND`, `source_id `${refundId}:${category}``, live.
  - **`assertNoPrepaySaldoEvidence(connection, { mrId, patientId })`** throws an error with `statusCode 409` and the message "Tagihan ini dibayar dengan saldo di muka; tidak dapat dihapus.":
    - with `mrId`, when that record's main bill has usage rows;
    - with `patientId`, when the patient has any live ledger row.
  - The existing `getBalances` is left as is.
- **Migration** (idempotent; the header says to run after `20261118_checkup_prepay.sql`):
  - `CREATE TABLE IF NOT EXISTS patient_credit_refunds` with:
    - `id BIGINT UNSIGNED AUTO_INCREMENT PK`, `patient_id VARCHAR(50) NOT NULL`, `amount_idr INT UNSIGNED NOT NULL`;
    - `method ENUM('tunai','transfer') NOT NULL`, `reason TEXT NOT NULL`;
    - `request_key VARCHAR(80) NOT NULL UNIQUE`, `request_hash CHAR(64) NOT NULL`;
    - `created_by VARCHAR(64) NULL`, `created_by_name VARCHAR(120) NULL`, `created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`;
    - `KEY (patient_id, created_at)`, utf8mb4_unicode_ci.
  - `ALTER TABLE patient_credit_ledger ADD INDEX IF NOT EXISTS idx_credit_ledger_live (patient_id, gateway_mode)`.
  - `ALTER TABLE sunday_clinic_billing_returns ADD COLUMN IF NOT EXISTS saldo_amount INT UNSIGNED NULL AFTER amount, MODIFY COLUMN payment_method ENUM('cash','transfer','saldo') NOT NULL`.
  - `INSERT IGNORE INTO permissions (name, display_name, category, description) VALUES ('checkup_prepay.manage_estimate', 'Ubah harga estimasi bayar di muka', 'Keuangan', 'Mengatur tindakan dan harga estimasi kunjungan yang dibayar di muka lewat Duitku')`.

- [ ] **Step 1: Write the failing tests**

```js
// PatientCreditLedgerTahap2.test.js
const L = require('../../services/PatientCreditLedger');
const bal = (category, balance_idr, oldest) => ({ category, balance_idr, oldest_at: new Date(oldest) });
test('planUsage takes the bill category first, then the oldest credit', () => {
  const b = [bal('gyn_repro', 340000, '2026-11-01'), bal('obstetri', 255000, '2026-11-10')];
  expect(L.planUsage(b, 300000, 'obstetri')).toEqual([{ category: 'obstetri', amount_idr: 255000 }, { category: 'gyn_repro', amount_idr: 45000 }]);
  expect(L.planUsage(b, 300000, null)).toEqual([{ category: 'gyn_repro', amount_idr: 300000 }]);
  expect(L.planUsage(b, 0, 'obstetri')).toEqual([]);
  expect(L.planUsage([], 100000, 'obstetri')).toEqual([]);
});
test('planReturnCredit refills the categories used, last used first', () => {
  const usage = [{ id: 1, category: 'obstetri', amount_idr: 255000 }, { id: 2, category: 'gyn_repro', amount_idr: 45000 }];
  expect(L.planReturnCredit(usage, [], 60000)).toEqual([{ category: 'gyn_repro', amount_idr: 45000 }, { category: 'obstetri', amount_idr: 15000 }]);
  expect(L.planReturnCredit(usage, [{ category: 'gyn_repro', amount_idr: 45000 }], 10000)).toEqual([{ category: 'obstetri', amount_idr: 10000 }]);
});
test('getLiveBalances reads live rows only and locks when asked', async () => {
  const query = jest.fn(async () => [[{ category: 'obstetri', amount_idr: 255000, created_at: '2026-11-20 07:48:00' }]]);
  await L.getLiveBalances({ query }, 'P1', { forUpdate: true });
  expect(query.mock.calls[0][0]).toMatch(/gateway_mode = 'live'/);
  expect(query.mock.calls[0][0]).toMatch(/FOR UPDATE/);
});
test('recordUsage writes one negative live row per category and is idempotent', async () => {
  const query = jest.fn(async () => [{ affectedRows: 1 }]);
  const total = await L.recordUsage({ query }, { billingId: 9, patientId: 'P1', plan: [{ category: 'obstetri', amount_idr: 255000 }], actor: 'Kasir' });
  expect(total).toBe(255000);
  expect(query.mock.calls[0][1]).toEqual(expect.arrayContaining(['P1', 'obstetri', -255000, 'sunday_clinic_billing', '9:obstetri']));
});
test('assertNoPrepaySaldoEvidence refuses records and patients with live saldo history', async () => {
  const withRows = { query: jest.fn(async () => [[{ id: 1 }]]) };
  await expect(L.assertNoPrepaySaldoEvidence(withRows, { mrId: 'DRD1' })).rejects.toMatchObject({ statusCode: 409 });
  await expect(L.assertNoPrepaySaldoEvidence({ query: jest.fn(async () => [[]]) }, { patientId: 'P1' })).resolves.toBeUndefined();
});
```

Add to `CheckupPrepayContract.test.js` a `describe('tahap 2 migration')` with these assertions:
- `CREATE TABLE IF NOT EXISTS patient_credit_refunds`;
- `request_key VARCHAR(80) NOT NULL UNIQUE`;
- `ENUM('cash','transfer','saldo')`;
- `ADD COLUMN IF NOT EXISTS saldo_amount`;
- `INSERT IGNORE INTO permissions`;
- `checkup_prepay.manage_estimate`;
- `utf8mb4_unicode_ci`;
- no `INSERT INTO patient_credit_ledger`.

- [ ] **Step 2: Run on the VPS and confirm the failures**

Run: `... jest.js --coverage=false --runInBand --forceExit 'PatientCreditLedgerTahap2|CheckupPrepayContract'`
Expected: FAIL, with `L.planUsage is not a function` and the migration file missing.

- [ ] **Step 3: Write the migration and the functions listed under Interfaces**

- [ ] **Step 4: Re-run the same command.** Expected: PASS.

- [ ] **Step 5: Commit** `git commit -m "Add the Tahap 2 saldo ledger helpers and migration"`

---

### Task 2: Coverage helper and the billing GET

**Files:**
- Create: `staff/backend/services/CheckupPrepayCoverage.js`
- Modify: `staff/backend/services/sunday-clinic/billing.js` (`getBillingByMrId`, around lines 141-151)
- Test: `staff/backend/tests/unit/CheckupPrepayCoverage.test.js`

**Interfaces:**
- Consumes: `getLiveBalances` and `getUsageForBillings` from Task 1.
- Produces:
  - **`forBilling(executor, billing)`** → `Promise<{mode:'none'|'preview'|'used', live_balance_idr, deduct_idr, remaining_due_idr, used:[{category, amount_idr}]}>`.
    - `confirmed` bill: `preview`, built from the unlocked live balance, with `deduct_idr = min(balance, floor(total))`.
    - `paid` bill with usage rows: `used`.
    - Otherwise: `none`, with `deduct_idr 0` and `remaining_due_idr = Number(total)`.
    - `remaining_due_idr` = `Number(total) - deduct_idr`, rounded to 2 decimals.
  - **`withPrepay(executor, billing)`** → `billing` with a `prepay` field.
  - `getBillingByMrId` responds with `data.prepay`.

- [ ] **Step 1: Write the failing tests**

```js
const C = require('../../services/CheckupPrepayCoverage');
jest.mock('../../services/PatientCreditLedger', () => ({ getLiveBalances: jest.fn(), getUsageForBillings: jest.fn() }));
const L = require('../../services/PatientCreditLedger');
test('confirmed bill previews the deduction from live saldo', async () => {
  L.getLiveBalances.mockResolvedValue([{ category: 'obstetri', balance_idr: 255000 }]);
  expect(await C.forBilling({}, { id: 1, patient_id: 'P1', status: 'confirmed', total: '365000.00' }))
    .toEqual({ mode: 'preview', live_balance_idr: 255000, deduct_idr: 255000, remaining_due_idr: 110000, used: [] });
});
test('paid bill reports the recorded usage; no saldo means none', async () => {
  L.getUsageForBillings.mockResolvedValue(new Map([['1', { used_idr: 255000, rows: [{ id: 3, category: 'obstetri', amount_idr: 255000 }] }]]));
  expect((await C.forBilling({}, { id: 1, patient_id: 'P1', status: 'paid', total: 255000 })).mode).toBe('used');
  L.getLiveBalances.mockResolvedValue([]);
  expect((await C.forBilling({}, { id: 2, patient_id: 'P2', status: 'confirmed', total: 100000 })).mode).toBe('none');
});
```

- [ ] **Step 2: Run** `... 'CheckupPrepayCoverage'`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement `CheckupPrepayCoverage.js`.** In `getBillingByMrId`, add `prepay: await forBilling(db, billingRow)` to the billing object.
- [ ] **Step 4: Run** `... 'CheckupPrepayCoverage|SundayClinicWave5Modularity'`. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Show the saldo coverage on Klinik Privat bills"`

---

### Task 3: Mark-paid deducts live saldo

**Files:**
- Modify: `staff/backend/services/sunday-clinic/billing.js` `postBillingByMrIdMarkPaid` (lines 753-1062)
- Test: `staff/backend/tests/unit/SundayClinicMarkPaidSaldo.test.js`. Copy the harness of `SundayClinicMarkPaidPerObat.test.js` and add `jest.mock('../../services/PatientCreditLedger')`.

**Interfaces:**
- Consumes: `lockLiveBalances`, `planUsage` and `recordUsage` (Task 1).
- Produces:
  - request body `expected_prepay_idr` (integer, optional);
  - response `{ success, message, patientName, prepay: { deduct_idr, remaining_due_idr } }`;
  - the audit summary is "Tagihan ditandai lunas (… ) · saldo Rp X" when X > 0.

**Order inside the function:**
1. After the `billingLocked.status !== 'confirmed'` check, and before reading obat items:
   - `SELECT mr_category FROM sunday_clinic_records WHERE mr_id = ?` (on `lockConnection`);
   - `lockLiveBalances(lockConnection, billingLocked.patient_id)`;
   - `planUsage(balances, Math.floor(Number(billingLocked.total)), mr_category)`;
   - `planned = sum`.
2. If `planned > 0` and `Number(req.body?.expected_prepay_idr)` is not exactly `planned` (this includes a missing value), return 409 "Saldo pasien berubah. Muat ulang tagihan.". If `planned === 0`, ignore the field.
3. The existing stock steps, unchanged.
4. `recordUsage(lockConnection, { billingId, patientId, plan, actor: paidBy })` immediately before the paid `UPDATE`.

- [ ] **Step 1: Write the failing tests** (`setup()` as in the reference test, plus a ledger mock):
  - `'no saldo: unchanged path, no usage recorded'`: `planUsage` returns `[]` → status 200, and `recordUsage` is not called.
  - `'saldo smaller than bill: usage recorded before the paid update'`: plan `[{obstetri, 255000}]`, body `expected_prepay_idr: 255000` → `recordUsage` is called with `billingId 55`. The call order shows `recordUsage` before the `UPDATE sunday_clinic_billings` query. The response has `prepay.remaining_due_idr === 110000` for total 365000.
  - `'expected mismatch returns 409 before any stock movement'`: plan 255000, body 200000 → 409, the message equals the fixed copy, and neither `InventoryService.deductStockFIFO` nor `recordUsage` is called.
  - `'missing expected with saldo returns 409'`: body without the field → 409.
  - `'bill total with cents'` (Review Focus 1): total `'100000.50'`, balance 200000 → `planUsage` is called with `100000`, and the response has `remaining_due_idr === 0.5`.
  - `'zero total bill needs no expected field'` (Review Focus 3): total `0`, balance 200000 → `planUsage` returns `[]`, status 200, `recordUsage` is not called.
- [ ] **Step 2: Run** `... 'SundayClinicMarkPaidSaldo'`. Expected: FAIL.
- [ ] **Step 3: Implement the order above.**
- [ ] **Step 4: Run** `... 'SundayClinicMarkPaid|SundayClinicClosingPaymentGuard|Task10FinanceTeamAccess'`. Expected: PASS. The PerObat test still passes because its ledger mock returns `[]`.
- [ ] **Step 5: Commit** `git commit -m "Deduct live prepay saldo when a Klinik Privat bill is marked paid"`

---

### Task 4: Cashier panel and invoice PDF

**Files:**
- Modify: `staff/public/scripts/sunday-clinic/components/shared/billing.js`:
  - the render near line 1872, `confirmed` / `paid` action blocks;
  - the mark-paid handler at lines 2469-2523.
- Modify: `staff/backend/utils/pdf-generator.js` `generateInvoice(billingData, patientData, recordData)` (the GRAND TOTAL block near line 202).
- Modify: `staff/backend/services/sunday-clinic/billing.js` `postBillingByMrIdPrintInvoice`: pass `prepay: await forBilling(connection, billing)` in the third argument.
- Test: `staff/backend/tests/unit/CheckupPrepayCashierUi.test.js` (source-contract style, like `SundayClinicBillingCancellationUi.test.js`).

**Interfaces:**
- Consumes: `billing.prepay` (Task 2) and the mark-paid body/response (Task 3).
- Produces: `recordData.prepay` in `generateInvoice`, with the same shape as `forBilling`.

- [ ] **Step 1: Write the failing contract test.** The billing component source must contain:
  - `'Saldo di muka '`, `'Sisa dibayar '`, `'Tandai Lunas (sisa '`, `'Dibayar dari saldo '`;
  - `expected_prepay_idr: ` inside the `mark-paid` fetch body;
  - a handler that, on status 409, calls `window.handleSectionChange('billing'` (reload).
  - All prepay numbers go through `formatRupiah`, and the box uses no `innerHTML` with unescaped server strings.

  `pdf-generator.js` must contain `'Dibayar dari saldo di muka'` and `'Perkiraan potongan saldo'`.
- [ ] **Step 2: Run** `... 'CheckupPrepayCashierUi'`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - **Panel:**
    - `confirmed` + `preview` with `deduct_idr > 0`: an info box above the actions, and the button label "Tandai Lunas (sisa Rp Z)";
    - `paid` + `used`: a box "Dibayar dari saldo Rp Y · Dibayar tunai/transfer Rp Z".
  - **Mark-paid fetch:** body `JSON.stringify({ expected_prepay_idr: billing.prepay?.deduct_idr || 0 })`.
    - Success toast: "Pembayaran berhasil dicatat! Rp Y dari saldo, sisa Rp Z diterima." when `prepay.deduct_idr > 0`.
    - On 409: show the server message, then reload the billing section.
  - **PDF:** under GRAND TOTAL,
    - `paid` + `used`: two lines, "Dibayar dari saldo di muka -Rp Y" and "Dibayar tunai/transfer Rp Z";
    - `confirmed` + `preview` with `deduct_idr > 0`: one line, "Perkiraan potongan saldo Rp Y (dipotong saat pelunasan)".
- [ ] **Step 4: Run** `... 'CheckupPrepayCashierUi|CancelledInvoicePdf|SundayClinicBilling'`. Expected: PASS.
- [ ] **Step 5: Check the panel in the local harness.** Use the built-in browser, with the staff fragment served by the Python static server and import-map stubs returning a confirmed bill with `prepay.preview`, at 375 px and 1280 px. Confirm the box text and the button label. Delete the temporary `launch.json` afterwards.
- [ ] **Step 6: Commit** `git commit -m "Show saldo deduction in the cashier panel and on the invoice"`

---

### Task 5: Closing counts saldo

**Files:**
- Modify: `staff/backend/services/SundayClinicClosingService.js`:
  - `loadFinancialSources` (lines 422-544);
  - `buildClosingPreview` (145-407);
  - `insertClosingEntries` (827-869);
  - `getClosingDetail` (583-655).
- Modify: `staff/public/scripts/sunday-clinic/components/shared/closing.js` (summary cards at lines 314-327).
- Test: `staff/backend/tests/unit/SundayClinicClosingSaldo.test.js`

**Interfaces:**
- Consumes: `getUsageForBillings(executor, ids, {forUpdate})` (Task 1).
- **`loadFinancialSources` returns an extra `saldoUsage: Map<billingId, used_idr>`**. It is loaded with the same `forUpdate` option as the other queries.
  - `returns` rows already carry `saldo_amount` (`r.*`).
- **`buildClosingPreview({ ..., saldoUsage = new Map() })`:**
  - a main source gets `saldo_amount` only when > 0;
  - a return source gets `saldo_amount = Number(entry.saldo_amount)` only when > 0;
  - `summary.saldo_paid_total`, `summary.saldo_returned_total` and `summary.cash_expected_total = grand_total - saldo_paid_total + saldo_returned_total` are each set only when the totals are > 0.
- **`insertClosingEntries`** puts `saldo_amount` into `sourceSnapshot` when it is present.
- **`getClosingDetail`** maps `entry.saldo_amount = source_snapshot.saldo_amount ?? undefined`.

- [ ] **Step 1: Write the failing tests:**
  - `'a day without saldo keeps its fingerprint'`: build a preview from the fixture in `SundayClinicReturns.test.js` line 54 with and without `saldoUsage: new Map()` → equal fingerprints, and `summary` has no `saldo_paid_total` key.
  - `'saldo paid bill: cash expected is total minus saldo'`: one paid main bill total 365000 with `saldoUsage` `{id → 255000}` → `summary.saldo_paid_total === 255000`, `cash_expected_total === 110000`, `grand_total === 365000`.
  - `'return to saldo on the same day keeps cash expected at zero'`: bill 365000, all from saldo, plus a return of 20000 with `saldo_amount` 20000 → `grand_total 345000`, `cash_expected_total 0`.
  - `'return to saldo on a later day'`: only the return → `grand_total -20000`, `cash_expected_total 0`.
  - `'loadFinancialSources reads usage with FOR UPDATE when closing'`: a stub client records its SQL. With `{ forUpdate: true }`, the usage query ends with `FOR UPDATE`.
- [ ] **Step 2: Run** `... 'SundayClinicClosingSaldo'`. Expected: FAIL.
- [ ] **Step 3: Implement as described under Interfaces.** In `closing.js`, show the cards "Dibayar dari saldo di muka", "Retur ke saldo" and "Perkiraan tunai/transfer" only when their summary keys exist.
- [ ] **Step 4: Run** `... 'SundayClinicClosing|SundayClinicReturns|sundayClinicBillingAudit'`. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Count saldo payments and saldo returns in Klinik Privat closing"`

---

### Task 6: Returns go back to saldo

**Files:**
- Modify: `staff/backend/services/sunday-clinic/billing-returns.js`: `buildReturnPlan` (line 17), `listReturns` (83-101), `createReturn` (124-205).
- Modify: `staff/public/scripts/sunday-clinic/components/shared/billing.js` (retur dialog, lines 793-935).
- Test: extend `staff/backend/tests/unit/SundayClinicReturns.test.js`.

**Interfaces:**
- Consumes: `getUsageForBillings`, `lockLiveBalances`, `planReturnCredit` and `recordReturnCredit` (Task 1).
- Produces:
  - **`resolveReturnMoney({ amount, saldoLeft, paymentMethod })`** → `{ saldo_amount, cash_amount, payment_method }`, exported.
    - `saldo_amount = Math.min(Math.floor(amount), saldoLeft)`, `cash_amount = amount - saldo_amount`.
    - When `cash_amount > 0` and `paymentMethod` is not `cash`/`transfer`, it fails with "Pilih tunai atau transfer untuk pengembalian.".
    - When `cash_amount === 0`, `payment_method` is `'saldo'`.
  - **`buildReturnPlan`** now only rejects a *present* method outside cash/transfer.
  - **`listReturns`** adds `saldo_left` to the main invoice (0 for additional invoices).
  - **`createReturn`**:
    - only for main invoices, computes `saldoLeft = used_idr − Σ saldo_amount` of earlier main returns;
    - stores `saldo_amount` (NULL when 0) and the resolved `payment_method`;
    - when `saldo_amount > 0`, calls `lockLiveBalances` and then `recordReturnCredit`, both before `deps.audit`;
    - returns `{ id, amount, saldo_amount, cash_amount, already_saved }`.

- [ ] **Step 1: Write the failing tests:**
  - `'resolveReturnMoney sends the saldo part back to saldo'`:
    - `({amount:20000, saldoLeft:365000})` → `{saldo_amount:20000, cash_amount:0, payment_method:'saldo'}`;
    - `({amount:50000, saldoLeft:30000, paymentMethod:'cash'})` → `{30000, 20000, 'cash'}`;
    - `({amount:50000, saldoLeft:30000})` throws.
  - `'a supported method is still checked when sent'`: the existing `{ payment_method: 'qris' }` case still throws, and `{ payment_method: undefined }` no longer throws in `buildReturnPlan`.
  - `'additional invoice returns never touch saldo'` (Review Focus 2): call `createReturn` with a stub connection where main usage is 365000 and `additional_billing_id` is set → the method is required, and no `return_credit` insert appears in the recorded SQL.
- [ ] **Step 2: Run** `... 'SundayClinicReturns'`. Expected: FAIL.
- [ ] **Step 3: Implement the backend as described under Interfaces.**
  - **Retur dialog:** compute `saldoPart = min(amount, invoice.saldo_left)` live as the amount changes.
    - Show "Rp X kembali ke saldo pasien" and, when the cash part is > 0, "Rp Y diserahkan tunai/transfer".
    - Hide and do not require the method select when the cash part is 0.
    - The alert text follows the same split.
- [ ] **Step 4: Run** `... 'SundayClinicReturns|SundayClinicClosing'`. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Return the saldo-paid part of a retur to the patient's saldo"`

---

### Task 7: Deletion guards

**Files:**
- Modify: `staff/backend/services/sunday-clinic/records.js` (line 654).
- Modify: `staff/backend/services/patientDeletion.js` (lines 26 and 389).
- Test: `staff/backend/tests/unit/CheckupPrepayDeletionGuard.test.js`

**Interfaces:**
- Consumes: `assertNoPrepaySaldoEvidence(connection, {mrId|patientId})` (Task 1).
- Each call sits right after the existing `assertNoCancelledBillingEvidence` call, with the same arguments.
- `records.js` maps an error with `statusCode` to `res.status(statusCode).json({ success:false, message })`. Check how the existing guard's error is returned there and follow it.

- [ ] **Step 1: Write the failing test.** A source contract checks that each of the three call sites contains `assertNoPrepaySaldoEvidence(connection, { mrId })` or `{ patientId }` immediately after `assertNoCancelledBillingEvidence`. Plus one behavioural test of `records.deleteRecordsByMrId` with a connection stub whose usage query returns a row → 409 with the fixed message.
- [ ] **Step 2: Run** `... 'CheckupPrepayDeletionGuard'`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `... 'CheckupPrepayDeletionGuard|PatientDeletion|SundayClinicRecords'`. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Block deleting records and patients that hold live prepay saldo"`

---

### Task 8: Paid-order notification

**Files:**
- Modify: `staff/backend/services/PremiumPaymentService.js`:
  - factory signature (line 73);
  - after the non-premium `commit()` (lines 243-249);
  - default wiring (lines 427-435).
- Create: `staff/backend/services/CheckupPrepayNotifier.js`
- Modify: `staff/backend/security/realtimePermissions.js`: add `'checkup_prepay_paid': 'billing.view'`.
- Create: `staff/public/scripts/shell/prepay-paid-toast.js`
- Modify:
  - `staff/public/scripts/shell/bootstrap.js` (a deferred import next to line 229);
  - `staff/public/scripts/shell/menu-new-badges.js` (`SOCKET_EVENTS` gets `'checkup_prepay_paid'`);
  - `staff/public/sw.js` (`STAFF_SHELL_SCRIPTS` gets `'/staff/public/scripts/shell/prepay-paid-toast.js'`).
- Test: extend `staff/backend/tests/unit/PremiumPaymentService.test.js`, and create `staff/backend/tests/unit/CheckupPrepayNotifier.test.js`.

**Interfaces:**
- Produces:
  - **`createPremiumPaymentService({ ..., onPrepayPaid = null })`.** After the commit of a `checkup_prepay` order it calls `Promise.resolve().then(() => onPrepayPaid(order, grant)).catch(e => logger.warn(...))` and does not await it.
  - **`CheckupPrepayNotifier.notifyPrepayPaid(order, grant, { db, realtime })`**:
    - looks up `patients.full_name`, falling back to `order.patient_id`;
    - calls `realtime.broadcast({ type:'checkup_prepay_paid', patientName, product: order.product_code, productLabel, amount_idr, payment_method, gateway_mode, order_ref, timestamp })`.
    - Default `realtime = require('../realtime-sync')`, required lazily.
  - **Default wiring:** `onPrepayPaid: (order, grant) => require('./CheckupPrepayNotifier').notifyPrepayPaid(order, grant)`.
  - **`shell/prepay-paid-toast.js`** exports `initPrepayPaidToast()`.
    - It binds `window.socket.on('checkup_prepay_paid', …)` the way `menu-new-badges.bindSocket` does, re-checking every 30 s until a socket exists and rebinding when `window.socket` changes.
    - It shows `window.showToast('success', 'Pembayaran di muka diterima: <nama> Rp X (<metode>)' + (gateway_mode === 'sandbox' ? ' (uji)' : ''))`.
    - The name is passed through `textContent` or `escapeHtml` if `showToast` renders HTML.

- [ ] **Step 1: Write the failing tests:**
  - **PremiumPaymentService:**
    - `'onPrepayPaid runs after commit for a paid prepay order'`: the hook is called once, after `connection.commit`.
    - `'a throwing onPrepayPaid does not change the callback result'`: the result is still `{ status: 'activated' }`.
    - `'premium orders never call onPrepayPaid'`.
  - **Notifier:**
    - `'broadcasts the paid event with the patient name'`;
    - `'falls back to the patient id when the name is missing'` (Review Focus 4).
  - **Contract:**
    - `realtimePermissions.EVENT_PERMISSIONS.checkup_prepay_paid === 'billing.view'`;
    - `menu-new-badges.js` contains `'checkup_prepay_paid'`;
    - `bootstrap.js` contains `import('./prepay-paid-toast.js')`.
- [ ] **Step 2: Run** `... 'PremiumPaymentService|CheckupPrepayNotifier'`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `... 'PremiumPaymentService|CheckupPrepayNotifier|StaffMenuNewBadges|FrontendModularizationStage2Wave6|Task6ServiceWorker|realtime'`. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Tell staff in the panel when a prepay order is paid"`

---

### Task 9: Staff prepay API and the estimate permission

**Files:**
- Create: `staff/backend/services/StaffPrepayService.js`
- Create: `staff/backend/routes/staff-prepay.js`
- Modify:
  - `staff/backend/server.js`: one mount line next to the other staff routers, `app.use('/api/staff-prepay', require('./routes/staff-prepay'));`;
  - `staff/backend/config/accessControlCatalog.js`: in `NEW_PERMISSIONS`, `permission('checkup_prepay.manage_estimate', 'Ubah harga estimasi bayar di muka', 'Keuangan', 'manage', [{ kind: 'doctor' }], { protected: true })`;
  - `staff/backend/config/accessControlRegistry.js`:
    - `SOURCE_POLICIES['staff-prepay'] = CRUD('billing.view', 'billing.reset', 'checkup_prepay.manage_estimate', 'billing.reset')`;
    - `ROUTE_PERMISSION_OVERRIDES`: `['staff-prepay:GET:/estimate-mapping', 'checkup_prepay.manage_estimate']`, `['staff-prepay:PUT:/estimate-mapping', 'checkup_prepay.manage_estimate']`, `['staff-prepay:POST:/refunds', 'billing.reset']`;
  - `staff/backend/middleware/auth.js` `NON_DELEGABLE_ACCOUNT_PERMISSIONS` and `staff/backend/services/AccessControlManagementService.js` (its list at lines 25-30): add `'checkup_prepay.manage_estimate'`.
- Test: `staff/backend/tests/unit/StaffPrepayRoutes.test.js` (pattern: `DrugAuditRoutes.test.js`).

**Interfaces:**
- Consumes:
  - `getLiveBalances`, `lockLiveBalances`, `planUsage` (used as the refund plan with `preferredCategory = null`) and `recordRefundRows` (Task 1);
  - `getCheckupEstimateService()` (`loadMapping`, `loadTindakan`, `priceAll({fresh:true})`, `saveMapping`);
  - `productLabel` and `CATEGORY` labels from `constants/checkupPrepayProducts.js` and `constants/consultationCategories.js`.
- **Routes**, all `verifyStaffToken`. Every declaration is literally `router.<verb>('<path>', ...)`.

| Route | Guard | Input | Response |
|---|---|---|---|
| `GET /orders` | `requirePermission('billing.view')` | query `status` ∈ paid\|pending\|expired\|all (default paid), `mode` ∈ live\|sandbox\|all (default live), `from` / `to` `YYYY-MM-DD` (optional), max 500 rows | `{success, data:[{order_ref, patient_id, patient_name, product_code, product_label, amount_idr, fee_idr, payment_method, va_number, status, gateway_mode, created_at, paid_at, expires_at}]}`, only `order_type='checkup_prepay'` |
| `GET /balances` | `requirePermission('billing.view')` | `mode` ∈ live\|sandbox (default live) | `{data:[{patient_id, patient_name, gateway_mode, total_idr, categories:[{category, label, balance_idr}]}]}`, non-zero only |
| `GET /patients/:patientId/ledger` | `requirePermission('billing.view')` | `patientId` must match `/^[A-Za-z0-9_-]{1,50}$/`, else 400 | `{data:{patient:{id, name}, balances:{live:[...], sandbox:[...]}, entries:[{id, entry_type, category, amount_idr, gateway_mode, source_type, source_id, mr_id, note, created_by, created_at}]}}`; `mr_id` is joined for usage rows |
| `POST /refunds` | `requirePermission('billing.reset')` | `{patient_id, amount_idr, method:'tunai'\|'transfer', reason, request_key}` | `{data:{id, amount_idr, already_saved}}` |
| `GET /estimate-mapping` | `requirePermission('checkup_prepay.manage_estimate')` | — | `{data:{mapping, categories, tindakan:[{id, code, name, category, price}]}}`; `tindakan` uses the CLI's `list-tindakan` query |
| `PUT /estimate-mapping` | `requirePermission('checkup_prepay.manage_estimate')` | `{mapping}` | `{data:{mapping, categories}}`; `saveMapping` errors → 400 with its message |

- **Refund validation:**
  - `amount_idr` is an integer from 1 to the live total;
  - `reason` is trimmed, 1-2000 characters;
  - `request_key` matches `/^[a-zA-Z0-9_-]{16,80}$/`.
- **Refund transaction:**
  1. `lockLiveBalances`;
  2. plan with `planUsage(balances, amount, null)`;
  3. insert into `patient_credit_refunds` with `request_hash` = sha256 of `{patient_id, amount_idr, method, reason}`;
  4. `recordRefundRows`;
  5. commit.
- **Refund retries:** the same `request_key` with the same hash returns the saved refund (`already_saved: true`); a different hash → 409.

- [ ] **Step 1: Write the failing tests:**
  - every route resolves to the intended permission in `accessRouteInventory`, as in `DrugAuditRoutes.test.js` lines 100-108;
  - `checkup_prepay.manage_estimate` is protected and non-delegable (`AccessControlManagementService` refuses to delegate it);
  - refund over the live balance → 400, and sandbox saldo is ignored;
  - refund retry with the same key → `already_saved`;
  - refund with the same key and a different reason → 409;
  - `GET /orders` filters `order_type = 'checkup_prepay'` and defaults to live + paid;
  - `patient_name` falls back to `patient_id` (Review Focus 4);
  - `PUT /estimate-mapping` with a mapping that references an inactive tindakan → 200, and that product's entry in `categories` is not ready (Review Focus 5).
- [ ] **Step 2: Run** `... 'StaffPrepayRoutes'`. Expected: FAIL.
- [ ] **Step 3: Implement the service and routes as in the table above.**
- [ ] **Step 4: Run** `... 'StaffPrepayRoutes|AccessControlCatalogRegistry|AccessControlManagement|Task10FinanceTeamAccess|DrugAuditRoutes'`. Expected: PASS, apart from the known pre-existing AccessControlCatalogRegistry failures, which must not grow.
- [ ] **Step 5: Commit** `git commit -m "Add the staff prepay API and the doctor-only estimate permission"`

---

### Task 10: Staff page "Pembayaran di Muka"

**Files:**
- Modify `staff/public/index-adminlte.html`:
  - sidebar: after `nav-estimasi-biaya` (around line 598), add `<li class="nav-item d-none" id="nav-prepay"><a href="#" class="nav-link" data-staff-call="showPrepayPage">…Pembayaran di Muka</a></li>`;
  - container: next to line 2560, add `<div id="prepay-page" class="d-none" data-page-fragment="/staff/public/fragments/pages/prepay-page.html"></div>`.
- Create: `staff/public/fragments/pages/prepay-page.html`
- Create: `staff/public/scripts/pages/prepay-page.js`
- Modify:
  - `shell/page-descriptors.js`: `['prepay', 'prepay-page', 'nav-prepay', 'Pembayaran di Muka']`;
  - `shell/feature-loader.js`: a `prepay` loader importing `../pages/prepay-page.js?v=${version}`;
  - `shell/bootstrap.js`: `installLazyFeatureShim` for `showPrepayPage` and the page's onclick globals, feature `'prepay'`, page `'prepay'`;
  - `shell/compact-sidebar.js`: `FINANCE_IDS` gets `'nav-prepay'`;
  - `scripts/main.js`: resume map entry `'nav-prepay': () => window.showPrepayPage?.()`, next to line 3324;
  - `staff/backend/config/accessControlRegistry.js`: `STAFF_NAVIGATION_MAP['nav-prepay'] = 'billing.view'`;
  - `staff/backend/config/menu-activity-sources.js`: `'nav-prepay': [{ table: 'payment_orders', where: "order_type = 'checkup_prepay' AND status = 'paid'", columns: ['paid_at'] }]`.
- Test: `staff/backend/tests/unit/PrepayPageShell.test.js`, copied from `DrugAuditPageShell.test.js`.

**Interfaces:**
- Consumes: the Task 9 API and `window.showPatientDetail(patientId)`.
- **`prepay-page.js`** exports `showPrepayPage()` (`await window.activateRegisteredStaffPage?.('prepay')`, then load the active tab).
- The module assigns to `window`, via `Object.assign`, every function its markup calls with `onclick`: `prepayShowTab`, `prepayLoadOrders`, `prepayLoadBalances`, `prepayOpenLedger`, `prepayOpenRefund`, `prepaySubmitRefund`, `prepayLoadMapping`, `prepaySaveMapping`.
- **Tabs:**
  - **Harga Estimasi:** rendered only when `window.hasAccountPermission?.('checkup_prepay.manage_estimate')`.
  - **"Catat Refund":** rendered only when `window.hasAccountPermission?.('billing.reset')`.
- **Refund `request_key`:** `crypto.randomUUID()`, kept in sessionStorage under `prepay-refund-key:<patient_id>` until the request succeeds.
- **Labels:** sandbox rows show the "Uji (sandbox)" badge.
- **Under-minimum products:** when a saved category is not ready, the mapping editor shows the warning "Belum siap: kartu tidak tampil di halaman utama".

- [ ] **Step 1: Write the failing page-shell test.** It asserts:
  - nav placement and id;
  - the container `data-page-fragment`;
  - the descriptor tuple, the loader, the shim and the main.js resume entry;
  - every `onclick="window.X(` / `onclick="X(` name in the fragment and module is exported;
  - no `vh`, no `localStorage.getItem(`, no `toISOString(`;
  - `MENU_ACTIVITY_SOURCES['nav-prepay']` is defined;
  - `STAFF_NAVIGATION_MAP['nav-prepay'] === 'billing.view'`;
  - `FINANCE_IDS` includes `nav-prepay`;
  - the source contains `hasAccountPermission('billing.reset')` and `hasAccountPermission?.('checkup_prepay.manage_estimate')` (or the non-optional form; pick one and assert it).
- [ ] **Step 2: Run** `... 'PrepayPageShell'`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `... 'PrepayPageShell|StaffMenuBadges|StaffCompactSidebar|AccessControlCatalogRegistry|staffPanelStabilization|StaffPatientShellWave1'`. Expected: PASS, apart from the known baseline.
- [ ] **Step 5: Check the page in the local harness** (built-in browser, stubbed API):
  - all three tabs at 375 px and 1280 px, with no horizontal scroll;
  - the refund form validation;
  - clicking a patient name calls `showPatientDetail`.
- [ ] **Step 6: Commit** `git commit -m "Add the Pembayaran di Muka staff page"`

---

### Task 11: Isolated QA script, version bump, full suite, release

**Files:**
- Create: `staff/backend/scripts/verify-checkup-prepay-usage-isolated.js`. Copy the structure of `verify-clinic-returns-isolated.js`:
  - database name `codex_prepay_qa_<timestamp>`, checked against `/^codex_prepay_qa_\d+$/`;
  - copy the schemas it lists, plus `patient_credit_ledger`, `patient_credit_refunds`, `payment_orders`, `sunday_clinic_billing_returns`;
  - apply `20261121_checkup_prepay_tahap2.sql`;
  - drop the database in `finally`.
- Modify:
  - `staff/public/index-adminlte.html`: `STAFF_CACHE_VERSION` to the next unused `vNNN`, every occurrence;
  - `staff/public/sw.js`: `STAFF_PWA_VERSION`, same value.
- Modify: `docs/superpowers/specs/2026-11-20-checkup-prepay-tahap-2-design.md`, Status line → "Tahap 2 built".
- Modify: `CLAUDE.md`, a short session-log section that points to the spec, plus the rule "only live saldo; returns credit saldo".

**What the QA script asserts:**
1. A live prepay of 255000 and a confirmed bill of 365000 → `postBillingByMrIdMarkPaid` with `expected_prepay_idr 255000` → bill `paid`, one usage row of −255000, live balance 0.
2. A sandbox prepay of 255000 for a second patient → mark-paid ignores it, and no usage row is written.
3. The closing preview for that date: `saldo_paid_total 255000`, `cash_expected_total 110000`.
4. A money retur of 20000 on the first bill → `payment_method 'saldo'`, a return_credit of +20000, live balance 20000.
5. A refund of 20000 → live balance 0. A retry with the same key → `already_saved`.
6. Mark-paid on a third bill after the saldo changed → 409, and no `stock_movements` rows for that bill.

- [ ] **Step 1: Pick the version.** On the VPS, `ls /var/www/dokterdibya-staff-releases` and check `origin/main`. Choose the next unused `vNNN`. Count its occurrences before and after the replacement.
- [ ] **Step 2: Run the full jest suite on the VPS** (base copy and head copy in the background via `run_full.sh`). Diff the ✕ lines. Expected: no new failures.
- [ ] **Step 3: Run the isolated QA script on the VPS.** It needs Boss's OK for SSH and creates and drops a scratch database. Run `node scripts/verify-checkup-prepay-usage-isolated.js` from the `/tmp` copy. Expected: all asserts pass, then "dropped codex_prepay_qa_…".
- [ ] **Step 4: Commit** `git commit -m "Verify Tahap 2 end to end on a scratch database and bump staff assets to vNNN"`. Push, open the PR through the built-in browser, and merge it (Boss's standing instruction: always merge and deploy).
- [ ] **Step 5: Deploy.**
  1. Back up the database: `mysqldump dibyaklinik > /root/backups/pre-prepay-tahap2-<stamp>.sql`.
  2. Run `stage-staff-assets.js --repository-root … --release-base /var/www/dokterdibya-staff-releases --version vNNN --source-commit <merge sha>`, then `verify-staff-asset-release.js`.
  3. Create a git bundle → `scp` → `sudo -u www-data git fetch <bundle> refs/remotes/origin/main` → `git merge --ff-only FETCH_HEAD`.
  4. Run `mysql -u root dibyaklinik < staff/backend/migrations/20261121_checkup_prepay_tahap2.sql` twice, then `DESCRIBE patient_credit_refunds` and `SHOW COLUMNS FROM sunday_clinic_billing_returns LIKE 'saldo_amount'`.
  5. Run `pm2 reload ecosystem.config.js --only dibyaklinik-backend --update-env` from `staff/backend`.
  6. Expected: `/api/health` returns 200, and the live `sw.js` serves the new `vNNN`.
- [ ] **Step 6: Read-only live checks** (spec, Deploy step 5):
  - the staff page lists the sandbox orders labelled "Uji (sandbox)";
  - a node one-off of `CheckupPrepayCoverage.forBilling` for P2026658 with an in-memory confirmed bill returns `mode 'none'`;
  - an existing paid bill returns `prepay.mode 'none'`;
  - the closing detail of the latest closed day reconciles without `POST_CLOSE_SOURCE_CHANGED`.
- [ ] **Step 7: Update memory** (`duitku_checkup_prepay_status.md`): Tahap 2 deployed, plus the go-live checklist from the spec. Report to Boss: `CHECKUP_PREPAY_LIVE` stays off until Duitku approves and the production keys are set.

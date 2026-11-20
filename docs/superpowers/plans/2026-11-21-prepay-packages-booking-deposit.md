# Bayar di muka Tahap 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prepay packages become editable rows: tindakan and obat items, plus a gestational-week range for Kehamilan. Booking offers the matching package and a pay-now / pay-at-visit choice, and patients can request a saldo withdrawal that staff complete.

**Architecture:**
- **Packages and pricing.** Packages live in `checkup_prepay_packages` and `checkup_prepay_package_items` (repository: `PrepayPackageRepository`). `CheckupEstimateService` prices them live from `tindakan`/`obat` plus the admin fee. The four existing product codes become package rows, so orders, saldo and links keep working. A paid order credits the saldo category stored in its own snapshot.
- **Withdrawals.** Requests live in `patient_credit_refund_requests`. A pending request holds its amount: every saldo spend uses `live − hold`.

**Tech Stack:** Node/Express, mysql2, jest on the VPS, vanilla JS patient portal, AdminLTE staff panel.

**Spec:** `docs/superpowers/specs/2026-11-21-prepay-packages-booking-deposit-design.md` (approved by Boss 2026-11-21). Read it alongside this plan.

## Global Constraints

**Saldo and money**
- Only `gateway_mode = 'live'` saldo is ever spent, held or withdrawn. Sandbox saldo shows as "Saldo uji" and cannot be withdrawn.
- Ledger amounts are whole rupiah. The amount taken from a bill is `min(live − hold, floor(total))`.

**Package rules**
- A tindakan whose name matches `/\bkonsul|konseling/i` can never be part of a package.
- Admin fee = tindakan #1, added once per package, never an item.
- Package price = admin + Σ(current price × quantity), rounded up; ready only if ≥ Rp10.000. There is no fixed or discounted price.
- Week ranges are inclusive completed weeks, Kehamilan only, `0 ≤ min ≤ max ≤ 45`, and may overlap.
- Suggestion = the first active package by `sort_order`, then id, whose range contains the week. A null-range Kehamilan package is used only when no ranged package matches.

**Payout rules**
- The clinic pays the transfer fee: the amount debited from saldo is the amount the patient receives.
- The account holder may differ from the patient; staff see a "nama berbeda" badge.
- The full account number is visible only to the patient and to staff with `billing.reset`, is masked elsewhere (`•••• 1234`), and is never logged.

**Display**
- Home page prices keep the "Rp…" format. "255K" is a separate change after Duitku approval.
- Estimates are framed as Sisiwanita; no "dr. Dibya" in the estimates section.
- No WhatsApp and no Xendit changes. The booking API, attendance confirmation and auto-cancel are unchanged.

**Copy fixed by the spec and mockup v3**
- "Perkiraan biaya kunjungan"
- "Usia kehamilan Anda pada <tanggal> ± N minggu (dari HPHT/HPL terakhir)"
- "Pilih paket sesuai usia kehamilan"
- "Mau bayar sekarang?"
- "Bayar sekarang (QRIS / VA)"
- "Bayar saat periksa"
- "Saldo Anda Rp X sudah menutup estimasi"
- "Saldo Saya"
- "Saldo Deposit"
- "Cairkan ke rekening"
- "Ajukan pencairan"
- "diproses 1–2 hari kerja"
- "Saldo uji tidak dapat dicairkan"
- "Sudah ditransfer"
- "Tolak"
- "nama berbeda"
- "Pencairan atas permintaan pasien #<id>"

**Project rules (CLAUDE.md)**
- New tables only via migrations.
- Commits have no `Co-Authored-By` line.
- Staff frontend: `staffApiRequest`, `escapeHtml`, window exports for every `onclick`, no `vh`, no `toISOString` for dates.
- Patient pages: viewport stays `maximum-scale=1.0, user-scalable=no`.

**Running tests.** Jest runs only on the VPS, through the scratchpad runner `vps-jest.sh '<pattern>'`, which overlays the branch on production main. Baseline failures to ignore: Wave6 exit guard; AccessControlCatalogRegistry community-chat-notifications / staff-menu-badges; puppeteer suites (no Chrome).

## Review Focus

1. **A package edited or deactivated between the booking screen and checkout.** Checkout charges the fresh live price and refuses a package that is no longer ready, with "Paket tidak tersedia", never a 500. Test in Task 3.
2. **An old link `/bayar-estimasi.html?kategori=<deactivated code>`.** The page shows "Paket tidak tersedia" and a link to the home page. Test in Task 3.
3. **A patient with a pending withdrawal whose bill is marked paid.** The held amount is not deducted; only `live − hold` is. Test in Task 5.
4. **An inactive or unpriced obat or tindakan inside a package.** The package is not ready, hidden from the home page and booking, and shown with its issue in the editor. Test in Task 2.
5. **A stale HPL, or an appointment far from the reference date.** The result is above 42 weeks, below 0, or HPL + 14 days before the appointment, so the age is unknown and the patient picks; no absurd week is shown. Test in Task 4.

---

### Task 1: Package tables, repository and data copy

**Files:**
- Create: `staff/backend/migrations/20261122_checkup_prepay_packages.sql`
- Create: `staff/backend/services/PrepayPackageRepository.js`
- Create: `staff/backend/scripts/migrate-prepay-packages.js`
- Test: `staff/backend/tests/unit/PrepayPackageRepository.test.js`
- Test: extend `staff/backend/tests/unit/CheckupPrepayContract.test.js` (migration contract)

**Interfaces:**

Produces `PrepayPackageRepository`:
- `listPackages(executor, { activeOnly = false })` → `Promise<Package[]>`.
  - `Package = { id, code, name, description, category, week_min, week_max, is_active, sort_order, items: [{ item_type: 'tindakan'|'obat', ref_id, quantity, sort_order }] }`.
  - Sorted by `category`, `sort_order`, `id`.
- `getPackageByCode(executor, code)` → `Promise<Package|null>`.
- `savePackage(connection, input, actor)` → `Promise<{ id, code }>`. Input is normalised (Task 2). It creates when `input.id` is absent and updates otherwise, replacing all items in the same transaction. A new package code is `pkg_<id>`, updated after the insert.
- `setPackageActive(executor, id, active, actor)` → `Promise<boolean>`.
- `buildPackagesFromMapping(mapping)` → `Array<{ code, name, category, week_min: null, week_max: null, sort_order, items }>`. Pure. It copies the four legacy codes from `checkup_prepay_estimate_v1` with names from `CHECKUP_PREPAY_PRODUCTS` labels and `sort_order` 10/20/30/40.

Migration (idempotent; header says to run after `20261121_checkup_prepay_tahap2.sql`) creates the three tables exactly as spec §1:
- `checkup_prepay_packages` with `UNIQUE(code)`;
- `checkup_prepay_package_items` with the FK `ON DELETE CASCADE` and `UNIQUE(package_id, item_type, ref_id)`;
- `patient_credit_refund_requests` with `UNIQUE(request_key)`, `KEY(status, created_at)` and `KEY(patient_id, status)`;
- all utf8mb4_unicode_ci.

`scripts/migrate-prepay-packages.js [--apply]`:
- dry run by default, prints the packages it would create;
- `--apply` inserts only codes that do not exist yet (idempotent);
- never touches the settings row.

- [ ] **Step 1: Write the failing tests:**
  - **migration contract:**
    - the three `CREATE TABLE IF NOT EXISTS` statements;
    - `UNIQUE KEY` on `code` and on `request_key`;
    - `ON DELETE CASCADE`;
    - `ENUM('tindakan','obat')`;
    - `ENUM('pending','done','rejected','cancelled')`;
    - no `INSERT`.
  - **`buildPackagesFromMapping`:** the current live mapping `{categories:{obstetri:{items:[{tindakan_id:6,quantity:1}]}, obstetri_usg4d:{…9}, gyn_repro:{…8}, gyn_special:{…8}}}` gives four rows:
    - codes in that order;
    - categories `obstetri`, `obstetri`, `gyn_repro`, `gyn_special`;
    - items `[{item_type:'tindakan', ref_id:6, quantity:1, sort_order:0}]`, and so on;
    - week range null.
  - **`savePackage`:** create then update on a stub connection. Update issues `DELETE FROM checkup_prepay_package_items WHERE package_id = ?` and then the inserts in one transaction. Create sets `code = 'pkg_<insertId>'`.
  - **`listPackages({activeOnly:true})`:** the SQL filters `is_active = 1`, and items are grouped per package.
- [ ] **Step 2: Run** `vps-jest.sh 'PrepayPackageRepository|CheckupPrepayContract'`. Expected: FAIL.
- [ ] **Step 3: Implement** the migration, the repository and the script as described under Interfaces.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Add prepay package tables, repository and the legacy mapping copy"`

---

### Task 2: Package pricing and validation

**Files:**
- Modify: `staff/backend/services/CheckupEstimateService.js` (rewrite around packages; keep its file and default-service export)
- Modify: `staff/backend/routes/public-checkup-estimates.js` (reads `result.packages`)
- Test: rewrite `staff/backend/tests/unit/CheckupEstimateService.test.js`; adjust `PublicCheckupEstimatesRoute.test.js`

**Interfaces:**
- Consumes: Task 1 `listPackages`, `getPackageByCode`.
- Produces (exports):
  - `CONSULTATION_PATTERN = /\bkonsul|konseling/i` and `isConsultationTindakan(row)` → boolean.
  - `normalizePackageInput(input)` → `{ value, errors: string[] }`. Rules:
    - name 1–120 characters;
    - description ≤ 255 characters;
    - category in `CONSULTATION_CATEGORY_CODES`;
    - week range both null, or integers `0 ≤ min ≤ max ≤ 45`, and only when the category is `obstetri`;
    - 1–20 items;
    - `item_type` is `tindakan` or `obat`;
    - tindakan quantity 1–10, obat quantity 1–200;
    - no duplicate `(item_type, ref_id)`;
    - tindakan #1 refused.
  - `pricePackage(pkg, { tindakan: Map<id,row>, obat: Map<id,row> }, { minAmount = 10000 })` → `Priced`. Pure.
    - `Priced = { id, code, name, description, category, week_min, week_max, sort_order, is_active, ready, amount_idr, raw_total, issues: string[], items: [{ item_type, ref_id, name, unit_price, quantity, subtotal }] }`.
    - The admin line comes first.
    - Issues:
      - inactive or missing item → "<Tindakan|Obat> <id>: tidak ada atau nonaktif";
      - no price → "harga belum tersedia";
      - wrong tindakan category;
      - consultation → "konsultasi tidak boleh di paket";
      - total below the minimum.
  - **Service** (`createCheckupEstimateService({ db, repository, clock, cacheMs })`):
    - `priceAll({ fresh })` → `{ priced_at, packages: Priced[] }`, active packages only, with a 60 s cache when not fresh;
    - `pricePackageByCode(code)` → `Priced|null`, always fresh, active only;
    - `priceAllForStaff()` → every package, active and inactive, fresh;
    - `loadCatalog()` → `{ tindakan: [{ id, code, name, category, price }], obat: [{ id, code, name, unit, price }] }`. Tindakan: active, category `LAYANAN`/`TINDAKAN MEDIS`, not consultation, not #1. Obat: active, price not null.
    - `invalidate()`.
  - `toPublicEstimate(priced)` → `{ code, name, label: name, category, week_min, week_max, sort_order, ready, amount_idr, items: [{ name, quantity, subtotal_idr }] }`, with no ids and no issues.

- [ ] **Step 1: Write the failing tests:**
  - **tindakan + obat pricing:** tindakan #9 Rp250.000 × 1 + obat Kalsium Rp1.500 × 30 + admin Rp15.000 → `amount_idr 310000`, ready, items ordered admin, tindakan, obat.
  - **consultation:** an item named "Konsul Singkat" (#56) and one named "Konseling Prapersalinan" (#58) each make the package not ready with "konsultasi tidak boleh di paket"; `normalizePackageInput` refuses both when the row is known.
  - **Review Focus 4:** an inactive obat, and an obat with `price null`, each give not ready plus an issue. `priceAll` omits the package from public results but `priceAllForStaff` keeps it.
  - **`normalizePackageInput` table:**
    - a week range on `gyn_repro` → error;
    - `min > max` → error;
    - `max 46` → error;
    - both null on `obstetri` → ok;
    - 21 items → error;
    - obat quantity 201 → error;
    - tindakan quantity 11 → error;
    - a duplicate → error;
    - tindakan #1 → error.
  - **public route:** lists only ready packages, mapped with `toPublicEstimate`, with no ids in the JSON.
- [ ] **Step 2: Run** `vps-jest.sh 'CheckupEstimateService|PublicCheckupEstimatesRoute'`. Expected: FAIL.
- [ ] **Step 3: Implement** as described under Interfaces.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Price prepay packages from tindakan and obat, never with consultation"`

---

### Task 3: Package codes replace the fixed products

**Files:**
- Modify: `staff/backend/constants/checkupPrepayProducts.js`
- Modify: `staff/backend/services/PatientCreditLedger.js` (`creditFromPaidOrder`)
- Modify: `staff/backend/services/CheckupPrepayService.js` (`createOrder`, `toPublicOrder`, `getStatus`)
- Modify: `staff/backend/services/CheckupPrepayNotifier.js`
- Modify: `staff/backend/services/StaffPrepayService.js` (labels)
- Modify: `public/scripts/checkup-prepay.js` (`CATEGORY_PATTERN`, not-available message)
- Modify: `public/scripts/patient-safe-next.js` (allow-list)
- Test: update `CheckupPrepayProducts.test.js`, `CheckupPrepayService.test.js`, `CheckupPrepayNotifier.test.js`, and `PremiumPaymentService.test.js:727-735`

**Interfaces:**
- Consumes: Task 2 `pricePackageByCode`.
- Produces:
  - `isPackageCodeFormat(code)`, true for `/^[a-z0-9_]{2,40}$/`.
  - `productCategoryForCode(executor, code)` → `Promise<string|null>`: reads the package row (`getPackageByCode`, active or not, 60 s cache) and falls back to the sync legacy `productCategory(code)` for the four old codes.
  - The order `item_snapshot` JSON is `{ package_code, package_name, category, items, amount_idr, priced_at }`.
  - `creditFromPaidOrder` takes the category in this order:
    1. `JSON.parse(order.item_snapshot).category`;
    2. `productCategoryForCode(connection, order.product_code)`;
    3. none → the existing unknown-code rollback.
  - `createOrder({ patient, category: code, paymentMethod })`:
    1. a bad format → the existing `INVALID_CATEGORY` 400;
    2. `pricePackageByCode(code)`;
    3. a missing, inactive or not-ready package → `PremiumError('PACKAGE_UNAVAILABLE', 'Paket tidak tersedia', 404)`. This replaces `ESTIMATE_NOT_READY` (409) at `CheckupPrepayService.js:120`;
    4. the amount always comes from the fresh price.
  - Labels (`toPublicOrder`, notifier, staff lists) use the snapshot's `package_name`, falling back to `productLabel`.
  - Browser `CATEGORY_PATTERN` and the `patient-safe-next.js` allow-list become `/^[a-z0-9_]{2,40}$/`.
  - `checkup-prepay.js` shows "Paket tidak tersedia" plus a link to `/` when status or checkout answers `PACKAGE_UNAVAILABLE` or the code is unknown.

- [ ] **Step 1: Write the failing tests:**
  - **legacy order:** an old order with `product_code: 'obstetri_usg4d'` and no `category` in the snapshot still credits `obstetri`.
  - **new package order:** `product_code: 'pkg_7'` with snapshot category `gyn_repro` credits `gyn_repro`, even when the package row is now inactive or was moved to another category.
  - **snapshot without a category:** `product_code: 'pkg_7'` and no snapshot category → the package row's category.
  - **Review Focus 1:** `createOrder` amount equals the fresh `pricePackageByCode` amount, never the client value. A package that turned not ready → `PACKAGE_UNAVAILABLE` 404.
  - **Review Focus 2:** contract test — `checkup-prepay.js` contains "Paket tidak tersedia" and handles `PACKAGE_UNAVAILABLE`.
  - **allow-lists:** the `patient-safe-next` table accepts `pkg_12` and `obstetri` and rejects `<script>`, `A`, `../x`. `CheckupPrepayProducts.test.js` asserts the generic pattern in both browser files.
  - **`PremiumPaymentService.test.js:727-735`:** the unknown-code case now uses a snapshot without a category and an unknown code, and still rolls back.
- [ ] **Step 2: Run** `vps-jest.sh 'CheckupPrepay|PremiumPaymentService|PatientCreditLedger|StaffPrepayRoutes'`. Expected: FAIL.
- [ ] **Step 3: Implement** as described under Interfaces.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Treat prepay products as package codes and credit the category from the order snapshot"`

---

### Task 4: Gestational age and the package suggestion

**Files:**
- Create: `staff/backend/services/GestationalAge.js`
- Modify: `staff/backend/routes/patient-checkup-prepay.js` (add `GET /suggestion`)
- Test: `staff/backend/tests/unit/GestationalAge.test.js`; extend `PatientCheckupPrepayRoutes.test.js`

**Interfaces:**
- Consumes: Task 2 `priceAll`.
- Produces:
  - `gestationalWeeksOn(reference, onDate)` → `{ weeks, days } | null`. Pure.
    - `reference` is `{ kind: 'hpht'|'hpl', date: 'YYYY-MM-DD' }` and `onDate` is `'YYYY-MM-DD'`. Use local-date arithmetic on the date parts, never `toISOString`.
    - **hpht:** `days = on − hpht`.
    - **hpl:** `days = 280 − (hpl − on)`.
    - Returns null when `days < 0`, when `weeks > 42`, or when `kind === 'hpl'` and `on − hpl > 14` days.
  - `findPregnancyReference(db, patientId)` → `{ kind, date, recorded_at, source: 'anamnesa'|'usg' } | null`.
    - **Candidates:**
      - `medical_records` with `record_type = 'anamnesa'` whose `mr_id` belongs to an obstetri visit (`sunday_clinic_records.mr_category = 'obstetri'`, as in `routes/patients.js:663-684`): `$.hpht` and `$.hpl`;
      - `medical_records` with `record_type = 'usg'` (as in `routes/patients-auth.js:2413-2423`): `$.edd`, or `$.trimester_<current_trimester>.edd`, else the latest non-empty `$.trimester_N.edd`.
    - **Choice:** the candidate with the latest `recorded_at = COALESCE(updated_at, created_at)`. When two candidates share a `recorded_at` (one anamnesa carrying both), HPL wins over HPHT. Only valid `YYYY-MM-DD` values count.
    - This is the ruling on the spec's own conflict: its Tests line says "HPL beats HPHT", its design says the newest record wins. Newest wins; HPL decides only a tie.
  - `choosePackage(packages, weeks)` → `code|null`.
    - Among `category === 'obstetri'`, ready packages: those with a range containing `weeks` (inclusive), sorted by `sort_order`, then id → first.
    - Else the first null-range package.
    - Else null. When `weeks` is null, null.
  - `GET /api/patient/checkup-prepay/suggestion?date=YYYY-MM-DD&category=<consultation category>` (`verifyPatientToken`, no-store):
    - returns `{ weeks, days, source: 'hpht'|'hpl'|null, suggested_code, packages: toPublicEstimate[] of that category }`;
    - `weeks`/`suggested_code` are null for non-obstetri;
    - a bad date or category → 400.

- [ ] **Step 1: Write the failing tests:**
  - **from HPHT:**
    - `gestationalWeeksOn({kind:'hpht',date:'2026-06-14'}, '2026-11-29')` → `{weeks:24, days:0}`;
    - an on-date before the HPHT → null.
  - **from HPL:** `{kind:'hpl', date:'2027-03-21'}` on `2026-11-29` → 16 weeks.
  - **Review Focus 5:**
    - an HPL 15 days before the appointment → null;
    - an HPHT 300 days before → null (> 42 weeks).
  - **`choosePackage`:**
    - two packages both covering week 22 with `sort_order` 20 and 10 → the 10 one;
    - a sort tie → the lower id;
    - week 30 with only a null-range package → that one;
    - no match and no null-range package → null.
  - **`findPregnancyReference`** with stub rows:
    - a newer USG `trimester_2.edd` beats an older anamnesa `hpht`;
    - a newer anamnesa `hpht` beats an older USG `edd`;
    - one anamnesa with both `hpl` and `hpht` → the HPL;
    - a USG updated after an anamnesa (`updated_at` newer) beats it even when its `created_at` is older;
    - the top-level `edd` shape is read;
    - an invalid date string is ignored.
  - **route:**
    - the patient's own id only (the query uses `req.patient.id`);
    - `category=gyn_repro` → `weeks: null`;
    - `date=2026-02-30` → 400.
- [ ] **Step 2: Run** `vps-jest.sh 'GestationalAge|PatientCheckupPrepayRoutes'`. Expected: FAIL.
- [ ] **Step 3: Implement** as described under Interfaces.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Suggest the Kehamilan package from the latest HPHT or HPL on the appointment date"`

---

### Task 5: Withdrawal requests and the hold

**Files:**
- Create: `staff/backend/services/PatientRefundRequestService.js`
- Modify: `staff/backend/services/PatientCreditLedger.js` (`getPendingRefundHold`)
- Modify: `staff/backend/services/sunday-clinic/billing.js` (mark-paid cap)
- Modify: `staff/backend/services/CheckupPrepayCoverage.js` (preview cap)
- Modify: `staff/backend/services/StaffPrepayService.js` (`createRefund` cap and `forRequestId`)
- Modify: `staff/backend/services/CheckupPrepayService.js` `getStatus`: add `available_idr` and `saldo_menu_visible`
- Modify: `staff/backend/routes/patient-checkup-prepay.js` (`GET /saldo`, `POST /refund-requests`, `POST /refund-requests/:id/cancel`)
- Modify: `staff/backend/routes/staff-prepay.js` (`GET /refund-requests`, `POST /refund-requests/:id/complete`, `POST /refund-requests/:id/reject`)
- Modify: `staff/backend/config/accessControlRegistry.js` (overrides: GET → `billing.view`; complete/reject → `billing.reset`)
- Modify: `staff/backend/security/realtimePermissions.js` (`checkup_prepay_refund_requested` → `billing.view`)
- Modify: `staff/backend/config/menu-activity-sources.js` (`nav-prepay` also reads `patient_credit_refund_requests`, `created_at`)
- Test: `staff/backend/tests/unit/PatientRefundRequestService.test.js`; extend `SundayClinicMarkPaidSaldo.test.js`, `CheckupPrepayCoverage.test.js`, `StaffPrepayRoutes.test.js`, `PatientCheckupPrepayRoutes.test.js`, `CheckupPrepayService.test.js`

**Interfaces:**
- Consumes: Tahap 2 `lockLiveBalances`, `planUsage`, `recordRefundRows`; `StaffPrepayService.createRefund`.
- Produces:
  - `getPendingRefundHold(executor, patientId, { forUpdate })` → `number`, the sum of pending request amounts.
  - **Hold rule:**
    - mark-paid plans `planUsage(balances, min(floor(total), max(0, live − hold)), mr_category)`, reading the hold after `lockLiveBalances` on the same connection;
    - coverage previews `deduct = min(live − hold, floor(total))`;
    - `createRefund({ …, forRequestId })` caps at `live − hold`, but when `forRequestId` is given the request's own amount is excluded from the hold.
  - **`createPatientRefundRequestService({ db, staffPrepay, realtime = require('../realtime-sync') })`:**
    - `createRequest({ patient, amountIdr, bankName, accountNumber, accountHolder, requestKey })`:
      - validation: amount integer ≥ 10.000 and ≤ `live − hold`; `bankName` 2–60 characters; `accountNumber` `/^\d{6,20}$/`; `accountHolder` 3–120 characters; `requestKey` `/^[a-zA-Z0-9_-]{16,80}$/`;
      - a patient with sandbox saldo only → 400 "Saldo uji tidak dapat dicairkan";
      - one pending request per patient;
      - locks the patient's live rows first;
      - the same key returns the saved request;
      - broadcasts `checkup_prepay_refund_requested` with `realtime.broadcast`, the same way `CheckupPrepayNotifier.js:21` does, carrying the id, the patient name and the amount, never the account number;
      - returns `{ id, status }`.
    - `cancelRequest({ patientId, id })`: pending only.
    - `listForPatient(patientId)` → the patient's own requests with the full account number.
    - `listForStaff({ canSeeAccount })` → pending first (oldest first), then the last 100 closed (newest first), with `name_differs`. `account_number` is full when `canSeeAccount` (the caller holds `billing.reset`), otherwise `maskAccount`.
    - No service function writes the account number to `console` or the activity log; log lines use `maskAccount`.
    - `completeRequest({ id, actor })`, in one transaction:
      1. lock the request `FOR UPDATE`;
      2. call `createRefund` with `{ patientId, amountIdr, method: 'transfer', reason: 'Pencairan atas permintaan pasien #<id>', requestKey: 'refund-request-<id>', forRequestId: id }`;
      3. set `status = 'done'` and `refund_id`;
      4. a second call returns the saved result.
    - `rejectRequest({ id, note, actor })`: note 3–500 characters, pending only.
  - **Helpers:**
    - `holderNameDiffers(holder, patientName)` → boolean, case-insensitive after removing titles (`ny|nn|tn|ibu|bapak|bpk|sdr|dr`, dots) and collapsing spaces;
    - `maskAccount(number)` → `'•••• ' + last4`.
  - **`getStatus` additions** (read by Task 8 and Task 9):
    - `available_idr = max(0, live − hold)`;
    - `saldo_menu_visible = availability.available || <the patient has any ledger row or any refund request>`.
  - **Patient endpoints:**
    - `GET /saldo` → `{ balances: { live, sandbox }, available_idr, history (last 100 ledger rows: entry_type, category_label, amount_idr, gateway_mode, created_at, mr_id), requests }`;
    - the POST routes return `{ data }`;
    - every patient route uses `req.patient.id`.
  - **Staff endpoints** as listed under Files.

- [ ] **Step 1: Write the failing tests:**
  - **Review Focus 3:** live 255000, a pending request of 200000, bill 365000 → `planUsage` is called with `55000`, and the 409 check compares against 55000.
  - **coverage:** previews the same `deduct 55000`.
  - **request validation:**
    - an amount above available → 400;
    - account `12ab` → 400;
    - sandbox saldo only → 400 "Saldo uji tidak dapat dicairkan";
    - a second pending request → 409;
    - the same `requestKey` → the saved request.
  - **never logged:** with `console` and `activityLogger.log` spied, `createRequest` and `completeRequest` for account `1234567890` never pass the string `1234567890`; the broadcast payload has no account number.
  - **`getStatus`:**
    - live 255000 with a pending 200000 → `available_idr 55000`;
    - `saldo_menu_visible` is false for a Google patient with no history in production mode;
    - true for a review account in sandbox;
    - true for a patient whose only history is an old refund request.
  - **concurrency:** two `createRequest` calls racing on a stub where the second sees the first's hold → one 400.
  - **`completeRequest`:**
    - creates exactly one refund with reason "Pencairan atas permintaan pasien #5", a transfer method and the full amount;
    - status done;
    - idempotent on a retry.
  - **cancel and reject:** both release the hold (`getPendingRefundHold` → 0).
  - **helpers:**
    - `holderNameDiffers('Budi Santoso', 'Ny. Siti Aminah')` → true;
    - `holderNameDiffers('SITI AMINAH', 'Ny. Siti  Aminah')` → false;
    - `maskAccount('1234567890')` → `'•••• 7890'`.
  - **staff routes:**
    - `GET /refund-requests` needs `billing.view`; complete and reject need `billing.reset`;
    - registry overrides resolve;
    - the account number is not in the `billing.view`-only response (masked unless `billing.reset`).
  - **socket:** `realtimePermissions.EVENT_PERMISSIONS.checkup_prepay_refund_requested === 'billing.view'`.
  - **menu source:** `MENU_ACTIVITY_SOURCES['nav-prepay']` includes `{ table: 'patient_credit_refund_requests', columns: ['created_at'] }`.
- [ ] **Step 2: Run** `vps-jest.sh 'PatientRefundRequestService|SundayClinicMarkPaidSaldo|CheckupPrepayCoverage|CheckupPrepayService|StaffPrepayRoutes|PatientCheckupPrepayRoutes|AccessControlCatalogRegistry'`. Expected: FAIL.
- [ ] **Step 3: Implement** as described under Interfaces.
- [ ] **Step 4: Run** the same command. Expected: PASS (AccessControlCatalogRegistry only with its baseline failures).
- [ ] **Step 5: Commit** `git commit -m "Let patients request saldo withdrawals and hold the requested amount"`

---

### Task 6: Staff package editor and Pencairan tab

**Files:**
- Modify: `staff/backend/routes/staff-prepay.js`:
  - remove `GET/PUT /estimate-mapping`;
  - add `GET /packages`, `GET /packages/catalog`, `POST /packages`, `PUT /packages/:id`, `PATCH /packages/:id/active`, all `verifyToken, requireSuperadmin`.
- Modify: `staff/backend/services/StaffPrepayService.js`:
  - replace `getEstimateMapping`/`saveEstimateMapping` with `listPackagesForStaff()`, `getCatalog()`, `savePackage(input, actor)`, `setPackageActive(id, active, actor)`;
  - save and activate write `activityLogger.log(actor.id, actor.name, 'Paket Bayar di Muka', <before→after summary>)`.
- Modify: `staff/backend/config/accessControlRegistry.js`: five overrides `staff-prepay:<METHOD>:<path>` → `checkup_prepay.manage_estimate`; remove the two `/estimate-mapping` overrides.
- Modify: `staff/backend/scripts/checkup-prepay-estimate.js`: drop `set` (spec) and `clear` (it also only wrote the old setting); keep `list-tindakan`; `show` prints every package with its live price.
- Modify: `staff/public/fragments/pages/prepay-page.html` and `staff/public/scripts/pages/prepay-page.js`:
  - the "Harga Estimasi" tab becomes "Paket";
  - add a "Pencairan" tab.
- Modify: `staff/public/scripts/shell/bootstrap.js` (lazy-shim names for the new `window` functions).
- Modify: `staff/public/scripts/shell/prepay-paid-toast.js`: also listen to `checkup_prepay_refund_requested`, toast "Pengajuan pencairan saldo: <nama> Rp X", refresh the red dots.
- Test: update `StaffPrepayRoutes.test.js` (remove `/estimate-mapping`, add the package routes) and `PrepayPageShell.test.js`.

**Interfaces:**
- Consumes:
  - Task 1 `savePackage`, `setPackageActive`;
  - Task 2 `normalizePackageInput`, `priceAllForStaff`, `loadCatalog`, `invalidate`;
  - Task 5 `listForStaff`, `completeRequest`, `rejectRequest`.
- Produces, the page functions exported to `window`:
  - `prepayShowTab('packages'|'refund-requests'|…)`
  - `prepayLoadPackages`, `prepayEditPackage(id|null)`, `prepayAddPackageItem(type)`, `prepayRemovePackageItem(index)`, `prepaySavePackage`, `prepayTogglePackage(id)`
  - `prepayLoadRefundRequests`, `prepayCompleteRefundRequest(id)`, `prepayRejectRefundRequest(id)`
- **Tab visibility:**
  - "Paket" keeps today's check `prepay-page.js:47`, `hasAccountPermission?.('checkup_prepay.manage_estimate')` (renamed `canEditPackages`). The permission is protected and non-delegable, so only doctor and superadmin hold it, which now matches `requireSuperadmin` on the routes.
  - "Pencairan" shows with `hasAccountPermission?.('billing.view')`. Its buttons show with `hasAccountPermission?.('billing.reset')`.
- **List columns:** package, category, week range, live estimate, ready or not ready (with the issues), active toggle, sort order.
- **Editor UI** per mockup v3:
  - fields: name, description, category, "minggu dari–sampai" (Kehamilan only), item rows (type, picker, quantity, live subtotal);
  - buttons "+ Tambah tindakan" and "+ Tambah obat"; the admin line is shown, not editable;
  - the live total is labelled "dihitung dari harga saat ini";
  - a line "Paket lain di minggu yang sama: …" listing the other active Kehamilan packages whose range overlaps.
- **Pencairan rows:**
  - the "nama berbeda" badge;
  - "Sudah ditransfer" asks `confirm('Pastikan Rp X sudah ditransfer ke <bank> <rekening> a.n. <nama>.')`;
  - "Tolak" asks for a note.

- [ ] **Step 1: Write the failing tests:**
  - **routes:**
    - `POST /packages` by staff holding `billing.reset` and `checkup_prepay.manage_estimate` (not superadmin) → 403;
    - by superadmin (`is_superadmin: 1`, `role_id: ROLE_IDS.ADMIN`) → 200;
    - by doctor → 200;
    - `resolveRouteAccess` for all five → `checkup_prepay.manage_estimate`;
    - `/estimate-mapping` → 404;
    - a save with a consultation item → 400 with the message.
  - **page shell:**
    - fragment ids `prepay-panel-packages` and `prepay-panel-refund-requests`;
    - every `onclick` `window.X(` exported;
    - the "nama berbeda" copy;
    - "Sudah ditransfer" behind `hasAccountPermission?.('billing.reset')`;
    - "dihitung dari harga saat ini";
    - no "Harga Estimasi" and no `/estimate-mapping`;
    - `prepay-paid-toast.js` contains `checkup_prepay_refund_requested`.
  - **activity log:** `savePackage` calls `activityLogger.log` with action `'Paket Bayar di Muka'`.
- [ ] **Step 2: Run** `vps-jest.sh 'StaffPrepayRoutes|PrepayPageShell|AccessControlCatalogRegistry|Task10FinanceTeamAccess'`. Expected: FAIL.
- [ ] **Step 3: Implement** as described under Interfaces.
- [ ] **Step 4: Run** the same command. Expected: PASS (baseline excepted).
- [ ] **Step 5: Check the editor and Pencairan tab in the local harness** (Python server + stubbed `staff-api.js`, as in Tahap 2) at 375 px and 1280 px:
  - create a package with one tindakan and one obat → the PUT body;
  - the week fields show only for Kehamilan;
  - "Sudah ditransfer" → the POST.
  - Delete the temporary `launch.json` after the check.
- [ ] **Step 6: Commit** `git commit -m "Add the package editor and the withdrawal requests tab to Pembayaran di Muka"`

---

### Task 7: Home page cards from active packages

**Files:**
- Modify: `public/sisiwanita/index.html` (`#checkup-estimates`: replace the four `<article data-estimate-card>` with `<div class="ce-groups" data-estimate-groups></div>` plus a static `<p class="ce-fallback" data-estimate-fallback hidden>`)
- Modify: `public/scripts/landing/checkup-estimates.js`
- Modify: `public/styles/landing-checkup-estimates.css` (group headings; no transitions)
- Test: update `CheckupPrepayContract.test.js` (home page block)

**Interfaces:**
- Consumes: Task 2 public estimates (`code, name, category, week_min, week_max, sort_order, amount_idr, items`).
- Produces:
  - `renderGroups(container, estimates)`, built with DOM APIs only (no `innerHTML`):
    - group order `obstetri` ("Kehamilan"), `gyn_repro` ("Program Hamil"), `gyn_special` ("Ginekologi");
    - inside a group, sorted by `week_min` (null last), then `sort_order`;
    - each card shows the name, "<min>–<max> minggu" when a range is present, the item lines, "Rp<amount>", and the CTA `/bayar-estimasi.html?kategori=<code>`.
  - Dispatches `landing:layout-changed` after rendering, as today.
  - On a fetch error, shows the fallback "Estimasi segera tersedia. Hubungi klinik untuk informasi biaya."
  - The kicker "Layanan Sisiwanita", the lead (QRIS / VA) and the note stay, with "dapat dicairkan ke rekening Anda lewat portal" replacing "dikembalikan atas permintaan".

- [ ] **Step 1: Write the failing tests** (contract):
  - `data-estimate-groups` is present;
  - no `data-estimate-card="obstetri"`;
  - the module has `renderGroups` and contains `'landing:layout-changed'`, `createElement` and no `innerHTML`;
  - the note contains "dapat dicairkan ke rekening Anda lewat portal";
  - the section still has "QRIS atau Virtual Account" and "tagihan akhir mengikuti tindakan", and no "dr. Dibya".
  - Update the old assertions that pinned the four cards and links.
- [ ] **Step 2: Run** `vps-jest.sh 'CheckupPrepayContract|FrontendModularizationStage2|WebHardeningPlan'`. Expected: FAIL.
- [ ] **Step 3: Implement** as described under Interfaces.
- [ ] **Step 4: Run** the same command. Expected: PASS (Wave6 exit-guard baseline excepted).
- [ ] **Step 5: Check in the browser** (Python server on `public/`, with `/api/public/checkup-estimates` stubbed through an `?mockApi=1` hook or a local JSON fixture):
  - 375 px static stack and 1280 px sticky stack keep the 55 px rhythm;
  - 6 packages across 3 groups render in order.
- [ ] **Step 6: Commit** `git commit -m "Render home page estimate cards from the active prepay packages"`

---

### Task 8: Booking offer and the pay-now choice

**Files:**
- Modify: `public/booking-klinik.html` (step 4 card, success screen, `findPrepayOption` replaced)
- Test: update `CheckupPrepayContract.test.js` (booking block)

**Interfaces:**
- Consumes:
  - `GET /api/patient/checkup-prepay/status` (`availability.available`, and `available_idr` from Task 5);
  - Task 4 `GET /suggestion`.
- Produces, inside `booking-klinik.html`:
  - `loadPrepayOffer(category, date)`, called when step 4 is shown.
    - If availability is false, it renders nothing.
    - Otherwise it calls `/suggestion`, then renders the card:
      - for obstetri with weeks, the hint "Usia kehamilan Anda pada <tanggal> ± N minggu (dari HPHT/HPL terakhir)";
      - a `<select id="prepay-package-select">` of the category's packages, preselected with `suggested_code`, or empty with "Pilih paket sesuai usia kehamilan";
      - the item lines and the estimate;
      - the three bullets from mockup v3.
    - Selection is stored in `bookingData.prepayPackageCode` and in `sessionStorage['booking-prepay-package']`.
  - **Success screen:**
    - when a package is chosen and available: "Mau bayar sekarang?", name, amount, "Bayar sekarang (QRIS / VA)" → `/bayar-estimasi.html?kategori=<code>`, and "Bayar saat periksa" → `/patient-menu.html`;
    - when `available_idr ≥ amount`: "Saldo Anda Rp X sudah menutup estimasi" plus "Ke portal";
    - otherwise today's 3-second redirect.
  - All patient-visible strings are set with `textContent`.

- [ ] **Step 1: Write the failing tests** (contract):
  - the page contains `loadPrepayOffer(`, `/api/patient/checkup-prepay/suggestion` and `prepay-package-select`;
  - the copy: "Perkiraan biaya kunjungan", "Pilih paket sesuai usia kehamilan", "Mau bayar sekarang?", "Bayar sekarang (QRIS / VA)", "Bayar saat periksa", "sudah menutup estimasi";
  - the offer is gated by `availability?.available`;
  - the booking POST body is unchanged: the same keys, no package fields;
  - the old `findPrepayOption` regex is gone.
- [ ] **Step 2: Run** `vps-jest.sh 'CheckupPrepayContract|AllClinicConfirmationCopy|WebHardeningPlan'`. Expected: FAIL.
- [ ] **Step 3: Implement** as described under Interfaces.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Check in the browser harness** (stubbed `/status`, `/suggestion`, `/book` responses):
  - suggested package preselected;
  - switching updates the total;
  - unknown weeks → empty select with the prompt;
  - not available → no card;
  - success shows both buttons;
  - the saldo-covers case;
  - 375 px with no horizontal scroll.
- [ ] **Step 6: Commit** `git commit -m "Offer the prepay package during booking and let the patient pay now or at the visit"`

---

### Task 9: Portal "Saldo Saya" and its menu entry

**Files:**
- Create: `public/saldo-saya.html` (viewport lock, patient shell like `bayar-estimasi.html`)
- Create: `public/scripts/saldo-saya.js`
- Modify: `public/patient-menu.html` (Aplikasi sheet entry, hidden until status allows)
- Modify: `public/scripts/portal-bottom-nav.js` (route map `'/saldo-saya.html': 'aplikasi'` only, no static list entry)
- Modify: `public/sw.js` (precache `saldo-saya.js`)
- Test: `staff/backend/tests/unit/SaldoSayaPage.test.js` (contract)

**Interfaces:**
- Consumes: Task 5 `GET /saldo`, `POST /refund-requests`, `POST /refund-requests/:id/cancel`, and `saldo_menu_visible` from `GET /status`.
- Produces:
  - **Patient menu:** `<a id="menu-saldo-deposit" href="/saldo-saya.html" hidden>` labelled "Saldo Deposit", unhidden by the page script when `status.saldo_menu_visible`.
  - **`saldo-saya.js`:**
    - Not logged in: redirect to login with `next`, after adding `/saldo-saya.html` to the safe-next allow-list.
    - Renders the balance card, "Saldo uji" for sandbox, the history, and the requests with status labels ("Diproses", "Selesai", "Ditolak", "Dibatalkan").
    - A patient with no ledger row and no request sees "Belum ada saldo deposit." and no form.
    - "Cairkan ke rekening" form with a bank select ("BCA", "BRI", "BNI", "Mandiri", "BSI", "CIMB Niaga", "Permata", "Lainnya" plus a free-text field), account number, holder name and amount (default = available).
    - "Ajukan pencairan" posts with a `request_key` kept in sessionStorage with its payload, as in the Tahap 2 refund-key fix.
    - The note says "diproses 1–2 hari kerja".
    - When only sandbox saldo exists: the form is disabled with "Saldo uji tidak dapat dicairkan".
    - A cancel button on a pending request.
    - `textContent` only.

- [ ] **Step 1: Write the failing tests:**
  - **page contract:**
    - the viewport lock;
    - `/api/patient/checkup-prepay/saldo`;
    - "Saldo Saya", "Cairkan ke rekening", "Ajukan pencairan", "diproses 1–2 hari kerja", "Saldo uji tidak dapat dicairkan";
    - no `innerHTML` with server strings;
    - `menu-saldo-deposit` is in `patient-menu.html` with `hidden`;
    - the sw.js precache entry;
    - the safe-next allow-list includes `/saldo-saya.html`;
    - "Belum ada saldo deposit.".
- [ ] **Step 2: Run** `vps-jest.sh 'SaldoSayaPage|CheckupPrepayContract|WebHardeningPlan'`. Expected: FAIL.
- [ ] **Step 3: Implement** as described under Interfaces.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Check in the browser harness** (stubbed API):
  - history, a pending request, cancel;
  - a sandbox-only account → disabled form;
  - submit → POST body with `request_key`;
  - 375 px.
- [ ] **Step 6: Commit** `git commit -m "Add the portal Saldo Saya page with withdrawal requests"`

---

### Task 10: QA script, versions, full suite, review, release

**Files:**
- Modify: `staff/backend/scripts/verify-checkup-prepay-usage-isolated.js`. Add the three new tables to the copied schemas, then assert:
  1. `migrate-prepay-packages` copies the live-like mapping;
  2. a new package with tindakan + obat prices correctly;
  3. an order for it credits its category;
  4. a refund request holds 200000 and mark-paid deducts only `live − hold`;
  5. staff complete → one refund row, hold 0.
- Modify: patient asset version `20261120prepay2` → `20261122paket1` in every file under `public/` that carries it (count before and after), plus `public/sw.js` `CACHE_VERSION`.
- Modify: `staff/public/index-adminlte.html` and `staff/public/sw.js`: the next unused staff version (`ls /var/www/dokterdibya-staff-releases`; expected `v498`).
- Modify: the spec Status line, a CLAUDE.md §44 addendum (package tables, consultation rule, hold), and memory.

- [ ] **Step 1: Run the full suite on dedicated VPS copies** (base = production main, head = this branch; never the `/tmp/tahap2-run` copy). Diff the failing lists. Expected: no failure only in head.
- [ ] **Step 2: Run the QA script on the VPS.** Expected: all asserts pass, and the scratch DB is dropped (0 `codex_prepay_qa_*` left).
- [ ] **Step 3: Final whole-branch review** (fresh reviewer, most capable model) with this plan's Review Focus. Then the fix pass.
- [ ] **Step 4: Merge and deploy** (Boss's standing instruction):
  1. DB backup;
  2. migration twice;
  3. `node scripts/migrate-prepay-packages.js` dry run, then `--apply`;
  4. **check** that `/api/public/checkup-estimates` shows the same four amounts as before (Rp155.000, Rp265.000, Rp240.000, Rp240.000);
  5. stage staff `v498`, then the pre-cutover verifier;
  6. ff-merge;
  7. `pm2 reload --update-env`;
  8. post verifier and health 200;
  9. live check: the home page renders the four cards from packages, `/bayar-estimasi.html?kategori=obstetri` still works, and the staff Paket tab is visible to the doctor.
- [ ] **Step 5: Commit the docs and memory updates.** Report to Boss: what is live, what stays off until go-live (the booking offer and Saldo menu show only for payable accounts), and the deferred items.

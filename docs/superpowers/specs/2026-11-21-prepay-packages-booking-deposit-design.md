# Bayar di muka, Tahap 3: editable packages, deposit at booking, refund requests

Status: Deployed 2026-11-21 (PR #37, b9d72bbd2; staff assets v498, patient assets 20261122paket1). The four existing products were copied to packages with unchanged prices. Booking offer and Saldo menu show only for accounts that can pay (review accounts until `CHECKUP_PREPAY_LIVE`).
Builds on: `2026-11-18-checkup-prepay-duitku-review-design.md` (Tahap 1) and `2026-11-20-checkup-prepay-tahap-2-design.md` (Tahap 2, live).
Approved mockup: v3 (booking Konfirmasi with suggested package, success screen choice, portal Saldo, staff package editor).

## Why

Boss wants the cashier to be faster, the visit to feel seamless, and paying to be easier for patients.

Today patients barely see the prepay offer:
- it is a small link after a successful booking, plus four fixed cards on the home page;
- staff cannot change what the "packages" contain, because the four products are fixed in code (`constants/checkupPrepayProducts.js`) and hold tindakan only;
- a patient who wants unused saldo back has to ask the clinic.

## Decisions (Boss)

- **The deposit stays optional.** It is not tied to attendance confirmation or to the 14:00 auto-cancel. Booking itself is unchanged.
- **The offer is part of booking.** On the Konfirmasi step the patient sees the package estimate and three explanations:
  - the deposit is deducted from the bill automatically;
  - the final bill follows the care actually given;
  - leftover saldo stays and can be withdrawn to the patient's bank account through the portal.
  After the booking succeeds, the patient chooses **"Bayar sekarang (QRIS / VA)"** or **"Bayar saat periksa"**.
- **Packages are edited in the staff panel** by superadmin and doctor. A package has:
  - a name and a booking category;
  - for Kehamilan, a **gestational-week range**;
  - items that are **tindakan and/or obat**, with quantities.
- **Price is computed from the items (A):** current tindakan price + current obat price + the admin fee, exactly as today. There is no fixed or discounted package price.
- **No consultation in any package:** Konsultasi, Konsul Singkat and Konseling are never part of a package. The live mapping was already changed this way on 2026-11-20.
- **Refunds go through a request in the patient portal:** the patient enters bank, account number, holder name and amount; staff transfer by hand and record it.
  - Duitku Disbursement was not chosen. It needs a verified business-entity Duitku account and costs Rp5.000 per transfer.
- **Home page framing:** packages are offered by Sisiwanita, not by the doctor personally (live since PR #36). Prices keep the "Rp" form until Duitku approves the merchant; the "255K" format is a separate change after approval.
- **Approach 1:** packages live in their own tables (below).

### Confirmed with mockup v3 (my proposals, accepted)

- **Suggested package.** Booking suggests a Kehamilan package for the patient's gestational age on the appointment date. The age comes from the latest HPHT or HPL. The patient can switch to any other active package of the category. When the age is unknown, the patient picks.
- **Week ranges may overlap** (Boss, 2026-11-21, replacing the mockup's "no overlap"). Variants such as "20–24 minggu" and "20–24 minggu + USG 4D" can both be active.
  - The suggestion is the first package by `sort_order` whose range contains the week.
  - A Kehamilan package without a range means "semua usia". It is suggested only when no ranged package matches.
  - Bounds are inclusive, in completed weeks.
  - Promil and Ginekologi packages have no week range.
- **Payout rules** (Boss, 2026-11-21):
  - The clinic pays the transfer fee, so the patient receives exactly the requested amount.
  - The account may belong to someone else, for example the husband.
  - When the holder name differs from the patient name, the Pencairan list shows a "nama berbeda" flag for staff to check before transferring.
- **Admin fee.** It is added once per package automatically and cannot be picked.
- **Deactivating a package** never changes saldo already paid.
- **A pending refund request holds** its amount: that part of the saldo is not used for a bill while staff process it.
- **Portal Saldo page.** A new "Saldo Saya" page in the portal. The patient copy says requests are "diproses 1–2 hari kerja".

## Goals

1. The superadmin or doctor can create, edit and deactivate prepay packages (tindakan + obat, week range for Kehamilan) in the staff panel.
2. Active packages appear on the home page, grouped by category, priced live, still meeting Duitku's "products + Rupiah prices" rule.
3. During booking, the patient sees the right package and its estimate before confirming. After booking, the patient can pay now or at the visit.
4. The patient sees their saldo and its history in the portal and can request a withdrawal to a bank account.
5. Staff see withdrawal requests, transfer the money, and close the request with one action that records the refund.

## Non-goals

- Automatic payouts (Duitku Disbursement).
- A fixed or discounted package price.
- Changing the booking API, attendance confirmation, queue or auto-cancel.
- The "K" price format (after Duitku approval, separate change).
- Xendit and WhatsApp.
- Deducting saldo from additional bills (unchanged from Tahap 2).

## Anti-goals

- A package that silently contains a consultation item.
- A suggestion that depends on luck: with overlapping ranges it must always be the same package for the same week (first by `sort_order`, then by id).
- A package price shown to a patient that differs from what checkout charges at that moment (both come from the same live pricing).
- Old orders, saldo or links breaking because product codes moved into a table.
- A bank account number visible to staff who cannot record refunds, or written to logs.
- Saldo under a pending withdrawal request being deducted at the cashier.

## Constraints found in the code

**Why Estimasi Biaya cannot be reused.** "Estimasi Biaya Kehamilan" (`routes/estimasi-biaya*.js`, `services/EstimasiBiayaDraft.js`) is a trimester simulator for logged-in patients. It has:
- no named packages, categories, week ranges or active flag;
- obat copied from prescription templates;
- publishing done by CLI only.

**What reads the four product codes today.** The prepay estimate is `services/CheckupEstimateService.js` (settings key `checkup_prepay_estimate_v1`, tindakan only, max 20 items, quantity 1–10, admin #1 added once, minimum Rp10.000). The codes `obstetri | obstetri_usg4d | gyn_repro | gyn_special` are read by:
- `payment_orders.product_code` (VARCHAR(40));
- `PatientCreditLedger.creditFromPaidOrder` (category via `productCategory`);
- `CheckupPrepayService` (validation, order reuse, labels);
- `CheckupPrepayNotifier`, `StaffPrepayService`;
- `public/scripts/checkup-prepay.js` (`CATEGORY_PATTERN`) and `public/scripts/patient-safe-next.js` (same regex);
- the four hard-coded `<article data-estimate-card>` cards in `public/sisiwanita/index.html` and `public/scripts/landing/checkup-estimates.js`;
- `public/booking-klinik.html` `findPrepayOption`;
- tests: `CheckupPrepayContract`, `CheckupPrepayProducts`, `CheckupEstimateService`, `CheckupPrepayService` and `CheckupPrepayNotifier`;
  - `PremiumPaymentService.test.js:727-735` (`obstetri_usg4d` and an unknown code);
  - `StaffPrepayRoutes.test.js:57-58,101-104` and `PrepayPageShell.test.js:63` (doctor-only `/estimate-mapping`, replaced by the package routes).

**Prices.**
- `obat.price` is the selling price; `obat.is_active` is the active flag; `obat.category` is free text.
- `tindakan.price`, `is_active` and `category` (`LAYANAN` / `TINDAKAN MEDIS`) are the tindakan fields.

**Gestational age.**
- HPHT is `medical_records.record_data $.hpht` (`record_type='anamnesa'`) on `sunday_clinic_records` with `mr_category='obstetri'`. See `routes/patients.js:663-684`.
- Anamnesa can also carry a typed HPL: `$.hpl` (`components/obstetri/anamnesa-obstetri.js:87,150`).
- **USG HPL is stored in two shapes** (correction from review):
  - older records: top-level `$.edd` (`sections/usg.js:964-1017`, read by `routes/patients-auth.js:2404-2418`);
  - current Sunday Clinic USG saves: nested `$.trimester_1|2|3.edd` together with `$.current_trimester` (`sunday-clinic/main.js:1963-2021`, `components/obstetri/usg-obstetri.js:1085-1209`).
  The helper must read both.
- `sunday-clinic/shared.js calculateGestationalAge` measures against *now* and uses `toISOString`. Booking needs weeks on the *appointment date* in local dates, so a new pure helper is required.
- The existing pregnancy tracker hides an HPL once it is more than 14 days past (`patients-auth.js:2463-2471`).

**Access and Duitku.**
- Patients reach `/api/patient/*` through the server-wide whitelist.
- Doctor and superadmin bypass the account boundary.
- The Tahap 2 estimate editor is `requireDoctorRole` + protected `checkup_prepay.manage_estimate`. Boss now wants superadmin too.
- QRIS is ShopeePay (`SP`) since PR #35. Production saldo is not spendable until `CHECKUP_PREPAY_LIVE=true`, which is after Duitku approval. Until then only review accounts can pay in sandbox, and the booking offer shows only where `getAvailability` says the patient can pay.

## Approaches considered

1. **Package tables (chosen).**
   - `checkup_prepay_packages` plus `checkup_prepay_package_items`.
   - The four current products become rows with the same codes.
   - Pricing, the home page and booking read active packages.
   - Pros: stable identity per package, validation (week ranges, banned consultation items) that is easy to enforce, no whole-document overwrite when two staff edit.
   - Cons: the largest change (migration, service rewrite, dynamic home cards, tests).
2. **A larger settings JSON.**
   - Fewer files.
   - Cons: whole-document saves overwrite concurrent edits, package identity is brittle, and the same frontend and validation changes are still needed.
3. **Build on Estimasi Biaya.** Rejected for the reasons above.

## Design

### 1. Data (migration `20261122_checkup_prepay_packages.sql`)

**`checkup_prepay_packages`**
- `id INT UNSIGNED AUTO_INCREMENT PK`
- `code VARCHAR(40) NOT NULL UNIQUE`: a stable slug used in URLs, orders and tests. The existing four keep their codes; new packages get `pkg_<id>` or a slug.
- `name VARCHAR(120) NOT NULL`, shown to patients
- `description VARCHAR(255) NULL`
- `category VARCHAR(20) NOT NULL`: one of `CONSULTATION_CATEGORY_CODES`
- `week_min TINYINT UNSIGNED NULL`, `week_max TINYINT UNSIGNED NULL`: Kehamilan only; both null means "any week"
- `is_active TINYINT(1) NOT NULL DEFAULT 1`
- `sort_order INT NOT NULL DEFAULT 0`
- `created_by VARCHAR(64) NULL`, `updated_by VARCHAR(64) NULL`, timestamps

**`checkup_prepay_package_items`**
- `id`, `package_id` (FK, cascade delete)
- `item_type ENUM('tindakan','obat') NOT NULL`
- `ref_id INT NOT NULL`
- `quantity SMALLINT UNSIGNED NOT NULL`
- `sort_order`
- `UNIQUE (package_id, item_type, ref_id)`

**`patient_credit_refund_requests`**
- `id`, `patient_id VARCHAR(50)`, `amount_idr INT UNSIGNED`
- `bank_name VARCHAR(60)`, `account_number VARCHAR(40)`, `account_holder VARCHAR(120)`
- `status ENUM('pending','done','rejected','cancelled') NOT NULL DEFAULT 'pending'`
- `request_key VARCHAR(80) UNIQUE`
- `refund_id BIGINT UNSIGNED NULL`, linking to `patient_credit_refunds` when done
- `decision_note VARCHAR(500) NULL`, `decided_by VARCHAR(64) NULL`, `decided_at`, `created_at`
- `KEY (status, created_at)`, `KEY (patient_id, status)`
- utf8mb4_unicode_ci

All tables are created in the migration only, never at runtime.

**Data copy.** `scripts/migrate-prepay-packages.js [--apply]`, idempotent, dry run by default:
- creates the four packages from the current `checkup_prepay_estimate_v1` mapping (same codes, names, categories, tindakan items, week range null);
- leaves the settings row in place as a backup.

### 2. Pricing (`CheckupEstimateService` rewritten around packages)

**`priceAll({ fresh })`**
- Loads active packages and their items, then the referenced `tindakan` and `obat` rows.
- Prices each package: admin #1 once + Σ(price × quantity), rounded up.
- A package is **ready** only when:
  - every item exists, is active and has a price;
  - every tindakan is `LAYANAN` / `TINDAKAN MEDIS` and is **not a consultation** (below);
  - the total ≥ Rp10.000.
- Not-ready packages are hidden from patients and shown with their issues in the editor.
- 60-second cache for the public endpoint. `pricePackage(code)` is always fresh for checkout.

**Consultation rule (my call).** A tindakan whose name matches `/\bkonsul|konseling/i` (today #40 Konsultasi, #56 Konsul Singkat, #42 and #58 Konseling) cannot be saved into a package. It is not offered in the editor, and if a renamed or legacy one is found it marks the package not ready.

**Limits:**
- at most 20 items;
- tindakan quantity 1–10;
- obat quantity 1–200;
- no duplicate item;
- admin #1 refused as an item.

**`toPublicEstimate`** now also returns `code`, `name`, `category`, `week_min`, `week_max` and `sort_order`. Item lines show name, quantity and subtotal, with no ids.

### 3. Product codes become package codes

**`constants/checkupPrepayProducts.js`** becomes a thin adapter over the package table:
- `productCategory(code)` reads the package (cached).
- An order's category is also stored in its `item_snapshot`, so a later edit or deactivation never changes which saldo category a paid order credits. `creditFromPaidOrder` reads the snapshot category first.

**Browser allow-lists** (`checkup-prepay.js`, `patient-safe-next.js`) change from the fixed four codes to the generic pattern `/^[a-z0-9_]{2,40}$/`. The server validates that the package exists and is ready.

**Existing orders, saldo and links keep working**, because the four codes are kept as rows.

### 4. Staff editor (Pembayaran di Muka → tab "Paket", replaces "Harga Estimasi")

**Who can use it.**
- Superadmin and doctor (`requireSuperadmin`).
- **Every package route needs its own `ROUTE_PERMISSION_OVERRIDES` entry** mapping it to protected, non-delegable `checkup_prepay.manage_estimate`: `GET /packages`, `GET /packages/catalog`, `POST /packages`, `PUT /packages/:id`, `PATCH /packages/:id/active`. *(correction from review)*
  - Without them, the `staff-prepay` source policy maps POST/PUT/PATCH to `billing.reset` and GET to `billing.view` (`accessControlRegistry.js:133`).
  - `requireSuperadmin` admits staff delegated the route's permission (`middleware/auth.js:507-510`), so `billing.reset` holders could edit packages.
- The tab shows for doctor or superadmin. This also fixes the Tahap 2 minor where a superadmin saw a tab they could not use.

**List.** Package, category, week range, live estimate, ready / not-ready with issues, active toggle, sort.

**Editor.**
- Fields: name, description, category, week from–to (Kehamilan only), and item rows (type, picker, quantity, live subtotal).
- Buttons: "+ Tambah tindakan" and "+ Tambah obat".
- The admin line is automatic. The live total is labelled "dihitung dari harga saat ini".
- The pickers list active tindakan (allowed categories, no consultation) and active obat with their prices.

**Server-side validation.**
- Week range: both empty, or 0 ≤ min ≤ max ≤ 45 (Kehamilan only; other categories must leave it empty).
- Overlapping ranges are allowed. The editor shows which other active packages cover the same weeks, so the order is a deliberate choice.
- Category valid; item limits; consultation refused.

**Audit.** Each save and each activate/deactivate writes the actor plus before/after into the activity log. This closes the Tahap 2 minor "price changes leave no audit trail".

**API** under `/api/staff-prepay` (paths avoid "payment" / "paid"):

| Method and path | Purpose |
|---|---|
| `GET /packages` | list with pricing |
| `GET /packages/catalog` | pickable tindakan + obat |
| `POST /packages` | create |
| `PUT /packages/:id` | update |
| `PATCH /packages/:id/active` | activate or deactivate |

The old `/estimate-mapping` routes are removed, together with the CLI `set` command. The CLI keeps `list-tindakan` and `show`.

### 5. Home page

- The four hard-coded cards are replaced by a container that `landing/checkup-estimates.js` fills from `/api/public/checkup-estimates`. Cards are grouped by category (Kehamilan, Program Hamil, Ginekologi), and Kehamilan is sorted by `week_min`.
- Each card shows name, week range ("20–24 minggu"), item lines, the price in "Rp…" form, and the CTA `/bayar-estimasi.html?kategori=<code>`.
- A static fallback line stays for when the API fails. The Sisiwanita framing and the notes (estimate, deducted from the bill, can be withdrawn) stay.
- The section must re-dispatch `landing:layout-changed` after rendering, because the sticky "Fitur Portal SW" stack below re-measures on it.

### 6. Booking (`public/booking-klinik.html`)

**Step 4, Konfirmasi.** When `GET /api/patient/checkup-prepay/status` says the patient can pay, a card shows:
- **Kehamilan:**
  - "Usia kehamilan Anda pada <tanggal> ± N minggu (dari HPHT/HPL terakhir)" plus the suggested package, with a select to switch;
  - if the age is unknown, the select starts empty with "Pilih paket sesuai usia kehamilan".
- **Other categories:** the package select (usually one package).
- **In all cases:** the item lines, the estimate and the three explanation bullets from mockup v3.

**New endpoint `GET /api/patient/checkup-prepay/suggestion?date=YYYY-MM-DD&category=<code>`.**
- Returns `{ weeks, days, source: 'hpht'|'hpl'|null, suggested_code, packages:[public estimates of that category] }`.
- Weeks are counted on the appointment date with a new pure helper `gestationalWeeksOn(reference, onDate)` (local dates, no `toISOString`). *(my call, from review)*
  - **Candidates:** USG HPL (top-level `edd`, or `trimester_<current_trimester>.edd`, else the latest non-empty `trimester_N.edd`), anamnesa HPL (`hpl`) and anamnesa HPHT (`hpht`).
  - **Choice:** the candidate from the **most recent record** wins (by record save time), not by source type. An HPL converts as weeks = 40 − (HPL − date)/7.
  - **Unknown when:** the result is below 0 or above 42 weeks, or the HPL is more than 14 days before the appointment date (same rule as the pregnancy tracker). Then `weeks: null` and the patient picks.
  - The patient sees "± N minggu". No days are shown.
- No-store headers; the patient's own data only.

**The booking request itself is unchanged.** The chosen package code is kept in memory (and sessionStorage) for the success screen.

**Success screen.** "Mau bayar sekarang?" with package name and total, then:
- "Bayar sekarang (QRIS / VA)" → `/bayar-estimasi.html?kategori=<code>`;
- "Bayar saat periksa" → portal.

If the patient's live saldo already covers the estimate, the card instead shows "Saldo Anda Rp X sudah menutup estimasi" plus "Ke portal". *(my call)*

**When the patient cannot pay** (production before go-live, or a non-review account in sandbox), nothing new is shown. That is today's behaviour.

### 7. Portal "Saldo Saya" (new `public/saldo-saya.html` + `public/scripts/saldo-saya.js`)

**Menu.** A new "Saldo Deposit" entry in the portal Aplikasi menu (`patient-menu.html`). *(my call, from review)*
- Shown only when the patient can pay now (`getAvailability`) or already has any saldo history. Before go-live that means review accounts only.
- The page itself answers any logged-in patient. Without history it says that there is no saldo yet.

**Sandbox saldo cannot be withdrawn.** *(my call, from review)*
- Requests, holds and the refund they create are live only, as in Tahap 2.
- Review accounts see their "Saldo uji" and a disabled form with "Saldo uji tidak dapat dicairkan".
- The full withdrawal flow is proven by the isolated QA script, not on production.

**Content.**
- Live balance, plus sandbox balance labelled "Saldo uji" for review accounts.
- History: deposit, deducted for a bill (date), retur back to saldo, refund.
- Pending and closed withdrawal requests with their status.
- The withdrawal form: bank (select of common banks + "Lainnya"), account number (digits, 6–20), holder name, amount (≤ available live saldo). One pending request at a time.

**Endpoints** under `/api/patient/checkup-prepay`, no-store, the patient's own data:

| Method and path | Purpose |
|---|---|
| `GET /saldo` | balances, available-to-withdraw, history (last 100), requests |
| `POST /refund-requests` | `{amount_idr, bank_name, account_number, account_holder, request_key}` |
| `POST /refund-requests/:id/cancel` | only while pending |

**Data handling.** The full account number is shown only to its owner and to staff with `billing.reset`. Elsewhere it is masked (`•••• 1234`), and it is never logged.

### 8. Hold while a request is pending

- `PatientCreditLedger` gets `getPendingRefundHold(executor, patientId, { forUpdate })`: the sum of pending request amounts.
- Everywhere saldo is planned (`lockLiveBalances` callers: mark-paid, retur credit is unaffected, staff refund), the usable amount is `live − hold`:
  - mark-paid's plan is capped by it;
  - `CheckupPrepayCoverage` previews with it;
  - a direct staff refund cannot dip into held saldo, except when it is the completion of that very request.
- `POST /refund-requests` locks the patient's live rows (same lock order as Tahap 2) before checking `amount ≤ live − hold`.

### 9. Staff: withdrawal requests (Pembayaran di Muka → tab "Pencairan")

**List.**
- Pending first, then patient, amount, bank, account number, holder and date.
- A "nama berbeda" badge appears when the holder name differs from the patient name: case-insensitive, after trimming titles and extra spaces.
- The amount shown is what the patient receives. The transfer fee is the clinic's and is not deducted from saldo.

**Close a request.**
- "Sudah ditransfer" (`billing.reset`): in one transaction, lock, then create the refund (`patient_credit_refunds` + ledger rows, method `transfer`, reason "Pencairan atas permintaan pasien #id"), then set the request `done` with `refund_id`.
- "Tolak" requires a note. The request becomes `rejected` and the hold is released.
- Both are idempotent per request.

**Notification.**
- A new socket event `checkup_prepay_refund_requested` (billing.view) shows a panel toast.
- `menu-activity-sources` `nav-prepay` also reads `patient_credit_refund_requests` (`created_at`), so the red dot lights up.

### 10. Versions and deploy

- Patient assets change: booking, bayar-estimasi, saldo page, landing JS, `sw.js` precache. Bump `public/sw.js` `CACHE_VERSION` and the patient asset version used by those pages.
- Staff assets change (prepay page, shell), so bump to the next unused `vNNN` with release staging first.
- Deploy order:
  1. DB backup;
  2. run the SQL migration (from the fetched commit) twice;
  3. stage staff assets v498 + pre-cutover verifier;
  4. ff-merge (the migrate script and `PrepayPackageRepository.js` exist on the server only after this);
  5. `node scripts/migrate-prepay-packages.js` dry run, then `--apply`;
  6. `node scripts/checkup-prepay-estimate.js show`: expect Rp155.000 / Rp265.000 / Rp240.000 / Rp240.000;
  7. `pm2 reload ... --update-env` promptly (until then the old process ignores packages);
  8. post verifier, health 200, and `/api/public/checkup-estimates` shows the same four amounts.

## Tests

- **Pricing:** tindakan + obat totals, admin once, ceil, minimum, not-ready on inactive or missing items, consultation refused in both name forms, limits, duplicates.
- **Package validation:** ranges in bounds; a range is only allowed on Kehamilan; category check; `requireSuperadmin` plus the five route overrides (superadmin and doctor pass, staff delegated `billing.reset` or `billing.view` do not).
- **Suggestion with overlaps:**
  - two active packages cover the week → the lower `sort_order` wins, ties broken by id;
  - a ranged match beats a "semua usia" package;
  - no ranged match → the "semua usia" package;
  - neither → no suggestion.
- **Pencairan:** the "nama berbeda" badge for a different holder; the amount received equals the amount debited from saldo.
- **Codes:** existing four codes still credit the right category; a new package code credits its category from the order snapshot even after the package is edited or deactivated.
- **Suggestion:** HPL beats HPHT, weeks on the appointment date (not today), unknown → `weeks: null`, a week outside all ranges → no suggestion, other patients' data never read.
- **Hold:**
  - mark-paid plans `live − hold`;
  - a request above available saldo is refused;
  - two concurrent requests → one succeeds;
  - "Sudah ditransfer" creates exactly one refund and releases the hold;
  - "Tolak" and patient cancel release it.
- **Home page:** cards render from the API grouped and sorted, fallback on error, `landing:layout-changed` fired, CTA codes match package codes, no "dr. Dibya", the Rupiah format is kept.
- **Booking:** the offer shows only when available, suggestion and switch work, the success screen choice links, and the saldo-covers case.
- **Isolated QA script** on a scratch DB (real schemas): migrate packages → price → order → paid credit by snapshot category → refund request hold → mark-paid capped → staff completes request.

## Left to the builder

- Exact layout and wording beyond the strings above, following mockup v3.
- The bank list contents.
- Package slug generation for new packages.
- Query shapes.
- Placement of the "Saldo Deposit" menu item.

# Bayar estimasi kunjungan di muka (Duitku) and merchant review readiness

Status: Tahap 1 implemented (review readiness, sandbox). Tahap 2 (automatic deduction from the bill) not built.

## Why

Duitku approves the merchant only when the registered site (https://sisiwanita.id) shows, on its home page:
- products with a description and a Rupiah price;
- support email, phone and business address;
- a working checkout up to payment, integrated with the Duitku sandbox.

It also needs a customer test account that stays active for 60 working days.

The product chosen by Boss is the **estimated cost of one Klinik Privat visit, paid in advance (optional)**. The premium "Paket Kehamilan" is not sold; its code stays, inactive and unlinked.

## Decisions

- **Product.** One estimate per booking category (`obstetri`, `gyn_repro`, `gyn_special`, labels in `constants/consultationCategories.js`).
  - The amount is the sum of the configured tindakan, priced live from `tindakan`, plus the admin fee (`EstimasiBiayaDraft.MANDATORY_SERVICE_IDS.admin`). It is rounded up to whole rupiah, with a minimum of Rp10.000.
  - Medication and control books are not included.
- **Money becomes saldo** (approach C).
  - A paid order adds a `prepay` row to `patient_credit_ledger` for the category. It is not tied to a booking, so booking code, the clinic queue and the 14:00 auto-cancel are untouched.
  - Cancellation or no-show keeps the saldo; refunds are manual, on request.
- **Entry points.**
  - Home page cards ("Bayar di muka" → `/bayar-estimasi.html?kategori=`).
  - The prepay page itself.
  - An optional button on the booking success screen, shown only when the patient can pay now.
- **Who may pay** (`CheckupPrepayService.getAvailability`, read per request):

  | Condition | Prepay checkout |
  |---|---|
  | Duitku not configured | nobody |
  | Sandbox (`DUITKU_PRODUCTION` not `true`) | only active review accounts |
  | Production, `CHECKUP_PREPAY_LIVE` not `true` | nobody |
  | Production, `CHECKUP_PREPAY_LIVE=true` | every patient |

- **Mode on every row.** Orders and ledger rows carry `gateway_mode` (`sandbox` / `live`). **Sandbox saldo must never be spent on a real bill.**
- **Shared order table.** Orders reuse `payment_orders` (`order_type='checkup_prepay'`, `product_code`, `item_snapshot`; ref `DPK-<uuid>`).
  - Callback, reconciliation and row locking stay in `PremiumPaymentService`.
  - `applyPaidOrder` hands a paid non-premium order to its `fulfillers[order_type]` inside the same transaction. An unknown type rolls back, so Duitku retries.
  - The ledger's UNIQUE `(source_type, source_id, entry_type)` key makes credit idempotent.
- **Review accounts.**
  - The `patient_review_accounts` table holds a bcrypt hash, `expires_at` and `revoked_at`.
  - `POST /api/patients/review-login` returns the same token and response shape as the Google login, behind a dedicated rate limit (10 failures per 15 minutes per IP).
  - Unknown emails still run a bcrypt compare. Expired or revoked status is only revealed after a correct password.
  - Accounts are managed with `scripts/patient-review-account.js` (default 120 days, which covers 60 working days). The password is printed once on the server terminal.
- **Return URL.** The default Duitku return URL is now `https://sisiwanita.id/patient-menu.html`. Prepay orders pass `/bayar-estimasi.html?order=<ref>`.

## Endpoints

- `GET /api/public/checkup-estimates`
  - No login and no-store.
  - Returns ready categories only, without ids.
- `GET /api/patient/checkup-prepay/status`
  - Returns availability, estimates, saldo, the last 5 orders and the payment methods.
- `POST /api/patient/checkup-prepay/checkout` with `{category, payment_method}`
  - The amount is always priced on the server.
- `GET /api/patient/checkup-prepay/orders/:ref`
- `POST /api/patients/review-login`

Patient route rules are in `security/patientRouteAccess.js`. Demo sessions are blocked by `patientDemoGuard` (paths containing `pay`).

## Tahap 2 interface (not built)

- **Deduction.** When a Klinik Privat bill is paid, insert `usage` rows (negative `amount_idr`, `source_type='sunday_clinic_billing'`, `gateway_mode='live'` only) and reduce the amount to collect.
  - Hook points: `sunday_clinic_billings` and `routes/billing-payment.js` `handlePaymentSuccess`.
  - Closing: the prepayment lands on a different accounting date than the visit.
- **Refunds.** Insert `refund` rows with `source_type='staff'` and `created_by`.
- **Staff editor.** A panel editor for the tindakan mapping, which is CLI-only today.
- **Go-live.** Only after Tahap 2 is deployed: production keys, then one small real payment, then `CHECKUP_PREPAY_LIVE=true`.

## Deploy (Tahap 1, sandbox)

1. Migrations, in order:
   - `20261110_premium_payments.sql`
   - `20261118_checkup_prepay.sql`
   - `20261118_patient_review_accounts.sql`

   All are idempotent.
2. Server `.env`:
   - sandbox `DUITKU_MERCHANT_CODE` and `DUITKU_API_KEY`;
   - `DUITKU_PRODUCTION=false`;
   - `CHECKUP_PREPAY_LIVE` unset.

   Then `pm2 restart dibyaklinik-backend --update-env`.
3. In the Duitku sandbox project, set the callback URL to `https://dokterdibya.com/api/webhooks/duitku/callback`.
4. Configure the mapping:
   - `node scripts/checkup-prepay-estimate.js list-tindakan`
   - `set <kategori> <id:qty,...> --apply`
   - `show` (all three ready).
5. Create the account: `node scripts/patient-review-account.js create --email … --phone … --birth-date …`
   - Use an email without a Google account and a clinic-owned phone number.
6. Do a sandbox payment end to end, then send the credentials to Duitku yourself.

Reviewer note: use a normal browser (in-app Android webviews are blocked with 410) and do not create bookings with the test account; they reach the real clinic queue.

## Changing prices

The home page shows live prices from `tindakan`. Changing a tindakan price changes the estimate. A new order is created when the price differs from an open order.

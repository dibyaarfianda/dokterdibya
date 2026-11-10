# Premium patient packages: QRIS and virtual account via Duitku

Status: Tahap 0 and Tahap 1 implemented. Gateway chosen by Boss on 10 Nov 2026 (Duitku). Clinic billing stays on Xendit.

## Scope and rules

- Packages are prepaid periods. QRIS and VA cannot auto-debit, so "renewal" is a new invoice plus a reminder (Tahap 3).
- Clinical features are never locked. `PremiumEntitlements.NEVER_GATED_FEATURES` lists the clinical areas and `assertGateable` makes the server refuse to boot if one is added to `GATED_FEATURES`.
- Amount and period always come from `premium_plans`. A plan is sold only when `is_active = 1`. The seeded `kehamilan` plan is inactive with placeholder price Rp99.000 and 365 days until Boss decides.
- Tanya Dokter tiers can no longer be activated without a gateway: `/simulate-payment` and the unsigned `/webhook` were removed (PR #25).

## Tables (migration `staff/backend/migrations/20261110_premium_payments.sql`)

| Table | Purpose |
|-------|---------|
| `premium_plans` | code, name, `price_idr`, `duration_days`, feature keys, `is_active` |
| `payment_orders` | one invoice. `order_ref` = `PRM-<uuid>` (40 chars, Duitku `merchantOrderId` max 50), amount and `duration_days` snapshotted from the plan, QR string or VA number, `last_status_check_at` |
| `patient_entitlements` | one row per paid period. `source_order_id` is UNIQUE, so one order grants one period. A renewal starts when the running period of the same plan ends |
| `premium_payment_events` | audit log: order_created, callback_received, callback_rejected, paid, paid_after_expiry, expired, order_failed |

## Flow

1. `POST /api/patient/premium/checkout` `{plan_code, payment_method}` where `payment_method` is `qris`, `va_bni`, `va_bri`, `va_mandiri` or `va_bca`. The order row is written first, then Duitku `v2/inquiry` is called. A second tap on the same plan and method returns the open order.
2. The patient app polls `GET /api/patient/premium/orders/:orderRef`, which reads only our database. It never calls Duitku.
3. Duitku posts to `POST /api/webhooks/duitku/callback` (form-urlencoded). The route verifies `HMAC_SHA256(merchantCode + amount + merchantOrderId, apiKey)` with `timingSafeEqual`, then the service compares the amount, confirms with Check Transaction (`statusCode 00`) and activates inside a transaction with `SELECT ... FOR UPDATE`.
   - bad signature: 400. Unknown order or amount mismatch: 200 (stop retries). Status still processing or a temporary failure: 500 (Duitku retries, up to 5 times).
4. `PremiumPaymentScheduler` runs every 30 minutes (`PREMIUM_RECONCILE_CRON`). It checks at most 10 pending orders older than 10 minutes, each at most once per 30 minutes, stops at the first gateway error (Duitku blocks callers that poll Check Transaction for about an hour), activates missed payments and expires unpaid orders 2 hours after their invoice expiry. Money that arrives after expiry still activates and is logged as `paid_after_expiry`.

## Duitku facts used (docs.duitku.com/api/en, read 10 Nov 2026)

- Sandbox `https://sandbox.duitku.com/webapi/api/merchant/`, live `https://passport.duitku.com/webapi/api/merchant/`.
- Inquiry signature `HMAC_SHA256(merchantCode + merchantOrderId + paymentAmount, apiKey)`, check signature `HMAC_SHA256(merchantCode + merchantOrderId, apiKey)`, hex lowercase.
- Method codes: QRIS `NQ`, VA BNI `I1`, BRI `BR`, Mandiri `M2`, BCA `BC`. Minimum Rp10.000, `customerVaName` max 20.
- Fees (needs confirmation with Duitku): QRIS 0,7%, VA Rp3.000 (BNI/BRI), Rp4.000 (Mandiri), Rp5.000 (BCA). BI policy of 0% QRIS MDR up to Rp100.000 from 1 Oct 2026 is not yet confirmed on Duitku's pricing.

## To verify in the sandbox before going live

- The docs are inconsistent on Check Transaction: the table says form-urlencoded, the PHP sample sends JSON. The client sends JSON.
- Callback `amount` format (`99000` or `99000.00`). The service compares numbers, the signature uses the raw string.
- Whether `NQ` is enabled on the merchant project, and the exact `qrString` and `vaNumber` returned.

## Deploy

1. Run the migration once: `mysql -u root dibyaklinik < staff/backend/migrations/20261110_premium_payments.sql` (idempotent).
2. Put `DUITKU_MERCHANT_CODE`, `DUITKU_API_KEY` and `DUITKU_PRODUCTION` in the server `.env` (never in chat). Without them checkout answers 503 and the scheduler does nothing.
3. In the Duitku project dashboard set the callback URL to `https://dokterdibya.com/api/webhooks/duitku/callback` and whitelist the Duitku IPs if offered.
4. `pm2 restart dibyaklinik-backend --update-env`, check `/api/health`.
5. Switch a plan on only after a sandbox payment and one small live payment succeeded: `UPDATE premium_plans SET is_active = 1 WHERE code = 'kehamilan'` (Tahap 4 adds a staff screen for this).

## Verification done for Tahap 1

- Unit tests with the gateway mocked: signatures, client, service rules, routes, route allow-list.
- The same service run against a real MariaDB 10.11: migration twice (idempotent), checkout, callback, repeated callback, 5 parallel confirmations (one grant), renewal, amount mismatch, reconciliation, expiry, late payment.
- Not done: a real Duitku sandbox call (needs merchant credentials) and a MySQL 8 run.

## Later phases

- Tahap 2: patient UI (SISIwanita style, QR/VA screen with countdown, status polling).
- Tahap 3: WhatsApp reminders `premium_h7`, `premium_h1`, `premium_berakhir` through `WhatsAppTemplateSender` plus in-app notification. The three Meta templates must be submitted by Boss.
- Tahap 4: staff screen (orders, manual grant with audit, plan prices and switch).

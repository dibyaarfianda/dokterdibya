-- Optional prepayment of the estimated cost of one Klinik Privat visit, paid through Duitku.
-- The money becomes patient credit (saldo) per consultation category; Tahap 2 deducts it from
-- the visit bill. Run AFTER 20261110_premium_payments.sql (it extends payment_orders).
-- Tables are created here ONLY, never at runtime (see StaffPanelWave6StartupSchema.test.js).
-- Safe to run more than once. Run on deploy: mysql -u root dibyaklinik < this file.

ALTER TABLE payment_orders
    ADD COLUMN IF NOT EXISTS order_type VARCHAR(20) NOT NULL DEFAULT 'premium' AFTER order_ref,  -- premium | checkup_prepay
    ADD COLUMN IF NOT EXISTS product_code VARCHAR(40) NULL AFTER order_type,                     -- checkup_prepay: obstetri | gyn_repro | gyn_special
    ADD COLUMN IF NOT EXISTS gateway_mode ENUM('sandbox','live') NULL AFTER payment_method,      -- sandbox credit must never be spent on a real bill
    ADD COLUMN IF NOT EXISTS item_snapshot TEXT NULL AFTER gateway_payload,                      -- JSON: priced tindakan items behind amount_idr
    MODIFY COLUMN plan_id INT UNSIGNED NULL,
    MODIFY COLUMN plan_code VARCHAR(40) NULL,
    MODIFY COLUMN duration_days SMALLINT UNSIGNED NULL,
    ADD INDEX IF NOT EXISTS idx_payment_orders_type (order_type, patient_id, status);

CREATE TABLE IF NOT EXISTS patient_credit_ledger (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    patient_id VARCHAR(50) NOT NULL,
    category VARCHAR(20) NOT NULL,                -- obstetri | gyn_repro | gyn_special
    entry_type VARCHAR(20) NOT NULL,              -- prepay (Tahap 1); usage | refund | adjustment (Tahap 2)
    amount_idr INT NOT NULL,                      -- signed: + money in, - money used or returned
    gateway_mode ENUM('sandbox','live') NULL,
    source_type VARCHAR(30) NOT NULL,             -- payment_order | sunday_clinic_billing | staff
    source_id VARCHAR(64) NOT NULL,
    note VARCHAR(255) NULL,
    created_by VARCHAR(64) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_credit_ledger_source (source_type, source_id, entry_type),
    KEY idx_credit_ledger_patient (patient_id, category, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

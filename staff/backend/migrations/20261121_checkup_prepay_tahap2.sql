-- Bayar di muka, Tahap 2: live saldo pays Klinik Privat bills, returns credit it back,
-- staff record saldo refunds, and Boss edits the estimate mapping in the panel.
-- Run AFTER 20261118_checkup_prepay.sql (it uses patient_credit_ledger).
-- Tables are created here ONLY, never at runtime (see StaffPanelWave6StartupSchema.test.js).
-- Safe to run more than once. Run on deploy: mysql -u root dibyaklinik < this file.

-- A saldo refund handed to the patient by staff. Its money movement is the 'refund'
-- rows in patient_credit_ledger (source_type 'credit_refund', source_id '<id>:<category>').
CREATE TABLE IF NOT EXISTS patient_credit_refunds (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    patient_id VARCHAR(50) NOT NULL,
    amount_idr INT UNSIGNED NOT NULL,
    method ENUM('tunai','transfer') NOT NULL,
    reason TEXT NOT NULL,
    request_key VARCHAR(80) NOT NULL UNIQUE,      -- client retry key; same key + same request returns the saved refund
    request_hash CHAR(64) NOT NULL,
    created_by VARCHAR(64) NULL,
    created_by_name VARCHAR(120) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_credit_refunds_patient (patient_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Deduction, return credit and refund lock a patient's live rows; keep that lookup indexed.
ALTER TABLE patient_credit_ledger
    ADD INDEX IF NOT EXISTS idx_credit_ledger_live (patient_id, gateway_mode);

-- A retur on a bill paid with saldo puts the saldo-paid part back into saldo.
-- payment_method 'saldo' = the whole retur went back to saldo, nothing was handed over.
ALTER TABLE sunday_clinic_billing_returns
    ADD COLUMN IF NOT EXISTS saldo_amount DECIMAL(12,2) NULL AFTER amount,
    MODIFY COLUMN payment_method ENUM('cash','transfer','saldo') NOT NULL;

-- Doctor-only (protected, non-delegable) permission for the estimate editor: these prices
-- are what patients pay through Duitku. A doctor's permissions come from this table.
INSERT IGNORE INTO permissions (name, display_name, category, description)
VALUES ('checkup_prepay.manage_estimate', 'Ubah harga estimasi bayar di muka', 'Keuangan',
        'Mengatur tindakan dan harga estimasi kunjungan yang dibayar di muka lewat Duitku');

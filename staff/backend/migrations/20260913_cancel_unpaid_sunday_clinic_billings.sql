-- Preserve the invoice and its items while allowing an unpaid invoice to be voided.
ALTER TABLE sunday_clinic_billings
    MODIFY COLUMN status ENUM('draft', 'confirmed', 'paid', 'cancelled') NOT NULL DEFAULT 'draft',
    ADD COLUMN IF NOT EXISTS cancellation_reason TEXT NULL,
    ADD COLUMN IF NOT EXISTS cancelled_at DATETIME NULL,
    ADD COLUMN IF NOT EXISTS cancelled_by VARCHAR(64) NULL,
    ADD COLUMN IF NOT EXISTS cancelled_by_name VARCHAR(255) NULL;

ALTER TABLE sunday_clinic_additional_billings
    MODIFY COLUMN status ENUM('draft', 'confirmed', 'paid', 'cancelled') NOT NULL DEFAULT 'draft',
    ADD COLUMN IF NOT EXISTS cancellation_reason TEXT NULL,
    ADD COLUMN IF NOT EXISTS cancelled_at DATETIME NULL,
    ADD COLUMN IF NOT EXISTS cancelled_by VARCHAR(64) NULL,
    ADD COLUMN IF NOT EXISTS cancelled_by_name VARCHAR(255) NULL;

ALTER TABLE sunday_clinic_billing_revisions
    MODIFY COLUMN status ENUM('pending', 'approved', 'rejected', 'cancelled') DEFAULT 'pending',
    ADD COLUMN IF NOT EXISTS cancellation_reason TEXT NULL,
    ADD COLUMN IF NOT EXISTS cancelled_at DATETIME NULL,
    ADD COLUMN IF NOT EXISTS cancelled_by VARCHAR(64) NULL,
    ADD COLUMN IF NOT EXISTS cancelled_by_name VARCHAR(255) NULL;

ALTER TABLE tagihan_payments
    ADD COLUMN IF NOT EXISTS reconciliation_required BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS reconciliation_reason TEXT NULL;

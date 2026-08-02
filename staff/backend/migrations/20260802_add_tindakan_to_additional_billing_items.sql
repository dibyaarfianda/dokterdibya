-- Allow active pelayanan/tindakan catalog items in post-payment additional billings.
-- Existing obat and admin values are preserved.

ALTER TABLE sunday_clinic_additional_billing_items
    MODIFY COLUMN item_type ENUM('obat', 'admin', 'tindakan') NOT NULL;

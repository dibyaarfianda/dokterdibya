-- Pencairan saldo: status "Sedang ditransfer" (2026-11-21).
-- Spec: docs/superpowers/specs/2026-11-21-withdrawal-processing-status-design.md
-- Run after 20261122_checkup_prepay_packages.sql. Safe to run twice; changes no rows.
--
-- Staff press "Mulai transfer" before they transfer by hand. While a request is 'processing'
-- the patient can no longer cancel it and its amount stays held (like 'pending').
-- 'processing' is appended at the end of the ENUM so existing rows keep their index and the
-- change needs no table copy.

ALTER TABLE patient_credit_refund_requests
    MODIFY COLUMN status ENUM('pending','done','rejected','cancelled','processing') NOT NULL DEFAULT 'pending';

ALTER TABLE patient_credit_refund_requests
    ADD COLUMN IF NOT EXISTS processing_by VARCHAR(64) NULL AFTER status,
    ADD COLUMN IF NOT EXISTS processing_at TIMESTAMP NULL DEFAULT NULL AFTER processing_by;

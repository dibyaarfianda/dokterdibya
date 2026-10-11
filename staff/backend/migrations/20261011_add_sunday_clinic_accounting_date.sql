-- Allow a billing created from an older DRD to be assigned explicitly to the
-- correct Sunday Clinic accounting date without changing the clinical visit.
ALTER TABLE sunday_clinic_billings
    ADD COLUMN IF NOT EXISTS accounting_date DATE NULL AFTER paid_by;

ALTER TABLE sunday_clinic_additional_billings
    ADD COLUMN IF NOT EXISTS accounting_date DATE NULL AFTER paid_by;

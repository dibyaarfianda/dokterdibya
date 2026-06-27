ALTER TABLE operation_data_index
  ADD COLUMN IF NOT EXISTS patient_age VARCHAR(32) NULL AFTER patient_name;

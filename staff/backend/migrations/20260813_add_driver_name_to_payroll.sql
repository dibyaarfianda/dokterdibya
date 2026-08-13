-- Store the driver name shown on monthly payroll records and printed slips.
-- Nullable for historical rows; the application requires a name before new finalization or printing.

ALTER TABLE staff_driver_payrolls
    ADD COLUMN IF NOT EXISTS driver_name VARCHAR(120) NULL AFTER id;

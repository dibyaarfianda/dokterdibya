-- Allow COMM operation names longer than 255 characters.
-- COMM sends this as operation_name; DocBoard stores it in operation_type_other
-- when it cannot match an existing configured operation type.

ALTER TABLE surgery_schedules
  MODIFY COLUMN operation_type_other TEXT NULL;

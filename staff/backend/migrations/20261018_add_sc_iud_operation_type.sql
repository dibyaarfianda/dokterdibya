-- Combined Caesarean + IUD is an operation; standalone IUD stays a procedure.
INSERT INTO surgery_operation_types (code, name, name_id, category, sort_order, is_active)
SELECT 'SC-IUD', 'Sectio Caesarea with IUD insertion', 'SC dengan pemasangan IUD', 'obstetri', 6, 1
WHERE NOT EXISTS (
    SELECT 1 FROM surgery_operation_types WHERE code = 'SC-IUD'
);

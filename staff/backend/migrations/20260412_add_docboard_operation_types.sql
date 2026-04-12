INSERT INTO surgery_operation_types (code, name, name_id, category, sort_order, is_active)
SELECT 'KURET', 'Kuret', 'Kuret', 'ginekologi', 43, 1
WHERE NOT EXISTS (
    SELECT 1 FROM surgery_operation_types WHERE code = 'KURET'
);

INSERT INTO surgery_operation_types (code, name, name_id, category, sort_order, is_active)
SELECT 'OTHER-OP', 'Lainnya', 'Lainnya', 'ginekologi', 999, 1
WHERE NOT EXISTS (
    SELECT 1 FROM surgery_operation_types WHERE code = 'OTHER-OP'
);

INSERT INTO surgery_operation_types (code, name, name_id, category, sort_order, is_active)
SELECT 'P-IUD', 'Pasang IUD', 'Pasang IUD', 'ginekologi', 64, 1
WHERE NOT EXISTS (
    SELECT 1 FROM surgery_operation_types WHERE code = 'P-IUD'
);

INSERT INTO surgery_operation_types (code, name, name_id, category, sort_order, is_active)
SELECT 'L-IUD', 'Lepas IUD', 'Lepas IUD', 'ginekologi', 65, 1
WHERE NOT EXISTS (
    SELECT 1 FROM surgery_operation_types WHERE code = 'L-IUD'
);

INSERT INTO surgery_operation_types (code, name, name_id, category, sort_order, is_active)
SELECT 'LP-IUD', 'Lepas Pasang IUD', 'Lepas Pasang IUD', 'ginekologi', 66, 1
WHERE NOT EXISTS (
    SELECT 1 FROM surgery_operation_types WHERE code = 'LP-IUD'
);

INSERT INTO surgery_operation_types (code, name, name_id, category, sort_order, is_active)
SELECT 'P-IMP', 'Pasang Implant', 'Pasang Implant', 'ginekologi', 67, 1
WHERE NOT EXISTS (
    SELECT 1 FROM surgery_operation_types WHERE code = 'P-IMP'
);

INSERT INTO surgery_operation_types (code, name, name_id, category, sort_order, is_active)
SELECT 'L-IMP', 'Lepas Implant', 'Lepas Implant', 'ginekologi', 68, 1
WHERE NOT EXISTS (
    SELECT 1 FROM surgery_operation_types WHERE code = 'L-IMP'
);

INSERT INTO surgery_operation_types (code, name, name_id, category, sort_order, is_active)
SELECT 'LP-IMP', 'Lepas Pasang Implant', 'Lepas Pasang Implant', 'ginekologi', 69, 1
WHERE NOT EXISTS (
    SELECT 1 FROM surgery_operation_types WHERE code = 'LP-IMP'
);
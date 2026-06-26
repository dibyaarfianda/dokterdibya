SET @operation_data_doctor_name_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'operation_data_index'
    AND COLUMN_NAME = 'doctor_name'
);

SET @operation_data_doctor_name_sql := IF(
  @operation_data_doctor_name_exists = 0,
  'ALTER TABLE operation_data_index ADD COLUMN doctor_name VARCHAR(255) NULL AFTER status',
  'SELECT ''operation_data_index.doctor_name already exists'' AS message'
);

PREPARE operation_data_doctor_name_stmt FROM @operation_data_doctor_name_sql;
EXECUTE operation_data_doctor_name_stmt;
DEALLOCATE PREPARE operation_data_doctor_name_stmt;

SET @operation_data_doctor_key_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'operation_data_index'
    AND COLUMN_NAME = 'doctor_key'
);

SET @operation_data_doctor_key_sql := IF(
  @operation_data_doctor_key_exists = 0,
  'ALTER TABLE operation_data_index ADD COLUMN doctor_key VARCHAR(64) NULL AFTER doctor_name',
  'SELECT ''operation_data_index.doctor_key already exists'' AS message'
);

PREPARE operation_data_doctor_key_stmt FROM @operation_data_doctor_key_sql;
EXECUTE operation_data_doctor_key_stmt;
DEALLOCATE PREPARE operation_data_doctor_key_stmt;

SET @operation_data_doctor_source_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'operation_data_index'
    AND COLUMN_NAME = 'doctor_source'
);

SET @operation_data_doctor_source_sql := IF(
  @operation_data_doctor_source_exists = 0,
  'ALTER TABLE operation_data_index ADD COLUMN doctor_source VARCHAR(64) NULL AFTER doctor_key',
  'SELECT ''operation_data_index.doctor_source already exists'' AS message'
);

PREPARE operation_data_doctor_source_stmt FROM @operation_data_doctor_source_sql;
EXECUTE operation_data_doctor_source_stmt;
DEALLOCATE PREPARE operation_data_doctor_source_stmt;

SET @operation_data_doctor_idx_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'operation_data_index'
    AND INDEX_NAME = 'idx_operation_data_facility_doctor_date'
);

SET @operation_data_doctor_idx_sql := IF(
  @operation_data_doctor_idx_exists = 0,
  'ALTER TABLE operation_data_index ADD INDEX idx_operation_data_facility_doctor_date (facility, doctor_key, operation_date)',
  'SELECT ''idx_operation_data_facility_doctor_date already exists'' AS message'
);

PREPARE operation_data_doctor_idx_stmt FROM @operation_data_doctor_idx_sql;
EXECUTE operation_data_doctor_idx_stmt;
DEALLOCATE PREPARE operation_data_doctor_idx_stmt;

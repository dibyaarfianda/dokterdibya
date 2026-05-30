SET @operation_data_r2_bucket_column_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'operation_data_index'
    AND COLUMN_NAME = 'r2_bucket'
);

SET @operation_data_r2_bucket_sql := IF(
  @operation_data_r2_bucket_column_exists = 0,
  'ALTER TABLE operation_data_index ADD COLUMN r2_bucket VARCHAR(128) NULL AFTER r2_key',
  'SELECT ''operation_data_index.r2_bucket already exists'' AS message'
);

PREPARE operation_data_r2_bucket_stmt FROM @operation_data_r2_bucket_sql;
EXECUTE operation_data_r2_bucket_stmt;
DEALLOCATE PREPARE operation_data_r2_bucket_stmt;

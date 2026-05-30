CREATE TABLE IF NOT EXISTS operation_data_index (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  facility VARCHAR(64) NOT NULL,
  source_key VARCHAR(255) NOT NULL,
  case_id VARCHAR(100) NULL,
  simrs_operasi_id VARCHAR(100) NULL,
  mr_id VARCHAR(50) NULL,
  patient_name VARCHAR(255) NOT NULL,
  operation_date DATE NULL,
  operation_time TIME NULL,
  operation_name TEXT NULL,
  diagnosis TEXT NULL,
  status VARCHAR(50) NULL,
  r2_key VARCHAR(500) NOT NULL,
  r2_bucket VARCHAR(128) NULL,
  surgery_id BIGINT UNSIGNED NULL,
  fetched_at DATETIME NULL,
  last_synced_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_operation_data_source (facility, source_key),
  KEY idx_operation_data_date_facility (operation_date, facility),
  KEY idx_operation_data_patient (patient_name),
  KEY idx_operation_data_mr (mr_id),
  KEY idx_operation_data_surgery (surgery_id),
  CONSTRAINT fk_operation_data_surgery
    FOREIGN KEY (surgery_id) REFERENCES surgery_schedules(id)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS operation_data_backfill_runs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status ENUM('pending','running','completed','failed','cancelled') NOT NULL DEFAULT 'pending',
  total_jobs INT NOT NULL DEFAULT 0,
  completed_jobs INT NOT NULL DEFAULT 0,
  failed_jobs INT NOT NULL DEFAULT 0,
  summary_json LONGTEXT NULL,
  created_by VARCHAR(100) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_operation_backfill_status (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS operation_data_backfill_jobs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  run_id BIGINT UNSIGNED NOT NULL,
  facility VARCHAR(64) NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  priority INT NOT NULL DEFAULT 0,
  status ENUM('pending','running','completed','failed','retrying') NOT NULL DEFAULT 'pending',
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 3,
  items_found INT NOT NULL DEFAULT 0,
  items_saved INT NOT NULL DEFAULT 0,
  error_message TEXT NULL,
  summary_json LONGTEXT NULL,
  started_at DATETIME NULL,
  completed_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_operation_job_claim (status, priority, id),
  KEY idx_operation_job_run (run_id, status),
  CONSTRAINT fk_operation_job_run
    FOREIGN KEY (run_id) REFERENCES operation_data_backfill_runs(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE docboard_morbid_cases
  ADD COLUMN analysis_status VARCHAR(32) NOT NULL DEFAULT 'not_analyzed' AFTER last_error,
  ADD COLUMN analysis_r2_key VARCHAR(512) NULL AFTER analysis_status,
  ADD COLUMN analysis_r2_bucket VARCHAR(128) NULL AFTER analysis_r2_key,
  ADD COLUMN analysis_version INT UNSIGNED NOT NULL DEFAULT 1 AFTER analysis_r2_bucket,
  ADD COLUMN analysis_model VARCHAR(128) NULL AFTER analysis_version,
  ADD COLUMN analysis_reasoning_effort VARCHAR(32) NULL AFTER analysis_model,
  ADD COLUMN analyzed_at DATETIME NULL AFTER analysis_reasoning_effort,
  ADD COLUMN analysis_last_error TEXT NULL AFTER analyzed_at,
  ADD KEY idx_docboard_morbid_analysis_status (analysis_status, analyzed_at);

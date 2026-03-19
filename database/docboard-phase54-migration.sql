-- DocBoard Phase 5.4 Migration
-- Persistent daily metrics snapshots

CREATE TABLE IF NOT EXISTS docboard_metrics_daily (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    metric_date DATE NOT NULL,
    total_requests INT NOT NULL DEFAULT 0,
    slow_requests INT NOT NULL DEFAULT 0,
    avg_processing_ms INT NULL,
    max_processing_ms INT NULL,
    compliance_requests INT NOT NULL DEFAULT 0,
    cleanup_policy_deleted INT NOT NULL DEFAULT 0,
    cleanup_rules_deleted INT NOT NULL DEFAULT 0,
    by_endpoint JSON NULL COMMENT '{"dashboard":{"count":N,"avg_ms":N},...}',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_metric_date (metric_date),
    INDEX idx_date (metric_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

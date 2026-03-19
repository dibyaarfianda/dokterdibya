-- DocBoard Phase 5.5 Migration

-- 1. Compliance usage tracking per user/day
CREATE TABLE IF NOT EXISTS docboard_compliance_usage (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    usage_date DATE NOT NULL,
    user_id VARCHAR(50) NOT NULL,
    request_count INT NOT NULL DEFAULT 1,
    last_access_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_date_user (usage_date, user_id),
    INDEX idx_date (usage_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. Alert delivery log
CREATE TABLE IF NOT EXISTS docboard_alert_log (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    alert_type VARCHAR(50) NOT NULL COMMENT 'slow_query, etc',
    status ENUM('sent','failed','skipped_cooldown') NOT NULL,
    error_message TEXT NULL,
    context JSON NULL COMMENT 'endpoint breakdown, counts, threshold',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_type (alert_type),
    INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

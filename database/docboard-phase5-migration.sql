-- DocBoard Phase 5 Migration
-- Command Center: feature flags, policies, rules, compliance

-- =====================================================
-- 1. Feature Flags (progressive rollout control)
-- =====================================================
CREATE TABLE IF NOT EXISTS docboard_feature_flags (
    flag_key VARCHAR(100) NOT NULL PRIMARY KEY,
    enabled TINYINT(1) NOT NULL DEFAULT 0,
    description VARCHAR(255) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Default flags (all disabled for safe rollout)
INSERT IGNORE INTO docboard_feature_flags (flag_key, enabled, description) VALUES
('phase5_dashboard', 0, 'Multi-site operations dashboard'),
('phase5_policies', 0, 'Advanced RBAC policy enforcement'),
('phase5_rules_engine', 0, 'Automation rules engine'),
('phase5_conflict_detection', 0, 'Cross-site capacity/conflict optimization'),
('phase5_compliance', 0, 'Compliance reporting pack');

-- =====================================================
-- 2. Policy Actions Log (audit all policy decisions)
-- =====================================================
CREATE TABLE IF NOT EXISTS docboard_policy_log (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(50) NOT NULL,
    action VARCHAR(100) NOT NULL,
    resource VARCHAR(100) NULL,
    resource_id VARCHAR(50) NULL,
    decision ENUM('allow','deny') NOT NULL,
    reason VARCHAR(255) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user (user_id),
    INDEX idx_action (action),
    INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================
-- 3. Automation Rules
-- =====================================================
CREATE TABLE IF NOT EXISTS docboard_rules (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    trigger_type VARCHAR(100) NOT NULL COMMENT 'surgery_created, status_changed, daily_schedule, etc',
    trigger_config JSON NULL COMMENT 'Conditions for trigger evaluation',
    action_type VARCHAR(100) NOT NULL COMMENT 'send_notification, update_status, log_alert, etc',
    action_config JSON NULL COMMENT 'Action parameters',
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    dry_run TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=log only, 0=execute',
    created_by VARCHAR(50) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================
-- 4. Rule Execution Log
-- =====================================================
CREATE TABLE IF NOT EXISTS docboard_rule_executions (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    rule_id INT UNSIGNED NOT NULL,
    trigger_data JSON NULL,
    action_result JSON NULL,
    status ENUM('success','failed','skipped','dry_run') NOT NULL DEFAULT 'success',
    error_message TEXT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (rule_id) REFERENCES docboard_rules(id) ON DELETE CASCADE,
    INDEX idx_rule (rule_id),
    INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Seed example rules (dry_run=1 by default)
INSERT IGNORE INTO docboard_rules (name, trigger_type, trigger_config, action_type, action_config, dry_run) VALUES
('Auto-confirm 24h sebelum operasi', 'daily_schedule', '{"hours_before": 24}', 'update_status', '{"target_status": "confirmed"}', 1),
('Alert ASA tinggi', 'surgery_created', '{"asa_score_gte": 3}', 'send_notification', '{"title": "Alert: Pasien ASA tinggi"}', 1);

-- DocBoard Phase 2b Migration
-- Templates, Checklists, and Preferences

-- =====================================================
-- 1. Surgery Templates
-- =====================================================
CREATE TABLE IF NOT EXISTS surgery_templates (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    default_data JSON NOT NULL COMMENT 'Pre-filled form values',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================
-- 2. Surgery Checklists (per surgery)
-- =====================================================
CREATE TABLE IF NOT EXISTS surgery_checklists (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    surgery_id BIGINT UNSIGNED NOT NULL,
    items JSON NOT NULL COMMENT '[{key, label, checked, checked_by, checked_at}]',
    updated_by VARCHAR(50) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_surgery (surgery_id),
    FOREIGN KEY (surgery_id) REFERENCES surgery_schedules(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================
-- 3. User Preferences (notification prefs, display prefs)
-- =====================================================
CREATE TABLE IF NOT EXISTS docboard_preferences (
    user_id VARCHAR(50) NOT NULL PRIMARY KEY,
    preferences JSON NOT NULL COMMENT '{"notify_new_booking":true,"notify_status_change":true,...}',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

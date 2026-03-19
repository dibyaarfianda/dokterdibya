-- DocBoard Phase 1 Migration
-- Adds missing tables: docboard_notifications, docboard_briefings
-- These tables are already referenced by backend services but were never created in a migration file.

-- 1. Notification history for DocBoard staff
-- Referenced by: DocBoardPushService.js (storeNotification), DocBoardService.js (getNotifications, markNotificationRead, getUnreadCount)
CREATE TABLE IF NOT EXISTS docboard_notifications (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(50) NULL COMMENT 'NULL = global notification visible to all staff',
    type VARCHAR(50) NOT NULL DEFAULT 'info' COMMENT 'new_booking, status_change, surgery_reminder, sync_failure, info',
    title VARCHAR(255) NOT NULL,
    message TEXT NULL,
    location ENUM('klinik_private','rsia_melinda','rsud_gambiran','rs_bhayangkara') NULL,
    reference_id VARCHAR(100) NULL COMMENT 'e.g. surgery_schedules.id',
    is_read TINYINT(1) NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user_id (user_id),
    INDEX idx_is_read (is_read),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. AI briefing cache (one per date)
-- Referenced by: DocBoardAIService.js (getCachedBriefing, saveBriefing)
CREATE TABLE IF NOT EXISTS docboard_briefings (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    briefing_date DATE NOT NULL,
    content LONGTEXT NOT NULL COMMENT 'JSON briefing content',
    generated_at DATETIME NOT NULL,
    generated_by VARCHAR(50) NULL COMMENT 'Staff user ID who triggered generation',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_briefing_date (briefing_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

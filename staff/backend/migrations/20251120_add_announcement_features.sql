-- Add image and rich formatting support to announcements table
-- Run this on VPS: mysql -u root -p dibyaklinik < 20251120_add_announcement_features.sql

USE dibyaklinik;

-- Create announcements table if it doesn't exist
CREATE TABLE IF NOT EXISTS announcements (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    created_by VARCHAR(255) NOT NULL,
    created_by_name VARCHAR(255) NOT NULL,
    priority ENUM('normal', 'important', 'urgent') DEFAULT 'normal',
    status ENUM('active', 'inactive') DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_status (status),
    INDEX idx_priority (priority),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add new columns for enhanced features
ALTER TABLE announcements
ADD COLUMN IF NOT EXISTS image_url VARCHAR(500) NULL AFTER message,
ADD COLUMN IF NOT EXISTS formatted_content MEDIUMTEXT NULL AFTER image_url,
ADD COLUMN IF NOT EXISTS content_type ENUM('plain', 'markdown', 'html') DEFAULT 'plain' AFTER formatted_content;

-- Show confirmation
SELECT 'Announcement table enhanced with image and formatting support!' as status;

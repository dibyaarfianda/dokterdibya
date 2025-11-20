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

-- Check if columns already exist before adding them
SET @dbname = 'dibyaklinik';
SET @tablename = 'announcements';

-- Add image_url column if it doesn't exist
SET @col_exists = 0;
SELECT COUNT(*) INTO @col_exists
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = @dbname
AND TABLE_NAME = @tablename
AND COLUMN_NAME = 'image_url';

SET @query = IF(@col_exists = 0,
    'ALTER TABLE announcements ADD COLUMN image_url VARCHAR(500) NULL AFTER message',
    'SELECT "Column image_url already exists" AS Info');
PREPARE stmt FROM @query;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add formatted_content column if it doesn't exist
SET @col_exists = 0;
SELECT COUNT(*) INTO @col_exists
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = @dbname
AND TABLE_NAME = @tablename
AND COLUMN_NAME = 'formatted_content';

SET @query = IF(@col_exists = 0,
    'ALTER TABLE announcements ADD COLUMN formatted_content MEDIUMTEXT NULL AFTER image_url',
    'SELECT "Column formatted_content already exists" AS Info');
PREPARE stmt FROM @query;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add content_type column if it doesn't exist
SET @col_exists = 0;
SELECT COUNT(*) INTO @col_exists
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = @dbname
AND TABLE_NAME = @tablename
AND COLUMN_NAME = 'content_type';

SET @query = IF(@col_exists = 0,
    'ALTER TABLE announcements ADD COLUMN content_type ENUM(\'plain\', \'markdown\', \'html\') DEFAULT \'plain\' AFTER formatted_content',
    'SELECT "Column content_type already exists" AS Info');
PREPARE stmt FROM @query;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Show confirmation
SELECT 'Announcement table enhanced with image and formatting support!' as status;
SELECT COLUMN_NAME, COLUMN_TYPE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = @dbname
AND TABLE_NAME = @tablename
ORDER BY ORDINAL_POSITION;

-- AI Detection Logs Table
CREATE TABLE IF NOT EXISTS ai_detection_logs (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    patient_id VARCHAR(10) NOT NULL,
    complaint TEXT NOT NULL,
    detection_result JSON NOT NULL,
    tokens_used INT UNSIGNED DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_patient_id (patient_id),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- AI Summary Logs Table
CREATE TABLE IF NOT EXISTS ai_summary_logs (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    patient_id VARCHAR(10) NOT NULL,
    summary JSON NOT NULL,
    tokens_used INT UNSIGNED DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_patient_id (patient_id),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- AI Usage Stats (for monitoring costs)
CREATE TABLE IF NOT EXISTS ai_usage_stats (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    date DATE NOT NULL,
    feature VARCHAR(50) NOT NULL, -- 'detection', 'summary', 'chatbot', 'validation'
    total_requests INT UNSIGNED DEFAULT 0,
    total_tokens INT UNSIGNED DEFAULT 0,
    avg_tokens_per_request DECIMAL(10,2) DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY unique_date_feature (date, feature),
    INDEX idx_date (date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

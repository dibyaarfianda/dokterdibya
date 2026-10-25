-- Account-level chat push is opt-in. Existing notification types are unaffected.
CREATE TABLE IF NOT EXISTS patient_chat_notification_settings (
    patient_id VARCHAR(50) NOT NULL PRIMARY KEY,
    enabled TINYINT(1) NOT NULL DEFAULT 0,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Registration Codes Table
-- Stores codes that patients need to register on the portal
-- Only patients connected to WhatsApp Business will receive codes

CREATE TABLE IF NOT EXISTS registration_codes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(8) NOT NULL UNIQUE,
    patient_name VARCHAR(255),
    phone VARCHAR(20) NOT NULL,
    created_by VARCHAR(50) NOT NULL COMMENT 'Staff ID who generated the code',
    status ENUM('active', 'used', 'expired') DEFAULT 'active',
    used_at DATETIME DEFAULT NULL,
    used_by_patient_id VARCHAR(50) DEFAULT NULL COMMENT 'Patient ID who used this code',
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    INDEX idx_code (code),
    INDEX idx_phone (phone),
    INDEX idx_status (status),
    INDEX idx_expires_at (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Settings for registration code feature
INSERT INTO settings (setting_key, setting_value, description)
VALUES ('registration_code_required', 'true', 'Require registration code for patient registration')
ON DUPLICATE KEY UPDATE setting_key = setting_key;

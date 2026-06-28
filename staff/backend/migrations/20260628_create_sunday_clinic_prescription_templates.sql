CREATE TABLE IF NOT EXISTS sunday_clinic_prescription_templates (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    items JSON NOT NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_by VARCHAR(255) NULL,
    updated_by VARCHAR(255) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_active_name (is_active, name),
    INDEX idx_updated_at (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

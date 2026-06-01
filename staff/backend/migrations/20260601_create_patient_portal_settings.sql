CREATE TABLE IF NOT EXISTS patient_portal_settings (
    patient_id VARCHAR(32) NOT NULL PRIMARY KEY,
    nickname VARCHAR(40) NULL,
    notification_sound ENUM('default', 'chime', 'bell', 'soft', 'none') NOT NULL DEFAULT 'default',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_patient_portal_settings_patient
        FOREIGN KEY (patient_id) REFERENCES patients(id)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

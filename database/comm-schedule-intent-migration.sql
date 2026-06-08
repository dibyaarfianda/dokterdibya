-- COMM Manual Schedule Intent Migration
-- Maps hospital-specific RM numbers to DokterDibya patients without reusing DRD fields.

CREATE TABLE IF NOT EXISTS patient_external_ids (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    patient_id VARCHAR(20) NOT NULL,
    facility VARCHAR(64) NOT NULL,
    hospital_mr_id VARCHAR(50) NOT NULL,
    patient_name VARCHAR(255) NULL,
    birth_date DATE NULL,
    source_system VARCHAR(32) NOT NULL DEFAULT 'COMM',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_patient_external_identity (source_system, facility, hospital_mr_id),
    INDEX idx_patient_external_patient (patient_id),
    INDEX idx_patient_external_name_birth (patient_name, birth_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

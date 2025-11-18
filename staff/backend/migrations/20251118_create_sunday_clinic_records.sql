-- Sunday Clinic Medical Record mapping table
-- Usage: mysql -u root -p dibyaklinik < 20251118_create_sunday_clinic_records.sql

USE dibyaklinik;

CREATE TABLE IF NOT EXISTS sunday_clinic_records (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    mr_id VARCHAR(20) NOT NULL,
    patient_id VARCHAR(10) NOT NULL,
    appointment_id INT DEFAULT NULL,
    folder_path VARCHAR(255) NOT NULL,
    status ENUM('draft','finalized','amended') NOT NULL DEFAULT 'draft',
    created_by BIGINT UNSIGNED DEFAULT NULL,
    finalized_by BIGINT UNSIGNED DEFAULT NULL,
    finalized_at DATETIME DEFAULT NULL,
    last_activity_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_sunday_clinic_mr (mr_id),
    KEY idx_sunday_clinic_patient (patient_id),
    KEY idx_sunday_clinic_appointment (appointment_id),
    CONSTRAINT fk_sunday_clinic_patient FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
    CONSTRAINT fk_sunday_clinic_appointment FOREIGN KEY (appointment_id) REFERENCES sunday_appointments(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

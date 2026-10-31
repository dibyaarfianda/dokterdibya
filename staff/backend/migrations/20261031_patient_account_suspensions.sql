-- Patient account suspension (penangguhan akun pasien).
-- Current state lives in patient_account_suspensions; every suspend/unsuspend
-- action is appended to patient_account_suspension_log with the staff identity.
CREATE TABLE IF NOT EXISTS patient_account_suspensions (
    patient_id VARCHAR(50) NOT NULL PRIMARY KEY,
    is_suspended TINYINT(1) NOT NULL DEFAULT 0,
    reason VARCHAR(500) NULL,
    suspended_at DATETIME NULL,
    suspended_by_id VARCHAR(64) NULL,
    suspended_by_name VARCHAR(150) NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_patient_account_suspensions_active (is_suspended)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS patient_account_suspension_log (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    patient_id VARCHAR(50) NOT NULL,
    action ENUM('suspend', 'unsuspend') NOT NULL,
    reason VARCHAR(500) NULL,
    staff_id VARCHAR(64) NULL,
    staff_name VARCHAR(150) NULL,
    ip_address VARCHAR(64) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_patient_account_suspension_log_patient (patient_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

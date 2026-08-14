CREATE TABLE IF NOT EXISTS patient_demo_sessions (
    id CHAR(36) PRIMARY KEY,
    code_hash CHAR(64) NOT NULL UNIQUE,
    issued_by VARCHAR(32) NOT NULL,
    code_expires_at DATETIME NOT NULL,
    session_expires_at DATETIME NULL,
    used_at DATETIME NULL,
    revoked_at DATETIME NULL,
    last_seen_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_patient_demo_sessions_active (revoked_at, session_expires_at),
    INDEX idx_patient_demo_sessions_issuer (issued_by, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS patient_demo_state (
    state_key VARCHAR(32) PRIMARY KEY,
    schema_version VARCHAR(32) NOT NULL,
    state_json JSON NOT NULL,
    reset_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by VARCHAR(64) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS patient_demo_audit (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    session_id CHAR(36) NULL,
    staff_user_id VARCHAR(32) NULL,
    action VARCHAR(80) NOT NULL,
    method VARCHAR(10) NULL,
    path VARCHAR(255) NULL,
    metadata JSON NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_patient_demo_audit_created (created_at),
    INDEX idx_patient_demo_audit_session (session_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

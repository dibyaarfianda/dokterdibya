-- Migration: Create immutable Sunday Clinic billing audit logs
-- Date: 2026-06-13

CREATE TABLE IF NOT EXISTS sunday_clinic_billing_audit_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    billing_id INT NOT NULL,
    mr_id VARCHAR(50) NOT NULL,
    action VARCHAR(50) NOT NULL,
    actor_user_id VARCHAR(64) NULL,
    actor_name VARCHAR(255) NOT NULL,
    actor_role VARCHAR(100) NULL,
    summary TEXT NULL,
    before_snapshot JSON NULL,
    after_snapshot JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_billing_id (billing_id),
    INDEX idx_mr_id (mr_id),
    INDEX idx_action (action),
    INDEX idx_created_at (created_at),
    CONSTRAINT fk_sunday_billing_audit_billing
        FOREIGN KEY (billing_id) REFERENCES sunday_clinic_billings(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

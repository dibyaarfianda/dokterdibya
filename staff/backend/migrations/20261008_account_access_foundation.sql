-- Additive foundation for per-account Staff access. Legacy tables remain intact
-- and authoritative until the staged account-mode cutover.
CREATE TABLE IF NOT EXISTS user_access_policies (
    user_id VARCHAR(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
    mode ENUM('legacy', 'account') NOT NULL DEFAULT 'legacy',
    access_version BIGINT UNSIGNED NOT NULL DEFAULT 1,
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (user_id),
    CONSTRAINT fk_user_access_policies_user
        FOREIGN KEY (user_id) REFERENCES users(new_id) ON DELETE CASCADE,
    CONSTRAINT chk_user_access_version CHECK (access_version >= 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO user_access_policies (user_id, mode, access_version)
SELECT new_id, 'legacy', 1
FROM users
WHERE user_type = 'staff';

CREATE TABLE IF NOT EXISTS staff_access_invitations (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id VARCHAR(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
    token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    expires_at DATETIME(6) NOT NULL,
    used_at DATETIME(6) NULL,
    cancelled_at DATETIME(6) NULL,
    created_by VARCHAR(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    UNIQUE KEY uq_staff_access_invitation_token_hash (token_hash),
    KEY idx_staff_access_invitation_user_status (user_id, used_at, cancelled_at, expires_at),
    CONSTRAINT fk_staff_access_invitation_user
        FOREIGN KEY (user_id) REFERENCES users(new_id),
    CONSTRAINT fk_staff_access_invitation_actor
        FOREIGN KEY (created_by) REFERENCES users(new_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_permission_audits (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    actor_user_id VARCHAR(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
    target_user_id VARCHAR(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
    action VARCHAR(64) NOT NULL,
    access_version BIGINT UNSIGNED NOT NULL,
    before_state JSON NULL,
    after_state JSON NULL,
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    KEY idx_user_permission_audit_target (target_user_id, created_at),
    KEY idx_user_permission_audit_actor (actor_user_id, created_at),
    CONSTRAINT fk_user_permission_audit_actor
        FOREIGN KEY (actor_user_id) REFERENCES users(new_id),
    CONSTRAINT fk_user_permission_audit_target
        FOREIGN KEY (target_user_id) REFERENCES users(new_id),
    CONSTRAINT chk_user_permission_audit_version CHECK (access_version >= 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TRIGGER IF NOT EXISTS user_permission_audits_no_update
    BEFORE UPDATE ON user_permission_audits
    FOR EACH ROW
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Permission audits are immutable';

CREATE TRIGGER IF NOT EXISTS user_permission_audits_no_delete
    BEFORE DELETE ON user_permission_audits
    FOR EACH ROW
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Permission audits are immutable';

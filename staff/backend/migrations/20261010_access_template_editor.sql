-- Persistent job templates for Kelola Akses. Runtime authorization remains in
-- user_permission_grants; these tables only define reusable permission sets.
CREATE TABLE IF NOT EXISTS staff_access_templates (
    template_key VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    label VARCHAR(80) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
    description VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
    template_version BIGINT UNSIGNED NOT NULL DEFAULT 1,
    is_customized TINYINT(1) NOT NULL DEFAULT 0,
    updated_by VARCHAR(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (template_key),
    CONSTRAINT fk_staff_access_template_actor
        FOREIGN KEY (updated_by) REFERENCES users(new_id),
    CONSTRAINT chk_staff_access_template_version CHECK (template_version >= 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS staff_access_template_permissions (
    template_key VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    permission_id INT NOT NULL,
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (template_key, permission_id),
    KEY idx_staff_access_template_permission (permission_id),
    CONSTRAINT fk_staff_access_template_permission_template
        FOREIGN KEY (template_key) REFERENCES staff_access_templates(template_key) ON DELETE CASCADE,
    CONSTRAINT fk_staff_access_template_permission_permission
        FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS staff_access_template_audits (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    actor_user_id VARCHAR(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
    template_key VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    action VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    template_version BIGINT UNSIGNED NOT NULL,
    affected_account_count INT UNSIGNED NOT NULL DEFAULT 0,
    before_state JSON NULL,
    after_state JSON NULL,
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    KEY idx_staff_access_template_audit_template (template_key, created_at),
    KEY idx_staff_access_template_audit_actor (actor_user_id, created_at),
    CONSTRAINT fk_staff_access_template_audit_actor
        FOREIGN KEY (actor_user_id) REFERENCES users(new_id),
    CONSTRAINT fk_staff_access_template_audit_template
        FOREIGN KEY (template_key) REFERENCES staff_access_templates(template_key),
    CONSTRAINT chk_staff_access_template_audit_version CHECK (template_version >= 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO staff_access_templates (template_key, label, description)
VALUES
    ('owner', 'Owner', 'Seluruh izin yang dapat didelegasikan oleh dokter.'),
    ('coordinator', 'Koordinator', 'Operasional klinik, pasien, rekam medis, jadwal, komunikasi, dan tim.'),
    ('pharmacy', 'Farmasi', 'Obat, inventori, pemasok, penjualan obat, dan keuangan terkait.'),
    ('staff', 'Staff', 'Operasional harian pasien, kunjungan, jadwal, antrean, dan komunikasi.'),
    ('observer', 'Observer', 'Akses baca untuk modul lain; pengisian DRD tetap tersedia untuk seluruh staff.');

ALTER TABLE user_access_policies
    ADD COLUMN IF NOT EXISTS template_key VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NULL AFTER job_role_id;

UPDATE user_access_policies uap
INNER JOIN users u ON u.new_id = uap.user_id
SET uap.template_key = CASE
    WHEN LOWER(TRIM(COALESCE(uap.job_label, u.role, ''))) IN ('owner', 'admin', 'administrasi', 'administrator') THEN 'owner'
    WHEN LOWER(TRIM(COALESCE(uap.job_label, u.role, ''))) IN ('koordinator', 'coordinator', 'manager', 'managerial') THEN 'coordinator'
    WHEN LOWER(TRIM(COALESCE(uap.job_label, u.role, ''))) IN ('farmasi', 'pharmacy') THEN 'pharmacy'
    WHEN LOWER(TRIM(COALESCE(uap.job_label, u.role, ''))) IN ('staff', 'bidan', 'front office', 'front_office') THEN 'staff'
    WHEN LOWER(TRIM(COALESCE(uap.job_label, u.role, ''))) IN ('observer', 'pengamat') THEN 'observer'
    ELSE uap.template_key
END
WHERE u.user_type = 'staff'
  AND COALESCE(u.is_superadmin, 0) = 0
  AND COALESCE(u.role_id, 0) <> 1;

CREATE TRIGGER IF NOT EXISTS staff_access_template_audits_no_update
    BEFORE UPDATE ON staff_access_template_audits
    FOR EACH ROW
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Access template audits are immutable';

CREATE TRIGGER IF NOT EXISTS staff_access_template_audits_no_delete
    BEFORE DELETE ON staff_access_template_audits
    FOR EACH ROW
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Access template audits are immutable';

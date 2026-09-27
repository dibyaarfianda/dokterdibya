-- A named clinical grant leaves the managerial role's other medical record rights unchanged.
CREATE TABLE IF NOT EXISTS user_permission_grants (
    user_id VARCHAR(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
    permission_id INT NOT NULL,
    granted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, permission_id),
    CONSTRAINT fk_user_permission_grants_user FOREIGN KEY (user_id) REFERENCES users(new_id),
    CONSTRAINT fk_user_permission_grants_permission FOREIGN KEY (permission_id) REFERENCES permissions(id)
);

INSERT IGNORE INTO permissions (name, display_name, category, description)
VALUES ('medical_records.anamnesa_write', 'Simpan anamnesa', 'medical_records', 'Membuat dan memperbarui bagian anamnesa saja');

INSERT IGNORE INTO user_permission_grants (user_id, permission_id)
SELECT u.new_id, p.id
FROM users u CROSS JOIN permissions p
WHERE u.new_id = 'LCBRGLMAMX' AND u.name = 'Erna Nita Aprilia'
  AND u.user_type = 'staff' AND p.name = 'medical_records.anamnesa_write';

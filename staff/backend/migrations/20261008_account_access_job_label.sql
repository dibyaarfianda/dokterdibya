-- A job label is display-only. It is stored outside users.role/role_id so new
-- account-mode Staff cannot inherit legacy authorization before final cutover.
ALTER TABLE user_access_policies
    ADD COLUMN IF NOT EXISTS job_label VARCHAR(80) NULL AFTER access_version,
    ADD COLUMN IF NOT EXISTS job_role_id INT NULL AFTER job_label;

UPDATE user_access_policies uap
INNER JOIN users u ON u.new_id = uap.user_id
LEFT JOIN roles r ON r.id = u.role_id
SET uap.job_label = COALESCE(r.display_name, r.name, u.role, 'Staff'),
    uap.job_role_id = COALESCE(uap.job_role_id, u.role_id)
WHERE uap.job_label IS NULL OR uap.job_label = '' OR uap.job_role_id IS NULL;

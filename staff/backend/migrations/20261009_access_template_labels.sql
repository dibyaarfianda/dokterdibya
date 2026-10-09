-- Normalize display-only staff labels for account access templates.
-- Authorization remains in user_permission_grants; legacy role columns are untouched.

UPDATE user_access_policies uap
INNER JOIN users u ON u.new_id = uap.user_id
LEFT JOIN roles r ON r.id = u.role_id
SET
    uap.job_label = CASE
        WHEN LOWER(TRIM(COALESCE(uap.job_label, r.display_name, r.name, u.role, ''))) IN
            ('owner', 'admin', 'administrasi', 'administrator')
            THEN 'Owner'
        WHEN LOWER(TRIM(COALESCE(uap.job_label, r.display_name, r.name, u.role, ''))) IN
            ('koordinator', 'coordinator', 'manager', 'managerial')
            THEN 'Koordinator'
        WHEN LOWER(TRIM(COALESCE(uap.job_label, r.display_name, r.name, u.role, ''))) IN
            ('farmasi', 'pharmacy')
            THEN 'Farmasi'
        WHEN LOWER(TRIM(COALESCE(uap.job_label, r.display_name, r.name, u.role, ''))) IN
            ('observer', 'pengamat')
            THEN 'Observer'
        ELSE 'Staff'
    END,
    uap.job_role_id = NULL
WHERE u.user_type = 'staff'
  AND COALESCE(u.is_superadmin, 0) = 0
  AND COALESCE(u.role_id, 0) <> COALESCE(
      (SELECT doctor_role.id FROM roles doctor_role WHERE doctor_role.name = 'dokter' LIMIT 1),
      -1
  );

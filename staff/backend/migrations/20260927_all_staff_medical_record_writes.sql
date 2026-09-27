-- All existing staff roles may create and edit versioned medical record sections.
-- This does not grant section reset, billing, or doctor-only actions.
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT DISTINCT u.role_id, p.id
FROM users u
CROSS JOIN permissions p
WHERE u.user_type = 'staff'
  AND u.role_id IS NOT NULL
  AND p.name IN ('medical_records.create', 'medical_records.edit');

-- The earlier account-specific anamnesa grant is now redundant.
DELETE upg
FROM user_permission_grants upg
JOIN permissions p ON p.id = upg.permission_id
WHERE upg.user_id = 'LCBRGLMAMX'
  AND p.name = 'medical_records.anamnesa_write';

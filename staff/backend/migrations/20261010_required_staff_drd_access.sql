-- Grant every active non-doctor staff account the non-destructive permissions
-- required to open, create, and edit every DRD clinical section.
-- The migration is idempotent and leaves sensitive permissions unchanged.

START TRANSACTION;

CREATE TEMPORARY TABLE required_staff_drd_targets (
    user_id VARCHAR(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
    previous_version BIGINT UNSIGNED NOT NULL,
    PRIMARY KEY (user_id)
) ENGINE=InnoDB;

INSERT INTO required_staff_drd_targets (user_id, previous_version)
SELECT u.new_id, uap.access_version
FROM users u
INNER JOIN user_access_policies uap ON uap.user_id = u.new_id
LEFT JOIN roles r ON r.id = u.role_id
WHERE u.user_type = 'staff'
  AND u.is_active = 1
  AND u.is_superadmin = 0
  AND COALESCE(r.name, u.role, '') <> 'dokter'
  AND EXISTS (
      SELECT 1
      FROM permissions required_permission
      LEFT JOIN user_permission_grants existing_grant
        ON existing_grant.user_id = u.new_id
       AND existing_grant.permission_id = required_permission.id
      WHERE required_permission.name IN (
          'patients.view',
          'visits.view', 'visits.create', 'visits.edit',
          'sunday_clinic.view', 'sunday_clinic.create', 'sunday_clinic.edit',
          'medical_records.view', 'medical_records.create', 'medical_records.edit',
          'medical_records.anamnesa_write',
          'anamnesa.view', 'anamnesa.create', 'anamnesa.edit',
          'physical_exam.view', 'physical_exam.create', 'physical_exam.edit',
          'usg_exam.view', 'usg_exam.create', 'usg_exam.edit',
          'lab_exam.view', 'lab_exam.create', 'lab_exam.edit',
          'navigation.bulk_upload_usg', 'navigation.kelola_pasien', 'navigation.klinik_privat'
      )
        AND existing_grant.user_id IS NULL
  );

INSERT IGNORE INTO user_permission_grants (user_id, permission_id)
SELECT target.user_id, permission.id
FROM required_staff_drd_targets target
CROSS JOIN permissions permission
WHERE permission.name IN (
    'patients.view',
    'visits.view', 'visits.create', 'visits.edit',
    'sunday_clinic.view', 'sunday_clinic.create', 'sunday_clinic.edit',
    'medical_records.view', 'medical_records.create', 'medical_records.edit',
    'medical_records.anamnesa_write',
    'anamnesa.view', 'anamnesa.create', 'anamnesa.edit',
    'physical_exam.view', 'physical_exam.create', 'physical_exam.edit',
    'usg_exam.view', 'usg_exam.create', 'usg_exam.edit',
    'lab_exam.view', 'lab_exam.create', 'lab_exam.edit',
    'navigation.bulk_upload_usg', 'navigation.kelola_pasien', 'navigation.klinik_privat'
);

UPDATE user_access_policies policy
INNER JOIN required_staff_drd_targets target ON target.user_id = policy.user_id
SET policy.access_version = target.previous_version + 1;

SET @required_drd_actor = (
    SELECT doctor.new_id
    FROM users doctor
    LEFT JOIN roles doctor_role ON doctor_role.id = doctor.role_id
    WHERE doctor.user_type = 'staff'
      AND (doctor.is_superadmin = 1 OR doctor_role.name = 'dokter')
    ORDER BY doctor.is_superadmin DESC, doctor.created_at ASC
    LIMIT 1
);

INSERT INTO user_permission_audits
    (actor_user_id, target_user_id, action, access_version, before_state, after_state)
SELECT
    @required_drd_actor,
    target.user_id,
    'required_drd_access_granted',
    target.previous_version + 1,
    JSON_OBJECT('required_drd_access', FALSE),
    JSON_OBJECT('required_drd_access', TRUE)
FROM required_staff_drd_targets target
WHERE @required_drd_actor IS NOT NULL;

DROP TEMPORARY TABLE required_staff_drd_targets;

COMMIT;

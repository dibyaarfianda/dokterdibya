-- Payroll items stored the legacy roles.display_name (Manager/Bidan) as the
-- printed "Jabatan". Staff now use account access job labels (Staff,
-- Koordinator, Farmasi, Observer). Refresh the stored label text on existing
-- items only; attendance, amounts and finalized status are not touched.
-- Same fallback order as AccessControlService (job_label -> legacy role).

UPDATE staff_payroll_items i
JOIN users u ON u.new_id = i.staff_id
LEFT JOIN roles r ON r.id = u.role_id
LEFT JOIN user_access_policies uap ON uap.user_id = u.new_id
SET i.role_name = COALESCE(uap.template_key, r.name, u.role, i.role_name),
    i.role_display = COALESCE(uap.job_label, r.display_name, r.name, u.role, i.role_display)
WHERE uap.job_label IS NOT NULL;

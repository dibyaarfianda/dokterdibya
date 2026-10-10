# Access Template Editor Design

## Goal

Add a doctor-only **Template Jabatan** editor inside **Kelola Akses** so the permission membership of Owner, Koordinator, Farmasi, Staff, and Observer can be reviewed and changed without editing source code.

## Product behavior

- Kelola Akses has two views: **Akun Staff** and **Template Jabatan**.
- The template editor uses the existing permission matrix: Baca, Baca/Edit, Hapus, and Aksi khusus.
- Template keys, labels, and descriptions remain fixed; only permission membership is editable.
- Mandatory Staff DRD permissions remain checked and cannot be removed.
- **Simpan Template** persists the template for new accounts and future manual applications without changing existing accounts.
- **Terapkan ke Semua Akun** first confirms the impact, then atomically saves the current matrix and applies it to every non-doctor account assigned to that template.
- New invited accounts receive the currently saved template permissions before activation.
- Existing account-specific overrides remain unchanged until the template is explicitly applied to that account or to all matching accounts.
- Protected doctor/superadmin accounts are never template targets.

## Authorization and persistence

- `user_permission_grants` remains the only runtime authorization source for non-doctor Staff.
- `role_permissions` and `role_visibility` remain retired and must not be read or written.
- Persist template definitions separately from per-account grants, with optimistic template versions and immutable audit rows.
- Store the assigned `template_key` on `user_access_policies` so bulk application has an explicit, reliable target set.
- Every affected account receives its own incremented `access_version` and permission audit.
- Template save/apply endpoints remain doctor/superadmin-only under the existing access-control router.

## Safety and release

- All schema changes are additive.
- Do not send invitations or change production permissions during automated verification.
- Apply the migration only after a verified production backup.
- Commit, push, deploy, and verify the live UI, schema, health, and read-only template catalog before completion.

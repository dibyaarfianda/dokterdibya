# Access Template Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persistent, audited job-template permission editor to Kelola Akses, including explicit save-only and confirmed apply-to-all actions.

**Architecture:** Add additive template tables and an `AccessTemplateService` that resolves code defaults until a template is customized. Keep runtime authorization in `user_permission_grants`; store only template definitions and account-template identity separately. Extend the existing doctor-only API and UI, then deploy the migration before the new backend.

**Tech Stack:** Node.js, Express, MariaDB/MySQL, Jest, browser JavaScript, AdminLTE.

**Spec:** `docs/superpowers/specs/2026-10-10-access-template-editor.md`

## Global Constraints

- `user_permission_grants` is the only runtime authorization source for non-doctor Staff.
- Never reactivate runtime reads or writes of `role_permissions` or `role_visibility`.
- Mandatory Staff DRD permissions cannot be removed from any template or account.
- Doctors/superadmins remain full-access and protected.
- Use optimistic versions for template and account mutations and write immutable audits.
- Production verification must not send invitations or mutate real permissions.
- Validate, commit without co-author attribution, push, deploy, and verify production.

## Review Focus

- A stale template editor must receive `409 ACCESS_VERSION_CONFLICT` without partially changing template or account grants; covered in Task 1 service/API tests.
- Saving a template without applying it must not mutate existing account grants; covered in Task 1 service tests.
- Bulk apply must exclude doctors and accounts assigned to other templates while incrementing each target's access version; covered in Task 2 service tests.
- A new invited account must receive the latest persisted template, not the source-code default; covered in Task 2 invitation tests.
- The UI must make the destructive scope distinction obvious and require confirmation before apply-to-all; covered in Task 3 frontend behavior tests.

---

### Task 1: Persistent template catalog and save-only API

**Files:**
- Create: `staff/backend/migrations/20261010_access_template_editor.sql`
- Create: `staff/backend/services/AccessTemplateService.js`
- Modify: `staff/backend/routes/access-control.js`
- Modify: `staff/backend/tests/unit/AccessControlManagement.test.js`

**Interfaces:**
- Produces: `AccessTemplateService.listTemplates(client?)`, `getTemplate(key, client?)`, and `saveTemplate(key, input, actorUserId, { applyToAccounts })`.
- Produces: `GET /api/access-control/catalog`, `PUT /api/access-control/templates/:key`, and `POST /api/access-control/templates/:key/apply` contracts.

- [x] **Step 1: Write failing migration, service, and API tests** for the additive tables, default fallback, customized permissions, stale version rejection, save-only isolation, and protected routes.
- [x] **Step 2: Run the focused suite and verify failures are caused by the missing migration/service/routes.**
- [x] **Step 3: Implement the migration, template service, and save-only endpoint with template audit records.**
- [x] **Step 4: Run the focused suite and verify Task 1 tests pass.**
- [x] **Step 5: Commit Task 1.**

### Task 2: Explicit account-template identity and bulk application

**Files:**
- Modify: `staff/backend/services/AccessControlManagementService.js`
- Modify: `staff/backend/services/AccessTemplateService.js`
- Modify: `staff/backend/routes/access-control.js`
- Modify: `staff/backend/migrations/20261010_access_template_editor.sql`
- Modify: `staff/backend/tests/unit/AccessControlManagement.test.js`

**Interfaces:**
- Consumes: persisted template definitions and template versions from Task 1.
- Produces: `user_access_policies.template_key`, template-backed invitation grants, and apply results `{ template, affected_user_ids, affected_count }`.

- [x] **Step 1: Write failing tests** for migrated template identity, new-account grants from the persisted template, bulk target filtering, mandatory/dependency resolution, account version increments, per-account audits, and rollback on failure.
- [x] **Step 2: Run the focused suite and verify the new behavioral tests fail for the expected missing behavior.**
- [x] **Step 3: Integrate template identity into account reads/writes and implement transactional apply-to-all.**
- [x] **Step 4: Run the focused and access-control regression suites.**
- [x] **Step 5: Commit Task 2.**

### Task 3: Kelola Akses template editor

**Files:**
- Modify: `staff/public/fragments/pages/kelola-access-page.html`
- Modify: `staff/public/scripts/kelola-access.js`
- Modify: `staff/public/index-adminlte.html`
- Modify: `staff/public/sw.js`
- Modify: `staff/backend/tests/unit/AccessControlManagement.test.js`
- Modify: `staff/backend/tests/unit/Task6StructuralSnapshot.test.js`

**Interfaces:**
- Consumes: Task 1 template catalog/version and Task 2 save/apply endpoints.
- Produces: separate Akun Staff and Template Jabatan views, reusable permission matrix rendering, save-only, and confirmed apply-to-all UI actions.

- [x] **Step 1: Write failing frontend behavior tests** for view switching, template matrix rendering, mandatory locks, save payload, confirmation-gated apply payload, refresh, and conflict recovery.
- [x] **Step 2: Run the focused suite and verify it fails because the editor is absent.**
- [x] **Step 3: Implement the UI and bump both Staff cache versions.**
- [x] **Step 4: Run focused frontend, structural, static, and access-control tests.**
- [x] **Step 5: Commit Task 3.**

### Task 4: Release and production verification

**Files:**
- Modify: `docs/access-control/2026-10-10-access-template-editor.md`

**Interfaces:**
- Consumes: all prior tasks.
- Produces: backup/migration/release evidence and live read-only UI verification.

- [x] **Step 1: Run the full backend suite and document every unrelated failure by name.**
- [x] **Step 2: Review the complete branch diff against the spec and resolve Critical/Important findings through RED-GREEN tests.**
- [x] **Step 3: Commit release evidence, push the branch and `main`, create a verified database backup, apply the additive migration, deploy through the established immutable release flow, and restart safely.**
- [x] **Step 4: Verify schema, health/DB, PM2, both origins, immutable/current assets, doctor-only catalog, and live Template Jabatan UI without saving or applying production permissions.**
- [x] **Step 5: Record final evidence and commit/push the documentation update.**

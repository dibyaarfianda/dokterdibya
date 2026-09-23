# Patient Authorization Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure a valid patient JWT can reach only explicitly approved patient operations, can act only on the authenticated patient's data, and always receives HTTP 403 on staff operations.

**Architecture:** Add one method-and-path matcher as defense-in-depth in the global patient blocker, then enforce the same boundary at each mixed router with `verifyPatientToken` or `verifyStaffToken`. Remove caller-supplied patient identity from patient mutations. Preserve intentional public bootstrap/share routes, but make raw document files available only through authenticated ownership or an expiring share grant.

**Tech Stack:** Node.js, Express 4, JWT, Jest 30, Supertest, MySQL 8, PM2.

**Spec:** User-approved remediation in the current task: protect staff endpoints, derive patient identity from JWT, replace prefix allowlisting, add valid-patient-JWT 403 tests, and audit document access/share tokens.

## Global Constraints

- Do not access or print patient identities, contact data, document keys, or share tokens during verification.
- Preserve public patient registration, password recovery, appointment confirmation-token, and document share-token workflows.
- Route-level authorization is mandatory; the global matcher is defense-in-depth.
- Complete validation, commit, push, production deploy, and live verification.
- Never add co-author attribution to commits.

## Review Focus

- A JWT containing `role: patient` without `user_type` must be treated as a patient.
- Query strings and trailing slashes must not bypass the method-and-path matcher.
- Patient self-service routes must keep working while staff siblings return 403.
- Patient document tracking must reject cross-patient document IDs and ignore caller-supplied patient IDs.
- Existing public share links must remain usable only until expiry and must not expose the raw file proxy.

---

### Task 1: Explicit patient route policy

**Files:**
- Create: `staff/backend/security/patientRouteAccess.js`
- Modify: `staff/backend/server.js`
- Test: `staff/backend/tests/unit/patientRouteAccess.test.js`

**Interfaces:**
- Produces: `isPatientAllowedRoute(method, url)` and `isPatientAuthBootstrapRoute(method, url)`.
- Consumes: Express request method and original URL only.

- [ ] Write a table-driven test covering allowed self-service routes, denied staff routes, method mismatches, query strings, and trailing slashes.
- [ ] Run the focused test and confirm it fails because the policy module does not exist.
- [ ] Implement normalized method-and-path rules and replace both `startsWith` checks in `server.js`.
- [ ] Run the focused test and confirm it passes.

### Task 2: Route-level staff and patient authentication

**Files:**
- Modify: `staff/backend/routes/patients-auth.js`
- Modify: `staff/backend/routes/patients.js`
- Modify: `staff/backend/routes/patient-intake.js`
- Modify: `staff/backend/routes/patient-documents.js`
- Modify: `staff/backend/routes/sunday-appointments.js`
- Modify: `staff/backend/routes/hospital-appointments.js`
- Modify: `staff/backend/routes/patient-questions.js`
- Modify: `staff/backend/routes/support-chat.js`
- Modify: `staff/backend/routes/polls.js`
- Modify: `staff/backend/routes/usg-photos.js`
- Modify: `staff/backend/routes/community-chat.js`
- Test: `staff/backend/tests/integration/patientStaffBoundary.test.js`
- Test: `staff/backend/tests/integration/protectedUploadRoutes.test.js`

**Interfaces:**
- Consumes: `verifyPatientToken`, `verifyStaffToken`, and existing role/permission middleware.
- Produces: HTTP 403 before database work for a valid patient JWT on every staff operation.

- [ ] Write Supertest cases with a valid patient JWT for each affected router and confirm the baseline is not 403.
- [ ] Replace generic JWT checks with the correct patient/staff middleware while retaining existing role/permission checks.
- [ ] Run the focused integration tests and confirm patient self-service remains reachable while staff routes return 403.

### Task 3: Ownership and document-share containment

**Files:**
- Modify: `staff/backend/routes/patient-documents.js`
- Modify: `staff/backend/routes/announcements.js`
- Modify: `public/js/announcements-dashboard.js`
- Create: `staff/backend/scripts/audit-patient-document-security.js`
- Test: `staff/backend/tests/integration/patientOwnershipBoundary.test.js`

**Interfaces:**
- Patient document actions consume `req.patient.id`; caller-supplied `patientId` is ignored.
- Staff creates share links; public recipients consume an expiring token and receive a signed download URL.
- Audit script returns aggregate counts only and never emits tokens, document keys, or patient identifiers.

- [ ] Write failing tests for cross-patient tracking, announcement likes with forged patient IDs, anonymous raw-file access, and safe share responses.
- [ ] Bind ownership to JWT, authenticate likes, sign shared R2 downloads, and protect the raw file proxy.
- [ ] Implement the aggregate read-only share/access audit script.
- [ ] Run ownership tests and the existing patient-document/browser contract tests.

### Task 4: Full verification and production rollout

**Files:**
- Update tests only if a real documented contract requires it; do not weaken security assertions.

**Interfaces:**
- Produces: a verified commit on `main`, deployed through the established VPS flow.

- [ ] Run syntax checks, focused tests, full unit/CI suite, and `git diff --check`.
- [ ] Review the full diff against the five approved requirements and perform one security-focused self-review.
- [ ] Commit without co-author attribution and push `main`.
- [ ] Deploy through the existing VPS process and reload `dibyaklinik-backend`.
- [ ] Run the aggregate share/access audit in production; quarantine only shares attributable to patient tokens or otherwise demonstrably unsafe, with a backup first.
- [ ] Verify health, PM2 state, patient self-service, and representative staff endpoints using synthetic/configured accounts without exposing patient data.

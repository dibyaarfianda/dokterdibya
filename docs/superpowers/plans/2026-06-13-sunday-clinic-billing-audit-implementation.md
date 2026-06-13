# Sunday Clinic Billing Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the obsolete Sunday Clinic billing revision workflow with direct staff editing backed by immutable audit stamps.

**Architecture:** Add a small backend audit service plus a migration-backed audit table. Hook the service into existing billing mutation routes, and update the existing billing component so editability depends on billing/payment state instead of dokter role. Keep legacy revision routes and data intact.

**Tech Stack:** Node.js, Express, MySQL, Jest, AdminLTE-style JavaScript component.

---

### Task 1: Regression Tests

**Files:**
- Create: `staff/backend/tests/unit/sundayClinicBillingAudit.test.js`

- [ ] **Step 1: Write failing tests**

Create tests that assert:

```javascript
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '../../../..');
const readRepoFile = (...segments) => fs.readFileSync(path.join(repoRoot, ...segments), 'utf8');

describe('Sunday Clinic billing audit implementation', () => {
    test('creates an immutable billing audit migration', () => {
        const migration = readRepoFile(
            'staff',
            'backend',
            'migrations',
            '20260613_create_sunday_clinic_billing_audit_logs.sql'
        );

        expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS sunday_clinic_billing_audit_logs/i);
        expect(migration).toMatch(/action\s+VARCHAR\(50\)\s+NOT NULL/i);
        expect(migration).toMatch(/before_snapshot\s+JSON\s+NULL/i);
        expect(migration).toMatch(/after_snapshot\s+JSON\s+NULL/i);
        expect(migration).toMatch(/created_at\s+TIMESTAMP\s+DEFAULT CURRENT_TIMESTAMP/i);
    });

    test('billing UI removes revision request and allows staff edits on confirmed bills', () => {
        const billingJs = readRepoFile(
            'staff',
            'public',
            'scripts',
            'sunday-clinic',
            'components',
            'shared',
            'billing.js'
        );

        expect(billingJs).not.toContain('btn-request-revision');
        expect(billingJs).not.toContain('/request-revision');
        expect(billingJs).not.toContain('Tagihan sudah dikonfirmasi, tidak dapat diubah.');
        expect(billingJs).toContain('Tagihan sudah dikonfirmasi. Perubahan akan dicatat di riwayat.');
        expect(billingJs).toContain('btn-billing-audit-history');
    });

    test('Sunday Clinic route writes billing audit logs on key mutations', () => {
        const route = readRepoFile('staff', 'backend', 'routes', 'sunday-clinic.js');

        expect(route).toContain("require('../services/SundayClinicBillingAuditService')");
        expect(route).toContain("action: 'billing_confirmed'");
        expect(route).toContain("action: 'billing_marked_paid'");
        expect(route).toContain("router.get('/billing/:mrId/audit'");
    });
});
```

- [ ] **Step 2: Run RED**

Run:

```powershell
cd staff\backend
npx jest --runTestsByPath tests/unit/sundayClinicBillingAudit.test.js --coverage=false
```

Expected: fail because migration, service import, audit endpoint, and UI text do not exist yet.

### Task 2: Audit Schema and Service

**Files:**
- Create: `staff/backend/migrations/20260613_create_sunday_clinic_billing_audit_logs.sql`
- Create: `staff/backend/services/SundayClinicBillingAuditService.js`
- Modify: `staff/backend/routes/sunday-clinic.js`

- [ ] **Step 1: Add migration**

Create `sunday_clinic_billing_audit_logs` with `billing_id`, `mr_id`, `action`, actor fields, `summary`, JSON snapshots, and timestamp indexes.

- [ ] **Step 2: Add service**

Create a CommonJS service exporting:

```javascript
async function getBillingSnapshot(client, billingId) {}
async function logBillingAudit(client, payload) {}
function getActorFromRequest(req) {}
```

The service should JSON-parse `billing_data` and `item_data` safely.

- [ ] **Step 3: Ensure runtime schema**

Update `ensureBillingTables()` to create the audit table if migrations have not been applied yet.

- [ ] **Step 4: Run GREEN for source tests if possible**

Run the focused Jest command from Task 1. Some assertions may still fail until route/UI work is complete.

### Task 3: Backend Route Hooks

**Files:**
- Modify: `staff/backend/routes/sunday-clinic.js`

- [ ] **Step 1: Import audit helpers**

Import `getBillingSnapshot`, `logBillingAudit`, and `getActorFromRequest`.

- [ ] **Step 2: Add audit endpoint**

Add:

```javascript
router.get('/billing/:mrId/audit', verifyToken, async (req, res, next) => {
    // patients blocked, staff returns audit rows newest first
});
```

- [ ] **Step 3: Audit full billing saves**

In `POST /billing/:mrId`, capture before/after snapshots and log `billing_created` or `billing_saved` inside the transaction.

- [ ] **Step 4: Audit obat additions**

In `POST /billing/:mrId/obat`, capture before/after snapshots and log `item_added` inside the transaction.

- [ ] **Step 5: Audit confirmations**

In `POST /billing/:mrId/confirm`, capture before/after snapshots and log `billing_confirmed`.

- [ ] **Step 6: Audit paid status**

In `POST /billing/:mrId/mark-paid`, capture before/after snapshots and log `billing_marked_paid` after the status update.

- [ ] **Step 7: Audit item deletions**

In the three delete item routes, capture before/after snapshots and log `item_removed`.

### Task 4: Frontend Billing UI

**Files:**
- Modify: `staff/public/scripts/sunday-clinic/components/shared/billing.js`

- [ ] **Step 1: Remove revision action**

Remove `btn-request-revision` rendering and its event handler.

- [ ] **Step 2: Replace role lock with status lock**

Confirmed billing remains editable unless backend reports a pending-payment block. Paid billing remains disabled.

- [ ] **Step 3: Add stamp and history button**

Render `last_modified_by` / `last_modified_at` and a `Riwayat Perubahan` button.

- [ ] **Step 4: Add audit history modal**

Fetch `/api/sunday-clinic/billing/${mrId}/audit` and render action, actor, timestamp, and summary.

### Task 5: Verification and Commit

**Files:**
- All changed files

- [ ] **Step 1: Focused tests**

Run:

```powershell
cd staff\backend
npx jest --runTestsByPath tests/unit/sundayClinicBillingAudit.test.js --coverage=false
```

- [ ] **Step 2: Syntax checks**

Run:

```powershell
node --check staff/backend/server.js
node --check staff/backend/routes/sunday-clinic.js
node --check staff/backend/services/SundayClinicBillingAuditService.js
node --check staff/public/scripts/sunday-clinic/components/shared/billing.js
```

- [ ] **Step 3: Static checks**

Run:

```powershell
rg "btn-request-revision|/request-revision|Tagihan sudah dikonfirmasi, tidak dapat diubah" staff/public/scripts/sunday-clinic/components/shared/billing.js
rg "sunday_clinic_billing_audit_logs|billing_confirmed|billing_marked_paid|router.get\\('/billing/:mrId/audit'" staff/backend/routes/sunday-clinic.js staff/backend/services/SundayClinicBillingAuditService.js staff/backend/migrations/20260613_create_sunday_clinic_billing_audit_logs.sql
```

Expected: first command finds no matches; second command finds audit references.

- [ ] **Step 4: Commit and push**

Commit without co-author footer:

```powershell
git add docs/superpowers/plans/2026-06-13-sunday-clinic-billing-audit-implementation.md staff/backend/tests/unit/sundayClinicBillingAudit.test.js staff/backend/migrations/20260613_create_sunday_clinic_billing_audit_logs.sql staff/backend/services/SundayClinicBillingAuditService.js staff/backend/routes/sunday-clinic.js staff/public/scripts/sunday-clinic/components/shared/billing.js
git commit -m "Implement Sunday Clinic billing audit trail"
git push
```

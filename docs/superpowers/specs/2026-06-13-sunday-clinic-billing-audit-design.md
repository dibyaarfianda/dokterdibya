# Sunday Clinic Billing Audit Design

Date: 2026-06-13

## Summary

Sunday Clinic tagihan should move away from the old "staff request revision, doctor approves" workflow. The current system already lets all staff confirm billing on the backend, but the frontend still locks confirmed billing for non-dokter and shows an "Ajukan Perubahan" button. The new workflow will let staff with Sunday Clinic access confirm and edit tagihan directly, while every change is recorded in an immutable audit trail.

## Goals

- Allow staff users, not patients, to confirm Sunday Clinic billing.
- Allow staff users to edit `draft` and `confirmed` billing when there is no pending online payment.
- Preserve strict protection for `paid` billing.
- Replace the revision-request UI with direct editing plus visible change history.
- Record who changed billing, what changed, and when it changed.
- Keep old revision records readable in the database; do not delete legacy data.

## Non-Goals

- No redesign of the full Sunday Clinic page.
- No change to patient billing payloads.
- No automatic silent cancellation of online payment links.
- No editing of `paid` billing in this phase.
- No removal of the legacy `sunday_clinic_billing_revisions` table in this phase.

## Current Code Findings

- `POST /api/sunday-clinic/billing/:mrId/confirm` already allows all staff and blocks only patient users.
- `staff/public/scripts/sunday-clinic/components/shared/billing.js` still treats confirmed billing as dokter-only for editing.
- The confirmed billing UI shows `Ajukan Perubahan` for non-dokter users.
- Existing backend edit routes already block edits when billing status is `paid`.
- Existing backend edit routes already block confirmed billing edits when there is a pending row in `tagihan_payments`.
- `mark-paid` deducts stock and finalizes the medical record, so paid billing must remain locked.

## Recommended Workflow

### Draft Billing

Any staff user with Sunday Clinic access can:

- Add or remove billing items.
- Confirm the billing.
- Print invoice or etiket after confirmation.

Audit events are written for item additions, item removals, full billing saves, and confirmation.

### Confirmed Billing Without Pending Payment

Any staff user with Sunday Clinic access can:

- Add or remove billing items.
- Save recalculated totals.
- Mark the bill as paid.
- Create an online payment link.
- Print invoice or etiket.

The UI shows that the bill is confirmed, but it does not lock editing by role. It also shows the latest modification stamp and a button to view the audit history.

### Confirmed Billing With Pending Online Payment

Editing is blocked. The UI should show:

`Ada pembayaran online pending. Batalkan link pembayaran terlebih dahulu sebelum mengubah tagihan.`

Staff must explicitly cancel or expire the pending payment link, then edit the billing and create a new link. The system must not auto-cancel payment links silently.

### Paid Billing

Paid billing remains read-only. Staff can print invoice or etiket, but cannot change billing items or totals.

## Audit Trail

Add a new immutable table, `sunday_clinic_billing_audit_logs`, with these fields:

- `id`
- `billing_id`
- `mr_id`
- `action`
- `actor_user_id`
- `actor_name`
- `actor_role`
- `summary`
- `before_snapshot`
- `after_snapshot`
- `created_at`

`before_snapshot` and `after_snapshot` should be JSON. They should include enough billing and item data to answer what changed without reconstructing state from separate tables.

Recommended actions:

- `billing_created`
- `billing_saved`
- `billing_confirmed`
- `item_added`
- `item_removed`
- `obat_items_replaced`
- `billing_marked_paid`
- `payment_pending_blocked_edit`

Audit timestamps must be generated server-side with `NOW()`.

## Backend Design

- Keep the existing `confirm` route staff-accessible.
- Keep existing guards that block edits for `paid` billing.
- Keep existing guards that block edits for confirmed billing with pending payment.
- Add a small billing audit helper in the backend route or a focused service module.
- Write audit logs inside the same transaction as the billing mutation wherever the mutation already uses a transaction.
- For non-transactional mutation routes, add audit logging after the successful update and keep failure logging explicit.
- Add an endpoint to fetch audit history for a billing record:
  - `GET /api/sunday-clinic/billing/:mrId/audit`
  - Staff-only via existing auth.
  - Returns newest-first or oldest-first consistently; UI can display newest-first.

## Frontend Design

Update `staff/public/scripts/sunday-clinic/components/shared/billing.js`:

- Remove the non-dokter `Ajukan Perubahan` action from confirmed billing.
- Enable administrative billing checkboxes for confirmed billing when billing is not paid.
- Replace role-based text with status-based text:
  - confirmed editable: `Tagihan sudah dikonfirmasi. Perubahan akan dicatat di riwayat.`
  - pending payment blocked: `Ada pembayaran online pending. Batalkan link pembayaran terlebih dahulu sebelum mengubah tagihan.`
  - paid locked: `Tagihan sudah dibayar.`
- Show a last-change stamp when `last_modified_by` and `last_modified_at` are available.
- Add a `Riwayat Perubahan` button that opens a modal or inline panel populated from the audit endpoint.

## Legacy Revision Handling

- Hide the old revision request button from the active billing UI.
- Keep `request-revision`, `pending revisions`, and `approve revision` backend routes for backward compatibility unless a later cleanup plan removes them.
- Do not delete the `sunday_clinic_billing_revisions` table or historical rows.

## Error Handling

- If a staff edit is blocked because of pending payment, return the existing backend error and show it directly in the UI.
- If audit logging fails inside a billing transaction, rollback the billing change.
- If audit history cannot load, show a non-blocking error in the history modal and do not affect the billing page.

## Testing Plan

- Backend syntax checks:
  - `node --check staff/backend/server.js`
  - `node --check staff/backend/routes/sunday-clinic.js`
- Frontend syntax checks:
  - `node --check staff/public/scripts/sunday-clinic/components/shared/billing.js`
- Static checks:
  - Confirm `btn-request-revision` is no longer rendered by active billing UI.
  - Confirm non-dokter role checks no longer disable confirmed billing edits.
- Database checks:
  - Migration creates `sunday_clinic_billing_audit_logs`.
  - Audit rows are inserted for confirm, item add, item removal, and mark-paid.
- Behavioral checks:
  - Staff can confirm a draft bill.
  - Staff can edit a confirmed bill with no pending payment.
  - Staff cannot edit a confirmed bill with a pending online payment.
  - Staff cannot edit a paid bill.
  - Audit history shows actor, timestamp, action, and before/after summary.

## Rollout Notes

- Deploy migration before restarting the backend.
- Restart `pm2` process `dibyaklinik-backend`.
- Verify Sunday Clinic billing page loads without console errors.
- Verify a confirmed bill edited by non-dokter writes an audit row.
- Verify a pending online payment blocks edits and shows the explicit message.

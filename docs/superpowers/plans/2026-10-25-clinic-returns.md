# Clinic returns implementation plan

**Goal:** Audited cash and medication returns below additional billing, with automatic original-stock restoration.
**Architecture:** Additive immutable return ledger, serialized by parent invoice, current-date accounting guard, existing reset authorization, and negative closing entries.
**Spec:** ../specs/2026-10-25-clinic-returns-design.md
**Stack:** Existing Express/mysql2, vanilla JS, Jest; no new dependencies.

- [x] Add failing behavioral tests for quantity/value limits, duplicate keys, stock allocation, rollback, and closing deductions.
- [x] Implement ledger migration and service; restore original batch/legacy sale quantities in the same transaction and invalidate obat cache.
- [x] Register staff read and authorized write routes, preserve real-time refresh and accounting lock.
- [x] Add billing return form/history/net totals, error handling and retry-safe request keys. Add closing display and snapshot support.
- [ ] Run focused regression tests, syntax/static checks, review, commit, push, migrate, deploy immutable Staff release and backend, verify health/assets/UI.

Review focus: cross-invoice IDs, over-return across repeated/concurrent requests, ambiguous or missing stock history, returning after original accounting date closed, network uncertainty without duplicate dispatch.

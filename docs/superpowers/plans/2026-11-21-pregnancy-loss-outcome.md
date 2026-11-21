# Kehamilan Berakhir (Keguguran / Lahir Mati) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Staff can mark a pregnancy as ended by keguguran / lahir mati; HPL disappears from Kelola Pasien and the portal tracker/booking suggestion, with no patient-facing message; "Sudah Lahir" stops hiding later pregnancies.

**Architecture:** One pure rule module (`PregnancyEnd.js`) decides "ended" from an HPHT and the patient's end events (active `pregnancy_outcomes` + `birth_congratulations`). A small service writes/voids outcomes. Every HPL consumer in scope (staff list, advanced search, near/overdue panels, portal tracker, prepay suggestion) calls the rule.

**Tech Stack:** Node/Express, mysql2 (`db.query`), Jest + supertest, vanilla JS + SweetAlert2 + AdminLTE (Font Awesome 5.15.4) in staff, vanilla JS in patient portal.

**Spec:** `docs/superpowers/specs/2026-11-21-pregnancy-loss-outcome-design.md`

## Global Constraints

- Outcome code paths never read/write `birth_congratulations` for writing, never send push/WhatsApp/notifications.
- Portal responses never contain `keguguran` / `lahir_mati` or the outcome type; only `pregnancy_ended: true` + `ended_on`.
- Rule: ended ⇔ some end event with `event.date >= hpht − 14 days` (`END_TOLERANCE_DAYS = 14`); the latest such event is the one reported.
- Birth event date = `COALESCE(birth_date, DATE(created_at))`. Only `pregnancy_outcomes.voided_at IS NULL` rows count.
- Dates are local `YYYY-MM-DD` strings (server is GMT+7); never `toISOString()` for date-only values.
- No runtime `CREATE TABLE` (`StaffPanelWave6StartupSchema.test.js`); table comes only from the migration.
- Role/permission: new staff routes require `patients.edit` via `ROUTE_PERMISSION_OVERRIDES`.
- Use `getAuthToken()` in staff frontend; export onclick functions on `window`.
- `patients.id` is `varchar(10) utf8mb4_unicode_ci`.
- Tests run on the VPS (no local Node): slim/`git archive` copy in `/tmp/<name>`, symlink `/var/www/dokterdibya/staff/backend/node_modules`, `cd staff/backend && JWT_SECRET=test node node_modules/jest/bin/jest.js --coverage=false --runInBand --forceExit <pattern>`. Below, "Run" means this recipe.

## Review Focus

1. HPHT stored as datetime or with trailing junk (`2026-03-01T00:00`, `2026-03-01 00:00:00`) → rule uses the first 10 chars when they form a valid date; anything else = no HPHT (not ended, not a crash). Test in Task 1.
2. `pregnancy_outcomes` table missing (code deployed before migration) → lists still load using births only, one warning logged. Test in Task 1.
3. Event date exactly on `hpht − 14` (boundary) → ended; `hpht − 15` → not ended. Test in Task 1.
4. Double click on "Simpan" creating two outcomes → harmless (both count, same result); cancelling one leaves the other active, so UI must show the remaining one after reload. Test in Task 2 (void affects only the given id).
5. Patient with a local HPHT preview stored on the phone dated after `ended_on` (new pregnancy) → preview still shows. Manual check in Task 7.

---

### Task 1: Pregnancy end rule

**Files:**
- Create: `staff/backend/services/PregnancyEnd.js`
- Test: `staff/backend/tests/unit/PregnancyEnd.test.js`

**Interfaces:**
- Produces:
  - `END_TOLERANCE_DAYS = 14`
  - `toDateString(value: string|Date|null) -> 'YYYY-MM-DD'|null` (Date → local components; string → first 10 chars if valid calendar date)
  - `resolvePregnancyEnd(hpht: string|Date|null, events: Array<{type:'birth'|'keguguran'|'lahir_mati', date:'YYYY-MM-DD', id?:number, note?:string|null}>) -> { ended: false } | { ended: true, type, date, id?, note? }` (outcome events carry `id`/`note`, births don't)
  - `async trackerEndState(db, patientId, hpht: 'YYYY-MM-DD') -> null | { ended_on: 'YYYY-MM-DD' }` (loads events for one patient, applies the rule)
  - `hphtFromReference(ref: {kind:'hpht'|'hpl', date:string}|null) -> 'YYYY-MM-DD'|null` (`hpl` → date − 280 days)
  - `async loadEndEvents(db, patientIds: string[], logger?) -> Map<string, Event[]>`
  - `endedSqlCondition(patientIdExpr: string, hphtExpr: string) -> string` — an `EXISTS (...)` expression true when the pregnancy is ended (callers write `AND NOT ${...}`); no `?` placeholders inside.
  - `pregnancyListFields(hphtStr, events, today: Date) -> { is_obstetri, hpl, days_pregnant, has_delivered, pregnancy_end }` where `pregnancy_end = {type, date}|null`, `has_delivered = pregnancy_end?.type === 'birth'`; `hpl`/`days_pregnant` computed exactly as today's code in `routes/patients.js:731-741` (HPHT + 280 days, local date string).

- [ ] **Step 1: Write failing tests** `PregnancyEnd.test.js`:
  - `resolvePregnancyEnd('2026-05-01', [])` → `{ ended: false }`
  - birth `2026-04-10` vs HPHT `2026-05-01` → not ended (21 days before); keguguran `2026-04-17` → ended (exactly −14); `2026-04-16` → not ended
  - events `[{birth,'2026-06-01'},{keguguran,'2026-07-20'}]`, HPHT `2026-05-01` → `{ ended:true, type:'keguguran', date:'2026-07-20' }`
  - HPHT `'2026-05-01T00:00'` and `'2026-05-01 00:00:00'` behave like `'2026-05-01'`; `'abc'`, `''`, `null` → `{ ended:false }`
  - `hphtFromReference({kind:'hpl', date:'2027-02-05'})` → `'2026-05-01'`; `{kind:'hpht', date:'2026-05-01'}` → same; `null` → `null`
  - `loadEndEvents` with a fake `db.query` returning outcome rows and birth rows (birth_date null + created_at `2026-06-03 10:00:00` → date `'2026-06-03'`) → Map grouped by patient id; outcome query SQL contains `voided_at IS NULL`
  - `loadEndEvents` when the outcome query rejects with `{ code: 'ER_NO_SUCH_TABLE' }` → births still returned, `logger.warn` called once; any other error rethrows
  - `loadEndEvents(db, [])` → empty Map, no query
  - `endedSqlCondition('p.id','latest.hpht')` contains `pregnancy_outcomes`, `voided_at IS NULL`, `birth_congratulations`, `INTERVAL 14 DAY`, and no `?`
  - `pregnancyListFields(null, [], today)` → `{ is_obstetri:false, hpl:null, days_pregnant:null, has_delivered:false, pregnancy_end:null }`; with HPHT `2026-05-01` and a birth `2026-06-01` → `has_delivered:true`, `pregnancy_end.type 'birth'`, `hpl '2027-02-05'`
- [ ] **Step 2: Run** `PregnancyEnd` → FAIL (module missing).
- [ ] **Step 3: Implement** `PregnancyEnd.js`. Day arithmetic via `Date(y, m-1, d)` local components. `loadEndEvents` issues two queries in parallel: `SELECT patient_id, outcome_type, event_date FROM pregnancy_outcomes WHERE voided_at IS NULL AND patient_id IN (...)` and `SELECT patient_id, birth_date, created_at FROM birth_congratulations WHERE patient_id IN (...)`. SQL condition compares `LEFT(<hphtExpr>,10)` with `DATE_SUB(...)` for both tables via `OR` of two EXISTS, wrapped in parentheses.
- [ ] **Step 4: Run** `PregnancyEnd` → PASS.
- [ ] **Step 5: Commit** `git add staff/backend/services/PregnancyEnd.js staff/backend/tests/unit/PregnancyEnd.test.js && git commit -m "Add pregnancy end rule"`

### Task 2: Migration and outcome service

**Files:**
- Create: `staff/backend/migrations/20261121_pregnancy_outcomes.sql` (DDL exactly as the spec's Data section, `patient_id VARCHAR(10)`, header comment with the run command like `20261104_staff_menu_seen.sql`)
- Create: `staff/backend/services/PregnancyOutcomeService.js`
- Test: `staff/backend/tests/unit/PregnancyOutcomeService.test.js`

**Interfaces:**
- Consumes: `toDateString`, `resolvePregnancyEnd`, `hphtFromReference` (Task 1); `findPregnancyReference` is NOT used (needs both sources, not the newest).
- Produces:
  - `class PregnancyOutcomeError extends Error { status: number }`
  - `createPregnancyOutcomeService({ db, now = () => new Date() }) -> { record(patientId, { outcome_type, event_date, note }, staffId) -> Promise<{ id, outcome_type, event_date }>, voidOutcome(patientId, outcomeId, staffId) -> Promise<void> }`
  - `OUTCOME_TYPES = ['keguguran', 'lahir_mati']`

- [ ] **Step 1: Write failing tests** (fake `db.query` keyed by SQL substring):
  - bad type `'aborsi'` → 400 `'Jenis kejadian tidak valid'`
  - `event_date '2026-13-01'` / missing → 400 `'Tanggal kejadian tidak valid'`
  - `now = 2026-11-21 10:00 local`, `event_date '2026-11-22'` → 400 `'Tanggal kejadian tidak boleh di masa depan'`; `'2026-11-21'` allowed
  - note 501 chars → 400 `'Catatan maksimal 500 karakter'`; note trimmed, empty → `null`
  - unknown patient → 404 `'Pasien tidak ditemukan'`
  - no anamnesa HPHT and no USG EDD → 400 `'Pasien tidak punya data kehamilan (HPHT/HPL)'`
  - HPHT `2026-10-01`, event `2026-09-01` → 400 `'Tanggal kejadian lebih awal dari HPHT kehamilan ini'`
  - only USG EDD `2027-02-05` (HPHT 2026-05-01), event `2026-07-10` → inserted; INSERT params `[patientId, 'keguguran', '2026-07-10', note, staffId]`
  - no SQL issued by `record`/`voidOutcome` contains `birth_congratulations`
  - `voidOutcome` runs `UPDATE pregnancy_outcomes SET voided_at = NOW(), voided_by = ? WHERE id = ? AND patient_id = ? AND voided_at IS NULL`; `affectedRows 0` → 404 `'Penandaan tidak ditemukan'`
- [ ] **Step 2: Run** `PregnancyOutcomeService` → FAIL.
- [ ] **Step 3: Implement.** Current HPHT sources: latest obstetri anamnesa HPHT (same SELECT as `routes/patients.js:669-681` for one patient) and latest USG EDD (same SELECT as `routes/patients-auth.js:2413-2425`) → `hphtFromReference`. Accept when at least one source gives `resolvePregnancyEnd(hpht, [{type, date:event_date}]).ended`.
- [ ] **Step 4: Run** → PASS; also run `StaffPanelWave6StartupSchema` → PASS (no runtime DDL added).
- [ ] **Step 5: Commit** "Add pregnancy outcome table and service".

### Task 3: Staff routes and access control

**Files:**
- Modify: `staff/backend/routes/patients.js` (next to `mark-delivered`, ~line 1841)
- Modify: `staff/backend/config/accessControlRegistry.js` (`ROUTE_PERMISSION_OVERRIDES`)
- Test: `staff/backend/tests/unit/Task7PatientMedicalRecordAccess.test.js` (add matrix rows)

**Interfaces:**
- Consumes: `createPregnancyOutcomeService`, `PregnancyOutcomeError` (Task 2).
- Produces (HTTP):
  - `POST /api/patients/:id/pregnancy-outcome` body `{ outcome_type, event_date, note? }` → `201 { success:true, data:{ id, outcome_type, event_date } }`; error → `{ success:false, message }` with the service status
  - `DELETE /api/patients/:id/pregnancy-outcome/:outcomeId` → `200 { success:true }`
  Both `verifyStaffToken`, `staffId = req.user.id`, then `cache.delPattern('patients:')`. Unexpected errors → 500 `'Gagal menyimpan penandaan kehamilan'` (no `error.message` leak).

- [ ] **Step 1: Add failing matrix rows** `['POST','/api/patients/P-1/pregnancy-outcome','patients.edit']`, `['DELETE','/api/patients/P-1/pregnancy-outcome/7','patients.edit']`.
- [ ] **Step 2: Run** `Task7PatientMedicalRecordAccess AccessControlCatalogRegistry` → new rows FAIL.
- [ ] **Step 3: Add routes + overrides** `patients:POST:/api/patients/:id/pregnancy-outcome` and `patients:DELETE:/api/patients/:id/pregnancy-outcome/:outcomeId` → `'patients.edit'`. Routes must be registered before any `/api/patients/:id` catch-all in the same router.
- [ ] **Step 4: Run** both suites → new rows PASS; failing list otherwise equal to baseline.
- [ ] **Step 5: Commit** "Add staff pregnancy outcome routes".

### Task 4: Staff lists and HPL panels use the rule

**Files:**
- Modify: `staff/backend/routes/patients.js` — list (~690-761), advanced search (~957-1041), near-due (~1177-1178), overdue (~1272-1273)
- Test: `staff/backend/tests/unit/PregnancyEnd.test.js` (already covers `pregnancyListFields`); add `staff/backend/tests/unit/PatientsPregnancyPanels.test.js`

**Interfaces:**
- Consumes: `loadEndEvents`, `pregnancyListFields`, `endedSqlCondition` (Task 1).
- Produces: list + advanced rows gain `pregnancy_end: {type,date}|null`; `has_delivered` keeps its name.

- [ ] **Step 1: Write failing test** `PatientsPregnancyPanels.test.js`: read `routes/patients.js` source; assert the near-due and overdue handlers no longer contain `LEFT JOIN birth_congratulations bc` and contain `NOT ${endedSqlCondition(`-style call (assert on `endedSqlCondition(` appearing ≥ 2 times) and that `birthSet` is gone from the file.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.** List: replace the birth batch with `loadEndEvents(db, obstetriPatientIds, logger)` and map with `pregnancyListFields(obstetriMap[id], events.get(id) || [], today)`; advanced search the same (its batch 3 replaced). Panels: `WHERE ${visiblePatientCondition('p')} AND NOT ${endedSqlCondition('p.id', 'latest.hpht')}` and drop the bc join.
- [ ] **Step 4: Run** `PregnancyEnd PatientsPregnancyPanels` → PASS. Then a VPS scratch-DB smoke (copy of `patients`, `sunday_clinic_records`, `medical_records`, `birth_congratulations` not needed — instead run the near/overdue SELECT text against prod read-only with `EXPLAIN` to prove it parses): `EXPLAIN <query>` returns rows, no error.
- [ ] **Step 5: Commit** "Use pregnancy end rule in patient lists and HPL panels".

### Task 5: Portal tracker and prepay suggestion

**Files:**
- Modify: `staff/backend/routes/patients-auth.js:2404-2470` (pregnancy-tracker)
- Modify: `staff/backend/routes/patient-checkup-prepay.js:87-94` (suggestion)
- Check: `staff/backend/middleware/patientDemoGuard.js:79` (demo path untouched unless it builds its own payload)
- Test: `staff/backend/tests/unit/PatientCheckupPrepayRoutes.test.js` (add cases), new `staff/backend/tests/unit/PregnancyTrackerEnded.test.js`

**Interfaces:**
- Consumes: `loadEndEvents`, `resolvePregnancyEnd`, `hphtFromReference` (Task 1).
- Produces: tracker ended response exactly `{ success:true, data:null, pregnancy_ended:true, ended_on:'YYYY-MM-DD', message:'Data kehamilan belum tersedia.' }`. Suggestion ended → `weeks/days/source/suggested_code: null`, `packages` unchanged.

- [ ] **Step 1: Write failing tests.** Prepay: a patient with reference `{kind:'hpl', date:'2027-02-05'}` and an outcome event `2026-07-10` → `suggested_code null`, `weeks null`, packages still listed; without the event → suggestion as before (existing tests stay green). Inject events through the router factory (add optional `loadEndEvents` dependency defaulting to the real one). Tracker: unit-test `trackerEndState` (Task 1) in `PregnancyTrackerEnded.test.js` with a fake db (outcome → `{ended_on}`, birth → `{ended_on}`, none → `null`), plus a source test that the `/pregnancy-tracker` handler calls `trackerEndState` and its ended branch JSON literal contains no `type`/`outcome_type` key.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.** Tracker: after computing `hphtEstimate`, check before the existing HPL+14 grace check; births count too (spec decision).
- [ ] **Step 4: Run** `PatientCheckupPrepayRoutes PregnancyTrackerEnded PregnancyEnd patientRouteAccess` → PASS.
- [ ] **Step 5: Commit** "Hide portal tracker and pregnancy suggestion after pregnancy ends".

### Task 6: Staff UI

**Files:**
- Modify: `staff/public/scripts/legacy/patient-tools.js` (HPL cell ~1483-1494, buttons ~1497-1501 and ~1113, new functions near `markAsDelivered` ~1902)
- Modify: `staff/public/index-adminlte.html` (`window.__assetVersion`), `staff/public/sw.js` (`STAFF_PWA_VERSION`) → next unused `vNNN` (check `/var/www/dokterdibya-staff-releases` at deploy; currently v498 → v499)

**Interfaces:**
- Consumes: Task 3 HTTP API; Task 4 `pregnancy_end` field. HPL panel rows do not carry `pregnancy_end` (ended patients are excluded server-side).
- Produces: `window.markPregnancyEnded(patientId, patientName, btnEl)`, `window.showPregnancyOutcome(patientId, patientName, outcomeJson)`.

- [ ] **Step 1: Implement.**
  - HPL cell: `pregnancy_end.type === 'birth'` → existing "Sudah Lahir" badge; `keguguran`/`lahir_mati` → `<span class="badge badge-secondary" role="button" title="Tanggal: <date>"><i class="fas fa-ribbon mr-1"></i>Keguguran|Lahir Mati</span>` with onclick `showPregnancyOutcome`. Main HPL condition becomes `patient.is_obstetri && patient.hpl && !patient.pregnancy_end`.
  - Button `btn btn-sm btn-secondary` (`fa-ribbon`, title "Kehamilan Berakhir (keguguran / lahir mati)") beside the delivery button, same conditions (`canEdit && is_obstetri && !pregnancy_end`); panel rows get `btn-xs` version.
  - `markPregnancyEnded`: Swal with radios Keguguran / Lahir Mati (none preselected, required), `<input type="date">` default today local, `max` today, textarea note (maxlength 500); text: "Pasien tidak akan menerima pesan atau notifikasi apa pun." On success: HPL cell → grey badge, remove both buttons in the row, `loadHplRiskPatients()`, toast "Penandaan disimpan".
  - `showPregnancyOutcome`: Swal with type, date, note; if `hasPatientToolsPermission('patients.edit')` a "Batalkan penandaan" button → confirm → DELETE → reload list (`window.loadPatients?.()` or the existing refresh used after delete — read the file) and panels.
  - Escape all values with `escapeHtmlSafe`; outcome id comes from `pregnancy_end.id`.
- [ ] **Step 2: Verify locally** with the staff UI harness ([[local-staff-ui-harness]] memory: Python static server + import-map stubs in the built-in browser): render a row with each `pregnancy_end` variant, open both dialogs, confirm buttons/badges; then delete the temp `launch.json`.
- [ ] **Step 3: Run** suites that read staff assets (`StaffPanel`, `AccessControlParity`, `Task7`) → failing list equal to baseline.
- [ ] **Step 4: Commit** "Add Kehamilan Berakhir action to Kelola Pasien".

### Task 7: Patient portal

**Files:**
- Modify: `public/scripts/patient-menu-shell.js:1930-1949` (`loadPregnancyTrackerHome`)
- Modify: `public/patient-menu.html:1257-1258` (CSS)
- Modify: `public/pregnancy-tracker.html:422-451` (`loadPregnancyData`)
- Check: `public/contraction-timer.html:675` (null data path shows nothing loss-related)
- Modify: `public/sw.js` `CACHE_VERSION` → `20261121a` (or the next free suffix that day)

- [ ] **Step 1: Implement.**
  - Home: if `result.pregnancy_ended` → `document.body.classList.add('pregnancy-ended')` and return; CSS: `body.pregnancy-ended #tracker-panel { display:none; }` and `body.pregnancy-ended #tracker-panel + .announcement-panel { grid-column: 1 / -1; }` (same as the birth rules).
  - Tracker page: when `result.pregnancy_ended`, use local HPHT only if `localHpht > result.ended_on` (string compare on `YYYY-MM-DD`); otherwise `renderEmpty(container, result.message)`. Same filter in the catch branch is not possible (no `ended_on`) — leave it.
- [ ] **Step 2: Verify** in the built-in browser with `?mockApi=1`-style mock if the page supports it, else a static server + stubbed fetch: ended → home card hidden, tracker page neutral empty state; local HPHT after `ended_on` → preview shows.
- [ ] **Step 3: Run** `WebHardeningPlan ContractionTimerPortalIntegration PatientPortalHeaderBranding` → equal to baseline.
- [ ] **Step 4: Commit** "Hide pregnancy tracker in portal after pregnancy ends".

### Task 8: Full suite, merge, deploy, live check

- [ ] **Step 1:** Full suite on VPS (`git archive` copies of base `01918b564` and head, `--maxWorkers=2`, nohup + DONE marker); `comm` sorted `●` lines → no new failures.
- [ ] **Step 2:** Push branch, open PR, merge to main (built-in browser on GitHub).
- [ ] **Step 3:** Deploy per [[staff-asset-release-staging]]: bundle → www-data fetch → detached worktree → stage `v499` → pre-cutover verifier (`.js` paths in both versions) → backup `mysqldump dibyaklinik pregnancy_outcomes` not needed (new table); run migration via `git show <sha>:staff/backend/migrations/20261121_pregnancy_outcomes.sql | mysql dibyaklinik` BEFORE ff-merge → ff-merge → `pm2 reload ecosystem.config.js --only dibyaklinik-backend` → post verifier.
- [ ] **Step 4:** Live check in the staff panel (built-in browser, logged in): `DESCRIBE pregnancy_outcomes` via the migration output; Kelola Pasien loads; P2026083 now shows its HPL; no new entries look wrong in the HPL panels. Do not mark a real patient — ask the user to mark one real case themselves, then confirm list, panels, and the patient's portal home/tracker; cancel works.
- [ ] **Step 5:** Update CLAUDE.md with a short section (rule, table, routes) and the memory file.

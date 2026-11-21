# Kehamilan per Pasien — Tahap 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One record per pregnancy per patient; a new pregnancy starts from a new HPHT (completing the previous one when it has no end); a "Riwayat Kehamilan Sebelumnya" card in the Private Clinic anamnesa; existing data backfilled with a review list; Kelola Pasien links to old resumes.

**Architecture:** Pure rules (`PregnancyEpisodeRules.js`) + a repository/service (`PregnancyEpisodeService.js`) + a staff router (`routes/pregnancies.js`). The visit page calls a `resolve` endpoint after a successful anamnesa save; only that interactive path may start a pregnancy. A shared frontend card renders history on obstetri / gyn visits. A dry-run-first backfill script builds pregnancies from existing visits, births and outcomes. Stage 2 (switching HPL consumers) is out of scope.

**Tech Stack:** Node/Express, mysql2 pool (`require('../db')`), Jest (node env, fake db objects, `vm` for frontend components), vanilla JS ES modules in `staff/public/scripts/sunday-clinic/` (UI says "Private Clinic"), AdminLTE + SweetAlert2 in Kelola Pasien.

**Spec:** `docs/superpowers/specs/2026-11-21-pregnancy-episodes-design.md` (approved 2026-11-21).

## Global Constraints

- UI copy says "Private Clinic", never "Sunday Clinic" (code paths keep their names).
- No runtime DDL (`StaffPanelWave6StartupSchema.test.js`); tables only from `staff/backend/migrations/20261123_pregnancies.sql`.
- `patient_id VARCHAR(10)` utf8mb4_unicode_ci.
- Loss rule: GA at end < 20 weeks → `abortus`; ≥ 20 weeks → `lahir_mati`. Ectopic counts in Abortus. Para counts births ≥ 20 weeks (lahir hidup + lahir mati), once per pregnancy.
- Same-pregnancy tolerance: HPHT within 14 days. New pregnancy also when new HPHT > ongoing HPHT + 42 weeks (294 days).
- Only the interactive visit-page `resolve` call may start or close a pregnancy, and only for the patient's newest obstetri visit; imports / bulk / older-visit edits never do.
- Close / complete a pregnancy: roles dokter and bidan only (`ROLE_IDS.DOKTER`, `ROLE_IDS.BIDAN` from `constants/roles.js`); others may view.
- Resume medis generation and content: unchanged.
- Patients never see this data (no `/api/patient*` exposure).
- Dates: local `YYYY-MM-DD`, never `toISOString()` for date-only values.
- Required history per earlier birth: cara lahir + indikasi, komplikasi; berat optional (babies list for multiples).
- Use `getAuthToken()` in staff frontend; export onclick functions on `window`; escape every interpolated value (`escapeHtmlSafe` style).
- Tests run on the VPS (no local Node) — slim copy to `/tmp/<name>`, symlink `/var/www/dokterdibya/staff/backend/node_modules`, `cd staff/backend && JWT_SECRET=test node node_modules/jest/bin/jest.js --coverage=false --runInBand --forceExit <pattern>`. "Run" below means this.
- Staff asset version: next unused `vNNN` (main is at v501; check `/var/www/dokterdibya-staff-releases` and `origin/main` before bumping).

## Review Focus

1. A save where HPHT is cleared (empty) on the newest visit → no pregnancy created/closed; visit stays linked as before. Test in Task 2.
2. Two quick saves (double click / retry) of the same new HPHT → exactly one new pregnancy (idempotent by patient + HPHT within 14 days, inside a transaction with `FOR UPDATE` on the patient's pregnancies). Test in Task 3.
3. Previous pregnancy end date before its own HPHT, or after the new HPHT → 400 with a clear Indonesian message. Test in Task 3.
4. A patient with only external history (no clinic visits) on a gyn visit → card hidden. Test in Task 6.
5. Backfill re-run after apply → no duplicate pregnancies (keyed by patient + clinic group / external entry fingerprint). Test in Task 5.

---

### Task 1: Migration and pure rules

**Files:**
- Create: `staff/backend/migrations/20261123_pregnancies.sql`
- Create: `staff/backend/services/PregnancyEpisodeRules.js`
- Create: `staff/backend/constants/pregnancyComplications.js`
- Test: `staff/backend/tests/unit/PregnancyEpisodeRules.test.js`

**Interfaces:**
- Produces:
  - Migration: table `pregnancies` with the spec "Data" columns, `babies JSON NULL` instead of `birth_weight_g`/`baby_sex`, plus `fingerprint VARCHAR(64) NULL` (backfill idempotency, unique per patient) and indexes `(patient_id, status)`, `(patient_id, hpht)`; nullable `pregnancy_id INT` + index on `sunday_clinic_records`, `pregnancy_outcomes`, `birth_congratulations` (each `ALTER TABLE … ADD COLUMN` guarded by an `information_schema` check procedure in the migration, as in `20260719_staff_wave6_operational_schema.sql`).
  - `PREGNANCY_COMPLICATIONS`: frozen list `{ code, label }` — `preeklamsia` 'Preeklamsia/PEB', `eklamsia`, `hipertensi_gestasional`, `dm_gestasional` 'DM gestasional', `hpp` 'HPP (perdarahan postpartum)', `plasenta_previa`, `solusio_plasenta`, `kpd` 'KPD', `preterm` 'Persalinan preterm', `iugr` 'IUGR/PJT', `kelainan_letak`, `infeksi`, `lainnya`.
  - `DELIVERY_METHODS = ['Spt B (Spontan)', 'SC (Caesar)', 'Vakum', 'Forceps']`
  - `gaWeeksAt(hpht, date) -> number|null` (floor of days/7; null when either invalid or date < hpht)
  - `lossTypeForGa(weeks) -> 'abortus'|'lahir_mati'|null` (null when weeks is null)
  - `decideEpisodeAction({ ongoing: {hpht, ended:boolean}|null, newHpht }) -> 'none'|'update'|'start'|'start_needs_previous_end'`
    - `none` when `newHpht` invalid/empty
    - `update` when ongoing exists and |newHpht − ongoing.hpht| ≤ 14 days
    - `start` when no ongoing, or ongoing.ended, or ongoing.hpht null
    - otherwise (`newHpht` > ongoing.hpht + 14 d, ongoing not ended) → `start_needs_previous_end`
    - `newHpht` earlier than ongoing.hpht − 14 d → `none` (an older HPHT never starts a pregnancy)
  - `computeObstetricTotals(pregnancies, { includeOngoing }) -> { gravida, para, abortus, anak_hidup }`: gravida = count (+ ongoing), para = ended with outcome `lahir_hidup`|`lahir_mati`, abortus = `abortus` + `ektopik`, anak_hidup = sum of babies with `alive !== false` in `lahir_hidup` pregnancies (count 1 per pregnancy when babies empty).
  - `toRiwayatPersalinanList(pregnancies) -> Array` in today's `collectRiwayatPersalinanData` entry shape (`DELIVERY` for lahir_hidup/lahir_mati, `ABORTUS` for abortus/ektopik), oldest first.

- [ ] **Step 1: Write failing tests** covering: `gaWeeksAt('2026-01-01','2026-05-21')` = 20, `('2026-01-01','2026-05-20')` = 19; `lossTypeForGa(19)` 'abortus', `(20)` 'lahir_mati'; every `decideEpisodeAction` branch incl. exactly 14 days (update) and 15 days (start/needs end), empty HPHT (none), older HPHT (none); totals with twins, ectopic, lahir_mati, ongoing; riwayat list shape and order.
- [ ] **Step 2: Run** `PregnancyEpisodeRules` → FAIL.
- [ ] **Step 3: Implement** rules + constants + migration (DDL only in the `.sql`).
- [ ] **Step 4: Run** `PregnancyEpisodeRules StaffPanelWave6StartupSchema` → PASS. Controller runs the migration on a VPS scratch DB.
- [ ] **Step 5: Commit** "Add pregnancies migration and episode rules".

### Task 2: Episode service

**Files:**
- Create: `staff/backend/services/PregnancyEpisodeService.js`
- Test: `staff/backend/tests/unit/PregnancyEpisodeService.test.js`

**Interfaces:**
- Consumes: Task 1 rules and constants.
- Produces: `class PregnancyEpisodeError extends Error { status }`; `createPregnancyEpisodeService({ db, now = () => new Date() })` →
  - `list(patientId) -> Pregnancy[]` (newest first; JSON columns parsed; each row has `latest_mr_id` from `sunday_clinic_records` by `pregnancy_id`, newest `created_at`)
  - `resolveFromVisit(patientId, mrId, actor) -> { action, pregnancy?, previous? }` — reads the visit's current anamnesa HPHT (newest `medical_records` anamnesa row for `mr_id`), refuses with 409 `'Hanya kunjungan obstetri terbaru yang dapat memulai kehamilan baru'` when `mrId` is not the patient's newest obstetri visit by `created_at` and the action would be `start*`; for `update` sets `hpht`/`hpl` on the ongoing pregnancy and links the visit; for `start` creates an `ongoing` pregnancy (source `clinic`) and links the visit; for `start_needs_previous_end` changes nothing and returns `{ action, previous }`; `none` → links the visit to the ongoing pregnancy if one exists.
  - `startWithPreviousEnd(patientId, mrId, previousEnd, actor)` — `previousEnd = { outcome, ended_on, delivery_method?, delivery_indication?, complications?, complication_notes?, babies?, kuretase? }`; in one transaction (`SELECT … FROM pregnancies WHERE patient_id=? FOR UPDATE`): ends the ongoing pregnancy, then creates the new one and links the visit. Idempotent: if an ongoing pregnancy with HPHT within 14 days of the visit HPHT already exists, return it.
  - `updateHistory(patientId, pregnancyId, fields, actor)` — edits outcome/delivery/complication/babies/year fields; external pregnancies fully editable, clinic ones not `hpht`.
  - `addExternal(patientId, fields, actor)`, `removeExternal(patientId, pregnancyId, actor)` (only `source='external'`).
  - `endOngoing(patientId, { outcome, ended_on, linkTable, linkId }, actor)` — used by mark-delivered / pregnancy-outcome; creates an ended pregnancy when none is ongoing.
  - `assertCanClose(actor)` — 403 `'Hanya dokter atau bidan yang dapat menutup kehamilan'` unless `actor.role_id ∈ {ROLE_IDS.DOKTER, ROLE_IDS.BIDAN}` or `actor.role ∈ {ROLE_NAMES.DOKTER, ROLE_NAMES.BIDAN}` or `actor.is_superadmin`.
  - Validation messages (400): `'Hasil akhir kehamilan tidak valid'`, `'Tanggal selesai tidak valid'`, `'Tanggal selesai tidak boleh sebelum HPHT kehamilan tersebut'`, `'Tanggal selesai harus sebelum HPHT kehamilan baru'`, `'Cara lahir wajib diisi'` (births), `'Indikasi wajib diisi untuk persalinan SC/Vakum/Forceps'`, `'Komplikasi tidak valid'`; outcome vs GA mismatch → accepted but response carries `warning: 'Usia kehamilan <20 minggu biasanya dicatat sebagai abortus'` (or the ≥20 variant).

- [ ] **Step 1: Write failing tests** with a SQL-keyed fake db: each `resolveFromVisit` action; non-newest visit start → 409; empty HPHT → none; `startWithPreviousEnd` validations above; double call idempotent; `assertCanClose` for dokter, bidan, admin (403); `updateHistory` rejects hpht change on clinic pregnancy; `removeExternal` refuses clinic rows (404 `'Kehamilan tidak ditemukan'`).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** `PregnancyEpisodeService PregnancyEpisodeRules` → PASS.
- [ ] **Step 5: Commit** "Add pregnancy episode service".

### Task 3: Staff routes

**Files:**
- Create: `staff/backend/routes/pregnancies.js` (factory `createPregnanciesRouter({ service, verifyStaffToken, logger })`, default export wired with the real service)
- Modify: `staff/backend/server.js` (mount before the generic `/api/patients` patients-auth router, or at `/api/pregnancies` — must not be shadowed; check), `staff/backend/config/accessControlRegistry.js`
- Test: `staff/backend/tests/unit/PregnancyRoutes.test.js`, matrix rows in `Task7PatientMedicalRecordAccess.test.js`

**Interfaces:**
- HTTP (all `verifyStaffToken`, JSON `{ success, data?, warning?, message? }`, errors from `PregnancyEpisodeError`; 500 → `'Gagal memproses data kehamilan'`, no `error.message` leak):
  - `GET /api/pregnancies/patient/:patientId` → `{ pregnancies, totals }` where `pregnancies` = `list(patientId)` (each row adds `latest_mr_id` = newest linked visit's `mr_id` or null) and `totals` = `computeObstetricTotals(pregnancies, { includeOngoing: true })` — permission `medical_records.view`
  - `POST /api/pregnancies/patient/:patientId/resolve` `{ mr_id }` → `resolveFromVisit` — `anamnesa.edit`
  - `POST /api/pregnancies/patient/:patientId/start` `{ mr_id, previous_end }` → `assertCanClose` + `startWithPreviousEnd` — `anamnesa.edit`
  - `POST /api/pregnancies/patient/:patientId/external` / `PUT /api/pregnancies/:pregnancyId` / `DELETE /api/pregnancies/:pregnancyId` (patientId in body/query, verified against the row) — `anamnesa.edit` + `assertCanClose` for any change of outcome/end fields
  - `GET /api/pregnancies/needs-review` → `[{ patient_id, full_name, pregnancy_id, reason }]` — `medical_records.view`
- Overrides in `ROUTE_PERMISSION_OVERRIDES` for each, keyed `'pregnancies:<METHOD>:<path>'`.

- [ ] **Step 1: Write failing tests** (supertest + injected fake service, like `PatientCheckupPrepayRoutes.test.js`): each route's mapping, error status passthrough, 500 without message leak; matrix rows.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** `PregnancyRoutes Task7PatientMedicalRecordAccess AccessControlCatalogRegistry` → new rows PASS (registry: only the 4 pre-existing unresolved routes).
- [ ] **Step 5: Commit** "Add pregnancy routes".

### Task 4: End events write the pregnancy

**Files:**
- Modify: `staff/backend/routes/patients.js` (mark-delivered ~1819), `staff/backend/services/PregnancyOutcomeService.js` (`record` ~91, `voidOutcome` ~135)
- Test: extend `PregnancyOutcomeService.test.js`, add `staff/backend/tests/unit/MarkDeliveredPregnancy.test.js`

**Interfaces:**
- Consumes: `endOngoing` (Task 2), `gaWeeksAt`, `lossTypeForGa`.
- Behaviour: mark-delivered → `endOngoing(patientId, { outcome: 'lahir_hidup', ended_on: today, linkTable: 'birth_congratulations', linkId: insertId })` and sets `birth_congratulations.pregnancy_id`; pregnancy-outcome `record` → `endOngoing` with outcome `abortus` for `keguguran`, `lahir_mati` for `lahir_mati`, links `pregnancy_outcomes.pregnancy_id`, and returns `warning` when `lossTypeForGa` disagrees; `voidOutcome` reopens the linked pregnancy (`status='ongoing'`, end fields null) only when it was ended by that outcome. A failure in the pregnancy write must not leave the original insert without it (wrap both in one transaction via `db.getConnection()` if `db` supports it; the fake db in tests exposes `getConnection`).
- No change to the birth-self-report route in stage 1 (patient-side; linked later by backfill).

- [ ] Steps: failing tests (link set, keguguran→abortus, GA warning, void reopens) → Run FAIL → implement → Run `PregnancyOutcomeService MarkDeliveredPregnancy PregnancyEnd` PASS → commit "Link births and losses to pregnancies".

### Task 5: Backfill

**Files:**
- Create: `staff/backend/services/PregnancyBackfill.js` (pure `planBackfill(patientData) -> { pregnancies[], visitLinks[], outcomeLinks[], birthLinks[], reviews[] }`)
- Create: `staff/backend/scripts/backfill-pregnancies.js` (loads per patient, calls `planBackfill`, prints `{ mode, patients, pregnancies, clinic, external, ongoing, needs_review }`; writes only with `--apply`; per-patient transaction; skips patients that already have pregnancies with the same `fingerprint`)
- Test: `staff/backend/tests/unit/PregnancyBackfill.test.js`

**Interfaces:**
- `patientData = { patientId, visits: [{ mr_id, mr_category, created_at, import_source, hpht, hpl, riwayat_persalinan }], births: [{ id, birth_date, created_at }], outcomes: [{ id, outcome_type, event_date }] }`.
- Rules exactly as the spec "Backfill" section + calls: group obstetri visits by HPHT (≤ 14 d); HPHT-less visits join the nearest earlier group within 294 days; ends via today's date rule (event ≥ HPHT − 14 d, earliest such event after the group's HPHT); newest unended group within 294 days of today → `ongoing`; older unended → `ended`/`unknown` + review `'Akhir kehamilan tidak diketahui'`; unmatched births/outcomes → ended pregnancy from the row + review `'Kejadian tanpa data kehamilan'`; externals from the most complete `riwayat_persalinan` (most entries, then newest visit), merged into a clinic pregnancy when same year + same outcome class, else `source='external'`; lists that differ across visits → review `'Riwayat persalinan berbeda antar kunjungan'` on the patient's newest pregnancy. Fingerprints: clinic `c:<first mr_id>`, external `e:<index>:<tahun>:<type>`, event `b:<id>` / `o:<id>`.
- [ ] Steps: failing fixture tests (conflicting histories, imported old visit, visits without HPHT, twins of one birth date, re-run idempotent) → Run FAIL → implement → Run PASS → commit "Add pregnancy backfill".

### Task 6: Private Clinic history card and new-pregnancy flow

**Files:**
- Create: `staff/public/scripts/sunday-clinic/components/shared/pregnancy-history-card.js` (`export default { render(state, pregnancies), afterRender(state) }`, exports `window.PregnancyHistoryCard`)
- Modify: `staff/public/scripts/sunday-clinic/components/obstetri/anamnesa-obstetri.js` (insert the card right after `${metaHtml}` ~line 115; G/P/A prefilled from `totals` of the Task 3 `GET` response, keep `recalcGPAL` as override path), `components/gyn_special/anamnesa-gyn_special.js` and `components/gyn_repro/anamnesa-gyn_repro.js` (card after `${metaHtml}` only when any pregnancy has `source='clinic'`), `staff/public/scripts/sunday-clinic/main.js` (`saveAnamnesa` ~2191: after a successful `saveSection`, when category is obstetri, call `/resolve`; on `start_needs_previous_end` open the "Lengkapi kehamilan sebelumnya" SweetAlert form and call `/start`; show `warning` if returned), `staff/public/sunday-clinic.html` version strings for changed scripts, staff asset version bump (`STAFF_CACHE_VERSION` + every `?v=` in `index-adminlte.html`, `STAFF_PWA_VERSION` in `staff/public/sw.js`) to the next free version.
- Test: `staff/backend/tests/unit/PregnancyHistoryCardUi.test.js` (vm pattern of `SundayClinicReturnsUi.test.js`)

**Interfaces:**
- Card rows (newest first): year, outcome label (Lahir hidup / Lahir mati / Abortus / Ektopik / Tidak diketahui), GA at end, cara lahir + indikasi, komplikasi labels, babies weights, source badge (Klinik / Luar), review badge "Perlu dicek". Edit/add/delete buttons only when `hasAccountPermission('anamnesa.edit')` and the user role is dokter/bidan for end fields (backend enforces).
- Card save of history also writes `toRiwayatPersalinanList` into the current visit's `riwayat_persalinan` by updating the in-page `_rpEntries` and calling `saveAnamnesa()` (no separate write path).
- Form for previous end: outcome radios (no default; suggestion pre-selected from `lossTypeForGa` when GA known), date, cara lahir (births, required), indikasi (required for SC/Vakum/Forceps), komplikasi checkboxes + notes, babies (optional rows), kuretase (abortus).
- [ ] Steps: failing vm tests (card hidden on gyn without clinic pregnancy; rows escaped; card renders totals; resolve flow calls `/start` only after form confirm) → Run FAIL → implement → browser harness check (static server + stubbed fetch, per the `local-staff-ui-harness` memory note; no `.claude/launch.json` left) → Run `PregnancyHistoryCardUi StaffPatientShellWave1 ObstetriClinicalTodoCompletion` PASS → commit "Add pregnancy history card and new-pregnancy flow".

### Task 7: Kelola Pasien — earlier pregnancies and review list

**Files:**
- Modify: `staff/public/scripts/legacy/patient-tools.js` (`showPatientMRList` ~2614: before `${recordsHtml}` ~2730 add "Kehamilan sebelumnya" list from `GET /api/pregnancies/patient/:id`; per clinic pregnancy a "Lihat resume" button that fetches `GET /api/medical-records/resume/:mrId` for the pregnancy's `latest_mr_id` and shows the text in a SweetAlert; "Belum ada resume" when `data` is null; no link for external), plus a "Riwayat perlu dicek" panel next to the HPL panels fed by `/api/pregnancies/needs-review` with a link to `showPatientMRList`.
- Test: extend `PregnancyHistoryCardUi.test.js` or add `KelolaPasienPregnancies.test.js` (source + vm render with hostile names).
- [ ] Steps: failing tests → Run FAIL → implement (escape everything; reuse `pregnancyEndOnclick`-style helpers) → harness check → Run PASS → commit "Show earlier pregnancies and review list in Kelola Pasien".

### Task 8: Verify, backfill review, deploy

- [ ] Full suite on VPS, base vs head (`git archive` copies, `--maxWorkers=2`, nohup + DONE marker); failing lists must match.
- [ ] Migration + backfill **dry-run** on a VPS scratch copy of production (structure + data copy of the involved tables only), print counts. **Stop and show the counts and 5 sample `needs_review` reasons to the user before any production `--apply`.**
- [ ] PR, merge (built-in browser), deploy per the staff-asset-release-staging memory: stage next `vNNN`, pre-cutover verifier, migration on prod **before** ff-merge, ff-merge, pm2 reload, post verifier, then `backfill-pregnancies.js --apply` only after the user approves the dry-run.
- [ ] Update CLAUDE.md (new section) and memory.

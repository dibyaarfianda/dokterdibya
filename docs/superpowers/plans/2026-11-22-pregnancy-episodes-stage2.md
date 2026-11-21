# Kehamilan per Pasien — Tahap 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every "current pregnancy / ended" consumer reads the `pregnancies` table; the HPHT − 14 days date rule is retired.

**Architecture:** One backend reader (`services/CurrentPregnancy.js`) turns `pregnancies` rows into the shapes the existing screens already consume, so staff/portal/Android response shapes stay the same. Write paths that bypass the table (birth self-report, staff birth upsert, session creation) are linked to the ongoing row. Old helpers in `PregnancyEnd.js` / `GestationalAge.js` are deleted last.

**Tech Stack:** Node/Express + mysql2 (MariaDB) in `staff/backend`, Jest unit tests (run on the VPS), vanilla JS staff panel (`staff/public`).

**Spec:** `docs/superpowers/specs/2026-11-22-pregnancy-episodes-stage2-design.md` (parent: `docs/superpowers/specs/2026-11-21-pregnancy-episodes-design.md`). Read both, plus `CLAUDE.md` §14, §46–48.

## Global Constraints

- Date-only values: never `toISOString()` or `new Date('YYYY-MM-DD')` for day counts; use `toDateString` (`services/PregnancyEnd.js`) and `trackerDates` / day-number maths (`services/PregnancyTrackerDates.js`). Server timezone is WIB (GMT+7); CI runs in UTC — tests must pass under both `TZ=UTC` and `TZ=Asia/Jakarta`.
- Full term = 280 days; "same pregnancy" window and end tolerance = 14 days (`END_TOLERANCE_DAYS`).
- Roles only via `constants/roles` (`ROLE_IDS`, `ROLE_NAMES`); closing stays dokter/bidan only (`assertCanClose`).
- A patient-facing response never names a loss (no `abortus`, `keguguran`, `lahir_mati`, `ektopik`, `outcome`).
- Outcome → list `pregnancy_end.type`: `lahir_hidup`→`birth`, `lahir_mati`→`lahir_mati`, `abortus`→`keguguran`, `ektopik`→`keguguran`, `unknown`→`selesai`.
- Review reason for a reported birth: exactly `Lahir dilaporkan, belum ditutup`.
- UI wording says "Private Clinic", never "Sunday Clinic". Commit messages have no Co-Authored-By line.
- Do not bump asset versions inside tasks (the deploy step does it once). Do not touch `CLAUDE.md` except in Task 12.
- Running tests (no Node on the dev PC): `tar` the changed files to the VPS and run jest on a `git archive HEAD` copy of `/var/www/dokterdibya` in `/tmp` with `node_modules` symlinked (pattern in CLAUDE.md memory / previous tasks); never touch the live checkout, DB, pm2 or nginx.

## Review Focus

1. A patient with two `ongoing` rows (data error) — every reader picks the newest by `sequence DESC, id DESC`, never both. (Task 1 test.)
2. An ongoing row with only `hpl` or only `hpht` — HPL/HPHT derive from each other (±280). (Task 1 test.)
3. A patient whose newest pregnancy is an `external` ended row (history typed by the doctor) — no end badge (only `source='clinic'` counts). (Task 1 test.)
4. Outcome recorded with no ongoing pregnancy — 400 "Tidak ada kehamilan berjalan", nothing written. (Task 5 test.)
5. Birth self-report when no ongoing pregnancy — still saves the birth card, links nothing, flags nothing. (Task 7 test.)

---

### Task 1: CurrentPregnancy reader

**Files:**
- Create: `staff/backend/services/CurrentPregnancy.js`
- Test: `staff/backend/tests/unit/CurrentPregnancy.test.js`

**Interfaces:**
- Produces:
  - `async loadCurrentPregnancies(db, patientIds: string[]) -> Map<patientId, { ongoing: Row|null, lastEnded: Row|null }>`. One query on `pregnancies` for all ids (`WHERE patient_id IN (?)`), plus one query on `pregnancy_outcomes` (`voided_at IS NULL AND pregnancy_id IN (...)`) to attach `outcome_id`/`outcome_note` to ended rows. `ongoing` = newest `status='ongoing'` by `sequence DESC, id DESC`; `lastEnded` = newest `status='ended' AND source='clinic'` by the same order, only when there is no ongoing row. Empty ids → empty Map, no query.
  - `datingOf(row) -> { hpht: 'YYYY-MM-DD', hpl: 'YYYY-MM-DD' } | null` — hpl else hpht+280; hpht else hpl−280 (day-number maths, not `Date` parsing).
  - `listFields(current, isObstetri: boolean, now: Date) -> { is_obstetri, hpl, days_pregnant, has_delivered, pregnancy_end }` — `hpl`/`days_pregnant` from `ongoing` (days = calendar days from hpht to `now` in local time, via `trackerDates(hpl, now).daysPregnant`); `pregnancy_end` from `lastEnded` as `{ type, date: ended_on }` plus `id`/`note` from the linked outcome when present (types per Global Constraints); `has_delivered = pregnancy_end?.type === 'birth'`; `is_obstetri` passed through.
  - `PREGNANCY_END_TYPES` (the outcome→type map) exported.

- [ ] **Step 1: Write failing tests** — `loadCurrentPregnancies` with a fake db: picks newest ongoing; two ongoing → newest only; ended external newest → `lastEnded` is the clinic one or null; attaches outcome id/note; empty ids → no query. `datingOf`: only hpl, only hpht, both, neither. `listFields`: ongoing → hpl + days (assert at `new Date(2026,10,22,2,0)` and `...,23,0` give the same days for hpht `2026-07-17` = 128); lastEnded each outcome type mapping; no data → all null/false with `is_obstetri` passed through.
- [ ] **Step 2: Run** `CurrentPregnancy.test.js` on the VPS (TZ=UTC and TZ=Asia/Jakarta) — FAIL (module missing).
- [ ] **Step 3: Implement** the module.
- [ ] **Step 4: Run again** — PASS under both TZ.
- [ ] **Step 5: Commit** `feat(pregnancy): CurrentPregnancy reader for stage 2`.

### Task 2: Kelola Pasien list + advanced search

**Files:**
- Modify: `staff/backend/routes/patients.js` (`GET /api/patients` ~678–757, `GET /api/patients/search/advanced` ~979–1026)
- Modify: `staff/public/scripts/legacy/patient-tools.js` (HPL cell / end badge rendering ~1596–1700: add label `selesai` → "Kehamilan selesai", same badge style as other outcomes, no void button for it)
- Test: replace the list/search assertions in `staff/backend/tests/unit/PatientsPregnancyPanels.test.js`; add UI assertion to `staff/backend/tests/unit/KelolaPasienPregnancies.test.js`

**Interfaces:** Consumes Task 1 `loadCurrentPregnancies`, `listFields`. Keep the obstetri-HPHT batch query only to compute `is_obstetri` (unchanged meaning); drop `loadEndEvents` / `pregnancyListFields` here. Response fields keep their names and shapes.

- [ ] Step 1: failing tests — source assertions: both handlers call `loadCurrentPregnancies(` and `listFields(` and no longer call `loadEndEvents(` / `pregnancyListFields(`; UI: `patient-tools.js` renders `pregnancy_end.type === 'selesai'` as "Kehamilan selesai" (escaped, like the other badges).
- [ ] Step 2: run — FAIL. Step 3: implement. Step 4: run `PatientsPregnancyPanels`, `KelolaPasienPregnancies`, `PatientAdvancedSearch`, `PatientListPages`, `staffPanelStabilization` — PASS (compare failing list with base for the last one). Step 5: commit.

### Task 3: "Mendekati HPL" / "Lewat HPL" panels

**Files:**
- Modify: `staff/backend/routes/patients.js` (`/api/patients/near-due-pregnancies` ~1121–1210, `/api/patients/overdue-pregnancies` ~1215–1300)
- Test: `staff/backend/tests/unit/PatientsPregnancyPanels.test.js`

**Interfaces:** SQL joins `pregnancies pg ON pg.patient_id = p.id AND pg.status = 'ongoing'` (one per patient: newest by `sequence`, `id` — use a `ROW_NUMBER()` subquery over pregnancies) with `hpl_eff = COALESCE(pg.hpl, DATE_ADD(pg.hpht, INTERVAL 280 DAY))`; `days = 280 - DATEDIFF(hpl_eff, CURDATE())`. Near-due: `days BETWEEN 259 AND 279`; overdue: `days >= 280`, `days_overdue = days - 280`. Output fields unchanged (`hpl`, weeks, `days_until_due` / `days_overdue`, last diagnosis). No `endedSqlCondition`, no latest-anamnesa subquery.

- [ ] Step 1: failing source tests (both handlers reference `FROM pregnancies`, `status = 'ongoing'`, the 259/280 bounds; neither references `endedSqlCondition(` or `ROW_NUMBER() OVER (PARTITION BY scr.patient_id`). Step 2 FAIL. Step 3 implement. Step 4 PASS. Step 5 commit.

### Task 4: Portal tracker + prepay suggestion stop using the date rule

**Files:**
- Modify: `staff/backend/routes/patients-auth.js` (`/pregnancy-tracker` ~2406–2470), `staff/backend/routes/patient-checkup-prepay.js` (~25, 44, 87–100)
- Test: rewrite `staff/backend/tests/unit/PregnancyTrackerEnded.test.js`; update `PatientCheckupPrepayRoutes.test.js` ('GET /suggestion' block)

**Interfaces:** Tracker: no ongoing row → `{ success:true, data:null, message:'Data kehamilan belum tersedia.' }` (neutral, same text as the old ended branch, no `pregnancy_ended` flag needed but keep `pregnancy_ended:false` absent); keep HPL+14 auto-hide. Suggestion: drop the `endState` option and `trackerEndState`; no ongoing row → `weeks:null`.

- [ ] Step 1: failing tests — tracker handler does not call `trackerEndState(`; still checks `GRACE_PERIOD_DAYS`; no-ongoing response is the neutral message. Suggestion: no `endState` param in `createPatientCheckupPrepayRouter`; existing "ended returns no weeks" test becomes "no ongoing pregnancy returns no weeks but lists packages". Step 2 FAIL. Step 3 implement. Step 4 PASS (+ `PregnancyTrackerDates.test.js`, `patientRouteAccess.test.js`). Step 5 commit.

### Task 5: "Kehamilan Berakhir" validates against the ongoing pregnancy

**Files:**
- Modify: `staff/backend/services/PregnancyOutcomeService.js` (`loadHphtSources` 43–80, `record` 134–185)
- Test: `staff/backend/tests/unit/PregnancyOutcomeService.test.js`

**Interfaces:** `record` reads the ongoing row via Task 1 `loadCurrentPregnancies(conn, [patientId])` + `datingOf`; no ongoing → `fail(400, 'Tidak ada kehamilan berjalan')` before any write; event date must be ≥ `hpht − 14 days` else the existing 400 message. `gaWeeksAt` / 20-week warning use that HPHT. `voidOutcome` unchanged.

- [ ] Step 1: failing tests — no ongoing → 400 and no INSERT; event 15 days before ongoing HPHT → 400; 14 days before → accepted; anamnesa/USG rows are no longer queried. Replace the "anamnesa HPHT wins over USG" and "USG EDD only" cases. Step 2 FAIL. Step 3 implement. Step 4 PASS (+ `PregnancyCloseRoles`, `PregnancyEpisodeService`). Step 5 commit.

### Task 6: Android `GET /api/patients/pregnancy-data`

**Files:**
- Modify: `staff/backend/routes/patients.js` (~1365–1505)
- Create: `staff/backend/tests/unit/PatientPregnancyDataRoute.test.js`

**Interfaces:** Ongoing row → existing pregnancy payload (weeks/days/trimester/progress/hpl/baby size/tips, `weeks <= 42`), dated by `datingOf` + `trackerDates`. No ongoing and `lastEnded.outcome === 'lahir_hidup'` with a published `birth_congratulations` row linked by `pregnancy_id` (fallback: newest published row dated ≥ that pregnancy's hpht) → existing birth payload. Otherwise `{ is_pregnant:false, has_given_birth:false }` — never mention a loss. Response field names unchanged.

- [ ] Step 1: failing tests with a fake db/req/res (extract the handler into a small exported function if needed): ongoing → is_pregnant true + correct weeks; ended lahir_hidup + published card → has_given_birth; ended abortus → neutral and JSON has none of the loss words; new ongoing after an old birth → pregnancy, not birth card. Step 2 FAIL. Step 3 implement. Step 4 PASS. Step 5 commit.

### Task 7: Reported births link and flag

**Files:**
- Modify: `staff/backend/routes/patients.js` (`POST /api/patient/birth-self-report` ~1972–2037, `POST /api/patients/:patientId/birth-congratulations` ~2327–2375)
- Modify: `staff/backend/services/PregnancyEpisodeService.js` — add `flagReportedBirth(patientId, linkTable, linkId, actor, conn?)`: sets `pregnancy_id` on the link row and `needs_review=1, review_reason='Lahir dilaporkan, belum ditutup'` on the ongoing row; no ongoing → no-op returning `{ linked:false }`. Never changes `status`.
- Test: `staff/backend/tests/unit/PregnancyEpisodeService.test.js`, `staff/backend/tests/unit/BirthReportLinking.test.js` (new, source + behaviour)

- [ ] Step 1: failing tests (flag sets reason and keeps status ongoing; no ongoing → no-op; both routes call `flagReportedBirth(` after inserting; staff upsert updating an existing row also links). Step 2 FAIL. Step 3 implement. Step 4 PASS (+ `BirthCongratsPortalLayout`, `MarkDeliveredPregnancy`). Step 5 commit.

### Task 8: Session `pregnancy_id` for kick counter and contraction timer

**Files:**
- Create: `staff/backend/migrations/20261124_session_pregnancy_id.sql` — `ALTER TABLE kick_counter_sessions ADD COLUMN pregnancy_id INT NULL, ADD INDEX idx_kick_sessions_pregnancy (pregnancy_id);` and the same for `contraction_sessions` (`idx_contraction_sessions_pregnancy`). Idempotent style as other migrations in that folder (check for `IF NOT EXISTS` usage there).
- Modify: `staff/backend/routes/kick-counter.js` (~125), `staff/backend/routes/contraction-timer.js` (~245): look up `findOngoingPregnancy(db, patientId)` (`services/PregnancyTrackerDates.js`) and insert its id (or NULL).
- Test: `staff/backend/tests/unit/SessionPregnancyLink.test.js` (source: both INSERTs list `pregnancy_id`; migration adds both columns + indexes; no runtime `ALTER`/`CREATE TABLE` added in routes).

- [ ] Steps 1–5 as usual (+ `ContractionTimerRouteContract`, `StaffPanelWave6StartupSchema`).

### Task 9: DocBoard dating from the linked pregnancy

**Files:**
- Modify: `staff/backend/services/DrdDocBoardScheduleService.js` (`loadSnapshot` 317–370, `projectGestationalAge` 176–204)
- Test: `staff/backend/tests/unit/DrdDocBoardScheduleService.test.js`

**Interfaces:** `loadSnapshot` also reads `sunday_clinic_records.pregnancy_id` and that row (`hpht`, `hpl`, `status`, `ended_on`) → `snapshot.pregnancy`. `projectGestationalAge(anamnesa, scheduleDate, { ..., pregnancy })`: if `pregnancy` has dating, use `datingOf(pregnancy)` as the first candidate; if `pregnancy.status === 'ended'` and `ended_on <= scheduleDate`, return no label (no warning). Without `pregnancy` the current behaviour is unchanged (existing tests keep passing).

- [ ] Steps 1–5 (new tests: linked pregnancy wins over a stale anamnesa HPHT; ended before schedule → no label).

### Task 10: Automatic obstetric diagnosis uses pregnancy totals

**Files:**
- Modify: `staff/public/scripts/sunday-clinic/utils/diagnosis-generator.js` (12–80), `staff/public/scripts/sunday-clinic/components/shared/pregnancy-history-card.js` (keep the last loaded `/api/pregnancies/patient/:id` payload on `window.__pregnancyHistoryTotals = { totals, sc_count }` when loaded; clear on unmount)
- Modify (if needed): `staff/backend/routes/pregnancies.js` / `PregnancyEpisodeRules.computeObstetricTotals` to include `sc_count` (clinic+external rows with `delivery_method` `SC (Caesar)`).
- Test: `staff/backend/tests/unit/DiagnosisGeneratorTotals.test.js` (vm-load the module like `PregnancyHistoryCardUi.test.js`), `PregnancyEpisodeRules.test.js` for `sc_count`.

**Interfaces:** `generateObstetricDiagnosis(state)` uses `window.__pregnancyHistoryTotals` when present (G = totals.gravida, P string from aterm/preterm/abortus/hidup, "Bekas SC Nx" from `sc_count`), else the current per-visit logic. Output format unchanged ("G5 P2112 30+6 T/H / ...").

- [ ] Steps 1–5.

### Task 11: Patient merge and deletion carry pregnancy data

**Files:**
- Modify: `staff/backend/services/PatientMergeService.js` — after the generic table transfer, normalise the target's `pregnancies`: re-number `sequence` 1..n by `COALESCE(hpht, MAKEDATE(year,1))`, then `id`; if more than one `ongoing`, keep the newest HPHT ongoing and set the others `status='ended', outcome='unknown', needs_review=1, review_reason='Digabung dari pasien lain'`.
- Modify: `staff/backend/services/patientDeletion.js` — delete (via `deleteOptionalChild`, before `sunday_clinic_records`) `kick_counter_kicks` (by session), `kick_counter_sessions`, `contraction_events` (by session), `contraction_sessions`, `pregnancy_outcomes`, `birth_congratulations`, `pregnancies`. Check `BulkPatientDeletionService.js` uses the same helper; if it has its own list, add the same tables.
- Test: existing merge/deletion tests (find with grep `PatientMerge`, `patientDeletion`) + new cases.

- [ ] Steps 1–5 (merge: two ongoing → one; sequences contiguous; deletion: all seven tables deleted in child-first order).

### Task 12: Retire the date rule and document

**Files:**
- Modify: `staff/backend/services/PregnancyEnd.js` — remove `resolvePregnancyEnd`, `loadEndEvents`, `endedSqlCondition`, `pregnancyListFields`, `trackerEndState` (keep `toDateString`, `END_TOLERANCE_DAYS`, `hphtFromReference` only if still imported — grep first).
- Modify: `staff/backend/services/GestationalAge.js` — remove `findPregnancyReference` and its `TRIMESTER_NUMBER`/`pickUsgEdd` helpers if unused.
- Modify tests: `PregnancyEnd.test.js`, `GestationalAge.test.js` (drop removed functions' cases only).
- Modify: `CLAUDE.md` §47 ("Stage 2 (not done)" → done; what reads what) and §48.
- Test: grep shows no remaining imports of removed names in `staff/` (add a test asserting `require('../../services/PregnancyEnd')` exports exactly the kept names).

- [ ] Steps 1–5.

## Deploy (controller, after the final review)

1. Read-only comparison on production data: old vs new `hpl`/`days_pregnant`/`pregnancy_end` for all patients, near-due/overdue sets, Android payload class per patient; list every difference with a reason.
2. Migration `20261124_session_pregnancy_id.sql` before the ff-merge.
3. Bump staff assets to the next free `vNNN`, stage the snapshot, pre-cutover verifier, ff-merge, `pm2 reload`, post verifier (CLAUDE.md memory: staff asset release staging).
4. Live checks: Kelola Pasien list, both panels, tracker + suggestion for Test Pasien, `pregnancy-data` for Test Pasien.

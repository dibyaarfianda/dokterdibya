# Laporan Akhir Kehamilan dari Pasien — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A patient whose ongoing pregnancy is past its HPL is asked in the portal what happened; her confirmed answer closes the pregnancy; dokter/bidan can reopen a wrong report.

**Architecture:** Pure rules (`PatientPregnancyReportRules.js`) decide when to ask and map answers to `pregnancies` columns; a service (`PatientPregnancyReportService.js`) does the locked reads/writes; a new patient router and one new staff route expose it; one shared portal script shows the modal on two pages.

**Tech Stack:** Node/Express + mysql2 (MariaDB) in `staff/backend`, Jest (run on the VPS), vanilla JS patient portal (`public/`) and staff panel (`staff/public`).

**Spec:** `docs/superpowers/specs/2026-11-22-patient-pregnancy-report-design.md` (read it fully; parents listed in its header). Also CLAUDE.md §12, §14, §25, §31, §42, §46–48.

## Global Constraints

- Date-only maths in WIB calendar days via `dayNumber` (`services/CurrentPregnancy.js`) / `toDateString` (`services/PregnancyEnd.js`); never `toISOString()` or `new Date('YYYY-MM-DD')` for day counts. Tests pass under `TZ=UTC` and `TZ=Asia/Jakarta`.
- Ask only when: an ongoing row exists (`loadCurrentPregnancies(...).ongoing`), `datingOf(row).hpl < today`, and `report_snoozed_until` is null or `< today`. Snooze = `today + 7`.
- Answers: `lahir_sehat` → `lahir_hidup`; `keguguran` → `lossTypeForGa(gaWeeksAt(hpht, ended_on))` (`abortus` < 20 wk, else `lahir_mati`); `ektopik` → `ektopik`; `masih_hamil` → snooze only.
- Lahir sehat fields: `place` required ≤ 120 chars; `ended_on` required; `delivery` `normal`→`Spt B (Spontan)`, `sc`→`SC (Caesar)`; `babies` length 1–3, each `weight_g` integer 500–6000, stored `{weight_g, alive:true}`. Loss answers: `ended_on` required, `place` optional ≤ 120, no babies.
- `ended_on`: `>= hpht` and `<= today`.
- Closing sets `status='ended'`, `ended_by_patient=1`, `delivery_place`, `ga_weeks_at_end`, `term` (`termForGa`, births only), `needs_review=1`, `review_reason='Dilaporkan pasien'`, `updated_by='patient:<id>'`. Never inserts a `pregnancies` row; never writes `birth_congratulations` or `pregnancy_outcomes`.
- Stale state (no ongoing row / not past HPL) on POST → 409 `Data kehamilan sudah berubah. Muat ulang halaman.`
- Patient responses never contain `abortus`, `keguguran`, `lahir_mati`, `ektopik`, `outcome`.
- Reopen: dokter/bidan only (`assertCanClose`); only rows with `ended_by_patient=1`; 409 if another ongoing row exists; clears `outcome, ended_on, ga_weeks_at_end, delivery_method, delivery_indication, delivery_place, babies, term, kuretase`, sets `status='ongoing'`, `ended_by_patient=0`, `needs_review=0`, `review_reason=NULL`, `report_snoozed_until=today+7`.
- Patient endpoints: `verifyPatientToken`, no-cache headers (§12), patient id only from `req.patient.id`, both paths in `security/patientRouteAccess.js`.
- UI copy Indonesian; "Private Clinic", never "Sunday Clinic". Patient pages: no `vh` units (§25). Commits without Co-Authored-By. No version bumps inside tasks (deploy does it).
- Tests on the VPS: overlay changed files on a `git archive HEAD` copy of `/var/www/dokterdibya` in `/tmp`, strip CR, symlink `node_modules`; never touch the live checkout, DB, pm2, nginx.

## Review Focus

1. Two devices / staff close between status and POST — the locked re-check returns 409 and writes nothing. (Task 2 test.)
2. A patient with two ongoing rows (data error) — only the newest (`sequence DESC, id DESC`) is asked about and closed. (Task 2 test.)
3. `keguguran` dated ≥ 20 weeks → `lahir_mati`, response body has none of the loss words. (Task 1 + Task 3 tests.)
4. Ongoing row with only `hpl` or only `hpht` — dating derives both; the date rule uses the derived HPHT. (Task 1 test.)
5. Reopen when the patient has since started a new ongoing pregnancy → 409, nothing changed. (Task 2 test.)

---

### Task 1: Migration + pure rules

**Files:**
- Create: `staff/backend/migrations/20261125_pregnancy_patient_report.sql` (guarded add-column style of `20261123_pregnancies.sql`): `report_snoozed_until DATE NULL`, `delivery_place VARCHAR(120) NULL`, `ended_by_patient TINYINT(1) NOT NULL DEFAULT 0` on `pregnancies`.
- Create: `staff/backend/services/PatientPregnancyReportRules.js`
- Test: `staff/backend/tests/unit/PatientPregnancyReportRules.test.js`

**Interfaces — Produces:**
- `shouldAsk(ongoingRow, todayStr) -> boolean`
- `snoozeUntil(todayStr) -> 'YYYY-MM-DD'` (today + 7)
- `normalizePatientReport(body, { hpht, today, patientId }) -> { cols }` — throws `PatientReportError(status, message)` (exported) with status 400 and a short Indonesian message on invalid input; `cols` = the columns in Global Constraints (JSON-string `babies` or null).
- `REPORT_ANSWERS = ['lahir_sehat','keguguran','ektopik','masih_hamil']`
- Reuses `gaWeeksAt`, `lossTypeForGa` from `PregnancyEpisodeRules.js`; `datingOf`, `dayNumber` from `CurrentPregnancy.js` (export `termForGa` from `PregnancyEpisodeService.js` or re-implement its 3 lines here — implementer's choice, no behaviour change).

- [ ] **Step 1: failing tests** — `shouldAsk`: hpl yesterday → true; hpl today → false; only hpht (hpht+280 < today) → true; snoozed until today → false, until yesterday → true; null row → false. `snoozeUntil('2026-11-22') === '2026-11-29'`. `normalizePatientReport`: lahir_sehat normal 1 baby 3100 → `outcome 'lahir_hidup'`, `delivery_method 'Spt B (Spontan)'`, `babies '[{"weight_g":3100,"alive":true}]'`, `needs_review 1`, `review_reason 'Dilaporkan pasien'`, `ended_by_patient 1`, `updated_by 'patient:P1'`; sc twins → `'SC (Caesar)'` two babies; keguguran at GA 10 → `abortus`, at GA 41 → `lahir_mati`, no babies, `delivery_method null`; ektopik → `ektopik`; rejects: missing place for birth, place 121 chars, 0 or 4 babies, weight 499/6001/3100.5, ended_on before hpht, after today, bad answer, `masih_hamil` (not a closing answer). Run each under both TZ.
- [ ] **Step 2: run** on the VPS — FAIL (module missing).
- [ ] **Step 3: implement.**
- [ ] **Step 4: run** — PASS (both TZ).
- [ ] **Step 5: commit** `feat(pregnancy): rules and migration for patient pregnancy reports`.

### Task 2: Service (status, submit, reopen)

**Files:**
- Create: `staff/backend/services/PatientPregnancyReportService.js`
- Test: `staff/backend/tests/unit/PatientPregnancyReportService.test.js` (fake db/connection recording SQL, like `PregnancyEpisodeService.test.js`)

**Interfaces:**
- Consumes Task 1; `loadCurrentPregnancies` (`CurrentPregnancy.js`); `assertCanClose` (`PregnancyEpisodeService.js`).
- Produces `createPatientPregnancyReportService({ db, now = () => new Date() })` →
  - `status(patientId) -> { ask: boolean, hpht: string|null }` (no lock)
  - `submit(patientId, body) -> { snoozed: true } | { closed: true }` — in a transaction: `SELECT ... FROM pregnancies WHERE patient_id = ? FOR UPDATE`, pick newest ongoing, `shouldAsk` re-check (ignoring snooze for the submit itself), else throw `PatientReportError(409, …)`; `masih_hamil` → `UPDATE ... SET report_snoozed_until`; otherwise `UPDATE pregnancies SET <cols>, status='ended' WHERE id = ? AND status = 'ongoing'`.
  - `reopen(patientId, pregnancyId, actor) -> { pregnancy_id }` — `assertCanClose(actor)` first; lock rows; 404 if the row is not this patient's; 409 `Hanya laporan pasien yang dapat dibuka kembali` if `ended_by_patient != 1`; 409 `Pasien sudah punya kehamilan berjalan` if another ongoing row exists; then the reset in Global Constraints.
  - "today" = local calendar day of `now()` (WIB on the server).

- [ ] Step 1: failing tests — status ask/no-ask; submit closes newest ongoing only (two ongoing rows); submit with no ongoing row → 409 and no UPDATE; submit not past HPL → 409; masih_hamil writes only the snooze; reopen by a bidan resets columns + snooze; reopen by admin → 403 before any query; reopen non-patient row → 409; reopen with another ongoing → 409 and no UPDATE; transaction rolled back on error. Step 2 FAIL. Step 3 implement. Step 4 PASS (both TZ). Step 5 commit.

### Task 3: Patient router, mount, whitelist

**Files:**
- Create: `staff/backend/routes/patient-pregnancy-report.js` — `createPatientPregnancyReportRouter({ service, verifyPatientToken, logger })` with `GET /status` and `POST /` (mounted at `/api/patient/pregnancy-report`), no-cache middleware, maps `PatientReportError` to its status, other errors → 500 `Gagal memproses data`. Success bodies: status `{ success:true, ask, hpht }`; POST `{ success:true, message:'Terima kasih, data sudah tersimpan.' }`.
- Modify: `staff/backend/server.js` — mount next to `/api/patient/checkup-prepay` (~line 780).
- Modify: `staff/backend/security/patientRouteAccess.js` — `GET ^/api/patient/pregnancy-report/status$`, `POST ^/api/patient/pregnancy-report$`.
- Test: `staff/backend/tests/unit/PatientPregnancyReportRoutes.test.js` (supertest-style with a fake service, like `PatientCheckupPrepayRoutes.test.js`); extend `patientRouteAccess.test.js` to check every route of the new router is whitelisted (same pattern as for `patient-checkup-prepay.js`).

- [ ] Step 1: failing tests — no-cache headers on both; patient id passed from `req.patient.id` (body `patient_id` ignored); 400/409 mapping; POST response JSON for a keguguran answer contains none of the loss words; whitelist test. Step 2 FAIL. Step 3 implement. Step 4 PASS (+ `patientRouteAccess.test.js`). Step 5 commit.

### Task 4: Staff side — reopen route, labels, button

**Files:**
- Modify: `staff/backend/routes/pregnancies.js` — `POST /patient/:patientId/:pregnancyId/reopen` (`verifyStaffToken`, noStore, id regexes as the other routes) → `reopen(...)`; update the header comment.
- Modify: `staff/public/scripts/sunday-clinic/components/shared/pregnancy-history-card.js` — `renderRow`: badge `Dilaporkan pasien` when `p.ended_by_patient`; show `p.delivery_place` in the description; for `ended_by_patient` rows and `canClosePregnancy()` users, a `Buka kembali` button (`data-preg-action="reopen"`) → confirm dialog ("Buka kembali kehamilan ini? Laporan pasien akan dihapus.") → POST → re-mount.
- Modify: `staff/public/scripts/legacy/patient-tools.js` (Kelola Pasien "Kehamilan sebelumnya", ~1181–1205): append "(dilaporkan pasien)" and the place when set.
- Test: route test in `staff/backend/tests/unit/PregnanciesRoutes*.test.js` (find the existing file) for 403/409/200; UI assertions in `PregnancyHistoryCardUi.test.js` (badge, escaped place, button only for closers) and `KelolaPasienPregnancies.test.js`.

- [ ] Steps 1–5 as usual (commit `feat(pregnancy): staff can reopen a patient-reported pregnancy`).

### Task 5: Portal prompt

**Files:**
- Create: `public/scripts/pregnancy-report-prompt.js` — IIFE; `window.PregnancyReportPrompt = { check }`. `check()` fetches `/api/patient/pregnancy-report/status?_t=` with `window.PatientSession.getToken()` and `Cache-Control: no-cache`; when `ask`, builds the modal (steps: choose → form → summary "Ya, benar"/"Ubah" → done; "Masih hamil" sends immediately with a one-line thanks). Validation mirrors Global Constraints client-side; server stays authoritative. 409 → close and `location.reload()`. All user text through `textContent`/escaping. Fixed px sizes (no `vh`).
- Modify: `public/patient-menu.html` — include the script; in `public/scripts/patient-menu-shell.js` home init (~3144) call `window.PregnancyReportPrompt?.check()` only when `checkBirthPending()` returned nothing; after a successful close, re-run `loadPregnancyTrackerHome()` (expose a reload hook or reload the page — implementer's choice).
- Modify: `public/album-usg.html` — include the script and call `check()` after its auth check.
- Test: `staff/backend/tests/unit/PregnancyReportPromptUi.test.js` (vm/jsdom-load the script like `PregnancyHistoryCardUi.test.js`): no modal when `ask:false`; three answer buttons + "Masih hamil"; birth form requires place, method, 1–3 babies with weights; summary step before POST; POST body shape; 409 → reload; no loss word rendered after success. Extend `WebHardeningPlan.test.js` only if it needs to know about the new script (zoom lock stays as is on both pages).

- [ ] Steps 1–5 (commit `feat(portal): ask past-HPL patients how their pregnancy ended`).

## Deploy (controller, after the final review)

1. Read-only count on production: how many patients `shouldAsk` today (ongoing rows past HPL), to tell the user.
2. Migration `20261125_pregnancy_patient_report.sql` before the ff-merge; `DESCRIBE pregnancies` to confirm.
3. Bump `public/sw.js` `CACHE_VERSION` and the `?v=` of changed patient scripts; bump staff assets to the next free `vNNN` and stage it (memory: staff asset release staging); pre/post verifier on both origins.
4. ff-merge, `pm2 reload`, health 200.
5. Live check with Test Pasien (P2026669, HPL in 2027 → `ask:false`); verify the modal end-to-end in the local read-only portal preview only against a fake past-HPL status (never close a real patient's pregnancy).

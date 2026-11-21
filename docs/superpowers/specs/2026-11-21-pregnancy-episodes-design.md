# Kehamilan per Pasien (Episode Kehamilan) — Riwayat untuk Antisipasi

Status: approved by the user (2026-11-21)

## Intent

When a patient comes back pregnant again, the doctor cannot see a complete, short history
of her earlier pregnancies, so risks for the new pregnancy are not anticipated from the
first visit. Today the history ("Riwayat Persalinan") is a list typed inside **each visit's
anamnesa** (`medical_records.record_data.riwayat_persalinan`), so every visit (DRD) has
its own copy that can be complete, empty or different. It holds only year, month,
aterm/preterm, delivery method, birth weight, sex (and for abortus: year, kuretase). It
has no indication for the delivery method and no complications. What the clinic itself
recorded during an earlier pregnancy (visits, USG, "Sudah Lahir", keguguran / lahir mati)
is never collected into that history.

There is also no record of "the pregnancy" at all: every screen infers the current
pregnancy on its own (staff list and HPL panels: newest anamnesa HPHT; portal tracker:
newest USG EDD; prepay suggestion: newest edited record; DocBoard: per visit), so they
can disagree, and a new-pregnancy visit with an empty HPHT still shows the old HPL.

## Decisions by the user (2026-11-21)

- Approach A: one record per pregnancy per patient, built in two stages.
- A new pregnancy starts **automatically** from a new HPHT (not a button). If the previous
  pregnancy has no recorded end, the doctor completes it at that moment.
- Required history per earlier pregnancy: **cara lahir + indikasi**, **komplikasi**.
  Birth weight optional. A loss is recorded as **Abortus when < 20 weeks**; ≥ 20 weeks is
  **lahir mati** (counts as Para). Abortus needs no extra mandatory detail beyond today's
  (year, kuretase).
- A card "Riwayat Kehamilan Sebelumnya" sits at the top of the Private Clinic anamnesa
  (the visit page; the UI says "Private Clinic", never "Sunday Clinic"). It also shows on
  ginekologi khusus (`gyn_special`) and ginekologi fertilitas / program hamil
  (`gyn_repro`) visits when an earlier pregnancy was cared for by this clinic.
- Resume medis: **unchanged** (history is already visible in riwayat kontrol).
- Kelola Pasien: **no new summary format**; show the existing (old) resume medis of the
  earlier pregnancy.

## Goals

Stage 1
1. Table of pregnancies per patient; every obstetri visit belongs to one pregnancy.
2. Automatic start of a new pregnancy from a new HPHT, with a required "lengkapi kehamilan
   sebelumnya" step when the previous one has no end.
3. History card in the Private Clinic anamnesa (rules above), editable there.
4. One-time backfill from existing data, with a review list for conflicts.
5. "Sudah Lahir" and "Kehamilan Berakhir" write the end onto the pregnancy; the loss type
   follows the 20-week rule.
6. Kelola Pasien: link to open the old resume medis of earlier pregnancies.

Stage 2 (separate plan, after stage 1 is live and the backfill is reviewed)
7. All "current pregnancy" consumers read the ongoing pregnancy record: Kelola Pasien list,
   HPL panels, portal tracker, prepay suggestion, DocBoard, `/api/patients/pregnancy-data`
   (Android), kick counter / contraction timer sessions get the pregnancy id.
8. Retire the date rule (`PregnancyEnd.js` HPHT − 14 days) and the per-visit
   `riwayat_persalinan` as a source.

## Non-goals

- Resume medis content changes.
- A G/P/A text summary in Kelola Pasien.
- Patient-portal UI for the history (patients do not see or edit it).
- Changing existing visit/DRD numbering.

## Anti-goals

- Losing or silently overwriting history the doctor typed in older visits' anamnesa.
- A new HPHT merged into an old pregnancy (the exact failure this fixes).
- Anything shown to the patient about a loss.

## Approaches (user picked A)

- **A. Pregnancy table, two stages** — history entered once, one source for "current
  pregnancy". Cost: backfill must be reviewed (per-visit histories differ). **Picked.**
- B. History table only, current pregnancy still date-inferred — smaller, but the screens
  keep disagreeing and a new pregnancy has no clear home.
- C. No new table, history computed from visits — cannot hold indications or pregnancies
  cared for elsewhere.

## Data (stage 1)

`pregnancies` (migration file, no runtime DDL):
- `id`, `patient_id VARCHAR(10)` (utf8mb4_unicode_ci), `sequence` (1..n per patient, by
  HPHT / year),
- `source ENUM('clinic','external')` — clinic = has at least one visit here,
- `hpht DATE NULL`, `hpl DATE NULL`, `year SMALLINT NULL` (external pregnancies often only
  have a year),
- `status ENUM('ongoing','ended')`,
- `outcome ENUM('lahir_hidup','lahir_mati','abortus','ektopik','unknown') NULL`,
- `ended_on DATE NULL`, `ga_weeks_at_end TINYINT NULL`,
- `delivery_method` (same options as today: Spt B, SC, Vakum, Forceps) NULL,
  `delivery_indication VARCHAR(255) NULL`,
- `complications JSON NULL` (list of codes) + `complication_notes VARCHAR(500) NULL`,
- `birth_weight_g SMALLINT NULL`, `baby_sex`, `kuretase`, `term ENUM('aterm','preterm',
  'postterm') NULL`,
- `needs_review TINYINT` (backfill conflict), `created_by/updated_by`, timestamps.

`pregnancy_visits` or a nullable `pregnancy_id` on `sunday_clinic_records` — builder's
call after checking how visit rows are written (prefer a nullable column with an index).

Links: `pregnancy_outcomes` and `birth_congratulations` rows get a nullable `pregnancy_id`
(stage 1 writes it; stage 2 reads it).

Complication codes (designer's call, check while reading): preeklamsia/PEB, eklamsia,
hipertensi gestasional, DM gestasional, HPP (perdarahan postpartum), plasenta previa,
solusio plasenta, KPD, persalinan preterm, IUGR/PJT, kelainan letak, infeksi,
lainnya (with notes). Multiple allowed.

## Behaviour (stage 1)

- **New pregnancy detection** (when an obstetri anamnesa is saved with an HPHT): it starts
  a new pregnancy when the patient has no ongoing pregnancy, or the ongoing one's HPHT is
  more than 14 days earlier AND (the ongoing one has an end, or the new HPHT is after the
  ongoing one's HPHT + 42 weeks, or the doctor confirms "ini kehamilan baru"). An HPHT
  within 14 days of the ongoing one updates that pregnancy (dating correction). Exact
  prompt flow is the builder's, but the doctor must confirm before a pregnancy without an
  end is closed.
- **Lengkapi kehamilan sebelumnya**: when a new pregnancy starts and the previous one has
  no end, a required form asks: outcome (lahir hidup / lahir mati / abortus / ektopik),
  date or month-year, cara lahir + indikasi (for births), komplikasi; berat optional. The
  20-week rule picks abortus vs lahir mati from GA at the end date and warns on a
  mismatch.
- **History card**: one row per earlier pregnancy (newest first): year, outcome,
  GA at end, cara lahir + indikasi, komplikasi, berat if any, source badge
  (klinik / luar). Add / edit / delete for external rows; clinic rows editable for
  indication / complications. Shown on obstetri visits always (if any history), on
  `gyn_special` / `gyn_repro` visits only when a `source='clinic'` earlier pregnancy exists.
- **G/P/A** in the anamnesa form is derived from the pregnancies table (still overridable
  as today).
- **Sudah Lahir / Kehamilan Berakhir** set the ongoing pregnancy's end (outcome, date) and
  link the row. Loss type is suggested from GA (< 20 weeks → abortus; ≥ 20 → lahir mati).
  The current outcome codes `keguguran` map to `abortus`.
- **Kelola Pasien**: in the patient's detail, a "Kehamilan sebelumnya" list with a link per
  pregnancy to its existing resume medis (the last visit's resume document of that
  pregnancy). No new summary text.

## Calls made after the builder check (designer's calls, check while reading)

- **Where detection runs:** only on an explicit save of the obstetri anamnesa of the
  patient's newest obstetri visit, in the Private Clinic UI, never on autosave.
  Non-interactive writers (medical-import, Medify import, bulk USG upload) never start or
  close a pregnancy: they attach the visit to the pregnancy whose HPHT is within 14 days,
  else leave it unlinked and set `needs_review` on the patient's ongoing pregnancy.
- **Editing HPHT on an older visit:** never starts or closes a pregnancy. If the new HPHT
  is still within 14 days of its pregnancy, it updates the dating when it is that
  pregnancy's newest visit; otherwise the pregnancy gets `needs_review`.
- **Old "Riwayat Persalinan" list in the anamnesa (stage 1):** stays, because resume medis
  (unchanged) reads it. The card is the place to edit history; saving the card also writes
  the derived list into the current visit's `riwayat_persalinan`, so the resume and the
  card agree. Older visits' lists are never rewritten.
- **Twins/multiples:** babies are stored as a list (`babies JSON`: weight_g, sex, alive per
  baby) instead of single `birth_weight_g` / `baby_sex`; `delivery_method` stays one per
  pregnancy.
- **Para counts** births ≥ 20 weeks (lahir hidup and lahir mati), once per pregnancy
  regardless of number of babies.
- **Which visits link:** only obstetri visits get a `pregnancy_id`. A `source='clinic'`
  pregnancy is one with at least one obstetri visit here (so gyn-only care does not make
  one).
- **Outcome rows with no matching pregnancy (backfill):** create an `ended` pregnancy from
  the row (date, outcome) with `needs_review`. "Sudah Lahir" / "Kehamilan Berakhir" on a
  patient with no ongoing pregnancy row creates an ended pregnancy from the action.
- **Who may close / complete a pregnancy (user decision):** dokter and bidan only. Use the
  role constants (`ROLE_NAMES.DOKTER`, `ROLE_NAMES.BIDAN`) or a dedicated permission granted
  to exactly those roles in the account-access system — builder checks which mechanism the
  `patients`/medical-record routes use today; other staff can view the history.
- **Ectopic in G/P/A (confirmed by the user 2026-11-21):** counted in Abortus.
- **Resume link in Kelola Pasien:** points to the newest stored resume medis among that
  pregnancy's visits; when none exists, show "Belum ada resume" (external pregnancies show
  no link).

## Backfill (stage 1, one-time script, re-runnable, dry-run first)

Per patient with obstetri visits:
1. Group visits into clinic pregnancies by anamnesa HPHT (same pregnancy when within 14
   days); visits without HPHT join the nearest earlier group of the same patient within
   42 weeks, else stay unlinked.
2. End each group from `birth_congratulations` / `pregnancy_outcomes` using today's date
   rule; the newest group without an end and HPHT within 42 weeks stays `ongoing`; older
   ones without an end become `ended` with outcome `unknown` + `needs_review`.
3. External pregnancies from the **most complete** `riwayat_persalinan` of the patient's
   visits (most entries, then newest); entries matching a clinic pregnancy by year +
   outcome are merged into it, others become `source='external'`. Differing lists across
   visits → `needs_review`.
4. Output a staff review list ("Riwayat perlu dicek") of `needs_review` pregnancies.
Run on a scratch copy of production first and show the user the counts before applying.

## Tests

Detection rule (all branches incl. 14-day correction and 42-week boundary), 20-week rule,
backfill grouping on fixtures (conflicting histories, imported visits, visits without
HPHT), card visibility per category, mark-delivered / pregnancy-outcome linking, access
control (`patients.edit` for edits; view under existing medical-record view permission).

## Left to the builder

Exact UI layout of the card and forms, endpoint names, whether `pregnancy_id` lives on
`sunday_clinic_records` or a join table, file split, test file names.

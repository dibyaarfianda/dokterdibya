# Kehamilan per Pasien — Tahap 2 (design)

Parent spec: `docs/superpowers/specs/2026-11-21-pregnancy-episodes-design.md` (goals 7–8, approach A).
Stage 1 is live (PR #42, #43, #50; CLAUDE.md §47–48). This document fixes the stage-2 details.

## Intent

Every screen that asks "is this patient pregnant now, how far, and is it over?" answers from
one place: the patient's `pregnancies` rows. Today most staff screens still guess from the
newest obstetri anamnesa HPHT plus a date rule (`PregnancyEnd.js`: an end event dated
≥ HPHT − 14 days ends it), Android ignores losses, and several paths bypass the table.

## Decisions (user, 22 Nov 2026)

1. Patient birth self-report and the staff "ucapan kelahiran" upsert **link to the ongoing
   pregnancy and flag it for review** ("Lahir dilaporkan, belum ditutup"); dokter/bidan close it
   with "Sudah Lahir". They never close it themselves.
2. Android `pregnancy-data`: ongoing pregnancy → pregnancy data; no ongoing pregnancy and the
   newest pregnancy ended `lahir_hidup` with a published birth card → birth card; a loss →
   neutral (nothing shown, never named).
3. Patient merge and deletion carry the pregnancy data (pregnancies, birth cards, outcomes,
   kick-counter and contraction sessions) in stage 2.
4. Kelola Pasien end badge stays until a new pregnancy is recorded (same as today).

## Design (builder's calls unless marked above)

**One reader.** A new `services/CurrentPregnancy.js` gives, per patient (batched for lists):
`ongoing` = newest `status='ongoing'` row (by `sequence`, then `id`) with
`hpl` (else `hpht + 280`) and `hpht` (else `hpl − 280`); `lastEnded` = newest clinic
(`source='clinic'`) ended row when there is no ongoing row. Day counts use calendar days in
WIB (`PregnancyTrackerDates.trackerDates`), never `new Date('YYYY-MM-DD')`.

**Consumers switched to it**
- Kelola Pasien list and advanced search (`GET /api/patients`, `/search/advanced`): `hpl`,
  `days_pregnant` from `ongoing`; `pregnancy_end` from `lastEnded`
  (`lahir_hidup`→`birth`, `lahir_mati`→`lahir_mati`, `abortus`/`ektopik`→`keguguran`,
  `unknown`→`selesai`; `date` = `ended_on`; `id`/`note` from the linked outcome row when there is
  one); `has_delivered` = `birth`. `is_obstetri` unchanged. The staff UI gets a label for
  `selesai` ("Kehamilan selesai").
- "Mendekati HPL" / "Lewat HPL" panels: join the ongoing row instead of the latest-anamnesa
  subquery + `endedSqlCondition`. Near-due: 259–279 days; overdue: ≥ 280 days (no upper bound —
  it stays until someone closes it).
- Portal tracker and prepay suggestion: drop `trackerEndState` (an ongoing row is not ended).
  Keep the tracker's HPL + 14 days auto-hide and the suggestion's 14-day HPL grace / 42-week cap.
- "Kehamilan Berakhir" (`PregnancyOutcomeService.record`): validates the event date against the
  ongoing row's HPHT (same 14-day tolerance); no ongoing pregnancy → 400
  "Tidak ada kehamilan berjalan".
- Android `pregnancy-data`: decision 2, same response shape.
- Birth self-report / staff upsert: decision 1 (set `pregnancy_id`, `needs_review=1`).
- Kick counter and contraction timer: nullable `pregnancy_id` (+ index) on
  `kick_counter_sessions` and `contraction_sessions` (migration), filled at session creation.
- DocBoard from DRD: when the visit has `pregnancy_id`, that pregnancy's HPHT/HPL are the first
  dating candidates; if that pregnancy ended before the schedule date, no "Perkiraan UK" label.
  Otherwise the current logic stays.
- Automatic obstetric diagnosis (`diagnosis-generator.js`): G/P/A counts and "Bekas SC" come
  from the pregnancy totals the history card already loads (`/api/pregnancies/patient/:id`),
  not from the visit's own `riwayat_persalinan`; falls back to the form fields when the card
  has not loaded.
- Merge / delete: decision 3; merge moves the rows to the target patient and re-numbers
  `sequence` by HPHT/year; at most one ongoing pregnancy survives (the newer HPHT; the other is
  ended `unknown` with `needs_review`).

**Retired**: `PregnancyEnd.resolvePregnancyEnd`, `loadEndEvents`, `endedSqlCondition`,
`pregnancyListFields`, `trackerEndState`; `GestationalAge.findPregnancyReference`.
`toDateString` / tolerance constants stay. Their pinning tests are replaced, not deleted
without replacement.

## Non-goals

Resume medis text; dashboard `patients.is_pregnant`; visit-category heuristics; AI prompts;
patient-portal UI changes beyond what the data change implies; the Android app code.

## Anti-goals

Showing a loss to a patient; a patient report closing a pregnancy; losing a pregnancy row on
merge.

## Deploy

Migration (session `pregnancy_id` columns) before the ff-merge; staff assets next version,
staged first; backend reload. Verify the four Kelola Pasien surfaces against a read-only
comparison of old vs new results on production data before deploying.

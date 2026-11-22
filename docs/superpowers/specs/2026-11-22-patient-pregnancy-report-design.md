# Laporan Akhir Kehamilan dari Pasien (design)

Parent specs: `2026-11-21-pregnancy-episodes-design.md`, `2026-11-22-pregnancy-episodes-stage2-design.md`.
CLAUDE.md §46–48 describe the current pregnancy model (`pregnancies` table, `services/CurrentPregnancy.js`).

## Intent

Many patients deliver (or lose a pregnancy) outside the clinic and never come back, so their
pregnancy stays `ongoing` forever: they sit in "Lewat HPL", the list shows a stale HPL, and the
clinic never learns the outcome. Today only dokter/bidan close a pregnancy ("Sudah Lahir",
"Kehamilan Berakhir", "Lengkapi kehamilan sebelumnya"). This adds a second, patient-driven way:
when a patient whose pregnancy is past its HPL opens the portal (for example to look at her USG
album), the portal asks her what happened, and her answer closes the pregnancy.

## Decisions (user, 22 Nov 2026)

1. The first question offers three answers: **Lahir sehat**, **Keguguran**, **Hamil di luar
   kandungan**. (Builder adds a fourth escape button, "Masih hamil" — approved as part of decision 3.)
2. The patient's answer **closes the pregnancy immediately** (`status = 'ended'`); every consumer
   (Kelola Pasien list/badge, HPL panels, portal tracker, prepay suggestion, Android
   `pregnancy-data`, DocBoard) changes at once. This replaces the 22 Nov stage-2 decision 1
   ("a patient report never closes") **for this new flow only**; the existing
   `birth-self-report` / staff upsert keep their link-and-flag behaviour.
3. The question appears **only after the HPL** of the ongoing pregnancy (day after HPL onward),
   on every portal open until answered. "Masih hamil" hides it for **7 days**.
4. "Lahir sehat" does **not** create a birth congratulation card (`birth_congratulations`).
5. Approach A: a new patient endpoint closes the pregnancy server-side; the 7-day snooze is stored
   on the `pregnancies` row (migration), so it holds across devices and the Android WebView.
6. Wrong taps: the patient sees a summary of her answer and confirms ("Ya, benar") before it is
   sent; and dokter/bidan get a **"Buka kembali kehamilan"** action on a patient-reported row
   (see Staff side).

## What the patient fills in

- **Lahir sehat** → tempat lahir (free text, required, ≤ 120 chars), tanggal lahir (required),
  cara lahir **Normal** / **SC** (required), jumlah bayi **1 / 2 / 3** (required), berat lahir per
  bayi in grams (required, integer 500–6000).
- **Keguguran** → tanggal (required), tempat (optional, ≤ 120 chars).
- **Hamil di luar kandungan** → tanggal (required), tempat (optional, ≤ 120 chars).
- Date rule (all answers): not after today (WIB) and not before the pregnancy's HPHT
  (`datingOf(row).hpht`).

## Mapping to `pregnancies`

| Answer | outcome | other columns |
|---|---|---|
| Lahir sehat | `lahir_hidup` | `delivery_method` Normal → `Spt B (Spontan)`, SC → `SC (Caesar)`; `babies` = `[{weight_g, alive:true}, …]` |
| Keguguran | GA at date < 20 weeks → `abortus`, ≥ 20 → `lahir_mati` (`lossTypeForGa`) | — (after HPL it is practically always `lahir_mati`; the patient never sees that word) |
| Hamil di luar kandungan | `ektopik` | — |

All answers: `status='ended'`, `ended_on`, `ga_weeks_at_end`, `term` (as `normalizeEnd` computes),
new `delivery_place` (the place text), new `ended_by_patient = 1`,
`updated_by = 'patient:<patient_id>'`, `needs_review = 1`, `review_reason = 'Dilaporkan pasien'`
(builder's call: the row is closed — every screen treats it as ended — but it is listed in
"Riwayat perlu dicek" so a dokter/bidan can add what a patient cannot give, e.g. the SC
indication; the SC-requires-indication rule of `normalizeEnd` is not applied to patient reports).

## Server

- **Migration** `migrations/2026112x_pregnancy_patient_report.sql` (guarded `ADD COLUMN IF NOT
  EXISTS` style, like `20261123_pregnancies.sql`): `report_snoozed_until DATE NULL`,
  `delivery_place VARCHAR(120) NULL`, `ended_by_patient TINYINT(1) NOT NULL DEFAULT 0` on
  `pregnancies`. Run before the ff-merge.
- **`GET /api/patient/pregnancy-report/status`** (`verifyPatientToken`, no-cache headers per
  CLAUDE.md §12) → `{ success:true, ask: boolean, hpht? }`. `ask` is true when the patient has an
  ongoing pregnancy (`loadCurrentPregnancies` → `ongoing`), its `datingOf().hpl` is before today
  (WIB calendar day, `dayNumber` maths, never `new Date('YYYY-MM-DD')`), and
  `report_snoozed_until` is null or before today. The response never contains an outcome.
- **`POST /api/patient/pregnancy-report`** body
  `{ answer: 'lahir_sehat'|'keguguran'|'ektopik'|'masih_hamil', ended_on, place, delivery:'normal'|'sc', babies:[{weight_g}] }`.
  - Locks the patient's `pregnancies` rows (`FOR UPDATE`, same order as `endOngoing`), re-checks
    that the ongoing row exists and is past HPL; otherwise 409 "Data kehamilan sudah berubah.
    Muat ulang halaman." (covers a staff close or a second device in between).
  - `masih_hamil` → `report_snoozed_until = today + 7`, nothing else changes. The status check
    asks again only when `report_snoozed_until < today`, so the question stays hidden for the
    whole 7 days and returns on day 8.
  - Other answers → validate (rules above), then close the ongoing row with a **patient-specific
    normaliser** (builder's call: add e.g. `normalizePatientReport` next to `normalizeEnd` and
    reuse its pieces — `gaWeeksAt`, `lossTypeForGa`, `termForGa` — rather than calling
    `normalizeEnd` and overriding its `needs_review` / SC-indication rules afterwards). Only
    "Lahir sehat" stores `babies` (`alive:true`); the two loss answers store none. Never insert a
    new row, never touch `birth_congratulations` or `pregnancy_outcomes`.
  - No cap on how far past HPL a row may be: a row years past HPL is asked too (that is the stale
    data this feature exists to close); the date must still be ≥ its HPHT.
  - Response `{ success:true }` with a neutral message; never echoes the outcome.
- **Route whitelist:** both paths go into `security/patientRouteAccess.js`, and the existing
  "every route of the router is whitelisted" test pattern covers the new router (CLAUDE.md §48).
- Patient identity only from `req.patient.id`; a patient can only close her own ongoing row.

## Portal

- Pages (builder's call, from recon): `public/patient-menu.html` — every login redirect and the
  manifest `start_url` land there — and `public/album-usg.html` (the user's example). One shared
  script, e.g. `public/scripts/pregnancy-report-prompt.js`, included on both; it calls the status
  endpoint (`?_t=` cache-buster) after the page's own auth check and, when `ask` is true, opens a
  modal. It must not open at the same time as the existing birth-data modal
  (`checkBirthPending` in `patient-menu-shell.js`): if that one is showing, skip this one.
- Step 1: short neutral title (e.g. "Bagaimana kabar kehamilan Ibu?"), the three answers as large
  buttons, and a quieter "Masih hamil" button. Step 2: the form for the chosen answer, with
  "Kembali". Step 3: a read-only summary of what she entered and **"Ya, benar"** / "Ubah"; only
  "Ya, benar" sends. On success: a short closing line — warm for Lahir sehat, gentle (no
  congratulation, no emoji) for the two losses — then the modal closes and the page reloads its
  pregnancy cards.
- On a 409 (state changed — staff closed it, or another device answered): close the modal and
  reload the page; no error toast that names the outcome.
- The modal never repeats the chosen loss back later; once closed, the pregnancy tracker shows
  its existing neutral "Data kehamilan belum tersedia." state.
- WebView-safe sizes (no `vh`, CLAUDE.md §25); patient pages keep the zoom lock (§42); bump
  `public/sw.js` `CACHE_VERSION` on deploy (§31).

## Staff side

- The pregnancy history card (Private Clinic anamnesa, Kelola Pasien "Kehamilan sebelumnya") shows
  a small "Dilaporkan pasien" label when `ended_by_patient = 1`, plus the place.
- Dokter/bidan correct details of a report through the existing history edit (`updateHistory`);
  that keeps `ended_by_patient` as history but clears `needs_review` as today.
- **"Buka kembali kehamilan"** (decision 6): shown on a row with `ended_by_patient = 1`, dokter/bidan
  only (`assertCanClose`). A new staff route (e.g. `POST /api/pregnancies/patient/:id/:pregnancyId/reopen`)
  sets `status='ongoing'` and clears the end columns (`outcome`, `ended_on`, `ga_weeks_at_end`,
  `delivery_method`, `delivery_place`, `babies`, `term`), `ended_by_patient = 0`,
  `needs_review = 0`, `report_snoozed_until = today + 7` (so the patient is not asked again
  immediately). Refused (409) when the patient already has another ongoing pregnancy or the row
  was not patient-reported. Confirm dialog before it runs.
- G/P/A totals and the automatic diagnosis count a patient-reported row immediately (builder's
  call: the pregnancy has ended, and dokter/bidan can still correct or reopen it).
- No new staff menu, no new red-dot source.

## Goals / non-goals / anti-goals

- Goals: close stale past-HPL pregnancies from the patient's side; capture place, date, method,
  babies and weights for births.
- Non-goals: birth congratulation cards; asking before HPL; native Android app code; WhatsApp
  reminders; changing the staff close flows or the old `birth-self-report` endpoint.
- Anti-goals: a patient closing someone else's pregnancy or a pregnancy that is not past HPL;
  a response or later screen naming the loss back to the patient; a second pregnancy row created
  by a patient report; staff losing the ability to correct it.

## Approaches considered

- **A (chosen):** new patient endpoint + server-side snooze column. Works across devices and the
  WebView; all rules checked on the server. Costs a migration and more tests.
- B: same endpoint, snooze in browser storage. No migration, but the question reappears after a
  device change or cleared storage, and Android WebView storage is unreliable.
- Dropped: extending `POST /api/patient/birth-self-report` — it always creates a birth card
  (contradicts decision 4) and never closes (contradicts decision 2).

## Left to the builder

Exact copy text (Indonesian, neutral, "Private Clinic" never "Sunday Clinic"), modal styling
matching the home shell, test layout, migration file date.

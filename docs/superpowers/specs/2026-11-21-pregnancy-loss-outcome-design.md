# Keguguran / Lahir Mati — Kehamilan Berakhir Tanpa Ucapan Kelahiran

Status: draft (2026-11-21)

## Intent

Patients whose pregnancy ended in a miscarriage (keguguran) or stillbirth (lahir mati)
keep showing an HPL in staff "Kelola Pasien" and keep a running pregnancy tracker in the
SISIwanita patient portal. The only existing way to clear it is "Sudah Lahir", which
creates a `birth_congratulations` row and starts the patient-facing congratulation flow
("Selamat atas kelahiran buah hati Ibu…", fill baby name/weight). Sending that to a
grieving mother is the anti-goal of this whole feature.

Staff need to mark "kehamilan berakhir" (keguguran / lahir mati) so that:
- the HPL stops showing in Kelola Pasien (main table, advanced search, panels
  "Mendekati HPL" and "Lewat HPL");
- the pregnancy tracker disappears from the patient portal;
- the patient receives **no** congratulation, message or notification.

At the same time (user decision) fix "Sudah Lahir", which today hides HPL for the patient
**forever**, including every later pregnancy.

## Goals

1. New staff action "Kehamilan Berakhir" with type `keguguran` | `lahir_mati`, event date,
   optional note; can be cancelled if marked by mistake.
2. One rule, used everywhere a pregnancy is treated as current:
   **a pregnancy is ended when its HPHT ≤ the latest end-event date of that patient.**
   End events = active pregnancy outcomes (event_date) ∪ births
   (`COALESCE(birth_congratulations.birth_date, DATE(birth_congratulations.created_at))`).
   A new pregnancy has an HPHT after the event, so its HPL shows again automatically.
3. Portal: tracker endpoint returns no data for an ended pregnancy; home tracker card is
   hidden; tracker page shows a neutral empty state and ignores a local (device) HPHT
   preview dated on/before the end event.

## Non-goals

- A real "pregnancy episode" model (switching to the next pregnancy explicitly). The date
  rule is a bridge; the episode system is designed in a follow-up right after this work.
- Other HPL consumers (DocBoard schedule, WhatsApp reminders, Sunday Clinic anamnesa
  calculators) stay unchanged.
- No change to the birth congratulation flow itself.
- No patient-visible text naming the loss. The portal never says "keguguran" or
  "lahir mati".

## Anti-goals

- Any code path where a pregnancy outcome creates, publishes or shows a birth
  congratulation, birth-pending form, or push/WhatsApp message.
- Outcome rows readable by patients through any `/api/patient*` endpoint other than the
  derived `pregnancy_ended` flag + boundary date of the tracker endpoint.

## Approaches (user picked A)

- **A. New table `pregnancy_outcomes`** — isolated from the congratulation flow; one
  migration. **Picked.**
- B. Add a type column to `birth_congratulations` — that table is read by birth-pending,
  congratulation card, child numbering, self-report; one missed filter sends a
  congratulation. Rejected.
- C. Flag inside the anamnesa record — the portal reads USG, not anamnesa; medical records
  are versioned. Rejected.

## Data

Migration `staff/backend/migrations/20261121_pregnancy_outcomes.sql` (run on deploy; no
runtime `CREATE TABLE`, per `StaffPanelWave6StartupSchema.test.js`):

```sql
CREATE TABLE IF NOT EXISTS pregnancy_outcomes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    patient_id VARCHAR(<same as patients.id>) NOT NULL,
    outcome_type ENUM('keguguran','lahir_mati') NOT NULL,
    event_date DATE NOT NULL,
    note VARCHAR(500) NULL,
    recorded_by VARCHAR(64) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    voided_at DATETIME NULL,
    voided_by VARCHAR(64) NULL,
    KEY idx_po_patient_active (patient_id, voided_at, event_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

Builder: match `patient_id` type/collation to `patients.id` on the VPS (`SHOW CREATE
TABLE patients`). A patient may have several outcomes (repeat losses). Cancel = set
`voided_at/voided_by` (soft delete, kept for audit); only rows with `voided_at IS NULL`
count.

## Calls made after the builder check (designer's calls, check while reading)

- **Two HPHT sources.** Staff uses the latest obstetri anamnesa HPHT; the portal uses the
  latest USG `edd − 280`. The rule is applied per source, each against the same end
  events. A pregnancy counts as ended when `hpht <= event_date + 14 days`
  (`END_TOLERANCE_DAYS = 14`): USG dating can put the estimated HPHT up to ~2 weeks later
  than the LMP, and a new pregnancy cannot have an LMP within 14 days after a loss or
  birth. POST accepts a patient when **either** source has an HPHT; it validates
  `event_date >= (earliest known HPHT) − 0` and refuses only when no source exists.
- **Births clear the portal tracker too** (tracker page shows the neutral empty state
  after a birth instead of waiting for HPL + 14 days). The home-screen logic that hides
  the tracker while a congratulation card is shown is left as is (the congratulation flow
  is untouched).

## Shared rule — `staff/backend/services/PregnancyEnd.js`

- `resolvePregnancyEnd(hphtStr, events)` (pure) → `{ ended, type, date }` where `type` is
  `'birth' | 'keguguran' | 'lahir_mati'` of the latest event with `date >= hpht`.
- `loadEndEvents(db, patientIds)` → `Map<patientId, Event[]>` (two batched queries:
  active outcomes + births).
- `endedSqlCondition(patientAlias, hphtExpr)` → `NOT EXISTS (...)` snippet for the
  near-due / overdue SQL, covering both tables with the same date rule.
- Dates handled as local `YYYY-MM-DD` strings (CLAUDE.md §14, no `toISOString()`).

## Backend changes

1. `GET /api/patients` list + `GET /api/patients/search/advanced` (`routes/patients.js`):
   replace the per-patient `birthSet` with `loadEndEvents` + `resolvePregnancyEnd`.
   Response adds `pregnancy_end: { type, date } | null`; `has_delivered` becomes
   `pregnancy_end?.type === 'birth'` (keeps the field for existing consumers incl.
   `bench-concurrent.js`). When ended, `hpl` / `days_pregnant` stay in the payload but
   the UI treats the pregnancy as ended.
2. `near-due-pregnancies` / `overdue-pregnancies`: replace
   `LEFT JOIN birth_congratulations bc … WHERE bc.id IS NULL` with the shared condition.
   This is the "Sudah Lahir next pregnancy" fix.
3. New staff routes (registered in `config/accessControlRegistry.js` as
   `patients.edit`, like `mark-delivered`), `verifyStaffToken`:
   - `POST /api/patients/:id/pregnancy-outcome` body `{ outcome_type, event_date, note }`.
     Validates type, date format, `event_date <= today (WIB)`, note ≤ 500 chars. Requires
     a current obstetri HPHT (same latest-HPHT query) and `event_date >= hpht`; otherwise
     400 with a clear Indonesian message (marking would hide nothing). Inserts, then
     `cache.delPattern('patients:')`.
   - `DELETE /api/patients/:id/pregnancy-outcome/:outcomeId` → void it; 404 if not this
     patient's active row; invalidate cache.
   - Never touches `birth_congratulations`, notifications, push or WhatsApp.
4. Portal `GET /api/patients/pregnancy-tracker` (`routes/patients-auth.js`): after
   computing `hphtEstimate = edd − 280`, run the shared rule. If ended →
   `{ success: true, data: null, pregnancy_ended: true, ended_on: 'YYYY-MM-DD' }` with
   neutral `message: 'Data kehamilan belum tersedia.'`. No outcome type in the response.
   Also check `middleware/patientDemoGuard.js` so demo mode keeps working.
5. Prepay booking suggestion (user decision): `GET /api/patient/checkup-prepay/suggestion`
   (`routes/patient-checkup-prepay.js`) — after `findPregnancyReference`, derive its HPHT
   (`hpht` as is, `hpl − 280` days) and run the shared rule. If ended → `weeks`, `days`,
   `source`, `suggested_code` are `null` (no pregnancy-week suggestion); the package list
   itself stays as it is. Add a route test.

## Staff UI (`staff/public/scripts/legacy/patient-tools.js`)

- HPL cell: if `pregnancy_end.type === 'birth'` → existing green "Sudah Lahir" badge; if
  `keguguran` / `lahir_mati` → grey badge `<i class="fas fa-ribbon">` "Keguguran" /
  "Lahir Mati", tooltip with the date; click opens a SweetAlert with the details and a
  "Batalkan penandaan" button (only with `patients.edit`) → DELETE → refresh.
- Next to the existing "Sudah Lahir" buttons (main table row and the HPL panels) add a
  secondary button "Kehamilan Berakhir" (`btn-secondary`, `fa-ribbon`), shown under the
  same conditions as the delivery button (obstetri, not ended, `patients.edit`).
- Action = SweetAlert form: type radio (Keguguran / Lahir Mati, no default), date
  (default today, max today), optional note; confirm text states that the patient gets
  no notification. On success: update the row in place like `markAsDelivered`, reload the
  HPL panels.
- New functions exported on `window` (CLAUDE.md §11).
- Bump staff asset versions (`window.__assetVersion`, `STAFF_PWA_VERSION`), and stage the
  staff release dir per deploy notes.

## Patient portal

- `public/scripts/patient-menu-shell.js` `loadPregnancyTrackerHome`: if
  `result.pregnancy_ended` → hide the tracker panel (add a `pregnancy-ended` body class
  with the same CSS as `has-birth-congrats` in `public/patient-menu.html`; do not reuse
  the birth class, its show/hide is driven by the congratulation card).
- `public/pregnancy-tracker.html`: if `pregnancy_ended`, use the local HPHT preview only
  when it is **after** `ended_on`; otherwise render the existing neutral empty state
  (with the HPHT form, so a new pregnancy can still be previewed). Use the neutral
  message.
- `public/contraction-timer.html` already treats `data: null` as no pregnancy; check it
  shows nothing loss-related.
- Bump `public/sw.js` `CACHE_VERSION`.

## Tests

- Unit: `resolvePregnancyEnd` (no events; birth before/after HPHT; outcome before/after
  HPHT; voided outcome ignored; latest event wins; birth_date NULL → created_at date).
- Route tests: POST validation (bad type, future date, date before HPHT, no HPHT, note
  too long), DELETE ownership, access-control registry entry, and that the POST handler
  issues no query touching `birth_congratulations`.
- Tracker endpoint: ended → `data: null`, `pregnancy_ended: true`, no outcome type.
- Verify on the VPS against a scratch copy, then live: mark a test patient, check list,
  panels, portal home/tracker, cancel, check again.

## Rollout note

Switching "Sudah Lahir" to the date rule brings back HPLs for patients whose birth row is
dated before their latest HPHT (real new pregnancies, but also self-reported older
children or mistyped birth dates). Before deploy, if the user allows it, run a read-only
query on production listing those patients so they can be reviewed.

## Left to the builder

Exact button placement/spacing, SweetAlert markup, helper file split, test file names.

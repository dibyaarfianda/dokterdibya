# Patient Intake Data Model & Workflow Blueprint

## 1. Entity Mapping & Field Definitions

| Sheet Section | Entity / Table | Key Fields | Type & Validation | Notes |
| --- | --- | --- | --- | --- |
| Identity & Demographics | `patient_profiles` (existing) | `full_name` (varchar, required), `dob` (date, required), `nik` (varchar(32), unique nullable), `phone` (varchar(20), required), `address` (text), `education_level` (enum), `insurance` (varchar) | Validate phone via regex `^[0-9+]{8,15}$`; derive age server-side | Link to existing patient via `phone` or `nik` before creating new record |
| Family & Social | `patient_profiles` + `patient_contacts` | `marital_status` (enum: single, menikah, cerai), `husband_name` (varchar, nullable), `husband_age` (tinyint, 15-80), `husband_job` (varchar), `occupation` (varchar), `emergency_contact` (varchar) | When `marital_status = cerai`, spouse columns stored as `NULL` | Emergency contact stored in related table for reuse |
| Current Pregnancy | `pregnancies` | `pregnancy_id` (PK), `patient_id` (FK), `lmp`, `edd`, `first_check_ga`, `height_cm`, `weight_kg`, `bmi`, `blood_pressure`, `muac_cm`, `general_condition` | `edd` auto-derived when `lmp` present; store `edd_source` ENUM (`lmp`, `manual_override`, `user_entered`) | Each submission opens a `pregnancies` row with status `patient_reported` until verified |
| Risk Factors | `pregnancy_risk_flags` | `flag_code`, `flag_label`, `severity` (enum: low, moderate, high) | Pre-populate from front-end risk calculator; allow clinicians to append; maintain audit trail |
| Medical History | `patient_conditions` | `condition_code` (FK to catalog), `diagnosed_by_patient` (bool), `notes` | Store allergies in `patient_allergies` (type: drug/food/environment, details text) |
| Medications | `patient_medications` | `med_name`, `dose`, `frequency`, `source` (enum: self, clinic) | Capture `source=patient` until clinician confirms |
| Obstetric History | `patient_obstetric_history` | `sequence_no`, `year`, `delivery_mode`, `complications`, `birth_weight`, `child_alive` (bool) | Derive `gravida`, `para`, `abortus`, `living_children`; keep `data_origin` column (patient vs clinician) |
| Prenatal Visits | `prenatal_visits` | `visit_no`, `visit_date`, `gestational_age`, `weight`, `blood_pressure`, `fetal_heart_rate`, `notes`, `record_origin` | Patients can append; clinicians continue updating same table after review |
| Lab Checklist | `prenatal_labs` | `lab_test`, `recommended_at`, `performed_at`, `result`, `follow_up`, `record_origin` | Seed mandatory tests for display; allow dynamic additions |
| Consent & Audit | `intake_consents` | `submission_id`, `patient_id`, `consent_type`, `signed_at`, `signature_value`, `signature_type`, `ip_address`, `user_agent`, `encrypted_payload_path` | `signature_value` stored encrypted-at-rest; keep SHA-256 hash for tamper checks |

## 2. Relationships & Review States

- **Submission Lifecycle**: `patient_intake_submissions` table with columns `status` (`patient_reported`, `in_review`, `verified`, `rejected`), `submitted_at`, `verified_by`, `verified_at`, `notes`.
- **Section-Level Sign-off**: store JSON `verification.sections` keyed by entity (`profile`, `obstetric_history`, `labs`). Clinician UI should allow signing each section separately.
- **Linking to EMR**: `patient_id` resolved via phone/NIK lookup. If unresolved, create `patients.pending` entry flagged for admin merge.

## 3. Front-End Wizard Capabilities (implemented)

- Responsive multi-step wizard mirroring paper forms (Identity → Current Pregnancy → Medical History → Obstetric History → Prenatal Visits → Labs & Consent).
- Autosave to `localStorage`, progress indicator, and conditional spouse fields (auto-hidden when `marital_status = cerai`).
- Auto-calculations:
  - Age from DOB, BMI from height/weight with category tagging.
  - EDD auto-derived from LMP with manual override detection.
  - Gravida/Para/Abortus/Living totals derived from prior pregnancy table when clinician totals left blank.
  - Risk flag aggregation (age extremes, prior complications, comorbidities) surfaced in a sticky alert.
- Dynamic row controls for Prenatal Visits and Labs so patients can add entries; staff continue updating the same rows post-review.
- Dual consent: initial privacy acknowledgement + final confirmation with digital signature capture. Submission banner echoes the server-issued `submissionId` for check-in.

## 4. Backend Review & Security Flow

- `POST /api/patient-intake` accepts JSON payload, enforces required fields (consent, final acknowledgement, signature), and stores submissions as `patient_reported`.
- Records persisted under `backend/logs/patient-intake/` as AES-256-GCM encrypted envelopes when `INTAKE_ENCRYPTION_KEY` is set. File header keeps only `submissionId`, `receivedAt`, `status`, `highRisk`, and hashes for integrity.
- Stored payload includes:
  - `payload` (full form data), `review` block with history, `summary` risk snapshot, `audit` (signature metadata, request fingerprint, SHA-256 of payload).
- Response returns `{ submissionId, status: 'patient_reported' }` for patient-facing receipt.
- Clinician UI should fetch + decrypt submissions (server-side) and present review console with section-level approve/edit actions. On approval, data is transformed and inserted into EMR tables listed in section 1, updating `status` to `verified` and recording verifier info.

## 5. Integration Considerations

1. **API Extensions**
   - `GET /api/patient-intake` (internal) → list pending submissions (requires server-side decryption).
   - `PUT /api/patient-intake/:id/verify` → clinician sign-off, storing reviewer and merging data into EMR tables.
   - `PUT /api/patient-intake/:id/reject` → mark as rejected with reason, notify patient.
2. **Patient Matching Logic**
   - Primary: exact phone match to active patient.
   - Secondary: NIK + DOB fallback.
   - If ambiguous, create pending chart with merge queue entry.
3. **Data Transformation**
   - Map `prenatalVisits` to `prenatal_visits` table; mark `record_origin = 'patient'` until edited by staff.
   - Convert `labResults` into `prenatal_labs`, defaulting missing `lab_test` names to template values.
   - Persist risk flags to `pregnancy_risk_flags` with severity computed via mapping.

## 6. Consent, Privacy & Compliance

- Encryption key stored in environment (`INTAKE_ENCRYPTION_KEY`), rotate via `INTAKE_ENCRYPTION_KEY_ID`.
- File payload hashed (SHA-256) to detect tampering.
- Consent statements captured twice (pre-form + final confirmation) and bundled with IP, user agent, and device timestamp.
- Signature stored as typed name (`digital_name`); extendable to upload or stylus capture by adding `signature.type` variants.

## 7. Pilot & Analytics Roadmap

1. **Pilot**: launch with selected antenatal patients, provide QR link to `patient-intake.html`, monitor completion via encrypted logs.
2. **Metrics**: instrument wizard to emit step-completion events to analytics service (drop-off per step, average duration, device mix).
3. **Feedback Loop**: collect clinician feedback on review console; adjust required fields or hints accordingly.
4. **Full Rollout**: after stable review integration, send SMS reminders with secure link; integrate with appointment booking workflow.
5. **Continuous Improvement**: add AI-assisted transcription import, auto-flag anomalies (e.g., high BP) before clinician review, and extend to postpartum follow-up forms.

---
For implementation details see: `public/patient-intake.html`, `public/scripts/patient-intake.js`, and `backend/routes/patient-intake.js`.

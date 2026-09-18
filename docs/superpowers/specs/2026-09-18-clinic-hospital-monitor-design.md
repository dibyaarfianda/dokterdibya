# Private clinic hospital monitoring and discharge archives

Approved in conversation 2026-09-18. This is the implementation contract for DOKTERDIBYA and COMM.

## User behavior

- Monitor every canonical patient with a historical `sunday_clinic_records.visit_location = klinik_private`, including patients cared for by another doctor.
- Monitor IGD and RI at gambiran, melinda, bhayangkara every 15 minutes, 24 hours WIB. Active-census limitations (brief stays/outages can be missed) are accepted.
- Patient notifications remain disabled until ALL SIX source capabilities have been verified in production; successful HTTP or an empty parsed list is not verification.
- Telegram private messages contain name, hospital, ward, event, time, and Buka di COMM. No diagnosis, DOB, NIK, document, or identifiers in URLs. No messages to other recipients.
- Details, connection settings, coverage, unresolved matches, and archive history live in COMM specialist mode. An ICON ONLY with accessible label/title `Pasien Klinik Privat` marks confirmed matches. No visible text badge.
- Merge monitor rows with existing specialist rows by facility+caseId. Other-doctor rows are read-only monitor rows, excluded from clinical workload counts and actions. Never join a hospital case to gain access.
- Deep link `?clinicAlert=<opaque event id>` survives login, resolves only after owner-authenticated specialist initialization, opens details rather than a CPPT form, then is consumed. Historical event details survive removal from active census.

## Ownership and identity

- DOKTERDIBYA owns canonical clinic membership, matches, episodes/events, persistent Telegram outbox, and durable archive catalog. COMM owns hospital access and specialist UI.
- Existing `patient_external_ids` may identify a patient by COMM+facility+hospital MR. Otherwise exact normalized full name AND exact full birth date must yield exactly one canonical clinic patient. Name-only or conflicting identifiers => pending review, never a positive icon/alert.
- No automatic DRD creation, visit finalization, patient-portal publishing, or changes to hospital clinical state. An archive may link an existing DRD only with evidence of the SAME episode, never just latest patient DRD.
- New COMM owner endpoints require a server-signed specialist session issued after successful premium authentication and the exact configured `CLINIC_MONITOR_OWNER_ID`; browser auth flags/usernames are not authorization. Preserve existing non-owner login behavior. Never leak the overlay through shared active-patient caches.

## Cross-service HTTP contract

DOKTERDIBYA routes under `/api/integration/comm`, protected by existing apiKeyAuth. JSON uses snake_case. Error responses are sanitized and do not log clinical payloads or credentials.

- POST `/hospital-observations`: `{facility,unit:'IGD'|'RI',observed_at,complete:boolean,status:'ok'|'error'|'unsupported',error_code?,patients:[{case_id,hospital_mr_id?,hospital_patient_id?,patient_name,birth_date?,ward?,dpjp?,admission_at?,discharge_at?,discharge_confirmed?:boolean}]}`. Validate limits/facility/time; absence from census is NOT discharge. Idempotent episode key facility+case_id; event key episode+event_type (IGD/RI/discharged/archive_ready). Errors/partial snapshots never imply absence or discharge.
- GET `/clinic-monitor`: `{success:true,data:{patients:[],events:[],pending_matches:[],sources:[],telegram:{configured,connected,bot_username?},activation:{ready,enabled,blockers:[]}}}`. Patient row: `{id,patient_id,patient_name,facility,case_id,hospital_mr_id,birth_date?,ward,dpjp,unit,admission_at,discharge_at,first_seen_at,last_seen_at,active,is_private_clinic_patient:true,archive_status,latest_event_id}`. Sources carry facility,unit,status,last_success_at,verified, message. No full unrelated hospital registry is persisted or returned.
- GET `/clinic-monitor/events/:id`: `{success:true,data:{event,patient,archives:[]}}`; GET `/clinic-monitor/patients/:id/archives`: `{success:true,data:[]}`.
- POST `/clinic-monitor/matches/:id`: `{patient_id}` explicit owner-confirmed association with audit; reject non-cohort patient and conflicting stored identity.
- POST `/clinic-monitor/telegram/pair`: `{success:true,data:{url,expires_at}}`; POST `/clinic-monitor/telegram/disconnect`; webhook handled only by DOKTERDIBYA with configured Telegram secret header. Pairing token single-use, expiring and private-chat-only.
- GET `/clinic-monitor/archive-jobs`: `{success:true,data:[{episode_id,patient_id,facility,case_id,hospital_mr_id,hospital_patient_id,discharge_at}]}` only explicitly confirmed discharged, uniquely matched cases; durable retry schedule in DOKTERDIBYA.
- POST `/clinic-monitor/archive-jobs/:episodeId/result`: `{status:'ready'|'partial'|'error',snapshot:object,sections:{resume:'present'|'pending'|'not_applicable'|'error',penunjang:...,operasi:...},files:[{source_id,category,filename,mime_type,sha256,byte_size,content_base64}],warnings:[]}`. Request bounds and per-file checksum verification required; no remote arbitrary-URL fetch. Communicate if streaming/multipart is required by file sizes before changing contract.
- GET `/clinic-monitor/archive-files/:id/download`: `{success:true,data:{download_url,filename}}`, fresh short-lived signed URL; no public storage URL.
- Large originals use POST `/clinic-monitor/archive-jobs/:episodeId/files` as authenticated `application/octet-stream` (one file, maximum 100 MB), query metadata source_id/category/filename/mime_type, and X-Content-SHA256. Return `{success:true,data:{upload_id,...descriptor}}`. Final result `files` may reference upload_id instead of inline bytes; every reference must belong to this exact episode and its hash must have been checked. Inline requests remain bounded below the global JSON limit. Over-limit or failed source files remain explicitly partial; never truncate or downsample.

COMM exposes `/api/premium/clinic-monitor` and corresponding `/events/:id`, `/patients/:id/archives`, `/matches/:id`, `/telegram/pair`, `/telegram/disconnect`, `/archive-files/:id/download` through a verified-owner backend proxy. Login adds optional `specialistSession:{token,expiresAt}`. Frontend stores via `setSpecialistSession`, clears on logout; legacy authenticated clients lacking session need explicit re-login for this feature only.

### Integrated safety refinements

- A collector may include `identity_conflict:true` on a patient row even when the overall source reports an incomplete/error census. This only retracts an existing positive match or creates a pending review; it can never establish a positive match. Persisted conflicts remain pending until explicit valid owner confirmation. Before reporting discharge, reread source identity and compare available MR/DOB against the tracked episode; never reuse stale identifiers to erase a conflict.
- Archive job claims include `job_token` with a 15-minute lease. Binary upload requires `X-Clinic-Monitor-Job-Token`; result JSON requires `job_token`. Reclaimed/expired claims cannot publish. Exact completed result retries are idempotent. Claim at most two jobs at once.
- Owner manual retry uses POST `/clinic-monitor/archive-jobs/:episodeId/retry` through the same protected COMM proxy.
- Source saved-form snapshots are distinguished from downloaded original reports. Order status alone is not a result. Missing originals or unavailable clinical content remain explicitly partial.
- Frontend request results are scoped to the current authorized session and selected detail request; stale responses cannot restore cleared private data or place another patient's documents under the current patient.

## Permanent Arsip Rawat RS

- One hospital episode archive linked to patient_id and facility+case_id, optional exact existing DRD. Originals preserved byte-for-byte, deduplicated by SHA256 within the patient/facility scope. Source updates create versions, never overwrite evidence.
- Private R2 prefix `hospital-archives/` in DOKTERDIBYA's established private medical bucket, outside COMM `penunjang-files/` 30-day cleanup. Structured JSON snapshot gzip compressed, manifest includes source identity, retrieved time, checksum, MIME and bytes. No JPG-per-page, giant ZIP, duplicate combined PDF, or AI-generated replacement resume.
- Collect ONLY discharge resume, supporting test results/linked result documents, and operation reports for this episode. Preserve unavailable/failed/not-applicable distinctions. No clinical image lossy downsampling.
- Discharge requires explicit source discharge date/status. Missing from active census merely stale/inactive. Poll previously tracked episodes for explicit discharge using verified read-only methods. Recheck partial archives after 24h, 72h and 7d; retain partial status and manual retry after final automatic attempt.
- Archive and outbox jobs must survive restart. Retry failures without duplicate events/documents. Baseline activation yields one initial summary, not fabricated admissions.

## Delivery and acceptance

Use existing architecture and libraries; no unrelated edits. Focused behavior tests first, demonstrate expected baseline failure, implement, run tests and builds. Validate identity conflicts, concurrent/repeated ingestion, unit transitions, stale/failed censuses, restart/outbox retries, private pairing/auth, archive checksums/versioning/completeness, zero clinical writes, icon-only rendering and deep links. Verify live sources read-only and sample counts/identifiers without exposing PHI. Commit/push/deploy both projects through established flow; verify deployed assets, auth and affected behavior. If access or bot configuration is absent, report the exact blocker and keep activation closed; do not claim end-to-end completion.

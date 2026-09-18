# Clinic hospital monitoring implementation plan

Spec: ../specs/2026-09-18-clinic-hospital-monitor-design.md

## Task 1: DOKTERDIBYA persistence, matching, archives, Telegram

Implement the specification's DOKTERDIBYA service contract with additive MySQL migration, focused service modules, durable transactions/jobs, safe R2 archives and owner Telegram pairing. Own staff/backend and database additions; preserve unrelated changes. Test behavioral failure before implementation, tests with synthetic data and injectable external services. Mount service routes under existing COMM api-key protection and verify webhook separately. Default notification activation closed. Do not commit/push/deploy; controller handles shared integration after review. Report exact tests, known gaps and changed files.

## Task 2: COMM secure backend bridge and hospital collection

Implement optional specialistSession, verified owner routes/proxy, 15-minute independent source collection, explicit discharge checks, and episode-only archive job consumer using verified existing read-only APIs. Own COMM server/*; avoid touching frontend. No invented endpoints or fabricated source verification; unsupported sources report blockers. Read credentials only via existing configuration, never output secrets/PHI. Test auth forgery, missing owner, source failures, normalization, explicit discharge requirement, archive scope and failure statuses. Do not commit/push/deploy. Coordinate contract changes before altering interfaces.

## Task 3: COMM specialist frontend

Implement contract in COMM src/* only. Store new session from premium login, overlay owner-only monitor results without polluting shared cache, ICON ONLY marker with title/aria-label, read-only external-DPJP rows, correct clinical counters, details and archive history, source/connection status and pairing, pending identity confirmation, deep-link resume after login. Reuse current components/tokens. Tests for pure merge/deep-link logic and visual UI verification. Do not commit/push/deploy. Do not modify backend.

## Task 4: Integrated review and deployment

Controller checks all contracts, tests both systems, independently reviews security/clinical-state safety, fixes findings through original implementers, and runs UI smoke tests with synthetic data. Verify source availability and configured owner/bot readiness on VPS without clinical mutation. Apply additive migration after backup, commit scoped changes without coauthor, push and deploy both applications. Keep six-source notification gate closed unless all acceptance conditions satisfied. Provide deployed evidence and exact remaining external blockers.

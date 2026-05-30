# COMM DocBoard Operation Sync Design

## Goal

Build an automatic operation sync where COMM collects operation data and executes SIMRS work, while DocBoard remains the official schedule and source of truth for all operations.

COMM must not require the doctor to manually send individual operations. COMM should run a daily cron at 00:00 Asia/Jakarta, collect the available operation data, and publish a minimal normalized batch to DocBoard.

DocBoard must not document fields that COMM does not send. Empty or unknown clinical fields should stay absent, not become placeholder UI.

## Current System Context

COMM is a separate application in `C:\COMM`. It already has:
- SIMRS routes in `C:\COMM\server\routes\simrs.js`.
- Surgery report fetch and submit endpoints:
  - `GET /api/simrs/surgery/:caseId`
  - `POST /api/simrs/surgery`
  - `POST /api/simrs/surgery/delete`
- CPPT/SBAR execution routes.
- A DokterDibya integration client in `C:\COMM\server\lib\dokterdibya-client.js`.
- A sync job pattern in `C:\COMM\server\jobs\dokterdibya-sync.js`.

DokterDibya already has:
- COMM integration entrypoint in `staff/backend/routes/comm-integration.js`.
- DocBoard routing in `staff/backend/routes/docboard.js`.
- Surgery APIs in `staff/backend/routes/surgery.js`.
- Surgery source of truth service in `staff/backend/services/SurgeryService.js`.
- Existing operation table `surgery_schedules`.
- Audit, checklist, outcome, notification, and command center support.

## Roles

COMM is the data collector and executor:
- Collects operation data from SIMRS and COMM caches.
- Normalizes the operation data into a small sync item.
- Publishes a daily batch to DokterDibya.
- Later, executes DocBoard-generated tasks against SIMRS and returns receipts.

DocBoard is the scheduler and source of truth:
- Owns the official operation schedule.
- Owns operation status.
- Owns review, conflict handling, and audit.
- Shows only fields that are present and useful for operation review.

## Daily Sync Flow

1. COMM cron starts every day at 00:00 Asia/Jakarta.
2. COMM gathers operation data per enabled facility.
3. COMM normalizes each record into an operation sync item.
4. COMM calls `POST /api/integration/comm/operation-sync`.
5. DokterDibya validates API key and payload.
6. DocBoard upserts operation rows into `surgery_schedules`.
7. DocBoard writes external reference mapping and sync run summary.
8. DocBoard marks ambiguous records as `needs_review` without creating duplicates.

## Operation Sync Payload

```json
{
  "sync_date": "2026-05-31",
  "source": "COMM",
  "facility": "rsud_gambiran",
  "generated_at": "2026-05-31T00:00:00+07:00",
  "items": [
    {
      "source_key": "rsud_gambiran:case123:operasi456",
      "case_id": "case123",
      "simrs_operasi_id": "operasi456",
      "mr_id": "123456",
      "patient_name": "Nama Pasien",
      "diagnosis": "Diagnosis bila tersedia",
      "operation_name": "Sectio Caesarea",
      "operation_date": "2026-05-31",
      "operation_time": "08:00",
      "location": "rsud_gambiran",
      "raw_status": "scheduled",
      "notes": "Catatan ringkas bila tersedia"
    }
  ]
}
```

Required item fields:
- `source_key`
- `patient_name`
- `operation_date`
- `location`

Optional item fields:
- `case_id`
- `simrs_operasi_id`
- `mr_id`
- `diagnosis`
- `operation_name`
- `operation_time`
- `raw_status`
- `notes`

If COMM does not send a field, DocBoard does not display that field and does not invent a placeholder.

## DocBoard Review Display

The operation review page should show:
- Patient name.
- MR if present.
- SIMRS case ID if present.
- Facility/location.
- Operation date.
- Operation time if present.
- Operation name/type if present.
- Diagnosis if present.
- Notes if present.
- DocBoard status.
- Source: COMM.
- Last sync time.
- Match status.
- External references: source key, case ID, SIMRS operation ID.
- Audit summary.

The operation review page should not show:
- Raw COMM payload by default.
- Empty ASA/NPO/anesthesia/lab/USG fields.
- Full CPPT.
- Full resume medis.
- Full SIMRS surgery report.
- Technical executor details unless they are part of a later execution receipt.

## Status Model

DocBoard should keep the existing status model but add sync-aware review states in a controlled way.

Recommended statuses:
- `planned`
- `confirmed`
- `completed`
- `cancelled`
- `postponed`
- `needs_review`
- `sync_conflict`

`needs_review` means DocBoard received a COMM record but cannot safely decide whether it is a new operation or an update to an existing one.

`sync_conflict` means an existing operation matched, but COMM sent a material change that should not be silently applied, such as a different patient name for the same source key.

## Upsert Rules

DocBoard should match records in this order:

1. Existing `surgery_external_refs.source_key`.
2. Existing `facility + simrs_operasi_id`.
3. Existing `facility + case_id + operation_date`.
4. Existing `mr_id + operation_date + operation_name`.

If exactly one match is found, update only fields sent by COMM.

If no match is found, create a new `surgery_schedules` row with status `planned`.

If multiple matches are found, do not update any schedule row. Store a conflict entry in the sync run details and mark the candidate as `needs_review`.

DocBoard should never overwrite a manually edited date/time/status unless the incoming COMM record is tied to a strong source key and the field is configured as COMM-owned.

## Minimal Database Additions

### `surgery_external_refs`

Maps a DocBoard operation to COMM/SIMRS identifiers.

Columns:
- `id`
- `surgery_id`
- `source_system`
- `facility`
- `source_key`
- `case_id`
- `simrs_operasi_id`
- `mr_id`
- `last_synced_at`
- `created_at`
- `updated_at`

Unique indexes:
- `source_system + source_key`
- `source_system + facility + simrs_operasi_id`

### `comm_operation_sync_runs`

Stores each COMM cron run summary.

Columns:
- `id`
- `sync_date`
- `facility`
- `source`
- `generated_at`
- `received_at`
- `items_received`
- `created_count`
- `updated_count`
- `skipped_count`
- `conflict_count`
- `error_count`
- `summary_json`

## Backend Components

### DokterDibya

Create `staff/backend/services/CommOperationSyncService.js`.

Responsibilities:
- Validate sync batch structure.
- Normalize location and date/time values.
- Resolve operation type from `operation_name` when possible.
- Upsert into `surgery_schedules`.
- Write/update `surgery_external_refs`.
- Write `comm_operation_sync_runs`.
- Write surgery audit entries for create/update/conflict.

Extend `staff/backend/routes/comm-integration.js`.

New endpoint:
- `POST /operation-sync`

Security:
- Reuse existing `apiKeyAuth`.
- Patients cannot access this route.
- Payload size should be capped.

### COMM

Extend `C:\COMM\server\lib\dokterdibya-client.js`.

New method:
- `syncOperations(payload)`

Create `C:\COMM\server\jobs\operation-sync.js`.

Responsibilities:
- Run daily at `0 0 * * *` with timezone `Asia/Jakarta`.
- Iterate enabled facilities.
- Collect available operation records.
- Normalize records to the payload contract.
- Send to DokterDibya.
- Retry transient errors.
- Log per-facility result.

Wire the job in `C:\COMM\server\index.js`.

## DocBoard UI

Update `docboard/src/views/SurgeryList.jsx`:
- Show badge `COMM` when a surgery has an external COMM ref.
- Show `needs_review` and `sync_conflict` filters.
- Show last synced indicator when available.

Update `docboard/src/views/SurgeryDetail.jsx`:
- Add compact `Source` section.
- Add `COMM / SIMRS reference` rows only when values exist.
- Add sync history summary.
- Hide absent fields instead of showing empty labels.

Update `docboard/src/services/api.js`:
- Add methods to load source context if implemented separately.

## Error Handling

COMM cron:
- Retries transient network and 5xx errors.
- Stops retrying on 401/403 and logs auth failure.
- Does not block other facilities if one facility fails.

DocBoard:
- Rejects invalid payloads with 400.
- Logs sync run even when some items fail.
- Does not create duplicate operations on ambiguous matches.
- Uses idempotent `source_key` to prevent duplicate daily imports.

## Rollout

Phase 1: Backend Foundation
- Add database migration.
- Add `CommOperationSyncService`.
- Add `POST /api/integration/comm/operation-sync`.
- Unit test validation, matching, create, update, conflict.

Phase 2: COMM Cron Publisher
- Add client method.
- Add `operation-sync.js` cron.
- Start with one facility.
- Log only if collector cannot reliably read operation lists yet.

Phase 3: DocBoard Review UI
- Add COMM badge.
- Add source/ref display.
- Add review filters.
- Hide fields absent from COMM.

Phase 4: Execution Receipts
- Add task/receipt loop only after schedule sync is stable.
- COMM executes SIMRS tasks.
- DocBoard records execution results.

## Success Criteria

- User does not manually send individual operations.
- COMM publishes once daily at 00:00 WIB.
- DocBoard receives and upserts operation schedules.
- Re-running the same sync does not duplicate operations.
- DocBoard review pages show only useful sent fields.
- Conflicts are visible and do not silently corrupt schedules.
- Existing surgery scheduling still works for manually created DocBoard operations.

# COMM Contract: Gambiran Longitudinal Resume

DokterDibya calls this authenticated internal endpoint:

```http
GET /api/internal/gambiran/patients/{rmDigits}/archive
X-API-Key: <COMM_INTERNAL_API_KEY>
Accept: application/json
```

`rmDigits` is the Medify search form without leading zero groups. For example,
`00-00-12-34-56` is sent as `123456`. COMM must never search by patient name.

## Required discovery behavior

1. Query both `/rawatjalan/histori-transaksi` and `/rawatinap/histori-transaksi` over the complete available date range.
2. Open every discovered case's `Histori Rekam Medis` and recursively add unseen `case_id` values until the set no longer changes.
3. Deduplicate exclusively by `case_id`; do not discard a case merely because one history page did not return it.
4. Fetch all clinical sections and attachments for every case. A failed section is represented in `warnings` and section metadata; it is not silently omitted.
5. Return timestamps as ISO-8601 with an explicit offset. Source timestamps may additionally be retained in each event payload.

## Response

```json
{
  "success": true,
  "snapshot": {
    "schema_version": 1,
    "generated_at": "2026-08-04T12:00:00+07:00",
    "patient": {
      "medical_record_number": "00-00-12-34-56",
      "name": "PATIENT NAME"
    },
    "encounters": [
      {
        "case_id": "med0000000001",
        "type": "Rawat Jalan",
        "admission_at": "2026-01-01T08:00:00+07:00",
        "discharge_at": null,
        "timeline": []
      }
    ],
    "timeline": [
      {
        "id": "source-stable-id",
        "case_id": "med0000000001",
        "category": "cppt",
        "title": "CPPT Dokter",
        "occurred_at": "2026-01-01T09:00:00+07:00",
        "author": "Clinician",
        "author_role": "dokter",
        "data": {}
      }
    ],
    "files": [
      {
        "id": "source-stable-file-id",
        "case_id": "med0000000001",
        "category": "radiologi",
        "filename": "hasil.pdf",
        "mime_type": "application/pdf",
        "occurred_at": "2026-01-01T10:00:00+07:00",
        "download_path": "/api/internal/gambiran/patients/123456/files/source-stable-file-id?caseId=med0000000001"
      }
    ],
    "final_status": {},
    "warnings": []
  }
}
```

The timeline must cover identity changes, admissions/discharges, assessments,
diagnoses, all CPPT/SBAR, consultations, vital observations/EWS/pain/weight,
intake-output, laboratory, pathology, radiology, other investigations,
prescriptions, dispensing/administration, procedures, operation reports,
pre/intra/post-anesthesia records, nursing, nutrition, discharge summaries,
follow-up, referrals, readmissions, and other available clinical records.

## File endpoint

Every `download_path` must start with `/api/internal/`, require the same API
key, and return the original bytes with accurate `Content-Type`,
`Content-Length`, and `Content-Disposition`. Credential, cookie, CSRF, session,
or authorization fields must never appear in the JSON payload.

-- Performance Indexes Migration (UP)
-- Date: 2026-03-07
-- Purpose: Add missing indexes and fix collation mismatches to eliminate
--          table scans and filesorts in patient list/search queries.

-- ============================================================
-- 1. patients: Add index on (last_visit DESC, created_at DESC)
--    Reason: Main patient list sorts by last_visit DESC, created_at DESC.
--    Currently does filesort on all 267 rows. This covering sort index
--    eliminates the filesort entirely.
-- ============================================================
ALTER TABLE patients ADD INDEX idx_patients_last_visit (last_visit DESC, created_at DESC);

-- ============================================================
-- 2. sunday_clinic_records: Add composite index (patient_id, last_activity_at DESC)
--    Reason: 3 correlated subqueries per patient do:
--      WHERE scr.patient_id = p.id ORDER BY scr.last_activity_at DESC LIMIT 1
--    Current idx_sunday_clinic_patient only covers patient_id, so each
--    subquery requires a filesort. This composite index serves the
--    lookup + sort in a single seek.
-- ============================================================
ALTER TABLE sunday_clinic_records ADD INDEX idx_scr_patient_activity (patient_id, last_activity_at DESC);

-- ============================================================
-- 3. medical_records: Fix patient_id collation mismatch
--    Reason: medical_records.patient_id uses utf8mb4_general_ci but
--    patients.id uses utf8mb4_unicode_ci. The anamnesa_datetime
--    subquery has COLLATE casts that prevent index usage, causing
--    it to scan the idx_created_at index (examines all rows).
--    Aligning collation allows direct index ref lookup.
-- ============================================================
ALTER TABLE medical_records MODIFY COLUMN patient_id VARCHAR(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL;

-- ============================================================
-- 4. medical_records: Fix mr_id collation mismatch
--    Reason: medical_records.mr_id uses utf8mb4_general_ci but
--    sunday_clinic_records.mr_id and patient_documents.mr_id use
--    utf8mb4_unicode_ci. The obstetri JOIN query has COLLATE casts
--    that prevent idx_mr_record_type from being used for the JOIN,
--    causing it to scan 360 rows via idx_record_type instead.
--    Aligning collation allows the existing composite index to work.
-- ============================================================
ALTER TABLE medical_records MODIFY COLUMN mr_id VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ============================================================
-- 5. patient_documents: Add composite index (mr_id, document_type, status)
--    Reason: Enrichment queries filter by all three columns:
--      WHERE mr_id = ? AND document_type = 'resume_medis' AND status = 'published'
--      WHERE mr_id = ? AND document_type IN (...) AND status = 'published'
--    Currently uses idx_patient_documents_mr then rowid-filters on type/status.
--    This composite serves all three predicates in one index seek.
-- ============================================================
ALTER TABLE patient_documents ADD INDEX idx_pd_mr_type_status (mr_id, document_type, status);

-- ============================================================
-- 6. sunday_appointments: Add composite index (patient_id, status, appointment_date)
--    Reason: Subquery does:
--      WHERE sa.patient_id = p.id AND sa.status IN ('completed','confirmed')
--      then MAX(appointment_date)
--    Current idx_patient only covers patient_id. This composite
--    allows the optimizer to seek by patient+status and read
--    appointment_date from the index without touching data pages.
-- ============================================================
ALTER TABLE sunday_appointments ADD INDEX idx_sa_patient_status_date (patient_id, status, appointment_date);

-- ============================================================
-- 7. medical_records: Add composite index (patient_id, record_type, created_at DESC)
--    Reason: The anamnesa_datetime subquery does:
--      WHERE mr.patient_id = p.id AND mr.record_type = 'anamnesa'
--      ORDER BY mr.created_at DESC LIMIT 1
--    After collation fix (#3), this composite serves the full
--    predicate + sort in a single index range scan.
-- ============================================================
ALTER TABLE medical_records ADD INDEX idx_mr_patient_type_created (patient_id, record_type, created_at DESC);
